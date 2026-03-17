interface RaceSummary {
  winner: string;
  winner_team: string;
  podium: { position: number; driver: string; team: string }[];
  retirements: { driver: string; team: string }[];
  weather: string;
}

const DRIVER_NAMES: Record<string, string> = {
  ALB: "Alexander Albon", ALO: "Fernando Alonso", ANT: "Kimi Antonelli",
  BEA: "Oliver Bearman", BIA: "Jules Bianchi", BOT: "Valtteri Bottas",
  BUT: "Jenson Button", COL: "Franco Colapinto", DEV: "Nyck de Vries",
  DOO: "Jack Doohan", ERI: "Marcus Ericsson", GAS: "Pierre Gasly",
  GIO: "Antonio Giovinazzi", GRO: "Romain Grosjean", GUT: "Esteban Gutierrez",
  HAM: "Lewis Hamilton", HUL: "Nico Hulkenberg", KOB: "Kamui Kobayashi",
  KVY: "Daniil Kvyat", LAT: "Nicholas Latifi", LAW: "Liam Lawson",
  LEC: "Charles Leclerc", MAG: "Kevin Magnussen", MAL: "Pastor Maldonado",
  MAS: "Felipe Massa", MAZ: "Nikita Mazepin", MSC: "Mick Schumacher",
  NOR: "Lando Norris", OCO: "Esteban Ocon", PAL: "Jolyon Palmer",
  PER: "Sergio Perez", PIA: "Oscar Piastri", RAI: "Kimi Raikkonen",
  RIC: "Daniel Ricciardo", ROS: "Nico Rosberg", RUS: "George Russell",
  SAI: "Carlos Sainz", SAR: "Logan Sargeant", SIR: "Sergey Sirotkin",
  STR: "Lance Stroll", TSU: "Yuki Tsunoda", VAN: "Stoffel Vandoorne",
  VER: "Max Verstappen", VET: "Sebastian Vettel", WEB: "Mark Webber",
  WEH: "Pascal Wehrlein", ZHO: "Guanyu Zhou",
};

const TEAM_ACCENT: Record<string, string> = {
  "Red Bull Racing": "border-blue-500/40",
  "Red Bull": "border-blue-500/40",
  "Mercedes": "border-emerald-400/40",
  "Ferrari": "border-red-500/40",
  "McLaren": "border-orange-400/40",
  "Williams": "border-white/30",
  "Alpine": "border-pink-400/40",
  "Aston Martin": "border-green-500/40",
  "Haas F1 Team": "border-zinc-400/40",
  "AlphaTauri": "border-slate-400/40",
  "RB": "border-slate-400/40",
  "Alfa Romeo": "border-red-800/40",
  "Sauber": "border-green-400/40",
  "Renault": "border-yellow-400/40",
  "Racing Point": "border-pink-300/40",
  "Force India": "border-pink-300/40",
  "Toro Rosso": "border-blue-400/40",
  "Lotus F1": "border-amber-600/40",
  "Brawn": "border-lime-400/40",
};

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

const POSITION_STYLES: Record<number, { badge: string; label: string }> = {
  1: { badge: "bg-yellow-500 text-black", label: "P1" },
  2: { badge: "bg-zinc-400 text-black",   label: "P2" },
  3: { badge: "bg-amber-700 text-white",  label: "P3" },
};

const WEATHER_ICON: Record<string, string> = {
  dry:   "\u2600\uFE0F",
  wet:   "\uD83C\uDF27\uFE0F",
  damp:  "\u26C5",
  mixed: "\u26C5",
};

function dn(code: string): string {
  return DRIVER_NAMES[code] || code;
}

export default function ResultsCard({ data }: { data: RaceSummary }) {
  const weatherKey = data.weather?.toLowerCase() ?? "";
  const weatherIcon = WEATHER_ICON[weatherKey] ?? "\u2014";
  const winnerAccent = TEAM_ACCENT[data.winner_team] || "border-zinc-700";
  const winnerDot = TEAM_DOT[data.winner_team] || "bg-zinc-500";

  return (
    <div className="space-y-3">

      {/* Winner */}
      <div className={`rounded-lg bg-zinc-900 border-l-4 ${winnerAccent} p-5`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Race winner</p>
            <p className="text-2xl font-bold text-white tracking-tight">{dn(data.winner)}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-2 h-2 rounded-full ${winnerDot}`} />
              <p className="text-sm text-zinc-400">{data.winner_team}</p>
            </div>
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
          const accent = TEAM_ACCENT[p.team] || "border-zinc-700";
          const dot = TEAM_DOT[p.team] || "bg-zinc-500";
          return (
            <div key={p.position} className={`rounded-lg bg-zinc-900 border-l-4 ${accent} p-4`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-zinc-500 uppercase tracking-widest">
                  {style?.label ?? `P${p.position}`}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${style?.badge ?? "bg-zinc-700 text-white"}`}>
                  {style?.label ?? `P${p.position}`}
                </span>
              </div>
              <p className="text-base font-semibold text-zinc-100">{dn(p.driver)}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                <p className="text-xs text-zinc-500">{p.team}</p>
              </div>
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
              {data.retirements.map((r, i) => (
                <li key={r.driver ?? i} className="text-sm text-zinc-500 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${TEAM_DOT[r.team] || "bg-zinc-600"}`} />
                  {dn(r.driver)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
