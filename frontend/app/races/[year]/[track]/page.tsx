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
import SectionDivider from "@/app/components/SectionDivider";

interface RaceSummary {
  winner: string;
  winner_team: string;
  podium: { position: number; driver: string; team: string }[];
  retirements: { driver: string; team: string }[];
  weather: string;
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
      safeFetch(`${base}/strategy`),
    ])
      .then(([res, str]) => {
        setResults(res);
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
    <div className="min-h-screen text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-32 sm:pt-40 pb-10 sm:pb-16">

        {/* Race header — cinematic */}
        <div className="mb-16 sm:mb-20 relative">
          {/* Circuit SVG — large decorative element */}
          {(() => {
            const svg = getCircuitSvg(trackName);
            return svg ? (
              <div className="absolute -top-6 right-0 w-48 sm:w-56 h-40 sm:h-44 opacity-[0.05] pointer-events-none select-none">
                <Image src={svg} alt="" width={224} height={176} className="invert object-contain" />
              </div>
            ) : null;
          })()}
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">{year}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white">{trackName}</h1>
          <div className="min-h-10 mt-4">
            {tagline && (
              <p className="animate-[fadeIn_0.5s_ease-in] text-sm italic text-zinc-400">
                &ldquo;{tagline}&rdquo;
              </p>
            )}
          </div>
        </div>

        {loading && (
          <div className="space-y-10">
            {/* Podium skeleton */}
            <div className="glass-card p-8 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 glass-skeleton rounded" />
                  <div className="h-4 glass-skeleton rounded w-32" />
                  <div className="h-3 glass-skeleton rounded w-20 ml-auto" />
                </div>
              ))}
            </div>
            {/* Moments skeleton */}
            <div className="space-y-3">
              <div className="h-3 w-20 glass-skeleton rounded" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="glass-card p-5 flex gap-3">
                  <div className="w-8 h-8 glass-skeleton rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 glass-skeleton rounded" />
                    <div className="h-3 w-full glass-skeleton rounded" />
                  </div>
                </div>
              ))}
            </div>
            {/* Story skeleton */}
            <div className="space-y-3">
              <div className="h-3 w-24 glass-skeleton rounded" />
              <div className="h-3 w-full glass-skeleton rounded" />
              <div className="h-3 w-5/6 glass-skeleton rounded" />
              <div className="h-3 w-4/6 glass-skeleton rounded" />
            </div>
          </div>
        )}
        {error && (
          <div className="glass-card p-8 text-center">
            <p className="text-red-400 text-sm">Could not load race data.</p>
            <p className="text-zinc-500 text-xs mt-2">Check that the backend is running on the correct port.</p>
          </div>
        )}

        {!loading && !error && (<>
          <div className="flex flex-col lg:flex-row gap-12">

            {/* Main content — single scroll, breathing room */}
            <div className="flex-1 min-w-0 space-y-16">

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

              {/* Image divider */}
              <SectionDivider src="/images/f1-pack-racing.webp" alt="F1 cars racing" />

              {/* THE RACE STORY */}
              <FadeIn delay={120}>
                <RaceStory year={year} track={trackName} />
              </FadeIn>

              {/* GO DEEPER — expandable sections for hardcore fans */}
              <div className="pt-8">
              <FadeIn>
              <GoDeeper>
                <GoDeeperItem title="Strategy breakdown">
                  <div className="space-y-4">
                    <div className="flex gap-2 mb-2">
                      {(["story", "data"] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setStrategyMode(mode)}
                          className={`px-4 py-1.5 rounded-lg text-xs font-medium capitalize transition-all duration-200 ${
                            strategyMode === mode
                              ? "glass-button-active text-white"
                              : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
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

                <GoDeeperItem title="What history tells us">
                  <PatternPrecedents year={year} track={trackName} />
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

            </div>

            {/* Sidebar — Race Intelligence + Simulator + Radio */}
            <div className="w-full lg:w-80 shrink-0 space-y-8">
              {sidebar ? (
                <FactsSidebar data={sidebar} />
              ) : (
                <div className="glass-card p-6">
                  <div className="h-3 w-24 glass-skeleton rounded mb-4" />
                  <div className="space-y-3">
                    <div className="h-3 w-full glass-skeleton rounded" />
                    <div className="h-3 w-3/4 glass-skeleton rounded" />
                    <div className="h-3 w-5/6 glass-skeleton rounded" />
                  </div>
                </div>
              )}

              <StrategySimulator year={year} track={trackName} />

              {/* Team Radio — moved to sidebar */}
              <RadioMoments year={year} track={trackName} />
            </div>

          </div>
        </>
        )}

      </div>
    </div>
  );
}
