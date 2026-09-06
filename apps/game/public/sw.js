/* TKCom offline service worker (Lane B, B3).
 *
 * Cache-first for same-origin GETs. Hashed assets are runtime-cached on first
 * successful fetch, after which they resolve offline. Shift+reload or a bump of
 * CACHE_VERSION refreshes. Cross-origin and non-GET requests pass through.
 */
const CACHE_VERSION = "tkcom-cache-v1";
const PRECACHE = ["./", "./index.html", "./manifest.webmanifest", "./pwa.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          // Runtime-cache same-origin, non-document assets so hashed builds
          // are available offline after first load. Documents are served by
          // the precached shell.
          if (res?.ok && req.destination !== "document") {
            const clone = res.clone();
            void caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match("./index.html"));
    }),
  );
});
