import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const onePasswordAccount = 'J6NIRZ4PIJHXRF4SKPUJWROWAU';

const targets = [
  {
    environment: 'Staging',
    vault: 'Claire — Staging',
    title: 'Supabase Studio / Staging',
    url: 'https://supabase.staging.useclaire.co',
    projectId: '03f719da-7c4a-4bdb-9e17-0137924c024b',
    railwayService: 'Envoy',
  },
  {
    environment: 'Production',
    vault: 'Claire — Production',
    title: 'Supabase Studio / Production',
    url: 'https://supabase.useclaire.co',
    projectId: '34d5012c-b592-49ac-9d99-6f1353c0b338',
    railwayService: 'Kong',
  },
] as const;

type Item = { fields?: Array<{ label?: string; value?: string }> };
type ItemIndex = { id: string; title: string };
type RailwayVariables = Record<string, string | undefined>;

async function run(command: string[], stdin?: string, showDiagnostic = false) {
  const process = Bun.spawn(command, {
    stdin: stdin === undefined ? 'ignore' : 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (stdin !== undefined) {
    process.stdin.write(stdin);
    process.stdin.end();
  }
  const exitCode = await process.exited;
  const stdout = await new Response(process.stdout).text();
  if (exitCode !== 0) {
    const diagnostic = showDiagnostic
      ? `\n${(await new Response(process.stderr).text()).trim()}`
      : '';
    throw new Error(`Command failed: ${command.slice(0, 2).join(' ')}${diagnostic}`);
  }
  return stdout;
}

function requireField(item: Item, label: string) {
  const value = item.fields?.find((field) => field.label === label)?.value;
  if (!value) throw new Error(`1Password did not retain the required ${label} field.`);
}

async function storeTarget(target: (typeof targets)[number]) {
  const variables = JSON.parse(
    await run([
      'railway',
      'variable',
      'list',
      '--project',
      target.projectId,
      '--environment',
      'production',
      '--service',
      target.railwayService,
      '--json',
    ])
  ) as RailwayVariables;
  const username = variables.DASHBOARD_USERNAME;
  const password = variables.DASHBOARD_PASSWORD;
  if (!username || !password) {
    throw new Error(
      `${target.environment} gateway is missing DASHBOARD_USERNAME or DASHBOARD_PASSWORD.`
    );
  }

  const items = JSON.parse(
    await run(['op', 'item', 'list', '--vault', target.vault, '--format', 'json'])
  ) as ItemIndex[];
  const existing = items.filter((item) => item.title === target.title);
  const pendingTitle = `${target.title} (pending)`;
  const directory = await mkdtemp(join(tmpdir(), 'claire-studio-access-'));
  const templatePath = join(directory, 'item.json');
  let output: string;
  try {
    await writeFile(
      templatePath,
      JSON.stringify({
        title: pendingTitle,
        category: 'LOGIN',
        urls: [{ label: 'website', primary: true, href: target.url }],
        fields: [
          {
            id: 'username',
            type: 'STRING',
            purpose: 'USERNAME',
            label: 'username',
            value: username,
          },
          {
            id: 'password',
            type: 'CONCEALED',
            purpose: 'PASSWORD',
            label: 'password',
            value: password,
          },
        ],
        tags: ['claire', 'supabase', 'studio', target.environment.toLowerCase()],
        notesPlain:
          'HTTP Basic Auth for the self-hosted Supabase Studio route. Copied from the existing Railway gateway; this script never rotates or prints the credential.',
      }),
      { mode: 0o600 }
    );
    await chmod(templatePath, 0o600);
    output = await run(
      ['op', 'item', 'create', '--template', templatePath, '--vault', target.vault],
      undefined,
      true
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  const itemId = output.match(/^ID:\s*(\S+)$/m)?.[1];
  if (!itemId) throw new Error(`1Password did not return an ID for ${target.title}.`);
  const stored = JSON.parse(
    await run(['op', 'item', 'get', itemId, '--vault', target.vault, '--format', 'json'])
  ) as Item;
  try {
    requireField(stored, 'username');
    requireField(stored, 'password');
  } catch (error) {
    await run(['op', 'item', 'delete', itemId, '--vault', target.vault], undefined, true);
    throw error;
  }

  for (const item of existing) {
    await run(['op', 'item', 'delete', item.id, '--vault', target.vault], undefined, true);
  }
  await run(['op', 'item', 'edit', itemId, '--vault', target.vault, '--title', target.title]);
  console.log(`Stored ${target.title} in 1Password.`);
}

async function main() {
  try {
    await run(['op', 'signin', '--account', onePasswordAccount]);
    await run(['op', 'whoami']);
  } catch {
    throw new Error(
      '1Password CLI could not authenticate with the 1Password desktop app. Unlock 1Password, approve its CLI prompt if shown, then rerun this command.'
    );
  }
  for (const target of targets) await storeTarget(target);
}

await main();
