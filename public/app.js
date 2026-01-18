// public/app.js
// Startseite: lädt Live-Daten aus OpenShift und zeigt sie an.
// Genutzte Endpunkte:
//   GET  /api/info    -> Live Cluster Daten
//   GET  /api/ready   -> Readiness (kann am Anfang 503 sein = normal bei Delay)
//   GET  /api/health  -> Health Check
//   POST /api/crash   -> Crash Demo (nur wenn ALLOW_CRASH=true)

"use strict";

// Kurzform: Element per ID holen
const $ = (id) => document.getElementById(id);

// --------------------
// Elemente aus index.html
// --------------------

// Live Daten
const dotStatus = $("dotStatus");
const txtStatus = $("txtStatus");

const vRoute = $("vRoute");
const vVersion = $("vVersion");
const vPod = $("vPod");
const vNs = $("vNs");
const vNode = $("vNode");
const vUptime = $("vUptime");
const vReq = $("vReq");
const vTime = $("vTime");

const btnRefresh = $("btnRefresh");

// Readiness Box
const dotReady = $("dotReady");
const txtReady = $("txtReady");
const vReadyAt = $("vReadyAt");
const vReadyLeft = $("vReadyLeft");
const vPodsSeen = $("vPodsSeen");
const vLatency = $("vLatency");

// Load Balancing
const btnBurst = $("btnBurst");
const vBurst = $("vBurst");
const burstHint = $("burstHint");

// Verlauf
const historyList = $("historyList");
const btnAuto = $("btnAuto");
const btnClearHistory = $("btnClearHistory");

// Stabilität (Tests)
const btnHealth = $("btnHealth");
const btnReadyCheck = $("btnReadyCheck");
const btnCrash = $("btnCrash");

const vHealth = $("vHealth");
const vReadyCheck = $("vReadyCheck");
const vCrash = $("vCrash");

// Erklärung
const dotExplain = $("dotExplain");
const txtExplain = $("txtExplain");

// --------------------
// State (Speicher im Browser)
// --------------------
let seenPods = new Set();
let history = [];
let autoTimer = null;
let isLoading = false;

// --------------------
// Mini-Helper
// --------------------
function setText(el, text) {
  if (!el) return;
  el.textContent = text ?? "–";
}

function setDot(el, mode) {
  if (!el) return;
  el.classList.remove("ok", "warn", "err");

  if (mode === "ok") el.classList.add("ok");
  else if (mode === "err") el.classList.add("err");
  else el.classList.add("warn");
}

function nowTime() {
  return new Date().toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function ms(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "–";
  return `${Math.round(x)} ms`;
}

function prettyUptime(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return "–";

  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = Math.floor(s % 60);

  if (h > 0) return `${h}h ${m}m ${r}s`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

// --------------------
// API Call (nie cachen -> Live Daten bleiben live)
// --------------------
async function apiJSON(path, options = {}) {
  const url =
    `${path}${path.includes("?") ? "&" : "?"}` +
    `t=${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...(options.headers || {}),
    },
    ...options,
  });

  // Wir versuchen immer JSON zu lesen (auch bei 503)
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  // Wenn nicht OK -> Fehler werfen, aber mit Status + Daten
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// Speziell für /api/info: wir messen auch die Antwortzeit
async function getInfoWithLatency() {
  const t0 = performance.now();
  const info = await apiJSON("/api/info");
  const t1 = performance.now();
  return { info, latencyMs: t1 - t0 };
}

// --------------------
// Verlauf anzeigen (robust als Text -> passt perfekt zu deinem CSS)
// --------------------
function renderHistory() {
  if (!historyList) return;

  if (history.length === 0) {
    historyList.textContent = "Noch kein Verlauf. Klick „Neu laden“ oder starte den Burst.";
    return;
  }

  const lines = history.slice(0, 15).map((h) => {
    return `${h.time} | Pod: ${h.pod} | Version: ${h.version} | Uptime: ${h.uptime} | ${h.latency}`;
  });

  historyList.textContent = lines.join("\n");
}

function addHistory(entry) {
  history.unshift(entry);
  history = history.slice(0, 50);
  renderHistory();
}

// --------------------
// 1) Live Daten laden (/api/info)
// --------------------
async function loadInfo() {
  const { info, latencyMs } = await getInfoWithLatency();

  // Route = aktuelle URL
  setText(vRoute, window.location.origin);

  // Live Daten füllen
  setText(vVersion, info?.version || "–");
  setText(vPod, info?.podName || "–");
  setText(vNs, info?.namespace || "–");
  setText(vNode, info?.nodeName || "–");
  setText(vUptime, prettyUptime(info?.uptimeSeconds));
  setText(vReq, info?.requestCount != null ? String(info.requestCount) : "–");
  setText(vTime, info?.serverTime || "–");

  // Antwortzeit anzeigen
  setText(vLatency, ms(latencyMs));

  // Pods merken (damit man Load-Balancing “spürt”)
  const pod = info?.podName || "unknown";
  seenPods.add(pod);
  setText(vPodsSeen, String(seenPods.size));

  // Status + Erklärung
  setDot(dotStatus, "ok");
  setText(txtStatus, "OK: Live-Daten erfolgreich geladen");

  setDot(dotExplain, "ok");
  setText(
    txtExplain,
    `Antwort kam von Pod: ${pod}. Wenn du 2 Replicas aktivierst, sollte sich der Pod-Name manchmal ändern.`
  );

  // Verlauf speichern
  addHistory({
    time: nowTime(),
    pod,
    version: info?.version || "–",
    uptime: prettyUptime(info?.uptimeSeconds),
    latency: ms(latencyMs),
  });
}

// --------------------
// 2) Readiness laden (/api/ready)
// --------------------
async function loadReadiness() {
  setDot(dotReady, "warn");
  setText(txtReady, "Readiness wird geladen…");

  try {
    const ready = await apiJSON("/api/ready");

    setDot(dotReady, "ok");
    setText(txtReady, "READY: Pod ist bereit für Traffic");
    setText(vReadyAt, ready?.readyAt || "–");
    setText(vReadyLeft, "0 s");
  } catch (e) {
    // 503 ist normal, wenn du einen Delay eingestellt hast
    if (e?.status === 503) {
      const left = e?.data?.secondsLeft != null ? `${e.data.secondsLeft} s` : "–";

      setDot(dotReady, "warn");
      setText(txtReady, "NOCH NICHT READY (normal bei Delay)");
      setText(vReadyAt, e?.data?.readyAt || "–");
      setText(vReadyLeft, left);
      return;
    }

    setDot(dotReady, "err");
    setText(txtReady, "Readiness Fehler (API nicht erreichbar)");
    setText(vReadyAt, "–");
    setText(vReadyLeft, "–");
  }
}

// --------------------
// Alles einmal laden (Neu laden Button)
// --------------------
async function loadOnce() {
  // Schutz: nicht doppelt laden, wenn Auto-Refresh läuft
  if (isLoading) return;
  isLoading = true;

  setDot(dotStatus, "warn");
  setText(txtStatus, "Lade Live Daten…");

  try {
    await loadInfo();
    await loadReadiness();
  } catch {
    setDot(dotStatus, "err");
    setText(txtStatus, "Fehler: /api/info nicht erreichbar (Route/Pod prüfen)");

    setDot(dotExplain, "warn");
    setText(txtExplain, "Tipp: OpenShift → Pods/Logs checken und dann Neu laden.");

    // Readiness trotzdem probieren (falls nur /api/info down ist)
    try {
      await loadReadiness();
    } catch {}
  } finally {
    isLoading = false;
  }
}

// --------------------
// 3) Burst Test (Load Balancing)
// --------------------
async function runBurst(times = 30) {
  if (!btnBurst || !vBurst) return;

  btnBurst.disabled = true;
  setText(burstHint, `Läuft… (${times} Requests)`);

  const counts = {}; // pod -> count

  for (let i = 1; i <= times; i++) {
    try {
      const info = await apiJSON("/api/info");
      const pod = info?.podName || "unknown";

      counts[pod] = (counts[pod] || 0) + 1;

      // Anzeige live aktualisieren
      vBurst.innerHTML = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([p, c]) => `${p} (${c}x)`)
        .join("<br>");

      // Pods Seen hochzählen
      seenPods.add(pod);
      setText(vPodsSeen, String(seenPods.size));
    } catch {
      // ignorieren und weiter
    }

    // Pause für sichtbares Verteilen
    await new Promise((r) => setTimeout(r, 120));
  }

  const podsFound = Object.keys(counts).length;

  if (podsFound >= 2) {
    setText(burstHint, `Fertig: ${podsFound} Pods gesehen (Load-Balancing sichtbar).`);
  } else if (podsFound === 1) {
    setText(
      burstHint,
      "Fertig: nur 1 Pod gesehen. Tipp: Replicas auf 2 stellen und nochmal starten."
    );
  } else {
    setText(burstHint, "Fertig: keine Daten bekommen. Prüfe /api/info.");
  }

  btnBurst.disabled = false;
}

// --------------------
// 4) Auto Refresh + Verlauf löschen
// --------------------
function toggleAuto() {
  if (!btnAuto) return;

  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
    btnAuto.textContent = "Auto Refresh: Aus";
    return;
  }

  btnAuto.textContent = "Auto Refresh: An";
  autoTimer = setInterval(loadOnce, 5000); // alle 5 Sekunden
}

function clearHistory() {
  history = [];
  seenPods = new Set();

  setText(vPodsSeen, "0");
  setText(vBurst, "–");
  setText(burstHint, "Wenn nur 1 Pod erscheint: nochmal klicken.");

  renderHistory();
}

// --------------------
// 5) Stabilität Buttons
// --------------------
async function doHealth() {
  if (!vHealth) return;

  setText(vHealth, "prüfe…");

  try {
    const health = await apiJSON("/api/health");
    setText(vHealth, `OK · ${health?.serverTime || ""}`.trim());
  } catch (e) {
    setText(vHealth, `Fehler (HTTP ${e?.status || "?"})`);
  }
}

async function doReadyCheck() {
  if (!vReadyCheck) return;

  setText(vReadyCheck, "prüfe…");

  try {
    const ready = await apiJSON("/api/ready");
    setText(vReadyCheck, `READY · ${ready?.readyAt || "–"}`);
  } catch (e) {
    if (e?.status === 503) {
      const left = e?.data?.secondsLeft != null ? `${e.data.secondsLeft}s` : "–";
      setText(vReadyCheck, `NOT READY · noch: ${left}`);
    } else {
      setText(vReadyCheck, `Fehler (HTTP ${e?.status || "?"})`);
    }
  }

  // oben aktualisieren, damit alles zusammen passt
  loadReadiness();
}

async function doCrash() {
  if (!vCrash) return;

  setText(vCrash, "sende…");

  try {
    const data = await apiJSON("/api/crash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "demo" }),
    });

    setText(vCrash, data?.message || "Crash ausgelöst");
  } catch (e) {
    const msg = e?.data?.message || "Crash nicht erlaubt (ALLOW_CRASH muss true sein)";
    setText(vCrash, `Fehler: ${msg}`);
  }

  // nach kurzer Zeit neu laden -> dann sieht man neue Uptime / neuen Pod
  setTimeout(loadOnce, 2500);
}

// --------------------
// Start
// --------------------
function init() {
  // Buttons verbinden
  if (btnRefresh) btnRefresh.addEventListener("click", loadOnce);
  if (btnBurst) btnBurst.addEventListener("click", () => runBurst(30));

  if (btnAuto) btnAuto.addEventListener("click", toggleAuto);
  if (btnClearHistory) btnClearHistory.addEventListener("click", clearHistory);

  if (btnHealth) btnHealth.addEventListener("click", doHealth);
  if (btnReadyCheck) btnReadyCheck.addEventListener("click", doReadyCheck);
  if (btnCrash) btnCrash.addEventListener("click", doCrash);

  // Startwerte
  setText(vBurst, "–");
  renderHistory();

  // sofort einmal laden
  loadOnce();
}

document.addEventListener("DOMContentLoaded", init);
