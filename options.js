function parseSites(value) {
  return value
    .split("\n")
    .map((item) => item.trim().toLowerCase().replace(/^www\./, ""))
    .filter(Boolean);
}

function formatSites(sites) {
  return (sites || []).join("\n");
}

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" });
  const settings = response?.settings || {};

  const workSitesInput = document.getElementById("work-sites");
  const quotaInput = document.getElementById("quota-minutes");

  if (workSitesInput) workSitesInput.value = formatSites(settings.workSites || []);
  if (quotaInput) quotaInput.value = Number(settings.quotaMinutes || 30);
}

async function saveSettings() {
  const workSitesInput = document.getElementById("work-sites");
  const quotaInput = document.getElementById("quota-minutes");
  const feedback = document.getElementById("save-feedback");
  const saveButton = document.getElementById("save-settings");

  const workSites = parseSites(workSitesInput?.value || "");
  const quotaMinutes = Math.max(1, Number(quotaInput?.value || 30));

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
      settings: { workSites, quotaMinutes }
    });

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

document.getElementById("save-settings")?.addEventListener("click", saveSettings);
loadSettings();
