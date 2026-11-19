export function makeClick(
  context: AudioContext,
  destination: AudioNode,
  when: number,
  accent: boolean,
): OscillatorNode {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.frequency.value = accent ? 1560 : 1020;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.33 : 0.23, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.043);
  osc.connect(gain).connect(destination);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
  osc.start(when);
  osc.stop(when + 0.046);
  return osc;
}
