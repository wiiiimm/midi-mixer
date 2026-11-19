/** A short metronome click. Used by the floating metronome and the playback click track. */
export function makeClick(context: BaseAudioContext, destination: AudioNode, when: number, accent: boolean): OscillatorNode {
  const osc = context.createOscillator(), gain = context.createGain();
  osc.frequency.value = accent ? 1560 : 1020;
  gain.gain.setValueAtTime(.0001, when);
  gain.gain.exponentialRampToValueAtTime(accent ? .33 : .23, when + .002);
  gain.gain.exponentialRampToValueAtTime(.0001, when + .043);
  osc.connect(gain).connect(destination);
  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  osc.start(when);
  osc.stop(when + .046);
  return osc;
}
