import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-32 border-t border-white/[0.06] overflow-hidden">
      {/* Soft blurry red glow behind the footer — merges into black */}
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 pointer-events-none"
        style={{
          width: "1400px",
          height: "1000px",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(ellipse at center, rgba(239, 68, 68, 0.22) 0%, rgba(220, 38, 38, 0.1) 25%, rgba(180, 30, 30, 0.04) 45%, transparent 65%)",
          filter: "blur(120px)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 pointer-events-none"
        style={{
          width: "900px",
          height: "650px",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(ellipse at center, rgba(255, 80, 80, 0.18) 0%, rgba(239, 68, 68, 0.08) 40%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 sm:px-8 py-16">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-8">

          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link
              href="/"
              className="inline-block text-xl font-bold tracking-tight text-white"
              style={{ fontFamily: "var(--font-racing)" }}
            >
              RACE<span className="text-red-500">DAY</span>
            </Link>
            <p className="text-xs text-zinc-500 leading-relaxed mt-4 max-w-xs">
              Formula 1 race intelligence. 16 seasons, 300+ races, every story
              auto-analyzed from the data.
            </p>
          </div>

          {/* Explore */}
          <div>
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-4">
              Explore
            </p>
            <ul className="space-y-2.5">
              <li>
                <Link href="/races" className="text-xs text-zinc-500 hover:text-white transition-colors">
                  Races
                </Link>
              </li>
              <li>
                <Link href="/championship/2026" className="text-xs text-zinc-500 hover:text-white transition-colors">
                  Championship
                </Link>
              </li>
              <li>
                <Link href="/patterns" className="text-xs text-zinc-500 hover:text-white transition-colors">
                  Pattern Finder
                </Link>
              </li>
              <li>
                <Link href="/live" className="text-xs text-zinc-500 hover:text-white transition-colors">
                  Live Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Learn */}
          <div>
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-4">
              Learn
            </p>
            <ul className="space-y-2.5">
              <li>
                <Link href="/new-to-f1" className="text-xs text-zinc-500 hover:text-white transition-colors">
                  New to F1
                </Link>
              </li>
              <li>
                <Link href="/new-to-f1#glossary" className="text-xs text-zinc-500 hover:text-white transition-colors">
                  Glossary
                </Link>
              </li>
              <li>
                <Link href="/new-to-f1" className="text-xs text-zinc-500 hover:text-white transition-colors">
                  Race Weekend Format
                </Link>
              </li>
              <li>
                <Link href="/new-to-f1" className="text-xs text-zinc-500 hover:text-white transition-colors">
                  Starter Races
                </Link>
              </li>
            </ul>
          </div>

          {/* Data & About */}
          <div>
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-4">
              Data
            </p>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://docs.fastf1.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-zinc-500 hover:text-white transition-colors"
                >
                  FastF1
                </a>
              </li>
              <li>
                <a
                  href="https://api.jolpi.ca/ergast/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-zinc-500 hover:text-white transition-colors"
                >
                  Jolpica
                </a>
              </li>
              <li>
                <a
                  href="https://openmeteo.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-zinc-500 hover:text-white transition-colors"
                >
                  Open-Meteo
                </a>
              </li>
              <li>
                <a
                  href="https://openf1.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-zinc-500 hover:text-white transition-colors"
                >
                  OpenF1
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom bar */}
        <div className="mt-14 pt-8 border-t border-white/[0.05] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-[11px] text-zinc-600">
            &copy; {year} Raceday. Not affiliated with Formula 1, FIA, or any F1 team.
          </p>
          <p className="text-[11px] text-zinc-600">
            Built for the love of the sport.
          </p>
        </div>

      </div>
    </footer>
  );
}
