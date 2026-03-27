"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getCircuitSvg } from "@/app/lib/circuits";
import IntroHero from "@/app/components/IntroHero";
import DataLoader from "@/app/components/DataLoader";

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
    <Suspense fallback={<div className="min-h-screen" />}>
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
    <div className="min-h-screen text-zinc-100">

      {/* Intro hero — full-width, visible until user selects a year */}
      {year === null && (
        <IntroHero
          seasons={seasons}
          onSelectYear={(y) => {
            setYear(y);
            router.push(`/?year=${y}`);
          }}
        />
      )}

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">

        {/* Seasons error */}
        {seasonsError && (
          <p className="text-red-400 text-sm text-center mb-4">Could not load seasons — is the backend running?</p>
        )}

        {/* Year selector — only show after a year is picked */}
        {year !== null && <nav aria-label="Season selector" className="mb-12 overflow-x-auto pb-1 -mx-6 px-6 scrollbar-hide">
          <div className="flex gap-2 min-w-max">
            {seasons.map((s) => (
              <button
                key={s.year}
                aria-label={`${s.year} season — champion ${s.champion}`}
                aria-pressed={s.year === year}
                onClick={() => { setYear(s.year); router.push(`/?year=${s.year}`); }}
                className={`shrink-0 rounded-xl px-5 py-3 text-left transition-all duration-200 ${
                  year !== null && s.year === year
                    ? "glass-button-active text-white border-b-2 border-red-500"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
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
        </nav>}

        {/* Season content — only after selecting a year */}
        {year !== null && (<>

        {/* Season header + weather filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <h2 className="text-3xl sm:text-4xl font-light text-white tracking-wide">
            {year} Season <span className="text-zinc-500 font-light text-lg sm:text-xl">— {(() => {
              const indexed = races.filter((r) => r.indexed).length;
              return indexed < races.length
                ? `${indexed} of ${races.length} Races`
                : `${races.length} Races`;
            })()}</span>
          </h2>
          <div className="flex gap-2" role="group" aria-label="Weather filter">
            {["ALL", "DRY", "WET", "MIXED"].map((f) => (
              <button
                key={f}
                aria-label={`Filter ${f.toLowerCase()} weather races`}
                aria-pressed={weatherFilter === f}
                onClick={() => setWeatherFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  weatherFilter === f
                    ? "glass-button-active text-white"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Latest race banner — only for current/partial seasons */}
        {!loading && !error && (() => {
          const indexedRaces = races.filter((r) => r.indexed && r.winner);
          if (indexedRaces.length === 0 || indexedRaces.length === races.length) return null;
          const latest = indexedRaces[indexedRaces.length - 1];
          return (
            <Link
              href={`/races/${year}/${encodeURIComponent(latest.name)}`}
              className="block mb-10 group"
            >
              <div className="glass-card p-5 sm:p-6 flex items-center gap-4 transition-all duration-200">
                <div className="shrink-0">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Latest</p>
                  <p className="text-lg sm:text-xl font-bold text-white mt-1">{latest.name.replace(" Grand Prix", "")}</p>
                </div>
                <div className="ml-auto text-right shrink-0">
                  <p className="text-xs text-zinc-500">Round {latest.round}</p>
                  <p className="text-sm text-emerald-400 font-semibold mt-1">
                    P1 {latest.winner}
                  </p>
                </div>
                <span className="text-zinc-600 text-sm hidden sm:block">&rarr;</span>
              </div>
            </Link>
          );
        })()}

        {/* Race grid */}
        <div aria-live="polite">
        {loading && (
          <DataLoader size="lg" label="Loading races..." />
        )}

        {error && (
          <div className="glass-card p-8 text-center">
            <p className="text-red-400 text-sm">Could not load season — is the backend running?</p>
          </div>
        )}

        {!loading && !error && (() => {
          const weatherMap: Record<string, string> = { DRY: "dry", WET: "wet", MIXED: "damp" };
          const filtered = weatherFilter === "ALL"
            ? races
            : races.filter((r) => r.weather === weatherMap[weatherFilter]);
          return filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filtered.map((race) => (
                <RaceCard key={race.round} race={race} year={year} />
              ))}
            </div>
          ) : (
            <p className="text-zinc-600 text-sm text-center py-12">
              No {weatherFilter.toLowerCase()} races in the {year} season.
            </p>
          );
        })()}
        </div>

        </>)}


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
  const isUpcoming = race.date && new Date(race.date) > new Date();

  const content = (
    <div className="glass-card p-6 h-full flex flex-col relative overflow-hidden transition-all duration-200">
      {/* Circuit outline — larger */}
      {circuitSvg && (
        <div className="absolute top-4 right-4 w-20 h-14 opacity-[0.12]">
          <Image src={circuitSvg} alt="" width={80} height={56} className="invert" />
        </div>
      )}

      {/* Top row: round + name */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">
            Round {race.round}
          </p>
          <p className="text-base font-semibold text-zinc-100 leading-tight">{race.name}</p>
          <p className="text-xs text-zinc-400 mt-1">{race.location}, {race.country}</p>
        </div>
      </div>

      {/* Bottom row: winner/date + badges */}
      <div className="mt-auto flex items-center gap-2 flex-wrap pt-2">
        {race.winner ? (
          <span className="text-xs text-zinc-300">
            <span className="text-emerald-400 font-semibold mr-1">P1</span>
            {race.winner}
          </span>
        ) : isUpcoming && race.date ? (
          <span className="text-xs text-zinc-500">
            {new Date(race.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
        ) : null}
        <div className="flex items-center gap-1.5 ml-auto">
          {isUpcoming && (
            <span className="glass-badge text-zinc-400">
              UPCOMING
            </span>
          )}
          {weather && (
            <span className={`glass-badge ${weather.text}`}>
              {weather.label}
            </span>
          )}
          {race.total_laps && (
            <span className="glass-badge text-zinc-500">
              {race.total_laps} LAPS
            </span>
          )}
          {race.format === "sprint" && (
            <span className="glass-badge text-yellow-400">
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
        className="block group hover:scale-[1.015] transition-all duration-200"
      >
        {content}
      </Link>
    );
  }

  return <div className="opacity-35 cursor-default">{content}</div>;
}
