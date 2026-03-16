"use client";

import { useEffect, useState } from "react";

const API = "http://localhost:8080";

const COMPOUND_INFO: Record<string, { color: string; desc: string }> = {
  Soft:         { color: "bg-red-500",    desc: "Fastest, degrades quickly" },
  Medium:       { color: "bg-yellow-500", desc: "Balanced pace and durability" },
  Hard:         { color: "bg-white",      desc: "Slowest, lasts longest" },
  Intermediate: { color: "bg-green-500",  desc: "Light rain, grooved surface" },
  Wet:          { color: "bg-blue-500",   desc: "Heavy rain, full treads" },
};

interface StrategyStats {
  most_common: string;
  strategies: number;
  first_to_pit: { driver: string; team: string; lap: number } | null;
  last_to_pit: { driver: string; team: string; lap: number } | null;
  longest_stint: { driver: string; team: string; compound: string; laps: number } | null;
  shortest_stint: { driver: string; team: string; compound: string; laps: number } | null;
  compounds_used: string[];
}

export default function StrategyKey({
  year,
  track,
}: {
  year: string;
  track: string;
}) {
  const [stats, setStats] = useState<StrategyStats | null>(null);

  useEffect(() => {
    fetch(`${API}/races/${year}/${encodeURIComponent(track)}/strategy/stats`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => setStats(data))
      .catch(() => {});
  }, [year, track]);

  return (
    <div className="space-y-4">

      {/* Compound Key */}
      <div className="rounded-lg bg-zinc-900 p-4">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
          Compound Key
        </p>
        <div className="space-y-2.5">
          {(stats?.compounds_used || ["Soft", "Medium", "Hard"]).map((name) => {
            const info = COMPOUND_INFO[name];
            if (!info) return null;
            return (
              <div key={name} className="flex items-center gap-3">
                <span className={`w-3 h-3 rounded-full ${info.color} shrink-0`} />
                <div>
                  <p className="text-sm text-zinc-200">{name}</p>
                  <p className="text-xs text-zinc-500">{info.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Race Stats */}
      {stats && (
        <div className="rounded-lg bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
            Race Stats
          </p>
          <div className="space-y-3">
            <StatRow label="Most common" value={stats.most_common} />
            <StatRow label="Strategies used" value={String(stats.strategies)} />
            {stats.first_to_pit && (
              <StatRow
                label="First to pit"
                value={`${stats.first_to_pit.driver} (lap ${stats.first_to_pit.lap})`}
              />
            )}
            {stats.last_to_pit && (
              <StatRow
                label="Last to pit"
                value={`${stats.last_to_pit.driver} (lap ${stats.last_to_pit.lap})`}
              />
            )}
            {stats.longest_stint && (
              <StatRow
                label="Longest stint"
                value={`${stats.longest_stint.laps} laps`}
                detail={`${stats.longest_stint.driver}, ${stats.longest_stint.compound}`}
              />
            )}
            {stats.shortest_stint && (
              <StatRow
                label="Shortest stint"
                value={`${stats.shortest_stint.laps} laps`}
                detail={`${stats.shortest_stint.driver}, ${stats.shortest_stint.compound}`}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">{label}</span>
        <span className="text-xs text-zinc-200 font-medium">{value}</span>
      </div>
      {detail && (
        <p className="text-[10px] text-zinc-600 text-right mt-0.5">{detail}</p>
      )}
    </div>
  );
}
