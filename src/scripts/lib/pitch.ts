// Monophonic pitch detection (McLeod pitch method) for one voice or instrument.
// Pure functions, so they can be tested without a microphone.

export interface PitchReading {
  /** Detected fundamental in Hz. */
  hz: number;
  /** 0–1: how periodic the signal is. Voices held steady read above 0.9. */
  clarity: number;
}

export interface DetectOptions {
  minHz?: number;
  maxHz?: number;
  /** Quieter frames (RMS) count as silence. */
  minLevel?: number;
  /** Readings less periodic than this are ignored (breath, consonants, noise). */
  minClarity?: number;
}

/** The signal's root-mean-square level. */
export function level(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/**
 * Finds the fundamental of one frame of audio, or null for silence and unpitched sound.
 * Uses the normalised square difference function, which avoids the octave errors
 * plain autocorrelation makes on voices with strong overtones.
 */
export function detectPitch(samples: Float32Array, sampleRate: number,
  {minHz = 60, maxHz = 1400, minLevel = .008, minClarity = .8}: DetectOptions = {}): PitchReading | null {
  const n = samples.length;
  if (level(samples) < minLevel) return null;
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(Math.floor(n / 2), Math.ceil(sampleRate / minHz));
  if (maxLag <= minLag) return null;

  const nsdf = new Float32Array(maxLag + 2);
  for (let lag = 0; lag <= maxLag + 1; lag++) {
    let acf = 0, energy = 0;
    for (let i = 0, end = n - lag; i < end; i++) {
      const a = samples[i], b = samples[i + lag];
      acf += a * b;
      energy += a * a + b * b;
    }
    nsdf[lag] = energy > 0 ? 2 * acf / energy : 0;
  }

  // Key maxima: the highest point of each positive lobe after the first zero crossing.
  const peaks: number[] = [];
  let lag = 1;
  while (lag <= maxLag && nsdf[lag] > 0) lag++;
  while (lag <= maxLag) {
    while (lag <= maxLag && nsdf[lag] <= 0) lag++;
    let best = -1;
    while (lag <= maxLag && nsdf[lag] > 0) {
      if (lag >= minLag && (best < 0 || nsdf[lag] > nsdf[best])) best = lag;
      lag++;
    }
    if (best > 0) peaks.push(best);
  }
  if (!peaks.length) return null;

  // The first peak close to the highest one is the fundamental; later ones are its multiples.
  const highest = Math.max(...peaks.map(p => nsdf[p]));
  const chosen = peaks.find(p => nsdf[p] >= .9 * highest)!;
  const clarity = nsdf[chosen];
  if (clarity < minClarity) return null;

  // Parabolic interpolation between neighbouring lags for sub-sample accuracy.
  const left = nsdf[chosen - 1], centre = nsdf[chosen], right = nsdf[chosen + 1];
  const curve = left - 2 * centre + right;
  const shift = curve < 0 ? .5 * (left - right) / curve : 0;
  const hz = sampleRate / (chosen + shift);
  return hz >= minHz && hz <= maxHz ? {hz, clarity} : null;
}

/** Continuous MIDI pitch (69 = A4) for a frequency. */
export const midiOf = (hz: number, a4 = 440): number => 69 + 12 * Math.log2(hz / a4);

/** The nearest note and how far off it is, in cents (−50 to +50). */
export function nearestNote(midi: number): {note: number; cents: number} {
  const note = Math.round(midi);
  return {note, cents: (midi - note) * 100};
}

/** Median of a short list (used to smooth readings without lag on note changes). */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
