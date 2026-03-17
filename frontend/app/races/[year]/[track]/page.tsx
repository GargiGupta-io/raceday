"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import ResultsCard from "@/app/components/ResultsCard";
import StandingsTable from "@/app/components/StandingsTable";
import StrategyPanel from "@/app/components/StrategyPanel";
import StrategyStory from "@/app/components/StrategyStory";
import StrategyKey from "@/app/components/StrategyKey";
import FactsSidebar from "@/app/components/FactsSidebar";
import KeyMoments from "@/app/components/KeyMoments";
import SeasonStory from "@/app/components/SeasonStory";
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
  position: number | null;
  driver: string;
  team: string;
  grid: number | null;
  positions_delta: number | null;
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
  const [strategyMode, setStrategyMode] = useState<"story" | "data">("story");

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
          <div className="flex flex-col lg:flex-row gap-8">

            {/* Main content — tabs */}
            <div className="flex-1 min-w-0">
              {/* Tab bar */}
              <div className="mb-6 flex gap-1 border-b border-zinc-800 pb-0 overflow-x-auto">
                {(["results", "standings", "strategy", "discussion"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px whitespace-nowrap ${
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
                <div className="space-y-6">
                  <ResultsCard data={results} />
                  <KeyMoments year={year} track={trackName} />
                </div>
              )}
              {tab === "standings" && standings && (
                <div className="space-y-6">
                  <StandingsTable data={standings} />
                  <SeasonStory year={year} track={trackName} />
                </div>
              )}
              {tab === "strategy" && (
                <div>
                  {/* Story / Data sub-tabs */}
                  <div className="flex gap-2 mb-5">
                    {(["story", "data"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setStrategyMode(mode)}
                        className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${
                          strategyMode === mode
                            ? "bg-zinc-700 text-white"
                            : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>

                  {/* Story mode */}
                  {strategyMode === "story" && (
                    <StrategyStory year={year} track={trackName} />
                  )}

                  {/* Data mode — table + key side panel */}
                  {strategyMode === "data" && strategy && (
                    <div className="flex flex-col lg:flex-row gap-6">
                      <div className="flex-1 min-w-0">
                        <StrategyPanel data={strategy} />
                      </div>
                      <div className="w-full lg:w-56 shrink-0">
                        <StrategyKey year={year} track={trackName} />
                      </div>
                    </div>
                  )}
                </div>
              )}
              {tab === "discussion" && (
                <DiscussionPanel raceYear={parseInt(year)} raceTrack={trackName} />
              )}
            </div>

            {/* Sidebar — below tabs on mobile, right column on desktop */}
            <div className="w-full lg:w-72 shrink-0">
              {sidebar ? (
                <FactsSidebar data={sidebar} />
              ) : (
                <div className="rounded-lg bg-zinc-900 p-4 animate-pulse">
                  <div className="h-3 w-24 bg-zinc-800 rounded mb-4" />
                  <div className="space-y-2">
                    <div className="h-3 w-full bg-zinc-800 rounded" />
                    <div className="h-3 w-3/4 bg-zinc-800 rounded" />
                    <div className="h-3 w-5/6 bg-zinc-800 rounded" />
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
