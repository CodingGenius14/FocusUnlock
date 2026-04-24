const TICK_ALARM_NAME = "focusunlock-minute-tick";
const USER_ID_STORAGE_KEY = "focusunlockUserId";
const LOCAL_BACKEND_BASE_URL = "http://127.0.0.1:3000";
const DEFAULTS = {
  settings: {
    workSites: ["github.com", "jira.com"],
    quotaMinutes: 30,
    allowAllWebsites: false,
    dailyGoalMinutes: 120,
    backendBaseUrl: LOCAL_BACKEND_BASE_URL
  },
  state: {
    earnedMinutes: 0,
    unlocked: false,
    completedSessionEvents: [],
    activeWindowId: null,
    activeTabId: null,
    activeUrl: "",
    currentSession: null,
    dailyFocusMinutes: 0,
    dailyFocusDate: "",
    lastTickAt: 0
  }
};

function normalizeSite(site) {
  if (!site) return "";
  return site.trim().toLowerCase().replace(/^www\./, "");
}

function hostFromUrl(url) {
  try {
    const host = new URL(url).hostname;
    return normalizeSite(host);
  } catch (error) {
    return "";
  }
}

function hostMatchesSite(host, site) {
  if (!host || !site) return false;
  return host === site || host.endsWith(`.${site}`);
}

function hostInList(host, sites) {
  return sites.some((site) => hostMatchesSite(host, normalizeSite(site)));
}

function normalizeBackendBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return LOCAL_BACKEND_BASE_URL;
  return raw.replace(/\/+$/, "");
}

function deriveUnlocked(state, settings) {
  return Boolean(state.unlocked) || Number(state.earnedMinutes || 0) >= Number(settings.quotaMinutes || 0);
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ensureDailyBucket(state) {
  const today = getTodayKey();
  if (state.dailyFocusDate === today) {
    return state;
  }
  return {
    ...state,
    dailyFocusMinutes: 0,
    dailyFocusDate: today
  };
}

async function getStorageSnapshot() {
  const data = await chrome.storage.local.get(["settings", "state"]);
  return {
    settings: { ...DEFAULTS.settings, ...(data.settings || {}) },
    state: { ...DEFAULTS.state, ...(data.state || {}) }
  };
}

async function getOrCreateUserId() {
  const data = await chrome.storage.local.get(USER_ID_STORAGE_KEY);
  const existing = String(data?.[USER_ID_STORAGE_KEY] || "").trim();
  if (existing) return existing;
  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `focusunlock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await chrome.storage.local.set({ [USER_ID_STORAGE_KEY]: generated });
  return generated;
}

async function initializeStorage() {
  const snapshot = await getStorageSnapshot();
  const state = ensureDailyBucket(snapshot.state);
  await getOrCreateUserId();
  await chrome.storage.local.set({
    settings: snapshot.settings,
    state
  });
}

async function createOrRefreshAlarm() {
  await chrome.alarms.clear(TICK_ALARM_NAME);
  await chrome.alarms.create(TICK_ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: 1
  });
}

async function getFocusedActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });
  if (!tab || !tab.id || !tab.windowId) return null;
  return tab;
}

async function isUserActivelyUsingBrowser() {
  if (!chrome.idle || typeof chrome.idle.queryState !== "function") {
    return true;
  }
  try {
    const state = await chrome.idle.queryState(60);
    return state === "active";
  } catch (error) {
    return true;
  }
}

async function postCompletedSession(session) {
  if (!session || session.durationMinutes <= 0) return;
  try {
    const userId = await getOrCreateUserId();
    const snapshot = await getStorageSnapshot();
    const backendBaseUrl = normalizeBackendBaseUrl(snapshot.settings.backendBaseUrl);
    await fetch(`${backendBaseUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        site: session.site,
        duration_minutes: session.durationMinutes,
        timestamp: new Date(session.endedAt).toISOString()
      })
    });
  } catch (error) {
    // Backend may be offline; extension should continue working.
  }
}

async function finalizeCurrentSession(state, endedAt) {
  if (!state.currentSession) return state;
  const current = state.currentSession;
  const durationMinutes = Number(current.accumulatedMinutes || 0);
  const endedSession = {
    site: current.site,
    durationMinutes,
    endedAt
  };
  const nextState = { ...state, currentSession: null };
  await chrome.storage.local.set({ state: nextState });
  await postCompletedSession(endedSession);
  return nextState;
}

async function maybeStartSession(state, host, now) {
  if (!host) return state;
  if (state.currentSession && state.currentSession.site === host) {
    return state;
  }

  let workingState = state;
  if (workingState.currentSession) {
    workingState = await finalizeCurrentSession(workingState, now);
  }

  const nextState = {
    ...workingState,
    currentSession: {
      site: host,
      startedAt: now,
      accumulatedMinutes: 0
    }
  };
  await chrome.storage.local.set({ state: nextState });
  return nextState;
}

async function updateActiveContextFromTab(tab) {
  const url = tab?.url || "";
  const host = hostFromUrl(url);
  const patch = {
    activeWindowId: tab?.windowId ?? null,
    activeTabId: tab?.id ?? null,
    activeUrl: url
  };

  const snapshot = await getStorageSnapshot();
  const settings = snapshot.settings;
  let state = { ...snapshot.state, ...patch };
  const isActive = await isUserActivelyUsingBrowser();

  if (settings.allowAllWebsites) {
    if (state.currentSession) {
      state = await finalizeCurrentSession(state, Date.now());
    }
    await chrome.storage.local.set({ state });
    await notifyAllTabsStateChanged();
    return;
  }

  if (!isActive) {
    if (state.currentSession) {
      state = await finalizeCurrentSession(state, Date.now());
    }
    await chrome.storage.local.set({ state });
    await notifyAllTabsStateChanged();
    return;
  }

  if (hostInList(host, settings.workSites)) {
    state = await maybeStartSession(state, host, Date.now());
  } else if (state.currentSession) {
    state = await finalizeCurrentSession(state, Date.now());
  }

  await chrome.storage.local.set({ state });
  await notifyAllTabsStateChanged();
}

async function clearActiveContext() {
  const snapshot = await getStorageSnapshot();
  let state = {
    ...snapshot.state,
    activeWindowId: null,
    activeTabId: null,
    activeUrl: ""
  };
  state = await finalizeCurrentSession(state, Date.now());
  await chrome.storage.local.set({ state });
  await notifyAllTabsStateChanged();
}

async function refreshActiveContext() {
  const tab = await getFocusedActiveTab();
  if (!tab) {
    await clearActiveContext();
    return;
  }
  await updateActiveContextFromTab(tab);
}

async function tickFocusTimer() {
  const snapshot = await getStorageSnapshot();
  const settings = snapshot.settings;
  let state = ensureDailyBucket(snapshot.state);
  const host = hostFromUrl(state.activeUrl);
  const now = Date.now();
  const isActive = await isUserActivelyUsingBrowser();

  if (settings.allowAllWebsites) {
    if (state.currentSession) {
      await finalizeCurrentSession(state, now);
    }
    return;
  }

  if (!isActive) {
    if (state.currentSession) {
      state = await finalizeCurrentSession(state, now);
      await notifyAllTabsStateChanged();
    }
    return;
  }

  if (!host || !hostInList(host, settings.workSites)) {
    if (state.currentSession) {
      state = await finalizeCurrentSession(state, now);
    }
    return;
  }

  if (Number(state.lastTickAt || 0) > 0 && now - Number(state.lastTickAt || 0) < 45000) {
    return;
  }

  const nextEarnedMinutes = Number(state.earnedMinutes || 0) + 1;
  const quotaMinutes = Math.max(1, Number(settings.quotaMinutes || 0));
  const reachedQuotaThisTick = nextEarnedMinutes >= quotaMinutes;
  const unlocked = reachedQuotaThisTick || Boolean(state.unlocked);
  const nextDailyFocusMinutes = Number(state.dailyFocusMinutes || 0) + 1;
  const currentSession = state.currentSession
    ? {
        ...state.currentSession,
        accumulatedMinutes: Number(state.currentSession.accumulatedMinutes || 0) + 1
      }
    : {
        site: host,
        startedAt: now,
        accumulatedMinutes: 1
      };

  const nextState = {
    ...state,
    earnedMinutes: reachedQuotaThisTick ? 0 : nextEarnedMinutes,
    unlocked,
    completedSessionEvents: reachedQuotaThisTick
      ? [
          ...(Array.isArray(state.completedSessionEvents) ? state.completedSessionEvents : []),
          { timestamp: new Date(now).toISOString(), quotaMinutes }
        ]
      : Array.isArray(state.completedSessionEvents)
        ? state.completedSessionEvents
        : [],
    currentSession,
    dailyFocusMinutes: nextDailyFocusMinutes,
    lastTickAt: now
  };

  await chrome.storage.local.set({ state: nextState });
  await notifyAllTabsStateChanged();
}

async function computeGateStatus(url) {
  const snapshot = await getStorageSnapshot();
  const settings = snapshot.settings;
  const state = snapshot.state;
  const host = hostFromUrl(url);
  const isWorkSite = hostInList(host, settings.workSites);
  const remainingMinutes = Math.max(
    0,
    Number(settings.quotaMinutes || 0) - Number(state.earnedMinutes || 0)
  );
  const unlocked = deriveUnlocked(state, settings);
  return {
    shouldBlock: !settings.allowAllWebsites && Boolean(host) && !isWorkSite && !unlocked && remainingMinutes > 0,
    unlocked,
    remainingMinutes,
    earnedMinutes: Number(state.earnedMinutes || 0),
    quotaMinutes: Number(settings.quotaMinutes || 0),
    site: host
  };
}

async function notifyAllTabsStateChanged() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) return;
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "STATE_UPDATED" });
      } catch (error) {
        // Ignore tabs without content script access.
      }
    })
  );
}

chrome.runtime.onInstalled.addListener(async () => {
  await initializeStorage();
  await createOrRefreshAlarm();
  await refreshActiveContext();
});

chrome.runtime.onStartup.addListener(async () => {
  const snapshot = await getStorageSnapshot();
  const state = ensureDailyBucket(snapshot.state);
  await chrome.storage.local.set({
    settings: snapshot.settings,
    state: {
      ...state,
      earnedMinutes: 0,
      unlocked: false,
      currentSession: null
    }
  });
  await createOrRefreshAlarm();
  await refreshActiveContext();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== TICK_ALARM_NAME) return;
  await refreshActiveContext();
  await tickFocusTimer();
});

chrome.tabs.onActivated.addListener(async () => {
  await refreshActiveContext();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "complete") return;
  const snapshot = await getStorageSnapshot();
  if (tabId === snapshot.state.activeTabId) {
    await updateActiveContextFromTab(tab);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const snapshot = await getStorageSnapshot();
  if (tabId !== snapshot.state.activeTabId) return;
  await clearActiveContext();
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await clearActiveContext();
    return;
  }
  await refreshActiveContext();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "GET_GATE_STATUS") {
      const status = await computeGateStatus(message.url);
      sendResponse(status);
      return;
    }

    if (message?.type === "GET_SESSION_STATE") {
      const snapshot = await getStorageSnapshot();
      sendResponse({
        settings: snapshot.settings,
        state: snapshot.state
      });
      return;
    }

    if (message?.type === "SPA_NAVIGATION") {
      await refreshActiveContext();
      const status = await computeGateStatus(message.url);
      sendResponse(status);
      return;
    }

    if (message?.type === "SAVE_SETTINGS") {
      const incoming = message.settings || {};
      const snapshot = await getStorageSnapshot();
      const currentSettings = snapshot.settings;
      const nextSettings = {
        workSites:
          incoming.workSites === undefined
            ? currentSettings.workSites
            : Array.isArray(incoming.workSites)
          ? incoming.workSites.map(normalizeSite).filter(Boolean)
          : DEFAULTS.settings.workSites,
        quotaMinutes: Math.max(
          1,
          Number(
            incoming.quotaMinutes ?? currentSettings.quotaMinutes ?? DEFAULTS.settings.quotaMinutes
          )
        ),
        allowAllWebsites:
          incoming.allowAllWebsites === undefined
            ? Boolean(currentSettings.allowAllWebsites)
            : Boolean(incoming.allowAllWebsites),
        dailyGoalMinutes: Math.max(
          1,
          Number(
            incoming.dailyGoalMinutes ??
              currentSettings.dailyGoalMinutes ??
              DEFAULTS.settings.dailyGoalMinutes
          )
        ),
        backendBaseUrl: normalizeBackendBaseUrl(
          incoming.backendBaseUrl ?? currentSettings.backendBaseUrl ?? DEFAULTS.settings.backendBaseUrl
        )
      };
      const currentState = ensureDailyBucket(snapshot.state);
      let nextState = {
        ...currentState,
        unlocked: deriveUnlocked(currentState, nextSettings)
      };

      if (nextSettings.allowAllWebsites && nextState.currentSession) {
        nextState = await finalizeCurrentSession(nextState, Date.now());
      }

      await chrome.storage.local.set({
        settings: nextSettings,
        state: nextState
      });
      await refreshActiveContext();
      await notifyAllTabsStateChanged();
      sendResponse({ ok: true, settings: nextSettings });
      return;
    }

    if (message?.type === "RESET_SESSION") {
      const snapshot = await getStorageSnapshot();
      const state = ensureDailyBucket(snapshot.state);
      const resetState = {
        ...state,
        earnedMinutes: 0,
        unlocked: false,
        currentSession: null,
        lastTickAt: 0
      };
      await chrome.storage.local.set({ state: resetState });
      await refreshActiveContext();
      await notifyAllTabsStateChanged();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "FLUSH_CURRENT_SESSION") {
      const snapshot = await getStorageSnapshot();
      const state = ensureDailyBucket(snapshot.state);
      const nextState = await finalizeCurrentSession(state, Date.now());
      await chrome.storage.local.set({ state: nextState });
      await notifyAllTabsStateChanged();
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false });
  })();

  return true;
});

// Ensure alarm exists if worker wakes without install/startup event.
createOrRefreshAlarm();
