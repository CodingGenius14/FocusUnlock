const OVERLAY_ID = "focusunlock-overlay";
let lastUrl = location.href;
let observerStarted = false;

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="focusunlock-card">
        <h1>FocusUnlock</h1>
        <p id="focusunlock-message">Loading status...</p>
      </div>
    `;
    document.documentElement.appendChild(overlay);
  }
  return overlay;
}

function removeOverlay() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.remove();
}

function updateOverlay(status) {
  if (!status.shouldBlock) {
    removeOverlay();
    return;
  }

  const overlay = ensureOverlay();
  const siteLabel = status.site || "this site";
  const message = `Earn ${status.remainingMinutes} more minute${
    status.remainingMinutes === 1 ? "" : "s"
  } to unlock ${siteLabel}.`;
  const messageElement = overlay.querySelector("#focusunlock-message");
  if (messageElement) {
    messageElement.textContent = message;
  }
}

async function refreshGateStatus(url = location.href) {
  try {
    const status = await chrome.runtime.sendMessage({
      type: "GET_GATE_STATUS",
      url
    });
    updateOverlay(status);
  } catch (error) {
    removeOverlay();
  }
}

function startSpaObserver() {
  if (observerStarted) return;
  observerStarted = true;

  const observer = new MutationObserver(async () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    try {
      const status = await chrome.runtime.sendMessage({
        type: "SPA_NAVIGATION",
        url: location.href
      });
      updateOverlay(status);
    } catch (error) {
      removeOverlay();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "STATE_UPDATED") {
    refreshGateStatus();
  }
});

refreshGateStatus();
startSpaObserver();
