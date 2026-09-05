import { $ } from 'bun';

const requiredVaults = ['Claire — Production', 'Claire — Staging'];

async function main() {
  try {
    await $`op whoami`.quiet();
  } catch {
    throw new Error('1Password CLI is not signed in. Run: eval "$(op signin)"');
  }

  const vaults = JSON.parse((await $`op vault list --format json`.quiet()).text()) as Array<{
    name: string;
  }>;
  const available = new Set(vaults.map((vault) => vault.name));
  const missing = requiredVaults.filter((vault) => !available.has(vault));

  if (missing.length) {
    throw new Error(`Missing 1Password vaults: ${missing.join(', ')}`);
  }

  console.log('1Password access is ready. Required Claire vaults are available.');
}

await main();
