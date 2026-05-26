interface SidebarData {
  did_you_know: string[];
}

export default function FactsSidebar({ data }: { data: SidebarData }) {
  if (!data.did_you_know || data.did_you_know.length === 0) {
    return (
      <div className="glass-card p-6">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Race Intelligence</p>
        <p className="text-xs text-zinc-600">No race insights available for this event.</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">
        Race Intelligence
      </p>
      <ul className="space-y-3">
        {data.did_you_know.map((fact, i) => (
          <li key={i} className="text-sm text-zinc-300 leading-relaxed">
            <span className="text-red-400 mr-2">*</span>
            {fact}
          </li>
        ))}
      </ul>
    </div>
  );
}
