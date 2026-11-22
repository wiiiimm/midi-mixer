import createVerovio from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import type { Bar, KeySignature, Note, Song, StaffLabelMode, Track } from '../lib/types';
import { spellPitch } from '../lib/notes';
import { DRUM_KIT, usesBassClef } from '../midi/parse';
import { writtenTracks } from '../midi/edit';

// Turns a parsed MIDI song into MEI and engraves it with Verovio. This module (and
// the ~8 MB Verovio build) is loaded on demand, so the rest of the app starts first.

interface Fragment { start: number; end: number; dur: number; dots: number }
interface Token extends Fragment { xml: string; note?: boolean }
/** Notes that start and end together within one voice. */
interface NoteEvent { start: number; end: number; notes: Map<number, Note> }
interface NoteTiming { start: number; end: number }
interface LayerContext {
  start: number; end: number; beatLength: number; key: KeySignature; mode: StaffLabelMode;
  pageStart: number; pageEnd: number; accidentalState: Map<string, string>;
}

export interface EngravedScore {
  svg: string;
  /** Note element id → the song note it draws (one id per notehead fragment) and its track. */
  owners: Map<string, {note: Note; track: number}>;
  /** Song note → the ids of the noteheads that draw it, in order. */
  heads: Map<Note, string[]>;
  /** Measure element id → bar index. */
  measures: Map<string, number>;
  /** Note/chord element id → onset and release, in beats. */
  timing: Map<string, NoteTiming>;
}
export type Engraver = (song: Song, mode: StaffLabelMode) => EngravedScore;

const ticksPerBeat = 16;
const tick = (quarter: number): number => Math.round(quarter * ticksPerBeat);
const escape = (value: unknown): string => String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[<>&"']/g, char =>
  ({'<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;'} as Record<string, string>)[char]
);
/** [length in ticks, MEI @dur, dots], longest first. */
const durations: [number, number, number][] = ([[64,1],[32,2],[16,4],[8,8],[4,16],[2,32],[1,64]] as const)
  .flatMap(([length, dur]): [number, number, number][] => length >= 2 ? [[length * 1.5, dur, 1], [length, dur, 0]] : [[length, dur, 0]])
  .sort(([a], [b]) => b - a);
const solfa = ['Do','Di','Re','Ri','Mi','Fa','Fi','Sol','Si','La','Li','Ti'];

const meiAccidentals: Record<string, string> = {'♯': 's', '♭': 'f', '': 'n'};

/** MEI pitch name, accidental (s, f or n) and octave, spelt for the key like the rest of the app. */
function spell(pitch: number, sf: number) {
  const { letter, accidental, octave } = spellPitch(pitch, sf);
  return { letter: letter.toLowerCase(), accidental: meiAccidentals[accidental], octave };
}

function splitDuration(start: number, end: number, measureStart: number, beatLength: number): Fragment[] {
  const fragments: Fragment[] = [];
  while (start < end) {
    const offset = (start - measureStart) % beatLength;
    const limit = offset ? Math.min(end - start, beatLength - offset) : end - start;
    const [length, dur, dots] = durations.find(([length]) => length <= limit)!;
    fragments.push({ start, end: start + length, dur, dots });
    start += length;
  }
  return fragments;
}

function shortenedDuration(note: Note, ppq: number): number {
  // Some notation exports shorten notes to 95% of the written value, minus one MIDI tick.
  const raw = note.len * ppq;
  const grid = ppq / 8;
  const written = Math.round((raw + 1) / (.95 * grid)) * grid;
  return written > 0 && Math.abs(written * .95 - 1 - raw) <= 1 ? tick(written / ppq) : 0;
}

function usesShortenedDurations(tracks: Track[], ppq: number): boolean {
  if (!ppq) return false;
  let checked = 0, matches = 0;
  for (const track of tracks) {
    for (const note of track.notes) {
      if (note.len < .1) continue;
      checked++;
      if (shortenedDuration(note, ppq)) matches++;
    }
  }
  return checked >= 8 && matches / checked >= .85;
}

function makeVoices(track: Track, shortenedPpq: number): NoteEvent[][] {
  const groups = new Map<string, NoteEvent>();
  for (const note of track.notes) {
    const start = tick(note.q);
    const raw = Math.max(1, note.len * ticksPerBeat);
    const [nearest] = durations.reduce((best, item) =>
      Math.abs(item[0] - raw) < Math.abs(best[0] - raw) ? item : best
    );
    const restored = shortenedPpq ? shortenedDuration(note, shortenedPpq) : 0;
    const length = restored || (Math.abs(nearest - raw) <= raw * .12 ? nearest : Math.max(1, Math.round(raw)));
    const key = start + ':' + length;
    if (!groups.has(key)) groups.set(key, {start, end:start + length, notes:new Map()});
    groups.get(key)!.notes.set(note.p, note);
  }
  const voices: NoteEvent[][] = [];
  for (const group of [...groups.values()].sort((a,b) => a.start-b.start || b.end-a.end)) {
    const voice = voices.find(events => events[events.length - 1].end <= group.start);
    if (voice) voice.push(group);
    else voices.push([group]);
  }
  return voices;
}

function firstEndingAfter(voice: NoteEvent[], position: number): number {
  let low=0, high=voice.length;
  while (low<high) {
    const middle=(low+high)>>1;
    if (voice[middle].end<=position) low=middle+1;
    else high=middle;
  }
  return low;
}

function writeLayer(events: NoteEvent[], first: number, context: LayerContext, staff: number, layer: number,
  labels: string[], timing: Map<string, NoteTiming>, record: (note: Note, id: string) => void): string {
  const { start, end, beatLength, key, mode, pageStart, pageEnd, accidentalState } = context;
  const content: Token[] = [];
  let position = start;
  function rests(to: number) {
    if (to <= position) return;
    for (const fragment of splitDuration(position, to, start, beatLength)) {
      content.push({ ...fragment, xml: '<rest dur="' + fragment.dur + '"' +
        (fragment.dots ? ' dots="1"' : '') + '/>' });
    }
  }
  for (let index=first; index<events.length; index++) {
    const event=events[index];
    if (event.start >= end) break;
    if (event.end <= start) continue;
    const from = Math.max(start,event.start), to = Math.min(end,event.end);
    rests(from);
    const lyrics=new Map<number, string>();
    for(const note of event.notes.values()){
      if(note.lyric)lyrics.set(event.start,note.lyric);
      for(const cue of note.lyricCues??[])lyrics.set(tick(cue.q),cue.text);
    }
    const cuts=[from,...[...lyrics.keys()].filter(at=>from<at&&at<to).sort((a,b)=>a-b),to];
    const fragments=cuts.slice(1).flatMap((end,index)=>splitDuration(cuts[index],end,start,beatLength));
    for (const fragment of fragments) {
      const { start: onset, end: release, dur, dots } = fragment;
      const id = 'midi-n-' + staff + '-' + layer + '-' + onset;
      const tiesFrom = onset > Math.max(event.start,pageStart);
      const tiesTo = release < Math.min(event.end,pageEnd);
      const tie = tiesFrom ? (tiesTo ? 'm' : 't') : (tiesTo ? 'i' : '');
      const rhythm = ' dur="' + dur + '"' + (dots ? ' dots="1"' : '');
      const pitches = [...event.notes.keys()].sort((a,b) => b-a);
      const chord = pitches.length > 1;
      const notes = pitches.map((pitch, index) => {
        record(event.notes.get(pitch)!, chord ? id + '-' + index : id);
        const spelling = spell(pitch,key.sf);
        const { letter, accidental, octave } = spelling;
        const pitchKey = letter + octave;
        const signature = key.sf > 0 && 'fcgdaeb'.slice(0,key.sf).includes(letter) ? 's' :
          key.sf < 0 && 'beadgcf'.slice(0,-key.sf).includes(letter) ? 'f' : 'n';
        const prior = accidentalState.get(pitchKey) ?? signature;
        accidentalState.set(pitchKey,accidental);
        const accid = accidental === prior || onset > event.start ?
          (accidental === 'n' ? '' : ' accid.ges="' + accidental + '"') : ' accid="' + accidental + '"';
        const noteId = chord ? id + '-' + index : id;
        timing.set(noteId, { start:onset/ticksPerBeat, end:release/ticksPerBeat });
        const lyric = index===0 ? lyrics.get(onset) : '';
        return '<note xml:id="' + noteId + '" pname="' + letter + '" oct="' + octave + '"' +
          accid + (chord ? '' : rhythm) + (tie ? ' tie="' + tie + '"' : '') + '>' +
          (lyric ? '<verse n="1"><syl>' + escape(lyric) + '</syl></verse>' : '') + '</note>';
      }).join('');
      if (chord) timing.set(id, { start:onset/ticksPerBeat, end:release/ticksPerBeat });
      content.push({ ...fragment, note:true, xml: chord ?
        '<chord xml:id="' + id + '"' + rhythm + '>' + notes + '</chord>' : notes });
      if (mode !== 'none' && onset === event.start) {
        const text = pitches.map(pitch => {
          const {letter, accidental, octave} = spell(pitch,key.sf);
          return mode === 'solfa' ? solfa[(pitch-key.tonic+12)%12] :
            letter.toUpperCase() + (({s:'♯',f:'♭'} as Record<string, string>)[accidental] ?? '') +
            (mode === 'noteOctave' ? octave : '');
        }).join(' · ');
        labels.push('<dir type="staff-label" staff="' + staff + '" place="below" startid="#' +
          id + '"><rend fontsize="small">' + escape(text) + '</rend></dir>');
      }
    }
    position = to;
  }
  if (position === start && !content.length) return '<layer n="' + layer + '"><mRest/></layer>';
  rests(end);
  let xml = '';
  for (let i = 0; i < content.length;) {
    const item = content[i];
    let j = i + 1;
    const beat = Math.floor((item.start-start)/beatLength);
    if (item.note && item.dur >= 8) {
      while (content[j]?.note && content[j].dur >= 8 &&
        Math.floor((content[j].start-start)/beatLength) === beat) j++;
    }
    const group = content.slice(i,j).map(token => token.xml).join('');
    xml += j-i > 1 ? '<beam>' + group + '</beam>' : group;
    i = j;
  }
  return '<layer n="' + layer + '">' + xml + '</layer>';
}

const signature = (bar: Bar, key: KeySignature): string => '<scoreDef meter.count="' + bar.n + '" meter.unit="' + bar.d +
  '" key.sig="' + (key.sf ? Math.abs(key.sf) + (key.sf > 0 ? 's' : 'f') : '0') + '"';

function staffDefinition(track: Track, index: number): string {
  const percussion = track.inst === DRUM_KIT;
  const clef = percussion ? 'clef.shape="perc" clef.line="3"' :
    usesBassClef(track) ? 'clef.shape="F" clef.line="4"' : 'clef.shape="G" clef.line="2"';
  return '<staffDef n="' + (index+1) + '" lines="5" ' + clef + '><label>' + escape(track.name) +
    '</label><labelAbbr>' + escape(track.name) + '</labelAbbr></staffDef>';
}

const scores = new WeakMap<Song, NoteEvent[][][]>();
function encodeScore(song: Song, mode: StaffLabelMode) {
  if (!scores.has(song)) {
    const tracks = writtenTracks(song);
    const shortenedPpq = usesShortenedDurations(tracks,song.ppq) ? song.ppq : 0;
    scores.set(song,tracks.map(track=>makeVoices(track,shortenedPpq)));
  }
  const voiceTracks = scores.get(song)!;
  const measures = new Map<string, number>(), timing = new Map<string, NoteTiming>();
  const owners = new Map<string, {note: Note; track: number}>(), heads = new Map<Note, string[]>();
  const headBar = new Map<string, number>();
  const last = song.bars.length-1;
  const pageStart = 0, pageEnd = tick(song.bars[last].q);
  const initial = signature(song.bars[0],song.keyAt(0)) +
    '><staffGrp symbol="bracket" bar.thru="true">' + writtenTracks(song).map(staffDefinition).join('') +
    '</staffGrp></scoreDef>';
  let section = '';
  for (let barIndex=0; barIndex<last; barIndex++) {
    const bar = song.bars[barIndex], next = song.bars[barIndex+1];
    const start = tick(bar.q), end = Math.max(start+1,tick(next.q));
    const key = song.keyAt(bar.q);
    const beatLength = Math.max(1,tick((bar.d >= 8 && bar.n > 3 && bar.n % 3 === 0 ? 12 : 4)/bar.d));
    if (barIndex > 0) {
      const preceding = song.bars[barIndex-1];
      if (bar.n !== preceding.n || bar.d !== preceding.d || key.sf !== song.keyAt(preceding.q).sf) {
        section += signature(bar,key) + '/>';
      }
    }
    const id = 'midi-bar-' + barIndex;
    measures.set(id,barIndex);
    const controls: string[] = [];
    const number = barIndex+1;
    if (number === 1 || number % 4 === 0) {
      controls.push('<dir xml:id="bar-number-' + number +
        '" staff="1" place="above" tstamp="1"><rend fontsize="small" fontstyle="normal">' +
        number + '</rend></dir>');
    }
    const change = song.tempos.findLast(tempo => tempo.q <= bar.q)!;
    if (barIndex === 0 || change.q === bar.q) {
      const bpm = Math.round(60000000/change.us);
      controls.push('<tempo staff="1" tstamp="1" mm="' + bpm + '" mm.unit="4" midi.bpm="' + bpm +
        '">&#x2669; = ' + bpm + '</tempo>');
    }
    for (const marker of song.markers ?? []) {
      if (marker.q >= bar.q && marker.q < next.q) {
        controls.push('<reh staff="1" tstamp="' + (1+(marker.q-bar.q)*bar.d/4) + '">' + escape(marker.text) + '</reh>');
      }
    }
    const staves = voiceTracks.map((voices,i) => {
      const staff = i+1;
      const record = (note: Note, id: string) => {
        owners.set(id, {note, track: i});
        headBar.set(id, barIndex);
        const list = heads.get(note);
        if (list) list.push(id); else heads.set(note, [id]);
      };
      const context = {start,end,beatLength,key,mode,pageStart,pageEnd,accidentalState:new Map()};
      const layers = voices.flatMap((voice,j) => {
        const first = firstEndingAfter(voice,start);
        if (first === voice.length || voice[first].start >= end) return [];
        return [writeLayer(voice,first,context,staff,j+1,controls,timing,record)];
      });
      if (!layers.length) layers.push(writeLayer([],0,context,staff,1,controls,timing,record));
      return '<staff n="' + staff + '">' + layers.join('') + '</staff>';
    }).join('');
    section += '<measure xml:id="' + id + '" n="' + (barIndex+1) + '">' +
      staves + controls.join('') + '<!--links-' + barIndex + '-->' + '</measure>';
  }
  // Ties and slurs, written into the bar where they start, from the last notehead of one note to the first of the other.
  const links = new Map<number, string>();
  const curves = [...(song.ties ?? []).map(link => ({link, element: 'tie'})), ...(song.slurs ?? []).map(link => ({link, element: 'slur'}))];
  for (const {link, element} of curves) {
    const start = heads.get(link.from)?.at(-1), end = heads.get(link.to)?.[0];
    if (!start || !end) continue;
    // Engraving rounds note times, so check the drawn heads still run forwards.
    if ((timing.get(start)?.start ?? 0) >= (timing.get(end)?.start ?? 0)) continue;
    const bar = headBar.get(start)!;
    links.set(bar, (links.get(bar) ?? '') + '<' + element + ' staff="' + (link.track + 1) + '" startid="#' + start + '" endid="#' + end + '"/>');
  }
  section = section.replace(/<!--links-(\d+)-->/g, (_, bar: string) => links.get(Number(bar)) ?? '');
  const mei = '<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">' +
    '<meiHead><fileDesc><titleStmt><title>' + escape(song.title) +
    '</title></titleStmt><pubStmt/></fileDesc></meiHead><music><body><mdiv><score>' + initial + '<section>' + section + '</section></score></mdiv></body></music></mei>';
  return {mei,measures,timing,owners,heads};
}

/** Loads Verovio and returns a function that engraves a song. */
export async function createEngraver(): Promise<Engraver> {
  const toolkit = new VerovioToolkit(await createVerovio());
  toolkit.setOptions({
    inputFrom: 'mei', scale: 38, breaks: 'none', adjustPageWidth: true,
    adjustPageHeight: true, noJustification: true,
    header: 'none', footer: 'none', spacingStaff: 11, spacingSystem: 16, svgViewBox: true,
    minLastJustification: 0, pageMarginTop: 30, pageMarginBottom: 35, pageMarginLeft: 75, pageMarginRight: 75,
  });
  // Wider bars overall, and wider still when note/sol-fa labels sit under the notes.
  const spacing = {
    plain: {spacingLinear: .4, spacingNonLinear: .65, measureMinWidth: 22},
    labelled: {spacingLinear: .48, spacingNonLinear: .67, measureMinWidth: 25},
  };
  return (song, mode) => {
    toolkit.setOptions(spacing[mode === 'none' ? 'plain' : 'labelled']);
    const {mei, measures, timing, owners, heads} = encodeScore(song, mode);
    if (!toolkit.loadData(mei)) throw new Error('Could not engrave this MIDI score.');
    return {svg: toolkit.renderToSVG(1), measures, timing, owners, heads};
  };
}
