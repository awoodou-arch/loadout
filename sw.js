const CACHE = 'loadout-v13';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json', './icon-192.png', './icon-512.png',
  './sample-programs/squat-program.json', './sample-programs/strength-program.json', './sample-programs/olympic-lifting.json',
  './sample-programs/squat-murph-builder.json'];

self.addEventListener('install', (e) => {
  // Take over as soon as the new worker is ready instead of waiting for all tabs to close.
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache a response only if it's a good, same-origin basic response.
function put(req, res) {
  if (res && res.ok && res.type === 'basic') {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Big, rarely-changing files (bundled program JSON, icons) stay cache-first for
  // speed and offline. Everything else — the app shell (HTML/CSS/JS) and page
  // navigations — is network-first so a new deploy shows up as soon as you're
  // online, instead of being pinned to a stale cached copy.
  const cacheFirst = url.pathname.includes('/sample-programs/') || /\.(png|ico|svg)$/.test(url.pathname);

  if (cacheFirst) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => put(e.request, res)))
    );
    return;
  }

  // Network-first with cache fallback (so it still works offline / at the gym).
  e.respondWith(
    fetch(e.request)
      .then((res) => put(e.request, res))
      .catch(() => caches.match(e.request).then((cached) => cached || caches.match('./index.html')))
  );
});
