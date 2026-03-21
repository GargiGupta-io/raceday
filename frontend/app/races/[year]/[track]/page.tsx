"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import ResultsCard from "@/app/components/ResultsCard";
import StrategyPanel from "@/app/components/StrategyPanel";
import StrategyStory from "@/app/components/StrategyStory";
import StrategyKey from "@/app/components/StrategyKey";
import FactsSidebar from "@/app/components/FactsSidebar";
import KeyMoments from "@/app/components/KeyMoments";
import SeasonStory from "@/app/components/SeasonStory";
import SeasonInsights from "@/app/components/SeasonInsights";
import GoDeeper, { GoDeeperItem } from "@/app/components/GoDeeper";
import RaceStory from "@/app/components/RaceStory";
import PatternPrecedents from "@/app/components/PatternPrecedents";
import RadioMoments from "@/app/components/RadioMoments";
import StrategySimulator from "@/app/components/StrategySimulator";

import Image from "next/image";
import { API } from "@/app/lib/api";
import FadeIn from "@/app/lib/FadeIn";
import { getCircuitSvg } from "@/app/lib/circuits";

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
  did_you_know: string[];
}

export default function RacePage({
  params,
}: {
  params: Promise<{ year: string; track: string }>;
}) {
  const { year, track } = use(params);
  const trackName = decodeURIComponent(track);

  const [results, setResults] = useState<RaceSummary | null>(null);
  const [standings, setStandings] = useState<StandingEntry[] | null>(null);
  const [strategy, setStrategy] = useState<StrategyEntry[] | null>(null);
  const [sidebar, setSidebar] = useState<SidebarData | null>(null);
  const [tagline, setTagline] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strategyMode, setStrategyMode] = useState<"story" | "data">("story");

  useEffect(() => {
    const base = `${API}/races/${year}/${encodeURIComponent(trackName)}`;
    setLoading(true);
    setError(null);

    // Fetch tab data (blocks render)
    const safeFetch = (url: string) =>
      fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

    Promise.all([
      safeFetch(`${base}/results`),
      safeFetch(`${base}/standings`),
      safeFetch(`${base}/strategy`),
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

    // Fetch tagline independently
    fetch(`${base}/story`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.tagline) setTagline(d.tagline); })
      .catch(() => {});

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

        {/* Race header with circuit outline */}
        <div className="mb-8 relative">
          {/* Circuit SVG background */}
          {(() => {
            const svg = getCircuitSvg(trackName);
            return svg ? (
              <div className="absolute -top-4 right-0 w-36 h-28 opacity-[0.06] pointer-events-none select-none">
                <Image src={svg} alt="" width={144} height={112} className="invert object-contain" />
              </div>
            ) : null;
          })()}
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">{year}</p>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-racing)" }}>{trackName}</h1>
          <div className="min-h-8 mt-2">
            {tagline && (
              <p className="animate-[fadeIn_0.5s_ease-in]">
                <span className="text-sm italic text-zinc-300 bg-zinc-800/60 px-3 py-1 rounded-md">
                  &ldquo;{tagline}&rdquo;
                </span>
              </p>
            )}
          </div>
        </div>

        {loading && (
          <div className="animate-pulse space-y-8">
            {/* Podium skeleton */}
            <div className="rounded-lg bg-zinc-900 p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-zinc-800 rounded" />
                  <div className="h-4 bg-zinc-800 rounded w-32" />
                  <div className="h-3 bg-zinc-800 rounded w-20 ml-auto" />
                </div>
              ))}
            </div>
            {/* Moments skeleton */}
            <div className="space-y-2">
              <div className="h-3 w-20 bg-zinc-800 rounded" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-lg bg-zinc-900 p-4 flex gap-3">
                  <div className="w-8 h-8 bg-zinc-800 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 bg-zinc-800 rounded" />
                    <div className="h-3 w-full bg-zinc-800 rounded" />
                  </div>
                </div>
              ))}
            </div>
            {/* Story skeleton */}
            <div className="space-y-2">
              <div className="h-3 w-24 bg-zinc-800 rounded" />
              <div className="h-3 w-full bg-zinc-800 rounded" />
              <div className="h-3 w-5/6 bg-zinc-800 rounded" />
              <div className="h-3 w-4/6 bg-zinc-800 rounded" />
            </div>
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-zinc-900 border border-red-900/50 p-6 text-center">
            <p className="text-red-400 text-sm">Could not load race data.</p>
            <p className="text-zinc-600 text-xs mt-1">Check that the backend is running on the correct port.</p>
          </div>
        )}

        {!loading && !error && (<>
          <div className="flex flex-col lg:flex-row gap-8">

            {/* Main content — single scroll, no tabs */}
            <div className="flex-1 min-w-0 space-y-8">

              {/* THE RESULT */}
              {results && (
                <FadeIn>
                  <ResultsCard data={results} />
                </FadeIn>
              )}

              {/* KEY MOMENTS */}
              <FadeIn delay={80}>
                <KeyMoments year={year} track={trackName} />
              </FadeIn>

              {/* THE RACE STORY */}
              <FadeIn delay={120}>
                <RaceStory year={year} track={trackName} />
              </FadeIn>

              {/* WHAT HISTORY TELLS US */}
              <FadeIn delay={160}>
                <PatternPrecedents year={year} track={trackName} />
              </FadeIn>

              {/* TEAM RADIO (2023+ only) */}
              <FadeIn delay={200}>
                <RadioMoments year={year} track={trackName} />
              </FadeIn>

              {/* GO DEEPER — expandable sections for hardcore fans */}
              <FadeIn>
              <GoDeeper>
                <GoDeeperItem title="Strategy breakdown">
                  <div className="space-y-4">
                    <div className="flex gap-2 mb-2">
                      {(["story", "data"] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setStrategyMode(mode)}
                          className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${
                            strategyMode === mode
                              ? "bg-zinc-700 text-white"
                              : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                    {strategyMode === "story" && (
                      <StrategyStory year={year} track={trackName} />
                    )}
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
                </GoDeeperItem>

                <GoDeeperItem title="Season standings at this point">
                  <SeasonStory year={year} track={trackName} />
                </GoDeeperItem>

                <GoDeeperItem title="Season awards & teammate battles">
                  <SeasonInsights year={year} />
                </GoDeeperItem>
              </GoDeeper>
              </FadeIn>

            </div>

            {/* Sidebar — Race Intelligence + Strategy Simulator */}
            <div className="w-full lg:w-72 shrink-0 space-y-6">
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

              <StrategySimulator year={year} track={trackName} />
            </div>

          </div>
        </>
        )}

      </div>
    </div>
  );
}
