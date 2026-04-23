function parseSites(value) {
  return value
    .split("\n")
    .map((item) => item.trim().toLowerCase().replace(/^www\./, ""))
    .filter(Boolean);
}

function formatSites(sites) {
  return (sites || []).join("\n");
}

const uiState = {
  earnedMinutes: 0,
  unlocked: false,
  dailyFocusMinutes: 0
};

function updateInsights(workSites, quotaMinutes, allowAllWebsites) {
  const countElement = document.getElementById("configured-sites-count");
  const modeElement = document.getElementById("settings-mode-label");
  const quotaPreview = document.getElementById("quota-preview");
  const toggleStatus = document.getElementById("allow-all-status");
  const dailyGoalInput = document.getElementById("daily-goal-minutes");
  const dailyPaceNeeded = document.getElementById("daily-pace-needed");
  const sessionsToGoal = document.getElementById("sessions-to-goal");
  const ratioText = document.getElementById("ratio-text");
  const ratioFill = document.getElementById("ratio-fill");
  const recommendations = document.getElementById("settings-recommendations");
  const dailyGoalMinutes = Math.max(1, Number(dailyGoalInput?.value || 120));

  if (countElement) countElement.textContent = String(workSites.length);
  if (modeElement) {
    modeElement.textContent = allowAllWebsites ? "Allow All (On)" : "Focus Mode (Off)";
  }
  if (quotaPreview) {
    quotaPreview.textContent = `${uiState.earnedMinutes} / ${quotaMinutes} min`;
  }
  if (toggleStatus) {
    toggleStatus.textContent = allowAllWebsites ? "On" : "Off";
  }

  const dailyRemaining = Math.max(0, dailyGoalMinutes - uiState.dailyFocusMinutes);
  if (dailyPaceNeeded) dailyPaceNeeded.textContent = `${dailyRemaining} min left today`;

  const sessionsNeeded = Math.max(1, Math.ceil(dailyGoalMinutes / Math.max(1, quotaMinutes)));
  if (sessionsToGoal) sessionsToGoal.textContent = `${sessionsNeeded} session(s)`;

  const ratioPercent = Math.min(100, Math.round((quotaMinutes / dailyGoalMinutes) * 100));
  if (ratioText) ratioText.textContent = `${quotaMinutes}:${dailyGoalMinutes}`;
  if (ratioFill) ratioFill.style.width = `${ratioPercent}%`;

  if (recommendations) {
    const tips = [];
    if (allowAllWebsites) {
      tips.push("Turn off Allow All Websites to resume enforcement and accurate tracking.");
    }
    if (workSites.length < 2) {
      tips.push("Add at least two work sites so focused time can be earned from multiple workflows.");
    }
    if (quotaMinutes < 20) {
      tips.push("Consider increasing quota above 20 minutes to reduce impulse site switching.");
    }
    if (dailyGoalMinutes > 240) {
      tips.push("Daily goal is high; split into planned blocks to avoid burnout.");
    }
    if (sessionsNeeded >= 6) {
      tips.push("Current setup requires many sessions; raise quota or lower daily goal for sustainability.");
    }
    if (!tips.length) {
      tips.push("Configuration looks healthy. Keep this profile and review weekly performance trends.");
    }
    recommendations.innerHTML = tips.map((tip) => `<li>${tip}</li>`).join("");
  }
}

function getCurrentFormSettings() {
  const workSitesInput = document.getElementById("work-sites");
  const quotaInput = document.getElementById("quota-minutes");
  const dailyGoalInput = document.getElementById("daily-goal-minutes");
  const allowAllInput = document.getElementById("allow-all-websites");
  const workSites = parseSites(workSitesInput?.value || "");
  const quotaMinutes = Math.max(1, Number(quotaInput?.value || 30));
  const dailyGoalMinutes = Math.max(1, Number(dailyGoalInput?.value || 120));
  const allowAllWebsites = Boolean(allowAllInput?.checked);
  return { workSites, quotaMinutes, dailyGoalMinutes, allowAllWebsites };
}

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" });
  const settings = response?.settings || {};
  const state = response?.state || {};

  const workSitesInput = document.getElementById("work-sites");
  const quotaInput = document.getElementById("quota-minutes");
  const dailyGoalInput = document.getElementById("daily-goal-minutes");
  const allowAllInput = document.getElementById("allow-all-websites");

  if (workSitesInput) workSitesInput.value = formatSites(settings.workSites || []);
  if (quotaInput) quotaInput.value = Number(settings.quotaMinutes ?? 30);
  if (dailyGoalInput) dailyGoalInput.value = Number(settings.dailyGoalMinutes ?? 120);
  if (allowAllInput) allowAllInput.checked = Boolean(settings.allowAllWebsites);

  uiState.earnedMinutes = Number(state.earnedMinutes || 0);
  uiState.unlocked = Boolean(state.unlocked);
  uiState.dailyFocusMinutes = Number(state.dailyFocusMinutes || 0);
  updateInsights(
    parseSites(workSitesInput?.value || ""),
    Number(quotaInput?.value || 30),
    Boolean(allowAllInput?.checked)
  );
}

async function saveSettings() {
  const feedback = document.getElementById("save-feedback");
  const saveButton = document.getElementById("save-settings");
  if (saveButton && !saveButton.dataset.defaultLabel) {
    saveButton.dataset.defaultLabel = saveButton.textContent || "Save Settings";
  }

  const { workSites, quotaMinutes, dailyGoalMinutes, allowAllWebsites } = getCurrentFormSettings();

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
  }
  if (feedback) {
    feedback.textContent = "";
    feedback.classList.remove("error");
  }

  try {
    await chrome.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings: { workSites, quotaMinutes, dailyGoalMinutes, allowAllWebsites }
    });
    updateInsights(workSites, quotaMinutes, allowAllWebsites);

    if (feedback) {
      feedback.textContent = "Settings saved successfully.";
      setTimeout(() => {
        feedback.textContent = "";
      }, 1800);
    }
  } catch (error) {
    if (feedback) {
      feedback.textContent = "Could not save settings. Try again.";
      feedback.classList.add("error");
    }
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = saveButton.dataset.defaultLabel || "Save Settings";
    }
  }
}

async function resetSession() {
  const feedback = document.getElementById("session-feedback");
  const resetButton = document.getElementById("reset-session");
  if (feedback) {
    feedback.textContent = "";
    feedback.classList.remove("error");
  }

  if (resetButton) {
    resetButton.disabled = true;
    resetButton.textContent = "Resetting...";
  }

  try {
    await chrome.runtime.sendMessage({ type: "RESET_SESSION" });
    uiState.earnedMinutes = 0;
    uiState.unlocked = false;
    uiState.dailyFocusMinutes = 0;
    const { workSites, quotaMinutes, allowAllWebsites } = getCurrentFormSettings();
    updateInsights(workSites, quotaMinutes, allowAllWebsites);
    if (feedback) feedback.textContent = "Session reset.";
  } catch (error) {
    if (feedback) {
      feedback.textContent = "Could not reset session.";
      feedback.classList.add("error");
    }
  } finally {
    if (resetButton) {
      resetButton.disabled = false;
      resetButton.textContent = "Reset Current Session";
    }
  }
}

document.getElementById("save-settings")?.addEventListener("click", saveSettings);
document.getElementById("reset-session")?.addEventListener("click", resetSession);
document.getElementById("work-sites")?.addEventListener("input", () => {
  const { workSites, quotaMinutes, allowAllWebsites } = getCurrentFormSettings();
  updateInsights(workSites, quotaMinutes, allowAllWebsites);
});
document.getElementById("quota-minutes")?.addEventListener("input", () => {
  const { workSites, quotaMinutes, allowAllWebsites } = getCurrentFormSettings();
  updateInsights(workSites, quotaMinutes, allowAllWebsites);
});
document.getElementById("daily-goal-minutes")?.addEventListener("input", () => {
  const { workSites, quotaMinutes, allowAllWebsites } = getCurrentFormSettings();
  updateInsights(workSites, quotaMinutes, allowAllWebsites);
});
document.getElementById("allow-all-websites")?.addEventListener("change", () => {
  const { workSites, quotaMinutes, allowAllWebsites } = getCurrentFormSettings();
  updateInsights(workSites, quotaMinutes, allowAllWebsites);
});
document.querySelectorAll(".preset-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const preset = button.getAttribute("data-preset");
    const quotaInput = document.getElementById("quota-minutes");
    const dailyGoalInput = document.getElementById("daily-goal-minutes");
    const allowAllInput = document.getElementById("allow-all-websites");

    if (preset === "deep") {
      if (quotaInput) quotaInput.value = "45";
      if (dailyGoalInput) dailyGoalInput.value = "180";
      if (allowAllInput) allowAllInput.checked = false;
    } else if (preset === "balanced") {
      if (quotaInput) quotaInput.value = "30";
      if (dailyGoalInput) dailyGoalInput.value = "120";
      if (allowAllInput) allowAllInput.checked = false;
    } else if (preset === "light") {
      if (quotaInput) quotaInput.value = "20";
      if (dailyGoalInput) dailyGoalInput.value = "60";
      if (allowAllInput) allowAllInput.checked = false;
    }

    const { workSites, quotaMinutes, allowAllWebsites } = getCurrentFormSettings();
    updateInsights(workSites, quotaMinutes, allowAllWebsites);
    const saveFeedback = document.getElementById("save-feedback");
    if (saveFeedback) {
      saveFeedback.textContent = "Preset applied. Click Save Settings to keep it.";
    }
  });
});
loadSettings();
