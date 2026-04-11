"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import ScrollCarAnimation from "./ScrollCarAnimation";
import FeatureSection from "./FeatureSection";
import NewToF1Card from "./NewToF1Card";

gsap.registerPlugin(ScrollTrigger);

interface SeasonSummary {
  year: number;
  champion: string;
  team: string;
  wins: number;
  races: number;
  tagline: string;
}

const TEAM_COLOR: Record<string, string> = {
  "Red Bull Racing": "border-blue-500",
  "Red Bull": "border-blue-500",
  Mercedes: "border-emerald-400",
  Ferrari: "border-red-500",
  McLaren: "border-orange-400",
  Williams: "border-white",
  Renault: "border-yellow-400",
  Brawn: "border-lime-400",
};

const FEATURES = [
  {
    image: "/images/f1-pack-racing.jpg",
    title: "Race Stories",
    subtitle: "Beyond the Results",
    description:
      "Every Grand Prix is more than a finishing order. We break down the key moments, strategy calls, and turning points that shaped each race — from the opening lap chaos to the final-lap drama.",
    align: "left" as const,
  },
  {
    image: "/images/cockpit-detail.jpg",
    title: "Strategy Simulator",
    subtitle: "What If You Were on the Pit Wall",
    description:
      "Choose your driver, pick your tyres, set your pit windows — then watch how your strategy plays out against what actually happened. Every decision changes the outcome.",
    align: "right" as const,
  },
  {
    image: "/images/night-race.jpg",
    title: "Team Radio",
    subtitle: "Hear the Pressure",
    description:
      "The raw, unfiltered radio messages between drivers and engineers — transcribed, timestamped, and tagged by emotion. Hear the frustration, the celebration, the split-second calls.",
    align: "left" as const,
  },
  {
    image: "/images/aerial-racing.jpg",
    title: "Pattern Finder",
    subtitle: "History Repeats Itself",
    description:
      "Search across 16 seasons and 300+ races for patterns. Which circuits punish pole-sitters? Where do wet races produce upsets? When does a one-stop beat a two-stop? The data knows.",
    align: "right" as const,
  },
  {
    image: "/images/monaco-tight.jpg",
    title: "16 Seasons of F1",
    subtitle: "2010 — 2025",
    description:
      "From Vettel's dominance to Hamilton's reign to Verstappen's era. Every race, every strategy, every radio message — indexed, analyzed, and ready to explore.",
    align: "left" as const,
  },
];

export default function IntroHero({
  seasons,
  onSelectYear,
}: {
  seasons: SeasonSummary[];
  onSelectYear: (year: number) => void;
}) {
  const latestYear = seasons.length > 0 ? Math.max(...seasons.map((s) => s.year)) : 2026;

  return (
    <div>
      {/* Section 1: Hero */}
      <HeroSection />

      {/* Section 2: Car scroll animation */}
      <ScrollCarAnimation />

      {/* Section 3: Beginner primer */}
      <NewToF1Card currentYear={latestYear} />

      {/* Sections 4-8: Feature showcase — first feature gets the Pick a Season CTA */}
      {FEATURES.map((f, i) => (
        <FeatureSection
          key={i}
          index={i}
          {...f}
          cta={
            i === 0
              ? { label: "Pick a Season", onClick: () => onSelectYear(latestYear) }
              : undefined
          }
        />
      ))}
    </div>
  );
}

function HeroSection() {
  const [visible, setVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      gsap.to(el, {
        opacity: 0,
        y: -30,
        scrollTrigger: {
          trigger: el,
          start: "top 80%",
          end: "top 20%",
          scrub: true,
        },
      });
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className="relative min-h-[100dvh] flex flex-col overflow-hidden">
      {/* Red chevron glow — full coverage */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        {/* Large radiating diamond lines */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-[0.35]">
          {[...Array(10)].map((_, i) => (
            <div
              key={`d${i}`}
              className="absolute top-1/2 left-1/2"
              style={{
                width: `${300 + i * 200}px`,
                height: `${300 + i * 200}px`,
                border: `${i < 3 ? "2px" : "1.5px"} solid rgba(239, 68, 68, ${0.7 - i * 0.05})`,
                transform: `translate(-50%, -50%) rotate(45deg)`,
              }}
            />
          ))}
        </div>

        {/* Strong radial red glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full"
          style={{
            background: "radial-gradient(ellipse at center, rgba(239, 68, 68, 0.28) 0%, rgba(239, 68, 68, 0.12) 30%, rgba(239, 68, 68, 0.04) 50%, transparent 70%)",
          }}
        />

        {/* Edge fade — blends into pure black background */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black" style={{ opacity: 0.75 }} />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-black" style={{ opacity: 0.55 }} />
      </div>

      {/* Center content */}
      <div className="relative flex-1 flex flex-col justify-center items-center px-6">
        <div
          className={`text-center transition-all duration-1000 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <h1
            className="text-7xl sm:text-9xl md:text-[10rem] tracking-tight text-white mb-6"
            style={{ fontFamily: "var(--font-racing)" }}
          >
            RACE
            <span className="text-red-500">DAY</span>
          </h1>
          <p className="text-base sm:text-xl text-zinc-500 font-light tracking-wide">
            Every race has a story. Scroll to find yours.
          </p>
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        ref={scrollRef}
        className={`pb-10 text-center transition-all duration-700 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDelay: "1500ms" }}
      >
        <div className="inline-flex flex-col items-center gap-3 text-zinc-600">
          <span className="text-[10px] uppercase tracking-[0.3em]">
            Scroll
          </span>
          <svg
            width="16"
            height="24"
            viewBox="0 0 16 24"
            fill="none"
            className="animate-bounce"
          >
            <path
              d="M8 0L8 20M8 20L2 14M8 20L14 14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

