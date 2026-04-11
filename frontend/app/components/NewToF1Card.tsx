"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API } from "@/app/lib/api";

interface Race {
  round: number;
  name: string;
  location: string;
  country: string;
  date: string;
  indexed: boolean;
  winner?: string;
}

interface StarterRace {
  year: number;
  name: string;
  hook: string;
}

const STARTER_RACES: StarterRace[] = [
  {
    year: 2008,
    name: "Brazilian Grand Prix",
    hook: "Hamilton clinches his first title in the final corner of the final lap.",
  },
  {
    year: 2021,
    name: "Abu Dhabi Grand Prix",
    hook: "Verstappen overtakes Hamilton on the last lap in the most controversial finish ever.",
  },
  {
    year: 2020,
    name: "Turkish Grand Prix",
    hook: "Hamilton wins a rain-soaked masterclass to seal his seventh world title.",
  },
];

export default function NewToF1Card({ currentYear }: { currentYear: number }) {
  const [nextRace, setNextRace] = useState<Race | null>(null);
  const [latestCompleted, setLatestCompleted] = useState<Race | null>(null);
  const [totalRaces, setTotalRaces] = useState<number>(0);

  useEffect(() => {
    fetch(`${API}/races/${currentYear}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((races: Race[]) => {
        setTotalRaces(races.length);
        const upcoming = races.find((r) => r.date && new Date(r.date) > new Date());
        if (upcoming) setNextRace(upcoming);
        const completed = races.filter((r) => r.indexed && r.winner);
        if (completed.length > 0) setLatestCompleted(completed[completed.length - 1]);
      })
      .catch(() => {});
  }, [currentYear]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

  return (
    <section className="relative px-6 py-20 sm:py-28 overflow-hidden">
      {/* Soft blurry red glow behind the card — merges into black */}
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 pointer-events-none"
        style={{
          width: "1100px",
          height: "1100px",
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
          width: "700px",
          height: "700px",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(ellipse at center, rgba(255, 80, 80, 0.18) 0%, rgba(239, 68, 68, 0.08) 40%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative mx-auto max-w-3xl">
        <div className="glass-card-blur p-8 sm:p-10">

          <p className="text-[10px] text-red-400 uppercase tracking-[0.3em] mb-3">
            New to Formula 1?
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight mb-4">
            Start here.
          </h2>
          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed mb-8">
            Formula 1 is the world&apos;s top motorsport — 20 drivers, 10 teams, around
            24 races a year, one world champion. Every race tells a story of strategy,
            risk, and split-second decisions. This site is where you explore them.
          </p>

          {(nextRace || latestCompleted) && (
            <div className="border-t border-white/[0.06] pt-6 mb-6">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
                Right now
              </p>
              {nextRace ? (
                <p className="text-sm text-zinc-200">
                  Round <span className="text-white font-semibold">{nextRace.round}</span>
                  {totalRaces > 0 && <span className="text-zinc-500"> of {totalRaces}</span>}
                  {" · "}
                  Next: <span className="text-white font-semibold">{nextRace.name.replace(" Grand Prix", "")}</span>
                  {" · "}
                  <span className="text-zinc-400">{formatDate(nextRace.date)}</span>
                </p>
              ) : latestCompleted ? (
                <p className="text-sm text-zinc-200">
                  <span className="text-white font-semibold">{currentYear}</span> season complete
                  {" · "}
                  Latest: <span className="text-white font-semibold">{latestCompleted.name.replace(" Grand Prix", "")}</span>
                </p>
              ) : null}
            </div>
          )}

          <div className="border-t border-white/[0.06] pt-6 mb-8">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-4">
              Three races to start with
            </p>
            <div className="space-y-3">
              {STARTER_RACES.map((r) => (
                <Link
                  key={`${r.year}-${r.name}`}
                  href={`/races/${r.year}/${encodeURIComponent(r.name)}`}
                  className="block rounded-lg px-4 py-3 transition-all duration-200 hover:bg-white/[0.04] border border-white/[0.04] hover:border-white/[0.08]"
                >
                  <p className="text-xs text-red-400 font-semibold tracking-wide mb-1">
                    {r.name.replace(" Grand Prix", "")} {r.year}
                  </p>
                  <p className="text-sm text-zinc-300 leading-snug">{r.hook}</p>
                </Link>
              ))}
            </div>
          </div>

          <Link
            href="/new-to-f1"
            className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 hover:border-red-500/30 transition-all duration-200"
          >
            <span className="text-sm font-semibold text-white">Read the full beginner guide</span>
            <span className="text-red-400 group-hover:translate-x-1 transition-transform duration-200">&rarr;</span>
          </Link>

        </div>
      </div>
    </section>
  );
}
