export const GLOSSARY: Record<string, string> = {
  compound:
    "The type of tyre used — softer compounds are faster but wear out quicker, harder compounds last longer but are slower.",
  stint:
    "A run of laps on the same set of tyres, between two pit stops (or between the start and a stop).",
  pole:
    "Starting first on the grid. Earned by setting the fastest lap in qualifying the day before the race.",
  podium: "The top three finishers in a race.",
  drs:
    "Drag Reduction System — a flap on the rear wing that opens to reduce drag, making overtaking easier on straights.",
  undercut:
    "Pitting for fresh tyres earlier than a rival, then using the grip advantage to jump ahead when they pit.",
  overcut:
    "Staying out longer than a rival, banking on your older tyres still being quick enough to gain time before pitting.",
  "pit window":
    "The range of laps during which it's optimal to make a pit stop, based on tyre life and strategy.",
  degradation:
    "How quickly a tyre loses grip as it wears. High degradation means lap times drop off fast.",
  grid: "The starting positions for the race, set by qualifying results.",
  p1: "First place — the winner of the race.",
  p2: "Second place.",
  p3: "Third place.",
  "safety car":
    "A physical car that leads the field at reduced speed after an incident, bunching everyone together while marshals clear the track.",
  "formation lap":
    "The slow lap before the race starts, where drivers warm up their tyres and brakes.",
  retirement:
    "When a driver drops out of the race before the end — usually due to a mechanical failure or a crash.",
  vsc:
    "Virtual Safety Car — slows every car to a set delta time without physically deploying the safety car.",
};

export function getDefinition(term: string): string | undefined {
  return GLOSSARY[term.toLowerCase()];
}
