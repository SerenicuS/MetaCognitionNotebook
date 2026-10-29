import statusLabels from '../../resources/status-labels.json';
import type { DocumentMetadata, LoreCategory, HouseRecord } from '../types';
import type { Change, Plan, StoryNode, Book, Continuity } from './thought';
import { uid, timeline } from './thought';
import { getUniverseEntities, getCategoryForEntryType, parseLoreMetadata, resolveEntityUniverse } from './universe';
import { isCatalogDoc } from './organization';
import { resolveUniverseHouseId, DEFAULT_HOUSE_ID } from './house';

// ============================================================================
// Phase W1: Universe State Engine & Category Status Presets
// ============================================================================

export const NOT_INTRODUCED_STATUS = 'not_introduced';

export interface StatusDescriptor {
  key: string | null;
  label: string;
  category?: LoreCategory;
  isPreset: boolean;
  isCustom: boolean;
  isUnknown: boolean;
  isNotIntroduced: boolean;
}

export const CATEGORY_STATUS_PRESETS: Record<LoreCategory, string[]> = {
  characters: [
    'alive',
    'deceased',
    'missing',
    'incapacitated',
    NOT_INTRODUCED_STATUS,
  ],
  factions: [
    'active',
    'contested',
    'fractured',
    'collapsed',
    'underground',
    NOT_INTRODUCED_STATUS,
  ],
  locations: [
    'intact',
    'damaged',
    'ruined',
    'abandoned',
    'lost',
    NOT_INTRODUCED_STATUS,
  ],
  artifacts: [
    'intact',
    'stored',
    'lost',
    'dormant',
    'corrupted',
    'shattered',
    NOT_INTRODUCED_STATUS,
  ],
  rules: [
    'active',
    'weakened',
    'suppressed',
    'extinct',
    NOT_INTRODUCED_STATUS,
  ],
  cultures: [
    'flourishing',
    'declining',
    'assimilated',
    'extinct',
    NOT_INTRODUCED_STATUS,
  ],
  events: [
    'active',
    'concluded',
    'legendary',
    NOT_INTRODUCED_STATUS,
  ],
  other: [
    'active',
    'inactive',
    NOT_INTRODUCED_STATUS,
  ],
};

export const STATUS_LABELS: Record<string, string> = statusLabels;

/**
 * Returns human-friendly descriptors and categorization for a given status value.
 */
export function getStatusDescriptor(
  category: LoreCategory,
  status: string | null | undefined
): StatusDescriptor {
  if (status === null || status === undefined || status === '') {
    return {
      key: null,
      label: 'Unknown',
      category,
      isPreset: false,
      isCustom: false,
      isUnknown: true,
      isNotIntroduced: false,
    };
  }

  const clean = status.trim();
  const lower = clean.toLowerCase();

  if (lower === NOT_INTRODUCED_STATUS) {
    return {
      key: NOT_INTRODUCED_STATUS,
      label: 'Not Yet Introduced',
      category,
      isPreset: true,
      isCustom: false,
      isUnknown: false,
      isNotIntroduced: true,
    };
  }

  const presets = CATEGORY_STATUS_PRESETS[category] || [];
  const isPreset = presets.includes(lower);
  const label = isPreset ? (STATUS_LABELS[lower] || clean) : clean;

  return {
    key: lower,
    label,
    category,
    isPreset,
    isCustom: !isPreset,
    isUnknown: false,
    isNotIntroduced: false,
  };
}

/**
 * Returns preset key/label pairs for a category.
 */
export function getCategoryPresets(category: LoreCategory): { key: string; label: string }[] {
  const keys = CATEGORY_STATUS_PRESETS[category] || CATEGORY_STATUS_PRESETS.other;
  return keys.map((key) => ({
    key,
    label: STATUS_LABELS[key] || key,
  }));
}

// ============================================================================
// Milestone Predecessor & Ancestry Validation
// ============================================================================

export interface MilestoneAncestryResult {
  valid: boolean;
  error?: string;
  lineage: StoryNode[];
}

/**
 * Resolves the deterministic chronological predecessor chain leading up to and
 * including targetMilestoneId.
 *
 * Supports canonical milestones and alternate branch milestones.
 * Invariants enforced:
 * 1. Target milestone must exist and not be archived.
 * 2. Predecessors must strictly share the exact same universe_id and book_id.
 * 3. Never includes future milestones.
 * 4. Cycle-free by construction and recursion guards.
 * 5. Returns nodes in lineage order ascending.
 */
export function validateMilestoneAncestry(
  plan: Plan,
  targetMilestoneId: string
): MilestoneAncestryResult {
  return validateMilestoneAncestryInternal(plan, targetMilestoneId, new Set<string>());
}

function validateMilestoneAncestryInternal(
  plan: Plan,
  targetMilestoneId: string,
  visitedMilestones: Set<string>,
  visitedBranches: Set<string> = new Set<string>()
): MilestoneAncestryResult {
  if (visitedMilestones.has(targetMilestoneId)) {
    return {
      valid: false,
      error: `Cycle detected in milestone ancestry at milestone ${targetMilestoneId}`,
      lineage: [],
    };
  }

  const target = plan.nodes.find((n) => n.id === targetMilestoneId && !n.archived);
  if (!target) {
    return {
      valid: false,
      error: `Milestone not found or is archived: ${targetMilestoneId}`,
      lineage: [],
    };
  }

  if (target.branch_id) {
    // Target is on an alternate branch
    if (visitedBranches.has(target.branch_id)) {
      return {
        valid: false,
        error: `Cycle detected in alternate branch hierarchy at branch ${target.branch_id}`,
        lineage: [],
      };
    }

    const branch = plan.branches?.find((b) => b.id === target.branch_id);
    if (!branch) {
      return {
        valid: false,
        error: `Branch ${target.branch_id} for milestone ${targetMilestoneId} not found in plan`,
        lineage: [],
      };
    }

    if (branch.universe_id !== target.universe_id) {
      return {
        valid: false,
        error: `Cross-Universe branch detected: branch ${branch.id} in universe ${branch.universe_id} does not match target universe ${target.universe_id}`,
        lineage: [],
      };
    }

    // Resolve ancestry of divergence milestone
    const nextVisitedBranches = new Set(visitedBranches);
    nextVisitedBranches.add(target.branch_id);

    const nextVisitedMilestones = new Set(visitedMilestones);
    nextVisitedMilestones.add(targetMilestoneId);

    const divAncestry = validateMilestoneAncestryInternal(
      plan,
      branch.divergence_node_id,
      nextVisitedMilestones,
      nextVisitedBranches
    );

    if (!divAncestry.valid) {
      return divAncestry;
    }

    // Get milestones on this branch up to target
    const branchTimeline = timeline(plan, target.universe_id, target.book_id, target.branch_id);
    const targetIndex = branchTimeline.findIndex((n) => n.id === targetMilestoneId);
    if (targetIndex === -1) {
      return {
        valid: false,
        error: `Milestone ${targetMilestoneId} not found in branch timeline`,
        lineage: [],
      };
    }

    const branchLineage = branchTimeline.slice(0, targetIndex + 1);

    // Combine divergence lineage + branch lineage
    const combined: StoryNode[] = [...divAncestry.lineage];
    const seenNodeIds = new Set(combined.map((n) => n.id));

    for (const node of branchLineage) {
      if (seenNodeIds.has(node.id)) {
        return {
          valid: false,
          error: `Cycle detected in milestone ancestry: node ${node.id} appears multiple times in lineage`,
          lineage: [],
        };
      }
      if (node.universe_id !== target.universe_id) {
        return {
          valid: false,
          error: `Cross-Universe ancestor detected: node ${node.id} in universe ${node.universe_id} does not match target ${target.universe_id}`,
          lineage: [],
        };
      }
      if (node.book_id !== target.book_id) {
        return {
          valid: false,
          error: `Cross-Book ancestor detected: node ${node.id} in book ${node.book_id} does not match target ${target.book_id}`,
          lineage: [],
        };
      }
      seenNodeIds.add(node.id);
      combined.push(node);
    }

    return {
      valid: true,
      lineage: combined,
    };
  }

  // Canonical timeline (target.branch_id is null / undefined)
  const allInScope = timeline(plan, target.universe_id, target.book_id, null);
  const targetIndex = allInScope.findIndex((n) => n.id === targetMilestoneId);

  if (targetIndex === -1) {
    return {
      valid: false,
      error: `Milestone ${targetMilestoneId} not found in scope [universe=${target.universe_id}, book=${target.book_id}]`,
      lineage: [],
    };
  }

  const lineage = allInScope.slice(0, targetIndex + 1);

  for (const node of lineage) {
    if (node.universe_id !== target.universe_id) {
      return {
        valid: false,
        error: `Cross-Universe ancestor detected: node ${node.id} in universe ${node.universe_id} does not match target ${target.universe_id}`,
        lineage: [],
      };
    }
    if (node.book_id !== target.book_id) {
      return {
        valid: false,
        error: `Cross-Book ancestor detected: node ${node.id} in book ${node.book_id} does not match target ${target.book_id}`,
        lineage: [],
      };
    }
  }

  return {
    valid: true,
    lineage,
  };
}

/**
 * Returns predecessor chain leading up to and including targetMilestoneId.
 */
export function getMilestonePredecessors(plan: Plan, targetMilestoneId: string): StoryNode[] {
  const res = validateMilestoneAncestry(plan, targetMilestoneId);
  return res.valid ? res.lineage : [];
}

// ============================================================================
// State Resolution Engine
// ============================================================================

export type StateOrigin =
  | 'explicit'
  | 'inherited'
  | 'unknown'
  | 'not_yet_introduced'
  | 'unassigned';

export interface ResolvedEntityState {
  entityId: string;
  entityTitle: string;
  category: LoreCategory;
  propertyKey: string;
  value: string | null;
  displayLabel: string;
  origin: StateOrigin;
  sourceMilestoneId?: string;
  sourceMilestoneTitle?: string;
  sourceMilestoneEra?: string;
  sourceBranchId?: string | null;
  sourceContinuityName?: string;
  hasChangedAtThisMilestone: boolean;
  note?: string;
  previousValue?: string | null;
  conflict?: string | null;
  currentProfileValue?: string | null;
}

export interface ResolveStateOptions {
  propertyKey?: string;
  includeProfileContext?: boolean;
}

/**
 * Resolves the state of every entity belonging to a universe at a specific milestone.
 *
 * Rules:
 * 1. Historical states are derived strictly from explicitly authored milestone changes
 *    and valid predecessor inheritance.
 * 2. Current entity profiles do NOT act as historical baselines (Critical Issue B).
 *    They are provided optionally only as contextual reference.
 * 3. An entity with no recorded state in the milestone or its predecessors is 'unassigned'.
 * 4. A recorded new_value of null explicitly represents 'unknown'.
 * 5. A recorded new_value of 'not_introduced' explicitly represents 'not_yet_introduced'.
 * 6. Inherited states preserve their provenance (sourceMilestoneId, title, era).
 * 7. Later milestones never retroactively mutate earlier snapshots.
 */
export function resolveUniverseStateAtMilestone(
  plan: Plan,
  docs: DocumentMetadata[],
  universeId: string,
  milestoneId: string,
  options?: ResolveStateOptions
): ResolvedEntityState[] {
  const propertyKey = options?.propertyKey || 'status';
  const targetMilestone = plan.nodes.find((n) => n.id === milestoneId && !n.archived);
  if (!targetMilestone || targetMilestone.universe_id !== universeId) {
    return [];
  }

  const ancestry = validateMilestoneAncestry(plan, milestoneId);
  if (!ancestry.valid) {
    return [];
  }

  const universeDocs = getUniverseEntities(docs, universeId, plan.universes);
  const resolvedMap = new Map<string, ResolvedEntityState>();

  // 1. Initialize all registered entities as 'unassigned'
  for (const doc of universeDocs) {
    const meta = parseLoreMetadata(doc);
    const category = getCategoryForEntryType(meta.entry_type);

    let profileContext: string | null = null;
    if (options?.includeProfileContext !== false) {
      if (propertyKey === 'status' && meta.character_fields?.vital_status) {
        profileContext = meta.character_fields.vital_status;
      }
    }

    resolvedMap.set(doc.id, {
      entityId: doc.id,
      entityTitle: doc.title,
      category,
      propertyKey,
      value: null,
      displayLabel: 'Unassigned',
      origin: 'unassigned',
      hasChangedAtThisMilestone: false,
      currentProfileValue: profileContext,
    });
  }

  // 2. Step through predecessor lineage in chronological order up to target milestone
  for (const milestone of ancestry.lineage) {
    const isTarget = milestone.id === milestoneId;

    for (const change of milestone.changes) {
      if (change.property_key !== propertyKey) continue;
      if (!resolvedMap.has(change.entity_id)) continue;

      const current = resolvedMap.get(change.entity_id)!;
      const desc = getStatusDescriptor(current.category, change.new_value);

      let origin: StateOrigin;
      if (desc.isNotIntroduced) {
        origin = 'not_yet_introduced';
      } else if (desc.isUnknown) {
        origin = 'unknown';
      } else if (isTarget) {
        origin = 'explicit';
      } else {
        origin = 'inherited';
      }

      // Conflict detection: if author set expected previous_value and it doesn't match resolved state
      let conflict: string | null = null;
      if (
        change.previous_value !== null &&
        change.previous_value !== undefined &&
        current.value !== null &&
        current.value !== undefined &&
        current.value !== change.previous_value
      ) {
        conflict = `Expected ${change.previous_value}; earlier record was ${current.value}.`;
      }

      let sourceContinuityName = 'Canonical History';
      let sourceBranchId: string | null = null;
      if (milestone.branch_id) {
        sourceBranchId = milestone.branch_id;
        const branch = plan.branches?.find((b) => b.id === milestone.branch_id);
        sourceContinuityName = branch ? branch.name : 'Alternate Branch';
      }

      resolvedMap.set(change.entity_id, {
        entityId: change.entity_id,
        entityTitle: current.entityTitle,
        category: current.category,
        propertyKey,
        value: change.new_value,
        displayLabel: desc.label,
        origin,
        sourceMilestoneId: milestone.id,
        sourceMilestoneTitle: milestone.title,
        sourceMilestoneEra: milestone.era,
        sourceBranchId,
        sourceContinuityName,
        hasChangedAtThisMilestone: isTarget,
        note: change.note || undefined,
        previousValue: change.previous_value,
        conflict,
        currentProfileValue: current.currentProfileValue,
      });
    }
  }

  return Array.from(resolvedMap.values());
}

// ============================================================================
// Immutable State Mutation Utilities
// ============================================================================

export interface AssignMilestoneStateOptions {
  activeHouseId?: string;
  houses?: HouseRecord[];
}

/**
 * Assigns or updates an explicit state change for an entity at a milestone.
 * Reuses the existing canonical Change structure.
 * Enforces at most one change per (entity_id, property_key) on the milestone.
 * Resolves entities by canonical Lorebook identity, auto-registering in plan.entities
 * when valid and rejecting foreign-Universe and foreign-House entities.
 */
export function assignMilestoneState(
  plan: Plan,
  milestoneId: string,
  entityId: string,
  propertyKey: string,
  newValue: string | null,
  note?: string,
  previousValue?: string | null,
  docs?: DocumentMetadata[],
  options?: AssignMilestoneStateOptions
): Plan {
  const milestone = plan.nodes.find((n) => n.id === milestoneId && !n.archived);
  if (!milestone) throw new Error(`Target milestone not found: ${milestoneId}`);

  let entity = plan.entities.find((e) => e.id === entityId);
  let updatedEntities = [...plan.entities];

  if (!entity) {
    if (docs) {
      const doc = docs.find((d) => d.id === entityId);
      if (!doc) {
        throw new Error(`Entity not found in planning desk: ${entityId}`);
      }
      if (doc.doc_type !== 'lorebook' || isCatalogDoc(doc)) {
        throw new Error(`Web of Thought references Lorebook entities only, not other studios or its own catalog: ${entityId}`);
      }

      // Check Universe isolation
      const res = resolveEntityUniverse(doc, plan.universes);
      if (!res.universeId || res.universeId !== milestone.universe_id) {
        throw new Error(`Foreign-Universe entity rejected: document ${entityId} belongs to universe ${res.universeId || 'unassigned'}, expected ${milestone.universe_id}`);
      }

      // Check House isolation
      if (options?.houses && options?.activeHouseId) {
        const universeHouseId = resolveUniverseHouseId(milestone.universe_id, options.houses);
        const docHouseId = doc.house_id || DEFAULT_HOUSE_ID;
        if (docHouseId !== universeHouseId && docHouseId !== options.activeHouseId) {
          throw new Error(`Foreign-House entity rejected: document ${entityId} belongs to house ${docHouseId}, expected ${universeHouseId}`);
        }
      } else if (doc.house_id && options?.activeHouseId && doc.house_id !== options.activeHouseId) {
        throw new Error(`Foreign-House entity rejected: document ${entityId} belongs to house ${doc.house_id}, expected ${options.activeHouseId}`);
      }

      // Canonical auto-registration in plan.entities (ensuring no duplicate IDs)
      if (!updatedEntities.some((e) => e.id === entityId)) {
        entity = { id: entityId, universe_id: milestone.universe_id };
        updatedEntities.push(entity);
      } else {
        entity = updatedEntities.find((e) => e.id === entityId);
      }
    } else {
      throw new Error(`Entity not found in planning desk: ${entityId}`);
    }
  }

  if (!entity) throw new Error(`Entity not found in planning desk: ${entityId}`);
  if (entity.universe_id !== milestone.universe_id) {
    throw new Error('Entity and Milestone must belong to the same Universe.');
  }

  // If docs is provided, validate House and Universe even if entity was already in plan.entities
  if (docs) {
    const doc = docs.find((d) => d.id === entityId);
    if (doc) {
      const res = resolveEntityUniverse(doc, plan.universes);
      if (res.universeId && res.universeId !== milestone.universe_id) {
        throw new Error(`Foreign-Universe entity rejected: document ${entityId} belongs to universe ${res.universeId}, expected ${milestone.universe_id}`);
      }
      if (options?.houses && options?.activeHouseId) {
        const universeHouseId = resolveUniverseHouseId(milestone.universe_id, options.houses);
        const docHouseId = doc.house_id || DEFAULT_HOUSE_ID;
        if (docHouseId !== universeHouseId && docHouseId !== options.activeHouseId) {
          throw new Error(`Foreign-House entity rejected: document ${entityId} belongs to house ${docHouseId}, expected ${universeHouseId}`);
        }
      } else if (doc.house_id && options?.activeHouseId && doc.house_id !== options.activeHouseId) {
        throw new Error(`Foreign-House entity rejected: document ${entityId} belongs to house ${doc.house_id}, expected ${options.activeHouseId}`);
      }
    }
  }

  const existingChange = milestone.changes.find(
    (c) => c.entity_id === entityId && c.property_key === propertyKey
  );

  const updatedChange: Change = {
    id: existingChange ? existingChange.id : uid(),
    entity_id: entityId,
    property_key: propertyKey,
    previous_value: previousValue !== undefined ? previousValue : existingChange ? existingChange.previous_value : null,
    new_value: newValue,
    note: note !== undefined ? note : existingChange ? existingChange.note : '',
  };

  const newChanges = existingChange
    ? milestone.changes.map((c) => (c.id === existingChange.id ? updatedChange : c))
    : [...milestone.changes, updatedChange];

  const existingEntityIds = Array.isArray(milestone.entity_ids) ? milestone.entity_ids : [];
  const newEntityIds = existingEntityIds.includes(entityId)
    ? existingEntityIds
    : [...existingEntityIds, entityId];

  const now = new Date().toISOString();
  return {
    ...plan,
    entities: updatedEntities,
    nodes: plan.nodes.map((n) =>
      n.id === milestoneId ? { ...n, changes: newChanges, entity_ids: newEntityIds, updated_at: now } : n
    ),
  };
}

/**
 * Clears an explicit state change for an entity at a milestone,
 * safely allowing the entity to fall back to inherited predecessor state or unassigned.
 */
export function clearMilestoneState(
  plan: Plan,
  milestoneId: string,
  entityId: string,
  propertyKey: string
): Plan {
  const milestone = plan.nodes.find((n) => n.id === milestoneId && !n.archived);
  if (!milestone) return plan;

  const filteredChanges = milestone.changes.filter(
    (c) => !(c.entity_id === entityId && c.property_key === propertyKey)
  );

  if (filteredChanges.length === milestone.changes.length) {
    return plan;
  }

  const now = new Date().toISOString();
  return {
    ...plan,
    nodes: plan.nodes.map((n) =>
      n.id === milestoneId ? { ...n, changes: filteredChanges, updated_at: now } : n
    ),
  };
}

// ============================================================================
// Milestone State Comparison (Diff Engine)
// ============================================================================

export type DifferenceType =
  | 'none'
  | 'value_change'
  | 'provenance_only'
  | 'unassigned_to_state'
  | 'state_to_unassigned';

export interface MilestoneStateDiff {
  entityId: string;
  entityTitle: string;
  category: LoreCategory;
  propertyKey: string;
  stateA: ResolvedEntityState;
  stateB: ResolvedEntityState;
  hasDifference: boolean;
  differenceType: DifferenceType;
}

/**
 * Compares resolved entity states between two milestones in the same Universe.
 * Milestones can be from the same continuity, different continuities, or canonical vs branch.
 */
export function compareMilestoneStates(
  plan: Plan,
  docs: DocumentMetadata[],
  universeId: string,
  milestoneAId: string,
  milestoneBId: string,
  propertyKey: string = 'status'
): MilestoneStateDiff[] {
  const statesA = resolveUniverseStateAtMilestone(plan, docs, universeId, milestoneAId, {
    propertyKey,
  });
  const statesB = resolveUniverseStateAtMilestone(plan, docs, universeId, milestoneBId, {
    propertyKey,
  });

  const mapB = new Map(statesB.map((s) => [s.entityId, s]));

  return statesA.map((stateA) => {
    const stateB = mapB.get(stateA.entityId) || {
      ...stateA,
      value: null,
      displayLabel: 'Unassigned',
      origin: 'unassigned' as const,
      hasChangedAtThisMilestone: false,
      sourceBranchId: undefined,
      sourceContinuityName: undefined,
    };

    let differenceType: DifferenceType = 'none';
    let hasDifference = false;

    if (stateA.origin === 'unassigned' && stateB.origin === 'unassigned') {
      differenceType = 'none';
      hasDifference = false;
    } else if (stateA.origin === 'unassigned' && stateB.origin !== 'unassigned') {
      differenceType = 'unassigned_to_state';
      hasDifference = true;
    } else if (stateA.origin !== 'unassigned' && stateB.origin === 'unassigned') {
      differenceType = 'state_to_unassigned';
      hasDifference = true;
    } else if (stateA.value !== stateB.value) {
      differenceType = 'value_change';
      hasDifference = true;
    } else if (
      stateA.origin !== stateB.origin ||
      stateA.sourceMilestoneId !== stateB.sourceMilestoneId ||
      stateA.sourceBranchId !== stateB.sourceBranchId
    ) {
      differenceType = 'provenance_only';
      hasDifference = true;
    } else {
      differenceType = 'none';
      hasDifference = false;
    }

    return {
      entityId: stateA.entityId,
      entityTitle: stateA.entityTitle,
      category: stateA.category,
      propertyKey,
      stateA,
      stateB,
      hasDifference,
      differenceType,
    };
  });
}

// ============================================================================
// Phase W4: Chapter Historical Context & Echo Historical State Resolution
// ============================================================================

export interface ChapterHistoricalContext {
  milestoneId: string;
  milestoneTitle: string;
  milestoneEra?: string;
  milestoneDescription?: string;
  continuityName: string;
  branchId: string | null;
  divergenceMilestoneTitle?: string;
  isDivergenceFallback: boolean;
  isValid: boolean;
  warning?: string;
}

export interface BookCompatibleMilestones {
  continuity: Continuity;
  continuityName: string;
  branchId: string | null;
  milestones: StoryNode[];
  divergenceMilestone?: StoryNode | null;
}

/**
 * Resolves the compatible milestones for a book based on its continuity setting and linked alternate branch.
 */
export function getCompatibleMilestonesForBook(
  plan: Plan,
  universeId: string,
  book: Book
): BookCompatibleMilestones {
  if (book.continuity === 'alternate' && book.branch_id) {
    const branch = (plan.branches || []).find((b) => b.id === book.branch_id);
    const branchMilestones = timeline(plan, universeId, null, book.branch_id).filter((n) => !n.archived);
    const divNode = branch
      ? plan.nodes.find((n) => n.id === branch.divergence_node_id && !n.archived) || null
      : null;

    return {
      continuity: 'alternate',
      continuityName: branch ? `Alternate: ${branch.name}` : 'Alternate Timeline',
      branchId: book.branch_id,
      milestones: branchMilestones,
      divergenceMilestone: divNode,
    };
  }

  if (book.continuity === 'standalone' && book.branch_id) {
    const branch = (plan.branches || []).find((b) => b.id === book.branch_id);
    const branchMilestones = timeline(plan, universeId, null, book.branch_id).filter((n) => !n.archived);
    const divNode = branch
      ? plan.nodes.find((n) => n.id === branch.divergence_node_id && !n.archived) || null
      : null;

    return {
      continuity: 'standalone',
      continuityName: branch ? `Standalone (Branch: ${branch.name})` : 'Standalone Story',
      branchId: book.branch_id,
      milestones: branchMilestones,
      divergenceMilestone: divNode,
    };
  }

  // Canonical or standalone without specific branch
  const canonicalMilestones = timeline(plan, universeId, null, null).filter((n) => !n.archived);
  return {
    continuity: book.continuity,
    continuityName: book.continuity === 'standalone' ? 'Standalone Story' : 'Canonical Timeline',
    branchId: null,
    milestones: canonicalMilestones,
    divergenceMilestone: null,
  };
}

/**
 * Resolves the historical context for a chapter document within its active universe and book.
 */
export function resolveChapterHistoricalContext(
  plan: Plan | null,
  universeId: string,
  chapterDoc: DocumentMetadata | null,
  book?: Book | null
): ChapterHistoricalContext | null {
  if (!plan || !chapterDoc) return null;

  const meta = parseLoreMetadata(chapterDoc);
  if (!meta.milestone_id) return null;

  const milestoneId = meta.milestone_id;
  const targetNode = plan.nodes.find((n) => n.id === milestoneId);

  // If node does not exist, is archived, or belongs to a different universe:
  if (!targetNode || targetNode.archived || targetNode.universe_id !== universeId) {
    return {
      milestoneId,
      milestoneTitle: targetNode ? targetNode.title : 'Missing Milestone',
      continuityName: 'Unknown',
      branchId: null,
      isDivergenceFallback: false,
      isValid: false,
      warning: !targetNode
        ? 'The assigned historical milestone no longer exists.'
        : targetNode.archived
        ? 'The assigned historical milestone has been archived.'
        : 'The assigned milestone belongs to a different universe.',
    };
  }

  // Check continuity of the milestone
  if (targetNode.branch_id) {
    const branch = (plan.branches || []).find((b) => b.id === targetNode.branch_id);
    const continuityName = branch ? `Alternate: ${branch.name}` : 'Alternate Branch';
    let warning: string | undefined;

    if (book?.continuity === 'canonical') {
      warning = 'This chapter belongs to a Canonical book, but references an Alternate branch milestone.';
    } else if (book?.branch_id && book.branch_id !== targetNode.branch_id) {
      warning = 'Milestone belongs to a different alternate branch than this book.';
    }

    return {
      milestoneId: targetNode.id,
      milestoneTitle: targetNode.title,
      milestoneEra: targetNode.era,
      milestoneDescription: targetNode.description,
      continuityName,
      branchId: targetNode.branch_id,
      isDivergenceFallback: false,
      isValid: true,
      warning,
    };
  }

  // Canonical milestone
  let isDivergenceFallback = false;
  let divergenceMilestoneTitle: string | undefined;

  if (book?.continuity === 'alternate' && book.branch_id) {
    const branch = (plan.branches || []).find((b) => b.id === book.branch_id);
    if (branch && branch.divergence_node_id === targetNode.id) {
      isDivergenceFallback = true;
      divergenceMilestoneTitle = targetNode.title;
    }
  }

  return {
    milestoneId: targetNode.id,
    milestoneTitle: targetNode.title,
    milestoneEra: targetNode.era,
    milestoneDescription: targetNode.description,
    continuityName: 'Canonical Timeline',
    branchId: null,
    divergenceMilestoneTitle,
    isDivergenceFallback,
    isValid: true,
  };
}

// ----------------------------------------------------------------------------
// Historical State Memoization & Cached Resolution for Echo Library
// ----------------------------------------------------------------------------

const historicalResolutionCache = new Map<string, Map<string, ResolvedEntityState>>();
const MAX_CACHE_ENTRIES = 25;

export function getCachedResolvedUniverseState(
  plan: Plan,
  docs: DocumentMetadata[],
  universeId: string,
  milestoneId: string,
  options?: ResolveStateOptions
): Map<string, ResolvedEntityState> {
  const propKey = options?.propertyKey || 'status';
  const cacheKey = `${universeId}:${milestoneId}:${plan.revision}:${propKey}`;

  if (historicalResolutionCache.has(cacheKey)) {
    return historicalResolutionCache.get(cacheKey)!;
  }

  const list = resolveUniverseStateAtMilestone(plan, docs, universeId, milestoneId, options);
  const map = new Map<string, ResolvedEntityState>();
  for (const item of list) {
    map.set(item.entityId, item);
  }

  if (historicalResolutionCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = historicalResolutionCache.keys().next().value;
    if (firstKey) historicalResolutionCache.delete(firstKey);
  }

  historicalResolutionCache.set(cacheKey, map);
  return map;
}

export function resolveEntityHistoricalEchoState(
  plan: Plan,
  docs: DocumentMetadata[],
  universeId: string,
  milestoneId: string,
  entityId: string,
  options?: ResolveStateOptions
): ResolvedEntityState | null {
  const stateMap = getCachedResolvedUniverseState(plan, docs, universeId, milestoneId, options);
  return stateMap.get(entityId) || null;
}

export function clearHistoricalResolutionCache(): void {
  historicalResolutionCache.clear();
}
