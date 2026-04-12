"use client";

import { useEffect, useRef, useState } from "react";

export default function ScrollCarAnimation() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={sectionRef}
      className="relative h-screen overflow-hidden"
    >
      {/* Parallax background — uses CSS background-attachment: fixed
          so the image stays "pinned" in the viewport while content scrolls past */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url(/images/race-flyby-still.webp)",
          backgroundSize: "cover",
          backgroundPosition: "center 40%",
          backgroundAttachment: "fixed",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60 pointer-events-none" />

      {/* Radial vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.75) 100%)",
        }}
      />

      {/* Top + bottom fade into black */}
      <div
        className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black via-transparent to-black"
        style={{ opacity: 0.55 }}
      />

      {/* Center text — fades in when section enters viewport */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
        <div
          className={`text-center transition-all duration-1000 ease-out ${
            visible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-8"
          }`}
        >
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.4em] text-zinc-400 mb-5">
            Explore What&apos;s Inside
          </p>
          <h2 className="text-4xl sm:text-5xl md:text-7xl font-light text-white tracking-wide">
            Every Race Has a Story
          </h2>
        </div>
      </div>
    </div>
  );
}
