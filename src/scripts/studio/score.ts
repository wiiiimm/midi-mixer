import { $, esc } from '../lib/dom';
import { isBlackKey, pitchName, pitchNameWithOctave, solfaNames, spellPitch, trackColours } from '../lib/notes';
import type { Bar, KeySignature, Note, Song, StaffLabelMode } from '../lib/types';
import { writtenTracks } from '../midi/edit';
import { clefs } from '../score/clefs';
import type { Engraver } from '../score/engraver';
import { whileBusy } from '../ui/loading';
import { barAt, studio } from './state';

// The score: an engraved Verovio rendering in a horizontally scrolling viewport,
// with a lightweight SVG "rehearsal score" (paged) as the fallback if engraving
// is unavailable. Both show a playhead and the start cue, and clicking seeks.
//
// Zoom: bar geometry is kept in score units (the engraving at 100%). Re-laying out the
// SVG at a new size keeps the notation sharp but takes a few frames for a long song, so
// while a pinch or slider drag is under way the score is only scaled with a CSS
// transform, and it is laid out at the new size once the gesture settles.

interface BarGeometry {
  left: number; right: number; top: number; height: number;
  onsets: Map<number, number>;
  notes: {id: string; start: number; end: number}[];
  /** [beat, x] pairs used to map between time and position. */
  anchors: [number, number][];
}
interface EngravedView {
  song: Song;
  svg: SVGSVGElement;
  /** Unzoomed size of the engraving. */
  width: number; height: number;
  /** The element that holds the SVG and markers, scaled during a live zoom. */
  layer: HTMLElement;
  /** Where the SVG sits inside the layer, in pixels. */
  origin: {x: number; y: number};
  mode: StaffLabelMode;
  measures: Map<string, number>;
  timing: Map<string, {start: number; end: number}>;
  owners: Map<string, {note: Note; track: number}>;
  heads: Map<Note, string[]>;
  active: Set<string>;
  geometry: Map<number, BarGeometry>;
  cueMarker: HTMLElement;
  playheadMarker: HTMLElement;
  /** Playhead position in score units. */
  playheadX?: number;
}

export const minZoom = .4, maxZoom = 3;
const clampZoom = (value: number) => Math.min(maxZoom, Math.max(minZoom, value));

const scoreStart = 69, rightMargin = 14;
let engrave: Engraver | null = null;
let engravedView: EngravedView | undefined;
let scoreWidth = 0, barsPerPage = 4, page = 0;
let onSeek: (seconds: number, setCue: boolean) => void = () => {};
let zoom = clampZoom(Number(readStored('scoreZoom')) || 1);
/** Extra scale shown during a live zoom, on top of the laid-out zoom. */
let liveScale = 1, liveTimer = 0;
let onZoom: (zoom: number) => void = () => {};

function readStored(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

const engravedScore = () => $('engravedScore');
const viewport = () => $('scoreViewport');
const staffMode = () => $<HTMLSelectElement>('staffLabels').value as StaffLabelMode;
const pageFor = (bar: number) => Math.floor(bar / barsPerPage) * barsPerPage;
const barWidth = () => (scoreWidth - scoreStart - rightMargin) / barsPerPage;
const workspace = () => $('scorewrap').closest('.workspace')!;
export const followEnabled = (): boolean => $('followScore').getAttribute('aria-pressed') === 'true';
export const scrubEnabled = (): boolean => $('scrubScore').getAttribute('aria-pressed') === 'true';
export const editEnabled = (): boolean => $('editScore').getAttribute('aria-pressed') === 'true';
let onRendered: () => void = () => {};
/** Calls back after every render, engraved or not (for example to restore the editor's selection). */
export const onScoreRendered = (listener: () => void): void => { onRendered = listener; };

export function setEngraver(engraver: Engraver): void {
  engrave = engraver;
  scoreWidth = 0;
  fitScore();
}

function fitScore() {
  // The fallback score is drawn this many units wide and stretched to fit, which zooms it.
  const width = Math.round($('scorewrap').getBoundingClientRect().width / zoom);
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

/**
 * Renders the selected song (engraved if possible, otherwise the fallback). With
 * `keepView`, a changed song (after an edit) keeps the scroll position of the one before.
 */
export function renderScore(keepView = false): void {
  const song = studio.song;
  if (!song) return;
  if (engrave && scoreWidth) {
    const mode = staffMode();
    if (engravedView?.song === song && engravedView.mode === mode) return;
    try {
      renderEngraved(song, mode, engrave, keepView);
      return;
    } catch (error) {
      console.warn('Engraving fell back to the rehearsal score', error);
    }
  }
  engravedView = undefined;
  viewport().hidden = $('engravedTitle').hidden = true;
  $('score').removeAttribute('hidden');
  renderFallback(song);
  onRendered();
}

function renderEngraved(song: Song, mode: StaffLabelMode, engraver: Engraver, keepView: boolean) {
  const host = engravedScore(), scroller = viewport();
  const previous = engravedView && (engravedView.song === song || keepView) ? engravedView : undefined;
  const scroll = scroller.scrollLeft;
  const index = previous ? scoreBarAtX(scroll / zoom) : 0;
  const offset = previous ? (scroll - previous.geometry.get(index)!.left * zoom) * liveScale : 0;
  // Commit any live zoom still waiting to settle, so its focus point isn't applied to the new layout.
  clearTimeout(liveTimer);
  zoom = clampZoom(zoom * liveScale);
  liveScale = 1;
  const {svg, measures, timing, owners, heads} = engraver(song, mode);
  host.innerHTML = '<div class="score-layer">' + svg + '</div>';
  const layer = host.firstElementChild as HTMLElement, notation = layer.querySelector('svg')!;
  $('engravedTitle').textContent = song.title;
  $('engravedTitle').hidden = false;
  scroller.hidden = false;
  $('score').setAttribute('hidden', '');
  layer.insertAdjacentHTML('beforeend',
    '<div class="score-position cue-marker" aria-hidden="true" hidden><span>Cue</span></div>' +
    '<div class="score-position playhead-marker" aria-hidden="true" hidden></div>');
  engravedView = {
    song, mode, measures, timing, owners, heads, active: new Set(), geometry: new Map(),
    svg: notation, width: notation.viewBox.baseVal.width, height: notation.viewBox.baseVal.height, origin: {x: 0, y: 0},
    layer, cueMarker: layer.querySelector('.cue-marker')!, playheadMarker: layer.querySelector('.playhead-marker')!,
  };
  sizeEngraving(engravedView);
  cacheScorePositions(engravedView, song);
  const kept = engravedView.geometry.get(Math.min(index, engravedView.geometry.size - 1));
  scroller.scrollLeft = previous && kept ? kept.left * zoom + offset : 0;
  updateCursor();
  if (!previous && studio.pos > 0) revealPlayhead(engravedView.playheadX ?? 0);
  updateVisibleBars();
  onRendered();
}

function sizeEngraving(view: EngravedView) {
  view.svg.setAttribute('width', String(view.width * zoom));
  view.svg.setAttribute('height', String(view.height * zoom));
  const svg = view.svg.getBoundingClientRect(), layer = view.layer.getBoundingClientRect();
  view.origin = {x: svg.left - layer.left, y: svg.top - layer.top};
}

/** Finds the bar at x, in score units. */
function scoreBarAtX(x: number): number {
  const geometry = engravedView!.geometry;
  let low = 0, high = geometry.size - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (geometry.get(middle)!.right < x) low = middle + 1; else high = middle;
  }
  return low;
}

/** Enables the scroll arrows only where there is more score to scroll to. */
function updateVisibleBars() {
  if (!engravedView) return;
  const {scrollLeft, clientWidth, scrollWidth} = viewport();
  $<HTMLButtonElement>('prev').disabled = scrollLeft < 1;
  $<HTMLButtonElement>('next').disabled = scrollLeft + clientWidth >= scrollWidth - 1;
}

/** Scrolls so x (in score units) is in view. */
function revealPlayhead(units: number, cancelPan = false) {
  const scroller = viewport(), x = units * zoom;
  const {scrollLeft, clientWidth} = scroller;
  const margin = Math.min(70, clientWidth * .15);
  const outside = x < scrollLeft || x > scrollLeft + clientWidth - margin;
  if (cancelPan || outside) {
    const left = studio.pos === 0 ? 0 : outside ? x - margin : scrollLeft;
    scroller.scrollTo({left, behavior: 'auto'});
  }
}

function cacheScorePositions(view: EngravedView, song: Song) {
  // Measured on screen, then stored relative to the SVG at 100%.
  const svg = view.svg.getBoundingClientRect();
  const host = {left: svg.left, top: svg.top, scale: zoom};
  const unit = (value: number) => value / host.scale;
  for (const [id, index] of view.measures) {
    const measure = $(id);
    const rect = measure.getBoundingClientRect();
    const firstLine = measure.querySelector('.staff > path')?.getBoundingClientRect() ?? rect;
    view.geometry.set(index, {
      left: unit(firstLine.left - host.left), right: unit(firstLine.right - host.left),
      top: unit(rect.top - host.top), height: unit(rect.height), onsets: new Map(), notes: [], anchors: [],
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
    bar.onsets.set(start, unit(left + width / 2 - host.left));
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
  marker.style.transform = 'translate(' + (view.origin.x + x * zoom + offset) + 'px,' + (view.origin.y + bar.top * zoom) + 'px)';
  marker.style.height = bar.height * zoom + 'px';
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

/** The zoom level on screen, including any live zoom in progress. */
export const scoreZoom = (): number => zoom * liveScale;

/** Calls back with the zoom level whenever it changes. */
export function onScoreZoom(listener: (zoom: number) => void): void {
  onZoom = listener;
  listener(zoom);
}

/** Where a screen point falls on the engraving, in score units. */
export function scorePointAt(clientX: number, clientY: number): {x: number; y: number} | undefined {
  if (!engravedView) return;
  const svg = engravedView.svg.getBoundingClientRect();
  return {x: (clientX - svg.left) / scoreZoom(), y: (clientY - svg.top) / scoreZoom()};
}

/**
 * The beat under a screen x position, for scrubbing. Height is ignored and positions
 * before the first bar or after the last are clamped to the start or end of the song.
 */
export function scoreBeatAtX(clientX: number): number | undefined {
  const song = studio.song, view = engravedView;
  if (!song) return;
  if (!view) return fallbackBeatAt(song, clientX, true);
  const svg = view.svg.getBoundingClientRect(), x = (clientX - svg.left) / scoreZoom();
  const last = view.geometry.size - 1, first = view.geometry.get(0), final = view.geometry.get(last);
  if (!first || !final) return;
  if (x <= first.left) return song.bars[0].q;
  if (x >= final.right) return song.bars[last + 1].q;
  const bar = view.geometry.get(scoreBarAtX(x))!;
  return interpolate(bar.anchors, Math.max(bar.left, x), 1);
}

/** The beat at a screen x on the fallback score's current page, or nothing left of the staves unless clamped. */
function fallbackBeatAt(song: Song, clientX: number, clamp: boolean): number | undefined {
  const rect = $('score').getBoundingClientRect();
  if (!rect.width) return;
  const x = (clientX - rect.left) / rect.width * scoreWidth;
  if (x < scoreStart && !clamp) return;
  const count = Math.min(barsPerPage, song.bars.length - 1 - page), w = barWidth();
  const j = Math.min(count - 1, Math.max(0, Math.floor((x - scoreStart) / w)));
  const start = song.bars[page + j].q, length = song.bars[page + j + 1].q - start;
  const ratio = (x - scoreStart - j * w - 14) / (w - 20);
  // Only the song's very end may be reached; elsewhere stay inside this page so a scrub doesn't turn it.
  const end = clamp && page + count >= song.bars.length - 1 && j === count - 1 ? 1 : .999;
  return start + Math.max(0, Math.min(end, ratio)) * length;
}

// ── Editing support: finding notes and staff positions on the engraving ──

/** Whether the engraved score is showing (editing needs it). */
export const scoreEngraved = (): boolean => !!engravedView;

export interface ScoreNoteHit { note: Note; track: number }

/** The engraved note whose head is nearest a screen point, within `radius` pixels. */
export function scoreNoteNear(clientX: number, clientY: number, radius: number): ScoreNoteHit | undefined {
  const view = engravedView;
  if (!view) return;
  const point = scorePointAt(clientX, clientY)!, index = scoreBarAtX(point.x);
  let best: ScoreNoteHit | undefined, bestDistance = radius;
  for (let bar = Math.max(0, index - 1); bar <= index + 1; bar++) {
    const measure = document.getElementById('midi-bar-' + bar);
    if (!measure) continue;
    for (const element of measure.querySelectorAll<SVGGElement>('.note')) {
      const owner = view.owners.get(element.id), head = element.querySelector('.notehead');
      if (!owner || !head) continue;
      const box = head.getBoundingClientRect();
      const distance = Math.hypot(box.left + box.width / 2 - clientX, box.top + box.height / 2 - clientY);
      if (distance < bestDistance) { bestDistance = distance; best = owner; }
    }
  }
  return best;
}

/** The note a lyric drawn on the score belongs to, given the lyric's element or one inside it, and the beat it is sung on. */
export function scoreNoteAtLyric(element: Element): (ScoreNoteHit & {q: number}) | undefined {
  const verse = element.closest('.verse');
  const note = verse?.closest('.note') ?? verse?.closest('.chord')?.querySelector('.note');
  const owner = note && engravedView?.owners.get(note.id);
  return owner ? {...owner, q: engravedView!.timing.get(note.id)?.start ?? owner.note.q} : undefined;
}

/** The beat a drawn notehead starts on: a long or tied note is drawn as several. */
export const scoreHeadOnset = (id: string): number | undefined => engravedView?.timing.get(id)?.start;

/** The note elements that draw a song note. */
export function scoreNoteElements(note: Note): SVGGElement[] {
  return (engravedView?.heads.get(note) ?? []).flatMap(id => {
    const element = document.getElementById(id);
    return element instanceof SVGGElement ? [element] : [];
  });
}

/** Finds the written note drawn for an edit note id. */
export function scoreNoteFromSource(id: number): ScoreNoteHit | undefined {
  const song = engravedView?.song;
  if (!song) return;
  const tracks = writtenTracks(song);
  for (let track = 0; track < tracks.length; track++) {
    const note = tracks[track].notes.find(n => n.src?.includes(id));
    if (note) return {note, track};
  }
}

export interface ScoreStaffHit {
  track: number;
  /** The beat under the pointer, and the bar it is in. */
  beat: number;
  bar: number;
  /** Staff lines and spaces counted up from the top line (0), in half spaces. */
  offset: number;
  /** Distance between staff lines, in screen pixels. */
  spacing: number;
  /** Screen y of the staff's top line. */
  top: number;
}

/** The staff position (track, beat and line or space) under a screen point. */
export function scoreStaffAt(clientX: number, clientY: number): ScoreStaffHit | undefined {
  const song = studio.song, view = engravedView;
  if (!song || !view) return;
  const point = scorePointAt(clientX, clientY)!, index = scoreBarAtX(point.x), bar = view.geometry.get(index);
  const measure = document.getElementById('midi-bar-' + index);
  if (!bar || !measure || point.x < bar.left - 4 || point.x > bar.right + 4) return;
  let best: ScoreStaffHit | undefined, bestDistance = Infinity;
  [...measure.querySelectorAll<SVGGElement>(':scope > .staff')].forEach((staff, track) => {
    const lines = [...staff.children].filter((child): child is SVGPathElement => child instanceof SVGPathElement).slice(0, 5);
    if (lines.length < 5) return;
    const top = lines[0].getBoundingClientRect().top, bottom = lines[4].getBoundingClientRect().top;
    const spacing = (bottom - top) / 4;
    const distance = clientY < top ? top - clientY : clientY > bottom ? clientY - bottom : 0;
    if (distance < bestDistance && distance <= spacing * 4) {
      bestDistance = distance;
      best = {track, beat: interpolate(bar.anchors, Math.max(bar.left, point.x), 1), bar: index,
        offset: Math.round((top - clientY) / (spacing / 2)), spacing, top};
    }
  });
  return best;
}

/** The screen x of a beat on the engraving (between engraved onsets it is an estimate). */
export function scoreXAtBeat(beat: number): number | undefined {
  const song = studio.song, view = engravedView;
  const bar = song && view?.geometry.get(barAt(song, beat));
  if (!view || !bar) return;
  return view.svg.getBoundingClientRect().left + interpolate(bar.anchors, beat, 0) * scoreZoom();
}

/** Scrolls the engraved score sideways by dx pixels; returns whether it moved. */
export function scrollScoreBy(dx: number): boolean {
  if (!engravedView) return false;
  const scroller = viewport(), before = scroller.scrollLeft;
  scroller.scrollLeft = before + dx;
  return scroller.scrollLeft !== before;
}

type ZoomFocus = {clientX: number; clientY: number; point?: {x: number; y: number}};

/** The middle of the visible score, used when zooming with the slider or buttons. */
function visibleMiddle(): ZoomFocus {
  const box = viewport().getBoundingClientRect();
  return {clientX: box.left + box.width / 2, clientY: (Math.max(box.top, 0) + Math.min(box.bottom, innerHeight)) / 2};
}

let saveTimer = 0;
/**
 * Zooms the score. The score point under (clientX, clientY), or the given point, ends
 * up at (clientX, clientY), so pinching zooms around the fingers and follows them.
 * Without a focus it zooms around the middle of the visible score. A live zoom only
 * scales what is already drawn; it is laid out properly when `live` stops arriving.
 */
export function setScoreZoom(next: number, focus?: ZoomFocus, live = false): void {
  const value = clampZoom(next), view = engravedView;
  clearTimeout(liveTimer);
  if (!view) {
    liveScale = 1;
    zoom = value;
    scoreWidth = 0;
    fitScore();
  } else {
    const {clientX, clientY} = focus ?? visibleMiddle();
    const point = focus?.point ?? scorePointAt(clientX, clientY)!;
    if (live) {
      // Scale the layer from its top-left corner, then shift it so the point stays put.
      liveScale = value / zoom;
      const host = engravedScore().getBoundingClientRect();
      const left = host.left + view.layer.offsetLeft, top = host.top + view.layer.offsetTop;
      const x = clientX - left - liveScale * (view.origin.x + point.x * zoom);
      const y = clientY - top - liveScale * (view.origin.y + point.y * zoom);
      view.layer.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + liveScale + ')';
      liveTimer = window.setTimeout(() => setScoreZoom(value, {clientX, clientY, point}), 160);
    } else {
      liveScale = 1;
      view.layer.style.transform = '';
      zoom = value;
      sizeEngraving(view);
      const svg = view.svg.getBoundingClientRect(), scroller = viewport();
      scroller.scrollLeft += svg.left + point.x * zoom - clientX;
      workspace().scrollTop += svg.top + point.y * zoom - clientY;
      updateCursor();
      updateVisibleBars();
    }
  }
  onZoom(value);
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { try { localStorage.setItem('scoreZoom', String(value)); } catch { /* not saved */ } }, 300);
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
  // In scrub mode the pointer handlers in scrub.ts move the playhead instead.
  engravedScore().addEventListener('click', event => {
    const song = studio.song, view = engravedView;
    if (!song || !view || scrubEnabled() || editEnabled()) return;
    const note = (event.target as Element).closest('.note, .chord');
    let beat = note ? view.timing.get(note.id)?.start : undefined;
    if (beat === undefined) {
      const svg = view.svg.getBoundingClientRect();
      const x = (event.clientX - svg.left) / scoreZoom(), y = (event.clientY - svg.top) / scoreZoom();
      const bar = view.geometry.get(scoreBarAtX(x));
      if (!bar || x < bar.left || x > bar.right || y < bar.top || y > bar.top + bar.height) return;
      beat = interpolate(bar.anchors, x, 1);
    }
    onSeek(song.seconds(beat), event.shiftKey);
  });
  $('score').addEventListener('click', event => {
    const song = studio.song;
    if (!song || scrubEnabled() || editEnabled()) return;
    const beat = fallbackBeatAt(song, event.clientX, false);
    if (beat !== undefined) onSeek(song.seconds(beat), event.shiftKey);
  });
}

// ── Fallback "rehearsal score": a simple paged SVG staff per track ──

const letterSteps: Record<string, number> = {C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6};
/** Staff position of a note, spelt for the key: C♯ sits on the C line, D♭ on the D line. */
function noteY(pitch: number, top: number, reference: number, sf: number) {
  const {letter, octave} = spellPitch(pitch, sf), step = octave * 7 + letterSteps[letter];
  return top + 28 - (step - reference) * 3.5;
}

// MIDI note-offs often come slightly early for articulation.
const writtenValues = [4, 3, 2, 1.5, 1, .75, .5, .375, .25, .125];
const writtenLength = (length: number) => writtenValues.reduce((best, value) =>
  Math.abs(Math.log(length / value)) < Math.abs(Math.log(length / best)) ? value : best);
const flagCount = (length: number) => length <= .125 ? 3 : length <= .25 ? 2 : length < 1 ? 1 : 0;

const staffLabel = (pitch: number, key: KeySignature, mode: StaffLabelMode) =>
  mode === 'solfa' ? solfaNames[(pitch - key.tonic + 12) % 12] :
    mode === 'noteOctave' ? pitchNameWithOctave(pitch, key.sf) : pitchName(pitch, key.sf);

interface Stem { note: Note; x: number; y: number; down: boolean; flags: number; beat: number; length: number; endY?: number; next?: Stem; previous?: Stem }

function beamGroups(notes: Note[], bar: Bar, end: number, top: number, reference: number, sfAt: (q: number) => number, xAt: (q: number) => number) {
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
    const y = noteY(note.p, top, reference, sfAt(note.q)), down = y < top + 14;
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
  // Each note is spelt for the key at its onset, matching its staff label, even when the key changes mid-bar.
  const sfAt = (q: number) => song.keyAt(q).sf;
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
      const beams = beamGroups(track.notes, bar, end, top, reference, sfAt, xAt);
      let seen = false;
      for (const note of track.notes) {
        if (note.q >= end) break;
        if (note.q + note.len <= bar.q) continue;
        seen = true;
        const xx = xAt(Math.max(note.q, bar.q)), sf = sfAt(note.q), y = noteY(note.p, top, reference, sf);
        const down = y < top + 14, dy = down ? 22 : -22, stem = xx + (down ? -4.2 : 4.2);
        const len = writtenLength(Math.min(end, note.q + note.len) - Math.max(note.q, bar.q)), beam = beams.get(note);
        for (let ly = top - 7; ly >= y; ly -= 7) s += line(xx - 7, ly, xx + 7, ly);
        for (let ly = top + 35; ly <= y; ly += 7) s += line(xx - 7, ly, xx + 7, ly);
        if (isBlackKey(note.p)) s += '<text x="' + (xx - 13) + '" y="' + (y + 4) + '" font-size="12">' + spellPitch(note.p, sf).accidental + '</text>';
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
  // Scale the height with the zoom too, or `meet` would cap the drawn scale at 1.
  svg.style.height = h * zoom + 'px';
  svg.innerHTML = '<rect width="100%" height="' + h + '" fill="#f5f8fb"/>' + connectors + s +
    '<g id="cueCursor" pointer-events="none"><rect y="5" width="27" height="13" rx="2" fill="#a7410b"/><text x="3" y="15" fill="white" font-size="9">Cue</text><path d="M0 18V' + (h - 10) + '" stroke="#ca5a19" stroke-dasharray="3 3"/></g>' +
    '<g id="cursor" pointer-events="none"><path d="M-4 25h8l-4 6z" fill="#00ad81"/>' + line(0, 30, 0, h - 10, '#00ad81', 1.5) + '</g>';
  $<HTMLButtonElement>('prev').disabled = page === 0;
  $<HTMLButtonElement>('next').disabled = page + count >= bars.length - 1;
  updateCursor();
}
