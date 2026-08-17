const FIELD_CAPTURE_SW_VERSION = "FIELD-CAPTURE 0.1.0-dev";
const CACHE_NAME = "dimpro-field-capture-static-v010";
const STATIC_ASSETS = [
  "/field-capture-dev.webmanifest",
  "/drop-app-icon-v099-192.png",
  "/drop-app-icon-v099-512.png",
  "/drop-app-icon-maskable-v099-512.png"
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => undefined));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("dimpro-field-capture-static-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
  ]));
});
// Capture képeket és API válaszokat nem cache-elünk Service Workerben.
// A helyi terepi képek source of truth-ja a külön IndexedDB queue.
self.addEventListener("message", (event) => {
  if (event.data?.type === "FIELD_CAPTURE_SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "FIELD_CAPTURE_VERSION") event.source?.postMessage?.({ type: "FIELD_CAPTURE_SW_VERSION", version: FIELD_CAPTURE_SW_VERSION });
});
