import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, '../app/settings/notifications.tsx'), 'utf8');

describe('notification settings layout', () => {
  it('owns the safe-area inset for its hidden navigation header', () => {
    expect(source).toMatch(/<MobileHeader\s+safeArea/);
    expect(source).toContain('contentInsetAdjustmentBehavior="never"');
  });

  it('uses the Claire mobile palette instead of the generic gray and green theme', () => {
    expect(source).toContain('backgroundColor: colors.cream');
    expect(source).toContain('backgroundColor: colors.paper');
    expect(source).toContain('backgroundColor: value ? colors.lime : colors.neutral[200]');
    expect(source).not.toMatch(/bg-gray-|text-gray-|#10b981/);
  });

  it('makes clear that these switches only control push alerts', () => {
    expect(source).toContain('<SettingsSection title="Push delivery">');
    expect(source).toContain('<SettingsSection title="Push alert types">');
    expect(source).toContain('<SettingsSection title="Quiet hours"');
    expect(source).toContain('Notifications still appear in Claire.');
  });

  it('saves changes automatically without a header save button', () => {
    expect(source).not.toContain('notifications-settings-save');
    expect(source).not.toContain('>Save</Text>');
    expect(source).toContain('Changes save automatically.');
    expect(source).toContain('enqueueSave(next)');
  });
});
