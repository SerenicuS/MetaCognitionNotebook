import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/utils/cn';

export type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextType {
  toast: (title: string, description?: string, type?: ToastType) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((title: string, description?: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, title, description, type }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const contextValue: ToastContextType = {
    toast: addToast,
    success: (title, desc) => addToast(title, desc, 'success'),
    error: (title, desc) => addToast(title, desc, 'error'),
    info: (title, desc) => addToast(title, desc, 'info'),
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg shadow-xl border text-sm backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-3',
              t.type === 'success' && 'bg-emerald-950/90 border-emerald-800/80 text-emerald-100',
              t.type === 'error' && 'bg-rose-950/90 border-rose-800/80 text-rose-100',
              t.type === 'info' && 'bg-card/95 border-primary/40 text-foreground'
            )}
          >
            {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />}
            {t.type === 'info' && <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />}

            <div className="flex-1 pr-2">
              <div className="font-medium text-xs tracking-wide uppercase">{t.title}</div>
              {t.description && <div className="text-xs opacity-80 mt-0.5 leading-relaxed">{t.description}</div>}
            </div>

            <button
              onClick={() => removeToast(t.id)}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};
