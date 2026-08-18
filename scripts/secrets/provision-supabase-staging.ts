import { randomBytes, randomUUID, webcrypto } from 'node:crypto';

const vault = 'Claire — Staging';
const itemTitle = 'Supabase / Staging';
const projectId = '03f719da-7c4a-4bdb-9e17-0137924c024b';
// Railway templates always deploy into the project default environment. This
// project is exclusively staging despite the default environment's name.
const environment = 'production';
const studioService = 'Supabase Studio';

type Credentials = Record<string, string>;

function base64Url(bytes: Uint8Array) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fixedWidthP256Part(value: string | undefined) {
  if (!value) throw new Error('P-256 key export is missing a required component.');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length > 32) throw new Error('P-256 key export has an invalid component length.');
  return base64Url(bytes.length === 32 ? bytes : Buffer.concat([Buffer.alloc(32 - bytes.length), bytes]));
}

async function signHs256(payload: Record<string, unknown>, secret: string) {
  const header = base64Url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64Url(Buffer.from(JSON.stringify(payload)));
  const key = await webcrypto.subtle.importKey(
    'raw',
    Buffer.from(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await webcrypto.subtle.sign('HMAC', key, Buffer.from(`${header}.${body}`));
  return `${header}.${body}.${base64Url(new Uint8Array(signature))}`;
}

async function signEs256(payload: Record<string, unknown>, key: CryptoKey, kid: string) {
  const header = base64Url(Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid })));
  const body = base64Url(Buffer.from(JSON.stringify(payload)));
  const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    Buffer.from(`${header}.${body}`),
  );
  return `${header}.${body}.${base64Url(new Uint8Array(signature))}`;
}

async function generateCredentials(): Promise<Credentials> {
  const now = Math.floor(Date.now() / 1000);
  const expires = now + 3650 * 24 * 60 * 60;
  const jwtSecret = randomBytes(30).toString('base64');
  const anonPayload = { role: 'anon', iss: 'supabase', iat: now, exp: expires };
  const servicePayload = { role: 'service_role', iss: 'supabase', iat: now, exp: expires };
  const pair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const privateJwk = (await webcrypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  const kid = randomUUID();
  const hs256Jwk = { kty: 'oct', k: base64Url(Buffer.from(jwtSecret)), alg: 'HS256' };
  const jwtKeys = [
    {
      kty: 'EC', kid, use: 'sig', key_ops: ['sign', 'verify'], alg: 'ES256', ext: true,
      crv: privateJwk.crv,
      x: fixedWidthP256Part(privateJwk.x),
      y: fixedWidthP256Part(privateJwk.y),
      d: fixedWidthP256Part(privateJwk.d),
    },
    hs256Jwk,
  ];
  const jwtJwks = {
    keys: [{ ...jwtKeys[0], key_ops: ['verify'], d: undefined }, hs256Jwk],
  };
  const opaque = (prefix: string) => `${prefix}${base64Url(randomBytes(17)).slice(0, 22)}`;

  return {
    JWT_SECRET: jwtSecret,
    ANON_KEY: await signHs256(anonPayload, jwtSecret),
    SERVICE_ROLE_KEY: await signHs256(servicePayload, jwtSecret),
    SUPABASE_PUBLISHABLE_KEY: opaque('sb_publishable_'),
    SUPABASE_SECRET_KEY: opaque('sb_secret_'),
    ANON_KEY_ASYMMETRIC: await signEs256(anonPayload, pair.privateKey, kid),
    SERVICE_ROLE_KEY_ASYMMETRIC: await signEs256(servicePayload, pair.privateKey, kid),
    JWT_KEYS: JSON.stringify(jwtKeys),
    JWT_JWKS: JSON.stringify(jwtJwks),
  };
}

async function run(command: string[], stdin?: string, showDiagnostic = false) {
  const process = Bun.spawn(command, { stdin: stdin === undefined ? 'ignore' : 'pipe', stdout: 'pipe', stderr: 'pipe' });
  if (stdin !== undefined) {
    process.stdin.write(stdin);
    process.stdin.end();
  }
  const exitCode = await process.exited;
  const stdout = await new Response(process.stdout).text();
  if (exitCode !== 0) {
    const diagnostic = showDiagnostic ? `\n${(await new Response(process.stderr).text()).trim()}` : '';
    throw new Error(`Command failed: ${command.slice(0, 2).join(' ')}${diagnostic}`);
  }
  return stdout;
}

async function main() {
  try {
    await run(['op', 'whoami']);
  } catch {
    throw new Error(
      '1Password CLI is not signed in for this terminal. Run: eval "$(op signin --account my)" and then rerun this command in the same terminal.',
    );
  }
  const rotate = process.argv.includes('--rotate');
  const items = JSON.parse(await run(['op', 'item', 'list', '--vault', vault, '--format', 'json'])) as Array<{
    id: string;
    title: string;
  }>;
  const matchingItems = items.filter((item) => item.title === itemTitle);
  if (matchingItems.length > 0) {
    if (!rotate) throw new Error(`${itemTitle} already exists. Refusing to replace staging credentials.`);
    for (const item of matchingItems) {
      await run(['op', 'item', 'delete', item.id, '--vault', vault], undefined, true);
    }
    console.log(`Moved ${matchingItems.length} previous staging credential item(s) to the 1Password trash before rotation.`);
  }

  const credentials = await generateCredentials();
  const item = {
    title: itemTitle,
    category: 'LOGIN',
    urls: [{ label: 'website', primary: true, href: 'https://supabase.staging.useclaire.co' }],
    fields: [
      { id: 'username', type: 'STRING', purpose: 'USERNAME', label: 'username', value: 'not-applicable' },
      ...Object.entries(credentials).map(([label, value]) => ({ label, type: 'CONCEALED', value })),
    ],
    tags: ['claire', 'staging', 'supabase'],
    notesPlain: 'Generated locally by scripts/secrets/provision-supabase-staging.ts. Source of record for the isolated Railway project claire-staging.',
  };

  await run(['op', 'item', 'create', '--category', 'login', '--title', itemTitle, '--vault', vault, '-'], JSON.stringify(item), true);
  console.log('Stored the staging Supabase credentials in 1Password.');
  console.log('Syncing 9 staging credentials to Railway...');
  await Promise.all(
    Object.entries(credentials).map(([key, value]) =>
      run(['railway', 'variable', 'set', key, '--stdin', '--skip-deploys', '--service', studioService, '--environment', environment, '--project', projectId], value),
    ),
  );
  console.log('Requesting dependent service redeploys...');
  await Promise.all(
    ['Supabase Studio', 'Envoy', 'Gotrue Auth', 'Postgrest', 'Supabase Realtime', 'Supabase Storage', 'Supavisor'].map((service) =>
      run(['railway', 'redeploy', '--yes', '--service', service, '--environment', environment, '--project', projectId], undefined, true),
    ),
  );
  console.log('Configured Railway from 1Password-backed staging credentials and redeployed dependent services.');
}

await main();
