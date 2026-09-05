import { $ } from 'bun';

const requiredVaults = ['Claire — Production', 'Claire — Staging'];

async function main() {
  try {
    await $`op whoami`.quiet();
  } catch {
    throw new Error('1Password CLI is not signed in. Run this from a terminal after: eval "$(op signin)"');
  }

  const vaults = JSON.parse((await $`op vault list --format json`.quiet()).text()) as Array<{
    name: string;
  }>;
  const existing = new Set(vaults.map((vault) => vault.name));

  for (const vault of requiredVaults) {
    if (existing.has(vault)) {
      console.log(`Vault already exists: ${vault}`);
      continue;
    }

    await $`op vault create ${vault}`.quiet();
    console.log(`Created vault: ${vault}`);
  }

  console.log('Claire 1Password vault bootstrap complete. Run: bun run secrets:check');
}

await main();
