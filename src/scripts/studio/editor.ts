import { $ } from '../lib/dom';
import { pitchNameWithOctave } from '../lib/notes';
import { shortcutsBlocked } from '../lib/shortcuts';
import type { Song, SongEdits } from '../lib/types';
import {
  addNote, applyEdits, cloneEdits, editsFor, findNote, hasLinks, linkNotes, noteCount, pitchAtStep, pitchClashes, removeNotes,
  setLyric, setPitch, staffStep, stepPitch, tieChain, unlinkNotes, writtenTracks,
} from '../midi/edit';
import { DRUM_KIT, usesBassClef } from '../midi/parse';
import { PIANO_NOTE } from '../tools/piano';
import { notify } from '../ui/toast';
import { originalSong, replaceSong, saveAsNewSong } from './library';
import { downloadMidi } from '../midi/write';
import { previewNote, restart } from './playback';
import {
  editEnabled, onScoreRendered, renderScore, scoreEngraved, scoreNoteElements, scoreNoteFromSource, scoreNoteNear,
  scoreStaffAt, scoreXAtBeat, scrollScoreBy, scrubEnabled, type ScoreNoteHit,
} from './score';
import { renderSections } from './sections';
import { barAt, studio } from './state';
import { display, updateSongInfo } from './transport';

// Edit mode: change the notes of the loaded song on the engraved score.
//
// · Tap a note to select it; drag it up or down to move it along the scale. Tapping an
//   empty spot clears the selection.
// · With Note input on, tap an empty spot on a staff to add a note there, with the value
//   chosen in the note value palette. A note played on the piano is added straight after
//   the selected note and selected in turn, so a line can be played in step by step.
// · With a note selected, Tie / Slur and then tap another note of the same part: the same
//   pitch makes a tie (the two play as one sustained note), a different pitch a slur.
// · On a computer the arrow keys move between notes and change pitch, and the number
//   keys choose note values, as in other score editors (see the keydown handler).
// · Undo and redo step through this song's edits; Reset goes back to the original MIDI,
//   which is never changed (and Undo brings the edits back).
//
// Touch: in edit mode the score only lets the browser pan sideways (touch-action: pan-x),
// so dragging a note up or down moves it instead of scrolling. Dragging up or down on an
// empty part of the score scrolls the staves by hand, and pinching still zooms.

interface History { song: Song; undo: (SongEdits | null)[]; redo: (SongEdits | null)[] }

/** The selected edit notes (by id): a note and any notes tied to it. */
let selected: number[] = [];
/** The note of the selection that arrow keys move on from: with a tie selected, the member last reached. */
let cursor: number | undefined;
let linking = false;
let history: History | undefined;
/** The song the selection belongs to; another song being picked clears it. */
let editingSong: Song | null = null;

interface Gesture {
  pointer: number;
  x: number; y: number;
  hit?: ScoreNoteHit;
  /** Staff line distance in pixels, for turning a drag into scale steps. */
  spacing: number;
  moved: boolean;
  /** What a drag that started on a note does: up or down changes pitch, sideways draws a tie or slur. */
  mode?: 'pitch' | 'curve';
  steps: number;
  target?: ScoreNoteHit;
  scrollTop: number;
  /** A finger or pen, which covers the note it drags. */
  touch: boolean;
}
let gesture: Gesture | undefined;

const button = (id: string) => $<HTMLButtonElement>(id);
const workspace = () => $('scorewrap').closest('.workspace')!;

/** Note input: taps on a staff and notes played on the piano add notes. Off, they only select. */
let noteInput = false;
/** The note value new notes get, in beats, before its dot. */
let value = 1, dotted = false;
const lengthChoice = () => value * (dotted ? 1.5 : 1);
const INPUT_KEY = 'midi-mixer.noteInput';
const VALUE_KEYS: Record<string, number> = {Digit3: .25, Digit4: .5, Digit5: 1, Digit6: 2, Digit7: 4};
const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const valueButtons = () => [...document.querySelectorAll<HTMLButtonElement>('#editValues button')];

/**
 * A length in beats as a palette value and whether it is dotted, when it is one of them.
 * Notes in a MIDI file are often held a little short of (or just past) their written value.
 */
function paletteValue(length: number): {beats: number; dotted: boolean; name: string} | undefined {
  const fits = (beats: number) => length > beats * .85 && length < beats * 1.06;
  for (const element of valueButtons()) {
    const beats = Number(element.dataset.beats), name = element.dataset.name ?? '';
    if (fits(beats)) return {beats, dotted: false, name};
    if (fits(beats * 1.5)) return {beats, dotted: true, name: 'dotted ' + name};
  }
}

function historyFor(song: Song): History {
  if (!history || history.song !== song) history = {song, undo: [], redo: []};
  return history;
}

/** Replaces the song with the given edits (or the original, for null) and redraws everything. */
function apply(edits: SongEdits | null): boolean {
  const song = studio.song;
  if (!song) return false;
  const original = originalSong(song) ?? (song.edits ? undefined : song);
  if (!original) return false;
  let next: Song;
  try {
    next = edits ? applyEdits(original, cloneEdits(edits)) : original;
  } catch (error) {
    notify(error instanceof Error ? error.message : String(error));
    return false;
  }
  const h = historyFor(song);
  h.song = next;
  editingSong = next;
  replaceSong(song, next).then(saved => {
    if (!saved && song.id) $('status').textContent = 'Your edits to ' + song.title + ' are kept for this session only.';
  });
  studio.pos = Math.min(studio.pos, next.duration);
  studio.cue = Math.min(studio.cue, next.duration);
  updateSongInfo(next);
  // Section chips hold bar ranges, so rebuild them when an edit changes the song's length.
  if (next.bars.length !== song.bars.length) renderSections(next);
  renderScore(true);
  display();
  if (studio.playing) restart();
  return true;
}

/** Applies an edit made to a copy of the current edits, remembering the previous state for Undo. */
function commit(change: (edits: SongEdits) => boolean | void): boolean {
  const song = studio.song;
  if (!song) return false;
  const before = song.edits ?? null, edits = editsFor(song);
  if (change(edits) === false) return false;
  const h = historyFor(song);
  if (!apply(edits)) return false;
  h.undo.push(before);
  h.redo = [];
  refreshControls();
  return true;
}

function undo() {
  const song = studio.song;
  if (!song) return;
  const h = historyFor(song), previous = h.undo.pop();
  if (previous === undefined) return;
  const current = song.edits ?? null;
  if (apply(previous)) h.redo.push(current); else h.undo.push(previous);
  keepSelection();
}

function redo() {
  const song = studio.song;
  if (!song) return;
  const h = historyFor(song), next = h.redo.pop();
  if (next === undefined) return;
  const current = song.edits ?? null;
  if (apply(next)) h.undo.push(current); else h.redo.push(next);
  keepSelection();
}

/** The selected note as drawn on the score. */
const selectedHit = (): ScoreNoteHit | undefined => selected.length ? scoreNoteFromSource(selected[0]) : undefined;

/** The palette shows a selected note's value, which is also what the next new note gets. */
function pickValue() {
  const hit = selected.length === 1 ? selectedHit() : undefined, picked = hit && paletteValue(hit.note.len);
  if (picked) ({beats: value, dotted} = picked);
}

function keepSelection() {
  if (selected.length && !selectedHit()) selected = [];
  pickValue();
  highlight();
  refreshControls();
}

/** A note and the notes tied to it. */
const withTies = (ids: readonly number[]): number[] =>
  studio.song?.edits && ids.length ? tieChain(studio.song.edits, ids[0]) : [...ids];

function select(ids: number[]) {
  cursor = ids[0];
  selected = withTies(ids);
  linking = false;
  pickValue();
  highlight();
  refreshControls();
}

function highlight() {
  if (studio.song !== editingSong) {
    editingSong = studio.song;
    selected = [];
    linking = false;
    cancelGesture();
  }
  for (const element of document.querySelectorAll('#engravedScore .edit-selected')) element.classList.remove('edit-selected');
  if (!selectedHit()) return;
  selected = withTies(selected);
  for (const id of selected) {
    const hit = scoreNoteFromSource(id);
    if (hit) for (const element of scoreNoteElements(hit.note)) element.classList.add('edit-selected');
  }
}

function refreshControls() {
  const song = studio.song, hit = selectedHit(), on = editEnabled();
  const h = song ? historyFor(song) : undefined;
  for (const id of ['editDown', 'editUp', 'editDelete', 'editLink']) button(id).disabled = !hit;
  button('editUnlink').disabled = !hit || !song?.edits || !hasLinks(song.edits, selected);
  button('editUndo').disabled = !h?.undo.length;
  button('editRedo').disabled = !h?.redo.length;
  button('editReset').disabled = !song?.edits;
  button('editLink').setAttribute('aria-pressed', String(linking && !!hit));
  button('editInput').setAttribute('aria-pressed', String(noteInput));
  $('scorewrap').classList.toggle('edit-input', noteInput);
  // A selected note of some other length (a tie, or an odd length from the MIDI file) checks no value.
  const shown = !hit || (selected.length === 1 && !!paletteValue(hit.note.len));
  for (const element of valueButtons()) {
    const checked = shown && same(Number(element.dataset.beats), value);
    element.setAttribute('aria-checked', String(checked));
    element.tabIndex = checked || (!shown && element.dataset.beats === '1') ? 0 : -1;
  }
  button('editDot').setAttribute('aria-pressed', String(shown && dotted));
  showLyric(hit);
  if (!on || !song) return;
  $('editHint').textContent = hintText(song, hit);
}

// ── Lyrics ──

const lyricInput = () => $<HTMLInputElement>('editLyric');
/** The edit note whose lyric the field holds: the first note of the selection. */
let lyricNote: number | undefined;

/** Puts the selected note's lyric in the Lyric field, unless it is being typed in for that same note. */
function showLyric(hit: ScoreNoteHit | undefined) {
  const input = lyricInput(), id = hit ? selected[0] : undefined;
  const lyric = id === undefined ? '' : studio.song?.edits ? findNote(studio.song.edits, id)?.note.lyric ?? '' : hit!.note.lyric ?? '';
  input.disabled = id === undefined;
  if (id === lyricNote && document.activeElement === input) return;
  lyricNote = id;
  input.value = lyric;
  input.dataset.saved = lyric;
}

/** Saves what was typed in the Lyric field to its note; an empty text removes the lyric. */
function commitLyric() {
  const input = lyricInput(), id = lyricNote;
  if (id === undefined || input.value.trim() === (input.dataset.saved ?? '')) return;
  const text = input.value;
  input.dataset.saved = text.trim();
  commit(edits => setLyric(edits, id, text));
}

/** Saves the lyric and moves on to the next note of the part, staying in the field, for typing a line in. */
function nextLyric(step: number) {
  commitLyric();
  // A chord shares one syllable, so move on past its other notes.
  const next = neighbour(step, true);
  if (!next) return;
  lyricNote = undefined;
  selectHit(next, false);
  lyricInput().select();
}

function hintText(song: Song, hit: ScoreNoteHit | undefined): string {
  const chosen = paletteValue(lengthChoice())?.name ?? 'note';
  if (linking && hit) return 'Tap another note in this part: the same pitch makes a tie, a different pitch a slur.';
  if (!hit) {
    return noteInput ? 'Tap a staff to add a ' + chosen + ', or tap a note to select it.' :
      'Tap a note to select it. Turn on Note input to add notes.';
  }
  const name = pitchNameWithOctave(hit.note.p, song.keyAt(hit.note.q).sf);
  const length = selected.length > 1 ? 'tied' : paletteValue(hit.note.len)?.name;
  return name + (length ? ' · ' + length : '') + ' · ' + song.tracks[hit.track].name + ', bar ' + (barAt(song, hit.note.q) + 1) + '. ' +
    (noteInput ? 'Play the piano to add the next note, or drag this one to change its pitch.' :
      'Drag up or down to change its pitch, or sideways to another note to tie or slur.');
}

function setNoteInput(on: boolean) {
  noteInput = on;
  try { localStorage.setItem(INPUT_KEY, on ? '1' : '0'); } catch { /* not remembered */ }
  if (!on) hideGhost();
  refreshControls();
}

/** Choosing a value starts it undotted, as in other score editors; the dot is added after. */
function setValue(beats: number) {
  value = beats;
  dotted = false;
  setSelectedLength();
  refreshControls();
}

function toggleDot() {
  // A selected note of an odd length takes the plain value first.
  const hit = selectedHit();
  dotted = hit && selected.length === 1 && !paletteValue(hit.note.len) ? false : !dotted;
  setSelectedLength();
  refreshControls();
}

function setEditing(on: boolean) {
  if (on && !scoreEngraved()) {
    notify('Editing needs the engraved score, which is still loading.');
    return;
  }
  if (on && scrubEnabled()) $('scrubScore').click();
  $('editScore').setAttribute('aria-pressed', String(on));
  $('scorewrap').classList.toggle('edit-mode', on);
  $('editBar').hidden = !on;
  cancelGesture();
  hideGhost();
  $<HTMLDetailsElement>('editMenu').open = false;
  if (!on) select([]);
  refreshControls();
}

// ── Actions ──

/** Where a tap on a staff would put a note: the part, the snapped beat and the pitch on that line or space. */
function placement(clientX: number, clientY: number) {
  const song = studio.song, staff = scoreStaffAt(clientX, clientY);
  if (!song || !staff) return;
  const track = writtenTracks(song)[staff.track];
  const bar = song.bars[staff.bar], end = song.bars[staff.bar + 1].q, length = lengthChoice();
  // A dotted value snaps like its plain one, so a dotted quaver can start on any quaver.
  const grid = Math.min(value, 4 / bar.d);
  // Snap to a grid position inside the bar, even when the last bar is short or ends off the grid.
  const slots = Math.max(1, Math.floor((end - bar.q) / grid + 1e-6));
  const q = bar.q + Math.min(slots - 1, Math.max(0, Math.round((staff.beat - bar.q) / grid))) * grid;
  const sf = song.keyAt(q).sf, topLine = usesBassClef(track) ? 26 : 38; // A3 or F5
  return {staff, track, q, length, sf, pitch: pitchAtStep(topLine + staff.offset, sf), drums: track.inst === DRUM_KIT};
}

function addAt(clientX: number, clientY: number) {
  const place = placement(clientX, clientY);
  if (!place) return;
  if (place.drums) {
    notify('Drum parts can’t be edited.');
    return;
  }
  const {staff, track, q, length, pitch} = place;
  const existing = track.notes.find(note => same(note.q, q) && note.p === pitch);
  if (existing?.src) {
    select(existing.src);
    return;
  }
  let id = 0;
  if (commit(edits => { id = addNote(edits, staff.track, q, length, pitch); })) {
    select([id]);
    void previewNote(staff.track, pitch);
  }
}

/** Note input from the piano: adds the played pitch straight after the selected note and selects it. */
function addAfterSelected(pitch: number) {
  const song = studio.song, first = selectedHit();
  // The piano runs past the top of the MIDI range, which a saved edit can't hold.
  if (!song || !first || studio.playing || pitch < 0 || pitch > 127) return;
  const last = scoreNoteFromSource(selected[selected.length - 1]) ?? first;
  const track = writtenTracks(song)[last.track];
  if (track.inst === DRUM_KIT) return;
  // Notes from a MIDI file rarely end exactly on the beat, so start on the nearest demisemiquaver
  // (fine enough for a dotted semiquaver's end).
  const q = Math.max(Math.round((last.note.q + last.note.len) * 8) / 8, last.note.q + .125);
  const existing = track.notes.find(note => same(note.q, q) && note.p === pitch);
  if (existing?.src) select(existing.src);
  else {
    let id = 0;
    if (commit(edits => { id = addNote(edits, last.track, q, lengthChoice(), pitch); })) select([id]);
  }
  revealSelected();
}

// ── Moving the selection between notes ──

/** Scrolls the score so the selected note is in view. */
function revealSelected() {
  const hit = selectedHit();
  const head = hit && scoreNoteElements(hit.note)[0]?.querySelector('.notehead')?.getBoundingClientRect();
  if (!head) return;
  const view = $('scoreViewport').getBoundingClientRect(), space = workspace(), frame = space.getBoundingClientRect();
  const left = Math.max(view.left, 0), right = Math.min(view.right, innerWidth), margin = Math.min(90, (right - left) / 4);
  if (head.left < left + margin) scrollScoreBy(head.left - left - margin);
  else if (head.right > right - margin) scrollScoreBy(head.right - right + margin);
  if (head.top < frame.top + 50) space.scrollTop += head.top - frame.top - 50;
  else if (head.bottom > frame.bottom - 50) space.scrollTop += head.bottom - frame.bottom + 50;
}

function selectHit(hit: ScoreNoteHit | undefined, sound = true) {
  if (!hit?.note.src) return;
  select(hit.note.src);
  if (sound) void previewNote(hit.track, hit.note.p);
  revealSelected();
}

const editable = (song: Song, track: number) => writtenTracks(song)[track]?.inst !== DRUM_KIT;
const byTime = (song: Song, track: number) => [...writtenTracks(song)[track].notes].sort((a, b) => a.q - b.q || a.p - b.p);

/** The note of a part nearest a beat. */
function nearestNote(song: Song, track: number, q: number): ScoreNoteHit | undefined {
  let best: ScoreNoteHit | undefined;
  for (const note of writtenTracks(song)[track].notes) {
    if (note.src && (!best || Math.abs(note.q - q) < Math.abs(best.note.q - q))) best = {note, track};
  }
  return best;
}

/** The next (1) or previous (-1) note of the selected note's part, past any notes tied to it, and past its chord if asked. */
function neighbour(step: number, pastChord = false): ScoreNoteHit | undefined {
  const song = studio.song, hit = selectedHit();
  if (!song) return;
  if (!hit) {
    const track = song.tracks.findIndex((_, index) => editable(song, index));
    return track < 0 ? undefined : nearestNote(song, track, song.beat(studio.pos));
  }
  // Start from the tied note last reached, so a note between a tie's members can't trap the arrows.
  const from = cursor !== undefined && selected.includes(cursor) ? scoreNoteFromSource(cursor)?.note ?? hit.note : hit.note;
  const notes = byTime(song, hit.track);
  for (let i = notes.indexOf(from) + step; i >= 0 && i < notes.length; i += step) {
    if (pastChord && same(notes[i].q, from.q)) continue;
    if (notes[i].src && !notes[i].src!.some(id => selected.includes(id))) return {note: notes[i], track: hit.track};
  }
}

/** The note at the same time in the part above (-1) or below (1). */
function inOtherPart(step: number): ScoreNoteHit | undefined {
  const song = studio.song, hit = selectedHit();
  if (!song || !hit) return;
  for (let track = hit.track + step; track >= 0 && track < song.tracks.length; track += step) {
    const found = editable(song, track) ? nearestNote(song, track, hit.note.q) : undefined;
    if (found) return found;
  }
}

/** Joins two notes with a tie (same pitch) or a slur (different pitches), then selects the first. */
function joinNotes(a: ScoreNoteHit, b: ScoreNoteHit) {
  if (!a.note.src || !b.note.src) return;
  const one = withTies(a.note.src), two = withTies(b.note.src);
  linking = false;
  if (one.includes(two[0])) { refreshControls(); return; }
  // From the end of the earlier note's tie chain to the start of the later one's.
  const [from, to] = a.note.q <= b.note.q ? [one, two] : [two, one];
  let result = '';
  commit(edits => {
    result = linkNotes(edits, from[from.length - 1], to[0]);
    return result === 'tie' || result === 'slur';
  });
  if (result === 'other-part') notify('Ties and slurs join notes in the same part.');
  else if (result === 'same-note') notify('Ties and slurs join notes that start at different times.');
  else if (result === 'overlap') notify('A tie joins a note to one that starts after it ends.');
  else if (result === 'tie') notify('Tied: the notes now play as one sustained note.');
  else if (result === 'slur') notify('Slurred.');
  select(from);
}

function tapNote(hit: ScoreNoteHit) {
  if (!hit.note.src) return;
  const ids = withTies(hit.note.src), current = selectedHit();
  if (linking && current && !selected.includes(ids[0])) {
    joinNotes(current, hit);
    return;
  }
  select(ids);
  void previewNote(hit.track, hit.note.p);
}

/** Deletes the selection. From the keyboard, the note before it (or after) is selected next. */
function deleteSelected(thenSelect = false) {
  const song = studio.song;
  if (!song || !selected.length) return;
  const ids = selected, next = thenSelect ? (neighbour(-1) ?? neighbour(1))?.note.src : undefined;
  if (commit(edits => {
    if (noteCount(edits) <= ids.length) {
      notify('A song needs at least one note.');
      return false;
    }
    removeNotes(edits, ids);
  })) {
    select(next ?? []);
    if (next) revealSelected();
  }
}

/** Moves the selected note by scale steps (in the key) or by semitones. */
function moveSelected(amount: number, semitones: boolean) {
  const song = studio.song, hit = selectedHit();
  if (!song || !hit || !amount) return;
  const pitch = semitones ? hit.note.p + amount : stepPitch(hit.note.p, amount, song.keyAt(hit.note.q).sf);
  if (pitch === hit.note.p || pitch < 0 || pitch > 127) return;
  const ids = selected;
  if (commit(edits => {
    if (!pitchClashes(edits, ids, pitch)) return setPitch(edits, ids, pitch);
    notify('This part already has a ' + pitchNameWithOctave(pitch, song.keyAt(hit.note.q).sf) + ' at the same time.');
    return false;
  })) {
    keepSelection();
    revealSelected();
    void previewNote(hit.track, pitch);
  }
}

function unlinkSelected() {
  const ids = selected;
  if (commit(edits => unlinkNotes(edits, ids) > 0)) keepSelection();
}

function setSelectedLength() {
  const song = studio.song, hit = selectedHit();
  if (!song || !hit || selected.length !== 1) return;
  const id = selected[0], length = lengthChoice();
  if (commit(edits => {
    const found = findNote(edits, id);
    if (!found || Math.abs(found.note.len - length) < 1e-6) return false;
    found.note.len = length;
  })) keepSelection();
}

// ── Pointer gestures on the score ──

/** The drawn elements of a note and the notes tied to it. */
const chainElements = (hit: ScoreNoteHit) => withTies(hit.note.src ?? []).flatMap(id => {
  const found = scoreNoteFromSource(id);
  return found ? scoreNoteElements(found.note) : [];
});

function previewDrag(steps: number) {
  const song = studio.song, hit = gesture?.hit;
  if (!song || !hit || !gesture) return;
  for (const element of chainElements(hit)) {
    const scale = element.getScreenCTM()?.d || 1;
    element.classList.add('edit-dragging');
    if (steps) element.setAttribute('transform', 'translate(0 ' + (-steps * gesture.spacing / 2 / scale) + ')');
    else element.removeAttribute('transform');
  }
  const pitch = stepPitch(hit.note.p, steps, song.keyAt(hit.note.q).sf);
  const name = pitchNameWithOctave(pitch, song.keyAt(hit.note.q).sf);
  $('editHint').textContent = name + (steps ? ' (let go to move the note here)' : '');
  // The finger covers the note, so mark its new line or space beside it and show the pitch above.
  const head = scoreNoteElements(hit.note)[0]?.querySelector('.notehead')?.getBoundingClientRect();
  const marker = $('editDrag');
  if (head) {
    marker.hidden = false;
    marker.style.transform = 'translate(' + (head.left + head.width / 2) + 'px, ' + (head.top + head.height / 2) + 'px)';
    marker.querySelector('.edit-drag-label')!.textContent = name;
    marker.classList.toggle('edit-drag-touch', gesture.touch);
    if (gesture.touch) showLoupe(marker, hit, steps, name, head.left + head.width / 2, head.top + head.height / 2);
  }
  if (steps !== gesture.steps) void previewNote(hit.track, pitch, .35);
  gesture.steps = steps;
}

/**
 * A finger hides the note it drags, so a small staff floats above it showing the note on its
 * new line or space (orange), where it started (grey) and its pitch name.
 */
function showLoupe(marker: HTMLElement, hit: ScoreNoteHit, steps: number, name: string, x: number, y: number) {
  const song = studio.song!, loupe = marker.querySelector<HTMLElement>('.edit-loupe')!;
  const sf = song.keyAt(hit.note.q).sf, topLine = usesBassClef(writtenTracks(song)[hit.track]) ? 26 : 38;
  // Staff steps above the top line (0); the bottom line is -8.
  const from = staffStep(hit.note.p, sf) - topLine, to = from + steps;
  const space = 10, width = 132, height = 104, top = 32, yOf = (step: number) => top - step * space / 2;
  // Keep the moved note inside the window when it climbs or drops far off the staff.
  const noteY = yOf(to), shift = noteY < 14 ? noteY - 14 : noteY > height - 14 ? noteY - (height - 14) : 0;
  const line = (ly: number, x1: number, x2: number) => '<path d="M' + x1 + ' ' + ly + 'H' + x2 + '" />';
  const ledgers = (step: number, cx: number) => {
    let lines = '';
    for (let s = 2; s <= step; s += 2) lines += line(yOf(s), cx - 13, cx + 13);
    for (let s = -10; s >= step; s -= 2) lines += line(yOf(s), cx - 13, cx + 13);
    return lines;
  };
  const head = (step: number, cx: number, cls: string) =>
    '<ellipse class="' + cls + '" cx="' + cx + '" cy="' + yOf(step) + '" rx="7.2" ry="5" transform="rotate(-20 ' + cx + ' ' + yOf(step) + ')" />';
  loupe.querySelector('svg')!.innerHTML = '<g transform="translate(0 ' + -shift + ')">' +
    [0, 1, 2, 3, 4].map(i => line(top + i * space, 8, width - 8)).join('') +
    (steps ? ledgers(from, 46) + head(from, 46, 'was') : '') + ledgers(to, steps ? 84 : 66) + head(to, steps ? 84 : 66, 'now') + '</g>';
  loupe.querySelector('.edit-loupe-name')!.textContent = name;
  // Above the finger where there is room, and always inside the screen.
  const left = Math.max(8, Math.min(innerWidth - width - 8, x - width / 2)), above = y - 190;
  loupe.style.left = left - x + 'px';
  loupe.style.top = (above < 8 ? Math.max(8, y + 90) : above) - y + 'px';
}

/** While dragging sideways from a note: a curve from it to the pointer, and the note it would join. */
function previewCurve(clientX: number, clientY: number) {
  if (!gesture?.hit) return;
  const head = scoreNoteElements(gesture.hit.note)[0]?.querySelector('.notehead')?.getBoundingClientRect();
  if (!head) return;
  const x = head.left + head.width / 2, y = head.top + head.height / 2;
  const radius = Math.max(16, gesture.spacing * 1.4);
  const target = scoreNoteNear(clientX, clientY, radius);
  const valid = target && target.track === gesture.hit.track && target.note !== gesture.hit.note ? target : undefined;
  if (gesture.target?.note !== valid?.note) {
    for (const element of document.querySelectorAll('#engravedScore .edit-target')) element.classList.remove('edit-target');
    if (valid) for (const element of scoreNoteElements(valid.note)) element.classList.add('edit-target');
  }
  gesture.target = valid;
  const lift = Math.min(40, Math.max(12, Math.abs(clientX - x) * .25));
  const curve = $('editCurve');
  curve.hidden = false;
  curve.querySelector('path')!.setAttribute('d', 'M' + x + ' ' + (y - 6) + ' Q' + (x + clientX) / 2 + ' ' + (Math.min(y, clientY) - lift) + ' ' + clientX + ' ' + (clientY - 6));
  $('editHint').textContent = !valid ? 'Drag to another note in this part, then let go.' :
    valid.note.p === gesture.hit.note.p ? 'Let go to tie these notes.' : 'Let go to slur these notes.';
}

/** With Note input on, a mouse over a staff shows the note a click would add there. */
function showGhost(event: PointerEvent) {
  const ghost = $('editGhost');
  const place = noteInput && !linking && (event.target as Element).closest?.('#engravedScore') ?
    placement(event.clientX, event.clientY) : undefined;
  const x = place && !place.drums ? scoreXAtBeat(place.q) : undefined;
  const near = place && scoreNoteNear(event.clientX, event.clientY, Math.max(12, place.staff.spacing * 1.2));
  if (!place || x === undefined || (near && tappedNote(near, event.clientX, event.clientY, place.staff.spacing, false))) {
    ghost.hidden = true;
    return;
  }
  const {offset, spacing, top} = place.staff;
  ghost.hidden = false;
  ghost.style.setProperty('--space', spacing + 'px');
  ghost.style.transform = 'translate(' + x + 'px, ' + (top - offset * spacing / 2) + 'px)';
  // Ledger lines: every second step above the top line (0) or below the bottom line (-8).
  const ledgers: number[] = [];
  for (let step = 2; step <= offset; step += 2) ledgers.push(step);
  for (let step = -10; step >= offset; step -= 2) ledgers.push(step);
  ghost.querySelector('.edit-ghost-ledgers')!.replaceChildren(...ledgers.map(step => {
    const line = document.createElement('i');
    line.style.top = (offset - step) * spacing / 2 + 'px';
    return line;
  }));
  ghost.querySelector('.edit-ghost-label')!.textContent = pitchNameWithOctave(place.pitch, place.sf);
}

function hideGhost() {
  $('editGhost').hidden = true;
}

function cancelGesture() {
  if (gesture?.hit) {
    for (const element of chainElements(gesture.hit)) {
      element.removeAttribute('transform');
      element.classList.remove('edit-dragging');
    }
  }
  $('editDrag').hidden = true;
  for (const element of document.querySelectorAll('#engravedScore .edit-target')) element.classList.remove('edit-target');
  $('editCurve').hidden = true;
  gesture = undefined;
}

/**
 * Whether a tap was on the note itself rather than on the staff beside it. A drag can
 * start anywhere near a note, but a tap a line or space away from it adds a note there.
 */
function tappedNote(hit: ScoreNoteHit, x: number, y: number, spacing: number, touch: boolean): boolean {
  const head = scoreNoteElements(hit.note)
    .map(element => element.querySelector('.notehead')?.getBoundingClientRect())
    .find(box => box && x >= box.left - (touch ? spacing : 3) && x <= box.right + (touch ? spacing : 3));
  return !!head && Math.abs(y - (head.top + head.height / 2)) < spacing / 2;
}

function finishGesture(event: PointerEvent) {
  const ended = gesture;
  if (!ended || event.pointerId !== ended.pointer) return;
  if (!ended.moved) {
    cancelGesture();
    // Without Note input a tap near a note selects it; with it, a tap beside a note adds one there.
    const onNote = ended.hit && (linking || !noteInput ||
      tappedNote(ended.hit, event.clientX, event.clientY, ended.spacing, event.pointerType === 'touch'));
    if (ended.hit && onNote) tapNote(ended.hit);
    else if (linking) { linking = false; refreshControls(); }
    else if (noteInput) addAt(event.clientX, event.clientY);
    else select([]);
    return;
  }
  const steps = ended.steps, hit = ended.hit, target = ended.target;
  cancelGesture();
  if (ended.mode === 'curve') {
    if (hit && target) joinNotes(hit, target); else refreshControls();
    return;
  }
  if (hit?.note.src && steps) {
    select(hit.note.src);
    moveSelected(steps, false);
  } else refreshControls();
}

export function initEditor(): void {
  const area = $('scorewrap');
  $('editScore').addEventListener('click', () => setEditing(!editEnabled()));
  // Scrub and edit both use presses on the score, so only one can be on.
  $('scrubScore').addEventListener('click', () => { if (scrubEnabled() && editEnabled()) setEditing(false); });
  onScoreRendered(() => {
    // Editing needs the engraved score; if a song falls back to the plain one, leave Edit mode.
    if (editEnabled() && !scoreEngraved()) {
      setEditing(false);
      notify('This song can’t be engraved, so it can’t be edited.');
    }
    hideGhost();
    highlight();
    refreshControls();
  });

  try { noteInput = localStorage.getItem(INPUT_KEY) === '1'; } catch { /* starts off */ }
  button('editInput').addEventListener('click', () => setNoteInput(!noteInput));
  for (const element of valueButtons()) element.addEventListener('click', () => setValue(Number(element.dataset.beats)));
  // The palette is a radio group: its arrow keys move between the values and don't reach the score's shortcuts.
  $('editValues').addEventListener('keydown', event => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step || event.ctrlKey || event.metaKey || event.altKey) return;
    const buttons = valueButtons(), at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = buttons[(at + step + buttons.length) % buttons.length];
    setValue(Number(next.dataset.beats));
    next.tabIndex = 0;
    next.focus();
  });
  button('editDot').addEventListener('click', toggleDot);
  // The Song menu closes after a choice, or on a press anywhere else.
  const menu = $<HTMLDetailsElement>('editMenu');
  menu.querySelector('.edit-menu-items')!.addEventListener('click', () => { menu.open = false; });
  document.addEventListener('pointerdown', event => {
    if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
  });
  const lyric = lyricInput();
  lyric.addEventListener('change', commitLyric);
  // Typing replaces the lyric that is there, as tapping into the field on a phone would otherwise add to it.
  lyric.addEventListener('focus', () => setTimeout(() => lyric.select()));
  lyric.addEventListener('keydown', event => {
    // Keys that are choosing characters in an input method (Chinese, Japanese…) are not ours.
    if (event.isComposing) return;
    if (event.key === 'Enter' || event.key === ' ') nextLyric(event.shiftKey ? -1 : 1);
    else if (event.key === 'Escape') {
      lyric.value = lyric.dataset.saved ?? '';
      lyric.blur();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  });
  document.addEventListener(PIANO_NOTE, event => {
    if (!editEnabled() || !noteInput) return;
    // A tap on the piano doesn't take the focus, so save a lyric still being typed first.
    commitLyric();
    addAfterSelected((event as CustomEvent<number>).detail);
  });

  button('editDown').addEventListener('click', () => moveSelected(-1, true));
  button('editUp').addEventListener('click', () => moveSelected(1, true));
  button('editDelete').addEventListener('click', () => deleteSelected());
  button('editLink').addEventListener('click', () => { linking = !linking && !!selectedHit(); refreshControls(); });
  button('editUnlink').addEventListener('click', unlinkSelected);
  button('editUndo').addEventListener('click', undo);
  button('editRedo').addEventListener('click', redo);
  button('editReset').addEventListener('click', () => {
    const song = studio.song;
    if (!song?.edits) return;
    const before = song.edits;
    select([]);
    if (!apply(null)) return;
    const h = historyFor(studio.song!);
    h.undo.push(before);
    h.redo = [];
    refreshControls();
    // Undo from the toast only while the reset is still the latest change to this song.
    notify('Reset to the original MIDI.', 'Undo', () => {
      if (studio.song === h.song && history === h && h.undo.at(-1) === before) undo();
    });
  });
  button('editDownload').addEventListener('click', () => { if (studio.song) downloadMidi(studio.song); });
  button('editSaveAs').addEventListener('click', () => {
    const song = studio.song;
    if (!song) return;
    const name = prompt('Name for the new song', song.title + (song.edits ? ' (edited)' : ' (copy)'))?.trim();
    if (!name) return;
    void saveAsNewSong(song, name).then(saved => notify('Saved “' + saved.title + '”. Reset now returns to this version.'));
  });

  area.addEventListener('pointerdown', event => {
    if (!editEnabled() || !studio.song) return;
    if (gesture) {
      // A second finger: leave the gesture to pinch zoom.
      if (event.pointerType === 'touch') cancelGesture();
      return;
    }
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (!(event.target as Element).closest('#engravedScore')) return;
    hideGhost();
    // Working on the score takes the keyboard away from the button last pressed, so Enter and Space act on the note.
    if (document.activeElement?.closest('button, summary')) $('scoreViewport').focus({preventScroll: true});
    commitLyric();
    const staff = scoreStaffAt(event.clientX, event.clientY);
    const radius = Math.max(event.pointerType === 'touch' ? 22 : 12, (staff?.spacing ?? 8) * 1.2);
    let hit = scoreNoteNear(event.clientX, event.clientY, radius);
    // Drum notes can't be edited: a tap on one says so (through addAt) and a drag scrolls.
    if (hit && writtenTracks(studio.song)[hit.track]?.inst === DRUM_KIT) hit = undefined;
    gesture = {
      pointer: event.pointerId, x: event.clientX, y: event.clientY, hit, spacing: staff?.spacing ?? 8,
      moved: false, steps: 0, scrollTop: workspace().scrollTop, touch: event.pointerType !== 'mouse',
    };
    if (event.pointerType !== 'touch') event.preventDefault();
    try { area.setPointerCapture(event.pointerId); } catch { /* works without capture */ }
  });
  area.addEventListener('pointermove', event => {
    if (!gesture && event.pointerType === 'mouse' && editEnabled()) showGhost(event);
    if (!gesture || event.pointerId !== gesture.pointer) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) > 6) gesture.moved = true;
    if (!gesture.moved) return;
    if (gesture.hit?.note.src) {
      gesture.mode ??= Math.abs(dy) >= Math.abs(dx) ? 'pitch' : 'curve';
      if (gesture.mode === 'pitch') previewDrag(Math.round(-dy / (gesture.spacing / 2)));
      else previewCurve(event.clientX, event.clientY);
    } else if (event.pointerType === 'touch') workspace().scrollTop = gesture.scrollTop - dy;
  });
  // A drag that starts on a note belongs to the editor in every direction, so the
  // browser must not take a sideways one for scrolling the score.
  area.addEventListener('touchmove', event => {
    if (gesture?.hit && editEnabled() && event.cancelable) event.preventDefault();
  }, {passive: false});
  area.addEventListener('pointerleave', hideGhost);
  area.addEventListener('wheel', hideGhost, {passive: true});
  area.addEventListener('pointerup', finishGesture);
  area.addEventListener('pointercancel', event => {
    if (gesture && event.pointerId === gesture.pointer) { cancelGesture(); refreshControls(); }
  });

  // Keys, as in other score editors where the piano's own shortcuts leave room:
  // ← → previous or next note · ↑ ↓ pitch by step (Shift: semitone, Ctrl/⌘: octave) · Alt ↑ ↓ part above or below
  // N Note input · 3–7 semiquaver to semibreve · . dotted · Delete · Esc · Ctrl/⌘ Z undo, Shift Ctrl/⌘ Z or Ctrl Y redo
  document.addEventListener('keydown', event => {
    if (!editEnabled() || event.defaultPrevented || event.isComposing || shortcutsBlocked(event)) return;
    const command = event.ctrlKey || event.metaKey, up = event.key === 'ArrowUp', down = event.key === 'ArrowDown';
    // A focused slider (score zoom, a track's volume) keeps its own arrow keys.
    if (event.key.startsWith('Arrow') && (event.target as Element | null)?.closest?.('input[type=range]')) return;
    let handled = true;
    if (command && event.code === 'KeyZ') { if (event.shiftKey) redo(); else undo(); }
    else if (command && event.code === 'KeyY') redo();
    else if ((up || down) && selected.length) {
      if (event.altKey) selectHit(inOtherPart(up ? -1 : 1));
      else moveSelected((up ? 1 : -1) * (command ? 12 : 1), command || event.shiftKey);
    }
    else if (command || event.altKey) handled = false;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') selectHit(neighbour(event.key === 'ArrowLeft' ? -1 : 1));
    else if (event.key === 'Escape' && menu.open) menu.open = false;
    else if (event.key === 'Escape' && (selected.length || linking)) select([]);
    else if (event.key === 'Escape' && noteInput) setNoteInput(false);
    else if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length) deleteSelected(true);
    // Enter on a focused button, menu or piano key keeps activating that control.
    else if (event.key === 'Enter' && (event.target as Element | null)?.closest?.('button, summary, a[href], select, [role="button"]')) handled = false;
    else if (event.key === 'Enter' && selected.length) { lyricInput().focus(); lyricInput().select(); }
    else if (event.code === 'KeyN' && !event.shiftKey) { if (!event.repeat) setNoteInput(!noteInput); }
    else if (event.code in VALUE_KEYS && !event.shiftKey) setValue(VALUE_KEYS[event.code]);
    else if (event.key === '.') toggleDot();
    else handled = false;
    if (handled) event.preventDefault();
  });
}
