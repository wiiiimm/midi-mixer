import { $ } from '../lib/dom';
import { pitchNameWithOctave } from '../lib/notes';
import { shortcutsBlocked } from '../lib/shortcuts';
import type { Song, SongEdits } from '../lib/types';
import {
  addNote, applyEdits, cloneEdits, editsFor, findNote, hasLinks, linkNotes, noteCount, pitchAtStep, removeNotes,
  setPitch, stepPitch, tieChain, unlinkNotes, writtenTracks,
} from '../midi/edit';
import { DRUM_KIT, usesBassClef } from '../midi/parse';
import { notify } from '../ui/toast';
import { originalSong, replaceSong } from './library';
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
  steps: number;
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
    'Tap another note in this part to link it: the same pitch ties, a different pitch slurs.' :
    hit ? pitchNameWithOctave(hit.note.p, sf) + ' in ' + song.tracks[hit.track].name + ' selected. Drag it up or down to change its pitch.' :
    'Tap a staff to add a note, or tap a note to select it.';
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
  const q = Math.min(end - grid, Math.max(bar.q, bar.q + Math.round((staff.beat - bar.q) / grid) * grid));
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

function tapNote(hit: ScoreNoteHit) {
  if (!hit.note.src) return;
  const ids = withTies(hit.note.src), current = selectedHit();
  if (linking && current && !selected.includes(ids[0])) {
    // Link from the end of the earlier note's tie chain to the start of the later one's.
    const [from, to] = current.note.q <= hit.note.q ? [selected, ids] : [ids, selected];
    let result = '';
    commit(edits => {
      result = linkNotes(edits, from[from.length - 1], to[0]);
      return result === 'tie' || result === 'slur';
    });
    if (result === 'other-part') notify('Link notes in the same part.');
    else if (result === 'tie') notify('Tied: the notes now play as one sustained note.');
    else if (result === 'slur') notify('Slurred.');
    linking = false;
    keepSelection();
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
  if (commit(edits => setPitch(edits, ids, pitch))) {
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

function cancelGesture() {
  if (gesture?.hit) {
    for (const element of chainElements(gesture.hit)) element.removeAttribute('transform');
  }
  gesture = undefined;
}

function finishGesture(event: PointerEvent) {
  const ended = gesture;
  if (!ended || event.pointerId !== ended.pointer) return;
  if (!ended.moved) {
    cancelGesture();
    if (ended.hit) tapNote(ended.hit);
    else if (linking) { linking = false; refreshControls(); }
    else addAt(event.clientX, event.clientY);
    return;
  }
  const steps = ended.steps, hit = ended.hit;
  cancelGesture();
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
  onScoreRendered(() => { highlight(); refreshControls(); });

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
    notify('Reset to the original MIDI.', 'Undo', undo);
  });
  $('editLength').addEventListener('change', setSelectedLength);

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
    if (gesture.hit?.note.src) previewDrag(Math.round(-dy / (gesture.spacing / 2)));
    else if (event.pointerType === 'touch') workspace().scrollTop = gesture.scrollTop - dy;
  });
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
