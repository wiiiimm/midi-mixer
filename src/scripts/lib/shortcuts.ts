// Global keyboard shortcut guards and pointer-vs-keyboard focus tracking.
//
// Clicking a button, chip, slider, checkbox or dropdown leaves focus on that
// control, which would otherwise swallow Space (or all shortcuts). We track
// whether focus moved via keyboard navigation so pointer-focused controls let
// global shortcuts through, while Tab-focused interactive controls keep their
// native Space activation for keyboard accessibility.

const NON_TEXT_INPUT_TYPES = new Set([
  'range',
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'color',
  'file',
]);

const SPACE_ACTIVATABLE =
  'button,summary,[role="tab"],[role="button"],input[type="checkbox"],input[type="radio"]';

const NAV_KEYS = new Set([
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
]);

let inputModality: 'pointer' | 'keyboard' = 'pointer';
let keyboardFocused: Element | null = null;
let pointerSelect: HTMLSelectElement | null = null;
let initialized = false;

/** Installs document-level focus modality tracking for global shortcuts. */
export function initShortcuts(): void {
  if (initialized) return;
  initialized = true;

  document.addEventListener('pointerdown', event => {
    inputModality = 'pointer';
    keyboardFocused = null;
    const target = event.target as Element | null;
    const label = target?.closest('label');
    pointerSelect = target?.closest('select') ??
      (label?.control instanceof HTMLSelectElement ? label.control : null);
  }, true);

  document.addEventListener('keydown', event => {
    if (NAV_KEYS.has(event.key)) {
      inputModality = 'keyboard';
      pointerSelect = null;
    }
  }, true);

  document.addEventListener('focusin', event => {
    const target = event.target as Element | null;
    keyboardFocused = inputModality === 'keyboard' ? target : null;
    if (target !== pointerSelect) pointerSelect = null;
  }, true);

  document.addEventListener('focusout', event => {
    if (event.target === keyboardFocused) keyboardFocused = null;
  }, true);

  // Release focus after choosing an option from a mouse/touch-opened <select>
  // so Space, R, Shift+L and piano shortcuts immediately resume.
  document.addEventListener('change', event => {
    if (event.target instanceof HTMLSelectElement && event.target === pointerSelect) {
      pointerSelect = null;
      event.target.blur();
    }
  }, true);
}

/** True when global studio shortcuts should not fire for this event. */
export function shortcutsBlocked(event: Event): boolean {
  if (document.querySelector('dialog[open]:modal')) return true;
  if (document.querySelector('main')?.inert) return true;
  const target = event.target as Element | null;
  if (!target) return false;
  if (target.closest('textarea,[contenteditable],select,dialog,[popover]')) return true;
  const input = target.closest('input');
  return !!input && !NON_TEXT_INPUT_TYPES.has(input.type);
}

/**
 * True when Space should perform the focused control's native action rather
 * than toggling playback (only when the user navigated to it by keyboard).
 */
export function elementConsumesSpace(event: Event): boolean {
  const target = event.target as Element | null;
  const control = target?.closest(SPACE_ACTIVATABLE);
  return !!control && control === keyboardFocused;
}
