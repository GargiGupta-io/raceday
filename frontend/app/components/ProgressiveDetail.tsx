"use client";

import type { ReactNode } from "react";

export default function ProgressiveDetail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs font-semibold text-zinc-300 transition hover:text-white">
        <span className="inline-flex items-center gap-2">
          <span className="text-red-400">+</span>
          {label}
        </span>
      </summary>
      <div className="mt-3 border-l border-red-500/35 pl-3 text-xs leading-relaxed text-zinc-300">
        {children}
      </div>
    </details>
  );
}
