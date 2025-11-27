import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface LayoutProps {
  children: ReactNode;
}

export function AdminLayoutWithRouter({ children }: LayoutProps) {
  const { user, logout, role, isViewer } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-2 border-b border-slate-900 hover:bg-slate-900 transition-colors ${
      isActive ? 'bg-slate-900 text-blue-400 border-l-2 border-l-blue-500' : 'text-slate-300'
    }`;

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-50">
      <aside className="w-64 border-r border-slate-800 bg-slate-950/90 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-800">
          <div className="font-semibold text-sm tracking-tight">VoiceAssist Admin</div>
          <div className="text-[11px] text-slate-500">Control Panel • v2.0</div>
          {isViewer && (
            <div className="text-[11px] text-amber-400 mt-1">Read-only viewer</div>
          )}
        </div>

        <nav className="flex-1 text-sm">
          <NavLink to="/dashboard" className={navLinkClass}>
            📊 Dashboard
          </NavLink>
          <NavLink to="/users" className={navLinkClass}>
            👥 Users
          </NavLink>
          <NavLink to="/knowledge-base" className={navLinkClass}>
            📚 Knowledge Base
          </NavLink>
          <NavLink to="/analytics" className={navLinkClass}>
            📈 Analytics
          </NavLink>
          <NavLink to="/system" className={navLinkClass}>
            ⚙️ System Config
          </NavLink>
        </nav>

        <div className="border-t border-slate-800 p-4 space-y-2">
          <div className="text-xs text-slate-400">
            Logged in as:
            <div className="mt-1 font-medium text-slate-300 truncate">
              {user?.email}
            </div>
            <div className="mt-1 inline-flex items-center gap-2 px-2 py-1 rounded border border-slate-700 text-[11px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" aria-hidden />
              {role === 'viewer' ? 'Viewer (read-only)' : 'Admin'}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
          >
            Logout
          </button>
        </div>

        <div className="px-4 py-3 text-[10px] text-slate-500 border-t border-slate-800">
          HIPAA Compliant • Production Ready
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
