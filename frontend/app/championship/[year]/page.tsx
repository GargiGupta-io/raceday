"use client";

import { useEffect, useState } from "react";
import { use } from "react";

import { API } from "@/app/lib/api";

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

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API}/championship/${year}/drivers`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data) => {
        setStandings(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [year]);

  const racesIndexed = standings?.[0]?.races ?? 0;
  const leader = standings?.[0];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">

        {/* Header */}
        <div className="mb-8">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">{year}</p>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-racing)" }}>Drivers Championship</h1>
          {racesIndexed > 0 && (
            <p className="mt-1 text-xs text-zinc-500">
              Based on {racesIndexed} indexed {racesIndexed === 1 ? "race" : "races"}
            </p>
          )}
        </div>

        {loading && (
          <div className="space-y-4 animate-pulse">
            {/* Leader card skeleton */}
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-6 flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-2 w-28 bg-zinc-800 rounded" />
                <div className="h-7 w-40 bg-zinc-800 rounded" />
                <div className="h-3 w-24 bg-zinc-800 rounded" />
              </div>
              <div className="text-right space-y-2">
                <div className="h-7 w-16 bg-zinc-800 rounded ml-auto" />
                <div className="h-2 w-10 bg-zinc-800 rounded ml-auto" />
              </div>
            </div>
            {/* Table skeleton */}
            <div className="rounded-lg bg-zinc-900 overflow-hidden">
              <div className="px-5 py-2 border-b border-zinc-800">
                <div className="h-3 w-full bg-zinc-800 rounded" />
              </div>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-zinc-800/60">
                  <div className="h-4 w-6 bg-zinc-800 rounded" />
                  <div className="flex-1 space-y-1">
                    <div className="h-4 w-32 bg-zinc-800 rounded" />
                    <div className="h-3 w-20 bg-zinc-800 rounded" />
                  </div>
                  <div className="h-4 w-10 bg-zinc-800 rounded" />
                  <div className="h-4 w-8 bg-zinc-800 rounded" />
                </div>
              ))}
            </div>
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-zinc-900 border border-red-900/50 p-6 text-center">
            <p className="text-red-400 text-sm">Could not load standings.</p>
            <p className="text-zinc-600 text-xs mt-1">Check that the backend is running on the correct port.</p>
          </div>
        )}

        {!loading && !error && standings && (
          <div className="space-y-4">

            {/* Leader card */}
            {leader && (
              <div className="rounded-lg bg-zinc-900 border border-yellow-500/30 p-4 sm:p-6 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Championship leader</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight truncate">{leader.driver}</p>
                  <p className="mt-1 text-sm text-zinc-400 truncate">{leader.team}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl sm:text-3xl font-bold text-yellow-400">{leader.points}</p>
                  <p className="text-xs text-zinc-500 mt-1">points</p>
                </div>
              </div>
            )}

            {/* Full table */}
            <div className="rounded-lg bg-zinc-900 overflow-x-auto">
              <div className="min-w-0 sm:min-w-[20rem]">
              {/* Header */}
              <div className="grid grid-cols-[2.5rem_1fr_4rem_3rem_3rem] gap-2 sm:gap-3 px-3 sm:px-5 py-2 border-b border-zinc-800">
                <span className="text-xs text-zinc-600 text-right">P</span>
                <span className="text-xs text-zinc-600">Driver</span>
                <span className="text-xs text-zinc-600 text-right">Points</span>
                <span className="text-xs text-zinc-600 text-right">Wins</span>
                <span className="text-xs text-zinc-600 text-right">Races</span>
              </div>

              {standings.map((entry) => (
                <div
                  key={entry.driver}
                  className={`grid grid-cols-[2.5rem_1fr_4rem_3rem_3rem] gap-2 sm:gap-3 items-center px-3 sm:px-5 py-3 border-b border-zinc-800/60 last:border-0 ${
                    entry.position === 1 ? "bg-yellow-500/5" : ""
                  }`}
                >
                  {/* Position */}
                  <span className={`text-sm font-mono text-right font-semibold ${
                    entry.position === 1 ? "text-yellow-400" :
                    entry.position === 2 ? "text-zinc-300" :
                    entry.position === 3 ? "text-amber-600" :
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
                    entry.position === 1 ? "text-yellow-400" : "text-zinc-200"
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
