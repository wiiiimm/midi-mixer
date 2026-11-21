import type { KeySignature } from '../lib/types';

// The key signature at the playhead of the selected song. Note names across the app
// (tuning fork, piano, pitch detector, score labels) are spelt for this key, and
// update when playback crosses a key change. With no song selected, C major is used.

const NO_KEY: KeySignature = {q: 0, sf: 0, tonic: 0};
let current = NO_KEY;
const listeners = new Set<(key: KeySignature) => void>();

/** The key signature at the playhead (C major when no song is selected). */
export const currentKey = (): KeySignature => current;

/** Updates the current key, telling listeners only when it actually changes. */
export function setCurrentKey(key: KeySignature | null): void {
  const next = key ?? NO_KEY;
  const changed = next.sf !== current.sf || next.tonic !== current.tonic;
  current = next;
  if (changed) listeners.forEach(listener => listener(next));
}

/** Calls `listener` whenever the current key changes. */
export function onKeyChange(listener: (key: KeySignature) => void): void {
  listeners.add(listener);
}
