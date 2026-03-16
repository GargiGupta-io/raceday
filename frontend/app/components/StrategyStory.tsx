"use client";

import { useEffect, useState } from "react";

const API = "http://localhost:8080";

// Driver codes to highlight in the narrative
const DRIVER_PATTERN = /\b([A-Z]{3})\b/g;

export default function StrategyStory({
  year,
  track,
}: {
  year: string;
  track: string;
}) {
  const [paragraphs, setParagraphs] = useState<string[]>([]);
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
        setParagraphs(data || []);
        setLoading(false);
      })
      .catch(() => {
        setParagraphs([]);
        setLoading(false);
      });
  }, [year, track]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg bg-zinc-900 p-5">
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

  if (paragraphs.length === 0) {
    return (
      <div className="rounded-lg bg-zinc-900 p-6 text-center">
        <p className="text-zinc-500 text-sm">
          No strategy narrative available for this race.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-zinc-900 p-6">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">
          Strategy Story
        </p>
        <div className="space-y-4">
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className="text-sm text-zinc-300 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: highlightDrivers(p) }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function highlightDrivers(text: string): string {
  return text.replace(
    DRIVER_PATTERN,
    '<span class="font-semibold text-white">$1</span>'
  );
}
