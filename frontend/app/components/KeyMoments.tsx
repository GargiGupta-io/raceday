"use client";

import { useEffect, useState } from "react";

import { API } from "@/app/lib/api";
import HighlightedText from "@/app/lib/HighlightedText";

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
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card p-5 flex gap-4">
            <div className="w-10 h-10 glass-skeleton rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 glass-skeleton rounded" />
              <div className="h-3 w-full glass-skeleton rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (moments.length === 0) return null;

  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-5">
        Key Moments
      </p>
      <div className="space-y-4">
        {moments.map((m, i) => {
          const style = MOMENT_STYLE[m.type] || { icon: "?", color: "text-zinc-400" };
          return (
            <div key={i} className="glass-card p-5 flex gap-4 items-start">
              <span
                className={`w-10 h-10 rounded-full glass flex items-center justify-center text-lg shrink-0 ${style.color}`}
              >
                {style.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-100">
                  <HighlightedText text={m.headline} />
                </p>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                  <HighlightedText text={m.detail} />
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
