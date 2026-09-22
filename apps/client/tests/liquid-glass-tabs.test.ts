import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Liquid Glass tab icons', () => {
  const tabsSource = readFileSync(resolve(__dirname, '../components/claire/liquid-glass-tabs.tsx'), 'utf8');

  it('uses separate cache-busted Claire artwork for each selection state', () => {
    expect(tabsSource).toContain("default: require('../../assets/claire-tab-icon-v2.png')");
    expect(tabsSource).toContain("selected: require('../../assets/claire-tab-icon-selected-v2.png')");

    const defaultArtwork = readFileSync(resolve(__dirname, '../assets/claire-tab-icon-v2.svg'), 'utf8');
    const selectedArtwork = readFileSync(resolve(__dirname, '../assets/claire-tab-icon-selected-v2.svg'), 'utf8');
    const closedBubblePath = 'M33 52c-10 0-17-6-17-14 0-7 5-12 12-12 6 0 10 4 10 9 0 6-4 10-10 10Z';
    expect(defaultArtwork).toContain(closedBubblePath);
    expect(defaultArtwork).toContain('fill="none"');
    expect(selectedArtwork).toContain(closedBubblePath);
    expect(selectedArtwork).toContain('fill="#10120F" stroke="#10120F"');
  });

  it('uses native profile symbols so its optical size matches the other tabs', () => {
    expect(tabsSource).toContain("sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}");
    expect(tabsSource).not.toContain('maskedProfileAvatarUrl');
  });
});
