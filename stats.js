function toTenths(minutesValue) {
  return Math.round(Number(minutesValue || 0) * 10);
}

function formatTenths(tenths) {
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
}

async function loadCurrentSessionMinutes() {
  const sessionMinutes = document.getElementById("stats-total-minutes");
  if (!sessionMinutes) return;
  try {
    const sessionState = await chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" });
    sessionMinutes.textContent = String(Number(sessionState?.state?.earnedMinutes || 0));
  } catch (error) {
    sessionMinutes.textContent = "0";
  }
}

async function loadSessions() {
  const status = document.getElementById("stats-status");
  const list = document.getElementById("sessions-list");
  const totalSites = document.getElementById("stats-total-sites");
  const sessionMinutes = document.getElementById("stats-total-minutes");
  const trackedTotalMinutes = document.getElementById("stats-tracked-total-minutes");
  if (!list || !status || !totalSites || !sessionMinutes || !trackedTotalMinutes) return;

  list.innerHTML = "";
  totalSites.textContent = "--";
  sessionMinutes.textContent = "--";
  trackedTotalMinutes.textContent = "--";

  // Keep this metric aligned with popup.js (same source of truth).
  await loadCurrentSessionMinutes();

  try {
    const response = await fetch("http://localhost:3000/sessions");
    if (!response.ok) throw new Error("Failed to load sessions");

    const sessions = await response.json();
    if (!Array.isArray(sessions) || sessions.length === 0) {
      totalSites.textContent = "0";
      trackedTotalMinutes.textContent = "0";
      status.textContent = "No focus time saved yet.";
      status.className = "stats-status warning";
      return;
    }

    const tenthsBySite = new Map();
    sessions.forEach((session) => {
      const site = String(session.site || "unknown");
      const durationTenths = toTenths(session.duration_minutes);
      tenthsBySite.set(site, (tenthsBySite.get(site) || 0) + durationTenths);
    });

    const sites = Array.from(tenthsBySite.entries())
      .map(([site, tenths]) => ({ site, tenths }))
      .sort((a, b) => b.tenths - a.tenths);
    const totalTrackedTenths = sites.reduce((sum, siteSummary) => sum + siteSummary.tenths, 0);

    totalSites.textContent = String(sites.length);
    trackedTotalMinutes.textContent = formatTenths(totalTrackedTenths);
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
        <p class="session-duration">${formatTenths(siteSummary.tenths)} min</p>
      `;
      list.appendChild(item);
    });
  } catch (error) {
    status.textContent = "Backend unavailable. Start FastAPI server to view saved sessions.";
    status.className = "stats-status error";
  }
}

loadSessions();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (!changes.state) return;
  loadCurrentSessionMinutes();
});
