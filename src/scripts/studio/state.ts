import type { MixChannel, Song } from '../lib/types';

/** Shared session state. Modules read and update it; there are no other globals. */
export const studio = {
  /** The selected song, if any. */
  song: null as Song | null,
  /** Bundled and imported songs, in playlist order. */
  songs: [] as Song[],
  /** Mixer settings for the selected song's tracks. */
  mix: [] as MixChannel[],
  /** Playback position and start cue, in seconds. */
  pos: 0,
  cue: 0,
  /** Playback speed multiplier. */
  rate: 1,
  playing: false,
  looping: false,
};

/** Index of the bar containing beat `q` (binary search over bar starts). */
export function barAt(song: Song, q: number): number {
  let low = 0, high = song.bars.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (song.bars[mid].q <= q) low = mid; else high = mid;
  }
  return low;
}
