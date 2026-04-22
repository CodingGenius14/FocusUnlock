async function loadSessions() {
  const status = document.getElementById("stats-status");
  const list = document.getElementById("sessions-list");
  const totalSites = document.getElementById("stats-total-sites");
  const totalMinutes = document.getElementById("stats-total-minutes");
  if (!list || !status || !totalSites || !totalMinutes) return;

  list.innerHTML = "";
  totalSites.textContent = "--";
  totalMinutes.textContent = "--";

  try {
    const response = await fetch("http://localhost:3000/sessions");
    if (!response.ok) throw new Error("Failed to load sessions");

    const sessions = await response.json();
    if (!Array.isArray(sessions) || sessions.length === 0) {
      totalSites.textContent = "0";
      totalMinutes.textContent = "0";
      status.textContent = "No focus time saved yet.";
      status.className = "stats-status warning";
      return;
    }

    const minutesBySite = new Map();
    let total = 0;

    sessions.forEach((session) => {
      const site = String(session.site || "unknown");
      const duration = Number(session.duration_minutes || 0);
      total += duration;
      minutesBySite.set(site, (minutesBySite.get(site) || 0) + duration);
    });

    const sites = Array.from(minutesBySite.entries())
      .map(([site, minutes]) => ({ site, minutes }))
      .sort((a, b) => b.minutes - a.minutes);

    totalSites.textContent = String(sites.length);
    totalMinutes.textContent = String(Math.round(total));
    status.textContent = `${sites.length} website(s) tracked`;
    status.className = "stats-status";

    sites.forEach((siteSummary) => {
      const item = document.createElement("li");
      item.className = "stats-session-item";
      item.innerHTML = `
        <div class="session-main">
          <p class="session-site">${siteSummary.site}</p>
          <p class="session-time">Total focused time</p>
        </div>
        <p class="session-duration">${Math.round(siteSummary.minutes)} min</p>
      `;
      list.appendChild(item);
    });
  } catch (error) {
    status.textContent = "Backend unavailable. Start FastAPI server to view saved sessions.";
    status.className = "stats-status error";
  }
}

loadSessions();
