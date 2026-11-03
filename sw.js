/* Service worker del Sistema de Supervision y Monitoreo de Viviendas.
   Guarda en el celular los archivos del sistema para que abra rapido
   y funcione sin senal. NO guarda ni intercepta los datos (Apps Script). */
var V = "ssm-v1";
var BASE = ["./", "index.html", "dashboard.html", "script.js", "style.css", "presentacion.css",
  "logo.png", "mosquito.png", "mosquito-real.jpg", "mosquito-prevencion.png", "selva.jpg"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(V).then(function (c) {
    return Promise.all(BASE.map(function (u) { return c.add(u).catch(function () {}); }));
  }));
  self.skipWaiting();
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function guardar(req, res) {
  if (res && (res.ok || res.type === "opaque")) caches.open(V).then(function (c) { c.put(req, res); });
}
// Paginas, script y estilos: primero internet (para tener siempre la ultima version);
// si la red tarda mas de 4 s o no hay senal, se usa la copia guardada.
function redPrimero(req) {
  return new Promise(function (resolver) {
    var listo = false;
    var fin = function (r) { if (!listo && r) { listo = true; resolver(r); } };
    var t = setTimeout(function () { caches.match(req, { ignoreSearch: true }).then(fin); }, 4000);
    fetch(req).then(function (r) { clearTimeout(t); guardar(req, r.clone()); fin(r); })
      .catch(function () {
        clearTimeout(t);
        caches.match(req, { ignoreSearch: true }).then(function (c) {
          fin(c || new Response("Sin conexi\u00f3n. Abre el sistema una vez con internet para usarlo sin se\u00f1al.",
            { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }));
        });
      });
  });
}
// Imagenes, fuentes y librerias: primero la copia guardada (no cambian).
function cachePrimero(req) {
  return caches.match(req).then(function (c) {
    return c || fetch(req).then(function (r) { guardar(req, r.clone()); return r; });
  });
}
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var u = new URL(req.url);
  if (/script\.google|googleusercontent/.test(u.hostname)) return;
  var mismo = u.origin === self.location.origin;
  var cdn = /cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(u.hostname);
  if (!mismo && !cdn) return;
  if (cdn || /\.(png|jpe?g|gif|webp|svg|ico|woff2?)$/i.test(u.pathname)) e.respondWith(cachePrimero(req));
  else e.respondWith(redPrimero(req));
});
