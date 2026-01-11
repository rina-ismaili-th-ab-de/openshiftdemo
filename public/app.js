// public/app.js
// Ziel: Sehr einfache, studentische Texte + Live-Daten + Load-Balancing Test (30 Requests)
// Extra: Pods gesehen + Antwortzeit + Live-Verlauf + Auto-Refresh (alles optional, nur wenn Elemente im HTML existieren)

const $ = (id) => document.getElementById(id);

// Elemente (können je nach Seite fehlen -> wir prüfen immer)
const dotStatus = $("dotStatus");
const txtStatus = $("txtStatus");
const dotExplain = $("dotExplain");
const txtExplain = $("txtExplain");

const vRoute = $("vRoute");
const vVersion = $("vVersion");
const vPod = $("vPod");
const vNs = $("vNs");
const vNode = $("vNode");
const vUptime = $("vUptime");
const vReq = $("vReq");
const vTime = $("vTime");

const btnRefresh = $("btnRefresh");
const btnBurst = $("btnBurst");
const vBurst = $("vBurst");
const burstHint = $("burstHint");

// NEU (nur aktiv, wenn im HTML vorhanden)
const vPodsSeen = $("vPodsSeen");
const vLatency = $("vLatency");
const historyList = $("historyList");
const btnAuto = $("btnAuto");
const btnClearHistory = $("btnClearHistory");

// Zustand
let seenPods = new Set();
let history = [];
let autoTimer = null;

function setText(el, text) {
  if (!el) return;
  el.textContent = text ?? "–";
}

function setDot(el, mode) {
  if (!el) return;
  el.classList.remove("ok", "warn", "err");
  // Falls du in CSS nur "warn" hast: warn reicht.
  if (mode === "ok") el.classList.add("ok");
  else if (mode === "err") el.classList.add("err");
  else el.classList.add("warn");
}

function prettyUptime(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return "–";

  if (s < 60) return `${Math.floor(s)} Sekunden`;

  const m = Math.floor(s / 60);
  const restS = Math.floor(s % 60);
  if (m < 60) return `${m} Minuten ${restS} Sekunden`;

  const h = Math.floor(m / 60);
  const restM = m % 60;
  return `${h} Stunden ${restM} Minuten`;
}

function ms(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "–";
  return `${Math.round(x)} ms`;
}

function nowTime() {
  return new Date().toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function fetchInfo(cacheBuster = "") {
  const url = `/api/info?t=${Date.now()}_${Math.random().toString(16).slice(2)}${cacheBuster}`;

  const t0 = performance.now();
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  const t1 = performance.now();

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const info = await res.json();

  return { info, latencyMs: t1 - t0 };
}

function renderBurst(counts) {
  if (!vBurst) return;

  const entries = Object.entries(counts);
  if (entries.length === 0) {
    vBurst.textContent = "–";
    return;
  }

  // häufigster zuerst
  entries.sort((a, b) => b[1] - a[1]);

  // Anzeige als einfache Zeilen
  // Beispiel:
  // pod-a  (16x)
  // pod-b  (14x)
  vBurst.innerHTML = entries.map(([pod, c]) => `${pod} (${c}x)`).join("<br>");
}

function renderHistory() {
  if (!historyList) return;

  if (history.length === 0) {
    historyList.textContent =
      "Noch kein Verlauf. Klick „Neu laden“ oder starte den 30-Requests-Test.";
  } else {
    const last15 = history.slice(0, 15);
    const lines = last15.map(
      (h) => `${h.time} | ${h.pod} | ${h.version} | ${h.uptime} | ${h.latency}`
    );
    historyList.textContent = lines.join("\n");
  }

  if (vPodsSeen) setText(vPodsSeen, `${seenPods.size}`);
}

async function loadOnce() {
  try {
    const { info, latencyMs } = await fetchInfo();

    // Route-Link
    if (vRoute) setText(vRoute, window.location.origin);

    setText(vVersion, info.version || "–");
    setText(vPod, info.podName || "–");
    setText(vNs, info.namespace || "–");
    setText(vNode, info.nodeName || "–");
    setText(vUptime, prettyUptime(info.uptimeSeconds));
    setText(vReq, info.requestCount != null ? String(info.requestCount) : "–");
    setText(vTime, info.serverTime || "–");

    // NEU: Antwortzeit anzeigen
    if (vLatency) setText(vLatency, ms(latencyMs));

    // NEU: Pods merken + Verlauf füllen
    const pod = info.podName || "unknown";
    seenPods.add(pod);

    history.unshift({
      time: nowTime(),
      pod,
      version: info.version || "–",
      uptime: prettyUptime(info.uptimeSeconds),
      latency: ms(latencyMs),
    });

    // Verlauf begrenzen
    history = history.slice(0, 50);
    renderHistory();

    setDot(dotStatus, "ok");
    setText(txtStatus, "OK: Live-Daten kommen aus einem Pod");

    // Erklärung (studentisch, kurz)
    setDot(dotExplain, "ok");
    setText(
      txtExplain,
      "Wenn Pod + Namespace + Uptime sichtbar sind, läuft die App wirklich als Container in OpenShift. Bei mehreren Pods sollte sich der Pod-Name manchmal ändern."
    );
  } catch (e) {
    setDot(dotStatus, "err");
    setText(txtStatus, "Fehler: Ich konnte /api/info gerade nicht laden.");

    setDot(dotExplain, "warn");
    setText(
      txtExplain,
      "Tipp: In OpenShift bei Pods/Logs schauen, ob die App läuft. Danach Seite neu laden."
    );
  }
}

async function runBurst(times = 30) {
  if (!btnBurst || !vBurst) return;

  btnBurst.disabled = true;
  setText(burstHint, `Läuft… (${times} Requests)`);

  const counts = {};

  for (let i = 1; i <= times; i++) {
    try {
      const { info, latencyMs } = await fetchInfo(`_${i}`);
      const pod = info.podName || "unknown";

      counts[pod] = (counts[pod] || 0) + 1;

      // NEU: Pods auch hier merken (passt dann zu “Pods gesehen”)
      seenPods.add(pod);

      // optional: Verlauf mitfüllen (macht es anschaulicher)
      history.unshift({
        time: nowTime(),
        pod,
        version: info.version || "–",
        uptime: prettyUptime(info.uptimeSeconds),
        latency: ms(latencyMs),
      });
      history = history.slice(0, 50);

      // Live-Update währenddessen
      renderBurst(counts);
      renderHistory();
    } catch {
      // ignorieren, wir machen weiter
    }

    // mini Pause, damit Router wirklich verteilt
    await new Promise((r) => setTimeout(r, 120));
  }

  renderBurst(counts);
  renderHistory();

  const podsFound = Object.keys(counts).length;

  if (podsFound >= 2) {
    setText(burstHint, `Fertig: ${podsFound} Pods gesehen (Load-Balancing sichtbar).`);
  } else if (podsFound === 1) {
    setText(
      burstHint,
      "Fertig: nur 1 Pod gesehen. Tipp: nochmal klicken oder kurz Seite neu laden."
    );
  } else {
    setText(burstHint, "Fertig: keine Daten bekommen. Check /api/info.");
  }

  btnBurst.disabled = false;
}

// NEU: Auto-Refresh (nur wenn Button existiert)
function toggleAuto() {
  if (!btnAuto) return;

  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
    btnAuto.textContent = "Auto-Refresh: Aus";
    return;
  }

  autoTimer = setInterval(loadOnce, 2000);
  btnAuto.textContent = "Auto-Refresh: An (2s)";
}

// NEU: Verlauf löschen
function clearHistory() {
  history = [];
  seenPods = new Set();
  renderHistory();
  if (vPodsSeen) setText(vPodsSeen, "0");
}

function init() {
  // nur wenn Elemente existieren
  if (btnRefresh) btnRefresh.addEventListener("click", loadOnce);
  if (btnBurst) btnBurst.addEventListener("click", () => runBurst(30));

  // NEU
  if (btnAuto) btnAuto.addEventListener("click", toggleAuto);
  if (btnClearHistory) btnClearHistory.addEventListener("click", clearHistory);

  renderHistory();
  loadOnce();
}

document.addEventListener("DOMContentLoaded", init);
