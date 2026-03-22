/**
 * content.js — Injected into F1 broadcast pages
 *
 * Creates a floating, draggable overlay panel showing live race data:
 * - Lap counter and session name
 * - Top 5 driver standings with tyre indicators
 * - Pit predictions
 * - What-if scenarios
 * - Pattern alerts
 *
 * Communicates with the background service worker for data.
 */

(function () {
  if (document.getElementById("raceday-overlay")) return;

  // State
  let collapsed = true;
  let liveData = null;
  let dragState = { dragging: false, offsetX: 0, offsetY: 0 };

  // Create overlay
  const overlay = document.createElement("div");
  overlay.id = "raceday-overlay";
  overlay.className = "raceday-panel raceday-collapsed";
  document.body.appendChild(overlay);

  function render() {
    const data = liveData;

    overlay.innerHTML = `
      <div class="raceday-header" id="raceday-header">
        <span class="raceday-logo">RD</span>
        ${data ? `
          <span class="raceday-session">${(data.session || "").replace(" Grand Prix", "")}</span>
          <span class="raceday-lap">${data.lap}/${data.totalLaps}</span>
        ` : `
          <span class="raceday-session">Raceday</span>
        `}
        <span class="raceday-toggle-btn" id="raceday-toggle">${collapsed ? "+" : "_"}</span>
      </div>
      ${!collapsed ? `
        <div class="raceday-body">
          ${data ? renderLiveContent(data) : renderIdleContent()}
        </div>
      ` : ""}
    `;

    // Bind toggle
    document.getElementById("raceday-toggle")?.addEventListener("click", (e) => {
      e.stopPropagation();
      collapsed = !collapsed;
      overlay.className = collapsed ? "raceday-panel raceday-collapsed" : "raceday-panel raceday-expanded";
      render();
    });

    // Bind drag on header
    const header = document.getElementById("raceday-header");
    if (header) {
      header.addEventListener("mousedown", startDrag);
    }
  }

  function renderLiveContent(data) {
    const compoundColour = { SOFT: "#dc2626", MEDIUM: "#eab308", HARD: "#e4e4e7", INTERMEDIATE: "#22c55e", WET: "#3b82f6" };

    // Top 5 drivers
    const driversHtml = (data.drivers || []).slice(0, 5).map((d) => {
      const col = compoundColour[d.compound] || "#a1a1aa";
      const lifeCol = d.tyreLife > 50 ? "#4ade80" : d.tyreLife > 25 ? "#eab308" : "#f87171";
      return `
        <div class="raceday-driver-row">
          <span class="raceday-pos">P${d.position}</span>
          <span class="raceday-team-bar" style="background:${d.teamColour}"></span>
          <span class="raceday-code">${d.code}</span>
          <span class="raceday-gap">${d.gap}</span>
          <span class="raceday-compound" style="border-color:${col}">${d.compound.charAt(0)}</span>
          <div class="raceday-life-bar"><div class="raceday-life-fill" style="width:${d.tyreLife}%;background:${lifeCol}"></div></div>
        </div>
      `;
    }).join("");

    // What-if (top 3)
    const whatIfHtml = (data.whatIf || []).slice(0, 3).map((w) => {
      const pitBg = w.recommendation === "pit" ? "#052e16" : "transparent";
      const stayBg = w.recommendation === "stay" ? "#052e16" : "transparent";
      return `
        <div class="raceday-whatif-row">
          <span class="raceday-code">${w.driver}</span>
          <span class="raceday-option" style="background:${pitBg}">Pit ${w.pitNow}</span>
          <span class="raceday-option" style="background:${stayBg}">Stay ${w.stayOut}</span>
        </div>
      `;
    }).join("");

    // Alerts
    const alertsHtml = (data.alerts || []).slice(0, 2).map((a) => {
      const col = a.type === "warning" ? "#fbbf24" : "#a1a1aa";
      return `<div class="raceday-alert" style="color:${col}">${a.type === "warning" ? "! " : ""}${a.text}</div>`;
    }).join("");

    // Predictions (top 3)
    const predsHtml = (data.predictions || []).slice(0, 3).map((p) => {
      return `
        <div class="raceday-pred-row">
          <span class="raceday-code">${p.driver}</span>
          <span class="raceday-pred-text">${p.prediction}</span>
        </div>
      `;
    }).join("");

    return `
      <div class="raceday-section">
        <div class="raceday-section-label">STANDINGS</div>
        ${driversHtml}
      </div>
      ${predsHtml ? `
        <div class="raceday-section">
          <div class="raceday-section-label">PIT PREDICTIONS</div>
          ${predsHtml}
        </div>
      ` : ""}
      ${whatIfHtml ? `
        <div class="raceday-section">
          <div class="raceday-section-label">WHAT IF PIT NOW?</div>
          ${whatIfHtml}
        </div>
      ` : ""}
      ${alertsHtml ? `
        <div class="raceday-section">
          <div class="raceday-section-label">PATTERN ALERTS</div>
          ${alertsHtml}
        </div>
      ` : ""}
    `;
  }

  function renderIdleContent() {
    return `
      <div class="raceday-idle">
        <p>No live session active.</p>
        <p class="raceday-idle-sub">Predictions appear automatically during race weekends.</p>
      </div>
    `;
  }

  // Drag support
  function startDrag(e) {
    if (e.target.id === "raceday-toggle") return;
    dragState.dragging = true;
    dragState.offsetX = e.clientX - overlay.getBoundingClientRect().left;
    dragState.offsetY = e.clientY - overlay.getBoundingClientRect().top;
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    overlay.style.transition = "none";
  }

  function onDrag(e) {
    if (!dragState.dragging) return;
    const x = Math.max(0, Math.min(window.innerWidth - 160, e.clientX - dragState.offsetX));
    const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragState.offsetY));
    overlay.style.left = x + "px";
    overlay.style.top = y + "px";
    overlay.style.right = "auto";
    overlay.style.bottom = "auto";
  }

  function stopDrag() {
    dragState.dragging = false;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
    overlay.style.transition = "";
  }

  // Listen for live updates from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "LIVE_UPDATE" && msg.data) {
      liveData = msg.data;
      render();
    }
    if (msg.type === "WS_STATUS" && msg.status === "disconnected") {
      liveData = null;
      render();
    }
  });

  // Request current state from background on load
  chrome.runtime.sendMessage({ type: "GET_LIVE_DATA" }, (response) => {
    if (response && response.data) {
      liveData = response.data;
    }
    render();
  });
})();
