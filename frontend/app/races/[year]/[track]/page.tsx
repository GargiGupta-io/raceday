"use client";

import { useEffect, useState } from "react";
import { use } from "react";
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
import ProgressiveDetail from "@/app/components/ProgressiveDetail";

import Image from "next/image";
import { API, FetchState, fetchWithTimeout } from "@/app/lib/api";
import FadeIn from "@/app/lib/FadeIn";
import { getCircuitSvg } from "@/app/lib/circuits";

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

type RaceTab = "story" | "strategy" | "moments" | "radio" | "simulate";

const RACE_TABS: { id: RaceTab; label: string }[] = [
  { id: "story", label: "Story" },
  { id: "strategy", label: "Strategy" },
  { id: "moments", label: "Moments" },
  { id: "radio", label: "Radio" },
  { id: "simulate", label: "Simulate" },
];

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
  const [detailState, setDetailState] = useState<FetchState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [strategyMode, setStrategyMode] = useState<"story" | "data">("story");
  const [activeTab, setActiveTab] = useState<RaceTab>("story");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const base = `${API}/races/${year}/${encodeURIComponent(trackName)}`;

    const safeFetch = <T,>(url: string) =>
      fetchWithTimeout<T>(url, {
        onState: (state) => {
          setDetailState(state);
          if (state !== "error") setError(null);
        },
      });

    Promise.all([
      safeFetch<RaceSummary>(`${base}/results`),
      safeFetch<StrategyEntry[]>(`${base}/strategy`),
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

    fetchWithTimeout<{ tagline?: string } | null>(`${base}/story`)
      .then((d) => {
        if (d?.tagline) setTagline(d.tagline);
      })
      .catch(() => {});

    fetchWithTimeout<SidebarData | null>(`${base}/sidebar`)
      .then((data) => {
        if (data) setSidebar(data);
      })
      .catch(() => {});
  }, [year, trackName, retryCount]);

  return (
    <div className="min-h-screen text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-32 sm:pt-40 pb-10 sm:pb-16">
        <RaceHeader year={year} trackName={trackName} tagline={tagline} />

        {loading && <RaceLoading state={detailState} />}

        {error && (
          <div className="glass-card p-8 text-center">
            <p className="text-red-400 text-sm">Could not load race data.</p>
            <p className="text-zinc-500 text-xs mt-2">
              The backend is taking longer than expected.
            </p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setRetryCount((value) => value + 1);
              }}
              className="mt-5 rounded-md bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="flex flex-col lg:flex-row gap-10">
            <div className="flex-1 min-w-0">
              <RaceTabs activeTab={activeTab} onChange={setActiveTab} />

              <FadeIn>
                {activeTab === "story" && (
                  <StoryTab
                    year={year}
                    track={trackName}
                    trackName={trackName}
                    tagline={tagline}
                    results={results}
                  />
                )}

                {activeTab === "strategy" && (
                  <StrategyTab
                    year={year}
                    track={trackName}
                    strategy={strategy}
                    strategyMode={strategyMode}
                    setStrategyMode={setStrategyMode}
                  />
                )}

                {activeTab === "moments" && (
                  <MomentsTab year={year} track={trackName} />
                )}

                {activeTab === "radio" && (
                  <RadioMoments year={year} track={trackName} />
                )}

                {activeTab === "simulate" && (
                  <StrategySimulator year={year} track={trackName} />
                )}
              </FadeIn>
            </div>

            <aside className="w-full lg:w-80 shrink-0">
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
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function RaceHeader({
  year,
  trackName,
  tagline,
}: {
  year: string;
  trackName: string;
  tagline: string | null;
}) {
  const svg = getCircuitSvg(trackName);

  return (
    <div className="mb-12 sm:mb-16 relative">
      {svg && (
        <div className="absolute -top-6 right-0 w-48 sm:w-56 h-40 sm:h-44 opacity-[0.05] pointer-events-none select-none">
          <Image src={svg} alt="" width={224} height={176} className="invert object-contain" />
        </div>
      )}
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
  );
}

function RaceTabs({
  activeTab,
  onChange,
}: {
  activeTab: RaceTab;
  onChange: (tab: RaceTab) => void;
}) {
  return (
    <div className="mb-8 overflow-x-auto">
      <div className="inline-flex min-w-full gap-2 border-b border-white/[0.08] pb-2">
        {RACE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? "bg-red-600 text-white"
                : "text-zinc-500 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StoryTab({
  year,
  track,
  trackName,
  tagline,
  results,
}: {
  year: string;
  track: string;
  trackName: string;
  tagline: string | null;
  results: RaceSummary | null;
}) {
  const podium = results?.podium.slice(0, 3) ?? [];

  return (
    <div className="space-y-10">
      <section className="glass-card p-6 sm:p-7">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
          Race Story
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold text-white leading-tight">
          {tagline || `${trackName} race story`}
        </h2>

        {results && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <StoryFact label="Winner" value={results.winner} detail={results.winner_team} />
            <StoryFact
              label="Weather"
              value={results.weather || "Unknown"}
              detail="Race conditions"
              expandedDetail="Weather changes tyre choice, pit timing, visibility, and how risky overtakes feel. Dry races usually reward pace and track position. Wet or mixed races usually create more strategy swings."
            />
            <StoryFact
              label="DNFs"
              value={`${results.retirements.length}`}
              detail="Cars that did not finish"
            />
          </div>
        )}

        {podium.length > 0 && (
          <div className="mt-7">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
              Top 3
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {podium.map((driver) => (
                <div key={driver.position} className="rounded-md border border-white/[0.08] bg-black/30 p-4">
                  <p className="text-xs text-red-400 font-semibold">P{driver.position}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{driver.driver}</p>
                  <p className="mt-1 text-xs text-zinc-500">{driver.team}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <RaceStory year={year} track={track} />

      <section>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-5">
          3 key moments
        </p>
        <KeyMoments year={year} track={track} limit={3} showHeader={false} />
      </section>

      <section className="glass-card p-6">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
          Why this race mattered
        </p>
        <p className="text-sm text-zinc-300 leading-relaxed">
          RaceDay starts with the story so new fans can understand the winner,
          podium, conditions, and turning points before opening the deeper strategy data.
        </p>
      </section>
    </div>
  );
}

function StoryFact({
  label,
  value,
  detail,
  expandedDetail,
}: {
  label: string;
  value: string;
  detail: string;
  expandedDetail?: string;
}) {
  return (
    <div className="rounded-md border border-white/[0.08] bg-black/30 p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-widest">{label}</p>
      <p className="mt-2 text-base font-semibold text-white">{value}</p>
      {expandedDetail ? (
        <div className="mt-2">
          <ProgressiveDetail label={detail}>
            {expandedDetail}
          </ProgressiveDetail>
        </div>
      ) : (
        <p className="mt-1 text-xs text-zinc-500">{detail}</p>
      )}
    </div>
  );
}

function StrategyTab({
  year,
  track,
  strategy,
  strategyMode,
  setStrategyMode,
}: {
  year: string;
  track: string;
  strategy: StrategyEntry[] | null;
  strategyMode: "story" | "data";
  setStrategyMode: (mode: "story" | "data") => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
          Strategy
        </p>
        <h2 className="text-2xl font-semibold text-white">
          The pit wall version of the race
        </h2>
        <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
          Start with the plain-English strategy story, then switch to the stint data if you want the details.
        </p>
      </div>

      <div className="flex gap-2">
        {(["story", "data"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setStrategyMode(mode)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium capitalize transition-all duration-200 ${
              strategyMode === mode
                ? "bg-red-600 text-white"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {strategyMode === "story" && (
        <StrategyStory year={year} track={track} />
      )}

      {strategyMode === "data" && strategy && (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <StrategyPanel data={strategy} />
          </div>
          <div className="w-full lg:w-56 shrink-0">
            <StrategyKey year={year} track={track} />
          </div>
        </div>
      )}
    </div>
  );
}

function MomentsTab({ year, track }: { year: string; track: string }) {
  return (
    <div className="space-y-10">
      <KeyMoments year={year} track={track} />

      <GoDeeper>
        <GoDeeperItem title="What history tells us">
          <PatternPrecedents year={year} track={track} />
        </GoDeeperItem>

        <GoDeeperItem title="Season standings at this point">
          <SeasonStory year={year} track={track} />
        </GoDeeperItem>

        <GoDeeperItem title="Season awards and teammate battles">
          <SeasonInsights year={year} />
        </GoDeeperItem>
      </GoDeeper>
    </div>
  );
}

function RaceLoading({ state }: { state: FetchState }) {
  return (
    <div className="space-y-10">
      <div className="glass-card p-8 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-6 h-6 glass-skeleton rounded" />
            <div className="h-4 glass-skeleton rounded w-32" />
            <div className="h-3 glass-skeleton rounded w-20 ml-auto" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-3 w-24 glass-skeleton rounded" />
        <div className="h-3 w-full glass-skeleton rounded" />
        <div className="h-3 w-5/6 glass-skeleton rounded" />
        <div className="h-3 w-4/6 glass-skeleton rounded" />
      </div>
      <p className="text-sm text-zinc-500 text-center">
        {state === "slowLoading"
          ? "Waking up the race data service..."
          : state === "retrying"
            ? "Retrying race data..."
            : "Loading race story..."}
      </p>
    </div>
  );
}
