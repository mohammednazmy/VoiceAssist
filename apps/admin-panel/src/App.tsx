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
