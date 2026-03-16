"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const API = "http://localhost:8080";

const YEARS = [2024, 2023, 2022, 2021, 2020, 2019, 2018];

interface Race {
  round: number;
  name: string;
  location: string;
  country: string;
  date: string;
  format: string;
  indexed: boolean;
}

export default function Home() {
  const searchParams = useSearchParams();
  const urlYear = searchParams.get("year");
  const [year, setYear] = useState(urlYear ? parseInt(urlYear) : 2023);
  const [races, setRaces] = useState<Race[]>([]);

  // Sync with nav year links
  useEffect(() => {
    if (urlYear) setYear(parseInt(urlYear));
  }, [urlYear]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div className="mx-auto max-w-3xl px-6 py-12">

        {/* Year selector */}
        <div className="mb-8 flex gap-2 flex-wrap">
          {YEARS.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                y === year
                  ? "bg-red-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {y}
            </button>
          ))}
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
              <div key={race.round} className="group">
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

function RaceRow({ race }: { race: Race }) {
  return (
    <>
      <div className="flex items-center gap-4">
        <span className="w-6 text-right text-xs text-zinc-500 font-mono">R{race.round}</span>
        <div>
          <p className="text-sm font-medium text-zinc-100">{race.name}</p>
          <p className="text-xs text-zinc-500">{race.location}, {race.country}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500">{race.date}</span>
        {race.indexed && (
          <span className="rounded-full bg-emerald-900 px-2 py-0.5 text-xs text-emerald-400">
            indexed
          </span>
        )}
        {race.format === "sprint" && (
          <span className="rounded-full bg-yellow-900 px-2 py-0.5 text-xs text-yellow-400">
            sprint
          </span>
        )}
      </div>
    </>
  );
}
