import { $ } from '../lib/dom';
import type { Song } from '../lib/types';
import { studio } from '../studio/state';
import { registerFloatingWindow } from '../ui/floating-windows';

// The floating metronome window embeds the standalone metronome page. The iframe
// is created on open and removed on close, so the metronome stops with the window.
// Its tempo starts at the current song's opening tempo; a BPM the user sets by hand
// is kept (across closing and reopening the window) until another song is selected.

const MIN_BPM = 30, MAX_BPM = 190;

/** The song's opening tempo, folded by octaves into the metronome's range and rounded. */
export function startingBpm(song: Song): number {
  // Tempos are sorted by position; the last one at the very start is in effect there.
  // Files with no tempo event keep the MIDI default (120 BPM), which is how they play.
  const opening = song.tempos.findLast(tempo => tempo.q <= 0) ?? song.tempos[0];
  let bpm = 60000000 / opening.us;
  while (bpm > MAX_BPM + .5) bpm /= 2;
  while (bpm < MIN_BPM - .5) bpm *= 2;
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
}

let frame: HTMLIFrameElement | null = null;
/** A tempo the user set by hand in the metronome, and the song it belongs to. */
let manual: {song: Song | null; bpm: number} | null = null;

function currentBpm(): number | null {
  const song = studio.song;
  if (manual && manual.song === song) return manual.bpm;
  return song ? startingBpm(song) : null;
}

function sendBpm() {
  const bpm = currentBpm();
  if (bpm !== null) frame?.contentWindow?.postMessage({type: 'metronome-set-bpm', bpm}, location.origin);
}

/** Called when a song becomes current: drops any hand-set tempo and retunes an open metronome. */
export function syncMetronome(song: Song): void {
  if (manual?.song !== song) manual = null;
  sendBpm();
}

export function initMetronomeWindow(): void {
  const panel = $<HTMLDialogElement>('metroPanel'), body = $('metroBody');
  const metronome = registerFloatingWindow({
    panel,
    opener: $('popmetro'),
    onOpen() {
      frame = document.createElement('iframe');
      frame.title = 'Metronome controls';
      const bpm = currentBpm();
      frame.src = './metronome.html?embedded' + (bpm === null ? '' : '&bpm=' + bpm);
      // A song picked while the page is still loading would miss the message, so resend once it has loaded.
      frame.addEventListener('load', sendBpm, {once: true});
      body.append(frame);
    },
    onClose() { body.replaceChildren(); frame = null; },
  });
  // Escape inside the iframe asks the parent to close the window; a tempo typed or
  // dragged there is remembered for the current song.
  window.addEventListener('message', e => {
    if (!panel.open || !frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    if (e.data === 'close-metronome') metronome.close();
    else if (e.data?.type === 'metronome-bpm-changed' && Number.isFinite(e.data.bpm)) manual = {song: studio.song, bpm: e.data.bpm};
  });
}
