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
        ${data ? `<span class="raceday-lap">Lap ${data.lap}</span>` : context.lapText ? `<span class="raceday-lap">${escapeHtml(context.lapText)}</span>` : ""}
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
    if (context.isF1Video && context.raceName) return `${context.raceName}: ${context.phaseLabel}`;
    if (context.isF1Video) return `F1 replay: ${context.phaseLabel}`;
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
      return replayStrategyNotes(context);
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
    const video = document.querySelector("video");
    const progress = video && Number.isFinite(video.duration) && video.duration > 0
      ? Math.max(0, Math.min(1, video.currentTime / video.duration))
      : 0;
    const race = detectRace(title);
    const estimatedLap = race?.laps ? Math.max(1, Math.min(race.laps, Math.round(progress * race.laps) || 1)) : null;
    const phase = racePhase(progress);

    return {
      title,
      isVideoPage,
      isF1Video: isVideoPage && f1Pattern.test(title),
      year: detectYear(title),
      raceName: race?.name || "",
      totalLaps: race?.laps || null,
      estimatedLap,
      lapText: estimatedLap && race?.laps ? `~Lap ${estimatedLap}/${race.laps}` : "",
      phase,
      phaseLabel: phase.label,
    };
  }

  function detectYear(title) {
    return title.match(/\b20\d{2}\b/)?.[0] || "";
  }

  function detectRace(title) {
    const normalized = title.toLowerCase();
    const races = [
      { keys: ["australian", "australia", "melbourne"], name: "Australian GP", laps: 58 },
      { keys: ["chinese", "china", "shanghai"], name: "Chinese GP", laps: 56 },
      { keys: ["japanese", "japan", "suzuka"], name: "Japanese GP", laps: 53 },
      { keys: ["bahrain", "sakhir"], name: "Bahrain GP", laps: 57 },
      { keys: ["saudi", "jeddah"], name: "Saudi Arabian GP", laps: 50 },
      { keys: ["miami"], name: "Miami GP", laps: 57 },
      { keys: ["emilia", "imola"], name: "Emilia Romagna GP", laps: 63 },
      { keys: ["monaco", "monte carlo"], name: "Monaco GP", laps: 78 },
      { keys: ["canadian", "canada", "montreal"], name: "Canadian GP", laps: 70 },
      { keys: ["spanish", "spain", "barcelona"], name: "Spanish GP", laps: 66 },
      { keys: ["austrian", "austria", "spielberg"], name: "Austrian GP", laps: 71 },
      { keys: ["british", "silverstone"], name: "British GP", laps: 52 },
      { keys: ["hungarian", "hungary", "hungaroring"], name: "Hungarian GP", laps: 70 },
      { keys: ["belgian", "belgium", "spa"], name: "Belgian GP", laps: 44 },
      { keys: ["dutch", "netherlands", "zandvoort"], name: "Dutch GP", laps: 72 },
      { keys: ["italian", "monza"], name: "Italian GP", laps: 53 },
      { keys: ["azerbaijan", "baku"], name: "Azerbaijan GP", laps: 51 },
      { keys: ["singapore", "marina bay"], name: "Singapore GP", laps: 62 },
      { keys: ["united states", "austin", "cota"], name: "United States GP", laps: 56 },
      { keys: ["mexico", "mexican"], name: "Mexico City GP", laps: 71 },
      { keys: ["brazil", "sao paulo", "interlagos"], name: "Sao Paulo GP", laps: 71 },
      { keys: ["las vegas", "vegas"], name: "Las Vegas GP", laps: 50 },
      { keys: ["qatar", "lusail"], name: "Qatar GP", laps: 57 },
      { keys: ["abu dhabi", "yas marina"], name: "Abu Dhabi GP", laps: 58 },
    ];

    return races.find((race) => race.keys.some((key) => normalized.includes(key)));
  }

  function racePhase(progress) {
    if (progress < 0.18) return { id: "start", label: "race start" };
    if (progress < 0.38) return { id: "early", label: "early strategy window" };
    if (progress < 0.66) return { id: "middle", label: "middle stint pressure" };
    if (progress < 0.86) return { id: "late", label: "late-race strategy" };
    return { id: "finish", label: "finish phase" };
  }

  function replayStrategyNotes(context) {
    const raceText = context.raceName ? ` in the ${context.raceName}` : "";
    const lapText = context.estimatedLap && context.totalLaps
      ? `RaceDay estimates this highlight is around lap ${context.estimatedLap} of ${context.totalLaps}.`
      : "RaceDay cannot read the exact lap from YouTube video pixels yet, so it estimates from the video timeline.";

    if (context.phase.id === "start") {
      return [
        lapText,
        `This is the launch phase${raceText}. Track position matters most because cars are still close together.`,
        "Watch who keeps clean air, who gets trapped behind traffic, and whether anyone has early tyre damage.",
      ];
    }

    if (context.phase.id === "early") {
      return [
        lapText,
        "This is where teams start choosing between stopping early for fresh tyres or staying out for track position.",
        "A driver who stops early can gain time if the fresh tyres are much faster.",
      ];
    }

    if (context.phase.id === "middle") {
      return [
        lapText,
        "This is usually the main strategy fight. Tyres are older, gaps matter, and pit timing can decide positions.",
        "If two drivers are close before a stop, the first clean pit stop can flip the order.",
      ];
    }

    if (context.phase.id === "late") {
      return [
        lapText,
        "Late in the race, fresh tyres can attack but track position is harder to recover.",
        "Watch for drivers closing quickly or defending with worn tyres.",
      ];
    }

    return [
      lapText,
      "The final laps are usually about tyre life, pressure, and mistakes.",
      "A small lock-up, traffic, or poor exit can decide the finish when gaps are tight.",
    ];
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
