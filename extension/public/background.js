/**
 * background.js — Extension service worker
 *
 * Manages WebSocket connection to the Raceday backend for live data.
 * Runs in the background, relays updates to popup and content scripts.
 */

const BACKEND_URL = "http://localhost:8888";
let ws = null;
let liveData = null;

// Listen for messages from popup/content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_LIVE_DATA") {
    sendResponse({ data: liveData });
    return true;
  }

  if (msg.type === "GET_BACKEND_URL") {
    sendResponse({ url: BACKEND_URL });
    return true;
  }

  if (msg.type === "CONNECT_LIVE") {
    connectWebSocket(msg.sessionKey);
    sendResponse({ status: "connecting" });
    return true;
  }

  if (msg.type === "DISCONNECT_LIVE") {
    disconnectWebSocket();
    sendResponse({ status: "disconnected" });
    return true;
  }
});

function connectWebSocket(sessionKey) {
  if (ws) {
    ws.close();
  }

  const wsUrl = BACKEND_URL.replace("http", "ws") + `/ws/live/${sessionKey}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("[Raceday] WebSocket connected");
    broadcastToAll({ type: "WS_STATUS", status: "connected" });
  };

  ws.onmessage = (event) => {
    try {
      liveData = JSON.parse(event.data);
      broadcastToAll({ type: "LIVE_UPDATE", data: liveData });
    } catch (e) {
      console.error("[Raceday] Failed to parse WS message", e);
    }
  };

  ws.onclose = () => {
    console.log("[Raceday] WebSocket disconnected");
    broadcastToAll({ type: "WS_STATUS", status: "disconnected" });
    ws = null;
  };

  ws.onerror = (err) => {
    console.error("[Raceday] WebSocket error", err);
  };
}

function disconnectWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
  liveData = null;
}

function broadcastToAll(message) {
  // Send to all extension pages (popup, etc.)
  chrome.runtime.sendMessage(message).catch(() => {});
}
