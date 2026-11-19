'use strict';
(() => {
  const keyboard = $('keys');
  const octave = $('octave');
  const viewport = keyboard.parentElement;
  const gestures = new Map();
  function scrollOctave(direction) {
    const white = keyboard.querySelector('.white');
    if (white) viewport.scrollBy({left: direction * 7 * white.offsetWidth});
  }
  $('lowerKeys').onclick = () => scrollOctave(-1);
  $('higherKeys').onclick = () => scrollOctave(1);
  const shortcuts = 'ZSXDCVGBHNJMQ2W3ER5T6Y7UI';
  const pitches = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const held = new Map();
  const buttons = [];
  const keysByPitch = new Map();
  let painted = new Map();
  function updatePlayback() {
    const sounding = new Map();
    if (playing && ctx.state === 'running') {
      const now = ctx.currentTime;
      for (const voice of voices) {
        if (voice.start > now || voice.end <= now || !playable(voice.track) || mix[voice.track].vol <= 0) continue;
        if (!sounding.has(voice.pitch)) sounding.set(voice.pitch, new Set());
        sounding.get(voice.pitch).add(voice.track);
      }
    }
    const next = new Map();
    for (const [pitch, tracks] of sounding) {
      const ids = [...tracks].sort((a,b) => a-b);
      const signature = ids.join(',');
      next.set(pitch, signature);
      const key = keysByPitch.get(pitch);
      if (!key || painted.get(pitch) === signature) continue;
      const stripes = ids.map((id,i) => colours[id % colours.length] + ' ' +
        (i * 100 / ids.length) + '% ' + ((i + 1) * 100 / ids.length) + '%');
      key.style.setProperty('--parts', 'linear-gradient(90deg,' + stripes.join(',') + ')');
      key.classList.add('sounding');
    }
    for (const pitch of painted.keys()) {
      if (!next.has(pitch)) keysByPitch.get(pitch)?.classList.remove('sounding');
    }
    painted = next;
  }
  setInterval(updatePlayback, 20);
  for (let n = -1; n <= 7; n++) octave.add(new Option('C' + n, n, n === 3, n === 3));

  function release(id) {
    const voice = held.get(id);
    if (!voice) return;
    held.delete(id);
    if (![...held.values()].some(v => v.key === voice.key)) voice.key.classList.remove('held');
    if (!voice.osc) return;
    const now = ctx.currentTime;
    voice.amp.gain.cancelScheduledValues(now);
    voice.amp.gain.setTargetAtTime(.0001, now, .015);
    voice.osc.stop(now + .09);
  }

  async function press(id, key) {
    if (held.has(id)) return;
    const voice = {key};
    held.set(id, voice);
    key.classList.add('held');
    try {
      await enableAudio();
      if (held.get(id) !== voice) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator(), amp = ctx.createGain();
      voice.osc = osc;
      voice.amp = amp;
      osc.type = 'triangle';
      osc.frequency.value = 440 * 2 ** ((Number(key.dataset.pitch) - 69) / 12);
      amp.gain.setValueAtTime(.0001, now);
      amp.gain.exponentialRampToValueAtTime(.21, now + .009);
      amp.gain.setTargetAtTime(.075, now + .01, .45);
      osc.connect(amp).connect(master);
      osc.onended = () => {osc.disconnect(); amp.disconnect()};
      osc.start(now);
    } catch (error) {
      release(id);
      $('status').textContent = error.message;
    }
  }

  function releaseAll() { for (const id of held.keys()) release(id) }
  function build() {
    releaseAll();
    keyboard.replaceChildren();
    buttons.length = 0;
    keysByPitch.clear();
    painted.clear();
    const start = (Number(octave.value) + 1) * 12;
    const range = Array.from({length:132}, (_,pitch) => pitch);
    const whites = 77;
    keyboard.style.width = 'calc(var(--white-key-width) * ' + whites + ')';
    let whiteCount = 0;
    range.forEach(midi => {
      const i = midi-start, letter = shortcuts[i] || "";
      const pitch = pitches[midi % 12], sharp = pitch.includes('♯');
      const name = pitch + (Math.floor(midi / 12) - 1);
      const key = document.createElement('button');
      key.type = 'button';
      key.className = sharp ? 'black' : 'white';
      key.dataset.pitch = midi;
      keysByPitch.set(midi, key);
      key.setAttribute('aria-label', name + (letter ? ', shortcut ' + letter : ''));
      key.innerHTML = '<strong>' + name + '</strong><small>' + letter + '</small>';
      if (sharp) {key.style.left = whiteCount / whites * 100 + '%'; key.style.width = 64 / whites + '%'}
      else whiteCount++;
      key.onpointerdown = e => {
        if (e.button !== 0) return;
        e.preventDefault();
        key.setPointerCapture(e.pointerId);
        gestures.set(e.pointerId, {x:e.clientX, left:viewport.scrollLeft, dragging:false});
        press(e.pointerId, key);
      };
      key.onpointermove = e => {
        const gesture = gestures.get(e.pointerId);
        if (!gesture || gestures.size !== 1) return;
        const distance = e.clientX - gesture.x;
        if (!gesture.dragging && Math.abs(distance) < 7) return;
        gesture.dragging = true;
        release(e.pointerId);
        viewport.scrollLeft = gesture.left - distance;
      };
      key.onpointerup = key.onpointercancel = key.onlostpointercapture = e => {
        gestures.delete(e.pointerId);
        release(e.pointerId);
      };
      key.onclick = e => {
        if (e.detail !== 0) return;
        const id = Symbol();
        press(id, key);
        setTimeout(() => release(id), 400);
      };
      if (letter) buttons[i] = key;
      keyboard.append(key);
    });
    const first = keysByPitch.get(start);
    viewport.scrollLeft = first.offsetLeft;
  }
  window.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing ||
        e.target.closest?.('input,select,textarea,[contenteditable="true"]')) return;
    const i = e.key.length === 1 ? shortcuts.indexOf(e.key.toUpperCase()) : -1;
    if (i < 0) return;
    e.preventDefault();
    if (!e.repeat) press(e.code, buttons[i]);
  });
  window.addEventListener('keyup', e => release(e.code));
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {if (document.hidden) releaseAll()});
  viewport.addEventListener('wheel', e => {
    if(e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    const old = viewport.scrollLeft;
    viewport.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewport.clientWidth : 1);
    if(viewport.scrollLeft !== old)e.preventDefault();
  }, {passive:false});
  octave.onchange = build;
  build();
})();
