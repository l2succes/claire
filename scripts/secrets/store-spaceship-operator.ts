import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { OP_ACCOUNT_ID } from './op-account';

const vault = 'Personal';
const title = 'Spaceship / Operator';

function onePasswordId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  return Array.from(randomBytes(26), (byte) => alphabet[byte & 31]).join('');
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

async function main() {
  await run(['op', 'signin', '--account', OP_ACCOUNT_ID]);
  await run(['op', 'whoami']);
  const apiKey = (
    await run(['security', 'find-generic-password', '-s', 'spaceship-cli', '-a', 'api-key', '-w'])
  ).trim();
  if (!apiKey) throw new Error('The Spaceship CLI keychain item is empty.');

  const items = JSON.parse(
    await run(['op', 'item', 'list', '--vault', vault, '--format', 'json'])
  ) as Array<{ id: string; title: string }>;
  const existing = items.filter((item) => item.title === title);
  const section = { id: `Section_${onePasswordId()}`, label: 'Credentials' };
  const directory = await mkdtemp(join(tmpdir(), 'claire-spaceship-operator-'));
  const templatePath = join(directory, 'item.json');
  let output: string;
  try {
    await writeFile(
      templatePath,
      JSON.stringify({
        title: `${title} (pending)`,
        category: 'LOGIN',
        urls: [{ label: 'website', primary: true, href: 'https://www.spaceship.com' }],
        sections: [section],
        fields: [
          {
            id: 'username',
            type: 'STRING',
            purpose: 'USERNAME',
            label: 'username',
            value: 'not-applicable',
          },
          {
            id: onePasswordId(),
            section,
            label: 'API_KEY',
            type: 'CONCEALED',
            value: apiKey,
          },
        ],
        tags: ['claire', 'operator', 'spaceship', 'dns'],
        notesPlain:
          'Operator-only DNS API credential. Copied from the local macOS Keychain spaceship-cli item; never share with staging or production application users.',
      }),
      { mode: 0o600 }
    );
    await chmod(templatePath, 0o600);
    output = await run(
      ['op', 'item', 'create', '--template', templatePath, '--vault', vault],
      undefined,
      true
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const itemId = output.match(/^ID:\s*(\S+)$/m)?.[1];
  if (!itemId) throw new Error('1Password did not return an item ID.');
  const stored = JSON.parse(
    await run(['op', 'item', 'get', itemId, '--vault', vault, '--format', 'json'])
  ) as { fields?: Array<{ label?: string; value?: string }> };
  if (!stored.fields?.some((field) => field.label === 'API_KEY' && field.value)) {
    await run(['op', 'item', 'delete', itemId, '--vault', vault]);
    throw new Error('1Password did not retain the Spaceship API key.');
  }
  for (const item of existing) await run(['op', 'item', 'delete', item.id, '--vault', vault]);
  await run(['op', 'item', 'edit', itemId, '--vault', vault, '--title', title]);
  console.log('Stored the Spaceship operator credential in 1Password.');
}

await main();
