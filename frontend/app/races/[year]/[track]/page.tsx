"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";

const API = "http://localhost:8001";

interface RaceSummary {
  winner: string;
  winner_team: string;
  podium: { position: number; driver: string; team: string }[];
  retirements: { driver: string; team: string }[];
  weather: string;
}

interface StandingEntry {
  position: number;
  driver: string;
  team: string;
  finish_position: number | null;
  grid_position: number | null;
  positions_gained: number | null;
  status: string;
}

interface StrategyEntry {
  driver: string;
  team: string;
  stops: number;
  compounds: string[];
  label: string;
}

type Tab = "results" | "standings" | "strategy";

export default function RacePage({
  params,
}: {
  params: Promise<{ year: string; track: string }>;
}) {
  const { year, track } = use(params);
  const trackName = decodeURIComponent(track);

  const [tab, setTab] = useState<Tab>("results");
  const [results, setResults] = useState<RaceSummary | null>(null);
  const [standings, setStandings] = useState<StandingEntry[] | null>(null);
  const [strategy, setStrategy] = useState<StrategyEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = `${API}/races/${year}/${encodeURIComponent(trackName)}`;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`${base}/results`).then((r) => r.json()),
      fetch(`${base}/standings`).then((r) => r.json()),
      fetch(`${base}/strategy`).then((r) => r.json()),
    ])
      .then(([res, sta, str]) => {
        setResults(res);
        setStandings(sta);
        setStrategy(str);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [year, trackName]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-12">

        {/* Back link */}
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← {year} season
        </Link>

        {/* Race header */}
        <div className="mb-8">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">{year}</p>
          <h1 className="text-2xl font-bold text-white">{trackName}</h1>
        </div>

        {loading && <p className="text-zinc-500 text-sm">Loading race data...</p>}
        {error && <p className="text-red-400 text-sm">Could not load race data.</p>}

        {!loading && !error && (
          <>
            {/* Tab bar */}
            <div className="mb-6 flex gap-1 border-b border-zinc-800 pb-0">
              {(["results", "standings", "strategy"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                    tab === t
                      ? "border-red-500 text-white"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === "results" && results && (
              <ResultsPlaceholder data={results} />
            )}
            {tab === "standings" && standings && (
              <StandingsPlaceholder data={standings} />
            )}
            {tab === "strategy" && strategy && (
              <StrategyPlaceholder data={strategy} />
            )}
          </>
        )}

      </div>
    </div>
  );
}

function ResultsPlaceholder({ data }: { data: RaceSummary }) {
  return (
    <div className="rounded-lg bg-zinc-900 p-6 space-y-4">
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Winner</p>
        <p className="text-lg font-semibold text-white">{data.winner}</p>
        <p className="text-sm text-zinc-400">{data.winner_team}</p>
      </div>
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Weather</p>
        <p className="text-sm text-zinc-300">{data.weather}</p>
      </div>
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Podium</p>
        {data.podium.map((p) => (
          <p key={p.position} className="text-sm text-zinc-300">
            P{p.position} — {p.driver} ({p.team})
          </p>
        ))}
      </div>
      {data.retirements.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Retirements</p>
          {data.retirements.map((r) => (
            <p key={r.driver} className="text-sm text-zinc-500">
              {r.driver} ({r.team})
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function StandingsPlaceholder({ data }: { data: StandingEntry[] }) {
  return (
    <div className="rounded-lg bg-zinc-900 overflow-hidden">
      {data.map((entry) => (
        <div
          key={entry.driver}
          className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 last:border-0"
        >
          <div className="flex items-center gap-4">
            <span className="w-6 text-right text-xs text-zinc-500 font-mono">
              {entry.finish_position ?? "—"}
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-100">{entry.driver}</p>
              <p className="text-xs text-zinc-500">{entry.team}</p>
            </div>
          </div>
          <DeltaBadge delta={entry.positions_gained} status={entry.status} />
        </div>
      ))}
    </div>
  );
}

function DeltaBadge({ delta, status }: { delta: number | null; status: string }) {
  if (status === "Retired") {
    return <span className="text-xs text-zinc-600">Retired</span>;
  }
  if (delta === null) return null;
  if (delta > 0)
    return <span className="text-xs font-medium text-emerald-400">+{delta}</span>;
  if (delta < 0)
    return <span className="text-xs font-medium text-red-400">{delta}</span>;
  return <span className="text-xs text-zinc-600">—</span>;
}

function StrategyPlaceholder({ data }: { data: StrategyEntry[] }) {
  return (
    <div className="rounded-lg bg-zinc-900 overflow-hidden">
      {data.map((entry) => (
        <div
          key={entry.driver}
          className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 last:border-0"
        >
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-100">{entry.driver}</p>
              <p className="text-xs text-zinc-500">{entry.team}</p>
            </div>
          </div>
          <p className="text-xs text-zinc-400">{entry.label}</p>
        </div>
      ))}
    </div>
  );
}
