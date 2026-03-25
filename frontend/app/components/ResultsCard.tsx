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

const POSITION_MEDAL: Record<number, string> = {
  1: "\uD83E\uDD47",
  2: "\uD83E\uDD48",
  3: "\uD83E\uDD49",
};

function dn(code: string): string {
  return DRIVER_NAMES[code] || code;
}

export default function ResultsCard({ data }: { data: RaceSummary }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">The Result</p>
      <div className="glass-card divide-y divide-white/[0.06] overflow-hidden">
        {data.podium.map((p) => {
          const dot = TEAM_DOT[p.team] || "bg-zinc-500";
          const medal = POSITION_MEDAL[p.position] ?? `P${p.position}`;
          return (
            <div key={p.position} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors">
              <span className="text-lg w-7 text-center">{medal}</span>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-zinc-100 ${p.position === 1 ? "text-base" : "text-sm"}`}>
                  {dn(p.driver)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${dot}`} />
                <p className="text-xs text-zinc-400">{p.team}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
