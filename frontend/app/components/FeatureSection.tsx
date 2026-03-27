"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface FeatureSectionProps {
  image: string;
  title: string;
  subtitle: string;
  description: string;
  align?: "left" | "right";
  index: number;
}

export default function FeatureSection({
  image,
  title,
  subtitle,
  description,
  align = "left",
  index,
}: FeatureSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      const isMobile = window.innerWidth < 768;

      // Image parallax — lighter on mobile to avoid jank
      if (imageRef.current) {
        gsap.fromTo(
          imageRef.current,
          { scale: isMobile ? 1.05 : 1.15 },
          {
            scale: 1,
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top bottom",
              end: "bottom top",
              scrub: isMobile ? 0.5 : true,
            },
          }
        );
      }

      // Content reveal timeline
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top 70%",
          end: "top 20%",
          toggleActions: "play none none reverse",
        },
      });

      // Decorative line grows
      if (lineRef.current) {
        tl.fromTo(
          lineRef.current,
          { scaleX: 0 },
          { scaleX: 1, duration: 0.6, ease: "power2.out" },
          0
        );
      }

      // Subtitle fades in with blur
      if (subtitleRef.current) {
        tl.fromTo(
          subtitleRef.current,
          { opacity: 0, y: 15, filter: "blur(8px)" },
          { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, ease: "power2.out" },
          0.1
        );
      }

      // Title fades in with blur
      if (titleRef.current) {
        tl.fromTo(
          titleRef.current,
          { opacity: 0, y: 20, filter: "blur(12px)" },
          { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "power2.out" },
          0.2
        );
      }

      // Description fades in
      if (descRef.current) {
        tl.fromTo(
          descRef.current,
          { opacity: 0, y: 20, filter: "blur(6px)" },
          { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, ease: "power2.out" },
          0.4
        );
      }
    }, section);

    return () => ctx.revert();
  }, []);

  const isRight = align === "right";

  return (
    <div
      ref={sectionRef}
      className="relative min-h-screen flex items-center overflow-hidden"
    >
      {/* Background image with dark overlay */}
      <div className="absolute inset-0" ref={imageRef}>
        <Image
          src={image}
          alt=""
          fill
          className="object-cover"
          sizes="100vw"
          loading={index < 2 ? "eager" : "lazy"}
        />
        {/* Heavy dark overlay — keeps text readable */}
        <div className="absolute inset-0 bg-black/70" />
        {/* Directional gradient — darker on the text side */}
        <div
          className={`absolute inset-0 ${
            isRight
              ? "bg-gradient-to-l from-black/80 via-black/40 to-transparent"
              : "bg-gradient-to-r from-black/80 via-black/40 to-transparent"
          }`}
        />
        {/* Top/bottom fade into page background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080c] via-transparent to-[#08080c]" style={{ opacity: 0.6 }} />
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        className={`relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-12 lg:px-20 py-24 flex ${
          isRight ? "justify-end" : "justify-start"
        }`}
      >
        <div className={`max-w-xl ${isRight ? "text-right" : "text-left"}`}>
          {/* Decorative line */}
          <div
            ref={lineRef}
            className={`h-[1px] w-16 bg-red-500 mb-8 ${
              isRight ? "ml-auto origin-right" : "origin-left"
            }`}
          />

          {/* Subtitle */}
          <p
            ref={subtitleRef}
            className="text-[11px] sm:text-xs uppercase tracking-[0.35em] text-red-400/80 mb-4"
          >
            {subtitle}
          </p>

          {/* Title */}
          <h2
            ref={titleRef}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light text-white tracking-wide leading-tight mb-6"
          >
            {title}
          </h2>

          {/* Description */}
          <p
            ref={descRef}
            className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-md"
            style={isRight ? { marginLeft: "auto" } : {}}
          >
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
