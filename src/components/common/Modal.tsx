import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'max-w-xl',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Content */}
      <div
        className={cn(
          'relative w-full rounded-xl bg-card border border-border shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150',
          maxWidth
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between p-5 border-b border-border/60">
            <div>
              {title && <h2 className="text-lg font-serif font-semibold tracking-wide text-foreground">{title}</h2>}
              {description && <p className="text-[13px] text-muted-foreground mt-1 leading-normal">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-md transition-colors hover:bg-muted/50"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        )}

        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};
