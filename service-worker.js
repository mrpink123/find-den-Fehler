const CACHE_NAME = "fehlercode-cache-v1.0.7";
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
  "images/hersteller/dorma.png",
  "images/hersteller/gilgen.png",
  "images/hersteller/dark/dorma.png",
  "images/hersteller/dark/gilgen.png",
  "images/hersteller/record.png",
  "images/hersteller/dark/record.png",
  "images/symbole/betriebsart-tasten.webp",
  "images/symbole/nacht.png",
  "images/symbole/nacht.webp",
  "images/symbole/SL-35-control-led.jpg",
  "images/symbole/BDE-E/bde-e.svg",
  "images/symbole/dorma_fehler_anzeige.png",
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
  "fonts/Caveat-VariableFont_wght.ttf"
];

self.addEventListener("install", (event) => {
  // Sofort aktivieren
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Alte Caches können hier ggf. entfernt werden
  console.log("Service Worker aktiviert");
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

// Nachricht vom Haupt-Thread empfangen
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

