"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API = "http://localhost:8888";

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
      <div className="space-y-2 animate-pulse">
        <div className="h-3 w-48 bg-zinc-800 rounded" />
        <div className="h-3 w-full bg-zinc-800 rounded" />
        <div className="h-3 w-3/4 bg-zinc-800 rounded" />
      </div>
    );
  }

  if (!data || (!data.insights.length && !data.matches.length)) return null;

  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
        What History Tells Us
      </p>

      {/* Insight sentences */}
      <div className="space-y-2 mb-4">
        {data.insights.map((insight, i) => (
          <p key={i} className="text-sm text-zinc-300 leading-relaxed">
            {insight}
          </p>
        ))}
      </div>

      {/* Matching races */}
      {data.matches.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-600 uppercase tracking-widest mb-1">
            Similar races
          </p>
          {data.matches.map((m, i) => (
            <Link
              key={i}
              href={`/races/${m.year}/${encodeURIComponent(m.track)}`}
              className="flex items-center gap-3 rounded bg-zinc-900/50 px-3 py-2 hover:bg-zinc-800/50 transition-colors"
            >
              <span className="text-xs font-mono text-zinc-600 w-8">{m.year}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-300 truncate">{m.track}</p>
                <p className="text-xs text-zinc-500">
                  Won by {m.winner_name}
                  {m.reasons.length > 0 && (
                    <span> — {m.reasons[0].toLowerCase()}</span>
                  )}
                </p>
              </div>
              <span className="text-zinc-700 text-xs">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
