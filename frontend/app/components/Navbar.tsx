"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";


const YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Extract year from URL path (/races/2023/...) or query param (?year=2023)
  const yearMatch = pathname.match(/\/(\d{4})/);
  const queryYear = searchParams.get("year");
  const activeYear = yearMatch
    ? parseInt(yearMatch[1])
    : queryYear
    ? parseInt(queryYear)
    : 2025;

  const isChampionship = pathname.startsWith("/championship");
  const isPatterns = pathname.startsWith("/patterns");
  const isRaces = !isChampionship && !isPatterns;

  return (
    <nav className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">

        {/* Brand */}
        <Link
          href="/"
          className="text-sm font-bold tracking-tight text-white hover:text-zinc-300 transition-colors"
        >
          Raceday
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          <Link
            href="/"
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              isRaces
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Races
          </Link>
          <Link
            href={`/championship/${activeYear}`}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              isChampionship
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Championship
          </Link>
          <Link
            href="/patterns"
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              isPatterns
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Patterns
          </Link>
        </div>

        {/* Year selector + Auth */}
        <div className="flex items-center gap-3">
          <select
            value={activeYear}
            onChange={(e) => {
              const y = e.target.value;
              router.push(isChampionship ? `/championship/${y}` : `/?year=${y}`);
            }}
            className="rounded bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300 border border-zinc-700 focus:outline-none focus:border-zinc-500 cursor-pointer"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

        </div>

      </div>
    </nav>
  );
}
