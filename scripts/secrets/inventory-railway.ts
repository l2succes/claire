import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const onePasswordAccount = 'J6NIRZ4PIJHXRF4SKPUJWROWAU';
const requestedEnvironment = process.argv
  .find((argument) => argument.startsWith('--environment='))
  ?.split('=', 2)[1]
  ?.toLowerCase();
const requestedService = process.argv
  .find((argument) => argument.startsWith('--service='))
  ?.split('=', 2)[1];
const unsupportedArguments = process.argv
  .slice(2)
  .filter(
    (argument) => !argument.startsWith('--environment=') && !argument.startsWith('--service=')
  );
if (unsupportedArguments.length > 0) {
  throw new Error(
    `Unsupported argument(s): ${unsupportedArguments.join(', ')}. Use --environment=staging|production and/or --service=<Railway service name>.`
  );
}
const environments = [
  {
    label: 'Staging',
    vault: 'Claire — Staging',
    projectId: '03f719da-7c4a-4bdb-9e17-0137924c024b',
  },
  {
    label: 'Production',
    vault: 'Claire — Production',
    projectId: '34d5012c-b592-49ac-9d99-6f1353c0b338',
  },
] as const;

type Item = { fields?: Array<{ label?: string; value?: string }> };
type ItemIndex = { id: string; title: string };
type ServiceNode = { node: { serviceName: string } };

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

function variablesFrom(payload: Record<string, unknown>) {
  return Object.entries(payload).filter(
    ([key, value]) => !key.startsWith('RAILWAY_') && typeof value === 'string' && value.length > 0
  ) as Array<[string, string]>;
}

function verifyStored(item: Item, labels: string[]) {
  const fields = new Map(
    item.fields
      ?.filter((field): field is { label: string; value: string } =>
        Boolean(field.label && field.value)
      )
      .map((field) => [field.label, field.value]) ?? []
  );
  const missing = labels.filter((label) => !fields.has(label));
  if (missing.length > 0) {
    throw new Error(`1Password did not retain ${missing.length} required Railway variable(s).`);
  }
}

async function storeService(
  environment: (typeof environments)[number],
  serviceName: string,
  variables: Array<[string, string]>
) {
  const title = `Railway / ${environment.label} / ${serviceName}`;
  const items = JSON.parse(
    await run(['op', 'item', 'list', '--vault', environment.vault, '--format', 'json'])
  ) as ItemIndex[];
  const existing = items.filter((item) => item.title === title);
  const section = { id: `Section_${onePasswordId()}`, label: 'Variables' };
  const directory = await mkdtemp(join(tmpdir(), 'claire-railway-inventory-'));
  const templatePath = join(directory, 'item.json');
  let output: string;
  try {
    await writeFile(
      templatePath,
      JSON.stringify({
        title: `${title} (pending)`,
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
          ...variables.map(([label, value]) => ({
            id: onePasswordId(),
            section,
            label,
            type: 'CONCEALED',
            value,
          })),
        ],
        tags: ['claire', 'railway', environment.label.toLowerCase()],
        notesPlain:
          'Read-only inventory copied from Railway. Railway-injected RAILWAY_* variables are intentionally omitted. Replace this item only through scripts/secrets/inventory-railway.ts, then rotate source credentials deliberately.',
      }),
      { mode: 0o600 }
    );
    await chmod(templatePath, 0o600);
    output = await run(
      ['op', 'item', 'create', '--template', templatePath, '--vault', environment.vault],
      undefined,
      true
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  const id = output.match(/^ID:\s*(\S+)$/m)?.[1];
  if (!id) throw new Error(`1Password did not return an ID for ${title}.`);
  const stored = JSON.parse(
    await run(['op', 'item', 'get', id, '--vault', environment.vault, '--format', 'json'])
  ) as Item;
  try {
    verifyStored(
      stored,
      variables.map(([label]) => label)
    );
  } catch (error) {
    await run(['op', 'item', 'delete', id, '--vault', environment.vault], undefined, true);
    throw error;
  }

  for (const item of existing) {
    await run(['op', 'item', 'delete', item.id, '--vault', environment.vault], undefined, true);
  }
  await run(['op', 'item', 'edit', id, '--vault', environment.vault, '--title', title]);
  console.log(`Stored ${title} (${variables.length} variables).`);
}

async function inventoryEnvironment(environment: (typeof environments)[number]) {
  const status = JSON.parse(
    await run([
      'railway',
      'status',
      '--project',
      environment.projectId,
      '--environment',
      'production',
      '--json',
    ])
  ) as { environments: { edges: Array<{ node: { serviceInstances: { edges: ServiceNode[] } } }> } };
  const services = status.environments.edges[0]?.node.serviceInstances.edges.map(
    (edge) => edge.node.serviceName
  );
  if (!services?.length) throw new Error(`No services found in Claire ${environment.label}.`);

  const selectedServices = [...services]
    .sort()
    .filter((serviceName) => !requestedService || serviceName === requestedService);
  if (requestedService && selectedServices.length === 0) {
    throw new Error(`Service ${requestedService} was not found in Claire ${environment.label}.`);
  }
  for (const serviceName of selectedServices) {
    const values = JSON.parse(
      await run([
        'railway',
        'variable',
        'list',
        '--project',
        environment.projectId,
        '--environment',
        'production',
        '--service',
        serviceName,
        '--json',
      ])
    ) as Record<string, unknown>;
    const variables = variablesFrom(values);
    if (variables.length === 0) {
      console.log(
        `Skipped Railway / ${environment.label} / ${serviceName} (no configured variables).`
      );
      continue;
    }
    await storeService(environment, serviceName, variables);
  }
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
  const selectedEnvironments = environments.filter(
    (environment) =>
      !requestedEnvironment || environment.label.toLowerCase() === requestedEnvironment
  );
  if (requestedEnvironment && selectedEnvironments.length === 0) {
    throw new Error('Unknown environment. Use --environment=staging or --environment=production.');
  }
  for (const environment of selectedEnvironments) await inventoryEnvironment(environment);
}

await main();
