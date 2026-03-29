"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import ScrollCarAnimation from "./ScrollCarAnimation";
import FeatureSection from "./FeatureSection";

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
  return (
    <div>
      {/* Section 1: Hero */}
      <HeroSection />

      {/* Section 2: Car scroll animation */}
      <ScrollCarAnimation />

      {/* Sections 3-7: Feature showcase */}
      {FEATURES.map((f, i) => (
        <FeatureSection key={i} index={i} {...f} />
      ))}

      {/* Section 8: Season picker */}
      <SeasonPicker seasons={seasons} onSelectYear={onSelectYear} />
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
      {/* Red chevron glow behind title */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        {/* CSS chevron pattern — radiating red lines */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[800px] sm:w-[1600px] sm:h-[900px] opacity-[0.18]">
          {/* Left chevrons */}
          {[...Array(6)].map((_, i) => (
            <div
              key={`l${i}`}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                width: `${200 + i * 120}px`,
                height: `${200 + i * 120}px`,
                border: "1.5px solid rgba(239, 68, 68, 0.6)",
                transform: `translate(-50%, -50%) rotate(45deg) scale(${1 + i * 0.1})`,
              }}
            />
          ))}
        </div>

        {/* Radial red glow in center */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] sm:w-[1000px] sm:h-[600px]"
          style={{
            background: "radial-gradient(ellipse at center, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.05) 35%, transparent 65%)",
          }}
        />

        {/* Edge blur — fades everything into the dark background */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#08080c] via-transparent to-[#08080c]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#08080c] via-transparent to-[#08080c]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080c]/50 via-transparent to-[#08080c]" />
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

function SeasonPicker({
  seasons,
  onSelectYear,
}: {
  seasons: SeasonSummary[];
  onSelectYear: (year: number) => void;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      if (contentRef.current) {
        gsap.fromTo(
          contentRef.current,
          { opacity: 0, y: 40 },
          {
            opacity: 1, y: 0, duration: 0.8, ease: "power2.out",
            scrollTrigger: {
              trigger: section,
              start: "top 70%",
              toggleActions: "play none none reverse",
            },
          }
        );
      }
    }, section);

    return () => ctx.revert();
  }, []);

  const latestYear = seasons.length > 0 ? Math.max(...seasons.map(s => s.year)) : 2025;

  return (
    <div
      ref={sectionRef}
      className="relative min-h-[60vh] flex flex-col items-center justify-center px-6 py-24"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-950/5 to-transparent pointer-events-none" />

      <div ref={contentRef} className="relative z-10 text-center">
        <p className="text-sm sm:text-base text-zinc-500 mb-8">
          16 seasons. 300+ races. Every story waiting.
        </p>

        <button
          onClick={() => onSelectYear(latestYear)}
          className="group relative inline-flex items-center gap-3 px-12 py-5 text-lg sm:text-xl font-semibold text-white transition-all duration-300 hover:scale-[1.03]"
        >
          {/* Glow behind button */}
          <span className="absolute inset-0 rounded-2xl bg-red-500/10 border border-red-500/20 group-hover:bg-red-500/15 group-hover:border-red-500/30 group-hover:shadow-[0_0_40px_rgba(239,68,68,0.15)] transition-all duration-300" />
          <span className="relative">Pick a Season</span>
          <span className="relative text-red-400 group-hover:translate-x-1 transition-transform duration-200">&rarr;</span>
        </button>

        <p className="text-[11px] text-zinc-700 mt-8">
          No account needed — just explore.
        </p>
      </div>
    </div>
  );
}
