"use client";

import { useEffect, useState } from "react";

import { API } from "@/app/lib/api";

interface StoryData {
  tagline: string | null;
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
    setLoading(true);
    fetch(`${API}/races/${year}/${encodeURIComponent(track)}/story`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
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
      <div className="space-y-3 animate-pulse">
        <div className="h-4 w-64 bg-zinc-800 rounded" />
        <div className="h-3 w-full bg-zinc-800 rounded" />
        <div className="h-3 w-5/6 bg-zinc-800 rounded" />
        <div className="h-3 w-4/6 bg-zinc-800 rounded" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {/* Section header */}
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
        The Race Story
      </p>

      {/* Narrative paragraphs */}
      <div className="space-y-3">
        {data.narrative.map((paragraph, i) => (
          <p key={i} className="text-sm text-zinc-300 leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>

      {/* Metadata badges */}
      <div className="flex items-center gap-3 mt-4">
        {data.weather && (
          <span className="text-[10px] text-zinc-500 uppercase border border-zinc-800 rounded px-2 py-0.5">
            {data.weather}
          </span>
        )}
        {data.retirements > 0 && (
          <span className="text-[10px] text-zinc-500 uppercase border border-zinc-800 rounded px-2 py-0.5">
            {data.retirements} DNF{data.retirements !== 1 ? "s" : ""}
          </span>
        )}
        {data.laps && (
          <span className="text-[10px] text-zinc-500 uppercase border border-zinc-800 rounded px-2 py-0.5">
            {data.laps} laps
          </span>
        )}
      </div>
    </div>
  );
}
