// Offline support: every game file is saved on first visit, so solo play works with no signal.
const VERSION = 'futari-v4';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/models.js', 'js/models2.js', 'js/stack.js', 'js/input.js', 'js/tilt.js', 'js/net.js', 'js/world.js', 'js/fx3.js', 'js/render3d.js', 'js/planet3d.js', 'js/book.js', 'js/hud.js', 'js/main.js',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // same-origin files: network first (to get updates), cache when offline
  // fonts and the PeerJS library: cache first
  const sameOrigin = url.origin === location.origin;
  if (sameOrigin) {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; }).catch(() => caches.match(req, { ignoreSearch: true })));
  } else if (/fonts\.(googleapis|gstatic)\.com|unpkg\.com/.test(url.host)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })));
  }
});
