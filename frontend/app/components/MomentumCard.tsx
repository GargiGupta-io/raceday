"use client";

interface MomentumResult {
  race: string;
  position: number | null;
  points: number;
}

interface MomentumEntry {
  driver: string;
  full_name: string;
  team: string;
  points: number;
  results: MomentumResult[];
}

const TEAM_DOT: Record<string, string> = {
  "Red Bull Racing": "bg-blue-500",
  "Red Bull": "bg-blue-500",
  "Mercedes": "bg-emerald-400",
  "Ferrari": "bg-red-500",
  "McLaren": "bg-orange-400",
  "Williams": "bg-white",
  "Alpine": "bg-pink-400",
  "Aston Martin": "bg-green-500",
  "Haas F1 Team": "bg-zinc-400",
  "AlphaTauri": "bg-slate-400",
  "RB": "bg-slate-400",
  "Alfa Romeo": "bg-red-800",
  "Sauber": "bg-green-400",
  "Renault": "bg-yellow-400",
  "Racing Point": "bg-pink-300",
  "Force India": "bg-pink-300",
  "Toro Rosso": "bg-blue-400",
  "Lotus F1": "bg-amber-600",
  "Brawn": "bg-lime-400",
};

function positionColor(pos: number | null): string {
  if (!pos) return "bg-zinc-700 text-zinc-500";
  if (pos === 1) return "bg-yellow-500 text-black";
  if (pos <= 3) return "bg-zinc-400 text-black";
  if (pos <= 10) return "bg-zinc-700 text-zinc-200";
  return "bg-zinc-800 text-zinc-500";
}

export default function MomentumCard({ data }: { data: MomentumEntry[] }) {
  if (!data || data.length === 0) return null;

  const maxPoints = data[0]?.points || 1;

  return (
    <div className="rounded-lg bg-zinc-900 p-5">
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">
        Hot Right Now
      </p>
      <p className="text-xs text-zinc-600 mb-4">Points in last 5 races</p>

      <div className="space-y-3">
        {data.map((entry, i) => {
          const dot = TEAM_DOT[entry.team] || "bg-zinc-500";
          const barWidth = Math.round((entry.points / maxPoints) * 100);

          return (
            <div key={entry.driver} className="space-y-1">
              {/* Driver info row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-zinc-600 w-4 text-right font-mono">
                    {i + 1}
                  </span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                  <span className="text-sm font-medium text-zinc-200 truncate">
                    {entry.full_name}
                  </span>
                </div>
                <span className="text-sm font-bold text-zinc-300 ml-2 shrink-0">
                  {entry.points}
                </span>
              </div>

              {/* Bar + mini results */}
              <div className="flex items-center gap-2 ml-6">
                {/* Points bar */}
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500/60 rounded-full transition-all"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                {/* Mini position badges */}
                <div className="flex gap-0.5 shrink-0">
                  {entry.results.map((r, j) => (
                    <span
                      key={j}
                      className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${positionColor(r.position)}`}
                      title={`${r.race}: P${r.position ?? "DNF"}`}
                    >
                      {r.position ?? "-"}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
