const defaultActivities = [
    "Deployment erstellt",
    "Pod läuft (Running)",
    "Route getestet (URL öffnet)",
    "Skalierung geprüft (1 → 2)",
    "Update ausgerollt (v1 → v2)"
  ];
  
  const listEl = document.getElementById("activityList");
  const inputEl = document.getElementById("activityInput");
  const addBtn = document.getElementById("addBtn");
  
  function loadActivities() {
    const raw = localStorage.getItem("activities");
    if (raw) return JSON.parse(raw);
    localStorage.setItem("activities", JSON.stringify(defaultActivities));
    return [...defaultActivities];
  }
  
  function saveActivities(items) {
    localStorage.setItem("activities", JSON.stringify(items));
  }
  
  function render() {
    const items = loadActivities();
    listEl.innerHTML = "";
    for (const text of items) {
      const li = document.createElement("li");
      li.textContent = text;
      listEl.appendChild(li);
    }
  }
  
  addBtn.addEventListener("click", () => {
    const value = inputEl.value.trim();
    if (!value) return;
    const items = loadActivities();
    items.push(value);
    saveActivities(items);
    inputEl.value = "";
    render();
  });
  
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addBtn.click();
  });
  
  async function loadInfo() {
    try {
      const res = await fetch("/api/info");
      const data = await res.json();
      document.getElementById("version").textContent = data.version;
      document.getElementById("instance").textContent = data.instance;
      document.getElementById("time").textContent = data.time;
    } catch {
      document.getElementById("version").textContent = "unbekannt";
      document.getElementById("instance").textContent = "unbekannt";
      document.getElementById("time").textContent = "unbekannt";
    }
  }
  
  render();
  loadInfo();
  