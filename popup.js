function setProgress({
  earnedMinutes,
  quotaMinutes,
  unlocked,
  dailyFocusMinutes,
  dailyGoalMinutes
}) {
  const ratio = quotaMinutes > 0 ? Math.min(earnedMinutes / quotaMinutes, 1) : 0;
  const percent = Math.round(ratio * 100);
  const remaining = Math.max(0, quotaMinutes - earnedMinutes);
  const dailyRatio = dailyGoalMinutes > 0 ? Math.min(dailyFocusMinutes / dailyGoalMinutes, 1) : 0;
  const dailyPercent = Math.round(dailyRatio * 100);

  const statusElement = document.getElementById("unlock-status");
  const progressText = document.getElementById("progress-text");
  const remainingText = document.getElementById("remaining-text");
  const percentText = document.getElementById("progress-percent");
  const progressFill = document.getElementById("progress-fill");
  const dailyGoalPercentText = document.getElementById("daily-goal-percent");
  const dailyGoalText = document.getElementById("daily-goal-text");
  const dailyGoalFill = document.getElementById("daily-goal-fill");

  if (statusElement) {
    statusElement.textContent = unlocked ? "Unlocked for this session" : "Locked";
    statusElement.classList.toggle("ok", unlocked);
  }
  if (progressText) {
    progressText.textContent = `${earnedMinutes} / ${quotaMinutes} min`;
  }
  if (remainingText) {
    remainingText.textContent = unlocked
      ? "Unlocked"
      : `${remaining} min`;
  }
  if (percentText) {
    percentText.textContent = `${percent}%`;
  }
  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
  if (dailyGoalPercentText) {
    dailyGoalPercentText.textContent = `${dailyPercent}%`;
  }
  if (dailyGoalText) {
    dailyGoalText.textContent = `${dailyFocusMinutes} / ${dailyGoalMinutes} min`;
  }
  if (dailyGoalFill) {
    dailyGoalFill.style.width = `${dailyPercent}%`;
  }
}

async function loadState() {
  const response = await chrome.runtime.sendMessage({ type: "GET_SESSION_STATE" });
  const earnedMinutes = Number(response?.state?.earnedMinutes || 0);
  const quotaMinutes = Number(response?.settings?.quotaMinutes || 1);
  const unlocked = Boolean(response?.state?.unlocked);
  const dailyFocusMinutes = Number(response?.state?.dailyFocusMinutes || 0);
  const dailyGoalMinutes = Number(response?.settings?.dailyGoalMinutes || 120);
  setProgress({ earnedMinutes, quotaMinutes, unlocked, dailyFocusMinutes, dailyGoalMinutes });
}

loadState();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (!changes.state && !changes.settings) return;
  loadState();
});
