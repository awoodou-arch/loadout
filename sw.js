const CACHE = 'loadout-v6';
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

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      // Only cache successful, same-origin, basic responses. Never cache 404s or errors,
      // otherwise a transient failure gets pinned forever and the app can't recover.
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => cached))
  );
});
