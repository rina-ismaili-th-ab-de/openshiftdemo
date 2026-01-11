const express = require("express");
const path = require("path");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 8080;

const startedAt = new Date();
let infoHits = 0;

function isoNow() {
  return new Date().toISOString();
}

app.get("/api/info", (req, res) => {
  infoHits += 1;

  // Wichtig: damit der Browser nicht "klebt" und eher beide Pods trifft
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Connection", "close");

  res.json({
    version: process.env.APP_VERSION || "v1",
    podName: process.env.POD_NAME || os.hostname(),
    namespace: process.env.POD_NAMESPACE || "unknown",
    nodeName: process.env.NODE_NAME || "unknown",
    serverTime: isoNow(),
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    requestCount: infoHits,
  });
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

