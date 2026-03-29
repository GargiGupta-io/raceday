"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";


const YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll(); // check on mount
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
  const isRaces = !isChampionship && !isPatterns && !isLive;

  return (
    <nav
      aria-label="Main navigation"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "top-3 left-4 right-4 sm:left-auto sm:right-auto sm:left-1/2 sm:-translate-x-1/2 sm:max-w-3xl sm:w-full"
          : ""
      }`}
    >
      <div
        className={`transition-all duration-500 ${
          scrolled
            ? "glass-card px-5 py-2.5 mx-auto"
            : "border-b border-white/[0.04] px-6 py-3 bg-transparent"
        }`}
      >
        <div className={`flex items-center justify-between ${scrolled ? "" : "max-w-5xl mx-auto"}`}>

          {/* Brand */}
          <Link
            href="/"
            aria-label="Raceday home"
            className="text-sm font-bold tracking-tight text-white hover:text-white/80 transition-colors"
          >
            Raceday
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            <Link
              href="/"
              aria-current={isRaces ? "page" : undefined}
              className={`rounded-lg px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs font-medium transition-all duration-200 ${
                isRaces
                  ? "glass-button-active text-white"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              Races
            </Link>
            <Link
              href={`/championship/${activeYear}`}
              aria-current={isChampionship ? "page" : undefined}
              className={`rounded-lg px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs font-medium transition-all duration-200 ${
                isChampionship
                  ? "glass-button-active text-white"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              <span className="hidden sm:inline">Championship</span>
              <span className="sm:hidden" aria-hidden="true">Champ</span>
            </Link>
            <Link
              href="/patterns"
              aria-current={isPatterns ? "page" : undefined}
              className={`rounded-lg px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs font-medium transition-all duration-200 ${
                isPatterns
                  ? "glass-button-active text-white"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              Patterns
            </Link>
            <Link
              href="/live"
              aria-current={isLive ? "page" : undefined}
              className={`rounded-lg px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs font-medium transition-all duration-200 ${
                isLive
                  ? "glass-button-active text-red-400 glow-pulse"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              Live
            </Link>
          </div>

          {/* Year selector */}
          <div className="flex items-center gap-3">
            <select
              aria-label="Select season year"
              value={activeYear}
              onChange={(e) => {
                const y = e.target.value;
                router.push(isChampionship ? `/championship/${y}` : `/?year=${y}`);
              }}
              className="glass-input px-3 py-1.5 text-xs cursor-pointer"
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
