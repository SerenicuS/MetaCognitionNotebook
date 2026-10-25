import React, { useEffect, useRef } from 'react';
import type { EchoEntity } from './types';
import { HelpCircle, Check, X } from 'lucide-react';

interface EchoClarificationModalProps {
  matchedText: string;
  candidates: EchoEntity[];
  position: { top: number; left: number };
  onConfirm: (entity: EchoEntity) => void;
  onDismiss: () => void;
}

export const EchoClarificationModal: React.FC<EchoClarificationModalProps> = ({
  matchedText,
  candidates,
  position,
  onConfirm,
  onDismiss,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onDismiss]);

  const safeLeft = Math.min(Math.max(16, position.left - 140), window.innerWidth - 420);
  const safeTop = Math.min(position.top + 24, window.innerHeight - 360);
  const isAmbiguous = candidates.length > 1;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Clarify Lore Reference"
      className="fixed z-50 w-96 rounded-xl border border-primary/40 bg-card/95 p-4 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 select-none text-foreground font-sans"
      style={{ top: `${safeTop}px`, left: `${safeLeft}px` }}
    >
      {/* Title */}
      <div className="flex items-center justify-between pb-2.5 border-b border-border/70 mb-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isAmbiguous ? 'Clarify Lore Match' : 'Recognized Lore Term'}
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Explanation */}
      <p className="text-xs text-muted-foreground mb-3">
        The word <strong className="text-foreground font-semibold">"{matchedText}"</strong> matches{' '}
        {isAmbiguous ? (
          <span>
            <strong className="text-amber-400">{candidates.length} registered entities</strong> in{' '}
            Web of Thought. Which one did you mean?
          </span>
        ) : (
          <span>an existing entity in Web of Thought. Confirm to enable in-line reference documentation:</span>
        )}
      </p>

      {/* Candidate List */}
      <div className="space-y-2 mb-4 max-h-52 overflow-y-auto pr-1">
        {candidates.map((cand) => (
          <div
            key={cand.id}
            className="p-2.5 rounded-lg border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors flex flex-col gap-1 text-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <span className="capitalize font-semibold">{cand.name}</span>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                  {cand.category}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onConfirm(cand)}
                className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-semibold text-[11px] hover:bg-gold-hover hover:text-charcoal transition-colors flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                <span>Confirm</span>
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground line-clamp-2">
              {cand.description}
            </p>

            {Object.keys(cand.guidedAttributes).length > 0 && (
              <div className="flex items-center gap-2 pt-0.5 text-[10px] text-muted-foreground/80">
                {Object.entries(cand.guidedAttributes).slice(0, 2).map(([k, v]) => (
                  <span key={k}>
                    {k}: <strong className="text-foreground/80">{v}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Dismiss Action */}
      <div className="pt-2 border-t border-border/40 flex items-center justify-between">
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-muted-foreground hover:text-foreground font-medium underline-offset-2 hover:underline"
        >
          Keep as Ordinary Text (Dismiss)
        </button>

        <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono text-muted-foreground">
          Esc
        </kbd>
      </div>
    </div>
  );
};
