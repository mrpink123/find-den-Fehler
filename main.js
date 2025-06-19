// Fallback-Speicher für Geräte ohne funktionierenden localStorage
function getStorage() {
    try {
        const testKey = '__test__';
        localStorage.setItem(testKey, '1');
        localStorage.removeItem(testKey);
        return localStorage;
    } catch (e) {
        console.warn('⚠️ localStorage nicht verfügbar. Fallback-Speicher wird verwendet.');
        const memoryStore = {};
        return {
            getItem: key => memoryStore[key] || null,
            setItem: (key, value) => { memoryStore[key] = value; },
            removeItem: key => { delete memoryStore[key]; }
        };
    }
}

const storage = getStorage();

// Zeigt Benachrichtigungs Fenster
function showStatusMessage(text, type = "success", timeout = 4000) {
    const msgBox = document.getElementById("statusMessage");
    msgBox.innerHTML = (type === "success" ? "✅ " : "⚠️ ") + text;
    msgBox.className = `show ${type}`;
    setTimeout(() => {
        msgBox.className = msgBox.className.replace("show", "");
    }, timeout);
}

function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Parst CSV
function parseCSV(text) {
    const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
    });
    if (result.errors.length > 0) {
        showStatusMessage("Fehler beim Parsen der CSV-Datei.", "error");
        return [];
    }
    return result.data.map((row) => ({
        hersteller: (row["Hersteller"] || "").trim(),
        typ: (row["Typ"] || "").trim(),
        code: (row["Code"] || "").trim(),
        suchbegriffe: (row["Suchbegriffe"] || "").trim(),
        fehler: (row["Fehler"] || "").trim(),
        ursache: (row["Maßnahme"] || "").trim(),
        infos: (row["Info"] || "").trim(),
        weitere: (row["Weitere"] || "").trim(),
        kategorie: (row["Kategorie"] || "").trim(),
        link: (row["Link"] || "").trim(),
        typImage: (row["TypBild"] || "").trim(),
        details: (row["Details"] || "").trim(),
    }));
}

function fillDropdowns(data, codeFilter = "", herstellerFilterVal = "", typFilterVal = "") {
    const herstellerCounts = new Map();
    const typCounts = new Map();

    const codeRegex = codeFilter ? new RegExp(`\\b${codeFilter}\\b`, "i") : null;
    const herstellerActive = !!herstellerFilterVal;
    const typActive = !!typFilterVal;

    data.forEach(d => {
        const herstellerKey = d.hersteller.toLowerCase();
        const typKey = d.typ.toLowerCase();

        const codeMatch = !codeRegex ||
            codeRegex.test(d.code) ||
            (d.suchbegriffe && codeRegex.test(d.suchbegriffe));

        if (!codeMatch) return;

        // Hersteller zählen
        if (!herstellerCounts.has(herstellerKey)) {
            herstellerCounts.set(herstellerKey, { label: d.hersteller, count: 0 });
        }
        herstellerCounts.get(herstellerKey).count++;

        // Typ zählen – nur wenn Hersteller passt
        const herstellerMatch = !herstellerActive || herstellerKey === herstellerFilterVal.toLowerCase();
        if (herstellerMatch) {
            if (!typCounts.has(typKey)) {
                typCounts.set(typKey, { label: d.typ, count: 0 });
            }
            typCounts.get(typKey).count++;
        }
    });

    // Hersteller-Dropdown befüllen
    herstellerFilter.innerHTML =
        `<option value="">Alle Hersteller</option>` +
        [...herstellerCounts.values()]
            .sort((a, b) => a.label.localeCompare(b.label))
            .map(val => `<option value="${val.label.toLowerCase()}">${val.label} (${val.count})</option>`)
            .join("");

    // Typ-Dropdown befüllen
    typFilter.innerHTML =
        `<option value="">Alle Typen</option>` +
        [...typCounts.values()]
            .sort((a, b) => a.label.localeCompare(b.label))
            .map(val => `<option value="${val.label.toLowerCase()}">${val.label} (${val.count})</option>`)
            .join("");

    // Auswahl wiederherstellen (falls gültig)
    herstellerFilter.value = herstellerFilterVal.toLowerCase();
    typFilter.value = typFilterVal.toLowerCase();
}


function updateAutocompleteList(data) {
    const datalist = document.getElementById("codeSuggestions");
    if (!datalist) {
        console.warn("⚠️ Datalist #codeSuggestions nicht gefunden");
        return;
    }
    const uniqueCodes = [
        ...new Set(data.map((d) => d.code).filter(Boolean)),
    ];
    datalist.innerHTML = uniqueCodes
        .sort()
        .map((code) => `<option value="${code}"></option>`)
        .join("");
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

    const trefferAnzahl = document.getElementById("trefferAnzahl");
    container.innerHTML = "";

    const keineFilterAktiv = suchwoerter.length === 0 && !hersteller && !typ;
    if (keineFilterAktiv) {
        updateAutocompleteList(daten);
        trefferAnzahl.textContent = "";
        showHomeCard(); // Standard-Startansicht
        return;
    }

    // Daten filtern
    const filtered = daten.filter(item => {
        const itemCode = item.code?.toLowerCase() || "";
        const itemSuchbegriffe = item.suchbegriffe?.toLowerCase() || "";
        const itemHersteller = item.hersteller?.toLowerCase() || "";
        const itemTyp = item.typ?.toLowerCase() || "";

        const matchesSuchtext = suchwoerter.every(wort => {
            const regex = new RegExp(`\\b${wort}\\b`, "i");
            return regex.test(itemCode) || regex.test(itemSuchbegriffe);
        });

        const matchesHersteller = !hersteller || itemHersteller === hersteller;
        const matchesTyp = !typ || itemTyp === typ;

        return matchesSuchtext && matchesHersteller && matchesTyp;
    });

    // Keine Treffer → HomeCard mit Hinweis
    if (filtered.length === 0) {
        fillDropdowns(daten, codeFilter, hersteller, typ); // Filter erhalten
        updateAutocompleteList(daten);
        trefferAnzahl.textContent = "";
        showHomeCard("Keine Treffer gefunden.");
        return;
    }

    // Treffer anzeigen
    fillDropdowns(daten, codeFilter, hersteller, typ);
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

        // Externe Details laden
        if (item.details) {
            fetch(item.details)
                .then(res => res.ok ? res.text() : Promise.reject("Fehler beim Laden"))
                .then(html => {
                    const detailsDiv = card.querySelector(".detailsContainer");
                    detailsDiv.innerHTML = html;
                })
                .catch(() => {
                    const detailsDiv = card.querySelector(".detailsContainer");
                    detailsDiv.innerHTML = `<em>Details konnten nicht geladen werden.</em>`;
                });
        } else {
            const detailsDiv = card.querySelector(".detailsContainer");
            if (detailsDiv) detailsDiv.remove();
        }
    });

    updateThemeAssets(document.body.getAttribute("data-theme"));
}


// Aktuallisiert die Bilder passend zum Theme
function updateThemeAssets(theme) {
    document.querySelectorAll(".theme-image").forEach((img) => {
        const newSrc = img.getAttribute(`data-theme-${theme}`);
        if (newSrc) img.src = newSrc;
    });
}

// Versucht CSV Daten aus dem lokalen Speicher zu laden
function loadData() {
    const savedCSV = storage.getItem("csvData");

    if (savedCSV) {
        daten = parseCSV(savedCSV);
        fillDropdowns(daten);
        renderDaten();
        showStatusMessage(
            "Gespeicherte Fehlercodes erfolgreich geladen.",
            "success"
        );
    } else {
        fetch("fehlerliste.csv")
            .then((res) => {
                if (!res.ok) throw new Error("Fehlerliste nicht gefunden");
                return res.text();
            })
            .then((text) => {
                daten = parseCSV(text);
                fillDropdowns(daten);
                renderDaten();
                storage.setItem("csvData", text);
                showStatusMessage("Fehlercodes erfolgreich geladen.", "success");
            })
            .catch(() => {
                showStatusMessage(
                    "Fehlercodes konnten nicht geladen werden. Bitte manuell laden.",
                    "error"
                );
                showHomeCard(); // HomeCard anzeigen, wenn Fehler beim Laden der CSV
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
            <p id="homeMessage">${hinweisText || "Gib einen Fehlercode ein. Oder,<br>Wähle einen Typ um alle Fehler diesen Types zu sehen. Schlagwörter wie \"Reset\", \"Schliessen\" oder \"ohne\" sind auch möglich."}</p>
      </div>
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
                <p>Lösche alle Daten aus dem lokalen Speicher. Dadurch wird auch die Fehlerliste gelöscht.!</p>
            </button>
        </div>
      </div>
    </div>
  `;
    container.appendChild(homeCard);

    // Menü-Button
    document.getElementById("homeMenuToggle")
        .addEventListener("click", e => {
            const menuContainer = document.getElementById("homeMenuContainer");
            const isVisible = menuContainer.style.display === "block";
            menuContainer.style.display = isVisible ? "none" : "block";
            e.stopPropagation();
        });

    const csvInput = document.getElementById("csvInput");

    // Öffnen der CSV-Datei bei Button-Klick
    document.getElementById("homeCsvBtn")
        .addEventListener("click", () => {
            if (csvInput) {
                csvInput.click();
            } else {
                console.error("csvInput nicht gefunden!");
            }
        });

    // Theme umschalten
    document.getElementById("homeThemeBtn")
        .addEventListener("click", () => { toggleTheme(); });

    // Zurücksetzen der Daten
    document.getElementById("homeResetBtn")
        .addEventListener("click", () => { resetData(); });


    // Ließt Fehlerlisten Datei ein und speichert sie lokal
    csvInput.addEventListener("change", function () {
        const file = this.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (event) {
            const text = event.target.result;
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

function updateControlButtons() {
    document.getElementById("btnClearSearch").disabled = searchInput.value.trim() === "";
    document.getElementById("btnResetFilters").disabled =
        herstellerFilter.value === "" && typFilter.value === "";
}

// SVG ins DOM holen
fetch("images/symbole/sprite.svg")
    .then(res => res.text())
    .then(svg => {
        const div = document.createElement("div");
        div.style.display = "none";
        div.innerHTML = svg;
        document.body.appendChild(div);
    });


// Menü
const searchInput = document.getElementById("searchInput");
const herstellerFilter = document.getElementById("herstellerFilter");
const typFilter = document.getElementById("typFilter");
const container = document.getElementById("container");
let daten = [];


// Läd gespeichertes Theme
const savedTheme = storage.getItem("theme");
if (savedTheme) {
    document.body.setAttribute("data-theme", savedTheme);
    updateThemeAssets(savedTheme);
    loadData();
}

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

// Registriert den Service Worker
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

loadData();
updateControlButtons();

// Scroll nach oben Button
const scrollTopBtn = document.getElementById("scrollTopBtn");
window.addEventListener("scroll", () => {
    if (window.scrollY > 300) {
        scrollTopBtn.classList.add("show");
    } else {
        scrollTopBtn.classList.remove("show");
    }
}, { passive: true });
scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
});

// Header automatisch ein-/ausblenden beim Scrollen
let lastScrollY = window.scrollY;
const headerEl = document.getElementById("siteHeader");
let ticking = false;

function onScroll() {
    const currentScrollY = window.scrollY;

    if (currentScrollY > lastScrollY && currentScrollY > 80) {
        headerEl.classList.add("hide");
    } else if (currentScrollY < lastScrollY - 6) {
        headerEl.classList.remove("hide");
    }

    lastScrollY = currentScrollY;
    ticking = false;
}

window.addEventListener("scroll", () => {
    if (!ticking) {
        window.requestAnimationFrame(onScroll);
        ticking = true;
    }
}, { passive: true });

// Filter-Reset-Button
document.getElementById("btnResetFilters").addEventListener("click", () => {
    herstellerFilter.value = "";
    typFilter.value = "";
    renderDaten();
    updateControlButtons();
});

// Filter-Änderung triggert neue Darstellung
[searchInput, herstellerFilter, typFilter].forEach((input) => {
    input.addEventListener("input", debounce(() => {
        renderDaten();
        updateControlButtons();
    }, 300));
});

document.getElementById("btnClearSearch").addEventListener("click", () => {
    searchInput.value = "";

    // Dropdowns neu befüllen mit aktiven Filtern (nicht resetten!)
    const hersteller = herstellerFilter.value.trim().toLowerCase();
    const typ = typFilter.value.trim().toLowerCase();

    fillDropdowns(daten, "", hersteller, typ);
    renderDaten();
    updateControlButtons();
});

