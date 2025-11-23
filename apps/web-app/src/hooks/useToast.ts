/**
 * useToast Hook
 * Manages toast notifications
 */

import { useState, useCallback } from "react";
import type { ToastType, ToastProps } from "../components/notifications/Toast";

let globalToastId = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const showToast = useCallback(
    (
      type: ToastType,
      message: string,
      description?: string,
      duration?: number,
    ) => {
      const id = `toast-${++globalToastId}`;

      const toast: ToastProps = {
        id,
        type,
        message,
        description,
        duration,
        onClose: (toastId) => {
          setToasts((prev) => prev.filter((t) => t.id !== toastId));
        },
      };

      setToasts((prev) => [...prev, toast]);

      return id;
    },
    [],
  );

  const success = useCallback(
    (message: string, description?: string, duration?: number) => {
      return showToast("success", message, description, duration);
    },
    [showToast],
  );

  const error = useCallback(
    (message: string, description?: string, duration?: number) => {
      return showToast("error", message, description, duration);
    },
    [showToast],
  );

  const warning = useCallback(
    (message: string, description?: string, duration?: number) => {
      return showToast("warning", message, description, duration);
    },
    [showToast],
  );

  const info = useCallback(
    (message: string, description?: string, duration?: number) => {
      return showToast("info", message, description, duration);
    },
    [showToast],
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  return {
    toasts,
    success,
    error,
    warning,
    info,
    dismiss,
    dismissAll,
  };
}
