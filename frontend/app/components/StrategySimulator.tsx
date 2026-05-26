"use client";

import { useEffect, useState } from "react";

import { API } from "@/app/lib/api";
import ProgressiveDetail from "@/app/components/ProgressiveDetail";

interface ActualStint {
  compound: string;
  lap_start: number;
  lap_end: number;
  laps: number;
}

interface Driver {
  code: string;
  name: string;
  team: string;
  grid: number | null;
  finish: number | null;
  total_laps: number;
  status: string;
  actual_stops: number | null;
  actual_stints: ActualStint[];
}

interface SimContext {
  race: string;
  year: number;
  track: string;
  total_laps: number;
  drivers: Driver[];
  compounds_available: string[];
}

interface StintResult {
  stint: number;
  compound: string;
  lap_start: number;
  lap_end: number;
  laps: number;
  stint_time: number;
}

interface SimResult {
  driver: { code: string; name: string; team: string; actual_finish: number | null; total_laps: number };
  actual: { total_time: number; num_stops: number; stint_times: StintResult[] };
  alternate: { total_time: number; num_stops: number; stint_times: StintResult[] };
  delta_seconds: number;
  predicted_position: number | null;
  position_change: number | null;
  verdict: string;
  model_used: string;
}

interface SwapTeam {
  name: string;
  best_grid: number | null;
  gap: number;
  drivers: { code: string; name: string; grid: number | null; finish: number | null }[];
}

interface SwapContext {
  teams: SwapTeam[];
}

interface SwapResult {
  driver: { code: string; name: string; actual_team: string; actual_grid: number | null; actual_finish: number | null };
  target_team: string;
  target_drivers: { code: string; name: string; finish: number | null; grid: number | null }[];
  prediction: {
    predicted_grid: number | null;
    predicted_finish: number | null;
    position_change: number | null;
    total_advantage_seconds: number;
  };
  factors: {
    car_gap_per_lap: number;
    car_total_effect: number;
    tyre_saving_per_lap: number;
    tyre_total_effect: number;
    tyre_label: string;
    quali_delta_vs_teammate: number;
    teammate: string | null;
  };
  race_laps: number;
  verdict: string;
  model_used: string;
}

const COMPOUND_COLORS: Record<string, { bg: string; text: string; ring: string; border: string }> = {
  SOFT:         { bg: "bg-red-600",       text: "text-white",    ring: "ring-red-600",       border: "border-red-500" },
  MEDIUM:       { bg: "bg-red-950",       text: "text-red-100",  ring: "ring-red-900",       border: "border-red-800" },
  HARD:         { bg: "bg-white",         text: "text-black",    ring: "ring-white",         border: "border-white" },
  SUPERSOFT:    { bg: "bg-red-800",       text: "text-white",    ring: "ring-red-800",       border: "border-red-600" },
  INTERMEDIATE: { bg: "bg-zinc-700",      text: "text-white",    ring: "ring-zinc-500",      border: "border-zinc-500" },
  WET:          { bg: "bg-black",         text: "text-white",    ring: "ring-white",         border: "border-white/60" },
};

function formatCompound(compound: string) {
  return compound.charAt(0) + compound.slice(1).toLowerCase();
}

function formatDelta(seconds: number) {
  const abs = Math.abs(seconds).toFixed(1);
  if (seconds < -0.1) return `${abs}s faster`;
  if (seconds > 0.1) return `${abs}s slower`;
  return "about the same pace";
}

function likelyResult(result: SimResult) {
  if (result.position_change === null || result.position_change === 0) return "No position change";
  const gain = Math.abs(result.position_change);
  return result.position_change < 0
    ? `+${gain} position${gain === 1 ? "" : "s"}`
    : `-${gain} position${gain === 1 ? "" : "s"}`;
}

function resultTone(result: SimResult) {
  if (result.delta_seconds < -0.1) return "text-red-300";
  if (result.delta_seconds > 0.1) return "text-zinc-300";
  return "text-white";
}

function strategyWhy(result: SimResult) {
  if (result.verdict) return result.verdict;
  if (result.delta_seconds < -0.1) return "The alternate plan found cleaner tyre life or better track position than the real race plan.";
  if (result.delta_seconds > 0.1) return "The alternate plan gave away more time than it recovered, usually through pit loss or tyre wear.";
  return "The alternate plan lands close to what actually happened, so the race result probably stays similar.";
}

function pitSummary(stops: number, pitLaps: number[]) {
  if (stops === 0) return "No planned stops. This bets everything on track position and tyre survival.";
  return `${stops} stop${stops === 1 ? "" : "s"} planned: ${pitLaps.map((lap) => `L${lap}`).join(", ")}`;
}

function CompoundButton({
  compound,
  selected,
  onClick,
}: {
  compound: string;
  selected: boolean;
  onClick: () => void;
}) {
  const style = COMPOUND_COLORS[compound] || COMPOUND_COLORS.MEDIUM;
  return (
    <button
      onClick={onClick}
      className={`h-9 sm:h-8 px-3 rounded-md border text-xs font-bold transition-all ${style.bg} ${style.text} ${style.border} ${
        selected ? `ring-2 ${style.ring} ring-offset-2 ring-offset-zinc-900 scale-105` : "opacity-60 hover:opacity-90"
      }`}
    >
      {formatCompound(compound)}
    </button>
  );
}

function StintBar({
  stints,
  totalLaps,
  label,
}: {
  stints: { compound: string; lap_start: number; lap_end: number }[];
  totalLaps: number;
  label: string;
}) {
  return (
    <div>
      <p className="text-[10px] text-zinc-400 mb-1">{label}</p>
      <div className="flex h-6 rounded overflow-hidden min-w-0">
        {stints.map((s, i) => {
          const width = ((s.lap_end - s.lap_start + 1) / totalLaps) * 100;
          const style = COMPOUND_COLORS[s.compound.toUpperCase()] || COMPOUND_COLORS.MEDIUM;
          return (
            <div
              key={i}
              className={`${style.bg} flex items-center justify-center text-[9px] font-bold ${style.text} border-r border-zinc-900 last:border-0`}
              style={{ width: `${width}%` }}
              title={`${s.compound} laps ${s.lap_start}-${s.lap_end}`}
            >
              {width > 8 ? s.compound.charAt(0) : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function StrategySimulator({
  year,
  track,
}: {
  year: string;
  track: string;
}) {
  const [context, setContext] = useState<SimContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"strategy" | "swap">("strategy");

  // Strategy mode inputs
  const [selectedDriver, setSelectedDriver] = useState<string>("");
  const [numStops, setNumStops] = useState(1);
  const [pitLaps, setPitLaps] = useState<number[]>([]);
  const [compounds, setCompounds] = useState<string[]>([]);

  // Strategy result
  const [result, setResult] = useState<SimResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Swap mode state
  const [swapContext, setSwapContext] = useState<SwapContext | null>(null);
  const [swapDriver, setSwapDriver] = useState<string>("");
  const [targetTeam, setTargetTeam] = useState<string>("");
  const [swapResult, setSwapResult] = useState<SwapResult | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);

  // Fetch context
  useEffect(() => {
    let cancelled = false;
    const resetTimer = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      setResult(null);
      setExpanded(false);
    }, 0);

    fetch(`${API}/races/${year}/${encodeURIComponent(track)}/sim-context`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setContext(d);
        if (d && d.drivers.length > 0) {
          setSelectedDriver(d.drivers[0].code);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setContext(null);
        setLoading(false);
      });
    // Also fetch swap context
    fetch(`${API}/races/${year}/${encodeURIComponent(track)}/swap-context`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setSwapContext(d);
        if (d && d.teams.length > 0 && d.teams[0].drivers.length > 0) {
          setSwapDriver(d.teams[0].drivers[0].code);
          // Default target: second team
          if (d.teams.length > 1) setTargetTeam(d.teams[1].name);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      window.clearTimeout(resetTimer);
    };
  }, [year, track]);

  // Reset strategy when driver or stop count changes
  useEffect(() => {
    if (!context) return;
    const resetTimer = window.setTimeout(() => {
      const totalLaps = context.total_laps;
      const defaultCompound = context.compounds_available.includes("MEDIUM")
        ? "MEDIUM"
        : context.compounds_available[0] || "MEDIUM";

      const newPitLaps: number[] = [];
      for (let i = 1; i <= numStops; i++) {
        newPitLaps.push(Math.round((totalLaps * i) / (numStops + 1)));
      }
      setPitLaps(newPitLaps);

      const avail = context.compounds_available;
      const newCompounds: string[] = [];
      for (let i = 0; i <= numStops; i++) {
        newCompounds.push(avail[i % avail.length] || defaultCompound);
      }
      setCompounds(newCompounds);
      setResult(null);
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [selectedDriver, numStops, context]);

  // Run simulation
  const runSimulation = () => {
    if (!context || !selectedDriver) return;
    if (compounds.length !== numStops + 1) {
      setSimError("Compound count doesn't match stint count. Try changing pit stops.");
      return;
    }
    setSimulating(true);
    setResult(null);
    setSimError(null);

    fetch(`${API}/races/${year}/${encodeURIComponent(track)}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driver: selectedDriver,
        pit_stop_laps: [...pitLaps].sort((a, b) => a - b),
        compounds: compounds,
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Server error (${r.status})`);
        return r.json();
      })
      .then((d) => {
        setResult(d);
        setSimulating(false);
      })
      .catch((e) => {
        setSimError(e.message || "Simulation failed");
        setSimulating(false);
      });
  };

  // Run Driver Swap
  const runSwap = () => {
    if (!swapDriver || !targetTeam) return;
    setSwapping(true);
    setSwapResult(null);
    setSwapError(null);

    fetch(`${API}/races/${year}/${encodeURIComponent(track)}/simulate-swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driver: swapDriver, target_team: targetTeam }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Server error (${r.status})`);
        return r.json();
      })
      .then((d) => {
        if (d.error) {
          setSwapError(d.error);
        } else {
          setSwapResult(d);
        }
        setSwapping(false);
      })
      .catch((e) => {
        setSwapError(e.message || "Swap simulation failed");
        setSwapping(false);
      });
  };

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="h-5 w-48 glass-skeleton rounded mb-4" />
        <div className="h-3 w-64 glass-skeleton rounded" />
      </div>
    );
  }

  if (!context || context.drivers.length === 0) return null;

  const driver = context.drivers.find((d) => d.code === selectedDriver);
  const totalLaps = context.total_laps;

  // Collapsed prompt
  if (!expanded) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-xs text-zinc-400 uppercase tracking-widest mb-3">
          Strategy Simulator
        </p>
        <p className="text-sm text-zinc-400 mb-5">
          Choose a driver, move the pit windows, pick tyres, then see if your call beats the real strategy.
        </p>
        <button
          onClick={() => setExpanded(true)}
          className="glass-button px-6 py-2.5 text-sm font-medium text-white"
        >
          Open simulator
        </button>
      </div>
    );
  }

  // Build user's stint visualization
  const userStints: { compound: string; lap_start: number; lap_end: number }[] = [];
  const stintStarts = [1, ...pitLaps.map((l) => l + 1)];
  const stintEnds = [...pitLaps, totalLaps];
  for (let i = 0; i < compounds.length; i++) {
    if (i < stintStarts.length && i < stintEnds.length) {
      userStints.push({
        compound: compounds[i],
        lap_start: stintStarts[i],
        lap_end: stintEnds[i],
      });
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-400 uppercase tracking-widest">
        Strategy Simulator
      </p>
      <div className="glass-card p-5">
        <p className="text-sm font-semibold text-white">Build the call like a pit wall.</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
          Start with a simple race decision first. Pick the driver, set the pit laps, choose the tyre sequence, then run the model. The math stays hidden until you ask for it.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 rounded-xl glass p-1">
        {(["strategy", "swap"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setResult(null); setSwapResult(null); }}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all duration-200 ${
              mode === m
                ? "glass-button-active text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {m === "strategy" ? "Strategy" : "Driver Swap"}
          </button>
        ))}
      </div>

      {/* === SWAP MODE === */}
      {mode === "swap" && swapContext && (
        <div className="glass-card p-6 space-y-5">
          {/* Driver selector */}
          <div>
            <label className="text-[10px] text-zinc-400 uppercase mb-1.5 block">Put this driver</label>
            <select
              value={swapDriver}
              onChange={(e) => { setSwapDriver(e.target.value); setSwapResult(null); }}
              className="glass-input w-full px-3 py-2.5 text-sm"
            >
              {context?.drivers.map((d) => (
                <option key={d.code} value={d.code} className="bg-zinc-900 text-zinc-200">
                  {d.name} ({d.code}) — {d.team}
                </option>
              ))}
            </select>
          </div>

          {/* Target team selector */}
          <div>
            <label className="text-[10px] text-zinc-400 uppercase mb-1.5 block">In this car</label>
            <select
              value={targetTeam}
              onChange={(e) => { setTargetTeam(e.target.value); setSwapResult(null); }}
              className="glass-input w-full px-3 py-2.5 text-sm"
            >
              {swapContext.teams.map((t) => (
                <option key={t.name} value={t.name} className="bg-zinc-900 text-zinc-200">
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Current team drivers preview */}
          {targetTeam && (() => {
            const team = swapContext.teams.find((t) => t.name === targetTeam);
            if (!team) return null;
            return (
              <div className="text-[10px] text-zinc-400">
                Currently driven by:{" "}
                {team.drivers.map((d) => `${d.code} (P${d.finish ?? "DNF"})`).join(", ")}
              </div>
            );
          })()}

          {/* Swap button */}
          {(() => {
            const driverTeam = context?.drivers.find((d) => d.code === swapDriver)?.team;
            const sameTeam = driverTeam === targetTeam;
            return (
              <button
                onClick={runSwap}
                disabled={swapping || !swapDriver || !targetTeam || sameTeam}
                className={`w-full rounded-lg py-2.5 text-sm font-medium transition-all duration-200 ${
                  swapping
                    ? "glass text-zinc-600 cursor-wait"
                    : sameTeam
                    ? "glass text-zinc-600 cursor-not-allowed"
                    : "glass-button text-white hover:bg-white/[0.18]"
                }`}
              >
                {swapping ? "Predicting..." : sameTeam ? "Driver is already in this team" : "Swap Driver"}
              </button>
            );
          })()}

          {/* Swap result */}
          {swapResult && (
            <div className="glass p-5 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-400">
                    {swapResult.driver.name} in the {swapResult.target_team}
                  </p>
                  <p className={`text-2xl font-bold ${
                    (swapResult.prediction.position_change ?? 0) > 0
                      ? "text-red-300"
                      : (swapResult.prediction.position_change ?? 0) < 0
                      ? "text-red-400"
                      : "text-zinc-300"
                  }`}>
                    {swapResult.prediction.total_advantage_seconds > 0 ? "+" : ""}
                    {swapResult.prediction.total_advantage_seconds.toFixed(1)}s
                  </p>
                </div>
                {swapResult.prediction.predicted_finish !== null && swapResult.driver.actual_finish !== null && (
                  <div className="text-right">
                    <p className="text-sm text-zinc-300">
                      P{swapResult.driver.actual_finish}
                      <span className="text-zinc-400 mx-1.5">&rarr;</span>
                      <span className={
                        (swapResult.prediction.position_change ?? 0) > 0
                          ? "text-red-300 font-bold"
                          : (swapResult.prediction.position_change ?? 0) < 0
                          ? "text-red-400 font-bold"
                          : "text-zinc-300"
                      }>
                        P{swapResult.prediction.predicted_finish}
                      </span>
                    </p>
                    <p className="text-[10px] text-zinc-400">{swapResult.model_used}</p>
                  </div>
                )}
              </div>

              {/* Factor breakdown */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-lg glass p-3">
                  <p className="text-zinc-400">Car gap</p>
                  <p className="text-zinc-300 font-medium">
                    {swapResult.factors.car_gap_per_lap > 0 ? "+" : ""}
                    {swapResult.factors.car_gap_per_lap.toFixed(2)}s/lap
                  </p>
                </div>
                <div className="rounded-lg glass p-3">
                  <p className="text-zinc-400">Tyre management</p>
                  <p className="text-zinc-300 font-medium">{swapResult.factors.tyre_label}</p>
                </div>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">
                {swapResult.verdict}
              </p>

              {/* Model disclaimer */}
              <p className="text-[9px] text-zinc-400 border-t border-white/[0.06] pt-2 mt-2">
                {swapResult.model_used === "grid-estimate"
                  ? "Pre-2018 estimate — based on grid positions only (no lap timing data available)."
                  : "Estimate based on lap timing data, qualifying gaps, and tyre degradation patterns. Actual results would vary."}
              </p>
            </div>
          )}

          {swapError && (
            <p className="text-xs text-red-400 text-center">{swapError}</p>
          )}
        </div>
      )}

      {/* Swap mode unavailable */}
      {mode === "swap" && !swapContext && (
        <div className="glass-card p-6 text-center">
          <p className="text-xs text-zinc-400">Driver Swap data unavailable for this race.</p>
        </div>
      )}

      {/* === STRATEGY MODE === */}
      {mode === "strategy" && (
      <div className="glass-card p-6 space-y-5">
        {/* Row 1: Driver + Stops */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="text-[10px] text-zinc-400 uppercase mb-1.5 block">1. Choose driver</label>
            <select
              value={selectedDriver}
              onChange={(e) => {
                setSelectedDriver(e.target.value);
                setResult(null);
              }}
              className="glass-input w-full px-3 py-2.5 text-sm"
            >
              {context.drivers.map((d) => (
                <option key={d.code} value={d.code} className="bg-zinc-900 text-zinc-200">
                  {d.name} ({d.code}) — P{d.finish ?? "DNF"}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-32">
            <label className="text-[10px] text-zinc-400 uppercase mb-1.5 block">2. Pit stops</label>
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setNumStops(n);
                  }}
                  className={`flex-1 rounded-lg py-2.5 sm:py-2 text-xs font-medium transition-all duration-200 ${
                    numStops === n
                      ? "glass-button-active text-white"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Pit lap inputs */}
        {numStops > 0 && (
          <div>
            <label className="text-[10px] text-zinc-400 uppercase mb-2 block">
              Choose pit lap(s)
            </label>
            <div className="flex gap-3 flex-wrap">
              {pitLaps.map((lap, i) => (
                <div key={i} className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-[10px] text-zinc-400 shrink-0">Stop {i + 1}:</span>
                  <input
                    type="range"
                    min={i === 0 ? 2 : pitLaps[i - 1] + 2}
                    max={i === numStops - 1 ? totalLaps - 2 : (pitLaps[i + 1] || totalLaps) - 2}
                    value={lap}
                    onChange={(e) => {
                      const newLaps = [...pitLaps];
                      newLaps[i] = parseInt(e.target.value);
                      setPitLaps(newLaps);
                      setResult(null);
                    }}
                    className="flex-1 sm:w-24 sm:flex-none accent-red-600 h-6"
                  />
                  <span className="text-xs text-zinc-300 w-8 text-right shrink-0">{lap}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Row 3: Compound selectors per stint */}
        <div>
          <label className="text-[10px] text-zinc-400 uppercase mb-2 block">
            3. Choose tyres
          </label>
          <div className="flex gap-3 flex-wrap">
            {compounds.map((comp, i) => (
              <div key={i} className="space-y-1">
                <p className="text-[9px] text-zinc-400 text-center">
                  Stint {i + 1}
                  {userStints[i] && (
                    <span className="text-zinc-500">
                      {" "}(L{userStints[i].lap_start}-{userStints[i].lap_end})
                    </span>
                  )}
                </p>
                <div className="flex gap-1 flex-wrap">
                  {["SUPERSOFT", "SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"].map((c) => (
                    <CompoundButton
                      key={c}
                      compound={c}
                      selected={comp === c}
                      onClick={() => {
                        const newCompounds = [...compounds];
                        newCompounds[i] = c;
                        setCompounds(newCompounds);
                        setResult(null);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stint bars: actual vs user */}
        {driver && driver.actual_stints.length > 0 && (
          <div className="space-y-2 pt-3 border-t border-white/[0.06]">
            <p className="text-[10px] text-zinc-400 uppercase tracking-widest">Actual vs simulated strategy</p>
            <StintBar
              stints={driver.actual_stints}
              totalLaps={totalLaps}
              label={`Actual strategy: ${driver.actual_stops}-stop`}
            />
            <StintBar
              stints={userStints}
              totalLaps={totalLaps}
              label={`Your strategy: ${numStops}-stop`}
            />
          </div>
        )}

        <div className="rounded-md border border-white/[0.08] bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-widest text-zinc-400">Pit stop summary</p>
          <p className="mt-2 text-sm text-zinc-300">{pitSummary(numStops, pitLaps)}</p>
        </div>

        {/* Simulate button */}
        <button
          onClick={runSimulation}
          disabled={simulating}
          className={`w-full rounded-lg py-2.5 text-sm font-medium transition-all duration-200 ${
            simulating
              ? "glass text-zinc-600 cursor-wait"
              : "glass-button text-white hover:bg-white/[0.18]"
          }`}
        >
          {simulating ? "Running simulation..." : "Run simulation"}
        </button>

        {/* Result */}
        {result && !("error" in result) && (
          <div className="glass p-5 rounded-xl space-y-4 border border-red-500/20">
            <div>
              <p className="text-[10px] text-red-400 uppercase tracking-widest mb-2">Simulation result</p>
              <p className={`text-2xl font-bold ${resultTone(result)}`}>
                Your strategy: {formatDelta(result.delta_seconds)}
              </p>
              <p className="mt-1 text-sm text-zinc-300">
                Likely result: {likelyResult(result)}
                {result.predicted_position !== null ? `, P${result.predicted_position}` : ""}
              </p>
            </div>

            <div className="rounded-md border border-white/[0.08] bg-black/30 p-4">
              <p className="text-[10px] uppercase tracking-widest text-zinc-400">Why</p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-300">
                {strategyWhy(result)}
              </p>
            </div>

            {result.predicted_position !== null && result.driver.actual_finish !== null && (
              <div className="flex items-center justify-between rounded-md border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <span className="text-xs text-zinc-400">Actual finish</span>
                <span className="text-sm text-zinc-300">
                  P{result.driver.actual_finish}
                  <span className="mx-2 text-zinc-400">to</span>
                  <span className="font-semibold text-white">P{result.predicted_position}</span>
                </span>
              </div>
            )}

            <ProgressiveDetail label="Why this result?">
              <div className="grid gap-2 text-xs text-zinc-300">
                <p className="flex justify-between gap-4 rounded-md bg-white/[0.03] px-3 py-2">
                  <span className="text-zinc-400">Pit loss used</span>
                  <span>Estimated from race pace</span>
                </p>
                <p className="flex justify-between gap-4 rounded-md bg-white/[0.03] px-3 py-2">
                  <span className="text-zinc-400">Compound delta</span>
                  <span>{compounds.map(formatCompound).join(" / ")}</span>
                </p>
                <p className="flex justify-between gap-4 rounded-md bg-white/[0.03] px-3 py-2">
                  <span className="text-zinc-400">Degradation rate</span>
                  <span>Fitted from stint timing</span>
                </p>
                <p className="flex justify-between gap-4 rounded-md bg-white/[0.03] px-3 py-2">
                  <span className="text-zinc-400">Weather mismatch</span>
                  <span>false</span>
                </p>
                <p className="flex justify-between gap-4 rounded-md bg-white/[0.03] px-3 py-2">
                  <span className="text-zinc-400">Model</span>
                  <span>{result.model_used === "data-driven" ? "data-driven regression" : "physics estimate"}</span>
                </p>
              </div>
            </ProgressiveDetail>
          </div>
        )}

        {result && "error" in result && (
          <p className="text-xs text-red-400 text-center">{String((result as Record<string, unknown>).error)}</p>
        )}

        {simError && !result && (
          <p className="text-xs text-red-400 text-center">{simError}</p>
        )}
      </div>
      )}
    </div>
  );
}
