// public/tests.js
const $ = (id) => document.getElementById(id);

const dotHealth = $("dotHealth");
const txtHealth = $("txtHealth");
const dotReady = $("dotReady");
const txtReady = $("txtReady");

const btnHealth = $("btnHealth");
const btnReady = $("btnReady");
const btnBurst = $("btnBurst");
const btnClear = $("btnClear");
const btnAll = $("btnAll");

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

let podCounts = {};
let podsSeen = new Set();
let versionsSeen = new Set();
let latencies = [];

function nowTime() {
  return new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

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

function ms(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "–";
  return `${Math.round(x)} ms`;
}

async function fetchJSON(path) {
  const url = `${path}?t=${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function checkHealth() {
  try {
    setDot(dotHealth, "warn");
    setText(txtHealth, "Health: prüfe…");
    await fetchJSON("/api/health");
    setDot(dotHealth, "ok");
    setText(txtHealth, "Health: OK (Server läuft)");
    setText(vCheckedAt, nowTime());
  } catch {
    setDot(dotHealth, "err");
    setText(txtHealth, "Health: Fehler (Server/Route prüfen)");
    setText(vCheckedAt, nowTime());
  }
}

async function checkReady() {
  try {
    setDot(dotReady, "warn");
    setText(txtReady, "Ready: prüfe…");
    await fetchJSON("/api/ready");
    setDot(dotReady, "ok");
    setText(txtReady, "Ready: OK (bereit für Traffic)");
    setText(vCheckedAt, nowTime());
  } catch {
    setDot(dotReady, "err");
    setText(txtReady, "Ready: Fehler (App nicht bereit)");
    setText(vCheckedAt, nowTime());
  }
}

function renderBars() {
  if (!podBars) return;

  const entries = Object.entries(podCounts);
  if (entries.length === 0) {
    podBars.textContent = "–";
    return;
  }

  entries.sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map((e) => e[1]));

  podBars.innerHTML = entries
    .map(([pod, c]) => {
      const pct = max > 0 ? Math.round((c / max) * 100) : 0;
      return `
        <div class="barRow">
          <div class="barLabel">${pod}</div>
          <div class="barOuter"><div class="barInner" style="width:${pct}%"></div></div>
          <div class="barCount">${c}x</div>
        </div>
      `;
    })
    .join("");
}

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

  const last = latencies[0];
  const arr = latencies.slice(0, 30);
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

async function runBurst(times = 30) {
  if (!btnBurst) return;

  btnBurst.disabled = true;
  setText(vHint, `Burst läuft… (${times} Requests)`);

  for (let i = 1; i <= times; i++) {
    try {
      const t0 = performance.now();
      const info = await fetchJSON("/api/info");
      const t1 = performance.now();

      const pod = info.podName || "unknown";
      const ver = info.version || "–";

      podsSeen.add(pod);
      versionsSeen.add(ver);

      podCounts[pod] = (podCounts[pod] || 0) + 1;

      const latency = t1 - t0;
      latencies.unshift(latency);
      latencies = latencies.slice(0, 60);

      setText(vPodsCount, `${podsSeen.size}`);
      setText(vVersions, Array.from(versionsSeen).join(", "));

      renderBars();
      renderLatency();
    } catch {
      // weiter machen
    }

    await new Promise((r) => setTimeout(r, 110));
  }

  setText(vHint, "Fertig. Wenn du nur 1 Pod siehst: Replicas auf 2 stellen und nochmal starten.");
  btnBurst.disabled = false;
}

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
}

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
