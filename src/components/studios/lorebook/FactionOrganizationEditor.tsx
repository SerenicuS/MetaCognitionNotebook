import React, { useState, useMemo } from 'react';
import type {
  DocumentMetadata,
  FactionFields,
  FactionPosition,
  FactionBranch,
} from '@/types';
import type { Universe } from '@/utils/thought';
import {
  parseLoreMetadata,
  resolveEntityUniverse,
  wouldFormPositionCycle,
  wouldFormBranchCycle,
  removePositionSafely,
  removeBranchSafely,
} from '@/utils/universe';
import {
  Users,
  User,
  Plus,
  Trash2,
  Edit2,
  AlertCircle,
  FolderTree,
  ChevronUp,
  ChevronDown,
  X,
  ExternalLink,
  GitCommit,
  Building,
} from 'lucide-react';

interface FactionOrganizationEditorProps {
  fields: FactionFields;
  onChange: (patch: Partial<FactionFields>) => void;
  readOnly?: boolean;
  allDocuments?: DocumentMetadata[];
  universeId?: string;
  universes?: Universe[];
  onNavigateToEntity?: (id: string) => void;
}

export const FactionOrganizationEditor: React.FC<FactionOrganizationEditorProps> = ({
  fields,
  onChange,
  readOnly = false,
  allDocuments = [],
  universeId,
  universes = [],
  onNavigateToEntity,
}) => {
  const positions: FactionPosition[] = useMemo(
    () => fields.positions || [],
    [fields.positions]
  );
  const branches: FactionBranch[] = useMemo(
    () => fields.branches || [],
    [fields.branches]
  );

  // Position editing / creation state
  const [isAddingPosition, setIsAddingPosition] = useState(false);
  const [editingPosId, setEditingPosId] = useState<string | null>(null);
  const [posTitle, setPosTitle] = useState('');
  const [posDesc, setPosDesc] = useState('');
  const [posBranchId, setPosBranchId] = useState<string>('');
  const [posParentPosId, setPosParentPosId] = useState<string>('');
  const [posHolderIds, setPosHolderIds] = useState<string[]>([]);
  const [posError, setPosError] = useState('');

  // Branch editing / creation state
  const [isAddingBranch, setIsAddingBranch] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchDesc, setBranchDesc] = useState('');
  const [branchParentId, setBranchParentId] = useState<string>('');
  const [branchError, setBranchError] = useState('');

  // Filter scoped characters from active universe & house
  const scopedCharacters = useMemo(() => {
    return allDocuments.filter((doc) => {
      const meta = parseLoreMetadata(doc);
      if (meta.entry_type !== 'character') return false;
      if (universeId && universes.length > 0) {
        const res = resolveEntityUniverse(doc, universes);
        if (res.universeId !== universeId) return false;
      }
      return true;
    });
  }, [allDocuments, universeId, universes]);

  const characterMap = useMemo(() => {
    return new Map(scopedCharacters.map((c) => [c.id, c]));
  }, [scopedCharacters]);

  // Position CRUD Handlers
  const openNewPositionForm = () => {
    setPosTitle('');
    setPosDesc('');
    setPosBranchId('');
    setPosParentPosId('');
    setPosHolderIds([]);
    setPosError('');
    setEditingPosId(null);
    setIsAddingPosition(true);
  };

  const openEditPositionForm = (pos: FactionPosition) => {
    setPosTitle(pos.title);
    setPosDesc(pos.description || '');
    setPosBranchId(pos.branch_id || '');
    setPosParentPosId(pos.parent_position_id || '');
    setPosHolderIds(pos.holder_ids || []);
    setPosError('');
    setEditingPosId(pos.id);
    setIsAddingPosition(true);
  };

  const handleSavePosition = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = posTitle.trim();
    if (!cleanTitle) {
      setPosError('Position title is required.');
      return;
    }

    const parentId = posParentPosId.trim() || null;
    const branchId = posBranchId.trim() || null;

    if (editingPosId) {
      // Cycle check
      if (wouldFormPositionCycle(positions, editingPosId, parentId)) {
        setPosError('Circular reporting line detected. A position cannot report to itself or its subordinates.');
        return;
      }

      const updated = positions.map((p) => {
        if (p.id === editingPosId) {
          return {
            ...p,
            title: cleanTitle,
            description: posDesc.trim() || undefined,
            branch_id: branchId,
            parent_position_id: parentId,
            holder_ids: posHolderIds,
          };
        }
        return p;
      });

      onChange({ positions: updated });
    } else {
      const newId = `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const newPos: FactionPosition = {
        id: newId,
        title: cleanTitle,
        description: posDesc.trim() || undefined,
        branch_id: branchId,
        parent_position_id: parentId,
        holder_ids: posHolderIds,
        sort_order: positions.length + 1,
      };

      onChange({ positions: [...positions, newPos] });
    }

    setIsAddingPosition(false);
    setEditingPosId(null);
  };

  const handleDeletePosition = (posId: string) => {
    const pos = positions.find((p) => p.id === posId);
    if (!pos) return;

    const confirmMsg = `Delete official position "${pos.title}"?\nSubordinate positions reporting to this seat will have their reporting lines safely cleared without deletion.`;
    if (!window.confirm(confirmMsg)) return;

    const safePositions = removePositionSafely(positions, posId);
    onChange({ positions: safePositions });

    if (editingPosId === posId) {
      setIsAddingPosition(false);
      setEditingPosId(null);
    }
  };

  const handleMovePosition = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= positions.length) return;

    const copy = [...positions];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;

    // Update sort_order numbers
    const updated = copy.map((p, idx) => ({ ...p, sort_order: idx + 1 }));
    onChange({ positions: updated });
  };

  const handleAddHolderToPosition = (posId: string, charDocId: string) => {
    if (!charDocId) return;
    const updated = positions.map((p) => {
      if (p.id === posId) {
        const currentHolders = p.holder_ids || [];
        if (!currentHolders.includes(charDocId)) {
          return { ...p, holder_ids: [...currentHolders, charDocId] };
        }
      }
      return p;
    });
    onChange({ positions: updated });
  };

  const handleRemoveHolderFromPosition = (posId: string, charDocId: string) => {
    const updated = positions.map((p) => {
      if (p.id === posId) {
        return {
          ...p,
          holder_ids: (p.holder_ids || []).filter((id) => id !== charDocId),
        };
      }
      return p;
    });
    onChange({ positions: updated });
  };

  // Branch CRUD Handlers
  const openNewBranchForm = () => {
    setBranchName('');
    setBranchDesc('');
    setBranchParentId('');
    setBranchError('');
    setEditingBranchId(null);
    setIsAddingBranch(true);
  };

  const openEditBranchForm = (branch: FactionBranch) => {
    setBranchName(branch.name);
    setBranchDesc(branch.description || '');
    setBranchParentId(branch.parent_branch_id || '');
    setBranchError('');
    setEditingBranchId(branch.id);
    setIsAddingBranch(true);
  };

  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = branchName.trim();
    if (!cleanName) {
      setBranchError('Branch name is required.');
      return;
    }

    const parentId = branchParentId.trim() || null;

    if (editingBranchId) {
      // Cycle check
      if (wouldFormBranchCycle(branches, editingBranchId, parentId)) {
        setBranchError('Circular branch hierarchy detected. A branch cannot be subordinate to itself.');
        return;
      }

      const updated = branches.map((b) => {
        if (b.id === editingBranchId) {
          return {
            ...b,
            name: cleanName,
            description: branchDesc.trim() || undefined,
            parent_branch_id: parentId,
          };
        }
        return b;
      });

      onChange({ branches: updated });
    } else {
      const newId = `branch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const newBranch: FactionBranch = {
        id: newId,
        name: cleanName,
        description: branchDesc.trim() || undefined,
        parent_branch_id: parentId,
        sort_order: branches.length + 1,
      };

      onChange({ branches: [...branches, newBranch] });
    }

    setIsAddingBranch(false);
    setEditingBranchId(null);
  };

  const handleDeleteBranch = (branchId: string) => {
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) return;

    const confirmMsg = `Delete organizational branch "${branch.name}"?\nPositions in this branch will become unassigned, and child branches will become top-level branches without deleting positions.`;
    if (!window.confirm(confirmMsg)) return;

    const result = removeBranchSafely(branches, positions, branchId);
    onChange({ branches: result.branches, positions: result.positions });

    if (editingBranchId === branchId) {
      setIsAddingBranch(false);
      setEditingBranchId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with Add Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/50 text-xs">
        <div>
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-amber-400" />
            Official Structure &amp; Position Roster
          </span>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Define official seats, reporting lines, and holders. Hierarchy is optional and non-military.
          </p>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={openNewBranchForm}
              className="px-2.5 py-1 rounded bg-muted/40 hover:bg-muted/70 text-[11px] font-medium text-foreground flex items-center gap-1 transition-colors"
            >
              <FolderTree className="w-3 h-3 text-primary" />
              <span>Add Branch</span>
            </button>
            <button
              type="button"
              onClick={openNewPositionForm}
              className="px-2.5 py-1 rounded bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 text-[11px] font-medium flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>Add Position</span>
            </button>
          </div>
        )}
      </div>

      {/* ==================== BRANCH MANAGEMENT FORM ==================== */}
      {isAddingBranch && (
        <form
          onSubmit={handleSaveBranch}
          className="p-3.5 rounded-xl border border-primary/40 bg-card/70 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between pb-1 border-b border-border/40">
            <span className="font-semibold text-foreground">
              {editingBranchId ? 'Edit Organizational Branch' : 'Create Organizational Branch'}
            </span>
            <button
              type="button"
              onClick={() => setIsAddingBranch(false)}
              className="p-1 rounded text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {branchError && (
            <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{branchError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Branch / Department Name *
              </label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="e.g. High Council, Arcane Directorate, Royal Fleet"
                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Parent Branch (Optional Sub-Branch of)
              </label>
              <select
                value={branchParentId}
                onChange={(e) => setBranchParentId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">None (Top-Level Branch)</option>
                {branches
                  .filter((b) => b.id !== editingBranchId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-muted-foreground font-medium mb-1">
                Description &amp; Charter (Optional)
              </label>
              <input
                type="text"
                value={branchDesc}
                onChange={(e) => setBranchDesc(e.target.value)}
                placeholder="Purview, sphere of authority, or responsibilities..."
                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingBranch(false)}
              className="px-2.5 py-1 rounded bg-muted/40 hover:bg-muted/70 text-foreground text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
            >
              {editingBranchId ? 'Save Branch Changes' : 'Create Branch'}
            </button>
          </div>
        </form>
      )}

      {/* ==================== BRANCH LIST DISPLAY ==================== */}
      {branches.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
            <span>Organizational Branches ({branches.length}):</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {branches.map((b) => {
              const parent = branches.find((p) => p.id === b.parent_branch_id);
              const branchPosCount = positions.filter((p) => p.branch_id === b.id).length;
              return (
                <div
                  key={b.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/30 border border-border/60 text-xs"
                >
                  <FolderTree className="w-3 h-3 text-amber-400" />
                  <span className="font-medium text-foreground">{b.name}</span>
                  {parent && (
                    <span className="text-[10px] text-muted-foreground">
                      (sub of {parent.name})
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground/70">
                    [{branchPosCount} pos]
                  </span>
                  {!readOnly && (
                    <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-border/50">
                      <button
                        type="button"
                        onClick={() => openEditBranchForm(b)}
                        className="p-0.5 text-muted-foreground hover:text-foreground"
                        title="Edit Branch"
                      >
                        <Edit2 className="w-2.5 h-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBranch(b.id)}
                        className="p-0.5 text-muted-foreground hover:text-rose-400"
                        title="Delete Branch"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== POSITION CREATION / EDIT FORM ==================== */}
      {isAddingPosition && (
        <form
          onSubmit={handleSavePosition}
          className="p-3.5 rounded-xl border border-primary/40 bg-card/70 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between pb-1 border-b border-border/40">
            <span className="font-semibold text-foreground">
              {editingPosId ? 'Edit Official Position' : 'Create Official Position'}
            </span>
            <button
              type="button"
              onClick={() => setIsAddingPosition(false)}
              className="p-1 rounded text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {posError && (
            <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{posError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Position Title / Seat *
              </label>
              <input
                type="text"
                value={posTitle}
                onChange={(e) => setPosTitle(e.target.value)}
                placeholder="e.g. Cognitive Emperor, Lord Commander, Grand Archon"
                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Branch / Division (Optional)
              </label>
              <select
                value={posBranchId}
                onChange={(e) => setPosBranchId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">General / No Branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Reports To (Parent Position - Optional)
              </label>
              <select
                value={posParentPosId}
                onChange={(e) => setPosParentPosId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">None (Top-Level Office)</option>
                {positions
                  .filter((p) => p.id !== editingPosId)
                  .filter((p) => !wouldFormPositionCycle(positions, editingPosId || '', p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Description / Powers (Optional)
              </label>
              <input
                type="text"
                value={posDesc}
                onChange={(e) => setPosDesc(e.target.value)}
                placeholder="Institutional responsibilities, powers, or vows..."
                className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Holder Selection in Modal */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="block text-muted-foreground font-medium">
                Assigned Position Holders (Characters in this Universe)
              </label>
              <div className="flex flex-wrap items-center gap-1.5 min-h-[32px] p-2 rounded-lg bg-background border border-border/70">
                {posHolderIds.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground/60 italic">
                    Currently vacant (no holders assigned).
                  </span>
                ) : (
                  posHolderIds.map((charId) => {
                    const charDoc = characterMap.get(charId);
                    return (
                      <span
                        key={charId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/30 text-primary text-xs"
                      >
                        <User className="w-3 h-3 text-primary/70" />
                        <span>{charDoc ? charDoc.title : `Unresolved [${charId}]`}</span>
                        <button
                          type="button"
                          onClick={() => setPosHolderIds(posHolderIds.filter((id) => id !== charId))}
                          className="hover:text-rose-400 p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })
                )}
              </div>

              {/* Add Holder Selector */}
              <div className="flex items-center gap-2 pt-1">
                <select
                  aria-label="Add character holder to position"
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  value=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && !posHolderIds.includes(val)) {
                      setPosHolderIds([...posHolderIds, val]);
                    }
                  }}
                >
                  <option value="">Select Character to assign as holder...</option>
                  {scopedCharacters
                    .filter((c) => !posHolderIds.includes(c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingPosition(false)}
              className="px-2.5 py-1 rounded bg-muted/40 hover:bg-muted/70 text-foreground text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
            >
              {editingPosId ? 'Save Position Changes' : 'Create Position'}
            </button>
          </div>
        </form>
      )}

      {/* ==================== POSITIONS LIST ==================== */}
      {positions.length === 0 ? (
        <div className="p-4 rounded-xl border border-dashed border-border/80 text-center space-y-1.5">
          <p className="text-xs text-muted-foreground/80 font-medium">
            No official positions defined for this faction.
          </p>
          <p className="text-[11px] text-muted-foreground/60">
            Positions are optional. Create positions to represent leaders, officers, councilors, or members.
          </p>
          {!readOnly && (
            <button
              type="button"
              onClick={openNewPositionForm}
              className="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-md bg-muted/40 hover:bg-muted/70 text-xs font-medium text-foreground transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-primary" />
              <span>Define First Position</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {positions.map((pos, idx) => {
            const branch = branches.find((b) => b.id === pos.branch_id);
            const parentPos = positions.find((p) => p.id === pos.parent_position_id);
            const isVacant = !pos.holder_ids || pos.holder_ids.length === 0;

            return (
              <div
                key={pos.id}
                className="p-3 rounded-xl border border-border/70 bg-card/40 hover:bg-card/60 transition-colors space-y-2 text-xs"
              >
                {/* Title and Action Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-foreground text-sm">
                        {pos.title}
                      </span>

                      {/* Vacancy indicator */}
                      {isVacant ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          Vacant
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          {pos.holder_ids!.length} {pos.holder_ids!.length === 1 ? 'Holder' : 'Holders'}
                        </span>
                      )}

                      {/* Branch Badge */}
                      {branch && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/50 text-muted-foreground border border-border/60">
                          <FolderTree className="w-2.5 h-2.5" />
                          <span>{branch.name}</span>
                        </span>
                      )}

                      {/* Reports to Badge */}
                      {parentPos && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground">
                          <GitCommit className="w-2.5 h-2.5 text-primary" />
                          <span>Reports to: <strong className="text-foreground">{parentPos.title}</strong></span>
                        </span>
                      )}
                    </div>

                    {pos.description && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {pos.description}
                      </p>
                    )}
                  </div>

                  {/* Move & Edit Controls */}
                  {!readOnly && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMovePosition(idx, 'up')}
                        className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                        title="Move Up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === positions.length - 1}
                        onClick={() => handleMovePosition(idx, 'down')}
                        className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                        title="Move Down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditPositionForm(pos)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground"
                        title="Edit Position"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePosition(pos.id)}
                        className="p-1 rounded text-muted-foreground hover:text-rose-400"
                        title="Delete Position"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Assigned Position Holders Row */}
                <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                      <Users className="w-3 h-3 text-primary" />
                      Holders:
                    </span>

                    {isVacant ? (
                      <span className="text-[11px] text-muted-foreground/60 italic">
                        None currently assigned
                      </span>
                    ) : (
                      pos.holder_ids!.map((charId) => {
                        const charDoc = characterMap.get(charId);
                        if (!charDoc) {
                          // Unresolved reference indicator
                          return (
                            <span
                              key={charId}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]"
                              title={`Character ID '${charId}' not found in active universe`}
                            >
                              <AlertCircle className="w-3 h-3" />
                              <span>Unresolved [{charId.slice(0, 8)}]</span>
                              {!readOnly && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveHolderFromPosition(pos.id, charId)}
                                  className="hover:text-rose-400 p-0.5"
                                  title="Remove unresolved holder"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                          );
                        }

                        return (
                          <span
                            key={charId}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 border border-border text-foreground text-xs"
                          >
                            <User className="w-3 h-3 text-sky-400" />
                            <span
                              className={onNavigateToEntity ? 'cursor-pointer hover:underline' : ''}
                              onClick={() => onNavigateToEntity && onNavigateToEntity(charId)}
                            >
                              {charDoc.title}
                            </span>
                            {onNavigateToEntity && (
                              <button
                                type="button"
                                onClick={() => onNavigateToEntity(charId)}
                                className="text-muted-foreground hover:text-foreground"
                                title="Open Character profile"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            )}
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() => handleRemoveHolderFromPosition(pos.id, charId)}
                                className="text-muted-foreground hover:text-rose-400 p-0.5 ml-0.5"
                                title={`Remove ${charDoc.title} from position`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        );
                      })
                    )}
                  </div>

                  {/* Inline Assign Holder Dropdown */}
                  {!readOnly && (
                    <div className="flex items-center gap-1">
                      <select
                        aria-label={`Assign character to position ${pos.title}`}
                        className="px-2 py-0.5 rounded bg-background border border-border/80 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddHolderToPosition(pos.id, e.target.value);
                          }
                        }}
                      >
                        <option value="">+ Assign Character...</option>
                        {scopedCharacters
                          .filter((c) => !(pos.holder_ids || []).includes(c.id))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
