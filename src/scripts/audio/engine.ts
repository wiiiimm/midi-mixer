import type { StoppableVoice } from '../lib/types';
import { frequencyOf } from '../lib/notes';

export interface AudioOutput {
  ctx: AudioContext;
  /** Shared output bus (a gentle compressor) that every sound goes through. */
  master: AudioNode;
}

let output: AudioOutput | null = null;

/** The audio output, if it has been started by a user gesture. */
export const currentAudio = (): AudioOutput | null => output;

/** Creates (once) and resumes the audio context. Must follow a user gesture. */
export async function enableAudio(): Promise<AudioOutput> {
  if (!output) {
    const AudioCtor = window.AudioContext ?? (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
    const ctx = new AudioCtor();
    const master = ctx.createDynamicsCompressor();
    master.connect(ctx.destination);
    output = {ctx, master};
  }
  if (output.ctx.state !== 'running') await output.ctx.resume();
  return output;
}

// ── Built-in synth: used before samples load, offline, and for drums ──
// Presets: 0 piano, 1 electric piano, 2 organ, 3 guitar, 4 bass, 5 strings,
// 6 choir, 7 brass, 8 reed, 9 flute, 10 percussion.
const waves: OscillatorType[] = ['triangle', 'sine', 'sine', 'sawtooth', 'triangle', 'sawtooth', 'triangle', 'sawtooth', 'square', 'sine', 'triangle'];
const cutoffs = [3600, 1800, 1600, 1300, 600, 1450, 850, 2200, 1400, 3000, 2000];
const attacks = [.007, .01, .025, .003, .009, .075, .09, .035, .025, .035, .003];
const holdLevels = [.075, .06, .15, .045, .09, .12, .13, .12, .10, .14];
const decaying = new Set([0, 1, 3, 4, 10]);

/** Built-in synth preset for a General MIDI program (128 = drums). */
export const synthPreset = (program: number): number =>
  program >= 128 ? 10 : program < 4 ? 0 : program < 16 ? 1 : program < 24 ? 2 : program < 32 ? 3 :
  program < 40 ? 4 : program < 52 ? 5 : program < 56 ? 6 : program < 64 ? 7 : program < 72 ? 8 : program < 80 ? 9 : 1;

/** Schedules a synth note of known duration (playback). `onended` fires once it has finished. */
export function scheduleSynthNote(ctx: AudioContext, program: number, pitch: number, velocity: number,
  when: number, duration: number, destination: AudioNode, onended: () => void): StoppableVoice {
  const preset = synthPreset(program);
  const osc = ctx.createOscillator(), amp = ctx.createGain(), filter = ctx.createBiquadFilter();
  osc.type = waves[preset];
  osc.frequency.value = frequencyOf(pitch);
  filter.type = 'lowpass';
  filter.frequency.value = cutoffs[preset];
  if (preset === 10) osc.frequency.setTargetAtTime(50, when, .025);
  const attack = Math.min(duration / 3, attacks[preset]), peak = .17 * (.2 + .8 * velocity);
  const tail = decaying.has(preset) ? Math.exp(-duration * (preset === 10 ? 12 : 1.4)) : .86;
  amp.gain.setValueAtTime(.0001, when);
  amp.gain.exponentialRampToValueAtTime(peak, when + attack);
  amp.gain.exponentialRampToValueAtTime(Math.max(.00011, peak * tail), when + duration);
  amp.gain.exponentialRampToValueAtTime(.0001, when + duration + .035);
  osc.connect(filter).connect(amp).connect(destination);
  osc.start(when);
  osc.stop(when + duration + .04);
  osc.onended = () => { osc.disconnect(); filter.disconnect(); amp.disconnect(); onended(); };
  return {stop: (at = ctx.currentTime) => { try { osc.stop(at); } catch { /* already stopped */ } }};
}

/** Starts a held synth note (piano keys) that sounds until stopped. */
export function startSynthHold(ctx: AudioContext, program: number, pitch: number, destination: AudioNode): StoppableVoice {
  const preset = synthPreset(program), now = ctx.currentTime;
  const osc = ctx.createOscillator(), amp = ctx.createGain(), filter = ctx.createBiquadFilter();
  osc.type = waves[preset];
  osc.frequency.value = frequencyOf(pitch);
  filter.frequency.value = cutoffs[preset];
  const attack = preset === 0 ? .009 : attacks[preset];
  amp.gain.setValueAtTime(.0001, now);
  amp.gain.exponentialRampToValueAtTime(.21, now + attack);
  amp.gain.setTargetAtTime(holdLevels[preset], now + attack + .001, .45);
  if (preset === 0) osc.connect(amp);
  else osc.connect(filter).connect(amp);
  amp.connect(destination);
  osc.onended = () => { osc.disconnect(); filter.disconnect(); amp.disconnect(); };
  osc.start(now);
  return {
    stop() {
      const at = ctx.currentTime;
      amp.gain.cancelScheduledValues(at);
      amp.gain.setTargetAtTime(.0001, at, .015);
      osc.stop(at + .09);
    },
  };
}
