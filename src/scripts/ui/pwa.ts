import { loadInstrument, onInstrumentLoad, sampleUrls } from '../audio/sampler';
import { notify } from './toast';

// Offline support: service worker registration, update prompt, offline notice and
// background sync for instrument sounds that failed to download.

type PeriodicSyncRegistration = ServiceWorkerRegistration & {
  periodicSync?: {register(tag: string, options: {minInterval: number}): Promise<void>};
  sync?: {register(tag: string): Promise<void>};
};

export function initPwa(): void {
  // Offline / online notice; retry sounds that failed once we're back.
  const failed = new Set<number>();
  window.addEventListener('offline', () => notify('You’re offline. Saved songs and sounds still work.'));
  window.addEventListener('online', () => {
    notify('Back online.');
    for (const program of failed) loadInstrument(program);
  });

  const enabled = document.querySelector<HTMLMetaElement>('meta[name="service-worker"]')?.content === 'on';
  if (!enabled || !('serviceWorker' in navigator)) {
    onInstrumentLoad((program, ok) => { if (ok) failed.delete(program); else failed.add(program); });
    return;
  }

  navigator.serviceWorker.register('sw.js').then(base => {
    const registration = base as PeriodicSyncRegistration;
    // A new version finished installing while this page was open.
    const offerUpdate = (worker: ServiceWorker) =>
      notify('Update ready.', 'Reload', () => worker.postMessage('skip-waiting'), true);
    if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);

    // Sounds that failed (usually offline) are queued; the worker downloads them via
    // Background Sync when the connection returns, even if the tab is closed.
    onInstrumentLoad(async (program, ok) => {
      if (ok) { failed.delete(program); return; }
      failed.add(program);
      registration.active?.postMessage({type: 'queue-samples', urls: sampleUrls(program)});
      try { await registration.sync?.register('gm-samples'); } catch { /* unsupported */ }
    });

    // Installed apps on Chromium: refresh the cached app about once a day.
    (async () => {
      try {
        if (!registration.periodicSync) return;
        const status = await navigator.permissions.query({name: 'periodic-background-sync' as PermissionName});
        if (status.state === 'granted') await registration.periodicSync.register('refresh-app', {minInterval: 24 * 60 * 60 * 1000});
      } catch { /* unsupported */ }
    })();
  }).catch(() => {});

  // Reload only when an update replaces a worker that was already in control (not on first install).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type !== 'samples-synced') return;
    for (const program of failed) loadInstrument(program);
    if (!event.data.remaining) notify('Instrument sounds downloaded for offline use.');
  });
}
