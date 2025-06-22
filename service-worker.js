const CACHE_NAME = "fehlercode-cache-v1.2";
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
  "images/hersteller/gilgen.png",
  "images/hersteller/dark/gilgen.png",
  "images/hersteller/record.png",
  "images/hersteller/dark/record.png",
  "images/symbole/betriebsart-tasten.webp",
  "images/symbole/nacht.png",
  "images/symbole/nacht.webp",
  "images/symbole/SL-35-control-led.jpg",
  "images/typen/bde-e.png",
  "images/typen/bde-m.png",
  "images/typen/c-bedix.png",
  "images/typen/fd-10.png",
  "images/typen/fd-20.png",
  "images/typen/sl-35.png",
  "images/typen/slm-red.png",
  "images/typen/slm.png",
  "images/typen/slx.png",
  "details/reset_sl-35.html",
  "details/reset_mit_d-bedix.html",
  "details/reset_mit_c-bedix.html",
  "details/reset_mit_bedis.html",
  "fonts/Caveat-VariableFont_wght.ttf"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("Fehler beim Caching:", url, err);
          })
        )
      );
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
