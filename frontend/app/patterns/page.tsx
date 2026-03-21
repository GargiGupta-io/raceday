"use client";

import { useState } from "react";
import Link from "next/link";

import { API } from "@/app/lib/api";

interface RaceResult {
  year: number;
  track: string;
  winner: string;
  winner_name: string;
  winner_team: string;
  winner_grid: number;
  condition: string;
  dnf_count: number;
  max_gain: number;
}

interface SearchResponse {
  count: number;
  races: RaceResult[];
}

const CONDITION_BADGE: Record<string, { bg: string; text: string }> = {
  dry: { bg: "bg-amber-900/60", text: "text-amber-400" },
  wet: { bg: "bg-blue-900/60", text: "text-blue-400" },
  damp: { bg: "bg-cyan-900/60", text: "text-cyan-400" },
};

export default function PatternFinderPage() {
  const [circuit, setCircuit] = useState("");
  const [condition, setCondition] = useState("");
  const [winner, setWinner] = useState("");
  const [team, setTeam] = useState("");
  const [minGrid, setMinGrid] = useState("");
  const [minDnf, setMinDnf] = useState("");
  const [yearFrom, setYearFrom] = useState("2010");
  const [yearTo, setYearTo] = useState("2024");

  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  function handleSearch() {
    setLoading(true);
    setSearched(true);

    const filters: Record<string, unknown> = {};
    if (circuit) filters.circuit = circuit;
    if (condition) filters.condition = condition;
    if (winner) filters.winner = winner;
    if (team) filters.team = team;
    if (minGrid) filters.min_grid = parseInt(minGrid);
    if (minDnf) filters.max_dnf = parseInt(minDnf);
    filters.year_from = parseInt(yearFrom);
    filters.year_to = parseInt(yearTo);

    fetch(`${API}/patterns/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filters),
    })
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data) => {
        setResults(data);
        setLoading(false);
      })
      .catch(() => {
        setResults(null);
        setLoading(false);
      });
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-12">

        {/* Header */}
        <div className="mb-8">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">
            Pattern Finder
          </p>
          <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "var(--font-racing)" }}>
            Search F1 History
          </h1>
          <p className="text-sm text-zinc-400">
            Find races that match specific conditions across 2010–2024. Combine
            any filters to build your query.
          </p>
        </div>

        {/* Filter form */}
        <div className="rounded-lg bg-zinc-900 p-5 mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {/* Circuit */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Circuit</label>
              <input
                type="text"
                value={circuit}
                onChange={(e) => setCircuit(e.target.value)}
                placeholder="e.g. British, Monza"
                className="w-full bg-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
            </div>

            {/* Condition */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Weather</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full bg-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              >
                <option value="">Any</option>
                <option value="dry">Dry</option>
                <option value="wet">Wet</option>
                <option value="damp">Mixed</option>
              </select>
            </div>

            {/* Winner */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Winner</label>
              <input
                type="text"
                value={winner}
                onChange={(e) => setWinner(e.target.value)}
                placeholder="e.g. VER, Hamilton"
                className="w-full bg-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
            </div>

            {/* Team */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Team</label>
              <input
                type="text"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder="e.g. Red Bull, Ferrari"
                className="w-full bg-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
            </div>

            {/* Min grid */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Winner started P...</label>
              <input
                type="number"
                value={minGrid}
                onChange={(e) => setMinGrid(e.target.value)}
                placeholder="e.g. 5 (P5 or worse)"
                min={1}
                max={20}
                className="w-full bg-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
            </div>

            {/* Min DNFs */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Min retirements</label>
              <input
                type="number"
                value={minDnf}
                onChange={(e) => setMinDnf(e.target.value)}
                placeholder="e.g. 5"
                min={0}
                max={20}
                className="w-full bg-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
            </div>

            {/* Year from */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">From year</label>
              <input
                type="number"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                min={2010}
                max={2024}
                className="w-full bg-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
            </div>

            {/* Year to */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">To year</label>
              <input
                type="number"
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                min={2010}
                max={2024}
                className="w-full bg-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-5 py-2 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-500 transition-colors disabled:opacity-50"
          >
            {loading ? "Searching..." : "Find Races"}
          </button>
        </div>

        {/* Loading skeleton for results */}
        {loading && (
          <div className="space-y-2 animate-pulse">
            <div className="h-4 w-24 bg-zinc-800 rounded mb-4" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 rounded-lg bg-zinc-900 px-4 py-3">
                <div className="h-4 w-10 bg-zinc-800 rounded" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-48 bg-zinc-800 rounded" />
                  <div className="h-3 w-36 bg-zinc-800 rounded" />
                </div>
                <div className="h-4 w-12 bg-zinc-800 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && searched && results && (
          <div>
            <p className="text-sm text-zinc-400 mb-4">
              {results.count} {results.count === 1 ? "race" : "races"} found
            </p>

            {results.races.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-8">
                No races match those criteria. Try broadening your filters.
              </p>
            ) : (
              <div className="space-y-2">
                {results.races.map((race) => {
                  const badge = CONDITION_BADGE[race.condition];
                  return (
                    <Link
                      key={`${race.year}-${race.track}`}
                      href={`/races/${race.year}/${encodeURIComponent(race.track)}`}
                      className="flex items-center gap-4 rounded-lg bg-zinc-900 border border-zinc-800/40 px-4 py-3 hover:bg-zinc-800/80 hover:border-zinc-700/50 transition-all duration-150"
                    >
                      <span className="text-sm font-mono text-zinc-500 w-10">
                        {race.year}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">
                          {race.track}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {race.winner_name} ({race.winner_team}) from P{race.winner_grid}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {badge && (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                            {race.condition.toUpperCase()}
                          </span>
                        )}
                        {race.dnf_count >= 3 && (
                          <span className="text-[10px] text-zinc-500 border border-zinc-800 rounded px-1.5 py-0.5">
                            {race.dnf_count} DNF
                          </span>
                        )}
                        {race.max_gain >= 5 && (
                          <span className="text-[10px] text-emerald-500 border border-emerald-900/50 rounded px-1.5 py-0.5">
                            +{race.max_gain}
                          </span>
                        )}
                      </div>
                      <span className="text-zinc-700 text-xs">→</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
