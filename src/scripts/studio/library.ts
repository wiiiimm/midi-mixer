import { loadInstrument } from '../audio/sampler';
import { $, esc, formatTime } from '../lib/dom';
import type { Song } from '../lib/types';
import { parseMidi } from '../midi/parse';
import { bundledSongs } from '../midi/repertoire';
import { syncMetronome } from '../tools/metronome-window';
import { whileBusy } from '../ui/loading';
import { notify } from '../ui/toast';
import { setCurrentKey } from './key';
import { useMixFor } from './mixer';
import { pausePlayback, resetBuses } from './playback';
import { clearScore, renderScore, resetScoreView } from './score';
import { renderSections } from './sections';
import { studio } from './state';
import { display, resetTransport } from './transport';

// The playlist lives in this browser's IndexedDB. On first visit the bundled sample
// songs are copied in; after that, sample and imported songs are treated alike and
// any of them can be removed. Removed samples can be restored. If IndexedDB is not
// available (private mode in some browsers), songs are kept for this session only.

interface StoredFile {
  id: string;
  name: string;
  data: ArrayBuffer;
  /** When it joined the playlist; sets the playlist order. */
  added?: number;
}

const DB_NAME = 'partbook-midi', SCORES = 'scores', PREFS = 'prefs';
const SEEDED = 'bundled-seeded';
const bundledId = (path: string) => 'bundled:' + path;

// Resolves once another tab (running an older version) stops this tab's database
// upgrade. The upgrade is not abandoned: `database` still resolves when that tab
// closes, and the saved playlist is loaded then.
let markBlocked: () => void = () => {};
const upgradeBlocked = new Promise<void>(resolve => { markBlocked = resolve; });
let blocked = false;

const database: Promise<IDBDatabase | null> = new Promise(resolve => {
  try {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SCORES)) db.createObjectStore(SCORES, {keyPath: 'id'});
      if (!db.objectStoreNames.contains(PREFS)) db.createObjectStore(PREFS);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Let a newer version of the app in another tab upgrade without being blocked by this one.
      db.onversionchange = () => db.close();
      blocked = false;
      resolve(db);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => { blocked = true; markBlocked(); };
  } catch {
    resolve(null);
  }
});

function run<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise(resolve => {
    let result: T | undefined;
    try {
      const tx = db.transaction(store, mode);
      const request = action(tx.objectStore(store));
      if (request) request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

async function saveFile(file: StoredFile): Promise<boolean> {
  const db = await database;
  if (!db) return false;
  const saved = await run(db, SCORES, 'readwrite', s => s.put(file));
  if (saved !== undefined) navigator.storage?.persist?.().catch(() => {});
  return saved !== undefined;
}

async function deleteFile(id: string): Promise<void> {
  const db = await database;
  if (db) await run(db, SCORES, 'readwrite', s => s.delete(id));
}

/** Same wording as a failed import: the songs stay in the playlist until reload. */
function noteSessionOnly(pending: readonly StoredFile[]): void {
  const note = pending.map(file => file.name + ' is available for this session only.').join(' ');
  const current = $('status').textContent?.trim();
  $('status').textContent = current ? current + ' ' + note : note;
}

/** Raw MIDI behind each song in the playlist, so a removal can be undone. */
const files = new Map<string, StoredFile>();

function songFrom(file: StoredFile): Song {
  const song = parseMidi(file.data, file.name);
  song.id = file.id;
  files.set(file.id, file);
  return song;
}

function filterSongs() {
  const query = $<HTMLInputElement>('filter').value.trim().toLowerCase();
  for (const row of $('files').children as HTMLCollectionOf<HTMLElement>) {
    row.hidden = !studio.songs[Number(row.dataset.index)].title.toLowerCase().includes(query);
  }
}

function renderLibrary() {
  $('filecount').textContent = String(studio.songs.length);
  $('files').innerHTML = studio.songs.map((song, i) =>
    '<div class="song-row" data-index="' + i + '"><button class="song' + (song === studio.song ? ' active' : '') + '"' +
    (song === studio.song ? ' aria-current="true"' : '') + '><span class="fileicon">♫</span><span>' +
    esc(song.title) + '<small>' + song.tracks.length + ' tracks · ' + formatTime(song.duration) + '</small></span></button>' +
    '<button class="song-remove" type="button" aria-label="Remove ' + esc(song.title) + ' from this browser" title="Remove">' +
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>').join('');
  filterSongs();
  const missing = bundledSongs.filter(([, path]) => !studio.songs.some(s => s.id === bundledId(path))).length;
  const restore = $<HTMLButtonElement>('restoreSamples');
  restore.hidden = !missing;
  restore.textContent = 'Restore ' + missing + ' sample song' + (missing === 1 ? '' : 's');
}

/** Makes a song current: stops playback and resets the transport, mixer and score. */
export function selectSong(song: Song): void {
  studio.playing = false;
  resetBuses();
  studio.song = song;
  studio.pos = studio.cue = 0;
  resetScoreView();
  resetTransport(song);
  renderSections(song);
  syncMetronome(song);
  useMixFor(song);
  renderLibrary();
  renderScore();
  display();
  studio.mix.forEach(m => loadInstrument(m.inst));
}

/** Leaves the studio with nothing selected (after the last song is removed). */
function clearSelection() {
  pausePlayback();
  resetBuses();
  studio.song = null;
  setCurrentKey(null);
  studio.mix = [];
  studio.pos = studio.cue = 0;
  $('rows').innerHTML = '';
  clearScore();
  renderSections(null);
  $('meta').textContent = 'Import a .mid file or restore the sample songs.';
  $('clock').textContent = '0:00 / 0:00';
  $('beatpos').textContent = '–';
  $('bars').textContent = 'Bar –';
}

const songControls = ['play', 'home', 'seek', 'rate', 'tempoBpm', 'loop', 'a', 'b', 'reset', 'all', 'startBar', 'cueHere', 'followScore', 'scrubScore'];

function refreshLibrary() {
  if (!studio.song && studio.songs.length) selectSong(studio.songs[0]);
  else renderLibrary();
  for (const id of songControls) $<HTMLButtonElement>(id).disabled = !studio.song;
  if (!studio.song) {
    $<HTMLButtonElement>('prev').disabled = $<HTMLButtonElement>('next').disabled = true;
    $('title').textContent = 'Load a MIDI file';
  }
}

async function importFiles(list: File[]) {
  let first: Song | undefined;
  const errors: string[] = [];
  for (const file of list) {
    try {
      const data = await file.arrayBuffer(), name = file.name.replace(/\.midi?$/i, '');
      const id = file.name + '|' + file.size + '|' + file.lastModified;
      let song = studio.songs.find(s => s.id === id);
      if (!song) {
        const stored: StoredFile = {id, name, data, added: Date.now()};
        song = songFrom(stored);
        studio.songs.push(song);
        const saving = saveFile(stored);
        // While another tab blocks the upgrade, the save completes once that tab closes.
        if (blocked) errors.push(file.name + ' will be saved once other midi-mixer tabs are closed.');
        else if (!await saving) errors.push(file.name + ' is available for this session only.');
      }
      first ??= song;
    } catch (error) {
      errors.push(file.name + ' — ' + (error instanceof Error ? error.message : String(error)));
    }
  }
  if (first) {
    selectSong(first);
    refreshLibrary();
  }
  $('status').textContent = errors.join(' ');
}

function removeSong(song: Song) {
  const index = studio.songs.indexOf(song);
  if (index < 0) return;
  const wasCurrent = song === studio.song;
  studio.songs.splice(index, 1);
  const file = song.id ? files.get(song.id) : undefined;
  if (song.id) deleteFile(song.id);
  if (wasCurrent) {
    const next = studio.songs[Math.min(index, studio.songs.length - 1)];
    if (next) selectSong(next); else clearSelection();
  }
  refreshLibrary();
  notify('Removed “' + song.title + '”', 'Undo', () => {
    // Restore and re-import build a new Song with the same id, so object identity
    // would insert a second row that shares one IndexedDB record.
    const present = song.id ? studio.songs.some(s => s.id === song.id) : studio.songs.includes(song);
    if (present) return;
    studio.songs.splice(Math.min(index, studio.songs.length), 0, song);
    if (file) saveFile(file);
    if (wasCurrent || !studio.song) selectSong(song);
    refreshLibrary();
  });
}

async function fetchBundled(only?: ReadonlySet<string>): Promise<StoredFile[]> {
  const wanted = bundledSongs.map((entry, order) => ({entry, order})).filter(({entry}) => !only || only.has(entry[1]));
  const results = await Promise.allSettled(wanted.map(async ({entry: [title, path], order}) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error('Could not load ' + title);
    return {id: bundledId(path), name: title, data: await response.arrayBuffer(), added: order} satisfies StoredFile;
  }));
  const failures = results.flatMap(r => r.status === 'rejected' ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : []);
  if (failures.length) $('status').textContent = failures.join(' ');
  return results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
}

/** Playlist order: by when each song was added (samples first, at 0–2). */
function sortSongs() {
  const rank = (song: Song): number => (song.id ? files.get(song.id)?.added : undefined) ?? Number.MAX_SAFE_INTEGER;
  studio.songs.sort((a, b) => rank(a) - rank(b));
}

let restoring: Promise<void> | undefined;

/** Puts back sample songs missing from the playlist. Repeat clicks share one restore. */
function restoreSamples(): Promise<void> {
  restoring ??= restoreMissingSamples().finally(() => { restoring = undefined; });
  return restoring;
}

async function restoreMissingSamples() {
  const missing = new Set(bundledSongs.map(([, path]) => path).filter(path => !studio.songs.some(s => s.id === bundledId(path))));
  if (!missing.size) return;
  for (const file of await fetchBundled(missing)) {
    // The playlist may have changed while fetching (an Undo, or the saved playlist loading).
    if (studio.songs.some(s => s.id === file.id)) continue;
    try {
      studio.songs.push(songFrom(file));
      if (blocked) void saveFile(file); else await saveFile(file);
    } catch { /* fetchBundled already reported unreachable files */ }
  }
  sortSongs();
  refreshLibrary();
}

export function initLibrary(): void {
  $('files').addEventListener('click', event => {
    const target = event.target as Element;
    const row = target.closest<HTMLElement>('.song-row');
    if (!row) return;
    const song = studio.songs[Number(row.dataset.index)];
    if (target.closest('.song-remove')) removeSong(song);
    else if (target.closest('.song') && song !== studio.song) whileBusy('Loading ' + song.title + '…', () => selectSong(song));
  });
  const filter = $<HTMLInputElement>('filter');
  filter.addEventListener('input', filterSongs);
  filter.addEventListener('keydown', e => {
    // Enter confirms an IME candidate; blurring then would drop the query.
    if (e.isComposing) return;
    if (e.key === 'Enter' || (e.key === 'Escape' && !filter.value)) filter.blur();
  });
  $('restoreSamples').addEventListener('click', () => whileBusy('Restoring sample songs…', restoreSamples));
  const upload = $<HTMLInputElement>('upload');
  $('import').addEventListener('click', () => upload.click());
  upload.addEventListener('change', () => {
    const list = Array.from(upload.files ?? []);
    if (!list.length) return;
    const label = list.length === 1 ? list[0].name : list.length + ' MIDI files';
    whileBusy('Loading ' + label + '…', () => importFiles(list)).finally(() => { upload.value = ''; });
  });
}

/**
 * Loads the playlist from this browser's storage, copying the sample songs in on
 * first visit. Resolves once the playlist is ready.
 */
export async function openLibrary(): Promise<void> {
  refreshLibrary();
  const opened = await Promise.race([database, upgradeBlocked.then(() => 'blocked' as const)]);
  if (opened !== 'blocked') {
    addFiles(opened ? await loadStored(opened) : await fetchBundled());
    return;
  }
  // A tab running an older version holds the database. Show the samples now and
  // load the saved playlist as soon as that tab closes.
  notify('Close other midi-mixer tabs to load your saved songs.', undefined, undefined, true);
  const shown = await fetchBundled();
  addFiles(shown);
  database.then(async db => {
    if (!db) {
      notify('Saved songs could not be opened. Songs you add now last for this session only.');
      return;
    }
    // Samples the user removed while waiting must not be copied back in by the first-visit seed.
    const removed = shown.map(file => file.id).filter(id => !studio.songs.some(s => s.id === id));
    const stored = await loadStored(db, removed);
    const ids = new Set(stored.map(file => file.id));
    // A sample shown while waiting but removed earlier in this browser goes away again.
    for (const song of [...studio.songs]) {
      if (song.id?.startsWith(bundledId('')) && !ids.has(song.id)) dropSong(song);
    }
    addFiles(stored);
    if ($('status').textContent?.includes('once other midi-mixer tabs are closed')) $('status').textContent = '';
    notify('Your saved songs are loaded.');
  });
}

/**
 * Reads the saved playlist, copying the sample songs in on first visit.
 * `removed` lists sample ids the user removed before storage opened; they are not copied in.
 */
async function loadStored(db: IDBDatabase, removed: readonly string[] = []): Promise<StoredFile[]> {
  const unsaved: StoredFile[] = [];
  // SEEDED is true once every sample has been copied in, or else the ids copied so
  // far, so a later retry adds only the missing samples and never one the user removed.
  const seeded = await run<unknown>(db, PREFS, 'readonly', s => s.get(SEEDED));
  if (seeded !== true) {
    const done = new Set(Array.isArray(seeded) ? seeded.filter((id): id is string => typeof id === 'string') : []);
    for (const id of removed) done.add(id);
    const pending = new Set(bundledSongs.map(([, path]) => path).filter(path => !done.has(bundledId(path))));
    const samples = await fetchBundled(pending);
    const saved = await Promise.all(samples.map(saveFile));
    samples.forEach((file, i) => { if (saved[i]) done.add(file.id); else unsaved.push(file); });
    const all = bundledSongs.every(([, path]) => done.has(bundledId(path)));
    await run(db, PREFS, 'readwrite', s => s.put(all ? true : [...done], SEEDED));
    if (unsaved.length) noteSessionOnly(unsaved);
  }
  const stored = ((await run<StoredFile[]>(db, SCORES, 'readonly', s => s.getAll())) ?? []).filter(file => !removed.includes(file.id));
  for (const file of unsaved) {
    if (!stored.some(saved => saved.id === file.id)) stored.push(file);
  }
  return stored;
}

/** Adds files that are not in the playlist yet, then re-sorts and redraws it. */
function addFiles(list: readonly StoredFile[]) {
  for (const file of list) {
    if (studio.songs.some(s => s.id === file.id)) continue;
    try { studio.songs.push(songFrom(file)); } catch { /* skip files that no longer parse */ }
  }
  sortSongs();
  refreshLibrary();
}

/** Takes a song out of the playlist without touching storage. */
function dropSong(song: Song) {
  const index = studio.songs.indexOf(song);
  if (index < 0) return;
  studio.songs.splice(index, 1);
  if (song === studio.song) {
    const next = studio.songs[Math.min(index, studio.songs.length - 1)];
    if (next) selectSong(next); else clearSelection();
  }
}
