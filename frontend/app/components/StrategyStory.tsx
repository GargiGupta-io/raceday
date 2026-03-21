"use client";

import { useEffect, useState } from "react";

import { API } from "@/app/lib/api";
import HighlightedText from "@/app/lib/HighlightedText";

interface NarrativeSection {
  heading: string;
  body: string;
}

export default function StrategyStory({
  year,
  track,
}: {
  year: string;
  track: string;
}) {
  const [sections, setSections] = useState<NarrativeSection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(
      `${API}/races/${year}/${encodeURIComponent(track)}/strategy/narrative`
    )
      .then((r) => {
        if (!r.ok) return [];
        return r.json();
      })
      .then((data) => {
        setSections(data || []);
        setLoading(false);
      })
      .catch(() => {
        setSections([]);
        setLoading(false);
      });
  }, [year, track]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg bg-zinc-900 p-5">
            <div className="h-4 w-32 bg-zinc-800 rounded mb-3" />
            <div className="space-y-2">
              <div className="h-3 w-full bg-zinc-800 rounded" />
              <div className="h-3 w-5/6 bg-zinc-800 rounded" />
              <div className="h-3 w-3/4 bg-zinc-800 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-lg bg-zinc-900 p-6 text-center">
        <p className="text-zinc-500 text-sm">
          No strategy narrative available for this race.
        </p>
      </div>
    );
  }

  // Section heading icons
  const SECTION_ICON: Record<string, string> = {
    "Race Conditions": "~",
    "The Opening Gambit": ">",
    "The Key Move": "!",
    "Strategy Split": "/",
    "The Winning Formula": "*",
  };

  return (
    <div className="space-y-3">
      {sections.map((section, i) => (
        <div key={i} className="rounded-lg bg-zinc-900 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center text-xs text-red-400 font-bold">
              {SECTION_ICON[section.heading] || (i + 1).toString()}
            </span>
            <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wide">
              {section.heading}
            </h3>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            <HighlightedText text={section.body} />
          </p>
        </div>
      ))}
    </div>
  );
}
