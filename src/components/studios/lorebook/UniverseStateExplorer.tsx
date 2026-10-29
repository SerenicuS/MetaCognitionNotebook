import { MilestoneNarrative, type SaveNarrativeDocument } from './MilestoneNarrative';
import { resolveUniverseHouseId } from '@/utils/house';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { sourceChronicleRoute, focusChronicle } from '@/utils/chronicleNavigation';
import type { DocumentMetadata, LoreCategory } from '@/types';
import type { Plan, StoryNode, Thought, Universe, Branch } from '@/utils/thought';
import {
  timeline,
  newNode,
  insertNode,
  createBranch,
  renameBranch,
  archiveBranch,
} from '@/utils/thought';
import { LORE_CATEGORIES } from '@/utils/universe';
import {
  resolveUniverseStateAtMilestone,
  compareMilestoneStates,
  assignMilestoneState,
  clearMilestoneState,
  getStatusDescriptor,
  getCategoryPresets,
  NOT_INTRODUCED_STATUS,
  type ResolvedEntityState,
  type MilestoneStateDiff,
  type StateOrigin,
  type DifferenceType,
} from '@/utils/stateEngine';
import {
  Sparkles,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Filter,
  ArrowRight,
  AlertCircle,
  ExternalLink,
  Layers,
  Users,
  MapPin,
  Shield,
  Sword,
  Compass,
  Clock,
  GitBranch,
  GitFork,
  ArrowLeftRight,
  Edit3,
  Archive,
  Check,
  Split,
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface UniverseStateExplorerProps {
  universeId: string;
  universe: Universe;
  plan: Plan | null;
  documents: DocumentMetadata[];
  activeHouse?: import('@/types').HouseRecord | null;
  houses?: import('@/types').HouseRecord[];
  onSaveThought?: (
    expected: () => number,
    plan: import('@/utils/relationships').PlanMutation,
    acknowledge: (result: Thought) => void
  ) => Promise<boolean>;
  onOpenDocument: (docId: string) => void;
  onCreateMilestone?: () => void;
  onSaveDocument?: SaveNarrativeDocument;
  onOpenBook?: (id: string) => void;
  onCreateEntity: (category: LoreCategory, defaultTitle?: string) => void;
  initialContinuityId?: string | null;
  initialMilestoneId?: string | null;
  initialEntityId?: string | null;
}

const CATEGORY_ICONS: Record<LoreCategory, React.ElementType> = {
  characters: Users,
  locations: MapPin,
  factions: Shield,
  rules: Sparkles,
  cultures: Compass,
  artifacts: Sword,
  events: Calendar,
  other: Layers,
};

export const UniverseStateExplorer: React.FC<UniverseStateExplorerProps> = ({
  universeId,
  universe,
  plan,
  documents,
  activeHouse,
  houses,
  onSaveThought,
  onOpenDocument,
  onCreateMilestone,
  onSaveDocument,
  onOpenBook,
  onCreateEntity,
  initialContinuityId,
  initialMilestoneId,
  initialEntityId,
}) => {
  // Resolved universe info
  const currentUniverse = useMemo(() => {
    return (
      universe ||
      plan?.universes.find((u) => u.id === universeId) || {
        id: universeId,
        name: 'Universe',
        description: '',
      }
    );
  }, [universe, plan, universeId]);

  // All branches belonging to this Universe
  const universeBranches: Branch[] = useMemo(() => {
    if (!plan || !plan.branches) return [];
    return plan.branches.filter((b) => b.universe_id === universeId);
  }, [plan, universeId]);

  // Active Continuity Selection: null = Canonical History, string = Branch ID
  const [activeContinuityId, setActiveContinuityId] = useState<string | null>(null);
  const [showArchivedBranches, setShowArchivedBranches] = useState(false);

  // Active Branch object
  const activeBranch = useMemo(() => {
    if (!activeContinuityId) return null;
    return universeBranches.find((b) => b.id === activeContinuityId) || null;
  }, [universeBranches, activeContinuityId]);

  // Milestone branch divergence node info
  const divergenceMilestone = useMemo(() => {
    if (!activeBranch || !plan) return null;
    return plan.nodes.find((n) => n.id === activeBranch.divergence_node_id) || null;
  }, [activeBranch, plan]);

  // Canonical milestones count
  const canonicalMilestones = useMemo(() => {
    if (!plan) return [];
    return timeline(plan, universeId, null, null);
  }, [plan, universeId]);

  // Milestones in the active continuity
  const milestones: StoryNode[] = useMemo(() => {
    if (!plan) return [];
    return timeline(plan, universeId, null, activeContinuityId);
  }, [plan, universeId, activeContinuityId]);

  // Selected Milestone state
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(() => {
    return milestones.length > 0 ? milestones[0].id : null;
  });

  useEffect(() => {
    if (milestones.length > 0) {
      // If previous selection is still in active milestones, keep it; otherwise select first
      if (!selectedMilestoneId || !milestones.some((m) => m.id === selectedMilestoneId)) {
        setSelectedMilestoneId(milestones[0].id);
      }
    } else {
      setSelectedMilestoneId(null);
    }
  }, [activeContinuityId, milestones]);

  // Ensure selectedMilestoneId remains valid when milestones change
  const activeMilestone = useMemo(() => {
    if (!milestones.length) return null;
    if (selectedMilestoneId) {
      const found = milestones.find((m) => m.id === selectedMilestoneId);
      if (found) return found;
    }
    return milestones[0];
  }, [milestones, selectedMilestoneId]);

  const activeMilestoneIndex = useMemo(() => {
    if (!activeMilestone) return -1;
    return milestones.findIndex((m) => m.id === activeMilestone.id);
  }, [milestones, activeMilestone]);

  const chronicleRef = useRef<HTMLDivElement>(null);
  const [chronicleRequest, setChronicleRequest] = useState<{ milestoneId: string } | null>(null);
  const [navigationFeedback, setNavigationFeedback] = useState('');
  const openSourceChronicle = (sourceId: string) => {
    try {
      if (!plan || !activeMilestone) throw new Error('No historical context is available.');
      const route = sourceChronicleRoute(plan, universeId, activeMilestone.id, sourceId);
      setActiveContinuityId(route.continuityId);
      setSelectedMilestoneId(route.milestoneId);
      setChronicleRequest({ milestoneId: route.milestoneId });
      setNavigationFeedback('');
    } catch (error) { setNavigationFeedback(String(error)); }
  };
  useEffect(() => {
    if (chronicleRequest?.milestoneId !== activeMilestone?.id || !chronicleRef.current) return;
    focusChronicle(chronicleRef.current);
    setChronicleRequest(null);
  }, [chronicleRequest, activeMilestone?.id]);

  // Explorer view mode: Matrix vs What Changed (Diff) vs Compare Continuities
  const [viewMode, setViewMode] = useState<'matrix' | 'diff' | 'compare'>('matrix');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<LoreCategory | 'all'>('all');
  const [originFilter, setOriginFilter] = useState<StateOrigin | 'all'>('all');
  const [changedOnlyFilter, setChangedOnlyFilter] = useState(false);

  // Sync initial navigation from Echo Library / external callers
  useEffect(() => {
    if (initialContinuityId !== undefined) {
      setActiveContinuityId(initialContinuityId);
    }
  }, [initialContinuityId]);

  useEffect(() => {
    if (initialMilestoneId) {
      setSelectedMilestoneId(initialMilestoneId);
    }
  }, [initialMilestoneId]);

  useEffect(() => {
    if (initialEntityId) {
      const targetDoc = documents.find((d) => d.id === initialEntityId);
      if (targetDoc) {
        setSearchQuery(targetDoc.title);
      }
    }
  }, [initialEntityId, documents]);

  // State Assignment Modal State
  const [assigningEntity, setAssigningEntity] = useState<ResolvedEntityState | null>(null);
  const [inputStatus, setInputStatus] = useState('');
  const [inputNote, setInputNote] = useState('');
  const [isExplicitUnknown, setIsExplicitUnknown] = useState(false);
  const [isNotIntroduced, setIsNotIntroduced] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Branch Creation Modal State
  const [isCreateBranchOpen, setIsCreateBranchOpen] = useState(false);
  const [branchNameInput, setBranchNameInput] = useState('');
  const [branchDescInput, setBranchDescInput] = useState('');
  const [branchError, setBranchError] = useState('');

  // Branch Renaming / Editing Modal State
  const [isEditBranchOpen, setIsEditBranchOpen] = useState(false);
  const [editBranchNameInput, setEditBranchNameInput] = useState('');
  const [editBranchDescInput, setEditBranchDescInput] = useState('');

  // Milestone Creation Modal State
  const [isCreatingMilestone, setIsCreatingMilestone] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneEra, setNewMilestoneEra] = useState('');
  const [newMilestoneDesc, setNewMilestoneDesc] = useState('');
  const [createMilestoneError, setCreateMilestoneError] = useState('');
  const [isSubmittingMilestone, setIsSubmittingMilestone] = useState(false);

  const openMilestoneCreationModal = () => {
    setNewMilestoneTitle('');
    setNewMilestoneEra('');
    setNewMilestoneDesc('');
    setCreateMilestoneError('');
    setIsCreatingMilestone(true);
    if (onCreateMilestone) {
      onCreateMilestone();
    }
  };

  // Cross-Continuity Comparison Selectors State
  const allUniverseMilestones = useMemo(() => {
    if (!plan) return [];
    return plan.nodes.filter((n) => n.universe_id === universeId && n.book_id === null && !n.archived);
  }, [plan, universeId]);

  const [compareMilestoneAId, setCompareMilestoneAId] = useState<string | null>(null);
  const [compareMilestoneBId, setCompareMilestoneBId] = useState<string | null>(null);
  const [compareDiffFilter, setCompareDiffFilter] = useState<'all' | 'differences' | 'values_only'>('differences');

  // Initialize comparison milestones
  useEffect(() => {
    if (allUniverseMilestones.length >= 2) {
      if (!compareMilestoneAId) setCompareMilestoneAId(allUniverseMilestones[0].id);
      if (!compareMilestoneBId) setCompareMilestoneBId(allUniverseMilestones[1].id);
    } else if (allUniverseMilestones.length === 1) {
      if (!compareMilestoneAId) setCompareMilestoneAId(allUniverseMilestones[0].id);
      if (!compareMilestoneBId) setCompareMilestoneBId(allUniverseMilestones[0].id);
    }
  }, [allUniverseMilestones]);

  // Resolved states for current milestone
  const resolvedStates = useMemo(() => {
    if (!plan || !activeMilestone) {
      // If branch has no milestones yet, resolve state at divergence milestone!
      if (activeBranch && divergenceMilestone) {
        return resolveUniverseStateAtMilestone(plan!, documents, universeId, divergenceMilestone.id);
      }
      return [];
    }
    return resolveUniverseStateAtMilestone(plan, documents, universeId, activeMilestone.id);
  }, [plan, documents, universeId, activeMilestone, activeBranch, divergenceMilestone]);

  // Predecessor milestone for diff mode
  const predecessorMilestone = useMemo(() => {
    if (!activeMilestone) return null;
    if (activeMilestoneIndex > 0) {
      return milestones[activeMilestoneIndex - 1];
    }
    // If first milestone on a branch, predecessor is divergence node
    if (activeBranch && divergenceMilestone) {
      return divergenceMilestone;
    }
    return null;
  }, [milestones, activeMilestone, activeMilestoneIndex, activeBranch, divergenceMilestone]);

  // What Changed? comparison diffs
  const diffStates = useMemo(() => {
    if (!plan || !activeMilestone) return [];
    if (!predecessorMilestone) {
      // First canonical milestone: show entities that have explicit changes
      return resolvedStates.filter((s) => s.hasChangedAtThisMilestone);
    }
    return compareMilestoneStates(
      plan,
      documents,
      universeId,
      predecessorMilestone.id,
      activeMilestone.id
    ).filter((d) => d.hasDifference);
  }, [plan, documents, universeId, activeMilestone, predecessorMilestone, resolvedStates]);

  // Cross-Continuity comparison diffs
  const crossContinuityDiffs = useMemo(() => {
    if (!plan || !compareMilestoneAId || !compareMilestoneBId) return [];
    const diffs = compareMilestoneStates(
      plan,
      documents,
      universeId,
      compareMilestoneAId,
      compareMilestoneBId
    );
    return diffs.filter((d) => {
      if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!d.entityTitle.toLowerCase().includes(q)) return false;
      }
      if (compareDiffFilter === 'differences') return d.hasDifference;
      if (compareDiffFilter === 'values_only') return d.differenceType === 'value_change';
      return true;
    });
  }, [plan, documents, universeId, compareMilestoneAId, compareMilestoneBId, categoryFilter, searchQuery, compareDiffFilter]);

  // Filtered states for the Matrix
  const filteredStates = useMemo(() => {
    return resolvedStates.filter((s) => {
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (originFilter !== 'all' && s.origin !== originFilter) return false;
      if (changedOnlyFilter && !s.hasChangedAtThisMilestone) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!s.entityTitle.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [resolvedStates, categoryFilter, originFilter, changedOnlyFilter, searchQuery]);

  // Milestone navigation handlers
  const handlePrevMilestone = () => {
    if (activeMilestoneIndex > 0) {
      setSelectedMilestoneId(milestones[activeMilestoneIndex - 1].id);
    }
  };

  const handleNextMilestone = () => {
    if (activeMilestoneIndex < milestones.length - 1) {
      setSelectedMilestoneId(milestones[activeMilestoneIndex + 1].id);
    }
  };

  // Open State Assignment Modal
  const handleOpenAssignModal = (entity: ResolvedEntityState) => {
    setAssigningEntity(entity);
    setInputStatus(entity.value || '');
    setInputNote(entity.note || '');
    setIsExplicitUnknown(entity.origin === 'unknown');
    setIsNotIntroduced(entity.origin === 'not_yet_introduced');
    setSaveFeedback(null);
  };

  // Save State Assignment via onSaveThought
  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveThought || !plan || !activeMilestone || !assigningEntity) return;

    let finalValue: string | null = null;
    if (isExplicitUnknown) {
      finalValue = null;
    } else if (isNotIntroduced) {
      finalValue = NOT_INTRODUCED_STATUS;
    } else {
      const clean = inputStatus.trim();
      if (!clean) {
        setSaveFeedback({ type: 'error', message: 'Please select a status preset or enter a custom status.' });
        return;
      }
      finalValue = clean;
    }

    setIsSaving(true);
    setSaveFeedback(null);

    try {
      const updatedPlan = assignMilestoneState(
        plan,
        activeMilestone.id,
        assigningEntity.entityId,
        'status',
        finalValue,
        inputNote.trim() || undefined,
        undefined,
        documents,
        {
          activeHouseId: activeHouse?.id,
          houses,
        }
      );

      const ok = await onSaveThought(
        () => plan.revision,
        updatedPlan,
        () => {}
      );

      if (ok) {
        setAssigningEntity(null);
      } else {
        setSaveFeedback({ type: 'error', message: 'Failed to persist state change. Changes remain queued in this window.' });
      }
    } catch (err: any) {
      setSaveFeedback({ type: 'error', message: err?.message || 'Error assigning state.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Revert Explicit Assignment back to Predecessor Inherited State
  const handleRevertAssignment = async (entityId: string) => {
    if (!onSaveThought || !plan || !activeMilestone) return;

    setIsSaving(true);
    try {
      const updatedPlan = clearMilestoneState(plan, activeMilestone.id, entityId, 'status');
      const ok = await onSaveThought(
        () => plan.revision,
        updatedPlan,
        () => {}
      );
      if (ok) {
        setAssigningEntity(null);
      }
    } catch (err: any) {
      console.error('Failed to revert state:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Create Alternate Branch Handler
  const handleCreateBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan || !onSaveThought) return;
    const cleanName = branchNameInput.trim();
    if (!cleanName) {
      setBranchError('Please enter a branch name.');
      return;
    }
    const targetDivNode = activeMilestone ? activeMilestone.id : divergenceMilestone?.id;
    if (!targetDivNode) {
      setBranchError('No valid divergence milestone selected.');
      return;
    }

    setIsSaving(true);
    setBranchError('');
    try {
      const { plan: updatedPlan, branch } = createBranch(
        plan,
        universeId,
        cleanName,
        targetDivNode,
        branchDescInput.trim() || undefined,
        activeContinuityId
      );

      const ok = await onSaveThought(
        () => plan.revision,
        updatedPlan,
        () => {}
      );

      if (ok) {
        setIsCreateBranchOpen(false);
        setBranchNameInput('');
        setBranchDescInput('');
        setActiveContinuityId(branch.id);
      } else {
        setBranchError('Failed to persist alternate continuity branch.');
      }
    } catch (err: any) {
      setBranchError(err?.message || 'Error creating alternate branch.');
    } finally {
      setIsSaving(false);
    }
  };

  // Rename / Edit Branch Handler
  const handleEditBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan || !onSaveThought || !activeBranch) return;
    const cleanName = editBranchNameInput.trim();
    if (!cleanName) return;

    setIsSaving(true);
    try {
      const updatedPlan = renameBranch(
        plan,
        activeBranch.id,
        cleanName,
        editBranchDescInput.trim() || undefined
      );

      const ok = await onSaveThought(
        () => plan.revision,
        updatedPlan,
        () => {}
      );

      if (ok) {
        setIsEditBranchOpen(false);
      }
    } catch (err: any) {
      console.error('Failed to rename branch:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Archive / Restore Branch Handler
  const handleToggleArchiveBranch = async () => {
    if (!plan || !onSaveThought || !activeBranch) return;
    const willArchive = !activeBranch.archived;
    setIsSaving(true);
    try {
      const updatedPlan = archiveBranch(plan, activeBranch.id, willArchive);
      const ok = await onSaveThought(
        () => plan.revision,
        updatedPlan,
        () => {}
      );
      if (ok && willArchive) {
        setActiveContinuityId(null);
      }
    } catch (err: any) {
      console.error('Failed to update branch archive status:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Submit Milestone Creation Handler
  const handleCreateMilestoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan || !onSaveThought) {
      setCreateMilestoneError('Planning desk is not initialized or read-only.');
      return;
    }
    const cleanTitle = newMilestoneTitle.trim();
    if (!cleanTitle) {
      setCreateMilestoneError('Milestone title is required.');
      return;
    }

    if (isSubmittingMilestone) return;
    setIsSubmittingMilestone(true);
    setCreateMilestoneError('');

    try {
      const node: StoryNode = {
        ...newNode(
          plan,
          universeId,
          null,
          activeMilestone ? activeMilestone.id : undefined,
          activeContinuityId || null
        ),
        title: cleanTitle,
        era: newMilestoneEra.trim(),
        description: newMilestoneDesc.trim(),
      };

      const updatedPlan = insertNode(plan, node);
      const ok = await onSaveThought(
        () => plan.revision,
        updatedPlan,
        () => {}
      );

      if (ok) {
        setSelectedMilestoneId(node.id);
        setNewMilestoneTitle('');
        setNewMilestoneEra('');
        setNewMilestoneDesc('');
        setIsCreatingMilestone(false);
      } else {
        setCreateMilestoneError('Failed to save milestone to planning desk. Please try again.');
      }
    } catch (err: any) {
      console.error('Failed to create milestone:', err);
      setCreateMilestoneError(err?.message || 'An unexpected error occurred while creating the milestone.');
    } finally {
      setIsSubmittingMilestone(false);
    }
  };

  const renderMilestoneCreationModal = () => (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create Historical Milestone"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="w-full max-w-md rounded-2xl border border-primary/40 bg-card shadow-2xl p-6 space-y-4 text-xs text-foreground font-sans text-left">
        <div className="flex items-center justify-between pb-2 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-base font-serif font-bold text-foreground">
              {milestones.length === 0 && !activeBranch
                ? 'Create First Historical Milestone'
                : activeBranch
                ? `Add Milestone to ${activeBranch.name}`
                : 'Add Historical Milestone'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isSubmittingMilestone) {
                setIsCreatingMilestone(false);
                setCreateMilestoneError('');
              }
            }}
            disabled={isSubmittingMilestone}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors disabled:opacity-40"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {createMilestoneError && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{createMilestoneError}</span>
          </div>
        )}

        <form onSubmit={handleCreateMilestoneSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-muted-foreground font-medium mb-1">
              Milestone Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              autoFocus
              required
              value={newMilestoneTitle}
              onChange={(e) => setNewMilestoneTitle(e.target.value)}
              placeholder="e.g. Founding of the High Kingdom, Battle of Red Ridge"
              disabled={isSubmittingMilestone}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-serif text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-muted-foreground font-medium mb-1">
              Historical Era / Chronology (Optional)
            </label>
            <input
              type="text"
              value={newMilestoneEra}
              onChange={(e) => setNewMilestoneEra(e.target.value)}
              placeholder="e.g. Year 1, Dawn of the Second Age"
              disabled={isSubmittingMilestone}
              className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-muted-foreground font-medium mb-1">
              Historical Summary / What happens? (Optional)
            </label>
            <textarea
              rows={3}
              value={newMilestoneDesc}
              onChange={(e) => setNewMilestoneDesc(e.target.value)}
              placeholder="Record the world-level historical context, key events, or conditions."
              disabled={isSubmittingMilestone}
              className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none disabled:opacity-50"
            />
          </div>

          <div className="p-2.5 rounded-lg bg-muted/20 border border-border/40 text-[11px] text-muted-foreground flex items-center gap-2">
            <GitBranch className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>
              Target Continuity:{' '}
              <strong className="text-foreground">
                {activeBranch ? `Alternate: ${activeBranch.name}` : 'Canonical History'}
              </strong>
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={() => {
                setIsCreatingMilestone(false);
                setCreateMilestoneError('');
              }}
              disabled={isSubmittingMilestone}
              className="px-3.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingMilestone || !newMilestoneTitle.trim()}
              className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-gold-hover transition-colors disabled:opacity-40 inline-flex items-center gap-1.5 shadow-sm"
            >
              {isSubmittingMilestone ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Milestone</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // Helper for origin badge styles
  const renderOriginBadge = (
    origin: StateOrigin,
    sourceTitle?: string,
    sourceEra?: string,
    sourceContinuityName?: string
  ) => {
    switch (origin) {
      case 'explicit':
        return (
          <div className="flex flex-col text-[10px] leading-tight">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/20 text-primary border border-primary/40">
              Recorded at this milestone
            </span>
            {sourceContinuityName && sourceContinuityName !== 'Canonical History' && (
              <span className="text-[9px] text-violet-400 font-mono mt-0.5 truncate max-w-[150px]">
                ✦ {sourceContinuityName}
              </span>
            )}
          </div>
        );
      case 'inherited':
        return (
          <div className="flex flex-col text-[10px] text-muted-foreground leading-tight">
            <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
              ↳ Inherited
            </span>
            {sourceTitle && (
              <span
                className="text-[9px] text-muted-foreground/75 truncate max-w-[150px]"
                title={`${sourceTitle} (${sourceEra})`}
              >
                from {sourceTitle}
              </span>
            )}
            {sourceContinuityName && (
              <span
                className={cn(
                  'text-[9px] font-mono mt-0.5 truncate max-w-[150px]',
                  sourceContinuityName === 'Canonical History' ? 'text-muted-foreground/60' : 'text-violet-400 font-medium'
                )}
              >
                {sourceContinuityName === 'Canonical History' ? '★ Canonical' : `✦ ${sourceContinuityName}`}
              </span>
            )}
          </div>
        );
      case 'unknown':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-950/40 text-amber-300 border border-amber-800/40">
            ? Unknown (Explicit)
          </span>
        );
      case 'not_yet_introduced':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-950/40 text-blue-300 border border-blue-800/40">
            Not Yet Introduced
          </span>
        );
      case 'unassigned':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-muted-foreground/60 border border-dashed border-border/50">
            — Unassigned
          </span>
        );
    }
  };

  // Helper for status badge style
  const renderStatusBadge = (category: LoreCategory, value: string | null) => {
    const desc = getStatusDescriptor(category, value);

    if (desc.isUnknown) {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-muted/40 text-muted-foreground border border-border/40">
          Unknown
        </span>
      );
    }

    if (desc.isNotIntroduced) {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-950/30 text-blue-400 border border-blue-800/40">
          Not Yet Introduced
        </span>
      );
    }

    if (desc.isCustom) {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-violet-950/40 text-violet-300 border border-violet-700/50 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
          {desc.label}
          <span className="text-[9px] opacity-60 uppercase font-mono">(custom)</span>
        </span>
      );
    }

    // Presets color mapping
    const isTerminal = ['deceased', 'collapsed', 'ruined', 'shattered', 'extinct'].includes(desc.key || '');
    const isAlert = [
      'contested',
      'damaged',
      'weakened',
      'suppressed',
      'missing',
      'incapacitated',
      'declining',
      'underground',
    ].includes(desc.key || '');
    const isPositive = ['alive', 'active', 'intact', 'stored', 'flourishing', 'concluded', 'legendary'].includes(
      desc.key || ''
    );

    return (
      <span
        className={cn(
          'px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 border',
          isTerminal && 'bg-rose-950/40 text-rose-300 border-rose-800/50',
          isAlert && 'bg-amber-950/40 text-amber-300 border-amber-800/50',
          isPositive && 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50',
          !isTerminal && !isAlert && !isPositive && 'bg-muted text-foreground border-border'
        )}
      >
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            isTerminal && 'bg-rose-400',
            isAlert && 'bg-amber-400',
            isPositive && 'bg-emerald-400',
            !isTerminal && !isAlert && !isPositive && 'bg-muted-foreground'
          )}
        />
        {desc.label}
      </span>
    );
  };

  // Helper for difference type badge
  const renderDifferenceBadge = (diffType: DifferenceType) => {
    switch (diffType) {
      case 'value_change':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950/40 text-rose-300 border border-rose-800/40">
            Value Change
          </span>
        );
      case 'provenance_only':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-950/40 text-blue-300 border border-blue-800/40">
            Provenance Only
          </span>
        );
      case 'unassigned_to_state':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950/40 text-emerald-300 border border-emerald-800/40">
            Introduced in B
          </span>
        );
      case 'state_to_unassigned':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-950/40 text-amber-300 border border-amber-800/40">
            Unassigned in B
          </span>
        );
      case 'none':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono text-muted-foreground/60 border border-border/40">
            Identical
          </span>
        );
    }
  };

  // --------------------------------------------------------------------------
  // EMPTY STATE: No Milestones in this Universe
  // --------------------------------------------------------------------------
  if (canonicalMilestones.length === 0 && universeBranches.length === 0) {
    return (
      <div className="p-12 text-center border border-dashed border-border/80 rounded-2xl bg-card/20 space-y-4">
        <Sparkles className="w-10 h-10 mx-auto text-primary/70 animate-pulse" />
        <div className="space-y-1">
          <h3 className="text-base font-serif font-bold text-foreground">
            No Historical Milestones in {currentUniverse.name}
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            Web of Thought snapshots require Universe milestones to track how characters, nations,
            locations, and systems change over historical eras.
          </p>
        </div>
        <button
          type="button"
          onClick={openMilestoneCreationModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-gold-hover transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          Create First Historical Event
        </button>

        {isCreatingMilestone && renderMilestoneCreationModal()}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // EMPTY STATE: No Entities in this Universe
  // --------------------------------------------------------------------------
  if (resolvedStates.length === 0 && canonicalMilestones.length > 0 && !activeBranch) {
    return (
      <div className="p-12 text-center border border-dashed border-border/80 rounded-2xl bg-card/20 space-y-4">
        <Layers className="w-10 h-10 mx-auto text-primary/70" />
        <div className="space-y-1">
          <h3 className="text-base font-serif font-bold text-foreground">
            No Lore Entities in {currentUniverse.name}
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            Create characters, factions, locations, or rules to begin tracking universe states across historical eras.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCreateEntity('characters')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-gold-hover transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          Create First Lore Entry
        </button>
      </div>
    );
  }

  // MAIN EXPLORER VIEW
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ==================================================================== */}
      {/* 0. CONTINUITY TOOLBAR & SELECTOR */}
      {/* ==================================================================== */}
      <div className="p-3.5 rounded-2xl border border-border/80 bg-card/70 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <GitBranch className="w-4 h-4 text-primary" />
            <span>Continuity:</span>
          </div>

          {/* Continuity Selector */}
          <select
            value={activeContinuityId || ''}
            onChange={(e) => {
              setActiveContinuityId(e.target.value || null);
            }}
            className="px-3 py-1.5 rounded-xl bg-background border border-border text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary text-xs"
          >
            <option value="">★ Canonical History ({canonicalMilestones.length} milestones)</option>
            {universeBranches
              .filter((b) => showArchivedBranches || !b.archived)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  ✦ {b.name} {b.archived ? '(Archived)' : ''}
                </option>
              ))}
          </select>

          {/* Toggle archived branches visibility */}
          {universeBranches.some((b) => b.archived) && (
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none pl-1">
              <input
                type="checkbox"
                checked={showArchivedBranches}
                onChange={(e) => setShowArchivedBranches(e.target.checked)}
                className="rounded text-primary focus:ring-primary w-3 h-3"
              />
              <span>Show Archived Branches</span>
            </label>
          )}
        </div>

        {/* Action: Branch from Current Milestone */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setBranchNameInput('');
              setBranchDescInput('');
              setBranchError('');
              setIsCreateBranchOpen(true);
            }}
            disabled={!activeMilestone}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-violet-700/50 bg-violet-950/20 text-violet-300 hover:bg-violet-900/30 transition-colors font-medium text-xs disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
            title="Create an alternate timeline branching from this milestone"
          >
            <Split className="w-3.5 h-3.5 text-violet-400" />
            <span>Branch from Current Milestone</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 0B. ALTERNATE CONTINUITY BANNER (When on an alternate branch) */}
      {/* ==================================================================== */}
      {activeBranch && (
        <div className="p-4 rounded-2xl border border-violet-800/40 bg-violet-950/20 space-y-2 text-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-violet-900/50 text-violet-300 font-bold border border-violet-700/40 flex items-center gap-1">
                  <GitFork className="w-3 h-3 text-violet-400" />
                  Alternate Continuity Branch
                </span>
                {activeBranch.archived && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-amber-950/40 text-amber-300 border border-amber-800/40">
                    Archived
                  </span>
                )}
              </div>
              <h3 className="text-base font-serif font-bold text-violet-100 flex items-center gap-2">
                <span>{activeBranch.name}</span>
              </h3>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
              <button
                type="button"
                onClick={() => {
                  setEditBranchNameInput(activeBranch.name);
                  setEditBranchDescInput(activeBranch.description || '');
                  setIsEditBranchOpen(true);
                }}
                className="px-2.5 py-1 rounded-lg border border-violet-800/50 bg-background/50 hover:bg-violet-950/40 text-violet-200 transition-colors text-xs flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" />
                <span>Rename / Edit</span>
              </button>
              <button
                type="button"
                onClick={handleToggleArchiveBranch}
                className="px-2.5 py-1 rounded-lg border border-violet-800/50 bg-background/50 hover:bg-violet-950/40 text-violet-200 transition-colors text-xs flex items-center gap-1"
              >
                <Archive className="w-3 h-3" />
                <span>{activeBranch.archived ? 'Restore Branch' : 'Archive Branch'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground pt-1 border-t border-violet-800/30">
            <span>
              <strong className="text-foreground/90">Diverged from:</strong>{' '}
              {divergenceMilestone ? (
                <span className="text-violet-300 font-serif">
                  {divergenceMilestone.title} {divergenceMilestone.era ? `(${divergenceMilestone.era})` : ''}
                </span>
              ) : (
                <span className="text-muted-foreground italic">Divergence milestone unrecorded</span>
              )}
            </span>
            {activeBranch.description && (
              <span className="text-muted-foreground italic">&ldquo;{activeBranch.description}&rdquo;</span>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 1. MILESTONE SCRUBBING & NAVIGATION BAR */}
      {/* ==================================================================== */}
      <div className="p-4 rounded-2xl border border-border/80 bg-card/60 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase font-bold">
                Era Snapshot
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {milestones.length > 0
                  ? `Milestone ${activeMilestoneIndex + 1} of ${milestones.length}`
                  : '0 Milestones on this Branch'}
              </span>
              {activeBranch && (
                <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-violet-950/40 text-violet-300 border border-violet-800/40">
                  ✦ {activeBranch.name}
                </span>
              )}
            </div>
            <h2 className="text-lg font-serif font-bold text-foreground flex items-center gap-2">
              <span>{activeMilestone ? activeMilestone.title : divergenceMilestone ? `Inheriting ${divergenceMilestone.title}` : 'No Milestones'}</span>
              {activeMilestone?.era && (
                <span className="text-xs font-mono font-normal text-primary">
                  ({activeMilestone.era})
                </span>
              )}
            </h2>
          </div>

          {/* Previous / Milestone Dropdown / Next / Add Milestone */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end flex-wrap">
            <button
              type="button"
              onClick={handlePrevMilestone}
              disabled={activeMilestoneIndex <= 0}
              className="p-1.5 rounded-lg border border-border bg-background text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Previous milestone in time"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <select
              value={activeMilestone?.id || ''}
              onChange={(e) => setSelectedMilestoneId(e.target.value)}
              disabled={milestones.length === 0}
              className="px-3 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs font-serif font-medium focus:outline-none focus:ring-1 focus:ring-primary max-w-[220px] truncate disabled:opacity-50"
            >
              {milestones.length === 0 ? (
                <option value="">(No branch milestones yet)</option>
              ) : (
                milestones.map((m, idx) => (
                  <option key={m.id} value={m.id}>
                    {idx + 1}. {m.title} {m.era ? `(${m.era})` : ''}
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              onClick={handleNextMilestone}
              disabled={activeMilestoneIndex >= milestones.length - 1}
              className="p-1.5 rounded-lg border border-border bg-background text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Next milestone in time"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={openMilestoneCreationModal}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors text-xs font-medium"
              title="Add a new milestone to the current continuity"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Milestone</span>
            </button>
          </div>
        </div>

        {navigationFeedback && <p role="status" className="text-sm text-amber-500">{navigationFeedback}</p>}
        {activeMilestone && plan && <div ref={chronicleRef} tabIndex={-1} aria-label={`${activeMilestone.title} Chronicle`} className="rounded-xl focus:outline focus:outline-2 focus:outline-primary"><MilestoneNarrative key={activeMilestone.id} milestone={activeMilestone} plan={plan} documents={documents} houseId={activeHouse?.id || resolveUniverseHouseId(universeId, houses || [])} houses={houses} save={onSaveThought} saveDocument={onSaveDocument} onOpenDocument={onOpenDocument} onOpenBook={onOpenBook}/></div>}

        {/* View Mode Switcher: State Matrix vs What Changed vs Compare Continuities */}
        <div className="flex items-center justify-between border-t border-border/40 pt-3 text-xs flex-wrap gap-2">
          <div className="flex items-center gap-1.5 bg-background p-1 rounded-xl border border-border/70 flex-wrap">
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={cn(
                'px-3 py-1 rounded-lg font-medium transition-colors',
                viewMode === 'matrix'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Universe State Matrix ({filteredStates.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('diff')}
              className={cn(
                'px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5',
                viewMode === 'diff'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span>What Changed?</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary-foreground/20 text-inherit font-mono">
                {diffStates.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('compare')}
              className={cn(
                'px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5',
                viewMode === 'compare'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <ArrowLeftRight className="w-3 h-3" />
              <span>Compare Timelines</span>
            </button>
          </div>

          <div className="text-[11px] text-muted-foreground hidden sm:block">
            {viewMode === 'matrix' ? (
              <span>Inspecting all universe entities at this point in history.</span>
            ) : viewMode === 'diff' ? (
              predecessorMilestone ? (
                <span>Compared against: {predecessorMilestone.title} ({predecessorMilestone.era || 'earlier'})</span>
              ) : (
                <span>Founding milestone · Initial state establishment</span>
              )
            ) : (
              <span>Cross-continuity & alternate timeline state comparison.</span>
            )}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. COMPARE CONTINUITIES / MILESTONES MODE */}
      {/* ==================================================================== */}
      {viewMode === 'compare' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="p-4 rounded-xl border border-border/80 bg-card space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              {/* Milestone A Selector */}
              <div className="flex-1 space-y-1">
                <label className="block text-muted-foreground font-medium text-xs">
                  Milestone A (Baseline):
                </label>
                <select
                  value={compareMilestoneAId || ''}
                  onChange={(e) => setCompareMilestoneAId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {allUniverseMilestones.map((m) => {
                    const branch = m.branch_id ? plan?.branches?.find((b) => b.id === m.branch_id) : null;
                    const scopeLabel = branch ? `[✦ ${branch.name}]` : '[★ Canonical]';
                    return (
                      <option key={m.id} value={m.id}>
                        {scopeLabel} {m.title} {m.era ? `(${m.era})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex items-center justify-center pt-4 sm:pt-0">
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
              </div>

              {/* Milestone B Selector */}
              <div className="flex-1 space-y-1">
                <label className="block text-muted-foreground font-medium text-xs">
                  Milestone B (Comparison Target):
                </label>
                <select
                  value={compareMilestoneBId || ''}
                  onChange={(e) => setCompareMilestoneBId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {allUniverseMilestones.map((m) => {
                    const branch = m.branch_id ? plan?.branches?.find((b) => b.id === m.branch_id) : null;
                    const scopeLabel = branch ? `[✦ ${branch.name}]` : '[★ Canonical]';
                    return (
                      <option key={m.id} value={m.id}>
                        {scopeLabel} {m.title} {m.era ? `(${m.era})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/40 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">Filter differences:</span>
                <div className="flex items-center gap-1 bg-background p-0.5 rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setCompareDiffFilter('all')}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs transition-colors',
                      compareDiffFilter === 'all'
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    All Entities
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareDiffFilter('differences')}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs transition-colors',
                      compareDiffFilter === 'differences'
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Only Differences
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareDiffFilter('values_only')}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs transition-colors',
                      compareDiffFilter === 'values_only'
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Value Changes Only
                  </button>
                </div>
              </div>

              <div className="relative max-w-xs flex-1">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search entity..."
                  className="w-full pl-8 pr-2.5 py-1 rounded-lg bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Comparison Results Table */}
          {crossContinuityDiffs.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-border/80 rounded-xl bg-card/20 space-y-2 text-xs text-muted-foreground">
              <Check className="w-6 h-6 mx-auto text-emerald-500" />
              <div className="font-semibold text-foreground">No Differences Found</div>
              <p className="max-w-md mx-auto">
                All entities share identical resolved states and provenance between these two milestones.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/30 border-b border-border/80 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-4">Entity</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">State in Milestone A</th>
                      <th className="py-2.5 px-3">State in Milestone B</th>
                      <th className="py-2.5 px-3">Comparison Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {crossContinuityDiffs.map((diff) => {
                      const Icon = CATEGORY_ICONS[diff.category] || Layers;
                      return (
                        <tr key={diff.entityId} className="hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4 font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span className="font-serif font-bold">{diff.entityTitle}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground">
                              {diff.category}
                            </span>
                          </td>
                          <td className="py-3 px-3 space-y-1">
                            <div>{renderStatusBadge(diff.category, diff.stateA.value)}</div>
                            <div className="text-[10px] text-muted-foreground/80">
                              {renderOriginBadge(
                                diff.stateA.origin,
                                diff.stateA.sourceMilestoneTitle,
                                diff.stateA.sourceMilestoneEra,
                                diff.stateA.sourceContinuityName
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 space-y-1">
                            <div>{renderStatusBadge(diff.category, diff.stateB.value)}</div>
                            <div className="text-[10px] text-muted-foreground/80">
                              {renderOriginBadge(
                                diff.stateB.origin,
                                diff.stateB.sourceMilestoneTitle,
                                diff.stateB.sourceMilestoneEra,
                                diff.stateB.sourceContinuityName
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            {renderDifferenceBadge(diff.differenceType)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. WHAT CHANGED? (DIFF MODE) */}
      {/* ==================================================================== */}
      {viewMode === 'diff' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {!predecessorMilestone ? (
            <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 text-xs text-foreground space-y-1">
              <div className="font-semibold text-primary">Founding Milestone (No Predecessor)</div>
              <p className="text-muted-foreground">
                This is the first chronological milestone recorded in this universe. All state assignments
                established here define initial world conditions.
              </p>
            </div>
          ) : diffStates.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-border/80 rounded-xl bg-card/20 space-y-2 text-xs text-muted-foreground">
              <Clock className="w-6 h-6 mx-auto text-muted-foreground/60" />
              <div className="font-semibold text-foreground">No State Changes at this Milestone</div>
              <p className="max-w-md mx-auto">
                No entities were explicitly changed here. All entities maintained their resolved state
                inherited from &quot;{predecessorMilestone.title}&quot;.
              </p>
            </div>
          ) : null}

          {diffStates.length > 0 && (
            <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
              <div className="px-4 py-3 bg-muted/20 border-b border-border/60 text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Entities Modified at {activeMilestone?.title} ({diffStates.length})</span>
                <span className="text-[11px] text-muted-foreground font-normal">
                  Historical transition records
                </span>
              </div>
              <div className="divide-y divide-border/60">
                {diffStates.map((diffItem) => {
                  if (!predecessorMilestone) {
                    const state = diffItem as ResolvedEntityState;
                    const Icon = CATEGORY_ICONS[state.category] || Layers;
                    return (
                      <div
                        key={state.entityId}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-muted/10 transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5 text-primary" />
                            <span className="font-semibold text-foreground">{state.entityTitle}</span>
                            <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                              {state.category}
                            </span>
                          </div>
                          {state.note && (
                            <p className="text-xs text-muted-foreground italic pl-5">
                              &ldquo;{state.note}&rdquo;
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {renderStatusBadge(state.category, state.value)}
                          <button
                            type="button"
                            onClick={() => handleOpenAssignModal(state)}
                            className="px-2.5 py-1 rounded border border-border hover:bg-muted text-xs transition-colors"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const diff = diffItem as MilestoneStateDiff;
                  const Icon = CATEGORY_ICONS[diff.category] || Layers;
                  return (
                    <div
                      key={diff.entityId}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-muted/10 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-primary" />
                          <span className="font-semibold text-foreground">{diff.entityTitle}</span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                            {diff.category}
                          </span>
                        </div>
                        {diff.stateB.note && (
                          <p className="text-xs text-muted-foreground italic pl-5">
                            &ldquo;{diff.stateB.note}&rdquo;
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-2">
                          {renderStatusBadge(diff.category, diff.stateA.value)}
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                          {renderStatusBadge(diff.category, diff.stateB.value)}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenAssignModal(diff.stateB)}
                          className="px-2.5 py-1 rounded border border-border hover:bg-muted text-xs transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. UNIVERSE STATE MATRIX (DEFAULT MODE) */}
      {/* ==================================================================== */}
      {viewMode === 'matrix' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* SEARCH & FILTERS BAR */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by entity name..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Quick Filter Controls */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {/* Origin Filter */}
              <select
                value={originFilter}
                onChange={(e) => setOriginFilter(e.target.value as StateOrigin | 'all')}
                className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Origins</option>
                <option value="explicit">Recorded at this milestone only</option>
                <option value="inherited">Inherited Only</option>
                <option value="unassigned">Unassigned Only</option>
                <option value="unknown">Explicit Unknown Only</option>
                <option value="not_yet_introduced">Not Yet Introduced</option>
              </select>

              {/* Changed Only Toggle */}
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none border border-border/80 px-2.5 py-1.5 rounded-lg bg-background hover:bg-muted/30">
                <input
                  type="checkbox"
                  checked={changedOnlyFilter}
                  onChange={(e) => setChangedOnlyFilter(e.target.checked)}
                  className="rounded text-primary focus:ring-primary"
                />
                <span>Changed Here</span>
              </label>
            </div>
          </div>

          {/* Category Chips Bar */}
          <div className="flex items-center gap-1 overflow-x-auto text-xs pb-1">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={cn(
                'px-2.5 py-1 rounded-lg transition-colors shrink-0',
                categoryFilter === 'all'
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted/40'
              )}
            >
              All Categories ({resolvedStates.length})
            </button>
            {LORE_CATEGORIES.map((cat) => {
              const count = resolvedStates.filter((s) => s.category === cat.id).length;
              if (count === 0) return null;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg transition-colors shrink-0 flex items-center gap-1',
                    categoryFilter === cat.id
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted/40'
                  )}
                >
                  <span>{cat.label}</span>
                  <span className="opacity-60 text-[10px] font-mono">({count})</span>
                </button>
              );
            })}
          </div>

          {/* MATRIX DATA TABLE */}
          {filteredStates.length === 0 ? (
            <div className="p-10 text-center border border-dashed border-border/80 rounded-2xl bg-card/20 space-y-2 text-xs text-muted-foreground">
              <Filter className="w-6 h-6 mx-auto text-muted-foreground/60" />
              <div className="font-semibold text-foreground">No entities match current filters</div>
              <p className="max-w-xs mx-auto">
                Try clearing search terms or resetting the category and origin filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setCategoryFilter('all');
                  setOriginFilter('all');
                  setChangedOnlyFilter(false);
                }}
                className="text-xs text-primary underline underline-offset-2 hover:text-foreground mt-2 inline-block"
              >
                Reset all filters
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/30 border-b border-border/80 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-4">Entity</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">State at Milestone</th>
                      <th className="py-2.5 px-3">Provenance / Origin</th>
                      <th className="py-2.5 px-3">Historical Notes</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredStates.map((state) => {
                      const Icon = CATEGORY_ICONS[state.category] || Layers;
                      return (
                        <tr
                          key={state.entityId}
                          className="hover:bg-muted/20 transition-colors group"
                        >
                          {/* Entity Name */}
                          <td className="py-3 px-4 font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                              <button
                                type="button"
                                onClick={() => onOpenDocument(state.entityId)}
                                className="hover:text-primary transition-colors text-left font-serif font-bold truncate max-w-[200px]"
                                title="Open entity in studio"
                              >
                                {state.entityTitle}
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenDocument(state.entityId)}
                                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                                title="Open document"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                          </td>

                          {/* Category */}
                          <td className="py-3 px-3">
                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground">
                              {state.category}
                            </span>
                          </td>

                          {/* State at Milestone */}
                          <td className="py-3 px-3">
                            {renderStatusBadge(state.category, state.value)}
                          </td>

                          {/* Provenance / Origin */}
                          <td className="py-3 px-3">
                            {renderOriginBadge(
                              state.origin,
                              state.sourceMilestoneTitle,
                              state.sourceMilestoneEra,
                              state.sourceContinuityName
                            )}
                            {state.sourceMilestoneId && <button type="button" className="help-button mt-1 block" onClick={() => openSourceChronicle(state.sourceMilestoneId!)}>Open source Chronicle</button>}
                          </td>

                          {/* Historical Notes & Conflicts */}
                          <td className="py-3 px-3 max-w-xs">
                            {state.conflict && (
                              <div className="text-[10px] text-amber-400 flex items-center gap-1 font-medium mb-1">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span>{state.conflict}</span>
                              </div>
                            )}
                            {state.note ? (
                              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                {state.note}
                              </p>
                            ) : (
                              <span className="text-muted-foreground/40 italic">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right space-x-1.5 shrink-0">
                            {state.origin === 'explicit' && (
                              <button
                                type="button"
                                onClick={() => handleRevertAssignment(state.entityId)}
                                disabled={isSaving}
                                className="px-2 py-1 rounded border border-border/80 hover:bg-muted/50 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                                title="Revert to inherited predecessor state"
                              >
                                Revert
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenAssignModal(state)}
                              disabled={isSaving || !activeMilestone}
                              className="px-2.5 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-medium transition-colors"
                            >
                              Assign
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 5. MODAL: ASSIGN STATE DIALOG */}
      {/* ==================================================================== */}
      {assigningEntity && activeMilestone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-5 text-xs">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-serif font-bold text-foreground">
                  Assign State at &ldquo;{activeMilestone.title}&rdquo;
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Entity: <strong className="text-foreground">{assigningEntity.entityTitle}</strong> ({assigningEntity.category})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssigningEntity(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Assignment Form */}
            <form onSubmit={handleSaveAssignment} className="space-y-4">
              {/* Category Status Presets */}
              <div className="space-y-2">
                <label className="block text-muted-foreground font-medium">
                  Preset Statuses ({assigningEntity.category}):
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {getCategoryPresets(assigningEntity.category).map((preset) => {
                    const isSelected = !isExplicitUnknown && !isNotIntroduced && inputStatus === preset.key;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => {
                          setInputStatus(preset.key);
                          setIsExplicitUnknown(false);
                          setIsNotIntroduced(preset.key === NOT_INTRODUCED_STATUS);
                        }}
                        className={cn(
                          'px-2.5 py-1 rounded-lg border text-xs transition-colors',
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary font-medium shadow-xs'
                            : 'bg-background hover:bg-muted text-foreground border-border'
                        )}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Special Options: Unknown and Not Yet Introduced */}
              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={isExplicitUnknown}
                    onChange={(e) => {
                      setIsExplicitUnknown(e.target.checked);
                      if (e.target.checked) {
                        setIsNotIntroduced(false);
                        setInputStatus('');
                      }
                    }}
                    className="rounded text-primary focus:ring-primary"
                  />
                  <span>Mark as Unknown (Explicit lack of knowledge)</span>
                </label>
              </div>

              {/* Custom Status Input */}
              {!isExplicitUnknown && !isNotIntroduced && (
                <div className="space-y-1">
                  <label className="block text-muted-foreground font-medium">
                    Or Enter Custom Status:
                  </label>
                  <input
                    type="text"
                    value={inputStatus}
                    onChange={(e) => setInputStatus(e.target.value)}
                    placeholder="e.g. In Exile, Trapped in Amber, Transcended..."
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}

              {/* Historical Context Note */}
              <div className="space-y-1">
                <label className="block text-muted-foreground font-medium">
                  Historical Context / Event Note (Optional):
                </label>
                <textarea
                  rows={2}
                  value={inputNote}
                  onChange={(e) => setInputNote(e.target.value)}
                  placeholder="Explain why or how this state changed during this milestone..."
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              {/* Feedback messages */}
              {saveFeedback && (
                <div
                  className={cn(
                    'p-2.5 rounded-lg text-xs font-medium',
                    saveFeedback.type === 'error'
                      ? 'bg-destructive/10 text-destructive border border-destructive/20'
                      : 'bg-primary/10 text-primary border border-primary/20'
                  )}
                >
                  {saveFeedback.message}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setAssigningEntity(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-gold-hover transition-colors shadow-xs disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save State'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6. MODAL: CREATE ALTERNATE CONTINUITY BRANCH */}
      {/* ==================================================================== */}
      {isCreateBranchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-violet-800/60 bg-card shadow-2xl p-6 space-y-5 text-xs">
            <div className="flex items-start justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-violet-400 font-mono text-[10px] uppercase font-bold">
                  <Split className="w-3.5 h-3.5" />
                  New Alternate Continuity Branch
                </div>
                <h3 className="text-base font-serif font-bold text-foreground">
                  Branch from Historical Milestone
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateBranchOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl border border-border/80 bg-muted/20 space-y-1">
              <span className="text-[10px] uppercase font-mono text-muted-foreground">
                Divergence Milestone:
              </span>
              <div className="font-serif font-bold text-foreground text-sm flex items-center gap-1.5">
                <span>{activeMilestone?.title || divergenceMilestone?.title}</span>
                {(activeMilestone?.era || divergenceMilestone?.era) && (
                  <span className="text-xs font-mono font-normal text-primary">
                    ({activeMilestone?.era || divergenceMilestone?.era})
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                The new branch will automatically inherit all universe states resolved up to this point.
              </p>
            </div>

            <form onSubmit={handleCreateBranchSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-muted-foreground font-medium">
                  Branch Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={branchNameInput}
                  onChange={(e) => setBranchNameInput(e.target.value)}
                  placeholder="e.g. The Ruined Sun Timeline, What If Morvath Survived..."
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-muted-foreground font-medium">
                  Description / Hypothesis (Optional)
                </label>
                <textarea
                  rows={2}
                  value={branchDescInput}
                  onChange={(e) => setBranchDescInput(e.target.value)}
                  placeholder="What diverged in this history? e.g. An alternate path where the treaty held..."
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              {branchError && (
                <div className="p-2.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-xs font-medium">
                  {branchError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setIsCreateBranchOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-gold-hover transition-colors shadow-xs disabled:opacity-50"
                >
                  {isSaving ? 'Creating...' : 'Create Alternate Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 7. MODAL: RENAME / EDIT BRANCH */}
      {/* ==================================================================== */}
      {isEditBranchOpen && activeBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-violet-800/60 bg-card shadow-2xl p-6 space-y-5 text-xs">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-serif font-bold text-foreground">
                  Edit Alternate Continuity
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Update name and description for this timeline branch.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditBranchOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditBranchSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-muted-foreground font-medium">Branch Name</label>
                <input
                  type="text"
                  required
                  value={editBranchNameInput}
                  onChange={(e) => setEditBranchNameInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-muted-foreground font-medium">Description</label>
                <textarea
                  rows={3}
                  value={editBranchDescInput}
                  onChange={(e) => setEditBranchDescInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setIsEditBranchOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-gold-hover transition-colors shadow-xs disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 8. MODAL: CREATE HISTORICAL MILESTONE */}
      {/* ==================================================================== */}
      {isCreatingMilestone && renderMilestoneCreationModal()}
    </div>
  );
};
