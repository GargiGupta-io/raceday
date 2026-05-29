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
    demoMode: false,
  };

  let settings = { ...DEFAULT_SETTINGS };
  let liveData = null;
  let connectionStatus = "checking";
  let dragState = { dragging: false, offsetX: 0, offsetY: 0 };
  let lastVideoKey = "";
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
    settings = { ...DEFAULT_SETTINGS, ...stored };
    applyStoredPosition(stored.overlayPosition);

    refreshLiveData();
  }

  function refreshLiveData() {
    chrome.runtime.sendMessage({ type: "GET_LIVE_DATA" }, (response) => {
      if (response?.settings) settings = { ...settings, ...response.settings };
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
    if (data) loadBackendCompanion(context, data);
    const replayBackend = cachedBackendCompanion(context);
    const notes = data ? beginnerNotes(data, context) : [];
    const backendNotes = data ? backendCompanionNotes(context, data) : [];
    const liveNotes = data && backendNotes.length ? backendNotes : notes;
    const replayNotes = data ? [] : replayDetailNotes(context, replayBackend);
    const headline = companionHeadlineLine(data ? liveNotes[0] : replayNotes[0] || replayHeadline(context, replayBackend));
    const detailNotes = (data ? liveNotes.slice(1, 5) : replayNotes.slice(1, 5))
      .map(companionNoteLine)
      .filter(Boolean);
    const sessionLabel = buildHeaderTitle(context, data, replayBackend);

    overlay.innerHTML = `
      <div class="raceday-header" id="raceday-header">
        <span class="raceday-logo">RD</span>
        <span class="raceday-session">${escapeHtml(sessionLabel)}</span>
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
        notes.push(`${readableDriverToken((driver.name || "").split(" ")[0])}'s tyres are fading, so they may slow down soon.`);
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

    return dedupe(notes.map(companionNoteLine).filter(Boolean)).slice(0, 4);
  }

  function beginnerAlert(text) {
    const clean = String(text || "").trim();
    if (!clean) return "";

    if (/same pit window/i.test(clean)) {
      return "Two close drivers may stop soon, and the first stop could change who is ahead.";
    }
    if (/tyre cliff|tires? are fading|tyres? are fading/i.test(clean)) {
      const driver = readableDriverToken(clean.split(" ")[0]);
      return `${driver}'s tyres are fading, so they may slow down soon.`;
    }
    if (/undercut|stopped earlier/i.test(clean)) {
      const driver = readableDriverToken(clean.split(" ")[0]);
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
    return driver?.name?.split(" ")[0] || "That driver";
  }

  function readableDriverToken(value) {
    const token = displayLine(value).replace(/'s$/i, "");
    if (!token || /^[A-Z0-9]{2,4}$/.test(token)) return "That driver";
    return token;
  }

  function displayLine(text) {
    return String(text || "")
      .replace(/\s*\(([A-Z0-9]{2,4})\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function shortBodyLead(text) {
    const clean = displayLine(text);
    if (!clean) return "";

    const explained = explainDisplayHeadline(clean);
    if (explained) return explained;

    const patterns = [
      [/converted pole position into victory/i, "Clean air matters."],
      [/finished second/i, "The chase is alive."],
      [/completed the podium/i, "The front group is settling."],
      [/is starting to matter more/i, "This part matters more now."],
      [/is where the race starts to lean one way/i, "The race is starting to lean."],
      [/the next stop could change who stays ahead/i, "A stop could flip the order."],
      [/someone is making a real move through the field/i, "A move through the field is building."],
      [/the race is getting messy enough to matter/i, "The race is getting messy."],
      [/the leader is setting the tone now/i, "The leader is setting the pace."],
      [/this part of the race is starting to matter more/i, "This part matters more now."],
      [/the finish is starting to decide the order/i, "The finish is deciding it."],
    ];

    for (const [pattern, replacement] of patterns) {
      if (pattern.test(clean)) return replacement;
    }

    if (isUnsafeCompanionFact(clean)) {
      return "This moment matters because it changes who has pressure, clean air, or tyre advantage.";
    }

    return clean;
  }

  function companionHeadlineLine(text, fallback = "Track position matters now.") {
    const clean = displayLine(text);
    if (!clean) return fallback;
    const explained = explainDisplayHeadline(clean);
    if (explained) return explained;
    if (isUnsafeCompanionFact(clean) || isTechnicalStatusLine(clean)) return fallback;
    return clean;
  }

  function companionNoteLine(text) {
    const clean = displayLine(text);
    if (!clean) return "";
    const explained = explainDisplayNote(clean);
    if (!explained) return "";
    if (isUnsafeCompanionFact(explained) || isTechnicalStatusLine(explained)) {
      return "This moment matters because it changes who has pressure, clean air, or tyre advantage.";
    }
    return explained;
  }

  function isUnsafeCompanionFact(text) {
    const clean = displayLine(text).toLowerCase();
    if (!clean) return false;
    return [
      /\brace highlights?\b/,
      /\bstarted p\d+/,
      /\bfinished p\d+/,
      /\bfinished second\b/,
      /\bfinished third\b/,
      /\bgained \d+ places?\b/,
      /\bdropped \d+ places?\b/,
      /\bbiggest forward charge\b/,
      /\bconverted pole\b/,
      /\bclaimed victory\b/,
      /\bwon\b/,
      /\bwins\b/,
      /\bwinner\b/,
      /\btakes the win\b/,
      /\btook the win\b/,
      /\bvictory\b/,
      /\bpole position\b/,
      /\bcompleted the podium\b/,
      /\bpodium\b/,
      /\bclassified\b/,
      /\bgrid position\b/,
      /\bp\d+\b/,
      /\bthe full result\b/,
    ].some((pattern) => pattern.test(clean));
  }

  function isTechnicalStatusLine(text) {
    const clean = displayLine(text).toLowerCase();
    return [
      /^live update:/,
      /^lap \d+/,
      /\bvideo chapter\b/,
      /\btranscript\b/,
      /\bradio\b/,
      /\bdetected this f1 video\b/,
      /\bdetected this video\b/,
    ].some((pattern) => pattern.test(clean));
  }

  function explainDisplayHeadline(text) {
    const clean = displayLine(text);
    if (!clean) return "";
    const subject = lineSubject(clean);

    if (/gained \d+ places|stormed from p\d+/i.test(clean)) {
      return subject ? `${subject} is moving forward.` : "A recovery drive is building.";
    }
    if (/dropped \d+ places|fell to p\d+/i.test(clean)) {
      return subject ? `${subject} is under pressure.` : "Pressure is starting to bite.";
    }
    if (/converted pole|led from|won|wins|winner|victory|takes the win|took the win/i.test(clean)) {
      return "Clean air matters here.";
    }
    if (/undercut|pitted on lap|early stop/i.test(clean)) {
      return subject ? `${subject} gets first chance.` : "The pit call can flip it.";
    }
    if (/retired|failed to see|attrition/i.test(clean)) {
      return "Survival is part of the race.";
    }
    if (/started p\d+|finished p\d+|finished second|finished third|podium/i.test(clean)) {
      return "Track position matters now.";
    }

    return "";
  }

  function explainDisplayNote(text) {
    const clean = displayLine(text);
    if (!clean) return "";
    const subject = lineSubject(clean);

    if (/video chapter|this part is about/i.test(clean)) {
      return "The video has moved into a strategy moment, so watch who is attacking and who is protecting tyres.";
    }

    if (/gained \d+ places|stormed from p\d+/i.test(clean)) {
      return subject
        ? `${subject} moving forward usually means the car has pace, the strategy is opening up, or traffic ahead is vulnerable.`
        : "That move usually means the car has pace, the strategy is opening up, or traffic ahead is vulnerable.";
    }
    if (/started p\d+.*finished p\d+|started p\d+|finished p\d+/i.test(clean)) {
      return "That position change matters because clean air is calmer, while traffic makes tyres hotter and attacks harder.";
    }
    if (/dropped \d+ places|fell to p\d+/i.test(clean)) {
      return `${subject || "The driver"} now needs a sharper pit call or cleaner air, because falling back makes every recovery move harder.`;
    }
    if (/converted pole|led from|won|wins|winner|victory|takes the win|took the win/i.test(clean)) {
      return "Clean air lets the leader manage pace, so the cars behind may need a pit gamble rather than a straight fight.";
    }
    if (/undercut|pitted on lap|early stop/i.test(clean)) {
      return "Stopping first can work because fresh tyres buy lap time before the rival has a chance to answer.";
    }
    if (/retired|failed to see|attrition/i.test(clean)) {
      return "When cars drop out, staying clean can gain places without a big move.";
    }
    if (/podium|finished second|finished third/i.test(clean)) {
      return "The front group is settling, so small mistakes matter more now.";
    }

    return clean;
  }

  function lineSubject(text) {
    const clean = displayLine(text)
      .replace(/\b[A-Z]{2,3}\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const match = clean.match(/^([A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?\s+(?:gained|dropped|stormed|converted|led|won|pitted|retired|finished|started|fell)/);
    return match ? match[1] : "";
  }

  function buildHeaderTitle(context, data = null, backendNote = null) {
    const raceLabel = shortRaceLabel(context, data);
    const phrase = shortHeaderPhrase(context, data, backendNote);
    return phrase ? `${raceLabel}: ${phrase}` : raceLabel;
  }

  function shortRaceLabel(context, data = null) {
    const raw = displayLine(
      data?.session ||
      data?.raceName ||
      context.raceName ||
      context.track ||
      "RaceDay",
    )
      .replace(/\bGrand Prix\b/gi, "GP")
      .replace(/\bRace Highlights\b/gi, "")
      .replace(/\bRace Replay\b/gi, "")
      .replace(/\bFormula 1\b/gi, "F1")
      .replace(/\s+/g, " ")
      .trim();

    if (!raw) return "RaceDay";
    if (isUnsafeCompanionFact(raw) || isTechnicalStatusLine(raw)) return "RaceDay";
    if (/\bGP\b/i.test(raw)) return raw;
    return `${raw} GP`.replace(/\s+/g, " ").trim();
  }

  function shortHeaderPhrase(context, data = null, backendNote = null) {
    const candidates = [
      context.chapterTitle,
      context.moment?.label,
      backendNote?.momentLabel,
      backendNote?.headline,
    ].filter(Boolean);

    for (const candidate of candidates) {
      const phrase = phraseFromText(candidate, backendNote);
      if (phrase) return phrase;
    }

    return context.isF1Video ? "Race day" : "Watching now";
  }

  function phraseFromText(value, backendNote = null) {
    const text = displayLine(value).toLowerCase();
    if (!text) return "";
    if (isUnsafeCompanionFact(text) || isTechnicalStatusLine(text)) return "";

    if (backendNote?.momentLabel) {
      const label = displayLine(backendNote.momentLabel);
      if (label && label.length <= 18 && !isUnsafeCompanionFact(label) && !isTechnicalStatusLine(label)) return label;
    }

    const patterns = [
      [/pit|stop|box/, "Pit pressure"],
      [/tyre|tire|fading|grip|sliding|dead|gone/, "Tyre pressure"],
      [/lead|front|chasing|closing|attack|defend|battle|fight/, "Lead fight"],
      [/weather|rain|wet|damp|intermediate/, "Weather swing"],
      [/start|launch|lights|opening/, "Launch phase"],
      [/finish|podium|result|victory|win/, "Final push"],
      [/traffic|gap/, "Track pressure"],
      [/overtake|pass|move|charge/, "Move forward"],
    ];

    for (const [pattern, phrase] of patterns) {
      if (pattern.test(text)) return phrase;
    }

    const words = text
      .replace(/[:–—-]/g, " ")
      .split(/\s+/)
      .filter((word) => word && !/^\(?[A-Z0-9]{2,4}\)?$/.test(word) && !/^(the|a|an|and|or|to|of|for|with|is|are|this|that)$/i.test(word))
      .slice(0, 3);

    if (!words.length) return "";
    return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
  }

  function dedupe(notes) {
    return Array.from(new Set(notes));
  }

  function renderIdleContent(context, headline, replayNotes) {
    const subtitle = replaySubtitle(context);
    return `
      <div class="raceday-main-note">${escapeHtml(companionHeadlineLine(headline))}</div>
      ${subtitle ? `<div class="raceday-video-title">${escapeHtml(subtitle)}</div>` : ""}
      <div class="raceday-note-list">
        ${replayNotes.map(companionNoteLine).filter(Boolean).map((note) => `<div class="raceday-note-item">${escapeHtml(note)}</div>`).join("")}
      </div>
    `;
  }

  function replaySubtitle(context) {
    if (context.isF1Video && context.year && context.raceName) {
      return `${context.year} ${context.raceName}`.replace(/\s+/g, " ").trim();
    }
    const title = displayLine(context.title);
    if (!title || isUnsafeCompanionFact(title) || isTechnicalStatusLine(title)) return "";
    return title;
  }

  function replayHeadline(context, backendNote = null) {
    if (settings.demoMode) return "Demo race is running.";
    if (connectionStatus === "stopped") return "RaceDay notes are hidden.";
    if (backendNote?.headline) return shortBodyLead(backendNote.headline);
    const raceData = cachedRaceContext(context);
    const storyHeadline = raceData?.story?.headline || raceData?.story?.narrative?.[0];
    if (storyHeadline) return shortBodyLead(beginnerize(storyHeadline));
    if (context.chapterTitle && context.raceName) return shortBodyLead(context.chapterTitle);
    if (context.chapterTitle) return shortBodyLead(context.chapterTitle);
    if (context.isF1Video && context.raceName) return "Track position matters.";
    if (context.isF1Video) return "F1 replay is running.";
    if (context.isVideoPage) return "RaceDay is ready to follow along.";
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
    if (progress < 0.06) return { id: "lights", label: "race start", step: 0 };
    if (progress < 0.14) return { id: "first-fight", label: "first fight", step: 1 };
    if (progress < 0.22) return { id: "settle", label: "pace check", step: 2 };
    if (progress < 0.30) return { id: "first-window", label: "pit window", step: 3 };
    if (progress < 0.38) return { id: "undercut", label: "early stop", step: 4 };
    if (progress < 0.46) return { id: "traffic", label: "traffic risk", step: 5 };
    if (progress < 0.56) return { id: "middle-stint", label: "tyre pressure", step: 6 };
    if (progress < 0.66) return { id: "second-window", label: "second call", step: 7 };
    if (progress < 0.74) return { id: "tyre-offset", label: "tyre offset", step: 8 };
    if (progress < 0.82) return { id: "late-attack", label: "late attack", step: 9 };
    if (progress < 0.91) return { id: "defend", label: "defence mode", step: 10 };
    return { id: "finish", label: "final push", step: 11 };
  }

  function replayStrategyNotes(context) {
    const localNotes = localReplayStrategyNotes(context).map(companionNoteLine).filter(Boolean);
    return dedupe(localNotes).slice(0, 5);
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
      "first-fight": [
        "The first proper fight is about space, not just speed.",
        "A driver stuck behind another car can overheat the tyres before strategy even begins.",
        "This matters because early dirty air can force a quicker pit call.",
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
        "The move only works if the car rejoins in clean air.",
        "If the driver gets stuck behind traffic, the stop loses its edge.",
      ],
      traffic: [
        "Traffic is the hidden risk in this part of the race.",
        "Fresh tyres only help if the driver has room to use them.",
        "A slower car after the stop can ruin a strategy that looked perfect on paper.",
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
      "tyre-offset": [
        "Different tyre ages are starting to matter more than the running order.",
        "The car behind may look calm now but become dangerous when the tyres line up.",
        "This is why teams care so much about when the next stop happens.",
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
      return dedupe([
        ...(notesByMoment[context.moment.id] || notesByMoment["middle-stint"]),
        ...raceNotes.map(companionNoteLine),
      ]).filter(Boolean).slice(0, 4);
    }

    return notesByMoment[context.moment.id] || notesByMoment["middle-stint"];
  }

  function backendReplayNotes(context) {
    const raceData = cachedRaceContext(context);
    if (!raceData) return [];

    const moments = Array.isArray(raceData.moments) ? raceData.moments : [];
    const narrative = Array.isArray(raceData.story?.narrative) ? raceData.story.narrative : [];
    const pickedMoment = pickBackendMoment(context, moments);
    const notes = [];

    if (pickedMoment?.headline) notes.push(companionHeadlineLine(pickedMoment.headline));
    if (pickedMoment?.detail) notes.push(companionNoteLine(beginnerize(pickedMoment.detail)));
    if (notes.length < 2 && narrative.length) {
      notes.push(companionNoteLine(beginnerize(narrative[Math.min(context.moment.step, narrative.length - 1)])));
    }

    return notes.map(companionNoteLine).filter(Boolean);
  }

  function backendCompanionNotes(context, data = null) {
    const note = cachedBackendCompanion(context, data);
    if (!note) return [];

    const notes = [];
    if (note.headline) notes.push(companionHeadlineLine(note.headline));
    if (Array.isArray(note.notes)) notes.push(...note.notes.map(companionNoteLine));
    return dedupe(notes.map(companionNoteLine).filter(Boolean)).slice(0, 4);
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
      settings: { overlayEnabled: false, demoMode: false },
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
      settings = { ...settings, ...msg.settings };
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
    for (const key of ["overlayEnabled", "demoMode"]) {
      if (changes[key]) nextSettings[key] = changes[key].newValue;
    }
    settings = { ...nextSettings };
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
