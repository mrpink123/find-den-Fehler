const CACHE_NAME = "fehlercode-cache-v1";
const ASSETS_TO_CACHE = [
  "index.html",
  "manifest.json",
  "fehlerliste.csv",
  "papaparse.min.js",
  "service-worker.js",
  "images/icons/icon-192.png",
  "images/icons/icon-512.png",
  "images/icons/arrow-up.png",
  "images/icons/icon-512-blank.webp",
  "images/icons/settings_dark.png",
  "images/icons/settings.png",
  "images/hersteller/gilgen.png",
  "images/symbolebetriebsart-tasten.webp",
  "images/symbole/d-bedix-reset.webp",
  "images/symbole/nacht.png",
  "images/symbole/nacht.webp",
  "images/symbole/sl35-control-led.jpg",
  "images/typen/bedis.png",
  "images/typen/c-bedix.png",
  "images/typen/d-bedix.png",
  "images/typen/sl35.png",
  "images/typen/slm-red.png",
  "images/typen/slm.png",
  "images/typen/slx.png"
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
