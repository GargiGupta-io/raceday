"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { API } from "@/app/lib/api";

interface ProgressionData {
  rounds: { round: number; track: string }[];
  drivers: { code: string; team: string; points: number[] }[];
}

const TEAM_COLOR: Record<string, string> = {
  "Red Bull Racing": "#3b82f6",
  "Red Bull": "#3b82f6",
  "Mercedes": "#34d399",
  "Ferrari": "#ef4444",
  "McLaren": "#fb923c",
  "Williams": "#e4e4e7",
  "Alpine": "#f472b6",
  "Aston Martin": "#22c55e",
  "Haas F1 Team": "#a1a1aa",
  "AlphaTauri": "#94a3b8",
  "RB": "#94a3b8",
  "Alfa Romeo": "#991b1b",
  "Sauber": "#4ade80",
  "Renault": "#facc15",
  "Racing Point": "#f9a8d4",
  "Force India": "#f9a8d4",
  "Toro Rosso": "#60a5fa",
  "Lotus F1": "#d97706",
  "Brawn": "#a3e635",
};

export default function ProgressionChart({ year }: { year: string }) {
  const [data, setData] = useState<ProgressionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/championship/${year}/progression`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setData(null); setLoading(false); });
  }, [year]);

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="h-3 w-40 glass-skeleton rounded mb-4" />
        <div className="h-48 glass-skeleton rounded" />
      </div>
    );
  }

  if (!data || data.drivers.length === 0) return null;

  // Transform data for recharts: [{round, track, VER: 25, HAM: 18, ...}, ...]
  const chartData = data.rounds.map((r, i) => {
    const point: Record<string, string | number> = {
      round: `R${r.round}`,
      track: r.track,
    };
    for (const driver of data.drivers) {
      point[driver.code] = driver.points[i] ?? 0;
    }
    return point;
  });

  return (
    <div className="glass-card p-6">
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">
        Season Progression
      </p>
      <p className="text-xs text-zinc-600 mb-6">
        Cumulative points for the top {data.drivers.length} drivers across {data.rounds.length} races
      </p>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <XAxis
            dataKey="round"
            tick={{ fontSize: 10, fill: "#71717a" }}
            axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
            width={35}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(0,0,0,0.8)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "0.75rem",
              fontSize: "12px",
              color: "#e4e4e7",
            }}
            labelFormatter={(label, payload) => {
              const track = payload?.[0]?.payload?.track;
              return track ? `${label} — ${track}` : label;
            }}
          />
          {data.drivers.map((driver) => (
            <Line
              key={driver.code}
              type="monotone"
              dataKey={driver.code}
              stroke={TEAM_COLOR[driver.team] || "#a1a1aa"}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 justify-center">
        {data.drivers.map((driver) => (
          <div key={driver.code} className="flex items-center gap-1.5">
            <span
              className="w-3 h-[2px] rounded-full"
              style={{ background: TEAM_COLOR[driver.team] || "#a1a1aa" }}
            />
            <span className="text-[10px] text-zinc-400 font-medium">{driver.code}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
