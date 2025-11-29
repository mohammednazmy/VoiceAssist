import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminLayoutWithRouter } from "./components/AdminLayoutWithRouter";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UsersPage } from "./pages/UsersPage";
import { KnowledgeBasePage } from "./pages/KnowledgeBasePage";
import { SystemPage } from "./pages/SystemPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { VoiceMonitorPage } from "./pages/VoiceMonitorPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { SecurityPage } from "./pages/SecurityPage";
import { ToolsPage } from "./pages/ToolsPage";
import { TroubleshootingPage } from "./pages/TroubleshootingPage";
import { BackupsPage } from "./pages/BackupsPage";
import { FeatureFlagsPage } from "./pages/FeatureFlagsPage";
import { PromptsPage } from "./pages/prompts";

export function App() {
  return (
    <BrowserRouter>
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
                  <Routes>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/users" element={<UsersPage />} />
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
                      path="/"
                      element={<Navigate to="/dashboard" replace />}
                    />
                    <Route
                      path="*"
                      element={<Navigate to="/dashboard" replace />}
                    />
                  </Routes>
                </AdminLayoutWithRouter>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
