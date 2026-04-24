function toTenths(minutesValue) {
  return Math.round(Number(minutesValue || 0) * 10);
}

let allSessionsCache = [];
let activeRange = "7d";
const USER_ID_STORAGE_KEY = "focusunlockUserId";
let quotaMinutesCache = 30;

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

async function getOrCreateUserId() {
  const result = await chrome.storage.local.get(USER_ID_STORAGE_KEY);
  const existing = String(result?.[USER_ID_STORAGE_KEY] || "").trim();
  if (existing) return existing;
  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `focusunlock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await chrome.storage.local.set({ [USER_ID_STORAGE_KEY]: generated });
  return generated;
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

function renderHourlyHeatmap(target, sessions) {
  if (!target) return;
  if (!sessions.length) {
    target.innerHTML = `<div class="analytics-empty">No hourly data yet.</div>`;
    return;
  }

  const hourTotals = Array.from({ length: 24 }, () => 0);
  sessions.forEach((session) => {
    const date = new Date(session.timestamp);
    if (Number.isNaN(date.getTime())) return;
    hourTotals[date.getHours()] += toTenths(session.duration_minutes);
  });

  const max = Math.max(...hourTotals, 1);
  const cells = hourTotals
    .map((value, hour) => {
      const intensity = value <= 0 ? 0 : Math.max(0.15, value / max);
      return `
        <div class="heatmap-cell" style="--heat:${intensity}">
          <span class="heatmap-hour">${String(hour).padStart(2, "0")}:00</span>
          <span class="heatmap-value">${formatTenths(value)}m</span>
        </div>
      `;
    })
    .join("");

  target.innerHTML = `<div class="heatmap-grid">${cells}</div>`;
}

function renderWeekdayPerformance(target, sessions) {
  if (!target) return;
  if (!sessions.length) {
    target.innerHTML = `<div class="analytics-empty">No weekday data yet.</div>`;
    return;
  }

  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const totals = Array.from({ length: 7 }, () => 0);
  sessions.forEach((session) => {
    const date = new Date(session.timestamp);
    if (Number.isNaN(date.getTime())) return;
    totals[date.getDay()] += toTenths(session.duration_minutes);
  });
  const max = Math.max(...totals, 1);

  const rows = labels
    .map((label, idx) => {
      const value = totals[idx];
      const percent = Math.round((value / max) * 100);
      return `
        <div class="analytics-row compact">
          <div class="analytics-row-top">
            <span class="analytics-name">${label}</span>
            <span class="analytics-value">${formatTenths(value)} min</span>
          </div>
          <div class="analytics-bar-track">
            <div class="analytics-bar-fill category" style="width:${percent}%;"></div>
          </div>
        </div>
      `;
    })
    .join("");

  target.innerHTML = rows;
}

function renderSessionLengthDistribution(target, sessions) {
  if (!target) return;
  if (!sessions.length) {
    target.innerHTML = `<div class="analytics-empty">No session length data yet.</div>`;
    return;
  }

  const buckets = [
    { label: "< 5 min", count: 0, min: 0, max: 5 },
    { label: "5-15 min", count: 0, min: 5, max: 15 },
    { label: "15-30 min", count: 0, min: 15, max: 30 },
    { label: "30-60 min", count: 0, min: 30, max: 60 },
    { label: "60+ min", count: 0, min: 60, max: Infinity }
  ];

  sessions.forEach((session) => {
    const minutes = Number(session.duration_minutes || 0);
    const bucket = buckets.find((b) => minutes >= b.min && minutes < b.max);
    if (bucket) bucket.count += 1;
  });

  const max = Math.max(...buckets.map((b) => b.count), 1);
  const rows = buckets
    .map((bucket) => {
      const percent = Math.round((bucket.count / max) * 100);
      return `
        <div class="analytics-row compact">
          <div class="analytics-row-top">
            <span class="analytics-name">${bucket.label}</span>
            <span class="analytics-value">${bucket.count} session(s)</span>
          </div>
          <div class="analytics-bar-track">
            <div class="analytics-bar-fill site" style="width:${percent}%;"></div>
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
  const websiteChart = document.getElementById("analytics-website-chart");
  const categoryChart = document.getElementById("analytics-category-chart");
  const trendChart = document.getElementById("analytics-trend-chart");
  const hourlyHeatmap = document.getElementById("analytics-hourly-heatmap");
  const weekdayPerformance = document.getElementById("analytics-weekday-performance");
  const sessionLength = document.getElementById("analytics-session-length");
  const insightsList = document.getElementById("analytics-insights");
  const totalSites = document.getElementById("stats-total-sites");
  const completedSessions = document.getElementById("stats-completed-sessions");
  const trackedTotalMinutes = document.getElementById("stats-tracked-total-minutes");
  if (
    !websiteChart ||
    !categoryChart ||
    !trendChart ||
    !hourlyHeatmap ||
    !weekdayPerformance ||
    !sessionLength ||
    !insightsList ||
    !status ||
    !totalSites ||
    !completedSessions ||
    !trackedTotalMinutes
  ) {
    return;
  }

  const sessions = filterSessionsByRange(allSessionsCache, activeRange);
  websiteChart.innerHTML = "";
  categoryChart.innerHTML = "";
  trendChart.innerHTML = "";
  hourlyHeatmap.innerHTML = "";
  weekdayPerformance.innerHTML = "";
  sessionLength.innerHTML = "";
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
    renderDistributionChart(websiteChart, [], 0, "site", "No website chart data yet.");
    renderDistributionChart(categoryChart, [], 0, "category", "No category chart data yet.");
    renderTrendChart(trendChart, [], activeRange);
    renderHourlyHeatmap(hourlyHeatmap, []);
    renderWeekdayPerformance(weekdayPerformance, []);
    renderSessionLengthDistribution(sessionLength, []);
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

  const quotaTenths = Math.max(1, Math.round(Number(quotaMinutesCache || 30) * 10));
  const completedQuotaSessions = Math.floor(totalTrackedTenths / quotaTenths);

  totalSites.textContent = String(sites.length);
  completedSessions.textContent = String(completedQuotaSessions);
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
  renderHourlyHeatmap(hourlyHeatmap, sessions);
  renderWeekdayPerformance(weekdayPerformance, sessions);
  renderSessionLengthDistribution(sessionLength, sessions);
  renderInsights(insightsList, sessions, sites, categories);

}

async function loadSessions() {
  const status = document.getElementById("stats-status");
  if (!status) return;

  try {
    try {
      const snapshot = await chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" });
      quotaMinutesCache = Math.max(1, Number(snapshot?.settings?.quotaMinutes || 30));
    } catch (error) {
      quotaMinutesCache = 30;
    }

    // Ensure in-progress focused time is posted before loading analytics.
    try {
      await chrome.runtime.sendMessage({ type: "FLUSH_CURRENT_SESSION" });
    } catch (error) {
      // If flush fails, continue and load whatever is already persisted.
    }

    const userId = await getOrCreateUserId();
    const response = await fetch(
      `https://focusunlock.onrender.com/sessions?user_id=${encodeURIComponent(userId)}`
    );
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
