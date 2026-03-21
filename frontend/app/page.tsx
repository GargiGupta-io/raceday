"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getCircuitSvg } from "@/app/lib/circuits";
import IntroHero from "@/app/components/IntroHero";

import { API } from "@/app/lib/api";

interface SeasonSummary {
  year: number;
  champion: string;
  team: string;
  wins: number;
  races: number;
  tagline: string;
}

interface Race {
  round: number;
  name: string;
  location: string;
  country: string;
  date: string;
  format: string;
  indexed: boolean;
  winner?: string;
  winner_team?: string;
  weather?: string;
  total_laps?: number;
}

// Team → colour mapping for the champion dot
const TEAM_COLOR: Record<string, string> = {
  "Red Bull Racing": "bg-blue-500",
  "Red Bull": "bg-blue-500",
  "Mercedes": "bg-emerald-400",
  "Ferrari": "bg-red-500",
  "McLaren": "bg-orange-400",
  "Williams": "bg-white",
  "Renault": "bg-yellow-400",
  "Brawn": "bg-lime-400",
};

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <Home />
    </Suspense>
  );
}

function Home() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlYear = searchParams.get("year");
  const [year, setYear] = useState<number | null>(urlYear ? parseInt(urlYear) : null);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weatherFilter, setWeatherFilter] = useState<string>("ALL");
  const [seasonsError, setSeasonsError] = useState(false);

  useEffect(() => {
    if (urlYear) setYear(parseInt(urlYear));
  }, [urlYear]);

  // Fetch season summaries once
  useEffect(() => {
    fetch(`${API}/seasons/summary`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setSeasons)
      .catch(() => setSeasonsError(true));
  }, []);

  // Fetch races for selected year (only when a year is selected)
  useEffect(() => {
    if (year === null) return;
    setLoading(true);
    setError(null);
    fetch(`${API}/races/${year}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data) => {
        setRaces(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [year]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-8">

        {/* Seasons error */}
        {seasonsError && (
          <p className="text-red-400 text-sm text-center mb-4">Could not load seasons — is the backend running?</p>
        )}

        {/* Year selector — only show after a year is picked */}
        {year !== null && <div className="mb-8 overflow-x-auto pb-1 -mx-6 px-6 scrollbar-hide">
          <div className="flex gap-1.5 min-w-max">
            {seasons.map((s) => (
              <button
                key={s.year}
                onClick={() => { setYear(s.year); router.push(`/?year=${s.year}`); }}
                className={`shrink-0 rounded px-4 py-2.5 text-left transition-all border-b-2 ${
                  year !== null && s.year === year
                    ? "bg-zinc-800/80 border-red-500 text-white"
                    : "bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50"
                }`}
              >
                <p className="text-sm font-bold tracking-tight">{s.year}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${TEAM_COLOR[s.team] || "bg-zinc-400"}`} />
                  <span className="text-xs text-zinc-400">{s.champion}</span>
                </div>
              </button>
            ))}
          </div>
        </div>}

        {/* Season content — only after selecting a year */}
        {year !== null && (<>

        {/* Season header + weather filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-racing)" }}>
            {year} Season <span className="text-zinc-500 font-normal text-lg">— {races.length} Races</span>
          </h2>
          <div className="flex gap-1.5">
            {["ALL", "DRY", "WET", "MIXED"].map((f) => (
              <button
                key={f}
                onClick={() => setWeatherFilter(f)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  weatherFilter === f
                    ? "bg-zinc-700 text-white"
                    : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Race grid */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-lg bg-zinc-900 p-5 space-y-3">
                <div className="space-y-1.5">
                  <div className="h-2 w-12 bg-zinc-800 rounded" />
                  <div className="h-4 w-40 bg-zinc-800 rounded" />
                  <div className="h-3 w-28 bg-zinc-800 rounded" />
                </div>
                <div className="flex items-center gap-2 mt-auto">
                  <div className="h-3 w-24 bg-zinc-800 rounded" />
                  <div className="h-4 w-10 bg-zinc-800 rounded ml-auto" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm">Could not load season — is the backend running?</p>
        )}

        {!loading && !error && (() => {
          const weatherMap: Record<string, string> = { DRY: "dry", WET: "wet", MIXED: "damp" };
          const filtered = weatherFilter === "ALL"
            ? races
            : races.filter((r) => r.weather === weatherMap[weatherFilter]);
          return filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((race) => (
                <RaceCard key={race.round} race={race} year={year} />
              ))}
            </div>
          ) : (
            <p className="text-zinc-600 text-sm text-center py-8">
              No {weatherFilter.toLowerCase()} races in the {year} season.
            </p>
          );
        })()}

        </>)}

        {/* Intro hero — visible until user selects a year */}
        {year === null && (
          <IntroHero
            onStart={() => {
              const firstYear = seasons.length > 0 ? seasons[0].year : 2025;
              setYear(firstYear);
              router.push(`/?year=${firstYear}`);
            }}
          />
        )}

      </div>
    </div>
  );
}

const WEATHER_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  dry:   { bg: "bg-amber-900/60", text: "text-amber-400", label: "DRY" },
  wet:   { bg: "bg-blue-900/60",  text: "text-blue-400",  label: "WET" },
  damp:  { bg: "bg-cyan-900/60",  text: "text-cyan-400",  label: "MIXED" },
};

function RaceCard({ race, year }: { race: Race; year: number }) {
  const weather = WEATHER_BADGE[race.weather || ""] || null;
  const circuitSvg = getCircuitSvg(race.name);

  const content = (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800/50 p-5 h-full flex flex-col relative overflow-hidden transition-colors group-hover:border-zinc-700/70 group-hover:bg-zinc-900/80">
      {/* Circuit outline */}
      {circuitSvg && (
        <div className="absolute top-3 right-3 w-14 h-10 opacity-[0.15]">
          <Image src={circuitSvg} alt="" width={56} height={40} className="invert" />
        </div>
      )}

      {/* Top row: round + name */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">
            Round {race.round}
          </p>
          <p className="text-base font-semibold text-zinc-100 leading-tight">{race.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{race.location}, {race.country}</p>
        </div>
      </div>

      {/* Bottom row: winner + badges */}
      <div className="mt-auto flex items-center gap-2 flex-wrap">
        {race.winner && (
          <span className="text-xs text-zinc-300">
            <span className="text-emerald-400 font-semibold mr-1">P1</span>
            {race.winner}
          </span>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          {weather && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${weather.bg} ${weather.text}`}>
              {weather.label}
            </span>
          )}
          {race.total_laps && (
            <span className="text-[10px] text-zinc-600 border border-zinc-800 rounded px-1.5 py-0.5">
              {race.total_laps} LAPS
            </span>
          )}
          {race.format === "sprint" && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-yellow-900/60 text-yellow-400">
              SPRINT
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (race.indexed) {
    return (
      <Link
        href={`/races/${year}/${encodeURIComponent(race.name)}`}
        className="block group hover:scale-[1.02] transition-all duration-200"
      >
        {content}
      </Link>
    );
  }

  return <div className="opacity-40 cursor-default">{content}</div>;
}
