/**
 * ToastContext
 * Global toast notification context
 */

import { createContext, useContext, type ReactNode } from "react";
import { useToast } from "../hooks/useToast";
import { ToastContainer } from "../components/notifications/ToastContainer";

interface ToastContextType {
  success: (message: string, description?: string, duration?: number) => string;
  error: (message: string, description?: string, duration?: number) => string;
  warning: (message: string, description?: string, duration?: number) => string;
  info: (message: string, description?: string, duration?: number) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const toast = useToast();

  return (
    <ToastContext.Provider
      value={{
        success: toast.success,
        error: toast.error,
        warning: toast.warning,
        info: toast.info,
        dismiss: toast.dismiss,
        dismissAll: toast.dismissAll,
      }}
    >
      {children}
      <ToastContainer toasts={toast.toasts} onClose={toast.dismiss} />
    </ToastContext.Provider>
  );
}

export function useToastContext() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToastContext must be used within ToastProvider");
  }
  return context;
}
