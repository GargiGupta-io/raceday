import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

const BACKEND_URL = "http://localhost:8888";

interface RaceSession {
  year: number;
  name: string;
  round: number;
  date: string;
}

interface DriverStatus {
  code: string;
  name: string;
  team: string;
  position: number | null;
  lastLap: number | null;
  compound: string | null;
  stintAge: number | null;
}

interface LiveState {
  connected: boolean;
  session: RaceSession | null;
  drivers: DriverStatus[];
  predictions: { driver: string; prediction: string }[];
  lap: number;
  totalLaps: number;
}

function Popup() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [latestRace, setLatestRace] = useState<{ year: number; name: string; winner: string } | null>(null);
  const [liveState, setLiveState] = useState<LiveState | null>(null);

  // Check backend health
  useEffect(() => {
    fetch(`${BACKEND_URL}/health`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setBackendOk(d?.status === "ok"))
      .catch(() => setBackendOk(false));
  }, []);

  // Fetch latest race info
  useEffect(() => {
    if (!backendOk) return;

    const year = new Date().getFullYear();
    fetch(`${BACKEND_URL}/races/${year}`)
      .then((r) => r.ok ? r.json() : [])
      .then((races: { name: string; winner?: string; indexed: boolean }[]) => {
        const completed = races.filter((r) => r.indexed && r.winner);
        if (completed.length > 0) {
          const last = completed[completed.length - 1];
          setLatestRace({ year, name: last.name, winner: last.winner! });
        }
      })
      .catch(() => {});
  }, [backendOk]);

  // Listen for live updates from background
  useEffect(() => {
    const listener = (msg: { type: string; data?: LiveState; status?: string }) => {
      if (msg.type === "LIVE_UPDATE" && msg.data) {
        setLiveState(msg.data);
      }
      if (msg.type === "WS_STATUS") {
        setLiveState((prev) => prev ? { ...prev, connected: msg.status === "connected" } : null);
      }
    };

    chrome.runtime?.onMessage?.addListener(listener);
    return () => chrome.runtime?.onMessage?.removeListener(listener);
  }, []);

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <div style={{
          background: "#dc2626", color: "white", fontWeight: 800,
          fontSize: 14, padding: "4px 10px", borderRadius: 6, letterSpacing: 1,
        }}>
          RD
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fafafa" }}>Raceday</div>
          <div style={{ fontSize: 10, color: "#71717a" }}>Live Strategy Companion</div>
        </div>
      </div>

      {/* Backend status */}
      <div style={{
        padding: "10px 12px", borderRadius: 8, marginBottom: 12,
        background: backendOk === null ? "#18181b" : backendOk ? "#052e16" : "#450a0a",
        border: `1px solid ${backendOk === null ? "#27272a" : backendOk ? "#166534" : "#991b1b"}`,
      }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a", marginBottom: 4 }}>
          Backend
        </div>
        <div style={{ fontSize: 12, color: backendOk === null ? "#a1a1aa" : backendOk ? "#4ade80" : "#f87171" }}>
          {backendOk === null ? "Checking..." : backendOk ? "Connected" : "Offline — start the backend"}
        </div>
      </div>

      {/* Latest race */}
      {latestRace && (
        <div style={{
          padding: "10px 12px", borderRadius: 8, marginBottom: 12,
          background: "#18181b", border: "1px solid #27272a",
        }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a", marginBottom: 4 }}>
            Latest Race
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#fafafa" }}>
            {latestRace.name.replace(" Grand Prix", "")}
          </div>
          <div style={{ fontSize: 11, color: "#4ade80", marginTop: 2 }}>
            P1 {latestRace.winner}
          </div>
        </div>
      )}

      {/* Live session (placeholder for now) */}
      <div style={{
        padding: "10px 12px", borderRadius: 8, marginBottom: 12,
        background: "#18181b", border: "1px solid #27272a",
      }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a", marginBottom: 4 }}>
          Live Session
        </div>
        {liveState ? (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fafafa" }}>
              Lap {liveState.lap}/{liveState.totalLaps}
            </div>
            <div style={{ fontSize: 11, color: liveState.connected ? "#4ade80" : "#f87171", marginTop: 2 }}>
              {liveState.connected ? "Receiving live data" : "Disconnected"}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#52525b" }}>
            No live session — predictions appear during race weekends
          </div>
        )}
      </div>

      {/* Predictions placeholder */}
      {liveState && liveState.predictions.length > 0 && (
        <div style={{
          padding: "10px 12px", borderRadius: 8, marginBottom: 12,
          background: "#18181b", border: "1px solid #27272a",
        }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a", marginBottom: 8 }}>
            Pit Predictions
          </div>
          {liveState.predictions.map((p, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between",
              padding: "4px 0", borderBottom: i < liveState.predictions.length - 1 ? "1px solid #27272a" : "none",
              fontSize: 12,
            }}>
              <span style={{ fontWeight: 600, color: "#e4e4e7" }}>{p.driver}</span>
              <span style={{ color: "#a1a1aa" }}>{p.prediction}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ fontSize: 9, color: "#3f3f46", textAlign: "center", marginTop: 16 }}>
        Raceday v0.1.0 — raceday.com
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<Popup />);
