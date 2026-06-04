import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { ToastContext, type Toast, type ToastApi, type ToastType } from '../hooks/useToast';

const DEFAULT_DURATION = 4000;

const ICONS: Record<ToastType, ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5" />,
  error: <AlertCircle className="w-5 h-5" />,
  info: <Info className="w-5 h-5" />,
  warning: <AlertTriangle className="w-5 h-5" />,
};

const TYPE_CLASSES: Record<ToastType, string> = {
  success: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
  error: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
  info: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
  warning: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200',
};

const ICON_CLASSES: Record<ToastType, string> = {
  success: 'text-green-500 dark:text-green-400',
  error: 'text-red-500 dark:text-red-400',
  info: 'text-blue-500 dark:text-blue-400',
  warning: 'text-yellow-500 dark:text-yellow-400',
};

let counter = 0;
const nextId = () => `toast-${++counter}-${Date.now()}`;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (type: ToastType, message: string, duration = DEFAULT_DURATION): string => {
      const id = nextId();
      setToasts((prev) => [...prev, { id, type, message, duration }]);
      if (duration > 0) {
        const timer = window.setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };
  }, []);

  const api: ToastApi = {
    success: (msg, dur) => push('success', msg, dur),
    error: (msg, dur) => push('error', msg, dur),
    info: (msg, dur) => push('info', msg, dur),
    warning: (msg, dur) => push('warning', msg, dur),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 min-w-72 max-w-sm border rounded-lg shadow-lg px-4 py-3 ${TYPE_CLASSES[t.type]}`}
        >
          <div className={`flex-shrink-0 mt-0.5 ${ICON_CLASSES[t.type]}`}>{ICONS[t.type]}</div>
          <div className="flex-1 text-sm break-words">{t.message}</div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
            className="flex-shrink-0 -mr-1 -mt-1 p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
