"use client";

import { useEffect, useRef, useState } from "react";

import { API } from "@/app/lib/api";

interface RadioClip {
  driver_code: string;
  driver_name: string;
  team: string;
  team_colour: string;
  lap: number | null;
  recording_url: string;
  transcript: string | null;
  score: number;
  sentiment: string;
  tags: string[];
}

interface RadioData {
  available: boolean;
  has_transcripts: boolean;
  total_clips: number;
  clips: RadioClip[];
  reason?: string;
}

const SENTIMENT_LABEL: Record<string, string> = {
  celebration: "Celebration",
  frustration: "Frustration",
  strategy: "Strategy call",
  tyre_deg: "Tyre trouble",
  neutral: "",
  unknown: "",
};

function RadioCard({ clip }: { clip: RadioClip }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playError, setPlayError] = useState(false);

  const teamColour = `#${clip.team_colour || "666666"}`;
  const sentimentLabel = SENTIMENT_LABEL[clip.sentiment] || "";

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setPlayError(false);
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play()
        .then(() => setPlaying(true))
        .catch(() => { setPlaying(false); setPlayError(true); });
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  return (
    <div
      className="rounded-lg bg-zinc-900 overflow-hidden border border-zinc-800/50 hover:border-zinc-700/50 transition-colors"
      style={{ borderLeftWidth: "3px", borderLeftColor: teamColour }}
    >
      <div className="p-4">
        <div className="flex gap-3 items-start">
          {/* Play button — replaces the old sentiment icon */}
          <button
            onClick={toggle}
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              backgroundColor: playing ? teamColour : "rgb(39 39 42)",
              color: playing ? "#fff" : teamColour,
            }}
            title={playing ? "Pause" : "Play radio clip"}
          >
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="2" y="1" width="3.5" height="12" rx="1" />
                <rect x="8.5" y="1" width="3.5" height="12" rx="1" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M3 1.5v11l9.5-5.5z" />
              </svg>
            )}
          </button>

          <div className="min-w-0 flex-1">
            {/* Driver name + code + lap */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-100">
                {clip.driver_name}
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                {clip.driver_code}
              </span>
              {sentimentLabel && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${teamColour}15`,
                    color: teamColour,
                  }}
                >
                  {sentimentLabel}
                </span>
              )}
              {clip.lap && (
                <span className="text-[10px] text-zinc-500 ml-auto tabular-nums">
                  Lap {clip.lap}
                </span>
              )}
            </div>

            {/* Progress bar — directly below driver name */}
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-150"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: playing ? teamColour : "rgb(113 113 122)",
                  }}
                />
              </div>
              {playError && (
                <span className="text-[9px] text-red-400 shrink-0">Audio unavailable</span>
              )}
            </div>

            {/* Transcript (if available) */}
            {clip.transcript && (
              <p className="text-xs text-zinc-400 mt-2 italic leading-relaxed">
                &ldquo;{clip.transcript}&rdquo;
              </p>
            )}
          </div>
        </div>
      </div>

      <audio ref={audioRef} src={clip.recording_url} preload="none" />
    </div>
  );
}

export default function RadioMoments({
  year,
  track,
}: {
  year: string;
  track: string;
}) {
  const [data, setData] = useState<RadioData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API}/races/${year}/${encodeURIComponent(track)}/radio`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [year, track]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-4 w-24 bg-zinc-800 rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg bg-zinc-900 p-4 flex gap-3">
            <div className="w-10 h-10 bg-zinc-800 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 bg-zinc-800 rounded" />
              <div className="h-1 w-full bg-zinc-800 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Don't render for pre-2023 or if no data
  if (!data || !data.available || data.clips.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
        Team Radio
      </p>
      {!data.has_transcripts && (
        <p className="text-[10px] text-zinc-600 -mt-1 mb-2">
          Audio only — transcripts unavailable for this session
        </p>
      )}
      {data.clips.map((clip, i) => (
        <RadioCard key={i} clip={clip} />
      ))}
    </div>
  );
}
