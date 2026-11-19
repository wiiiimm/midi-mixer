// Draggable, non-modal tool windows (metronome, tuning fork).
export interface FloatingWindow { panel: HTMLDialogElement; opener: HTMLElement; close(options?: {restoreFocus?: boolean}): void }

interface Options {
  panel: HTMLDialogElement;
  opener: HTMLElement;
  onOpen?: () => void;
  onClose?: () => void;
}

const windows: FloatingWindow[] = [];
let topZ = 40;

function place(panel: HTMLElement, x: number, y: number) {
  const maxX = Math.max(0, document.documentElement.clientWidth - panel.offsetWidth);
  const maxY = Math.max(0, window.innerHeight - panel.offsetHeight);
  panel.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
  panel.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
}

function raise(panel: HTMLElement) {
  panel.style.zIndex = String(++topZ);
  windows.forEach(w => w.panel.classList.toggle('front', w.panel === panel));
}

export function registerFloatingWindow({panel, opener, onOpen = () => {}, onClose = () => {}}: Options): FloatingWindow {
  const handle = panel.querySelector<HTMLElement>('.float-handle')!;
  const closeButton = panel.querySelector<HTMLElement>('.float-close')!;
  let drag: {id: number; x: number; y: number} | null = null;

  function open() {
    onOpen();
    panel.show();
    raise(panel);
    opener.setAttribute('aria-expanded', 'true');
    if (panel.dataset.moved) {
      place(panel, panel.offsetLeft, panel.offsetTop);
      return;
    }
    // First open: drop below the button, nudged so tool windows don't stack exactly.
    const bounds = opener.getBoundingClientRect();
    const others = windows.filter(w => w !== win && w.panel.open).length;
    place(panel, bounds.right - panel.offsetWidth - others * 24, bounds.bottom + 8 + others * 24);
  }
  function close({restoreFocus = true} = {}) {
    if (!panel.open) return;
    panel.close();
    onClose();
    opener.setAttribute('aria-expanded', 'false');
    if (restoreFocus) opener.focus();
  }
  const win: FloatingWindow = {panel, opener, close};

  opener.addEventListener('click', () => panel.open ? close() : open());
  closeButton.addEventListener('click', () => close());
  panel.addEventListener('pointerdown', () => raise(panel), true);
  panel.addEventListener('focusin', () => raise(panel));
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    drag = {id: e.pointerId, x: e.clientX - panel.offsetLeft, y: e.clientY - panel.offsetTop};
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', e => {
    if (drag?.id !== e.pointerId) return;
    place(panel, e.clientX - drag.x, e.clientY - drag.y);
    panel.dataset.moved = '1';
  });
  handle.addEventListener('lostpointercapture', () => { drag = null; });
  windows.push(win);
  return win;
}

export function initFloatingWindows(): void {
  window.addEventListener('resize', () => {
    for (const {panel} of windows) if (panel.open) place(panel, panel.offsetLeft, panel.offsetTop);
  });
  // Escape closes the window being used, otherwise the front-most one.
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]:modal')) return;
    const open = windows.filter(w => w.panel.open);
    if (!open.length) return;
    const target = open.find(w => w.panel.contains(document.activeElement)) ??
      open.reduce((a, b) => (Number(a.panel.style.zIndex) > Number(b.panel.style.zIndex) ? a : b));
    target.close();
    e.stopImmediatePropagation();
  });
}
