"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const API = "http://localhost:8888";

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
  const urlYear = searchParams.get("year");
  const [year, setYear] = useState(urlYear ? parseInt(urlYear) : 2024);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weatherFilter, setWeatherFilter] = useState<string>("ALL");

  useEffect(() => {
    if (urlYear) setYear(parseInt(urlYear));
  }, [urlYear]);

  // Fetch season summaries once
  useEffect(() => {
    fetch(`${API}/seasons/summary`)
      .then((r) => r.json())
      .then(setSeasons)
      .catch(() => {});
  }, []);

  // Fetch races for selected year
  useEffect(() => {
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

        {/* Year cards — scrollable row */}
        <div className="mb-8 overflow-x-auto pb-2 -mx-6 px-6">
          <div className="flex gap-3 min-w-max">
            {seasons.map((s) => (
              <button
                key={s.year}
                onClick={() => setYear(s.year)}
                className={`shrink-0 rounded-lg px-5 py-4 text-left transition-all ${
                  s.year === year
                    ? "bg-zinc-900 border-2 border-red-500 shadow-lg shadow-red-500/10"
                    : "bg-zinc-900 border-2 border-transparent hover:border-zinc-700"
                }`}
                style={{ minWidth: "160px" }}
              >
                <p className="text-2xl font-bold text-white tracking-tight">{s.year}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className={`w-2 h-2 rounded-full ${TEAM_COLOR[s.team] || "bg-zinc-400"}`} />
                  <span className="text-sm text-zinc-300">{s.champion}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">{s.tagline}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Season header + weather filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-bold text-white">
            {year} Season <span className="text-zinc-500 font-normal">— {races.length} Races</span>
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
          <p className="text-zinc-500 text-sm">Loading {year} season...</p>
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

        {/* Welcome section */}
        <div className="mt-16 mb-8 max-w-2xl mx-auto text-center">
          <h3 className="text-lg font-semibold text-zinc-300 mb-3">
            What is Raceday?
          </h3>
          <p className="text-sm text-zinc-500 leading-relaxed mb-4">
            Raceday turns every Formula 1 race into a story. Pick a season, pick a race,
            and read what happened — who won, what went wrong, and why it mattered.
            No jargon, no spreadsheets. Just the race, explained.
          </p>
          <p className="text-sm text-zinc-500 leading-relaxed">
            If you want to go deeper, every race has expandable sections with strategy
            breakdowns, season standings, and teammate battles. Covering every race
            from 2010 to 2024.
          </p>
        </div>

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

  const content = (
    <div className="rounded-lg bg-zinc-900 p-5 h-full flex flex-col">
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
        className="block hover:scale-[1.02] transition-transform"
      >
        {content}
      </Link>
    );
  }

  return <div className="opacity-40 cursor-default">{content}</div>;
}
