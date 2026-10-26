import type { DocumentMetadata, LoreCategory } from '../types';
import type { Change, Plan, StoryNode } from './thought';
import { uid, timeline } from './thought';
import { getUniverseEntities, getCategoryForEntryType, parseLoreMetadata } from './universe';

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

export const STATUS_LABELS: Record<string, string> = {
  // Characters
  alive: 'Active / Alive',
  deceased: 'Deceased',
  missing: 'Missing / Unaccounted',
  incapacitated: 'Incapacitated / Dormant',

  // Factions
  active: 'Active / Thriving',
  contested: 'Contested / Besieged',
  fractured: 'Fractured / Divided',
  collapsed: 'Collapsed / Extinct',
  underground: 'Underground / Secret',

  // Locations
  intact: 'Intact / Inhabited',
  damaged: 'Damaged / Contested',
  ruined: 'Ruined',
  abandoned: 'Abandoned',
  lost: 'Lost / Unreachable',

  // Artifacts
  stored: 'Safeguarded / Stored',
  dormant: 'Dormant',
  corrupted: 'Corrupted',
  shattered: 'Shattered / Destroyed',

  // Rules
  weakened: 'Weakened',
  suppressed: 'Suppressed / Forbidden',
  extinct: 'Extinct / Lost',

  // Cultures
  flourishing: 'Flourishing',
  declining: 'Declining',
  assimilated: 'Assimilated',

  // Events
  concluded: 'Concluded',
  legendary: 'Legendary / Mythic',

  // Common
  inactive: 'Inactive',
  [NOT_INTRODUCED_STATUS]: 'Not Yet Introduced',
};

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
 * Invariants enforced:
 * 1. Target milestone must exist and not be archived.
 * 2. Predecessors must strictly share the exact same universe_id and book_id.
 * 3. Never includes future milestones (position > target position).
 * 4. Cycle-free by construction (linear chronological position ordering).
 * 5. Returns nodes sorted by position ascending.
 */
export function validateMilestoneAncestry(
  plan: Plan,
  targetMilestoneId: string
): MilestoneAncestryResult {
  const target = plan.nodes.find((n) => n.id === targetMilestoneId && !n.archived);
  if (!target) {
    return {
      valid: false,
      error: `Milestone not found or is archived: ${targetMilestoneId}`,
      lineage: [],
    };
  }

  // Linear timeline in the target's universe and book scope
  const allInScope = timeline(plan, target.universe_id, target.book_id);
  const targetIndex = allInScope.findIndex((n) => n.id === targetMilestoneId);

  if (targetIndex === -1) {
    return {
      valid: false,
      error: `Milestone ${targetMilestoneId} not found in scope [universe=${target.universe_id}, book=${target.book_id}]`,
      lineage: [],
    };
  }

  // Predecessors up to and including target (never any future milestones)
  const lineage = allInScope.slice(0, targetIndex + 1);

  // Validate no cross-universe leakage
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

/**
 * Assigns or updates an explicit state change for an entity at a milestone.
 * Reuses the existing canonical Change structure.
 * Enforces at most one change per (entity_id, property_key) on the milestone.
 */
export function assignMilestoneState(
  plan: Plan,
  milestoneId: string,
  entityId: string,
  propertyKey: string,
  newValue: string | null,
  note?: string,
  previousValue?: string | null
): Plan {
  const milestone = plan.nodes.find((n) => n.id === milestoneId && !n.archived);
  if (!milestone) throw new Error(`Target milestone not found: ${milestoneId}`);

  const entity = plan.entities.find((e) => e.id === entityId);
  if (!entity) throw new Error(`Entity not found in planning desk: ${entityId}`);
  if (entity.universe_id !== milestone.universe_id) {
    throw new Error('Entity and Milestone must belong to the same Universe.');
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

  const now = new Date().toISOString();
  return {
    ...plan,
    nodes: plan.nodes.map((n) =>
      n.id === milestoneId ? { ...n, changes: newChanges, updated_at: now } : n
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

export interface MilestoneStateDiff {
  entityId: string;
  entityTitle: string;
  category: LoreCategory;
  propertyKey: string;
  stateA: ResolvedEntityState;
  stateB: ResolvedEntityState;
  hasDifference: boolean;
}

/**
 * Compares resolved entity states between two milestones in the same Universe.
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
    };

    const hasDifference = stateA.value !== stateB.value || stateA.origin !== stateB.origin;

    return {
      entityId: stateA.entityId,
      entityTitle: stateA.entityTitle,
      category: stateA.category,
      propertyKey,
      stateA,
      stateB,
      hasDifference,
    };
  });
}
