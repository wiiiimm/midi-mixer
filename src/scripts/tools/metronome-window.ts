import { $ } from '../lib/dom';
import { registerFloatingWindow } from '../ui/floating-windows';

// The floating metronome window embeds the standalone metronome page. The iframe
// is created on open and removed on close, so the metronome stops with the window.
export function initMetronomeWindow(): void {
  const panel = $<HTMLDialogElement>('metroPanel'), body = $('metroBody');
  const metronome = registerFloatingWindow({
    panel,
    opener: $('popmetro'),
    onOpen() {
      const frame = document.createElement('iframe');
      frame.title = 'Metronome controls';
      frame.src = './metronome.html?embedded';
      body.append(frame);
    },
    onClose() { body.replaceChildren(); },
  });
  // Escape inside the iframe asks the parent to close the window.
  window.addEventListener('message', e => {
    const frame = body.firstElementChild as HTMLIFrameElement | null;
    if (panel.open && e.source === frame?.contentWindow && e.origin === location.origin && e.data === 'close-metronome') metronome.close();
  });
}
