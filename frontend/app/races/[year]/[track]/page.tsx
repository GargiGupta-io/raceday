"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import ResultsCard from "@/app/components/ResultsCard";
import StandingsTable from "@/app/components/StandingsTable";
import StrategyPanel from "@/app/components/StrategyPanel";
import FactsSidebar from "@/app/components/FactsSidebar";
import DiscussionPanel from "@/app/components/DiscussionPanel";

const API = "http://localhost:8080";

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

interface SidebarData {
  articles: { title: string; url: string; summary: string; source: string; published: string }[];
  reddit: {
    race_thread: { title: string; url: string; score: number; num_comments: number; author: string; flair: string } | null;
    posts: { title: string; url: string; score: number; num_comments: number; author: string; flair: string }[];
  };
  did_you_know: string[];
}

type Tab = "results" | "standings" | "strategy" | "discussion";

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
  const [sidebar, setSidebar] = useState<SidebarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = `${API}/races/${year}/${encodeURIComponent(trackName)}`;
    setLoading(true);
    setError(null);

    // Fetch tab data (blocks render)
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

    // Fetch sidebar independently (doesn't block tabs)
    fetch(`${base}/sidebar`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data) setSidebar(data);
      })
      .catch(() => {});
  }, [year, trackName]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-12">

        {/* Race header */}
        <div className="mb-8">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">{year}</p>
          <h1 className="text-2xl font-bold text-white">{trackName}</h1>
        </div>

        {loading && <p className="text-zinc-500 text-sm">Loading race data...</p>}
        {error && <p className="text-red-400 text-sm">Could not load race data.</p>}

        {!loading && !error && (
          <div className="flex gap-8">

            {/* Main content — tabs */}
            <div className="flex-1 min-w-0">
              {/* Tab bar */}
              <div className="mb-6 flex gap-1 border-b border-zinc-800 pb-0">
                {(["results", "standings", "strategy", "discussion"] as Tab[]).map((t) => (
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
                <ResultsCard data={results} />
              )}
              {tab === "standings" && standings && (
                <StandingsTable data={standings} />
              )}
              {tab === "strategy" && strategy && (
                <StrategyPanel data={strategy} />
              )}
              {tab === "discussion" && (
                <DiscussionPanel raceYear={parseInt(year)} raceTrack={trackName} />
              )}
            </div>

            {/* Sidebar */}
            <div className="hidden lg:block w-72 shrink-0">
              {sidebar ? (
                <FactsSidebar data={sidebar} />
              ) : (
                <div className="rounded-lg bg-zinc-900 p-4">
                  <p className="text-xs text-zinc-600">Loading sidebar...</p>
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
