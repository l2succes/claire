const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

/** Sign the tiny APNs helper separately after Electron Builder signs Claire.
 * Local unsigned builds remain supported; release CI sets CSC_NAME. */
exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const identity = process.env.CSC_NAME;
  if (!identity) return;
  const helper = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources', 'ClairePushHelper');
  if (!existsSync(helper)) throw new Error('ClairePushHelper is missing from the packaged app.');
  const entitlements = join(context.packager.projectDir, 'build', 'entitlements.push-helper.plist');
  const result = spawnSync('codesign', ['--force', '--sign', identity, '--options', 'runtime', '--entitlements', entitlements, helper], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Could not sign ClairePushHelper (status ${result.status}).`);
};
