const demoContexts = [
  {
    id: "ctx-1",
    title: "65M · HFrEF · CKD3 · AFib",
    updated: "5 min ago",
  },
  {
    id: "ctx-2",
    title: "24F · RLQ pain · Fever",
    updated: "32 min ago",
  },
];

export function Sidebar() {
  return (
    <aside className="w-80 border-r border-slate-800 bg-slate-950/80 flex flex-col">
      <div className="px-4 py-3 border-b border-slate-800">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          Cases
        </div>
        <button className="mt-2 px-3 py-1.5 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white">
          + New case
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {demoContexts.map((ctx) => (
          <button
            key={ctx.id}
            className="w-full text-left px-4 py-3 hover:bg-slate-900 border-b border-slate-900"
          >
            <div className="text-sm font-medium text-slate-100">
              {ctx.title}
            </div>
            <div className="text-xs text-slate-500">Updated {ctx.updated}</div>
          </button>
        ))}
      </div>
    </aside>
  );
}
