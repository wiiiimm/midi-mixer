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
  /** In an edited song: the ids of the edit notes this note was built from (several when tied). */
  src?: number[];
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
  /** Time signature and key signature changes, kept so an edited song can be rebuilt. */
  meters: Meter[];
  keys: KeySignature[];
  /** In an edited song: the notes as written (tied notes kept apart), with the ties and slurs between them. */
  engraving?: Track[];
  ties?: Slur[];
  slurs?: Slur[];
  /** The user's edits, when the song differs from its original MIDI file. */
  edits?: SongEdits;
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

/** A tie or slur between two written notes of one track. */
export interface Slur { track: number; from: Note; to: Note }

/**
 * An editable note. `tie` names the next note of the same pitch it is tied to (played
 * and engraved as one sustained note); `slur` names a later note it is slurred to.
 */
export interface EditNote {
  id: number;
  q: number;
  len: number;
  p: number;
  v: number;
  lyric?: string;
  lyricCues?: LyricCue[];
  tie?: number;
  slur?: number;
}

/** A song's edits: every note of every track, in the order of the song's tracks. */
export interface SongEdits {
  tracks: EditNote[][];
  nextId: number;
}
