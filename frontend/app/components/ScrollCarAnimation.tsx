"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function ScrollCarAnimation() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const video = videoRef.current;
    const text = textRef.current;
    const overlay = overlayRef.current;
    if (!section || !video || !text || !overlay) return;

    // Wait for video metadata to load so we know the duration
    const setup = () => {
      const duration = video.duration;
      if (!duration || isNaN(duration)) return;

      const ctx = gsap.context(() => {
        const isMobile = window.innerWidth < 768;

        // Scrub video playback to scroll position — throttled for performance
        let lastTime = -1;
        const st = ScrollTrigger.create({
          trigger: section,
          start: isMobile ? "top 80%" : "top top",
          end: isMobile ? "bottom 20%" : "+=200%",
          pin: !isMobile,
          scrub: 1,
          anticipatePin: 1,
          onUpdate: (self) => {
            if (video && duration) {
              const targetTime = Math.round(self.progress * duration * 10) / 10;
              if (targetTime !== lastTime) {
                video.currentTime = targetTime;
                lastTime = targetTime;
              }
            }
          },
        });

        // Text fades in at 30% scroll, fades out at 80% — no blur filter
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: isMobile ? "top 60%" : "top top",
            end: isMobile ? "bottom 20%" : "+=200%",
            scrub: 1,
          },
        });

        tl.fromTo(
          text,
          { opacity: 0, y: 40 },
          { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" },
          0.25
        );
        tl.to(
          text,
          { opacity: 0, y: -30, duration: 0.2 },
          0.7
        );

        // Overlay darkens at start and end for smooth transitions
        tl.fromTo(
          overlay,
          { opacity: 0.8 },
          { opacity: 0.3, duration: 0.3 },
          0
        );
        tl.to(
          overlay,
          { opacity: 0.8, duration: 0.3 },
          0.7
        );

        return () => {
          st.kill();
          ctx.revert();
        };
      }, section);
    };

    if (video.readyState >= 1) {
      setup();
    } else {
      video.addEventListener("loadedmetadata", setup, { once: true });
    }
  }, []);

  return (
    <div ref={sectionRef} className="relative h-screen bg-black overflow-hidden">
      {/* Video — paused, controlled by scroll */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover will-change-transform"
        src="/videos/night-race-flyby.mp4"
        muted
        playsInline
        preload="auto"
      />

      {/* Dark overlay for text readability + transitions */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/60 pointer-events-none"
      />

      {/* Vignette edges */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      {/* Top/bottom fade into page bg */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black via-transparent to-black" style={{ opacity: 0.5 }} />

      {/* Center text — appears mid-scroll */}
      <div
        ref={textRef}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <div className="text-center px-6">
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.4em] text-zinc-400 mb-4">
            Explore What&apos;s Inside
          </p>
          <h2 className="text-3xl sm:text-5xl md:text-7xl font-light text-white tracking-wide">
            Every Race Has a Story
          </h2>
        </div>
      </div>
    </div>
  );
}
