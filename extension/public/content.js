/**
 * content.js — Injected into F1 broadcast pages
 *
 * Creates a floating overlay panel showing live predictions.
 * Communicates with the background service worker for data.
 */

(function () {
  // Don't inject twice
  if (document.getElementById("raceday-overlay")) return;

  // Create overlay container
  const overlay = document.createElement("div");
  overlay.id = "raceday-overlay";
  overlay.className = "raceday-panel raceday-collapsed";
  overlay.innerHTML = `
    <div class="raceday-header" id="raceday-toggle">
      <span class="raceday-logo">RD</span>
      <span class="raceday-title">Raceday</span>
      <span class="raceday-minimize" id="raceday-minimize">_</span>
    </div>
    <div class="raceday-body" id="raceday-body">
      <div class="raceday-status" id="raceday-status">
        Connecting to Raceday backend...
      </div>
      <div class="raceday-predictions" id="raceday-predictions"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Toggle collapse
  const toggle = document.getElementById("raceday-toggle");
  const body = document.getElementById("raceday-body");
  const minimize = document.getElementById("raceday-minimize");

  let collapsed = true;

  toggle.addEventListener("click", () => {
    collapsed = !collapsed;
    overlay.className = collapsed
      ? "raceday-panel raceday-collapsed"
      : "raceday-panel raceday-expanded";
  });

  // Listen for live updates from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "WS_STATUS") {
      const status = document.getElementById("raceday-status");
      status.textContent =
        msg.status === "connected"
          ? "Live — receiving data"
          : "Disconnected — waiting for race";
      status.className =
        "raceday-status " +
        (msg.status === "connected" ? "raceday-connected" : "raceday-disconnected");
    }

    if (msg.type === "LIVE_UPDATE" && msg.data) {
      renderPredictions(msg.data);
    }
  });

  function renderPredictions(data) {
    const container = document.getElementById("raceday-predictions");
    if (!data || !data.predictions) {
      container.innerHTML = "<p class='raceday-empty'>Waiting for lap data...</p>";
      return;
    }

    const html = data.predictions
      .slice(0, 5)
      .map(
        (p) => `
      <div class="raceday-prediction-row">
        <span class="raceday-driver">${p.driver}</span>
        <span class="raceday-prediction">${p.prediction}</span>
      </div>
    `
      )
      .join("");

    container.innerHTML = html;
  }
})();
