// WORKHART SERVICE WORKER. BUMP VERSION TO DROP EVERY OLD CACHE ON THE NEXT ACTIVATE.
const VERSION = "workhart-v1";
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/brand/workhart_mark.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, fallbackPath) {
  try {
    const res = await fetch(request);
    if (res.ok && res.type === "basic") {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(fallbackPath || request, copy));
    }
    return res;
  } catch (err) {
    const hit = await caches.match(fallbackPath || request);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(request, copy));
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // NEVER CACHE /api/: RESPONSES ARE PER-USER AND SESSION-SCOPED (A CACHED BOOTSTRAP WOULD LEAK ACROSS SIGN-INS),
  // AND /api/tts AUDIO IS PAID PER CHARACTER AND CACHED IN MEMORY BY THE PAGE ALREADY.
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/index.html"));
    return;
  }
  // VITE HASHES EVERYTHING UNDER /assets/, SO A CACHED COPY CAN NEVER BE STALE.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});
