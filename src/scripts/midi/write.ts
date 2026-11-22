import type { Song } from '../lib/types';
import { DRUM_KIT } from './parse';

// Writes a song as a type 1 Standard MIDI File: a conductor track with the title,
// tempo, time and key signatures and section markers, then one track per part with
// its name, instrument, notes and lyrics. Tied notes are written as the one sustained
// note they play as.

const PPQ = 480;

function variableLength(value: number): number[] {
  const bytes = [value & 127];
  for (value >>= 7; value > 0; value >>= 7) bytes.unshift((value & 127) | 128);
  return bytes;
}

const text = (value: string): number[] => [...new TextEncoder().encode(value)];

interface Event { tick: number; order: number; bytes: number[] }

/** Joins events into a track chunk, sorted by time (note-offs before note-ons at the same tick). */
function chunk(events: Event[]): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data: number[] = [];
  let last = 0;
  for (const event of events) {
    data.push(...variableLength(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  data.push(0, 0xff, 0x2f, 0);
  const n = data.length;
  return [0x4d, 0x54, 0x72, 0x6b, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...data];
}

const meta = (tick: number, type: number, payload: number[], order = 0): Event =>
  ({tick, order, bytes: [0xff, type, ...variableLength(payload.length), ...payload]});

/** Encodes a song as MIDI file bytes. */
export function writeMidi(song: Song): Uint8Array<ArrayBuffer> {
  const tick = (q: number) => Math.max(0, Math.round(q * PPQ));
  const conductor: Event[] = [meta(0, 3, text(song.title))];
  for (const tempo of song.tempos) {
    const us = Math.max(1, Math.min(0xffffff, Math.round(tempo.us)));
    conductor.push(meta(tick(tempo.q), 0x51, [(us >> 16) & 255, (us >> 8) & 255, us & 255]));
  }
  for (const meter of song.meters) {
    conductor.push(meta(tick(meter.q), 0x58, [meter.n, Math.round(Math.log2(meter.d)), 24, 8]));
  }
  for (const key of song.keys) {
    const minor = key.tonic === (84 + 7 * key.sf + 9) % 12 ? 1 : 0;
    conductor.push(meta(tick(key.q), 0x59, [key.sf & 255, minor]));
  }
  for (const marker of song.markers) conductor.push(meta(tick(marker.q), 6, text(marker.text)));

  // Melodic parts use the 15 channels other than the drum channel (10). A player has one
  // instrument per channel, so parts with the same instrument share a channel, and only
  // a song with more than 15 different instruments has to put two on one channel.
  const channelOf = new Map<number, number>();
  const parts = song.tracks.map(track => {
    let channel = 9;
    if (track.inst !== DRUM_KIT) {
      const inst = track.inst & 127;
      if (!channelOf.has(inst)) {
        const index = channelOf.size % 15;
        channelOf.set(inst, index >= 9 ? index + 1 : index);
      }
      channel = channelOf.get(inst)!;
    }
    const events: Event[] = [meta(0, 3, text(track.name))];
    if (track.inst !== DRUM_KIT) events.push({tick: 0, order: 1, bytes: [0xc0 | channel, track.inst & 127]});
    // One channel can't hold two overlapping notes of the same pitch (a reader pairs the
    // note-offs in order), so a note ends where the next one of its pitch starts.
    const nextStart = new Map<(typeof track.notes)[number], number>();
    const byPitch = new Map<number, (typeof track.notes)>();
    for (const note of [...track.notes].sort((a, b) => a.q - b.q)) {
      const same = byPitch.get(note.p);
      if (same) { nextStart.set(same[same.length - 1], tick(note.q)); same.push(note); } else byPitch.set(note.p, [note]);
    }
    for (const note of track.notes) {
      const start = tick(note.q);
      const end = Math.max(start + 1, Math.min(tick(note.q + note.len), nextStart.get(note) ?? Infinity));
      const pitch = Math.max(0, Math.min(127, note.p)), velocity = Math.max(1, Math.min(127, Math.round(note.v * 127)));
      if (note.lyric) events.push(meta(start, 5, text(note.lyric), 2));
      for (const cue of note.lyricCues ?? []) events.push(meta(tick(cue.q), 5, text(cue.text), 2));
      events.push({tick: start, order: 3, bytes: [0x90 | channel, pitch, velocity]});
      events.push({tick: end, order: 0, bytes: [0x80 | channel, pitch, 0]});
    }
    return chunk(events);
  });

  const count = parts.length + 1;
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, (count >> 8) & 255, count & 255, (PPQ >> 8) & 255, PPQ & 255];
  return new Uint8Array([...header, ...chunk(conductor), ...parts.flat()]);
}

/** Downloads a song as a .mid file named after it. */
export function downloadMidi(song: Song): void {
  const name = song.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'song';
  const blob = new Blob([writeMidi(song)], {type: 'audio/midi'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name + (song.edits ? ' (edited)' : '') + '.mid';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
