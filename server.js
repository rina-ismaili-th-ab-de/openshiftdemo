const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;
const APP_VERSION = process.env.APP_VERSION || "v1";

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/info", (req, res) => {
  res.json({
    version: APP_VERSION,
    instance: process.env.HOSTNAME || "unknown",
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});

