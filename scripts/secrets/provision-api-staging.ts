import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const vault = 'Claire — Staging';
const onePasswordAccount = 'J6NIRZ4PIJHXRF4SKPUJWROWAU';
const sourceTitle = 'Supabase / Staging';
const targetTitle = 'Railway / Staging';
const projectId = '03f719da-7c4a-4bdb-9e17-0137924c024b';
const environment = 'production';
const service = 'claire-api';

type ItemIndex = { id: string; title: string };
type Item = { fields?: Array<{ label?: string; value?: string }> };
type ItemSection = { id: string; label: string };

function onePasswordId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  return Array.from(randomBytes(26), (byte) => alphabet[byte & 31]).join('');
}

function credentialsSection(): ItemSection {
  return { id: `Section_${onePasswordId()}`, label: 'Credentials' };
}

function credentialField(section: ItemSection, label: string, value: string) {
  return {
    id: onePasswordId(),
    section: { id: section.id, label: section.label },
    label,
    type: 'CONCEALED',
    value,
  };
}

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

function randomSecret() {
  return randomBytes(48).toString('base64url');
}

function field(item: Item, label: string) {
  const value = item.fields?.find((candidate) => candidate.label === label)?.value;
  if (!value) throw new Error(`The 1Password Supabase staging item is missing ${label}.`);
  return value;
}

function requireStoredFields(item: Item, expectedLabels: string[]) {
  const stored = new Set(
    item.fields?.filter((candidate) => candidate.value).map((candidate) => candidate.label) ?? []
  );
  const missing = expectedLabels.filter((label) => !stored.has(label));
  if (missing.length > 0) {
    throw new Error(
      `1Password did not retain required concealed fields: ${missing.join(', ')}. No Railway credentials were changed.`
    );
  }
}

async function listItems() {
  return JSON.parse(
    await run(['op', 'item', 'list', '--vault', vault, '--format', 'json'])
  ) as ItemIndex[];
}

async function createAndVerifyItem(item: Record<string, unknown>, expectedLabels: string[]) {
  const directory = await mkdtemp(join(tmpdir(), 'claire-1password-item-'));
  const templatePath = join(directory, 'item.json');
  let output: string;
  try {
    await writeFile(templatePath, JSON.stringify(item), { mode: 0o600 });
    await chmod(templatePath, 0o600);
    output = await run(
      ['op', 'item', 'create', '--template', templatePath, '--vault', vault],
      undefined,
      true
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const id = output.match(/^ID:\s*(\S+)$/m)?.[1];
  if (!id)
    throw new Error(
      '1Password did not return an ID for the new item. No Railway credentials were changed.'
    );
  const stored = JSON.parse(
    await run(['op', 'item', 'get', id, '--vault', vault, '--format', 'json'])
  ) as Item;
  try {
    requireStoredFields(stored, expectedLabels);
  } catch (error) {
    await run(['op', 'item', 'delete', id, '--vault', vault], undefined, true);
    throw error;
  }
  return id;
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

  const rotate = process.argv.includes('--rotate');
  const items = await listItems();
  const sourceItems = items.filter((item) => item.title === sourceTitle);
  if (sourceItems.length !== 1) {
    throw new Error(
      `Expected exactly one ${sourceTitle} item in ${vault}; found ${sourceItems.length}. Resolve duplicates before provisioning the API.`
    );
  }
  const existingTargets = items.filter((item) => item.title === targetTitle);
  if (existingTargets.length > 1 && !rotate) {
    throw new Error(
      `Expected exactly one ${targetTitle} item in ${vault}; found ${existingTargets.length}. Use --rotate to replace duplicates.`
    );
  }

  const source = JSON.parse(
    await run(['op', 'item', 'get', sourceItems[0].id, '--format', 'json'])
  ) as Item;
  const supabaseVariables = {
    SUPABASE_ANON_KEY: field(source, 'ANON_KEY'),
    SUPABASE_SERVICE_KEY: field(source, 'SERVICE_ROLE_KEY'),
  };
  let variables: Record<string, string>;
  if (existingTargets.length === 1 && !rotate) {
    const existing = JSON.parse(
      await run(['op', 'item', 'get', existingTargets[0].id, '--vault', vault, '--format', 'json'])
    ) as Item;
    variables = {
      ...supabaseVariables,
      JWT_SECRET: field(existing, 'JWT_SECRET'),
      ENCRYPTION_KEY: field(existing, 'ENCRYPTION_KEY'),
      HEALTHCHECK_TOKEN: field(existing, 'HEALTHCHECK_TOKEN'),
    };
    console.log('Verified and reusing the existing staging API credentials from 1Password.');
  } else {
    variables = {
      ...supabaseVariables,
      JWT_SECRET: randomSecret(),
      ENCRYPTION_KEY: randomSecret(),
      HEALTHCHECK_TOKEN: randomSecret(),
    };
  }
  const pendingTitle = `${targetTitle} (pending ${randomBytes(8).toString('hex')})`;
  const section = credentialsSection();
  const item = {
    title: pendingTitle,
    category: 'LOGIN',
    sections: [section],
    fields: [
      {
        id: 'username',
        type: 'STRING',
        purpose: 'USERNAME',
        label: 'username',
        value: 'not-applicable',
      },
      ...Object.entries(variables).map(([label, value]) => credentialField(section, label, value)),
    ],
    tags: ['claire', 'staging', 'railway'],
    notesPlain:
      'Fixture-mode Claire API only. Do not add production platform sessions, OAuth secrets, Matrix admin tokens, or production data.',
  };
  const pendingItemId = await createAndVerifyItem(item, Object.keys(variables));
  for (const existing of existingTargets) {
    await run(['op', 'item', 'delete', existing.id, '--vault', vault], undefined, true);
  }
  if (existingTargets.length > 0) {
    console.log(
      `Moved ${existingTargets.length} previous staging API credential item(s) to the 1Password trash after the replacement was verified.`
    );
  }
  await run(
    ['op', 'item', 'edit', pendingItemId, '--vault', vault, '--title', targetTitle],
    undefined,
    true
  );
  console.log('Stored isolated staging API credentials in 1Password.');
  console.log('Syncing fixture API configuration to Railway...');

  const staticVariables = {
    NODE_ENV: 'production',
    PORT: '3001',
    PLATFORM_MODE: 'direct',
    MOCK_BRIDGE: 'true',
    TELEGRAM_ENABLED: 'false',
    INSTAGRAM_ENABLED: 'false',
    IMESSAGE_ENABLED: 'false',
    CORS_ORIGINS: 'https://staging.useclaire.co',
    SUPABASE_URL: 'https://supabase.staging.useclaire.co',
    DATABASE_URL: '${{Postgres.POSTGRES_PRIVATE_URL}}',
    DIRECT_DATABASE_URL: '${{Postgres.POSTGRES_PRIVATE_URL}}',
    REDIS_URL: '${{Redis.REDIS_URL}}',
  };
  await Promise.all(
    Object.entries({ ...staticVariables, ...variables }).map(([key, value]) =>
      run(
        [
          'railway',
          'variable',
          'set',
          key,
          '--stdin',
          '--skip-deploys',
          '--service',
          service,
          '--environment',
          environment,
          '--project',
          projectId,
        ],
        value
      )
    )
  );
  console.log('Requesting the fixture API redeploy...');
  await run(
    [
      'railway',
      'redeploy',
      '--yes',
      '--service',
      service,
      '--environment',
      environment,
      '--project',
      projectId,
    ],
    undefined,
    true
  );
  console.log('Configured and redeployed the fixture-only staging Claire API.');
}

await main();
