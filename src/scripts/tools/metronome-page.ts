import { makeClick } from '../audio/click';
import { $ } from '../lib/dom';

// Standalone metronome (metronome.html), also shown inside the studio's floating
// metronome window. Clicks are scheduled ahead on the audio clock; the beat lights
// follow on timers.

let audio: AudioContext | undefined, running = false, nextTime = 0, beat = 0, generation = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const clicks = new Set<OscillatorNode>(), lights = new Set<ReturnType<typeof setTimeout>>();
const field = (id: string) => $<HTMLInputElement>(id);
const meter = () => Number($<HTMLSelectElement>('meter').value);

function drawLights(active = -1) {
  $('lights').innerHTML = Array.from({length: meter()}, (_, i) => i === active ? '<i class="active"></i>' : '<i></i>').join('');
}

function schedule() {
  if (!audio) return;
  if (nextTime < audio.currentTime - .05) nextTime = audio.currentTime;
  while (nextTime < audio.currentTime + .12) {
    const current = beat, when = Math.max(audio.currentTime, nextTime);
    const tick = makeClick(audio, audio.destination, when, current === 0);
    clicks.add(tick);
    tick.addEventListener('ended', () => clicks.delete(tick), {once: true});
    const light = setTimeout(() => { lights.delete(light); drawLights(current); }, Math.max(0, (when - audio.currentTime) * 1000));
    lights.add(light);
    nextTime += 60 / Number(field('slider').value);
    beat = (beat + 1) % meter();
  }
}

function stop() {
  generation++;
  running = false;
  clearInterval(timer);
  for (const tick of clicks) tick.stop();
  clicks.clear();
  for (const id of lights) clearTimeout(id);
  lights.clear();
  drawLights();
  $('start').textContent = '▶ Start';
}

async function start() {
  running = true;
  const token = ++generation;
  try {
    audio ??= new (window.AudioContext ?? (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext)();
    await audio.resume();
    if (token !== generation) return;
    nextTime = audio.currentTime + .02;
    beat = 0;
    schedule();
    timer = setInterval(schedule, 25);
    $('start').textContent = '■ Stop';
  } catch (error) {
    stop();
    $('error').textContent = error instanceof Error ? error.message : String(error);
  }
}

$('start').addEventListener('click', () => running ? stop() : start());
const embedded = window.parent !== window && new URLSearchParams(location.search).has('embedded');

function setBpm(value: unknown) {
  const bpm = String(Math.max(30, Math.min(190, Math.round(Number(value)) || 95)));
  field('slider').value = field('bpm').value = bpm;
  return Number(bpm);
}

/** Tells the studio about a tempo the user chose, so it survives reopening the window. */
function reportBpm() {
  if (embedded) window.parent.postMessage({type: 'metronome-bpm-changed', bpm: Number(field('slider').value)}, location.origin);
}

field('slider').addEventListener('input', () => { field('bpm').value = field('slider').value; });
field('slider').addEventListener('change', reportBpm);
field('bpm').addEventListener('change', () => { setBpm(field('bpm').value); reportBpm(); });
$('meter').addEventListener('change', () => { beat = 0; drawLights(); });
window.addEventListener('pagehide', stop);
drawLights();

// The studio passes the song's opening tempo in the URL, and a new one when the song changes.
const initialBpm = new URLSearchParams(location.search).get('bpm');
if (initialBpm !== null) setBpm(initialBpm);

if (embedded) {
  document.body.classList.add('embedded');
  window.addEventListener('keydown', e => { if (e.key === 'Escape') window.parent.postMessage('close-metronome', location.origin); });
  window.addEventListener('message', e => {
    if (e.source === window.parent && e.origin === location.origin && e.data?.type === 'metronome-set-bpm') setBpm(e.data.bpm);
  });
}
