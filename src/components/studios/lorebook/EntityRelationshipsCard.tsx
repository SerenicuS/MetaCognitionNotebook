import React, { useState } from 'react';
import type { Plan, Relationship, Thought } from '@/utils/thought';
import { uid } from '@/utils/thought';
import type { DocumentMetadata } from '@/types';
import { Share2, Plus, ArrowRight, ArrowLeftRight, Trash2, ExternalLink } from 'lucide-react';

interface EntityRelationshipsCardProps {
  documentId: string;
  plan: Plan | null;
  onSaveThought?: (expected: () => number, plan: Plan, acknowledge: (result: Thought) => void) => Promise<boolean>;
  availableEntities: DocumentMetadata[];
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
];

export const EntityRelationshipsCard: React.FC<EntityRelationshipsCardProps> = ({
  documentId,
  plan,
  onSaveThought,
  availableEntities,
  onNavigateToEntity,
  universeId,
  readOnly = false,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [label, setLabel] = useState('');
  const [directed, setDirected] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Filter candidates: exclude self
  const candidates = (availableEntities || []).filter((d) => d.id !== documentId);

  // Active relationships involving this entity
  const activeRelationships: Relationship[] = plan
    ? plan.relationships.filter(
        (r) => !r.archived && (r.source_id === documentId || r.target_id === documentId)
      )
    : [];

  const handleAddRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan || !onSaveThought) return;
    if (!targetId) {
      setErrorMsg('Please select a target entity.');
      return;
    }
    const cleanLabel = label.trim();
    if (!cleanLabel) {
      setErrorMsg('Please specify a relationship label.');
      return;
    }

    const currentUniverse =
      universeId ||
      plan.entities.find((e) => e.id === documentId)?.universe_id ||
      plan.universes[0]?.id;

    if (!currentUniverse) {
      setErrorMsg('Cannot resolve Universe identity for this relationship.');
      return;
    }

    const newRel: Relationship = {
      id: uid(),
      universe_id: currentUniverse,
      book_id: null,
      source_id: documentId,
      target_id: targetId,
      label: cleanLabel,
      description: '',
      directed,
      context_node_id: null,
      archived: false,
    };

    const updatedPlan: Plan = {
      ...plan,
      relationships: [...plan.relationships, newRel],
    };

    setSaving(true);
    try {
      await onSaveThought(
        () => plan.revision,
        updatedPlan,
        () => {}
      );
      setLabel('');
      setTargetId('');
      setIsAdding(false);
      setErrorMsg('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save relationship.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRelationship = async (relId: string) => {
    if (!plan || !onSaveThought) return;
    const updatedPlan: Plan = {
      ...plan,
      relationships: plan.relationships.map((r) =>
        r.id === relId ? { ...r, archived: true } : r
      ),
    };
    try {
      await onSaveThought(
        () => plan.revision,
        updatedPlan,
        () => {}
      );
    } catch (err: any) {
      console.error('Failed to remove relationship:', err);
    }
  };

  return (
    <div className="border border-border/80 rounded-xl bg-card/40 overflow-hidden mb-6">
      <div className="flex items-center justify-between p-3.5 bg-muted/20 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <Share2 className="w-4 h-4 text-primary" />
          <span className="text-sm font-serif font-semibold text-foreground">
            Connected Lore Relationships
          </span>
          <span className="text-xs text-muted-foreground">({activeRelationships.length})</span>
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

        {/* RELATIONSHIP LIST */}
        {activeRelationships.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted-foreground">
            No relationships recorded yet for this entity. Click &quot;Add Relationship&quot; to connect
            it with allies, rival factions, realms, or family.
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {activeRelationships.map((rel) => {
              const isSource = rel.source_id === documentId;
              const otherId = isSource ? rel.target_id : rel.source_id;
              const otherDoc = availableEntities.find((d) => d.id === otherId);
              const otherTitle = otherDoc?.title || `Entity #${otherId.substring(0, 8)}`;

              return (
                <div
                  key={rel.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs group"
                >
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {/* Visual flow */}
                    {rel.directed ? (
                      isSource ? (
                        <>
                          <span className="font-semibold text-foreground">This entity</span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary font-mono text-[11px]">
                            {rel.label} <ArrowRight className="w-3 h-3 inline" />
                          </span>
                          <button
                            type="button"
                            onClick={() => onNavigateToEntity(otherId)}
                            className="font-serif font-semibold text-foreground hover:text-primary hover:underline inline-flex items-center gap-1 transition-colors"
                            title="Open connected entity"
                          >
                            {otherTitle}
                            <ExternalLink className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onNavigateToEntity(otherId)}
                            className="font-serif font-semibold text-foreground hover:text-primary hover:underline inline-flex items-center gap-1 transition-colors"
                            title="Open connected entity"
                          >
                            {otherTitle}
                            <ExternalLink className="w-3 h-3 text-muted-foreground" />
                          </button>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary font-mono text-[11px]">
                            {rel.label} <ArrowRight className="w-3 h-3 inline" />
                          </span>
                          <span className="font-semibold text-foreground">This entity</span>
                        </>
                      )
                    ) : (
                      <>
                        <span className="font-semibold text-foreground">This entity</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent text-accent-foreground font-mono text-[11px]">
                          <ArrowLeftRight className="w-3 h-3 inline" /> {rel.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => onNavigateToEntity(otherId)}
                          className="font-serif font-semibold text-foreground hover:text-primary hover:underline inline-flex items-center gap-1 transition-colors"
                          title="Open connected entity"
                        >
                          {otherTitle}
                          <ExternalLink className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </>
                    )}
                  </div>

                  {!readOnly && onSaveThought && (
                    <button
                      type="button"
                      onClick={() => handleDeleteRelationship(rel.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-rose-400 rounded transition-all shrink-0"
                      title="Archive this relationship"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
