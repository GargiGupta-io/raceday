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
  const transcriptState = {
    lastText: "",
    recent: [],
  };
  const raceContextCache = new Map();
  const raceContextPending = new Set();
  const backendCompanionCache = new Map();
  const backendCompanionPending = new Set();

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
    loadRaceContext(context);
    loadBackendCompanion(context, data);
    const replayBackend = cachedBackendCompanion(context);
    const notes = data ? beginnerNotes(data, context) : [];
    const backendNotes = data ? backendCompanionNotes(context, data) : [];
    const liveNotes = data && backendNotes.length ? backendNotes : notes;
    const headline = data ? liveNotes[0] : replayHeadline(context, replayBackend);
    const detailNotes = data ? liveNotes.slice(1, 5) : replayDetailNotes(context, replayBackend);
    const sessionLabel = "RaceDay companion";
    const headerContext = data
      ? `Lap ${data.lap}`
      : replayHeaderContext(context, replayBackend);

    overlay.innerHTML = `
      <div class="raceday-header" id="raceday-header">
        <span class="raceday-logo">RD</span>
        <span class="raceday-session">${sessionLabel}</span>
        ${headerContext ? `<span class="raceday-moment">${escapeHtml(headerContext)}</span>` : ""}
        <button class="raceday-close" id="raceday-close" type="button" aria-label="Close RaceDay companion">&times;</button>
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
    document.getElementById("raceday-close")?.addEventListener("click", closeOverlay);
  }

  function beginnerNotes(data, context = null) {
    const notes = [];
    const alerts = data.alerts || [];
    const predictions = data.predictions || [];
    const drivers = data.drivers || [];
    const whatIf = data.whatIf || [];
    const raceData = context ? cachedRaceContext(context) : null;

    if (raceData?.story?.headline) {
      notes.push(beginnerize(raceData.story.headline));
    }
    if (Array.isArray(raceData?.story?.narrative)) {
      const narrative = raceData.story.narrative.find(Boolean);
      if (narrative) notes.push(beginnerize(narrative));
    }

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

  function replayHeadline(context, backendNote = null) {
    if (settings.demoMode) return "Demo race is running.";
    if (connectionStatus === "stopped") return "RaceDay notes are hidden.";
    if (backendNote?.headline) return backendNote.headline;
    const raceData = cachedRaceContext(context);
    const storyHeadline = raceData?.story?.headline || raceData?.story?.narrative?.[0];
    if (storyHeadline) return beginnerize(storyHeadline);
    if (context.chapterTitle && context.raceName) return `${context.raceName}: ${context.chapterTitle}`;
    if (context.chapterTitle) return `F1 replay: ${context.chapterTitle}`;
    if (context.isF1Video && context.raceName) return `${context.raceName}`;
    if (context.isF1Video) return "F1 replay";
    if (context.isVideoPage) return "RaceDay detected this video.";
    return "Open an F1 video and RaceDay will follow along.";
  }

  function replayHeaderContext(context, backendNote = null) {
    if (backendNote?.momentLabel) return backendNote.momentLabel;
    const raceData = cachedRaceContext(context);
    const storyHeadline = raceData?.story?.headline || raceData?.story?.narrative?.[0];
    if (storyHeadline) return beginnerize(storyHeadline);
    if (context.chapterTitle) return context.chapterTitle;
    if (context.isF1Video && context.raceName) return context.raceName;
    if (context.isF1Video) return "F1 replay";
    return "";
  }

  function replayDetailNotes(context, backendNote = null) {
    const backendNotes = backendNote?.notes?.length
      ? backendNote.notes
      : backendReplayNotes(context);
    if (backendNotes.length) return backendNotes.slice(0, 4);
    return replayCompanionNotes(context);
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
    const phase = racePhase(progress);
    const moment = replayMoment(progress);
    const chapterTitle = currentChapterTitle();
    const transcriptText = currentTranscriptText();

    return {
      title,
      isVideoPage,
      isF1Video: isVideoPage && f1Pattern.test(title),
      year: detectYear(title),
      raceName: race?.name || "",
      track: race?.track || "",
      totalLaps: race?.laps || null,
      phase,
      phaseLabel: phase.label,
      moment,
      chapterTitle,
      transcriptText,
    };
  }

  function detectYear(title) {
    return title.match(/\b20\d{2}\b/)?.[0] || "";
  }

  function detectRace(title) {
    const normalized = title.toLowerCase();
    const races = [
      { keys: ["australian", "australia", "melbourne"], name: "Australian GP", track: "Australian Grand Prix", laps: 58 },
      { keys: ["chinese", "china", "shanghai"], name: "Chinese GP", track: "Chinese Grand Prix", laps: 56 },
      { keys: ["japanese", "japan", "suzuka"], name: "Japanese GP", track: "Japanese Grand Prix", laps: 53 },
      { keys: ["bahrain", "sakhir"], name: "Bahrain GP", track: "Bahrain Grand Prix", laps: 57 },
      { keys: ["saudi", "jeddah"], name: "Saudi Arabian GP", track: "Saudi Arabian Grand Prix", laps: 50 },
      { keys: ["miami"], name: "Miami GP", track: "Miami Grand Prix", laps: 57 },
      { keys: ["emilia", "imola"], name: "Emilia Romagna GP", track: "Emilia Romagna Grand Prix", laps: 63 },
      { keys: ["monaco", "monte carlo"], name: "Monaco GP", track: "Monaco Grand Prix", laps: 78 },
      { keys: ["canadian", "canada", "montreal"], name: "Canadian GP", track: "Canadian Grand Prix", laps: 70 },
      { keys: ["spanish", "spain", "barcelona"], name: "Spanish GP", track: "Spanish Grand Prix", laps: 66 },
      { keys: ["austrian", "austria", "spielberg"], name: "Austrian GP", track: "Austrian Grand Prix", laps: 71 },
      { keys: ["british", "silverstone"], name: "British GP", track: "British Grand Prix", laps: 52 },
      { keys: ["hungarian", "hungary", "hungaroring"], name: "Hungarian GP", track: "Hungarian Grand Prix", laps: 70 },
      { keys: ["belgian", "belgium", "spa"], name: "Belgian GP", track: "Belgian Grand Prix", laps: 44 },
      { keys: ["dutch", "netherlands", "zandvoort"], name: "Dutch GP", track: "Dutch Grand Prix", laps: 72 },
      { keys: ["italian", "monza"], name: "Italian GP", track: "Italian Grand Prix", laps: 53 },
      { keys: ["azerbaijan", "baku"], name: "Azerbaijan GP", track: "Azerbaijan Grand Prix", laps: 51 },
      { keys: ["singapore", "marina bay"], name: "Singapore GP", track: "Singapore Grand Prix", laps: 62 },
      { keys: ["united states", "austin", "cota"], name: "United States GP", track: "United States Grand Prix", laps: 56 },
      { keys: ["mexico", "mexican"], name: "Mexico City GP", track: "Mexico City Grand Prix", laps: 71 },
      { keys: ["brazil", "sao paulo", "interlagos"], name: "Sao Paulo GP", track: "São Paulo Grand Prix", laps: 71 },
      { keys: ["las vegas", "vegas"], name: "Las Vegas GP", track: "Las Vegas Grand Prix", laps: 50 },
      { keys: ["qatar", "lusail"], name: "Qatar GP", track: "Qatar Grand Prix", laps: 57 },
      { keys: ["abu dhabi", "yas marina"], name: "Abu Dhabi GP", track: "Abu Dhabi Grand Prix", laps: 58 },
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

  function replayMoment(progress) {
    if (progress < 0.08) return { id: "lights", label: "race start", step: 0 };
    if (progress < 0.18) return { id: "settle", label: "opening laps", step: 1 };
    if (progress < 0.30) return { id: "first-window", label: "first pit choices", step: 2 };
    if (progress < 0.42) return { id: "undercut", label: "undercut threat", step: 3 };
    if (progress < 0.54) return { id: "middle-stint", label: "middle stint", step: 4 };
    if (progress < 0.66) return { id: "second-window", label: "second strategy window", step: 5 };
    if (progress < 0.78) return { id: "late-attack", label: "late attack", step: 6 };
    if (progress < 0.90) return { id: "defend", label: "defending phase", step: 7 };
    return { id: "finish", label: "final laps", step: 8 };
  }

  function replayStrategyNotes(context) {
    const backendNotes = backendCompanionNotes(context);
    const raceNotes = backendNotes.length ? backendNotes : backendReplayNotes(context);
    if (raceNotes.length) {
      return dedupe([...raceNotes, ...chapterReplayNotes(context)]).slice(0, 4);
    }

    return localReplayStrategyNotes(context);
  }

  function localReplayStrategyNotes(context) {
    const raceData = cachedRaceContext(context);
    const raceText = context.raceName ? ` in the ${context.raceName}` : "";
    const narrative = Array.isArray(raceData?.story?.narrative) ? raceData.story.narrative : [];
    const moments = Array.isArray(raceData?.moments) ? raceData.moments : [];
    const pickedMoment = moments[Math.min(context.moment.step, moments.length - 1)] || null;
    const notesByMoment = {
      lights: [
        `The field is still packed${raceText}, so one small mistake can change the order fast.`,
        "Clean air matters because it lets a driver settle and save the tyres.",
        "A bad launch or wheel-to-wheel fight can rewrite the whole race early.",
      ],
      settle: [
        "The race is settling, and teams are starting to learn who has real pace.",
        "Following another car closely can overheat the tyres and make the next attack harder.",
        "Clean air is calmer for the driver and easier on the tyres.",
      ],
      "first-window": [
        "The first strategy decisions are starting to matter.",
        "A stop now can give a speed boost, but it can also drop the car into traffic.",
        "Waiting keeps track position, but older tyres can start to fade fast.",
      ],
      undercut: [
        "An early stop can flip the order if the fresh tyres are much faster.",
        "The gain only works if the car rejoins in clean air.",
        "If the driver gets stuck behind traffic, the stop loses its edge.",
      ],
      "middle-stint": [
        "The race is now about gaps, tyre age, and who can keep the pace alive.",
        "A small gap can matter a lot if a pit stop puts a driver in traffic.",
        "Watch who is pulling away and who is protecting worn tyres.",
      ],
      "second-window": [
        "Teams are deciding whether to stop again or stretch the tyres to the flag.",
        "A second stop can bring speed, but the driver has to earn back the lost track position.",
        "A one-stop call only works if the tyres can survive the pressure.",
      ],
      "late-attack": [
        "Fresh tyres are dangerous here because there is less time to answer back.",
        "A driver closing fast can force the car ahead into defence mode.",
        "Tyre life now turns directly into pressure.",
      ],
      defend: [
        "The battle is now about who can hold position under pressure.",
        "The attacker needs speed, while the defender needs clean exits and no mistakes.",
        "Traffic or one bad corner can decide the fight.",
      ],
      finish: [
        "The final laps are about pressure, mistakes, and tyre survival.",
        "If the gaps are tight, one lock-up or poor exit can change the result.",
        "At this point, execution matters more than the plan.",
      ],
    };

    const raceNotes = [];
    if (pickedMoment?.headline) raceNotes.push(beginnerize(pickedMoment.headline));
    if (pickedMoment?.detail) raceNotes.push(beginnerize(pickedMoment.detail));
    if (narrative.length) {
      const narrativeIndex = Math.min(context.moment.step, narrative.length - 1);
      const line = narrative[narrativeIndex];
      if (line) raceNotes.push(beginnerize(line));
    }

    if (raceNotes.length) {
      return dedupe(raceNotes).slice(0, 3);
    }

    return notesByMoment[context.moment.id] || notesByMoment["middle-stint"];
  }

  function chapterReplayNotes(context) {
    if (!context.chapterTitle) return [];
    return [
      `This part of the video is about ${context.chapterTitle.toLowerCase()}. Watch how it changes the strategy picture.`,
    ];
  }

  function backendReplayNotes(context) {
    const raceData = cachedRaceContext(context);
    if (!raceData) return [];

    const moments = Array.isArray(raceData.moments) ? raceData.moments : [];
    const narrative = Array.isArray(raceData.story?.narrative) ? raceData.story.narrative : [];
    const pickedMoment = pickBackendMoment(context, moments);
    const notes = [];

    if (pickedMoment?.headline) notes.push(pickedMoment.headline);
    if (pickedMoment?.detail) notes.push(beginnerize(pickedMoment.detail));
    if (notes.length < 2 && narrative.length) {
      notes.push(beginnerize(narrative[Math.min(context.moment.step, narrative.length - 1)]));
    }

    return notes;
  }

  function backendCompanionNotes(context, data = null) {
    const note = cachedBackendCompanion(context, data);
    if (!note) return [];

    const notes = [];
    if (note.headline) notes.push(note.headline);
    if (Array.isArray(note.notes)) notes.push(...note.notes);
    if (data?.session && note.momentLabel) notes.unshift(`Live update: ${note.momentLabel}.`);
    return dedupe(notes).slice(0, 4);
  }

  function pickBackendMoment(context, moments) {
    if (!moments.length) return null;

    const chapter = context.chapterTitle.toLowerCase();
    if (chapter) {
      const chapterMatch = moments.find((moment) => {
        const text = `${moment.headline || ""} ${moment.detail || ""}`.toLowerCase();
        return chapter.split(/\s+/).filter((word) => word.length > 3).some((word) => text.includes(word));
      });
      if (chapterMatch) return chapterMatch;
    }

    return moments[Math.min(context.moment.step, moments.length - 1)];
  }

  function beginnerize(text) {
    return String(text || "")
      .replace(/\bundercut\b/gi, "early-stop advantage")
      .replace(/\bovercut\b/gi, "staying out longer")
      .replace(/\btyre cliff\b/gi, "tyres suddenly losing pace")
      .replace(/\bcompound\b/gi, "tyre type")
      .replace(/\bstint\b/gi, "run on one set of tyres");
  }

  function cachedRaceContext(context) {
    if (!context.year || !context.track) return null;
    return raceContextCache.get(raceContextKey(context)) || null;
  }

  function cachedBackendCompanion(context, data = null) {
    return backendCompanionCache.get(backendCompanionKey(context, data)) || null;
  }

  function loadRaceContext(context) {
    if (!context.isF1Video || !context.year || !context.track) return;

    const key = raceContextKey(context);
    if (raceContextCache.has(key) || raceContextPending.has(key)) return;

    raceContextPending.add(key);
    chrome.runtime.sendMessage(
      { type: "GET_RACE_CONTEXT", year: context.year, track: context.track },
      (response) => {
        raceContextPending.delete(key);
        if (response?.ok) {
          raceContextCache.set(key, response);
          render();
        }
      },
    );
  }

  function loadBackendCompanion(context, data = null) {
    if (!context.isVideoPage || !context.year || !context.track) return;

    const key = backendCompanionKey(context, data);
    if (backendCompanionCache.has(key) || backendCompanionPending.has(key)) return;

    backendCompanionPending.add(key);
    chrome.runtime.sendMessage(
      {
        type: "GET_COMPANION_NOTE",
        context: {
          url: location.href,
          title: context.title,
          year: context.year,
          raceName: context.raceName,
          track: context.track,
          currentTime: getCurrentVideoTime(),
          duration: getCurrentVideoDuration(),
          chapter: context.chapterTitle,
          transcript: context.transcriptText,
          mode: data ? "live" : "replay",
          momentId: context.moment?.id,
          liveState: data,
        },
      },
      (response) => {
        backendCompanionPending.delete(key);
        if (response?.ok) {
          backendCompanionCache.set(key, response);
          render();
        }
      },
    );
  }

  function backendCompanionKey(context, data = null) {
    const liveKey = data
      ? [
          data.session || "",
          data.lap || 0,
          data.totalLaps || 0,
          data.alerts?.[0]?.text || "",
          data.predictions?.[0]?.driver || "",
        ].join(":")
      : "";
    return [
      location.href,
      context.title || "",
      context.year || "",
      context.raceName || "",
      context.track || "",
      context.chapterTitle || "",
      context.transcriptText || "",
      context.moment?.id || "",
      liveKey,
    ].join("|");
  }

  function getCurrentVideoTime() {
    const video = document.querySelector("video");
    return video && Number.isFinite(video.currentTime) ? video.currentTime : 0;
  }

  function getCurrentVideoDuration() {
    const video = document.querySelector("video");
    return video && Number.isFinite(video.duration) ? video.duration : 0;
  }

  function raceContextKey(context) {
    return `${context.year}:${context.track}`;
  }

  function currentChapterTitle() {
    const candidates = [
      document.querySelector(".ytp-chapter-title-content")?.textContent,
      document.querySelector(".ytp-chapter-title")?.textContent,
      document.querySelector("[class*='chapter'][class*='title']")?.textContent,
    ];

    for (const candidate of candidates) {
      const title = normalizeChapterTitle(candidate);
      if (title) return title;
    }

    return "";
  }

  function currentTranscriptText() {
    const candidates = [
      ...document.querySelectorAll(".ytp-caption-window-container .ytp-caption-segment"),
      ...document.querySelectorAll(".ytp-caption-window-container span"),
      ...document.querySelectorAll(".ytp-caption-segment"),
    ];

    const text = normalizeTranscriptText(candidates.map((node) => node.textContent).join(" "));
    if (!text) return transcriptState.recent.join(" ").trim();

    if (text !== transcriptState.lastText) {
      transcriptState.lastText = text;
      transcriptState.recent.push(text);
      transcriptState.recent = transcriptState.recent
        .filter(Boolean)
        .slice(-6);
    }

    return transcriptState.recent.join(" ").trim();
  }

  function normalizeTranscriptText(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (text.length < 3) return "";
    if (!/[a-z0-9]/i.test(text)) return "";
    if (/^(captions?|subtitles?)$/i.test(text)) return "";
    return text;
  }

  function normalizeChapterTitle(value) {
    const title = String(value || "").replace(/\s+/g, " ").trim();
    if (!title) return "";
    if (title.length < 3) return "";
    if (!/[a-z0-9]/i.test(title)) return "";
    if (/^[.\-_:;|/\\()[\]{}]+$/.test(title)) return "";
    if (/^(chapter|chapters|key moments?)$/i.test(title)) return "";
    return title;
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

  function closeOverlay(event) {
    event?.stopPropagation();
    settings = { ...settings, overlayEnabled: false, demoMode: false };
    liveData = null;
    overlay.style.display = "none";
    chrome.storage.local.set({ overlayEnabled: false, demoMode: false });
    chrome.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings: { overlayEnabled: false, demoMode: false, overlayMode: "full" },
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
    const context = videoContext();
    const nextVideoKey = `${location.href}|${context.title}|${context.moment.id}`;
    if (nextVideoKey === lastVideoKey) return;
    lastVideoKey = nextVideoKey;
    render();
  }, 1500);

  document.addEventListener("fullscreenchange", () => {
    attachToBestContainer();
    render();
  });
})();
