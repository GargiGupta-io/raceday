"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getCircuitSvg } from "@/app/lib/circuits";
import DataLoader from "@/app/components/DataLoader";

import { API, FetchState, fetchWithTimeout } from "@/app/lib/api";

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

const WEATHER_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  dry: { bg: "bg-white/10", text: "text-zinc-300", label: "DRY" },
  wet: { bg: "bg-red-500/10", text: "text-red-300", label: "WET" },
  damp: { bg: "bg-white/10", text: "text-zinc-300", label: "MIXED" },
};

const STABLE_DEMO_YEAR = 2021;
const STABLE_DEMO_TRACK = "Abu Dhabi Grand Prix";
const STABLE_DEMO_RACE = `/races/${STABLE_DEMO_YEAR}/${encodeURIComponent(STABLE_DEMO_TRACK)}`;

export default function RacesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <Races />
    </Suspense>
  );
}

function Races() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlYear = searchParams.get("year");
  const [year, setYear] = useState<number | null>(urlYear ? parseInt(urlYear) : null);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [raceState, setRaceState] = useState<FetchState>("loading");
  const [seasonsState, setSeasonsState] = useState<FetchState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [weatherFilter, setWeatherFilter] = useState<string>("ALL");
  const [raceSearch, setRaceSearch] = useState("");
  const [seasonsError, setSeasonsError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const loading = raceState === "loading" || raceState === "slowLoading" || raceState === "retrying";

  useEffect(() => {
    if (urlYear) setYear(parseInt(urlYear));
  }, [urlYear]);

  useEffect(() => {
    fetchWithTimeout<SeasonSummary[]>(`${API}/seasons/summary`, {
      onState: setSeasonsState,
    })
      .then((data: SeasonSummary[]) => {
        setSeasons(data);
        if (year === null && data.length > 0) {
          const stableSeasons = data.filter((season) => season.races > 0);
          const latest = stableSeasons.length > 0
            ? Math.max(...stableSeasons.map((s) => s.year))
            : STABLE_DEMO_YEAR;
          setYear(latest);
          router.replace(`/races?year=${latest}`);
        }
      })
      .catch(() => setSeasonsError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (year === null) return;
    fetchWithTimeout<Race[]>(`${API}/races/${year}`, {
      onState: (state) => {
        setRaceState(state);
        if (state !== "error") setError(null);
      },
    })
      .then((data) => {
        setRaces(data);
      })
      .catch((e) => {
        setError(e.message);
      });
  }, [year, retryCount]);

  return (
    <div className="min-h-screen text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-32 sm:pt-40 pb-8 sm:pb-12">

        {seasonsError && (
          <p className="text-red-400 text-sm text-center mb-4">Could not load seasons. The backend is taking longer than expected.</p>
        )}

        {seasonsState === "slowLoading" && !seasonsError && (
          <p className="text-zinc-400 text-sm text-center mb-4">Waking up the race data service...</p>
        )}

        {year !== null && (
          <nav aria-label="Season selector" className="mb-12 overflow-x-auto pb-1 -mx-6 px-6 scrollbar-hide">
            <div className="flex gap-2 min-w-max">
              {seasons.map((s) => (
                <button
                  key={s.year}
                  aria-label={`${s.year} season — champion ${s.champion}`}
                  aria-pressed={s.year === year}
                  onClick={() => { setYear(s.year); router.push(`/races?year=${s.year}`); }}
                  className={`shrink-0 rounded-xl px-5 py-3 text-left transition-all duration-200 ${
                    s.year === year
                      ? "glass-button-active text-white border-b-2 border-red-500"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                  }`}
                >
                  <p className="text-sm font-bold tracking-tight">{s.year}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.year === year ? "bg-red-500" : "bg-white/40"}`} />
                    <span className="text-xs text-zinc-400">{s.champion}</span>
                  </div>
                </button>
              ))}
            </div>
          </nav>
        )}

        {year !== null && (<>

          <div className="mb-10 grid gap-3 sm:grid-cols-2">
            <Link href={STABLE_DEMO_RACE} className="glass-card xray-card p-5 transition hover:border-red-500/30">
              <p className="text-[10px] uppercase tracking-widest text-red-400">Recruiter path</p>
              <p className="mt-2 text-lg font-semibold text-white">Start with 2021 Abu Dhabi</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                A stable indexed race story with strategy and simulation data.
              </p>
            </Link>
            <Link href="/live?demo=1" className="glass-card xray-card p-5 transition hover:border-red-500/30">
              <p className="text-[10px] uppercase tracking-widest text-red-400">Anytime demo</p>
              <p className="mt-2 text-lg font-semibold text-white">Try Live Demo</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                Replay saved live snapshots without waiting for race weekend.
              </p>
            </Link>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
            <div>
            <h2 className="text-3xl sm:text-4xl font-light text-white tracking-wide">
              {year} Season <span className="text-zinc-500 font-light text-lg sm:text-xl">— {(() => {
                const indexed = races.filter((r) => r.indexed).length;
                return indexed < races.length
                  ? `${indexed} of ${races.length} Races`
                  : `${races.length} Races`;
              })()}</span>
            </h2>
              {!loading && !error && races.length > 0 && (
                <p className="mt-2 text-xs text-zinc-600">
                  Data indexed through {(() => {
                    const indexedRaces = races.filter((race) => race.indexed && race.winner);
                    const latest = indexedRaces[indexedRaces.length - 1];
                    return latest ? `${latest.name}, round ${latest.round}` : "the published schedule";
                  })()}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
            <input
              type="search"
              value={raceSearch}
              onChange={(event) => setRaceSearch(event.target.value)}
              placeholder="Search races or winners"
              className="glass-input w-full sm:w-56 px-3 py-2 text-sm"
            />
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
          </div>

          {!loading && !error && (() => {
            const indexedRaces = races.filter((r) => r.indexed && r.winner);
            if (indexedRaces.length === 0 || indexedRaces.length === races.length) return null;
            const latest = indexedRaces[indexedRaces.length - 1];
            return (
              <Link
                href={`/races/${year}/${encodeURIComponent(latest.name)}`}
                className="block mb-10 group"
              >
                <div className="glass-card xray-card p-5 sm:p-6 flex items-center gap-4 transition-all duration-200">
                  <div className="shrink-0">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Latest</p>
                    <p className="text-lg sm:text-xl font-bold text-white mt-1">{latest.name.replace(" Grand Prix", "")}</p>
                  </div>
                  <div className="ml-auto text-right shrink-0">
                    <p className="text-xs text-zinc-500">Round {latest.round}</p>
                    <p className="text-sm text-red-400 font-semibold mt-1">
                      P1 {latest.winner}
                    </p>
                  </div>
                  <span className="text-zinc-600 text-sm hidden sm:block">&rarr;</span>
                </div>
              </Link>
            );
          })()}

          <div aria-live="polite">
            {loading && (
              <DataLoader
                size="lg"
                label={
                  raceState === "slowLoading"
                    ? "Waking up the race data service..."
                    : raceState === "retrying"
                      ? "Retrying race data..."
                      : "Loading races..."
                }
              />
            )}

            {error && (
              <div className="glass-card p-8 text-center">
                <p className="text-red-400 text-sm">The backend is taking longer than expected.</p>
                <p className="mt-2 text-xs text-zinc-400">
                  You can retry this season or open the stable demo race.
                </p>
                <div className="mt-5 flex flex-col sm:flex-row justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setRetryCount((value) => value + 1)}
                  className="rounded-md bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                >
                  Retry
                </button>
                  <Link
                    href={STABLE_DEMO_RACE}
                    className="rounded-md border border-white/10 px-5 py-2 text-sm font-semibold text-white transition hover:border-red-500/40"
                  >
                    Open stable race
                  </Link>
                </div>
              </div>
            )}

            {!loading && !error && (() => {
              const weatherMap: Record<string, string> = { DRY: "dry", WET: "wet", MIXED: "damp" };
              const query = raceSearch.trim().toLowerCase();
              const byWeather = weatherFilter === "ALL"
                ? races
                : races.filter((r) => r.weather === weatherMap[weatherFilter]);
              const filtered = query
                ? byWeather.filter((race) =>
                    [race.name, race.location, race.country, race.winner || "", race.winner_team || ""]
                      .some((value) => value.toLowerCase().includes(query))
                  )
                : byWeather;
              return filtered.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {filtered.map((race) => (
                    <RaceCard key={race.round} race={race} year={year} />
                  ))}
                </div>
              ) : (
                <div className="glass-card p-8 text-center">
                  <p className="text-sm font-semibold text-zinc-300">No races found</p>
                  <p className="mt-2 text-xs text-zinc-400">
                    Try clearing the filters, opening the stable race, or using live demo mode.
                  </p>
                  <div className="mt-5 flex flex-col sm:flex-row justify-center gap-3">
                    <Link
                      href={STABLE_DEMO_RACE}
                      className="rounded-md bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                    >
                      Start with 2021 Abu Dhabi
                    </Link>
                    <Link
                      href="/live?demo=1"
                      className="rounded-md border border-white/10 px-5 py-2 text-sm font-semibold text-white transition hover:border-red-500/40"
                    >
                      Try Live Demo
                    </Link>
                  </div>
                </div>
              );
            })()}
          </div>

        </>)}

      </div>
    </div>
  );
}

function RaceCard({ race, year }: { race: Race; year: number }) {
  const weather = WEATHER_BADGE[race.weather || ""] || null;
  const circuitSvg = getCircuitSvg(race.name);
  const isUpcoming = race.date && new Date(race.date) > new Date();

  const content = (
    <div className={`glass-card ${race.indexed ? "xray-card" : ""} p-6 h-full flex flex-col relative overflow-hidden transition-all duration-200`}>
      {circuitSvg && (
        <div className="absolute top-4 right-4 w-20 h-14 opacity-[0.12]">
          <Image src={circuitSvg} alt="" width={80} height={56} className="invert" />
        </div>
      )}

      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">
            Round {race.round}
          </p>
          <p className="text-base font-semibold text-zinc-100 leading-tight">{race.name}</p>
          <p className="text-xs text-zinc-400 mt-1">{race.location}, {race.country}</p>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 flex-wrap pt-2">
        {race.winner ? (
          <span className="text-xs text-zinc-300">
            <span className="text-red-400 font-semibold mr-1">P1</span>
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
            <span className="glass-badge text-red-300">
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
        className="block group transition-all duration-200"
      >
        {content}
      </Link>
    );
  }

  return <div className="opacity-35 cursor-default">{content}</div>;
}
