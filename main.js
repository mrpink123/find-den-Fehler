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

function fillDropdowns(data, codeFilter = "", herstellerFilterVal = "", typFilterVal = "") {
  const allHerstellerLabels = new Map();
  const allTypLabels = new Map();
  const herstellerCounts = {};
  const typCounts = {};

  const codeRegex = codeFilter ? new RegExp(`\\b${codeFilter}\\b`, "i") : null;

  // Alle Hersteller und Typen sammeln (alle, unabhängig von Filter)
  daten.forEach(item => {
    const herstellerKey = item.hersteller?.toLowerCase() || "";
    const typKey = item.typ?.toLowerCase() || "";

    if (herstellerKey && !allHerstellerLabels.has(herstellerKey)) {
      allHerstellerLabels.set(herstellerKey, item.hersteller);
    }
    if (typKey && !allTypLabels.has(typKey)) {
      allTypLabels.set(typKey, item.typ);
    }

    // Hersteller zählen – unabhängig vom Filter
    herstellerCounts[herstellerKey] ??= { label: item.hersteller, count: 0 };
  });

  // Typen zählen – abhängig von Filter
  data.forEach(item => {
    const herstellerKey = item.hersteller?.toLowerCase() || "";
    const typKey = item.typ?.toLowerCase() || "";
    const codeMatch = !codeRegex ||
      codeRegex.test(item.code) ||
      (item.suchbegriffe && codeRegex.test(item.suchbegriffe));

    const herstellerMatch = !herstellerFilterVal || herstellerKey === herstellerFilterVal;

    if (codeMatch && herstellerMatch && typKey) {
      typCounts[typKey] ??= { label: item.typ, count: 0 };
      typCounts[typKey].count++;
    }

    // Hersteller zählen nur, wenn Treffer für aktuellen Filter
    if (codeMatch) {
      herstellerCounts[herstellerKey].count++;
    }
  });

  // HERSTELLER Dropdown (immer komplett anzeigen)
  herstellerFilter.innerHTML =
    '<option value="">Alle Hersteller</option>' +
    Array.from(allHerstellerLabels.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([key, label]) => {
        const count = herstellerCounts[key]?.count || 0;
        return `<option value="${key}">${label} (${count})</option>`;
      })
      .join("");

  // TYP Dropdown (gefiltert)
  typFilter.innerHTML =
    '<option value="">Alle Typen</option>' +
    Object.values(typCounts)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(val => `<option value="${val.label.toLowerCase()}">${val.label} (${val.count})</option>`)
      .join("");

  // Wiederherstellen der Auswahl
  herstellerFilter.value = herstellerFilterVal;
  typFilter.value = typFilterVal;
}

function updateAutocompleteList(data) {
  const datalist = document.getElementById("codeSuggestions");
  if (!datalist) return;
  const codes = [...new Set(data.map((d) => d.code).filter(Boolean))];
  datalist.innerHTML = codes.sort().map((c) => `<option value="${c}"></option>`).join("");
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

function renderDaten() {
  const suchtext = searchInput.value.trim().toLowerCase();
  const suchwoerter = suchtext.split(/\s+/).filter(w => w.length > 0);
  const hersteller = herstellerFilter.value.trim().toLowerCase();
  const typ = typFilter.value.trim().toLowerCase();
  const codeFilter = suchwoerter.length > 0 ? suchtext : "";

  const keineFilterAktiv = suchwoerter.length === 0 && !hersteller && !typ;
  const trefferAnzahl = document.getElementById("trefferAnzahl");
  container.innerHTML = "";

  if (keineFilterAktiv) {
    updateAutocompleteList(daten);
    fillDropdowns(daten, codeFilter, hersteller, typ);
    trefferAnzahl.textContent = "";
    showHomeCard();
    return;
  }

  // Daten filtern
  const filtered = daten.filter(item => {
    const itemCode = item.code?.toLowerCase() || "";
    const itemSuchbegriffe = item.suchbegriffe?.toLowerCase() || "";
    const itemHersteller = item.hersteller?.toLowerCase() || "";
    const itemTyp = item.typ?.toLowerCase() || "";

    const matchesSuchtext = suchwoerter.every(w => {
      const regex = new RegExp(`\\b${w}\\b`, "i");
      return regex.test(itemCode) || regex.test(itemSuchbegriffe);
    });

    const matchesHersteller = !hersteller || itemHersteller === hersteller;
    const matchesTyp = !typ || itemTyp === typ;

    return matchesSuchtext && matchesHersteller && matchesTyp;
  });

  if (filtered.length === 0) {
    updateAutocompleteList(daten);
    fillDropdowns(daten, codeFilter, hersteller, typ); // Trefferanzahl 0, aber Filteroptionen sichtbar
    trefferAnzahl.textContent = "";
    showHomeCard("Keine Treffer gefunden.");
    return;
  }

  fillDropdowns(filtered, codeFilter, hersteller, typ); // Nur gültige Filteroptionen anzeigen
  updateAutocompleteList(daten);
  trefferAnzahl.textContent = `${filtered.length} Treffer`;

  filtered.forEach(item => {
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

    container.appendChild(card);

    // Externe HTML-Details laden
    if (item.details) {
      fetch(item.details)
        .then(res => res.ok ? res.text() : Promise.reject("Fehler beim Laden"))
        .then(html => {
          const detailsDiv = card.querySelector(".detailsContainer");
          detailsDiv.innerHTML = html;
        })
        .catch(() => {
          const detailsDiv = card.querySelector(".detailsContainer");
          if (detailsDiv) {
            detailsDiv.innerHTML = `<em>Details konnten nicht geladen werden.</em>`;
          }
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

// 🔄 Setzt die Filters zurück (aber NICHT die Sucheingabe!)
document.getElementById("btnResetFilters").addEventListener("click", () => {
  herstellerFilter.value = "";
  typFilter.value = "";
  renderDaten();
  updateControlButtons();
});

// 🔄 Löscht die Sucheingabe (aber NICHT die Filterauswahl!)
document.getElementById("btnClearSearch").addEventListener("click", () => {
  searchInput.value = "";
  renderDaten(); // verwendet weiterhin herstellerFilter und typFilter
  updateControlButtons();
});

// 🔁 Aktualisiert die Anzeige bei Änderungen an den Eingabefeldern
[searchInput, herstellerFilter, typFilter].forEach((el) => {
  el.addEventListener("input", debounce(() => {
    renderDaten(); // alles wird aktualisiert
    updateControlButtons();
  }, 300));
});

// Start
loadData();
updateControlButtons();
