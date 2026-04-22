function setProgress({ earnedMinutes, quotaMinutes, unlocked }) {
  const ratio = quotaMinutes > 0 ? Math.min(earnedMinutes / quotaMinutes, 1) : 0;
  const percent = Math.round(ratio * 100);

  const statusElement = document.getElementById("unlock-status");
  const progressText = document.getElementById("progress-text");
  const progressFill = document.getElementById("progress-fill");

  if (statusElement) {
    statusElement.textContent = unlocked ? "Unlocked for this session" : "Locked";
    statusElement.classList.toggle("ok", unlocked);
  }
  if (progressText) {
    progressText.textContent = `${earnedMinutes} / ${quotaMinutes} minutes earned (${percent}%)`;
  }
  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
}

async function loadState() {
  const response = await chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" });
  const earnedMinutes = Number(response?.state?.earnedMinutes || 0);
  const quotaMinutes = Number(response?.settings?.quotaMinutes || 1);
  const unlocked = Boolean(response?.state?.unlocked);
  setProgress({ earnedMinutes, quotaMinutes, unlocked });
}

loadState();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (!changes.state && !changes.settings) return;
  loadState();
});
