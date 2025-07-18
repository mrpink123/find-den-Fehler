const CACHE_NAME = "fehlercode-cache-v1.1.0";
const ASSETS_TO_CACHE = [
  "index.html",
  "main.js",
  "style.css",
  "manifest.json",
  "fehlerliste.csv",
  "papaparse.min.js",
  "service-worker.js",

  "images/icons/icon-192.png",
  "images/icons/icon-512.png",
  "images/icons/logo-512.png",

  "images/symbole/betriebsart-tasten.webp",
  "images/symbole/nacht.png",
  "images/symbole/nacht.webp",
  "images/symbole/SL-35-control-led.jpg",
  "images/symbole/BDE-E/bde-e.svg",
  "images/symbole/dorma_fehler_anzeige.png",
  "images/symbole/sprite.svg",
  "images/symbole/sta19_entriegeln1.png",
  "images/symbole/sta19_entriegeln2.png",
  "images/symbole/sta19_verschalung_auf.png",

  "images/typen/bde-e.png",
  "images/typen/bde-m.png",
  "images/typen/c-bedix.png",
  "images/typen/dorma_es200_bde.svg",
  "images/typen/fd-10.png",
  "images/typen/fd-20.png",
  "images/typen/sl-35.png",
  "images/typen/slm-red.png",
  "images/typen/slm.png",
  "images/typen/slx.png",
  "images/typen/sta-15.png",

  "details/bde-e.html",
  "details/notauf_sta16.html",
  "details/notauf_sta19red.html",
  "details/reset_sl-35.html",
  "details/ohne_fehler_sl35.html",
  "details/reset_mit_d-bedix.html",
  "details/reset_mit_c-bedix.html",
  "details/reset_mit_bedis.html",
];

// Installation – Cache aufbauen
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Aktivierung – alte Caches löschen
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch – zuerst online, fallback auf Cache
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Nachrichten vom Client
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "GET_VERSION") {
    const versionMatch = CACHE_NAME.match(/fehlercode-cache-v([\d.]+)/);
    const version = versionMatch ? versionMatch[1] : "Unbekannt";

    event.ports[0].postMessage({
      type: "APP_VERSION",
      version
    });
  }

  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
