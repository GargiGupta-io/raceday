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
    <div className="relative min-h-[100dvh] flex flex-col overflow-hidden bg-black">
      {/* Red arc glow — bright shining light effect */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">

        {/* Wide ambient bloom — soft outer wash */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "1400px",
            height: "1400px",
            background:
              "radial-gradient(circle, rgba(239, 68, 68, 0.22) 0%, rgba(220, 38, 38, 0.08) 35%, transparent 65%)",
            filter: "blur(90px)",
          }}
        />

        {/* Core glow — hotter, smaller, tighter */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "700px",
            height: "700px",
            background:
              "radial-gradient(circle, rgba(255, 80, 80, 0.75) 0%, rgba(239, 68, 68, 0.35) 25%, rgba(180, 30, 30, 0.1) 50%, transparent 70%)",
            filter: "blur(50px)",
          }}
        />

        {/* Sharp arc ring — the bright rim of light */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: "850px",
            height: "850px",
            border: "1.5px solid rgba(255, 120, 120, 0.5)",
            boxShadow:
              "0 0 140px 30px rgba(255, 50, 50, 0.5), inset 0 0 100px rgba(255, 50, 50, 0.2)",
            filter: "blur(2px)",
          }}
        />

        {/* Tight white-hot pinpoint at center — the brightest peak */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "200px",
            height: "200px",
            background:
              "radial-gradient(circle, rgba(255, 200, 200, 0.4) 0%, rgba(255, 100, 100, 0.2) 30%, transparent 60%)",
            filter: "blur(30px)",
          }}
        />

        {/* Edge vignette — fades into pure black at corners */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black" style={{ opacity: 0.7 }} />
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

