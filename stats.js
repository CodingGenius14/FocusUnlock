function toTenths(minutesValue) {
  return Math.round(Number(minutesValue || 0) * 10);
}

let allSessionsCache = [];
let activeRange = "7d";

function formatTenths(tenths) {
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
}

function percentFromTotal(part, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dayKeyFromTimestamp(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shortDayLabel(dayKey) {
  const date = new Date(`${dayKey}T00:00:00`);
  return date.toLocaleDateString([], { weekday: "short" });
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function filterSessionsByRange(sessions, range) {
  if (!Array.isArray(sessions)) return [];
  if (range === "all") return sessions;

  const today = startOfDay(new Date());
  let dayCount = 7;
  if (range === "today") dayCount = 1;
  if (range === "30d") dayCount = 30;
  const start = new Date(today);
  start.setDate(today.getDate() - (dayCount - 1));

  return sessions.filter((session) => new Date(session.timestamp) >= start);
}

function getRangeLabel(range) {
  if (range === "today") return "today";
  if (range === "30d") return "last 30 days";
  if (range === "all") return "all time";
  return "last 7 days";
}

function renderDistributionChart(target, items, totalTenths, accentClass, emptyLabel) {
  if (!target) return;
  if (!items.length || totalTenths <= 0) {
    target.innerHTML = `<div class="analytics-empty">${emptyLabel}</div>`;
    return;
  }

  const rows = items
    .slice(0, 8)
    .map((item) => {
      const percent = percentFromTotal(item.tenths, totalTenths);
      return `
        <div class="analytics-row">
          <div class="analytics-row-top">
            <span class="analytics-name">${escapeHtml(item.label)}</span>
            <span class="analytics-value">${formatTenths(item.tenths)} min (${percent}%)</span>
          </div>
          <div class="analytics-bar-track">
            <div class="analytics-bar-fill ${accentClass}" style="width: ${percent}%;"></div>
          </div>
        </div>
      `;
    })
    .join("");

  target.innerHTML = rows;
}

function renderTrendChart(target, sessions, range) {
  if (!target) return;
  const days = [];
  const dayTotals = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (range === "all") {
    const uniqueDays = Array.from(new Set(sessions.map((session) => dayKeyFromTimestamp(session.timestamp)))).sort();
    const selectedDays = uniqueDays.slice(-14);
    selectedDays.forEach((key) => {
      days.push(key);
      dayTotals.set(key, 0);
    });
  } else {
    const dayCount = range === "today" ? 1 : range === "30d" ? 30 : 7;
    for (let i = dayCount - 1; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const key = `${year}-${month}-${day}`;
      days.push(key);
      dayTotals.set(key, 0);
    }
  }

  if (!days.length) {
    target.innerHTML = `<div class="analytics-empty">No trend data yet.</div>`;
    return;
  }

  sessions.forEach((session) => {
    const key = dayKeyFromTimestamp(session.timestamp);
    if (!dayTotals.has(key)) return;
    dayTotals.set(key, dayTotals.get(key) + toTenths(session.duration_minutes));
  });

  const values = days.map((day) => dayTotals.get(day) || 0);
  const max = Math.max(...values, 10);
  const width = 640;
  const height = 220;
  const paddingX = 34;
  const paddingTop = 18;
  const paddingBottom = 40;
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingTop - paddingBottom;
  const stepX = days.length > 1 ? plotWidth / (days.length - 1) : plotWidth;

  const points = values.map((value, index) => {
    const x = paddingX + index * stepX;
    const y = paddingTop + plotHeight - (value / max) * plotHeight;
    return { x, y, value };
  });

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  const labels = points
    .map(
      (p, index) =>
        `<text x="${p.x}" y="${height - 14}" text-anchor="middle" class="trend-label">${shortDayLabel(
          days[index]
        )}</text>`
    )
    .join("");

  const dots = points
    .map(
      (p) => `
      <circle cx="${p.x}" cy="${p.y}" r="4" class="trend-dot"></circle>
      <text x="${p.x}" y="${p.y - 10}" text-anchor="middle" class="trend-value">${formatTenths(
        p.value
      )}</text>
    `
    )
    .join("");

  target.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="trend-chart-svg" aria-label="7 day focus trend">
      <line x1="${paddingX}" y1="${paddingTop + plotHeight}" x2="${width - paddingX}" y2="${
    paddingTop + plotHeight
  }" class="trend-axis"></line>
      <polyline points="${linePoints}" class="trend-line"></polyline>
      ${dots}
      ${labels}
    </svg>
  `;
}

function renderInsights(target, sessions, sites, categories) {
  if (!target) return;
  if (!sessions.length) {
    target.innerHTML = `<div class="analytics-empty">No insights yet.</div>`;
    return;
  }

  const topSite = sites[0];
  const topCategory = categories[0];
  const avgTenths = Math.round(
    sessions.reduce((sum, session) => sum + toTenths(session.duration_minutes), 0) / sessions.length
  );

  const byDay = new Map();
  sessions.forEach((session) => {
    const key = dayKeyFromTimestamp(session.timestamp);
    byDay.set(key, (byDay.get(key) || 0) + toTenths(session.duration_minutes));
  });
  const topDay = Array.from(byDay.entries()).sort((a, b) => b[1] - a[1])[0];
  const topDayLabel = topDay
    ? new Date(`${topDay[0]}T00:00:00`).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })
    : "--";

  target.innerHTML = `
    <article class="insight-card">
      <p class="insight-card-label">Top Website</p>
      <p class="insight-card-value">${escapeHtml(topSite.label)}</p>
      <p class="insight-card-meta">${formatTenths(topSite.tenths)} min</p>
    </article>
    <article class="insight-card">
      <p class="insight-card-label">Top Category</p>
      <p class="insight-card-value">${escapeHtml(topCategory.label)}</p>
      <p class="insight-card-meta">${formatTenths(topCategory.tenths)} min</p>
    </article>
    <article class="insight-card">
      <p class="insight-card-label">Average Session</p>
      <p class="insight-card-value">${formatTenths(avgTenths)} min</p>
      <p class="insight-card-meta">${sessions.length} completed sessions</p>
    </article>
    <article class="insight-card">
      <p class="insight-card-label">Most Focused Day</p>
      <p class="insight-card-value">${topDayLabel}</p>
      <p class="insight-card-meta">${topDay ? `${formatTenths(topDay[1])} min` : ""}</p>
    </article>
  `;
}

function getCategoryForSite(site) {
  const normalized = String(site || "").toLowerCase();

  if (/(github|gitlab|bitbucket|stackoverflow|stackexchange|docs\.|developer\.|npmjs|pypi)/.test(normalized)) {
    return "Development";
  }
  if (/(jira|linear|trello|asana|notion|confluence|clickup|monday)/.test(normalized)) {
    return "Planning";
  }
  if (/(coursera|udemy|edx|khanacademy|wikipedia|medium|substack|arxiv|cmu\.edu|mit\.edu|stanford\.edu)/.test(normalized)) {
    return "Learning";
  }
  if (/(slack|discord|teams|zoom|meet|gmail|outlook|mail|linkedin)/.test(normalized)) {
    return "Communication";
  }
  if (/(youtube|reddit|x\.com|twitter|instagram|tiktok|facebook|netflix|twitch)/.test(normalized)) {
    return "Social & Entertainment";
  }

  return "Other";
}

function renderRange() {
  const status = document.getElementById("stats-status");
  const list = document.getElementById("sessions-list");
  const categoryList = document.getElementById("category-list");
  const websiteChart = document.getElementById("analytics-website-chart");
  const categoryChart = document.getElementById("analytics-category-chart");
  const trendChart = document.getElementById("analytics-trend-chart");
  const insightsList = document.getElementById("analytics-insights");
  const totalSites = document.getElementById("stats-total-sites");
  const completedSessions = document.getElementById("stats-completed-sessions");
  const trackedTotalMinutes = document.getElementById("stats-tracked-total-minutes");
  if (
    !list ||
    !categoryList ||
    !websiteChart ||
    !categoryChart ||
    !trendChart ||
    !insightsList ||
    !status ||
    !totalSites ||
    !completedSessions ||
    !trackedTotalMinutes
  ) {
    return;
  }

  const sessions = filterSessionsByRange(allSessionsCache, activeRange);
  list.innerHTML = "";
  categoryList.innerHTML = "";
  websiteChart.innerHTML = "";
  categoryChart.innerHTML = "";
  trendChart.innerHTML = "";
  insightsList.innerHTML = "";
  totalSites.textContent = "--";
  completedSessions.textContent = "--";
  trackedTotalMinutes.textContent = "--";

  if (!sessions.length) {
    totalSites.textContent = "0";
    completedSessions.textContent = "0";
    trackedTotalMinutes.textContent = "0";
    status.textContent = `No focus time saved for ${getRangeLabel(activeRange)}.`;
    status.className = "stats-status warning";
    categoryList.innerHTML = '<li class="stats-category-empty">No category data yet.</li>';
    list.innerHTML = '<li class="stats-category-empty">No website data yet.</li>';
    renderDistributionChart(websiteChart, [], 0, "site", "No website chart data yet.");
    renderDistributionChart(categoryChart, [], 0, "category", "No category chart data yet.");
    renderTrendChart(trendChart, [], activeRange);
    renderInsights(insightsList, [], [], []);
    return;
  }

  const tenthsBySite = new Map();
  const tenthsByCategory = new Map();
  sessions.forEach((session) => {
    const site = String(session.site || "unknown");
    const durationTenths = toTenths(session.duration_minutes);
    tenthsBySite.set(site, (tenthsBySite.get(site) || 0) + durationTenths);
    const category = getCategoryForSite(site);
    tenthsByCategory.set(category, (tenthsByCategory.get(category) || 0) + durationTenths);
  });

    const sites = Array.from(tenthsBySite.entries())
      .map(([site, tenths]) => ({ label: site, tenths }))
      .sort((a, b) => b.tenths - a.tenths);
    const categories = Array.from(tenthsByCategory.entries())
      .map(([category, tenths]) => ({ label: category, tenths }))
      .sort((a, b) => b.tenths - a.tenths);
    const totalTrackedTenths = sites.reduce((sum, siteSummary) => sum + siteSummary.tenths, 0);

  totalSites.textContent = String(sites.length);
  completedSessions.textContent = String(sessions.length);
  trackedTotalMinutes.textContent = formatTenths(totalTrackedTenths);
  status.textContent = `${sites.length} website(s) tracked in ${getRangeLabel(activeRange)}`;
  status.className = "stats-status";

    renderDistributionChart(
      websiteChart,
      sites,
      totalTrackedTenths,
      "site",
      "No website chart data yet."
    );
    renderDistributionChart(
      categoryChart,
      categories,
      totalTrackedTenths,
      "category",
      "No category chart data yet."
    );
  renderTrendChart(trendChart, sessions, activeRange);
  renderInsights(insightsList, sessions, sites, categories);

  categories.forEach((categorySummary) => {
    const percent = percentFromTotal(categorySummary.tenths, totalTrackedTenths);
    const item = document.createElement("li");
    item.className = "stats-category-item";
    item.innerHTML = `
        <div class="stats-item-top">
          <span class="stats-category-name">${categorySummary.label}</span>
          <span class="stats-category-time">${formatTenths(categorySummary.tenths)} min (${percent}%)</span>
        </div>
        <div class="stats-item-bar-track">
          <div class="stats-item-bar-fill" style="width: ${percent}%;"></div>
        </div>
    `;
    categoryList.appendChild(item);
  });

  sites.forEach((siteSummary) => {
    const percent = percentFromTotal(siteSummary.tenths, totalTrackedTenths);
    const item = document.createElement("li");
    item.className = "stats-session-item";
    item.innerHTML = `
        <div class="stats-item-top">
          <p class="session-site">${siteSummary.label}</p>
          <p class="session-duration">${formatTenths(siteSummary.tenths)} min (${percent}%)</p>
        </div>
        <div class="stats-item-bar-track">
          <div class="stats-item-bar-fill site" style="width: ${percent}%;"></div>
        </div>
    `;
    list.appendChild(item);
  });
}

async function loadSessions() {
  const status = document.getElementById("stats-status");
  if (!status) return;

  try {
    const response = await fetch("http://localhost:3000/sessions");
    if (!response.ok) throw new Error("Failed to load sessions");
    const sessions = await response.json();
    allSessionsCache = Array.isArray(sessions) ? sessions : [];
    renderRange();
  } catch (error) {
    status.textContent = "Backend unavailable. Start FastAPI server to view saved sessions.";
    status.className = "stats-status error";
  }
}

loadSessions();

document.querySelectorAll(".stats-range-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const nextRange = button.getAttribute("data-range");
    if (!nextRange || nextRange === activeRange) return;
    activeRange = nextRange;
    document.querySelectorAll(".stats-range-btn").forEach((btn) => {
      btn.classList.toggle("active", btn === button);
    });
    renderRange();
  });
});
