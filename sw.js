/* Offline support: precache the app shell; serve network-first, fall back to cache offline. */
const VERSION = 'brainglitch-v2';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icon.svg', './favicon.ico', './apple-touch-icon.png', './css/styles.css',
  './icons/icon-32.png', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-192.png', './icons/maskable-512.png',
  './js/vendor/gsap.min.js', './js/core.js', './js/challenges.js', './js/levels.js', './js/engine.js', './js/store.js',
  './js/fx.js', './js/audio.js', './js/render.js', './js/play.js', './js/screens.js', './js/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Network first so updates show up immediately; the cache answers whenever offline.
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && (new URL(req.url).origin === location.origin || req.url.includes('fonts.g'))) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html')))
  );
});
