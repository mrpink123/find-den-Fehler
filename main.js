window.APP_VERSION = "Unbekannt";
let currentRenderSessionId = 0;

// Fallback für localStorage
function getStorage() {
  try {
    const test = "__test__";
    localStorage.setItem(test, "1");
    localStorage.removeItem(test);
    return localStorage;
  } catch {
    const fallback = {};
    return {
      getItem: (k) => fallback[k] || null,
      setItem: (k, v) => (fallback[k] = v),
      removeItem: (k) => delete fallback[k],
    };
  }
}
const storage = getStorage();

function showStatusMessage(text, type = "success", timeout = 4000) {
  const box = document.getElementById("statusMessage");
  if (!box) return;
  box.innerHTML = text;
  box.className = `show ${type}`;
  setTimeout(() => (box.className = "hidden"), timeout);
}

function checkForPWAUpdate() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.getRegistration().then(reg => {
    if (reg) reg.update();

    if (reg && reg.waiting) {
      storage.setItem("pwaUpdateAvailable", "true");
      showHomeCard(null, true);
    }

    reg?.addEventListener("updatefound", () => {
      const newWorker = reg.installing;
      newWorker?.addEventListener("statechange", () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          storage.setItem("pwaUpdateAvailable", "true");
          showHomeCard(null, true);
        }
      });
    });
  });
}

// Debounce Funktion
function debounce(fn, delay = 400) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function escapeRegExp(string) {
  if (typeof string !== "string") {
    string = String(string || "");
  }
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCSV(text) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (result.errors.length > 0) {
    showStatusMessage("⚠️ Fehler beim Parsen der CSV-Datei", "error");
    return [];
  }
  return result.data.map((row) => ({
    hersteller: row.hersteller?.trim() || "",
    typ: row.typ?.trim() || "",
    code: row.code?.trim() || "",
    suchbegriffe: row.suchbegriffe?.trim() || "",
    fehler: row.fehler?.trim() || "",
    ursache: row.ursache?.trim() || "",
    infos: row.info?.trim() || "",
    weitere: row.weitere?.trim() || "",
    kategorie: row.kategorie?.trim() || "",
    link: row.link?.trim() || "",
    typImage: row.typbild?.trim() || "",
    details: row.details?.trim() || "",
    modal: row.modal?.trim() || "",
  }));
}

function fillDropdowns(data, codeFilter = "", selectedHersteller = "", selectedTyp = "") {
  const herstellerMap = new Map();
  const typMap = new Map();
  const herstellerTreffer = new Map();
  const typTreffer = new Map();

  const codeRegex = codeFilter ? new RegExp(`\\b${escapeRegExp(codeFilter)}\\b`, "i") : null;
  const selectedHerstellerKey = selectedHersteller.toLowerCase();
  const selectedTypKey = selectedTyp.toLowerCase();

  // Alle Hersteller und Typen sammeln
  daten.forEach(item => {
    const hKey = item.hersteller?.toLowerCase() || "";
    const tKey = item.typ?.toLowerCase() || "";
    if (!herstellerMap.has(hKey)) herstellerMap.set(hKey, item.hersteller);
    if (!typMap.has(tKey)) typMap.set(tKey, item.typ);
  });

  // Treffer zählen
  daten.forEach(item => {
    const hKey = item.hersteller?.toLowerCase() || "";
    const tKey = item.typ?.toLowerCase() || "";

    const codeMatch = !codeRegex ||
      codeRegex.test(item.code) ||
      (item.suchbegriffe && codeRegex.test(item.suchbegriffe));

    if (!codeMatch) return;

    herstellerTreffer.set(hKey, (herstellerTreffer.get(hKey) || 0) + 1);
    typTreffer.set(tKey, (typTreffer.get(tKey) || 0) + 1);
  });

  const herstellerOptions = ['<option value="">Alle Hersteller</option>'];
  const herstellerMitTreffern = [];
  const herstellerOhneTreffer = [];

  for (const [key, label] of herstellerMap.entries()) {
    const count = herstellerTreffer.get(key) || 0;
    const selected = key === selectedHerstellerKey;

    const option = {
      key,
      label,
      count,
      selected
    };

    if (count > 0) {
      herstellerMitTreffern.push(option);
    } else {
      herstellerOhneTreffer.push(option);
    }
  }

  herstellerMitTreffern.sort((a, b) => a.count - b.count || a.label.localeCompare(b.label));
  herstellerOhneTreffer.sort((a, b) => a.label.localeCompare(b.label));

  [...herstellerMitTreffern, ...herstellerOhneTreffer].forEach(({ key, label, count, selected }) => {
    const showLabel = count > 0 ? `${label} (${count})` : label;
    const sel = selected ? "selected" : "";
    const dis = count === 0 ? "disabled" : "";
    herstellerOptions.push(`<option value="${key}" ${sel} ${dis}>${showLabel}</option>`);
  });

  herstellerFilter.innerHTML = herstellerOptions.join("");


  // Typ-Dropdown: zwei Gruppen → [Treffer > 0], [Treffer = 0]
  const withTreffer = [];
  const withoutTreffer = [];

  for (const [typKey, label] of typMap.entries()) {
    const count = typTreffer.get(typKey) || 0;

    // Gehört dieser Typ zum gewählten Hersteller?
    const gehörtZumHersteller = !selectedHersteller || daten.some(d =>
      d.typ?.toLowerCase() === typKey &&
      d.hersteller?.toLowerCase() === selectedHerstellerKey
    );

    if (!gehörtZumHersteller) continue;

    const option = {
      key: typKey,
      label,
      count,
      selected: typKey === selectedTypKey
    };

    if (count > 0) {
      withTreffer.push(option);
    } else {
      withoutTreffer.push(option);
    }
  }

  // Sortiere beide Gruppen
  withTreffer.sort((a, b) => a.count - b.count || a.label.localeCompare(b.label));
  withoutTreffer.sort((a, b) => a.label.localeCompare(b.label));

  // Baue Dropdown
  const typOptions = ['<option value="">Alle Typen</option>'];

  [...withTreffer, ...withoutTreffer].forEach(({ key, label, count, selected }) => {
    const showLabel = count > 0 ? `${label} (${count})` : label;
    const sel = selected ? "selected" : "";
    const dis = count === 0 ? "disabled" : "";
    typOptions.push(`<option value="${key}" ${sel} ${dis}>${showLabel}</option>`);
  });

  typFilter.innerHTML = typOptions.join("");

  // Auswahl prüfen
  const typExists = [...typMap.keys()].some(t =>
    t === selectedTypKey &&
    (!selectedHersteller || daten.some(d => d.typ.toLowerCase() === t && d.hersteller.toLowerCase() === selectedHerstellerKey))
  );
  if (!typExists) typFilter.value = "";
}

function filterDaten(data, suchwoerter = [], hersteller = "", typ = "") {
  return data.filter(item => {
    const code = item.code?.toLowerCase() || "";
    const suchbegriffe = item.suchbegriffe?.toLowerCase() || "";
    const itemHersteller = item.hersteller?.toLowerCase() || "";
    const itemTyp = item.typ?.toLowerCase() || "";

    const matchesSuchtext = suchwoerter.every(w => {
      const regex = new RegExp(`\\b${w.normalize("NFD").replace(/\p{Diacritic}/gu, "")}\\b`, "i");
      return regex.test(code.normalize("NFD").replace(/\p{Diacritic}/gu, "")) ||
        regex.test(suchbegriffe.normalize("NFD").replace(/\p{Diacritic}/gu, ""));
    });

    const matchesHersteller = !hersteller || itemHersteller === hersteller;
    const matchesTyp = !typ || itemTyp === typ;

    return matchesSuchtext && matchesHersteller && matchesTyp;
  });
}

function renderFehlerItem(code, kategorie, text) {
  return `
    <div class="errorDescriptionItem">
      <div class="iconLine">
        <svg class="icon small"><use href="#icon-fehler"></use></svg>
        <h4>Fehler: ${code}</h4> ${kategorie ? `<b>(${kategorie})</b>` : ""}
      </div>
      <p>${text}</p>
    </div>`;
}
function renderUrsacheItem(text) {
  return `
    <div class="errorDescriptionItem">
      <div class="iconLine">
        <svg class="icon small"><use href="#icon-ursache"></use></svg>
        <h4>Maßnahme:</h4>
      </div>
      <p>${text}</p>
    </div>`;
}
function renderInfoItem(text) {
  return `
    <div class="errorDescriptionItem">
      <div class="iconLine">
        <svg class="icon small"><use href="#icon-info"></use></svg>
        <strong>Info:</strong>
      </div>
      <p>${text}</p>
    </div>`;
}
function renderLinkItem(link) {
  return `
    <div class="errorDescriptionItem">
      <div class="iconLine">
        <svg class="icon small"><use href="#icon-hilfe"></use></svg>
        <h4>${link}</h4>
      </div>
    </div>`;
}

function renderCard(item) {
  const card = document.createElement("div");
  card.className = "card";

  const herstellerId = item.hersteller?.toLowerCase().replace(/\s+/g, "_") || "";
  const typImagePath = item.typImage?.trim() || "";

  card.innerHTML = `
    <div class="cardheader">
      <div class="herstellerImageContainer">
        <svg class="herstellerImage"><use href="#${herstellerId}"></use></svg>
      </div>
      <div class="cardHeaderTyp">
        ${item.typ ? `<b>${item.typ}</b>` : ""}
        ${item.code ? `<p>${item.code}</p>` : ""}
      </div>
    </div>
    <div class="cardContent">
      <div class="errorDescription">
        ${item.fehler ? renderFehlerItem(item.code, item.kategorie, item.fehler) : ""}
        ${item.ursache ? renderUrsacheItem(item.ursache) : ""}
        ${item.infos ? renderInfoItem(item.infos) : ""}
        ${item.weitere ? `<div class="errorDescriptionItem"><p>${item.weitere}</p></div>` : ""}
        <div class="errorDescriptionItem detailsContainer">Wird geladen ...</div>
        ${item.link ? renderLinkItem(item.link) : ""}
      </div>
    </div>
  `;

  const cardContent = card.querySelector(".cardContent");

  // Typbild mit optionalem Modal
  if (typImagePath) {
    const typImageWrapper = document.createElement("div");
    typImageWrapper.className = "typImageWrapper";

    const typImage = document.createElement("img");
    typImage.className = "typImage";
    typImage.src = typImagePath;
    typImage.alt = item.typ;
    typImage.onerror = () => {
      typImage.onerror = null;
      typImage.src = "images/icons/icon-512.png";
    };

    if (item.modal) {
      typImage.classList.add("clickable");
      typImage.addEventListener("click", () => {
        openTypImageModal(null, item.typ, item.modal);
      });

      const overlay = document.createElement("div");
      overlay.className = "imageOverlayText";
      overlay.textContent = "Klicken für Infos";
      typImageWrapper.appendChild(overlay);
    }

    typImageWrapper.appendChild(typImage);
    cardContent.appendChild(typImageWrapper);
  }

  // Details laden
  if (item.details) {
    fetch(item.details)
      .then(res => res.ok ? res.text() : Promise.reject("Fehler beim Laden"))
      .then(html => {
        const detailsDiv = card.querySelector(".detailsContainer");
        detailsDiv.innerHTML = html;
      })
      .catch(() => {
        const detailsDiv = card.querySelector(".detailsContainer");
        if (detailsDiv) detailsDiv.innerHTML = `<em>Details konnten nicht geladen werden.</em>`;
      });
  } else {
    const detailsDiv = card.querySelector(".detailsContainer");
    if (detailsDiv) detailsDiv.remove();
  }

  return card;
}

function openTypImageModal(imagePath = null, typ = "", htmlPath = "") {
  const modalOverlay = document.createElement("div");
  modalOverlay.className = "modalOverlay";

  const modalContent = document.createElement("div");
  modalContent.className = "modalContent";
  modalContent.addEventListener("click", e => e.stopPropagation());

  const closeBtn = document.createElement("button");
  closeBtn.className = "modalCloseBtn";
  closeBtn.innerHTML = `<svg class="icon small"><use href="#icon-x"></use></svg>`;
  closeBtn.addEventListener("click", () => closeModal());

  // Optionaler Titel
  if (typ) {
    const title = document.createElement("h3");
    title.className = "modalTitle";
    title.textContent = typ;
    modalContent.appendChild(title);
  }

  // Optional: HTML laden
  if (htmlPath) {
    fetch(htmlPath)
      .then(res => res.ok ? res.text() : Promise.reject("Fehler beim Laden"))
      .then(html => {
        const htmlWrapper = document.createElement("div");
        htmlWrapper.className = "modalHtmlContent";
        htmlWrapper.innerHTML = html;
        modalContent.appendChild(htmlWrapper);
      })
      .catch(() => {
        const error = document.createElement("p");
        error.textContent = "❌ Fehler beim Laden des Inhalts.";
        modalContent.appendChild(error);
      });
  }

  modalContent.appendChild(closeBtn);
  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);

  // ESC-Taste zum Schließen
  function onKeyDown(e) {
    if (e.key === "Escape") closeModal();
  }
  document.addEventListener("keydown", onKeyDown);

  // Overlay-Klick zum Schließen
  modalOverlay.addEventListener("click", closeModal);

  // Modal schließen + Cleanup
  function closeModal() {
    document.removeEventListener("keydown", onKeyDown);
    if (modalOverlay.parentNode) {
      modalOverlay.parentNode.removeChild(modalOverlay);
    }
  }
}

document.getElementById("modalCloseBtn")?.addEventListener("click", () => {
  document.getElementById("typImageModal").style.display = "none";
});

window.addEventListener("click", (e) => {
  const modal = document.getElementById("typImageModal");
  if (e.target === modal) modal.style.display = "none";
});

function escapeHTML(str) {
  return (str || "").replace(/[&<>"']/g, tag => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[tag]);
}

function renderDaten() {
  const suchtext = searchInput.value.trim().toLowerCase();
  const suchwoerter = suchtext.split(/\s+/).filter(w => w.length > 0);
  const hersteller = herstellerFilter.value.trim().toLowerCase();
  const typ = typFilter.value.trim().toLowerCase();
  const codeFilter = suchwoerter.length > 0 ? suchtext : "";

  const trefferAnzahl = document.getElementById("trefferAnzahl");
  container.innerHTML = "";

  const keineFilterAktiv = suchwoerter.length === 0 && !hersteller && !typ;

  // Neue Session-ID setzen für Lazy-Abbruch
  const thisRenderSession = Date.now();
  currentRenderSessionId = thisRenderSession;

  if (keineFilterAktiv) {
    updateAutocompleteList(daten);
    fillDropdowns(daten);
    trefferAnzahl.textContent = "";
    showHomeCard();
    return;
  }

  const filtered = filterDaten(daten, suchwoerter, hersteller, typ);

  if (filtered.length === 0) {
    updateAutocompleteList(daten);
    fillDropdowns(filtered, codeFilter, hersteller, typ);
    trefferAnzahl.textContent = "";
    showHomeCard("Keine Treffer gefunden.");
    return;
  }

  updateAutocompleteList(filtered);
  fillDropdowns(filtered, codeFilter, hersteller, typ);
  trefferAnzahl.textContent = `${filtered.length} Treffer`;

  // Kartenanzeige
  if (filtered.length > 100) {
    renderDatenLazy(filtered, thisRenderSession);
  } else {
    filtered.forEach(item => {
      const card = renderCard(item);
      container.appendChild(card);
    });
  }

  updateThemeAssets(document.body.getAttribute("data-theme"));
}

function updateThemeAssets(theme) {
  document.querySelectorAll(".theme-image").forEach((img) => {
    const newSrc = img.getAttribute(`data-theme-${theme}`);
    if (newSrc) img.src = newSrc;
  });
}

function loadData() {
  const savedCSV = storage.getItem("csvData");

  if (savedCSV) {
    daten = parseCSV(savedCSV);
    fillDropdowns(daten);
    renderDaten();
  } else {
    fetch("fehlerliste.csv")
      .then(res => {
        if (!res.ok) throw new Error("Fehlerliste nicht gefunden");
        return res.text();
      })
      .then(text => {
        daten = parseCSV(text);
        storage.setItem("csvData", text);
        fillDropdowns(daten);
        renderDaten();
      })
      .catch(() => {
        showStatusMessage("⚠️ Fehlerliste konnte nicht geladen werden", "error");
        showHomeCard();
      });
  }
}

function renderDatenLazy(filtered) {
  let index = 0;
  const chunkSize = 20;
  let lazyRenderCancelled = false;

  // Globale Abbruchfunktion verfügbar machen
  window.cancelLazyRender = () => { lazyRenderCancelled = true; };

  const container = document.getElementById("container");

  function renderChunk(deadline) {
    if (lazyRenderCancelled) return;

    while (index < filtered.length && (deadline.timeRemaining() > 0 || deadline.didTimeout)) {
      const item = filtered[index++];
      const card = renderCard(item);
      if (card instanceof HTMLElement) {
        container.appendChild(card);
      }
    }

    if (index < filtered.length && !lazyRenderCancelled) {
      requestIdleCallback(renderChunk);
    }
  }

  const ric = window.requestIdleCallback || function (cb) {
    setTimeout(() => cb({ timeRemaining: () => 50, didTimeout: false }), 1);
  };

  ric(renderChunk);
}

function showHomeCard(hinweisText = null) {
  if (!container) return;

  container.innerHTML = "";

  const homeCard = document.createElement("div");
  homeCard.className = "card homeCard transition-03";
  homeCard.innerHTML = `
    <div class="cardheader">
      <div class="cardHeaderContent"></div>
      <button class="btnMenuToggle transition-03" id="homeMenuToggle" title="Extras">
        <svg class="icon"><use href="#icon-menu"></use></svg>
      </button>
    </div>
    
    <div class="cardContent">
      <div class="homeContent">
        <div class="logo-box highlight">
          <svg><use href="#logo"></use></svg>
        </div>
        <div class="homeText">
          <p id="homeMessage">
            ${hinweisText || `Gib einen Fehlercode ein. Oder,<br>Wähle einen Typ um alle Fehler diesen Types zu sehen. Schlagwörter wie "Reset", "Schliessen" oder "ohne" sind auch möglich.`}
          </p>
        </div>

       

      </div>
      <div id="homeMenuContainer" class="hide">
        <div class="menu">
          <button id="homeCsvBtn">
            <svg class="button-icon"><use href="#icon-upload"></use></svg>
            <p>Fehlerliste Laden</p>
          </button>
          <button id="homeThemeBtn">
            <svg class="button-icon"><use href="#icon-theme"></use></svg>
            <p>Dark / Light Theme</p>
          </button>
          <button id="homeResetBtn">
            <svg class="button-icon"><use href="#icon-trash"></use></svg>
            <p>lokale Daten löschen</p>
          </button>
        </div>
        <p class="appVersion">v<span id="appVersionText">wird geladen…</span></p>
      </div>
    </div>
    <div id="updateInfoContainer"></div>
  `;

  if (container) container.appendChild(homeCard);

  if (window.updateReadyWorker) {
    showUpdateButton();
  }

  document.getElementById("homeMenuToggle")?.addEventListener("click", (e) => {
    const menu = document.getElementById("homeMenuContainer");
    menu.className = menu.className === "show" ? "hide" : "show";
    e.stopPropagation();
  });

  document.addEventListener("click", (e) => {
    const menu = document.getElementById("homeMenuContainer");
    const toggle = document.getElementById("homeMenuToggle");

    if (menu?.className === "show") {
      if (
        !menu.contains(e.target) &&
        !toggle.contains(e.target)
      ) {
        menu.className = "hide";
      }
    }
  });

  const csvInput = document.getElementById("csvInput");
  document.getElementById("homeCsvBtn")?.addEventListener("click", () => {
    csvInput?.click();
  });

  document.getElementById("homeThemeBtn")?.addEventListener("click", toggleTheme);
  document.getElementById("homeResetBtn")?.addEventListener("click", resetData);

  csvInput?.addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      const text = e.target.result;
      daten = parseCSV(text);
      storage.setItem("csvData", text);
      fillDropdowns(daten);
      renderDaten();
      showStatusMessage(`✅ ${file.name} erfolgreich geladen`, "success");
    };
    reader.readAsText(file, "UTF-8");
  });

  updateAppVersionInUI();
}

function toggleTheme() {
  const current = document.body.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.body.setAttribute("data-theme", next);
  storage.setItem("theme", next);
  updateThemeAssets(next);
}

function resetData() {
  storage.removeItem("csvData");
  storage.removeItem("theme");

  sessionStorage.setItem("appReset", "1");
  showStatusMessage("Zurückgesetzt – Seite wird neu geladen", "info", 1200);

  setTimeout(() => {
    location.reload();
  }, 2000);
}

// Autocomplete
function updateAutocompleteList(data) {
  const datalist = document.getElementById("codeSuggestions");
  if (!datalist) return;

  const codeSet = new Set();
  const begriffeSet = new Set();

  data.forEach(d => {
    if (d.code) codeSet.add(d.code);
    if (d.suchbegriffe) {
      d.suchbegriffe
        .split(/\s*,\s*/) // Trenne bei Komma
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(s => begriffeSet.add(s));
    }
  });

  // Kombinieren & sortieren
  const combined = [...codeSet, ...begriffeSet].sort((a, b) =>
    a.localeCompare(b, "de", { sensitivity: "base" })
  );

  datalist.innerHTML = combined.map(w => `<option value="${w}"></option>`).join("");
}

function showUpdateButton() {
  // Falls die HomeCard bereits angezeigt wird, sofort einfügen
  const homeCard = document.querySelector(".homeCard");
  if (homeCard) {

    // Nicht doppelt einfügen
    if (document.getElementById("updateMessage")) return;

    const updateDiv = document.createElement("div");
    updateDiv.id = "updateMessage";
    updateDiv.className = "updateInfo";
    updateDiv.innerHTML = `
      <p>Eine neue Version ist verfügbar.</p>
      <button id="applyUpdateBtn" title="Jetzt aktualisieren">
        <svg><use href="#icon-update"></use></svg>
        <p>Jetzt aktualisieren</p>
      </button>
    `;

    document.getElementById("updateInfoContainer").appendChild(updateDiv);

    document.getElementById("applyUpdateBtn").addEventListener("click", () => {
      if (window.updateReadyWorker) {
        window.updateReadyWorker.postMessage({ type: "SKIP_WAITING" });
        sessionStorage.setItem("updateInstalled", "1");
        location.reload(true);
      }
    });
  } else {
    // Wenn HomeCard noch nicht angezeigt wird, später erneut versuchen
    const retry = () => {
      if (document.querySelector(".homeCard")) {
        showUpdateButton();
      } else {
        setTimeout(retry, 300);
      }
    };
    retry();
  }
}

// Elemente & Daten
const searchInput = document.getElementById("searchInput");
const herstellerFilter = document.getElementById("herstellerFilter");
const typFilter = document.getElementById("typFilter");
const container = document.getElementById("container");
const searchHint = document.getElementById("searchHint");
let daten = [];

// Version aus Service Worker extrahieren
function getAppVersionFromServiceWorker() {
  return fetch("service-worker.js")
    .then(res => res.text())
    .then(text => {
      const match = text.match(/CACHE_NAME\s*=\s*["']fehlercode-cache-v([\d.]+)["']/);
      return match ? match[1] : null;
    })
    .catch(() => null);
}

// Zeigt die Version z.B. auf der HomeCard an
function updateAppVersionInUI() {
  const el = document.getElementById("appVersionText");
  if (el && window.APP_VERSION) {
    el.textContent = window.APP_VERSION;
  }
}

function showImageModal(imageSrc, text = "", linkText = "", linkTarget = "") {
  const modal = document.getElementById("imageModal");
  const modalImage = document.getElementById("modalImage");
  const modalText = document.getElementById("modalText");

  modalImage.src = imageSrc;
  modalText.innerHTML = `
    <p>${text}</p>
    ${linkText && linkTarget ? `<p><a href="${linkTarget}">${linkText}</a></p>` : ""}
  `;

  modal.classList.remove("hidden");
}

// Schließen-Button
document.getElementById("modalClose")?.addEventListener("click", () => {
  document.getElementById("imageModal").classList.add("hidden");
});

// Klick außerhalb schließt ebenfalls
document.getElementById("imageModal")?.addEventListener("click", (e) => {
  if (e.target.id === "imageModal") {
    e.currentTarget.classList.add("hidden");
  }
});

// Service Worker Registrierung + Update-Erkennung
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const newWorker = reg.installing;

      newWorker.addEventListener("statechange", () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          // Neue Version erkannt → Button einblenden
          window.updateReadyWorker = newWorker;
          window.updateAvailable = true;

          if (typeof showUpdateButton === "function") {
            showUpdateButton();
          }
        }
      });
    });
  });

  // SW übernimmt Kontrolle → reloaden und Marker setzen
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (window.updateAvailable) {
      sessionStorage.setItem("updateInstalled", "1");
      location.reload();
    }
  });
}

// Nach Seiten-Reload: Erfolgsmeldung bei Update
if (sessionStorage.getItem("updateInstalled") === "1") {
  getAppVersionFromServiceWorker().then(version => {
    window.APP_VERSION = version || "Unbekannt";
    showStatusMessage(`✅ Update auf Version ${window.APP_VERSION} erfolgreich durchgeführt.`, "success");
    updateAppVersionInUI?.();
    sessionStorage.removeItem("updateInstalled");
  });
}

// Initiale Version setzen
getAppVersionFromServiceWorker().then(version => {
  window.APP_VERSION = version || "Unbekannt";
  updateAppVersionInUI();
});

// Scroll-Button
const scrollTopBtn = document.getElementById("scrollTopBtn");
window.addEventListener("scroll", () => {
  scrollTopBtn.classList.toggle("show", window.scrollY > 300);
}, { passive: true });
scrollTopBtn.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Header Hide/Show
let lastScrollY = window.scrollY;
const headerEl = document.getElementById("siteHeader");
let ticking = false;

function onScroll() {
  const currentY = window.scrollY;

  // Immer sichtbar, wenn ganz oben
  if (currentY <= 5) {
    headerEl.classList.remove("hide");
  } else if (currentY > lastScrollY && currentY > 80) {
    headerEl.classList.add("hide"); // Nach unten scrollen → ausblenden
  } else if (currentY < lastScrollY - 6) {
    headerEl.classList.remove("hide"); // Nach oben scrollen → einblenden
  }

  lastScrollY = currentY;
  ticking = false;
}

window.addEventListener("scroll", () => {
  if (!ticking) {
    requestAnimationFrame(onScroll);
    ticking = true;
  }
}, { passive: true });

// Aktualisiert die Steuerungs-Buttons (Sichtbarkeit / Aktivierung)
function updateControlButtons() {
  const hasText = searchInput.value.trim() !== "";
  const hasFilter = herstellerFilter.value !== "" || typFilter.value !== "";
  document.getElementById("btnClearSearch").disabled = !hasText;
  document.getElementById("btnResetFilters").disabled = !hasFilter;
}

function updateURLHash() {
  const params = new URLSearchParams();
  const code = searchInput.value.trim().toLowerCase();
  const hersteller = herstellerFilter.value.trim().toLowerCase();
  const typ = typFilter.value.trim().toLowerCase();

  if (code) params.set("code", code);
  if (hersteller) params.set("hersteller", hersteller);
  if (typ) params.set("typ", typ);

  const newHash = params.toString();
  history.replaceState(null, "", newHash ? `#${newHash}` : location.pathname);
}

function resetHash() {
  history.replaceState(null, "", location.pathname);
}

// Eingabeänderung löst Debounce aus
[searchInput, herstellerFilter, typFilter].forEach((input) => {
  input.addEventListener("input", debounce(() => {
    updateURLHash();
    renderDaten();
    updateControlButtons();
  }, 400));
});

// Suchfeld leeren (Button)
document.getElementById("btnClearSearch").addEventListener("click", () => {
  searchInput.value = "";
  searchHint.value = "";
  updateURLHash();
  renderDaten();
  updateControlButtons();
});

// Filter-Reset-Button
document.getElementById("btnResetFilters").addEventListener("click", () => {
  herstellerFilter.value = "";
  typFilter.value = "";
  updateURLHash();
  renderDaten();
  updateControlButtons();
});

// Autocomplete für Codes
searchInput.addEventListener("input", () => {
  const val = searchInput.value.trim().toLowerCase();
  if (!val) {
    searchHint.value = "";
    return;
  }

  const match = daten.find(d => {
    const code = d.code?.toLowerCase() || "";
    const begriffe = d.suchbegriffe?.toLowerCase().split(/\s*,\s*/).filter(Boolean) || [];

    // Treffer bei Code oder einem beliebigen Suchbegriff
    return code.startsWith(val) || begriffe.some(w => w.startsWith(val));
  });

  if (match) {
    const code = match.code || "";
    const codeLower = code.toLowerCase();

    // Wenn das eingegebene Wort Teil des Codes ist → nutze code
    if (codeLower.startsWith(val)) {
      searchHint.value = searchInput.value + code.slice(val.length);
    } else {
      // Ansonsten finde ersten passenden Suchbegriff
      const begriffe = match.suchbegriffe?.split(/\s*,\s*/).filter(Boolean) || [];
      const wort = begriffe.find(w => w.toLowerCase().startsWith(val));
      if (wort) {
        searchHint.value = searchInput.value + wort.slice(val.length);
      } else {
        searchHint.value = "";
      }
    }
  } else {
    searchHint.value = "";
  }
});

function parseURLHash() {
  if (!location.hash.startsWith("#")) return { code: "", hersteller: "", typ: "" };

  const hash = location.hash.substring(1);
  const params = new URLSearchParams(hash);

  return {
    code: params.get("code") || "",
    hersteller: params.get("hersteller") || "",
    typ: params.get("typ") || "",
  };
}

async function initApp() {
  // Theme laden
  const savedTheme = storage.getItem("theme");
  if (savedTheme) {
    document.body.setAttribute("data-theme", savedTheme);
    updateThemeAssets(savedTheme);
  }

  // SVG-Sprite einbinden
  fetch("images/symbole/sprite.svg")
    .then(res => res.text())
    .then(svg => {
      const div = document.createElement("div");
      div.style.display = "none";
      div.innerHTML = svg;
      document.body.appendChild(div);
    });

  // App-Version aus dem Service Worker holen
  try {
    const version = await getAppVersionFromServiceWorker();
    window.APP_VERSION = version || "Unbekannt";
  } catch (err) {
    console.warn("Konnte App-Version nicht abrufen:", err);
    window.APP_VERSION = "Unbekannt";
  }

  updateAppVersionInUI();

  if (sessionStorage.getItem("appUpdated") === "1") {
    getAppVersionFromServiceWorker().then(version => {
      const appVersion = version || "Unbekannt";
      window.APP_VERSION = appVersion; // Nur sicherheitshalber setzen
      showStatusMessage(`✅ Update auf Version ${appVersion} erfolgreich durchgeführt.`, "success");
      sessionStorage.removeItem("appUpdated");
    });
  }

  // Daten laden (lokal oder per fetch)
  await loadData();

  // Initiale Filter aus URL (Hash) lesen
  const { code = "", hersteller = "", typ = "" } = parseURLHash() || {};

  // Suchfeld setzen
  if (code) searchInput.value = code;
  if (hersteller) herstellerFilter.value = hersteller;
  if (typ) typFilter.value = typ;

  if (sessionStorage.getItem("appReset") === "1") {
    sessionStorage.removeItem("appReset");
    showStatusMessage("App wurde zurückgesetzt. Standarddaten werden geladen.", "info");
  }
  // Initiale Anzeige
  renderDaten();

  // Button-Zustände aktualisieren
  updateControlButtons();

  // PWA-Update prüfen
  checkForPWAUpdate();
}


// Start
initApp();
