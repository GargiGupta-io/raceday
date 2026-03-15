interface RaceSummary {
  winner: string;
  winner_team: string;
  podium: { position: number; driver: string; team: string }[];
  retirements: { driver: string; team: string }[];
  weather: string;
}

const POSITION_STYLES: Record<number, { badge: string; label: string }> = {
  1: { badge: "bg-yellow-500 text-black", label: "P1" },
  2: { badge: "bg-zinc-400 text-black",   label: "P2" },
  3: { badge: "bg-amber-700 text-white",  label: "P3" },
};

const WEATHER_ICON: Record<string, string> = {
  dry:    "☀",
  wet:    "🌧",
  mixed:  "⛅",
};

export default function ResultsCard({ data }: { data: RaceSummary }) {
  const weatherKey = data.weather?.toLowerCase() ?? "";
  const weatherIcon = WEATHER_ICON[weatherKey] ?? "—";

  return (
    <div className="space-y-4">

      {/* Winner */}
      <div className="rounded-lg bg-zinc-900 border border-yellow-500/30 p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Race winner</p>
            <p className="text-3xl font-bold text-white tracking-tight">{data.winner}</p>
            <p className="mt-1 text-sm text-zinc-400">{data.winner_team}</p>
          </div>
          <span className="rounded-full bg-yellow-500 px-3 py-1 text-xs font-bold text-black">
            P1
          </span>
        </div>
      </div>

      {/* Podium P2 + P3 */}
      <div className="grid grid-cols-2 gap-3">
        {data.podium.filter((p) => p.position > 1).map((p) => {
          const style = POSITION_STYLES[p.position];
          return (
            <div key={p.position} className="rounded-lg bg-zinc-900 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-zinc-500 uppercase tracking-widest">
                  {style?.label ?? `P${p.position}`}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${style?.badge ?? "bg-zinc-700 text-white"}`}>
                  {style?.label ?? `P${p.position}`}
                </span>
              </div>
              <p className="text-base font-semibold text-zinc-100">{p.driver}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{p.team}</p>
            </div>
          );
        })}
      </div>

      {/* Weather + Retirements row */}
      <div className="grid grid-cols-2 gap-3">

        {/* Weather */}
        <div className="rounded-lg bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Conditions</p>
          <p className="text-xl">{weatherIcon}</p>
          <p className="text-sm text-zinc-300 mt-1 capitalize">{data.weather ?? "Unknown"}</p>
        </div>

        {/* Retirements */}
        <div className="rounded-lg bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">
            Retirements ({data.retirements.length})
          </p>
          {data.retirements.length === 0 ? (
            <p className="text-sm text-zinc-600">None</p>
          ) : (
            <ul className="space-y-1">
              {data.retirements.map((r) => (
                <li key={r.driver} className="text-sm text-zinc-500">
                  {r.driver}
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>
    </div>
  );
}
