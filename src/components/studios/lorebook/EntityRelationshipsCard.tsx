import { RelationshipFeedback, useRelationshipUndo } from './RelationshipFeedback';
import { RelationshipExplanation } from './RelationshipExplanation';
import { requireSaved, relationshipPerspective } from '@/utils/relationships';
import React, { useState, useMemo } from 'react';
import type { Plan, Relationship, Thought } from '@/utils/thought';
import type { DocumentMetadata } from '@/types';
import {
  validateAndCreateRelationship,
  resolveEntityUniverse,
  isGuidedRelationship,
  getCharacterHeldOffices,
  parseLoreMetadata,
} from '@/utils/universe';
import { Share2, Plus, Trash2, Briefcase, ExternalLink, Shield } from 'lucide-react';

interface EntityRelationshipsCardProps {
  documentId: string;
  plan: Plan | null;
  onSaveThought?: (
    expected: () => number,
    plan: import('@/utils/relationships').PlanMutation,
    acknowledge: (result: Thought) => void
  ) => Promise<boolean>;
  availableEntities: DocumentMetadata[];
  allDocuments?: DocumentMetadata[];
  onNavigateToEntity: (id: string) => void;
  universeId?: string;
  readOnly?: boolean;
}

const COMMON_RELATIONSHIPS = [
  'Allied with',
  'Rules',
  'Rival of',
  'Parent of',
  'Child of',
  'Apprentice to',
  'Member of',
  'Located in',
  'Wields',
  'Created',
  'Legally owned by',
  'Held by',
  'Originated in',
  'Stored at',
];

type FilterTab = 'all' | 'guided' | 'custom' | 'official';

export const EntityRelationshipsCard: React.FC<EntityRelationshipsCardProps> = ({
  documentId,
  plan,
  onSaveThought,
  availableEntities,
  allDocuments,
  onNavigateToEntity,
  universeId,
  readOnly = false,
}) => {
  const unlinkActions = useRelationshipUndo(plan, onSaveThought);
  const [isAdding, setIsAdding] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [directed, setDirected] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const allDocs = useMemo(
    () => allDocuments || availableEntities || [],
    [allDocuments, availableEntities]
  );

  const currentDoc = useMemo(
    () => allDocs.find((d) => d.id === documentId),
    [allDocs, documentId]
  );
  const currentMeta = useMemo(
    () => (currentDoc ? parseLoreMetadata(currentDoc) : null),
    [currentDoc]
  );

  const currentUniverse = useMemo(() => {
    if (universeId) return universeId;
    if (!plan) return undefined;
    if (currentDoc) {
      const res = resolveEntityUniverse(currentDoc, plan.universes);
      if (res.universeId) return res.universeId;
    }
    return plan.entities.find((e) => e.id === documentId)?.universe_id || plan.universes[0]?.id;
  }, [universeId, plan, currentDoc, documentId]);

  // Candidates for connection: strictly from the SAME Universe, excluding self
  const candidates = useMemo(() => {
    if (!currentUniverse || !plan) return [];
    return allDocs.filter((d) => {
      if (d.id === documentId) return false;
      const res = resolveEntityUniverse(d, plan.universes);
      return res.universeId === currentUniverse;
    });
  }, [allDocs, documentId, currentUniverse, plan]);

  // Active relationships involving this entity
  const activeRelationships: Relationship[] = useMemo(() => {
    return plan
      ? plan.relationships.filter(
          (r) => !r.archived && (r.source_id === documentId || r.target_id === documentId)
        )
      : [];
  }, [plan, documentId]);

  // Partitioned categories
  const guidedConnections = useMemo(
    () => activeRelationships.filter((r) => isGuidedRelationship(r)),
    [activeRelationships]
  );

  const customRelationships = useMemo(
    () => activeRelationships.filter((r) => !isGuidedRelationship(r)),
    [activeRelationships]
  );

  // Derived official positions from Phase C2 Faction Organizations
  const characterHeldOffices = useMemo(() => {
    if (!currentMeta || currentMeta.entry_type !== 'character') return [];
    return getCharacterHeldOffices(documentId, allDocs, currentUniverse, plan?.universes);
  }, [currentMeta, documentId, allDocs, currentUniverse, plan]);

  const factionOfficialPositions = useMemo(() => {
    if (!currentMeta || currentMeta.entry_type !== 'faction') return [];
    const positions = currentMeta.faction_fields?.positions || [];
    const branches = currentMeta.faction_fields?.branches || [];
    return positions.map((p) => {
      const branch = p.branch_id ? branches.find((b) => b.id === p.branch_id) : undefined;
      const holders = (p.holder_ids || []).map((hId) => {
        const hDoc = allDocs.find((d) => d.id === hId);
        return { id: hId, title: hDoc?.title || `Character #${hId.substring(0, 6)}` };
      });
      return {
        position: p,
        branchName: branch?.name,
        holders,
      };
    });
  }, [currentMeta, allDocs]);

  const officialPositionsCount =
    currentMeta?.entry_type === 'character'
      ? characterHeldOffices.length
      : currentMeta?.entry_type === 'faction'
      ? factionOfficialPositions.length
      : 0;

  const totalItemCount = activeRelationships.length + officialPositionsCount;

  const handleAddRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan || !onSaveThought) return;
    setErrorMsg('');

    if (!targetId) {
      setErrorMsg('Please select a target entity.');
      return;
    }
    const cleanLabel = label.trim();
    if (!cleanLabel) {
      setErrorMsg('Please specify a relationship label.');
      return;
    }

    if (!currentUniverse) {
      setErrorMsg('Cannot resolve Universe identity for this relationship.');
      return;
    }

    setSaving(true);
    try {
      requireSaved(
        await onSaveThought(
          () => plan.revision,
          (current) =>
            validateAndCreateRelationship(current, allDocs, {
              sourceId: documentId,
              targetId,
              label: cleanLabel,
              universeId: currentUniverse,
              directed,
              description,
            }).updatedPlan,
          () => setErrorMsg('')
        )
      );
      setLabel('');
      setDescription('');
      setTargetId('');
      setIsAdding(false);
      setErrorMsg('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save relationship.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRelationship = unlinkActions.unlink;

  return (
    <div className="border border-border/80 rounded-xl bg-card/40 overflow-hidden mb-6">
      <RelationshipFeedback actions={unlinkActions} />
      <div className="flex items-center justify-between p-3.5 bg-muted/20 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <Share2 className="w-4 h-4 text-primary" />
          <span className="text-sm font-serif font-semibold text-foreground">
            Connected Lore Relationships
          </span>
          <span className="text-xs text-muted-foreground">({totalItemCount})</span>
        </div>

        {!readOnly && onSaveThought && (
          <button
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-1.5 text-xs text-primary font-medium hover:text-gold-hover px-2.5 py-1 rounded-md hover:bg-muted/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {isAdding ? 'Cancel' : 'Add Relationship'}
          </button>
        )}
      </div>

      {/* TABS HEADER */}
      <div className="flex items-center gap-1 px-4 pt-2.5 border-b border-border/40 text-xs bg-muted/10 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'all'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          All ({totalItemCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('guided')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'guided'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Guided ({guidedConnections.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('custom')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'custom'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Custom ({customRelationships.length})
        </button>
        {(currentMeta?.entry_type === 'character' ||
          currentMeta?.entry_type === 'faction' ||
          officialPositionsCount > 0) && (
          <button
            type="button"
            onClick={() => setActiveTab('official')}
            className={`px-3 py-1.5 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'official'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Shield className="w-3 h-3 text-amber-400" />
            Official Positions ({officialPositionsCount})
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* INLINE ADD FORM */}
        {isAdding && (
          <form
            onSubmit={handleAddRelationship}
            className="p-3.5 rounded-lg border border-primary/30 bg-background/80 space-y-3 text-xs mb-4"
          >
            <div className="font-semibold text-foreground">Connect with another entity:</div>

            {errorMsg && (
              <div className="text-rose-400 bg-rose-950/30 border border-rose-600/40 p-2 rounded">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-muted-foreground mb-1">Target Entity</label>
                <select
                  aria-label="Target Entity"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">-- Select entity in Universe --</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted-foreground mb-1">Relationship / Role</label>
                <input
                  type="text"
                  aria-label="Relationship label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Rules, Allied with, Parent of"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <label className="block">Why this relationship exists (optional)<textarea rows={4} className="help-input w-full block" disabled={saving} value={description} onChange={e => setDescription(e.target.value)}/></label>
            <p className="text-xs text-muted-foreground">For a shared event, link each participant to the existing Event entry, or use a milestone’s Chronicle to describe it. Relationships are created individually.</p>
            {/* Quick chips */}
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] text-muted-foreground">Common:</span>
              {COMMON_RELATIONSHIPS.map((chip) => (
                <button
                  type="button"
                  key={chip}
                  onClick={() => setLabel(chip)}
                  className="px-2 py-0.5 rounded text-[11px] bg-muted/60 hover:bg-primary/20 hover:text-primary transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={directed}
                  onChange={(e) => setDirected(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-muted-foreground">
                  {directed ? 'Directed (This → Target)' : 'Bidirectional (Mutual connection ↔)'}
                </span>
              </label>

              <button
                type="submit"
                disabled={saving || !targetId || !label.trim()}
                className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-gold-hover transition-colors disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Connect Entities'}
              </button>
            </div>
          </form>
        )}

        {/* RELATIONSHIPS & OFFICIAL POSITIONS LIST */}
        {totalItemCount === 0 ? (
          <div className="text-center py-4 text-xs text-muted-foreground">
            No relationships recorded yet for this entity. Click &quot;Add Relationship&quot; to connect
            it with allies, rival factions, realms, or family.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Graph Relationships Section */}
            {(activeTab === 'all' || activeTab === 'guided' || activeTab === 'custom') && (
              <div className="divide-y divide-border/40">
                {(activeTab === 'all'
                  ? activeRelationships
                  : activeTab === 'guided'
                  ? guidedConnections
                  : customRelationships
                ).map((rel) => {
                  const isSource = rel.source_id === documentId;
                  const otherId = isSource ? rel.target_id : rel.source_id;
                  const otherDoc = allDocs.find((d) => d.id === otherId);
                  const otherTitle = otherDoc?.title || `Entity #${otherId.substring(0, 8)}`;
                  const isGuided = isGuidedRelationship(rel);

                  return (
                    <div
                      key={rel.id}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs group"
                    >
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span
                          className={`text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded border ${
                            isGuided
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : 'bg-muted/60 text-muted-foreground border-border/60'
                          }`}
                        >
                          {isGuided ? 'Guided' : 'Custom'}
                        </span>
                        <span className="font-semibold text-foreground">This entity</span>
                        <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                          {relationshipPerspective(rel, documentId)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onNavigateToEntity(otherId)}
                          className="font-serif text-foreground hover:text-primary underline flex items-center gap-1"
                        >
                          {otherTitle}
                          <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                        </button>
                        {plan && <RelationshipExplanation relationship={rel} plan={plan} save={readOnly ? undefined : onSaveThought}/>}
                      </div>

                      {!readOnly && onSaveThought && (
                        <button
                          type="button"
                          onClick={() => handleDeleteRelationship(rel.id)}
                          className="opacity-70 hover:opacity-100 focus:opacity-100 p-1 text-muted-foreground hover:text-rose-400 rounded transition-all shrink-0"
                          title="Archive this relationship"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}

                {activeTab === 'guided' && guidedConnections.length === 0 && (
                  <div className="py-3 text-center text-xs text-muted-foreground italic">
                    No guided connections (membership, residence, ownership, etc.) linked.
                  </div>
                )}
                {activeTab === 'custom' && customRelationships.length === 0 && (
                  <div className="py-3 text-center text-xs text-muted-foreground italic">
                    No custom relationships recorded.
                  </div>
                )}
              </div>
            )}

            {/* Official Positions Section (Phase C2 Derived) */}
            {(activeTab === 'all' || activeTab === 'official') && officialPositionsCount > 0 && (
              <div className="mt-4 pt-3 border-t border-border/60 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-amber-300">
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                    <span>Official Positions (Derived from Faction Organization)</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground italic">
                    Configured via Faction Organization
                  </span>
                </div>

                <div className="divide-y divide-border/30 rounded-lg bg-amber-950/10 border border-amber-500/20 px-3">
                  {/* Character Held Offices */}
                  {currentMeta?.entry_type === 'character' &&
                    characterHeldOffices.map((office) => (
                      <div
                        key={`${office.factionId}-${office.positionId}`}
                        className="py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                            <Briefcase className="w-3 h-3 text-amber-400" />
                            Official Office
                          </span>
                          <span className="text-foreground font-semibold">
                            {office.positionTitle}
                          </span>
                          {office.branchName && (
                            <span className="text-muted-foreground text-[11px]">
                              ({office.branchName})
                            </span>
                          )}
                          <span className="text-muted-foreground text-[11px]">in faction</span>
                          <button
                            type="button"
                            onClick={() => onNavigateToEntity(office.factionId)}
                            className="font-serif text-amber-300 hover:underline flex items-center gap-1"
                          >
                            {office.factionTitle}
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </button>
                        </div>

                        <span className="text-[11px] text-muted-foreground italic shrink-0">
                          Official position holder
                        </span>
                      </div>
                    ))}

                  {/* Faction Defined Positions */}
                  {currentMeta?.entry_type === 'faction' &&
                    factionOfficialPositions.map(({ position, branchName, holders }) => (
                      <div
                        key={position.id}
                        className="py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                            <Briefcase className="w-3 h-3 text-amber-400" />
                            Position
                          </span>
                          <span className="text-foreground font-semibold">
                            {position.title}
                          </span>
                          {branchName && (
                            <span className="text-muted-foreground text-[11px]">
                              ({branchName})
                            </span>
                          )}
                          <span className="text-muted-foreground text-[11px]">Held by:</span>
                          {holders.length === 0 ? (
                            <span className="text-muted-foreground italic text-[11px]">
                              Vacant
                            </span>
                          ) : (
                            holders.map((h) => (
                              <button
                                key={h.id}
                                type="button"
                                onClick={() => onNavigateToEntity(h.id)}
                                className="font-serif text-amber-300 hover:underline flex items-center gap-1"
                              >
                                {h.title}
                                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                              </button>
                            ))
                          )}
                        </div>

                        <span className="text-[11px] text-muted-foreground italic shrink-0">
                          Faction hierarchy
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
