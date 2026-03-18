/**
 * Maps Grand Prix names to their circuit SVG filenames.
 * Some race names share the same circuit (e.g. "70th Anniversary" = Silverstone).
 */
const CIRCUIT_MAP: Record<string, string> = {
  "70th Anniversary Grand Prix": "silverstone",
  "Abu Dhabi Grand Prix": "yas-marina",
  "Australian Grand Prix": "melbourne",
  "Austrian Grand Prix": "red-bull-ring",
  "Azerbaijan Grand Prix": "baku",
  "Bahrain Grand Prix": "bahrain",
  "Belgian Grand Prix": "spa",
  "Brazilian Grand Prix": "interlagos",
  "British Grand Prix": "silverstone",
  "Canadian Grand Prix": "montreal",
  "Chinese Grand Prix": "shanghai",
  "Dutch Grand Prix": "zandvoort",
  "Eifel Grand Prix": "nurburgring",
  "Emilia Romagna Grand Prix": "imola",
  "European Grand Prix": "valencia",
  "French Grand Prix": "paul-ricard",
  "German Grand Prix": "hockenheim",
  "Hungarian Grand Prix": "hungaroring",
  "Indian Grand Prix": "buddh",
  "Italian Grand Prix": "monza",
  "Japanese Grand Prix": "suzuka",
  "Korean Grand Prix": "yeongam",
  "Las Vegas Grand Prix": "las-vegas",
  "Malaysian Grand Prix": "sepang",
  "Mexican Grand Prix": "mexico-city",
  "Mexico City Grand Prix": "mexico-city",
  "Miami Grand Prix": "miami",
  "Monaco Grand Prix": "monaco",
  "Portuguese Grand Prix": "portimao",
  "Qatar Grand Prix": "losail",
  "Russian Grand Prix": "sochi",
  "Sakhir Grand Prix": "bahrain",
  "Saudi Arabian Grand Prix": "jeddah",
  "Singapore Grand Prix": "singapore",
  "Spanish Grand Prix": "barcelona",
  "Styrian Grand Prix": "red-bull-ring",
  "São Paulo Grand Prix": "interlagos",
  "Turkish Grand Prix": "istanbul",
  "Tuscan Grand Prix": "mugello",
  "United States Grand Prix": "cota",
};

export function getCircuitSvg(raceName: string): string | null {
  const filename = CIRCUIT_MAP[raceName];
  return filename ? `/circuits/${filename}.svg` : null;
}
