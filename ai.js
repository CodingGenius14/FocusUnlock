const AI_ASSIST_STORAGE_KEY = "aiAssistState";
let latestPlan = null;

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function getSelectedSitesFromDom() {
  return Array.from(document.querySelectorAll(".ai-site-check:checked"))
    .map((node) => normalizeDomain(node.value))
    .filter(Boolean);
}

async function saveAiState(overrides = {}) {
  const goalInput = document.getElementById("goal-input");
  const state = {
    goal: goalInput?.value || "",
    selectedSites: getSelectedSitesFromDom(),
    plan: latestPlan,
    ...overrides
  };
  await chrome.storage.local.set({ [AI_ASSIST_STORAGE_KEY]: state });
}

function renderSites(sites, selectedSites = []) {
  const target = document.getElementById("site-recommendations");
  if (!target) return;
  if (!sites.length) {
    target.innerHTML = '<p class="ai-empty">No recommendations yet. Generate a plan first.</p>';
    return;
  }
  const selectedSet = new Set(selectedSites.map(normalizeDomain));
  target.innerHTML = sites
    .map(
      (site) => `
      <label class="ai-site-item">
        <input type="checkbox" class="ai-site-check" value="${site}" ${
        selectedSet.size === 0 || selectedSet.has(normalizeDomain(site)) ? "checked" : ""
      } />
        <span>${site}</span>
      </label>
    `
    )
    .join("");
}

function renderTimePlan(timePlan) {
  const target = document.getElementById("time-plan");
  if (!target) return;
  if (!timePlan.length) {
    target.innerHTML = '<p class="ai-empty">No time plan yet.</p>';
    return;
  }
  target.innerHTML = timePlan
    .map(
      (item) => `
      <article class="ai-plan-item">
        <p class="ai-plan-site">${item.site}</p>
        <p class="ai-plan-meta">${item.minutes} min</p>
        <p class="ai-plan-reason">${item.reason || "Use this site during a focused block."}</p>
      </article>
    `
    )
    .join("");
}

function renderFocusPlan(focusPlan) {
  const target = document.getElementById("focus-plan");
  if (!target) return;
  if (!focusPlan.length) {
    target.innerHTML = '<li class="ai-empty">No strategy notes yet.</li>';
    return;
  }
  target.innerHTML = focusPlan.map((tip) => `<li>${tip}</li>`).join("");
}

function setStatus(message, isError = false) {
  const status = document.getElementById("ai-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function generatePlan() {
  const goalInput = document.getElementById("goal-input");
  const generateBtn = document.getElementById("generate-ai");
  const goal = goalInput?.value?.trim() || "";
  if (goal.length < 8) {
    setStatus("Please type a more specific goal first.", true);
    return;
  }

  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.textContent = "Generating...";
  }
  setStatus("Generating recommendations...");

  try {
    const sessionState = await chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" });
    const currentWorkSites = sessionState?.settings?.workSites || [];
    const dailyGoalMinutes = Number(sessionState?.settings?.dailyGoalMinutes || 120);

    const response = await fetch("https://focusunlock.onrender.com/ai/assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal,
        current_work_sites: currentWorkSites,
        daily_goal_minutes: dailyGoalMinutes
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "AI request failed");
    }

    const data = await response.json();
    const recommendedSites = (data.recommended_sites || []).map(normalizeDomain).filter(Boolean);
    latestPlan = {
      recommended_sites: recommendedSites,
      time_plan: data.time_plan || [],
      focus_plan: data.focus_plan || [],
      suggested_quota_minutes: data.suggested_quota_minutes || 30,
      source: data.source || "ai"
    };

    renderSites(recommendedSites, recommendedSites);
    renderTimePlan(data.time_plan || []);
    renderFocusPlan(data.focus_plan || []);
    if (data.source === "fallback") {
      setStatus("Groq is temporarily unavailable. Generated a smart fallback plan you can still apply.");
    } else {
      setStatus("Plan generated. Select sites and apply them to Settings.");
    }
    await saveAiState();
  } catch (err) {
    setStatus(`Could not generate plan: ${err.message}`, true);
  } finally {
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.textContent = "Generate AI Plan";
    }
  }
}

async function applySelectedSites() {
  const selected = getSelectedSitesFromDom();

  if (!selected.length) {
    setStatus("Select at least one recommended site.", true);
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" });
    const settings = response?.settings || {};
    const existing = Array.isArray(settings.workSites) ? settings.workSites.map(normalizeDomain) : [];
    const mergedSites = Array.from(new Set([...existing, ...selected]));

    await chrome.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings: {
        workSites: mergedSites,
        quotaMinutes: Number(settings.quotaMinutes || 30),
        dailyGoalMinutes: Number(settings.dailyGoalMinutes || 120),
        allowAllWebsites: Boolean(settings.allowAllWebsites)
      }
    });

    setStatus("Selected sites saved to Work Sites in Settings.");
    await saveAiState();
  } catch (err) {
    setStatus(`Could not save selected sites: ${err.message}`, true);
  }
}

async function loadAiState() {
  const result = await chrome.storage.local.get(AI_ASSIST_STORAGE_KEY);
  const saved = result?.[AI_ASSIST_STORAGE_KEY];
  if (!saved) return;

  const goalInput = document.getElementById("goal-input");
  if (goalInput && saved.goal) {
    goalInput.value = saved.goal;
  }

  const savedPlan = saved.plan;
  if (savedPlan && Array.isArray(savedPlan.recommended_sites)) {
    latestPlan = savedPlan;
    renderSites(savedPlan.recommended_sites, saved.selectedSites || savedPlan.recommended_sites);
    renderTimePlan(savedPlan.time_plan || []);
    renderFocusPlan(savedPlan.focus_plan || []);
    if (savedPlan.source === "fallback") {
      setStatus("Restored your last fallback plan.");
    } else {
      setStatus("Restored your last AI plan.");
    }
    return;
  }

  renderSites([]);
  renderTimePlan([]);
  renderFocusPlan([]);
}

function attachListeners() {
  document.getElementById("generate-ai")?.addEventListener("click", generatePlan);
  document.getElementById("apply-selected")?.addEventListener("click", applySelectedSites);
  document.getElementById("goal-input")?.addEventListener("input", () => {
    saveAiState().catch(() => {});
  });
  document.getElementById("site-recommendations")?.addEventListener("change", () => {
    saveAiState().catch(() => {});
  });
}

async function init() {
  renderSites([]);
  renderTimePlan([]);
  renderFocusPlan([]);
  attachListeners();
  await loadAiState();
}

init();
