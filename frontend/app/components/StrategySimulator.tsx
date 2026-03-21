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
      className={`h-8 px-3 rounded-md text-xs font-bold transition-all ${style.bg} ${style.text} ${
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
      <div className="flex h-6 rounded overflow-hidden">
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

  // User inputs
  const [selectedDriver, setSelectedDriver] = useState<string>("");
  const [numStops, setNumStops] = useState(1);
  const [pitLaps, setPitLaps] = useState<number[]>([]);
  const [compounds, setCompounds] = useState<string[]>([]);

  // Simulation result
  const [result, setResult] = useState<SimResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

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
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-6 text-center">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">
          Strategy Simulator
        </p>
        <p className="text-sm text-zinc-300 mb-4">
          Could you have picked a better strategy? Build your own and find out.
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
          <div className="w-32">
            <label className="text-[10px] text-zinc-600 uppercase mb-1 block">Pit stops</label>
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setNumStops(n)}
                  className={`flex-1 rounded py-2 text-xs font-medium transition-colors ${
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
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-600">Stop {i + 1}:</span>
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
                    className="w-24 accent-zinc-500"
                  />
                  <span className="text-xs text-zinc-300 w-8 text-right">{lap}</span>
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
          </div>
        )}

        {result && "error" in result && (
          <p className="text-xs text-red-400 text-center">{String((result as Record<string, unknown>).error)}</p>
        )}

        {simError && !result && (
          <p className="text-xs text-red-400 text-center">{simError}</p>
        )}
      </div>
    </div>
  );
}
