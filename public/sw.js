// PWA removed 15 September 2026 (deferred, see BUILD_LOG.md - Step 12).
// This file stays at the same path the old service worker used
// deliberately: a browser that already registered it will fetch this on
// its next update check, see it changed, and install this version - which
// clears every cache it made and unregisters itself, then reloads any open
// tab so the client stops being served a cached shell. Do not delete this
// file; do not restore the old caching behaviour into it. If the PWA is
// reinstated later, it gets a new file and a new registration call, not a
// resurrection of this one.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", async () => {
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
  await self.registration.unregister();
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((c) => c.navigate(c.url));
});
