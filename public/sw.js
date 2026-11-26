const CACHE_PREFIX = "robinson-retirement-pages-";
const CACHE = `${CACHE_PREFIX}v29`;
const SCOPE = new URL(self.registration.scope);
const scopedUrl = (path = "") => new URL(path, SCOPE).toString();
const APP_SHELL = [scopedUrl(), scopedUrl("deep-model.html?v=29"), scopedUrl("atlas.html?v=29"), scopedUrl("atlas-prototype.html?v=29"), scopedUrl("atlas.css?v=28"), scopedUrl("atlas.js?v=28"), scopedUrl("atlas-entry.js?v=28"), scopedUrl("retirement-engine.js?v=3"), scopedUrl("model-reference.html?v=29"), scopedUrl("model-reference.txt?v=29"), scopedUrl("vendor/chart.umd.js"), scopedUrl("manifest.webmanifest"), scopedUrl("favicon.svg")];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))
    .catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname) || url.pathname.includes("/api/")) return;
  const network = fetch(request);
  event.waitUntil(network.then((response) => {
    if (!response.ok) return;
    const copy = response.clone();
    return caches.open(CACHE).then((cache) => cache.put(request, copy));
  }).catch(() => undefined));
  event.respondWith(network.catch(async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") {
      const home = await cache.match(scopedUrl());
      if (home) return home;
    }
    return Response.error();
  }));
});
