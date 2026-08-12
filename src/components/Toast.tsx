import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Global event bus fallback so showToast can be called outside React tree if necessary
type ToastListener = (message: string, type: ToastType) => void;
let globalToastListener: ToastListener | null = null;

export const triggerGlobalToast = (message: string, type: ToastType = 'info') => {
  if (globalToastListener) {
    globalToastListener(message, type);
  }
};

const TOAST_STYLES: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: {
    bg: 'bg-[var(--success-bg)]',
    border: 'border-[var(--success)]',
    text: 'text-[var(--success)]',
    icon: 'text-[var(--success)]',
  },
  error: {
    bg: 'bg-[var(--error-bg)]',
    border: 'border-[var(--error)]',
    text: 'text-[var(--error)]',
    icon: 'text-[var(--error)]',
  },
  warning: {
    bg: 'bg-[var(--warning-bg)]',
    border: 'border-[var(--warning)]',
    text: 'text-[var(--warning)]',
    icon: 'text-[var(--warning)]',
  },
  info: {
    bg: 'bg-[var(--info-bg)]',
    border: 'border-[var(--info)]',
    text: 'text-[var(--info)]',
    icon: 'text-[var(--info)]',
  },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    let id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  React.useEffect(() => {
    globalToastListener = showToast;
    return () => {
      globalToastListener = null;
    };
  }, [showToast]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Floating Toast Banners Container */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => {
          const style = TOAST_STYLES[toast.type];
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center justify-between gap-3 p-4 rounded-xl shadow-lg border-l-4 ${style.bg} ${style.border} ${style.text} animate-fadeIn`}
            >
              <div className="flex items-center gap-3">
                {toast.type === 'success' && <CheckCircle2 className={`w-5 h-5 shrink-0 ${style.icon}`} />}
                {toast.type === 'error' && <AlertCircle className={`w-5 h-5 shrink-0 ${style.icon}`} />}
                {toast.type === 'warning' && <AlertTriangle className={`w-5 h-5 shrink-0 ${style.icon}`} />}
                {toast.type === 'info' && <Info className={`w-5 h-5 shrink-0 ${style.icon}`} />}
                <span className={`text-sm font-medium leading-snug ${style.text}`}>{toast.message}</span>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className={`p-1.5 rounded-lg hover:bg-black/5 transition ${style.text}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: (message: string, type: ToastType = 'info') => triggerGlobalToast(message, type),
    };
  }
  return context;
};
