import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Liquid Glass tab icons', () => {
  const tabsSource = readFileSync(resolve(__dirname, '../components/claire/liquid-glass-tabs.tsx'), 'utf8');

  it('uses separate cache-busted Claire artwork for each selection state', () => {
    expect(tabsSource).toContain("default: require('../../assets/claire-tab-icon-v2.png')");
    expect(tabsSource).toContain("selected: require('../../assets/claire-tab-icon-selected-v2.png')");

    const selectedArtwork = readFileSync(resolve(__dirname, '../assets/claire-tab-icon-selected-v2.svg'), 'utf8');
    expect(selectedArtwork).toContain('Selected state closes the inner loop');
    expect(selectedArtwork).toContain('fill="#10120F"');
  });

  it('uses native profile symbols so its optical size matches the other tabs', () => {
    expect(tabsSource).toContain("sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}");
    expect(tabsSource).not.toContain('maskedProfileAvatarUrl');
  });
});
