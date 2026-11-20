import { $, nextFrame } from '../lib/dom';

// Startup splash plus a busy overlay over the workspace.
type StartupStep = 'library' | 'engraver';
const pending = new Set<StartupStep>(['library', 'engraver']);
let depth = 0;

function finishSplash() {
  const splash = $('splash');
  if (splash.hidden) return;
  splash.classList.add('leaving');
  setTimeout(() => { splash.hidden = true; }, 260);
}

export function initLoading(): void {
  setTimeout(finishSplash, 20000); // never trap the user behind the splash
}

/** Marks a startup step as done (or failed); the splash hides once all are done. */
export function startupStepDone(step: StartupStep): void {
  pending.delete(step);
  if (!pending.size) finishSplash();
}

function showBusy(message: string) {
  depth++;
  $('scoreBusyText').textContent = message;
  $('scoreBusy').hidden = false;
  document.body.setAttribute('aria-busy', 'true');
}

function hideBusy() {
  depth = Math.max(0, depth - 1);
  if (depth) return;
  $('scoreBusy').hidden = true;
  document.body.removeAttribute('aria-busy');
}

/** Shows the busy overlay and lets it paint before running (possibly blocking) work. */
export async function whileBusy<T>(message: string, work: () => T | Promise<T>): Promise<T> {
  showBusy(message);
  try {
    await nextFrame();
    return await work();
  } finally {
    hideBusy();
  }
}
