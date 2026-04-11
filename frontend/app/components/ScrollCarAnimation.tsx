"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

/**
 * Full-viewport cinematic hero section between the RACEDAY title and the
 * feature showcase. Uses a static image with CSS fixed-attachment parallax
 * and an IntersectionObserver-driven text fade. No GSAP, no video, no
 * scroll listeners.
 */
export default function ScrollCarAnimation() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={sectionRef}
      className="relative h-screen overflow-hidden bg-black"
    >
      {/* Static image — loaded once, no scroll scrubbing */}
      <Image
        src="/images/night-race.webp"
        alt=""
        fill
        priority
        className="object-cover"
        sizes="100vw"
        style={{
          // Desktop parallax feel — on iOS this degrades to scroll but the image
          // still shows correctly. No JS scroll listener required.
          backgroundAttachment: "fixed",
        }}
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/65 pointer-events-none" />

      {/* Radial vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.75) 100%)",
        }}
      />

      {/* Top + bottom fade into page background */}
      <div
        className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black via-transparent to-black"
        style={{ opacity: 0.55 }}
      />

      {/* Center text — fades in when the section enters the viewport */}
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
