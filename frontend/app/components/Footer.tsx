import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden">
      {/* Top fade — blends whatever image/section is above into pure black
          so the footer feels connected, not a hard cut */}
      <div
        aria-hidden="true"
        className="h-56 bg-gradient-to-b from-transparent to-black pointer-events-none -mt-40"
      />

      <div className="relative pb-16">
        {/* Soft blurry red glow behind the footer glass card */}
        <div
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 pointer-events-none"
          style={{
            width: "1500px",
            height: "900px",
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(ellipse at center, rgba(239, 68, 68, 0.25) 0%, rgba(220, 38, 38, 0.12) 25%, rgba(180, 30, 30, 0.04) 45%, transparent 65%)",
            filter: "blur(130px)",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 pointer-events-none"
          style={{
            width: "900px",
            height: "600px",
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(ellipse at center, rgba(255, 80, 80, 0.2) 0%, rgba(239, 68, 68, 0.09) 40%, transparent 70%)",
            filter: "blur(85px)",
          }}
        />

        {/* Glass panel — Vorqal-style dark glass card */}
        <div className="relative mx-auto max-w-6xl px-6 sm:px-8">
          <div className="glass-card p-10 sm:p-14 md:p-16">

            <div className="grid grid-cols-2 md:grid-cols-4 gap-12 md:gap-10">

              {/* Brand column */}
              <div className="col-span-2 md:col-span-1">
                <Link
                  href="/"
                  className="inline-block text-2xl sm:text-3xl font-bold tracking-tight text-white"
                  style={{ fontFamily: "var(--font-racing)" }}
                >
                  RACE<span className="text-red-500">DAY</span>
                </Link>
                <p className="text-sm text-zinc-400 leading-relaxed mt-5 max-w-xs">
                  Formula 1 race intelligence. 16 seasons, 300+ races, every story
                  auto-analyzed from the data.
                </p>
              </div>

              {/* Explore */}
              <div>
                <p className="text-xs font-semibold text-white uppercase tracking-widest mb-5">
                  Explore
                </p>
                <ul className="space-y-3">
                  <li>
                    <Link href="/races" className="text-sm text-zinc-400 hover:text-white transition-colors">
                      Races
                    </Link>
                  </li>
                  <li>
                    <Link href="/championship/2026" className="text-sm text-zinc-400 hover:text-white transition-colors">
                      Championship
                    </Link>
                  </li>
                  <li>
                    <Link href="/patterns" className="text-sm text-zinc-400 hover:text-white transition-colors">
                      Pattern Finder
                    </Link>
                  </li>
                  <li>
                    <Link href="/live" className="text-sm text-zinc-400 hover:text-white transition-colors">
                      Live Dashboard
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Learn */}
              <div>
                <p className="text-xs font-semibold text-white uppercase tracking-widest mb-5">
                  Learn
                </p>
                <ul className="space-y-3">
                  <li>
                    <Link href="/new-to-f1" className="text-sm text-zinc-400 hover:text-white transition-colors">
                      New to F1
                    </Link>
                  </li>
                  <li>
                    <Link href="/new-to-f1#glossary" className="text-sm text-zinc-400 hover:text-white transition-colors">
                      Glossary
                    </Link>
                  </li>
                  <li>
                    <Link href="/new-to-f1" className="text-sm text-zinc-400 hover:text-white transition-colors">
                      Race Weekend
                    </Link>
                  </li>
                  <li>
                    <Link href="/new-to-f1" className="text-sm text-zinc-400 hover:text-white transition-colors">
                      Starter Races
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Data */}
              <div>
                <p className="text-xs font-semibold text-white uppercase tracking-widest mb-5">
                  Data
                </p>
                <ul className="space-y-3">
                  <li>
                    <a
                      href="https://docs.fastf1.dev/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-zinc-400 hover:text-white transition-colors"
                    >
                      FastF1
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://api.jolpi.ca/ergast/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-zinc-400 hover:text-white transition-colors"
                    >
                      Jolpica
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://openmeteo.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-zinc-400 hover:text-white transition-colors"
                    >
                      Open-Meteo
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://openf1.org/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-zinc-400 hover:text-white transition-colors"
                    >
                      OpenF1
                    </a>
                  </li>
                </ul>
              </div>

            </div>

            {/* Bottom bar */}
            <div className="mt-14 pt-8 border-t border-white/[0.07] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <p className="text-xs text-zinc-500">
                &copy; {year} Raceday. Not affiliated with Formula 1, FIA, or any F1 team.
              </p>
              <p className="text-xs text-zinc-500">
                Built for the love of the sport.
              </p>
            </div>

          </div>
        </div>
      </div>
    </footer>
  );
}
