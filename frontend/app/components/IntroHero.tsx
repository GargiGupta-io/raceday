"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
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
      {/* Background image */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <Image
          src="/images/hero-f1-dark.jpg"
          alt=""
          fill
          className="object-cover object-center opacity-40"
          sizes="100vw"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#08080c] via-[#08080c]/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080c]/60 via-transparent to-[#08080c]" />
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
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top 70%",
          toggleActions: "play none none reverse",
        },
      });

      if (titleRef.current) {
        tl.fromTo(
          titleRef.current,
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" },
          0
        );
      }

      if (subtitleRef.current) {
        tl.fromTo(
          subtitleRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" },
          0.2
        );
      }

      if (gridRef.current) {
        tl.fromTo(
          gridRef.current,
          { opacity: 0, y: 40 },
          { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
          0.35
        );
      }
    }, section);

    return () => ctx.revert();
  }, [seasons]);

  // Sort seasons newest first
  const sorted = [...seasons].sort((a, b) => b.year - a.year);

  return (
    <div
      ref={sectionRef}
      className="relative min-h-screen flex flex-col items-center justify-center px-6 py-24"
    >
      {/* Background subtle gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-950/5 to-transparent pointer-events-none" />

      <div className="relative z-10 w-full max-w-5xl mx-auto text-center">
        {/* Heading */}
        <h2
          ref={titleRef}
          className="text-4xl sm:text-5xl md:text-7xl font-light text-white tracking-wide mb-4"
        >
          Choose Your Season
        </h2>
        <p
          ref={subtitleRef}
          className="text-sm sm:text-base text-zinc-500 mb-16"
        >
          16 seasons. 300+ races. Pick one and dive in.
        </p>

        {/* Season grid */}
        <div
          ref={gridRef}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4"
        >
          {sorted.map((s) => (
            <button
              key={s.year}
              aria-label={`Explore ${s.year} season — champion ${s.champion}, ${s.team}`}
              onClick={() => onSelectYear(s.year)}
              className={`glass-card p-5 sm:p-6 text-left transition-all duration-300 hover:scale-[1.03] hover:border-red-500/30 group ${
                TEAM_COLOR[s.team] ? `border-l-2 ${TEAM_COLOR[s.team]}` : "border-l-2 border-zinc-700"
              }`}
            >
              <p className="text-2xl sm:text-3xl font-light text-white tracking-wide group-hover:text-red-400 transition-colors">
                {s.year}
              </p>
              <p className="text-xs text-zinc-500 mt-2">{s.champion}</p>
              <p className="text-[10px] text-zinc-600 mt-1">{s.team}</p>
            </button>
          ))}
        </div>

        <p className="text-[11px] text-zinc-700 mt-12">
          No account needed — just explore.
        </p>
      </div>
    </div>
  );
}
