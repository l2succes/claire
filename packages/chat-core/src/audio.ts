const MIN_WAVEFORM_VALUE = 0;
const MAX_WAVEFORM_VALUE = 255;

export function sanitizeWaveform(value: unknown, maxSamples = 128): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, Math.max(0, maxSamples))
    .filter((sample): sample is number => typeof sample === 'number' && Number.isFinite(sample))
    .map((sample) => Math.round(Math.min(MAX_WAVEFORM_VALUE, Math.max(MIN_WAVEFORM_VALUE, sample))));
}

/** Collapse an arbitrary number of samples without hiding short peaks. */
export function downsampleWaveform(value: unknown, targetSamples = 48): number[] {
  const samples = sanitizeWaveform(value, 10_000);
  const target = Math.max(1, Math.floor(targetSamples));
  if (samples.length <= target) return samples;

  return Array.from({ length: target }, (_, index) => {
    const start = Math.floor((index * samples.length) / target);
    const end = Math.max(start + 1, Math.floor(((index + 1) * samples.length) / target));
    return Math.max(...samples.slice(start, end));
  });
}

/** Convert expo-audio's decibel metering value into Matrix/WhatsApp's 0-255 range. */
export function meteringToWaveformSample(metering?: number): number {
  if (typeof metering !== 'number' || !Number.isFinite(metering)) return 0;
  const normalized = (Math.min(0, Math.max(-60, metering)) + 60) / 60;
  return Math.round(Math.pow(normalized, 1.7) * MAX_WAVEFORM_VALUE);
}

export function formatAudioDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function seekSecondsForPosition(position: number, width: number, duration: number): number {
  if (width <= 0 || duration <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, position / width));
  return ratio * duration;
}

