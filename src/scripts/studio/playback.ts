import { makeClick } from '../audio/click';
import { currentAudio, enableAudio, scheduleSynthNote } from '../audio/engine';
import { isInstrumentReady, loadInstrument, playSample, whenInstrumentsReady } from '../audio/sampler';
import { $ } from '../lib/dom';
import type { Note, PlaybackVoice, Song } from '../lib/types';
import { whileBusy } from '../ui/loading';
import { barAt, studio } from './state';

// Look-ahead scheduler: every 32 ms, notes starting in the next ~130 ms are queued
// on the audio clock. One gain bus per track carries volume, mute and solo.

let buses: GainNode[] = [];
let voices: PlaybackVoice[] = [];
/** Audio-clock time at which song position 0 would have started. */
let origin = 0;
/** Song time (s) up to which notes have been scheduled. */
let scheduled = 0;
let clickTrack = false;
const ticks = new Set<OscillatorNode>();
let finished: () => void = () => {};

/** Called when playback reaches the end of the song (not when looping). */
export const onPlaybackFinished = (callback: () => void): void => { finished = callback; };

/** Notes currently scheduled or sounding (the piano lights these up). */
export const playbackVoices = (): readonly PlaybackVoice[] => voices;

/** Whether a track is heard, taking mute and solo into account. */
export const playable = (track: number): boolean =>
  !studio.mix[track].mute && (!studio.mix.some(m => m.solo) || studio.mix[track].solo);

export function applyGains(): void {
  const audio = currentAudio();
  if (!audio) return;
  buses.forEach((bus, i) => bus.gain.setTargetAtTime(playable(i) ? studio.mix[i].vol / 100 : 0, audio.ctx.currentTime, .008));
}

/** The loop range in seconds, from the A and B bar inputs. */
export function loopRange(song: Song): [number, number] {
  const bars = song.bars;
  const clampBar = (value: string, fallback: number) => Math.max(1, Math.min(bars.length - 1, Math.round(Number(value)) || fallback));
  const a = clampBar($<HTMLInputElement>('a').value, 1);
  const b = Math.max(a, clampBar($<HTMLInputElement>('b').value, a));
  return [song.seconds(bars[a - 1].q), song.seconds(bars[b].q)];
}

function clearClicks() {
  for (const tick of ticks) tick.stop();
  ticks.clear();
}

export function stopNotes(): void {
  clearClicks();
  for (const voice of voices) {
    try { voice.stop(); } catch { /* already stopped */ }
  }
  voices = [];
}

/** Disconnects the track buses (when switching songs). */
export function resetBuses(): void {
  stopNotes();
  buses.forEach(bus => bus.disconnect());
  buses = [];
}

export function setClickTrack(on: boolean): void {
  clickTrack = on;
  if (!on) clearClicks();
}

function forget(voice: PlaybackVoice) {
  const index = voices.indexOf(voice);
  if (index >= 0) voices.splice(index, 1);
}

function sound(track: number, note: Note, when: number, duration: number) {
  const audio = currentAudio();
  if (duration <= 0 || !audio) return;
  const program = studio.mix[track].inst;
  const base = {track, pitch: note.p, start: when, end: when + duration};
  const sampled = playSample(audio.ctx, program, note.p, .25 + .75 * note.v, when, duration, buses[track]);
  if (sampled) {
    const voice: PlaybackVoice = {...base, stop: sampled.stop};
    voices.push(voice);
    sampled.onended = () => forget(voice);
    return;
  }
  if (program < 128) loadInstrument(program); // synth now, samples next time
  const voice: PlaybackVoice = {...base, stop: () => synth.stop()};
  const synth = scheduleSynthNote(audio.ctx, program, note.p, note.v, when, duration, buses[track], () => forget(voice));
  voices.push(voice);
}

function scheduleClicks(song: Song, from: number, to: number) {
  const audio = currentAudio();
  if (!clickTrack || !audio) return;
  for (let i = barAt(song, song.beat(from)); i < song.bars.length - 1; i++) {
    const bar = song.bars[i];
    if (song.seconds(bar.q) >= to) break;
    for (let beat = 0; beat < bar.n; beat++) {
      const q = bar.q + beat * 4 / bar.d, sec = song.seconds(q);
      if (q >= song.bars[i + 1].q || sec >= to) break;
      if (sec < from || origin + sec / studio.rate < audio.ctx.currentTime - .035) continue;
      const tick = makeClick(audio.ctx, audio.master, Math.max(audio.ctx.currentTime, origin + sec / studio.rate), beat === 0);
      ticks.add(tick);
      tick.addEventListener('ended', () => ticks.delete(tick), {once: true});
    }
  }
}

const playbackEnd = (song: Song) => studio.looping ? loopRange(song)[1] : song.duration;

/** Re-queues everything from the current position (after a seek or a change in speed/instrument). */
export function restart(): void {
  const song = studio.song, audio = currentAudio();
  if (!song || !audio) return;
  stopNotes();
  const {pos, rate} = studio;
  origin = audio.ctx.currentTime - pos / rate;
  scheduled = pos;
  const end = playbackEnd(song);
  // Notes already sounding at the restart point are played from part-way through.
  song.tracks.forEach((track, i) => {
    for (const note of track.notes) {
      if (note.s >= pos) break;
      if (note.e > pos) sound(i, note, audio.ctx.currentTime, (Math.min(note.e, end) - pos) / rate);
    }
  });
  schedule();
}

function schedule() {
  const song = studio.song, audio = currentAudio();
  if (!studio.playing || !song || !audio) return;
  const end = playbackEnd(song), rate = studio.rate;
  studio.pos = Math.min(end, Math.max(0, (audio.ctx.currentTime - origin) * rate));
  if (studio.pos >= end - .00001) {
    if (studio.looping) {
      studio.pos = loopRange(song)[0];
      restart();
    } else {
      studio.playing = false;
      stopNotes();
      finished();
    }
    return;
  }
  const horizon = Math.min(end, studio.pos + .13 * rate);
  song.tracks.forEach((track, i) => {
    const notes = track.notes;
    let low = 0, high = notes.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (notes[mid].s < scheduled) low = mid + 1; else high = mid;
    }
    for (let k = low; k < notes.length && notes[k].s < horizon; k++) {
      const note = notes[k], start = Math.max(note.s, studio.pos);
      sound(i, note, origin + start / rate, (Math.min(note.e, end) - start) / rate);
    }
  });
  scheduleClicks(song, scheduled, horizon);
  scheduled = horizon;
}

/** Waits (with the busy overlay) for this song's instrument samples, if any are missing. */
async function ensureSounds() {
  const programs = studio.mix.map(m => m.inst).filter(p => p < 128 && !isInstrumentReady(p));
  if (programs.length) await whileBusy('Loading instrument sounds…', () => whenInstrumentsReady(programs, 12000));
}

/** Starts playback from the current position (or the cue, at the end of the song). */
export async function startPlayback(): Promise<void> {
  const song = studio.song;
  if (!song) return;
  const audio = await enableAudio();
  await ensureSounds();
  if (!buses.length) {
    buses = studio.mix.map(() => {
      const bus = audio.ctx.createGain();
      bus.connect(audio.master);
      return bus;
    });
    applyGains();
  }
  if (studio.pos >= song.duration) studio.pos = studio.cue;
  if (studio.looping) {
    const [a, b] = loopRange(song);
    if (studio.pos < a || studio.pos >= b) studio.pos = a;
  }
  studio.playing = true;
  restart();
}

export function pausePlayback(): void {
  studio.playing = false;
  stopNotes();
}

export function initPlayback(): void {
  setInterval(schedule, 32);
}
