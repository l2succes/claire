import {
  downsampleWaveform,
  formatAudioDuration,
  meteringToWaveformSample,
  sanitizeWaveform,
  seekSecondsForPosition,
} from '../src/audio';

describe('audio helpers', () => {
  it('sanitizes and bounds bridge waveform values', () => {
    expect(sanitizeWaveform([-10, 1.2, 400, Number.NaN, '3'], 3)).toEqual([0, 1, 255]);
  });

  it('downsamples with peak preservation', () => {
    expect(downsampleWaveform([1, 9, 2, 3, 8, 4], 3)).toEqual([9, 3, 8]);
  });

  it('maps metering decibels into a bounded waveform range', () => {
    expect(meteringToWaveformSample(-60)).toBe(0);
    expect(meteringToWaveformSample(0)).toBe(255);
    expect(meteringToWaveformSample(undefined)).toBe(0);
  });

  it('formats duration and clamps seeking', () => {
    expect(formatAudioDuration(72.4)).toBe('1:12');
    expect(seekSecondsForPosition(25, 100, 20)).toBe(5);
    expect(seekSecondsForPosition(120, 100, 20)).toBe(20);
  });
});

