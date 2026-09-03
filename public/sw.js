// VeriClever service worker. Deliberately small: it makes the app installable
// and keeps it usable across a flaky connection, it does not try to be a full
// offline app. A compliance tool with no network is of limited use anyway.

const VERSION = "v1";
const STATIC_CACHE = `vc-static-${VERSION}`;
const PAGE_CACHE = `vc-pages-${VERSION}`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(["/offline.html"])),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Immutable build assets: cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Page navigations: network first, fall back to the last good copy, then to
  // a small offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          const cache = await caches.open(PAGE_CACHE);
          cache.put(request, res.clone());
          return res;
        } catch (err) {
          const cache = await caches.open(PAGE_CACHE);
          const cached = await cache.match(request);
          return cached || caches.match("/offline.html");
        }
      })(),
    );
  }
});
