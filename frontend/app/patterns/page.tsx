"use client";

import { useState, useEffect } from "react";
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

interface PatternPreset {
  label: string;
  description: string;
  filters: Record<string, string>;
}

const PRESETS: PatternPreset[] = [
  {
    label: "Wet Race Chaos",
    description: "Rain-affected races where the winner did not start right at the front.",
    filters: { condition: "wet", minGrid: "5" },
  },
  {
    label: "Won From P10+",
    description: "Comebacks where the winner started tenth or lower.",
    filters: { minGrid: "10" },
  },
  {
    label: "High DNF Races",
    description: "Messy races with at least five retirements.",
    filters: { minDnf: "5" },
  },
  {
    label: "Safety Car Drama",
    description: "Current proxy: chaotic races with several retirements.",
    filters: { minDnf: "4" },
  },
  {
    label: "Pole Sitter Lost",
    description: "Races where the winner started behind pole.",
    filters: { minGrid: "2" },
  },
  {
    label: "Undercut-Friendly Circuits",
    description: "Current proxy: Monza races where strategy and track position often collide.",
    filters: { circuit: "Monza" },
  },
  {
    label: "Strategy Masterclass",
    description: "Current proxy: winners from outside the first two rows.",
    filters: { minGrid: "5" },
  },
  {
    label: "Underdog Podiums",
    description: "Current proxy: surprise wins from deep starting spots.",
    filters: { minGrid: "8" },
  },
];

function describeMatch(race: RaceResult, activePreset: string | null) {
  const details: string[] = [];

  if (activePreset) details.push(`Matched "${activePreset}"`);
  if (race.condition !== "dry") details.push(`${race.condition} conditions`);
  if (race.winner_grid >= 10) details.push(`winner started P${race.winner_grid}`);
  else if (race.winner_grid > 1) details.push(`winner started behind pole`);
  if (race.dnf_count >= 5) details.push(`${race.dnf_count} retirements`);
  else if (race.dnf_count >= 3) details.push(`${race.dnf_count} DNFs added chaos`);
  if (race.max_gain >= 5) details.push(`biggest gain was +${race.max_gain}`);

  return details.length > 0
    ? details.join(". ") + "."
    : "Matched the filters currently selected.";
}

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
  const [presetTrigger, setPresetTrigger] = useState(0);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  function applyPreset(preset: PatternPreset) {
    setCircuit(preset.filters.circuit || "");
    setCondition(preset.filters.condition || "");
    setWinner(preset.filters.winner || "");
    setTeam(preset.filters.team || "");
    setMinGrid(preset.filters.minGrid || "");
    setMinDnf(preset.filters.minDnf || "");
    setYearFrom("2010");
    setYearTo("2024");
    setActivePreset(preset.label);
    setPresetTrigger((n) => n + 1);
  }

  // Auto-search when a preset is applied (runs after state updates)
  useEffect(() => {
    if (presetTrigger > 0) handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetTrigger]);

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
    <div className="min-h-screen text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-32 sm:pt-40 pb-10 sm:pb-16">

        {/* Header */}
        <div className="mb-12">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">
            Pattern Finder
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            Search F1 History
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Find races that match specific conditions across 2010–2024. Combine
            any filters to build your query.
          </p>
        </div>

        {/* Preset patterns */}
        <div className="mb-12">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Start with a pattern</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                aria-label={`Apply preset: ${preset.label}`}
                onClick={() => applyPreset(preset)}
                className={`glass-card p-5 text-left transition-all duration-200 hover:border-red-500/30 hover:bg-red-500/[0.04] ${
                  activePreset === preset.label ? "border-red-500/40 bg-red-500/[0.06]" : ""
                }`}
              >
                <span className="block text-sm font-semibold text-white">{preset.label}</span>
                <span className="mt-2 block text-xs leading-relaxed text-zinc-400">{preset.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Popular patterns — interesting stats */}
        <div className="hidden">
          <p className="hidden">Did you know?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-2xl font-bold text-white">73%</p>
              <p className="text-xs text-zinc-400 mt-1">of wet races produce a non-favourite winner</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">P1.8</p>
              <p className="text-xs text-zinc-400 mt-1">average grid position of a Monaco GP winner</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">6</p>
              <p className="text-xs text-zinc-400 mt-1">drivers have won from P10 or lower since 2010</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">2.4s</p>
              <p className="text-xs text-zinc-400 mt-1">average winning margin in dry races at Monza</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">47%</p>
              <p className="text-xs text-zinc-400 mt-1">of races won by the pole sitter (2010–2024)</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">8.2</p>
              <p className="text-xs text-zinc-400 mt-1">average retirements per race at Singapore</p>
            </div>
          </div>
        </div>

        {/* Filter form — glass */}
        <div className="glass-card p-6 sm:p-8 mb-12">
          <div className="mb-6">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Build your own pattern</p>
            <p className="text-sm text-zinc-400">
              Use the filters when you want to make your own search instead of starting from a preset.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5 mb-6">
            {/* Circuit */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Circuit</label>
              <input
                type="text"
                value={circuit}
                onChange={(e) => {
                  setCircuit(e.target.value);
                  setActivePreset(null);
                }}
                placeholder="e.g. British, Monza"
                className="glass-input w-full px-3 py-2.5 text-sm"
              />
            </div>

            {/* Condition */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Weather</label>
              <select
                value={condition}
                onChange={(e) => {
                  setCondition(e.target.value);
                  setActivePreset(null);
                }}
                className="glass-input w-full px-3 py-2.5 text-sm"
              >
                <option value="" className="bg-zinc-900">Any</option>
                <option value="dry" className="bg-zinc-900">Dry</option>
                <option value="wet" className="bg-zinc-900">Wet</option>
                <option value="damp" className="bg-zinc-900">Mixed</option>
              </select>
            </div>

            {/* Winner */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Winner</label>
              <input
                type="text"
                value={winner}
                onChange={(e) => {
                  setWinner(e.target.value);
                  setActivePreset(null);
                }}
                placeholder="e.g. VER, Hamilton"
                className="glass-input w-full px-3 py-2.5 text-sm"
              />
            </div>

            {/* Team */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Team</label>
              <input
                type="text"
                value={team}
                onChange={(e) => {
                  setTeam(e.target.value);
                  setActivePreset(null);
                }}
                placeholder="e.g. Red Bull, Ferrari"
                className="glass-input w-full px-3 py-2.5 text-sm"
              />
            </div>

            {/* Min grid */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Winner started P...</label>
              <input
                type="number"
                value={minGrid}
                onChange={(e) => {
                  setMinGrid(e.target.value);
                  setActivePreset(null);
                }}
                placeholder="e.g. 5 (P5 or worse)"
                min={1}
                max={20}
                className="glass-input w-full px-3 py-2.5 text-sm"
              />
            </div>

            {/* Min DNFs */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Min retirements</label>
              <input
                type="number"
                value={minDnf}
                onChange={(e) => {
                  setMinDnf(e.target.value);
                  setActivePreset(null);
                }}
                placeholder="e.g. 5"
                min={0}
                max={20}
                className="glass-input w-full px-3 py-2.5 text-sm"
              />
            </div>

            {/* Year from */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">From year</label>
              <input
                type="number"
                value={yearFrom}
                onChange={(e) => {
                  setYearFrom(e.target.value);
                  setActivePreset(null);
                }}
                min={2010}
                max={2024}
                className="glass-input w-full px-3 py-2.5 text-sm"
              />
            </div>

            {/* Year to */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">To year</label>
              <input
                type="number"
                value={yearTo}
                onChange={(e) => {
                  setYearTo(e.target.value);
                  setActivePreset(null);
                }}
                min={2010}
                max={2024}
                className="glass-input w-full px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <button

            aria-label="Search for matching race patterns"
            onClick={handleSearch}
            disabled={loading}
            className="glass-button px-6 py-2.5 text-sm font-medium text-white border-red-500/30 hover:border-red-500/50 hover:shadow-lg hover:shadow-red-500/10 transition-all disabled:opacity-50"
          >
            {loading ? "Searching..." : "Find Races"}
          </button>
        </div>

        {/* Loading skeleton for results */}
        {loading && (
          <div className="space-y-3">
            <div className="h-4 w-24 glass-skeleton rounded mb-4" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="glass-card flex items-center gap-4 px-5 py-4">
                <div className="h-4 w-10 glass-skeleton rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 glass-skeleton rounded" />
                  <div className="h-3 w-36 glass-skeleton rounded" />
                </div>
                <div className="h-4 w-12 glass-skeleton rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && searched && results && (
          <div>
            <p className="text-sm text-zinc-400 mb-6">
              {results.count} {results.count === 1 ? "race" : "races"} found
            </p>

            {results.races.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-12">
                No races match those criteria. Try broadening your filters.
              </p>
            ) : (
              <div className="space-y-3">
                {results.races.map((race) => {
                  return (
                    <Link
                      key={`${race.year}-${race.track}`}
                      href={`/races/${race.year}/${encodeURIComponent(race.track)}`}
                      className="glass-card flex items-center gap-4 px-5 py-4 transition-all duration-200"
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
                        <span className={`glass-badge ${
                          race.condition === "wet" ? "text-blue-400" :
                          race.condition === "damp" ? "text-cyan-400" :
                          "text-amber-400"
                        }`}>
                          {race.condition.toUpperCase()}
                        </span>
                        {race.dnf_count >= 3 && (
                          <span className="glass-badge text-zinc-500">
                            {race.dnf_count} DNF
                          </span>
                        )}
                        {race.max_gain >= 5 && (
                          <span className="glass-badge text-emerald-400">
                            +{race.max_gain}
                          </span>
                        )}
                      </div>
                      <span className="text-zinc-600 text-xs">→</span>
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
