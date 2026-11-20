import type { Song } from '../lib/types';

// Song sections (verse, chorus, bridge…) from the MIDI file's marker and cue-point
// events. Markers that are performance directions rather than sections are skipped.

export interface Section {
  /** Label as written in the MIDI file, e.g. "V1". */
  label: string;
  /** Readable name, e.g. "Verse 1". */
  name: string;
  /** Start and end, in beats. A section ends where the next one starts. */
  start: number;
  end: number;
  /** First and last bar (1-based) that the section touches, for the loop A/B fields. */
  firstBar: number;
  lastBar: number;
}

const DIRECTION = /^(rit|rall|accel|a\s*tempo|tempo|fine|d\.?\s*[cs]\b|fermata|cresc|dim|poco|molto|segno|coda\s*sign)/i;

const NAMES: Record<string, string> = {
  v: 'Verse', verse: 'Verse',
  c: 'Chorus', ch: 'Chorus', chorus: 'Chorus', refrain: 'Chorus',
  pc: 'Pre-chorus', prechorus: 'Pre-chorus', 'pre-chorus': 'Pre-chorus',
  b: 'Bridge', bd: 'Bridge', br: 'Bridge', bridge: 'Bridge',
  i: 'Intro', intro: 'Intro',
  o: 'Outro', outro: 'Outro', end: 'Ending', ending: 'Ending',
  int: 'Interlude', interlude: 'Interlude', inst: 'Instrumental', solo: 'Solo',
  tag: 'Tag', coda: 'Coda',
};

/** "V1" → "Verse 1", "PC2" → "Pre-chorus 2", "Bridge" → "Bridge"; unknown labels stay as written. */
export function sectionName(label: string): string {
  const match = /^([a-z][a-z-]*?)\s*(\d+)?$/i.exec(label.trim());
  const name = match && NAMES[match[1].toLowerCase()];
  return name ? name + (match[2] ? ' ' + match[2] : '') : label.trim();
}

/** Index of the bar containing beat `q`. */
function barIndex(song: Song, q: number): number {
  let index = 0;
  while (index + 1 < song.bars.length - 1 && song.bars[index + 1].q <= q) index++;
  return index;
}

export function songSections(song: Song): Section[] {
  const marks = [...song.markers]
    .filter(marker => marker.text.trim() && !DIRECTION.test(marker.text.trim()) && marker.q < song.end)
    .sort((a, b) => a.q - b.q)
    .filter((marker, i, all) => i === 0 || marker.q > all[i - 1].q); // one section per position
  return marks.map((marker, i) => {
    const end = marks[i + 1]?.q ?? song.end;
    return {
      label: marker.text.trim(),
      name: sectionName(marker.text),
      start: marker.q,
      end,
      firstBar: barIndex(song, marker.q) + 1,
      lastBar: Math.max(barIndex(song, marker.q), barIndex(song, end - 1e-6)) + 1,
    };
  });
}
