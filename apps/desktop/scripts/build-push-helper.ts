import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// The helper is intentionally a separate, tiny native process rather than a
// second UI runtime. Release signing/notarization can sign this binary with
// the APNs entitlement alongside the Electron app.
if (process.platform === 'darwin') {
  const root = path.join(import.meta.dir, '..');
  const output = path.join(root, 'native', 'macos', 'build', 'ClairePushHelper');
  mkdirSync(path.dirname(output), { recursive: true });
  const result = spawnSync('/usr/bin/swiftc', ['-parse-as-library', path.join(root, 'native', 'macos', 'ClairePushHelper.swift'), '-o', output], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
