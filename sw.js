// Service Worker: Offline-Nutzung + Empfang geteilter Dateien (Android „Teilen“)
importScripts('db.js');
const CACHE = 'campos-v1';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'db.js', 'parse.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== 'campos-cdn').map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const files = form.getAll('files').filter((f) => f && f.size);
      const text = [form.get('title'), form.get('text')].filter(Boolean).join('\n');
      await DB.put('meta', { key: 'shared', files, text });
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  // CDN-Bibliotheken (OCR, PDF) und Sprachdaten nach erstem Laden zwischenspeichern
  if (url.origin !== location.origin) {
    if (/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|tessdata/.test(url.host + url.pathname)) {
      e.respondWith(caches.open('campos-cdn').then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) c.put(e.request, res.clone());
        return res;
      }));
    }
    return;
  }
  // Eigene Dateien: erst Netz (für Updates), sonst Cache
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
