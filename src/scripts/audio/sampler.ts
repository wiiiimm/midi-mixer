// General MIDI sample playback. Samples come from the FluidR3 GM soundfont in the
// MIDI.js layout (one MP3 per note). Every third semitone is fetched and the nearest
// one is pitch-shifted, so an instrument is ~30 small files. Until an instrument has
// loaded (or if it can't), callers fall back to the built-in synth.
import type { StoppableVoice } from '../lib/types';

const base = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';
const ids: readonly string[] = ['acoustic_grand_piano','bright_acoustic_piano','electric_grand_piano','honkytonk_piano','electric_piano_1','electric_piano_2','harpsichord','clavinet',
    'celesta','glockenspiel','music_box','vibraphone','marimba','xylophone','tubular_bells','dulcimer',
    'drawbar_organ','percussive_organ','rock_organ','church_organ','reed_organ','accordion','harmonica','tango_accordion',
    'acoustic_guitar_nylon','acoustic_guitar_steel','electric_guitar_jazz','electric_guitar_clean','electric_guitar_muted','overdriven_guitar','distortion_guitar','guitar_harmonics',
    'acoustic_bass','electric_bass_finger','electric_bass_pick','fretless_bass','slap_bass_1','slap_bass_2','synth_bass_1','synth_bass_2',
    'violin','viola','cello','contrabass','tremolo_strings','pizzicato_strings','orchestral_harp','timpani',
    'string_ensemble_1','string_ensemble_2','synth_strings_1','synth_strings_2','choir_aahs','voice_oohs','synth_choir','orchestra_hit',
    'trumpet','trombone','tuba','muted_trumpet','french_horn','brass_section','synth_brass_1','synth_brass_2',
    'soprano_sax','alto_sax','tenor_sax','baritone_sax','oboe','english_horn','bassoon','clarinet',
    'piccolo','flute','recorder','pan_flute','blown_bottle','shakuhachi','whistle','ocarina',
    'lead_1_square','lead_2_sawtooth','lead_3_calliope','lead_4_chiff','lead_5_charang','lead_6_voice','lead_7_fifths','lead_8_bass__lead',
    'pad_1_new_age','pad_2_warm','pad_3_polysynth','pad_4_choir','pad_5_bowed','pad_6_metallic','pad_7_halo','pad_8_sweep',
    'fx_1_rain','fx_2_soundtrack','fx_3_crystal','fx_4_atmosphere','fx_5_brightness','fx_6_goblins','fx_7_echoes','fx_8_scifi',
    'sitar','banjo','shamisen','koto','kalimba','bagpipe','fiddle','shanai',
    'tinkle_bell','agogo','steel_drums','woodblock','taiko_drum','melodic_tom','synth_drum','reverse_cymbal',
    'guitar_fret_noise','breath_noise','seashore','bird_tweet','telephone_ring','helicopter','applause','gunshot'];
export const gmNames: readonly string[] = ['Acoustic grand piano','Bright acoustic piano','Electric grand piano','Honky-tonk piano','Electric piano 1','Electric piano 2','Harpsichord','Clavinet',
    'Celesta','Glockenspiel','Music box','Vibraphone','Marimba','Xylophone','Tubular bells','Dulcimer',
    'Drawbar organ','Percussive organ','Rock organ','Church organ','Reed organ','Accordion','Harmonica','Tango accordion',
    'Acoustic guitar (nylon)','Acoustic guitar (steel)','Electric guitar (jazz)','Electric guitar (clean)','Electric guitar (muted)','Overdriven guitar','Distortion guitar','Guitar harmonics',
    'Acoustic bass','Electric bass (finger)','Electric bass (pick)','Fretless bass','Slap bass 1','Slap bass 2','Synth bass 1','Synth bass 2',
    'Violin','Viola','Cello','Contrabass','Tremolo strings','Pizzicato strings','Orchestral harp','Timpani',
    'String ensemble 1','String ensemble 2','Synth strings 1','Synth strings 2','Choir aahs','Voice oohs','Synth choir','Orchestra hit',
    'Trumpet','Trombone','Tuba','Muted trumpet','French horn','Brass section','Synth brass 1','Synth brass 2',
    'Soprano sax','Alto sax','Tenor sax','Baritone sax','Oboe','English horn','Bassoon','Clarinet',
    'Piccolo','Flute','Recorder','Pan flute','Blown bottle','Shakuhachi','Whistle','Ocarina',
    'Lead 1 (square)','Lead 2 (sawtooth)','Lead 3 (calliope)','Lead 4 (chiff)','Lead 5 (charang)','Lead 6 (voice)','Lead 7 (fifths)','Lead 8 (bass + lead)',
    'Pad 1 (new age)','Pad 2 (warm)','Pad 3 (polysynth)','Pad 4 (choir)','Pad 5 (bowed)','Pad 6 (metallic)','Pad 7 (halo)','Pad 8 (sweep)',
    'FX 1 (rain)','FX 2 (soundtrack)','FX 3 (crystal)','FX 4 (atmosphere)','FX 5 (brightness)','FX 6 (goblins)','FX 7 (echoes)','FX 8 (sci-fi)',
    'Sitar','Banjo','Shamisen','Koto','Kalimba','Bagpipe','Fiddle','Shanai',
    'Tinkle bell','Agogo','Steel drums','Woodblock','Taiko drum','Melodic tom','Synth drum','Reverse cymbal',
    'Guitar fret noise','Breath noise','Seashore','Bird tweet','Telephone ring','Helicopter','Applause','Gunshot'];
export const gmFamilies: readonly string[] = ['Piano','Chromatic percussion','Organ','Guitar','Bass','Strings','Ensemble','Brass','Reed','Pipe','Synth lead','Synth pad','Synth effects','Ethnic','Percussive','Sound effects'];
/** Families whose notes are held (organ, strings, ensemble, brass, reed, pipe, synth lead/pad). */
const sustaining = new Set([2, 5, 6, 7, 8, 9, 10, 11]);
const flats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const sampleNotes: number[] = [];
for (let pitch = 21; pitch <= 108; pitch += 3) sampleNotes.push(pitch);
const fileFor = (program: number, pitch: number) =>
  base + ids[program] + '-mp3/' + flats[pitch % 12] + (Math.floor(pitch / 12) - 1) + '.mp3';

interface Bank { buffers: Map<number, AudioBuffer>; loaded: boolean; ready: Promise<boolean> }
export interface SampledVoice extends StoppableVoice { onended: (() => void) | null }

let decoder: OfflineAudioContext | undefined;
const banks = new Map<number, Bank>();
const listeners = new Set<(program: number, ok: boolean) => void>();
/** Failed instruments: when the next automatic attempt may start, and the backoff used. */
const failures = new Map<number, {retryAt: number; backoff: number}>();
const FIRST_BACKOFF = 15000, MAX_BACKOFF = 5 * 60 * 1000;

/**
 * Downloads an instrument's samples. Resolves to whether it is playable. After a
 * failure, automatic calls back off; `force` (e.g. back online) retries at once.
 */
export function loadInstrument(program: number, force = false): Promise<boolean> {
  if (!(program >= 0 && program < 128)) return Promise.resolve(false);
  const existing = banks.get(program);
  if (existing) return existing.ready;
  const failure = failures.get(program);
  if (failure && !force && Date.now() < failure.retryAt) return Promise.resolve(false);
  decoder ??= new OfflineAudioContext(1, 1, 44100); // AudioBuffers work in any context
  const decode = decoder;
  const bank = {buffers: new Map(), loaded: false} as unknown as Bank;
  bank.ready = Promise.allSettled(sampleNotes.map(async pitch => {
    const response = await fetch(fileFor(program, pitch));
    if (!response.ok) throw new Error('HTTP ' + response.status);
    bank.buffers.set(pitch, await decode.decodeAudioData(await response.arrayBuffer()));
  })).then(() => {
    bank.loaded = bank.buffers.size > sampleNotes.length / 2;
    if (bank.loaded) failures.delete(program);
    else {
      banks.delete(program); // allow a retry later (after the backoff, or when back online)
      const backoff = failure ? Math.min(failure.backoff * 2, MAX_BACKOFF) : FIRST_BACKOFF;
      failures.set(program, {retryAt: Date.now() + backoff, backoff});
    }
    listeners.forEach(listener => listener(program, bank.loaded));
    return bank.loaded;
  });
  banks.set(program, bank);
  return bank.ready;
}

export const isInstrumentReady = (program: number): boolean => !!banks.get(program)?.loaded;

/** Resolves when every program has loaded or failed, or after `timeout` ms. */
export function whenInstrumentsReady(programs: number[], timeout = 10000): Promise<unknown> {
  const pending = [...new Set(programs)].filter(p => p < 128 && !isInstrumentReady(p)).map(p => loadInstrument(p));
  if (!pending.length) return Promise.resolve();
  return Promise.race([Promise.allSettled(pending), new Promise(resolve => setTimeout(resolve, timeout))]);
}

/** Called whenever an instrument finishes loading (ok) or fails. */
export const onInstrumentLoad = (listener: (program: number, ok: boolean) => void): void => { listeners.add(listener); };

/** Sample URLs for an instrument (used to queue offline downloads). */
export const sampleUrls = (program: number): string[] => sampleNotes.map(pitch => fileFor(program, pitch));

/** Starts a sampled note; duration null holds until stop(). Returns null if not loaded yet. */
export function playSample(ctx: BaseAudioContext, program: number, pitch: number, velocity: number,
  when: number, duration: number | null, destination: AudioNode): SampledVoice | null {
  const bank = banks.get(program);
  if (!bank?.loaded) return null;
  let nearest = sampleNotes[0], best = Infinity;
  for (const p of bank.buffers.keys()) if (Math.abs(p - pitch) < best) { best = Math.abs(p - pitch); nearest = p; }
  const buffer = bank.buffers.get(nearest)!;
  const source = ctx.createBufferSource(), amp = ctx.createGain();
  source.buffer = buffer;
  source.playbackRate.value = 2 ** ((pitch - nearest) / 12);
  const long = duration == null || duration > buffer.duration * .8;
  if (long && sustaining.has(Math.floor(program / 8))) {
    source.loop = true;
    source.loopStart = buffer.duration * .35;
    source.loopEnd = buffer.duration * .75;
  }
  const level = 3.5 * velocity; // soundfont samples are recorded quietly; match the synth level
  const attack = .006;
  amp.gain.setValueAtTime(0, when);
  amp.gain.linearRampToValueAtTime(level, when + attack);
  source.connect(amp).connect(destination);
  source.start(when);
  let releaseAt = Infinity;
  const voice: SampledVoice = {
    stop(at = ctx.currentTime) {
      at = Math.max(at, ctx.currentTime);
      if (at >= releaseAt) return; // an earlier release is already scheduled
      // Hold the envelope's value at the release time: the live value for an immediate
      // stop (it may already be releasing), otherwise where the attack will be by then.
      const value = at <= ctx.currentTime ? amp.gain.value
        : at <= when ? 0 : level * Math.min(1, (at - when) / attack);
      amp.gain.cancelScheduledValues(at);
      amp.gain.setValueAtTime(value, at);
      amp.gain.setTargetAtTime(0, at, .06);
      releaseAt = at;
      try { source.stop(at + .35); } catch { /* already stopped */ }
    },
    onended: null,
  };
  if (duration != null) voice.stop(when + duration);
  source.onended = () => { source.disconnect(); amp.disconnect(); voice.onended?.(); };
  return voice;
}
