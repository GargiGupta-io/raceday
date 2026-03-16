"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const API = "http://localhost:8080";

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

export default function Home() {
  const searchParams = useSearchParams();
  const urlYear = searchParams.get("year");
  const [year, setYear] = useState(urlYear ? parseInt(urlYear) : 2024);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        {/* Season header */}
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            {year} Season <span className="text-zinc-500 font-normal">— {races.length} Races</span>
          </h2>
        </div>

        {/* Race list */}
        {loading && (
          <p className="text-zinc-500 text-sm">Loading {year} season...</p>
        )}

        {error && (
          <p className="text-red-400 text-sm">Could not load season — is the backend running?</p>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-2">
            {races.map((race) => (
              <div key={race.round}>
                {race.indexed ? (
                  <Link
                    href={`/races/${year}/${encodeURIComponent(race.name)}`}
                    className="flex items-center justify-between rounded-lg bg-zinc-900 px-5 py-4 hover:bg-zinc-800 transition-colors"
                  >
                    <RaceRow race={race} />
                  </Link>
                ) : (
                  <div className="flex items-center justify-between rounded-lg bg-zinc-900 px-5 py-4 opacity-40 cursor-default">
                    <RaceRow race={race} />
                  </div>
                )}
              </div>
            ))}
          </div>
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

function RaceRow({ race }: { race: Race }) {
  const weather = WEATHER_BADGE[race.weather || ""] || null;

  return (
    <>
      <div className="flex items-center gap-4">
        <span className="w-8 text-right text-xs text-zinc-600 font-mono">R{race.round}</span>
        <div>
          <p className="text-sm font-medium text-zinc-100">{race.name}</p>
          <p className="text-xs text-zinc-500">{race.location}, {race.country}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {race.winner && (
          <span className="text-xs text-zinc-300">
            <span className="text-emerald-400 mr-1">P1</span>
            {race.winner}
          </span>
        )}
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
    </>
  );
}
