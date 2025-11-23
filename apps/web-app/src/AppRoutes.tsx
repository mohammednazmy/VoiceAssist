/**
 * Performance Optimizations
 * Lazy loading routes for better code splitting
 */

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { MainLayout } from './components/layout/MainLayout';

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
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const ClinicalContextPage = lazy(() => import('./pages/ClinicalContextPage'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:conversationId" element={<ChatPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/clinical-context" element={<ClinicalContextPage />} />

          {/* Admin routes */}
          <Route path="/admin/*" element={<AdminDashboard />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
