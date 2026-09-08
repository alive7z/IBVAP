import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { CheckCircleIcon, AlertTriangleIcon, InfoIcon, XIcon } from "./Icons";

const ToastContext = createContext(null);

const toneStyles = {
  success: { wrap: "border-green-200 bg-white dark:bg-slate-100 dark:border-green-500/40", icon: <CheckCircleIcon size={17} className="text-green-600" /> },
  error: { wrap: "border-red-200 bg-white dark:bg-slate-100 dark:border-red-500/40", icon: <AlertTriangleIcon size={17} className="text-red-600" /> },
  info: { wrap: "border-slate-200 bg-white dark:bg-slate-100 dark:border-slate-600", icon: <InfoIcon size={17} className="text-slate-500 dark:text-slate-400" /> },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((message, tone = "success") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => dismiss(id), 3500);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="fixed right-4 top-4 z-[1000] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const s = toneStyles[t.tone] || toneStyles.info;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 shadow-lift animate-[toastIn_0.2s_ease-out] ${s.wrap}`}
              role="status"
            >
              <span className="mt-0.5 shrink-0">{s.icon}</span>
              <p className="flex-1 text-sm text-slate-700 dark:text-slate-200">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="btn-focus shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:text-slate-600"
                aria-label="Dismiss notification"
              >
                <XIcon size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
