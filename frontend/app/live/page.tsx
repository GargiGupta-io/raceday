"use client";

import { useEffect, useState } from "react";
import { API } from "@/app/lib/api";

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
  session?: string;
  drivers?: DriverLive[];
  predictions?: PitPrediction[];
  whatIf?: WhatIf[];
  alerts?: PatternAlert[];
}

const COMPOUND_COLOUR: Record<string, string> = {
  SOFT: "#dc2626",
  MEDIUM: "#eab308",
  HARD: "#e4e4e7",
  INTERMEDIATE: "#22c55e",
  WET: "#3b82f6",
};

function TyreIndicator({ compound, stintAge, tyreLife }: { compound: string; stintAge: number; tyreLife: number }) {
  const colour = COMPOUND_COLOUR[compound] || "#a1a1aa";
  const lifeColour = tyreLife > 50 ? "#4ade80" : tyreLife > 25 ? "#eab308" : "#f87171";

  return (
    <div className="flex items-center gap-2">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
        style={{ border: `2px solid ${colour}`, color: colour }}
      >
        {compound.charAt(0)}
      </div>
      <div className="w-10 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${tyreLife}%`, background: lifeColour }} />
      </div>
      <span className="text-[10px] text-zinc-600 tabular-nums">{stintAge}L</span>
    </div>
  );
}

export default function LivePage() {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);

  // Poll /live endpoint every 10 seconds
  useEffect(() => {
    let active = true;

    const fetchLive = () => {
      fetch(`${API}/live`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (active) { setData(d); setLoading(false); }
        })
        .catch(() => {
          if (active) { setData(null); setLoading(false); }
        });
    };

    fetchLive();
    const interval = setInterval(fetchLive, 10000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  return (
    <div className="min-h-screen text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 sm:py-16">

        {/* Header */}
        <div className="mb-12">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Live</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white">Race Companion</h1>
          <p className="text-sm text-zinc-400 mt-2">
            Real-time strategy predictions during live F1 sessions.
          </p>
        </div>

        {loading && (
          <div className="glass-card p-10 text-center">
            <div className="h-5 w-48 glass-skeleton rounded mx-auto mb-4" />
            <div className="h-3 w-64 glass-skeleton rounded mx-auto" />
          </div>
        )}

        {!loading && (!data || !data.active) && (
          <div className="glass-card p-10 sm:p-16 text-center">
            <div className="text-4xl mb-5">&#127937;</div>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">No Live Session</h2>
            <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
              This page comes alive during race weekends. Strategy predictions, tyre life tracking,
              and pattern alerts appear automatically when a session is active.
            </p>
            <p className="text-xs text-zinc-600 mt-5">
              Auto-refreshes every 10 seconds
            </p>
          </div>
        )}

        {!loading && data?.active && data.drivers && (
          <div className="space-y-8">

            {/* Session bar */}
            <div className="glass-card p-6 flex items-center justify-between" style={{ boxShadow: "0 0 20px rgba(239, 68, 68, 0.08), inset 0 1px 0 rgba(239, 68, 68, 0.1)" }}>
              <div>
                <p className="text-xs text-red-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Live
                </p>
                <p className="text-xl font-bold text-white">
                  {(data.session || "").replace(" Grand Prix", " GP")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-white tabular-nums">
                  {data.lap}<span className="text-zinc-600 text-lg font-normal">/{data.totalLaps}</span>
                </p>
                <p className="text-[10px] text-zinc-600 uppercase">Lap</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

              {/* Driver standings — takes 2 columns */}
              <div className="lg:col-span-2 glass-card p-6">
                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-5">Driver Standings</p>

                {/* Header */}
                <div className="grid grid-cols-[2rem_3px_2.5rem_1fr_5rem_5rem_5rem] gap-2 items-center px-1 mb-3">
                  <span className="text-[9px] text-zinc-500 text-right">P</span>
                  <span />
                  <span className="text-[9px] text-zinc-500">Code</span>
                  <span className="text-[9px] text-zinc-500">Gap</span>
                  <span className="text-[9px] text-zinc-500 text-center">Tyre</span>
                  <span className="text-[9px] text-zinc-500 text-right">Pit window</span>
                  <span />
                </div>

                {data.drivers.map((d, i) => (
                  <div
                    key={d.code}
                    className={`grid grid-cols-[2rem_3px_2.5rem_1fr_5rem_5rem_5rem] gap-2 items-center px-1 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors ${
                      i < 3 ? "bg-white/[0.02]" : ""
                    }`}
                  >
                    <span className={`text-sm font-bold text-right tabular-nums ${
                      i === 0 ? "text-yellow-400" : i < 3 ? "text-zinc-200" : "text-zinc-500"
                    }`}>
                      {d.position}
                    </span>
                    <span className="h-4 rounded-sm" style={{ background: d.teamColour }} />
                    <span className="text-xs font-semibold text-zinc-200">{d.code}</span>
                    <span className="text-xs text-zinc-500">{d.gap}</span>
                    <div className="flex justify-center">
                      <TyreIndicator compound={d.compound} stintAge={d.stintAge} tyreLife={d.tyreLife} />
                    </div>
                    <span className="text-right">
                      {d.pitWindow ? (
                        <span className="glass-badge text-amber-400">
                          {d.pitWindow.replace("Lap ", "L")}
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-700">--</span>
                      )}
                    </span>
                    <span />
                  </div>
                ))}
              </div>

              {/* Sidebar — predictions + what-if + alerts */}
              <div className="space-y-6">

                {/* Pit predictions */}
                {data.predictions && data.predictions.length > 0 && (
                  <div className="glass-card p-5">
                    <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">Pit Predictions</p>
                    {data.predictions.map((p, i) => (
                      <div key={i} className="flex justify-between items-center py-2 border-b border-white/[0.04] last:border-0">
                        <span className="text-xs font-semibold text-zinc-200">{p.driver}</span>
                        <div className="text-right">
                          <span className="text-[10px] text-zinc-400">{p.prediction}</span>
                          <span className={`text-[8px] ml-1.5 glass-badge ${
                            p.confidence === "high" ? "text-green-400" : "text-zinc-500"
                          }`}>
                            {p.confidence}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* What-if */}
                {data.whatIf && data.whatIf.length > 0 && (
                  <div className="glass-card p-5">
                    <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">What If Pit NOW?</p>
                    {data.whatIf.map((w, i) => (
                      <div key={i} className="flex items-center gap-2 py-2 border-b border-white/[0.04] last:border-0">
                        <span className="text-xs font-semibold text-zinc-200 w-8">{w.driver}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-lg ${
                          w.recommendation === "pit" ? "bg-green-500/10 text-green-400" : "text-zinc-500"
                        }`}>
                          Pit {w.pitNow}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-lg ${
                          w.recommendation === "stay" ? "bg-green-500/10 text-green-400" : "text-zinc-500"
                        }`}>
                          Stay {w.stayOut}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pattern alerts */}
                {data.alerts && data.alerts.length > 0 && (
                  <div className="glass-card p-5">
                    <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">Pattern Alerts</p>
                    {data.alerts.map((a, i) => (
                      <p key={i} className={`text-xs leading-relaxed py-1.5 ${
                        a.type === "warning" ? "text-amber-400" : "text-zinc-400"
                      }`}>
                        {a.type === "warning" ? "! " : ""}{a.text}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Auto-refresh notice */}
            <p className="text-[10px] text-zinc-600 text-center">
              Auto-refreshes every 10 seconds
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
