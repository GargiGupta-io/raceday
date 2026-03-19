"use client";

import { useEffect, useState } from "react";

const API = "http://localhost:8888";

interface Question {
  id: number;
  question: string;
  options: string[];
  answer: number;
  category: string;
}

interface QuizData {
  race: string;
  total_questions: number;
  questions: Question[];
}

const CATEGORY_STYLE: Record<string, { icon: string; color: string }> = {
  result:   { icon: "\u{1F3C6}", color: "text-yellow-400" },
  grid:     { icon: "\u{1F3CE}", color: "text-blue-400" },
  weather:  { icon: "\u2602",    color: "text-cyan-400" },
  strategy: { icon: "\u{1F527}", color: "text-orange-400" },
  drama:    { icon: "\u26A1",    color: "text-red-400" },
};

export default function PredictionQuiz({
  year,
  track,
}: {
  year: string;
  track: string;
}) {
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    setAnswers({});
    setRevealed(false);
    setExpanded(false);
    fetch(`${API}/races/${year}/${encodeURIComponent(track)}/quiz`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((d) => {
        setQuiz(d);
        setLoading(false);
      })
      .catch(() => {
        setQuiz(null);
        setLoading(false);
      });
  }, [year, track]);

  if (loading) {
    return (
      <div className="rounded-lg bg-zinc-900 p-6 animate-pulse">
        <div className="h-5 w-48 bg-zinc-800 rounded mb-4" />
        <div className="h-3 w-64 bg-zinc-800 rounded" />
      </div>
    );
  }

  if (!quiz || quiz.questions.length === 0) return null;

  const answeredCount = Object.keys(answers).length;
  const totalQ = quiz.total_questions;

  const score = revealed
    ? quiz.questions.reduce(
        (acc, q) => acc + (answers[q.id] === q.answer ? 1 : 0),
        0
      )
    : 0;

  const scoreLabel =
    score === totalQ
      ? "Perfect! You really know this race."
      : score >= totalQ * 0.7
      ? "Great job — you know your F1!"
      : score >= totalQ * 0.4
      ? "Not bad — room to learn more."
      : "Time to re-read the race story!";

  // Collapsed state — just a prompt
  if (!expanded) {
    return (
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-6 text-center">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">
          Test Your Knowledge
        </p>
        <p className="text-sm text-zinc-300 mb-4">
          Think you know what happened in this race? {totalQ} questions.
        </p>
        <button
          onClick={() => setExpanded(true)}
          className="rounded-md bg-zinc-700 hover:bg-zinc-600 px-5 py-2 text-sm font-medium text-white transition-colors"
        >
          Take the quiz
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
        Test Your Knowledge
      </p>

      {quiz.questions.map((q) => {
        const style = CATEGORY_STYLE[q.category] || CATEGORY_STYLE.drama;
        const selected = answers[q.id];
        const isAnswered = selected !== undefined;

        return (
          <div key={q.id} className="rounded-lg bg-zinc-900 p-4">
            {/* Question */}
            <div className="flex items-start gap-2 mb-3">
              <span className={`text-sm ${style.color}`}>{style.icon}</span>
              <p className="text-sm font-medium text-zinc-100">{q.question}</p>
            </div>

            {/* Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
              {q.options.map((opt, i) => {
                let optClass =
                  "rounded-md border px-3 py-2 text-xs transition-colors cursor-pointer ";

                if (revealed) {
                  if (i === q.answer) {
                    optClass += "border-green-600 bg-green-950/40 text-green-300";
                  } else if (i === selected && i !== q.answer) {
                    optClass += "border-red-600 bg-red-950/40 text-red-300";
                  } else {
                    optClass += "border-zinc-800 text-zinc-600";
                  }
                } else if (i === selected) {
                  optClass += "border-zinc-500 bg-zinc-800 text-white";
                } else {
                  optClass +=
                    "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200";
                }

                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (!revealed) {
                        setAnswers((prev) => ({ ...prev, [q.id]: i }));
                      }
                    }}
                    disabled={revealed}
                    className={optClass}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Submit / Score */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 text-center">
        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            disabled={answeredCount < totalQ}
            className={`rounded-md px-6 py-2 text-sm font-medium transition-colors ${
              answeredCount < totalQ
                ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                : "bg-white text-black hover:bg-zinc-200"
            }`}
          >
            {answeredCount < totalQ
              ? `Answer all questions (${answeredCount}/${totalQ})`
              : "Reveal answers"}
          </button>
        ) : (
          <div>
            <p className="text-2xl font-bold text-white mb-1">
              {score} / {totalQ}
            </p>
            <p className="text-sm text-zinc-400">{scoreLabel}</p>
            <button
              onClick={() => {
                setAnswers({});
                setRevealed(false);
              }}
              className="mt-3 rounded-md bg-zinc-800 hover:bg-zinc-700 px-4 py-1.5 text-xs text-zinc-300 transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
