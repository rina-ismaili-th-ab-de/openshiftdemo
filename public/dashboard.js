// public/dashboard.js
// Gehört zu: public/dashboard.html
// Diese Seite testet:
// - /api/health  -> Server lebt (Liveness)
// - /api/ready   -> bereit für Traffic (Readiness, kann am Anfang 503 sein)
// - /api/info    -> Load-Balancing & Live Daten + Antwortzeit (Latency)

"use strict";

/* -------------------------------------------------------
   1) Kleine Helpers (sauber & einfach)
------------------------------------------------------- */

// Element per ID holen
const $ = (id) => document.getElementById(id);

// Text sicher setzen
function setText(el, text) {
  if (!el) return;
  el.textContent = text ?? "–";
}

// Status-Punkt setzen: ok | warn | err
function setDot(el, state) {
  if (!el) return;

  el.classList.remove("ok", "warn", "err");

  if (state === "ok") el.classList.add("ok");
  else if (state === "err") el.classList.add("err");
  else el.classList.add("warn");
}

// Uhrzeit anzeigen (für "Letzte Prüfung")
function nowTime() {
  return new Date().toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Millisekunden hübsch anzeigen
function ms(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "–";
  return `${Math.round(x)} ms`;
}

/* -------------------------------------------------------
   2) Elemente aus dashboard.html
------------------------------------------------------- */

// Health
const dotHealth = $("dotHealth");
const txtHealth = $("txtHealth");

// Ready
const dotReady = $("dotReady");
const txtReady = $("txtReady");

// Buttons
const btnHealth = $("btnHealth");
const btnReady = $("btnReady");
const btnBurst = $("btnBurst");
const btnClear = $("btnClear");
const btnAll = $("btnAll");

// Anzeige
const vCheckedAt = $("vCheckedAt");
const vHint = $("vHint");

const vPodsCount = $("vPodsCount");
const vVersions = $("vVersions");
const podBars = $("podBars");

const vLastLatency = $("vLastLatency");
const vAvgLatency = $("vAvgLatency");
const vMinLatency = $("vMinLatency");
const vMaxLatency = $("vMaxLatency");
const latencySpark = $("latencySpark");

/* -------------------------------------------------------
   3) State (Daten im Browser speichern)
------------------------------------------------------- */

let podCounts = {};          // podName -> wie oft geantwortet
let podsSeen = new Set();    // alle gesehenen Pods
let versionsSeen = new Set();// alle gesehenen Versionen
let latencies = [];          // letzte Latenzen (ms)

let burstRunning = false;    // verhindert doppeltes Starten

/* -------------------------------------------------------
   4) API Call ohne Cache (immer Live)
------------------------------------------------------- */

async function apiGet(path) {
  // Cache-Buster, damit es wirklich live ist
  const url = `${path}${path.includes("?") ? "&" : "?"}t=${Date.now()}_${Math.random()
    .toString(16)
    .slice(2)}`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  // Wir versuchen immer JSON zu lesen (auch bei 503)
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { ok: res.ok, status: res.status, data };
}

/* -------------------------------------------------------
   5) Health / Ready Checks
------------------------------------------------------- */

// Health = Prozess lebt
async function checkHealth() {
  setDot(dotHealth, "warn");
  setText(txtHealth, "Health: prüfe…");

  try {
    const { ok } = await apiGet("/api/health");

    if (ok) {
      setDot(dotHealth, "ok");
      setText(txtHealth, "Health: OK (Server läuft)");
    } else {
      setDot(dotHealth, "err");
      setText(txtHealth, "Health: Fehler (Server/Route prüfen)");
    }
  } catch {
    setDot(dotHealth, "err");
    setText(txtHealth, "Health: Fehler (Netzwerk/Route prüfen)");
  }

  setText(vCheckedAt, nowTime());
}

// Ready = OpenShift schickt nur dann Traffic, wenn ready=true
async function checkReady() {
  setDot(dotReady, "warn");
  setText(txtReady, "Ready: prüfe…");

  try {
    const { ok, status, data } = await apiGet("/api/ready");

    if (ok) {
      setDot(dotReady, "ok");
      setText(txtReady, "Ready: OK (bereit für Traffic)");
    } else if (status === 503) {
      // 503 ist bei READY_DELAY_SECONDS völlig normal
      const left =
        typeof data?.secondsLeft === "number" ? `${data.secondsLeft}s` : "–";

      setDot(dotReady, "warn");
      setText(txtReady, `Ready: noch nicht bereit (Rest: ${left})`);
    } else {
      setDot(dotReady, "err");
      setText(txtReady, "Ready: Fehler (API nicht erreichbar)");
    }
  } catch {
    setDot(dotReady, "err");
    setText(txtReady, "Ready: Fehler (Netzwerk/Route prüfen)");
  }

  setText(vCheckedAt, nowTime());
}

/* -------------------------------------------------------
   6) Diagramm: Antworten pro Pod
------------------------------------------------------- */

function renderBars() {
  if (!podBars) return;

  const entries = Object.entries(podCounts);
  if (entries.length === 0) {
    podBars.textContent = "–";
    return;
  }

  // häufigster Pod zuerst
  entries.sort((a, b) => b[1] - a[1]);

  const max = Math.max(...entries.map((e) => e[1]));

  podBars.innerHTML = entries
    .map(([pod, count]) => {
      const pct = max > 0 ? Math.round((count / max) * 100) : 0;

      return `
        <div class="barRow">
          <div class="barLabel">${pod}</div>
          <div class="barOuter">
            <div class="barInner" style="width:${pct}%"></div>
          </div>
          <div class="barCount">${count}x</div>
        </div>
      `;
    })
    .join("");
}

/* -------------------------------------------------------
   7) Diagramm: Antwortzeiten (Latency)
------------------------------------------------------- */

function renderLatency() {
  if (!latencySpark) return;

  if (latencies.length === 0) {
    latencySpark.textContent = "–";
    setText(vLastLatency, "–");
    setText(vAvgLatency, "–");
    setText(vMinLatency, "–");
    setText(vMaxLatency, "–");
    return;
  }

  const arr = latencies.slice(0, 30);
  const last = arr[0];

  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;

  setText(vLastLatency, ms(last));
  setText(vAvgLatency, ms(avg));
  setText(vMinLatency, ms(min));
  setText(vMaxLatency, ms(max));

  const safeMax = Math.max(max, 1);

  latencySpark.innerHTML = arr
    .slice()
    .reverse()
    .map((v) => {
      const h = Math.max(6, Math.round((v / safeMax) * 100));
      return `<span class="sparkBar" style="height:${h}%"></span>`;
    })
    .join("");
}

/* -------------------------------------------------------
   8) Burst Test: /api/info (Load-Balancing Proof)
------------------------------------------------------- */

async function runBurst(times = 30) {
  if (!btnBurst || burstRunning) return;

  burstRunning = true;
  btnBurst.disabled = true;
  setText(vHint, `Burst läuft… (${times} Requests)`);

  for (let i = 1; i <= times; i++) {
    const t0 = performance.now();

    try {
      const { ok, data } = await apiGet("/api/info");
      const t1 = performance.now();

      if (ok && data) {
        const pod = data.podName || "unknown";
        const ver = data.version || "–";

        podsSeen.add(pod);
        versionsSeen.add(ver);

        podCounts[pod] = (podCounts[pod] || 0) + 1;

        // Latenzen speichern (max 60)
        latencies.unshift(t1 - t0);
        latencies = latencies.slice(0, 60);

        setText(vPodsCount, String(podsSeen.size));
        setText(vVersions, Array.from(versionsSeen).join(", "));

        renderBars();
        renderLatency();
      }
    } catch {
      // wenn ein Request mal failt -> wir machen trotzdem weiter
    }

    // kleine Pause, damit man Verteilung besser sieht
    await new Promise((r) => setTimeout(r, 110));
  }

  setText(
    vHint,
    "Fertig. Wenn du nur 1 Pod siehst: Replicas auf 2 stellen und nochmal starten."
  );

  btnBurst.disabled = false;
  burstRunning = false;
}

/* -------------------------------------------------------
   9) Reset
------------------------------------------------------- */

function resetAll() {
  podCounts = {};
  podsSeen = new Set();
  versionsSeen = new Set();
  latencies = [];

  setText(vPodsCount, "–");
  setText(vVersions, "–");

  renderBars();
  renderLatency();

  setText(vHint, "OpenShift schickt Traffic nur an Pods, die ready sind.");
  setText(vCheckedAt, "–");

  setDot(dotHealth, "warn");
  setText(txtHealth, "Health: noch nicht geprüft");

  setDot(dotReady, "warn");
  setText(txtReady, "Ready: noch nicht geprüft");
}

/* -------------------------------------------------------
   10) Start
------------------------------------------------------- */

function init() {
  if (btnHealth) btnHealth.addEventListener("click", checkHealth);
  if (btnReady) btnReady.addEventListener("click", checkReady);
  if (btnBurst) btnBurst.addEventListener("click", () => runBurst(30));
  if (btnClear) btnClear.addEventListener("click", resetAll);

  if (btnAll) {
    btnAll.addEventListener("click", async () => {
      await checkHealth();
      await checkReady();
      await runBurst(30);
    });
  }

  resetAll();
}

document.addEventListener("DOMContentLoaded", init);
