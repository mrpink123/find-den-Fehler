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
  box.innerHTML = (type === "success" ? "✅ " : "⚠️ ") + text;
  box.className = `show ${type}`;
  setTimeout(() => (box.className = ""), timeout);
}

// Debounce Funktion
function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function parseCSV(text) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (result.errors.length > 0) {
    showStatusMessage("Fehler beim Parsen der CSV-Datei", "error");
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
  }));
}

function fillDropdowns(data, suchwoerter = [], herstellerFilterVal = "", typFilterVal = "") {
  const herstellerMap = new Map(); // herstellerKey → Originalname
  const typMap = new Map(); // typKey → Originalname

  const herstellerTreffer = new Map(); // herstellerKey → Anzahl Treffer
  const typTreffer = new Map(); // typKey → Anzahl Treffer

  // Alle Hersteller + Typen merken
  data.forEach(item => {
    const hKey = item.hersteller?.toLowerCase() || "";
    const tKey = item.typ?.toLowerCase() || "";

    if (!herstellerMap.has(hKey)) herstellerMap.set(hKey, item.hersteller);
    if (!typMap.has(tKey)) typMap.set(tKey, item.typ);
  });

  // Treffer zählen (alle Kombinationen mit Suchtext + optional Hersteller)
  const filtered = filterDaten(data, suchwoerter, "", ""); // kein Filter aktiv

  filtered.forEach(item => {
    const hKey = item.hersteller?.toLowerCase() || "";
    const tKey = item.typ?.toLowerCase() || "";

    herstellerTreffer.set(hKey, (herstellerTreffer.get(hKey) || 0) + 1);
  });

  // Hersteller-Dropdown aufbauen
  herstellerFilter.innerHTML =
    '<option value="">Alle Hersteller</option>' +
    [...herstellerMap.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([key, label]) =>
        `<option value="${key}">${label} (${herstellerTreffer.get(key) || 0})</option>`
      )
      .join("");

  // ---- Typen ----
  // Alle Typen zum gewählten Hersteller (oder global wenn leer)
  const typenDesHerstellers = new Map();

  data.forEach(item => {
    const hKey = item.hersteller?.toLowerCase() || "";
    const tKey = item.typ?.toLowerCase() || "";

    const passtZumHersteller = !herstellerFilterVal || hKey === herstellerFilterVal;
    if (passtZumHersteller && !typenDesHerstellers.has(tKey)) {
      typenDesHerstellers.set(tKey, item.typ);
    }
  });

  // Treffer für Typen zählen (Suchtext + Herstellerfilter)
  const filteredForTyp = filterDaten(data, suchwoerter, herstellerFilterVal, "");

  filteredForTyp.forEach(item => {
    const key = item.typ?.toLowerCase() || "";
    typTreffer.set(key, (typTreffer.get(key) || 0) + 1);
  });

  // Typ-Dropdown aufbauen
  typFilter.innerHTML =
    '<option value="">Alle Typen</option>' +
    [...typenDesHerstellers.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([key, label]) =>
        `<option value="${key}">${label} (${typTreffer.get(key) || 0})</option>`
      )
      .join("");

  // Auswahl wiederherstellen
  herstellerFilter.value = herstellerFilterVal || "";
  typFilter.value = typFilterVal || "";
}

function updateAutocompleteList(data) {
  const datalist = document.getElementById("codeSuggestions");
  if (!datalist) return;
  const codes = [...new Set(data.map((d) => d.code).filter(Boolean))];
  datalist.innerHTML = codes.sort().map((c) => `<option value="${c}"></option>`).join("");
}

function filterDaten(data, suchwoerter = [], hersteller = "", typ = "") {
  return data.filter(item => {
    const code = item.code?.toLowerCase() || "";
    const suchbegriffe = item.suchbegriffe?.toLowerCase() || "";
    const itemHersteller = item.hersteller?.toLowerCase() || "";
    const itemTyp = item.typ?.toLowerCase() || "";

    const matchesSuchtext = suchwoerter.every(w => {
      const regex = new RegExp(`\\b${w}\\b`, "i");
      return regex.test(code) || regex.test(suchbegriffe);
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
        <svg class="icon-small"><use href="#icon-fehler"></use></svg>
        <h4>Fehler: ${code}</h4> ${kategorie ? `<b>(${kategorie})</b>` : ""}
      </div>
      <p>${text}</p>
    </div>`;
}
function renderUrsacheItem(text) {
  return `
    <div class="errorDescriptionItem">
      <div class="iconLine">
        <svg class="icon-small"><use href="#icon-ursache"></use></svg>
        <h4>Maßnahme:</h4>
      </div>
      <p>${text}</p>
    </div>`;
}
function renderInfoItem(text) {
  return `
    <div class="errorDescriptionItem">
      <div class="iconLine">
        <svg class="icon-small"><use href="#icon-info"></use></svg>
        <strong>Info:</strong>
      </div>
      <p>${text}</p>
    </div>`;
}
function renderLinkItem(link) {
  return `
    <div class="errorDescriptionItem">
      <div class="iconLine">
        <svg class="icon-small"><use href="#icon-hilfe"></use></svg>
        <h4>${link}</h4>
      </div>
    </div>`;
}

function renderCard(item) {
  const card = document.createElement("div");
  card.className = "card";

  const typImagePath = item.typImage?.trim() || "";
  const herstellerImageName = item.hersteller.toLowerCase().replace(/\s+/g, "_") + ".png";
  const herstellerImagePath = `images/hersteller/${herstellerImageName}`;

  card.innerHTML = `
    <div class="cardheader">
      <div class="herstellerImageContainer">
        <img class="herstellerImage theme-image" src="${herstellerImagePath}"
             data-theme-light="images/hersteller/${herstellerImageName}"
             data-theme-dark="images/hersteller/dark/${herstellerImageName}"
             alt="${item.hersteller}"
             onerror="this.onerror=null; this.src='images/icons/icon-512.webp'">
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
      ${typImagePath ? `
        <div class="typImageWrapper">
          <img class="typImage" src="${typImagePath}" alt="${item.typ}" 
               onerror="this.onerror=null; this.src='images/icons/icon-512.png'">
        </div>` : ""}
    </div>
  `;

  // Details nachladen
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

function renderDaten() {
  const suchtext = searchInput.value.trim().toLowerCase();
  const suchwoerter = suchtext.split(/\s+/).filter(w => w.length > 0);
  const hersteller = herstellerFilter.value.trim().toLowerCase();
  const typ = typFilter.value.trim().toLowerCase();

  const keineFilter = suchwoerter.length === 0 && !hersteller && !typ;
  const trefferAnzahl = document.getElementById("trefferAnzahl");
  container.innerHTML = "";

  if (keineFilter) {
    updateAutocompleteList(daten);
    fillDropdowns(daten);
    trefferAnzahl.textContent = "";
    showHomeCard();
    return;
  }

  const gefiltert = filterDaten(daten, suchwoerter, hersteller, typ);

  if (gefiltert.length === 0) {
    updateAutocompleteList(daten);
    fillDropdowns(daten, suchwoerter, hersteller, typ);
    trefferAnzahl.textContent = "";
    showHomeCard("Keine Treffer gefunden.");
    return;
  }

  fillDropdowns(gefiltert, suchwoerter, hersteller, typ);
  updateAutocompleteList(daten);
  trefferAnzahl.textContent = `${gefiltert.length} Treffer`;

  gefiltert.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";

    const typImagePath = item.typImage?.trim() || "";
    const herstellerImageName = item.hersteller?.toLowerCase().replace(/\s+/g, "_") + ".png";
    const herstellerImagePath = `images/hersteller/${herstellerImageName}`;

    card.innerHTML = `
      <div class="cardheader">
        <div class="herstellerImageContainer">
          <img class="herstellerImage theme-image" src="${herstellerImagePath}"
               data-theme-light="${herstellerImagePath}"
               data-theme-dark="images/hersteller/dark/${herstellerImageName}"
               alt="${item.hersteller}"
               onerror="this.onerror=null; this.src='images/icons/icon-512.webp'">
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
        ${typImagePath ? `
          <div class="typImageWrapper">
            <img class="typImage" src="${typImagePath}" alt="${item.typ}"
                 onerror="this.onerror=null; this.src='images/icons/icon-512.png'">
          </div>` : ""}
      </div>
    `;
    container.appendChild(card);

    if (item.details) {
      fetch(item.details)
        .then(res => res.ok ? res.text() : Promise.reject("Fehler beim Laden"))
        .then(html => {
          const detailsDiv = card.querySelector(".detailsContainer");
          if (detailsDiv) detailsDiv.innerHTML = html;
        })
        .catch(() => {
          const detailsDiv = card.querySelector(".detailsContainer");
          if (detailsDiv) detailsDiv.innerHTML = `<em>Details konnten nicht geladen werden.</em>`;
        });
    } else {
      const detailsDiv = card.querySelector(".detailsContainer");
      if (detailsDiv) detailsDiv.remove();
    }
  });

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
    showStatusMessage("Gespeicherte Fehlercodes erfolgreich geladen.", "success");
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
        showStatusMessage("Fehlercodes erfolgreich geladen.", "success");
      })
      .catch(() => {
        showHomeCard("⚠️ Fehlerliste konnte nicht geladen werden.");
      });
  }
}

function showHomeCard(hinweisText = null) {
  container.innerHTML = "";

  const homeCard = document.createElement("div");
  homeCard.className = "card homeCard";
  homeCard.innerHTML = `
    <div class="cardheader">
      <div class="logoContainer">
        <h3>find den Fehler</h3>
      </div>
      <button class="menu-toggle" id="homeMenuToggle" title="Extras">
        <svg class="icon"><use href="#icon-menu"></use></svg>
      </button>
    </div>
    <div class="cardContent">
      <div class="homeContent">
        <div>
          <svg class="icon-logo"><use href="#icon-logo"></use></svg>
        </div>
        <div>
          <p id="homeMessage">
            ${hinweisText || `Gib einen Fehlercode ein. Oder,<br>Wähle einen Typ um alle Fehler diesen Types zu sehen. Schlagwörter wie "Reset", "Schliessen" oder "ohne" sind auch möglich.`}
          </p>
        </div>
      </div>
      <div id="homeMenuContainer">
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
            <p>Alle Daten aus dem lokalen Speicher löschen</p>
          </button>
        </div>
      </div>
    </div>
  `;
  container.appendChild(homeCard);

  document.getElementById("homeMenuToggle")?.addEventListener("click", (e) => {
    const menu = document.getElementById("homeMenuContainer");
    menu.style.display = menu.style.display === "block" ? "none" : "block";
    e.stopPropagation();
  });

  const csvInput = document.getElementById("csvInput");
  document.getElementById("homeCsvBtn")?.addEventListener("click", () => {
    if (csvInput) csvInput.click();
  });

  document.getElementById("homeThemeBtn")?.addEventListener("click", () => {
    toggleTheme();
  });

  document.getElementById("homeResetBtn")?.addEventListener("click", () => {
    resetData();
  });

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
      showStatusMessage(`${file.name} erfolgreich geladen`, "success");
    };
    reader.readAsText(file, "UTF-8");
  });
}

function toggleTheme() {
  const current = document.body.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.body.setAttribute("data-theme", next);
  storage.setItem("theme", next);
  updateThemeAssets(next);
  showStatusMessage("Theme umgeschaltet");
}

function resetData() {
  storage.removeItem("csvData");
  storage.removeItem("theme");
  showStatusMessage("Zurückgesetzt – Seite wird neu geladen");
  setTimeout(() => location.reload(), 800);
}

// Autocomplete
function updateAutocompleteList(data) {
  const datalist = document.getElementById("codeSuggestions");
  if (!datalist) return;

  const uniqueCodes = [...new Set(data.map(d => d.code).filter(Boolean))];
  datalist.innerHTML = uniqueCodes
    .sort()
    .map(code => `<option value="${code}"></option>`)
    .join("");
}

// SVG ins DOM laden
fetch("images/symbole/sprite.svg")
  .then(res => res.text())
  .then(svg => {
    const div = document.createElement("div");
    div.style.display = "none";
    div.innerHTML = svg;
    document.body.appendChild(div);
  });

// Elemente & Daten
const searchInput = document.getElementById("searchInput");
const herstellerFilter = document.getElementById("herstellerFilter");
const typFilter = document.getElementById("typFilter");
const container = document.getElementById("container");
let daten = [];

// Theme anwenden
const savedTheme = storage.getItem("theme");
if (savedTheme) {
  document.body.setAttribute("data-theme", savedTheme);
  updateThemeAssets(savedTheme);
}

// Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").then(reg => {
    reg.onupdatefound = () => {
      const newWorker = reg.installing;
      newWorker.onstatechange = () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          showStatusMessage("🔄 Neue Version verfügbar. Seite neu laden.", "info");
        }
      };
    };
  });
}

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
  if (currentY > lastScrollY && currentY > 80) {
    headerEl.classList.add("hide");
  } else if (currentY < lastScrollY - 6) {
    headerEl.classList.remove("hide");
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

// 🔁 Aktualisiert die Steuerungs-Buttons (Sichtbarkeit / Aktivierung)
function updateControlButtons() {
  document.getElementById("btnClearSearch").disabled = searchInput.value.trim() === "";
  document.getElementById("btnResetFilters").disabled =
    herstellerFilter.value === "" && typFilter.value === "";
}

// Suche zurücksetzen
document.getElementById("btnClearSearch").addEventListener("click", () => {
  searchInput.value = "";
  renderDaten();
  updateControlButtons();
});

// Filter zurücksetzen
document.getElementById("btnResetFilters").addEventListener("click", () => {
  herstellerFilter.value = "";
  typFilter.value = "";
  renderDaten();
  updateControlButtons();
});

// Reaktion auf jede Eingabe
[searchInput, herstellerFilter, typFilter].forEach(input => {
  input.addEventListener("input", debounce(() => {
    renderDaten();
    updateControlButtons();
  }, 300));
});

// Start
loadData();
updateControlButtons();
