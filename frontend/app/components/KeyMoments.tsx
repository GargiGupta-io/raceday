"use client";

import { useEffect, useState } from "react";

import { API, fetchWithTimeout } from "@/app/lib/api";
import HighlightedText from "@/app/lib/HighlightedText";
import ProgressiveDetail from "@/app/components/ProgressiveDetail";

interface Moment {
  type: string;
  headline: string;
  detail: string;
  driver: string | null;
}

const MOMENT_STYLE: Record<string, { icon: string; color: string }> = {
  biggest_gainer: { icon: "+", color: "text-white" },
  biggest_loser: { icon: "-", color: "text-red-400" },
  comeback: { icon: "+", color: "text-white" },
  dominant_win: { icon: "*", color: "text-white" },
  undercut: { icon: "/", color: "text-red-400" },
  close_battle: { icon: "!", color: "text-red-400" },
  attrition: { icon: "!", color: "text-red-400" },
};

export default function KeyMoments({
  year,
  track,
  limit,
  showHeader = true,
}: {
  year: string;
  track: string;
  limit?: number;
  showHeader?: boolean;
}) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithTimeout<Moment[]>(`${API}/races/${year}/${encodeURIComponent(track)}/moments`)
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

  const visibleMoments = limit ? moments.slice(0, limit) : moments;

  return (
    <div>
      {showHeader && (
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-5">
          Key Moments
        </p>
      )}
      <div className="space-y-4">
        {visibleMoments.map((moment, index) => {
          const style = MOMENT_STYLE[moment.type] || { icon: "!", color: "text-red-400" };
          return (
            <div key={index} className="glass-card p-5 flex gap-4 items-start">
              <span
                className={`w-10 h-10 rounded-full glass flex items-center justify-center text-lg shrink-0 ${style.color}`}
              >
                {style.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-100">
                  <HighlightedText text={moment.headline} />
                </p>
                <div className="mt-2">
                  <ProgressiveDetail label="Why this mattered">
                    <HighlightedText text={moment.detail} />
                  </ProgressiveDetail>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
