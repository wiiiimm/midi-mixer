import { $, formatTime } from '../lib/dom';
import { elementConsumesSpace, shortcutsBlocked } from '../lib/shortcuts';
import type { Song } from '../lib/types';
import { playBrandScale } from '../ui/brand';
import { setCurrentKey } from './key';
import { loopRange, onPlaybackFinished, pausePlayback, restart, setClickTrack, startPlayback } from './playback';
import { followFallbackPage, initScore, revealPositionAfterJump, showPositionPage, updateCursor } from './score';
import { barAt, studio } from './state';

// Transport: play/pause, position, tempo and speed, loop A–B, start cue,
// click track and keyboard shortcuts.

const PLAY = '▶　Play', PAUSE = 'Ⅱ　Pause';
const speeds = [.25, .5, .65, .75, .85, .9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const input = (id: string) => $<HTMLInputElement>(id);
const rateSelect = () => $<HTMLSelectElement>('rate');

/** The written tempo (BPM) at the current position. */
function sourceBpm(song: Song): number {
  const changes = song.tempos;
  let low = 0, high = changes.length;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (changes[mid].sec <= studio.pos) low = mid; else high = mid;
  }
  return 60000000 / changes[low].us;
}

function updateTempoDisplay(song: Song) {
  const original = sourceBpm(song);
  for (const option of rateSelect().options) {
    const bpm = Math.round(original * Number(option.value) * 100) / 100;
    const disabled = bpm < 30 || bpm > 190;
    if (option.disabled !== disabled) option.disabled = disabled;
  }
  if (document.activeElement !== input('tempoBpm')) input('tempoBpm').value = String(Number((original * studio.rate).toFixed(2)));
}

/** Refreshes the readouts, position slider and score cursor. */
export function display(): void {
  const song = studio.song;
  if (!song) return;
  updateTempoDisplay(song);
  const q = song.beat(studio.pos), i = barAt(song, q), bar = song.bars[i];
  $('beatpos').textContent = (i + 1) + ' : ' + Math.min(bar.n, 1 + Math.floor((q - bar.q) * bar.d / 4));
  $('bars').textContent = 'Bar ' + (i + 1);
  setCurrentKey(song.keyAt(q));
  input('seek').value = String(studio.pos);
  $('clock').textContent = formatTime(studio.pos) + ' / ' + formatTime(song.duration);
  updateCursor();
}

/** Jumps to a position (seconds), keeping playback going if it was playing. */
export function seek(seconds: number): void {
  const song = studio.song;
  if (!song) return;
  studio.pos = Math.min(song.duration, Math.max(0, seconds));
  if (studio.playing && studio.looping) {
    const [a, b] = loopRange(song);
    if (studio.pos < a || studio.pos >= b) studio.pos = a;
  }
  showPositionPage();
  if (studio.playing) restart();
  display();
  revealPositionAfterJump();
}

function updateCue() {
  const song = studio.song;
  if (!song) return;
  input('startBar').value = String(barAt(song, song.beat(studio.cue)) + 1);
  updateCursor();
}

/** Sets loop bars a–b (1-based), pins the start cue at `seconds` and jumps there. */
export function cueRange(seconds: number, a: number, b: number): void {
  input('a').value = String(a);
  input('b').value = String(b);
  studio.cue = seconds;
  updateCue();
  seek(seconds);
}

function setRate(value: number) {
  studio.rate = value;
  if (studio.playing) restart();
}

function loopChanged() {
  const song = studio.song;
  if (!song) return;
  if (studio.looping) {
    const [a, b] = loopRange(song);
    if (studio.pos < a || studio.pos >= b) seek(a);
    else if (studio.playing) restart();
  } else if (studio.playing) restart();
}

/** Resets the transport controls for a newly selected song. */
export function resetTransport(song: Song): void {
  const lastBar = String(song.bars.length - 1);
  input('startBar').max = lastBar;
  input('startBar').value = '1';
  studio.looping = false;
  $('loop').setAttribute('aria-pressed', 'false');
  $('play').textContent = PLAY;
  input('a').max = input('b').max = lastBar;
  input('a').value = '1';
  input('b').value = String(Math.min(4, song.bars.length - 1));
  input('seek').max = String(song.duration);
  $('title').textContent = song.title;
  $('meta').textContent = song.tracks.length + ' tracks　·　' + (song.bars.length - 1) + ' bars';
}

export function initTransport(): void {
  initScore((seconds, setCue) => {
    if (setCue) studio.cue = seconds;
    seek(seconds);
    updateCue();
  });
  onPlaybackFinished(() => {
    $('play').textContent = PLAY;
    seek(studio.cue);
  });

  $('play').addEventListener('click', async () => {
    if (studio.playing) {
      pausePlayback();
      $('play').textContent = PLAY;
      return;
    }
    try {
      if (!await startPlayback()) return;
      $('play').textContent = PAUSE;
      playBrandScale();
    } catch (error) {
      $('status').textContent = error instanceof Error ? error.message : String(error);
    }
  });
  $('home').addEventListener('click', () => seek(studio.cue));
  input('seek').addEventListener('input', () => seek(Number(input('seek').value)));

  rateSelect().innerHTML = speeds.map(v => '<option value="' + v + '" ' + (v === 1 ? 'selected' : '') + '>' + v + '×</option>').join('');
  rateSelect().addEventListener('change', () => setRate(Number(rateSelect().value)));
  // Typing a BPM picks (or adds) the matching speed.
  input('tempoBpm').addEventListener('change', () => {
    const song = studio.song, field = input('tempoBpm');
    if (!song) return;
    if (!Number.isFinite(field.valueAsNumber)) {
      field.value = String(Number((sourceBpm(song) * studio.rate).toFixed(2)));
      return;
    }
    const target = Math.max(30, Math.min(190, field.valueAsNumber));
    field.value = String(target);
    const ratio = target / sourceBpm(song), select = rateSelect();
    select.querySelector('[data-custom]')?.remove();
    let option = [...select.options].find(o => Math.abs(Number(o.value) - ratio) < 0.00001);
    if (!option) {
      option = new Option(Number(ratio.toFixed(3)) + '×', String(ratio));
      option.dataset.custom = 'true';
      select.add(option);
    }
    select.value = option.value;
    setRate(Number(option.value));
  });
  // Pressing Enter commits numeric fields and returns focus so shortcuts resume.
  for (const id of ['tempoBpm', 'a', 'b', 'startBar'] as const) {
    input(id).addEventListener('keydown', e => { if (e.key === 'Enter') input(id).blur(); });
  }

  $('loop').addEventListener('click', () => {
    studio.looping = !studio.looping;
    $('loop').setAttribute('aria-pressed', String(studio.looping));
    loopChanged();
  });
  for (const id of ['a', 'b'] as const) {
    input(id).addEventListener('change', () => {
      const song = studio.song, field = input(id);
      if (!song) return;
      field.value = String(Math.max(1, Math.min(song.bars.length - 1, Math.round(Number(field.value)) || 1)));
      if (Number(input('a').value) > Number(input('b').value)) input(id === 'a' ? 'b' : 'a').value = field.value;
      loopChanged();
    });
  }

  $('cueHere').addEventListener('click', () => {
    if (!studio.song) return;
    studio.cue = studio.pos;
    updateCue();
    $('status').textContent = 'Start cue pinned at bar ' + input('startBar').value + '.';
  });
  input('startBar').addEventListener('change', () => {
    const song = studio.song;
    if (!song) return;
    const index = Math.min(song.bars.length - 2, Math.max(0, Math.round(Number(input('startBar').value) || 1) - 1));
    studio.cue = song.seconds(song.bars[index].q);
    seek(studio.cue);
    updateCue();
  });

  let clickOn = false;
  $('click').addEventListener('click', () => {
    clickOn = !clickOn;
    $('click').setAttribute('aria-pressed', String(clickOn));
    setClickTrack(clickOn);
  });
  $('keytoggle').addEventListener('click', () => {
    const piano = document.querySelector<HTMLElement>('.piano')!;
    piano.hidden = !piano.hidden;
    $('keytoggle').setAttribute('aria-pressed', String(!piano.hidden));
  });

  // Space: play/pause · R: back to cue · Shift+L: loop.
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey ||
        event.metaKey || event.altKey || shortcutsBlocked(event)) return;
    const action = event.code === 'Space' && !event.shiftKey && !elementConsumesSpace(event) ? 'play' :
      event.code === 'KeyR' && !event.shiftKey ? 'home' :
      event.code === 'KeyL' && event.shiftKey ? 'loop' : '';
    if (!action) return;
    event.preventDefault();
    if (event.repeat) return;
    $(action).click();
  });

  setInterval(() => {
    followFallbackPage();
    display();
  }, 70);
}

