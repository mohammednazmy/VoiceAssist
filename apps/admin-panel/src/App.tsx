import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminLayoutWithRouter } from "./components/AdminLayoutWithRouter";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { LoginPage } from "./pages/LoginPage";

// Lazy load all pages for code splitting
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const UsersPage = lazy(() =>
  import("./pages/UsersPage").then((m) => ({ default: m.UsersPage })),
);
const KnowledgeBasePage = lazy(() =>
  import("./pages/KnowledgeBasePage").then((m) => ({
    default: m.KnowledgeBasePage,
  })),
);
const SystemPage = lazy(() =>
  import("./pages/SystemPage").then((m) => ({ default: m.SystemPage })),
);
const AnalyticsPage = lazy(() =>
  import("./pages/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })),
);
const VoiceMonitorPage = lazy(() =>
  import("./pages/VoiceMonitorPage").then((m) => ({
    default: m.VoiceMonitorPage,
  })),
);
const IntegrationsPage = lazy(() =>
  import("./pages/IntegrationsPage").then((m) => ({
    default: m.IntegrationsPage,
  })),
);
const SecurityPage = lazy(() =>
  import("./pages/SecurityPage").then((m) => ({ default: m.SecurityPage })),
);
const ToolsPage = lazy(() =>
  import("./pages/ToolsPage").then((m) => ({ default: m.ToolsPage })),
);
const TroubleshootingPage = lazy(() =>
  import("./pages/TroubleshootingPage").then((m) => ({
    default: m.TroubleshootingPage,
  })),
);
const BackupsPage = lazy(() =>
  import("./pages/BackupsPage").then((m) => ({ default: m.BackupsPage })),
);
const FeatureFlagsPage = lazy(() =>
  import("./pages/FeatureFlagsPage").then((m) => ({
    default: m.FeatureFlagsPage,
  })),
);
const PromptsPage = lazy(() =>
  import("./pages/prompts").then((m) => ({ default: m.PromptsPage })),
);
const CalendarConnectionsPage = lazy(() =>
  import("./pages/CalendarConnectionsPage").then((m) => ({
    default: m.CalendarConnectionsPage,
  })),
);
const FunctionCallAnalyticsPage = lazy(() =>
  import("./pages/FunctionCallAnalyticsPage").then((m) => ({
    default: m.FunctionCallAnalyticsPage,
  })),
);
const ConversationsPage = lazy(() =>
  import("./pages/ConversationsPage").then((m) => ({
    default: m.ConversationsPage,
  })),
);
const ConversationDetailPage = lazy(() =>
  import("./pages/ConversationDetailPage").then((m) => ({
    default: m.ConversationDetailPage,
  })),
);
const ClinicalContextsPage = lazy(() =>
  import("./pages/ClinicalContextsPage").then((m) => ({
    default: m.ClinicalContextsPage,
  })),
);
const OrganizationsPage = lazy(() =>
  import("./pages/OrganizationsPage").then((m) => ({
    default: m.OrganizationsPage,
  })),
);
const LearningPage = lazy(() =>
  import("./pages/LearningPage").then((m) => ({
    default: m.LearningPage,
  })),
);

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
        <span className="text-sm text-slate-400">Loading...</span>
      </div>
    </div>
  );
}

export function App() {
  console.log("[App] App component rendering");
  console.log("[App] window.location.href:", window.location.href);
  console.log("[App] window.location.origin:", window.location.origin);
  console.log("[App] window.location.pathname:", window.location.pathname);
  return (
    <ErrorBoundary>
      <BrowserRouter basename="/admin">
        <AuthProvider>
          <Routes>
            {/* Public route */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected admin routes */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AdminLayoutWithRouter>
                    <Suspense fallback={<PageLoader />}>
                      <Routes>
                        <Route path="/dashboard" element={<DashboardPage />} />
                        <Route path="/users" element={<UsersPage />} />
                        <Route
                          path="/conversations"
                          element={<ConversationsPage />}
                        />
                        <Route
                          path="/conversations/:conversationId"
                          element={<ConversationDetailPage />}
                        />
                        <Route
                          path="/clinical-contexts"
                          element={<ClinicalContextsPage />}
                        />
                        <Route
                          path="/knowledge-base"
                          element={<KnowledgeBasePage />}
                        />
                        <Route path="/analytics" element={<AnalyticsPage />} />
                        <Route path="/system" element={<SystemPage />} />
                        <Route path="/voice" element={<VoiceMonitorPage />} />
                        <Route
                          path="/integrations"
                          element={<IntegrationsPage />}
                        />
                        <Route path="/security" element={<SecurityPage />} />
                        <Route path="/tools" element={<ToolsPage />} />
                        <Route
                          path="/calendar-connections"
                          element={<CalendarConnectionsPage />}
                        />
                        <Route
                          path="/function-analytics"
                          element={<FunctionCallAnalyticsPage />}
                        />
                        <Route
                          path="/feature-flags"
                          element={<FeatureFlagsPage />}
                        />
                        <Route path="/prompts" element={<PromptsPage />} />
                        <Route
                          path="/troubleshooting"
                          element={<TroubleshootingPage />}
                        />
                        <Route path="/backups" element={<BackupsPage />} />
                        <Route
                          path="/organizations"
                          element={<OrganizationsPage />}
                        />
                        <Route path="/learning" element={<LearningPage />} />
                        <Route
                          path="/"
                          element={<Navigate to="/dashboard" replace />}
                        />
                        <Route
                          path="*"
                          element={<Navigate to="/dashboard" replace />}
                        />
                      </Routes>
                    </Suspense>
                  </AdminLayoutWithRouter>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
