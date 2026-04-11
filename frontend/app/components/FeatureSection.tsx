"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

interface FeatureSectionProps {
  image: string;
  title: string;
  subtitle: string;
  description: string;
  align?: "left" | "right";
  index: number;
  cta?: { label: string; onClick: () => void };
}

export default function FeatureSection({
  image,
  title,
  subtitle,
  description,
  align = "left",
  index,
  cta,
}: FeatureSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const isRight = align === "right";

  return (
    <div
      ref={sectionRef}
      className="relative min-h-screen flex items-center overflow-hidden"
    >
      {/* Background image with dark overlay */}
      <div className="absolute inset-0">
        <Image
          src={image}
          alt=""
          fill
          className="object-cover"
          sizes="100vw"
          loading={index < 2 ? "eager" : "lazy"}
        />
        <div className="absolute inset-0 bg-black/70" />
        <div
          className={`absolute inset-0 ${
            isRight
              ? "bg-gradient-to-l from-black/80 via-black/40 to-transparent"
              : "bg-gradient-to-r from-black/80 via-black/40 to-transparent"
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black" style={{ opacity: 0.6 }} />
      </div>

      {/* Content */}
      <div
        className={`relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-12 lg:px-20 py-24 flex ${
          isRight ? "justify-end" : "justify-start"
        }`}
      >
        <div className={`max-w-xl ${isRight ? "text-right" : "text-left"}`}>
          {/* Decorative line */}
          <div
            className={`h-[1px] w-16 bg-red-500 mb-8 origin-left transition-transform duration-[600ms] ease-out ${
              isRight ? "ml-auto origin-right" : ""
            } ${visible ? "scale-x-100" : "scale-x-0"}`}
          />

          {/* Subtitle */}
          <p
            className={`text-[11px] sm:text-xs uppercase tracking-[0.35em] text-red-400/80 mb-4 transition-all duration-[600ms] ease-out ${
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: "100ms" }}
          >
            {subtitle}
          </p>

          {/* Title */}
          <h2
            className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light text-white tracking-wide leading-tight mb-6 transition-all duration-[700ms] ease-out ${
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
            }`}
            style={{ transitionDelay: "200ms" }}
          >
            {title}
          </h2>

          {/* Description */}
          <p
            className={`text-sm sm:text-base text-zinc-400 leading-relaxed max-w-md transition-all duration-[600ms] ease-out ${
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
            }`}
            style={{
              transitionDelay: "400ms",
              ...(isRight ? { marginLeft: "auto" } : {}),
            }}
          >
            {description}
          </p>

          {/* Optional CTA */}
          {cta && (
            <div
              className={`mt-10 transition-all duration-[600ms] ease-out ${
                isRight ? "flex justify-end" : ""
              } ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
              style={{ transitionDelay: "600ms" }}
            >
              <button
                onClick={cta.onClick}
                className="group relative inline-flex items-center gap-3 px-10 py-4 text-base sm:text-lg font-semibold text-white transition-all duration-300 hover:scale-[1.03]"
              >
                <span className="absolute inset-0 rounded-2xl bg-red-500/10 border border-red-500/20 group-hover:bg-red-500/15 group-hover:border-red-500/30 group-hover:shadow-[0_0_40px_rgba(239,68,68,0.15)] transition-all duration-300" />
                <span className="relative">{cta.label}</span>
                <span className="relative text-red-400 group-hover:translate-x-1 transition-transform duration-200">&rarr;</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
