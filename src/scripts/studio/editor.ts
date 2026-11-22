import { $ } from '../lib/dom';
import { pitchNameWithOctave } from '../lib/notes';
import { shortcutsBlocked } from '../lib/shortcuts';
import type { Song, SongEdits } from '../lib/types';
import {
  addNote, applyEdits, cloneEdits, editsFor, findNote, hasLinks, linkNotes, noteCount, pitchAtStep, pitchClashes, removeNotes,
  setPitch, stepPitch, tieChain, unlinkNotes, writtenTracks,
} from '../midi/edit';
import { DRUM_KIT, usesBassClef } from '../midi/parse';
import { notify } from '../ui/toast';
import { originalSong, replaceSong, saveAsNewSong } from './library';
import { downloadMidi } from '../midi/write';
import { previewNote, restart } from './playback';
import {
  editEnabled, onScoreRendered, renderScore, scoreEngraved, scoreNoteElements, scoreNoteFromSource, scoreNoteNear,
  scoreStaffAt, scrubEnabled, type ScoreNoteHit,
} from './score';
import { studio } from './state';
import { display, updateSongInfo } from './transport';

// Edit mode: change the notes of the loaded song on the engraved score.
//
// · Tap an empty spot on a staff to add a note there (length from the Length menu).
// · Tap a note to select it; drag it up or down to move it along the scale.
// · With a note selected, Link and then tap another note of the same part: the same
//   pitch makes a tie (the two play as one sustained note), a different pitch a slur.
// · Undo and redo step through this song's edits; Reset goes back to the original MIDI,
//   which is never changed (and Undo brings the edits back).
//
// Touch: in edit mode the score only lets the browser pan sideways (touch-action: pan-x),
// so dragging a note up or down moves it instead of scrolling. Dragging up or down on an
// empty part of the score scrolls the staves by hand, and pinching still zooms.

interface History { song: Song; undo: (SongEdits | null)[]; redo: (SongEdits | null)[] }

/** The selected edit notes (by id): a note and any notes tied to it. */
let selected: number[] = [];
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
}
let gesture: Gesture | undefined;

const button = (id: string) => $<HTMLButtonElement>(id);
const workspace = () => $('scorewrap').closest('.workspace')!;
const lengthChoice = () => Number($<HTMLSelectElement>('editLength').value) || 1;

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

function keepSelection() {
  if (selected.length && !selectedHit()) selected = [];
  highlight();
  refreshControls();
}

/** A note and the notes tied to it. */
const withTies = (ids: readonly number[]): number[] =>
  studio.song?.edits && ids.length ? tieChain(studio.song.edits, ids[0]) : [...ids];

function select(ids: number[]) {
  selected = withTies(ids);
  linking = false;
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
  if (!on || !song) return;
  const sf = hit ? song.keyAt(hit.note.q).sf : 0;
  $('editHint').textContent = linking && hit ?
    'Tap another note in this part: the same pitch makes a tie, a different pitch a slur.' :
    hit ? pitchNameWithOctave(hit.note.p, sf) + ' in ' + song.tracks[hit.track].name + ' selected. Drag it up or down to change its pitch, or sideways to another note to tie or slur them.' :
    'Tap a staff to add a note, or tap a note to select it. Drag a note sideways to another note to tie or slur them.';
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
  if (!on) select([]);
  refreshControls();
}

// ── Actions ──

function addAt(clientX: number, clientY: number) {
  const song = studio.song, staff = scoreStaffAt(clientX, clientY);
  if (!song || !staff) return;
  const track = writtenTracks(song)[staff.track];
  if (track.inst === DRUM_KIT) {
    notify('Drum parts can’t be edited.');
    return;
  }
  const bar = song.bars[staff.bar], end = song.bars[staff.bar + 1].q, length = lengthChoice();
  const grid = Math.min(length, 4 / bar.d);
  // Snap to a grid position inside the bar, even when the last bar is short or ends off the grid.
  const slots = Math.max(1, Math.floor((end - bar.q) / grid + 1e-6));
  const q = bar.q + Math.min(slots - 1, Math.max(0, Math.round((staff.beat - bar.q) / grid))) * grid;
  const sf = song.keyAt(q).sf, topLine = usesBassClef(track) ? 26 : 38; // A3 or F5
  const pitch = pitchAtStep(topLine + staff.offset, sf);
  const existing = track.notes.find(note => Math.abs(note.q - q) < 1e-6 && note.p === pitch);
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

function deleteSelected() {
  const song = studio.song;
  if (!song || !selected.length) return;
  const ids = selected;
  if (commit(edits => {
    if (noteCount(edits) <= ids.length) {
      notify('A song needs at least one note.');
      return false;
    }
    removeNotes(edits, ids);
  })) select([]);
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
    if (steps) element.setAttribute('transform', 'translate(0 ' + (-steps * gesture.spacing / 2 / scale) + ')');
    else element.removeAttribute('transform');
  }
  const pitch = stepPitch(hit.note.p, steps, song.keyAt(hit.note.q).sf);
  $('editHint').textContent = pitchNameWithOctave(pitch, song.keyAt(hit.note.q).sf) + (steps ? ' (let go to move the note here)' : '');
  if (steps !== gesture.steps) void previewNote(hit.track, pitch, .35);
  gesture.steps = steps;
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

function cancelGesture() {
  if (gesture?.hit) {
    for (const element of chainElements(gesture.hit)) element.removeAttribute('transform');
  }
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
    const onNote = ended.hit && (linking || tappedNote(ended.hit, event.clientX, event.clientY, ended.spacing, event.pointerType === 'touch'));
    if (ended.hit && onNote) tapNote(ended.hit);
    else if (linking) { linking = false; refreshControls(); }
    else addAt(event.clientX, event.clientY);
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
    highlight();
    refreshControls();
  });

  button('editDown').addEventListener('click', () => moveSelected(-1, true));
  button('editUp').addEventListener('click', () => moveSelected(1, true));
  button('editDelete').addEventListener('click', deleteSelected);
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
  $('editLength').addEventListener('change', setSelectedLength);
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
    const staff = scoreStaffAt(event.clientX, event.clientY);
    const radius = Math.max(event.pointerType === 'touch' ? 22 : 12, (staff?.spacing ?? 8) * 1.2);
    const hit = scoreNoteNear(event.clientX, event.clientY, radius);
    gesture = {
      pointer: event.pointerId, x: event.clientX, y: event.clientY, hit, spacing: staff?.spacing ?? 8,
      moved: false, steps: 0, scrollTop: workspace().scrollTop,
    };
    if (event.pointerType !== 'touch') event.preventDefault();
    try { area.setPointerCapture(event.pointerId); } catch { /* works without capture */ }
  });
  area.addEventListener('pointermove', event => {
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
  area.addEventListener('pointerup', finishGesture);
  area.addEventListener('pointercancel', event => {
    if (gesture && event.pointerId === gesture.pointer) { cancelGesture(); refreshControls(); }
  });

  document.addEventListener('keydown', event => {
    if (!editEnabled() || event.defaultPrevented || event.isComposing || shortcutsBlocked(event)) return;
    const command = event.ctrlKey || event.metaKey;
    if (command && event.code === 'KeyZ') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
      return;
    }
    if (command || event.altKey) return;
    if (event.key === 'Escape' && (selected.length || linking)) { select([]); event.preventDefault(); }
    else if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length) { deleteSelected(); event.preventDefault(); }
    else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && selected.length) {
      moveSelected(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey);
      event.preventDefault();
    }
  });
}
