import statusLabels from '../../resources/status-labels.json';
import type { DocumentMetadata, LoreCategory, HouseRecord } from '../types';
import type { Change, Plan, StoryNode, Book, Continuity, RelationshipChange } from './thought';
import { relationshipPerspective } from './relationships';
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
  | 'unassigned'
  | 'cleared'
  | 'baseline';

export const CLEARED_PROPERTY_VALUE = '__LIVING_STATE_CLEARED__';
export const SEVERED_RELATIONSHIP_LABEL = '[severed]';
export const TERMINATED_RELATIONSHIP_LABEL = '[terminated]';
export const RESTORED_RELATIONSHIP_LABEL = '[restored]';

export const LITERAL_ESCAPED_PREFIX = '\\';

/**
 * Escapes a literal author-provided property value if it matches any control sentinel.
 */
export function escapeLiteralPropertyValue(val: string): string {
  if (!val) return val;
  if (
    val === CLEARED_PROPERTY_VALUE ||
    val === '__CLEARED__' ||
    val === '[cleared]' ||
    val.startsWith(LITERAL_ESCAPED_PREFIX)
  ) {
    return `${LITERAL_ESCAPED_PREFIX}${val}`;
  }
  return val;
}

/**
 * Unescapes a property value that was escaped to prevent sentinel collision.
 */
export function unescapeLiteralPropertyValue(val: string | null | undefined): string | null {
  if (val === null || val === undefined) return null;
  if (val.startsWith(LITERAL_ESCAPED_PREFIX)) {
    const unescaped = val.slice(1);
    if (
      unescaped === CLEARED_PROPERTY_VALUE ||
      unescaped === '__CLEARED__' ||
      unescaped === '[cleared]' ||
      unescaped.startsWith(LITERAL_ESCAPED_PREFIX)
    ) {
      return unescaped;
    }
  }
  return val;
}

/**
 * Returns true if the value represents an intentional property clearing action.
 * Escaped literals (e.g. `\[cleared]`) return false.
 */
export function isClearedValue(val: string | null | undefined): boolean {
  if (val === null || val === undefined) return false;
  if (val.startsWith(LITERAL_ESCAPED_PREFIX)) return false;
  return (
    val === CLEARED_PROPERTY_VALUE ||
    val === '__CLEARED__' ||
    val === '[cleared]'
  );
}

/**
 * Escapes a literal relationship label if it matches any severance or restoration sentinel.
 */
export function escapeLiteralRelationshipLabel(label: string): string {
  if (!label) return label;
  const clean = label.trim().toLowerCase();
  if (
    clean === SEVERED_RELATIONSHIP_LABEL ||
    clean === TERMINATED_RELATIONSHIP_LABEL ||
    clean === RESTORED_RELATIONSHIP_LABEL ||
    clean === '[dissolved]' ||
    clean === '[ended]' ||
    clean === '__restored__' ||
    clean === '[reconnected]' ||
    label.startsWith(LITERAL_ESCAPED_PREFIX)
  ) {
    return `${LITERAL_ESCAPED_PREFIX}${label}`;
  }
  return label;
}

/**
 * Unescapes a relationship label that was escaped to prevent sentinel collision.
 */
export function unescapeLiteralRelationshipLabel(label: string | null | undefined): string | null {
  if (label === null || label === undefined) return null;
  if (label.startsWith(LITERAL_ESCAPED_PREFIX)) {
    const unescaped = label.slice(1);
    const clean = unescaped.trim().toLowerCase();
    if (
      clean === SEVERED_RELATIONSHIP_LABEL ||
      clean === TERMINATED_RELATIONSHIP_LABEL ||
      clean === RESTORED_RELATIONSHIP_LABEL ||
      clean === '[dissolved]' ||
      clean === '[ended]' ||
      clean === '__restored__' ||
      clean === '[reconnected]' ||
      unescaped.startsWith(LITERAL_ESCAPED_PREFIX)
    ) {
      return unescaped;
    }
  }
  return label;
}

/**
 * Checks whether a relationship change label signifies an explicit severance.
 * Escaped literals (e.g. `\[severed]`) return false.
 */
export function isSeveredRelationship(label: string | null | undefined): boolean {
  if (label === null || label === undefined) return true;
  if (label.startsWith(LITERAL_ESCAPED_PREFIX)) return false;
  const clean = label.trim().toLowerCase();
  return (
    clean === '' ||
    clean === SEVERED_RELATIONSHIP_LABEL ||
    clean === TERMINATED_RELATIONSHIP_LABEL ||
    clean === '[dissolved]' ||
    clean === '[ended]'
  );
}

/**
 * Checks whether a relationship change label signifies an explicit restoration.
 * Escaped literals (e.g. `\[restored]`) return false.
 */
export function isRestoredRelationship(label: string | null | undefined): boolean {
  if (label === null || label === undefined) return false;
  if (label.startsWith(LITERAL_ESCAPED_PREFIX)) return false;
  const clean = label.trim().toLowerCase();
  return (
    clean === RESTORED_RELATIONSHIP_LABEL ||
    clean === '__restored__' ||
    clean === '[reconnected]'
  );
}

export function validatePropertyKey(key: string): { valid: boolean; error?: string } {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'Property key must be a non-empty string' };
  }
  const clean = key.trim();
  if (clean.length === 0) {
    return { valid: false, error: 'Property key cannot be empty' };
  }
  if (clean.length > 128) {
    return { valid: false, error: 'Property key cannot exceed 128 characters' };
  }
  if (/[\x00-\x1f\x7f]/.test(clean)) {
    return { valid: false, error: 'Property key contains invalid control characters' };
  }
  if (!/^[a-zA-Z0-9_\-.]+$/.test(clean)) {
    return {
      valid: false,
      error: 'Property key contains unsupported characters. Use letters, numbers, underscores, hyphens, and periods.',
    };
  }
  return { valid: true };
}

export function normalizePropertyKey(key: string): string {
  return key.trim().toLowerCase();
}

export function propertyKeysMatch(keyA: string, keyB: string): boolean {
  const normA = normalizePropertyKey(keyA);
  const normB = normalizePropertyKey(keyB);
  if (normA === normB) return true;
  const stripA = normA.includes('.') ? normA.split('.').slice(1).join('.') : normA;
  const stripB = normB.includes('.') ? normB.split('.').slice(1).join('.') : normB;
  return stripA === stripB;
}

export function getEntityBaselinePropertyValue(
  doc: DocumentMetadata,
  propertyKey: string
): string | null {
  const meta = parseLoreMetadata(doc);
  const cleanKey = propertyKey.trim();
  const lowerKey = cleanKey.toLowerCase();
  const strippedKey = lowerKey.includes('.') ? lowerKey.split('.').slice(1).join('.') : lowerKey;

  // 1. Character fields
  if (meta.character_fields && typeof meta.character_fields === 'object') {
    const cf = meta.character_fields as Record<string, unknown>;
    if (typeof cf[strippedKey] === 'string' && (cf[strippedKey] as string).trim()) {
      return (cf[strippedKey] as string).trim();
    }
    const camel = strippedKey.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
    if (typeof cf[camel] === 'string' && (cf[camel] as string).trim()) {
      return (cf[camel] as string).trim();
    }
  }

  // 2. Location fields
  if (meta.location_fields && typeof meta.location_fields === 'object') {
    const lf = meta.location_fields as Record<string, unknown>;
    if (typeof lf[strippedKey] === 'string' && (lf[strippedKey] as string).trim()) {
      return (lf[strippedKey] as string).trim();
    }
  }

  // 3. Faction fields
  if (meta.faction_fields && typeof meta.faction_fields === 'object') {
    const ff = meta.faction_fields as Record<string, unknown>;
    if (typeof ff[strippedKey] === 'string' && (ff[strippedKey] as string).trim()) {
      return (ff[strippedKey] as string).trim();
    }
  }

  // 4. Artifact fields
  if (meta.artifact_fields && typeof meta.artifact_fields === 'object') {
    const af = meta.artifact_fields as Record<string, unknown>;
    if (typeof af[strippedKey] === 'string' && (af[strippedKey] as string).trim()) {
      return (af[strippedKey] as string).trim();
    }
  }

  // 5. Event fields
  if (meta.event_fields && typeof meta.event_fields === 'object') {
    const ef = meta.event_fields as Record<string, unknown>;
    if (typeof ef[strippedKey] === 'string' && (ef[strippedKey] as string).trim()) {
      return (ef[strippedKey] as string).trim();
    }
  }

  // 6. Direct root metadata fields
  const rootMeta = meta as Record<string, unknown>;
  if (typeof rootMeta[strippedKey] === 'string' && (rootMeta[strippedKey] as string).trim()) {
    return (rootMeta[strippedKey] as string).trim();
  }

  // 7. Custom attributes in meta.attributes: LorebookAttribute[]
  if (Array.isArray(meta.attributes)) {
    const match = meta.attributes.find(
      (a) => a && typeof a.key === 'string' && a.key.trim().toLowerCase() === strippedKey
    );
    if (match && typeof match.value === 'string' && match.value.trim()) {
      return match.value.trim();
    }
  }

  // 8. Custom fields object
  if (meta.custom_fields && typeof meta.custom_fields === 'object') {
    const custom = meta.custom_fields as Record<string, unknown>;
    if (typeof custom[strippedKey] === 'string' && (custom[strippedKey] as string).trim()) {
      return (custom[strippedKey] as string).trim();
    }
  }

  return null;
}

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
  useBaselineFallback?: boolean;
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

  // 1. Initialize all registered entities (with baseline fallback for non-status or explicit opt-in)
  for (const doc of universeDocs) {
    const meta = parseLoreMetadata(doc);
    const category = getCategoryForEntryType(meta.entry_type);

    let profileContext: string | null = null;
    if (options?.includeProfileContext !== false) {
      if (propertyKey === 'status' && meta.character_fields?.vital_status) {
        profileContext = meta.character_fields.vital_status;
      }
    }

    const useBaseline = options?.useBaselineFallback ?? (propertyKey !== 'status');
    const baselineVal = useBaseline ? getEntityBaselinePropertyValue(doc, propertyKey) : null;

    resolvedMap.set(doc.id, {
      entityId: doc.id,
      entityTitle: doc.title,
      category,
      propertyKey,
      value: baselineVal,
      displayLabel: baselineVal !== null ? baselineVal : 'Unassigned',
      origin: baselineVal !== null ? 'baseline' : 'unassigned',
      hasChangedAtThisMilestone: false,
      currentProfileValue: profileContext,
    });
  }

  // 2. Step through predecessor lineage in chronological order up to target milestone
  for (const milestone of ancestry.lineage) {
    const isTarget = milestone.id === milestoneId;

    for (const change of milestone.changes) {
      if (!propertyKeysMatch(change.property_key, propertyKey)) continue;
      if (!resolvedMap.has(change.entity_id)) continue;

      const current = resolvedMap.get(change.entity_id)!;
      let descLabel = '';
      let resolvedValue: string | null;
      let origin: StateOrigin;

      if (propertyKey === 'status') {
        const desc = getStatusDescriptor(current.category, change.new_value);
        descLabel = desc.label;
        resolvedValue = change.new_value;
        if (desc.isNotIntroduced) {
          origin = 'not_yet_introduced';
        } else if (desc.isUnknown) {
          origin = 'unknown';
        } else if (isTarget) {
          origin = 'explicit';
        } else {
          origin = 'inherited';
        }
      } else {
        if (isClearedValue(change.new_value)) {
          descLabel = 'Cleared';
          resolvedValue = null;
          origin = isTarget ? 'cleared' : 'inherited';
        } else if (change.new_value === null) {
          descLabel = 'Unknown';
          resolvedValue = null;
          origin = 'unknown';
        } else if (change.new_value.toLowerCase() === NOT_INTRODUCED_STATUS) {
          descLabel = 'Not Yet Introduced';
          resolvedValue = change.new_value;
          origin = 'not_yet_introduced';
        } else {
          descLabel = change.new_value;
          resolvedValue = change.new_value;
          origin = isTarget ? 'explicit' : 'inherited';
        }
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
        value: resolvedValue,
        displayLabel: descLabel,
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
  const keyValidation = validatePropertyKey(propertyKey);
  if (!keyValidation.valid) {
    throw new Error(keyValidation.error);
  }

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

// ============================================================================
// Phase W: Living Entity States & Historical Relationship Resolution
// ============================================================================

export interface ResolvedHistoricalRelationship {
  relationshipId: string;
  universeId: string;
  bookId: string | null;
  sourceId: string;
  targetId: string;
  sourceTitle: string;
  targetTitle: string;
  sourceCategory: LoreCategory;
  targetCategory: LoreCategory;
  isDirected: boolean;
  initialLabel: string;
  currentLabel: string | null;
  relationTypeFromSource: string;
  relationTypeFromTarget: string;
  isSevered: boolean;
  isActive: boolean;
  origin: 'baseline' | 'activated_here' | 'inherited' | 'modified_here' | 'severed_here' | 'restored_here';
  sourceMilestoneId?: string;
  sourceMilestoneTitle?: string;
  sourceMilestoneEra?: string;
  note?: string;
  description: string;
}

export function resolveMilestoneRelationships(
  plan: Plan,
  docs: DocumentMetadata[],
  universeId: string,
  milestoneId: string,
  filterEntityId?: string
): ResolvedHistoricalRelationship[] {
  const ancestry = validateMilestoneAncestry(plan, milestoneId);
  if (!ancestry.valid) return [];

  const targetMilestone = ancestry.lineage[ancestry.lineage.length - 1];
  const lineageNodeIds = new Set(ancestry.lineage.map((n) => n.id));
  const lineageIndexMap = new Map(ancestry.lineage.map((n, idx) => [n.id, idx]));
  const targetIndex = ancestry.lineage.length - 1;

  const docsMap = new Map(docs.map((d) => [d.id, d]));

  const candidateRels = (plan.relationships || []).filter(
    (r) =>
      !r.archived &&
      r.universe_id === universeId &&
      (r.book_id === null || r.book_id === targetMilestone.book_id) &&
      (!filterEntityId || r.source_id === filterEntityId || r.target_id === filterEntityId)
  );

  const results: ResolvedHistoricalRelationship[] = [];

  for (const r of candidateRels) {
    let startIndex = 0;
    let isActivated = false;

    if (r.context_node_id !== null && r.context_node_id !== undefined) {
      if (!lineageNodeIds.has(r.context_node_id)) {
        continue; // Starts at a future or isolated milestone outside this lineage
      }
      startIndex = lineageIndexMap.get(r.context_node_id)!;
      isActivated = true;
    }

    let currentLabel: string | null = r.label;
    let isSevered = false;
    let origin: ResolvedHistoricalRelationship['origin'] = isActivated
      ? (startIndex === targetIndex ? 'activated_here' : 'inherited')
      : 'baseline';
    let sourceMilestoneId: string | undefined = isActivated ? r.context_node_id || undefined : undefined;
    let sourceMilestoneTitle: string | undefined;
    let sourceMilestoneEra: string | undefined;
    let changeNote: string | undefined;

    if (sourceMilestoneId) {
      const startNode = ancestry.lineage.find((n) => n.id === sourceMilestoneId);
      sourceMilestoneTitle = startNode?.title;
      sourceMilestoneEra = startNode?.era;
    }

    for (let i = startIndex; i <= targetIndex; i++) {
      const node = ancestry.lineage[i];
      const rc = (node.relationship_changes || []).find((c) => c.relationship_id === r.id);
      if (rc) {
        const isTarget = node.id === milestoneId;
        if (isSeveredRelationship(rc.label)) {
          isSevered = true;
          currentLabel = null;
          origin = isTarget ? 'severed_here' : 'inherited';
        } else if (isRestoredRelationship(rc.label)) {
          isSevered = false;
          currentLabel = r.label;
          origin = isTarget ? 'restored_here' : 'inherited';
        } else {
          const wasSevered = isSevered;
          isSevered = false;
          currentLabel = unescapeLiteralRelationshipLabel(rc.label) || r.label;
          origin = isTarget ? (wasSevered ? 'restored_here' : 'modified_here') : 'inherited';
        }
        sourceMilestoneId = node.id;
        sourceMilestoneTitle = node.title;
        sourceMilestoneEra = node.era;
        changeNote = rc.note || undefined;
      }
    }

    const sourceDoc = docsMap.get(r.source_id);
    const targetDoc = docsMap.get(r.target_id);

    const sourceMeta = sourceDoc ? parseLoreMetadata(sourceDoc) : null;
    const targetMeta = targetDoc ? parseLoreMetadata(targetDoc) : null;

    const sourceCategory = getCategoryForEntryType(sourceMeta?.entry_type);
    const targetCategory = getCategoryForEntryType(targetMeta?.entry_type);

    const sourceTitle = sourceDoc?.title || `Entity #${r.source_id.slice(0, 6)}`;
    const targetTitle = targetDoc?.title || `Entity #${r.target_id.slice(0, 6)}`;

    const effectiveLabel = currentLabel || r.label;
    const relationTypeFromSource = relationshipPerspective({ ...r, label: effectiveLabel }, r.source_id);
    const relationTypeFromTarget = relationshipPerspective({ ...r, label: effectiveLabel }, r.target_id);

    results.push({
      relationshipId: r.id,
      universeId: r.universe_id,
      bookId: r.book_id,
      sourceId: r.source_id,
      targetId: r.target_id,
      sourceTitle,
      targetTitle,
      sourceCategory,
      targetCategory,
      isDirected: r.directed,
      initialLabel: r.label,
      currentLabel,
      relationTypeFromSource,
      relationTypeFromTarget,
      isSevered,
      isActive: !isSevered,
      origin,
      sourceMilestoneId,
      sourceMilestoneTitle,
      sourceMilestoneEra,
      note: changeNote,
      description: r.description || '',
    });
  }

  return results;
}

export function assignMilestoneRelationshipChange(
  plan: Plan,
  milestoneId: string,
  relationshipId: string,
  newLabel: string | null,
  note?: string
): Plan {
  const milestone = plan.nodes.find((n) => n.id === milestoneId && !n.archived);
  if (!milestone) throw new Error(`Target milestone not found: ${milestoneId}`);

  const rel = plan.relationships.find((r) => r.id === relationshipId && !r.archived);
  if (!rel) throw new Error(`Target relationship not found: ${relationshipId}`);

  if (rel.universe_id !== milestone.universe_id) {
    throw new Error('Relationship and Milestone must belong to the same Universe');
  }

  const existingChanges = milestone.relationship_changes || [];
  const existingIdx = existingChanges.findIndex((c) => c.relationship_id === relationshipId);

  const updatedChange: RelationshipChange = {
    relationship_id: relationshipId,
    label: newLabel,
    note: note !== undefined ? note : existingIdx !== -1 ? existingChanges[existingIdx].note : '',
  };

  const newChanges = existingIdx !== -1
    ? existingChanges.map((c, i) => (i === existingIdx ? updatedChange : c))
    : [...existingChanges, updatedChange];

  const now = new Date().toISOString();
  return {
    ...plan,
    nodes: plan.nodes.map((n) =>
      n.id === milestoneId ? { ...n, relationship_changes: newChanges, updated_at: now } : n
    ),
  };
}

export function clearMilestoneRelationshipChange(
  plan: Plan,
  milestoneId: string,
  relationshipId: string
): Plan {
  const milestone = plan.nodes.find((n) => n.id === milestoneId && !n.archived);
  if (!milestone) return plan;

  const existingChanges = milestone.relationship_changes || [];
  const filtered = existingChanges.filter((c) => c.relationship_id !== relationshipId);
  if (filtered.length === existingChanges.length) return plan;

  const now = new Date().toISOString();
  return {
    ...plan,
    nodes: plan.nodes.map((n) =>
      n.id === milestoneId ? { ...n, relationship_changes: filtered, updated_at: now } : n
    ),
  };
}

export function severMilestoneRelationship(
  plan: Plan,
  milestoneId: string,
  relationshipId: string,
  note?: string
): Plan {
  return assignMilestoneRelationshipChange(plan, milestoneId, relationshipId, SEVERED_RELATIONSHIP_LABEL, note);
}

export function restoreMilestoneRelationship(
  plan: Plan,
  milestoneId: string,
  relationshipId: string,
  restoredLabel?: string,
  note?: string
): Plan {
  const label = restoredLabel ? escapeLiteralRelationshipLabel(restoredLabel) : RESTORED_RELATIONSHIP_LABEL;
  return assignMilestoneRelationshipChange(plan, milestoneId, relationshipId, label, note);
}

export interface ResolvedLivingProperty {
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
  baselineValue?: string | null;
  conflict?: string | null;
}

export interface ResolvedLivingEntityState {
  entityId: string;
  entityTitle: string;
  category: LoreCategory;
  universeId: string;
  milestoneId: string;
  milestoneTitle: string;
  milestoneEra?: string;
  continuityName: string;
  branchId: string | null;
  isIntroduced: boolean;
  isArchived: boolean;
  status: ResolvedEntityState;
  properties: Map<string, ResolvedLivingProperty>;
  relationships: ResolvedHistoricalRelationship[];
  warnings: string[];
}

export function resolveEntityLivingState(
  plan: Plan,
  docs: DocumentMetadata[],
  universeId: string,
  milestoneId: string,
  entityId: string
): ResolvedLivingEntityState | null {
  const targetMilestone = plan.nodes.find((n) => n.id === milestoneId && !n.archived);
  if (!targetMilestone || targetMilestone.universe_id !== universeId) {
    return null;
  }

  const ancestry = validateMilestoneAncestry(plan, milestoneId);
  if (!ancestry.valid) return null;

  const doc = docs.find((d) => d.id === entityId);
  if (!doc) return null;

  const meta = parseLoreMetadata(doc);
  const category = getCategoryForEntryType(meta.entry_type);

  // 1. Resolve status for backward compatibility & introduction check
  const statusList = resolveUniverseStateAtMilestone(plan, docs, universeId, milestoneId, {
    propertyKey: 'status',
  });
  const resolvedStatus = statusList.find((s) => s.entityId === entityId) || {
    entityId,
    entityTitle: doc.title,
    category,
    propertyKey: 'status',
    value: null,
    displayLabel: 'Unassigned',
    origin: 'unassigned' as StateOrigin,
    hasChangedAtThisMilestone: false,
  };

  const isIntroduced = resolvedStatus.origin !== 'not_yet_introduced';
  const isArchived = Boolean(meta.archived);

  // 2. Discover all relevant property keys
  const keysToResolve = new Set<string>();

  if (category === 'characters') {
    keysToResolve.add('role');
    keysToResolve.add('occupation');
    keysToResolve.add('affiliation');
    keysToResolve.add('residence');
    keysToResolve.add('vital_status');
    keysToResolve.add('narrative_role');
    keysToResolve.add('clothing_attire');
    keysToResolve.add('physical_appearance');
    keysToResolve.add('personality');
    keysToResolve.add('age');
    keysToResolve.add('gender');
    keysToResolve.add('species');
  } else if (category === 'locations') {
    keysToResolve.add('region');
    keysToResolve.add('location_type');
    keysToResolve.add('inhabitants');
  } else if (category === 'factions') {
    keysToResolve.add('faction_type');
    keysToResolve.add('leadership');
    keysToResolve.add('headquarters');
    keysToResolve.add('territory');
  } else if (category === 'artifacts') {
    keysToResolve.add('artifact_type');
    keysToResolve.add('owner');
    keysToResolve.add('powers');
  }

  // Add custom attributes
  if (Array.isArray(meta.attributes)) {
    for (const a of meta.attributes) {
      if (a?.key?.trim()) keysToResolve.add(a.key.trim().toLowerCase());
    }
  }

  // Add any property key modified across the milestone ancestry
  for (const m of ancestry.lineage) {
    for (const c of m.changes || []) {
      if (c.entity_id === entityId && c.property_key) {
        keysToResolve.add(normalizePropertyKey(c.property_key));
      }
    }
  }

  // 3. Resolve each property key across lineage
  const properties = new Map<string, ResolvedLivingProperty>();
  const warnings: string[] = [];

  for (const key of keysToResolve) {
    const baselineVal = getEntityBaselinePropertyValue(doc, key);

    let currentValue: string | null = baselineVal;
    let displayLabel = baselineVal !== null ? baselineVal : 'Unassigned';
    let origin: StateOrigin = baselineVal !== null ? 'baseline' : 'unassigned';
    let sourceMilestoneId: string | undefined;
    let sourceMilestoneTitle: string | undefined;
    let sourceMilestoneEra: string | undefined;
    let sourceBranchId: string | null = null;
    let sourceContinuityName: string | undefined;
    let hasChangedAtThisMilestone = false;
    let changeNote: string | undefined;
    let previousValue: string | null = null;
    let conflict: string | null = null;

    for (const m of ancestry.lineage) {
      const isTarget = m.id === milestoneId;
      const change = (m.changes || []).find(
        (c) => c.entity_id === entityId && propertyKeysMatch(c.property_key, key)
      );

      if (change) {
        if (
          change.previous_value !== null &&
          change.previous_value !== undefined &&
          currentValue !== null &&
          currentValue !== undefined &&
          currentValue !== change.previous_value
        ) {
          conflict = `Expected ${change.previous_value}; earlier record was ${currentValue}.`;
          warnings.push(`${m.title}: ${conflict}`);
        }

        if (isClearedValue(change.new_value)) {
          currentValue = null;
          displayLabel = 'Cleared';
          origin = isTarget ? 'cleared' : 'inherited';
        } else if (change.new_value === null) {
          currentValue = null;
          displayLabel = 'Unknown';
          origin = 'unknown';
        } else if (change.new_value.toLowerCase() === NOT_INTRODUCED_STATUS) {
          currentValue = change.new_value;
          displayLabel = 'Not Yet Introduced';
          origin = 'not_yet_introduced';
        } else {
          const literalVal = unescapeLiteralPropertyValue(change.new_value);
          currentValue = literalVal;
          displayLabel = literalVal !== null ? literalVal : 'Unknown';
          origin = isTarget ? 'explicit' : 'inherited';
        }

        sourceMilestoneId = m.id;
        sourceMilestoneTitle = m.title;
        sourceMilestoneEra = m.era;
        changeNote = change.note || undefined;
        previousValue = change.previous_value;

        if (m.branch_id) {
          sourceBranchId = m.branch_id;
          const br = plan.branches?.find((b) => b.id === m.branch_id);
          sourceContinuityName = br ? br.name : 'Alternate Branch';
        } else {
          sourceBranchId = null;
          sourceContinuityName = 'Canonical Timeline';
        }

        if (isTarget) {
          hasChangedAtThisMilestone = true;
        }
      }
    }

    properties.set(key, {
      propertyKey: key,
      value: currentValue,
      displayLabel,
      origin,
      sourceMilestoneId,
      sourceMilestoneTitle,
      sourceMilestoneEra,
      sourceBranchId,
      sourceContinuityName,
      hasChangedAtThisMilestone,
      note: changeNote,
      previousValue,
      baselineValue: baselineVal,
      conflict,
    });
  }

  // 4. Resolve historical relationships
  const relationships = resolveMilestoneRelationships(plan, docs, universeId, milestoneId, entityId);

  let continuityName = 'Canonical Timeline';
  if (targetMilestone.branch_id) {
    const branch = plan.branches?.find((b) => b.id === targetMilestone.branch_id);
    continuityName = branch ? `Alternate: ${branch.name}` : 'Alternate Branch';
  }

  return {
    entityId,
    entityTitle: doc.title,
    category,
    universeId,
    milestoneId: targetMilestone.id,
    milestoneTitle: targetMilestone.title,
    milestoneEra: targetMilestone.era,
    continuityName,
    branchId: targetMilestone.branch_id || null,
    isIntroduced,
    isArchived,
    status: resolvedStatus,
    properties,
    relationships,
    warnings,
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

const livingResolutionCache = new Map<string, ResolvedLivingEntityState>();

export function getCachedResolvedLivingEntityState(
  plan: Plan,
  docs: DocumentMetadata[],
  universeId: string,
  milestoneId: string,
  entityId: string
): ResolvedLivingEntityState | null {
  const cacheKey = `${universeId}:${milestoneId}:${entityId}:${plan.revision}`;
  if (livingResolutionCache.has(cacheKey)) {
    return livingResolutionCache.get(cacheKey)!;
  }
  const resolved = resolveEntityLivingState(plan, docs, universeId, milestoneId, entityId);
  if (resolved) {
    if (livingResolutionCache.size >= MAX_CACHE_ENTRIES * 2) {
      const first = livingResolutionCache.keys().next().value;
      if (first) livingResolutionCache.delete(first);
    }
    livingResolutionCache.set(cacheKey, resolved);
  }
  return resolved;
}

export function clearHistoricalResolutionCache(): void {
  historicalResolutionCache.clear();
  livingResolutionCache.clear();
}
