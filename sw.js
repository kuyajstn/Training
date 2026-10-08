// Hülle der App offline verfügbar halten. Netz zuerst, damit Änderungen sofort
// ankommen; ohne Netz die zuletzt geladene Fassung. GitHub-Anfragen gehen nie hier durch.
const V = 'training-v4';
const HUELLE = ['./', './index.html', './app.js', './mobil.css', './vendor/moment.min.js',
                './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(HUELLE))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  // no-cache: bei jedem Öffnen mit Netz kurz bei GitHub nachfragen (sonst hält das iPhone
  // Dateien bis zu 10 Minuten im eigenen Zwischenspeicher, und Änderungen kommen nicht an).
  e.respondWith(fetch(e.request, { cache:'no-cache' })
    .then(r => { const kopie = r.clone(); caches.open(V).then(c => c.put(e.request, kopie)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch:true })));
});
