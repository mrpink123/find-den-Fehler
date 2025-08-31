const CACHE_NAME = "fehlercode-cache-v1.1.7";
const ASSETS_TO_CACHE = [
  "index.html",
  "main.js",
  "style.css",
  "manifest.json",
  "papaparse.min.js",
  "service-worker.js",

  "images/icons/icon-192.png",
  "images/icons/icon-512.png",
  "images/icons/logo-512.png",

  "images/symbole/betriebsart-tasten.webp",
  "images/symbole/dorma_fehler_anzeige.png",
  "images/symbole/flatscan_dip_confirm.png",
  "images/symbole/flatscan_dip1_1.png",
  "images/symbole/flatscan_dip1_2.png",
  "images/symbole/flatscan_dip1_off.png",
  "images/symbole/flatscan_dip1_on.png",
  "images/symbole/flatscan_dipschalter.png",
  "images/symbole/flatscan_service-modus.png",
  "images/symbole/flatscan_teach1.png",
  "images/symbole/flatscan_teach2.png",
  "images/symbole/flatscan_teach3.png",
  "images/symbole/flatscan_teach4.png",
  "images/symbole/flatscan_teach5.png",
  "images/symbole/flatscan_teach6.png",
  "images/symbole/flatscan_teach7.png",
  "images/symbole/nacht.png",
  "images/symbole/nacht.webp",
  "images/symbole/SL-35-control-led.jpg",
  "images/symbole/BDE-E/bde-e.svg",
  "images/symbole/sprite.svg",
  "images/symbole/sta19_entriegeln1.png",
  "images/symbole/sta19_entriegeln2.png",
  "images/symbole/sta19_verschalung_auf.png",
  "images/symbole/tormax/FRW-Schlüsselschalter.png",
  "images/symbole/tormax/FRW-Schlüsseltaster.png",

  "images/typen/bde_sta-15.svg",
  "images/typen/bde-d_dfa127.png",
  "images/typen/bde-d.png",
  "images/typen/bde-e.png",
  "images/typen/bde-m.png",
  "images/typen/bea-ixio.png",
  "images/typen/c-bedix.png",
  "images/typen/dorma_es200_bde.svg",
  "images/typen/fd-10.png",
  "images/typen/fd-20.png",
  "images/typen/geze_dps.png",
  "images/typen/lzr-flatscan-sw-2.png",
  "images/typen/sl-35.png",
  "images/typen/slm-red.png",
  "images/typen/slm.png",
  "images/typen/slx.png",
  "images/typen/sta-15.png",
  "images/typen/tormax_bde.png",

  "details/bde-e.html",
  "details/bea_combiscan_dip.html",
  "details/bea_lzr_flatscan-teach.html",
  "details/bea_lzr-flatscan-sw_service-mode.html",
  "details/bea_lzr_flatscan-sw_dip.html",
  "details/bedienung_dfa127_bde-d.html",
  "details/bedienung_dfa127_tasten.html",
  "details/bedienung_fd20_tasten.html",
  "details/bedienung_fd10_tasten.html",
  "details/notauf_sta16.html",
  "details/notauf_sta19red.html",
  "details/ohne_fehler_sl35.html",
  "details/reset_mit_bedis.html",
  "details/reset_mit_c-bedix.html",
  "details/reset_mit_d-bedix.html",
  "details/reset_sl-35.html",
  "details/schliessen_sl35.html",
  "details/schliessen_sta19.html",
  "details/tormax_bde.html",
  "details/tormax_stoerung.html",
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
