/**
 * content.js - injected RaceDay companion overlay
 *
 * Renders small beginner-friendly strategy notes on supported race videos.
 */

(async function () {
  const existing = document.getElementById("raceday-overlay");
  if (existing) existing.remove();

  const DEFAULT_SETTINGS = {
    overlayEnabled: true,
    overlayMode: "full",
    demoMode: false,
  };

  let settings = { ...DEFAULT_SETTINGS };
  let liveData = null;
  let connectionStatus = "checking";
  let dragState = { dragging: false, offsetX: 0, offsetY: 0 };
  let lastVideoKey = "";

  const overlay = document.createElement("div");
  overlay.id = "raceday-overlay";
  document.body.appendChild(overlay);

  await loadInitialState();
  attachToBestContainer();
  render();

  async function loadInitialState() {
    const stored = await chrome.storage.local.get({ ...DEFAULT_SETTINGS, overlayPosition: null });
    settings = { ...DEFAULT_SETTINGS, ...stored, overlayMode: "full" };
    applyStoredPosition(stored.overlayPosition);

    refreshLiveData();
  }

  function refreshLiveData() {
    chrome.runtime.sendMessage({ type: "GET_LIVE_DATA" }, (response) => {
      if (response?.settings) settings = { ...settings, ...response.settings, overlayMode: "full" };
      if (response?.status) connectionStatus = response.status;
      const nextData = response?.data || null;
      liveData = !settings.demoMode && isDemoSnapshot(nextData) ? null : nextData;
      if (!settings.demoMode && connectionStatus === "demo") connectionStatus = "no-session";
      render();
    });
  }

  function applyStoredPosition(position) {
    if (!position) return;
    overlay.style.left = `${position.x}px`;
    overlay.style.top = `${position.y}px`;
    overlay.style.right = "auto";
    overlay.style.bottom = "auto";
  }

  function attachToBestContainer() {
    const target = document.fullscreenElement || document.body;
    if (overlay.parentElement !== target) target.appendChild(overlay);
  }

  function render() {
    attachToBestContainer();
    overlay.style.display = settings.overlayEnabled ? "block" : "none";
    overlay.className = "raceday-panel raceday-full";

    const data = isDemoSnapshot(liveData) && !settings.demoMode ? null : liveData;
    const context = videoContext();
    const notes = data ? beginnerNotes(data) : [];
    const headline = data ? notes[0] : replayHeadline(context);
    const detailNotes = data ? notes.slice(1, 4) : replayCompanionNotes(context);
    const sessionLabel = data ? "RaceDay live companion" : "RaceDay replay companion";

    overlay.innerHTML = `
      <div class="raceday-header" id="raceday-header">
        <span class="raceday-logo">RD</span>
        <span class="raceday-session">${sessionLabel}</span>
        ${data ? `<span class="raceday-lap">Lap ${data.lap}</span>` : ""}
        <span class="raceday-status-dot ${settings.demoMode ? "raceday-dot-demo" : ""}"></span>
      </div>
      <div class="raceday-body">
        ${data ? `
          <div class="raceday-main-note">${escapeHtml(headline)}</div>
          ${detailNotes.length > 0 ? `
            <div class="raceday-note-list">
              ${detailNotes.map((note) => `<div class="raceday-note-item">${escapeHtml(note)}</div>`).join("")}
            </div>
          ` : ""}
          ${settings.demoMode && connectionStatus === "demo" ? `<div class="raceday-demo-label">Demo race preview</div>` : ""}
        ` : renderIdleContent(context, headline, detailNotes)}
      </div>
    `;

    document.getElementById("raceday-header")?.addEventListener("mousedown", startDrag);
  }

  function beginnerNotes(data) {
    const notes = [];
    const alerts = data.alerts || [];
    const predictions = data.predictions || [];
    const drivers = data.drivers || [];
    const whatIf = data.whatIf || [];

    for (const alert of alerts) {
      const translated = beginnerAlert(alert.text);
      if (translated) notes.push(translated);
    }

    for (const prediction of predictions) {
      const driver = driverName(prediction.driver, drivers);
      notes.push(`${driver} may stop soon for fresh tyres.`);
    }

    for (const driver of drivers) {
      if (driver.tyreLife <= 35) {
        notes.push(`${driver.name || driver.code}'s tyres are fading, so they may slow down soon.`);
      }
    }

    for (const item of whatIf) {
      if (item.recommendation === "pit") {
        notes.push(`${driverName(item.driver, drivers)} could gain by stopping now.`);
      }
      if (item.recommendation === "stay") {
        notes.push(`${driverName(item.driver, drivers)} may be better staying out for track position.`);
      }
    }

    if (notes.length === 0 && data.lap && data.totalLaps) {
      notes.push("RaceDay is watching for pit stops, tyre trouble, and strategy changes.");
    }

    return dedupe(notes).slice(0, 4);
  }

  function beginnerAlert(text) {
    const clean = String(text || "").trim();
    if (!clean) return "";

    if (/same pit window/i.test(clean)) {
      return "Two close drivers may stop soon, and the first stop could change who is ahead.";
    }
    if (/tyre cliff|tires? are fading|tyres? are fading/i.test(clean)) {
      const driver = clean.split(" ")[0];
      return `${driver}'s tyres are fading, so they may slow down soon.`;
    }
    if (/undercut|stopped earlier/i.test(clean)) {
      const driver = clean.split(" ")[0];
      return `${driver} stopped earlier and may gain time while others stay out.`;
    }
    if (/fresh/i.test(clean) && /behind|attack/i.test(clean)) {
      return "A driver on fresher tyres may start catching the cars ahead.";
    }

    return clean
      .replace(/\bpit window\b/gi, "stop window")
      .replace(/\bundercut\b/gi, "early stop advantage")
      .replace(/\btyre cliff\b/gi, "tyres fading")
      .replace(/\bcompound\b/gi, "tyre type");
  }

  function driverName(code, drivers) {
    const driver = drivers.find((entry) => entry.code === code);
    return driver?.name?.split(" ")[0] || code;
  }

  function dedupe(notes) {
    return Array.from(new Set(notes));
  }

  function renderIdleContent(context, headline, replayNotes) {
    return `
      <div class="raceday-main-note">${escapeHtml(headline)}</div>
      ${context.title ? `<div class="raceday-video-title">${escapeHtml(context.title)}</div>` : ""}
      <div class="raceday-note-list">
        ${replayNotes.map((note) => `<div class="raceday-note-item">${escapeHtml(note)}</div>`).join("")}
      </div>
    `;
  }

  function replayHeadline(context) {
    if (settings.demoMode) return "Demo race is running.";
    if (connectionStatus === "stopped") return "RaceDay notes are hidden.";
    if (context.isF1Video) return "RaceDay detected this F1 video.";
    if (context.isVideoPage) return "RaceDay detected this video.";
    return "Open an F1 video and RaceDay will follow along.";
  }

  function replayCompanionNotes(context) {
    if (!context.isVideoPage) {
      return [
        "Open a race, replay, highlight, qualifying, sprint, or onboard video.",
        "RaceDay will show simple strategy notes over the video.",
      ];
    }

    if (context.isF1Video) {
      return [
        "Watch the first pit stops. Fresh tyres can quickly change who is under pressure.",
        "If a safety car, rain, or traffic appears, the best strategy can change fast.",
        "When live race data is active, RaceDay will switch into real-time strategy notes automatically.",
      ];
    }

    return [
      "This video does not look like an F1 race yet.",
      "RaceDay works best on F1 race highlights, replays, qualifying, sprints, and onboard videos.",
      "Demo mode still shows the strategy-note style anytime.",
    ];
  }

  function isDemoSnapshot(data) {
    return data?.session === "Demo Grand Prix";
  }

  function currentVideoTitle() {
    return (
      document.querySelector("h1 yt-formatted-string")?.textContent ||
      document.querySelector("h1")?.textContent ||
      document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
      document.title ||
      ""
    ).replace(/\s+-\s+YouTube$/i, "").trim();
  }

  function videoContext() {
    const title = currentVideoTitle();
    const url = new URL(window.location.href);
    const isYouTube = /(^|\.)youtube\.com$/i.test(url.hostname);
    const isVideoPage = isYouTube ? url.pathname === "/watch" && Boolean(url.searchParams.get("v")) : true;
    const f1Pattern = /formula\s*1|formula one|\bf1\b|grand prix|\bgp\b|race highlights|qualifying|sprint|onboard|verstappen|hamilton|leclerc|norris|piastri|ferrari|mclaren|red bull|mercedes/i;

    return {
      title,
      isVideoPage,
      isF1Video: isVideoPage && f1Pattern.test(title),
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function startDrag(event) {
    dragState.dragging = true;
    dragState.offsetX = event.clientX - overlay.getBoundingClientRect().left;
    dragState.offsetY = event.clientY - overlay.getBoundingClientRect().top;
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    overlay.style.transition = "none";
  }

  function onDrag(event) {
    if (!dragState.dragging) return;
    const x = Math.max(0, Math.min(window.innerWidth - overlay.offsetWidth, event.clientX - dragState.offsetX));
    const y = Math.max(0, Math.min(window.innerHeight - overlay.offsetHeight, event.clientY - dragState.offsetY));
    overlay.style.left = `${x}px`;
    overlay.style.top = `${y}px`;
    overlay.style.right = "auto";
    overlay.style.bottom = "auto";
  }

  function stopDrag() {
    dragState.dragging = false;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
    overlay.style.transition = "";
    chrome.storage.local.set({
      overlayPosition: {
        x: overlay.getBoundingClientRect().left,
        y: overlay.getBoundingClientRect().top,
      },
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "LIVE_UPDATE") {
      const nextData = msg.data || null;
      liveData = !settings.demoMode && isDemoSnapshot(nextData) ? null : nextData;
      render();
    }
    if (msg.type === "WS_STATUS") {
      connectionStatus = !settings.demoMode && msg.status === "demo" ? "no-session" : msg.status;
      render();
    }
    if (msg.type === "SETTINGS_UPDATE") {
      settings = { ...settings, ...msg.settings, overlayMode: "full" };
      if (!settings.demoMode) {
        liveData = null;
        if (connectionStatus === "demo") connectionStatus = "no-session";
      }
      render();
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const nextSettings = { ...settings };
    for (const key of ["overlayEnabled", "overlayMode", "demoMode"]) {
      if (changes[key]) nextSettings[key] = changes[key].newValue;
    }
    settings = { ...nextSettings, overlayMode: "full" };
    if (!settings.demoMode) {
      liveData = null;
      if (connectionStatus === "demo") connectionStatus = "no-session";
    }
    render();
    setTimeout(refreshLiveData, 250);
  });

  setInterval(refreshLiveData, 5000);

  setInterval(() => {
    const nextVideoKey = `${location.href}|${currentVideoTitle()}`;
    if (nextVideoKey === lastVideoKey) return;
    lastVideoKey = nextVideoKey;
    render();
  }, 1000);

  document.addEventListener("fullscreenchange", () => {
    attachToBestContainer();
    render();
  });
})();
