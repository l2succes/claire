import { $ } from 'bun';

type Manifest = {
  vault: string;
  item: string;
  project: string;
  environment: string;
  services: Record<string, string[]>;
};

const [manifestPath] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const apply = process.argv.includes('--apply');

if (!manifestPath) {
  throw new Error('Usage: bun run secrets:sync:railway -- <manifest.json> [--apply]');
}

const manifest = (await Bun.file(manifestPath).json()) as Manifest;
const item = JSON.parse(
  (await $`op item get ${manifest.item} --vault ${manifest.vault} --format json`.quiet()).text()
) as {
  fields: Array<{ label?: string; value?: string }>;
};
const fields = new Map(
  item.fields
    .filter((field): field is { label: string; value: string } =>
      Boolean(field.label && field.value !== undefined)
    )
    .map((field) => [field.label, field.value])
);

for (const [service, keys] of Object.entries(manifest.services)) {
  for (const key of keys) {
    if (!fields.has(key)) {
      throw new Error(`Missing concealed field ${key} in ${manifest.vault}/${manifest.item}`);
    }
  }

  console.log(`${apply ? 'Syncing' : 'Would sync'} ${service}: ${keys.join(', ')}`);
  if (!apply) continue;

  for (const key of keys) {
    const value = fields.get(key)!;
    const child = Bun.spawn(
      [
        'railway',
        'variable',
        'set',
        key,
        '--stdin',
        '--project',
        manifest.project,
        '--environment',
        manifest.environment,
        '--service',
        service,
        '--skip-deploys',
      ],
      { stdin: new Blob([value]), stdout: 'ignore', stderr: 'pipe' }
    );
    if ((await child.exited) !== 0) {
      throw new Error(
        `Railway rejected ${service}/${key}: ${await new Response(child.stderr).text()}`
      );
    }
  }
}

console.log(
  apply
    ? 'Railway secret sync complete; deploy services deliberately after review.'
    : 'Dry run complete. Re-run with --apply to write secrets.'
);
