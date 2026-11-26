const CACHE_PREFIX = "robinson-retirement-pages-";
const CACHE = `${CACHE_PREFIX}v31`;
const SCOPE = new URL(self.registration.scope);
const scopedUrl = (path = "") => new URL(path, SCOPE).toString();
const REPORT_PAGES = ["deep-model", "atlas", "atlas-prototype", "model-reference"];
const APP_SHELL = [
  scopedUrl(), ...REPORT_PAGES.map(page => scopedUrl(`${page}.html?v=31`)),
  scopedUrl("atlas.css?v=28"), scopedUrl("atlas.js?v=28"), scopedUrl("atlas-entry.js?v=28"),
  scopedUrl("retirement-engine.js?v=3"), scopedUrl("model-reference.txt?v=31"),
  scopedUrl("vendor/chart.umd.js"), scopedUrl("manifest.webmanifest"), scopedUrl("favicon.svg"),
];

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
    let cached = await cache.match(request, { ignoreSearch: true });
    if (request.mode === "navigate") {
      // Sites uses extensionless report URLs while Pages serves the .html filenames.
      const page = url.pathname.slice(SCOPE.pathname.length);
      if (!cached && REPORT_PAGES.includes(page)) {
        cached = await cache.match(scopedUrl(`${page}.html`), { ignoreSearch: true });
      }
      cached ??= await cache.match(scopedUrl());
      // A navigation uses manual redirects and cannot accept a cached followed response.
      if (cached?.redirected) {
        const headers = new Headers(cached.headers);
        headers.delete("Content-Encoding");
        headers.delete("Content-Length");
        return new Response(cached.body, { status: cached.status, headers });
      }
    }
    return cached ?? Response.error();
  }));
});
