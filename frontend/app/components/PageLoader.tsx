"use client";

import { useEffect, useState } from "react";
import F1Car from "./F1Car";

export default function PageLoader() {
  const [done, setDone] = useState(false);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("raceday_loader_done")) {
      setHide(true);
      return;
    }

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
      <div className="relative w-72 h-16 mb-10 overflow-hidden">
        <div className="absolute top-2 animate-[driveLoader_2s_ease-in-out_infinite]" style={{ width: "120px" }}>
          <F1Car className="w-28 h-10 text-red-500" />
        </div>
        <div className="absolute bottom-2 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/20 to-transparent" />
      </div>

      <h1
        className="text-4xl sm:text-5xl text-white tracking-tight"
        style={{ fontFamily: "var(--font-racing)" }}
      >
        RACE<span className="text-red-500">DAY</span>
      </h1>
    </div>
  );
}
