import Link from "next/link";
import { GLOSSARY } from "@/app/lib/glossary";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New to F1 — RaceDay",
  description:
    "A plain-English guide to Formula 1 — what it is, how a race weekend works, the cars, the jargon, and three races to start with.",
};

const STARTER_RACES = [
  {
    year: 2008,
    name: "Brazilian Grand Prix",
    title: "Brazil 2008",
    hook: "Lewis Hamilton's first world championship decided in the final corner of the final lap.",
    why: "The most dramatic title decider in F1 history. Hamilton needed fifth to win the title. He was sixth going into the last corner, in the rain. Then Timo Glock crawled across the line on dry tyres, Hamilton swept past him, and a drivers' champion was crowned at the last possible moment. Sebastian Vettel celebrated the win. Felipe Massa had already thought he'd become champion. Watch the chaos unfold.",
  },
  {
    year: 2021,
    name: "Abu Dhabi Grand Prix",
    title: "Abu Dhabi 2021",
    hook: "The most controversial finish in the sport's history — Verstappen overtakes Hamilton on the final lap to claim his first world title.",
    why: "Two drivers tied on points entering the final race. Hamilton dominated most of the race. Then a late safety car, a confused race director, and five cars waved through turned a procession into a one-lap shootout. Verstappen on fresh softs versus Hamilton on worn hards. One lap. A title. F1 rewrote its rulebook after this one.",
  },
  {
    year: 2020,
    name: "Turkish Grand Prix",
    title: "Turkey 2020",
    hook: "Lewis Hamilton wins a rain-soaked masterclass from sixth to clinch his seventh world championship.",
    why: "The Istanbul track had been freshly resurfaced and barely drained. Rain turned it into an ice rink. Cars spun everywhere. Hamilton, on intermediate tyres, somehow managed the chaos better than anyone — not by being fastest, but by being smoothest. He tied Michael Schumacher's record of seven world titles that day. A reminder that F1 is as much about control as it is about speed.",
  },
];

const WEEKEND_FORMAT = [
  {
    name: "Practice",
    day: "Friday",
    what: "Three or four hour-long sessions where teams run tyre comparisons, set-up tweaks, and long runs. Lap times don't count for anything — it's a rehearsal.",
  },
  {
    name: "Qualifying",
    day: "Saturday",
    what: "A knockout shootout in three stages (Q1, Q2, Q3) that decides the starting order for the race. Fastest lap in Q3 starts first — that's pole position.",
  },
  {
    name: "Race",
    day: "Sunday",
    what: "Usually around 60–70 laps, roughly 300 km, lasting 90 minutes to 2 hours. Points awarded to the top 10. Win = 25 points, second = 18, etc.",
  },
];

export default function NewToF1Page() {
  return (
    <div className="min-h-screen text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 sm:px-8 py-16 sm:py-24">

        {/* Header */}
        <div className="mb-16">
          <p className="text-[10px] text-red-400 uppercase tracking-[0.3em] mb-3">
            Beginner Guide
          </p>
          <h1
            className="text-5xl sm:text-6xl tracking-tight text-white mb-4"
            style={{ fontFamily: "var(--font-racing)" }}
          >
            New to <span className="text-red-500">Formula 1</span>
          </h1>
          <p className="text-base sm:text-lg text-zinc-400 leading-relaxed">
            A plain-English guide to the sport, the jargon, and where to start.
          </p>
        </div>

        {/* Section: What is F1 */}
        <section className="mb-16">
          <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-6">
            What is Formula 1?
          </h2>
          <div className="space-y-4 text-zinc-300 leading-relaxed">
            <p>
              Formula 1 is the world&apos;s top single-seater motorsport. Twenty drivers
              from ten teams race 24 times a year across 21 countries, each chasing one
              of two championships — the Drivers&apos; Championship (the best driver)
              and the Constructors&apos; Championship (the best team).
            </p>
            <p>
              Every race has points on offer: 25 for the winner, 18 for second, 15 for
              third, and so on down to 1 point for tenth. Whoever has the most points
              at the end of the season is crowned world champion.
            </p>
            <p>
              But F1 isn&apos;t just about who&apos;s fastest. It&apos;s about strategy:
              when to pit, which tyres to use, how to manage fuel, how to read the
              weather, when to risk an overtake. Every race is a puzzle. That&apos;s
              what this site exists to help you see.
            </p>
          </div>
        </section>

        {/* Section: Race Weekend */}
        <section className="mb-16">
          <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-6">
            How a race weekend works
          </h2>
          <p className="text-zinc-400 mb-6">
            Every Grand Prix is actually a three-day event. Here&apos;s what happens:
          </p>
          <div className="space-y-4">
            {WEEKEND_FORMAT.map((s) => (
              <div key={s.name} className="glass-card p-5">
                <div className="flex items-baseline gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-white">{s.name}</h3>
                  <span className="text-[10px] uppercase tracking-widest text-red-400">{s.day}</span>
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed">{s.what}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section: The cars and tyres */}
        <section className="mb-16">
          <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-6">
            The cars, the tyres, the teams
          </h2>
          <div className="space-y-4 text-zinc-300 leading-relaxed mb-6">
            <p>
              F1 cars are purpose-built single-seater racing machines that accelerate
              from 0–100 km/h in under two seconds and top 350 km/h on straights. Each
              car weighs around 800 kg and produces enough downforce to theoretically
              drive upside-down on a ceiling.
            </p>
            <p>
              Ten teams (also called constructors) each run two cars. Some teams build
              their own engines (Ferrari, Mercedes), others buy them (Aston Martin buys
              Mercedes engines, for example). Big names right now include Red Bull,
              Ferrari, Mercedes, and McLaren.
            </p>
          </div>

          <div className="glass-card p-5 mb-6">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
              Tyre compounds
            </h3>
            <p className="text-sm text-zinc-400 leading-relaxed mb-4">
              Cars use one of five tyre types depending on conditions. Choosing and
              managing them is a huge part of race strategy.
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                <span className="text-zinc-200"><strong>Soft</strong> — fastest, wears out quickest</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-yellow-500 shrink-0" />
                <span className="text-zinc-200"><strong>Medium</strong> — balanced pace and life</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-white shrink-0" />
                <span className="text-zinc-200"><strong>Hard</strong> — slowest, lasts longest</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
                <span className="text-zinc-200"><strong>Intermediate</strong> — light rain, grooved</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                <span className="text-zinc-200"><strong>Wet</strong> — heavy rain, full treads</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section: How to read a RaceDay page */}
        <section className="mb-16">
          <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-6">
            How to read a RaceDay race page
          </h2>
          <p className="text-zinc-400 mb-6">
            Once you click into a race, here&apos;s what you&apos;ll see:
          </p>
          <div className="space-y-4">
            <div className="glass-card p-5">
              <h3 className="text-base font-semibold text-white mb-2">Race Story</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                A written narrative of how the race unfolded — the turning points, the
                weather, the drama. Written for people who didn&apos;t watch it live.
              </p>
            </div>
            <div className="glass-card p-5">
              <h3 className="text-base font-semibold text-white mb-2">Key Moments</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Auto-detected highlights — big overtakes, crashes, safety cars, pit
                stops that changed the race. The moments you&apos;d see on a highlight reel.
              </p>
            </div>
            <div className="glass-card p-5">
              <h3 className="text-base font-semibold text-white mb-2">Pattern Precedents</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                &quot;What history tells us&quot; — similar races from the past 16 seasons
                that match this one&apos;s conditions. A wet race from pole? Here&apos;s
                how those usually go.
              </p>
            </div>
            <div className="glass-card p-5">
              <h3 className="text-base font-semibold text-white mb-2">Go Deeper</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Click to expand: full strategy breakdown, season standings at this
                point, teammate battles, and more. For when you want the whole picture.
              </p>
            </div>
            <div className="glass-card p-5">
              <h3 className="text-base font-semibold text-white mb-2">Strategy Simulator</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Pick a driver, choose tyres, set pit stops — then watch a machine
                learning model predict how your strategy would have played out vs
                reality. Try it. It&apos;s the best way to understand F1 strategy.
              </p>
            </div>
          </div>
        </section>

        {/* Section: Glossary */}
        <section className="mb-16">
          <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-6">
            F1 Glossary
          </h2>
          <p className="text-zinc-400 mb-6">
            Every term you&apos;ll run into on this site, explained.
          </p>
          <div className="glass-card p-6">
            <dl className="space-y-5">
              {Object.entries(GLOSSARY).map(([term, def]) => (
                <div key={term}>
                  <dt className="text-sm font-semibold text-red-400 uppercase tracking-wide mb-1">
                    {term}
                  </dt>
                  <dd className="text-sm text-zinc-300 leading-relaxed">{def}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Section: Starter races */}
        <section className="mb-16">
          <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-6">
            Three races to start with
          </h2>
          <p className="text-zinc-400 mb-6">
            If you want to fall in love with F1 in one afternoon, read these three.
          </p>
          <div className="space-y-5">
            {STARTER_RACES.map((r) => (
              <Link
                key={`${r.year}-${r.name}`}
                href={`/races/${r.year}/${encodeURIComponent(r.name)}`}
                className="block glass-card p-6 group transition-all duration-200 hover:scale-[1.01]"
              >
                <p className="text-[10px] text-red-400 uppercase tracking-[0.3em] mb-2">
                  {r.title}
                </p>
                <h3 className="text-lg sm:text-xl font-semibold text-white mb-3 leading-snug">
                  {r.hook}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{r.why}</p>
                <p className="text-xs text-red-400 mt-4 group-hover:translate-x-1 transition-transform duration-200">
                  Read the race story &rarr;
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* CTA back to homepage */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8 border-t border-white/[0.06]">
          <Link
            href="/races"
            className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 hover:border-red-500/30 transition-all duration-200"
          >
            <span className="text-sm font-semibold text-white">Browse all races</span>
            <span className="text-red-400 group-hover:translate-x-1 transition-transform duration-200">&rarr;</span>
          </Link>
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Back to home
          </Link>
        </div>

      </div>
    </div>
  );
}
