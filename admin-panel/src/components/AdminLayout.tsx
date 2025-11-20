
import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-50">
      <aside className="w-64 border-r border-slate-800 bg-slate-950/90 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-800">
          <div className="font-semibold text-sm tracking-tight">VoiceAssist Admin</div>
          <div className="text-[11px] text-slate-500">Control center · demo</div>
        </div>
        <nav className="flex-1 text-sm">
          <a className="block px-4 py-2 border-b border-slate-900 hover:bg-slate-900" href="#">
            Dashboard
          </a>
          <a className="block px-4 py-2 border-b border-slate-900 hover:bg-slate-900" href="#kb">
            Knowledge Base
          </a>
          <a className="block px-4 py-2 border-b border-slate-900 hover:bg-slate-900" href="#tools">
            Tools & Integrations
          </a>
          <a className="block px-4 py-2 border-b border-slate-900 hover:bg-slate-900" href="#settings">
            Settings
          </a>
        </nav>
        <div className="px-4 py-3 text-[10px] text-slate-500 border-t border-slate-800">
          Not for clinical use · demo only
        </div>
      </aside>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
