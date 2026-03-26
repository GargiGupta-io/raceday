"use client";

import { useEffect, useState } from "react";

import { API } from "@/app/lib/api";

interface Award {
  title: string;
  driver: string;
  full_name: string;
  team: string;
  stat: string;
  detail: string;
}

interface H2H {
  team: string;
  driver1: string;
  name1: string;
  score1: number;
  driver2: string;
  name2: string;
  score2: number;
}

interface InsightsData {
  awards: Award[];
  h2h: H2H[];
  races_counted: number;
}

const TEAM_DOT: Record<string, string> = {
  "Red Bull Racing": "bg-blue-500",
  "Red Bull": "bg-blue-500",
  "Mercedes": "bg-emerald-400",
  "Ferrari": "bg-red-500",
  "McLaren": "bg-orange-400",
  "Williams": "bg-white",
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
  "Caterham": "bg-green-600",
  "Marussia": "bg-red-600",
};

const AWARD_ICON: Record<string, string> = {
  "Best Starter": "\u2B06",
  "Most Consistent": "\u2B50",
  "Worst Luck": "\u26A1",
  "Points Machine": "\uD83C\uDFAF",
  "Best Qualifier": "\u23F1",
};

export default function SeasonInsights({ year }: { year: string }) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/seasons/${year}/insights`)
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
  }, [year]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="glass p-5 rounded-xl h-40" />
        <div className="glass p-5 rounded-xl h-48" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-600">
        Based on {data.races_counted} indexed races
      </p>

      {/* Awards */}
      {data.awards.length > 0 && (
        <div className="glass p-5 rounded-xl">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">
            Season Awards
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.awards.map((a) => {
              const dot = TEAM_DOT[a.team] || "bg-zinc-500";
              const icon = AWARD_ICON[a.title] || "\uD83C\uDFC6";
              return (
                <div key={a.title} className="rounded-lg glass p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">{icon}</span>
                    <span className="text-xs text-zinc-400 font-medium uppercase tracking-widest">
                      {a.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className="text-sm font-semibold text-zinc-100">
                      {a.full_name}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 font-medium">{a.stat}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{a.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Teammate H2H */}
      {data.h2h.length > 0 && (
        <div className="glass p-5 rounded-xl">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">
            Teammate Head-to-Head
          </p>
          <div className="space-y-2">
            {data.h2h.map((h) => {
              const total = h.score1 + h.score2;
              const pct1 = total > 0 ? Math.round((h.score1 / total) * 100) : 50;
              const dot = TEAM_DOT[h.team] || "bg-zinc-500";
              return (
                <div key={h.team} className="space-y-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                    <span className="text-xs text-zinc-500">{h.team}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-300 w-24 truncate text-right font-medium">
                      {h.name1}
                    </span>
                    <span className="text-zinc-100 font-bold w-5 text-right">
                      {h.score1}
                    </span>
                    <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500/70 rounded-l-full"
                        style={{ width: `${pct1}%` }}
                      />
                      <div
                        className="h-full bg-red-500/50 rounded-r-full"
                        style={{ width: `${100 - pct1}%` }}
                      />
                    </div>
                    <span className="text-zinc-400 font-bold w-5">
                      {h.score2}
                    </span>
                    <span className="text-zinc-500 w-24 truncate">
                      {h.name2}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
