'use strict';
// midi-mixer service worker: offline app shell, cached instrument samples and
// background sync for sounds that could not be downloaded while offline.
const VERSION = 'v3';
const SHELL = 'shell-' + VERSION;
const SAMPLES = 'gm-samples';           // kept across versions; samples never change
const META = 'meta';                    // background-sync queue
const SAMPLE_HOST = 'https://gleitz.github.io/midi-js-soundfonts/';
const QUEUE_URL = new URL('__sync-queue', self.registration.scope).href;

const toUrl = path => new URL(encodeURI(path), self.registration.scope).href;
// Stylesheets aren't content-hashed and the old shell cache is deleted on activate,
// so an install must not complete without them or offline loads lose their styles.
const STYLES = ['style.css', 'studio.css'].map(toUrl);
const CORE = [
  './', 'index.html', 'metronome.html', 'manifest.webmanifest',
  'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
  'here-from-score.mid', '載我走.mid', '心的小島.mid',
].map(toUrl);

// Hashed bundles are discovered from the built pages, then followed through their
// static and dynamic imports (the score engraver is a separately loaded chunk).
// Any failed fetch rejects, so an install never completes with chunks it didn't find.
async function fetchText(url) {
  const response = await fetch(url, {cache: 'no-cache'});
  if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
  return response.text();
}

async function bundleUrls() {
  const urls = new Set();
  for (const page of ['index.html', 'metronome.html']) {
    const html = await fetchText(new URL(page, self.registration.scope));
    for (const [, src] of html.matchAll(/(?:src|href)="([^"]*_astro\/[^"]+)"/g)) urls.add(new URL(src, self.registration.scope).href);
  }
  const queue = [...urls];
  while (queue.length) {
    const url = queue.pop();
    if (!url.endsWith('.js')) continue;
    const code = await fetchText(url);
    for (const [, dep] of code.matchAll(/(?:from|import)\s*\(?\s*["'`](\.{1,2}\/[^"'`]+\.js)["'`]/g)) {
      const resolved = new URL(dep, url).href;
      if (!urls.has(resolved)) { urls.add(resolved); queue.push(resolved); }
    }
  }
  return [...urls];
}

async function refreshShell() {
  const cache = await caches.open(SHELL);
  const bundles = await bundleUrls();
  const store = async url => {
    const response = await fetch(url, {cache: 'no-cache'});
    if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
    await cache.put(url, response);
  };
  // The app can't start offline without every chunk and stylesheet, so those are required.
  await Promise.all([
    Promise.all([...bundles, ...STYLES].map(store)),
    Promise.allSettled(CORE.map(store)),
  ]);
}

self.addEventListener('install', event => {
  event.waitUntil(refreshShell());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('shell-') && key !== SHELL) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
  if (event.data?.type === 'queue-samples') event.waitUntil(queue(event.data.urls));
});

self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.href.startsWith(SAMPLE_HOST)) {
    event.respondWith(cacheFirst(request, SAMPLES));
  } else if (url.origin === location.origin) {
    // Stylesheets aren't content-hashed, so a cached copy can be older than the page
    // that links it. Fetch them with the page, and use the cache only when offline.
    if (request.mode === 'navigate' || request.destination === 'style') event.respondWith(networkFirst(request));
    else if (url.pathname.includes('/_astro/')) event.respondWith(cacheFirst(request, SHELL));
    else event.respondWith(staleWhileRevalidate(request));
  }
});

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request, {ignoreSearch: true});
  const update = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => hit);
  return hit || update;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    if (response.ok) {
      // Finish the write before responding, or the worker can stop mid-write.
      try { await cache.put(request, response.clone()); }
      catch (error) { console.warn('Could not update the shell cache', error); }
      return response;
    }
    // An HTTP error (e.g. a 503 from the server) still resolves, so prefer the cached copy.
    return (await cache.match(request, {ignoreSearch: true})) || response;
  } catch {
    const hit = await cache.match(request, {ignoreSearch: true});
    if (hit) return hit;
    // Only pages fall back to the app shell; a stylesheet must never receive HTML.
    if (request.mode === 'navigate') {
      const shell = await cache.match(new URL('index.html', self.registration.scope).href);
      if (shell) return shell;
    }
    return new Response('Offline', {status: 503});
  }
}

// ── Background sync: sounds requested while offline download when back online ──
async function readQueue() {
  const hit = await (await caches.open(META)).match(QUEUE_URL);
  return hit ? hit.json() : [];
}
async function writeQueue(urls) {
  await (await caches.open(META)).put(QUEUE_URL, new Response(JSON.stringify(urls), {headers: {'content-type': 'application/json'}}));
}
async function queue(urls) {
  await writeQueue([...new Set([...await readQueue(), ...urls])]);
}
async function drainQueue() {
  const urls = await readQueue();
  if (!urls.length) return;
  const cache = await caches.open(SAMPLES);
  const failed = [];
  await Promise.all(urls.map(async url => {
    if (await cache.match(url)) return;
    try {
      const response = await fetch(url);
      if (response.ok) await cache.put(url, response);
      else failed.push(url);
    } catch { failed.push(url); }
  }));
  await writeQueue(failed);
  for (const client of await self.clients.matchAll()) client.postMessage({type: 'samples-synced', remaining: failed.length});
  if (failed.length) throw new Error('Some sounds are still unavailable'); // let the browser retry later
}

self.addEventListener('sync', event => {
  if (event.tag === 'gm-samples') event.waitUntil(drainQueue());
});

// Installed apps (Chromium) can refresh the cached app in the background.
self.addEventListener('periodicsync', event => {
  if (event.tag === 'refresh-app') event.waitUntil(Promise.all([refreshShell(), drainQueue().catch(() => {})]));
});
