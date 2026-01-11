// public/app.js
// Ziel: Sehr einfache, studentische Texte + Live-Daten + Load-Balancing Test (30 Requests)

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

async function fetchInfo(cacheBuster = "") {
  const url = `/api/info?t=${Date.now()}_${Math.random().toString(16).slice(2)}${cacheBuster}`;
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
  vBurst.innerHTML = entries
    .map(([pod, c]) => `${pod} (${c}x)`)
    .join("<br>");
}

async function loadOnce() {
  try {
    const info = await fetchInfo();

    // Route-Link
    if (vRoute) setText(vRoute, window.location.origin);

    setText(vVersion, info.version || "–");
    setText(vPod, info.podName || "–");
    setText(vNs, info.namespace || "–");
    setText(vNode, info.nodeName || "–");
    setText(vUptime, prettyUptime(info.uptimeSeconds));
    setText(vReq, info.requestCount != null ? String(info.requestCount) : "–");
    setText(vTime, info.serverTime || "–");

    setDot(dotStatus, "ok");
    setText(txtStatus, "OK: Live-Daten kommen aus einem Pod");

    // Erklärung (studentisch, kurz)
    setDot(dotExplain, "ok");
    setText(
      txtExplain,
      "Wenn Pod + Namespace + Uptime sichtbar sind, läuft die App wirklich als Container in OpenShift. Bei 2 Pods sollte sich der Pod-Name manchmal ändern."
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
  let ok = 0;

  for (let i = 1; i <= times; i++) {
    try {
      const info = await fetchInfo(`_${i}`);
      const pod = info.podName || "unknown";
      counts[pod] = (counts[pod] || 0) + 1;
      ok += 1;

      // Live-Update währenddessen
      renderBurst(counts);
    } catch {
      // ignorieren, wir machen weiter
    }

    // mini Pause, damit Router wirklich verteilt
    await new Promise((r) => setTimeout(r, 120));
  }

  renderBurst(counts);

  const podsFound = Object.keys(counts).length;

  if (podsFound >= 2) {
    setText(burstHint, `Fertig: ${podsFound} Pods gesehen (Load-Balancing sichtbar).`);
  } else if (podsFound === 1) {
    setText(burstHint, "Fertig: nur 1 Pod gesehen. Tipp: nochmal klicken oder kurz Seite neu laden.");
  } else {
    setText(burstHint, "Fertig: keine Daten bekommen. Check /api/info.");
  }

  btnBurst.disabled = false;
}

function init() {
  // nur wenn Elemente existieren
  if (btnRefresh) btnRefresh.addEventListener("click", loadOnce);
  if (btnBurst) btnBurst.addEventListener("click", () => runBurst(30));

  loadOnce();
}

document.addEventListener("DOMContentLoaded", init);
