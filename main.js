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
        cardId: get("ID"),
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
const voiceBtn = document.getElementById("voiceSearchBtn");
let currentRenderSessionId = 0;
let daten = [];
window.APP_VERSION = "Unbekannt";
window.CSV_VERSION = "Unbekannt";

// === Sprachaufnahme Modal ===
(function () {
  // Timeouts & Heuristik
  const SILENCE_TIMEOUT_NO_SPEECH = 5000;   // 5s default
  const SILENCE_TIMEOUT_AFTER_FINAL = 2000; // 2s after final/heuristic
  const MIN_WORDS_FOR_SHORT = 1;
  const MIN_CHARS_FOR_SHORT = 6;

  // DOM 
  const voiceBtn = document.getElementById("voiceSearchBtn");
  const searchInput = document.getElementById("searchInput");
  const speechModal = document.getElementById("speechModal");
  const speechText = document.getElementById("speechText");
  const speechStatus = document.getElementById("speechStatus");
  const speechVisual = document.getElementById("speechVisual");
  const modalStopBtn = document.getElementById("modalStopBtn");
  const cancelBtn = document.getElementById("speechCancelBtn");

  // state
  let mediaStream = null;
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  let meteringActive = false;
  let audioCtx = null;
  let analyser = null;
  let rafId = null;

  let recognition = null;
  let isRecording = false;
  let interimTranscript = "";
  let silenceTimer = null;

  let hasFinal = false;
  let adoptOnTimeout = false;
  let lastTranscript = "";

  const hasSpeechAPI = "SpeechRecognition" in window || "webkitSpeechRecognition" in window;

  function showModal() {
    if (!speechModal) return;
    speechModal.classList.remove("hidden");
    speechModal.removeAttribute("aria-hidden");
    if (speechModal.hasAttribute("inert")) speechModal.removeAttribute("inert");
    if (speechText) speechText.textContent = "Sprachsuche verwenden";
    if (speechStatus) speechStatus.textContent = "";
    setTimeout(() => {
      if (cancelBtn) cancelBtn.focus();
      else if (modalStopBtn) modalStopBtn.focus();
    }, 80);
  }

  function hideModal() {
    if (!speechModal) return;
    if (speechModal.contains(document.activeElement)) document.activeElement.blur();
    speechModal.classList.add("hidden");
    speechModal.setAttribute("aria-hidden", "true");
    speechModal.setAttribute("inert", "");
  }

  function updateVisual(rms) {
    const minScale = 0.9;
    const maxScale = 1.8;
    const clamped = Math.min(1, Math.max(0, rms));
    const scale = minScale + (maxScale - minScale) * clamped;
    const circle = speechVisual && speechVisual.querySelector(".speech-visual__circle");
    if (circle) {
      circle.style.transform = `scale(${scale})`;
      circle.style.opacity = `${0.6 + 0.4 * clamped}`;
    }
  }

  function startAudioMetering(stream) {
    meteringActive = true;
    mediaStream = stream;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);

      const loop = () => {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
        const rms = Math.sqrt(sum / buffer.length);
        const normalized = Math.min(1, rms * 7);
        updateVisual(normalized);
        rafId = requestAnimationFrame(loop);
      };
      loop();
    } catch (err) {
      console.warn("Audio Metering nicht möglich:", err);
    }
  }

  function stopAudioMetering() {
    try {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      if (analyser) { analyser.disconnect(); analyser = null; }
      if (audioCtx) { try { audioCtx.close(); } catch (e) { } audioCtx = null; }
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => {
          try { t.stop(); } catch (e) { }
        });
        mediaStream = null;
      }
      meteringActive = false;
      updateVisual(0);
    } catch (err) {
      console.warn("Fehler beim Stoppen des Audio-Meterings:", err);
    }
  }

  function clearSilenceTimer() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function scheduleSilenceStop() {
    clearSilenceTimer();
    const timeout = (hasFinal || adoptOnTimeout) ? SILENCE_TIMEOUT_AFTER_FINAL : SILENCE_TIMEOUT_NO_SPEECH;
    silenceTimer = setTimeout(() => {
      handleAutoSilence();
    }, timeout);
  }

  function reallyCleanupRecognition() {
    try { recognition && recognition.stop(); } catch (_) { }
    try { recognition && recognition.abort(); } catch (_) { }
    try {
      if (recognition && recognition._handlers) {
        recognition.removeEventListener("result", recognition._handlers.onResult);
        recognition.removeEventListener("error", recognition._handlers.onError);
        recognition.removeEventListener("end", recognition._handlers.onEnd);
      }
    } catch (_) { }
    recognition = null;

    if (mediaStream) {
      try {
        mediaStream.getTracks().forEach(track => { try { track.stop(); } catch (_) { } });
      } catch (_) { }
      mediaStream = null;
    }

    stopAudioMetering();
  }

  function startRecognition() {
    if (isRecording) return;
    if (!hasSpeechAPI) {
      if (speechStatus) speechStatus.textContent = "Spracherkennung wird in diesem Browser nicht unterstützt.";
      return;
    }
    if (speechText) speechText.textContent = "Sprich Jetzt...";

    if (meteringActive && mediaStream) {
      try {
        stopAudioMetering(); // stoppt tracks & audioContext und setzt mediaStream = null
      } catch (e) {
        console.warn("Fehler beim Stoppen des Meters vor Recognition:", e);
      }
    }

    // kurze Pause, damit das Gerät Zeit hat, das Mic freizugeben
    const START_DELAY_MS = 300; // 200-400ms empfohlen
    setTimeout(() => {
      // defensive check erneut
      if (isRecording) return;

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.lang = "de-DE";
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      interimTranscript = "";
      hasFinal = false;
      adoptOnTimeout = false;
      lastTranscript = "";

      // benannte handler 
      const onResult = (ev) => {
        if (!isRecording) return;
        let parts = [];
        let foundFinal = false;
        for (let i = 0; i < ev.results.length; i++) {
          const r = ev.results[i];
          const t = (r[0] && r[0].transcript) ? r[0].transcript : "";
          parts.push(t + (r.isFinal ? "" : " "));
          if (r.isFinal) foundFinal = true;
        }
        const newTranscript = parts.join("").trim();
        interimTranscript = newTranscript;

        const wordCount = interimTranscript.split(/\s+/).filter(Boolean).length;
        const charCount = interimTranscript.length;

        if (foundFinal) {
          hasFinal = true; adoptOnTimeout = "final";
          if (speechStatus) speechStatus.textContent = "Satz erkannt — wird bei kurzer Pause übernommen.";
        } else if (interimTranscript && (wordCount >= MIN_WORDS_FOR_SHORT || charCount >= MIN_CHARS_FOR_SHORT)) {
          adoptOnTimeout = "heuristic";
          if (speechStatus) speechStatus.textContent = "Erkannter Text — wird bei kurzer Pause übernommen.";
        } else {
          adoptOnTimeout = false;
          if (!interimTranscript && speechStatus) speechStatus.textContent = "";
        }

        if (speechText) speechText.textContent = interimTranscript || "";

        if (newTranscript !== lastTranscript || hasFinal || adoptOnTimeout) {
          lastTranscript = newTranscript;
          scheduleSilenceStop();
        }
      };

      const onError = (ev) => {
        if (!isRecording) return;
        console.warn("SpeechRecognition error:", ev && ev.error);
        if (ev && ev.error === "not-allowed") {
          if (speechStatus) speechStatus.textContent = "Mikrofonzugriff verweigert.";
        } else {
          if (speechStatus) speechStatus.textContent = "Erkennungsfehler.";
        }
      };

      const onEnd = () => {
        if (!isRecording) return;
        // safety
        scheduleSilenceStop();
      };

      recognition._handlers = { onResult, onError, onEnd };
      recognition.addEventListener("result", onResult);
      recognition.addEventListener("error", onError);
      recognition.addEventListener("end", onEnd);

      try {
        recognition.start();
        isRecording = true;
        if (voiceBtn) voiceBtn.classList.add("listening");
        if (modalStopBtn) modalStopBtn.classList.add("listening");
        if (speechStatus) speechStatus.textContent = "";
        scheduleSilenceStop();
      } catch (err) {
        console.warn("recognition.start() failed:", err);
        if (speechStatus) speechStatus.textContent = "Start fehlgeschlagen.";
      }
    }, START_DELAY_MS);
  }

  /* Stoppen (manuell) */
  function stopRecordingManual() {
    isRecording = false;
    clearSilenceTimer();

    try {
      if (recognition && recognition._handlers) {
        recognition.removeEventListener("result", recognition._handlers.onResult);
        recognition.removeEventListener("error", recognition._handlers.onError);
        recognition.removeEventListener("end", recognition._handlers.onEnd);
      }
    } catch (_) { }

    try { recognition && recognition.stop(); } catch (_) { }
    setTimeout(() => {
      try { recognition && recognition.abort(); } catch (_) { }
      recognition = null;
    }, 200);

    stopAudioMetering();

    // UI reset
    if (voiceBtn) voiceBtn.classList.remove("listening");
    if (modalStopBtn) modalStopBtn.classList.remove("listening");

    if (interimTranscript) {
      if (searchInput) {
        searchInput.value = interimTranscript;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (speechStatus) speechStatus.textContent = "";
      hideModal();
      showStatusMessage("🎤 Spracheingabe beendet", "success");
    } else {
      if (speechText) speechText.textContent = "Mikrofon deaktiviert. Versuche es noch einmal.";
      if (speechStatus) speechStatus.textContent = "Auf Mikrofon tippen, um Spracheingabe zu wiederholen";
    }

    setTimeout(() => {
      if (mediaStream) {
        try {
          mediaStream.getTracks().forEach(t => { try { t.stop(); } catch (_) { } });
        } catch (_) { }
        mediaStream = null;
      }
      stopAudioMetering();
    }, 500);

    // reset flags
    interimTranscript = "";
    hasFinal = false;
    adoptOnTimeout = false;
    lastTranscript = "";
  }

  function handleAutoSilence() {
    clearSilenceTimer();

    if ((hasFinal || adoptOnTimeout) && interimTranscript) {
      try { recognition && recognition.stop(); } catch (_) { }
      setTimeout(() => {
        try { recognition && recognition.abort(); } catch (_) { }
        recognition = null;
      }, 200);

      stopAudioMetering();

      isRecording = false;
      if (voiceBtn) voiceBtn.classList.remove("listening");
      if (modalStopBtn) modalStopBtn.classList.remove("listening");

      if (searchInput) {
        searchInput.value = interimTranscript;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      hideModal();
      showStatusMessage("🎤 Spracheingabe beendet", "success");

      setTimeout(() => {
        if (mediaStream) {
          try { mediaStream.getTracks().forEach(t => { try { t.stop(); } catch (_) { } }); } catch (_) { }
          mediaStream = null;
        }
        stopAudioMetering();
      }, 500);

      interimTranscript = "";
      hasFinal = false;
      adoptOnTimeout = false;
      lastTranscript = "";
      return;
    }

    try { recognition && recognition.stop(); } catch (_) { }
    setTimeout(() => { try { recognition && recognition.abort(); } catch (_) { } recognition = null; }, 200);
    stopAudioMetering();

    isRecording = false;
    if (voiceBtn) voiceBtn.classList.remove("listening");
    if (modalStopBtn) modalStopBtn.classList.remove("listening");
    if (speechText) speechText.textContent = "Mikrofon deaktiviert. Es wurde nichts erkannt, Versuche es noch einmal.".replace(/\.\s*/g, ".\n");
    if (speechStatus) speechStatus.textContent = "Auf Mikrofon tippen, um Spracheingabe zu wiederholen.";
    interimTranscript = "";
    hasFinal = false;
    adoptOnTimeout = false;
    lastTranscript = "";

    setTimeout(() => {
      if (mediaStream) {
        try { mediaStream.getTracks().forEach(t => { try { t.stop(); } catch (_) { } }); } catch (_) { }
        mediaStream = null;
      }
      stopAudioMetering();
    }, 500);
  }

  /* Permission */
  function prepareModalAndRequestPermission() {
    showModal();
    if (speechText) speechText.textContent = "Berechtigung steht aus";
    if (speechStatus) speechStatus.textContent = "Zugriff auf Mikrofon zulassen, um die Sprachsuche zu aktivieren";

    if (!window.isSecureContext) {
      if (speechStatus) speechStatus.textContent = "Bitte HTTPS verwenden (sicherer Kontext).";
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (speechStatus) speechStatus.textContent = "Keine Mikrofon-API verfügbar.";
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "microphone" })
        .then((permissionStatus) => {
          console.debug("microphone permission state:", permissionStatus.state);
          if (permissionStatus.state === "granted") {
            navigator.mediaDevices.getUserMedia({ audio: true })
              .then((stream) => {
                mediaStream = stream;
                startAudioMetering(stream);
                if (speechText) speechText.textContent = "Sprich Jetzt…";
                if (speechStatus) speechStatus.textContent = "";
                startRecognition(); // auto-start
              })
              .catch((err) => {
                console.warn("getUserMedia trotz granted fehlgeschlagen:", err);
                if (speechStatus) speechStatus.textContent = "Mikrofonzugriff konnte nicht verwendet werden.";
              });
          } else {
            navigator.mediaDevices.getUserMedia({ audio: true })
              .then((stream) => {
                mediaStream = stream;
                startAudioMetering(stream);
                if (speechText) speechText.textContent = "Sprachsuche verwenden";
                if (speechStatus) speechStatus.textContent = "Bereit. Drücke die Mikrofontaste, um die Aufnahme zu starten.";
              })
              .catch((err) => {
                console.warn("getUserMedia Fehler:", err);
                if (speechStatus) speechStatus.textContent = "Mikrofonzugriff verweigert.";
              });
          }
          permissionStatus.onchange = () => {
            console.debug("permission state changed to", permissionStatus.state);
          };
        })
        .catch(() => {
          navigator.mediaDevices.getUserMedia({ audio: true })
            .then((stream) => {
              mediaStream = stream;
              startAudioMetering(stream);
              if (speechText) speechText.textContent = "Sprachsuche verwenden";
              if (speechStatus) speechStatus.textContent = "Bereit. Drücke die Mikrofontaste, um die Aufnahme zu starten.";
            })
            .catch((err) => {
              console.warn("getUserMedia Fehler (fallback):", err);
              if (speechStatus) speechStatus.textContent = "Mikrofonzugriff verweigert.";
            });
        });
    } else {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          mediaStream = stream;
          startAudioMetering(stream);
          if (speechText) speechText.textContent = "Sprachsuche verwenden";
          if (speechStatus) speechStatus.textContent = "Bereit. Drücke die Mikrofontaste, um die Aufnahme zu starten.";
        })
        .catch((err) => {
          console.warn("getUserMedia Fehler:", err);
          if (speechStatus) speechStatus.textContent = "Mikrofonzugriff verweigert.";
        });
    }
  }

  /* UI */
  if (voiceBtn) {
    voiceBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!isRecording) {
        if (!speechModal || speechModal.classList.contains("hidden")) {
          prepareModalAndRequestPermission();
        } else {
          if (!mediaStream) {
            navigator.mediaDevices.getUserMedia({ audio: true })
              .then((stream) => {
                mediaStream = stream;
                startAudioMetering(stream);
                startRecognition();
              })
              .catch((err) => {
                console.warn("getUserMedia Fehler beim Start:", err);
                if (speechStatus) speechStatus.textContent = "Mikrofonzugriff verweigert.";
              });
          } else {
            startRecognition();
          }
        }
      } else {
        stopRecordingManual();
      }
    });
  }

  if (modalStopBtn) {
    modalStopBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!isRecording) {
        if (!mediaStream) {
          navigator.mediaDevices.getUserMedia({ audio: true })
            .then((stream) => {
              mediaStream = stream;
              startAudioMetering(stream);
              startRecognition();
            })
            .catch((err) => {
              console.warn("getUserMedia Fehler beim Start:", err);
              if (speechStatus) speechStatus.textContent = "Mikrofonzugriff verweigert.";
            });
        } else {
          startRecognition();
        }
      } else {
        stopRecordingManual();
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      clearSilenceTimer();
      reallyCleanupRecognition();
      isRecording = false;
      stopAudioMetering();
      if (voiceBtn) voiceBtn.classList.remove("listening");
      if (modalStopBtn) modalStopBtn.classList.remove("listening");
      hideModal();
      showStatusMessage("🎤 Spracheingabe abgebrochen", "info");
    });
  }

  document.addEventListener("keydown", (ev) => {
    if (!speechModal || speechModal.classList.contains("hidden")) return;
    if (ev.key === "Escape") {
      clearSilenceTimer();
      reallyCleanupRecognition();
      isRecording = false;
      stopAudioMetering();
      if (voiceBtn) voiceBtn.classList.remove("listening");
      if (modalStopBtn) modalStopBtn.classList.remove("listening");
      hideModal();
      showStatusMessage("🎤 Spracheingabe abgebrochen", "info");
    }
  });
})();

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
    const showLabel = label;
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
function filterDaten(data, suchwoerter = [], hersteller = "", typ = "", cardId = "") {
  return data.filter(item => {
    const code = item.code?.toLowerCase() || "";
    const suchbegriffe = item.suchbegriffe?.toLowerCase() || "";
    const itemHersteller = item.hersteller?.toLowerCase() || "";
    const itemTyp = item.typ?.toLowerCase() || "";
    const itemId = item.cardId?.toLowerCase() || "";

    const matchesSuchtext = suchwoerter.every(w => {
      const regex = new RegExp(`\\b${w.normalize("NFD").replace(/\p{Diacritic}/gu, "")}\\b`, "i");
      return regex.test(code.normalize("NFD").replace(/\p{Diacritic}/gu, "")) ||
        regex.test(suchbegriffe.normalize("NFD").replace(/\p{Diacritic}/gu, ""));
    });

    const matchesHersteller = !hersteller || itemHersteller === hersteller;
    const matchesTyp = !typ || itemTyp === typ;
    const matchesId = !cardId || itemId === cardId;

    return matchesSuchtext && matchesHersteller && matchesTyp && matchesId;
  });
}

// ==== Rendern der fehlerbeschreibung Items ====
function renderFehlerItem(code, kategorie, text) {
  if (code === "ohne") { code = ""; }
  return `
    <div class="errorDescriptionItem" style="border: 1px solid transparent; background: linear-gradient(var(--card-bg), var(--card-bg)) padding-box, linear-gradient(90deg, #ff0000a5, rgba(255, 255, 255, 0)) border-box;">
      <div class="descriptionItemGrid">
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
            ${kategorie ? `<div style="margin: 0 0 .7rem .1rem"><b> ${kategorie}</b></div>` : ""}
          </p>
          <p>${text}</p>
        </div>
      </div>
    </div>
  `;
}

function renderDescriptionItem(color = "var(--card-bg)", svg = "", name = "", text = "", clsName = null) {
  return `
    <div class="errorDescriptionItem" style="
      border: 1px solid transparent; 
      background: linear-gradient(var(--card-bg), var(--card-bg)) padding-box, 
        linear-gradient(90deg, ${color}, rgba(255, 255, 255, 0)) border-box;" 
      ${clsName ? `class = ${clsName}` : ""}
    >
      <div class="descriptionItemGrid">
        <div style="display: flex;">
          <svg style="width: 24px; height: 24px; margin-top: 7px; overflow: visible;">
            <use href="${svg}"></use>
          </svg>
        </div>
        <div style="display: flex; flex-direction: column;">
          <p style="margin: 0.5rem 0;">
            <b>${name}</b>
          </p>
          <p>${text}</p>
        </div>
      </div>
    </div>  
  `;
}

// Symbol-ViewBox-Cache
const symbolViewBoxes = new Map();

function setHerstellerSVGViewBox(svg) {
  const use = svg.querySelector('use');
  const symbolId = use?.getAttribute('href')?.replace('#', '');

  if (!symbolId) return;

  if (symbolViewBoxes.has(symbolId)) {
    svg.setAttribute('viewBox', symbolViewBoxes.get(symbolId));
    return;
  }

  const trySetViewBox = () => {
    const symbol = document.querySelector(`symbol#${symbolId}`);
    if (symbol) {
      const viewBox = symbol.getAttribute('viewBox');
      if (viewBox) {
        symbolViewBoxes.set(symbolId, viewBox);
        svg.setAttribute('viewBox', viewBox);
      }
    } else {
      requestAnimationFrame(trySetViewBox);
    }
  };

  trySetViewBox();
}

// ==== Fehler Card rendern ====
function renderCard(item) {
  const card = document.createElement("div");
  card.className = "card";
  card.id = item.cardId;
  const title = [item.hersteller, item.typ, item.code].filter(Boolean).join(" ");
  card.setAttribute("data-title", title);

  const herstellerId = item.hersteller?.toLowerCase().replace(/\s+/g, "_") || "";
  const typImagePath = item.typImage?.trim() || "";

  card.innerHTML = `
    <div class="cardheader">
      <div class="herstellerImageContainer">
        <svg class="herstellerImage"><use href="#${herstellerId}" /></svg>
      </div>     
      <div class="cardHeaderTyp">
        ${item.typ ? `<b>${item.typ}</b>` : ""}
        ${item.code ? `<p>${item.code}</p>` : ""}
      </div>
    </div>
    <div class="cardContent">
      <div class="errorDescription">
        ${item.fehler ? renderFehlerItem(item.code, item.kategorie, item.fehler) : ""}
        ${item.ursache ? renderDescriptionItem("#fcc21b", "#icon-ursache", "Maßnahme:", item.ursache, "") : ""}
        ${item.infos ? renderDescriptionItem("#00a6ffff", "#icon-info", "Info:", item.infos, "") : ""}
        ${item.weitere ? `<div style="padding-left:1rem; padding-right: .5rem;"><p>${item.weitere}</p></div>` : ""}
        ${item.link ? renderDescriptionItem("var(--fg)", "#icon-hilfe", item.link, "", "linkItem") : ""}
      </div>
    </div>
    <div class="errorDescriptionItem detailsContainer">Wird geladen ...</div>
    
    <div class="cardfooter">
      <div style="width:20px">
        <button class="home-btn" title="Startseite"><svg width="20px" height="18px"><use href="#icon-home" /></svg></button>
      </div>      
      <p><em>${title}</em></p>
      <button class="share-btn" data-id="${item.cardId}" title="Diese Karte teilen"><svg width="20px" height="18px"><use href="#icon-share" /></svg></button>
    </div>
  `;
  // Hersteller-SVG skalieren
  const svg = card.querySelector('.herstellerImage');
  if (svg) {
    setHerstellerSVGViewBox(svg);
  }

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

      const buttons = item.modal.map(entry => `
        <button class="btn touchBtn" data-url="${entry.url}" title="${entry.label}">
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

    typImageContainer.appendChild(typImage);
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

// Filter und Suche leeren bei klick auf Home 
document.addEventListener("click", (ev) => {
  if (ev.target.closest(".home-btn")) {
    resetFilter();
  }
});

/* === Card Link teilen === */
(function () {
  // Erzeugt eine sichere URL, die auf die Card-ID als Hash verweist
  function cardUrlForId(cardId) {
    const url = location.origin + location.pathname + location.search + "#id=" + encodeURIComponent(cardId);
    return url;
  }

  // Text in Clipboard schreiben (modern + fallback)
  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fallthrough */ }

    // Fallback für ältere Browser
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.setAttribute("aria-hidden", "true");
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch (err) {
      return false;
    }
  }

  // Feedback: verwendet showStatusMessage wenn vorhanden, sonst kleines Toast
  function feedback(msg, type = "info", timeout = 2500) {
    if (typeof showStatusMessage === "function") {
      try { showStatusMessage(msg, type, timeout); } catch (e) { /* ignore */ }
      return;
    }
    // einfacher Toast
    const el = document.createElement("div");
    el.textContent = msg;
    Object.assign(el.style, {
      position: "fixed",
      left: "50%",
      transform: "translateX(-50%)",
      bottom: "18px",
      background: "rgba(0,0,0,0.8)",
      color: "#fff",
      padding: "8px 12px",
      borderRadius: "8px",
      zIndex: 99999,
      fontSize: "14px",
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), timeout);
  }

  async function shareCard(card) {
    const id = card.id || card.dataset.id;
    const url = cardUrlForId(id);
    const title = card.dataset.title || "";
    const text = title ? `${title}\n${url}` : url;

    if (navigator.share) {
      try {
        await navigator.share({ title: title || undefined, text: title ? (title + "\n" + url) : url, url });
        feedback("Teilen gestartet", "success");
        return;
      } catch (err) {
        // user hat abgebrochen oder Fehler
      }
    }

    const ok = await copyTextToClipboard(text);
    if (ok) {
      feedback("Link in Zwischenablage kopiert", "success");
    } else {
      feedback("Kopieren fehlgeschlagen. Link: " + url, "error", 6000);
    }
  }

  // Click handler für share buttons
  function onDocClick(ev) {
    const btn = ev.target.closest ? ev.target.closest(".share-btn, [data-share-btn]") : null;
    if (!btn) return;
    ev.preventDefault();

    const id = btn.dataset.id || btn.getAttribute("data-id");
    if (!id) { feedback("Keine Card-ID vorhanden", "error"); return; }
    const card = document.getElementById(id);
    if (!card) { feedback("Card nicht gefunden", "error"); return; }

    shareCard(card);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      document.addEventListener("click", onDocClick, { capture: true, passive: false });
    });
  } else {
    document.addEventListener("click", onDocClick, { capture: true, passive: false });
  }
})();


// ==== Modal erstellen ====
function openTypImageModal(imagePath = null, typ = "", htmlPath = "") {
  const scrollY = window.scrollY;
  document.body.style.setProperty('--scroll-top', `-${scrollY}px`);
  document.body.classList.add("modal-open");

  const modalOverlay = document.createElement("div");
  modalOverlay.className = "modalOverlay";
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

    const scrollY = document.body.style.getPropertyValue('--scroll-top');
    document.body.style.removeProperty('--scroll-top');

    document.body.style.position = '';
    document.body.style.top = '';
    window.scrollTo(0, parseInt(scrollY || "0") * -1);

    document.removeEventListener("keydown", onKeyDown);
    if (modalOverlay.parentNode) {
      modalOverlay.parentNode.removeChild(modalOverlay);
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
function renderDaten(Id) {
  const suchtext = searchInput.value.trim().toLowerCase();
  const suchwoerter = suchtext.split(/\s+/).filter(w => w.length > 0);
  const hersteller = herstellerFilter.value.trim().toLowerCase();
  const typ = typFilter.value.trim().toLowerCase();
  const codeFilter = suchwoerter.length > 0 ? suchtext : "";
  const cardId = Id ? Id : "";

  const trefferAnzahl = document.getElementById("trefferAnzahl");
  container.innerHTML = "";

  const keineFilterAktiv = suchwoerter.length === 0 && !hersteller && !typ && !cardId;

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


  const filtered = filterDaten(daten, suchwoerter, hersteller, typ, cardId);

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
          <svg            
            width="100%"
            height="100%"
            viewBox="0 0 1517.0656 615.5">
            <path
              id="path30"
              style="display:inline;fill:currentColor;fill-opacity:1;stroke:url(#linearGradient2);stroke-width:1;stroke-linecap:butt;stroke-linejoin:miter;stroke-dasharray:none"
              d="M 1.3480218,615 C 185.23604,615 369.12406,615 553.01209,615 614.68396,410.33333 676.35584,205.66667 738.02771,1 554.50167,1 370.97563,1 187.44959,1 125.41573,205.66667 63.381876,410.33333 1.3480218,615 Z M 489.70349,31.349609 c 5.38872,-0.01479 10.48586,2.870547 13.79181,7.03285 1.9417,2.442203 3.2161,5.319241 4.80314,7.988612 32.10113,57.300859 64.21733,114.593549 96.30904,171.899509 3.04069,5.51683 3.93725,12.45471 1.37377,18.32719 -2.15763,5.18555 -6.92957,8.97612 -12.2505,10.54783 -2.90246,0.94584 -5.97734,1.08236 -9.00538,1.00479 -37.82305,0 -75.6461,0 -113.46914,0 0.65623,17.17642 -1.14738,34.62939 -6.99999,50.86861 -4.94643,13.86304 -12.94119,26.64217 -23.36854,37.04235 -2.43606,2.48304 -5.11984,4.70451 -7.52857,7.2155 -6.81284,6.79375 -13.51279,13.78897 -19.71349,21.08191 -8.19113,9.62377 -15.59788,19.99067 -21.26441,31.31312 -0.62674,1.27093 -1.35042,2.74799 -1.97195,4.12167 -1.65028,3.59006 -3.20877,7.4548 -4.53976,11.26861 -3.95517,11.24994 -6.42047,23.057 -8.07619,34.79526 -0.16416,1.19942 -0.33155,2.39842 -0.48242,3.59961 4.18136,4.40473 6.50377,10.49974 6.27109,16.57302 -0.18753,21.71683 -0.4176,43.43388 -0.70369,65.14929 -0.21493,7.45615 -4.66095,14.55269 -11.1685,18.15337 -3.5997,2.06702 -7.79563,2.95431 -11.92741,2.78047 -8.85508,-0.0273 -17.71016,-0.0546 -26.56524,-0.0819 -3.25039,3.81776 -7.6271,6.59923 -12.39553,8.11073 -7.29594,2.44889 -15.15672,2.75068 -22.75834,1.92729 -5.50364,-0.68159 -11.01119,-2.1699 -15.78201,-5.06444 -2.35931,-1.4786 -4.49663,-3.31912 -6.27896,-5.45991 -10.40816,-0.20638 -20.81845,-0.34738 -31.22528,-0.59469 -6.84642,-0.40884 -13.25379,-4.63753 -16.45412,-10.6826 -1.84915,-3.36322 -2.57887,-7.25134 -2.38083,-11.066 0.22336,-21.4806 0.41203,-42.96205 0.65705,-64.44213 0.2322,-5.96754 2.83357,-11.77969 7.05748,-15.98997 -0.25072,-5.9883 -1.00464,-11.95169 -2.17774,-17.82812 -0.12934,-0.59026 -0.29325,-1.43977 -0.42891,-2.03884 -4.08248,-18.63656 -12.42492,-36.13455 -23.00859,-51.92991 -2.17924,-3.24339 -4.59392,-6.62875 -7.03263,-9.82316 -2.99839,-3.93231 -6.28985,-7.94465 -9.62377,-11.74391 -2.13606,-2.41966 -4.28114,-4.83389 -6.6144,-7.06655 -14.84477,-14.97111 -25.67087,-33.73612 -31.87434,-53.84688 -6.61214,-21.33252 -8.21483,-44.15106 -4.99158,-66.23435 1.62857,-13.59406 5.08967,-27.13026 10.13282,-39.92773 10.80344,-27.41021 28.96678,-51.99304 52.47084,-69.82924 15.78096,-11.99122 33.99705,-20.828476 53.29194,-25.432306 50.04654,-13.388211 106.08336,-0.640542 145.76846,32.554246 3.55551,2.97462 6.97908,6.10751 10.24805,9.3948 18.1003,-31.45186 36.17518,-62.919142 54.29136,-94.361361 3.23244,-5.410499 9.16171,-9.396165 15.59536,-9.30661 z m 381.84961,33.19336 c -6.26518,-0.02963 -12.54468,0.05937 -18.77199,0.814149 -1.17205,0.132571 -2.3949,0.289886 -3.4522,0.448883 -11.57114,1.68373 -23.00566,5.222278 -32.9887,11.408843 -1.0591,0.662408 -2.3141,1.479264 -3.4085,2.260686 -4.57651,3.24353 -8.76447,7.058484 -12.28314,11.433674 -1.27773,1.499688 -2.39557,2.900594 -3.56913,4.490913 -0.97086,1.314727 -1.95634,2.761021 -2.749,3.998323 -5.69451,8.80322 -9.22311,18.8803 -10.95942,29.18799 -1.92674,11.22204 -1.96148,22.65169 -1.75757,34.00253 0.0209,1.80368 0.0418,3.60736 0.0627,5.41104 -11.34115,0 -22.68229,0 -34.02344,0 0,17.66667 0,35.33333 0,53 11.33333,0 22.66667,0 34,0 0,60 0,120 0,180 25,0 50,0 75,0 0,-60 0,-120 0,-180 15,0 30,0 45,0 0,-17.66667 0,-35.33333 0,-53 -15.01367,0 -30.02734,0 -45.04102,0 0.15013,-6.4389 0.23199,-12.8802 0.4154,-19.31775 0.16844,-4.69471 1.02021,-9.50877 3.54105,-13.55183 1.00044,-1.59872 2.12358,-3.16665 3.49668,-4.45659 6.04848,-4.31021 13.43711,-6.34146 20.77788,-6.85404 5.47825,-0.40591 10.98569,-0.17128 16.45497,0.24543 1.78501,0.22305 3.57003,0.4461 5.35504,0.66916 0,-18.70378 0,-37.407557 0,-56.111333 -4.06227,-0.845651 -8.09758,-1.69139 -12.14394,-2.38121 -4.05393,-0.694832 -8.32732,-1.254286 -12.51652,-1.518918 -1.58402,-0.102462 -3.44717,-0.180011 -5.15787,-0.202973 -1.76056,-0.03732 -3.52073,0.0079 -5.28128,0.02302 z m 95.76563,2.763672 c -3.89699,0.153655 -7.8129,0.652608 -11.55162,1.781103 -7.52621,2.707458 -14.67808,6.941073 -19.84078,13.144091 -1.96267,2.391987 -3.77185,4.960078 -5.05638,7.782375 -3.42911,8.765344 -3.52999,18.67287 -0.88716,27.65962 0.95636,2.83823 2.46082,5.47117 4.10172,7.96706 3.6741,5.46765 8.78415,9.91225 14.58968,12.99973 0.4351,0.23598 1.19471,0.62141 1.76257,0.8945 3.02483,1.49264 6.34746,2.25503 9.63478,2.92732 8.9387,1.6971 18.25999,0.69783 26.82147,-2.27573 2.42901,-0.88745 4.91854,-1.70571 7.13861,-3.05585 0.30521,-0.1929 0.97857,-0.60355 1.41211,-0.89453 6.68187,-4.45679 11.99767,-11.04824 14.66457,-18.64328 1.4017,-7.52016 2.1669,-15.36166 0.4638,-22.899124 -0.8005,-3.355672 -2.1155,-6.667637 -4.3805,-9.3133 -2.3815,-3.359333 -5.1406,-6.517498 -8.48616,-8.945079 -8.83932,-6.140942 -19.60683,-9.484864 -30.38671,-9.128906 z M 1440.6527,185.01758 c -0.016,1.94336 -0.033,3.88672 -0.049,5.83008 -2.8899,-3.73911 -5.6046,-7.65878 -9.112,-10.86357 -5.762,-5.41825 -12.7064,-9.48392 -20.0654,-12.32433 -7.1188,-2.91 -14.7975,-4.26396 -22.4554,-4.62851 -0.6546,-0.0278 -1.6321,-0.0581 -2.4104,-0.0677 -1.3944,-0.0218 -2.9753,0.007 -4.2518,0.0579 -4.0116,0.19291 -8.0415,0.59327 -11.9448,1.56146 -4.9639,1.43353 -9.9236,2.89354 -14.8315,4.50878 -4.1314,1.44644 -8.1179,3.29894 -11.9053,5.49226 -0.3815,0.23638 -0.9554,0.56069 -1.383,0.83023 -1.857,1.13984 -3.8645,2.49693 -5.6795,3.8963 -1.0611,0.81008 -1.9305,1.52377 -2.9519,2.40096 -2.5268,2.15509 -4.8121,4.5728 -6.9207,7.13434 -3.0317,3.42556 -5.8039,7.07846 -8.3168,10.90028 -0.5449,0.82935 -1.2201,1.89137 -1.7886,2.82771 -1.2203,2.00876 -2.4113,4.12646 -3.4455,6.13019 -3.6858,7.08234 -6.5557,14.69656 -8.6937,22.30773 -1.0567,3.77891 -1.9879,7.74155 -2.754,11.71391 -0.4142,2.14879 -0.781,4.23223 -1.0857,6.30936 -0.7591,4.86817 -1.304,9.92509 -1.6798,14.73845 -0.1726,2.41715 -0.3239,4.68258 -0.4316,7.1154 -0.3745,8.53293 -0.3421,17.07949 -0.1661,25.61702 0.1771,5.96084 0.6657,12.11707 1.8501,18.0426 1.0573,5.28418 1.8424,10.62307 3.1171,15.86334 3.0573,13.19774 7.9816,26.14696 15.1728,37.73043 5.6563,9.46097 13.3484,17.70135 22.3639,24.03941 2.8884,2.01476 5.9359,3.80069 9.1498,5.24433 10.3432,5.17463 21.9197,7.41815 33.4122,7.87009 3.9188,0.13659 7.9882,0.20303 11.9778,-0.0688 1.5362,-0.1375 2.9099,-0.31285 4.4563,-0.57885 9.4149,-1.60545 18.1681,-6.01946 25.6649,-11.84974 6.6111,-5.06065 12.3221,-11.16215 17.8004,-17.39987 0.3853,-0.33874 0.8689,-1.15277 1.1953,-1.20631 0.7021,2.21629 1.54,4.40127 2.1576,6.63703 0.9168,6.72348 1.8335,13.44697 2.7502,20.17045 22.418,0 44.8359,0 67.2539,0 0,-110.66667 0,-221.33333 0,-332 -25.0059,0 -50.0117,0 -75.0176,0 -0.3275,38.67253 -0.6549,77.34505 -0.9824,116.01758 z M 402.54138,220.50391 c 57.21159,0 114.42318,0 171.63477,0 C 545.94633,170.12044 517.71651,119.73698 489.48669,69.353516 460.50492,119.73698 431.52315,170.12044 402.54138,220.50391 Z M 478.3031,96.960938 c 8.27539,0 16.55078,-10e-7 24.82617,0 0,28.882162 0,57.764322 0,86.646482 -8.94205,0 -17.88411,0 -26.82617,0 0,-28.88216 0,-57.76432 0,-86.646482 0.66667,0 1.33333,0 2,0 z M 301.10193,113.41992 c -2.60778,0.0511 -5.04937,0.15937 -7.65248,0.35394 -1.92956,0.14641 -3.83669,0.32665 -5.81256,0.56626 -6.39274,0.74022 -12.705,2.05978 -18.91642,3.72807 -19.49979,4.83707 -37.43967,15.14357 -52.13276,28.76189 -3.09331,2.86357 -6.05056,5.87307 -8.86859,9.00781 -0.46848,0.54224 -1.1532,1.30797 -1.7015,1.93947 -17.38407,20.17217 -29.06809,45.34222 -32.62731,71.77332 -0.68159,4.92755 -1.27698,9.87439 -1.41561,14.85197 -0.0857,2.29493 -0.10572,4.74213 -0.07,7.11102 8.14157,-6.88051 16.28261,-13.76165 24.42383,-20.64258 11.07017,10.75406 22.14063,21.50781 33.21094,32.26172 5.62261,-4.94767 11.24327,-9.89756 16.86719,-14.84375 5.60676,6.36613 11.2111,12.73439 16.81445,19.10352 -11.51006,10.1347 -23.02216,20.26708 -34.53516,30.39844 -11.18262,-10.86359 -22.36429,-21.72817 -33.54687,-32.5918 -6.41016,5.41797 -12.82031,10.83594 -19.23047,16.2539 1.3344,5.16049 3.00362,10.23447 5.00781,15.17383 0.35308,0.85808 0.81741,1.97418 1.23793,2.92035 0.48705,1.11182 0.96261,2.15463 1.45839,3.18723 0.92712,1.9655 2.02586,4.06138 3.00876,5.86117 1.07185,1.92106 2.23398,3.88911 3.36648,5.65743 1.51357,2.39069 3.25704,4.86764 4.89719,7.0164 1.51824,1.98995 3.25059,4.0698 4.82813,5.84375 1.9409,2.21461 4.07954,4.24097 6.14146,6.33776 16.91592,18.26596 31.42614,39.00791 41.1267,62.01183 6.19337,14.68058 10.31398,30.28133 11.67324,46.17385 31.40234,0.1528 62.80465,0.30961 94.20703,0.45312 2.71458,-18.49597 7.5483,-36.78514 15.54207,-53.73006 2.80959,-5.98341 5.98204,-11.79548 9.48528,-17.4008 -3.77409,-3.39388 -7.54818,-6.78776 -11.32227,-10.18164 -8.03257,7.77601 -16.06295,15.55426 -24.0957,23.33008 -3.56917,-3.14968 -7.09735,-6.35185 -10.69236,-9.46848 -2.78202,-1.80887 -5.06811,-4.23032 -7.37405,-6.58621 -1.45814,-1.29585 -2.91776,-2.59132 -4.375,-3.88671 -1.23177,0 -2.46354,0 -3.69531,0 5.23559,-5.89266 10.47136,-11.78516 15.70703,-17.67774 -0.90401,-1.33175 -1.76914,-2.70079 -2.6582,-4.04687 1.61334,0.24569 3.25945,0.3942 4.85267,0.69961 2.88117,1.57021 5.50841,3.6121 7.68834,6.06796 7.99902,-7.74448 15.99904,-15.48793 23.99805,-23.23242 8.94107,8.03264 17.87725,16.07071 26.81641,24.10547 8.12782,-9.96379 16.97272,-19.32723 26.17968,-28.29492 1.6507,-1.44702 3.24615,-2.95627 4.7793,-4.52734 0.39854,-0.4152 1.03024,-1.06364 1.50313,-1.58875 8.14569,-8.77353 14.04508,-19.5626 17.21697,-31.09646 1.10301,-3.9488 1.91756,-8.01775 2.46524,-12.01216 1.11126,-8.08299 1.21238,-16.27384 0.78341,-24.41201 -19.00458,-0.009 -38.00974,0.0187 -57.01397,-0.014 -6.42667,-0.21955 -12.9658,-3.21212 -16.58954,-8.65984 -3.00134,-4.4357 -3.72798,-10.15461 -2.42969,-15.30078 0.72031,-3.20669 2.34201,-6.09424 4.01149,-8.88952 10.9532,-19.04138 21.9064,-38.08277 32.8596,-57.12415 -7.22272,-8.09789 -15.54807,-15.19213 -24.58789,-21.18555 -1.18771,-0.78414 -2.57794,-1.68007 -3.8694,-2.46912 -5.70428,-3.51442 -11.67117,-6.59741 -17.8181,-9.26135 -1.38259,-0.58667 -2.96782,-1.25699 -4.44805,-1.8312 -5.59802,-2.20598 -11.33734,-4.05044 -17.16523,-5.54575 -1.68642,-0.42505 -3.5806,-0.87988 -5.36131,-1.2605 -1.3398,-0.28766 -2.64332,-0.55149 -3.90431,-0.78637 -9.30509,-1.73848 -18.7819,-2.56363 -28.24805,-2.40235 z M 1194.4398,163.75 c -3.8354,0.0244 -7.6984,0.0371 -11.4653,0.21344 -6.569,0.21298 -13.045,1.72184 -19.2163,3.93109 -0.3504,0.1394 -1.1227,0.42606 -1.6345,0.62183 -11.1851,4.40157 -21.1828,11.59273 -29.2757,20.44653 -0.3024,0.33482 -0.8513,0.94801 -1.2448,1.39427 -1.7629,2.02099 -3.3778,4.16454 -5.0696,6.2444 -0.6191,-3.23901 -1.3496,-6.4615 -1.8996,-9.71075 -0.5999,-6.29694 -1.1998,-12.59387 -1.7997,-18.89081 -23.3938,0 -46.7877,0 -70.1816,0 0,77.66667 0,155.33333 0,233 25.0033,0 50.0065,0 75.0098,0 0.2638,-52.82425 0.5702,-105.64847 0.8259,-158.47264 -0.073,-2.8704 0.015,-5.87195 1.396,-8.46763 0.6237,-0.90265 1.5788,-1.56987 2.3848,-2.32364 4.8738,-4.21894 11.0014,-6.92707 17.3926,-7.74097 3.4407,-0.51297 6.9249,-0.4006 10.3889,-0.29951 3.3623,0.0452 6.7406,0.0236 10.0858,0.35874 4.7421,1.57055 9.8175,2.95464 13.5381,6.48389 0.8411,0.8209 1.7257,1.66371 2.0465,2.83291 1.3932,3.37612 3.2061,6.6242 3.899,10.24834 0.4074,1.68297 0.4716,3.40858 0.4266,5.13205 0.1029,20.379 0.1713,40.7583 0.2555,61.13746 0.096,30.37041 0.2711,60.74051 0.3446,91.111 25.0033,0 50.0066,0 75.0098,0 0.096,-48.94046 0.1452,-97.88101 0.2246,-146.82148 0.01,-3.96247 0.015,-7.96133 -0.1316,-11.85525 -0.3741,-11.24609 -1.8826,-22.54465 -5.5836,-33.21054 -2.5743,-7.99422 -5.839,-15.94527 -11.2006,-22.50647 -2.7636,-3.40584 -5.9798,-6.43875 -9.5275,-9.01642 -7.6738,-5.89635 -16.7821,-10.17638 -26.2979,-12.2655 -6.1285,-1.38246 -12.4303,-1.81915 -18.7002,-1.57434 z M 932.65271,401 c 25,0 50,0 74.99999,0 0,-77.66667 0,-155.33333 0,-233 -24.99999,0 -49.99999,0 -74.99999,0 0,77.66667 0,155.33333 0,233 z M 478.3031,186.92578 c 8.27539,0 16.55078,0 24.82617,0 0,8.45573 0,16.91146 0,25.36719 -8.94205,0 -17.88411,0 -26.82617,0 0,-8.45573 0,-16.91146 0,-25.36719 0.66667,0 1.33333,0 2,0 z m 929.418,35.29492 c 6.3498,-0.0185 12.7423,1.18127 18.5722,3.71875 5.8253,3.22961 10.8144,7.95327 14.2601,13.66125 0.4649,0.84545 1.1746,1.61534 1.1469,2.63331 0.7247,5.07887 0.5406,10.22077 0.6428,15.33473 0.087,9.58707 0.084,19.17462 0.1566,28.76172 0.1422,7.75009 0.1367,15.50152 0.2028,23.25221 0.017,4.98275 0.3357,9.98189 -0.1088,14.95364 -0.2287,2.76766 -1.2596,5.45335 -3.0191,7.61017 -1.4234,1.77674 -2.8564,3.57155 -4.6719,4.96875 -5.1554,4.33118 -11.5022,7.14859 -18.1276,8.2744 -4.3831,0.75886 -8.8587,0.99346 -13.2983,0.79336 -4.9792,-0.35214 -9.8811,-1.99816 -13.9363,-4.93546 -1.7445,-1.27839 -3.4804,-2.62016 -4.9284,-4.2314 -5.8264,-6.98988 -8.9616,-15.80546 -10.6344,-24.6493 -2.516,-13.53797 -2.0259,-27.39647 -1.2105,-41.07261 0.5394,-9.69482 2.136,-19.51267 6.323,-28.3528 2.9984,-6.31682 7.3625,-12.00757 12.76,-16.45427 4.6587,-3.08789 10.3583,-4.19862 15.8709,-4.26645 z M 504.07654,361.33984 c 3.1263,5.19727 6.2526,10.39454 9.3789,15.5918 4.2168,1.3418 8.4336,2.68359 12.65039,4.02539 6.4941,-2.26379 12.98856,-4.52655 19.48243,-6.79101 10.48278,11.61335 20.97045,23.22229 31.45507,34.83398 -2.88918,6.46598 -5.77445,12.93372 -8.6621,19.40039 0.81705,4.35091 1.63411,8.70182 2.45117,13.05273 4.99918,4.89796 9.99977,9.79448 14.99804,14.69336 -5.49975,15.25637 -11.00084,30.51225 -16.49804,45.76954 -7.06453,-0.33835 -14.1289,-0.67992 -21.19336,-1.01954 -3.21094,2.61914 -6.42188,5.23829 -9.63281,7.85743 -0.91852,7.20899 -1.83792,14.41788 -2.75586,21.62695 -17.00372,3.19091 -34.00655,6.38655 -51.00977,9.58008 -4.07106,-6.19309 -8.1391,-12.38817 -12.20898,-18.58203 -4.04688,-1.34896 -8.09375,-2.69792 -12.14063,-4.04688 -6.79872,2.89478 -13.59833,5.78748 -20.39648,8.68359 -11.04644,-12.03886 -22.09174,-24.07877 -33.13868,-36.11718 2.95553,-6.42628 5.90729,-12.85429 8.86133,-19.28125 -0.86328,-4.29883 -1.72656,-8.59766 -2.58984,-12.89649 -5.24235,-5.05061 -10.48331,-10.10267 -15.72656,-15.15234 6.18076,-14.63887 12.36162,-29.2777 18.53906,-43.91797 7.1581,-0.34014 14.31642,-0.67543 21.47461,-1.01367 3.46354,-2.88021 6.92708,-5.76042 10.39062,-8.64063 1.84179,-6.48307 3.68365,-12.96613 5.52539,-19.44921 16.67704,-3.13306 33.35453,-6.2637 50.03125,-9.39844 0.23829,0.39713 0.47657,0.79427 0.71485,1.1914 z m -30.94531,29.89844 c -1.13824,4.0058 -2.27472,8.0121 -3.41407,12.01758 -7.58923,6.3118 -15.1792,12.62271 -22.76757,18.93555 -4.70707,0.22128 -9.41406,0.44412 -14.1211,0.66601 -1.91667,4.54102 -3.83333,9.08203 -5.75,13.62305 2.99924,2.89074 5.99938,5.78054 8.99805,8.67187 1.90956,9.50247 3.81641,19.00547 5.72656,28.50782 -1.77875,3.85947 -3.54884,7.72295 -5.32422,11.58398 3.32682,3.62565 6.65365,7.2513 9.98047,10.87695 4.28515,-1.82423 8.57035,-3.64835 12.85547,-5.47265 9.77766,3.26012 19.55567,6.51917 29.33398,9.77734 2.61027,3.97358 5.22142,7.94657 7.83203,11.91992 5.59766,-1.05078 11.19532,-2.10156 16.79297,-3.15234 0.57377,-4.49477 1.14586,-8.98975 1.72071,-13.48438 8.2607,-6.73843 16.52116,-13.47717 24.77929,-20.21875 4.10805,0.19839 8.21615,0.39577 12.32422,0.59375 1.60026,-4.4401 3.20052,-8.8802 4.80078,-13.32031 -3.05315,-2.99112 -6.1082,-5.98031 -9.16015,-8.97265 -1.77859,-9.4828 -3.56144,-18.9648 -5.3418,-28.44727 1.73589,-3.89241 3.47414,-7.78378 5.21094,-11.67578 -3.14974,-3.48763 -6.29948,-6.97526 -9.44922,-10.46289 -3.89652,1.35732 -7.79275,2.71548 -11.68945,4.07226 -9.85326,-3.13158 -19.70565,-6.26589 -29.5586,-9.39843 -2.00049,-3.32692 -4.00132,-6.65363 -6.00195,-9.98047 -5.92578,1.11328 -11.85156,2.22656 -17.77734,3.33984 z m 19.30859,20.25391 c 9.04519,-0.13204 18.23933,2.81031 25.11751,8.77635 9.29852,7.90934 14.17517,20.38581 13.49756,32.49143 -0.46802,9.46008 -4.50703,18.79298 -11.48148,25.26842 -8.24388,7.74184 -19.84481,11.61487 -31.08476,10.83294 -8.35757,-0.58749 -16.56618,-3.98669 -22.60099,-9.85208 -11.21712,-10.70991 -15.13069,-28.18406 -9.94973,-42.74406 2.41806,-6.92898 7.03373,-13.05362 13.03056,-17.28472 6.78591,-4.88474 15.14297,-7.38046 23.47133,-7.48828 z M 1116.1195,433.875 c -1.9587,0.008 -3.9201,0.11416 -5.8594,0.39844 -0.6449,0.099 -1.6009,0.26064 -2.3573,0.43598 -4.721,1.03522 -9.1916,3.25723 -12.8408,6.42376 -3.6897,3.9613 -6.1016,9.04057 -6.9487,14.38008 -0.655,3.83497 -0.705,7.60261 -0.6524,11.50539 0.037,2.66202 0.1753,5.32111 0.2719,7.98135 -5.0267,0 -10.0534,0 -15.0801,0 0,3 0,6 0,9 5,0 10,0 15,0 0,27 0,54 0,81 4,0 8,0 12,0 0,-27.33333 0,-54.66667 0,-82 6.6667,0 13.3333,0 20,0 0,-2.66667 0,-5.33333 0,-8 -6.6868,0 -13.3737,0 -20.0605,0 0.2568,-5.82149 0.022,-11.74067 1.4317,-17.44045 0.8297,-3.26983 2.2501,-6.44197 4.3144,-9.10468 3.0124,-1.93617 6.3871,-3.34879 9.9508,-3.82967 2.1629,-0.30929 4.3646,-0.23743 6.5422,-0.41123 1.1171,-0.0623 2.2345,-0.11813 3.3526,-0.15733 0.9105,-2.47208 0.4438,-5.14842 0.5122,-7.71863 -0.079,-0.54769 0.1223,-1.32661 -0.1199,-1.73883 -3.1113,-0.65488 -6.2858,-0.80554 -9.4567,-0.72418 z M 803.65271,482 c 0,0.66667 0,1.33333 0,2 -2,0 -4,0 -6,0 0,-1.05013 0,-2.10026 0,-3.15039 -2.47248,-2.28545 -5.38248,-4.09074 -8.45906,-5.43747 -3.32042,-1.18887 -6.82705,-1.79883 -10.33977,-2.02737 -0.46397,-0.0196 -1.0185,-0.0601 -1.56682,-0.0693 -5.04244,-0.10946 -10.19704,0.44599 -14.89984,2.35158 -5.60383,2.54385 -10.33879,6.79662 -13.72343,11.91313 -2.57917,3.87572 -4.60505,8.10861 -6.22947,12.46237 -0.98435,3.323 -1.64834,6.73603 -2.057,10.17625 -0.0303,0.27132 -0.13073,1.22978 -0.1582,1.51172 -0.2974,3.15538 -0.35917,6.33004 -0.22852,9.49609 0.0187,0.36287 0.0606,1.14754 0.0935,1.67393 0.17609,2.5995 0.49437,5.18845 0.93771,7.75576 0.0846,0.41193 0.21698,1.19224 0.33195,1.74655 0.70436,3.51593 1.67239,6.97799 2.88875,10.35111 0.14826,0.37236 0.41502,1.11886 0.61929,1.63097 1.78293,4.76789 4.48245,9.19573 7.92773,12.94456 3.43031,3.70205 7.78997,6.56801 12.58111,8.15712 8.94463,1.73935 19.04013,2.00953 27.1096,-2.99899 3.13389,-2.28423 6.27975,-4.55189 9.38727,-6.87234 0.78135,3.1284 1.56372,6.25654 2.34571,9.38477 3.81315,0 7.6263,0 11.43945,0 0,-43 0,-86 0,-129 -4,0 -8,0 -12,0 0,15.33333 0,30.66667 0,46 z m 431.99999,83 c 4.0007,0 8.0013,0 12.002,0 -0.016,-14.15918 0.1385,-28.31782 0.1328,-42.47692 0.034,-4.52658 0.078,-9.05274 -0.01,-13.57893 -0.033,-4.97426 0.5233,-10.18064 3.1805,-14.50734 1.2144,-2.1246 3.1193,-3.73591 4.9762,-5.28348 3.973,-3.17522 8.9238,-5.12981 13.9951,-5.49019 4.6702,-0.089 9.4939,0.51662 13.6296,2.82709 1.7103,0.96585 3.3956,2.08148 4.8271,3.39744 1.5915,4.81421 3.5454,9.63397 3.679,14.77279 0.1723,4.90823 0.042,9.82187 0.152,14.73195 0.136,15.20255 0.3024,30.40486 0.4201,45.60759 4.0065,0 8.013,0 12.0195,0 0.035,-21.81247 0.1,-43.62512 0.098,-65.4375 -0.022,-0.66235 -0.023,-1.10701 -0.062,-1.68699 -0.079,-1.89679 -0.3706,-3.78326 -1.0388,-5.56624 -0.6804,-2.2557 -1.3417,-4.53514 -2.5259,-6.59045 -2.5304,-4.81269 -6.8077,-8.5638 -11.7205,-10.82172 -2.0438,-0.70879 -4.2194,-1.01661 -6.3598,-1.31898 -0.8308,-0.0993 -1.4765,-0.16266 -2.3522,-0.2253 -1.1417,-0.0818 -2.0897,-0.11299 -3.265,-0.1204 -5.7254,0.0113 -11.5327,0.99068 -16.7226,3.48242 -3.9903,3.10286 -7.9806,6.20564 -11.9707,9.3086 -0.3497,-16.67444 -0.695,-33.34897 -1.043,-50.02344 -4.0137,0 -8.0273,0 -12.041,0 0,43 0,86 0,129 z m 98,0 c 4.3333,0 8.6667,0 13,0 0,-43 0,-86 0,-129 -4.3333,0 -8.6667,0 -13,0 0,43 0,86 0,129 z M 492.51404,436.41602 c -3.54682,0.29058 -7.33368,1.04765 -10.04119,3.52477 -3.38626,3.20663 -4.33595,8.26425 -3.53338,12.71963 0.80291,4.43768 3.44379,8.84137 7.73273,10.6409 3.34768,1.35225 7.09927,0.71084 10.45457,-0.2737 3.07096,-0.88421 5.84469,-2.90508 7.34954,-5.75982 2.9817,-5.57862 1.82329,-13.03117 -2.61486,-17.51409 -2.27336,-2.30763 -5.53245,-3.51728 -8.75825,-3.35665 -0.19638,0.006 -0.39277,0.0126 -0.58916,0.019 z m -241.08399,89.22265 c 35.34947,0.65017 70.70435,1.12543 106.06055,1.02344 0.2282,-19.699 0.46159,-39.39798 0.625,-59.09766 -35.36719,-0.16393 -70.73437,-0.32807 -106.10156,-0.49218 -0.19466,19.52213 -0.38932,39.04427 -0.58399,58.5664 z m 628.94922,-52.62305 c -9.05348,0.26538 -18.09011,3.34183 -25.20825,8.98716 -2.52291,1.94595 -4.41806,4.55282 -6.27612,7.10855 -4.60836,6.57596 -7.52921,14.30157 -8.49414,22.26953 -0.0425,0.37413 -0.13157,1.08957 -0.16365,1.51745 -0.41468,4.16242 -0.17181,8.35042 -0.1355,12.5239 0.14401,5.77801 0.81502,11.65944 3.1429,17.00552 0.1376,0.32873 0.44629,1.01107 0.66406,1.4668 1.00459,2.10975 2.46002,3.95981 3.66025,5.95809 0.97406,1.46225 1.81619,2.89329 3.07163,4.16814 5.24923,5.80101 12.1471,10.39766 19.94227,11.78244 2.39972,0.40725 4.85082,0.36994 7.27693,0.49492 7.35158,0.25992 14.95913,-0.24156 21.73433,-3.35327 4.23439,-1.88928 7.98796,-4.72031 11.28087,-7.95849 1.35442,-1.36584 2.29833,-3.12975 2.61575,-5.03128 -2.28107,-1.55293 -4.59788,-3.06568 -7.05078,-4.33594 -3.00989,4.45568 -7.68553,7.56972 -12.64491,9.48689 -1.72272,0.67623 -3.60669,0.74654 -5.42228,1.02011 -6.72164,0.76453 -13.81683,0.56007 -20.06025,-2.30745 -1.05634,-0.54396 -2.26826,-0.94946 -2.9453,-1.98689 -3.07726,-3.6895 -6.48378,-7.22474 -8.60811,-11.58653 -2.08693,-4.46703 -2.83416,-9.39239 -3.91928,-14.16274 -0.22024,-1.02757 -0.44106,-2.05502 -0.66159,-3.08253 21.16146,0 42.32292,0 63.48438,0 0.0174,-3.92201 0.0514,-7.98969 -0.041,-11.82031 -0.0584,-2.01755 -0.15882,-4.07038 -0.31141,-5.9377 -0.0437,-1.60297 -0.41845,-3.15467 -0.90139,-4.67642 -2.38869,-8.09569 -6.75384,-15.83311 -13.4385,-21.1359 -5.72389,-4.70812 -13.28364,-6.60318 -20.59089,-6.41405 z m 296.20113,0.18165 c -0.7724,0.0333 -1.6056,0.0797 -2.2498,0.14631 -4.8377,0.43661 -9.5901,1.73257 -14.006,3.75017 -0.4062,0.19452 -1.1458,0.53943 -1.6699,0.81055 -3.3544,1.75605 -6.5635,3.88407 -9.2396,6.57601 -5.4247,5.89835 -9.1713,13.28561 -10.7959,21.12865 -1.3868,6.3524 -1.4083,12.89904 -1.1777,19.36629 0.3823,8.48588 2.3142,17.07848 6.8267,24.36337 1.7058,2.74365 3.6662,5.36011 5.9857,7.61334 6.8846,6.03058 16.0103,9.24079 25.1224,9.35357 3.2081,-0.045 6.4176,-0.0634 9.626,-0.11998 0.4612,-0.0152 1.0867,-0.0305 1.5421,-0.0597 1.0129,-0.0202 2.0209,-0.0914 2.9566,-0.51622 5.5719,-1.74656 11.0777,-4.13452 15.4876,-8.04904 2.3535,-2.07792 4.4154,-4.52754 6.0664,-7.17578 -2.2374,-1.9469 -4.6406,-3.77543 -7.4121,-4.89258 -0.4674,1.10742 -1.5288,1.79616 -2.323,2.66118 -3.3788,3.22488 -7.3227,6.05132 -11.8555,7.35246 -6.9888,1.29233 -14.3813,1.86146 -21.2468,-0.36367 -1.5519,-0.51725 -3.096,-1.14137 -4.4951,-1.97821 -3.146,-3.57537 -6.5789,-6.97253 -9.0371,-11.08491 -2.5884,-4.46897 -3.4107,-9.64942 -4.5487,-14.61307 -0.3194,-1.48868 -0.639,-2.97733 -0.9586,-4.46597 21.1582,0 42.3164,0 63.4746,0 -0.017,-5.61255 0.034,-11.23375 -0.025,-16.84091 -1.8097,-7.04925 -3.9679,-14.23601 -8.4252,-20.11618 -2.0332,-2.66767 -4.3713,-5.13727 -7.0537,-7.15697 -5.9515,-4.18718 -13.3532,-5.95552 -20.5682,-5.68867 z m 233.5899,0.10351 c -9.2526,0.24496 -18.4822,3.75676 -25.2563,10.11791 -6.3311,6.92015 -10.7971,15.55422 -12.5809,24.77541 -0.5893,2.89256 -0.9343,6.02722 -1.0554,8.85278 -0.078,5.77145 -0.3535,11.63886 0.9782,17.30273 2.3056,7.89003 6.0783,15.5262 11.9716,21.3593 2.6316,2.59316 5.5645,4.92612 8.8145,6.69395 2.5853,1.27591 5.3249,2.22251 8.1185,2.92526 0.3614,0.078 1.1318,0.27355 1.6554,0.3742 5.9649,1.24811 12.1574,1.43865 18.1825,0.51057 0.3531,-0.067 1.1311,-0.18625 1.6436,-0.29641 1.6809,-0.3383 3.3721,-0.70531 4.915,-1.47898 0.7813,-0.35308 1.8316,-0.81504 2.7025,-1.23859 5.21,-2.43986 10.2132,-5.75275 13.5121,-10.56468 0.4725,-0.67649 0.9128,-1.37517 1.3225,-2.09126 -2.112,-1.64258 -4.224,-3.28516 -6.3359,-4.92774 -4.7656,4.42769 -10.1767,8.41335 -16.4864,10.28711 -4.1682,0.6158 -8.4261,0.87178 -12.6347,0.5 -4.3309,-0.42411 -8.6976,-1.6594 -12.2756,-4.19778 -4.1157,-3.37455 -7.5073,-7.71095 -9.365,-12.728 -2.0014,-5.29068 -2.7389,-10.93502 -3.711,-16.47656 20.7891,0 41.5781,0 62.3672,0 -0.017,-6.27724 0.034,-12.56322 -0.025,-18.83501 -1.9156,-7.61834 -4.877,-15.24322 -10.2853,-21.08938 -2.18,-2.32755 -4.6595,-4.42611 -7.4574,-5.96639 -5.8393,-2.67619 -12.2929,-3.99244 -18.7143,-3.80844 z m -431.5215,0.20508 c -4.48769,0.0178 -8.99327,0.89871 -13.04557,2.86205 -2.23462,0.99923 -4.30141,2.30819 -6.3157,3.68899 -1.01691,0.68393 -2.11603,1.34275 -2.95353,2.21962 -0.41338,1.24113 -0.82684,2.48223 -1.23988,3.72348 -1.81381,0 -3.62761,0 -5.44141,0 0,-3.66667 0,-7.33333 0,-11 -3.66667,0 -7.33333,0 -11,0 0,30 0,60 0,90 3.99935,0 7.9987,0 11.99805,0 -0.0628,-12.15571 0.0616,-24.31117 0.0527,-36.46679 -0.0547,-5.4788 0.0659,-10.95827 0.009,-16.4364 -0.12752,-5.43275 -0.3395,-11.12373 1.92941,-16.19889 0.44199,-1.05048 1.00302,-2.04221 1.84254,-2.8272 3.63592,-4.08165 8.45388,-7.11383 13.76661,-8.45133 2.54487,-0.67357 5.16315,-1.15156 7.80553,-1.04324 4.02712,-0.0344 8.13474,0.88415 11.50422,3.16134 0.95575,0.63181 1.92963,1.30146 2.75053,2.08221 1.98958,4.55905 4.46409,9.09788 4.76866,14.16469 0.31773,4.58058 0.10984,9.17814 0.20616,13.76597 0.10814,12.24831 0.17413,24.49699 0.28819,36.74528 0.0249,3.83478 0.052,7.66954 0.069,11.50436 4.0091,0 8.01829,0 12.02739,0 0.1565,-15.88118 0.2115,-31.76313 0.351,-47.64443 -0.067,-7.69348 0.5208,-15.48068 -0.9914,-23.07955 -0.9318,-4.66847 -2.7734,-9.21624 -5.6823,-13.00372 -3.38354,-3.47492 -7.71326,-6.10434 -12.50363,-7.04736 -1.14943,-0.24828 -2.10887,-0.3759 -3.30105,-0.50763 -2.29015,-0.24439 -4.59439,-0.21848 -6.89415,-0.21145 z m 523.5137,0.30859 c -3.5875,0.10325 -7.1606,1.24291 -9.9998,3.46978 -1.8006,1.30103 -3.1358,3.1127 -4.7229,4.64936 -1.4305,1.54477 -2.8608,3.08975 -4.291,4.63477 -0.43,-3.85601 -0.8584,-7.7122 -1.2871,-11.56836 -4.0697,0 -8.1393,0 -12.209,0 0,30 0,60 0,90 4.0052,0 8.0104,0 12.0156,0 0.1211,-15.83599 0.296,-31.67151 0.4349,-47.50732 0.1034,-4.93695 -0.025,-9.8815 0.2415,-14.81329 0.1891,-3.41656 1.417,-6.73139 3.4351,-9.48846 1.1178,-1.47273 2.62,-2.63127 4.1316,-3.68348 4.1,-2.8014 9.1563,-3.59518 14.0168,-3.81409 2.2414,-0.18773 4.4798,-0.41149 6.7245,-0.55664 0,-3.72917 0,-7.45833 0,-11.1875 -2.8294,-0.0412 -5.6608,-0.23064 -8.4902,-0.13477 z m -326.3028,8.4375 c 3.9967,-0.0305 8.0132,0.6443 11.7696,1.99068 5.7732,3.83625 10.318,9.71736 12.0063,16.4877 0.4099,4.08983 0.8173,8.17992 1.228,12.26967 -16.8099,0 -33.6198,0 -50.4297,0 0.6513,-5.99245 1.011,-12.25519 3.8989,-17.68424 1.5691,-2.96067 3.6994,-5.61382 6.1009,-7.93456 4.3545,-3.43995 9.9204,-5.0749 15.426,-5.12925 z m -296.08785,0.0137 c 3.69123,0.0509 7.39194,0.70823 10.85375,1.97678 4.06565,2.62891 7.44408,6.36437 9.3894,10.81927 1.70044,3.86083 2.67054,8.00565 3.37071,12.15196 0.36591,1.90838 0.24447,3.85564 0.27677,5.78637 -16.68164,0 -33.36329,0 -50.04493,0 0.003,-4.04436 0.16653,-8.1553 1.4376,-12.03025 1.37004,-4.38652 3.8577,-8.35155 6.71422,-11.91247 4.69982,-4.70354 11.44186,-6.88096 18.00248,-6.79166 z m -101.21484,0.23047 c 5.52974,-0.0734 11.0062,1.48376 15.8997,3.99102 4.12575,3.24969 7.93989,7.31554 9.4484,12.46637 0.54641,1.76897 0.38913,3.65626 0.50762,5.48479 0.0676,7.33601 -0.11369,14.67209 -0.0254,22.00821 -0.0545,3.16742 0.0221,6.33674 -0.053,9.50274 -0.15022,3.99732 -1.21635,8.03859 -3.61125,11.29435 -1.2447,1.71771 -2.62201,3.38673 -4.43009,4.53635 -4.65488,3.36182 -10.30871,5.17092 -16.01349,5.54119 -1.86444,0.0888 -3.75873,0.25997 -5.61144,-0.003 -5.81862,-0.93448 -11.20231,-4.12905 -14.86315,-8.73985 -1.10912,-1.43328 -1.84995,-3.11987 -2.66452,-4.73264 -1.90278,-4.1242 -3.53478,-8.41744 -4.23686,-12.92505 -0.87679,-5.36077 -0.75148,-10.82101 -0.55419,-16.22955 0.30768,-6.73693 1.739,-13.5879 5.33988,-19.37578 1.6366,-2.65282 3.59454,-5.12962 5.86456,-7.26581 4.15482,-3.5584 9.54553,-5.49365 15.00321,-5.55293 z m 636.60159,0.0957 c 3.6419,0.3588 7.1676,1.81185 9.9246,4.23262 1.5509,1.34043 3.0637,2.76047 4.1412,4.52218 2.4756,3.52782 4.3991,7.53076 4.9634,11.83939 0.5029,3.24565 0.4488,6.53946 0.4825,9.81401 -16.7702,0 -33.5404,0 -50.3106,0 0.7139,-5.63924 1.5341,-11.41344 4.175,-16.52669 2.1902,-4.33284 5.5344,-8.01474 9.3391,-10.98755 3.1052,-2.14652 6.9584,-2.73708 10.6571,-2.75283 2.2093,-0.0204 4.4214,-0.13686 6.6277,-0.14113 z" />
            <defs
              id="defs1">
              <linearGradient
                id="linearGradient1">
                <stop
                  style="stop-color:#04e4fd;stop-opacity:1;"
                  offset="0"
                  id="stop1" />
                <stop
                  style="stop-color:#cf91ec;stop-opacity:0.83306319;"
                  offset="1"
                  id="stop2" />
              </linearGradient>
              <linearGradient
                xlink:href="#linearGradient1"
                id="linearGradient2"
                x1="-2.022028"
                y1="309"
                x2="1521.5002"
                y2="309"
                gradientUnits="userSpaceOnUse"
                gradientTransform="translate(-1.3472907,-1)" />
            </defs>
          </svg>
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

    <button id="pwaInstallBtn" style="display:none;" class="btn--primary">
      App installieren
    </button>

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
});

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
  } else if (currentY > lastScrollY && currentY > 110) {
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
});

// Aktualisiert die Steuerungs-Buttons (Sichtbarkeit / Aktivierung)
function updateControlButtons() {
  const hasText = searchInput.value.trim() !== "";
  const hasFilter = herstellerFilter.value !== "" || typFilter.value !== "";
  document.getElementById("btnClearSearch").disabled = !hasText;
  document.getElementById("btnResetFilters").disabled = !hasFilter;
}
// Home-Button Sichtbarkeit 
function updateHomeBtnVisibility() {
  const btn = document.querySelector(".home-btn");
  if (!btn) return;

  const params = parseURLHash();
  // sichtbar nur wenn eine ID im Hash steckt
  if (params.id) {
    btn.style.display = "flex";
  } else {
    btn.style.display = "none";
  }
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
    window.scrollTo({ top: 0 });
    updateURLHash();
    renderDaten();
    updateControlButtons();
    updateHomeBtnVisibility();
  }, 400));
});

// Suchfeld leeren (Button)
document.getElementById("btnClearSearch").addEventListener("click", () => {
  searchInput.value = "";
  searchHint.value = "";
  updateURLHash();
  renderDaten();
  updateControlButtons();
  updateHomeBtnVisibility();
});

// Filter-Reset-Button
document.getElementById("btnResetFilters").addEventListener("click", () => {
  herstellerFilter.value = "";
  typFilter.value = "";
  updateURLHash();
  renderDaten();
  updateControlButtons();
  updateHomeBtnVisibility();
});

// Filter und Suche leeren bei klick auf logo 
document.getElementById("logo-sm")?.addEventListener("click", () => {
  resetFilter();
});

// Filter und Suche leeren
function resetFilter() {
  searchInput.value = "";
  searchHint.value = "";
  herstellerFilter.value = "";
  typFilter.value = "";
  updateURLHash();
  renderDaten();
  updateControlButtons();
  updateHomeBtnVisibility();
}

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
  if (!location.hash.startsWith("#")) return { code: "", hersteller: "", typ: "", id: "" };

  const hash = location.hash.substring(1);
  const params = new URLSearchParams(hash);

  return {
    code: params.get("code") || "",
    hersteller: params.get("hersteller") || "",
    typ: params.get("typ") || "",
    id: params.get("id") || "",
  };
}

document.querySelectorAll('.touchBtn').forEach(btn => {
  btn.addEventListener('touchstart', () => btn.classList.add('tapped'));
  btn.addEventListener('touchend', () => btn.classList.remove('tapped'));
  btn.addEventListener('touchcancel', () => btn.classList.remove('tapped'));
});

// Deaktiviere/ersetze Voice-Button auf Smartphones
(function () {
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // kurze Meldung showStatusMessage 
  function showDisabledInfo(msg) {
    if (typeof showStatusMessage === "function") {
      showStatusMessage(msg, "info", 3000);
    } else {
      // fallback
      alert(msg);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("voiceSearchBtn");
    if (!btn) return;

    if (isMobile) {
      btn.setAttribute("aria-disabled", "true");
      btn.setAttribute("title", "Sprachsuche auf Smartphones deaktiviert");
      btn.querySelector('svg').outerHTML = `
        <svg style="width:18px; height:18px;">
          <use href="#icon-search" />
        </svg>
      `;

      btn.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          // showDisabledInfo("Sprachsuche ist auf Mobilgeräten deaktiviert.");
        },
        true
      );
    } else {
      btn.removeAttribute("aria-disabled");
      btn.classList.remove("voice-disabled");
    }
  });
})();

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
  const { code = "", hersteller = "", typ = "", id = "" } = parseURLHash() || {};
  if (code) searchInput.value = code;
  if (hersteller) herstellerFilter.value = hersteller;
  if (typ) typFilter.value = typ;

  // Reset-Hinweis anzeigen
  if (sessionStorage.getItem("appReset") === "1") {
    sessionStorage.removeItem("appReset");
    showStatusMessage("App wurde zurückgesetzt. Standarddaten wurden geladen.", "info");
  }

  // Inhalte anzeigen
  renderDaten(id);
  updateControlButtons();
  updateHomeBtnVisibility();
}

// Start
initApp();

/* ===== App Installieren ===== */
(function () {
  const ua = navigator.userAgent || "";
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  let deferredPrompt = null;
  let mutationObserver = null;
  let lastFocusedBeforeModal = null;

  function isAppInstalled() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
      || window.navigator.standalone === true;
  }

  function showInstallButtons() {
    document.querySelectorAll("#pwaInstallBtn").forEach(btn => {
      btn.style.display = "inline-flex";
    });
  }
  function hideInstallButtons() {
    document.querySelectorAll("#pwaInstallBtn").forEach(btn => {
      btn.style.display = "none";
    });
  }

  function showToast(msg, t = 3000) {
    if (typeof showStatusMessage === "function") { showStatusMessage(msg, "info", t); return; }
    const el = document.createElement("div");
    el.textContent = msg;
    Object.assign(el.style, {
      position: "fixed", left: "50%", transform: "translateX(-50%)",
      bottom: "20px", background: "rgba(0,0,0,0.8)", color: "#fff",
      padding: "8px 12px", borderRadius: "8px", zIndex: 2147483646
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), t);
  }

  function injectModalStyles() {
    if (document.getElementById("pwaInstallStyles")) return;
    const s = document.createElement("style");
    s.id = "pwaInstallStyles";
    s.textContent = `
      .pwa-ios-modal { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 2147483647; }
      .pwa-ios-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.5); }
      .pwa-ios-panel { position: relative; width: min(420px,92%); padding: 1rem; border-radius: 10px; background: var(--card-bg,#222); color: var(--fg,#dfdfdf); box-shadow: 0 10px 30px rgba(0,0,0,.35); }
      .pwa-ios-panel h3 { margin: 0 0 .5rem; }
      .pwa-ios-panel ol { margin: .5rem 0; padding-left: 1.2rem; }
      .pwa-ios-panel button { margin-top: 0.75rem; padding: .4rem .9rem; border-radius: 8px; border: none; background: var(--button,#1e88e5); color:var(--fg, #fff); }
    `;
    document.head.appendChild(s);
  }

  function showIosInstallModal() {
    injectModalStyles();

    let modal = document.getElementById("pwaIosInstallModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "pwaIosInstallModal";
      modal.className = "pwa-ios-modal";
      modal.innerHTML = `
        <div class="pwa-ios-backdrop" tabindex="-1"></div>
        <div class="pwa-ios-panel" role="dialog" aria-modal="true" aria-labelledby="pwaInstallTitle">
          <h3 id="pwaInstallTitle">App installieren</h3>
          <p>Tippe auf das <strong>Teilen-Symbol</strong> und wähle <strong>„Zum Home-Bildschirm“</strong>.</p>
          <ol>
            <li>Teilen-Symbol antippen</li>
            <li>„Zum Home-Bildschirm“ wählen</li>
            <li>Hinzufügen tippen</li>
          </ol>
          <button id="pwaIosInstallClose">Alles klar</button>
        </div>
      `;
      document.body.appendChild(modal);

      const closeBtn = modal.querySelector("#pwaIosInstallClose");
      closeBtn.addEventListener("click", () => closeModal(modal));
      modal.querySelector(".pwa-ios-backdrop").addEventListener("click", () => closeModal(modal));
      modal.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeModal(modal); });
    }

    lastFocusedBeforeModal = document.activeElement;
    modal.style.display = "flex";
    const closeBtn = modal.querySelector("#pwaIosInstallClose");
    if (closeBtn) closeBtn.focus();
  }

  function closeModal(modal) {
    if (!modal) modal = document.getElementById("pwaIosInstallModal");
    if (!modal) return;
    modal.style.display = "none";
    if (lastFocusedBeforeModal && lastFocusedBeforeModal.focus) lastFocusedBeforeModal.focus();
  }

  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest ? ev.target.closest("#pwaInstallBtn") : null;
    if (!btn) return;

    ev.preventDefault();

    if (isAppInstalled()) {
      hideInstallButtons();
      return;
    }

    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        deferredPrompt = null;
        hideInstallButtons();
        if (choice && choice.outcome === "accepted") showToast("Installation akzeptiert", 2000);
        return;
      } catch (err) {
        // fallback below
      }
    }

    if (isIos) {
      showIosInstallModal();
      return;
    }

    showToast("Installation nicht verfügbar. Prüfe HTTPS, manifest.json und Service Worker.", 6000);
  }, { capture: true });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isAppInstalled() && isMobile) showInstallButtons();
  });

  window.addEventListener("appinstalled", () => {
    hideInstallButtons();
    if (mutationObserver) {
      try { mutationObserver.disconnect(); } catch (e) { }
      mutationObserver = null;
    }
  });

  function forceShowIfIos(btn) {
    if (isIos && isMobile && !isAppInstalled()) {
      btn.style.setProperty("display", "inline-flex", "important");
      btn.style.setProperty("visibility", "visible", "important");
      btn.style.setProperty("opacity", "1", "important");
    } else {
      btn.style.setProperty("display", "none", "important");
    }
  }

  function initExistingButtons() {
    const nodes = document.querySelectorAll("#pwaInstallBtn");
    nodes.forEach(forceShowIfIos);
  }

  mutationObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== "childList") continue; // safety
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.id === "pwaInstallBtn") {
          forceShowIfIos(node);
        } else {
          const nested = node.querySelector && node.querySelector("#pwaInstallBtn");
          if (nested) forceShowIfIos(nested);
        }
      }
    }
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initExistingButtons);
  } else {
    initExistingButtons();
  }
})();

