import { $ } from '../lib/dom';
import { endScrub, prepareScrub, scrubTo } from './playback';
import { scoreBeatAtX, scrollScoreBy, scrubEnabled } from './score';
import { studio } from './state';

// Scrub mode, as in audio and video editors: with the Scrub button on, pressing on the
// score moves the playhead there and sounds the notes under it, and dragging keeps it
// following the pointer. Playback pauses while scrubbing and resumes on release.
//
// Touch: in scrub mode the score only lets the browser pan vertically (touch-action:
// pan-y), so a sideways drag scrubs while an upward or downward swipe still scrolls the
// page. If the browser takes the touch for a scroll, or a second finger starts a pinch
// zoom, the scrub is undone: the playhead goes back to where it was.

export interface ScrubHooks {
  /** Moves the playhead without scrolling the score to it. */
  seek(seconds: number): void;
  setCue(seconds: number): void;
  pause(): void;
  resume(): void;
}

interface Scrub {
  pointer: number;
  clientX: number;
  startX: number;
  /** Where the playhead was, to go back to if the scrub is cancelled. */
  startPos: number;
  wasPlaying: boolean;
  setCue: boolean;
  /** Whether the pointer has moved far enough to be a drag (and to auto-scroll at the edges). */
  dragging: boolean;
}

let scrub: Scrub | undefined;
let hooks: ScrubHooks;
let frame = 0;

function moveTo(clientX: number) {
  const song = studio.song, beat = scoreBeatAtX(clientX);
  if (!song || beat === undefined) return;
  const seconds = Math.min(song.duration, Math.max(0, song.seconds(beat)));
  hooks.seek(seconds);
  scrubTo(studio.pos);
}

/** While dragging near either side of the score, scroll it and keep scrubbing. */
function edgeScroll() {
  frame = 0;
  if (!scrub) return;
  const viewport = $('scoreViewport');
  if (scrub.dragging && !viewport.hidden) {
    const {left, right, width} = viewport.getBoundingClientRect();
    const zone = Math.min(56, width * .12), x = scrub.clientX;
    const depth = x < left + zone ? (x - left - zone) / zone : x > right - zone ? (x - right + zone) / zone : 0;
    if (depth && scrollScoreBy(Math.max(-1, Math.min(1, depth)) * 16)) moveTo(scrub.clientX);
  }
  frame = requestAnimationFrame(edgeScroll);
}

function finish(cancelled: boolean) {
  const ended = scrub;
  if (!ended) return;
  scrub = undefined;
  cancelAnimationFrame(frame);
  frame = 0;
  endScrub();
  if (cancelled) hooks.seek(ended.startPos);
  else if (ended.setCue) hooks.setCue(studio.pos);
  if (ended.wasPlaying) hooks.resume();
}

export function initScrub(scrubHooks: ScrubHooks): void {
  hooks = scrubHooks;
  const area = $('scorewrap'), toggle = $('scrubScore');
  toggle.addEventListener('click', () => {
    const on = !scrubEnabled();
    toggle.setAttribute('aria-pressed', String(on));
    area.classList.toggle('scrub-mode', on);
    if (!on) finish(false);
  });

  area.addEventListener('pointerdown', event => {
    if (!scrubEnabled() || !studio.song) return;
    if (scrub) {
      // A second finger: hand the gesture over to pinch zoom.
      if (event.pointerType === 'touch') finish(true);
      return;
    }
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (scoreBeatAtX(event.clientX) === undefined) return;
    if (event.pointerType !== 'touch') event.preventDefault(); // no text selection while dragging
    scrub = {
      pointer: event.pointerId, clientX: event.clientX, startX: event.clientX, startPos: studio.pos,
      wasPlaying: studio.playing, setCue: event.shiftKey, dragging: false,
    };
    try { area.setPointerCapture(event.pointerId); } catch { /* scrubs without capture */ }
    if (scrub.wasPlaying) hooks.pause();
    moveTo(event.clientX);
    // Audio may need starting first; once it has, sound wherever the playhead is by then.
    prepareScrub().then(() => { if (scrub) scrubTo(studio.pos); }, () => {});
    frame = requestAnimationFrame(edgeScroll);
  });
  area.addEventListener('pointermove', event => {
    if (!scrub || event.pointerId !== scrub.pointer) return;
    scrub.clientX = event.clientX;
    if (Math.abs(event.clientX - scrub.startX) > 6) scrub.dragging = true;
    moveTo(event.clientX);
  });
  area.addEventListener('pointerup', event => {
    if (scrub && event.pointerId === scrub.pointer) finish(false);
  });
  area.addEventListener('pointercancel', event => {
    if (scrub && event.pointerId === scrub.pointer) finish(true);
  });
}
