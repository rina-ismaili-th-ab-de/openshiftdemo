let lastPod = null;
const podsSeen = new Set();
let switchCount = 0;

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

async function loadInfo(){
  setDot("dotStatus", "warn");
  setText("txtStatus", "Lade Live-Daten…");

  try{
    const res = await fetch("/api/info", { cache: "no-store" });
    if(!res.ok) throw new Error("API nicht erreichbar: " + res.status);

    const data = await res.json();

    // passt zu deinem aktuellen Backend (Screenshot):
    const version = data.version ?? "v1";
    const pod = data.instance ?? data.podName ?? data.pod ?? data.hostname ?? "unbekannt";
    const time = data.serverTime ?? data.time ?? new Date().toISOString();

    setText("vRoute", window.location.origin);
    setText("vVersion", String(version));
    setText("vPod", String(pod));
    setText("vTime", String(time));

    // Pod-Wechsel-Logik (für Skalierungs-Nachweis)
    podsSeen.add(String(pod));
    setText("vPodsSeen", `${podsSeen.size} ( ${Array.from(podsSeen).join(", ")} )`);

    if(lastPod === null){
      lastPod = String(pod);
      setText("vPodSwitch", "Noch kein Vergleich (erste Messung)");
      setDot("dotTest", "warn");
      setText("txtTest", "Tipp: Skaliere auf 2 Pods und lade mehrmals neu.");
    } else if(String(pod) !== lastPod){
      switchCount++;
      lastPod = String(pod);
      setText("vPodSwitch", `JA ✅ (Wechsel erkannt: ${switchCount}x)`);
      setDot("dotTest", "ok");
      setText("txtTest", "Sehr gut: Pod wechselt → OpenShift verteilt Aufrufe auf mehrere Pods.");
    } else {
      setText("vPodSwitch", `Noch nicht (Wechsel erkannt: ${switchCount}x)`);
      setDot("dotTest", "warn");
      setText("txtTest", "Noch gleicher Pod. Lade öfter neu oder stelle Replicas auf 2.");
    }

    setDot("dotStatus", "ok");
    setText("txtStatus", "OK: Live-Daten geladen (App läuft im Cluster)");
  } catch(e){
    setDot("dotStatus", "bad");
    setText("txtStatus", "Fehler: Live-Daten konnten nicht geladen werden");
    setDot("dotTest", "bad");
    setText("txtTest", "Bitte Pod/Route prüfen. Fehler: " + (e?.message ?? e));
  }
}

function setupActivities(){
  const list = document.getElementById("activityList");
  const input = document.getElementById("activityInput");
  const btn = document.getElementById("activityBtn");

  btn.addEventListener("click", () => {
    const t = input.value.trim();
    if(!t) return;
    const li = document.createElement("li");
    li.textContent = t;
    list.appendChild(li);
    input.value = "";
    input.focus();
  });

  input.addEventListener("keydown", (e) => {
    if(e.key === "Enter") btn.click();
  });
}

document.getElementById("btnRefresh").addEventListener("click", loadInfo);

setupActivities();
loadInfo();
setInterval(loadInfo, 3000);

  