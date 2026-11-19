'use strict';
// Offline support: service worker registration, update prompt, offline notice and
// background sync for instrument sounds that failed to download.
(() => {
  const toast = document.getElementById('appToast');
  const toastText = document.getElementById('appToastText');
  const toastAction = document.getElementById('appToastAction');
  let hideTimer;
  function notify(text, action, onAction, sticky = false) {
    toastText.textContent = text;
    toastAction.hidden = !action;
    toastAction.textContent = action || '';
    toastAction.onclick = onAction || null;
    toast.hidden = false;
    clearTimeout(hideTimer);
    if (!sticky) hideTimer = setTimeout(() => { toast.hidden = true; }, 5000);
  }

  // Offline / online notice; retry sounds that failed once we're back.
  const failed = new Set();
  window.addEventListener('offline', () => notify('You’re offline. Saved songs and sounds still work.'));
  window.addEventListener('online', () => {
    notify('Back online.');
    for (const program of failed) gmSampler.load(program);
  });

  const enabled = document.querySelector('meta[name="service-worker"]')?.content === 'on';
  if (!enabled || !('serviceWorker' in navigator)) {
    gmSampler.onLoad((program, ok) => { if (ok) failed.delete(program); else failed.add(program); });
    return;
  }

  navigator.serviceWorker.register('sw.js').then(registration => {
    // A new version finished installing while this page was open.
    function offerUpdate(worker) {
      notify('Update ready.', 'Reload', () => worker.postMessage('skip-waiting'), true);
    }
    if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);

    // Sounds that failed (usually offline) are queued; the worker downloads them
    // via Background Sync when the connection returns, even if the tab is closed.
    gmSampler.onLoad(async (program, ok) => {
      if (ok) { failed.delete(program); return; }
      failed.add(program);
      const urls = gmSampler.urlsFor(program);
      registration.active?.postMessage({type: 'queue-samples', urls});
      try { await registration.sync?.register('gm-samples'); } catch {}
    });

    // Installed apps on Chromium: refresh the cached app about once a day.
    (async () => {
      try {
        if (!('periodicSync' in registration)) return;
        const status = await navigator.permissions.query({name: 'periodic-background-sync'});
        if (status.state === 'granted') await registration.periodicSync.register('refresh-app', {minInterval: 24 * 60 * 60 * 1000});
      } catch {}
    })();
  }).catch(() => {});

  // Reload only when an update replaces a worker that was already in control
  // (not on the very first install).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type !== 'samples-synced') return;
    for (const program of failed) gmSampler.load(program);
    if (!event.data.remaining) notify('Instrument sounds downloaded for offline use.');
  });
})();
