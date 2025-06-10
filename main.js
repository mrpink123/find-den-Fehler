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

// Wandelt CSV (Fehlerliste) um gibt sortierte zeilen aus
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
    }));
}

function fillDropdowns(data, codeFilter = "", herstellerFilterVal = "") {
    const selectedTyp = typFilter.value;
    const herstellerCounts = {};
    const typCounts = {};

    const codeRegex = codeFilter ? new RegExp(`\\b${codeFilter}\\b`, "i") : null;

    data.forEach((d) => {
        const codeMatch = !codeFilter ||
            d.code.toLowerCase().includes(codeFilter.toLowerCase()) ||
            (d.suchbegriffe && d.suchbegriffe.toLowerCase().includes(codeFilter.toLowerCase()));

        if (codeMatch) {
            const herstellerKey = d.hersteller.toLowerCase();
            if (!herstellerCounts[herstellerKey]) {
                herstellerCounts[herstellerKey] = { label: d.hersteller, count: 1 };
            } else {
                herstellerCounts[herstellerKey].count++;
            }

            if (!herstellerFilterVal || herstellerKey === herstellerFilterVal.toLowerCase()) {
                const typKey = d.typ.toLowerCase();
                if (!typCounts[typKey]) {
                    typCounts[typKey] = { label: d.typ, count: 1 };
                } else {
                    typCounts[typKey].count++;
                }
            }
        }
    });

    herstellerFilter.innerHTML =
        '<option value="">Alle Hersteller</option>' +
        Object.entries(herstellerCounts)
            .sort((a, b) => a[1].label.localeCompare(b[1].label))
            .map(([key, val]) =>
                `<option value="${key}">${val.label} (${val.count})</option>`
            ).join("");

    typFilter.innerHTML =
        '<option value="">Alle Typen</option>' +
        Object.entries(typCounts)
            .sort((a, b) => a[1].label.localeCompare(b[1].label))
            .map(([key, val]) =>
                `<option value="${key}">${val.label} (${val.count})</option>`
            ).join("");

    herstellerFilter.value = herstellerFilterVal;
    typFilter.value = selectedTyp;
}


function updateAutocompleteList(data) {
    const datalist = document.getElementById("codeSuggestions");
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

function renderDaten() {
    const suchtext = searchInput.value.trim().toLowerCase();
    const hersteller = herstellerFilter.value.toLowerCase();
    const typ = typFilter.value.toLowerCase();

    if (!suchtext && !hersteller && !typ) {
        updateAutocompleteList(daten);
        container.innerHTML = "";
        const trefferAnzahl = document.getElementById("trefferAnzahl");
        trefferAnzahl.textContent = ``;
        showHomeCard();
        return;
    }

    container.innerHTML = "";

    let filtered = daten;

    // Immer zuerst nach Code filtern (wenn eingegeben)
    const suchwoerter = suchtext.split(/\s+/).filter(w => w.length > 0);

    if (suchwoerter.length > 0) {
        filtered = filtered.filter((item) => {
            return suchwoerter.every((wort) => {
                const regex = new RegExp(`\\b${wort}\\b`, "i");
                return regex.test(item.code) ||
                    (item.suchbegriffe && regex.test(item.suchbegriffe));
            });
        });
    }

    // Danach nach Hersteller filtern (optional)
    if (hersteller) {
        filtered = filtered.filter(
            (item) => item.hersteller.toLowerCase() === hersteller
        );
    }

    // Dann nach Typ filtern (optional)
    if (typ) {
        filtered = filtered.filter(
            (item) => item.typ.toLowerCase() === typ
        );
    }

    // Aktualisiere Dropdowns basierend auf den bisherigen Filtern (NICHT filtered!)
    fillDropdowns(daten, suchtext, hersteller);

    // Zeige Trefferanzahl
    const trefferAnzahl = document.getElementById("trefferAnzahl");
    trefferAnzahl.textContent = `${filtered.length} Treffer`;

    // Ausgabe beenden, wenn keine Suchbegriffe & Filter gesetzt
    if (!suchtext && !hersteller && !typ) {
        updateAutocompleteList(daten);
        showHomeCard();
        return;
    }

    updateAutocompleteList(daten);

    // Erstelle Karten für die gefilterten Ergebnisse
    filtered.forEach((item) => {
        const card = document.createElement("div");
        card.className = "card";

        const typImageName = item.typ.toLowerCase().replace(/\s+/g, "_") + ".png";
        const typImagePath = `images/typen/${typImageName}`;
        const herstellerImageName = item.hersteller.toLowerCase().replace(/\s+/g, "_") + ".png";
        const herstellerImagePath = `images/hersteller/${herstellerImageName}`;

        card.innerHTML = `
            <div class="cardheader">
                <div class="herstellerImageContainer">
                    <img class="herstellerImage theme-image" src="${herstellerImagePath}"
                        data-theme-light="images/hersteller/${herstellerImageName}"
                        data-theme-dark="images/hersteller/dark/${herstellerImageName}"
                        alt="${item.hersteller}"
                        onerror="this.onerror=null; this.src='images/icons/icon-512.webp'"
                    >
                </div>
                <div class="cardHeaderTyp">
                    ${item.typ ? `<b>${item.typ}</b>` : ""}
                    ${item.code ? `<p>${item.code}</p>` : ""}
                </div>
            </div>
            <div class="cardContent">
                <div class="errorDescription">
                    ${item.fehler ? `
                        <div class="errorDescriptionItem">
                            <div class="iconLine">
                                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M11.001 10h2v5h-2zM11 16h2v2h-2z" fill="currentColor" />
                                    <path d="M13.768 4.2C13.42 3.545 12.742 3.138 12 3.138s-1.42.407-1.768 1.063L2.894 18.064a1.986 1.986 0 0 0 .054 1.968A1.984 1.984 0 0 0 4.661 21h14.678c.708 0 1.349-.362 1.714-.968a1.989 1.989 0 0 0 .054-1.968L13.768 4.2zM4.661 19L12 5.137L19.344 19H4.661z" fill="currentColor"/>
                                </svg>
                                <h4>Fehler: ${item.code}</h4>
                                ${item.kategorie ? `<b>(${item.kategorie})</b>` : ""}
                            </div>
                            <p>${item.fehler}</p>
                        </div>
                    ` : ""}
                    ${item.ursache ? `
                        <div class="errorDescriptionItem">
                            <div class="iconLine">
                                <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M6.813 2.406L5.405 3.812L7.5 5.906L8.906 4.5L6.812 2.406zm18.375 0L23.093 4.5L24.5 5.906l2.094-2.093l-1.407-1.407zM16 3.03c-.33.004-.664.023-1 .064c-.01 0-.02-.002-.03 0c-4.056.465-7.284 3.742-7.845 7.78c-.448 3.25.892 6.197 3.125 8.095a5.238 5.238 0 0 1 1.75 3.03v6h2.28c.348.597.983 1 1.72 1s1.372-.403 1.72-1H20v-4h.094v-1.188c0-1.466.762-2.944 2-4.093C23.75 17.06 25 14.705 25 12c0-4.94-4.066-9.016-9-8.97zm0 2c3.865-.054 7 3.11 7 6.97c0 2.094-.97 3.938-2.313 5.28l.032.032A7.792 7.792 0 0 0 18.279 22h-4.374c-.22-1.714-.955-3.373-2.344-4.563c-1.767-1.5-2.82-3.76-2.468-6.312c.437-3.15 2.993-5.683 6.125-6.03a6.91 6.91 0 0 1 .78-.064zM2 12v2h3v-2H2zm25 0v2h3v-2h-3zM7.5 20.094l-2.094 2.093l1.407 1.407L8.905 21.5L7.5 20.094zm17 0L23.094 21.5l2.093 2.094l1.407-1.407l-2.094-2.093zM14 24h4v2h-4v-2z" fill="currentColor"/>
                                </svg>
                                <h4>Maßnahme:</h4>
                            </div>
                            <p>${item.ursache}</p>
                        </div>
                    ` : ""}
                    ${item.infos ? `
                        <div class="errorDescriptionItem">
                            <div class="iconLine">
                                <svg height="200" width="200" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
                                    <path d="m576 736l-32-.001v-286c0-.336-.096-.656-.096-1.008s.096-.655.096-.991c0-17.664-14.336-32-32-32h-64c-17.664 0-32 14.336-32 32s14.336 32 32 32h32v256h-32c-17.664 0-32 14.336-32 32s14.336 32 32 32h128c17.664 0 32-14.336 32-32s-14.336-32-32-32zm-64-384.001c35.344 0 64-28.656 64-64s-28.656-64-64-64s-64 28.656-64 64s28.656 64 64 64zm0-352c-282.768 0-512 229.232-512 512c0 282.784 229.232 512 512 512c282.784 0 512-229.216 512-512c0-282.768-229.216-512-512-512zm0 961.008c-247.024 0-448-201.984-448-449.01c0-247.024 200.976-448 448-448s448 200.977 448 448s-200.976 449.01-448 449.01z" fill="currentColor"/>
                                </svg>
                                <strong>Info:</strong>
                            </div>
                            <p>${item.infos}</p>
                        </div>
                    ` : ""}
                    ${item.weitere ? `
                        <div class="errorDescriptionItem">
                            <p>${item.weitere}</p>
                        </div>
                    ` : ""}

                    ${item.link ? `
                        <div class="errorDescriptionItem">
                            <div class="iconLine">
                                <svg height="200" width="200" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
                                    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M5.5 4.054a1.5 1.5 0 1 1 1.5 1.5v.5m0 2.062a.25.25 0 0 1 0-.5m0 .5a.25.25 0 0 0 0-.5"/>
                                        <path d="M12.5 13.5H3a1.5 1.5 0 1 1 0-3h8.5a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H3a1.5 1.5 0 0 0-1.5 1.46v10m10-1.46v3"/>
                                    </g>
                                </svg>
                                <h4>${item.link}</h4>
                            </div>
                        </div>
                    ` : ""}
                </div>
                <div class="typImageWrapper">
                    <img class="typImage" src="${typImagePath}" alt="${item.typ}" onerror="this.onerror=null; this.src='images/icons/icon-512.png'">
                </div>
            </div>
        `;

        container.appendChild(card);
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

function showHomeCard() {
    container.innerHTML = "";

    const homeCard = document.createElement("div");
    homeCard.className = "card homeCard";
    homeCard.innerHTML = `
    <div class="cardheader">
      <div class="logoContainer">
        <img src="images/icons/logo-512.png">
        <h3>find den Fehler</h3>
      </div>      
      <button class="menu-toggle" id="homeMenuToggle" title="Extras">
        <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M600.704 64a32 32 0 0 1 30.464 22.208l35.2 109.376c14.784 7.232 28.928 15.36 42.432 24.512l112.384-24.192a32 32 0 0 1 34.432 15.36L944.32 364.8a32 32 0 0 1-4.032 37.504l-77.12 85.12a357.12 357.12 0 0 1 0 49.024l77.12 85.248a32 32 0 0 1 4.032 37.504l-88.704 153.6a32 32 0 0 1-34.432 15.296L708.8 803.904c-13.44 9.088-27.648 17.28-42.368 24.512l-35.264 109.376A32 32 0 0 1 600.704 960H423.296a32 32 0 0 1-30.464-22.208L357.696 828.48a351.616 351.616 0 0 1-42.56-24.64l-112.32 24.256a32 32 0 0 1-34.432-15.36L79.68 659.2a32 32 0 0 1 4.032-37.504l77.12-85.248a357.12 357.12 0 0 1 0-48.896l-77.12-85.248A32 32 0 0 1 79.68 364.8l88.704-153.6a32 32 0 0 1 34.432-15.296l112.32 24.256c13.568-9.152 27.776-17.408 42.56-24.64l35.2-109.312A32 32 0 0 1 423.232 64H600.64zm-23.424 64H446.72l-36.352 113.088l-24.512 11.968a294.113 294.113 0 0 0-34.816 20.096l-22.656 15.36l-116.224-25.088l-65.28 113.152l79.68 88.192l-1.92 27.136a293.12 293.12 0 0 0 0 40.192l1.92 27.136l-79.808 88.192l65.344 113.152l116.224-25.024l22.656 15.296a294.113 294.113 0 0 0 34.816 20.096l24.512 11.968L446.72 896h130.688l36.48-113.152l24.448-11.904a288.282 288.282 0 0 0 34.752-20.096l22.592-15.296l116.288 25.024l65.28-113.152l-79.744-88.192l1.92-27.136a293.12 293.12 0 0 0 0-40.256l-1.92-27.136l79.808-88.128l-65.344-113.152l-116.288 24.96l-22.592-15.232a287.616 287.616 0 0 0-34.752-20.096l-24.448-11.904L577.344 128zM512 320a192 192 0 1 1 0 384a192 192 0 0 1 0-384zm0 64a128 128 0 1 0 0 256a128 128 0 0 0 0-256z"
                fill="currentColor"
            />
        </svg>
      </button>
    </div>
    <div class="cardContent">
      <div class="homeContent">
        <p>Gib einen Fehlercode ein. Oder,<br>Wähle einen Typ um alle Fehler diesen Types zu sehen. Schlagwörter wie "Reset", "Schliessen" oder "ohne" sind auch möglich.</p>
      </div>
      <div id="homeMenuContainer">
        <div class="menu">
            <button id="homeCsvBtn">
                <svg height="200" width="200" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11.78 5.841a.75.75 0 0 1-1.06 0l-1.97-1.97v7.379a.75.75 0 0 1-1.5 0V3.871l-1.97 1.97a.75.75 0 0 1-1.06-1.06l3.25-3.25L8 1l.53.53l3.25 3.25a.75.75 0 0 1 0 1.061ZM2.5 9.75a.75.75 0 0 0-1.5 0V13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9.75a.75.75 0 0 0-1.5 0V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V9.75Z" fill="currentColor" fillRule="evenodd"/>
                </svg>
                <p>Fehlerliste Laden</p>
            </button>
            <button id="homeThemeBtn">
                <svg height="200" width="200" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                    <path d="M277.333 405.333v85.333h-42.667v-85.333zm99.346-58.824l60.34 60.34l-30.17 30.17l-60.34-60.34zm-241.359 0l30.17 30.17l-60.34 60.34l-30.17-30.17zM256 139.353c64.422 0 116.647 52.224 116.647 116.647c0 64.422-52.225 116.647-116.647 116.647A116.427 116.427 0 0 1 139.352 256c0-64.423 52.225-116.647 116.648-116.647m0 42.666c-40.859 0-73.981 33.123-73.981 74.062a73.76 73.76 0 0 0 21.603 52.296c13.867 13.867 32.685 21.64 52.378 21.603zm234.666 52.647v42.667h-85.333v-42.667zm-384 0v42.667H21.333v-42.667zM105.15 74.98l60.34 60.34l-30.17 30.17l-60.34-60.34zm301.7 0l30.169 30.17l-60.34 60.34l-30.17-30.17zM277.332 21.333v85.333h-42.667V21.333z" fill="currentColor" fillRule="evenodd"/>
                </svg>
            <p>Dark / Light Theme</p>
            </button>
            <button id="homeResetBtn">
                <svg height="200" width="200" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11.5-.031c-1.958 0-3.531 1.627-3.531 3.594V4H4c-.551 0-1 .449-1 1v1H2v2h2v15c0 1.645 1.355 3 3 3h12c1.645 0 3-1.355 3-3V8h2V6h-1V5c0-.551-.449-1-1-1h-3.969v-.438c0-1.966-1.573-3.593-3.531-3.593h-3zm0 2.062h3c.804 0 1.469.656 1.469 1.531V4H10.03v-.438c0-.875.665-1.53 1.469-1.53zM6 8h5.125c.124.013.247.031.375.031h3c.128 0 .25-.018.375-.031H20v15c0 .563-.437 1-1 1H7c-.563 0-1-.437-1-1V8zm2 2v12h2V10H8zm4 0v12h2V10h-2zm4 0v12h2V10h-2z" fill="currentColor"/>
                </svg>
                <p>Lösche alle Daten aus dem lokalen Speicher. Dadurch wird auch die Fehlerliste gelöscht.!</p>
            </button>
        </div>
      </div>
    </div>
  `;
    container.appendChild(homeCard);

    // EventListener für den Menü-Button
    document.getElementById("homeMenuToggle")
        .addEventListener("click", e => {
            const menuContainer = document.getElementById("homeMenuContainer");
            const isVisible = menuContainer.style.display === "block";
            menuContainer.style.display = isVisible ? "none" : "block";
            e.stopPropagation(); // Verhindert das Schließen des Menüs durch Klick außerhalb
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

    function closeHomeMenu() {
        const menuContainer = document.getElementById("homeMenuContainer");
        if (menuContainer) {
            menuContainer.style.display = "none"; // Menü schließen
        }
    }

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
    navigator.serviceWorker
        .register("service-worker.js")
        .then(() => console.log("✅ Service Worker registriert"))
        .catch((err) => console.error("❌ Service Worker Fehler:", err));
}

loadData();

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
window.addEventListener("scroll", () => {
    if (window.scrollY > lastScrollY && window.scrollY > 80) {
        headerEl.classList.add("hide");
    } else {
        headerEl.classList.remove("hide");
    }
    lastScrollY = window.scrollY;
}, { passive: true });

// Filter-Reset-Button
document
    .getElementById("resetFilterBtn")
    .addEventListener("click", () => {
        searchInput.value = "";
        herstellerFilter.value = "";
        typFilter.value = "";
        renderDaten();
    });

// Filter-Änderung triggert neue Darstellung
[searchInput, herstellerFilter, typFilter].forEach((input) => {
    input.addEventListener("input", debounce(renderDaten, 300));
});

document.getElementById("clearSearchBtn").addEventListener("click", () => {
    searchInput.value = "";
    renderDaten();
});
