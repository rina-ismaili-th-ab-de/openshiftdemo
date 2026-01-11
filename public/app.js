const el = (id) => document.getElementById(id);

const dotStatus = el("dotStatus");
const txtStatus = el("txtStatus");
const dotExplain = el("dotExplain");
const txtExplain = el("txtExplain");

const vRoute = el("vRoute");
const vVersion = el("vVersion");
const vPod = el("vPod");
const vNs = el("vNs");
const vNode = el("vNode");
const vUptime = el("vUptime");
const vReq = el("vReq");
const vTime = el("vTime");
const vPodsSeen = el("vPodsSeen");
const vPodSwitch = el("vPodSwitch");

const btnRefresh = el("btnRefresh");

const LS_PODS = "osdemo_pods_seen";
const LS_COUNTS = "osdemo_pod_counts";
const LS_LAST = "osdemo_last_pod";

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setDot(dot, type) {
  if (!dot) return;
  dot.classList.remove("ok", "warn");
  dot.classList.add(type);
}

function setStatusOk(text) {
  setDot(dotStatus, "ok");
  if (txtStatus) txtStatus.textContent = text;
}

function setStatusWarn(text) {
  setDot(dotStatus, "warn");
  if (txtStatus) txtStatus.textContent = text;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchInfo() {
  // Cache-Buster, damit wirklich neu geholt wird
  const url = `/api/info?t=${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function updatePodsMemory(podName) {
  const pods = new Set(loadJson(LS_PODS, []));
  const counts = loadJson(LS_COUNTS, {});

  if (podName) {
    pods.add(podName);
    counts[podName] = (counts[podName] || 0) + 1;
  }

  saveJson(LS_PODS, Array.from(pods));
  saveJson(LS_COUNTS, counts);

  return { pods: Array.from(pods), counts };
}

function renderPodsSeen(counts) {
  const entries = Object.entries(counts || {});
  if (entries.length === 0) {
    if (vPodsSeen) vPodsSeen.textContent = "–";
    return;
  }

  // sort: häufigster zuerst
  entries.sort((a, b) => b[1] - a[1]);

  const lines = entries.map(([pod, c]) => `${pod} (${c}x)`);

  if (vPodsSeen) {
    vPodsSeen.innerHTML = `${entries.length} Pod(s):<br>${lines.join("<br>")}`;
  }
}

function renderPodSwitch(currentPod) {
  const last = localStorage.getItem(LS_LAST);

  if (!last) {
    if (vPodSwitch) vPodSwitch.textContent = "–";
    localStorage.setItem(LS_LAST, currentPod || "");
    return;
  }

  if (!currentPod) {
    if (vPodSwitch) vPodSwitch.textContent = "–";
    return;
  }

  if (last !== currentPod) {
    if (vPodSwitch) vPodSwitch.textContent = `Ja: ${last} → ${currentPod}`;
  } else {
    if (vPodSwitch) vPodSwitch.textContent = "Noch nicht (ein paar Mal neu laden)";
  }

  localStorage.setItem(LS_LAST, currentPod);
}

function prettyUptime(seconds) {
  if (seconds == null) return "–";
  const s = Number(seconds);
  if (Number.isNaN(s)) return "–";
  if (s < 60) return `${s} s`;

  const min = Math.floor(s / 60);
  const rest = s % 60;
  if (min < 60) return `${min} min ${rest} s`;

  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} h ${m} min`;
}

async function refreshOnce() {
  const info = await fetchInfo();

  if (vRoute) vRoute.textContent = window.location.href;
  if (vVersion) vVersion.textContent = info.version || "–";
  if (vPod) vPod.textContent = info.podName || "–";
  if (vNs) vNs.textContent = info.namespace || "–";
  if (vNode) vNode.textContent = info.nodeName || "–";
  if (vUptime) vUptime.textContent = prettyUptime(info.uptimeSeconds);
  if (vReq) vReq.textContent = info.requestCount != null ? String(info.requestCount) : "–";
  if (vTime) vTime.textContent = info.serverTime || "–";

  const mem = updatePodsMemory(info.podName);
  renderPodsSeen(mem.counts);
  renderPodSwitch(info.podName);

  setStatusOk("OK: App läuft (Live-Daten kommen aus einem Pod)");

  return mem;
}

async function runPodSampler() {
  // kleine “Beweis”-Routine: sammelt automatisch mehrere Antworten
  if (txtExplain) txtExplain.textContent = "Mini-Test läuft: Wir sammeln gerade mehrere Antworten, um alle Pods zu sehen…";
  setDot(dotExplain, "warn");

  let mem = { pods: [], counts: {} };

  // 12 Requests reichen meist für 2 Pods
  for (let i = 0; i < 12; i++) {
    try {
      mem = await refreshOnce();
    } catch {
      // ignorieren, wir versuchen weiter
    }
    await sleep(700);
  }

  const found = mem.pods.length;

  if (txtExplain) {
    if (found >= 2) {
      txtExplain.textContent = `Fertig: Wir haben ${found} Pods gesehen. Das zeigt, dass OpenShift die Aufrufe verteilt (Load-Balancing).`;
      setDot(dotExplain, "ok");
    } else {
      txtExplain.textContent = `Wir haben bisher nur ${found} Pod gesehen. Tipp: nochmal Neu laden oder kurz Deployment "Restart rollout" drücken.`;
      setDot(dotExplain, "warn");
    }
  }
}

async function init() {
  try {
    await refreshOnce();
  } catch {
    setStatusWarn("Fehler: Live-Daten konnten nicht geladen werden.");
  }

  if (btnRefresh) {
    btnRefresh.addEventListener("click", async () => {
      try {
        await refreshOnce();
      } catch {
        setStatusWarn("Fehler: Live-Daten konnten nicht geladen werden.");
      }
    });
  }

  // Startet automatisch, damit du dem Prof ohne Extra-Klick zeigen kannst, dass 2 Pods existieren
  runPodSampler();
}

init();

  