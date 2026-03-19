interface StrategyEntry {
  driver: string;
  team: string;
  stops: number;
  compounds: string[];
  label: string;
}

const COMPOUND_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  SOFT:         { bg: "bg-red-600",    text: "text-white",      label: "S" },
  MEDIUM:       { bg: "bg-yellow-400", text: "text-black",      label: "M" },
  HARD:         { bg: "bg-zinc-100",   text: "text-black",      label: "H" },
  INTERMEDIATE: { bg: "bg-green-500",  text: "text-white",      label: "I" },
  WET:          { bg: "bg-blue-500",   text: "text-white",      label: "W" },
  UNKNOWN:      { bg: "bg-zinc-700",   text: "text-zinc-300",   label: "?" },
};

function CompoundChip({ compound }: { compound: string }) {
  const style = COMPOUND_STYLES[compound.toUpperCase()] ?? COMPOUND_STYLES.UNKNOWN;
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${style.bg} ${style.text}`}
      title={compound}
    >
      {style.label}
    </span>
  );
}

function StopsBadge({ stops }: { stops: number }) {
  if (stops === 0)
    return <span className="rounded px-1.5 py-0.5 text-xs bg-zinc-800 text-zinc-400">0-stop</span>;
  if (stops === 1)
    return <span className="rounded px-1.5 py-0.5 text-xs bg-zinc-800 text-zinc-300">1-stop</span>;
  return (
    <span className="rounded px-1.5 py-0.5 text-xs bg-amber-900/60 text-amber-400">
      {stops}-stop
    </span>
  );
}

export default function StrategyPanel({ data }: { data: StrategyEntry[] }) {
  // Check if all data is unknown/empty
  const allUnknown = data.every(
    (e) => e.compounds.length === 0 || e.compounds.every((c) => c.toUpperCase() === "UNKNOWN")
  );

  if (allUnknown) {
    return (
      <div className="rounded-lg bg-zinc-900 p-6 text-center">
        <p className="text-sm text-zinc-400 mb-1">No tyre strategy data available</p>
        <p className="text-xs text-zinc-600">
          {data.length > 0 && data[0].stops === 0
            ? "This race was shortened or stopped early — no pit stops were made."
            : "Detailed stint data is not available for this race."}
        </p>
      </div>
    );
  }

  // Find which compounds are actually used (for legend)
  const usedCompounds = new Set<string>();
  for (const entry of data) {
    for (const c of entry.compounds) {
      const upper = c.toUpperCase();
      if (upper !== "UNKNOWN") usedCompounds.add(upper);
    }
  }

  return (
    <div className="space-y-3">

      {/* Compound legend — only show compounds actually used */}
      <div className="flex gap-3 flex-wrap px-1">
        {Object.entries(COMPOUND_STYLES)
          .filter(([k]) => usedCompounds.has(k))
          .map(([compound, style]) => (
            <div key={compound} className="flex items-center gap-1.5">
              <span
                className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${style.bg} ${style.text}`}
              >
                {style.label}
              </span>
              <span className="text-xs text-zinc-500 capitalize">
                {compound.charAt(0) + compound.slice(1).toLowerCase()}
              </span>
            </div>
          ))}
      </div>

      {/* Driver rows */}
      <div className="rounded-lg bg-zinc-900 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[4rem_1fr_auto_5rem] gap-3 px-5 py-2 border-b border-zinc-800">
          <span className="text-xs text-zinc-600">Driver</span>
          <span className="text-xs text-zinc-600">Stints</span>
          <span className="text-xs text-zinc-600 text-right">Stops</span>
          <span></span>
        </div>

        {data.map((entry) => (
          <div
            key={entry.driver}
            className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/60 last:border-0 gap-4"
          >
            {/* Driver */}
            <div className="w-20 shrink-0">
              <p className="text-sm font-medium text-zinc-100">{entry.driver}</p>
              <p className="text-xs text-zinc-500 truncate">{entry.team}</p>
            </div>

            {/* Compound chips + arrows */}
            <div className="flex items-center gap-1 flex-1 flex-wrap">
              {entry.compounds.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  <CompoundChip compound={c} />
                  {i < entry.compounds.length - 1 && (
                    <span className="text-zinc-600 text-xs">→</span>
                  )}
                </span>
              ))}
            </div>

            {/* Stops badge */}
            <div className="shrink-0">
              <StopsBadge stops={entry.stops} />
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
