/**
 * background.js — Extension service worker
 *
 * Manages connection to the Raceday backend for live data.
 * Polls the REST /live endpoint (WebSocket is available but
 * REST polling is simpler for extension service workers).
 * Relays updates to popup and content scripts.
 */

const BACKEND_URL = "http://localhost:8888";
let liveData = null;
let pollInterval = null;
let connectionStatus = "disconnected"; // "connected" | "disconnected" | "checking"

// Listen for messages from popup/content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_LIVE_DATA") {
    sendResponse({ data: liveData, status: connectionStatus });
    return true;
  }

  if (msg.type === "GET_BACKEND_URL") {
    sendResponse({ url: BACKEND_URL });
    return true;
  }

  if (msg.type === "START_POLLING") {
    startPolling();
    sendResponse({ status: "polling" });
    return true;
  }

  if (msg.type === "STOP_POLLING") {
    stopPolling();
    sendResponse({ status: "stopped" });
    return true;
  }
});

// Poll the /live REST endpoint
async function fetchLiveData() {
  try {
    const resp = await fetch(`${BACKEND_URL}/live`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();

    if (connectionStatus !== "connected") {
      connectionStatus = "connected";
      broadcastToAll({ type: "WS_STATUS", status: "connected" });
    }

    if (data.active) {
      liveData = data;
      broadcastToAll({ type: "LIVE_UPDATE", data: liveData });
    } else if (liveData !== null) {
      liveData = null;
      broadcastToAll({ type: "LIVE_UPDATE", data: null });
    }
  } catch (e) {
    if (connectionStatus !== "disconnected") {
      connectionStatus = "disconnected";
      broadcastToAll({ type: "WS_STATUS", status: "disconnected" });
    }
  }
}

function startPolling() {
  if (pollInterval) return; // already polling
  connectionStatus = "checking";
  fetchLiveData(); // immediate first fetch
  pollInterval = setInterval(fetchLiveData, 10000); // then every 10s
  console.log("[Raceday] Polling started");
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  liveData = null;
  connectionStatus = "disconnected";
  console.log("[Raceday] Polling stopped");
}

function broadcastToAll(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

// Auto-start polling on install/startup
chrome.runtime.onInstalled.addListener(() => {
  startPolling();
});

chrome.runtime.onStartup.addListener(() => {
  startPolling();
});

// Start immediately
startPolling();
