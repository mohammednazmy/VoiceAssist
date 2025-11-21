/**
 * Main Application Component
 * Sets up React Router with authentication and protected routes
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { HomePage } from './pages/HomePage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { MainLayout } from './components/layout/MainLayout';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<HomePage />} />
          <Route
            path="chat"
            element={
              <div className="text-center py-12">
                <h2 className="text-2xl font-bold text-neutral-900">Chat</h2>
                <p className="mt-2 text-neutral-600">Coming soon...</p>
              </div>
            }
          />
          <Route
            path="documents"
            element={
              <div className="text-center py-12">
                <h2 className="text-2xl font-bold text-neutral-900">Documents</h2>
                <p className="mt-2 text-neutral-600">Coming soon...</p>
              </div>
            }
          />
          <Route
            path="settings"
            element={
              <div className="text-center py-12">
                <h2 className="text-2xl font-bold text-neutral-900">Settings</h2>
                <p className="mt-2 text-neutral-600">Coming soon...</p>
              </div>
            }
          />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
