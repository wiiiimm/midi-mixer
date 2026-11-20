import { $, esc } from '../lib/dom';
import { sharpNames, solfaNames, trackColours } from '../lib/notes';
import type { Bar, KeySignature, Note, Song, StaffLabelMode } from '../lib/types';
import { clefs } from '../score/clefs';
import type { Engraver } from '../score/engraver';
import { whileBusy } from '../ui/loading';
import { barAt, studio } from './state';

// The score: an engraved Verovio rendering in a horizontally scrolling viewport,
// with a lightweight SVG "rehearsal score" (paged) as the fallback if engraving
// is unavailable. Both show a playhead and the start cue, and clicking seeks.

interface BarGeometry {
  left: number; right: number; top: number; height: number;
  onsets: Map<number, number>;
  notes: {id: string; start: number; end: number}[];
  /** [beat, x] pairs used to map between time and position. */
  anchors: [number, number][];
}
interface EngravedView {
  song: Song;
  mode: StaffLabelMode;
  measures: Map<string, number>;
  timing: Map<string, {start: number; end: number}>;
  active: Set<string>;
  geometry: Map<number, BarGeometry>;
  cueMarker: HTMLElement;
  playheadMarker: HTMLElement;
  playheadX?: number;
}

const scoreStart = 69, rightMargin = 14;
let engrave: Engraver | null = null;
let engravedView: EngravedView | undefined;
let scoreWidth = 0, barsPerPage = 4, page = 0;
let onSeek: (seconds: number, setCue: boolean) => void = () => {};

const engravedScore = () => $('engravedScore');
const viewport = () => $('scoreViewport');
const staffMode = () => $<HTMLSelectElement>('staffLabels').value as StaffLabelMode;
const pageFor = (bar: number) => Math.floor(bar / barsPerPage) * barsPerPage;
const barWidth = () => (scoreWidth - scoreStart - rightMargin) / barsPerPage;
export const followEnabled = (): boolean => $('followScore').getAttribute('aria-pressed') === 'true';

export function setEngraver(engraver: Engraver): void {
  engrave = engraver;
  scoreWidth = 0;
  fitScore();
}

function fitScore() {
  const width = Math.round($('scorewrap').getBoundingClientRect().width);
  if (!width || width === scoreWidth) return;
  scoreWidth = width;
  barsPerPage = Math.max(1, Math.floor((width - scoreStart - rightMargin) / 200));
  const song = studio.song;
  if (engravedView) updateVisibleBars();
  else if (song) {
    page = pageFor(studio.playing ? barAt(song, song.beat(studio.pos)) : page);
    renderScore();
  }
}

/** Renders the selected song (engraved if possible, otherwise the fallback). */
export function renderScore(): void {
  const song = studio.song;
  if (!song) return;
  if (engrave && scoreWidth) {
    const mode = staffMode();
    if (engravedView?.song === song && engravedView.mode === mode) return;
    try {
      renderEngraved(song, mode, engrave);
      return;
    } catch (error) {
      console.warn('Engraving fell back to the rehearsal score', error);
    }
  }
  engravedView = undefined;
  viewport().hidden = $('engravedTitle').hidden = true;
  $('score').removeAttribute('hidden');
  renderFallback(song);
}

function renderEngraved(song: Song, mode: StaffLabelMode, engraver: Engraver) {
  const host = engravedScore(), scroller = viewport();
  const previous = engravedView?.song === song ? engravedView : undefined;
  const scroll = scroller.scrollLeft;
  const index = previous ? scoreBarAtX(scroll) : 0;
  const offset = previous ? scroll - previous.geometry.get(index)!.left : 0;
  const {svg, measures, timing} = engraver(song, mode);
  host.innerHTML = svg;
  const notation = host.querySelector('svg')!;
  notation.setAttribute('width', String(notation.viewBox.baseVal.width));
  notation.setAttribute('height', String(notation.viewBox.baseVal.height));
  $('engravedTitle').textContent = song.title;
  $('engravedTitle').hidden = false;
  scroller.hidden = false;
  $('score').setAttribute('hidden', '');
  host.insertAdjacentHTML('beforeend',
    '<div class="score-position cue-marker" aria-hidden="true" hidden><span>Cue</span></div>' +
    '<div class="score-position playhead-marker" aria-hidden="true" hidden></div>');
  engravedView = {
    song, mode, measures, timing, active: new Set(), geometry: new Map(),
    cueMarker: host.querySelector('.cue-marker')!, playheadMarker: host.querySelector('.playhead-marker')!,
  };
  cacheScorePositions(engravedView, song);
  scroller.scrollLeft = previous ? engravedView.geometry.get(index)!.left + offset : 0;
  updateCursor();
  if (!previous && studio.pos > 0) revealPlayhead(engravedView.playheadX ?? 0);
  updateVisibleBars();
}

function scoreBarAtX(x: number): number {
  const geometry = engravedView!.geometry;
  let low = 0, high = geometry.size - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (geometry.get(middle)!.right < x) low = middle + 1; else high = middle;
  }
  return low;
}

function updateVisibleBars() {
  if (!engravedView) return;
  const {scrollLeft, clientWidth, scrollWidth} = viewport();
  const first = scoreBarAtX(scrollLeft + 1) + 1;
  const last = scoreBarAtX(scrollLeft + clientWidth - 1) + 1;
  $('bars').textContent = first === last ? 'Bar ' + first : 'Bars ' + first + '–' + last;
  $<HTMLButtonElement>('prev').disabled = scrollLeft < 1;
  $<HTMLButtonElement>('next').disabled = scrollLeft + clientWidth >= scrollWidth - 1;
}

function revealPlayhead(x: number, cancelPan = false) {
  const scroller = viewport();
  const {scrollLeft, clientWidth} = scroller;
  const margin = Math.min(70, clientWidth * .15);
  const outside = x < scrollLeft || x > scrollLeft + clientWidth - margin;
  if (cancelPan || outside) {
    const left = studio.pos === 0 ? 0 : outside ? x - margin : scrollLeft;
    scroller.scrollTo({left, behavior: 'auto'});
  }
}

function cacheScorePositions(view: EngravedView, song: Song) {
  const host = engravedScore().getBoundingClientRect();
  for (const [id, index] of view.measures) {
    const measure = $(id);
    const rect = measure.getBoundingClientRect();
    const firstLine = measure.querySelector('.staff > path')?.getBoundingClientRect() ?? rect;
    view.geometry.set(index, {
      left: firstLine.left - host.left, right: firstLine.right - host.left,
      top: rect.top - host.top, height: rect.height, onsets: new Map(), notes: [], anchors: [],
    });
  }
  for (const [id, {start, end}] of view.timing) {
    const note = document.getElementById(id);
    const head = note?.querySelector('.notehead');
    const measureId = note?.closest('.measure')?.id;
    const bar = measureId === undefined ? undefined : view.geometry.get(view.measures.get(measureId) ?? -1);
    if (!bar) continue;
    bar.notes.push({id, start, end});
    if (!head || bar.onsets.has(start)) continue;
    const {left, width} = head.getBoundingClientRect();
    bar.onsets.set(start, left + width / 2 - host.left);
  }
  for (const [index, bar] of view.geometry) {
    bar.anchors = [[song.bars[index].q, bar.left + 2] as [number, number], ...bar.onsets].sort(([a], [b]) => a - b);
    bar.anchors.push([song.bars[index + 1].q, bar.right]);
    for (let i = 1; i < bar.anchors.length; i++) {
      if (bar.anchors[i][0] === bar.anchors[i - 1][0]) bar.anchors.splice(--i, 1);
    }
  }
}

/** Maps beat → x (axis 0) or x → beat (axis 1) through a bar's anchors. */
function interpolate(anchors: [number, number][], value: number, axis: 0 | 1): number {
  const other = 1 - axis;
  let previous = anchors[0];
  for (const next of anchors.slice(1)) {
    if (value <= next[axis]) {
      const distance = next[axis] - previous[axis];
      const ratio = distance ? Math.max(0, (value - previous[axis]) / distance) : 0;
      return previous[other] + ratio * (next[other] - previous[other]);
    }
    previous = next;
  }
  return previous[other];
}

function positionMarker(view: EngravedView, song: Song, marker: HTMLElement, beat: number, offset = 0): number | undefined {
  const bar = view.geometry.get(barAt(song, beat));
  marker.hidden = !bar;
  if (!bar) return;
  const x = interpolate(bar.anchors, beat, 0);
  marker.style.transform = 'translate(' + (x + offset) + 'px,' + bar.top + 'px)';
  marker.style.height = bar.height + 'px';
  return x;
}

/** Moves the playhead and cue markers and highlights the sounding notes. */
export function updateCursor(): void {
  const song = studio.song;
  if (!song) return;
  const q = song.beat(studio.pos), index = barAt(song, q), cueBeat = song.beat(studio.cue);
  const cueNudge = Math.abs(q - cueBeat) < .025 ? -4 : 0;
  if (engravedView) {
    const view = engravedView;
    view.playheadX = positionMarker(view, song, view.playheadMarker, q);
    positionMarker(view, song, view.cueMarker, cueBeat, cueNudge);
    const next = new Set<string>();
    const measure = view.geometry.get(index);
    if (measure) {
      next.add('midi-bar-' + index);
      for (const {id, start, end} of measure.notes) if (start <= q && end > q) next.add(id);
      if (studio.playing && followEnabled()) revealPlayhead(view.playheadX ?? 0);
    }
    for (const id of view.active) if (!next.has(id)) document.getElementById(id)?.classList.remove('score-current');
    for (const id of next) if (!view.active.has(id)) document.getElementById(id)?.classList.add('score-current');
    view.active = next;
    return;
  }
  const place = (marker: Element | null, beat: number, offset = 0) => {
    if (!(marker instanceof SVGElement)) return;
    const bar = barAt(song, beat);
    marker.style.display = bar < page || bar >= page + barsPerPage ? 'none' : '';
    const width = barWidth(), start = song.bars[bar].q, end = song.bars[bar + 1].q;
    const x = scoreStart + (bar - page) * width + 14 + (beat - start) / (end - start) * (width - 20);
    marker.setAttribute('transform', 'translate(' + (x + offset) + ' 0)');
  };
  place(document.getElementById('cueCursor'), cueBeat, cueNudge);
  place(document.getElementById('cursor'), q);
}

/** After a jump in position: move the fallback score to the right page. */
export function showPositionPage(): void {
  const song = studio.song;
  if (!song) return;
  page = pageFor(barAt(song, song.beat(studio.pos)));
  if (!engravedView) renderScore();
}

/** After a jump in position: scroll the engraved score to the playhead. */
export function revealPositionAfterJump(): void {
  if (engravedView) revealPlayhead(engravedView.playheadX ?? 0, true);
}

/** Turns the fallback score's pages while following playback. */
export function followFallbackPage(): void {
  const song = studio.song;
  if (!song || !studio.playing || engravedView || !followEnabled()) return;
  const next = pageFor(barAt(song, song.beat(studio.pos)));
  if (next !== page) {
    page = next;
    renderScore();
  }
}

/** Resets view state for a newly selected song. */
/** Empties the score area when no song is selected. */
export function clearScore(): void {
  engravedView = undefined;
  engravedScore().innerHTML = '';
  $('score').innerHTML = '';
  viewport().hidden = $('engravedTitle').hidden = true;
  $('score').setAttribute('hidden', '');
}

export function resetScoreView(): void {
  page = 0;
  $('scorewrap').closest('.workspace')!.scrollTop = 0;
}

function moveScore(direction: number) {
  if (engravedView) {
    const scroller = viewport();
    scroller.scrollBy({left: direction * scroller.clientWidth * .85, behavior: 'smooth'});
    return;
  }
  page += direction * barsPerPage;
  $('scorewrap').closest('.workspace')!.scrollTop = 0;
  renderScore();
}

export function initScore(seek: (seconds: number, setCue: boolean) => void): void {
  onSeek = seek;
  new ResizeObserver(fitScore).observe($('scorewrap'));
  fitScore();
  viewport().addEventListener('scroll', updateVisibleBars, {passive: true});
  $('prev').addEventListener('click', () => moveScore(-1));
  $('next').addEventListener('click', () => moveScore(1));
  $('staffLabels').addEventListener('change', () => { if (studio.song) whileBusy('Updating staff labels…', renderScore); });
  const follow = $('followScore');
  follow.addEventListener('click', () => {
    const on = !followEnabled();
    follow.setAttribute('aria-pressed', String(on));
    if (on && engravedView) revealPlayhead(engravedView.playheadX ?? 0);
  });
  // Click a note (or anywhere in a bar) to seek there; Shift-click also moves the cue.
  engravedScore().addEventListener('click', event => {
    const song = studio.song, view = engravedView;
    if (!song || !view) return;
    const note = (event.target as Element).closest('.note, .chord');
    let beat = note ? view.timing.get(note.id)?.start : undefined;
    if (beat === undefined) {
      const host = engravedScore().getBoundingClientRect();
      const x = event.clientX - host.left, y = event.clientY - host.top;
      const bar = view.geometry.get(scoreBarAtX(x));
      if (!bar || x < bar.left || x > bar.right || y < bar.top || y > bar.top + bar.height) return;
      beat = interpolate(bar.anchors, x, 1);
    }
    onSeek(song.seconds(beat), event.shiftKey);
  });
  $('score').addEventListener('click', event => {
    const song = studio.song;
    if (!song) return;
    const rect = $('score').getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * scoreWidth;
    if (x < scoreStart) return;
    const count = Math.min(barsPerPage, song.bars.length - 1 - page), w = barWidth();
    const j = Math.min(count - 1, Math.max(0, Math.floor((x - scoreStart) / w)));
    const start = song.bars[page + j].q, length = song.bars[page + j + 1].q - start;
    onSeek(song.seconds(start + Math.max(0, Math.min(.999, (x - scoreStart - j * w - 14) / (w - 20))) * length), event.shiftKey);
  });
}

// ── Fallback "rehearsal score": a simple paged SVG staff per track ──

const staffSteps = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
function noteY(pitch: number, top: number, reference: number) {
  const step = (Math.floor(pitch / 12) - 1) * 7 + staffSteps[pitch % 12];
  return top + 28 - (step - reference) * 3.5;
}

// MIDI note-offs often come slightly early for articulation.
const writtenValues = [4, 3, 2, 1.5, 1, .75, .5, .375, .25, .125];
const writtenLength = (length: number) => writtenValues.reduce((best, value) =>
  Math.abs(Math.log(length / value)) < Math.abs(Math.log(length / best)) ? value : best);
const flagCount = (length: number) => length <= .125 ? 3 : length <= .25 ? 2 : length < 1 ? 1 : 0;

const staffLabel = (pitch: number, key: KeySignature, mode: StaffLabelMode) =>
  mode === 'solfa' ? solfaNames[(pitch - key.tonic + 12) % 12] : sharpNames[pitch % 12];

interface Stem { note: Note; x: number; y: number; down: boolean; flags: number; beat: number; length: number; endY?: number; next?: Stem; previous?: Stem }

function beamGroups(notes: Note[], bar: Bar, end: number, top: number, reference: number, xAt: (q: number) => number) {
  const stems = new Map<Note, Stem>();
  let group: Stem[] = [];
  function finish() {
    if (group.length > 1) {
      const first = group[0], last = group[group.length - 1];
      const rise = Math.max(-7, Math.min(7, last.y - first.y));
      const offset = first.down ? 22 : -22;
      const base = (first.down ? Math.max : Math.min)(
        ...group.map(({x, y}) => y - rise * (x - first.x) / (last.x - first.x))) + offset;
      group.forEach((item, index) => {
        item.endY = base + rise * (item.x - first.x) / (last.x - first.x);
        item.next = group[index + 1];
        item.previous = group[index - 1];
        stems.set(item.note, item);
      });
    }
    group = [];
  }
  const beatLength = 4 / bar.d;
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (note.q >= end) break;
    if (note.q < bar.q) continue;
    const length = writtenLength(note.len), flags = flagCount(length);
    const chord = notes[i - 1]?.q === note.q || notes[i + 1]?.q === note.q;
    const beat = Math.floor((note.q - bar.q) / beatLength + 1e-7);
    if (!flags || chord || note.q + length > end + 1e-7 || note.q + length > bar.q + (beat + 1) * beatLength + 1e-7) {
      finish();
      continue;
    }
    const y = noteY(note.p, top, reference), down = y < top + 14;
    const prior = group[group.length - 1];
    if (prior && (prior.down !== down || prior.beat !== beat || Math.abs(prior.note.q + prior.length - note.q) > .015)) finish();
    group.push({note, x: xAt(note.q) + (down ? -4.2 : 4.2), y, down, flags, beat, length});
  }
  finish();
  return stems;
}

function renderFallback(song: Song) {
  const bars = song.bars, count = Math.min(barsPerPage, bars.length - 1 - page), w = barWidth(), mode = staffMode();
  const svg = $('score') as unknown as SVGSVGElement;
  const line = (x: number, y: number, x2: number, y2: number, colour = '#98929a', width = .8) =>
    '<path d="M' + x + ' ' + y + ' L' + x2 + ' ' + y2 + '" stroke="' + colour + '" stroke-width="' + width + '"/>';
  let top = 52, previousStaff: number | undefined, connectors = '';
  let s = '<rect width="100%" height="32" fill="#111d30"/>';
  for (let j = 0; j < count; j++) s += '<text x="' + (scoreStart + j * w) + '" y="21" fill="#bed1df" font-size="11">' + (page + j + 1) + '</text>';
  song.tracks.forEach((track, i) => {
    const labels = new Map<number, Map<number, string>>();
    let labelFloor = top + 28;
    const colour = trackColours[i % trackColours.length], sample = track.notes.slice(0, 80);
    const bass = sample.reduce((sum, n) => sum + n.p, 0) / sample.length < 58, reference = bass ? 18 : 30;
    s += '<circle cx="7" cy="' + (top - 13) + '" r="4" fill="' + colour + '"/><text x="14" y="' + (top - 10) +
      '" font-weight="600" font-size="13"><title>' + esc(track.name) + '</title>' +
      esc(track.name.length > 10 ? track.name.slice(0, 9) + '…' : track.name) + '</text>';
    if (previousStaff !== undefined) {
      connectors += line(7, previousStaff + 28, 7, top, '#77717d', 1.1);
      for (let j = 0; j <= count; j++) {
        const boundary = scoreStart + j * w;
        connectors += line(boundary, previousStaff + 28, boundary, top, '#bab4bf');
      }
    }
    previousStaff = top;
    for (let j = 0; j < 5; j++) s += line(7, top + j * 7, scoreWidth - rightMargin, top + j * 7);
    const clef = clefs[bass ? 'bass' : 'treble'], height = bass ? 26 : 48, k = height / (clef[4] - clef[2]);
    s += '<path d="' + clef[0] + '" transform="translate(' + (11 - clef[1] * k) + ' ' + (top + (bass ? 0 : -9) + clef[4] * k) +
      ') scale(' + k + ' ' + (-k) + ')" fill="#33303b"/>';
    for (let j = 0; j < count; j++) {
      const bar = bars[page + j], end = bars[page + j + 1].q, x = scoreStart + j * w;
      const changed = j === 0 || bars[page + j - 1].n !== bar.n || bars[page + j - 1].d !== bar.d;
      if (changed) s += '<text text-anchor="end" x="' + (x - 5) + '" y="' + (top + 13) + '" font-family="serif" font-size="17" font-weight="bold">' +
        bar.n + '<tspan x="' + (x - 5) + '" dy="14">' + bar.d + '</tspan></text>';
      s += line(x, top, x, top + 28);
      const xAt = (q: number) => x + 14 + (q - bar.q) / (end - bar.q) * (w - 20);
      const beams = beamGroups(track.notes, bar, end, top, reference, xAt);
      let seen = false;
      for (const note of track.notes) {
        if (note.q >= end) break;
        if (note.q + note.len <= bar.q) continue;
        seen = true;
        const xx = xAt(Math.max(note.q, bar.q)), pc = note.p % 12, y = noteY(note.p, top, reference);
        const down = y < top + 14, dy = down ? 22 : -22, stem = xx + (down ? -4.2 : 4.2);
        const len = writtenLength(Math.min(end, note.q + note.len) - Math.max(note.q, bar.q)), beam = beams.get(note);
        for (let ly = top - 7; ly >= y; ly -= 7) s += line(xx - 7, ly, xx + 7, ly);
        for (let ly = top + 35; ly <= y; ly += 7) s += line(xx - 7, ly, xx + 7, ly);
        if ([1, 3, 6, 8, 10].includes(pc)) s += '<text x="' + (xx - 13) + '" y="' + (y + 4) + '" font-size="12">♯</text>';
        s += '<ellipse cx="' + xx + '" cy="' + y + '" rx="5" ry="3.2" transform="rotate(-19 ' + xx + ' ' + y + ')" fill="' + (len >= 1.9 ? 'white' : '#302c36') + '" stroke="#302c36"/>';
        if (len < 3.9) {
          s += line(stem, y, stem, beam?.endY ?? y + dy, '#302c36', 1.3);
          if (beam && beam.endY !== undefined) {
            for (let f = 0; f < beam.flags; f++) {
              const offset = f * (down ? -5 : 5), next = beam.next, previous = beam.previous;
              if (next && next.flags > f && next.endY !== undefined) {
                s += '<g class="score-beam">' + line(stem, beam.endY + offset, next.x, next.endY + offset, '#302c36', 3.3) + '</g>';
              } else if (f > 0 && !(previous && previous.flags > f)) {
                const neighbour = next ?? previous;
                if (!neighbour || neighbour.endY === undefined) continue;
                const fraction = Math.min(.45, 8 / Math.abs(neighbour.x - stem));
                s += line(stem, beam.endY + offset, stem + (neighbour.x - stem) * fraction,
                  beam.endY + offset + (neighbour.endY - beam.endY) * fraction, '#302c36', 3.3);
              }
            }
          } else {
            for (let f = 0; f < flagCount(len); f++) {
              s += '<path d="M' + stem + ' ' + (y + dy + (down ? -4 : 4) * f) + ' q 8 ' + (down ? -4 : 4) + ' 5 ' + (down ? -11 : 11) +
                '" fill="none" stroke="#302c36" stroke-width="2"/>';
            }
          }
        }
        labelFloor = Math.max(labelFloor, Math.max(y, beam?.endY ?? y + dy) + 4);
        if (mode !== 'none') {
          if (!labels.has(xx)) labels.set(xx, new Map());
          labels.get(xx)!.set(note.p, staffLabel(note.p, song.keyAt(note.q), mode));
        }
        if ([.375, .75, 1.5, 3].includes(len)) s += '<circle cx="' + (xx + 8) + '" cy="' + (y - 1.8) + '" r="1.4"/>';
      }
      if (!seen) s += '<rect x="' + (x + w / 2 - 4) + '" y="' + (top + 7) + '" width="8" height="3"/>';
    }
    s += line(scoreStart + count * w, top, scoreStart + count * w, top + 28);
    // Labels stack into lanes so neighbours never overlap.
    const laneEnds: number[] = [];
    for (const [x, pitches] of labels) {
      for (const [, label] of [...pitches].sort(([a], [b]) => b - a)) {
        const halfWidth = label.length * 3.5;
        let lane = laneEnds.findIndex(end => end + 3 <= x - halfWidth);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = x + halfWidth;
        s += '<text class="staff-label" x="' + x + '" y="' + (labelFloor + 13 + lane * 13) + '" text-anchor="middle" fill="#33465a" font-size="11">' + label + '</text>';
      }
    }
    const labelSpace = Math.max(0, labelFloor - top + laneEnds.length * 13 - 43);
    if (i < song.tracks.length - 1) s += line(15, top + 56 + labelSpace, scoreWidth, top + 56 + labelSpace, '#eeeaf0');
    top += 78 + labelSpace;
  });
  const h = top - 20;
  svg.setAttribute('viewBox', '0 0 ' + scoreWidth + ' ' + h);
  svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  svg.style.height = h + 'px';
  svg.innerHTML = '<rect width="100%" height="' + h + '" fill="#f5f8fb"/>' + connectors + s +
    '<g id="cueCursor" pointer-events="none"><rect y="5" width="27" height="13" rx="2" fill="#a7410b"/><text x="3" y="15" fill="white" font-size="9">Cue</text><path d="M0 18V' + (h - 10) + '" stroke="#ca5a19" stroke-dasharray="3 3"/></g>' +
    '<g id="cursor" pointer-events="none"><path d="M-4 25h8l-4 6z" fill="#00ad81"/>' + line(0, 30, 0, h - 10, '#00ad81', 1.5) + '</g>';
  $('bars').textContent = 'Bars ' + (page + 1) + '–' + (page + count);
  $<HTMLButtonElement>('prev').disabled = page === 0;
  $<HTMLButtonElement>('next').disabled = page + count >= bars.length - 1;
  updateCursor();
}
