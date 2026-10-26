const CACHE = 'audioverse-shell-1.0.0-2';
const FILES = ['./','./index.html','./styles.css','./app.js','./db.js','./player.js','./utils.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('audioverse-shell-') && key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !['http:','https:'].includes(url.protocol)) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  // Only cache the versioned app shell. Imported audio stays in IndexedDB.
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(request,{ignoreSearch:true});
    if (cached) return cached;
    try { return await fetch(request); }
    catch (error) { if (request.mode === 'navigate') return await cache.match('./index.html'); throw error; }
  }));
});
