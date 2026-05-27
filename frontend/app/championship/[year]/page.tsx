"use client";

import { useEffect, useState } from "react";
import { use } from "react";

import { API, FetchState, fetchWithTimeout } from "@/app/lib/api";
import ProgressionChart from "@/app/components/ProgressionChart";

interface StandingEntry {
  position: number;
  driver: string;
  team: string;
  points: number;
  wins: number;
  races: number;
}

export default function ChampionshipPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year } = use(params);

  const [standings, setStandings] = useState<StandingEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<FetchState>("loading");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchWithTimeout<StandingEntry[]>(`${API}/championship/${year}/drivers`, {
      onState: (nextState) => {
        setState(nextState);
        if (nextState !== "error") setError(null);
      },
    })
      .then((data) => {
        setStandings(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Request failed");
        setLoading(false);
      });
  }, [year, retryCount]);

  const racesIndexed = standings?.[0]?.races ?? 0;
  const leader = standings?.[0];

  return (
    <div className="min-h-screen text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-32 sm:pt-40 pb-10 sm:pb-16">

        {/* Header */}
        <div className="mb-12">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">{year}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white">Drivers Championship</h1>
          {racesIndexed > 0 && (
            <p className="mt-2 text-xs text-zinc-500">
              Based on {racesIndexed} indexed {racesIndexed === 1 ? "race" : "races"}
            </p>
          )}
        </div>

        {loading && (
          <div className="space-y-6">
            {/* Leader card skeleton */}
            <div className="glass-card p-8 flex items-center justify-between">
              <div className="space-y-3">
                <div className="h-2 w-28 glass-skeleton rounded" />
                <div className="h-7 w-40 glass-skeleton rounded" />
                <div className="h-3 w-24 glass-skeleton rounded" />
              </div>
              <div className="text-right space-y-3">
                <div className="h-7 w-16 glass-skeleton rounded ml-auto" />
                <div className="h-2 w-10 glass-skeleton rounded ml-auto" />
              </div>
            </div>
            {/* Table skeleton */}
            <div className="glass-card overflow-hidden">
              <div className="px-6 py-3 border-b border-white/[0.06]">
                <div className="h-3 w-full glass-skeleton rounded" />
              </div>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-3.5 border-b border-white/[0.04]">
                  <div className="h-4 w-6 glass-skeleton rounded" />
                  <div className="flex-1 space-y-1">
                    <div className="h-4 w-32 glass-skeleton rounded" />
                    <div className="h-3 w-20 glass-skeleton rounded" />
                  </div>
                  <div className="h-4 w-10 glass-skeleton rounded" />
                  <div className="h-4 w-8 glass-skeleton rounded" />
                </div>
              ))}
            </div>
            <p className="text-center text-sm text-zinc-400">
              {state === "slowLoading"
                ? "Waking up the race data service..."
                : state === "retrying"
                  ? "Retrying championship data..."
                  : "Loading championship data..."}
            </p>
          </div>
        )}
        {error && (
          <div className="glass-card p-8 text-center">
            <p className="text-red-400 text-sm">Could not load standings.</p>
            <p className="text-zinc-400 text-xs mt-2">The backend is taking longer than expected.</p>
            <button
              type="button"
              onClick={() => setRetryCount((value) => value + 1)}
              className="mt-5 rounded-md bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Retry standings
            </button>
          </div>
        )}

        {!loading && !error && standings && (
          <div className="space-y-8">

            {/* Leader card */}
            {leader && (
              <div className="glass-card p-6 sm:p-8 flex items-center justify-between gap-4" style={{ boxShadow: "0 0 30px rgba(239, 68, 68, 0.08), inset 0 1px 0 rgba(239, 68, 68, 0.1)" }}>
                <div className="min-w-0">
                  <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Championship leader</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight truncate">{leader.driver}</p>
                  <p className="mt-1.5 text-sm text-zinc-400 truncate">{leader.team}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl sm:text-3xl font-bold text-red-400">{leader.points}</p>
                  <p className="text-xs text-zinc-500 mt-1">points</p>
                </div>
              </div>
            )}

            {/* Season progression chart */}
            <ProgressionChart year={year} />

            {/* Full table — glass */}
            <div className="glass-card overflow-x-auto">
              <div className="min-w-0 sm:min-w-[20rem]">
              {/* Header */}
              <div className="grid grid-cols-[2.5rem_1fr_4rem_3rem_3rem] gap-2 sm:gap-3 px-4 sm:px-6 py-3 border-b border-white/[0.06]">
                <span className="text-xs text-zinc-500 text-right">P</span>
                <span className="text-xs text-zinc-500">Driver</span>
                <span className="text-xs text-zinc-500 text-right">Points</span>
                <span className="text-xs text-zinc-500 text-right">Wins</span>
                <span className="text-xs text-zinc-500 text-right">Races</span>
              </div>

              {standings.map((entry) => (
                <div
                  key={entry.driver}
                  className={`grid grid-cols-[2.5rem_1fr_4rem_3rem_3rem] gap-2 sm:gap-3 items-center px-4 sm:px-6 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors ${
                    entry.position === 1 ? "bg-red-500/[0.04]" : ""
                  }`}
                >
                  {/* Position */}
                  <span className={`text-sm font-mono text-right font-semibold ${
                    entry.position === 1 ? "text-red-400" :
                    entry.position === 2 ? "text-zinc-300" :
                    entry.position === 3 ? "text-zinc-400" :
                    "text-zinc-600"
                  }`}>
                    {entry.position}
                  </span>

                  {/* Driver + team */}
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{entry.driver}</p>
                    <p className="text-xs text-zinc-500">{entry.team}</p>
                  </div>

                  {/* Points */}
                  <span className={`text-sm font-semibold text-right ${
                    entry.position === 1 ? "text-red-400" : "text-zinc-200"
                  }`}>
                    {entry.points}
                  </span>

                  {/* Wins */}
                  <span className={`text-sm text-right ${
                    entry.wins > 0 ? "text-zinc-200" : "text-zinc-600"
                  }`}>
                    {entry.wins}
                  </span>

                  {/* Races */}
                  <span className="text-sm text-zinc-500 text-right">{entry.races}</span>
                </div>
              ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
