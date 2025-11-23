/**
 * Main Application Component
 * Performance-optimized with lazy loading and code splitting
 */

import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';
import { ToastProvider } from './contexts/ToastContext';

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </BrowserRouter>
  );
}
