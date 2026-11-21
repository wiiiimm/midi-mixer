import { currentAudio, enableAudio, startSynthHold } from '../audio/engine';
import { gmNames, loadInstrument, playSample } from '../audio/sampler';
import { $ } from '../lib/dom';
import { shortcutsBlocked } from '../lib/shortcuts';
import { octaveOf, sharpNames, trackColours } from '../lib/notes';
import type { StoppableVoice } from '../lib/types';
import { playable, playbackVoices } from '../studio/playback';
import { PITCH_HEARD } from './pitch-detector';
import { studio } from '../studio/state';

// Sound-check piano: the full MIDI range in a horizontally scrolling keyboard,
// playable by pointer, touch or computer keys, which also lights up the notes
// that playback is sounding, striped in each track's colour.

interface HeldKey { key: HTMLElement; voice?: StoppableVoice }

const shortcuts = "AWSEDFTGYHUJKOLP;'";
const shortcutCodes = [...shortcuts].map(key => ({';': 'Semicolon', "'": 'Quote'} as Record<string, string>)[key] ?? 'Key' + key);
const WHITE_KEYS = 77;
const MIDDLE_C = 60;

export function initPiano(): void {
  const keyboard = $('keys'), viewport = keyboard.parentElement!;
  const octave = $<HTMLSelectElement>('octave'), voiceSelect = $<HTMLSelectElement>('pianoVoice'), sustain = $('sustain');
  const piano = keyboard.closest<HTMLElement>('.piano')!;
  const held = new Map<unknown, HeldKey>(), sustained = new Map<HTMLElement, HeldKey>();
  const gestures = new Map<number, {x: number; left: number; dragging: boolean}>();
  const buttons: HTMLElement[] = [], keysByPitch = new Map<number, HTMLElement>();
  let sustainEnabled = false;

  // ── Octave buttons glide to the next/previous C; the label shows the visible range ──
  const cKeys = () => [...keyboard.querySelectorAll<HTMLElement>('.white')].filter(k => Number(k.dataset.pitch) % 12 === 0);
  let goal: number | null = null, goalTimer: ReturnType<typeof setTimeout> | undefined;
  // Until the player scrolls, keep middle C centred, even if layout settles after start-up.
  let autoCentre = true;
  function centreMiddleC(behavior: ScrollBehavior = 'auto') {
    const key = keysByPitch.get(MIDDLE_C);
    if (!key || !viewport.clientWidth) return;
    clearTimeout(goalTimer);
    goal = null;
    viewport.scrollTo({left: key.offsetLeft + key.offsetWidth / 2 - viewport.clientWidth / 2, behavior});
  }
  function scrollOctave(direction: number) {
    autoCentre = false;
    const left = goal ?? viewport.scrollLeft, keys = cKeys();
    const target = direction > 0 ? keys.find(k => k.offsetLeft > left + 2) : keys.findLast(k => k.offsetLeft < left - 2);
    goal = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth,
      target ? target.offsetLeft : (direction > 0 ? viewport.scrollWidth : 0)));
    viewport.scrollTo({left: goal, behavior: 'smooth'});
    clearTimeout(goalTimer);
    goalTimer = setTimeout(() => { goal = null; }, 700); // clicks during a glide stack up
  }
  function updateRange() {
    const left = viewport.scrollLeft, right = left + viewport.clientWidth;
    const visible = [...keyboard.querySelectorAll<HTMLElement>('.white')]
      .filter(k => k.offsetLeft >= left - 1 && k.offsetLeft + k.offsetWidth <= right + 1);
    if (!visible.length) return;
    const lo = Number(visible[0].dataset.pitch), hi = Number(visible[visible.length - 1].dataset.pitch);
    $('keysRange').textContent = sharpNames[lo % 12] + octaveOf(lo) + '–' + sharpNames[hi % 12] + octaveOf(hi);
    $<HTMLButtonElement>('lowerKeys').disabled = left <= 1;
    $<HTMLButtonElement>('higherKeys').disabled = right >= viewport.scrollWidth - 1;
  }
  let rangeFrame = 0;
  viewport.addEventListener('scroll', () => { cancelAnimationFrame(rangeFrame); rangeFrame = requestAnimationFrame(updateRange); }, {passive: true});
  new ResizeObserver(() => {
    if (autoCentre) centreMiddleC();
    updateRange();
  }).observe(viewport);
  $('lowerKeys').addEventListener('click', () => scrollOctave(-1));
  $('higherKeys').addEventListener('click', () => scrollOctave(1));
  $('centreKeys').addEventListener('click', () => centreMiddleC('smooth'));

  // All 128 General MIDI sounds (the drum kit is for MIDI percussion tracks only).
  gmNames.forEach((name, index) => voiceSelect.add(new Option(name, String(index))));
  voiceSelect.addEventListener('input', () => loadInstrument(Number(voiceSelect.value)));
  loadInstrument(0);
  for (let n = -1; n <= 7; n++) octave.add(new Option('C' + n, String(n), n === 3, n === 3));

  // ── Light up keys that playback is sounding ──
  let painted = new Map<number, string>();
  function paintPlayback() {
    const sounding = new Map<number, Set<number>>(), audio = currentAudio();
    if (studio.playing && audio?.ctx.state === 'running') {
      const now = audio.ctx.currentTime;
      for (const voice of playbackVoices()) {
        if (voice.start > now || voice.end <= now || !playable(voice.track) || studio.mix[voice.track].vol <= 0) continue;
        if (!sounding.has(voice.pitch)) sounding.set(voice.pitch, new Set());
        sounding.get(voice.pitch)!.add(voice.track);
      }
    }
    const next = new Map<number, string>();
    for (const [pitch, tracks] of sounding) {
      const ids = [...tracks].sort((a, b) => a - b), signature = ids.join(',');
      next.set(pitch, signature);
      const key = keysByPitch.get(pitch);
      if (!key || painted.get(pitch) === signature) continue;
      const stripes = ids.map((id, i) => trackColours[id % trackColours.length] + ' ' + (i * 100 / ids.length) + '% ' + ((i + 1) * 100 / ids.length) + '%');
      key.style.setProperty('--parts', 'linear-gradient(90deg,' + stripes.join(',') + ')');
      key.classList.add('sounding');
    }
    for (const pitch of painted.keys()) if (!next.has(pitch)) keysByPitch.get(pitch)?.classList.remove('sounding');
    painted = next;
  }
  setInterval(paintPlayback, 20);

  // ── Light up the note the pitch detector hears, while the keyboard is on display ──
  let heard: number | null = null;
  function paintHeard() {
    keyboard.querySelector('.heard')?.classList.remove('heard');
    if (heard !== null && !piano.hidden) keysByPitch.get(heard)?.classList.add('heard');
  }
  document.addEventListener(PITCH_HEARD, e => {
    heard = (e as CustomEvent<number | null>).detail;
    paintHeard();
  });

  // ── Playing notes ──
  const isHeld = (key: HTMLElement) => [...held.values()].some(h => h.key === key);
  function stop(note: HeldKey) {
    if (!isHeld(note.key) && !sustained.has(note.key)) note.key.classList.remove('held');
    note.voice?.stop();
  }
  function release(id: unknown, keepSustain = false) {
    const note = held.get(id);
    if (!note) return;
    held.delete(id);
    if (keepSustain && sustainEnabled && !isHeld(note.key)) sustained.set(note.key, note);
    else stop(note);
  }
  function clearSustained() {
    for (const [key, note] of sustained) {
      sustained.delete(key);
      stop(note);
    }
  }
  function releaseAll() {
    clearSustained();
    for (const id of [...held.keys()]) release(id);
  }
  async function press(id: unknown, key: HTMLElement | undefined) {
    if (!key || held.has(id)) return;
    const program = Number(voiceSelect.value), pitch = Number(key.dataset.pitch);
    const note: HeldKey = {key};
    held.set(id, note);
    const previous = sustained.get(key);
    if (previous) {
      sustained.delete(key);
      stop(previous);
    }
    key.classList.add('held');
    try {
      const {ctx, master} = await enableAudio();
      if (held.get(id) !== note && sustained.get(key) !== note) return;
      note.voice = playSample(ctx, program, pitch, .8, ctx.currentTime, null, master) ?? undefined;
      if (note.voice) return;
      loadInstrument(program);
      note.voice = startSynthHold(ctx, program, pitch, master);
    } catch (error) {
      if (held.get(id) === note) release(id);
      if (sustained.get(key) === note) {
        sustained.delete(key);
        stop(note);
      }
      $('status').textContent = error instanceof Error ? error.message : String(error);
    }
  }
  sustain.addEventListener('click', () => {
    sustainEnabled = !sustainEnabled;
    sustain.setAttribute('aria-pressed', String(sustainEnabled));
    if (!sustainEnabled) clearSustained();
  });

  // ── Keyboard layout ──
  function build(centre = false) {
    releaseAll();
    keyboard.replaceChildren();
    buttons.length = 0;
    keysByPitch.clear();
    painted.clear();
    const start = (Number(octave.value) + 1) * 12;
    keyboard.style.width = 'calc(var(--white-key-width) * ' + WHITE_KEYS + ')';
    let whiteCount = 0;
    for (let midi = 0; midi < 132; midi++) {
      const i = midi - start, letter = shortcuts[i] || '';
      const name = sharpNames[midi % 12], sharp = name.includes('♯');
      const key = document.createElement('button');
      key.type = 'button';
      key.className = sharp ? 'black' : 'white';
      key.dataset.pitch = String(midi);
      keysByPitch.set(midi, key);
      key.setAttribute('aria-label', name + octaveOf(midi) + (letter ? ', shortcut ' + letter : ''));
      key.innerHTML = '<strong>' + name + '</strong><small>' + letter + '</small>';
      if (sharp) {
        key.style.left = whiteCount / WHITE_KEYS * 100 + '%';
        key.style.width = 64 / WHITE_KEYS + '%';
      } else whiteCount++;
      key.onpointerdown = e => {
        if (e.button !== 0) return;
        e.preventDefault();
        key.setPointerCapture(e.pointerId);
        gestures.set(e.pointerId, {x: e.clientX, left: viewport.scrollLeft, dragging: false});
        press(e.pointerId, key);
      };
      // Dragging sideways scrolls the keyboard instead of playing.
      key.onpointermove = e => {
        const gesture = gestures.get(e.pointerId);
        if (!gesture || gestures.size !== 1) return;
        const distance = e.clientX - gesture.x;
        if (!gesture.dragging && Math.abs(distance) < 7) return;
        gesture.dragging = true;
        autoCentre = false;
        release(e.pointerId);
        viewport.scrollLeft = gesture.left - distance;
      };
      key.onpointerup = key.onpointercancel = key.onlostpointercapture = e => {
        gestures.delete(e.pointerId);
        release(e.pointerId, e.type === 'pointerup');
      };
      // Keyboard activation (Enter/Space on a focused key).
      key.onclick = e => {
        if (e.detail !== 0) return;
        const id = Symbol();
        press(id, key);
        setTimeout(() => release(id, true), 400);
      };
      if (letter) buttons[i] = key;
      keyboard.append(key);
    }
    paintHeard();
    if (centre) {
      centreMiddleC();
      return;
    }
    // Choosing a shortcut octave jumps to it, so drop any glide target from earlier clicks.
    autoCentre = false;
    clearTimeout(goalTimer);
    goal = null;
    viewport.scrollLeft = keysByPitch.get(start)!.offsetLeft;
  }

  // Computer keys: A–' play notes, Z/X shift the shortcut octave.
  window.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || shortcutsBlocked(e)) return;
    if (e.shiftKey || piano.hidden) return;
    if (e.code === 'KeyZ' || e.code === 'KeyX') {
      e.preventDefault();
      if (e.repeat) return;
      const index = octave.selectedIndex + (e.code === 'KeyZ' ? -1 : 1);
      if (index >= 0 && index < octave.options.length) {
        octave.selectedIndex = index;
        build();
      }
      return;
    }
    const i = shortcutCodes.indexOf(e.code);
    if (i < 0) return;
    e.preventDefault();
    if (!e.repeat) press(e.code, buttons[i]);
  });
  window.addEventListener('keyup', e => release(e.code, true));
  $('keytoggle').addEventListener('click', () => {
    if (piano.hidden) releaseAll();
    paintHeard();
  });
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  // A vertical mouse wheel scrolls the keyboard sideways.
  viewport.addEventListener('wheel', e => {
    if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    const old = viewport.scrollLeft;
    viewport.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewport.clientWidth : 1);
    if (viewport.scrollLeft !== old) {
      autoCentre = false;
      e.preventDefault();
    }
  }, {passive: false});
  // Native scrolling (trackpad, scrollbar) also counts as the player taking over.
  viewport.addEventListener('pointerdown', () => { autoCentre = false; });
  viewport.addEventListener('wheel', () => { autoCentre = false; }, {passive: true});
  // A long press on a key must not open the iOS magnifier, text selection or callout menu.
  // Keys already disable native panning (touch-action: none), and pointer events still fire.
  keyboard.addEventListener('touchstart', e => { if (e.cancelable) e.preventDefault(); }, {passive: false});
  keyboard.addEventListener('contextmenu', e => e.preventDefault());
  keyboard.addEventListener('selectstart', e => e.preventDefault());
  octave.addEventListener('change', () => build());
  build(true);
}
