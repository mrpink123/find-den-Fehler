window.addEventListener("load", () => {
  setTimeout(() => {
    document.getElementById("splash-screen").style.display = "none";
    document.getElementById("app").style.display = "block";
  }, 1500);
});

// ==== Lokaler Speicher mit Fallback ====
function getStorage() {
  try {
    const testKey = "__test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return localStorage;
  } catch {
    const memoryStore = {};
    return {
      getItem: (key) => memoryStore[key] || null,
      setItem: (key, value) => (memoryStore[key] = value),
      removeItem: (key) => delete memoryStore[key],
    };
  }
}
const storage = getStorage();

// ==== Benachrichtigung ====
function showStatusMessage(text, type = "info", timeout = 4000) {
  const msgBox = document.getElementById("statusMessage");
  msgBox.innerHTML = (type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️") + " " + text;
  msgBox.className = `show ${type}`;
  setTimeout(() => {
    msgBox.className = msgBox.className.replace("show", "");
  }, timeout);
}

// ==== Debounce Funktion ====
function debounce(fn, delay = 500) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ==== Escape-RegEx für sichere Suchbegriffe ====
function escapeRegExp(string) {
  if (typeof string !== "string") {
    string = String(string || "");
  }
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCSV(text) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });

  if (result.errors.length > 0) {
    console.error("Fehler beim Parsen der CSV-Datei:", result.errors);
    showStatusMessage("Fehler beim Parsen der CSV-Datei", "error");
    return [];
  }

  return result.data
    .filter(row => {
      const hersteller = row.Hersteller?.trim().toLowerCase();
      const code = row.Code?.trim();
      return hersteller !== "csvversion" && code;
    })
    .map(row => {
      const get = (field) => row[field]?.trim() || "";

      const modalEntries = (row.Modal || "")
        .split("|")
        .map(entry => {
          const [label, url] = entry.split(":");
          return {
            label: label?.trim() || "",
            url: url?.trim() || ""
          };
        })
        .filter(entry => entry.label && entry.url); // Nur gültige

      return {
        hersteller: get("Hersteller"),
        typ: get("Typ"),
        code: get("Code"),
        suchbegriffe: get("Suchbegriffe"),
        fehler: get("Fehler"),
        ursache: get("Ursache"),
        infos: get("Info"),
        weitere: get("Weitere"),
        kategorie: get("Kategorie"),
        link: get("Link"),
        typImage: get("TypBild"),
        details: get("Details"),
        modal: modalEntries,
        csvVersion: get("CsvVersion")
      };
    });
}

function validateCSVHeaders(csvText, requiredHeaders = ["Hersteller", "Typ", "Code", "Fehler", "CsvVersion"]) {
  try {
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const actualHeaders = new Set((parsed.meta.fields || []).map(h => h.trim().toLowerCase()));
    const missing = requiredHeaders.filter(h => !actualHeaders.has(h.toLowerCase()));

    if (missing.length > 0) {
      console.warn("Fehlende Pflichtspalten in CSV:", missing);
      return { valid: false, missing };
    }

    return { valid: true, headers: parsed.meta.fields };
  } catch (err) {
    console.error("CSV Parsing fehlgeschlagen:", err);
    return { valid: false, error: err };
  }
}

// ==== CSV-Version aus der CSV auslesen ====
function extractCSVVersion(csvText) {
  try {
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

    // Version aus regulären Datenzeilen
    const fromData = parsed.data.find(row =>
      row?.CsvVersion?.trim() && row?.CsvVersion?.toLowerCase() !== "csvversion"
    );
    if (fromData?.CsvVersion) {
      return fromData.CsvVersion.trim();
    }

    const firstRow = parsed.data[0];
    if (firstRow?.Hersteller?.toLowerCase() === "csvversion") {
      return firstRow.CsvVersion?.trim() || null;
    }

    return null;
  } catch (err) {
    console.warn("Fehler beim Auslesen der CSV-Version:", err);
    return null;
  }
}

// ==== Globale Variablen ====
const searchInput = document.getElementById("searchInput");
const herstellerFilter = document.getElementById("herstellerFilter");
const typFilter = document.getElementById("typFilter");
const container = document.getElementById("container");
const searchHint = document.getElementById("searchHint");
let currentRenderSessionId = 0;
let daten = [];
window.APP_VERSION = "Unbekannt";
window.CSV_VERSION = "Unbekannt";

async function getAppVersionFromActiveSW() {
  if (navigator.serviceWorker?.controller) {
    return sendVersionRequest();
  }

  return new Promise((resolve) => {
    navigator.serviceWorker.addEventListener("controllerchange", async () => {
      const version = await sendVersionRequest();
      resolve(version);
    });
  });

  function sendVersionRequest() {
    return new Promise((resolve) => {
      const channel = new MessageChannel();

      channel.port1.onmessage = (event) => {
        if (event.data?.type === "APP_VERSION") {
          resolve(event.data.version || "Unbekannt");
        } else {
          resolve("Unbekannt");
        }
      };

      navigator.serviceWorker.controller?.postMessage(
        { type: "GET_VERSION" },
        [channel.port2]
      );
    });
  }
}

// ==== UI-Versionen aktualisieren ====
function updateAppVersionInUI() {
  const versionEl = document.getElementById("appVersionText");
  if (versionEl) versionEl.textContent = window.APP_VERSION || "Unbekannt";
}

function updateCSVVersionInUI() {
  const el = document.getElementById("csvVersionText");
  if (el) el.textContent = window.CSV_VERSION || "Unbekannt";
}

// ==== Dropdown Menüs befüllen ====
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

// ==== Filterlogik ====
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

// ==== Rendern der fehlerbeschreibung Items ====
function renderFehlerItem(code, kategorie, text) {
  return `
    <div style="max-width: 500px; padding: .5rem; border-radius: .5rem; border: 1px solid transparent; background: linear-gradient(var(--card-bg), var(--card-bg)) padding-box, linear-gradient(90deg, #ff0000a5, rgba(255, 255, 255, 0)) border-box;">
      <div style="display: grid; grid-template-columns: 26px auto; gap: 0.5rem;">
        <div style="display: flex;">
          <svg style="width: 24px; height: 24px; margin-top: 7px; margin-bottom: auto;" viewBox="0 0 128 128">
            <path d="M9.6 114.26L64 20.03l54.41 94.23z" fill="#fcc21b" />
            <g fill="#2f2f2f">
              <path
                d="M127.07 115.93L66.89 11.7c-.6-1.03-1.7-1.67-2.89-1.67c-1.19 0-2.29.64-2.88 1.67L.93 115.93c-.6 1.03-.6 2.3 0 3.34c.6 1.03 1.7 1.66 2.89 1.66h120.36c1.19 0 2.29-.63 2.89-1.66c.59-1.04.59-2.31 0-3.34zM9.6 114.26L64 20.03l54.41 94.23H9.6z"
              />
              <path
                d="M59.12 83.21h9.76c.36 0 .65-.23.67-.53l2.66-38.27c.01-.16-.05-.3-.18-.42a.736.736 0 0 0-.49-.18H56.46c-.19 0-.37.07-.49.18a.54.54 0 0 0-.18.42l2.67 38.27c.01.29.3.53.66.53zm-3.01 20.11c0-1.41.2-2.6.61-3.57c.4-.98.96-1.77 1.68-2.37c.72-.6 1.56-1.04 2.54-1.31c.97-.27 2.01-.41 3.13-.41c1.05 0 2.05.14 3 .41c.95.27 1.78.71 2.49 1.31c.72.6 1.29 1.38 1.71 2.37c.42.97.63 2.16.63 3.57c0 1.35-.21 2.51-.63 3.46c-.42.96-.99 1.76-1.71 2.39c-.71.63-1.54 1.09-2.49 1.37c-.95.28-1.95.43-3 .43c-1.11 0-2.15-.14-3.13-.43s-1.82-.74-2.54-1.37a6.196 6.196 0 0 1-1.68-2.39c-.41-.96-.61-2.11-.61-3.46z"
              />
            </g>
          </svg>
        </div>
        <div style="display: flex; flex-direction: column;">
          <p style="margin: 0.5rem 0;">
            <b>Fehler: ${code}</b>
            ${kategorie ? `<b> (${kategorie})</b>` : ""}
          </p>
          <p>${text}</p>
        </div>
      </div>
    </div>
  `;
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

function renderDescriptionItem(color = "var(--card-bg)", svg = "", name = "", text = "", clsName = null) {
  return `
    <div style="
      max-width: 500px; 
      padding: .5rem; 
      border-radius: .5rem; 
      border: 1px solid transparent; 
      background: linear-gradient(var(--card-bg), var(--card-bg)) padding-box, 
        linear-gradient(90deg, ${color}, rgba(255, 255, 255, 0)) border-box;" 
      ${clsName ? `class = ${clsName}` : ""}
    >
      <div style="display: grid; grid-template-columns: 26px auto; gap: 0.5rem;">
        <div style="display: flex;">
          <svg style="width: 24px; height: 24px; margin-top: 7px">
            <use href="${svg}"></use>
          </svg>
        </div>
        <div style="display: flex; flex-direction: column;">
          <p style="margin: 0.5rem 0;">
            <b>${name}:</b>
          </p>
          <p>${text}</p>
        </div>
      </div>
    </div>  
  `;
}

// ==== Fehler Card rendern ====
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
        ${item.ursache ? renderDescriptionItem("#fcc21b", "#icon-ursache", "Maßnahme", item.ursache, "") : ""}
        ${item.infos ? renderDescriptionItem("#00a6ffff", "#icon-info", "Info", item.infos, "") : ""}
        ${item.weitere ? `<div style="margin-top:auto; padding-left:1rem;"><p>${item.weitere}</p></div>` : ""}
        <div class="errorDescriptionItem detailsContainer">Wird geladen ...</div>        
        ${item.link ? renderDescriptionItem(color = "var(--border)", "#icon-hilfe", item.link, "", "linkItem") : ""}
      </div>
    </div>
  `;

  const cardContent = card.querySelector(".cardContent");

  // Typbild mit optionalem Modal
  if (typImagePath) {
    const typImageWrapper = document.createElement("div");
    typImageWrapper.className = "typImageWrapper";

    const typImageContainer = document.createElement("div");
    typImageContainer.className = "typImageContainer";

    const typImage = document.createElement("img");
    typImage.className = "typImage";

    typImage.src = typImagePath;
    typImage.alt = item.typ;
    typImage.onerror = () => {
      typImage.onerror = null;
      typImage.src = "images/icons/icon-512.png";
    };

    if (Array.isArray(item.modal) && item.modal.length > 0) {
      typImageWrapper.classList.add("clickable");

      const typInfos = document.createElement("div");
      typInfos.className = "typinfos";
      typImageWrapper.appendChild(typInfos);

      const overlay = document.createElement("div");
      overlay.className = "imageOverlayText";
      overlay.textContent = "mehr Infos";
      typImageContainer.appendChild(overlay);

      const buttons = item.modal.map(entry => `
    <button class="btn" data-url="${entry.url}" title="${entry.label}">
      ${entry.label}
    </button>
  `).join("");
      typInfos.innerHTML += ` ${buttons} `;
      typInfos.querySelectorAll(".btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const url = btn.getAttribute("data-url");
          if (url) openTypImageModal(null, item.typ, url);
        });
      });
    }
    typImageContainer.appendChild(typImage)
    typImageWrapper.appendChild(typImageContainer);
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

// ==== Modal erstellen ====
function openTypImageModal(imagePath = null, typ = "", htmlPath = "") {
  document.body.classList.add("modal-open");
  const modalOverlay = document.createElement("div");
  modalOverlay.className = "modalOverlay";
  document.body.classList.add("modal-open");
  const modalHeader = document.createElement("div");
  modalHeader.className = "modalHeader"

  const modalContent = document.createElement("div");
  modalContent.className = "modalContent";
  modalContent.addEventListener("click", e => e.stopPropagation());

  const closeBtn = document.createElement("button");
  closeBtn.className = "modalCloseBtn";
  closeBtn.title = "schließen"
  closeBtn.innerHTML = `<svg class="icon small"><use href="#icon-x"></use></svg>`;
  closeBtn.addEventListener("click", () => closeModal());


  // Optionaler Titel
  if (typ) {
    const title = document.createElement("h3");
    title.className = "modalTitle";
    title.textContent = typ;
    modalHeader.appendChild(title);
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
        error.textContent = "Fehler beim Laden des Inhalts.";
        modalContent.appendChild(error);
      });
  }

  modalHeader.appendChild(closeBtn);
  modalContent.appendChild(modalHeader);
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
    document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", onKeyDown);
    if (modalOverlay.parentNode) {
      modalOverlay.parentNode.removeChild(modalOverlay);
      document.body.classList.remove("modal-open");
    }
  }
}

// ==== Sonderzeichen filtern ====
function escapeHTML(str) {
  return (str || "").replace(/[&<>"']/g, tag => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[tag]);
}

// ==== Rendert gefilterte Cards ====
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
    fillDropdowns(daten);
    updateAutocompleteList(daten);
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

// ==== Theme-Abhängige Assets aktualisieren ====
function updateThemeAssets(theme) {
  document.querySelectorAll(".theme-image").forEach((img) => {
    const newSrc = img.getAttribute(`data-theme-${theme}`);
    if (newSrc) img.src = newSrc;
  });
}

// ==== App-Daten laden ====
async function loadData() {
  const savedCSV = storage.getItem("csvData");
  const savedCSVVersion = storage.getItem("csvVersion");

  if (savedCSV && savedCSVVersion) {
    window.CSV_VERSION = savedCSVVersion;
    daten = parseCSV(savedCSV);
    fillDropdowns(daten);
    updateCSVVersionInUI?.();
    return;
  }

  try {
    const response = await fetch("fehlerliste.csv", { cache: "no-store" });
    if (!response.ok) throw new Error("Fehlerliste konnte nicht geladen werden");

    const text = await response.text();

    const validation = validateCSVHeaders(text);
    if (!validation.valid) {
      showStatusMessage("Die Fehlerliste ist ungültig oder beschädigt. Bitte korrigieren.", "error");
      daten = [];
      window.CSV_VERSION = "Unbekannt";
      updateCSVVersionInUI?.();
      showHomeCard();
      return;
    }

    const version = extractCSVVersion(text) || "Unbekannt";

    storage.setItem("csvData", text);
    storage.setItem("csvVersion", version);

    window.CSV_VERSION = version;
    daten = parseCSV(text);
    fillDropdowns(daten);
    updateCSVVersionInUI?.();
  } catch (err) {
    showStatusMessage("Fehlercodes konnten nicht geladen werden. Bitte manuell laden.", "error");
    daten = [];
    window.CSV_VERSION = "Unbekannt";
    updateCSVVersionInUI?.();
    showHomeCard();
  }
}

// ==== Rendert in abschnitten ====
function renderDatenLazy(filtered, sessionId) {
  let index = 0;

  function renderChunk(deadline) {
    // Session-Abbruch prüfen
    if (sessionId !== currentRenderSessionId) return;

    while (index < filtered.length && (deadline.timeRemaining() > 0 || deadline.didTimeout)) {
      const item = filtered[index++];
      const card = renderCard(item);
      container.appendChild(card);
    }

    if (index < filtered.length && sessionId === currentRenderSessionId) {
      requestIdleCallback(renderChunk);
    }
  }

  const ric = window.requestIdleCallback || function (cb) {
    setTimeout(() => cb({ timeRemaining: () => 50, didTimeout: false }), 1);
  };

  ric(renderChunk);
}

// ==== Rendert die Home Card ====
function showHomeCard(hinweisText = null) {
  if (!container) return;

  container.innerHTML = "";

  const homeCard = document.createElement("div");
  homeCard.className = "card homeCard transition-03";
  homeCard.innerHTML = `
    <div class="cardheader">
      <div class="cardHeaderContent"></div>
      <button class="btnMenuToggle" id="homeMenuToggle" title="Extras">
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
          <button id="homeCsvBtn" class="btn highlight">
            <svg class="button-icon"><use href="#icon-upload"></use></svg>
            <p>Fehlerliste Laden</p>
          </button>
          <button id="homeThemeBtn" class="btn highlight">
            <svg class="button-icon"><use href="#icon-theme"></use></svg>
            <p>Dark / Light Theme</p>
          </button>
          <button id="homeResetBtn" class="btn highlight">
            <svg class="button-icon"><use href="#icon-trash"></use></svg>
            <p>lokale Daten löschen</p>
          </button>
        </div>
        <div class="versionContainer">
          <p class="version highlight">App: <span id="appVersionText">lade…</span></p>
          <p class="version highlight">Fehlerliste: <span id="csvVersionText"> lade…</span></p>
        </div>
        
      </div>
    </div>
    <div id="updateInfoContainer"></div>
  `;

  if (container) container.appendChild(homeCard);

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

    // Gültigkeit prüfen
    const validation = validateCSVHeaders(text);
    if (!validation.valid) {
      showStatusMessage("Die hochgeladene Fehlerliste ist ungültig.", "error");
      return;
    }

    // Version extrahieren
    const version = extractCSVVersion(text) || "Unbekannt";

    // Daten speichern & anzeigen
    storage.setItem("csvData", text);
    storage.setItem("csvVersion", version);
    window.CSV_VERSION = version;

    daten = parseCSV(text);
    fillDropdowns(daten);
    updateCSVVersionInUI?.();
    renderDaten();
    showStatusMessage(`${file.name} erfolgreich geladen`, "success");

    csvInput.value = "";
  };
  reader.readAsText(file, "UTF-8");
});


  // Versionen aktualisieren
  updateAppVersionInUI();
  updateCSVVersionInUI();

  // Hinweis für verfügbares Update anzeigen (wenn nötig)
  showUnifiedUpdateNotice();
}

// ==== Toggle zwischen Light / Dark Theme ====
function toggleTheme() {
  const current = document.body.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.body.setAttribute("data-theme", next);
  storage.setItem("theme", next);
  updateThemeAssets(next);
}

// ==== Filter zurücksetzen ====
function resetData() {
  storage.removeItem("csvData");
  storage.removeItem("csvVersion");
  storage.removeItem("theme");
  sessionStorage.setItem("appReset", "1");
  showStatusMessage("lade neu");
  setTimeout(() => location.reload(), 500);
}

// ==== Autocomplete aktualisieren ====
function updateAutocompleteList(data) {
  const datalist = document.getElementById("codeSuggestions");
  if (!datalist) return;
  const uniqueCodes = [...new Set(data.map((d) => d.code).filter(Boolean))];
  datalist.innerHTML = uniqueCodes
    .sort()
    .map((code) => `<option value="${code}"></option>`)
    .join("");
}

function showUnifiedUpdateNotice() {
  if (sessionStorage.getItem("updateInstalled") || window.updateNoticeInProgress) {
    return;
  }

  const container = document.getElementById("updateInfoContainer");
  if (!container) return;

  let notice = document.getElementById("updateMessage");

  const showCsv = window.csvUpdateAvailable;
  const showApp = window.updateAvailable;

  if (!showCsv && !showApp) {
    if (notice) notice.remove();
    return;
  }

  const title = showCsv && showApp
    ? "Neue Version von App & Fehlerliste verfügbar."
    : showApp
      ? "Neue App-Version verfügbar."
      : "Neue Fehlerliste verfügbar.";

  const btnLabel = showCsv && showApp
    ? "Jetzt alles aktualisieren"
    : showApp
      ? "App aktualisieren"
      : "Fehlerliste aktualisieren";

  const html = `
    <p>${title}</p>
    <button id="applyUpdateBtn" class="btn" title="${btnLabel}">
      <svg><use href="#icon-update"></use></svg>
      <p>${btnLabel}</p>
    </button>
  `;

  if (notice) {
    notice.innerHTML = html;
  } else {
    notice = document.createElement("div");
    notice.id = "updateMessage";
    notice.className = "updateInfo";
    notice.innerHTML = html;
    container.appendChild(notice);
  }

  document.getElementById("applyUpdateBtn")?.addEventListener("click", () => {
    const notice = document.getElementById("updateMessage");
    if (notice) notice.remove();

    window.updateNoticeInProgress = true;

    if (showCsv && showApp) {
      applyCsvUpdate(false);
      sessionStorage.setItem("appUpdatePending", "1");
      applyAppUpdate();
    } else if (showCsv) {
      applyCsvUpdate(true);
    } else if (showApp) {
      applyAppUpdate();
    }
  });
}

function applyCsvUpdate(reload = true) {
  if (window.NEW_CSV?.text && window.NEW_CSV.version) {
    storage.setItem("csvData", window.NEW_CSV.text);
    storage.setItem("csvVersion", window.NEW_CSV.version);
    window.CSV_VERSION = window.NEW_CSV.version;

    window.csvUpdateAvailable = false;
    window.NEW_CSV = null;

    sessionStorage.setItem("csvUpdated", "1");

    if (reload) {
      location.reload();
    } else {
      loadData();
      showHomeCard();
    }
  }
}

function applyAppUpdate() {
  if (window.updateReadyWorker) {
    sessionStorage.setItem("appUpdatePending", "1");
    window.updateReadyWorker.postMessage({ type: "SKIP_WAITING" });
  }
}

async function checkForUpdates() {
  let updateNoticePending = false;

  // CSV-Update prüfen
  try {
    const response = await fetch("fehlerliste.csv", { cache: "no-store" });
    if (!response.ok) throw new Error("Keine Verbindung zur CSV-Datei");

    const text = await response.text();
    const newVersion = extractCSVVersion(text);
    const currentVersion = storage.getItem("csvVersion");

    if (newVersion && newVersion !== currentVersion) {
      window.csvUpdateAvailable = true;
      window.NEW_CSV = { version: newVersion, text };
      updateNoticePending = true;
    }
  } catch {
    console.warn("Keine neue CSV erkannt.");
  }

  // App-Update prüfen
  if (!("serviceWorker" in navigator)) {
    if (updateNoticePending) showUnifiedUpdateNotice();
    return;
  }

  navigator.serviceWorker.getRegistration().then((reg) => {
    if (reg) reg.update();

    const maybeShowNotice = () => {
      if ((window.updateAvailable || window.csvUpdateAvailable) && !sessionStorage.getItem("updateInstalled") && !window.updateNoticeInProgress) {
        showUnifiedUpdateNotice();
      }
    };

    if (reg?.waiting) {
      window.updateReadyWorker = reg.waiting;
      window.updateAvailable = true;
      maybeShowNotice();
    }

    reg?.addEventListener("updatefound", () => {
      const newWorker = reg.installing;
      newWorker?.addEventListener("statechange", () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          window.updateReadyWorker = newWorker;
          window.updateAvailable = true;
          maybeShowNotice();
        }
      });
    });

    if (updateNoticePending) {
      maybeShowNotice();
    }
  });
}

// ==== Service Worker Registrierung + Update-Erkennung ====
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").then(reg => {
    console.log("[SW] registriert:", reg.scope);
  }).catch(err => {
    console.warn("[SW] Registrierung fehlgeschlagen:", err);
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (sessionStorage.getItem("appUpdatePending") === "1") {
      sessionStorage.setItem("updateInstalled", "1");
      location.reload();
    }
  });
}

// ==== Scroll-Top-Button ====
const scrollTopBtn = document.getElementById("scrollTopBtn");
window.addEventListener("scroll", () => {
  scrollTopBtn.classList.toggle("show", window.scrollY > 300);
}, { passive: true });

scrollTopBtn.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ==== Header Hide/Show ====
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

// ==== Filter und Suche leeren bei klick auf logo ====
document.getElementById("logo-sm")?.addEventListener("click", () => {
  searchInput.value = "";
  searchHint.value = "";
  herstellerFilter.value = "";
  typFilter.value = "";
  updateURLHash();
  renderDaten();
  updateControlButtons();
});

// ==== Autocomplete für Codes ====
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

// ==== App starten ====
async function initApp() {
  // Theme laden
  const savedTheme = storage.getItem("theme");
  if (savedTheme) {
    document.body.setAttribute("data-theme", savedTheme);
    updateThemeAssets(savedTheme);
  }

  // SVG-Symbole einfügen
  fetch("images/symbole/sprite.svg")
    .then(res => res.text())
    .then(svg => {
      const div = document.createElement("div");
      div.style.display = "none";
      div.innerHTML = svg;
      document.body.appendChild(div);
    });

  // Vorinitialisierung von Versionen
  window.APP_VERSION = "Unbekannt";
  window.CSV_VERSION = "Unbekannt";

  // App-Version aus Service Worker
  const initialAppVersion = await getAppVersionFromActiveSW();
  if (initialAppVersion) {
    window.APP_VERSION = initialAppVersion;
    updateAppVersionInUI?.();
  }

  // Fehlerliste laden
  await loadData();

  // CSV-Version-UI aktualisieren
  updateCSVVersionInUI?.();

  // Erfolgsnachricht(en) nach Update
  const appWasUpdated = sessionStorage.getItem("updateInstalled") === "1";
  const csvWasUpdated = sessionStorage.getItem("csvUpdated") === "1";

  if (appWasUpdated && csvWasUpdated) {
    showStatusMessage(
      `App & Fehlerliste wurden erfolgreich aktualisiert (v${window.APP_VERSION} / v${window.CSV_VERSION}).`,
      "success"
    );
  } else if (appWasUpdated) {
    showStatusMessage(`Update auf App-Version ${window.APP_VERSION} erfolgreich durchgeführt.`, "success");
  } else if (csvWasUpdated) {
    showStatusMessage(`Fehlerliste erfolgreich aktualisiert auf v${window.CSV_VERSION}`, "success");
  }

  // Session-Marker bereinigen
  sessionStorage.removeItem("updateInstalled");
  sessionStorage.removeItem("csvUpdated");
  sessionStorage.removeItem("appUpdatePending");
  window.updateNoticeInProgress = false;

  // Nach Updates suchen (falls neue CSV/SW vorhanden)
  checkForUpdates();

  // URL-Hash auslesen
  const { code = "", hersteller = "", typ = "" } = parseURLHash() || {};
  if (code) searchInput.value = code;
  if (hersteller) herstellerFilter.value = hersteller;
  if (typ) typFilter.value = typ;

  // Reset-Hinweis anzeigen
  if (sessionStorage.getItem("appReset") === "1") {
    sessionStorage.removeItem("appReset");
    showStatusMessage("App wurde zurückgesetzt. Standarddaten wurden geladen.", "info");
  }

  // Inhalte anzeigen
  renderDaten();
  updateControlButtons();
}

// Start
initApp();
