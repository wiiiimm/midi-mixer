'use strict';
// Loading UI: a startup splash plus a busy overlay over the score.
const appLoading = (() => {
  const splash = document.getElementById('splash');
  const splashStatus = document.getElementById('splashStatus');
  const busy = document.getElementById('scoreBusy');
  const busyText = document.getElementById('scoreBusyText');
  let depth = 0;
  const frame = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

  // Startup waits for the bundled songs and the notation engraver (or its failure).
  const pending = new Set(['library', 'engraver']);
  function done(step) {
    pending.delete(step);
    if (!pending.size) finishSplash();
  }
  function finishSplash() {
    if (!splash || splash.hidden) return;
    splash.classList.add('leaving');
    setTimeout(() => { splash.hidden = true; }, 260);
  }
  window.addEventListener('score-engraver-ready', () => done('engraver'));
  window.addEventListener('score-engraver-unavailable', () => done('engraver'));
  window.addEventListener('library-ready', () => done('library'));
  setTimeout(finishSplash, 20000); // never trap the user behind the splash

  function show(message) {
    depth++;
    busyText.textContent = message;
    busy.hidden = false;
    document.body.setAttribute('aria-busy', 'true');
  }
  function hide() {
    depth = Math.max(0, depth - 1);
    if (depth) return;
    busy.hidden = true;
    document.body.removeAttribute('aria-busy');
  }
  // Shows the overlay and lets it paint before running (possibly blocking) work.
  async function during(message, work) {
    show(message);
    try {
      await frame();
      return await work();
    } finally {
      hide();
    }
  }
  return {during, show, hide, status: text => { if (splashStatus) splashStatus.textContent = text; }};
})();
