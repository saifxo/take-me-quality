/* Take Me Quality service worker.
 * - Makes the app installable and gives a friendly offline page on a full reload without network.
 * - Caches only public, static assets (build files, icons, fonts). Signed-in pages and data are never cached,
 *   so nothing sensitive is stored on shared call-centre PCs.
 */
const VERSION = "tmq-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/pwa-icon/192", "/pwa-icon/512"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStaticAsset = (url) =>
  url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/") || url.pathname === "/icon" || url.pathname === "/apple-icon");

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Full page loads: always go to the network; fall back to the offline page if it's unreachable.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Immutable build assets: cache first.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
  }
  // Everything else (RSC payloads, server actions, API) goes straight to the network.
});
