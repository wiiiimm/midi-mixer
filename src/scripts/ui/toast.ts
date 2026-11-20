import { $ } from '../lib/dom';

// The app-wide toast for short notices, optionally with one action (Undo, Reload…).

let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function notify(text: string, action?: string, onAction?: () => void, sticky = false): void {
  const toast = $('appToast'), button = $<HTMLButtonElement>('appToastAction');
  $('appToastText').textContent = text;
  button.hidden = !action;
  button.textContent = action ?? '';
  button.onclick = onAction ? () => { toast.hidden = true; onAction(); } : null;
  toast.hidden = false;
  clearTimeout(hideTimer);
  if (!sticky) hideTimer = setTimeout(() => { toast.hidden = true; }, action ? 7000 : 5000);
}
