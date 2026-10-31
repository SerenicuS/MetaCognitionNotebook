import React, { useState, useMemo, useEffect } from 'react';
import type { EchoPersistentReference, EchoEntity } from './types';
import {
  X,
  Search,
  ExternalLink,
  Trash2,
  Edit2,
  Wrench,
  AlertTriangle,
  FileText,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '../../utils/cn';

export interface EchoReferencesDrawerProps {
  isOpen: boolean;
  documentTitle: string;
  references: EchoPersistentReference[];
  detachedReferences: EchoPersistentReference[];
  scopedEntities: EchoEntity[];
  onJumpTo: (ref: EchoPersistentReference) => void;
  onChangeTarget: (ref: EchoPersistentReference) => void;
  onRemoveReference: (id: string) => void;
  onRepairAnchor?: (ref: EchoPersistentReference) => void;
  onRemoveAllUnresolved?: () => void;
  onClose: () => void;
}

type FilterTab = 'all' | 'active' | 'unresolved' | 'detached';

export const EchoReferencesDrawer: React.FC<EchoReferencesDrawerProps> = ({
  isOpen,
  documentTitle,
  references,
  detachedReferences,
  scopedEntities,
  onJumpTo,
  onChangeTarget,
  onRemoveReference,
  onRepairAnchor,
  onRemoveAllUnresolved,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Combine active and detached references
  const allReferences = useMemo(() => {
    return [...references, ...detachedReferences];
  }, [references, detachedReferences]);

  const entityMap = useMemo(() => {
    const map = new Map<string, EchoEntity>();
    for (const ent of scopedEntities) {
      map.set(ent.id, ent);
    }
    return map;
  }, [scopedEntities]);

  const counts = useMemo(() => {
    const active = references.filter((r) => r.status === 'active').length;
    const unresolved = references.filter((r) => r.status === 'unresolved').length;
    const detached = detachedReferences.length;
    return { all: allReferences.length, active, unresolved, detached };
  }, [references, detachedReferences, allReferences]);

  const filteredReferences = useMemo(() => {
    let list = allReferences;

    if (activeTab === 'active') {
      list = list.filter((r) => r.status === 'active');
    } else if (activeTab === 'unresolved') {
      list = list.filter((r) => r.status === 'unresolved');
    } else if (activeTab === 'detached') {
      list = list.filter((r) => r.status === 'detached');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        const ent = entityMap.get(r.targetId || r.entityId || '');
        const targetName = ent?.name.toLowerCase() || '';
        const word = r.matchedText.toLowerCase();
        return word.includes(q) || targetName.includes(q);
      });
    }

    return list;
  }, [allReferences, activeTab, searchQuery, entityMap]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Manage Document References"
      className="fixed inset-y-0 right-0 z-50 w-96 max-w-[calc(100vw-1rem)] bg-card border-l border-border/70 shadow-2xl flex flex-col backdrop-blur-md select-none text-foreground font-sans animate-in slide-in-from-right duration-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/60 bg-muted/20">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Document References
            </h2>
            <p className="text-[11px] text-muted-foreground truncate max-w-[240px]">
              {documentTitle || 'Current Draft'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-2 bg-muted/10 border-b border-border/40 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={cn(
            'px-2 py-1 rounded font-medium transition-colors',
            activeTab === 'all'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          All ({counts.all})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={cn(
            'px-2 py-1 rounded font-medium transition-colors',
            activeTab === 'active'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Active ({counts.active})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('unresolved')}
          className={cn(
            'px-2 py-1 rounded font-medium transition-colors flex items-center gap-1',
            activeTab === 'unresolved'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-amber-500 hover:text-amber-400'
          )}
        >
          <span>Unresolved ({counts.unresolved})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('detached')}
          className={cn(
            'px-2 py-1 rounded font-medium transition-colors flex items-center gap-1',
            activeTab === 'detached'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span>Detached ({counts.detached})</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="p-3 border-b border-border/40">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search references or entities..."
            className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* References List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filteredReferences.length === 0 ? (
          <div className="text-center py-12 text-xs text-muted-foreground space-y-1">
            <FileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="font-medium">No references found.</p>
            <p className="text-[11px]">Select any pronoun or phrase in the editor and press <kbd className="px-1 py-0.5 rounded bg-muted border border-border">Mod-Shift-B</kbd> to bind lore.</p>
          </div>
        ) : (
          filteredReferences.map((ref) => {
            const target = entityMap.get(ref.targetId || ref.entityId || '');
            const isDetached = ref.status === 'detached';
            const isUnresolved = ref.status === 'unresolved';

            return (
              <div
                key={ref.id}
                className={cn(
                  'p-2.5 rounded-lg border transition-all text-xs flex flex-col gap-2',
                  isDetached
                    ? 'border-border/60 bg-muted/20 opacity-80'
                    : isUnresolved
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-border/70 bg-card hover:border-primary/40'
                )}
              >
                {/* Header row: Text & Status */}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-foreground px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                      "{ref.matchedText}"
                    </span>
                    {!isDetached && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        pos {ref.from}..{ref.to}
                      </span>
                    )}
                  </div>

                  {/* Status Pill */}
                  {isDetached ? (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border flex items-center gap-0.5 shrink-0">
                      <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                      <span>Detached</span>
                    </span>
                  ) : isUnresolved ? (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-0.5 shrink-0">
                      <ShieldAlert className="w-2.5 h-2.5 text-amber-400" />
                      <span>Missing Target</span>
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-0.5 shrink-0">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                      <span>Active</span>
                    </span>
                  )}
                </div>

                {/* Target Information */}
                <div className="text-[11px] text-muted-foreground">
                  {target ? (
                    <div className="flex items-center gap-1">
                      <span>Targets:</span>
                      <strong className="text-foreground font-medium truncate">
                        {target.name}
                      </strong>
                      <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-muted border border-border/40">
                        {target.category}
                      </span>
                    </div>
                  ) : (
                    <div className="text-amber-400/90 text-[10px] flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        Target UUID ({ref.targetId || ref.entityId}) is not in active realm
                      </span>
                    </div>
                  )}
                </div>

                {/* Context Snippet */}
                {ref.anchor && (ref.anchor.before || ref.anchor.after) && (
                  <div className="text-[10px] text-muted-foreground/75 bg-muted/30 p-1.5 rounded border border-border/30 font-mono truncate">
                    ...{ref.anchor.before}[<strong className="text-foreground">{ref.matchedText}</strong>]{ref.anchor.after}...
                  </div>
                )}

                {/* Action Toolbar */}
                <div className="flex items-center justify-between pt-1 border-t border-border/30 text-[11px]">
                  <div className="flex items-center gap-1">
                    {!isDetached && (
                      <button
                        type="button"
                        onClick={() => onJumpTo(ref)}
                        className="px-2 py-0.5 rounded bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                        title="Scroll to text in editor"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Jump</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onChangeTarget(ref)}
                      className="px-2 py-0.5 rounded bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                      title="Change target lore entity"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Retarget</span>
                    </button>
                    {isDetached && onRepairAnchor && (
                      <button
                        type="button"
                        onClick={() => onRepairAnchor(ref)}
                        className="px-2 py-0.5 rounded bg-primary/20 hover:bg-primary/30 text-primary transition-colors flex items-center gap-1"
                        title="Re-anchor to current editor selection"
                      >
                        <Wrench className="w-3 h-3" />
                        <span>Repair</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveReference(ref.id)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Remove binding without deleting prose"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {(counts.unresolved > 0 || counts.detached > 0) && onRemoveAllUnresolved && (
        <div className="p-3 border-t border-border/60 bg-muted/20 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {counts.unresolved + counts.detached} damaged bindings
          </span>
          <button
            type="button"
            onClick={onRemoveAllUnresolved}
            className="px-2.5 py-1 rounded text-[11px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
          >
            Clear Damaged
          </button>
        </div>
      )}
    </div>
  );
};
