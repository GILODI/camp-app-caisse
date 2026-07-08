// Service worker minimal : uniquement pour rendre l'app installable sur
// l'écran d'accueil (Android/Chrome exige un SW actif). Pas de stratégie
// hors-ligne complète — l'app suppose une connexion réseau disponible avec
// tolérance aux micro-coupures gérée côté application (file d'attente).
const CACHE_NAME = "camp-caisse-shell-v1";
const SHELL_ASSETS = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((res) => res ?? Response.error()))
  );
});
