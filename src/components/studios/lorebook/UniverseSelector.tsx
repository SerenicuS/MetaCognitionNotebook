import {requireSaved} from '@/utils/relationships';
import React, { useState } from 'react';
import type { DocumentMetadata } from '@/types';
import type { Plan, Thought, Universe } from '@/utils/thought';
import {
  createUniverseInPlan,
  renameUniverseInPlan,
  resolveBasePlan,
  getUniverseEntities,
  getBooksForUniverse,
  getUnassignedEntities,
} from '@/utils/universe';
import { Globe, Plus, BookOpen, Users, Edit3, Sparkles, FolderArchive, ArrowRight } from 'lucide-react';

interface UniverseSelectorProps {
  plan: Plan | null;
  documents: DocumentMetadata[];
  onSelectUniverse: (universeId: string) => void;
  onSaveThought?: (
    expected: () => number,
    plan: import('@/utils/relationships').PlanMutation,
    acknowledge: (result: Thought) => void
  ) => Promise<boolean>;
  onOpenUnassigned?: () => void;
  onOpenCreateModal?: (options?: { action?: 'create_universe' }) => void;
}

export const UniverseSelector: React.FC<UniverseSelectorProps> = ({
  plan,
  documents,
  onSelectUniverse,
  onSaveThought,
  onOpenUnassigned,
  onOpenCreateModal,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingUniverse, setEditingUniverse] = useState<Universe | null>(null);
  const [universeName, setUniverseName] = useState('');
  const [universeDesc, setUniverseDesc] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const allUniverses=plan?.universes||[];
  const universes=allUniverses.filter(u=>!u.archived);
  const unassignedDocs = plan ? getUnassignedEntities(documents, allUniverses) : [];

  const handleStartCreate = () => {
    setUniverseName('');
    setUniverseDesc('');
    setFormError('');
    setIsCreating(true);
    setEditingUniverse(null);
  };

  const handleStartEdit = (u: Universe) => {
    setEditingUniverse(u);
    setUniverseName(u.name);
    setUniverseDesc(u.description || '');
    setFormError('');
    setIsCreating(false);
  };

  const handleCancelModal = () => {
    setIsCreating(false);
    setEditingUniverse(null);
    setUniverseName('');
    setUniverseDesc('');
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveThought) return;
    const cleanName = universeName.trim();
    if (!cleanName) {
      setFormError('Please enter a universe name.');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      if (isCreating) {
        const { plan: basePlan, expectedRevision } = resolveBasePlan(plan, documents);
        const { plan: updatedPlan, universe: newUniverse } = createUniverseInPlan(
          basePlan,
          cleanName,
          universeDesc
        );
        await onSaveThought(
          () => expectedRevision,
          updatedPlan,
          () => {}
        );
        handleCancelModal();
        onSelectUniverse(newUniverse.id);
      } else if (editingUniverse) {
        if (!plan) return;
        const updatedPlan = renameUniverseInPlan(
          plan,
          editingUniverse.id,
          cleanName,
          universeDesc
        );
        await onSaveThought(
          () => plan.revision,
          updatedPlan,
          () => {}
        );
        handleCancelModal();
      }
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save universe.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-8 max-w-5xl mx-auto space-y-8 select-none">
      {/* HEADER / WELCOME */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold text-foreground">
                Universe Architecture
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Organize characters, locations, factions, and stories within distinct narrative worlds.
              </p>
            </div>
          </div>
        </div>

        {onSaveThought && (
          <button
            type="button"
            onClick={() => {
              if (onOpenCreateModal) {
                onOpenCreateModal({ action: 'create_universe' });
              } else {
                handleStartCreate();
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium text-xs hover:bg-gold-hover transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Universe
          </button>
        )}
      </div>

      {/* UNASSIGNED LORE BANNER (IF ANY) */}
      {unassignedDocs.length > 0 && onOpenUnassigned && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/15 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <FolderArchive className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-amber-200">
                {unassignedDocs.length} Unassigned Lore {unassignedDocs.length === 1 ? 'Entry' : 'Entries'}
              </div>
              <div className="text-[11px] text-amber-300/80 mt-0.5">
                Legacy documents without an assigned Universe remain safely preserved and accessible.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenUnassigned}
            className="px-3 py-1.5 rounded-lg border border-amber-500/40 hover:bg-amber-500/20 text-amber-200 text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5"
          >
            View Unassigned Lore
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {allUniverses.some(u=>u.archived)&&<details className="border border-border rounded-lg p-4"><summary className="text-primary cursor-pointer">Archived Universes</summary><p className="text-xs my-2">Only the selector entry is archived. Documents, Books, milestones and historical references remain.</p>{allUniverses.filter(u=>u.archived).map(u=><div key={u.id} className="flex gap-3 items-center my-2"><span>{u.name}</span><button className="help-button" disabled={saving} onClick={async()=>{if(!onSaveThought||!plan)return;setSaving(true);try{requireSaved(await onSaveThought(()=>plan.revision,current=>({...current,universes:current.universes.map(old=>old.id===u.id?{...old,archived:false}:old)}),()=>{}));}catch(error){setFormError(String(error));}finally{setSaving(false);}}}>Recover Universe</button><button className="help-button" onClick={()=>onSelectUniverse(u.id)}>Inspect retained Universe</button></div>)}</details>}
      {formError&&!isCreating&&!editingUniverse&&<p role="alert" className="text-sm">{formError}</p>}
      {/* EMPTY STATE */}
      {universes.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-border/80 rounded-2xl bg-card/30 space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Sparkles className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-lg font-serif font-bold text-foreground">
              Welcome to Lorebook Studio
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Every story begins somewhere. Create a Universe to organize your world, its characters,
              and the stories that take place within it.
            </p>
          </div>
          {onSaveThought && (
            <button
              type="button"
              onClick={() => {
                if (onOpenCreateModal) {
                  onOpenCreateModal({ action: 'create_universe' });
                } else {
                  handleStartCreate();
                }
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-xs hover:bg-gold-hover transition-all"
            >
              <Plus className="w-4 h-4" />
              Create Universe
            </button>
          )}
        </div>
      ) : (
        /* UNIVERSES GRID */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {universes.map((u) => {
            const entityCount = getUniverseEntities(documents, u.id, allUniverses).length;
            const bookCount = plan ? getBooksForUniverse(plan, u.id).length : 0;

            return (
              <div
                key={u.id}
                className="group relative p-6 rounded-2xl border border-border/80 bg-card/60 hover:bg-card hover:border-gold-rich/70 hover:shadow-[0_0_20px_rgba(221,186,120,0.14)] transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-lg font-serif font-bold text-foreground group-hover:text-gold-rich transition-colors">
                      {u.name}
                    </h3>
                    {onSaveThought && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(u);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-primary rounded-md transition-all"
                        title="Edit universe details"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {u.description ? (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-4">
                      {u.description}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 italic mb-4">
                      No description recorded yet.
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-border/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <div className="flex items-center gap-1.5" title="Lore entities">
                      <Users className="w-3.5 h-3.5 text-primary" />
                      <span>{entityCount} {entityCount === 1 ? 'entity' : 'entities'}</span>
                    </div>
                    <div className="flex items-center gap-1.5" title="Books / Stories">
                      <BookOpen className="w-3.5 h-3.5 text-primary" />
                      <span>{bookCount} {bookCount === 1 ? 'book' : 'books'}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectUniverse(u.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-gold-hover hover:underline transition-colors"
                  >
                    Open Universe
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {(isCreating || editingUniverse) && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4">
            <h2 className="text-base font-serif font-bold text-foreground">
              {isCreating ? 'Create Narrative Universe' : `Edit Universe: ${editingUniverse?.name}`}
            </h2>

            {formError && (
              <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-600/40 p-2.5 rounded-lg">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  Universe Name <span className="text-primary">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={universeName}
                  onChange={(e) => setUniverseName(e.target.value)}
                  placeholder="e.g. Eryndor, The Solar Expanse, Arcanum"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  Description / Premise (Optional)
                </label>
                <textarea
                  rows={3}
                  value={universeDesc}
                  onChange={(e) => setUniverseDesc(e.target.value)}
                  placeholder="A brief summary of this world's theme, age, cosmology, or central conflict."
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleCancelModal}
                  className="px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !universeName.trim()}
                  className="px-5 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-gold-hover transition-colors disabled:opacity-40"
                >
                  {saving ? 'Saving...' : isCreating ? 'Create Universe' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
