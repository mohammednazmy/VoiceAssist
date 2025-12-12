import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { MainLayout } from "./components/layout/MainLayout";

// Loading component
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
        <p className="text-neutral-600">Loading...</p>
      </div>
    </div>
  );
}

// Lazy load pages for code splitting
const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })),
);
const ChatPage = lazy(() =>
  import("./pages/ChatPage").then((m) => ({ default: m.ChatPage })),
);
const HomePage = lazy(() =>
  import("./pages/HomePage").then((m) => ({ default: m.HomePage })),
);
const ProfilePage = lazy(() =>
  import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const DocumentsPage = lazy(() =>
  import("./pages/DocumentsPage").then((m) => ({ default: m.DocumentsPage })),
);
const DocumentViewerPage = lazy(() =>
  import("./pages/DocumentViewerPage").then((m) => ({
    default: m.DocumentViewerPage,
  })),
);
const ClinicalContextPage = lazy(() =>
  import("./pages/ClinicalContextPage").then((m) => ({
    default: m.ClinicalContextPage,
  })),
);
const OAuthCallbackPage = lazy(() =>
  import("./pages/OAuthCallbackPage").then((m) => ({
    default: m.OAuthCallbackPage,
  })),
);
const SharedConversationPage = lazy(() =>
  import("./pages/SharedConversationPage").then((m) => ({
    default: m.SharedConversationPage,
  })),
);
const IntegrationsPage = lazy(() =>
  import("./pages/IntegrationsPage").then((m) => ({
    default: m.IntegrationsPage,
  })),
);

// Redirect /admin routes to external/local admin panel (e.g. Docker gateway)
function AdminRedirect() {
  const location = useLocation();

  useEffect(() => {
    const adminUrlBase =
      import.meta.env.VITE_ADMIN_URL || "http://localhost:8080/admin";
    // Preserve the sub-path and query string when redirecting so that
    // deep links like /admin/knowledge-base?documentId=... reach the
    // corresponding route in the admin panel app.
    const suffix = location.pathname.replace(/^\/admin/, "");
    const target = `${adminUrlBase}${suffix || ""}${location.search || ""}`;
    window.location.href = target;
  }, [location.pathname]);

  return <PageLoader />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/auth/callback/:provider"
          element={<OAuthCallbackPage />}
        />
        <Route path="/shared/:token" element={<SharedConversationPage />} />

        {/* Protected routes */}
        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:conversationId" element={<ChatPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/:documentId" element={<DocumentViewerPage />} />
          <Route path="/clinical-context" element={<ClinicalContextPage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />

          {/* Admin routes - redirect to admin panel (Docker/Nginx gateway) */}
          <Route path="/admin/*" element={<AdminRedirect />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
