import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const project = '03f719da-7c4a-4bdb-9e17-0137924c024b';
const environment = 'production'; // Default environment name inside the isolated claire-staging project.
if (!process.argv.includes('--apply')) {
  console.info('Dry run: prepare ig-mobile-synapse, ig-mobile-bridge and ig-mobile-api only in claire-staging.');
  console.info('Store new secrets in Claire — Staging / Instagram Mobile / Staging; isolate Redis database 12.');
  console.info('Create /data volumes for Synapse and Instagram. No deployment or login enablement.');
  console.info('Authenticate op and railway, then pass --apply to provision. See docs/design/instagram-mobile-handoff.md.');
  process.exit(0);
}
const directory = await mkdtemp(join(tmpdir(), 'claire-instagram-staging-'));
const railway = 'railway';
const op = 'op';
const vault = 'Claire — Staging';
const title = 'Instagram Mobile / Staging';
async function run(args: string[], stdin?: string) {
  const child = Bun.spawn(args, { cwd: directory, stdin: stdin === undefined ? 'ignore' : 'pipe', stdout: 'pipe', stderr: 'pipe' });
  if (stdin !== undefined) { child.stdin.write(stdin); child.stdin.end(); }
  const [output, , code] = await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
  if (code) throw new Error(`Command failed: ${args.slice(0,3).join(' ')} (details withheld to protect secrets)`);
  return output;
}
const secret = () => randomBytes(32).toString('hex');
const fieldId = () => Array.from(randomBytes(26), b => 'abcdefghijklmnopqrstuvwxyz234567'[b & 31]).join('');
const current = JSON.parse(await run([railway,'status','--project',project,'--environment',environment,'--json']));
if (current.name !== 'claire-staging') throw new Error('Refusing non-staging project');
const index = JSON.parse(await run([op,'item','list','--vault',vault,'--format','json']));
let item = index.find((i: any) => i.title === title);
let variables: Record<string,string>;
if (item) {
  item = JSON.parse(await run([op,'item','get',item.id,'--vault',vault,'--format','json']));
  variables = Object.fromEntries(item.fields.filter((f: any) => f.label !== 'username' && f.value).map((f: any) => [f.label,f.value]));
} else {
  const source = JSON.parse(await run([railway,'variable','list','--project',project,'--environment',environment,'--service','claire-api','--json']));
  if (source.RAILWAY_PROJECT_ID !== project || !source.SUPABASE_URL.includes('staging')) throw new Error('Invalid staging source');
  variables = Object.fromEntries(['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_KEY','DATABASE_URL','DIRECT_DATABASE_URL','CORS_ORIGINS'].map(k => [k,source[k]]));
  const redis = new URL(source.REDIS_URL); redis.pathname = '/12'; variables.REDIS_URL = redis.toString();
  for (const key of ['IG_AS_TOKEN','IG_HS_TOKEN','IG_PROVISIONING_SECRET','SYNAPSE_REGISTRATION_SECRET','SYNAPSE_MACAROON_SECRET','SYNAPSE_FORM_SECRET','MATRIX_BOT_PASSWORD','JWT_SECRET','ENCRYPTION_KEY','HEALTHCHECK_TOKEN']) variables[key]=secret();
  variables.MATRIX_SERVER_NAME = 'instagram-mobile-staging.claire.local';
  variables.MATRIX_HOMESERVER_URL = 'http://ig-mobile-synapse.railway.internal:8008';
  variables.INSTAGRAM_BRIDGE_URL = 'http://ig-mobile-bridge.railway.internal:29319';
  const section = { id: 'Section_' + fieldId(), label: 'Credentials' };
  const template = { title, category: 'LOGIN', sections: [section], fields: [
    {id:'username',type:'STRING',purpose:'USERNAME',label:'username',value:'not-applicable'},
    ...Object.entries(variables).map(([label,value]) => ({id:fieldId(),section,type:'CONCEALED',label,value}))],
    tags:['claire','staging','instagram-mobile'], notesPlain:'Isolated Instagram mobile experiment. Never use these credentials in production. Redis database 12 separates test sessions from the fixture API.' };
  const path = directory + '/secrets-template.json'; await writeFile(path,JSON.stringify(template),{mode:0o600}); await chmod(path,0o600);
  try {
    item = JSON.parse(await run([op,'item','create','--template',path,'--vault',vault,'--format','json']));
  } finally { await rm(path, { force: true }); }
  const saved = JSON.parse(await run([op,'item','get',item.id,'--vault',vault,'--format','json']));
  for (const [key,value] of Object.entries(variables)) if (!saved.fields.some((f:any)=>f.label===key&&f.value===value)) throw new Error('Stored field verification failed: '+key);
}
console.log('Verified dedicated staging secrets in 1Password.');
await run([railway,'link','--project',project,'--environment',environment,'--json']);
const names = current.services.edges.map((e:any)=>e.node.name);
for(const name of ['ig-mobile-synapse','ig-mobile-bridge','ig-mobile-api']) {
  if(!names.includes(name)) await run([railway,'add','--service',name,'--json']);
  console.log('Prepared service:',name);
}
const groups: Record<string,Record<string,string>> = {
  'ig-mobile-synapse': Object.fromEntries(['MATRIX_SERVER_NAME','MATRIX_BOT_PASSWORD','SYNAPSE_REGISTRATION_SECRET','SYNAPSE_MACAROON_SECRET','SYNAPSE_FORM_SECRET','IG_AS_TOKEN','IG_HS_TOKEN'].map(k=>[k,variables[k]])),
  'ig-mobile-bridge': Object.fromEntries(['MATRIX_SERVER_NAME','MATRIX_HOMESERVER_URL','IG_AS_TOKEN','IG_HS_TOKEN','IG_PROVISIONING_SECRET'].map(k=>[k,variables[k]])),
  'ig-mobile-api': {
    ...Object.fromEntries(['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_KEY','DATABASE_URL','DIRECT_DATABASE_URL','CORS_ORIGINS','REDIS_URL','JWT_SECRET','ENCRYPTION_KEY','HEALTHCHECK_TOKEN','MATRIX_SERVER_NAME','MATRIX_HOMESERVER_URL','INSTAGRAM_BRIDGE_URL'].map(k=>[k,variables[k]])),
    MATRIX_BOT_USER_ID:'@claire_bot:'+variables.MATRIX_SERVER_NAME,INSTAGRAM_BRIDGE_USER_ID:'@claire_bot:'+variables.MATRIX_SERVER_NAME,
    INSTAGRAM_BRIDGE_SECRET:variables.IG_PROVISIONING_SECRET, NODE_ENV:'production',PORT:'3001',PLATFORM_MODE:'matrix',MOCK_BRIDGE:'false',
    TELEGRAM_ENABLED:'false',INSTAGRAM_ENABLED:'true',IMESSAGE_ENABLED:'false',DEMO_MODE_ENABLED:'false',
    INSTAGRAM_MOBILE_LOGIN_ENABLED:'false',INSTAGRAM_MOBILE_LOGIN_FLOW:'android',
  },
};
for (const [service,vars] of Object.entries(groups)) {
  for (const [key,value] of Object.entries(vars)) await run([railway,'variable','set',key,'--stdin','--skip-deploys','--service',service,'--environment',environment,'--project',project],value);
  console.log('Configured service:',service);
}
for(const service of ['ig-mobile-synapse','ig-mobile-bridge']) {
  const volumes=JSON.parse(await run([railway,'volume','--project',project,'--environment',environment,'--service',service,'list','--json']));
  if (JSON.stringify(volumes).includes('"/data"')) { console.log('Volume already exists:',service); continue; }
  await run([railway,'volume','--project',project,'--environment',environment,'--service',service,'add','--mount-path','/data','--json']);
  console.log('Created isolated volume:',service);
}
await rm(directory, { recursive: true, force: true });
console.log('Staging resources prepared. Deployment remains a separate step.');
