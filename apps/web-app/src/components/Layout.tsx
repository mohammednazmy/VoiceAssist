import type { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-50">
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-tight">VoiceAssist</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-700/60">
            clinician preview
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-300">
          <span>🔔</span>
          <span>Dr. Smith ▾</span>
          <button className="px-3 py-1 rounded border border-slate-700 hover:bg-slate-800 text-xs">
            Settings
          </button>
        </div>
      </header>
      <main className="flex-1 flex overflow-hidden">{children}</main>
      <footer className="px-6 py-2 text-xs text-slate-500 border-t border-slate-800">
        VoiceAssist V2 · Demo client · Not for clinical use
      </footer>
    </div>
  );
}
