/* LithoBlast3D móvil: funciona sin internet después de la primera visita. */
const VERSION = "b3d-movil-3.7.0";
const BASE = ["./", "index.html", "app.css", "app.js", "simulacion.js", "simlabor.js", "modelos3d.js", "sonido.js", "motor.js", "nucleo.zip", "manifest.webmanifest",
              "img/icono-192.png", "img/icono-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const externo = url.origin !== location.origin;   // Pyodide, numpy, scipy, three.js (CDN): caché primero
  if (externo) {
    e.respondWith(caches.open(VERSION + "-cdn").then(async (c) => {
      const r = await c.match(e.request);
      if (r) return r;
      const nueva = await fetch(e.request);
      if (nueva.ok) c.put(e.request, nueva.clone());
      return nueva;
    }));
    return;
  }
  // archivos propios: red primero (para recibir actualizaciones), caché si no hay internet
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, r.clone()));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
