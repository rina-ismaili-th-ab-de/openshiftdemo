// public/app.js

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

// ======= NEU: Readiness-Box (oben) =======
const dotReady = $("dotReady");
const txtReady = $("txtReady");
const vReadyAt = $("vReadyAt");
const vReadyLeft = $("vReadyLeft");

// ======= NEU: Stabilitäts-Buttons (unten) =======
const btnHealth = $("btnHealth");
const btnReadyCheck = $("btnReadyCheck");
const btnCrash = $("btnCrash");
const vHealth = $("vHealth");
const vReadyCheck = $("vReadyCheck");
const vCrash = $("vCrash");

// Zustand
let seenPods = new Set();
let podCounts = {}; // NEU: zählt, wie oft welcher Pod geantwortet hat
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

// ======= NEU: Helper für /api/health und /api/ready =======
async function fetchJson(url, options) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...(options && options.headers ? options.headers : {}),
    },
    ...options,
  });

  // auch bei 503 wollen wir JSON lesen (ready kann 503 sein)
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { ok: res.ok, status: res.status, data };
}

// ======= NEU: Readiness oben live anzeigen =======
async function updateReadinessBox() {
  // nur wenn die Elemente im HTML existieren
  if (!dotReady && !txtReady && !vReadyAt && !vReadyLeft) return;

  const { ok, status, data } = await fetchJson("/api/ready?t=" + Date.now());

  if (ok) {
    setDot(dotReady, "ok");
    setText(txtReady, "READY: Dieser Pod ist bereit für Traffic");
    setText(vReadyAt, (data && data.readyAt) ? data.readyAt : "–");
    setText(vReadyLeft, "0 s");
    return;
  }

  // not ready (z.B. 503)
  setDot(dotReady, "warn");
  const left = (data && typeof data.secondsLeft === "number") ? `${data.secondsLeft} s` : "–";
  setText(txtReady, `NOCH NICHT READY (HTTP ${status})`);
  setText(vReadyAt, (data && data.readyAt) ? data.readyAt : "–");
  setText(vReadyLeft, left);
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

// NEU: Pods gesehen als Liste + Zähler anzeigen
function renderPodsSeen() {
  if (!vPodsSeen) return;

  const entries = Object.entries(podCounts);

  // wenn noch nichts da ist
  if (entries.length === 0) {
    vPodsSeen.textContent = `${seenPods.size}`;
    return;
  }

  // nach Häufigkeit sortieren
  entries.sort((a, b) => b[1] - a[1]);

  // Anzeige: Anzahl + Liste
  vPodsSeen.innerHTML =
    `${seenPods.size} Pods<br>` + entries.map(([pod, c]) => `${pod} (${c}x)`).join("<br>");
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

  // vorher stand hier nur die Zahl -> jetzt Liste + Zähler
  renderPodsSeen();
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

    // NEU: Pods merken + zählen
    const pod = info.podName || "unknown";
    seenPods.add(pod);
    podCounts[pod] = (podCounts[pod] || 0) + 1;
    renderPodsSeen();

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

    // ======= NEU: Readiness-Box updaten =======
    await updateReadinessBox();
  } catch (e) {
    setDot(dotStatus, "err");
    setText(txtStatus, "Fehler: Ich konnte /api/info gerade nicht laden.");

    setDot(dotExplain, "warn");
    setText(
      txtExplain,
      "Tipp: In OpenShift bei Pods/Logs schauen, ob die App läuft. Danach Seite neu laden."
    );

    // auch hier versuchen wir Readiness zu updaten (falls nur info down ist)
    try {
      await updateReadinessBox();
    } catch {}
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

      // NEU: Pods auch hier merken + zählen
      seenPods.add(pod);
      podCounts[pod] = (podCounts[pod] || 0) + 1;
      renderPodsSeen();

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
  podCounts = {}; // NEU
  renderHistory();
  renderPodsSeen(); // NEU
  if (vPodsSeen) setText(vPodsSeen, "0");
}

// ======= NEU: Button-Aktionen (Health / Ready / Crash) =======
async function doHealth() {
  if (!vHealth) return;

  setText(vHealth, "Lade…");
  const { ok, status, data } = await fetchJson("/api/health?t=" + Date.now());
  if (ok) {
    setText(vHealth, `OK (${status}) | ${data && data.serverTime ? data.serverTime : ""}`.trim());
  } else {
    setText(vHealth, `Fehler (HTTP ${status})`);
  }
}

async function doReadyCheck() {
  if (!vReadyCheck) return;

  setText(vReadyCheck, "Lade…");
  const { ok, status, data } = await fetchJson("/api/ready?t=" + Date.now());

  if (ok) {
    setText(vReadyCheck, `READY (${status}) | readyAt: ${data && data.readyAt ? data.readyAt : "–"}`);
  } else {
    const left = (data && typeof data.secondsLeft === "number") ? `${data.secondsLeft}s` : "–";
    setText(vReadyCheck, `NOT READY (${status}) | noch: ${left}`);
  }

  // oben auch mit updaten, damit alles zusammenpasst
  try {
    await updateReadinessBox();
  } catch {}
}

async function doCrash() {
  if (!vCrash) return;

  setText(vCrash, "Crash wird ausgelöst…");
  const { ok, status, data } = await fetchJson("/api/crash?t=" + Date.now(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "demo" }),
  });

  if (ok) {
    setText(
      vCrash,
      `OK (${status}) | ${data && data.message ? data.message : "Crash"}`
    );
  } else {
    setText(
      vCrash,
      `Fehler (HTTP ${status}) | ${data && data.message ? data.message : "Crash nicht erlaubt"}`
    );
  }

  // Kurz warten und dann neu laden -> dann sieht man oft neuen Pod + kleine Uptime
  setTimeout(() => {
    loadOnce();
    try { updateReadinessBox(); } catch {}
  }, 2500);
}

function init() {
  // nur wenn Elemente existieren
  if (btnRefresh) btnRefresh.addEventListener("click", loadOnce);
  if (btnBurst) btnBurst.addEventListener("click", () => runBurst(30));

  // NEU
  if (btnAuto) btnAuto.addEventListener("click", toggleAuto);
  if (btnClearHistory) btnClearHistory.addEventListener("click", clearHistory);

  // ======= NEU: Buttons =======
  if (btnHealth) btnHealth.addEventListener("click", doHealth);
  if (btnReadyCheck) btnReadyCheck.addEventListener("click", doReadyCheck);
  if (btnCrash) btnCrash.addEventListener("click", doCrash);

  renderHistory();
  loadOnce();
}

document.addEventListener("DOMContentLoaded", init);
