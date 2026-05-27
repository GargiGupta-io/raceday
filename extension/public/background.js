/**
 * background.js - Extension service worker
 *
 * Owns backend settings, polling, demo mode, and update broadcasts.
 */

const DEFAULT_SETTINGS = {
  backendUrl: "https://web-production-b8406.up.railway.app",
  overlayEnabled: true,
  overlayMode: "compact",
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_LIVE_DATA") {
    sendResponse({ data: liveData, status: connectionStatus, settings });
    return true;
  }

  if (msg.type === "GET_SETTINGS") {
    sendResponse({ settings, status: connectionStatus });
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
}

async function saveSettings(nextSettings) {
  settings = { ...settings, ...nextSettings };
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
