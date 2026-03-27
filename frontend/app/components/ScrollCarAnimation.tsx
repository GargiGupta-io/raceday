"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import F1Car from "./F1Car";

gsap.registerPlugin(ScrollTrigger);

export default function ScrollCarAnimation() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const carRef = useRef<HTMLDivElement>(null);
  const trailRefs = useRef<(HTMLDivElement | null)[]>([]);
  const glowRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const car = carRef.current;
    const glow = glowRef.current;
    const text = textRef.current;
    if (!section || !car || !glow || !text) return;

    const ctx = gsap.context(() => {
      const isMobile = window.innerWidth < 768;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: isMobile ? "top 80%" : "top top",
          end: isMobile ? "bottom 20%" : "+=150%",
          pin: !isMobile,
          scrub: isMobile ? 0.5 : 1,
          anticipatePin: 1,
        },
      });

      // Car drives from right (120%) to left (-30%)
      tl.fromTo(
        car,
        { xPercent: 120 },
        { xPercent: -30, ease: "none", duration: 1 }
      );

      // Glow follows the car
      tl.fromTo(
        glow,
        { xPercent: 120, opacity: 0 },
        { xPercent: -30, opacity: 1, ease: "none", duration: 1 },
        0
      );

      // Speed lines animate with the car
      trailRefs.current.forEach((trail, i) => {
        if (!trail) return;
        tl.fromTo(
          trail,
          { scaleX: 0, opacity: 0 },
          {
            scaleX: 1,
            opacity: [0.6, 0.4, 0.3, 0.2, 0.15][i] || 0.2,
            ease: "none",
            duration: 0.4,
          },
          0.1 + i * 0.05
        );
        tl.to(
          trail,
          { opacity: 0, duration: 0.3 },
          0.7
        );
      });

      // Text fades in mid-scroll
      tl.fromTo(
        text,
        { opacity: 0, y: 30, filter: "blur(10px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.4, ease: "power2.out" },
        0.3
      );
      tl.to(
        text,
        { opacity: 0, y: -20, duration: 0.3 },
        0.8
      );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={sectionRef} className="relative h-screen bg-black overflow-hidden">
      {/* Subtle grid lines for depth */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      {/* Speed trail lines */}
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          ref={(el) => { trailRefs.current[i] = el; }}
          className="absolute h-[1px] origin-right"
          style={{
            top: `${46 + i * 3}%`,
            left: "5%",
            right: "5%",
            background: `linear-gradient(90deg, transparent, ${
              i === 0 ? "rgba(239,68,68,0.5)" : `rgba(239,68,68,${0.3 - i * 0.05})`
            }, transparent)`,
            transform: "scaleX(0)",
          }}
        />
      ))}

      {/* Red glow behind car */}
      <div
        ref={glowRef}
        className="absolute top-1/2 -translate-y-1/2 w-64 h-64 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      {/* F1 Car */}
      <div
        ref={carRef}
        className="absolute top-1/2 -translate-y-1/2 w-[280px] sm:w-[360px] md:w-[440px]"
      >
        <F1Car className="w-full text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.4)]" />
      </div>

      {/* Center text — appears mid-scroll */}
      <div
        ref={textRef}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <div className="text-center">
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.4em] text-zinc-500 mb-4">
            Explore What&apos;s Inside
          </p>
          <h2 className="text-3xl sm:text-5xl md:text-6xl font-light text-white tracking-wide">
            Every Race Has a Story
          </h2>
        </div>
      </div>
    </div>
  );
}
