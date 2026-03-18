"use client";

import { useEffect, useState } from "react";
const API = "http://localhost:8888";

interface TurningPoint {
  race: string;
  type: string;
  headline: string;
  detail: string;
}

interface ConstructorEntry {
  team: string;
  points: number;
}

interface SeasonStoryData {
  momentum: {
    driver: string;
    full_name: string;
    team: string;
    points: number;
    results: { race: string; position: number | null; points: number }[];
  }[];
  turning_points: TurningPoint[];
  constructor_battle: ConstructorEntry[];
  race_round: number;
  total_rounds: number;
}

const TEAM_BAR: Record<string, string> = {
  "Red Bull Racing": "bg-blue-500",
  "Red Bull": "bg-blue-500",
  "Mercedes": "bg-emerald-400",
  "Ferrari": "bg-red-500",
  "McLaren": "bg-orange-400",
  "Williams": "bg-white/80",
  "Alpine": "bg-pink-400",
  "Aston Martin": "bg-green-500",
  "Haas F1 Team": "bg-zinc-400",
  "AlphaTauri": "bg-slate-400",
  "RB": "bg-slate-400",
  "Alfa Romeo": "bg-red-800",
  "Sauber": "bg-green-400",
  "Renault": "bg-yellow-400",
  "Racing Point": "bg-pink-300",
  "Force India": "bg-pink-300",
  "Toro Rosso": "bg-blue-400",
  "Lotus F1": "bg-amber-600",
  "Brawn": "bg-lime-400",
};

const TP_ICON: Record<string, { icon: string; color: string }> = {
  lead_change:   { icon: "\u21C4", color: "text-yellow-400" },
  gap_extension: { icon: "\u2197", color: "text-green-400" },
  gap_closing:   { icon: "\u2198", color: "text-orange-400" },
};

// Highlight "Full Name (CODE)" patterns
const DRIVER_NAME_PATTERN = /([A-Z][a-z]+(?: [A-Z][a-z]+)*) \(([A-Z]{3})\)/g;

function highlightDrivers(text: string): string {
  if (!text) return "";
  return text.replace(
    DRIVER_NAME_PATTERN,
    '<span class="font-semibold text-white">$1</span> <span class="text-zinc-500">($2)</span>'
  );
}

export default function SeasonStory({
  year,
  track,
}: {
  year: string;
  track: string;
}) {
  const [data, setData] = useState<SeasonStoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/races/${year}/${encodeURIComponent(track)}/season-story`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setData(null);
        setLoading(false);
      });
  }, [year, track]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="rounded-lg bg-zinc-900 p-5 h-32" />
        <div className="rounded-lg bg-zinc-900 p-5 h-32" />
      </div>
    );
  }

  if (!data) return null;

  const maxTeamPts = data.constructor_battle[0]?.points || 1;

  return (
    <div className="space-y-4">
      {/* Round indicator */}
      <p className="text-xs text-zinc-600">
        Round {data.race_round} of {data.total_rounds}
      </p>

      {/* Turning Points */}
      {data.turning_points.length > 0 && (
        <div className="rounded-lg bg-zinc-900 p-5">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">
            Championship Turning Points
          </p>
          <div className="space-y-3">
            {data.turning_points.map((tp, i) => {
              const style = TP_ICON[tp.type] || { icon: "?", color: "text-zinc-400" };
              return (
                <div key={i} className="flex gap-3 items-start">
                  <span
                    className={`w-7 h-7 rounded bg-zinc-800 flex items-center justify-center text-sm shrink-0 ${style.color}`}
                  >
                    {style.icon}
                  </span>
                  <div className="min-w-0">
                    <p
                      className="text-sm font-medium text-zinc-200"
                      dangerouslySetInnerHTML={{ __html: highlightDrivers(tp.headline) }}
                    />
                    <p className="text-xs text-zinc-500 mt-0.5">{tp.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Team Standings */}
      <div className="rounded-lg bg-zinc-900 p-5">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">
          Team Championship
        </p>
        <p className="text-xs text-zinc-600 mb-4">
          Combined points from both drivers per team, up to this race
        </p>
        <div className="space-y-2.5">
          {data.constructor_battle.map((c, i) => {
            const barColor = TEAM_BAR[c.team] || "bg-zinc-500";
            const barWidth = Math.round((c.points / maxTeamPts) * 100);
            return (
              <div key={c.team} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-600 w-4 text-right font-mono">
                      {i + 1}
                    </span>
                    <span className="text-sm text-zinc-300">{c.team}</span>
                  </div>
                  <span className="text-sm font-bold text-zinc-400">
                    {c.points}
                  </span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden ml-6">
                  <div
                    className={`h-full rounded-full ${barColor}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
