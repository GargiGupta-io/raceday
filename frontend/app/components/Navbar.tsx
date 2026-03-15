"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const YEARS = [2019, 2020, 2021, 2022, 2023, 2024];

export default function Navbar() {
  const pathname = usePathname();

  // Extract year from URL if present, default to 2023
  const yearMatch = pathname.match(/\/(\d{4})/);
  const activeYear = yearMatch ? parseInt(yearMatch[1]) : 2023;

  const isChampionship = pathname.startsWith("/championship");
  const isRaces = pathname === "/" || pathname.startsWith("/races");

  return (
    <nav className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">

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
        </div>

        {/* Year selector */}
        <div className="flex items-center gap-1">
          {YEARS.map((y) => (
            <Link
              key={y}
              href={isChampionship ? `/championship/${y}` : `/?year=${y}`}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                y === activeYear
                  ? "text-white"
                  : "text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {y}
            </Link>
          ))}
        </div>

      </div>
    </nav>
  );
}
