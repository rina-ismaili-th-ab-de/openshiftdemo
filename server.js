const express = require("express");
const path = require("path");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

const startedAt = new Date();
let infoHits = 0;

// Optional: Readiness-Delay (z. B. 10 Sekunden), um Readiness zu demonstrieren
const READY_DELAY_SECONDS = Number(process.env.READY_DELAY_SECONDS || 0);
const readyAt = new Date(startedAt.getTime() + Math.max(0, READY_DELAY_SECONDS) * 1000);

function isoNow() {
  return new Date().toISOString();
}

function setNoCache(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Connection", "close");
}

function isReady() {
  return Date.now() >= readyAt.getTime();
}

// A) Health (Liveness) Demo
// Soll immer "OK" sein (wenn der Prozess lebt)
app.get("/api/health", (req, res) => {
  setNoCache(res);
  res.status(200).json({
    ok: true,
    status: "healthy",
    serverTime: isoNow(),
  });
});

// A) Readiness Demo (kann am Anfang kurz 503 liefern, wenn READY_DELAY_SECONDS gesetzt ist)
app.get("/api/ready", (req, res) => {
  setNoCache(res);

  if (isReady()) {
    return res.status(200).json({
      ok: true,
      status: "ready",
      readyAt: readyAt.toISOString(),
      serverTime: isoNow(),
    });
  }

  const secondsLeft = Math.ceil((readyAt.getTime() - Date.now()) / 1000);
  return res.status(503).json({
    ok: false,
    status: "not-ready",
    readyAt: readyAt.toISOString(),
    secondsLeft,
    serverTime: isoNow(),
  });
});

// Live-Infos (für deine Webseite)
app.get("/api/info", (req, res) => {
  infoHits += 1;
  setNoCache(res);

  res.status(200).json({
    version: process.env.APP_VERSION || "v1",

    // "Wer hat geantwortet?"
    podName: process.env.POD_NAME || os.hostname(),
    namespace: process.env.POD_NAMESPACE || "unknown",
    nodeName: process.env.NODE_NAME || "unknown",

    // Timing/Proof
    serverTime: isoNow(),
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    requestCount: infoHits,

    // Readiness Proof
    ready: isReady(),
    readyAt: readyAt.toISOString(),
    readyDelaySeconds: Math.max(0, READY_DELAY_SECONDS),
  });
});

// B) Self-Healing Demo: absichtlicher Crash (OpenShift startet den Container neu)
app.post("/api/crash", (req, res) => {
  setNoCache(res);

  if (process.env.ALLOW_CRASH !== "true") {
    return res.status(403).json({
      ok: false,
      message: "Crash ist deaktiviert (ALLOW_CRASH ist nicht true).",
    });
  }

  res.status(200).json({
    ok: true,
    message: "Crash ausgelöst. OpenShift startet den Container gleich neu.",
    podName: process.env.POD_NAME || os.hostname(),
    serverTime: isoNow(),
  });

  // etwas mehr Delay, damit die Antwort sicher rausgeht
  setTimeout(() => process.exit(1), 400);
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

