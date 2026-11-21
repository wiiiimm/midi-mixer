import { $ } from '../lib/dom';
import { maxZoom, minZoom, onScoreZoom, scorePointAt, scoreZoom, setScoreZoom } from '../studio/score';

// Score zoom input: pinch on touch screens, trackpad pinch or Ctrl+wheel on computers,
// and on wider screens a zoom slider with − and + buttons. While a gesture is under way
// the score is zoomed live (scaled, at most once per frame) and laid out sharply at the
// end; the score module also settles a live zoom on its own once input stops.

const step = 1.25;
// The slider is logarithmic, so each step looks the same whether zoomed in or out.
const toSlider = (zoom: number) => Math.round(Math.log2(zoom) * 100);
const fromSlider = (value: number) => 2 ** (value / 100);

type Focus = Parameters<typeof setScoreZoom>[1];
let pending: {zoom: number; focus: Focus} | undefined, frame = 0;
function zoomLive(zoom: number, focus?: Focus) {
  pending = {zoom, focus};
  frame ||= requestAnimationFrame(() => {
    frame = 0;
    if (pending) setScoreZoom(pending.zoom, pending.focus, true);
    pending = undefined;
  });
}
/** Ends a gesture: applies any queued step, then lays the score out at its final size. */
function settle(focus?: Focus) {
  cancelAnimationFrame(frame);
  frame = 0;
  const target = pending?.zoom ?? scoreZoom();
  pending = undefined;
  setScoreZoom(target, focus);
}

export function initScoreZoom(): void {
  const area = $('scorewrap');
  const slider = $<HTMLInputElement>('scoreZoom'), reset = $('zoomReset');
  slider.min = String(toSlider(minZoom));
  slider.max = String(toSlider(maxZoom));
  onScoreZoom(zoom => {
    const percent = Math.round(zoom * 100) + '%';
    slider.value = String(toSlider(zoom));
    slider.setAttribute('aria-valuetext', percent);
    reset.textContent = percent;
    $<HTMLButtonElement>('zoomOut').disabled = zoom <= minZoom + 1e-6;
    $<HTMLButtonElement>('zoomIn').disabled = zoom >= maxZoom - 1e-6;
  });
  slider.addEventListener('input', () => zoomLive(fromSlider(Number(slider.value))));
  slider.addEventListener('change', () => settle());
  $('zoomOut').addEventListener('click', () => setScoreZoom(scoreZoom() / step));
  $('zoomIn').addEventListener('click', () => setScoreZoom(scoreZoom() * step));
  reset.addEventListener('click', () => setScoreZoom(1));

  // Two-finger pinch. The score point first under the fingers stays under them,
  // so moving both fingers pans while pinching.
  let pinch: {distance: number; zoom: number; point: {x: number; y: number}; focus?: Focus} | undefined;
  const middle = (touches: TouchList) => ({
    clientX: (touches[0].clientX + touches[1].clientX) / 2,
    clientY: (touches[0].clientY + touches[1].clientY) / 2,
  });
  const spread = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  area.addEventListener('touchstart', event => {
    if (event.touches.length !== 2) return;
    const {clientX, clientY} = middle(event.touches), point = scorePointAt(clientX, clientY);
    pinch = point && {distance: spread(event.touches) || 1, zoom: scoreZoom(), point};
  }, {passive: true});
  area.addEventListener('touchmove', event => {
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    pinch.focus = {...middle(event.touches), point: pinch.point};
    zoomLive(pinch.zoom * spread(event.touches) / pinch.distance, pinch.focus);
  }, {passive: false});
  const endPinch = (event: TouchEvent) => {
    if (!pinch || event.touches.length >= 2) return;
    const {focus} = pinch;
    pinch = undefined;
    settle(focus);
  };
  area.addEventListener('touchend', endPinch);
  area.addEventListener('touchcancel', endPinch);

  // Trackpad pinch arrives as Ctrl+wheel in Chrome, Edge and Firefox.
  area.addEventListener('wheel', event => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const lines = event.deltaMode === 1 ? 16 : 1;
    zoomLive((pending?.zoom ?? scoreZoom()) * Math.exp(-event.deltaY * lines * .01), {clientX: event.clientX, clientY: event.clientY});
  }, {passive: false});

  // Safari reports trackpad pinches as gesture events instead. On iPhone and iPad these
  // also fire for touch pinches, which the touch handlers above already zoom, so there
  // they only stop the whole page from zooming.
  interface GestureEvent extends UIEvent { scale: number; clientX: number; clientY: number }
  let gestureStart = 1;
  area.addEventListener('gesturestart', event => {
    event.preventDefault();
    gestureStart = scoreZoom();
  });
  area.addEventListener('gesturechange', event => {
    event.preventDefault();
    if (pinch) return;
    const gesture = event as GestureEvent;
    zoomLive(gestureStart * gesture.scale, {clientX: gesture.clientX, clientY: gesture.clientY});
  });
  area.addEventListener('gestureend', event => {
    event.preventDefault();
    if (!pinch && pending) settle(pending.focus);
  });
}
