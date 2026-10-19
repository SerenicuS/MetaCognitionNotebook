import {RelationshipFeedback,useRelationshipUndo} from './RelationshipFeedback';
import {requireSaved} from '@/utils/relationships';
import React, { useState, useMemo } from 'react';
import type { DocumentMetadata } from '@/types';
import type { Plan, Thought } from '@/utils/thought';
import {
  getCharacterAffiliations,
  getOtherEntityId,
  resolveLegacyAffiliation,
  validateAndCreateRelationship,
  getUniverseEntities,
  getCategoryForEntryType,
  parseLoreMetadata,
  AFFILIATION_LABEL,
} from '@/utils/universe';
import { Shield, Plus, X, Search, ExternalLink, AlertTriangle, Check, Sparkles } from 'lucide-react';

interface CharacterAffiliationSelectorProps {
  characterDocId: string;
  universeId: string;
  plan: Plan | null;
  onSaveThought?: (expected: () => number, plan: import('@/utils/relationships').PlanMutation, acknowledge: (result: Thought) => void) => Promise<boolean>;
  allDocuments: DocumentMetadata[];
  onNavigateToEntity: (id: string) => void;
  legacyAffiliation?: string;
  onClearLegacyAffiliation?: () => void;
  onOpenCreateFaction?: (initialName?: string) => void;
  readOnly?: boolean;
}

export const CharacterAffiliationSelector: React.FC<CharacterAffiliationSelectorProps> = ({
  characterDocId,
  universeId,
  plan,
  onSaveThought,
  allDocuments,
  onNavigateToEntity,
  legacyAffiliation = '',
  onClearLegacyAffiliation,
  onOpenCreateFaction,
  readOnly = false,
}) => {
  const unlinkActions=useRelationshipUndo(plan,onSaveThought);
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFactionId, setSelectedFactionId] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. All factions/nations in current Universe
  const availableFactions = useMemo(() => {
    if (!universeId || !plan) return [];
    const universeDocs = getUniverseEntities(allDocuments, universeId, plan.universes);
    return universeDocs.filter((d) => {
      if (d.id === characterDocId) return false;
      const meta = parseLoreMetadata(d);
      const cat = getCategoryForEntryType(meta.entry_type);
      return cat === 'factions';
    });
  }, [allDocuments, universeId, plan, characterDocId]);

  // 2. Active affiliations (canonical relationships where label is 'Member of' or 'Affiliated with')
  const activeAffiliations = useMemo(() => {
    return getCharacterAffiliations(plan, characterDocId);
  }, [plan, characterDocId]);

  const activeFactionIds = useMemo(() => {
    return new Set(activeAffiliations.map((r) => getOtherEntityId(r,characterDocId)));
  }, [activeAffiliations]);

  // Candidates for adding (factions in universe not yet linked)
  const candidateFactions = useMemo(() => {
    return availableFactions.filter((f) => !activeFactionIds.has(f.id));
  }, [availableFactions, activeFactionIds]);

  const filteredCandidates = useMemo(() => {
    if (!searchQuery.trim()) return candidateFactions;
    const query = searchQuery.trim().toLowerCase();
    return candidateFactions.filter((f) => f.title.toLowerCase().includes(query));
  }, [candidateFactions, searchQuery]);

  // 3. Legacy free-text analysis
  const legacyResolution = useMemo(() => {
    return resolveLegacyAffiliation(legacyAffiliation, availableFactions);
  }, [legacyAffiliation, availableFactions]);

  // Check if legacy text already matches an active affiliation's title
  const isLegacyAlreadyLinked = useMemo(() => {
    if (!legacyAffiliation.trim()) return false;
    const clean = legacyAffiliation.trim().toLowerCase();
    return activeAffiliations.some((r) => {
      const doc = allDocuments.find((d) => d.id === getOtherEntityId(r,characterDocId));
      return doc?.title.trim().toLowerCase() === clean;
    });
  }, [legacyAffiliation, activeAffiliations, allDocuments]);

  // Add affiliation handler
  const handleAddAffiliation = async (targetId: string) => {
    if (!plan || !onSaveThought || !universeId) return;
    setErrorMsg('');
    setSaving(true);
    try {
      requireSaved(await onSaveThought(()=>plan.revision,current=>validateAndCreateRelationship(current,allDocuments,{sourceId:characterDocId,targetId:targetId,label:AFFILIATION_LABEL,universeId,directed:true}).updatedPlan,()=>setErrorMsg('')));
      setSelectedFactionId('');
      setSearchQuery('');
      setIsAdding(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to link affiliation.');
    } finally {
      setSaving(false);
    }
  };

  // Remove affiliation handler
  const handleRemoveAffiliation = unlinkActions.unlink;

  // Convert legacy single match to real link
  const handleConvertLegacy = async (targetFactionId: string) => {
    if (!plan || !onSaveThought || !universeId) return;
    setErrorMsg('');
    setSaving(true);
    try {
      requireSaved(await onSaveThought(()=>plan.revision,current=>validateAndCreateRelationship(current,allDocuments,{sourceId:characterDocId,targetId:targetFactionId,label:AFFILIATION_LABEL,universeId,directed:true}).updatedPlan,()=>setErrorMsg('')));

      if (onClearLegacyAffiliation) {
        onClearLegacyAffiliation();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to convert legacy affiliation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <RelationshipFeedback actions={unlinkActions}/>
      <div className="flex items-center justify-between">
        <label className="text-muted-foreground font-medium flex items-center gap-1.5 text-xs">
          <Shield className="w-3.5 h-3.5 text-amber-400" />
          Affiliation / Order (Factions &amp; Nations)
        </label>
        {!readOnly && onSaveThought && (
          <button
            type="button"
            onClick={() => {
              setIsAdding(!isAdding);
              setErrorMsg('');
            }}
            className="text-[11px] text-primary hover:text-gold-hover font-medium flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3 h-3" />
            {isAdding ? 'Done' : 'Link Faction'}
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="text-[11px] text-rose-400 bg-rose-950/30 border border-rose-600/40 p-2 rounded-lg">
          {errorMsg}
        </div>
      )}

      {/* ACTIVE LINKED AFFILIATIONS BADGES */}
      <div className="flex flex-wrap gap-2 items-center min-h-[34px] p-2 rounded-lg bg-background border border-border/80">
        {activeAffiliations.length === 0 && !legacyAffiliation.trim() && (
          <span className="text-xs text-muted-foreground/60 italic">
            No affiliations linked. Click &quot;Link Faction&quot; to connect with a faction or kingdom.
          </span>
        )}

        {activeAffiliations.map((rel) => {
          const factionDoc = allDocuments.find((d) => d.id === getOtherEntityId(rel,characterDocId));
          const factionName = factionDoc?.title || `Faction #${getOtherEntityId(rel,characterDocId).slice(0, 6)}`;

          return (
            <span
              key={rel.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium group"
            >
              <Shield className="w-3 h-3 text-amber-400 shrink-0" />
              <button
                type="button"
                onClick={() => onNavigateToEntity(getOtherEntityId(rel,characterDocId))}
                className="hover:underline flex items-center gap-1"
                title={`Open ${factionName}`}
              >
                {factionName}
                <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
              </button>

              {!readOnly && onSaveThought && (
                <button
                  type="button"
                  onClick={() => handleRemoveAffiliation(rel.id)}
                  className="hover:text-rose-400 p-0.5 rounded transition-colors ml-1"
                  title="Remove affiliation"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          );
        })}
      </div>

      {/* LEGACY FREE-TEXT AFFILIATION RESOLUTION CARD */}
      {legacyAffiliation.trim() && (
        <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-950/20 text-xs space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-foreground font-medium flex items-center gap-1.5">
                Legacy Free-Text Affiliation:
                <span className="font-mono px-1.5 py-0.5 bg-background rounded border border-border text-amber-200">
                  {legacyAffiliation}
                </span>
                {isLegacyAlreadyLinked && (
                  <span className="text-[11px] text-emerald-400 inline-flex items-center gap-1">
                    <Check className="w-3 h-3" /> Linked
                  </span>
                )}
              </div>

              {!isLegacyAlreadyLinked && (
                <>
                  {legacyResolution.status === 'single' && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-muted-foreground text-[11px]">
                        Found matching entity: <strong>{legacyResolution.matches[0].title}</strong>
                      </span>
                      {!readOnly && onSaveThought && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleConvertLegacy(legacyResolution.matches[0].id)}
                          className="px-2.5 py-1 rounded bg-amber-500 text-amber-950 font-medium hover:bg-amber-400 transition-colors flex items-center gap-1 text-[11px] disabled:opacity-40"
                        >
                          <Sparkles className="w-3 h-3" />
                          Convert to Real Link
                        </button>
                      )}
                    </div>
                  )}

                  {legacyResolution.status === 'ambiguous' && (
                    <div className="mt-1.5 space-y-1.5">
                      <span className="text-muted-foreground text-[11px]">
                        Multiple factions match this name in the Universe. Choose which entity to link:
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {legacyResolution.matches.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            disabled={saving}
                            onClick={() => handleConvertLegacy(m.id)}
                            className="px-2 py-0.5 rounded border border-amber-500/40 bg-background hover:bg-amber-500/20 text-foreground text-[11px] transition-colors"
                          >
                            Link {m.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {legacyResolution.status === 'none' && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap text-[11px]">
                      <span className="text-muted-foreground">
                        No faction with this name exists in this Universe yet.
                      </span>
                      <div className="flex items-center gap-2">
                        {onOpenCreateFaction && (
                          <button
                            type="button"
                            onClick={() => onOpenCreateFaction(legacyAffiliation.trim())}
                            className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
                          >
                            + Create &quot;{legacyAffiliation.trim()}&quot;
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {isLegacyAlreadyLinked && onClearLegacyAffiliation && !readOnly && (
              <button
                type="button"
                onClick={onClearLegacyAffiliation}
                className="text-muted-foreground hover:text-foreground text-[10px] underline ml-auto"
                title="Dismiss legacy notice"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {/* SELECTOR POPOVER / FORM */}
      {isAdding && (
        <div className="p-3 rounded-lg border border-primary/30 bg-card space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">Select Faction or Nation to link:</span>
            {onOpenCreateFaction && (
              <button
                type="button"
                onClick={() => onOpenCreateFaction()}
                className="text-[11px] text-primary hover:text-gold-hover font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                + Create New Faction
              </button>
            )}
          </div>

          {availableFactions.length > 5 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search factions in Universe..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          {filteredCandidates.length === 0 ? (
            <div className="py-2 text-center text-muted-foreground text-[11px]">
              {availableFactions.length === 0
                ? 'No factions exist in this Universe yet.'
                : 'No additional factions match.'}
              {onOpenCreateFaction && (
                <div className="mt-1">
                  <button
                    type="button"
                    onClick={() => onOpenCreateFaction(searchQuery || undefined)}
                    className="text-primary hover:underline font-medium"
                  >
                    Create a new Faction
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <select
                aria-label="Select faction to link"
                value={selectedFactionId}
                onChange={(e) => setSelectedFactionId(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-- Choose Faction / Nation --</option>
                {filteredCandidates.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={saving || !selectedFactionId}
                onClick={() => handleAddAffiliation(selectedFactionId)}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-gold-hover transition-colors disabled:opacity-40 shrink-0"
              >
                {saving ? 'Linking...' : 'Connect'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
