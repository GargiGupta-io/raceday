interface StandingEntry {
  position: number;
  driver: string;
  team: string;
  finish_position: number | null;
  grid_position: number | null;
  positions_gained: number | null;
  status: string;
}

export default function StandingsTable({ data }: { data: StandingEntry[] }) {
  const finishers = data.filter((e) => e.status !== "Retired");
  const retirees  = data.filter((e) => e.status === "Retired");

  return (
    <div className="space-y-3">

      {/* Finishers */}
      <div className="rounded-lg bg-zinc-900 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2rem_1fr_3rem_3rem] gap-3 px-5 py-2 border-b border-zinc-800">
          <span className="text-xs text-zinc-600 text-right">P</span>
          <span className="text-xs text-zinc-600">Driver</span>
          <span className="text-xs text-zinc-600 text-center">Grid</span>
          <span className="text-xs text-zinc-600 text-right">+/−</span>
        </div>

        {finishers.map((entry) => (
          <div
            key={entry.driver}
            className="grid grid-cols-[2rem_1fr_3rem_3rem] gap-3 items-center px-5 py-3 border-b border-zinc-800/60 last:border-0"
          >
            {/* Finish position */}
            <span className="text-sm font-mono text-right text-zinc-400">
              {entry.finish_position ?? "—"}
            </span>

            {/* Driver + team */}
            <div>
              <p className="text-sm font-medium text-zinc-100">{entry.driver}</p>
              <p className="text-xs text-zinc-500">{entry.team}</p>
            </div>

            {/* Grid position */}
            <span className="text-xs text-zinc-500 text-center font-mono">
              {entry.grid_position ?? "—"}
            </span>

            {/* Delta */}
            <div className="flex justify-end">
              <DeltaBadge delta={entry.positions_gained} />
            </div>
          </div>
        ))}
      </div>

      {/* Retirements */}
      {retirees.length > 0 && (
        <div className="rounded-lg bg-zinc-900 overflow-hidden">
          <div className="px-5 py-2 border-b border-zinc-800">
            <span className="text-xs text-zinc-600 uppercase tracking-widest">
              Retired ({retirees.length})
            </span>
          </div>
          {retirees.map((entry) => (
            <div
              key={entry.driver}
              className="grid grid-cols-[2rem_1fr_3rem_3rem] gap-3 items-center px-5 py-3 border-b border-zinc-800/60 last:border-0 opacity-40"
            >
              <span className="text-sm font-mono text-right text-zinc-500">—</span>
              <div>
                <p className="text-sm font-medium text-zinc-300">{entry.driver}</p>
                <p className="text-xs text-zinc-500">{entry.team}</p>
              </div>
              <span className="text-xs text-zinc-600 text-center font-mono">
                {entry.grid_position ?? "—"}
              </span>
              <span className="text-xs text-zinc-600 text-right">DNF</span>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-xs text-zinc-600">—</span>;

  if (delta > 0)
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-emerald-900/60 text-emerald-400">
        +{delta}
      </span>
    );

  if (delta < 0)
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-red-900/60 text-red-400">
        {delta}
      </span>
    );

  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-zinc-800 text-zinc-500">
      =
    </span>
  );
}
