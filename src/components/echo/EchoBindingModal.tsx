import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { EchoEntity, EchoPersistentReference } from './types';
import { Sparkles, Search, Check, X, Shield, MapPin, Users, BookOpen } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface EchoBindingModalProps {
  isOpen: boolean;
  matchedText: string;
  span: { from: number; to: number };
  position?: { top: number; left: number };
  candidates: EchoEntity[];
  existingReference?: EchoPersistentReference | null;
  onConfirm: (entity: EchoEntity, span: { from: number; to: number; matchedText: string }) => void;
  onDismiss: () => void;
}

export const EchoBindingModal: React.FC<EchoBindingModalProps> = ({
  isOpen,
  matchedText,
  span,
  position,
  candidates,
  existingReference,
  onConfirm,
  onDismiss,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onDismiss]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onDismiss]);

  const filteredEntities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const matchName = c.name.toLowerCase().includes(q);
      const matchAlias = c.aliases?.some((a) => a.toLowerCase().includes(q));
      const matchCat = c.category.toLowerCase().includes(q);
      const matchDesc = c.description.toLowerCase().includes(q);
      return matchName || matchAlias || matchCat || matchDesc;
    });
  }, [candidates, searchQuery]);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredEntities.length ? (prev + 1) % filteredEntities.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredEntities.length ? (prev - 1 + filteredEntities.length) % filteredEntities.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredEntities[selectedIndex]) {
        onConfirm(filteredEntities[selectedIndex], { ...span, matchedText });
      }
    }
  };

  if (!isOpen) return null;

  const safeLeft = position
    ? Math.max(16, Math.min(position.left - 140, window.innerWidth - Math.min(420, window.innerWidth - 32) - 16))
    : Math.max(16, (window.innerWidth - 420) / 2);
  const safeTop = position
    ? Math.max(16, Math.min(position.top + 28, window.innerHeight - 440))
    : 120;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'character':
        return <Users className="w-3.5 h-3.5 text-primary" />;
      case 'location':
        return <MapPin className="w-3.5 h-3.5 text-primary" />;
      case 'faction':
        return <Shield className="w-3.5 h-3.5 text-primary" />;
      default:
        return <BookOpen className="w-3.5 h-3.5 text-primary" />;
    }
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Bind Lorebook Reference"
      className="fixed z-50 w-[420px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] flex flex-col rounded-xl border border-primary/50 bg-card/95 p-4 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 select-none text-foreground font-sans"
      style={{ top: `${safeTop}px`, left: `${safeLeft}px` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-border/70 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {existingReference ? 'Change Reference Target' : 'Bind Reference to Lorebook'}
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Target Word Indicator */}
      <div className="text-xs text-muted-foreground mb-3 bg-muted/30 p-2 rounded-lg border border-border/50">
        Selected Text:{' '}
        <strong className="text-foreground font-semibold px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
          "{matchedText}"
        </strong>{' '}
        <span className="text-[11px] text-muted-foreground">
          (Offset: {span.from}..{span.to})
        </span>
      </div>

      {/* Search Bar */}
      <div className="relative mb-3">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="Search characters, factions, locations..."
          className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Entity Candidate List */}
      <div className="space-y-1.5 mb-3 max-h-56 overflow-y-auto pr-1">
        {filteredEntities.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            No matching lore entities found in this realm.
          </div>
        ) : (
          filteredEntities.map((cand, idx) => {
            const isSelected = idx === selectedIndex;
            const isCurrentlyBound = existingReference && (existingReference.targetId === cand.id || existingReference.entityId === cand.id);

            return (
              <div
                key={cand.id}
                onClick={() => onConfirm(cand, { ...span, matchedText })}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={cn(
                  'p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2 text-xs',
                  isSelected
                    ? 'border-primary/60 bg-primary/10 shadow-sm'
                    : 'border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-border'
                )}
              >
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {getCategoryIcon(cand.category)}
                    <span className="font-semibold text-foreground truncate">{cand.name}</span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-muted/60 text-muted-foreground border border-border/40 shrink-0">
                      {cand.category}
                    </span>
                    {isCurrentlyBound && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-primary/20 text-primary border border-primary/30 shrink-0">
                        Current Target
                      </span>
                    )}
                  </div>
                  {cand.description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-1">
                      {cand.description}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onConfirm(cand, { ...span, matchedText });
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 shrink-0',
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/60 text-muted-foreground hover:bg-primary/20 hover:text-foreground'
                  )}
                >
                  <Check className="w-3 h-3" />
                  <span>Bind</span>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Helper */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/60">
        <span>Press <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] border border-border font-mono">Enter</kbd> to confirm</span>
        <span><kbd className="px-1 py-0.5 rounded bg-muted text-[10px] border border-border font-mono">Esc</kbd> to cancel</span>
      </div>
    </div>
  );
};
