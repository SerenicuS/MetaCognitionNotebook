import {RelationshipFeedback,useRelationshipUndo} from './RelationshipFeedback';
import {requireSaved} from '@/utils/relationships';
import React, { useState, useMemo } from 'react';
import type { DocumentMetadata, LoreCategory } from '@/types';
import type { Plan, Thought } from '@/utils/thought';
import {
  validateAndCreateRelationship,
  archiveRelationshipInPlan,
  getEntityLinkedRelationships,
  getOtherEntityId,
  getUniverseEntities,
  getCategoryForEntryType,
  parseLoreMetadata,
  resolveLegacyEntityMatch,
  LORE_CATEGORIES,
} from '@/utils/universe';
import {
  Plus,
  X,
  Search,
  ExternalLink,
  AlertTriangle,
  Check,
  Sparkles,
  Link2,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/cn';

export interface EntityLinkFieldProps {
  currentDocId: string;
  universeId: string;
  plan: Plan | null;
  onSaveThought?: (
    expected: () => number,
    plan: import('@/utils/relationships').PlanMutation,
    acknowledge: (result: Thought) => void
  ) => Promise<boolean>;
  allDocuments: DocumentMetadata[];
  onNavigateToEntity: (id: string) => void;
  fieldLabel: string;
  icon?: LucideIcon;
  allowedCategories: LoreCategory[];
  relationshipLabel: string;
  matchingLabels?: string[];
  reciprocalLabels?: string[];
  isSource?: boolean;
  directed?: boolean;
  multiple?: boolean;
  legacyText?: string;
  onClearLegacyText?: () => void;
  mixedNotesValue?: string;
  onMixedNotesChange?: (notes: string) => void;
  mixedNotesPlaceholder?: string;
  onOpenCreateEntity?: (category: LoreCategory, initialName?: string) => void;
  readOnly?: boolean;
  descriptionHelp?: string;
}

export const EntityLinkField: React.FC<EntityLinkFieldProps> = ({
  currentDocId,
  universeId,
  plan,
  onSaveThought,
  allDocuments,
  onNavigateToEntity,
  fieldLabel,
  icon: FieldIcon = Link2,
  allowedCategories,
  relationshipLabel,
  matchingLabels = [],
  reciprocalLabels = [],
  isSource = true,
  directed = true,
  multiple = false,
  legacyText = '',
  onClearLegacyText,
  mixedNotesValue,
  onMixedNotesChange,
  mixedNotesPlaceholder,
  onOpenCreateEntity,
  readOnly = false,
  descriptionHelp,
}) => {
  const unlinkActions=useRelationshipUndo(plan,onSaveThought);
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [ambiguousSelectedId, setAmbiguousSelectedId] = useState('');
  const [dismissLegacyBanner, setDismissLegacyBanner] = useState(false);

  // 1. All candidates in current Universe matching allowedCategories
  const availableUniverseEntities = useMemo(() => {
    if (!universeId || !plan) return [];
    const universeDocs = getUniverseEntities(allDocuments, universeId, plan.universes);
    return universeDocs.filter((d) => {
      if (d.id === currentDocId) return false;
      const meta = parseLoreMetadata(d);
      const cat = getCategoryForEntryType(meta.entry_type);
      return allowedCategories.includes(cat);
    });
  }, [allDocuments, universeId, plan, currentDocId, allowedCategories]);

  // 2. Active relationships matching this field
  const allLabels = useMemo(() => {
    const set = new Set<string>();
    set.add(relationshipLabel.toLowerCase());
    for (const l of matchingLabels) set.add(l.toLowerCase());
    return Array.from(set);
  }, [relationshipLabel, matchingLabels]);

  const activeRelationships = useMemo(() => {
    if (!plan) return [];
    return getEntityLinkedRelationships(plan, currentDocId, {
      labels: allLabels,
      isSource,
      reciprocalLabels,
    });
  }, [plan, currentDocId, allLabels, isSource, reciprocalLabels]);

  const activeLinkedEntityIds = useMemo(() => {
    return new Set(activeRelationships.map((r) => getOtherEntityId(r, currentDocId)));
  }, [activeRelationships, currentDocId]);

  // Candidates not yet linked
  const candidateEntities = useMemo(() => {
    return availableUniverseEntities.filter((d) => !activeLinkedEntityIds.has(d.id));
  }, [availableUniverseEntities, activeLinkedEntityIds]);

  const filteredCandidates = useMemo(() => {
    if (!searchQuery.trim()) return candidateEntities;
    const query = searchQuery.trim().toLowerCase();
    return candidateEntities.filter((d) => d.title.toLowerCase().includes(query));
  }, [candidateEntities, searchQuery]);

  // 3. Legacy free-text match analysis
  const legacyResolution = useMemo(() => {
    if (!legacyText.trim()) return { status: 'none' as const, matches: [] };
    return resolveLegacyEntityMatch(legacyText, availableUniverseEntities);
  }, [legacyText, availableUniverseEntities]);

  // Check if legacy text already matches any active linked entity title
  const isLegacyAlreadyLinked = useMemo(() => {
    if (!legacyText.trim()) return false;
    const clean = legacyText.trim().toLowerCase();
    return activeRelationships.some((r) => {
      const otherId = getOtherEntityId(r, currentDocId);
      const doc = allDocuments.find((d) => d.id === otherId);
      return doc?.title.trim().toLowerCase() === clean;
    });
  }, [legacyText, activeRelationships, currentDocId, allDocuments]);

  // Link entity handler
  const handleLinkEntity = async (targetId: string) => {
    if (!plan || !onSaveThought || !universeId) return;
    setErrorMsg('');
    setSaving(true);
    try {
      requireSaved(await onSaveThought(()=>plan.revision,current=>{
        let basePlan=current;
        const existing=getEntityLinkedRelationships(current,currentDocId,{labels:allLabels,isSource,reciprocalLabels});
        if(!multiple)for(const r of existing.filter(r=>r.book_id===null&&r.context_node_id===null))basePlan=archiveRelationshipInPlan(basePlan,r.id);
        return validateAndCreateRelationship(basePlan,allDocuments,{
          sourceId:isSource?currentDocId:targetId,targetId:isSource?targetId:currentDocId,
          label:relationshipLabel,universeId,directed,
        }).updatedPlan;
      },()=>setErrorMsg('')));

      setSearchQuery('');
      setIsAdding(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to link entity.');
    } finally {
      setSaving(false);
    }
  };

  // Remove relationship handler
  const handleRemoveRelationship = unlinkActions.unlink;

  // Convert legacy match handler
  const handleConvertLegacy = async (targetId: string) => {
    if (!plan || !onSaveThought || !universeId) return;
    setErrorMsg('');
    setSaving(true);
    try {
      requireSaved(await onSaveThought(()=>plan.revision,current=>{
        let basePlan=current;
        const existing=getEntityLinkedRelationships(current,currentDocId,{labels:allLabels,isSource,reciprocalLabels});
        if(!multiple)for(const r of existing.filter(r=>r.book_id===null&&r.context_node_id===null))basePlan=archiveRelationshipInPlan(basePlan,r.id);
        return validateAndCreateRelationship(basePlan,allDocuments,{
          sourceId:isSource?currentDocId:targetId,targetId:isSource?targetId:currentDocId,
          label:relationshipLabel,universeId,directed,
        }).updatedPlan;
      },()=>setErrorMsg('')));

      if (onClearLegacyText) {
        onClearLegacyText();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to convert legacy entity.');
    } finally {
      setSaving(false);
    }
  };

  const primaryCategoryLabel = useMemo(() => {
    if (allowedCategories.length === 1) {
      const info = LORE_CATEGORIES.find((c) => c.id === allowedCategories[0]);
      return info?.singularLabel || allowedCategories[0];
    }
    return allowedCategories
      .map((cat) => {
        const info = LORE_CATEGORIES.find((c) => c.id === cat);
        return info?.singularLabel || cat;
      })
      .join(' / ');
  }, [allowedCategories]);

  return (
    <div className="space-y-2">
      <RelationshipFeedback actions={unlinkActions}/>
      {/* HEADER & ACTION BUTTONS */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FieldIcon className="w-3.5 h-3.5 text-primary" />
          <label className="text-muted-foreground font-medium text-xs">
            {fieldLabel}
          </label>
        </div>

        {!readOnly && onSaveThought && (
          <div className="flex items-center gap-1.5">
            {(multiple || activeRelationships.length === 0) ? (
              <button
                type="button"
                onClick={() => {
                  setIsAdding(!isAdding);
                  setErrorMsg('');
                }}
                className={cn(
                  'text-[11px] flex items-center gap-1 px-2 py-0.5 rounded border transition-colors',
                  isAdding
                    ? 'border-border bg-muted/60 text-foreground'
                    : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                )}
              >
                {isAdding ? (
                  <>
                    <X className="w-3 h-3" /> Cancel
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3" /> Link {primaryCategoryLabel}
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsAdding(!isAdding);
                  setErrorMsg('');
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline decoration-dotted transition-colors"
              >
                Change
              </button>
            )}
          </div>
        )}
      </div>

      {descriptionHelp && (
        <p className="text-[11px] text-muted-foreground/80 italic">{descriptionHelp}</p>
      )}

      {/* ERROR BANNER */}
      {errorMsg && (
        <div className="p-2 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ACTIVE RELATIONSHIPS LIST */}
      {activeRelationships.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 items-center">
          {activeRelationships.map((rel) => {
            const otherId = getOtherEntityId(rel, currentDocId);
            const doc = allDocuments.find((d) => d.id === otherId);
            const title = doc?.title || 'Unknown Entity';

            return (
              <div
                key={rel.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-card border border-border/80 text-foreground text-xs shadow-xs hover:border-primary/40 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onNavigateToEntity(otherId)}
                  className="font-medium hover:text-primary transition-colors flex items-center gap-1 text-left"
                  title={`Open ${title}`}
                >
                  <span>{title}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </button>

                {rel.label && rel.label.toLowerCase() !== relationshipLabel.toLowerCase() && (
                  <span className="text-[10px] text-muted-foreground bg-muted/60 px-1 py-0.2 rounded font-sans">
                    {rel.label}
                  </span>
                )}

                {!readOnly && onSaveThought && (
                  <button
                    type="button"
                    onClick={() => handleRemoveRelationship(rel.id)}
                    className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-0.5"
                    title={`Unlink ${title}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        !isAdding && (
          <div className="text-muted-foreground/60 italic text-xs py-0.5">
            None linked.
          </div>
        )
      )}

      {/* ADD / SEARCH DROPDOWN */}
      {isAdding && (
        <div className="p-2.5 rounded-lg border border-border/80 bg-background/90 shadow-sm space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${primaryCategoryLabel} in this Universe...`}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-muted/30 border border-border/80 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1">
            {filteredCandidates.length > 0 ? (
              filteredCandidates.map((cand) => {
                const meta = parseLoreMetadata(cand);
                const cat = getCategoryForEntryType(meta.entry_type);
                const catInfo = LORE_CATEGORIES.find((c) => c.id === cat);

                return (
                  <button
                    key={cand.id}
                    type="button"
                    disabled={saving}
                    onClick={() => handleLinkEntity(cand.id)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-primary/10 hover:text-primary text-left text-xs transition-colors group"
                  >
                    <span className="font-medium truncate">{cand.title}</span>
                    <span className="text-[10px] text-muted-foreground group-hover:text-primary/70 shrink-0 ml-2">
                      {catInfo?.singularLabel || meta.entry_type}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="text-center py-2 text-muted-foreground text-xs">
                {candidateEntities.length === 0 ? (
                  <div className="space-y-1.5">
                    <p>No {primaryCategoryLabel} entities found in this universe.</p>
                    {onOpenCreateEntity && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenCreateEntity(allowedCategories[0], searchQuery.trim() || undefined);
                          setIsAdding(false);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                      >
                        <Plus className="w-3 h-3" /> Create new {primaryCategoryLabel}
                      </button>
                    )}
                  </div>
                ) : (
                  <p>No matching entities found for "{searchQuery}".</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* LEGACY FREE-TEXT CONVERSION BANNER */}
      {legacyText.trim() && !isLegacyAlreadyLinked && !dismissLegacyBanner && (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2">
          {legacyResolution.status === 'single' ? (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 font-medium text-amber-300">
                  <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span>Legacy Note matches existing entity:</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissLegacyBanner(true)}
                  className="text-muted-foreground hover:text-foreground text-[10px]"
                >
                  Dismiss
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                "{legacyText}" can be converted to an official link with{' '}
                <strong className="text-foreground">{legacyResolution.matches[0].title}</strong>.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleConvertLegacy(legacyResolution.matches[0].id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold text-xs transition-colors"
                >
                  <Check className="w-3 h-3" />
                  Convert to Link
                </button>
                {onClearLegacyText && (
                  <button
                    type="button"
                    onClick={onClearLegacyText}
                    className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted"
                  >
                    Clear text
                  </button>
                )}
              </div>
            </div>
          ) : legacyResolution.status === 'ambiguous' ? (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 font-medium text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span>Multiple entities match legacy note: "{legacyText}"</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissLegacyBanner(true)}
                  className="text-muted-foreground hover:text-foreground text-[10px]"
                >
                  Dismiss
                </button>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={ambiguousSelectedId}
                  onChange={(e) => setAmbiguousSelectedId(e.target.value)}
                  className="text-xs px-2 py-1 rounded bg-background border border-border text-foreground flex-1"
                >
                  <option value="">Select matching entity to link...</option>
                  {legacyResolution.matches.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!ambiguousSelectedId || saving}
                  onClick={() => handleConvertLegacy(ambiguousSelectedId)}
                  className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-amber-950 font-semibold text-xs transition-colors"
                >
                  Link
                </button>
                {onClearLegacyText && (
                  <button
                    type="button"
                    onClick={onClearLegacyText}
                    className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 font-medium text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span>Legacy Note: "{legacyText}"</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissLegacyBanner(true)}
                  className="text-muted-foreground hover:text-foreground text-[10px]"
                >
                  Dismiss
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                No existing {primaryCategoryLabel} found matching this name in the Universe.
              </p>
              <div className="flex items-center gap-2 pt-0.5">
                {onOpenCreateEntity && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenCreateEntity(allowedCategories[0], legacyText.trim())
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground text-xs transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Create "{legacyText}"
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDismissLegacyBanner(true)}
                  className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted"
                >
                  Keep as Note
                </button>
                {onClearLegacyText && (
                  <button
                    type="button"
                    onClick={onClearLegacyText}
                    className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MIXED QUALITATIVE NOTES INPUT (IF ENABLED) */}
      {onMixedNotesChange && (
        <div className="pt-1">
          <input
            type="text"
            disabled={readOnly}
            value={mixedNotesValue || ''}
            onChange={(e) => onMixedNotesChange(e.target.value)}
            placeholder={mixedNotesPlaceholder || 'Additional qualitative notes or reach...'}
            className="w-full px-2.5 py-1 text-xs rounded-md bg-background border border-border/70 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}
    </div>
  );
};
