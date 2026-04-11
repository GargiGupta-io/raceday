"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";


const YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010];

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
  const isLive = pathname.startsWith("/live");
  const isRaces = pathname.startsWith("/races");
  const isNewToF1 = pathname.startsWith("/new-to-f1");

  return (
    <nav
      aria-label="Main navigation"
      className="fixed top-0 left-0 right-0 z-50 bg-transparent"
    >
      <div className="px-6 sm:px-10 py-6">
        <div className="flex items-center justify-between max-w-6xl mx-auto">

          {/* Brand */}
          <Link
            href="/"
            aria-label="Raceday home"
            className="text-lg sm:text-xl font-bold tracking-tight text-white hover:text-white/85 transition-colors"
          >
            Raceday
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/races"
              aria-current={isRaces ? "page" : undefined}
              className={`rounded-lg px-4 sm:px-5 py-2 text-xs sm:text-sm font-medium transition-all duration-200 ${
                isRaces
                  ? "text-white bg-white/[0.06]"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              Races
            </Link>
            <Link
              href={`/championship/${activeYear}`}
              aria-current={isChampionship ? "page" : undefined}
              className={`rounded-lg px-4 sm:px-5 py-2 text-xs sm:text-sm font-medium transition-all duration-200 ${
                isChampionship
                  ? "text-white bg-white/[0.06]"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <span className="hidden sm:inline">Championship</span>
              <span className="sm:hidden" aria-hidden="true">Champ</span>
            </Link>
            <Link
              href="/patterns"
              aria-current={isPatterns ? "page" : undefined}
              className={`rounded-lg px-4 sm:px-5 py-2 text-xs sm:text-sm font-medium transition-all duration-200 ${
                isPatterns
                  ? "text-white bg-white/[0.06]"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              Patterns
            </Link>
            <Link
              href="/live"
              aria-current={isLive ? "page" : undefined}
              className={`rounded-lg px-4 sm:px-5 py-2 text-xs sm:text-sm font-medium transition-all duration-200 ${
                isLive
                  ? "text-red-400 bg-red-500/[0.08] glow-pulse"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              Live
            </Link>
            <Link
              href="/new-to-f1"
              aria-current={isNewToF1 ? "page" : undefined}
              className={`rounded-lg px-4 sm:px-5 py-2 text-xs sm:text-sm font-medium transition-all duration-200 ${
                isNewToF1
                  ? "text-white bg-white/[0.06]"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <span className="hidden sm:inline">New to F1</span>
              <span className="sm:hidden" aria-hidden="true">Guide</span>
            </Link>
          </div>

          {/* Year selector */}
          <div className="flex items-center gap-3">
            <select
              aria-label="Select season year"
              value={activeYear}
              onChange={(e) => {
                const y = e.target.value;
                router.push(isChampionship ? `/championship/${y}` : `/races?year=${y}`);
              }}
              className="bg-transparent border border-white/[0.1] text-zinc-300 rounded-lg px-4 py-2 text-xs sm:text-sm cursor-pointer hover:border-white/[0.2] focus:border-white/[0.3] focus:outline-none transition-colors"
            >
              {YEARS.map((y) => (
                <option key={y} value={y} className="bg-zinc-900 text-zinc-200">{y}</option>
              ))}
            </select>
          </div>

        </div>
      </div>
    </nav>
  );
}
