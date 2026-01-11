let lastPod = null;
let lastVersion = null;
let lastUptime = null;

function setDot(id, state){
  const el = document.getElementById(id);
  if(!el) return;
  if(state === "ok") el.className = "dot";
  else if(state === "warn") el.className = "dot warn";
  else el.className = "dot bad";
}

function setText(id, text){
  const el = document.getElementById(id);
  if(el) el.textContent = text;
}

function niceUptime(seconds){
  const s = Number(seconds);
  if(!Number.isFinite(s)) return "–";

  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);

  if(h > 0) return `${h} h ${m} min ${sec} s`;
  if(m > 0) return `${m} min ${sec} s`;
  return `${sec} s`;
}

async function loadInfo(){
  setDot("dotStatus", "warn");
  setText("txtStatus", "Lade Live-Daten…");

  try{
    const res = await fetch("/api/info", { cache: "no-store" });
    if(!res.ok) throw new Error("API nicht erreichbar: " + res.status);

    const data = await res.json();

    // Diese Felder liefert dein server.js jetzt:
    const version = data.version ?? "v1";
    const pod = data.podName ?? data.instance ?? "unbekannt";
    const ns = data.namespace ?? "unknown";
    const node = data.nodeName ?? "unknown";
    const uptimeSec = data.uptimeSec ?? null;
    const req = data.requestCount ?? null;
    const time = data.serverTime ?? new Date().toISOString();

    // Werte anzeigen
    setText("vRoute", window.location.origin);
    setText("vVersion", String(version));
    setText("vPod", String(pod));
    setText("vNs", String(ns));
    setText("vNode", String(node));
    setText("vUptime", niceUptime(uptimeSec));
    setText("vReq", req === null ? "–" : String(req));
    setText("vTime", String(time));

    setDot("dotStatus", "ok");
    setText("txtStatus", "OK: App läuft (Live-Daten aus dem Pod geladen)");

    // SUPER EINFACHE Erklärung (für jeden verständlich)
    // 1) Pod-Wechsel = Verteilung bei 2 Pods
    // 2) Uptime wird klein = Pod neu gestartet (Self-Healing/Restart)
    // 3) Version geändert = Update/Rollout
    let explain = "";

    if(lastPod === null){
      explain = "Erster Check. Tipp: Stelle in OpenShift 2 Pods ein und lade die Seite mehrmals neu.";
      setDot("dotExplain", "warn");
    } else {
      if(pod !== lastPod){
        explain += "Pod hat gewechselt → OpenShift verteilt Aufrufe auf mehrere Pods. ";
      }

      if(lastUptime !== null && uptimeSec !== null && Number(uptimeSec) < Number(lastUptime) - 3){
        explain += "Uptime ist kleiner geworden → Pod wurde neu gestartet (z.B. Restart/Self-Healing). ";
      }

      if(lastVersion !== null && version !== lastVersion){
        explain += "Version hat sich geändert → Update wurde ausgerollt (neue Version läuft). ";
      }

      if(explain === ""){
        explain = "Alles stabil. Wenn du einen Effekt sehen willst: Skaliere auf 2 Pods oder ändere die Version.";
      }

      setDot("dotExplain", "ok");
    }

    setText("txtExplain", explain);

    // Merken für Vergleich beim nächsten Laden
    lastPod = pod;
    lastVersion = version;
    lastUptime = uptimeSec;

  }catch(e){
    setDot("dotStatus", "bad");
    setText("txtStatus", "Fehler: Live-Daten nicht erreichbar");
    setDot("dotExplain", "bad");
    setText("txtExplain", "Bitte Route/Pod prüfen. Fehler: " + (e.message ?? e));
  }
}

document.getElementById("btnRefresh").addEventListener("click", loadInfo);

loadInfo();
setInterval(loadInfo, 3000);

  