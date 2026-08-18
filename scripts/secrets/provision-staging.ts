const rotateSupabase = process.argv.includes('--rotate-supabase');
const unsupportedArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== '--rotate-supabase');

if (unsupportedArguments.length > 0) {
  throw new Error(
    `Unsupported argument(s): ${unsupportedArguments.join(', ')}. Use --rotate-supabase only when replacing staging Supabase credentials.`
  );
}

async function run(script: string, arguments_: string[] = []) {
  const process = Bun.spawn(['bun', 'run', script, ...arguments_], {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if ((await process.exited) !== 0) {
    throw new Error(`${script} failed. Stopped before running any later staging setup steps.`);
  }
}

console.log('1/3 Provisioning the isolated staging Supabase credentials...');
await run('secrets:provision:supabase-staging', rotateSupabase ? ['--rotate'] : []);
console.log('2/3 Provisioning the fixture-only staging API...');
await run('secrets:provision:api-staging');
console.log('3/3 Syncing the staging Supabase public key to EAS preview...');
await run('secrets:sync:eas-staging');
console.log('Staging provisioning completed successfully.');
