'use strict';
// midi-mixer service worker: offline app shell, cached instrument samples and
// background sync for sounds that could not be downloaded while offline.
const VERSION = 'v1';
const SHELL = 'shell-' + VERSION;
const SAMPLES = 'gm-samples';           // kept across versions; samples never change
const META = 'meta';                    // background-sync queue
const SAMPLE_HOST = 'https://gleitz.github.io/midi-js-soundfonts/';
const QUEUE_URL = new URL('__sync-queue', self.registration.scope).href;

const CORE = [
  './', 'index.html', 'metronome.html', 'manifest.webmanifest',
  'style.css', 'studio.css',
  'repertoire.js', 'loading.js', 'floating.js', 'sampler.js', 'midi.js', 'clefs.js', 'tick.js',
  'player.js', 'piano.js', 'rehearsal-tools.js', 'layout.js',
  'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
  'here-from-score.mid', '載我走.mid', '心的小島.mid',
].map(path => new URL(encodeURI(path), self.registration.scope).href);

// Hashed bundles (score engraver, React islands and their module imports) are discovered from the built pages.
async function bundleUrls() {
  const urls = new Set();
  for (const page of ['index.html', 'metronome.html']) {
    try {
      const html = await (await fetch(new URL(page, self.registration.scope), {cache: 'no-cache'})).text();
      for (const [, src] of html.matchAll(/(?:src|href|component-url|renderer-url)="([^"]*_astro\/[^"]+)"/g)) {
        urls.add(new URL(src, self.registration.scope).href);
      }
    } catch {}
  }
  const queue = [...urls];
  while (queue.length) {
    const url = queue.pop();
    if (!url.endsWith('.js')) continue;
    try {
      const code = await (await fetch(url, {cache: 'no-cache'})).text();
      for (const [, dep] of code.matchAll(/from\s*["'](\.[^"']+\.js)["']/g)) {
        const resolved = new URL(dep, url).href;
        if (!urls.has(resolved)) { urls.add(resolved); queue.push(resolved); }
      }
    } catch {}
  }
  return [...urls];
}

async function refreshShell() {
  const cache = await caches.open(SHELL);
  const urls = [...CORE, ...await bundleUrls()];
  await Promise.allSettled(urls.map(async url => {
    const response = await fetch(url, {cache: 'no-cache'});
    if (response.ok) await cache.put(url, response);
  }));
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
    if (request.mode === 'navigate') event.respondWith(networkFirst(request));
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
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, {ignoreSearch: true})) ||
      (await cache.match(new URL('index.html', self.registration.scope).href)) ||
      new Response('Offline', {status: 503});
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
