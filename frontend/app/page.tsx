"use client";

import { useEffect, useState } from "react";
import IntroHero from "@/app/components/IntroHero";

import { API, fetchWithTimeout } from "@/app/lib/api";

interface SeasonSummary {
  year: number;
  champion: string;
  team: string;
  wins: number;
  races: number;
  tagline: string;
}

export default function HomePage() {
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);

  useEffect(() => {
    fetchWithTimeout<SeasonSummary[]>(`${API}/seasons/summary`)
      .then(setSeasons)
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen text-zinc-100">
      <IntroHero
        seasons={seasons}
      />
    </div>
  );
}
