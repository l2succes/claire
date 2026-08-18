import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const vault = 'Claire — Staging';
const onePasswordAccount = 'J6NIRZ4PIJHXRF4SKPUJWROWAU';
const title = 'Supabase / Staging';

async function run(command: string[], options: { cwd?: string } = {}) {
  const process = Bun.spawn(command, { cwd: options.cwd, stdout: 'pipe', stderr: 'pipe' });
  const exitCode = await process.exited;
  const stdout = await new Response(process.stdout).text();
  if (exitCode !== 0) throw new Error(`Command failed: ${command.slice(0, 2).join(' ')}`);
  return stdout;
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

  const items = JSON.parse(
    await run(['op', 'item', 'list', '--vault', vault, '--format', 'json'])
  ) as Array<{
    id: string;
    title: string;
  }>;
  const matches = items.filter((item) => item.title === title);
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${title} item in ${vault}; found ${matches.length}. Run the Supabase staging rotation first.`
    );
  }
  const item = JSON.parse(await run(['op', 'item', 'get', matches[0].id, '--format', 'json'])) as {
    fields?: Array<{ label?: string; value?: string }>;
  };
  const anonKey = item.fields?.find((field) => field.label === 'ANON_KEY')?.value;
  if (!anonKey) throw new Error(`${title} is missing ANON_KEY.`);

  const directory = await mkdtemp(join(tmpdir(), 'claire-eas-staging-'));
  const envFile = join(directory, '.env');
  try {
    await writeFile(envFile, `EXPO_PUBLIC_SUPABASE_ANON_KEY=${anonKey}\n`, { mode: 0o600 });
    await chmod(envFile, 0o600);
    await run(['eas', 'env:push', 'preview', '--path', envFile, '--force'], { cwd: 'apps/client' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.log('Updated EAS preview with the isolated staging Supabase anon key.');
}

await main();
