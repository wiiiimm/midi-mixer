import { currentAudio, enableAudio } from '../audio/engine';
import { $ } from '../lib/dom';
import { frequencyOf, octaveOf, pitchName, pitchNameWithOctave, spokenPitchName } from '../lib/notes';
import { currentKey, onKeyChange } from '../studio/key';
import { registerFloatingWindow } from '../ui/floating-windows';

// Tuning fork: a pure sine tone, chosen from a one-octave keyboard plus an
// octave stepper (C2–B6). Arrow keys move by a semitone or an octave. Black keys are
// named as sharps or flats to match the key of the selected song.

const LOWEST = 36, HIGHEST = 95;
const whiteIndex: Record<number, number> = {0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6};

export function initTuningFork(): void {
  const pitch = $<HTMLSelectElement>('tuningPitch'), play = $('tuningPlay');
  const panel = $<HTMLDialogElement>('tuningFork'), keys = $('tuningKeys');
  let tone: {osc: OscillatorNode; gain: GainNode} | undefined, generation = 0;

  for (let note = LOWEST; note <= HIGHEST; note++) {
    pitch.add(new Option(pitchNameWithOctave(note), String(note), note === 69, note === 69));
  }
  for (let pc = 0; pc < 12; pc++) {
    const key = document.createElement('button'), black = !(pc in whiteIndex);
    key.type = 'button';
    key.dataset.pc = String(pc);
    key.className = black ? 'black' : 'white';
    key.textContent = black ? '' : pitchName(pc);
    if (black) key.style.left = 'calc(' + (whiteIndex[pc - 1] + 1) + ' * 100% / 7)';
    keys.append(key);
  }

  const current = () => Number(pitch.value);
  /** Names the notes for the current key: the readout, key labels and pitch list. */
  function spellNotes() {
    const {sf} = currentKey();
    for (const key of keys.children as HTMLCollectionOf<HTMLElement>) key.setAttribute('aria-label', spokenPitchName(Number(key.dataset.pc), sf, false));
    for (const option of pitch.options) option.text = pitchNameWithOctave(Number(option.value), sf);
    $('tuningNote').textContent = pitchName(current(), sf);
  }
  function updatePitch() {
    const note = current(), hz = frequencyOf(note);
    $('tuningFrequency').textContent = Number(hz.toFixed(2)) + ' Hz';
    $('tuningNote').textContent = pitchName(note, currentKey().sf);
    $('tuningOctave').textContent = String(octaveOf(note));
    $<HTMLButtonElement>('tuningOctDown').disabled = note - 12 < LOWEST;
    $<HTMLButtonElement>('tuningOctUp').disabled = note + 12 > HIGHEST;
    for (const key of keys.children as HTMLCollectionOf<HTMLElement>) key.setAttribute('aria-pressed', String(Number(key.dataset.pc) === note % 12));
    const audio = currentAudio();
    if (tone && audio) tone.osc.frequency.setTargetAtTime(hz, audio.ctx.currentTime, .015);
  }
  function stopTone() {
    generation++;
    const audio = currentAudio();
    if (tone && audio) {
      const {osc, gain} = tone, now = audio.ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, .015);
      osc.stop(now + .09);
    }
    tone = undefined;
    play.textContent = 'Play tone';
    panel.classList.remove('sounding');
  }
  async function startTone() {
    const request = ++generation;
    $('tuningError').textContent = '';
    try {
      const {ctx, master} = await enableAudio();
      if (request !== generation || !panel.open) return;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequencyOf(current());
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.setTargetAtTime(.12, ctx.currentTime, .025);
      osc.connect(gain).connect(master);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      osc.start();
      tone = {osc, gain};
      play.textContent = 'Stop tone';
      panel.classList.add('sounding');
    } catch (error) {
      $('tuningError').textContent = error instanceof Error ? error.message : String(error);
    }
  }
  /** Tapping a key also starts the tone; otherwise a playing tone glides to the new pitch. */
  function setPitch(note: number, sound = false) {
    pitch.value = String(Math.max(LOWEST, Math.min(HIGHEST, note)));
    updatePitch();
    if (sound && !tone) startTone();
  }

  play.addEventListener('click', () => tone ? stopTone() : startTone());
  keys.addEventListener('click', e => {
    const key = (e.target as Element).closest<HTMLElement>('[data-pc]');
    if (key) setPitch(current() - current() % 12 + Number(key.dataset.pc), true);
  });
  $('tuningOctDown').addEventListener('click', () => setPitch(current() - 12));
  $('tuningOctUp').addEventListener('click', () => setPitch(current() + 12));
  panel.addEventListener('keydown', e => {
    if ((e.target as Element).closest('select,input')) return;
    const step = ({ArrowLeft: -1, ArrowRight: 1, ArrowDown: -12, ArrowUp: 12} as Record<string, number>)[e.key];
    if (!step) return;
    e.preventDefault();
    // Octave steps that would leave the range are ignored rather than clamped to a smaller interval.
    if (Math.abs(step) === 12 && (current() + step < LOWEST || current() + step > HIGHEST)) return;
    setPitch(current() + step);
    keys.querySelector<HTMLElement>('[aria-pressed=true]')?.focus();
  });
  pitch.addEventListener('change', updatePitch);
  onKeyChange(spellNotes);
  registerFloatingWindow({panel, opener: $('openTuning'), onClose: stopTone});
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopTone(); });
  spellNotes();
  updatePitch();
}
