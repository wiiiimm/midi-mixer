'use strict';
// General MIDI sample playback. Samples come from the FluidR3 GM soundfont in the
// MIDI.js layout (one MP3 per note). We fetch every third semitone and pitch-shift
// the nearest one, so an instrument is ~30 small files. Until an instrument has
// loaded (or if it can't), callers fall back to the built-in synth.
const gmSampler = (() => {
  const base = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';
  const ids = ['acoustic_grand_piano','bright_acoustic_piano','electric_grand_piano','honkytonk_piano','electric_piano_1','electric_piano_2','harpsichord','clavinet',
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
  const names = ['Acoustic grand piano','Bright acoustic piano','Electric grand piano','Honky-tonk piano','Electric piano 1','Electric piano 2','Harpsichord','Clavinet',
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
  const families = ['Piano','Chromatic percussion','Organ','Guitar','Bass','Strings','Ensemble','Brass','Reed','Pipe','Synth lead','Synth pad','Synth effects','Ethnic','Percussive','Sound effects'];
  // Families whose notes are held: loop the sample body if a note outlasts it.
  const sustaining = new Set([2, 5, 6, 7, 8, 9, 10, 11]);
  const flats = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const sampleNotes = [];
  for (let p = 21; p <= 108; p += 3) sampleNotes.push(p);
  const fileFor = (program, pitch) => base + ids[program] + '-mp3/' + flats[pitch % 12] + (Math.floor(pitch / 12) - 1) + '.mp3';

  let decoder;
  const banks = new Map(); // program -> {buffers: Map<pitch, AudioBuffer>, loaded, ready}
  const listeners = new Set();

  function load(program) {
    if (!(program >= 0 && program < 128)) return Promise.resolve(false);
    if (banks.has(program)) return banks.get(program).ready;
    decoder ??= new OfflineAudioContext(1, 1, 44100); // AudioBuffers work in any context
    const bank = {buffers: new Map(), loaded: false};
    bank.ready = Promise.allSettled(sampleNotes.map(async pitch => {
      const response = await fetch(fileFor(program, pitch));
      if (!response.ok) throw new Error('HTTP ' + response.status);
      bank.buffers.set(pitch, await decoder.decodeAudioData(await response.arrayBuffer()));
    })).then(() => {
      bank.loaded = bank.buffers.size > sampleNotes.length / 2;
      if (!bank.loaded) banks.delete(program); // allow a retry later (e.g. back online)
      listeners.forEach(fn => fn(program, bank.loaded));
      return bank.loaded;
    });
    banks.set(program, bank);
    return bank.ready;
  }

  const ready = program => !!banks.get(program)?.loaded;

  // Resolves when every program has loaded or failed, or after `timeout` ms.
  function whenReady(programs, timeout = 10000) {
    const pending = [...new Set(programs)].filter(p => p < 128 && !ready(p)).map(load);
    if (!pending.length) return Promise.resolve();
    return Promise.race([Promise.allSettled(pending), new Promise(r => setTimeout(r, timeout))]);
  }

  // Starts a note; duration null = hold until stop(). Returns {stop, onended} or null if not loaded.
  function play(ctx, program, pitch, velocity, when, duration, destination) {
    const bank = banks.get(program);
    if (!bank?.loaded) return null;
    let nearest, best = Infinity;
    for (const p of bank.buffers.keys()) if (Math.abs(p - pitch) < best) { best = Math.abs(p - pitch); nearest = p; }
    const buffer = bank.buffers.get(nearest);
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
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(level, when + .006);
    source.connect(amp).connect(destination);
    source.start(when);
    const voice = {
      stop(at = ctx.currentTime) {
        at = Math.max(at, ctx.currentTime);
        amp.gain.cancelScheduledValues(at);
        amp.gain.setValueAtTime(amp.gain.value, at);
        amp.gain.setTargetAtTime(0, at, .06);
        try { source.stop(at + .35); } catch {}
      },
      onended: null,
    };
    if (duration != null) voice.stop(when + duration);
    source.onended = () => { source.disconnect(); amp.disconnect(); voice.onended?.(); };
    return voice;
  }

  const urlsFor = program => sampleNotes.map(pitch => fileFor(program, pitch));
  return {ids, names, families, load, ready, whenReady, play, urlsFor, onLoad: fn => listeners.add(fn), host: base};
})();

// Built-in synth preset for a GM program (used before samples load, offline, and for drums).
const synthPreset = program => program >= 128 ? 10 : program < 4 ? 0 : program < 16 ? 1 : program < 24 ? 2 :
  program < 32 ? 3 : program < 40 ? 4 : program < 52 ? 5 : program < 56 ? 6 : program < 64 ? 7 : program < 72 ? 8 : program < 80 ? 9 : 1;
