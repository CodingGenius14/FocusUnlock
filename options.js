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
  unlocked: false
};

function updateInsights(workSites, quotaMinutes, allowAllWebsites) {
  const countElement = document.getElementById("configured-sites-count");
  const modeElement = document.getElementById("settings-mode-label");
  const quotaPreview = document.getElementById("quota-preview");
  const toggleStatus = document.getElementById("allow-all-status");

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
  updateInsights(
    parseSites(workSitesInput?.value || ""),
    Number(quotaInput?.value || 30),
    Boolean(allowAllInput?.checked)
  );
}

async function saveSettings() {
  const feedback = document.getElementById("save-feedback");
  const saveButton = document.getElementById("save-settings");

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
      saveButton.textContent = "Save Settings";
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
loadSettings();
