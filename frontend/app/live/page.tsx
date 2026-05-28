"use client";

import { useEffect, useState } from "react";
import { API, FetchState, fetchWithTimeout, wsUrl } from "@/app/lib/api";
import ProgressiveDetail from "@/app/components/ProgressiveDetail";

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
  tyreLife: number;
}

interface PitPrediction {
  driver: string;
  prediction: string;
  confidence: string;
}

interface WhatIf {
  driver: string;
  position: number;
  pitNow: string;
  stayOut: string;
  recommendation: "pit" | "stay" | "neutral";
}

interface PatternAlert {
  text: string;
  type: "warning" | "info" | "opportunity";
}

interface LiveData {
  active: boolean;
  lap?: number;
  totalLaps?: number;
  session?: string | null;
  drivers?: DriverLive[];
  predictions?: PitPrediction[];
  whatIf?: WhatIf[];
  alerts?: PatternAlert[];
}

type ConnectionStatus = "connected" | "reconnecting" | "offline" | "demo" | "no-session";

const DEMO_SNAPSHOTS: LiveData[] = [
  {
    active: true,
    lap: 22,
    totalLaps: 57,
    session: "Demo Grand Prix",
    drivers: [
      { code: "NOR", name: "Lando Norris", team: "McLaren", teamColour: "#ffffff", position: 1, gap: "LEADER", compound: "MEDIUM", stintAge: 18, pitWindow: "Lap 25-28", tyreLife: 46 },
      { code: "VER", name: "Max Verstappen", team: "Red Bull Racing", teamColour: "#ffffff", position: 2, gap: "+1.8", compound: "MEDIUM", stintAge: 18, pitWindow: "Lap 24-27", tyreLife: 43 },
      { code: "LEC", name: "Charles Leclerc", team: "Ferrari", teamColour: "#dc2626", position: 3, gap: "+4.2", compound: "HARD", stintAge: 10, pitWindow: null, tyreLife: 72 },
      { code: "HAM", name: "Lewis Hamilton", team: "Ferrari", teamColour: "#dc2626", position: 4, gap: "+6.9", compound: "SOFT", stintAge: 11, pitWindow: "Lap 23-25", tyreLife: 34 },
      { code: "PIA", name: "Oscar Piastri", team: "McLaren", teamColour: "#ffffff", position: 5, gap: "+8.1", compound: "MEDIUM", stintAge: 18, pitWindow: "Lap 25-28", tyreLife: 45 },
      { code: "RUS", name: "George Russell", team: "Mercedes", teamColour: "#ffffff", position: 6, gap: "+12.4", compound: "HARD", stintAge: 10, pitWindow: null, tyreLife: 76 },
    ],
    predictions: [
      { driver: "HAM", prediction: "Pit L23-25 for Hard", confidence: "high" },
      { driver: "VER", prediction: "Pit L24-27 for Hard", confidence: "medium" },
      { driver: "NOR", prediction: "Pit L25-28 for Hard", confidence: "medium" },
    ],
    whatIf: [
      { driver: "HAM", position: 4, pitNow: "P7", stayOut: "P5", recommendation: "stay" },
      { driver: "VER", position: 2, pitNow: "P6", stayOut: "P3", recommendation: "neutral" },
    ],
    alerts: [
      { text: "Hamilton is close to the tyre cliff. The next three laps decide whether he attacks or protects track position.", type: "warning" },
      { text: "Leclerc is offset on hard tyres, so his race may come alive after the leaders stop.", type: "info" },
    ],
  },
  {
    active: true,
    lap: 25,
    totalLaps: 57,
    session: "Demo Grand Prix",
    drivers: [
      { code: "NOR", name: "Lando Norris", team: "McLaren", teamColour: "#ffffff", position: 1, gap: "LEADER", compound: "MEDIUM", stintAge: 21, pitWindow: "Lap 25-27", tyreLife: 35 },
      { code: "VER", name: "Max Verstappen", team: "Red Bull Racing", teamColour: "#ffffff", position: 2, gap: "+1.1", compound: "MEDIUM", stintAge: 21, pitWindow: "Lap 25-27", tyreLife: 33 },
      { code: "LEC", name: "Charles Leclerc", team: "Ferrari", teamColour: "#dc2626", position: 3, gap: "+3.6", compound: "HARD", stintAge: 13, pitWindow: null, tyreLife: 66 },
      { code: "PIA", name: "Oscar Piastri", team: "McLaren", teamColour: "#ffffff", position: 4, gap: "+7.8", compound: "MEDIUM", stintAge: 21, pitWindow: "Lap 25-28", tyreLife: 36 },
      { code: "HAM", name: "Lewis Hamilton", team: "Ferrari", teamColour: "#dc2626", position: 5, gap: "+10.2", compound: "HARD", stintAge: 1, pitWindow: null, tyreLife: 98 },
      { code: "RUS", name: "George Russell", team: "Mercedes", teamColour: "#ffffff", position: 6, gap: "+13.4", compound: "HARD", stintAge: 13, pitWindow: null, tyreLife: 70 },
    ],
    predictions: [
      { driver: "NOR", prediction: "Pit L25-27 for Hard", confidence: "high" },
      { driver: "VER", prediction: "Pit L25-27 for Hard", confidence: "high" },
      { driver: "PIA", prediction: "Pit L25-28 for Hard", confidence: "medium" },
    ],
    whatIf: [
      { driver: "NOR", position: 1, pitNow: "P5", stayOut: "P2", recommendation: "pit" },
      { driver: "VER", position: 2, pitNow: "P6", stayOut: "P3", recommendation: "pit" },
    ],
    alerts: [
      { text: "Norris and Verstappen are inside the same pit window. Track position is now the pressure point.", type: "warning" },
      { text: "Hamilton has already switched to hard tyres and is trying to undercut the front group.", type: "opportunity" },
    ],
  },
  {
    active: true,
    lap: 29,
    totalLaps: 57,
    session: "Demo Grand Prix",
    drivers: [
      { code: "LEC", name: "Charles Leclerc", team: "Ferrari", teamColour: "#dc2626", position: 1, gap: "LEADER", compound: "HARD", stintAge: 17, pitWindow: null, tyreLife: 57 },
      { code: "HAM", name: "Lewis Hamilton", team: "Ferrari", teamColour: "#dc2626", position: 2, gap: "+2.7", compound: "HARD", stintAge: 5, pitWindow: null, tyreLife: 88 },
      { code: "NOR", name: "Lando Norris", team: "McLaren", teamColour: "#ffffff", position: 3, gap: "+5.1", compound: "HARD", stintAge: 1, pitWindow: null, tyreLife: 98 },
      { code: "VER", name: "Max Verstappen", team: "Red Bull Racing", teamColour: "#ffffff", position: 4, gap: "+6.4", compound: "HARD", stintAge: 1, pitWindow: null, tyreLife: 98 },
      { code: "PIA", name: "Oscar Piastri", team: "McLaren", teamColour: "#ffffff", position: 5, gap: "+11.2", compound: "HARD", stintAge: 1, pitWindow: null, tyreLife: 98 },
      { code: "RUS", name: "George Russell", team: "Mercedes", teamColour: "#ffffff", position: 6, gap: "+17.8", compound: "HARD", stintAge: 17, pitWindow: null, tyreLife: 58 },
    ],
    predictions: [
      { driver: "LEC", prediction: "No stop expected yet", confidence: "medium" },
      { driver: "HAM", prediction: "Long second stint possible", confidence: "medium" },
      { driver: "NOR", prediction: "Fresh tyre attack phase", confidence: "high" },
    ],
    whatIf: [
      { driver: "LEC", position: 1, pitNow: "P6", stayOut: "P1", recommendation: "stay" },
      { driver: "NOR", position: 3, pitNow: "P8", stayOut: "P3", recommendation: "stay" },
    ],
    alerts: [
      { text: "Leclerc leads on the offset strategy, but Norris and Verstappen now have fresher hard tyres behind.", type: "warning" },
      { text: "The undercut worked for Hamilton. The question is whether he can keep tyre life alive to the finish.", type: "info" },
    ],
  },
];

function tyreClass(compound: string) {
  const upper = compound.toUpperCase();
  if (upper === "SOFT") return "border-red-500 bg-red-600 text-white";
  if (upper === "MEDIUM") return "border-red-800 bg-red-950 text-red-100";
  if (upper === "HARD") return "border-white bg-white text-black";
  if (upper === "INTERMEDIATE") return "border-zinc-500 bg-zinc-700 text-white";
  if (upper === "WET") return "border-white/60 bg-black text-white";
  return "border-zinc-500 bg-zinc-800 text-zinc-200";
}

function lifeClass(tyreLife: number) {
  if (tyreLife <= 35) return "bg-red-500";
  return "bg-white";
}

function normalizeLiveData(payload: Partial<LiveData> | null): LiveData | null {
  if (!payload) return null;
  if (payload.active === false) return { active: false, session: payload.session };
  return { active: true, ...payload };
}

function formatLastUpdated(lastUpdatedAt: number | null, now: number | null) {
  if (!lastUpdatedAt || !now) return "Last updated --";
  const seconds = Math.max(0, Math.floor((now - lastUpdatedAt) / 1000));
  if (seconds < 1) return "Last updated now";
  return `Last updated ${seconds}s ago`;
}

function statusCopy(status: ConnectionStatus) {
  if (status === "connected") return "Connected";
  if (status === "reconnecting") return "Reconnecting";
  if (status === "demo") return "Demo Mode";
  if (status === "no-session") return "No Live Session";
  return "Offline";
}

function splitInsight(text: string) {
  const sentences = text.split(/(?<=\.)\s+/).filter(Boolean);
  return {
    summary: sentences[0] || text,
    detail: sentences.slice(1).join(" ") || "This alert is based on the current live timing, tyre state, and race position context.",
  };
}

function TyreIndicator({ compound, stintAge, tyreLife }: { compound: string; stintAge: number; tyreLife: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[8px] font-bold shrink-0 ${tyreClass(compound)}`}
      >
        {compound.charAt(0)}
      </div>
      <div className="w-10 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full rounded-full transition-all ${lifeClass(tyreLife)}`} style={{ width: `${tyreLife}%` }} />
      </div>
      <span className="text-[10px] text-zinc-600 tabular-nums">{stintAge}L</span>
    </div>
  );
}

export default function LivePage() {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveState, setLiveState] = useState<FetchState>("loading");
  const [liveError, setLiveError] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("reconnecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [demoIndex, setDemoIndex] = useState(0);
  const [showFullGrid, setShowFullGrid] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      setDemoMode(true);
      setConnectionStatus("demo");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (demoMode) return;

    let active = true;
    let receivedWebSocketMessage = false;
    let socket: WebSocket | null = null;
    let noSessionTimer: number | undefined;
    let pollingInterval: number | undefined;

    const applyLiveData = (payload: Partial<LiveData> | null, source: "websocket" | "polling") => {
      if (!active) return;

      const liveData = normalizeLiveData(payload);
      setData(liveData);
      setLoading(false);
      setLiveError(false);
      setLastUpdatedAt(Date.now());

      if (!liveData?.active) {
        setConnectionStatus("no-session");
        return;
      }

      setConnectionStatus(source === "websocket" ? "connected" : "reconnecting");
    };

    const fetchLiveFallback = () => {
      fetchWithTimeout<LiveData | null>(`${API}/live`, {
        onState: (state) => {
          setLiveState(state);
          if (state !== "error") setLiveError(false);
        },
      })
        .then((liveData) => {
          applyLiveData(liveData, "polling");
        })
        .catch(() => {
          if (active) {
            setData(null);
            setLiveError(true);
            setLoading(false);
            setConnectionStatus("offline");
          }
        });
    };

    const startPollingFallback = () => {
      if (pollingInterval) return;
      setConnectionStatus("reconnecting");
      fetchLiveFallback();
      pollingInterval = window.setInterval(fetchLiveFallback, 10000);
    };

    try {
      socket = new WebSocket(wsUrl("/ws/live"));

      socket.onopen = () => {
        if (!active) return;
        setConnectionStatus("connected");
        noSessionTimer = window.setTimeout(() => {
          if (!active || receivedWebSocketMessage) return;
          applyLiveData({ active: false, session: null }, "websocket");
        }, 3500);
      };

      socket.onmessage = (event) => {
        receivedWebSocketMessage = true;
        if (noSessionTimer) window.clearTimeout(noSessionTimer);
        try {
          const payload = JSON.parse(event.data) as Partial<LiveData>;
          applyLiveData(payload, "websocket");
        } catch {
          startPollingFallback();
        }
      };

      socket.onerror = () => {
        startPollingFallback();
      };

      socket.onclose = () => {
        if (active && !receivedWebSocketMessage) startPollingFallback();
        if (active && receivedWebSocketMessage) startPollingFallback();
      };
    } catch {
      startPollingFallback();
    }

    return () => {
      active = false;
      if (noSessionTimer) window.clearTimeout(noSessionTimer);
      if (pollingInterval) window.clearInterval(pollingInterval);
      socket?.close();
    };
  }, [demoMode, retryCount]);

  useEffect(() => {
    if (!demoMode) return;

    const interval = setInterval(() => {
      setDemoIndex((current) => (current + 1) % DEMO_SNAPSHOTS.length);
      setLastUpdatedAt(Date.now());
    }, 3500);

    return () => clearInterval(interval);
  }, [demoMode]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const visibleData = demoMode ? DEMO_SNAPSHOTS[demoIndex] : data;
  const displayedStatus: ConnectionStatus = demoMode
    ? "demo"
    : visibleData?.active === false
      ? "no-session"
      : connectionStatus;

  return (
    <div className="min-h-screen text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-32 sm:pt-40 pb-10 sm:pb-16">
        <div className="mb-12 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Live</p>
            <h1 className="text-3xl sm:text-4xl font-bold text-white">Race Companion</h1>
            <p className="text-sm text-zinc-400 mt-2">
              Real-time strategy predictions during live F1 sessions.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
              <span className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1 text-zinc-300">
                {statusCopy(displayedStatus)}
              </span>
              <span className="text-zinc-600">{formatLastUpdated(lastUpdatedAt, now)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setDemoMode((value) => {
                const next = !value;
                if (next) {
                  setLoading(false);
                  setLiveError(false);
                  setDemoIndex(0);
                  setConnectionStatus("demo");
                  setLastUpdatedAt(Date.now());
                } else {
                  setLoading(true);
                  setData(null);
                  setConnectionStatus("reconnecting");
                  setLastUpdatedAt(null);
                }
                return next;
              });
            }}
            className={`rounded-md px-5 py-2.5 text-sm font-semibold transition ${
              demoMode
                ? "border border-white/15 bg-white/10 text-white hover:bg-white/15"
                : "bg-red-600 text-white hover:bg-red-500"
            }`}
          >
            {demoMode ? "Exit Demo" : "Try Live Demo"}
          </button>
        </div>

        {loading && (
          <div className="glass-card p-10 text-center">
            <div className="h-5 w-48 glass-skeleton rounded mx-auto mb-4" />
            <p className="text-sm text-zinc-400">
              {liveState === "slowLoading"
                ? "Waking up the race data service..."
                : liveState === "retrying"
                  ? "Retrying live race data..."
                  : "Loading live race data..."}
            </p>
          </div>
        )}

        {!loading && liveError && !demoMode && (
          <div className="space-y-6">
            <div className="glass-card p-10 sm:p-16 text-center">
              <p className="text-xs text-red-400 uppercase tracking-widest mb-4">Offline</p>
              <h2 className="text-lg font-semibold text-zinc-200 mb-3">The backend is taking longer than expected.</h2>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setLiveState("loading");
                  setConnectionStatus("reconnecting");
                  setLastUpdatedAt(null);
                  setRetryCount((value) => value + 1);
                }}
                className="mt-4 rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => {
                  setDemoIndex(0);
                  setLoading(false);
                  setLiveError(false);
                  setConnectionStatus("demo");
                  setLastUpdatedAt(Date.now());
                  setDemoMode(true);
                }}
                className="ml-3 mt-4 rounded-md border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Try Demo
              </button>
            </div>
          </div>
        )}

        {!loading && !liveError && (!visibleData || !visibleData.active) && (
          <div className="space-y-6">
            <div className="glass-card p-10 sm:p-16 text-center">
              <p className="text-xs text-red-400 uppercase tracking-widest mb-4">No Live Session</p>
              <h2 className="text-lg font-semibold text-zinc-200 mb-3">Waiting for race data</h2>
              <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
                This page comes alive during race weekends. Use demo mode to see the live companion flow anytime.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDemoIndex(0);
                  setLoading(false);
                  setLiveError(false);
                  setConnectionStatus("demo");
                  setLastUpdatedAt(Date.now());
                  setDemoMode(true);
                }}
                className="mt-7 rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                Try Live Demo
              </button>
              <p className="text-xs text-zinc-600 mt-5">
                WebSocket first. REST polling takes over if the live stream is unavailable.
              </p>
            </div>

            <ExtensionBanner />
          </div>
        )}

        {!loading && visibleData?.active && visibleData.drivers && (
          <LiveCompanion
            data={visibleData}
            demoMode={demoMode}
            connectionStatus={displayedStatus}
            lastUpdatedLabel={formatLastUpdated(lastUpdatedAt, now)}
            showFullGrid={showFullGrid}
            setShowFullGrid={setShowFullGrid}
          />
        )}
      </div>
    </div>
  );
}

function LiveCompanion({
  data,
  demoMode,
  connectionStatus,
  lastUpdatedLabel,
  showFullGrid,
  setShowFullGrid,
}: {
  data: LiveData;
  demoMode: boolean;
  connectionStatus: ConnectionStatus;
  lastUpdatedLabel: string;
  showFullGrid: boolean;
  setShowFullGrid: (value: boolean) => void;
}) {
  const drivers = data.drivers || [];
  const visibleDrivers = showFullGrid ? drivers : drivers.slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="glass-card p-6 flex items-center justify-between" style={{ boxShadow: "0 0 20px rgba(239, 68, 68, 0.08), inset 0 1px 0 rgba(239, 68, 68, 0.1)" }}>
        <div>
          <p className="text-xs text-red-400 uppercase tracking-widest mb-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {statusCopy(connectionStatus)}
          </p>
          <p className="text-xl font-bold text-white">
            {(data.session || "").replace(" Grand Prix", " GP")}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-zinc-600">
            {lastUpdatedLabel}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-white tabular-nums">
            {data.lap}<span className="text-zinc-600 text-lg font-normal">/{data.totalLaps}</span>
          </p>
          <p className="text-[10px] text-zinc-600 uppercase">Lap</p>
        </div>
      </div>

      {demoMode && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-xs text-red-200">
            Demo data replaying saved race snapshots. Real live data still comes from OpenF1 during active sessions.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass-card p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="text-xs text-zinc-500 uppercase tracking-widest">Top Drivers</p>
            {drivers.length > 5 && (
              <button
                type="button"
                onClick={() => setShowFullGrid(!showFullGrid)}
                className="text-xs font-medium text-red-400 hover:text-red-300"
              >
                {showFullGrid ? "Show top 5" : "Show full grid"}
              </button>
            )}
          </div>

          <div className="overflow-x-auto pb-1 scrollbar-hide">
          <div className="min-w-[620px] grid grid-cols-[2rem_3px_2.5rem_1fr_5rem_5rem_5rem] gap-2 items-center px-1 mb-3">
            <span className="text-[9px] text-zinc-500 text-right">P</span>
            <span />
            <span className="text-[9px] text-zinc-500">Code</span>
            <span className="text-[9px] text-zinc-500">Gap</span>
            <span className="text-[9px] text-zinc-500 text-center">Tyre</span>
            <span className="text-[9px] text-zinc-500 text-right">Pit window</span>
            <span />
          </div>

          {visibleDrivers.map((driver, index) => (
            <div
              key={driver.code}
              className={`min-w-[620px] grid grid-cols-[2rem_3px_2.5rem_1fr_5rem_5rem_5rem] gap-2 items-center px-1 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors ${
                index < 3 ? "bg-white/[0.02]" : ""
              }`}
            >
              <span className={`text-sm font-bold text-right tabular-nums ${index === 0 ? "text-white" : "text-zinc-400"}`}>
                {driver.position}
              </span>
              <span className={`h-4 rounded-sm ${index === 0 ? "bg-red-500" : "bg-white/35"}`} />
              <span className="text-xs font-semibold text-zinc-200">{driver.code}</span>
              <span className="text-xs text-zinc-500">{driver.gap}</span>
              <div className="flex justify-center">
                <TyreIndicator compound={driver.compound} stintAge={driver.stintAge} tyreLife={driver.tyreLife} />
              </div>
              <span className="text-right">
                {driver.pitWindow ? (
                  <span className="glass-badge text-red-300">
                    {driver.pitWindow.replace("Lap ", "L")}
                  </span>
                ) : (
                  <span className="text-[10px] text-zinc-700">--</span>
                )}
              </span>
              <span />
            </div>
          ))}
          </div>
        </div>

        <div className="space-y-6">
          {data.predictions && data.predictions.length > 0 && (
            <LivePanel title="Pit Predictions">
              {data.predictions.map((prediction, index) => (
                <div key={index} className="py-2 border-b border-white/[0.04] last:border-0">
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-xs font-semibold text-zinc-200">{prediction.driver}</span>
                    <span className="text-[10px] text-zinc-400 text-right">{prediction.prediction}</span>
                  </div>
                  <div className="mt-2">
                    <ProgressiveDetail label="Prediction detail">
                      Confidence is {prediction.confidence}. The pit window is estimated from tyre life, stint age, current lap, and track position.
                    </ProgressiveDetail>
                  </div>
                </div>
              ))}
            </LivePanel>
          )}

          {data.whatIf && data.whatIf.length > 0 && (
            <LivePanel title="What If Pit Now?">
              {data.whatIf.map((item, index) => (
                <div key={index} className="flex items-center gap-2 py-2 border-b border-white/[0.04] last:border-0">
                  <span className="text-xs font-semibold text-zinc-200 w-8">{item.driver}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-md ${
                    item.recommendation === "pit" ? "bg-red-500/10 text-red-300" : "text-zinc-500"
                  }`}>
                    Pit {item.pitNow}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-md ${
                    item.recommendation === "stay" ? "bg-red-500/10 text-red-300" : "text-zinc-500"
                  }`}>
                    Stay {item.stayOut}
                  </span>
                </div>
              ))}
            </LivePanel>
          )}

          {data.alerts && data.alerts.length > 0 && (
            <LivePanel title="Simple Alerts">
              {data.alerts.map((alert, index) => {
                const insight = splitInsight(alert.text);
                return (
                  <div key={index} className="py-2 border-b border-white/[0.04] last:border-0">
                    <p className="text-xs leading-relaxed text-zinc-400">
                      <span className="text-red-400">{alert.type === "warning" ? "! " : ""}</span>
                      {insight.summary}
                    </p>
                    <div className="mt-2">
                      <ProgressiveDetail label="More context">
                        {insight.detail}
                      </ProgressiveDetail>
                    </div>
                  </div>
                );
              })}
            </LivePanel>
          )}
        </div>
      </div>

      <p className="text-[10px] text-zinc-600 text-center">
        {demoMode ? "Demo replay advances every few seconds" : "Live stream uses WebSocket with REST polling fallback"}
      </p>

      <ExtensionBanner />
    </div>
  );
}

function LivePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-5">
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">{title}</p>
      {children}
    </div>
  );
}

function ExtensionBanner() {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass-card p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-5">
      <div className="shrink-0 w-12 h-12 rounded-md bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-red-400">
          <path d="M20 4H4C2.89 4 2 4.89 2 6V18C2 19.11 2.89 20 4 20H20C21.11 20 22 19.11 22 18V6C22 4.89 21.11 4 20 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M12 15L12 9M12 9L9 12M12 9L15 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="flex-1 text-center sm:text-left">
        <p className="text-sm font-medium text-white mb-1">
          Raceday Browser Extension
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Get live strategy predictions overlaid directly on your F1 stream.
          Works with F1TV, YouTube, and any broadcast.
        </p>
      </div>
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="glass-button px-5 py-2.5 text-xs font-medium text-white border-red-500/30 hover:border-red-500/50 hover:shadow-lg hover:shadow-red-500/10 transition-all"
        >
          Get Extension
          <span className="ml-2 text-red-400">{open ? "-" : "+"}</span>
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-white/10 bg-black/95 shadow-2xl shadow-black/50 backdrop-blur"
          >
            <ExtensionDownloadLink
              href="/downloads/raceday-extension.zip"
              title="Edge / Chrome"
              detail="Download ZIP, unzip it, then load the folder from chrome://extensions or edge://extensions with Developer mode on."
            />
            <ExtensionDownloadLink
              href="/downloads/raceday-extension-firefox.zip"
              title="Firefox"
              detail="Download ZIP, open about:debugging#/runtime/this-firefox, choose Load Temporary Add-on, then select manifest.json from the unzipped folder."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ExtensionDownloadLink({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <a
      href={href}
      download
      role="menuitem"
      className="block border-b border-white/[0.06] px-4 py-3.5 text-left transition last:border-0 hover:bg-red-500/10"
    >
      <span className="block text-sm font-semibold text-white">{title}</span>
      <span className="mt-1.5 block text-[11px] leading-relaxed text-zinc-400">{detail}</span>
    </a>
  );
}
