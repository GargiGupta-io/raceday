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
    <div className="border-b border-white/[0.06] last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/[0.03] transition-all duration-200"
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
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-6 pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}

interface GoDeeperProps {
  children: ReactNode;
}

export default function GoDeeper({ children }: GoDeeperProps) {
  return (
    <div>
      <div className="flex items-center gap-4 mb-5">
        <div className="glass-divider flex-1" />
        <p className="text-xs text-zinc-500 uppercase tracking-widest">Go Deeper</p>
        <div className="glass-divider flex-1" />
      </div>
      <div className="glass-card divide-y divide-white/[0.06] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export { GoDeeperItem };
