"use strict";

const express = require("express");
const path = require("path");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 8080;

// Hier liegen deine Website-Dateien (index.html, dashboard.html, style.css, app.js, dashboard.js)
const PUBLIC_DIR = path.join(__dirname, "public");

// Startzeit (für Uptime/Proof)
const startedAt = new Date();
let infoHits = 0;

// Optional: Readiness-Delay (z. B. 10 Sekunden) -> zeigt Readiness Verhalten in OpenShift
const READY_DELAY_SECONDS = Math.max(0, Number(process.env.READY_DELAY_SECONDS || 0));
const readyAt = new Date(startedAt.getTime() + READY_DELAY_SECONDS * 1000);

// Kleine Helpers
function isoNow() {
  return new Date().toISOString();
}

function isReady() {
  return Date.now() >= readyAt.getTime();
}

// Wichtig: Nichts cachen (Live-Demo soll live sein)
function setNoCache(res) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  });
}

// Optional: kleine Security-Sache (nicht zwingend, aber sauber)
app.disable("x-powered-by");

// JSON Body brauchen wir nur für POST (Crash), aber es stört nicht global
app.use(express.json());

/* -------------------------------------------------------
   1) API ENDPOINTS (für Live-Demo)
------------------------------------------------------- */

// Für alle /api Requests: nie cachen
app.use("/api", (req, res, next) => {
  setNoCache(res);
  next();
});

// Health = Server lebt (Liveness)
app.get("/api/health", (req, res) => {
  res.status(200).json({
    ok: true,
    status: "healthy",
    serverTime: isoNow(),
  });
});

// Ready = OpenShift schickt nur Traffic, wenn ready (Readiness)
app.get("/api/ready", (req, res) => {
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

// Info = Herzstück der Demo (zeigt Pod/Namespace/Uptime live)
app.get("/api/info", (req, res) => {
  infoHits += 1;

  res.status(200).json({
    // Version kannst du in OpenShift als Env setzen (APP_VERSION)
    version: process.env.APP_VERSION || "v1",

    // Wer hat geantwortet?
    podName: process.env.POD_NAME || os.hostname(),
    namespace: process.env.POD_NAMESPACE || "unknown",
    nodeName: process.env.NODE_NAME || "unknown",

    // Proof, dass es live ist
    serverTime: isoNow(),
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    requestCount: infoHits,

    // Readiness Werte (nur zur Anzeige)
    ready: isReady(),
    readyAt: readyAt.toISOString(),
    readyDelaySeconds: READY_DELAY_SECONDS,
  });
});

// Crash = Self-Healing Demo (OpenShift startet Pod neu)
app.post("/api/crash", (req, res) => {
  // Crash nur erlauben, wenn du es bewusst aktivierst
  if (process.env.ALLOW_CRASH !== "true") {
    return res.status(403).json({
      ok: false,
      message: "Crash ist deaktiviert (ALLOW_CRASH ist nicht true).",
    });
  }

  // Erst Antwort senden, dann Prozess beenden
  res.status(200).json({
    ok: true,
    message: "Crash ausgelöst. OpenShift startet den Container gleich neu.",
    podName: process.env.POD_NAME || os.hostname(),
    serverTime: isoNow(),
  });

  setTimeout(() => process.exit(1), 400);
});

// Unbekannte /api/... Endpunkte -> echtes 404 (nicht index.html!)
app.use("/api", (req, res) => {
  res.status(404).json({
    ok: false,
    message: "Unbekannter API Endpoint.",
  });
});

/* -------------------------------------------------------
   2) STATIC WEBSITE (HTML / CSS / JS)
------------------------------------------------------- */

// Website-Dateien aus /public ausliefern
// HTML wird extra "no-cache", damit Updates sofort sichtbar sind
app.use(
  express.static(PUBLIC_DIR, {
    maxAge: 0,
    etag: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) setNoCache(res);
    },
  })
);

// Fallback: alles andere -> index.html (damit Startseite immer funktioniert)
app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
