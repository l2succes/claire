import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const loops = readFileSync(resolve(__dirname, '../features/loops/loops-screen.tsx'), 'utf8');
const home = readFileSync(resolve(__dirname, '../features/home/home-screen.tsx'), 'utf8');

describe('Loops screen layout', () => {
  it('keeps follow-up health guidance on Home, not above the Loops list', () => {
    expect(loops).not.toContain('LoopHealthCard');
    expect(home).toContain('<FollowUpStatusCard />');
  });

  it('has no manual add control or create modal', () => {
    expect(loops).not.toContain('loops-add');
    expect(loops).not.toContain('createLoop');
    expect(loops).not.toContain('showCreate');
    expect(loops).not.toContain('<Modal');
  });
});
