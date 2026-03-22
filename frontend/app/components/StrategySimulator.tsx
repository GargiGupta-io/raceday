"use client";

import { useEffect, useState } from "react";

import { API } from "@/app/lib/api";

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

const COMPOUND_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  SOFT:         { bg: "bg-red-600",    text: "text-white",    ring: "ring-red-600" },
  MEDIUM:       { bg: "bg-yellow-400", text: "text-black",    ring: "ring-yellow-400" },
  HARD:         { bg: "bg-zinc-100",   text: "text-black",    ring: "ring-zinc-100" },
  SUPERSOFT:    { bg: "bg-red-400",    text: "text-white",    ring: "ring-red-400" },
  INTERMEDIATE: { bg: "bg-green-500",  text: "text-white",    ring: "ring-green-500" },
  WET:          { bg: "bg-blue-500",   text: "text-white",    ring: "ring-blue-500" },
};

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
      className={`h-9 sm:h-8 px-3 rounded-md text-xs font-bold transition-all ${style.bg} ${style.text} ${
        selected ? `ring-2 ${style.ring} ring-offset-2 ring-offset-zinc-900 scale-105` : "opacity-60 hover:opacity-90"
      }`}
    >
      {compound.charAt(0) + compound.slice(1).toLowerCase()}
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
      <p className="text-[10px] text-zinc-600 mb-1">{label}</p>
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
    setLoading(true);
    setResult(null);
    setExpanded(false);
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

    return () => { cancelled = true; };
  }, [year, track]);

  // Reset strategy when driver or stop count changes
  useEffect(() => {
    if (!context) return;
    const totalLaps = context.total_laps;
    const defaultCompound = context.compounds_available.includes("MEDIUM")
      ? "MEDIUM"
      : context.compounds_available[0] || "MEDIUM";

    // Generate default evenly-spaced pit laps
    const newPitLaps: number[] = [];
    for (let i = 1; i <= numStops; i++) {
      newPitLaps.push(Math.round((totalLaps * i) / (numStops + 1)));
    }
    setPitLaps(newPitLaps);

    // Default compounds: alternate between available
    const avail = context.compounds_available;
    const newCompounds: string[] = [];
    for (let i = 0; i <= numStops; i++) {
      newCompounds.push(avail[i % avail.length] || defaultCompound);
    }
    setCompounds(newCompounds);
    setResult(null);
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
      <div className="rounded-lg bg-zinc-900 p-6 animate-pulse">
        <div className="h-5 w-48 bg-zinc-800 rounded mb-4" />
        <div className="h-3 w-64 bg-zinc-800 rounded" />
      </div>
    );
  }

  if (!context || context.drivers.length === 0) return null;

  const driver = context.drivers.find((d) => d.code === selectedDriver);
  const totalLaps = context.total_laps;

  // Collapsed prompt
  if (!expanded) {
    return (
      <div className="rounded-lg bg-zinc-900 border border-zinc-800/50 p-6 text-center hover:border-zinc-700/50 transition-colors">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">
          Strategy Simulator
        </p>
        <p className="text-sm text-zinc-300 mb-4">
          Test alternate strategies or swap drivers into different cars.
        </p>
        <button
          onClick={() => setExpanded(true)}
          className="rounded-md bg-zinc-700 hover:bg-zinc-600 px-5 py-2 text-sm font-medium text-white transition-colors"
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
      <p className="text-xs text-zinc-500 uppercase tracking-widest">
        Strategy Simulator
      </p>

      {/* Mode toggle */}
      <div className="flex gap-1 rounded-lg bg-zinc-800 p-1">
        {(["strategy", "swap"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setResult(null); setSwapResult(null); }}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              mode === m
                ? "bg-zinc-700 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {m === "strategy" ? "Strategy" : "Driver Swap"}
          </button>
        ))}
      </div>

      {/* === SWAP MODE === */}
      {mode === "swap" && swapContext && (
        <div className="rounded-lg bg-zinc-900 p-5 space-y-5">
          {/* Driver selector */}
          <div>
            <label className="text-[10px] text-zinc-600 uppercase mb-1 block">Put this driver</label>
            <select
              value={swapDriver}
              onChange={(e) => { setSwapDriver(e.target.value); setSwapResult(null); }}
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            >
              {context?.drivers.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name} ({d.code}) — {d.team}
                </option>
              ))}
            </select>
          </div>

          {/* Target team selector */}
          <div>
            <label className="text-[10px] text-zinc-600 uppercase mb-1 block">In this car</label>
            <select
              value={targetTeam}
              onChange={(e) => { setTargetTeam(e.target.value); setSwapResult(null); }}
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            >
              {swapContext.teams.map((t) => (
                <option key={t.name} value={t.name}>
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
              <div className="text-[10px] text-zinc-600">
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
                className={`w-full rounded-md py-2.5 text-sm font-medium transition-colors ${
                  swapping
                    ? "bg-zinc-800 text-zinc-600 cursor-wait"
                    : sameTeam
                    ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                    : "bg-white text-black hover:bg-zinc-200"
                }`}
              >
                {swapping ? "Predicting..." : sameTeam ? "Driver is already in this team" : "Swap Driver"}
              </button>
            );
          })()}

          {/* Swap result */}
          {swapResult && (
            <div className="rounded-md bg-zinc-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">
                    {swapResult.driver.name} in the {swapResult.target_team}
                  </p>
                  <p className={`text-2xl font-bold ${
                    (swapResult.prediction.position_change ?? 0) > 0
                      ? "text-green-400"
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
                      <span className="text-zinc-600 mx-1.5">&rarr;</span>
                      <span className={
                        (swapResult.prediction.position_change ?? 0) > 0
                          ? "text-green-400 font-bold"
                          : (swapResult.prediction.position_change ?? 0) < 0
                          ? "text-red-400 font-bold"
                          : "text-zinc-300"
                      }>
                        P{swapResult.prediction.predicted_finish}
                      </span>
                    </p>
                    <p className="text-[10px] text-zinc-600">{swapResult.model_used}</p>
                  </div>
                )}
              </div>

              {/* Factor breakdown */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded bg-zinc-900 p-2">
                  <p className="text-zinc-600">Car gap</p>
                  <p className="text-zinc-300 font-medium">
                    {swapResult.factors.car_gap_per_lap > 0 ? "+" : ""}
                    {swapResult.factors.car_gap_per_lap.toFixed(2)}s/lap
                  </p>
                </div>
                <div className="rounded bg-zinc-900 p-2">
                  <p className="text-zinc-600">Tyre management</p>
                  <p className="text-zinc-300 font-medium">{swapResult.factors.tyre_label}</p>
                </div>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">
                {swapResult.verdict}
              </p>

              {/* Model disclaimer */}
              <p className="text-[9px] text-zinc-600 border-t border-zinc-700 pt-2 mt-2">
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
        <div className="rounded-lg bg-zinc-900 p-5 text-center">
          <p className="text-xs text-zinc-500">Driver Swap data unavailable for this race.</p>
        </div>
      )}

      {/* === STRATEGY MODE === */}
      {mode === "strategy" && (
      <div className="rounded-lg bg-zinc-900 p-5 space-y-5">
        {/* Row 1: Driver + Stops */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="text-[10px] text-zinc-600 uppercase mb-1 block">Driver</label>
            <select
              value={selectedDriver}
              onChange={(e) => setSelectedDriver(e.target.value)}
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            >
              {context.drivers.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name} ({d.code}) — P{d.finish ?? "DNF"}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-32">
            <label className="text-[10px] text-zinc-600 uppercase mb-1 block">Pit stops</label>
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setNumStops(n)}
                  className={`flex-1 rounded py-2.5 sm:py-2 text-xs font-medium transition-colors ${
                    numStops === n
                      ? "bg-zinc-600 text-white"
                      : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
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
            <label className="text-[10px] text-zinc-600 uppercase mb-2 block">
              Pit on lap
            </label>
            <div className="flex gap-3 flex-wrap">
              {pitLaps.map((lap, i) => (
                <div key={i} className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-[10px] text-zinc-600 shrink-0">Stop {i + 1}:</span>
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
                    className="flex-1 sm:w-24 sm:flex-none accent-zinc-500 h-6"
                  />
                  <span className="text-xs text-zinc-300 w-8 text-right shrink-0">{lap}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Row 3: Compound selectors per stint */}
        <div>
          <label className="text-[10px] text-zinc-600 uppercase mb-2 block">
            Tyre for each stint
          </label>
          <div className="flex gap-3 flex-wrap">
            {compounds.map((comp, i) => (
              <div key={i} className="space-y-1">
                <p className="text-[9px] text-zinc-600 text-center">
                  Stint {i + 1}
                  {userStints[i] && (
                    <span className="text-zinc-700">
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
          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <StintBar
              stints={driver.actual_stints}
              totalLaps={totalLaps}
              label={`Actual: ${driver.actual_stops}-stop`}
            />
            <StintBar
              stints={userStints}
              totalLaps={totalLaps}
              label={`Yours: ${numStops}-stop`}
            />
          </div>
        )}

        {/* Simulate button */}
        <button
          onClick={runSimulation}
          disabled={simulating}
          className={`w-full rounded-md py-2.5 text-sm font-medium transition-colors ${
            simulating
              ? "bg-zinc-800 text-zinc-600 cursor-wait"
              : "bg-white text-black hover:bg-zinc-200"
          }`}
        >
          {simulating ? "Running simulation..." : "Simulate"}
        </button>

        {/* Result */}
        {result && !("error" in result) && (
          <div className="rounded-md bg-zinc-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-2xl font-bold ${
                  result.delta_seconds < -2
                    ? "text-green-400"
                    : result.delta_seconds > 2
                    ? "text-red-400"
                    : "text-zinc-300"
                }`}>
                  {result.delta_seconds > 0 ? "+" : ""}
                  {result.delta_seconds.toFixed(1)}s
                </p>
                <p className="text-xs text-zinc-500">
                  vs actual strategy
                </p>
              </div>
              {result.predicted_position !== null && (
                <div className="text-right">
                  <p className="text-sm text-zinc-300">
                    P{result.driver.actual_finish}
                    <span className="text-zinc-600 mx-1.5">&rarr;</span>
                    <span className={
                      (result.position_change ?? 0) < 0
                        ? "text-green-400 font-bold"
                        : (result.position_change ?? 0) > 0
                        ? "text-red-400 font-bold"
                        : "text-zinc-300"
                    }>
                      P{result.predicted_position}
                    </span>
                  </p>
                  <p className="text-[10px] text-zinc-600">
                    {result.model_used === "data-driven" ? "ML regression" : "Physics model"}
                  </p>
                </div>
              )}
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {result.verdict}
            </p>
            <p className="text-[9px] text-zinc-600 border-t border-zinc-700 pt-2 mt-2">
              {result.model_used === "data-driven"
                ? "ML regression trained on real lap data from this race."
                : "Physics-based estimate (no lap timing data for pre-2018 races)."}
            </p>
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
