"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { API } from "@/app/lib/api";

interface MatchRace {
  year: number;
  track: string;
  winner_name: string;
  reasons: string[];
}

interface PrecedentsData {
  insights: string[];
  matches: MatchRace[];
}

export default function PatternPrecedents({
  year,
  track,
}: {
  year: string;
  track: string;
}) {
  const [data, setData] = useState<PrecedentsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/races/${year}/${encodeURIComponent(track)}/precedents`)
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
      <div className="space-y-3">
        <div className="h-3 w-48 glass-skeleton rounded" />
        <div className="h-3 w-full glass-skeleton rounded" />
        <div className="h-3 w-3/4 glass-skeleton rounded" />
      </div>
    );
  }

  if (!data || (!data.insights.length && !data.matches.length)) return null;

  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-5">
        What History Tells Us
      </p>

      {/* Insight sentences — bare text */}
      <div className="space-y-3">
        {data.insights.map((insight, i) => (
          <p key={i} className="text-sm text-zinc-300 leading-[1.8]">
            {insight}
          </p>
        ))}
      </div>

      {/* Matching races — keep glass since these are interactive links */}
      {data.matches.length > 0 && (
        <div className="mt-8">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">
            Similar races
          </p>
          <div className="space-y-2">
            {data.matches.map((m, i) => (
              <Link
                key={i}
                href={`/races/${m.year}/${encodeURIComponent(m.track)}`}
                className="glass-card flex items-center gap-3 px-4 py-3 transition-all duration-200"
              >
                <span className="text-xs font-mono text-zinc-500 w-8">{m.year}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 truncate">{m.track}</p>
                  <p className="text-xs text-zinc-500">
                    Won by {m.winner_name}
                    {m.reasons.length > 0 && (
                      <span> — {m.reasons[0].toLowerCase()}</span>
                    )}
                  </p>
                </div>
                <span className="text-zinc-600 text-xs">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
