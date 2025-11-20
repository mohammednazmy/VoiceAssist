
export function Dashboard() {
  return (
    <section className="flex-1 p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">System Overview</h1>
        <p className="text-xs text-slate-500">
          High-level status of the VoiceAssist deployment. Data is partially mocked until the full
          backend is implemented.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4 text-xs">
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
          <div className="text-slate-400">Active sessions</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-400">12</div>
          <div className="mt-1 text-[10px] text-slate-500">Aggregate from chat-service metrics</div>
        </div>
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
          <div className="text-slate-400">Tool errors (24h)</div>
          <div className="mt-2 text-2xl font-semibold text-amber-400">3</div>
          <div className="mt-1 text-[10px] text-slate-500">From Prometheus tool_errors_total</div>
        </div>
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
          <div className="text-slate-400">Indexing jobs</div>
          <div className="mt-2 text-2xl font-semibold text-sky-400">5</div>
          <div className="mt-1 text-[10px] text-slate-500">From KBIndexer state machine</div>
        </div>
      </div>
    </section>
  );
}
