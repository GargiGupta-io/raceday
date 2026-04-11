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
      {/* Eclipse-style red arc glow — bright rim of light on pure black */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          {/* Multi-stage gaussian blur for soft bloom around the arc */}
          <filter id="arc-bloom" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b1" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="b2" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="30" result="b3" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="70" result="b4" />
            <feMerge>
              <feMergeNode in="b4" />
              <feMergeNode in="b3" />
              <feMergeNode in="b2" />
              <feMergeNode in="b1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Hotspot gradient — bright white-pink core */}
          <radialGradient id="hotspot-grad">
            <stop offset="0%" stopColor="rgba(255, 250, 250, 1)" />
            <stop offset="15%" stopColor="rgba(255, 200, 200, 0.9)" />
            <stop offset="40%" stopColor="rgba(255, 100, 100, 0.55)" />
            <stop offset="100%" stopColor="rgba(255, 50, 50, 0)" />
          </radialGradient>
        </defs>

        {/* The arc — a huge circle with center off-screen to the right,
            so only its left edge curves through the right side of the frame */}
        <circle
          cx="1100"
          cy="450"
          r="560"
          fill="none"
          stroke="#ff2a2a"
          strokeWidth="3.5"
          filter="url(#arc-bloom)"
        />

        {/* Sharp inner highlight line — slightly offset to look like the bright edge */}
        <circle
          cx="1100"
          cy="450"
          r="560"
          fill="none"
          stroke="rgba(255, 180, 180, 0.9)"
          strokeWidth="1.2"
        />

        {/* Hotspot — bright point on the upper portion of the arc */}
        <circle
          cx="620"
          cy="215"
          r="55"
          fill="url(#hotspot-grad)"
          filter="url(#arc-bloom)"
        />

        {/* Tight white pinpoint at the hotspot center */}
        <circle
          cx="620"
          cy="215"
          r="6"
          fill="rgba(255, 255, 255, 1)"
        />
      </svg>

      {/* Pure black vignette — edges stay pitch dark */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black via-transparent to-black" style={{ opacity: 0.55 }} />

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

