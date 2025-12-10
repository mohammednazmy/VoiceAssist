export function ToolsIntegrations() {
  return (
    <section id="tools" className="flex-1 p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-100">
          Tools & Integrations
        </h2>
        <p className="text-xs text-slate-500">
          Configure and test tools exposed to the AI model (calendar, Nextcloud,
          OpenEvidence, etc.).
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4 text-xs">
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 space-y-1">
          <div className="font-medium text-slate-100 text-sm">Nextcloud</div>
          <div className="text-slate-500 text-[11px]">
            Status: Connected (demo)
          </div>
          <div className="text-slate-500 text-[11px]">
            Base URL configured in settings and tool package uses Nextcloud
            tools.
          </div>
          <button className="mt-2 px-3 py-1 text-[11px] rounded border border-slate-700 hover:bg-slate-900">
            Test file search
          </button>
        </div>
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 space-y-1">
          <div className="font-medium text-slate-100 text-sm">Calendar</div>
          <div className="text-slate-500 text-[11px]">
            Status: Connected (demo)
          </div>
          <div className="text-slate-500 text-[11px]">
            Tools: get_calendar_events, create_calendar_event (see
            TOOLS_AND_INTEGRATIONS.md).
          </div>
          <button className="mt-2 px-3 py-1 text-[11px] rounded border border-slate-700 hover:bg-slate-900">
            Test create event
          </button>
        </div>
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 space-y-1">
          <div className="font-medium text-slate-100 text-sm">
            OpenEvidence / PubMed
          </div>
          <div className="text-slate-500 text-[11px]">
            Status: Not configured
          </div>
          <div className="text-slate-500 text-[11px]">
            Configure API keys and routing behaviour in the backend settings.
          </div>
          <button className="mt-2 px-3 py-1 text-[11px] rounded border border-slate-700 hover:bg-slate-900">
            Configure
          </button>
        </div>
      </div>
    </section>
  );
}
