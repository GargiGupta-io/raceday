"use client";

import { useEffect, useState } from "react";

function F1CarLoader({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M50,80 L30,75 L20,70 L15,65 L20,55 L40,50 L80,45 L120,40 L160,38 L200,36 L280,35 L320,36 L350,40 L370,45 L380,50 L385,55 L380,65 L370,72 L350,78 L320,80 Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M15,65 L5,62 L2,60 L5,58 L15,55 L20,55 L15,65Z"
        fill="currentColor"
        opacity="0.8"
      />
      <path
        d="M370,30 L385,28 L390,30 L390,45 L385,48 L375,45 L370,40Z"
        fill="currentColor"
        opacity="0.85"
      />
      <path
        d="M5,62 L0,60 L0,55 L5,53 L20,55 L15,65 L5,62Z"
        fill="currentColor"
        opacity="0.7"
      />
      <path
        d="M160,38 L165,28 L175,24 L195,24 L205,28 L210,38"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
        opacity="0.6"
      />
      <ellipse cx="90" cy="78" rx="18" ry="18" fill="currentColor" opacity="0.95" />
      <ellipse cx="90" cy="78" rx="10" ry="10" fill="black" opacity="0.5" />
      <ellipse cx="320" cy="78" rx="20" ry="20" fill="currentColor" opacity="0.95" />
      <ellipse cx="320" cy="78" rx="11" ry="11" fill="black" opacity="0.5" />
    </svg>
  );
}

export default function PageLoader() {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    // Skip if already shown this session
    if (sessionStorage.getItem("raceday_loader_done")) {
      setHide(true);
      return;
    }

    // Simulate progress — fast start, slow middle, quick finish
    let current = 0;
    const interval = setInterval(() => {
      if (current < 60) {
        current += Math.random() * 8 + 4;
      } else if (current < 90) {
        current += Math.random() * 3 + 1;
      } else {
        current += Math.random() * 2 + 2;
      }
      if (current >= 100) {
        current = 100;
        clearInterval(interval);
        setTimeout(() => {
          setDone(true);
          sessionStorage.setItem("raceday_loader_done", "1");
          setTimeout(() => setHide(true), 600);
        }, 300);
      }
      setProgress(Math.min(Math.floor(current), 100));
    }, 80);

    return () => clearInterval(interval);
  }, []);

  if (hide) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center transition-opacity duration-500 ${
        done ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Car driving animation */}
      <div className="relative w-64 h-16 mb-8 overflow-hidden">
        <div
          className="absolute top-2 transition-all duration-300 ease-out"
          style={{ left: `${progress * 0.6}%`, width: "100px" }}
        >
          <F1CarLoader className="w-24 h-10 text-red-500" />
        </div>
        {/* Trail behind car */}
        <div
          className="absolute top-6 left-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/40 to-red-500/60 transition-all duration-300"
          style={{ width: `${progress * 0.6 + 5}%` }}
        />
      </div>

      {/* Progress counter */}
      <div className="text-center">
        <p className="text-5xl font-light text-white tracking-widest tabular-nums">
          {progress}
        </p>
        <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-600 mt-3">
          Loading
        </p>
      </div>

      {/* Bottom line */}
      <div className="absolute bottom-0 left-0 h-[2px] bg-red-500 transition-all duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
