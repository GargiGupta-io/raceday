/**
 * content.js - injected live overlay
 *
 * Renders the stream overlay and persists user placement/settings.
 */

(async function () {
  if (document.getElementById("raceday-overlay")) return;

  const DEFAULT_SETTINGS = {
    overlayEnabled: true,
    overlayMode: "compact",
    demoMode: false,
  };

  let settings = { ...DEFAULT_SETTINGS };
  let liveData = null;
  let connectionStatus = "checking";
  let dragState = { dragging: false, offsetX: 0, offsetY: 0 };

  const overlay = document.createElement("div");
  overlay.id = "raceday-overlay";
  document.body.appendChild(overlay);

  await loadInitialState();
  render();

  async function loadInitialState() {
    const stored = await chrome.storage.local.get({ ...DEFAULT_SETTINGS, overlayPosition: null });
    settings = { ...DEFAULT_SETTINGS, ...stored };
    if (stored.overlayPosition) {
      overlay.style.left = `${stored.overlayPosition.x}px`;
      overlay.style.top = `${stored.overlayPosition.y}px`;
      overlay.style.right = "auto";
      overlay.style.bottom = "auto";
    }

    chrome.runtime.sendMessage({ type: "GET_LIVE_DATA" }, (response) => {
      if (response?.settings) settings = { ...settings, ...response.settings };
      if (response?.status) connectionStatus = response.status;
      liveData = response?.data || null;
      render();
    });
  }

  function setOverlayMode(mode) {
    settings.overlayMode = mode;
    chrome.storage.local.set({ overlayMode: mode });
    chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });
    render();
  }

  function render() {
    overlay.style.display = settings.overlayEnabled ? "block" : "none";
    overlay.className = `raceday-panel raceday-${settings.overlayMode}`;

    const data = liveData;
    const signal = data ? primarySignal(data) : statusCopy(connectionStatus);
    overlay.innerHTML = `
      <div class="raceday-header" id="raceday-header">
        <span class="raceday-logo">RD</span>
        ${data ? `
          <span class="raceday-session">${signal}</span>
          <span class="raceday-lap">L${data.lap}</span>
        ` : `
          <span class="raceday-session">${signal}</span>
        `}
        <span class="raceday-status-dot ${settings.demoMode ? "raceday-dot-demo" : ""}"></span>
        <button class="raceday-toggle-btn" id="raceday-toggle" type="button">
          ${settings.overlayMode === "compact" ? "+" : "_"}
        </button>
      </div>
      ${settings.overlayMode === "full" ? `
        <div class="raceday-body">
          ${data ? renderLiveContent(data) : renderIdleContent()}
        </div>
      ` : ""}
    `;

    document.getElementById("raceday-toggle")?.addEventListener("click", (event) => {
      event.stopPropagation();
      setOverlayMode(settings.overlayMode === "compact" ? "full" : "compact");
    });

    document.getElementById("raceday-header")?.addEventListener("mousedown", startDrag);
  }

  function renderLiveContent(data) {
    const tyreRiskHtml = (data.drivers || [])
      .filter((driver) => driver.pitWindow || driver.tyreLife <= 50)
      .slice(0, 4)
      .map((driver) => {
      return `
        <div class="raceday-risk-row">
          <span class="raceday-code">${driver.code}</span>
          <span class="raceday-compound ${compoundClass(driver.compound)}">${driver.compound.charAt(0)}</span>
          <span class="raceday-risk-text">${driver.pitWindow || `${driver.tyreLife}% tyre life`}</span>
          <div class="raceday-life-bar">
            <div class="raceday-life-fill ${lifeClass(driver.tyreLife)}" style="width:${driver.tyreLife}%"></div>
          </div>
        </div>
      `;
    }).join("");

    const predictionsHtml = (data.predictions || []).slice(0, 3).map((prediction) => `
      <div class="raceday-pred-row">
        <span class="raceday-code">${prediction.driver}</span>
        <span class="raceday-pred-text">${prediction.prediction}</span>
      </div>
    `).join("");

    const whatIfHtml = (data.whatIf || []).slice(0, 3).map((item) => `
      <div class="raceday-whatif-row">
        <span class="raceday-code">${item.driver}</span>
        <span class="raceday-option ${item.recommendation === "pit" ? "raceday-option-active" : ""}">Pit ${item.pitNow}</span>
        <span class="raceday-option ${item.recommendation === "stay" ? "raceday-option-active" : ""}">Stay ${item.stayOut}</span>
      </div>
    `).join("");

    const alertsHtml = (data.alerts || []).slice(0, 2).map((alert) => `
      <div class="raceday-alert ${alert.type === "warning" ? "raceday-alert-warning" : ""}">
        ${alert.type === "warning" ? "! " : ""}${alert.text}
      </div>
    `).join("");

    return `
      <div class="raceday-section">
        <div class="raceday-section-label">RaceDay signal</div>
        <div class="raceday-signal">${primarySignal(data)}</div>
      </div>
      ${predictionsHtml ? `<div class="raceday-section"><div class="raceday-section-label">Pit predictions</div>${predictionsHtml}</div>` : ""}
      ${tyreRiskHtml ? `<div class="raceday-section"><div class="raceday-section-label">Tyre risk</div>${tyreRiskHtml}</div>` : ""}
      ${whatIfHtml ? `<div class="raceday-section"><div class="raceday-section-label">What if pit now?</div>${whatIfHtml}</div>` : ""}
      ${alertsHtml ? `<div class="raceday-section"><div class="raceday-section-label">Alerts</div>${alertsHtml}</div>` : ""}
    `;
  }

  function renderIdleContent() {
    return `
      <div class="raceday-idle">
        <p>${statusCopy(connectionStatus)}</p>
        <p class="raceday-idle-sub">The overlay will update during race weekends. Open the popup to enable demo mode anytime.</p>
      </div>
    `;
  }

  function compoundClass(compound) {
    const upper = (compound || "").toUpperCase();
    if (upper === "SOFT") return "raceday-tyre-soft";
    if (upper === "MEDIUM") return "raceday-tyre-medium";
    if (upper === "HARD") return "raceday-tyre-hard";
    if (upper === "INTERMEDIATE") return "raceday-tyre-inter";
    if (upper === "WET") return "raceday-tyre-wet";
    return "raceday-tyre-unknown";
  }

  function lifeClass(tyreLife) {
    if (tyreLife <= 35) return "raceday-life-low";
    if (tyreLife <= 60) return "raceday-life-mid";
    return "raceday-life-high";
  }

  function statusCopy(status) {
    if (status === "connected") return "Live strategy on";
    if (status === "checking") return "Checking race data";
    if (status === "demo") return "Demo preview";
    if (status === "no-session") return "No live race";
    if (status === "stopped") return "Overlay Off";
    return "RaceDay unavailable";
  }

  function primarySignal(data) {
    const alert = (data.alerts || [])[0]?.text;
    if (alert) return alert;
    const prediction = (data.predictions || [])[0];
    if (prediction) return `${prediction.driver}: ${prediction.prediction}`;
    const risk = (data.drivers || []).find((driver) => driver.pitWindow || driver.tyreLife <= 45);
    if (risk) return `${risk.code} is entering a strategy window`;
    return "Watching for strategy shifts";
  }

  function startDrag(event) {
    if (event.target.id === "raceday-toggle") return;
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
    const y = Math.max(0, Math.min(window.innerHeight - 40, event.clientY - dragState.offsetY));
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
      liveData = msg.data || null;
      render();
    }
    if (msg.type === "WS_STATUS") {
      connectionStatus = msg.status;
      render();
    }
    if (msg.type === "SETTINGS_UPDATE") {
      settings = { ...settings, ...msg.settings };
      render();
    }
  });
})();
