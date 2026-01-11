// public/app.js

function $(id) {
  return document.getElementById(id);
}

function setDot(dotEl, state) {
  if (!dotEl) return;
  dotEl.classList.remove("ok", "warn", "err");
  // wir nutzen die vorhandene "warn" Klasse als Standard
  if (state === "ok") dotEl.classList.add("ok");
  else if (state === "err") dotEl.classList.add("err");
  else dotEl.classList.add("warn");
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text ?? "–";
}

function formatUptime(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return "–";

  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);

  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function pick(obj, keys, fallback = "–") {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") {
      return obj[k];
    }
  }
  return fallback;
}

async function fetchInfo(extraQuery = "") {
  // cache:no-store, damit wirklich neu geholt wird
  const url = `/api/info${extraQuery ? `?${extraQuery}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function updateRoute() {
  const route = window.location.origin;
  setText($("vRoute"), route);
}

function updateUIFromInfo(info) {
  const version = pick(info, ["version", "appVersion", "APP_VERSION"]);
  const pod = pick(info, ["podName", "pod", "instance", "hostname"]);
  const ns = pick(info, ["namespace", "ns", "project"]);
  const node = pick(info, ["nodeName", "node"]);
  const serverTime = pick(info, ["serverTime", "time", "now"]);
  const uptime = pick(info, ["uptimeSeconds", "uptime", "uptime_s"]);
  const req = pick(info, ["requestCount", "requests", "count"]);

  setText($("vVersion"), String(version));
  setText($("vPod"), String(pod));
  setText($("vNs"), String(ns));
  setText($("vNode"), String(node));
  setText($("vTime"), String(serverTime));

  // Uptime hübsch
  const niceUptime = (uptime === "–") ? "–" : formatUptime(uptime);
  setText($("vUptime"), niceUptime);

  // Requests
  setText($("vReq"), String(req));

  // Status oben
  setDot($("dotStatus"), "ok");
  setText($("txtStatus"), "OK: App läuft (Live-Daten kommen aus einem Pod)");

  // Erklärung Badge
  const explain =
    `Kurz gesagt: Wenn hier ein Pod-Name steht, kommt die Antwort wirklich aus dem Container.\n` +
    `Wenn du Replicas auf 2 stellst und mehrfach neu lädst oder „Pods sammeln“ klickst, solltest du verschiedene Pod-Namen sehen.`;

  setDot($("dotExplain"), "ok");
  setText($("txtExplain"), explain);
}

async function loadOnce() {
  updateRoute();

  try {
    const info = await fetchInfo(`t=${Date.now()}`);
    updateUIFromInfo(info);
  } catch (e) {
    setDot($("dotStatus"), "err");
    setText($("txtStatus"), "Hmm… ich konnte gerade keine Live-Daten laden. Check mal, ob /api/info erreichbar ist.");
    setDot($("dotExplain"), "warn");
    setText($("txtExplain"), "Wenn das öfter passiert: In OpenShift in die Pod-Logs schauen (Backend) und Route testen.");
  }
}

async function samplePods(times = 20) {
  const btn = $("btnSamplePods");
  const dot = $("dotSample");
  const txt = $("txtSample");

  const outCount = $("vPodCount");
  const outLast = $("vPodLast");
  const outList = $("vPodList");

  if (btn) btn.disabled = true;
  setDot(dot, "warn");
  setText(txt, `Sammle gerade Antworten… (0/${times})`);

  const pods = new Set();
  let lastPod = "–";

  for (let i = 1; i <= times; i++) {
    try {
      const info = await fetchInfo(`sample=${Date.now()}_${i}`);
      const pod = pick(info, ["podName", "pod", "instance", "hostname"], "–");
      lastPod = String(pod);

      if (lastPod !== "–") pods.add(lastPod);

      // Live UI
      setText(outCount, `${pods.size}`);
      setText(outLast, lastPod);
      setText(outList, pods.size ? Array.from(pods).sort().join("\n") : "–");
      setText(txt, `Sammle gerade Antworten… (${i}/${times})`);
    } catch (e) {
      // wenn 1 Request failt, machen wir trotzdem weiter
      setText(txt, `Sammle gerade Antworten… (${i}/${times}) (ein Request hat nicht geklappt)`);
    }
  }

  if (pods.size >= 2) {
    setDot(dot, "ok");
    setText(txt, `Nice! Ich habe ${pods.size} verschiedene Pods gesehen. (Load Balancing klappt)`);
  } else if (pods.size === 1) {
    setDot(dot, "warn");
    setText(txt, "Ich sehe nur 1 Pod. Check in OpenShift: Replicas wirklich auf 2+ gesetzt?");
  } else {
    setDot(dot, "err");
    setText(txt, "Ich konnte keinen Pod-Namen einsammeln. Check /api/info und Pod-Logs.");
  }

  if (btn) btn.disabled = false;
}

function wireButtons() {
  const btnRefresh = $("btnRefresh");
  if (btnRefresh) btnRefresh.addEventListener("click", loadOnce);

  const btnSample = $("btnSamplePods");
  if (btnSample) btnSample.addEventListener("click", () => samplePods(20));
}

document.addEventListener("DOMContentLoaded", async () => {
  wireButtons();
  await loadOnce();

  // optional: alle 10 Sekunden aktualisieren (damit es „live“ wirkt)
  setInterval(() => {
    loadOnce().catch(() => {});
  }, 10000);
});

  