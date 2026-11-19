import { loadInstrument } from '../audio/sampler';
import { $, esc, formatTime } from '../lib/dom';
import type { Song } from '../lib/types';
import { parseMidi } from '../midi/parse';
import { bundledSongs } from '../midi/repertoire';
import { whileBusy } from '../ui/loading';
import { useMixFor } from './mixer';
import { resetBuses } from './playback';
import { renderScore, resetScoreView } from './score';
import { studio } from './state';
import { display, resetTransport } from './transport';

// The playlist: bundled songs plus MIDI files imported by the user, which are
// kept on this device in IndexedDB.

interface StoredFile { id: string; name: string; data: ArrayBuffer }

const database: Promise<IDBDatabase | null> = new Promise(resolve => {
  try {
    const request = indexedDB.open('partbook-midi', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('scores', {keyPath: 'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  } catch {
    resolve(null);
  }
});

async function saveFile(item: StoredFile): Promise<boolean> {
  const db = await database;
  if (!db) return false;
  return new Promise(resolve => {
    const tx = db.transaction('scores', 'readwrite');
    tx.objectStore('scores').put(item);
    tx.oncomplete = () => resolve(true);
    tx.onerror = tx.onabort = () => resolve(false);
  });
}

function filterSongs() {
  const query = $<HTMLInputElement>('filter').value.trim().toLowerCase();
  for (const button of $('files').children as HTMLCollectionOf<HTMLElement>) {
    button.hidden = !studio.songs[Number(button.dataset.index)].title.toLowerCase().includes(query);
  }
}

function renderLibrary() {
  $('filecount').textContent = String(studio.songs.length);
  $('files').innerHTML = studio.songs.map((song, i) =>
    '<button data-index="' + i + '" class="' + (song === studio.song ? 'active' : '') + '"><span class="fileicon">♫</span><span>' +
    esc(song.title) + '<small>' + song.tracks.length + ' tracks · ' + formatTime(song.duration) + '</small></span></button>').join('');
  filterSongs();
}

/** Makes a song current: stops playback and resets the transport, mixer and score. */
export function selectSong(song: Song): void {
  studio.playing = false;
  resetBuses();
  studio.song = song;
  studio.pos = studio.cue = 0;
  resetScoreView();
  resetTransport(song);
  useMixFor(song);
  renderLibrary();
  renderScore();
  display();
  studio.mix.forEach(m => loadInstrument(m.inst));
}

const songControls = ['play', 'home', 'seek', 'rate', 'tempoBpm', 'loop', 'a', 'b', 'reset', 'all', 'startBar', 'cueHere', 'followScore'];

function refreshLibrary() {
  if (!studio.song && studio.songs.length) selectSong(studio.songs[0]);
  else renderLibrary();
  for (const id of songControls) $<HTMLButtonElement>(id).disabled = !studio.song;
  if (!studio.song) {
    $<HTMLButtonElement>('prev').disabled = $<HTMLButtonElement>('next').disabled = true;
    $('title').textContent = 'Load a MIDI file';
  }
}

async function importFiles(files: File[]) {
  let first: Song | undefined;
  const errors: string[] = [];
  for (const file of files) {
    try {
      const data = await file.arrayBuffer(), name = file.name.replace(/\.midi?$/i, '');
      const id = file.name + '|' + file.size + '|' + file.lastModified;
      let song = studio.songs.find(s => s.id === id);
      if (!song) {
        song = parseMidi(data, name);
        song.id = id;
        studio.songs.push(song);
        if (!await saveFile({id, name, data})) errors.push(file.name + ' is available for this session only.');
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

function restoreImported(db: IDBDatabase) {
  const request = db.transaction('scores').objectStore('scores').getAll();
  request.onsuccess = () => {
    for (const file of request.result as StoredFile[]) {
      if (studio.songs.some(s => s.id === file.id)) continue;
      try {
        const restored = parseMidi(file.data, file.name);
        restored.id = file.id;
        studio.songs.push(restored);
      } catch { /* skip files that no longer parse */ }
    }
    refreshLibrary();
  };
}

export function initLibrary(): void {
  $('files').addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLElement>('button');
    if (!button) return;
    const next = studio.songs[Number(button.dataset.index)];
    if (next !== studio.song) whileBusy('Loading ' + next.title + '…', () => selectSong(next));
  });
  $('filter').addEventListener('input', filterSongs);
  const upload = $<HTMLInputElement>('upload');
  $('import').addEventListener('click', () => upload.click());
  upload.addEventListener('change', () => {
    const files = Array.from(upload.files ?? []);
    if (!files.length) return;
    const label = files.length === 1 ? files[0].name : files.length + ' MIDI files';
    whileBusy('Loading ' + label + '…', () => importFiles(files)).finally(() => { upload.value = ''; });
  });
}

/** Loads the bundled songs (resolves once they are in), then restores imported files. */
export async function openLibrary(): Promise<void> {
  refreshLibrary();
  const results = await Promise.allSettled(bundledSongs.map(async ([title, path]) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error('Could not load ' + title);
    return parseMidi(await response.arrayBuffer(), title);
  }));
  studio.songs.unshift(...results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []));
  const failures = results.flatMap(r => r.status === 'rejected' ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : []);
  if (failures.length) $('status').textContent = failures.join(' ');
  refreshLibrary();
  database.then(db => { if (db) restoreImported(db); });
}
