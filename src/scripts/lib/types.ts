/** A note parsed from MIDI. Times are in quarter notes (q, len) and seconds (s, e). */
export interface Note {
  q: number;
  len: number;
  /** MIDI pitch. */
  p: number;
  /** Velocity, 0–1. */
  v: number;
  s: number;
  e: number;
  lyric?: string;
  lyricCues?: LyricCue[];
}

export interface LyricCue { q: number; text: string }

export interface Track {
  /** General MIDI program (0–127), or 128 for the drum kit. */
  inst: number;
  notes: Note[];
  name: string;
}

export interface Tempo { q: number; us: number; sec: number }
export interface Meter { q: number; n: number; d: number }
export interface KeySignature { q: number; sf: number; tonic: number }
export interface Marker { q: number; text: string }

/** A bar start. The final entry marks the end of the song and has no meter. */
export interface Bar { q: number; n: number; d: number }

export interface MixChannel {
  inst: number;
  vol: number;
  solo: boolean;
  mute: boolean;
  selected: boolean;
}

export interface Song {
  title: string;
  tracks: Track[];
  tempos: Tempo[];
  bars: Bar[];
  markers: Marker[];
  ppq: number;
  end: number;
  duration: number;
  seconds(q: number): number;
  beat(seconds: number): number;
  keyAt(q: number): KeySignature;
  /** Set for imported files (IndexedDB key). */
  id?: string;
  /** Remembered mixer settings while the session lasts. */
  mix?: MixChannel[];
}

/** Something that is sounding and can be cut off. */
export interface StoppableVoice {
  stop(at?: number): void;
}

/** A scheduled playback note, used to light up the piano. */
export interface PlaybackVoice extends StoppableVoice {
  track: number;
  pitch: number;
  start: number;
  end: number;
}

export type StaffLabelMode = 'none' | 'note' | 'noteOctave' | 'solfa';
