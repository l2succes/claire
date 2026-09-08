import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('home screen retired resume card', () => {
  it('does not restore the removed Pick up where you left off feature', () => {
    const source = readFileSync(resolve(__dirname, '../features/home/home-screen.tsx'), 'utf8');
    expect(source).not.toContain('Pick up where you left off');
    expect(source).not.toContain('Restore your recent workspace context');
  });
});
