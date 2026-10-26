// Offline support. Network-first for the app itself, so updates always arrive
// when online and the last good copy opens when offline.
const CACHE = "lf-v1";
const CORE = ["./", "./index.html", "./manifest.json", "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(reject, 4000))
    ]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) ||
           (await cache.match("./index.html")) ||
           Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const fresh = fetch(req).then((res) => { cache.put(req, res.clone()); return res; }).catch(() => cached);
  return cached || fresh;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Firebase live-sync traffic is never cached
  if (/firebaseio\.com|firebasedatabase\.app/.test(url.hostname)) return;
  if (url.origin === location.origin) {
    e.respondWith(networkFirst(req));
  } else if (/cdn\.tailwindcss\.com|www\.gstatic\.com/.test(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req));
  }
});
