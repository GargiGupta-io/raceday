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

const SENTIMENT_STYLE: Record<string, { icon: string; color: string; label: string }> = {
  celebration: { icon: "\u{1F389}", color: "text-green-400", label: "Celebration" },
  frustration: { icon: "\u{1F4E2}", color: "text-red-400", label: "Frustration" },
  strategy:    { icon: "\u{1F3AF}", color: "text-blue-400", label: "Strategy call" },
  tyre_deg:    { icon: "\u26A0",    color: "text-amber-400", label: "Tyre trouble" },
  neutral:     { icon: "\u{1F3A4}", color: "text-zinc-400", label: "Team radio" },
  unknown:     { icon: "\u{1F50A}", color: "text-zinc-400", label: "Team radio" },
};

function AudioPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const [playError, setPlayError] = useState(false);

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
    <div className="flex items-center gap-2 mt-2">
      <button
        onClick={toggle}
        className="w-7 h-7 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center transition-colors shrink-0"
        title={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <span className="text-white text-xs">| |</span>
        ) : (
          <span className="text-white text-xs ml-0.5">{"\u25B6"}</span>
        )}
      </button>
      <div className="flex-1 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
        <div
          className="h-full bg-zinc-400 rounded-full transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>
      <audio ref={audioRef} src={url} preload="none" />
      {playError && <span className="text-[9px] text-red-400 ml-1">Failed</span>}
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
            <div className="w-8 h-8 bg-zinc-800 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 bg-zinc-800 rounded" />
              <div className="h-3 w-full bg-zinc-800 rounded" />
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
      {data.clips.map((clip, i) => {
        const style = SENTIMENT_STYLE[clip.sentiment] || SENTIMENT_STYLE.unknown;
        const showIcon = clip.sentiment !== "unknown" && clip.sentiment !== "neutral";
        return (
          <div key={i} className="rounded-lg bg-zinc-900 p-4">
            <div className="flex gap-3 items-start">
              {/* Sentiment icon — only show when we have real sentiment */}
              {showIcon && (
                <span
                  className={`w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm shrink-0 ${style.color}`}
                >
                  {style.icon}
                </span>
              )}

              <div className="min-w-0 flex-1">
                {/* Driver name + lap */}
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: `#${clip.team_colour || "666666"}` }}
                  />
                  <span className="text-sm font-semibold text-zinc-100">
                    {clip.driver_name}
                  </span>
                  <span className="text-xs text-zinc-600">
                    {clip.driver_code}
                  </span>
                  {clip.lap && (
                    <span className="text-xs text-zinc-500 ml-auto">
                      Lap {clip.lap}
                    </span>
                  )}
                </div>

                {/* Transcript (if available) */}
                {clip.transcript && (
                  <p className="text-xs text-zinc-400 mt-1.5 italic leading-relaxed">
                    &ldquo;{clip.transcript}&rdquo;
                  </p>
                )}

                {/* Audio player */}
                {clip.recording_url && (
                  <AudioPlayer url={clip.recording_url} />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
