"use client";

import { useEffect, useState } from "react";

import { API, fetchWithTimeout } from "@/app/lib/api";
import { wrapGlossaryTerms } from "@/app/components/GlossaryTerm";

interface StoryData {
  narrative: string[];
  weather: string;
  retirements: number;
  laps: number | null;
}

export default function RaceStory({
  year,
  track,
}: {
  year: string;
  track: string;
}) {
  const [data, setData] = useState<StoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithTimeout<StoryData | null>(`${API}/races/${year}/${encodeURIComponent(track)}/story`)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setData(null);
        setLoading(false);
      });
  }, [year, track]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-4 w-64 glass-skeleton rounded" />
        <div className="h-3 w-full glass-skeleton rounded" />
        <div className="h-3 w-5/6 glass-skeleton rounded" />
        <div className="h-3 w-4/6 glass-skeleton rounded" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {/* Section header */}
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-5">
        The Race Story
      </p>

      {/* Narrative paragraphs — bare text, editorial spacing */}
      <div className="space-y-4">
        {data.narrative.map((paragraph, i) => (
          <p key={i} className="text-sm text-zinc-300 leading-[1.8]">
            {wrapGlossaryTerms(paragraph)}
          </p>
        ))}
      </div>

      {/* Metadata badges */}
      <div className="flex items-center gap-3 mt-6">
        {data.weather && (
          <span className="glass-badge text-zinc-400 uppercase">
            {data.weather}
          </span>
        )}
        {data.retirements > 0 && (
          <span className="glass-badge text-zinc-400 uppercase">
            {data.retirements} DNF{data.retirements !== 1 ? "s" : ""}
          </span>
        )}
        {data.laps && (
          <span className="glass-badge text-zinc-400 uppercase">
            {data.laps} laps
          </span>
        )}
      </div>
    </div>
  );
}
