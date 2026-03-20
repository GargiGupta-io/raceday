"use client";

import { useEffect, useState } from "react";

// Simple F1 car side-view SVG silhouette
function F1CarSilhouette({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Body */}
      <path
        d="M50,80 L30,75 L20,70 L15,65 L20,55 L40,50 L80,45 L120,40 L160,38 L200,36 L280,35 L320,36 L350,40 L370,45 L380,50 L385,55 L380,65 L370,72 L350,78 L320,80 Z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Nose cone */}
      <path
        d="M15,65 L5,62 L2,60 L5,58 L15,55 L20,55 L15,65Z"
        fill="currentColor"
        opacity="0.8"
      />
      {/* Rear wing */}
      <path
        d="M370,30 L385,28 L390,30 L390,45 L385,48 L375,45 L370,40Z"
        fill="currentColor"
        opacity="0.85"
      />
      {/* Front wing */}
      <path
        d="M5,62 L0,60 L0,55 L5,53 L20,55 L15,65 L5,62Z"
        fill="currentColor"
        opacity="0.7"
      />
      {/* Halo */}
      <path
        d="M160,38 L165,28 L175,24 L195,24 L205,28 L210,38"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
        opacity="0.6"
      />
      {/* Front wheel */}
      <ellipse cx="90" cy="78" rx="18" ry="18" fill="currentColor" opacity="0.95" />
      <ellipse cx="90" cy="78" rx="10" ry="10" fill="black" opacity="0.5" />
      {/* Rear wheel */}
      <ellipse cx="320" cy="78" rx="20" ry="20" fill="currentColor" opacity="0.95" />
      <ellipse cx="320" cy="78" rx="11" ry="11" fill="black" opacity="0.5" />
    </svg>
  );
}

const FEATURES = [
  {
    icon: "\u{1F3CE}",
    title: "Race Stories",
    desc: "Every race told as a narrative — who won, what went wrong, and why it mattered.",
    accent: "from-red-600/20 to-transparent",
  },
  {
    icon: "\u{1F9EA}",
    title: "Strategy Simulator",
    desc: "Build alternate pit strategies and see ML-predicted outcomes.",
    accent: "from-orange-600/20 to-transparent",
  },
  {
    icon: "\u{1F50A}",
    title: "Team Radio",
    desc: "Hear the real emotions — celebrations, frustrations, strategy calls.",
    accent: "from-blue-600/20 to-transparent",
  },
  {
    icon: "\u{1F50D}",
    title: "Pattern Finder",
    desc: "What happens when it rains at Silverstone? History has the answers.",
    accent: "from-emerald-600/20 to-transparent",
  },
  {
    icon: "\u{1F4CA}",
    title: "15 Seasons · 300+ Races",
    desc: "Every lap, every stop, every overtake from 2010 to 2025.",
    accent: "from-purple-600/20 to-transparent",
  },
];

// Option A: Car drives across, cards trail behind it
function AnimatedCarIntro({ onStart }: { onStart: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-red-950/40 via-red-950/10 to-zinc-950" />

      {/* Speed lines behind car */}
      <div
        className={`absolute top-1/3 -right-full h-[2px] bg-gradient-to-l from-transparent via-red-500/30 to-transparent transition-all duration-[3000ms] ease-out ${
          visible ? "-translate-x-[200%]" : ""
        }`}
        style={{ width: "150%" }}
      />
      <div
        className={`absolute top-[38%] -right-full h-[1px] bg-gradient-to-l from-transparent via-red-400/20 to-transparent transition-all duration-[3500ms] ease-out delay-200 ${
          visible ? "-translate-x-[200%]" : ""
        }`}
        style={{ width: "120%" }}
      />

      <div className="relative max-w-5xl mx-auto px-6 py-16 sm:py-24">
        {/* Title */}
        <div
          className={`text-center mb-12 transition-all duration-1000 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <h1 className="text-5xl sm:text-7xl tracking-tight text-white mb-3" style={{ fontFamily: "var(--font-racing)" }}>
            RACE
            <span className="text-red-500">DAY</span>
          </h1>
          <p className="text-lg text-zinc-400 font-light">
            Every race has a story.
          </p>
        </div>

        {/* F1 car driving across — right to left */}
        <div className="relative h-16 mb-10 overflow-hidden">
          <div
            className={`absolute top-0 transition-all duration-[2500ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
              visible ? "-left-32" : "left-[110%]"
            }`}
            style={{ width: "160px" }}
          >
            <F1CarSilhouette className="w-40 h-12 text-red-500/70" />
          </div>
          {/* Trail line behind car */}
          <div
            className={`absolute top-6 right-0 h-[1px] bg-gradient-to-l from-red-500/50 to-transparent transition-all duration-[2500ms] ease-out ${
              visible ? "w-full" : "w-0"
            }`}
          />
        </div>

        {/* Feature cards — stagger in after car passes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className={`rounded-xl bg-zinc-900/80 border border-zinc-800/50 p-5 backdrop-blur transition-all duration-700 hover:border-zinc-700 hover:bg-zinc-900 ${
                visible
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 translate-x-12"
              }`}
              style={{ transitionDelay: `${800 + i * 200}ms` }}
            >
              <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${f.accent} pointer-events-none`} />
              <span className="text-2xl mb-2 block">{f.icon}</span>
              <p className="text-sm font-semibold text-zinc-100 mb-1">
                {f.title}
              </p>
              <p className="text-xs text-zinc-500 leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div
          className={`text-center transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
          style={{ transitionDelay: "2000ms" }}
        >
          <button
            onClick={onStart}
            className="rounded-lg bg-red-600 hover:bg-red-500 text-white px-8 py-3 text-sm font-semibold transition-all shadow-lg shadow-red-600/20 hover:shadow-red-500/30"
          >
            Pick a season to start
          </button>
          <p className="text-[10px] text-zinc-600 mt-3">
            No account needed — just explore.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function IntroHero({
  onStart,
}: {
  onStart: () => void;
}) {
  return <AnimatedCarIntro onStart={onStart} />;
}
