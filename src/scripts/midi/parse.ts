import { gmNames } from '../audio/sampler';
import type { Bar, KeySignature, Marker, Meter, Note, Song, Tempo, Track } from '../lib/types';

/** Instrument names indexed by program: 128 General MIDI sounds plus the drum kit (128). */
export const instruments: readonly string[] = [...gmNames, 'Drum kit'];
export const DRUM_KIT = 128;

/** Whether a track is engraved on a bass clef (its median pitch is below B♭3). */
export function usesBassClef(track: Track): boolean {
  const pitches = track.notes.map(note => note.p).sort((a, b) => a - b);
  return pitches[Math.floor(pitches.length / 2)] < 58;
}

const instrumentFor = (program: number, channel: number): number => channel === 9 ? DRUM_KIT : program & 127;

type RawNote = Omit<Note, 's' | 'e'> & Partial<Pick<Note, 's' | 'e'>>;
type RawTrack = Omit<Track, 'notes' | 'name'> & {notes: RawNote[]; name?: string};
type RawTempo = Omit<Tempo, 'sec'> & {sec?: number};

/** Binary search: the last entry whose `key` is <= x. */
function lastAtOrBefore<T>(list: T[], x: number, key: keyof T): T {
  let low = 0, high = list.length;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if ((list[mid][key] as number) <= x) low = mid; else high = mid;
  }
  return list[low];
}

function prepare(title: string, rawTracks: RawTrack[], rawTempos: RawTempo[] = [{q: 0, us: 500000}],
  meters: Meter[] = [{q: 0, n: 4, d: 4}], keys: KeySignature[] = [{q: 0, sf: 0, tonic: 0}],
  markers: Marker[] = [], ppq = 0): Song {
  keys.sort((a, b) => a.q - b.q);
  rawTempos.sort((a, b) => a.q - b.q);
  meters.sort((a, b) => a.q - b.q);
  let sec = 0;
  rawTempos.forEach((tempo, i) => {
    if (i) sec += (tempo.q - rawTempos[i - 1].q) * rawTempos[i - 1].us / 1e6;
    tempo.sec = sec;
  });
  const tempos = rawTempos as Tempo[];
  const seconds = (q: number) => { const t = lastAtOrBefore(tempos, q, 'q'); return t.sec + (q - t.q) * t.us / 1e6; };
  const beat = (s: number) => { const t = lastAtOrBefore(tempos, s, 'sec'); return t.q + (s - t.sec) * 1e6 / t.us; };
  let end = 0;
  for (const track of rawTracks) {
    track.notes.sort((a, b) => a.q - b.q);
    for (const note of track.notes) {
      note.s = seconds(note.q);
      note.e = seconds(note.q + note.len);
      end = Math.max(end, note.q + note.len);
    }
  }
  if (!end) throw Error('This file contains no playable notes.');
  const bars: Bar[] = [];
  for (let q = 0; q < end - 1e-7;) {
    if (bars.length >= 50000) throw Error('This score exceeds 50,000 bars.');
    const meter = lastAtOrBefore(meters, q, 'q'), next = meters.find(m => m.q > q);
    bars.push({q, n: meter.n, d: meter.d});
    q = Math.min(q + meter.n * 4 / meter.d, next?.q ?? Infinity);
  }
  bars.push({q: end, n: 0, d: 0}); // end marker
  return {
    title, tracks: rawTracks as Track[], tempos, bars, markers, ppq, end, meters, keys,
    duration: seconds(end), seconds, beat, keyAt: q => lastAtOrBefore(keys, q, 'q'),
  };
}

/**
 * Builds a new song from an existing one with different notes (after an edit). Tempo,
 * time and key signatures and markers are kept; timings, bars and the length are recomputed.
 */
export function rebuildSong(song: Song, tracks: Track[]): Song {
  const tempos = song.tempos.map(({q, us}) => ({q, us}));
  const rebuilt = prepare(song.title, tracks, tempos, song.meters.map(m => ({...m})),
    song.keys.map(k => ({...k})), song.markers, song.ppq);
  rebuilt.id = song.id;
  return rebuilt;
}

/** Parses a type 0/1 Standard MIDI File with beat-based timing. */
export function parseMidi(bytes: ArrayBuffer, title: string): Song {
  const data = new DataView(bytes);
  let p = 0, limit = data.byteLength;
  function read(n: number): number {
    if (p + n > limit) throw Error('Incomplete MIDI data.');
    let x = 0;
    while (n--) x = x * 256 + data.getUint8(p++);
    return x;
  }
  function variableLength(): number {
    let x = 0;
    for (let i = 0; i < 4; i++) {
      const b = read(1);
      x = x * 128 + (b & 127);
      if (b < 128) return x;
    }
    throw Error('Invalid MIDI delta.');
  }
  if (read(4) !== 0x4d546864) throw Error('Expected a standard MIDI file.');
  const header = read(4), format = read(2), count = read(2), ppq = read(2);
  if (header < 6 || format > 1 || !ppq || ppq >= 32768) throw Error('Use a type 0 or 1 MIDI file with beat-based timing.');
  p = 8 + header;
  const tracks: RawTrack[] = [], tempos: RawTempo[] = [{q: 0, us: 500000}], meters: Meter[] = [{q: 0, n: 4, d: 4}];
  const keys: KeySignature[] = [{q: 0, sf: 0, tonic: 0}], markers: Marker[] = [];
  for (let i = 0; i < count; i++) {
    limit = data.byteLength;
    if (read(4) !== 0x4d54726b) throw Error('Invalid MIDI track.');
    const size = read(4);
    limit = p + size;
    if (limit > data.byteLength) throw Error('Incomplete track.');
    let tick = 0, last = 0, name = '';
    const lyrics = new Map<number, string>(), channels = new Map<number, RawTrack>();
    const active = new Map<number, RawNote[]>(), programs = new Array<number>(16).fill(0);
    while (p < limit) {
      tick += variableLength();
      let status = read(1);
      if (status < 128) {
        p--;
        status = last;
        if (!status) throw Error('Invalid running status.');
      }
      if (status === 255) {
        const type = read(1), n = variableLength(), stop = p + n;
        if (stop > limit) throw Error('Incomplete MIDI event.');
        if (type === 3 || type === 5 || type === 6 || type === 7) {
          const text = new TextDecoder().decode(new Uint8Array(bytes, p, n)).replace(/\0/g, '').trim();
          if (type === 3) name = text;
          if (type === 5 && text) lyrics.set(tick / ppq, text);
          if ((type === 6 || type === 7) && text) markers.push({q: tick / ppq, text});
        }
        if (type === 81 && n === 3) {
          const us = read(3);
          if (us) tempos.push({q: tick / ppq, us});
        }
        if (type === 88 && n >= 2) {
          const numerator = read(1), exponent = read(1);
          if (numerator && exponent < 8) meters.push({q: tick / ppq, n: numerator, d: 2 ** exponent});
        }
        if (type === 89 && n === 2) {
          const sf = (read(1) << 24) >> 24, minor = read(1);
          if (sf >= -7 && sf <= 7 && minor <= 1) keys.push({q: tick / ppq, sf, tonic: (84 + 7 * sf + 9 * minor) % 12});
        }
        p = stop;
        continue;
      }
      if (status === 240 || status === 247) {
        const n = variableLength();
        p += n;
        if (p > limit) throw Error('Invalid SysEx.');
        last = 0;
        continue;
      }
      if (status >= 240) throw Error('Unsupported MIDI event.');
      last = status;
      const op = status >> 4, channel = status & 15, a = read(1), b = op === 12 || op === 13 ? 0 : read(1);
      const key = channel * 128 + a;
      if (op === 12) programs[channel] = a;
      if (op === 9 && b) {
        if (!channels.has(channel)) channels.set(channel, {inst: instrumentFor(programs[channel], channel), notes: []});
        const note: RawNote = {q: tick / ppq, len: .25, p: a, v: b / 127};
        channels.get(channel)!.notes.push(note);
        if (!active.has(key)) active.set(key, []);
        active.get(key)!.push(note);
      } else if (op === 8 || op === 9) {
        const note = active.get(key)?.shift();
        if (note) note.len = Math.max(1 / ppq, tick / ppq - note.q);
      }
    }
    for (const [channel, track] of channels) {
      const onsets = new Set<number>();
      for (const note of track.notes) {
        onsets.add(note.q);
        const lyric = lyrics.get(note.q);
        if (lyric) note.lyric = lyric;
      }
      // Lyrics that start mid-note become cues on the sounding note.
      for (const [q, text] of lyrics) {
        if (onsets.has(q)) continue;
        const note = track.notes.findLast(n => n.q < q && q < n.q + n.len);
        if (note) (note.lyricCues ??= []).push({q, text});
      }
      track.name = (name || 'Track ' + (tracks.length + 1)) + (channels.size > 1 ? ' · Ch ' + (channel + 1) : '');
      tracks.push(track);
    }
  }
  const song = prepare(title, tracks, tempos, meters, keys, markers, ppq);
  // Number the notes so the editor can refer to them (see midi/edit.ts).
  let id = 1;
  for (const track of song.tracks) for (const note of track.notes) note.src = [id++];
  return song;
}
