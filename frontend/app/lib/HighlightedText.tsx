import React from "react";
import { wrapGlossaryTerms } from "@/app/components/GlossaryTerm";

const DRIVER_NAME_PATTERN = /([A-Z][a-z]+(?: [A-Z][a-z]+)*) \(([A-Z]{3})\)/;

export default function HighlightedText({ text }: { text: string }) {
  if (!text) return <></>;
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining) {
    const match = remaining.match(DRIVER_NAME_PATTERN);
    if (!match || match.index === undefined) {
      parts.push(
        <React.Fragment key={`gt${key++}`}>{wrapGlossaryTerms(remaining)}</React.Fragment>
      );
      break;
    }
    if (match.index > 0) {
      const before = remaining.slice(0, match.index);
      parts.push(
        <React.Fragment key={`gt${key++}`}>{wrapGlossaryTerms(before)}</React.Fragment>
      );
    }
    parts.push(
      <span key={key++} className="font-semibold text-white">{match[1]}</span>,
      <span key={key++} className="text-zinc-500"> ({match[2]})</span>
    );
    remaining = remaining.slice(match.index + match[0].length);
  }

  return <>{parts}</>;
}
