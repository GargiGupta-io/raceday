import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

const BACKEND_URL = "http://localhost:8888";

// ---- Types ----

interface DriverLive {
  code: string;
  name: string;
  team: string;
  teamColour: string;
  position: number;
  gap: string;
  compound: string;
  stintAge: number;
  pitWindow: string | null;
  tyreLife: number; // 0-100 percentage
}

interface PitPrediction {
  driver: string;
  prediction: string;
  confidence: string;
}

interface PatternAlert {
  text: string;
  type: "warning" | "info" | "opportunity";
}

interface LiveData {
  lap: number;
  totalLaps: number;
  session: string;
  drivers: DriverLive[];
  predictions: PitPrediction[];
  alerts: PatternAlert[];
}

// ---- Mock Data (demo mode) ----

const MOCK_DATA: LiveData = {
  lap: 34,
  totalLaps: 56,
  session: "2026 Japanese Grand Prix",
  drivers: [
    { code: "NOR", name: "Lando Norris", team: "McLaren", teamColour: "#FF8700", position: 1, gap: "LEADER", compound: "MEDIUM", stintAge: 14, pitWindow: "Lap 38-42", tyreLife: 62 },
    { code: "RUS", name: "George Russell", team: "Mercedes", teamColour: "#27F4D2", position: 2, gap: "+3.2s", compound: "MEDIUM", stintAge: 14, pitWindow: "Lap 36-40", tyreLife: 58 },
    { code: "VER", name: "Max Verstappen", team: "Red Bull Racing", teamColour: "#3671C6", position: 3, gap: "+5.8s", compound: "HARD", stintAge: 22, pitWindow: null, tyreLife: 45 },
    { code: "LEC", name: "Charles Leclerc", team: "Ferrari", teamColour: "#E8002D", position: 4, gap: "+8.1s", compound: "MEDIUM", stintAge: 12, pitWindow: "Lap 40-44", tyreLife: 68 },
    { code: "ANT", name: "Kimi Antonelli", team: "Mercedes", teamColour: "#27F4D2", position: 5, gap: "+12.4s", compound: "HARD", stintAge: 20, pitWindow: null, tyreLife: 50 },
    { code: "PIA", name: "Oscar Piastri", team: "McLaren", teamColour: "#FF8700", position: 6, gap: "+15.7s", compound: "MEDIUM", stintAge: 14, pitWindow: "Lap 38-42", tyreLife: 60 },
    { code: "HAM", name: "Lewis Hamilton", team: "Ferrari", teamColour: "#E8002D", position: 7, gap: "+18.3s", compound: "HARD", stintAge: 22, pitWindow: null, tyreLife: 42 },
    { code: "ALO", name: "Fernando Alonso", team: "Aston Martin", teamColour: "#229971", position: 8, gap: "+22.9s", compound: "MEDIUM", stintAge: 10, pitWindow: "Lap 42-46", tyreLife: 72 },
  ],
  predictions: [
    { driver: "NOR", prediction: "Pit lap 39-41 for Hard", confidence: "high" },
    { driver: "RUS", prediction: "Pit lap 37-39 for Hard", confidence: "high" },
    { driver: "VER", prediction: "No more stops", confidence: "medium" },
    { driver: "LEC", prediction: "Pit lap 41-43 for Hard", confidence: "medium" },
  ],
  alerts: [
    { text: "Last 4 races at Suzuka: leader after lap 35 won the race.", type: "info" },
    { text: "VER's Hard tyres at 45% life — cliff expected in ~8 laps.", type: "warning" },
  ],
};

const COMPOUND_COLOUR: Record<string, string> = {
  SOFT: "#dc2626",
  MEDIUM: "#eab308",
  HARD: "#e4e4e7",
  INTERMEDIATE: "#22c55e",
  WET: "#3b82f6",
};

// ---- Components ----

function StatusDot({ ok }: { ok: boolean | null }) {
  const colour = ok === null ? "#71717a" : ok ? "#4ade80" : "#f87171";
  return (
    <span style={{
      width: 6, height: 6, borderRadius: "50%", background: colour,
      display: "inline-block", marginRight: 6,
    }} />
  );
}

function TyreIndicator({ compound, stintAge, tyreLife }: { compound: string; stintAge: number; tyreLife: number }) {
  const colour = COMPOUND_COLOUR[compound] || "#a1a1aa";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{
        width: 14, height: 14, borderRadius: "50%", border: `2px solid ${colour}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 7, fontWeight: 700, color: colour,
      }}>
        {compound.charAt(0)}
      </div>
      <div style={{ width: 32, height: 4, borderRadius: 2, background: "#27272a", overflow: "hidden" }}>
        <div style={{
          width: `${tyreLife}%`, height: "100%", borderRadius: 2,
          background: tyreLife > 50 ? "#4ade80" : tyreLife > 25 ? "#eab308" : "#f87171",
          transition: "width 0.3s",
        }} />
      </div>
      <span style={{ fontSize: 9, color: "#71717a" }}>{stintAge}L</span>
    </div>
  );
}

function DriverRow({ driver, index }: { driver: DriverLive; index: number }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "20px 1fr 50px 80px",
      alignItems: "center", gap: 6, padding: "6px 0",
      borderBottom: "1px solid #1a1a1e",
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700, textAlign: "right",
        color: index < 3 ? "#fafafa" : "#71717a",
      }}>
        {driver.position}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{
            width: 3, height: 12, borderRadius: 1, background: driver.teamColour,
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#e4e4e7" }}>
            {driver.code}
          </span>
          <span style={{ fontSize: 9, color: "#52525b" }}>{driver.gap}</span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <TyreIndicator compound={driver.compound} stintAge={driver.stintAge} tyreLife={driver.tyreLife} />
      </div>
      <div style={{ textAlign: "right" }}>
        {driver.pitWindow ? (
          <span style={{ fontSize: 9, color: "#eab308", background: "#422006", padding: "1px 4px", borderRadius: 3 }}>
            {driver.pitWindow.replace("Lap ", "L")}
          </span>
        ) : (
          <span style={{ fontSize: 9, color: "#3f3f46" }}>no stop</span>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.8, color: "#52525b", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 8, marginBottom: 10,
      background: "#111113", border: "1px solid #1e1e22",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ---- Main Popup ----

function Popup() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [latestRace, setLatestRace] = useState<{ year: number; name: string; winner: string } | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [liveData, setLiveData] = useState<LiveData | null>(null);

  // Check backend health
  useEffect(() => {
    fetch(`${BACKEND_URL}/health`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setBackendOk(d?.status === "ok"))
      .catch(() => setBackendOk(false));
  }, []);

  // Fetch latest race
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

  // Listen for live updates
  useEffect(() => {
    const listener = (msg: { type: string; data?: LiveData }) => {
      if (msg.type === "LIVE_UPDATE" && msg.data) {
        setLiveData(msg.data);
      }
    };
    chrome.runtime?.onMessage?.addListener(listener);
    return () => chrome.runtime?.onMessage?.removeListener(listener);
  }, []);

  const data = demoMode ? MOCK_DATA : liveData;

  return (
    <div style={{ padding: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{
          background: "#dc2626", color: "white", fontWeight: 800,
          fontSize: 13, padding: "3px 8px", borderRadius: 5, letterSpacing: 0.8,
        }}>
          RD
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fafafa" }}>Raceday</div>
          <div style={{ fontSize: 9, color: "#52525b" }}>Live Strategy Companion</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <StatusDot ok={backendOk} />
          <span style={{ fontSize: 9, color: "#52525b" }}>{backendOk ? "Online" : "Offline"}</span>
        </div>
      </div>

      {/* Active session or idle state */}
      {data ? (
        <>
          {/* Session bar */}
          <Card style={{ background: "#0c0c0e", borderColor: "#dc262640" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#fafafa" }}>
                  {data.session.replace(" Grand Prix", "")}
                </div>
                {demoMode && (
                  <div style={{ fontSize: 8, color: "#dc2626", marginTop: 2 }}>DEMO MODE</div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#fafafa", letterSpacing: -0.5 }}>
                  {data.lap}<span style={{ fontSize: 11, color: "#52525b", fontWeight: 400 }}>/{data.totalLaps}</span>
                </div>
                <div style={{ fontSize: 8, color: "#52525b", textTransform: "uppercase" }}>Lap</div>
              </div>
            </div>
          </Card>

          {/* Driver standings */}
          <Card>
            <SectionLabel>Live Standings</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 50px 80px", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 8, color: "#3f3f46", textAlign: "right" }}>P</span>
              <span style={{ fontSize: 8, color: "#3f3f46" }}>Driver</span>
              <span style={{ fontSize: 8, color: "#3f3f46", textAlign: "center" }}>Tyre</span>
              <span style={{ fontSize: 8, color: "#3f3f46", textAlign: "right" }}>Pit window</span>
            </div>
            {data.drivers.map((d, i) => (
              <DriverRow key={d.code} driver={d} index={i} />
            ))}
          </Card>

          {/* Pit predictions */}
          {data.predictions.length > 0 && (
            <Card>
              <SectionLabel>Pit Predictions</SectionLabel>
              {data.predictions.map((p, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "5px 0", borderBottom: i < data.predictions.length - 1 ? "1px solid #1a1a1e" : "none",
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#e4e4e7" }}>{p.driver}</span>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 10, color: "#a1a1aa" }}>{p.prediction}</span>
                    <span style={{
                      fontSize: 8, marginLeft: 6, padding: "1px 4px", borderRadius: 3,
                      background: p.confidence === "high" ? "#052e16" : "#1c1917",
                      color: p.confidence === "high" ? "#4ade80" : "#a1a1aa",
                    }}>
                      {p.confidence}
                    </span>
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Pattern alerts */}
          {data.alerts.length > 0 && (
            <Card>
              <SectionLabel>Pattern Alerts</SectionLabel>
              {data.alerts.map((a, i) => (
                <div key={i} style={{
                  fontSize: 10, lineHeight: 1.4, padding: "5px 0",
                  borderBottom: i < data.alerts.length - 1 ? "1px solid #1a1a1e" : "none",
                  color: a.type === "warning" ? "#fbbf24" : a.type === "opportunity" ? "#4ade80" : "#a1a1aa",
                }}>
                  {a.type === "warning" ? "! " : a.type === "opportunity" ? "+ " : ""}{a.text}
                </div>
              ))}
            </Card>
          )}
        </>
      ) : (
        <>
          {/* Idle state — no live session */}
          {latestRace && (
            <Card>
              <SectionLabel>Latest Result</SectionLabel>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fafafa" }}>
                {latestRace.name.replace(" Grand Prix", "")}
              </div>
              <div style={{ fontSize: 11, color: "#4ade80", marginTop: 2 }}>
                P1 {latestRace.winner}
              </div>
            </Card>
          )}

          <Card>
            <SectionLabel>Live Session</SectionLabel>
            <div style={{ fontSize: 11, color: "#52525b", lineHeight: 1.5 }}>
              No live session active. Predictions appear automatically during race weekends.
            </div>
          </Card>
        </>
      )}

      {/* Footer with demo toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <span style={{ fontSize: 8, color: "#27272a" }}>v0.1.0</span>
        <button
          onClick={() => { setDemoMode(!demoMode); if (!demoMode) setLiveData(null); }}
          style={{
            fontSize: 8, color: "#3f3f46", background: "none", border: "none",
            cursor: "pointer", padding: "2px 4px",
          }}
        >
          {demoMode ? "Exit demo" : "Demo"}
        </button>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<Popup />);
