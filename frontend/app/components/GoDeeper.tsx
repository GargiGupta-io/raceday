"use client";

import { useState, ReactNode } from "react";

interface GoDeeperItemProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

function GoDeeperItem({ title, children, defaultOpen = false }: GoDeeperItemProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-zinc-800 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
      >
        <span>{title}</span>
        <span
          className={`text-zinc-500 transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
        >
          ▸
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

interface GoDeeperProps {
  children: ReactNode;
}

export default function GoDeeper({ children }: GoDeeperProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="h-px flex-1 bg-zinc-800" />
        <p className="text-xs text-zinc-500 uppercase tracking-widest">Go Deeper</p>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>
      <div className="rounded-lg bg-zinc-900 divide-y divide-zinc-800">
        {children}
      </div>
    </div>
  );
}

export { GoDeeperItem };
