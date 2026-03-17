"use client";

import { useEffect, useState } from "react";

const API = "http://localhost:8888";

interface Moment {
  type: string;
  headline: string;
  detail: string;
  driver: string | null;
}

const MOMENT_STYLE: Record<string, { icon: string; color: string }> = {
  biggest_gainer:  { icon: "\u2191", color: "text-green-400" },   // ↑
  biggest_loser:   { icon: "\u2193", color: "text-red-400" },     // ↓
  comeback:        { icon: "\u21c8", color: "text-emerald-400" }, // ⇈
  dominant_win:    { icon: "\u2605", color: "text-yellow-400" },  // ★
  undercut:        { icon: "\u2694", color: "text-orange-400" },  // ⚔
  close_battle:    { icon: "\u2623", color: "text-blue-400" },    // ☣ → using ⚡ visually
  attrition:       { icon: "\u26a0", color: "text-amber-400" },   // ⚠
};

// Highlight "Full Name (CODE)" patterns
const DRIVER_NAME_PATTERN = /([A-Z][a-z]+(?: [A-Z][a-z]+)*) \(([A-Z]{3})\)/g;

function highlightDrivers(text: string): string {
  if (!text) return "";
  return text.replace(
    DRIVER_NAME_PATTERN,
    '<span class="font-semibold text-white">$1</span> <span class="text-zinc-500">($2)</span>'
  );
}

export default function KeyMoments({
  year,
  track,
}: {
  year: string;
  track: string;
}) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/races/${year}/${encodeURIComponent(track)}/moments`)
      .then((r) => {
        if (!r.ok) return [];
        return r.json();
      })
      .then((data) => {
        setMoments(data || []);
        setLoading(false);
      })
      .catch(() => {
        setMoments([]);
        setLoading(false);
      });
  }, [year, track]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg bg-zinc-900 p-4 flex gap-3">
            <div className="w-8 h-8 bg-zinc-800 rounded shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 bg-zinc-800 rounded" />
              <div className="h-3 w-full bg-zinc-800 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (moments.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
        Key Moments
      </p>
      {moments.map((m, i) => {
        const style = MOMENT_STYLE[m.type] || { icon: "?", color: "text-zinc-400" };
        return (
          <div key={i} className="rounded-lg bg-zinc-900 p-4 flex gap-3 items-start">
            <span
              className={`w-8 h-8 rounded bg-zinc-800 flex items-center justify-center text-base shrink-0 ${style.color}`}
            >
              {style.icon}
            </span>
            <div className="min-w-0">
              <p
                className="text-sm font-semibold text-zinc-100"
                dangerouslySetInnerHTML={{ __html: highlightDrivers(m.headline) }}
              />
              <p
                className="text-xs text-zinc-500 mt-1 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: highlightDrivers(m.detail) }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
