import { enableAudio } from '../audio/engine';
import { $ } from '../lib/dom';
import { octaveOf, sharpNames } from '../lib/notes';
import { detectPitch, median, midiOf, nearestNote } from '../lib/pitch';
import { registerFloatingWindow } from '../ui/floating-windows';

// Pitch detector: listens through the microphone and shows the nearest note, how many
// cents sharp or flat the singer is, and a trail of the last few seconds of pitch.

const IN_TUNE = 10, CLOSE = 25;           // cents
const TRAIL_SECONDS = 5;
const SMOOTHING = 9;                      // readings in the running median (~150 ms, steadies vibrato)
const SILENCE_MS = 180;                   // gap before the readout shows no note

type Tone = 'good' | 'close' | 'off';
const toneOf = (cents: number): Tone => Math.abs(cents) <= IN_TUNE ? 'good' : Math.abs(cents) <= CLOSE ? 'close' : 'off';
const colours: Record<Tone, string> = {good: '#30d158', close: '#ffd60a', off: '#ff9f0a'};
const noteName = (note: number) => sharpNames[note % 12] + octaveOf(note);
const spokenName = (note: number) => sharpNames[note % 12].replace('♯', ' sharp') + ' ' + octaveOf(note);

interface Listening { stream: MediaStream; source: MediaStreamAudioSourceNode; analyser: AnalyserNode; frame: number }

export function initPitchDetector(): void {
  const panel = $<HTMLDialogElement>('pitchDetector'), listen = $('pitchListen');
  const canvas = $<HTMLCanvasElement>('pitchTrail'), needle = $('pitchNeedle');
  let active: Listening | undefined, generation = 0;
  let recent: number[] = [], lastHeard = 0, announced = {note: -1, at: 0};
  const trail: {t: number; midi: number | null}[] = [];

  function showReading(midi: number | null) {
    if (midi === null) {
      $('pitchNote').textContent = '–';
      $('pitchHz').textContent = '';
      $('pitchVerdict').textContent = active ? 'Listening…' : 'Not listening';
      panel.dataset.tone = '';
      needle.style.left = '50%';
      return;
    }
    const {note, cents} = nearestNote(midi), tone = toneOf(cents), off = Math.round(Math.abs(cents));
    $('pitchNote').textContent = noteName(note);
    $('pitchHz').textContent = (440 * 2 ** ((midi - 69) / 12)).toFixed(1) + ' Hz';
    $('pitchVerdict').textContent = tone === 'good' ? 'In tune' : off + '¢ ' + (cents < 0 ? 'flat' : 'sharp');
    panel.dataset.tone = tone;
    needle.style.left = 50 + Math.max(-50, Math.min(50, cents)) + '%';
    // Screen readers hear the note when it settles, at most once a second.
    const now = performance.now();
    if (note !== announced.note && now - announced.at > 1000) {
      announced = {note, at: now};
      $('pitchStatus').textContent = spokenName(note) + ', ' + $('pitchVerdict').textContent;
    }
  }

  function drawTrail(now: number) {
    const dpr = window.devicePixelRatio || 1, width = canvas.clientWidth, height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    while (trail.length && trail[0].t < now - TRAIL_SECONDS * 1000) trail.shift();
    const heard = trail.flatMap(p => p.midi === null ? [] : [p.midi]);
    // Follow the singer: show the notes sung recently, at least 7 semitones tall.
    let lo = heard.length ? Math.floor(Math.min(...heard)) - 1 : 57, hi = heard.length ? Math.ceil(Math.max(...heard)) + 1 : 64;
    if (hi - lo < 7) { const pad = (7 - (hi - lo)) / 2; lo = Math.floor(lo - pad); hi = Math.ceil(hi + pad); }
    const labelWidth = 30, plot = width - labelWidth;
    const y = (midi: number) => height - 4 - (midi - lo) / (hi - lo) * (height - 8);
    const x = (t: number) => labelWidth + plot * (1 - (now - t) / (TRAIL_SECONDS * 1000));
    g.font = '10px -apple-system, system-ui, sans-serif';
    g.textBaseline = 'middle';
    let lastLabel = Infinity;
    for (let note = lo; note <= hi; note++) {
      const natural = !sharpNames[note % 12].includes('♯'), at = y(note);
      g.strokeStyle = natural ? '#3a3a3c' : '#2a2a2c';
      g.beginPath(); g.moveTo(labelWidth, at); g.lineTo(width, at); g.stroke();
      // Label natural notes that fit: inside the canvas and clear of the label below.
      if (natural && at > 6 && at < height - 6 && lastLabel - at >= 12) {
        g.fillStyle = '#8e8e93';
        g.fillText(noteName(note), 0, at);
        lastLabel = at;
      }
    }
    g.lineWidth = 2.5;
    g.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      if (a.midi === null || b.midi === null || Math.abs(a.midi - b.midi) > 1.5) continue;
      g.strokeStyle = colours[toneOf(nearestNote(b.midi).cents)];
      g.beginPath(); g.moveTo(x(a.t), y(a.midi)); g.lineTo(x(b.t), y(b.midi)); g.stroke();
    }
    g.lineWidth = 1;
  }

  function tick(samples: Float32Array<ArrayBuffer>) {
    if (!active) return;
    active.analyser.getFloatTimeDomainData(samples);
    const now = performance.now();
    const reading = detectPitch(samples, active.analyser.context.sampleRate);
    let midi: number | null = null;
    if (reading) {
      const raw = midiOf(reading.hz);
      // A jump of more than a semitone starts a new note, so smoothing doesn't lag behind it.
      if (recent.length && Math.abs(raw - recent[recent.length - 1]) > 1) recent = [];
      recent.push(raw);
      if (recent.length > SMOOTHING) recent.shift();
      midi = median(recent);
      lastHeard = now;
    } else if (now - lastHeard > SILENCE_MS) recent = [];
    trail.push({t: now, midi});
    if (midi !== null || now - lastHeard > SILENCE_MS) showReading(midi);
    drawTrail(now);
    active.frame = requestAnimationFrame(() => tick(samples));
  }

  function stop() {
    generation++;
    if (active) {
      cancelAnimationFrame(active.frame);
      active.source.disconnect();
      active.stream.getTracks().forEach(track => track.stop());
    }
    active = undefined;
    recent = [];
    listen.textContent = 'Start listening';
    panel.classList.remove('listening');
    showReading(null);
  }

  async function start() {
    const request = ++generation;
    $('pitchError').textContent = '';
    if (!navigator.mediaDevices?.getUserMedia) {
      $('pitchError').textContent = 'This browser can only use the microphone on a secure (https) page.';
      return;
    }
    listen.textContent = 'Starting…';
    try {
      const {ctx} = await enableAudio();
      // Raw input: echo cancellation and noise suppression bend sustained notes.
      const stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}});
      if (request !== generation || !panel.open) { stream.getTracks().forEach(track => track.stop()); return; }
      const source = ctx.createMediaStreamSource(stream), analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      active = {stream, source, analyser, frame: 0};
      trail.length = 0;
      listen.textContent = 'Stop listening';
      panel.classList.add('listening');
      showReading(null);
      tick(new Float32Array(analyser.fftSize));
    } catch (error) {
      if (request !== generation) return;
      const name = error instanceof DOMException ? error.name : '';
      $('pitchError').textContent =
        name === 'NotAllowedError' ? 'Microphone access is blocked. Allow it in your browser’s site settings, then try again.' :
        name === 'NotFoundError' ? 'No microphone was found.' :
        name === 'NotReadableError' ? 'The microphone is being used by another app.' :
        error instanceof Error ? error.message : String(error);
      listen.textContent = 'Start listening';
    }
  }

  listen.addEventListener('click', () => active ? stop() : start());
  registerFloatingWindow({panel, opener: $('openPitch'), onClose: stop});
  // Release the microphone whenever the page is hidden, so the recording indicator goes away.
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  showReading(null);
  drawTrail(performance.now());
}
