"use client";

import F1Car from "./F1Car";

export default function DataLoader({
  size = "md",
  label,
}: {
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  const sizes = {
    sm: { car: "w-16", gap: "gap-3", text: "text-[10px]", py: "py-6" },
    md: { car: "w-28", gap: "gap-4", text: "text-xs", py: "py-16" },
    lg: { car: "w-40", gap: "gap-5", text: "text-sm", py: "py-24" },
  };

  const s = sizes[size];

  return (
    <div className={`flex flex-col items-center justify-center ${s.py} ${s.gap}`}>
      <div className="relative overflow-hidden" style={{ width: size === "sm" ? "80px" : size === "md" ? "160px" : "220px" }}>
        <div className="animate-[driveLoader_2s_ease-in-out_infinite]">
          <F1Car className={`${s.car} text-red-500`} />
        </div>
        <div className="absolute bottom-2 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/20 to-transparent" />
      </div>

      {label && (
        <p className={`${s.text} uppercase tracking-[0.25em] text-zinc-600`}>
          {label}
        </p>
      )}
    </div>
  );
}
