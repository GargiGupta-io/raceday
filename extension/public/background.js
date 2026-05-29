/**
 * background.js - Extension service worker
 *
 * Owns backend settings, polling, demo mode, and update broadcasts.
 */

const DEFAULT_SETTINGS = {
  backendUrl: "https://web-production-b8406.up.railway.app",
  overlayEnabled: true,
  demoMode: false,
};

const DEMO_DATA = {
  active: true,
  lap: 25,
  totalLaps: 57,
  session: "Demo Grand Prix",
  drivers: [
    { code: "NOR", name: "Lando Norris", team: "McLaren", teamColour: "#ffffff", position: 1, gap: "LEADER", compound: "MEDIUM", stintAge: 21, pitWindow: "Lap 25-27", tyreLife: 35 },
    { code: "VER", name: "Max Verstappen", team: "Red Bull Racing", teamColour: "#ffffff", position: 2, gap: "+1.1", compound: "MEDIUM", stintAge: 21, pitWindow: "Lap 25-27", tyreLife: 33 },
    { code: "LEC", name: "Charles Leclerc", team: "Ferrari", teamColour: "#dc2626", position: 3, gap: "+3.6", compound: "HARD", stintAge: 13, pitWindow: null, tyreLife: 66 },
    { code: "PIA", name: "Oscar Piastri", team: "McLaren", teamColour: "#ffffff", position: 4, gap: "+7.8", compound: "MEDIUM", stintAge: 21, pitWindow: "Lap 25-28", tyreLife: 36 },
    { code: "HAM", name: "Lewis Hamilton", team: "Ferrari", teamColour: "#dc2626", position: 5, gap: "+10.2", compound: "HARD", stintAge: 1, pitWindow: null, tyreLife: 98 },
  ],
  predictions: [
    { driver: "NOR", prediction: "Pit L25-27 for Hard", confidence: "high" },
    { driver: "VER", prediction: "Pit L25-27 for Hard", confidence: "high" },
  ],
  whatIf: [
    { driver: "NOR", position: 1, pitNow: "P5", stayOut: "P2", recommendation: "pit" },
    { driver: "VER", position: 2, pitNow: "P6", stayOut: "P3", recommendation: "pit" },
  ],
  alerts: [
    { text: "Norris and Verstappen are inside the same pit window. Track position is now the pressure point.", type: "warning" },
    { text: "Hamilton has fresh hard tyres after the stop. Watch for an undercut attempt over the next two laps.", type: "opportunity" },
  ],
};

let settings = { ...DEFAULT_SETTINGS };
let liveData = null;
let pollInterval = null;
let connectionStatus = "checking";
const companionAnalysisCache = new Map();
const companionAnalysisPending = new Map();
const companionNoteCache = new Map();
const companionNotePending = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_LIVE_DATA") {
    const data = !settings.demoMode && isDemoSnapshot(liveData) ? null : liveData;
    const status = !settings.demoMode && connectionStatus === "demo" ? "no-session" : connectionStatus;
    sendResponse({ data, status, settings });
    return true;
  }

  if (msg.type === "GET_SETTINGS") {
    sendResponse({ settings, status: connectionStatus });
    return true;
  }

  if (msg.type === "GET_RACE_CONTEXT") {
    getRaceContext(msg.year, msg.track).then(sendResponse);
    return true;
  }

  if (msg.type === "GET_COMPANION_NOTE") {
    getCompanionNote(msg.context || {}).then(sendResponse);
    return true;
  }

  if (msg.type === "SAVE_SETTINGS") {
    saveSettings(msg.settings || {}).then(() => {
      sendResponse({ settings, status: connectionStatus });
    });
    return true;
  }

  if (msg.type === "START_POLLING") {
    startPolling();
    sendResponse({ status: connectionStatus });
    return true;
  }

  if (msg.type === "STOP_POLLING") {
    stopPolling();
    sendResponse({ status: connectionStatus });
    return true;
  }
});

async function loadSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  settings = { ...DEFAULT_SETTINGS, ...stored };
  if (!settings.backendUrl || settings.backendUrl === "http://localhost:8888") {
    settings.backendUrl = DEFAULT_SETTINGS.backendUrl;
    await chrome.storage.local.set({ backendUrl: settings.backendUrl });
  }
  if (settings.demoMode && !settings.overlayEnabled) {
    settings.overlayEnabled = true;
    await chrome.storage.local.set({ overlayEnabled: true });
  }
}

async function saveSettings(nextSettings) {
  settings = { ...settings, ...nextSettings };
  if (settings.demoMode) settings.overlayEnabled = true;
  if (!settings.demoMode && isDemoSnapshot(liveData)) liveData = null;
  await chrome.storage.local.set(settings);
  broadcastToAll({ type: "SETTINGS_UPDATE", settings });

  if (!settings.overlayEnabled) {
    stopPolling();
    return;
  }

  if (settings.demoMode) {
    liveData = DEMO_DATA;
    connectionStatus = "demo";
    broadcastToAll({ type: "WS_STATUS", status: connectionStatus });
    broadcastToAll({ type: "LIVE_UPDATE", data: liveData });
    startPolling();
    return;
  }

  liveData = null;
  connectionStatus = "checking";
  broadcastToAll({ type: "WS_STATUS", status: connectionStatus });
  broadcastToAll({ type: "LIVE_UPDATE", data: null });
  restartPolling();
}

async function fetchLiveData() {
  if (!settings.overlayEnabled) return;

  if (settings.demoMode) {
    liveData = DEMO_DATA;
    connectionStatus = "demo";
    broadcastToAll({ type: "WS_STATUS", status: connectionStatus });
    broadcastToAll({ type: "LIVE_UPDATE", data: liveData });
    return;
  }

  try {
    connectionStatus = "checking";
    broadcastToAll({ type: "WS_STATUS", status: connectionStatus });

    const base = settings.backendUrl.replace(/\/+$/, "");
    const resp = await fetch(`${base}/live`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();

    if (data.active) {
      liveData = data;
      connectionStatus = "connected";
      broadcastToAll({ type: "LIVE_UPDATE", data: liveData });
    } else {
      liveData = null;
      connectionStatus = "no-session";
      broadcastToAll({ type: "LIVE_UPDATE", data: null });
    }
    broadcastToAll({ type: "WS_STATUS", status: connectionStatus });
  } catch (e) {
    liveData = null;
    connectionStatus = "offline";
    broadcastToAll({ type: "LIVE_UPDATE", data: null });
    broadcastToAll({ type: "WS_STATUS", status: connectionStatus });
  }
}

function startPolling() {
  if (pollInterval) return;
  fetchLiveData();
  pollInterval = setInterval(fetchLiveData, 10000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  liveData = null;
  connectionStatus = "stopped";
  broadcastToAll({ type: "WS_STATUS", status: connectionStatus });
  broadcastToAll({ type: "LIVE_UPDATE", data: null });
}

function restartPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  startPolling();
}

function broadcastToAll(message) {
  try {
    const result = chrome.runtime.sendMessage(message);
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {
    // No active extension views to receive the message.
  }

  chrome.tabs?.query(
    {
      url: [
        "https://www.formula1.com/*",
        "https://f1tv.formula1.com/*",
        "https://www.youtube.com/*",
        "https://youtube.com/*",
      ],
    },
    (tabs) => {
      for (const tab of tabs || []) {
        if (!tab.id) continue;
        chrome.tabs.sendMessage(tab.id, message, () => {
          if (chrome.runtime.lastError) {
            // The tab may not have the RaceDay content script active yet.
          }
        });
      }
    },
  );
}

function isDemoSnapshot(data) {
  return data?.session === "Demo Grand Prix";
}

async function getRaceContext(year, track) {
  if (!year || !track) return { ok: false };

  const base = settings.backendUrl.replace(/\/+$/, "");
  const encodedTrack = encodeURIComponent(track);
  const endpoints = {
    moments: `${base}/races/${year}/${encodedTrack}/moments`,
    story: `${base}/races/${year}/${encodedTrack}/story`,
  };

  try {
    const [momentsResponse, storyResponse] = await Promise.allSettled([
      fetch(endpoints.moments, { signal: AbortSignal.timeout(6000) }),
      fetch(endpoints.story, { signal: AbortSignal.timeout(6000) }),
    ]);

    const moments = momentsResponse.status === "fulfilled" && momentsResponse.value.ok
      ? await momentsResponse.value.json()
      : [];
    const story = storyResponse.status === "fulfilled" && storyResponse.value.ok
      ? await storyResponse.value.json()
      : null;

    return { ok: true, moments, story };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

function companionContextKey(context) {
  return [
    context.url || "",
    context.title || "",
    context.year || "",
    context.track || context.raceName || "",
    context.chapter || "",
    context.mode || "replay",
  ].join("|");
}

function companionNoteKey(context) {
  return [
    companionContextKey(context),
    context.momentId || context.moment?.id || context.currentTime || 0,
    context.mode === "live"
      ? [
          context.liveState?.session || "",
          context.liveState?.lap || 0,
          context.liveState?.totalLaps || 0,
          context.liveState?.alerts?.[0]?.text || "",
          context.liveState?.predictions?.[0]?.driver || "",
          context.liveState?.drivers?.[0]?.position || "",
          context.liveState?.drivers?.[0]?.gap || "",
          context.liveState?.drivers?.[0]?.tyreLife || "",
          context.liveState?.drivers?.[1]?.position || "",
          context.liveState?.drivers?.[1]?.gap || "",
          context.liveState?.drivers?.[1]?.tyreLife || "",
        ].join(":")
      : "",
  ].join("::");
}

async function getCompanionAnalysis(context) {
  const key = companionContextKey(context);
  if (companionAnalysisCache.has(key)) return companionAnalysisCache.get(key);
  if (companionAnalysisPending.has(key)) return companionAnalysisPending.get(key);

  const pending = (async () => {
    const base = settings.backendUrl.replace(/\/+$/, "");
    try {
      const resp = await fetch(`${base}/companion/analyze-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(context),
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data?.ok) {
        companionAnalysisCache.set(key, data);
        return data;
      }
    } catch (error) {
      // Fall through to a null analysis. The content script will keep local notes.
    } finally {
      companionAnalysisPending.delete(key);
    }
    return null;
  })();

  companionAnalysisPending.set(key, pending);
  return pending;
}

async function getCompanionNote(context) {
  const key = companionNoteKey(context);
  if (companionNoteCache.has(key)) return companionNoteCache.get(key);
  if (companionNotePending.has(key)) return companionNotePending.get(key);

  const pending = (async () => {
    const base = settings.backendUrl.replace(/\/+$/, "");
    try {
      const analysis = await getCompanionAnalysis(context);
      const payload = {
        ...context,
        analysis,
        mode: context.mode || "replay",
      };

      if ((payload.mode || "replay") === "live") {
        payload.liveState = liveData;
      }

      const resp = await fetch(`${base}/companion/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data?.ok) {
        companionNoteCache.set(key, data);
        return data;
      }
    } catch (error) {
      // Return null and let the content script fall back to local replay notes.
    } finally {
      companionNotePending.delete(key);
    }
    return null;
  })();

  companionNotePending.set(key, pending);
  return pending;
}

chrome.runtime.onInstalled.addListener(() => {
  loadSettings().then(startPolling);
});

chrome.runtime.onStartup.addListener(() => {
  loadSettings().then(startPolling);
});

loadSettings().then(() => {
  if (settings.overlayEnabled) startPolling();
});
