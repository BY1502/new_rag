import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from '../components/ui/Icon';

const ToastContext = createContext();

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const STYLES = {
  success: 'border-l-green-500 bg-green-50 dark:bg-green-900/20',
  error: 'border-l-red-500 bg-red-50 dark:bg-red-900/20',
  warning: 'border-l-amber-500 bg-amber-50 dark:bg-amber-900/20',
  info: 'border-l-blue-500 bg-blue-50 dark:bg-blue-900/20',
  confirm: 'border-l-gray-400 bg-white dark:bg-gray-800',
};

const ICON_COLORS = {
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
  confirm: 'text-gray-500',
};

let toastId = 0;

function ToastItem({ toast, onRemove }) {
  const Icon = ICONS[toast.type] || Info;
  const progressRef = useRef(null);

  return (
    <div className={`relative flex items-start gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 shadow-lg backdrop-blur-sm min-w-[320px] max-w-[420px] animate-toastIn ${STYLES[toast.type] || STYLES.info}`}>
      <Icon size={18} className={`shrink-0 mt-0.5 ${ICON_COLORS[toast.type] || ICON_COLORS.info}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{toast.message}</p>
        {toast.type === 'confirm' && (
          <div className="flex items-center gap-2 mt-2.5">
            <button
              onClick={() => { toast.onCancel?.(); onRemove(toast.id); }}
              className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              취소
            </button>
            <button
              onClick={() => { toast.onConfirm?.(); onRemove(toast.id); }}
              className="px-3 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
            >
              {toast.confirmLabel || '확인'}
            </button>
          </div>
        )}
      </div>
      <button onClick={() => onRemove(toast.id)} className="shrink-0 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
        <X size={14} />
      </button>
      {toast.type !== 'confirm' && toast.duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl overflow-hidden">
          <div
            ref={progressRef}
            className="h-full bg-current opacity-20 animate-shrinkWidth"
            style={{ animationDuration: `${toast.duration}ms` }}
          />
        </div>
      )}
    </div>
  );
}

function ToastContainer({ toasts, onRemove }) {
  return createPortal(
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.slice(0, 5).map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onRemove={onRemove} />
        </div>
      ))}
    </div>,
    document.body
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((type, message, options = {}) => {
    const id = ++toastId;
    const duration = options.duration ?? (type === 'confirm' ? 0 : 3000);
    const toast = { id, type, message, duration, ...options };
    setToasts(prev => [toast, ...prev]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
    return id;
  }, [removeToast]);

  const toast = useCallback((message, type = 'success') => {
    return addToast(type, message);
  }, [addToast]);

  toast.success = (message, opts) => addToast('success', message, opts);
  toast.error = (message, opts) => addToast('error', message, opts);
  toast.warning = (message, opts) => addToast('warning', message, opts);
  toast.info = (message, opts) => addToast('info', message, opts);

  const confirm = useCallback((message, onConfirm, options = {}) => {
    return addToast('confirm', message, {
      onConfirm,
      onCancel: options.onCancel,
      confirmLabel: options.confirmLabel || '확인',
      duration: 0,
    });
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
