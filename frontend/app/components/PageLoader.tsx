"use client";

import { useEffect, useState } from "react";

export default function PageLoader() {
  const [done, setDone] = useState(false);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("raceday_loader_done")) {
      setHide(true);
      return;
    }

    // Show for 2 seconds then fade out
    const timer = setTimeout(() => {
      setDone(true);
      sessionStorage.setItem("raceday_loader_done", "1");
      setTimeout(() => setHide(true), 600);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (hide) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center transition-opacity duration-500 ${
        done ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Animated car driving across */}
      <div className="relative w-72 h-16 mb-10 overflow-hidden">
        <div className="absolute top-2 animate-[driveLoader_2s_ease-in-out_infinite]" style={{ width: "120px" }}>
          <svg viewBox="0 0 400 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-28 h-10 text-red-500">
            <path d="M50,80 L30,75 L20,70 L15,65 L20,55 L40,50 L80,45 L120,40 L160,38 L200,36 L280,35 L320,36 L350,40 L370,45 L380,50 L385,55 L380,65 L370,72 L350,78 L320,80 Z" fill="currentColor" opacity="0.9"/>
            <path d="M15,65 L5,62 L2,60 L5,58 L15,55 L20,55 L15,65Z" fill="currentColor" opacity="0.8"/>
            <path d="M370,30 L385,28 L390,30 L390,45 L385,48 L375,45 L370,40Z" fill="currentColor" opacity="0.85"/>
            <path d="M5,62 L0,60 L0,55 L5,53 L20,55 L15,65 L5,62Z" fill="currentColor" opacity="0.7"/>
            <path d="M160,38 L165,28 L175,24 L195,24 L205,28 L210,38" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.6"/>
            <ellipse cx="90" cy="78" rx="18" ry="18" fill="currentColor" opacity="0.95"/>
            <ellipse cx="90" cy="78" rx="10" ry="10" fill="black" opacity="0.5"/>
            <ellipse cx="320" cy="78" rx="20" ry="20" fill="currentColor" opacity="0.95"/>
            <ellipse cx="320" cy="78" rx="11" ry="11" fill="black" opacity="0.5"/>
          </svg>
        </div>
        {/* Track line */}
        <div className="absolute bottom-2 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/20 to-transparent" />
      </div>

      {/* Brand text */}
      <h1
        className="text-4xl sm:text-5xl text-white tracking-tight"
        style={{ fontFamily: "var(--font-racing)" }}
      >
        RACE<span className="text-red-500">DAY</span>
      </h1>
    </div>
  );
}
