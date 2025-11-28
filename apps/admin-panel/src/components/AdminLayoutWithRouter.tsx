import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocaleSwitcher } from "@voiceassist/ui";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";

interface LayoutProps {
  children: ReactNode;
}

export function AdminLayoutWithRouter({ children }: LayoutProps) {
  const { user, logout, role, isViewer } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { supportedLanguages } = useLanguage();

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
      <aside className="w-64 border-r border-slate-800 bg-slate-950/90 flex flex-col">
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

        <nav className="flex-1 text-sm">
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

      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
