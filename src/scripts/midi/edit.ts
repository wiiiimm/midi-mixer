import { spellPitch } from '../lib/notes';
import type { EditNote, Note, Song, SongEdits, Track } from '../lib/types';
import { rebuildSong } from './parse';

// The editing model. The original MIDI file is never changed: an edited song is the
// parsed original rebuilt from a list of edit notes, and resetting simply parses the
// file again. Edits are plain data so they can be saved, undone and redone.
//
// Ties and slurs are links between edit notes. A tie joins a note to a later note of
// the same pitch in the same part; the chain is played and engraved as one sustained
// note. A slur joins a note to a later note of a different pitch and is only drawn.

/** Starts editing a song: its own edits, or a fresh copy of its notes. */
export function editsFor(song: Song): SongEdits {
  if (song.edits) return cloneEdits(song.edits);
  // Parsed notes are already numbered; keep their numbers so a selection survives the first edit.
  let nextId = 1;
  for (const track of song.tracks) for (const note of track.notes) nextId = Math.max(nextId, (note.src?.[0] ?? 0) + 1);
  const tracks = song.tracks.map(track => track.notes.map((note): EditNote => {
    const copy: EditNote = {id: note.src?.[0] ?? nextId++, q: note.q, len: note.len, p: note.p, v: note.v};
    if (note.lyric) copy.lyric = note.lyric;
    if (note.lyricCues?.length) copy.lyricCues = note.lyricCues.map(cue => ({...cue}));
    return copy;
  }));
  return {tracks, nextId};
}

export const cloneEdits = (edits: SongEdits): SongEdits => structuredClone(edits);

const validNote = (note: unknown): note is EditNote => {
  if (!note || typeof note !== 'object') return false;
  const n = note as EditNote;
  return Number.isSafeInteger(n.id) && n.id > 0 && Number.isFinite(n.q) && n.q >= 0 && Number.isFinite(n.len) && n.len > 0 &&
    Number.isInteger(n.p) && n.p >= 0 && n.p <= 127 && Number.isFinite(n.v) &&
    (n.tie === undefined || Number.isSafeInteger(n.tie)) && (n.slur === undefined || Number.isSafeInteger(n.slur)) &&
    (n.lyric === undefined || typeof n.lyric === 'string') && (n.lyricCues === undefined || Array.isArray(n.lyricCues));
};

/** Whether saved edits are well formed and can be applied to a song with this many tracks. */
export function editsFit(edits: unknown, trackCount: number): edits is SongEdits {
  if (!edits || typeof edits !== 'object') return false;
  const {tracks, nextId} = edits as SongEdits;
  if (!Array.isArray(tracks) || tracks.length !== trackCount || !Number.isSafeInteger(nextId)) return false;
  const ids = new Set<number>();
  for (const notes of tracks) {
    if (!Array.isArray(notes)) return false;
    for (const note of notes) {
      if (!validNote(note) || ids.has(note.id) || note.id >= nextId) return false;
      ids.add(note.id);
    }
  }
  return true;
}

/** How far a note may run into the note it is tied to (MIDI files often overlap slightly). */
const TIE_OVERLAP = 1 / 16;

/** A tie joins a note to a later note of the same pitch that starts once it has ended. */
const tieValid = (from: EditNote, to: EditNote | undefined): to is EditNote =>
  !!to && to !== from && to.p === from.p && to.q > from.q + 1e-6 && from.q + from.len <= to.q + TIE_OVERLAP;

/**
 * Builds the song for a set of edits, on top of the original song. Its tracks hold the
 * notes as played, with each tie chain merged into one sustained note. The notes as
 * written, one per edit note, are kept for the engraving along with the ties and slurs.
 */
export function applyEdits(original: Song, edits: SongEdits): Song {
  const curves: {track: number; from: number; to: number; tie: boolean}[] = [];
  const written = new Map<number, Note>();
  const engraving: Track[] = [];
  const tracks: Track[] = original.tracks.map((track, index) => {
    const notes = [...edits.tracks[index]].sort((a, b) => a.q - b.q || a.p - b.p);
    const byId = new Map(notes.map(note => [note.id, note]));
    const tiedTo = new Set<number>();
    for (const note of notes) {
      if (note.tie !== undefined && tieValid(note, byId.get(note.tie))) {
        tiedTo.add(note.tie);
        curves.push({track: index, from: note.id, to: note.tie, tie: true});
      }
      if (note.slur !== undefined) curves.push({track: index, from: note.id, to: note.slur, tie: false});
    }
    engraving.push({inst: track.inst, name: track.name, notes: notes.map(note => {
      const copy: Note = {q: note.q, len: note.len, p: note.p, v: note.v, s: 0, e: 0, src: [note.id]};
      if (note.lyric) copy.lyric = note.lyric;
      if (note.lyricCues?.length) copy.lyricCues = note.lyricCues.map(cue => ({...cue}));
      written.set(note.id, copy);
      return copy;
    })});
    const built: Note[] = [];
    for (const first of notes) {
      if (tiedTo.has(first.id)) continue;
      const src = [first.id];
      let last = first, end = first.q + first.len;
      const cues = first.lyricCues ? first.lyricCues.map(cue => ({...cue})) : [];
      // Follow the chain of ties; a tie that loops back on itself stops the chain.
      while (last.tie !== undefined) {
        const next = byId.get(last.tie);
        if (!tieValid(last, next) || src.includes(next.id)) break;
        src.push(next.id);
        end = Math.max(end, next.q + next.len);
        if (next.lyric) cues.push({q: next.q, text: next.lyric});
        for (const cue of next.lyricCues ?? []) cues.push({...cue});
        last = next;
      }
      const note: Note = {q: first.q, len: end - first.q, p: first.p, v: first.v, s: 0, e: 0, src};
      if (first.lyric) note.lyric = first.lyric;
      if (cues.length) note.lyricCues = cues;
      built.push(note);
    }
    return {inst: track.inst, name: track.name, notes: built};
  });
  const song = rebuildSong(original, tracks);
  song.engraving = engraving;
  song.ties = [];
  song.slurs = [];
  for (const {track, from, to, tie} of curves) {
    const start = written.get(from), end = written.get(to);
    if (!start || !end || start.q >= end.q || !engraving[track].notes.includes(end)) continue;
    (tie ? song.ties : song.slurs).push({track, from: start, to: end});
  }
  song.edits = edits;
  return song;
}

/** The notes as written, for engraving: one per edit note in an edited song. */
export const writtenTracks = (song: Song): Track[] => song.engraving ?? song.tracks;

/** The ids of the notes tied to this one, in order, including it. */
export function tieChain(edits: SongEdits, id: number): number[] {
  const found = findNote(edits, id);
  if (!found) return [id];
  const notes = edits.tracks[found.track], byId = new Map(notes.map(note => [note.id, note]));
  const chain = [found.note];
  for (let back = notes.find(n => n.tie === chain[0].id && tieValid(n, chain[0])); back && !chain.includes(back);
    back = notes.find(n => n.tie === chain[0].id && tieValid(n, chain[0]))) chain.unshift(back);
  for (let next = byId.get(chain[chain.length - 1].tie ?? -1); tieValid(chain[chain.length - 1], next) && !chain.includes(next);
    next = byId.get(chain[chain.length - 1].tie ?? -1)) chain.push(next);
  return chain.map(note => note.id);
}

/** Counts the notes in a set of edits. */
export const noteCount = (edits: SongEdits): number => edits.tracks.reduce((sum, notes) => sum + notes.length, 0);

/** Finds an edit note and the track it is in. */
export function findNote(edits: SongEdits, id: number): {note: EditNote; track: number} | undefined {
  for (let track = 0; track < edits.tracks.length; track++) {
    const note = edits.tracks[track].find(n => n.id === id);
    if (note) return {note, track};
  }
}

/** Adds a note and returns its id. */
export function addNote(edits: SongEdits, track: number, q: number, len: number, p: number, v = .8): number {
  const id = edits.nextId++;
  edits.tracks[track].push({id, q, len, p, v});
  return id;
}

/** Removes notes, and any ties or slurs to them. */
export function removeNotes(edits: SongEdits, ids: readonly number[]): void {
  const gone = new Set(ids);
  edits.tracks = edits.tracks.map(notes => notes.filter(note => !gone.has(note.id)));
  for (const notes of edits.tracks) {
    for (const note of notes) {
      if (note.tie !== undefined && gone.has(note.tie)) delete note.tie;
      if (note.slur !== undefined && gone.has(note.slur)) delete note.slur;
    }
  }
}

/** Sets the pitch of notes. Ties that no longer join equal pitches are removed. */
export function setPitch(edits: SongEdits, ids: readonly number[], pitch: number): void {
  const moved = new Set(ids), p = Math.max(0, Math.min(127, Math.round(pitch)));
  for (const notes of edits.tracks) {
    for (const note of notes) if (moved.has(note.id)) note.p = p;
    const byId = new Map(notes.map(note => [note.id, note]));
    for (const note of notes) if (note.tie !== undefined && byId.get(note.tie)?.p !== note.p) delete note.tie;
  }
}

/** Whether giving these notes this pitch would put two notes of the same pitch at the same time in a part. */
export function pitchClashes(edits: SongEdits, ids: readonly number[], pitch: number): boolean {
  const moved = new Set(ids);
  return edits.tracks.some(notes => notes.some(note => moved.has(note.id) &&
    notes.some(other => !moved.has(other.id) && other.p === pitch && Math.abs(other.q - note.q) < 1e-6)));
}

export type LinkResult = 'tie' | 'slur' | 'other-part' | 'same-note' | 'overlap';

/**
 * Links two notes of one part: a tie when they share a pitch, a slur when they don't.
 * The earlier note always starts the link.
 */
export function linkNotes(edits: SongEdits, a: number, b: number): LinkResult {
  const first = findNote(edits, a), second = findNote(edits, b);
  if (!first || !second || a === b) return 'same-note';
  if (first.track !== second.track) return 'other-part';
  let [from, to] = [first.note, second.note];
  if (to.q < from.q) [from, to] = [to, from];
  if (Math.abs(to.q - from.q) < 1e-6) return 'same-note';
  if (from.p === to.p) {
    if (!tieValid(from, to)) return 'overlap';
    // A note can only be tied onward once; move an existing tie into the new one.
    for (const note of edits.tracks[first.track]) if (note.tie === to.id) delete note.tie;
    from.tie = to.id;
    if (from.slur === to.id) delete from.slur;
    return 'tie';
  }
  from.slur = to.id;
  return 'slur';
}

/** Removes every tie and slur that starts or ends on these notes. Returns how many were removed. */
export function unlinkNotes(edits: SongEdits, ids: readonly number[]): number {
  const set = new Set(ids);
  let removed = 0;
  for (const notes of edits.tracks) {
    for (const note of notes) {
      if (note.tie !== undefined && (set.has(note.id) || set.has(note.tie))) { delete note.tie; removed++; }
      if (note.slur !== undefined && (set.has(note.id) || set.has(note.slur))) { delete note.slur; removed++; }
    }
  }
  return removed;
}

/** Whether any of these notes starts or ends a tie or slur. */
export function hasLinks(edits: SongEdits, ids: readonly number[]): boolean {
  const set = new Set(ids);
  return edits.tracks.some(notes => notes.some(note =>
    (note.tie !== undefined && (set.has(note.id) || set.has(note.tie))) ||
    (note.slur !== undefined && (set.has(note.id) || set.has(note.slur)))));
}

const sharpOrder = 'FCGDAEB', flatOrder = 'BEADGCF';
const letterSemitones: Record<string, number> = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
const letters = 'CDEFGAB';

/** Diatonic staff step (C0 = 0, each line or space is one step) of a pitch spelt for the key. */
export function staffStep(pitch: number, sf: number): number {
  const {letter, octave} = spellPitch(pitch, sf);
  return octave * 7 + letters.indexOf(letter);
}

/** The pitch on a staff step in a key signature (sharpened or flattened as the key says). */
export function pitchAtStep(step: number, sf: number): number {
  const octave = Math.floor(step / 7), letter = letters[((step % 7) + 7) % 7];
  let shift = sf > 0 && sharpOrder.slice(0, sf).includes(letter) ? 1 : sf < 0 && flatOrder.slice(0, -sf).includes(letter) ? -1 : 0;
  // The app spells notes without E♯, B♯, C♭ or F♭, so those steps take the natural note, which is drawn on the same step.
  if ((shift > 0 && 'EB'.includes(letter)) || (shift < 0 && 'CF'.includes(letter))) shift = 0;
  return Math.max(0, Math.min(127, (octave + 1) * 12 + letterSemitones[letter] + shift));
}

/** Moves a pitch by staff steps, keeping it in the key. */
export const stepPitch = (pitch: number, steps: number, sf: number): number =>
  steps ? pitchAtStep(staffStep(pitch, sf) + steps, sf) : pitch;
