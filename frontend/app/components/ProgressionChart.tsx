"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { API, FetchState, fetchWithTimeout } from "@/app/lib/api";

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
  const [state, setState] = useState<FetchState>("loading");
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetchWithTimeout<ProgressionData | null>(`${API}/championship/${year}/progression`, {
      onState: (nextState) => {
        setState(nextState);
        if (nextState !== "error") setError(false);
      },
    })
      .then((nextData) => {
        setData(nextData);
        setLoading(false);
      })
      .catch(() => {
        setData(null);
        setError(true);
        setLoading(false);
      });
  }, [year, retryCount]);

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="h-3 w-40 glass-skeleton rounded mb-4" />
        <div className="h-48 glass-skeleton rounded" />
        <p className="mt-4 text-center text-sm text-zinc-400">
          {state === "slowLoading"
            ? "Waking up the race data service..."
            : state === "retrying"
              ? "Retrying championship progression..."
              : "Loading championship progression..."}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-sm font-semibold text-red-400">Could not load championship graph.</p>
        <p className="mt-2 text-xs text-zinc-400">
          The backend is taking longer than expected.
        </p>
        <button
          type="button"
          onClick={() => setRetryCount((value) => value + 1)}
          className="mt-5 rounded-md bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
        >
          Retry graph
        </button>
      </div>
    );
  }

  if (!data || data.drivers.length === 0 || data.rounds.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-sm font-semibold text-zinc-200">No championship graph yet</p>
        <p className="mt-2 text-xs text-zinc-400">
          Progression appears once indexed races are available for this season.
        </p>
      </div>
    );
  }

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
