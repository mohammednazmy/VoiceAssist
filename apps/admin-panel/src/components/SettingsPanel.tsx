export function SettingsPanel() {
  return (
    <section id="settings" className="flex-1 p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-100">Settings</h2>
        <p className="text-xs text-slate-500">
          System-wide configuration. In a real deployment this would be driven
          by the ADMIN API.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 space-y-2">
          <div className="font-medium text-slate-200 text-sm">
            Model routing
          </div>
          <p className="text-slate-500 text-[11px]">
            Configure which model families to use for different intents
            (diagnosis, guidelines, summarization, etc.).
          </p>
        </div>
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 space-y-2">
          <div className="font-medium text-slate-200 text-sm">PHI routing</div>
          <p className="text-slate-500 text-[11px]">
            Based on SECURITY_COMPLIANCE.md – PHI should route to local models,
            non-PHI to cloud models.
          </p>
        </div>
      </div>
    </section>
  );
}
