const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;

const startedAt = Date.now();
let requestCount = 0;

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/info", (req, res) => {
  requestCount++;

  const podName = process.env.POD_NAME || process.env.HOSTNAME || "unknown";
  const namespace = process.env.POD_NAMESPACE || "unknown";
  const nodeName = process.env.NODE_NAME || "unknown";
  const version = process.env.APP_VERSION || "v1";

  res.json({
    version: version,

    // damit deine aktuelle Webseite es sicher findet:
    podName: podName,
    namespace: namespace,
    nodeName: nodeName,

    // alte/zusätzliche Felder (nicht schlimm, eher gut)
    instance: podName,
    serverTime: new Date().toISOString(),
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    requestCount: requestCount
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server läuft auf Port ${PORT}`);
});

