"use client";

import { useState, useRef, useEffect } from "react";
import { getDefinition } from "@/app/lib/glossary";

interface GlossaryTermProps {
  term: string;
  children?: React.ReactNode;
}

export default function GlossaryTerm({ term, children }: GlossaryTermProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const definition = getDefinition(term);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!definition) {
    return <>{children ?? term}</>;
  }

  return (
    <span
      ref={wrapperRef}
      className="relative inline-block group"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="cursor-help border-b border-dotted border-zinc-500 hover:border-red-400 text-inherit bg-transparent p-0 m-0 font-inherit transition-colors duration-200"
        aria-label={`Definition of ${term}`}
      >
        {children ?? term}
      </button>

      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 sm:w-72 z-50 pointer-events-none"
        >
          <span className="block glass-card px-3 py-2 text-xs text-zinc-200 leading-relaxed text-left shadow-xl">
            <span className="block text-[10px] uppercase tracking-widest text-red-400 font-semibold mb-1">
              {term}
            </span>
            {definition}
          </span>
          <span className="block w-2 h-2 bg-white/[0.08] border-r border-b border-white/[0.1] rotate-45 mx-auto -mt-1" />
        </span>
      )}
    </span>
  );
}
