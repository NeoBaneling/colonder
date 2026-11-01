import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastType = 'success' | 'error';

type ToastMessage = {
  id: number;
  type: ToastType;
  title: string;
  description: string;
};

type ToastInput = Omit<ToastMessage, 'id'>;

type ToastContextValue = {
  success: (title: string, description: string) => void;
  failure: (title: string, description: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ToastItem = ({
  toast,
  dismiss,
}: {
  toast: ToastMessage;
  dismiss: (id: number) => void;
}) => {
  useEffect(() => {
    const timeout = window.setTimeout(() => dismiss(toast.id), 5000);
    return () => window.clearTimeout(timeout);
  }, [dismiss, toast.id]);

  return (
    <div
      className={`toast toast-${toast.type}`}
      role={toast.type === 'success' ? 'status' : 'alert'}
      aria-atomic="true"
    >
      <span className="toast-icon" aria-hidden="true">
        <i
          className={`bi ${toast.type === 'success' ? 'bi-check-lg' : 'bi-exclamation-lg'}`}
        />
      </span>
      <div className="toast-copy">
        <strong>{toast.title}</strong>
        <p>{toast.description}</p>
      </div>
      <button
        type="button"
        className="toast-dismiss"
        aria-label={`Dismiss ${toast.title}`}
        onClick={() => dismiss(toast.id)}
      >
        <i className="bi bi-x-lg" aria-hidden="true" />
      </button>
      <span className="toast-progress" aria-hidden="true" />
    </div>
  );
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((toast: ToastInput) => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { ...toast, id }].slice(-3));
  }, []);

  const success = useCallback(
    (title: string, description: string) =>
      addToast({ type: 'success', title, description }),
    [addToast],
  );
  const failure = useCallback(
    (title: string, description: string) =>
      addToast({ type: 'error', title, description }),
    [addToast],
  );

  return (
    <ToastContext.Provider value={{ success, failure }}>
      {children}
      <div className="toast-viewport" aria-label="Notifications">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === null) {
    throw new Error('useToast must be used within a ToastProvider.');
  }
  return context;
};
