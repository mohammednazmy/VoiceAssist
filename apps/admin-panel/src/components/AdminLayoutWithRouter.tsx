import { ReactNode, useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocaleSwitcher } from "@voiceassist/ui";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { SessionTimeoutWarning } from "./session/SessionTimeoutWarning";

interface LayoutProps {
  children: ReactNode;
}

export function AdminLayoutWithRouter({ children }: LayoutProps) {
  const { user, logout, role, isViewer } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { supportedLanguages } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-2 border-b border-slate-900 hover:bg-slate-900 transition-colors ${
      isActive
        ? "bg-slate-900 text-blue-400 border-l-2 border-l-blue-500"
        : "text-slate-300"
    }`;

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-50">
      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile header with hamburger */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-slate-950 border-b border-slate-800 flex items-center px-4 z-30 md:hidden">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 -ml-2 text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Toggle navigation menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? (
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          )}
        </button>
        <div className="ml-3 font-semibold text-sm">{t("meta.app")}</div>
        {isViewer && (
          <span className="ml-2 text-[10px] text-amber-400 bg-amber-950/50 px-1.5 py-0.5 rounded">
            Viewer
          </span>
        )}
      </header>

      {/* Sidebar - hidden on mobile by default, slide-in when open */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50
          w-64 border-r border-slate-800 bg-slate-950 flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        <div className="px-4 py-4 border-b border-slate-800">
          <div className="font-semibold text-sm tracking-tight">
            {t("meta.app")}
          </div>
          <div className="text-[11px] text-slate-500">{t("meta.tagline")}</div>
          {isViewer && (
            <div className="text-[11px] text-amber-400 mt-1">
              Read-only viewer
            </div>
          )}
          <div className="mt-3">
            <LocaleSwitcher languages={supportedLanguages} />
          </div>
        </div>

        <nav className="flex-1 text-sm overflow-y-auto">
          <NavLink to="/dashboard" className={navLinkClass}>
            📊 {t("nav.dashboard")}
          </NavLink>
          <NavLink to="/users" className={navLinkClass}>
            👥 {t("nav.users")}
          </NavLink>
          <NavLink to="/knowledge-base" className={navLinkClass}>
            📚 {t("nav.knowledge")}
          </NavLink>
          <NavLink to="/analytics" className={navLinkClass}>
            📈 {t("nav.analytics")}
          </NavLink>
          <NavLink to="/voice" className={navLinkClass}>
            🎙️ {t("nav.voice", "Voice Monitor")}
          </NavLink>
          <NavLink to="/integrations" className={navLinkClass}>
            🔗 {t("nav.integrations", "Integrations")}
          </NavLink>
          <NavLink to="/security" className={navLinkClass}>
            🔒 {t("nav.security", "Security & PHI")}
          </NavLink>
          <NavLink to="/tools" className={navLinkClass}>
            🔧 {t("nav.tools", "Tools")}
          </NavLink>
          <NavLink to="/feature-flags" className={navLinkClass}>
            🚩 {t("nav.featureFlags", "Feature Flags")}
          </NavLink>
          <NavLink to="/prompts" className={navLinkClass}>
            📝 {t("nav.prompts", "Prompts")}
          </NavLink>
          <NavLink to="/system" className={navLinkClass}>
            ⚙️ {t("nav.system")}
          </NavLink>
          <NavLink to="/backups" className={navLinkClass}>
            💾 {t("nav.backups", "Backups & DR")}
          </NavLink>
          <NavLink to="/troubleshooting" className={navLinkClass}>
            🔍 {t("nav.troubleshooting", "Troubleshooting")}
          </NavLink>
        </nav>

        <div className="border-t border-slate-800 p-4 space-y-2">
          <div className="text-xs text-slate-400">
            Logged in as:
            <div className="mt-1 font-medium text-slate-300 truncate">
              {user?.email}
            </div>
            <div className="mt-1 inline-flex items-center gap-2 px-2 py-1 rounded border border-slate-700 text-[11px] text-slate-400">
              <span
                className="h-1.5 w-1.5 rounded-full bg-slate-500"
                aria-hidden
              />
              {role === "viewer" ? "Viewer (read-only)" : "Admin"}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
          >
            {t("nav.logout")}
          </button>
        </div>

        <div className="px-4 py-3 text-[10px] text-slate-500 border-t border-slate-800">
          {t("meta.hipaa")}
        </div>
      </aside>

      {/* Main content - add top padding on mobile for fixed header */}
      <main className="flex-1 flex flex-col overflow-hidden pt-14 md:pt-0">
        {children}
      </main>

      {/* Session timeout warning modal */}
      <SessionTimeoutWarning />
    </div>
  );
}
