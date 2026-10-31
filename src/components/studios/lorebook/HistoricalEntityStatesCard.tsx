import React, { useState, useMemo } from 'react';
import type { DocumentMetadata, LoreCategory } from '@/types';
import type { Plan, Thought } from '@/utils/thought';
import {
  Clock,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import {
  resolveEntityLivingState,
  assignMilestoneState,
  clearMilestoneState,
  severMilestoneRelationship,
  restoreMilestoneRelationship,
  clearMilestoneRelationshipChange,
  CLEARED_PROPERTY_VALUE,
  escapeLiteralPropertyValue,
  type ResolvedLivingEntityState,
  type ResolvedLivingProperty,
} from '@/utils/stateEngine';
import { cn } from '@/utils/cn';

interface HistoricalEntityStatesCardProps {
  documentId: string;
  universeId: string;
  plan: Plan | null;
  allDocuments: DocumentMetadata[];
  category: LoreCategory;
  readOnly?: boolean;
  onSaveThought?: (
    expected: () => number,
    plan: import('@/utils/relationships').PlanMutation,
    acknowledge: (result: Thought) => void
  ) => Promise<boolean>;
  onNavigateToWebOfThought?: (
    universeId: string,
    continuityId: string | null,
    milestoneId: string | null,
    entityId: string | null
  ) => void;
}

export const HistoricalEntityStatesCard: React.FC<HistoricalEntityStatesCardProps> = ({
  documentId,
  universeId,
  plan,
  allDocuments,
  category,
  readOnly = false,
  onSaveThought,
  onNavigateToWebOfThought,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [editingPropKey, setEditingPropKey] = useState<string | null>(null);
  const [overrideInputVal, setOverrideInputVal] = useState('');
  const [overrideNoteVal, setOverrideNoteVal] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter active milestones in this universe
  const milestones = useMemo(() => {
    if (!plan || !universeId) return [];
    return plan.nodes
      .filter((n) => n.universe_id === universeId && !n.archived)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  }, [plan, universeId]);

  // Resolve living state if a milestone is selected
  const livingState = useMemo<ResolvedLivingEntityState | null>(() => {
    if (!selectedMilestoneId || !plan || !universeId || !documentId) return null;
    return resolveEntityLivingState(plan, allDocuments, universeId, selectedMilestoneId, documentId);
  }, [selectedMilestoneId, plan, universeId, documentId, allDocuments]);

  // Don't render card if universe has no milestones
  if (!plan || milestones.length === 0) {
    return null;
  }

  const handleStartOverride = (prop: ResolvedLivingProperty) => {
    setEditingPropKey(prop.propertyKey);
    setOverrideInputVal(prop.value || '');
    setOverrideNoteVal(prop.note || '');
    setErrorMsg(null);
  };

  const handleCancelOverride = () => {
    setEditingPropKey(null);
    setOverrideInputVal('');
    setOverrideNoteVal('');
    setErrorMsg(null);
  };

  const handleSaveOverride = async (propertyKey: string) => {
    if (!onSaveThought || !plan || !selectedMilestoneId) return;
    const cleanVal = overrideInputVal.trim();
    if (!cleanVal) {
      setErrorMsg('Please enter a value or use "Clear Field".');
      return;
    }

    const valToSave = escapeLiteralPropertyValue(cleanVal);
    const noteToSave = overrideNoteVal.trim() || undefined;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const ok = await onSaveThought(
        () => plan.revision,
        (currentPlan) =>
          assignMilestoneState(
            currentPlan,
            selectedMilestoneId,
            documentId,
            propertyKey,
            valToSave,
            noteToSave
          ),
        () => {}
      );
      if (ok) {
        handleCancelOverride();
      } else {
        setErrorMsg('Failed to persist change.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error saving state change.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearProperty = async (propertyKey: string) => {
    if (!onSaveThought || !plan || !selectedMilestoneId) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const ok = await onSaveThought(
        () => plan.revision,
        (currentPlan) =>
          assignMilestoneState(
            currentPlan,
            selectedMilestoneId,
            documentId,
            propertyKey,
            CLEARED_PROPERTY_VALUE,
            'Explicitly cleared at this milestone'
          ),
        () => {}
      );
      if (ok) {
        handleCancelOverride();
      } else {
        setErrorMsg('Failed to persist cleared property.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error clearing property.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevertProperty = async (propertyKey: string) => {
    if (!onSaveThought || !plan || !selectedMilestoneId) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const ok = await onSaveThought(
        () => plan.revision,
        (currentPlan) =>
          clearMilestoneState(currentPlan, selectedMilestoneId, documentId, propertyKey),
        () => {}
      );
      if (ok) {
        handleCancelOverride();
      } else {
        setErrorMsg('Failed to persist property reversion.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error reverting property override.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSeverRelationship = async (relId: string) => {
    if (!onSaveThought || !plan || !selectedMilestoneId) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const ok = await onSaveThought(
        () => plan.revision,
        (currentPlan) =>
          severMilestoneRelationship(
            currentPlan,
            selectedMilestoneId,
            relId,
            'Severed at this milestone'
          ),
        () => {}
      );
      if (!ok) {
        setErrorMsg('Failed to sever relationship.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error severing relationship.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestoreRelationship = async (relId: string, isInheritedSeverance: boolean) => {
    if (!onSaveThought || !plan || !selectedMilestoneId) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const ok = await onSaveThought(
        () => plan.revision,
        (currentPlan) => {
          if (isInheritedSeverance) {
            // Milestone inherits severance from earlier in timeline; record explicit downstream restoration
            return restoreMilestoneRelationship(
              currentPlan,
              selectedMilestoneId,
              relId,
              undefined,
              'Restored at this milestone'
            );
          } else {
            // Severance was defined at this milestone; undo it by clearing the local change
            return clearMilestoneRelationshipChange(currentPlan, selectedMilestoneId, relId);
          }
        },
        () => {}
      );
      if (!ok) {
        setErrorMsg('Failed to restore relationship.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error restoring relationship.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUndoRestoration = async (relId: string) => {
    if (!onSaveThought || !plan || !selectedMilestoneId) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const ok = await onSaveThought(
        () => plan.revision,
        (currentPlan) => clearMilestoneRelationshipChange(currentPlan, selectedMilestoneId, relId),
        () => {}
      );
      if (!ok) {
        setErrorMsg('Failed to undo relationship restoration.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error undoing restoration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-card/60 overflow-hidden shadow-xs text-xs mb-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between p-3.5 bg-primary/5 border-b border-primary/20">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary shrink-0" />
          <span className="font-serif font-bold text-foreground text-sm">
            Living Entity States & Story Timeline
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-mono bg-primary/10 text-primary border border-primary/20 capitalize">
            {category} • {milestones.length} milestone{milestones.length === 1 ? '' : 's'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          title={isOpen ? 'Collapse timeline overview' : 'Expand timeline overview'}
        >
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isOpen && (
        <div className="p-4 space-y-4">
          {/* Milestone Selection Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/40">
            <div className="flex items-center gap-2 flex-1">
              <label htmlFor="timeline-milestone-picker" className="font-medium text-foreground whitespace-nowrap">
                Timeline Point:
              </label>
              <select
                id="timeline-milestone-picker"
                value={selectedMilestoneId || ''}
                onChange={(e) => {
                  setSelectedMilestoneId(e.target.value || null);
                  handleCancelOverride();
                }}
                className="flex-1 max-w-md px-3 py-1.5 rounded-lg bg-background border border-border text-foreground font-medium text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">✦ Canonical Baseline Profile (Genesis)</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} {m.era ? `(${m.era})` : ''} {m.branch_id ? '· Alternate Branch' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedMilestoneId && onNavigateToWebOfThought && (
              <button
                type="button"
                onClick={() => {
                  const m = milestones.find((node) => node.id === selectedMilestoneId);
                  onNavigateToWebOfThought(universeId, m?.branch_id || null, selectedMilestoneId, documentId);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted/40 text-foreground text-xs font-medium transition-colors shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5 text-primary" />
                <span>Jump to Milestone</span>
              </button>
            )}
          </div>

          {/* BASELINE NOTICE */}
          {!selectedMilestoneId ? (
            <div className="p-3 rounded-lg bg-muted/20 border border-border/50 text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Editing Canonical Baseline: </strong>
              The fields below define this entity&rsquo;s permanent baseline profile. Any changes made here serve as
              the starting point across the story timeline unless explicitly overridden at a specific historical milestone.
            </div>
          ) : (
            /* HISTORICAL LIVING STATE PREVIEW & OVERRIDES */
            livingState && (
              <div className="space-y-4">
                {/* Milestone Summary Banner */}
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-foreground text-sm">
                        {livingState.milestoneTitle}
                      </span>
                      {livingState.milestoneEra && (
                        <span className="px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono text-[10px]">
                          {livingState.milestoneEra}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Continuity: {livingState.continuityName}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] text-muted-foreground">Historical Status: </span>
                    <strong className="text-foreground font-semibold">
                      {livingState.status.displayLabel}
                    </strong>
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive text-[11px]">
                    {errorMsg}
                  </div>
                )}

                {/* Living Properties Grid */}
                <div className="space-y-2">
                  <span className="font-semibold text-foreground text-xs block">
                    Living Attributes at this Milestone
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {Array.from(livingState.properties.values()).map((prop) => {
                      const isEditing = editingPropKey === prop.propertyKey;
                      const isOverriddenHere = prop.hasChangedAtThisMilestone;
                      const isCleared = prop.origin === 'cleared';

                      return (
                        <div
                          key={prop.propertyKey}
                          className={cn(
                            'p-2.5 rounded-lg border transition-all text-xs flex flex-col justify-between gap-2',
                            isOverriddenHere
                              ? 'border-amber-500/40 bg-amber-500/5'
                              : isCleared
                              ? 'border-rose-500/40 bg-rose-500/5'
                              : 'border-border/60 bg-background/50'
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-semibold text-foreground capitalize">
                                {prop.propertyKey.replace(/_/g, ' ')}:
                              </span>{' '}
                              {isCleared ? (
                                <span className="text-rose-400 italic">None / Cleared</span>
                              ) : prop.value ? (
                                <span className="text-foreground font-medium">{prop.value}</span>
                              ) : (
                                <span className="text-muted-foreground italic">Unassigned</span>
                              )}
                            </div>

                            {/* Provenance Pill */}
                            <span
                              className={cn(
                                'px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 border',
                                prop.origin === 'explicit'
                                  ? 'bg-amber-950/40 text-amber-300 border-amber-800/40'
                                  : prop.origin === 'cleared'
                                  ? 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                                  : prop.origin === 'inherited'
                                  ? 'bg-violet-950/40 text-violet-300 border-violet-800/40'
                                  : 'bg-muted/60 text-muted-foreground border-border/40'
                              )}
                            >
                              {prop.origin === 'explicit'
                                ? 'Changed Here'
                                : prop.origin === 'cleared'
                                ? 'Cleared Here'
                                : prop.origin === 'inherited'
                                ? `Inherited (${prop.sourceMilestoneTitle || 'earlier'})`
                                : 'Baseline Default'}
                            </span>
                          </div>

                          {/* Inline Edit Form */}
                          {isEditing ? (
                            <div className="pt-2 border-t border-border/40 space-y-2 animate-in fade-in duration-100">
                              <input
                                type="text"
                                autoFocus
                                value={overrideInputVal}
                                onChange={(e) => setOverrideInputVal(e.target.value)}
                                placeholder={`Enter milestone value for ${prop.propertyKey}...`}
                                className="w-full px-2.5 py-1 rounded bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <input
                                type="text"
                                value={overrideNoteVal}
                                onChange={(e) => setOverrideNoteVal(e.target.value)}
                                placeholder="Author note / rationale (optional)..."
                                className="w-full px-2.5 py-1 rounded bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <div className="flex items-center justify-end gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={handleCancelOverride}
                                  className="px-2 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted/40 text-[11px]"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={() => handleSaveOverride(prop.propertyKey)}
                                  className="px-2.5 py-0.5 rounded bg-primary text-primary-foreground font-medium text-[11px] hover:bg-gold-hover transition-colors shadow-xs"
                                >
                                  {isSubmitting ? 'Saving...' : 'Save Override'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Action Buttons */
                            !readOnly &&
                            onSaveThought && (
                              <div className="flex items-center justify-end gap-1 pt-1.5 border-t border-border/30">
                                {isOverriddenHere || isCleared ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRevertProperty(prop.propertyKey)}
                                    className="px-2 py-0.5 rounded text-[10.5px] font-medium text-amber-300 hover:bg-amber-500/20 inline-flex items-center gap-1 transition-colors"
                                    title="Remove this milestone override and resume inheritance"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Revert Override</span>
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleStartOverride(prop)}
                                      className="px-2 py-0.5 rounded text-[10.5px] font-medium text-primary hover:bg-primary/10 transition-colors"
                                    >
                                      Override Here
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleClearProperty(prop.propertyKey)}
                                      className="px-2 py-0.5 rounded text-[10.5px] font-medium text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                    >
                                      Clear Field
                                    </button>
                                  </>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Living Relationships */}
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <span className="font-semibold text-foreground text-xs block">
                    Connected Relationships at this Milestone ({livingState.relationships.length})
                  </span>

                  {livingState.relationships.length === 0 ? (
                    <div className="p-3 rounded-lg bg-muted/10 border border-border/40 text-muted-foreground italic text-center text-xs">
                      No active relationships connected to this entity at this point in history.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {livingState.relationships.map((rel) => {
                        const otherName = rel.sourceId === documentId ? rel.targetTitle : rel.sourceTitle;
                        const relationLabel = rel.sourceId === documentId ? rel.relationTypeFromSource : rel.relationTypeFromTarget;

                        return (
                          <div
                            key={rel.relationshipId}
                            className={cn(
                              'p-2.5 rounded-lg border text-xs flex items-center justify-between gap-3',
                              rel.isSevered
                                ? 'border-rose-500/30 bg-rose-500/5 text-muted-foreground'
                                : rel.origin === 'modified_here'
                                ? 'border-amber-500/30 bg-amber-500/5'
                                : 'border-border/60 bg-background/50'
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold text-foreground truncate">{otherName}</span>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-primary font-medium">{relationLabel}</span>
                              {rel.origin === 'severed_here' && (
                                <span className="px-1.5 py-0.2 rounded bg-rose-950/40 text-rose-300 text-[10px] border border-rose-800/40">
                                  Severed Here
                                </span>
                              )}
                              {rel.origin === 'inherited' && rel.isSevered && (
                                <span className="px-1.5 py-0.2 rounded bg-rose-950/20 text-rose-300/80 text-[10px] border border-rose-800/30">
                                  Inherited Severance ({rel.sourceMilestoneTitle || 'earlier'})
                                </span>
                              )}
                              {rel.origin === 'restored_here' && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-950/40 text-emerald-300 text-[10px] border border-emerald-800/40">
                                  Restored Here
                                </span>
                              )}
                              {rel.origin === 'modified_here' && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-950/40 text-amber-300 text-[10px] border border-amber-800/40">
                                  Modified Here
                                </span>
                              )}
                            </div>

                            {!readOnly && onSaveThought && (
                              <div className="flex items-center gap-1 shrink-0">
                                {rel.origin === 'severed_here' ? (
                                  <button
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={() => handleRestoreRelationship(rel.relationshipId, false)}
                                    className="px-2 py-0.5 rounded text-[10.5px] font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                                    title="Undo the severance created on this milestone"
                                  >
                                    Undo Severance
                                  </button>
                                ) : rel.origin === 'inherited' && rel.isSevered ? (
                                  <button
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={() => handleRestoreRelationship(rel.relationshipId, true)}
                                    className="px-2 py-0.5 rounded text-[10.5px] font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                                    title="Explicitly restore connection at this milestone and downstream"
                                  >
                                    Restore Relation Here
                                  </button>
                                ) : rel.origin === 'restored_here' ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={isSubmitting}
                                      onClick={() => handleUndoRestoration(rel.relationshipId)}
                                      className="px-2 py-0.5 rounded text-[10.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                                      title="Undo the restoration created on this milestone"
                                    >
                                      Undo Restoration
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isSubmitting}
                                      onClick={() => handleSeverRelationship(rel.relationshipId)}
                                      className="px-2 py-0.5 rounded text-[10.5px] font-medium text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                                      title="Sever connection at this milestone"
                                    >
                                      Sever
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={() => handleSeverRelationship(rel.relationshipId)}
                                    className="px-2 py-0.5 rounded text-[10.5px] font-medium text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                                    title="Sever connection at this milestone"
                                  >
                                    Sever Relation
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};
