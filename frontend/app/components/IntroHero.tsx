"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

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
  { icon: "\u{1F3CE}", title: "Race Stories" },
  { icon: "\u{1F9EA}", title: "Strategy Simulator" },
  { icon: "\u{1F50A}", title: "Team Radio" },
  { icon: "\u{1F50D}", title: "Pattern Finder" },
  { icon: "\u{1F4CA}", title: "16 Seasons · 300+ Races" },
];

function AnimatedCarIntro({ onStart }: { onStart: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative overflow-hidden min-h-[100dvh] flex flex-col">

      {/* Hero background image */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <Image
          src="/images/hero-f1-dark.jpg"
          alt=""
          fill
          className="object-cover object-center opacity-50"
          sizes="100vw"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#08080c] via-[#08080c]/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#08080c]/30 via-transparent to-[#08080c]/30" />
      </div>

      {/* Subtle red gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-red-950/20 via-transparent to-transparent pointer-events-none" />

      {/* Speed lines behind car */}
      <div
        className={`absolute top-[40%] -right-full h-[2px] bg-gradient-to-l from-transparent via-red-500/30 to-transparent transition-all duration-[3000ms] ease-out ${
          visible ? "-translate-x-[200%]" : ""
        }`}
        style={{ width: "150%" }}
      />
      <div
        className={`absolute top-[43%] -right-full h-[1px] bg-gradient-to-l from-transparent via-red-400/20 to-transparent transition-all duration-[3500ms] ease-out delay-200 ${
          visible ? "-translate-x-[200%]" : ""
        }`}
        style={{ width: "120%" }}
      />

      {/* Main content — centered vertically */}
      <div className="relative flex-1 flex flex-col justify-center max-w-5xl mx-auto px-6 w-full">

        {/* Title — kept exactly as original */}
        <div
          className={`text-center mb-16 transition-all duration-1000 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <h1 className="text-6xl sm:text-8xl tracking-tight text-white mb-4" style={{ fontFamily: "var(--font-racing)" }}>
            RACE
            <span className="text-red-500">DAY</span>
          </h1>
          <p className="text-lg sm:text-xl text-zinc-400 font-light">
            Every race has a story.
          </p>
        </div>

        {/* F1 car driving across — kept exactly as original */}
        <div className="relative h-16 mb-16 overflow-hidden">
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

        {/* Feature pills — compact one-liners */}
        <div className="flex flex-wrap justify-center gap-3 sm:gap-4 mb-16">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className={`glass-button px-5 py-2.5 flex items-center gap-2.5 transition-all duration-700 ${
                visible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-6"
              }`}
              style={{ transitionDelay: `${800 + i * 150}ms` }}
            >
              <span className="text-base">{f.icon}</span>
              <span className="text-xs font-medium text-zinc-200">{f.title}</span>
            </div>
          ))}
        </div>

        {/* CTA — glass button */}
        <div
          className={`text-center transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
          style={{ transitionDelay: "2800ms" }}
        >
          <button
            onClick={onStart}
            className="glass-button px-10 py-3.5 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-red-500/10 border-red-500/30 hover:border-red-500/50"
          >
            Pick a season to start
          </button>
          <p className="text-[11px] text-zinc-600 mt-4">
            No account needed — just explore.
          </p>
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        className={`relative pb-8 text-center transition-all duration-700 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDelay: "3200ms" }}
      >
        <div className="inline-flex flex-col items-center gap-2 text-zinc-600">
          <span className="text-[10px] uppercase tracking-widest">Scroll to explore</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="animate-bounce">
            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
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
