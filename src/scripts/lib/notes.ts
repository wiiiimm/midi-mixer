export const sharpNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const solfaNames = ['Do', 'Di', 'Re', 'Ri', 'Mi', 'Fa', 'Fi', 'Sol', 'Si', 'La', 'Li', 'Ti'];
export const octaveOf = (pitch: number): number => Math.floor(pitch / 12) - 1;
export const frequencyOf = (pitch: number): number => 440 * 2 ** ((pitch - 69) / 12);
/** Track colours, shared by the mixer dots, piano highlights and fallback score. */
export const trackColours = ['#0a84ff', '#bf5af2', '#30d158', '#ff9f0a', '#ff375f', '#64d2ff'];
