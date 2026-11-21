export const sharpNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const flatNames = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export const solfaNames = ['Do', 'Di', 'Re', 'Ri', 'Mi', 'Fa', 'Fi', 'Sol', 'Si', 'La', 'Li', 'Ti'];
export const octaveOf = (pitch: number): number => Math.floor(pitch / 12) - 1;
export const frequencyOf = (pitch: number): number => 440 * 2 ** ((pitch - 69) / 12);
/** Track colours, shared by the mixer dots, piano highlights and fallback score. */
export const trackColours = ['#0a84ff', '#bf5af2', '#30d158', '#ff9f0a', '#ff375f', '#64d2ff'];

// ── Spelling notes for a key ──
// Every note name in the app goes through these helpers, so the black keys read as
// sharps in sharp keys (G, D, A…) and as flats in flat keys (F, B♭, E♭…). `sf` is the
// key signature as MIDI stores it: sharps when positive, flats when negative, 0 for
// C major / A minor. Keys without flats (including C major and "no key known") use sharps.

const pitchClass = (pitch: number): number => ((pitch % 12) + 12) % 12;

/** True for C♯/D♭, D♯/E♭, F♯/G♭, G♯/A♭ and A♯/B♭. */
export const isBlackKey = (pitch: number): boolean => [1, 3, 6, 8, 10].includes(pitchClass(pitch));

/** Whether a key signature spells black keys as flats. */
export const usesFlats = (sf: number): boolean => sf < 0;

/** The note's name in a key, without octave: "F♯" in D major, "G♭" in D♭ major. */
export const pitchName = (pitch: number, sf = 0): string =>
  (usesFlats(sf) ? flatNames : sharpNames)[pitchClass(pitch)];

/** The note's name and octave in a key, in scientific pitch notation: "B♭3". */
export const pitchNameWithOctave = (pitch: number, sf = 0): string => pitchName(pitch, sf) + octaveOf(pitch);

/** The name a screen reader should say: "B flat 3", "F sharp". */
export const spokenPitchName = (pitch: number, sf = 0, withOctave = true): string =>
  pitchName(pitch, sf).replace('♯', ' sharp').replace('♭', ' flat') + (withOctave ? ' ' + octaveOf(pitch) : '');

/** Letter (A–G) and accidental of the note in a key, for notation. */
export function spellPitch(pitch: number, sf = 0): {letter: string; accidental: '' | '♯' | '♭'; octave: number} {
  const name = pitchName(pitch, sf);
  return {letter: name[0], accidental: (name[1] ?? '') as '' | '♯' | '♭', octave: octaveOf(pitch)};
}
