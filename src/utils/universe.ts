import {relationshipIdentity, relationshipMeaning, relationshipPerspective} from './relationships';
import type { DocumentMetadata, LoreCategory, LorebookEntryType, LorebookMetadata, FactionPosition, FactionBranch } from '../types';
import type { Book, Continuity, Entity, Plan, Relationship, Universe } from './thought';
import { uid, isCatalog, initialize } from './thought';

export interface CategoryInfo {
  id: LoreCategory;
  label: string;
  singularLabel: string;
  description: string;
  defaultEntryType: LorebookEntryType;
}

export const LORE_CATEGORIES: CategoryInfo[] = [
  {
    id: 'characters',
    label: 'Characters',
    singularLabel: 'Character',
    description: 'Protagonists, antagonists, supporting figures, and historical icons.',
    defaultEntryType: 'character',
  },
  {
    id: 'locations',
    label: 'Locations',
    singularLabel: 'Location',
    description: 'Realms, cities, landmarks, strongholds, and geographies.',
    defaultEntryType: 'location',
  },
  {
    id: 'factions',
    label: 'Factions & Nations',
    singularLabel: 'Faction / Nation',
    description: 'Orders, guilds, kingdoms, alliances, and political powers.',
    defaultEntryType: 'faction',
  },
  {
    id: 'rules',
    label: 'Rules & Systems',
    singularLabel: 'World Rule / System',
    description: 'Magic systems, physical laws, technologies, taboos, and world rules.',
    defaultEntryType: 'concept',
  },
  {
    id: 'cultures',
    label: 'Cultures & History',
    singularLabel: 'Culture / History',
    description: 'Traditions, religions, eras, philosophies, and languages.',
    defaultEntryType: 'concept',
  },
  {
    id: 'artifacts',
    label: 'Artifacts',
    singularLabel: 'Artifact',
    description: 'Relics, weapons, legendary items, and tools.',
    defaultEntryType: 'artifact',
  },
  {
    id: 'events',
    label: 'Events',
    singularLabel: 'Event',
    description: 'Historical battles, cataclysms, treaties, and turning points.',
    defaultEntryType: 'event',
  },
  {
    id: 'other',
    label: 'Other Lore',
    singularLabel: 'Lore Entry',
    description: 'Flora, fauna, myths, and miscellaneous world details.',
    defaultEntryType: 'other',
  },
];

/**
 * Maps an underlying entry type to a user-facing LoreCategory.
 */
export function getCategoryForEntryType(entryType?: string | null): LoreCategory {
  if (!entryType) return 'other';
  switch (entryType.toLowerCase()) {
    case 'character':
      return 'characters';
    case 'location':
      return 'locations';
    case 'faction':
    case 'nation':
      return 'factions';
    case 'concept':
    case 'rule':
      return 'rules';
    case 'culture':
    case 'history':
      return 'cultures';
    case 'artifact':
    case 'item':
      return 'artifacts';
    case 'event':
      return 'events';
    default:
      return 'other';
  }
}

/**
 * Safely parse metadata_json of a document into LorebookMetadata
 */
export function parseLoreMetadata(doc: DocumentMetadata): Partial<LorebookMetadata> {
  if (!doc.metadata_json) return {};
  try {
    const parsed = JSON.parse(doc.metadata_json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export interface UniverseResolution {
  universeId: string | null;
  isUnassigned: boolean;
  isAmbiguous: boolean;
  matchedByName?: boolean;
}

/**
 * Resolves a document's Universe ownership safely:
 * 1. If doc has stable universe_id that exists in universes, matches directly.
 * 2. If doc has legacy free-text universe string:
 *    - Matches an existing universe ONLY if exactly one universe has that name (case-insensitive).
 *    - If multiple universes match the name, it is ambiguous and preserved in Unassigned Lore.
 * 3. If no universe metadata or unknown, returns unassigned.
 */
export function resolveEntityUniverse(
  doc: DocumentMetadata,
  universes: Universe[]
): UniverseResolution {
  const meta = parseLoreMetadata(doc);

  if (meta.universe_id) {
    const directMatch = universes.find((u) => u.id === meta.universe_id);
    if (directMatch) {
      return { universeId: directMatch.id, isUnassigned: false, isAmbiguous: false };
    }
  }

  const legacyName = typeof meta.universe === 'string' ? meta.universe.trim() : '';
  if (legacyName) {
    const matching = universes.filter(
      (u) => u.name.trim().toLowerCase() === legacyName.toLowerCase()
    );
    if (matching.length === 1) {
      return {
        universeId: matching[0].id,
        isUnassigned: false,
        isAmbiguous: false,
        matchedByName: true,
      };
    }
    if (matching.length > 1) {
      return {
        universeId: null,
        isUnassigned: true,
        isAmbiguous: true,
      };
    }
  }

  return { universeId: null, isUnassigned: true, isAmbiguous: false };
}

/**
 * Returns all non-catalog lorebook documents that belong to a universe.
 */
export function getUniverseEntities(
  docs: DocumentMetadata[],
  universeId: string,
  universes: Universe[]
): DocumentMetadata[] {
  return docs.filter((d) => {
    if (d.doc_type !== 'lorebook' || isCatalog(d)) return false;
    const res = resolveEntityUniverse(d, universes);
    return res.universeId === universeId;
  });
}

/**
 * Returns all non-catalog lorebook documents that are unassigned or ambiguous.
 */
export function getUnassignedEntities(
  docs: DocumentMetadata[],
  universes: Universe[]
): DocumentMetadata[] {
  return docs.filter((d) => {
    if (d.doc_type !== 'lorebook' || isCatalog(d)) return false;
    const res = resolveEntityUniverse(d, universes);
    return res.isUnassigned;
  });
}

/**
 * Returns all books belonging to a specific Universe.
 */
export function getBooksForUniverse(plan: Plan, universeId: string, includeArchived = false): Book[] {
  return plan.books.filter((b) => b.universe_id === universeId && (includeArchived || !b.archived));
}

/**
 * Sets a Book's archived status in the plan.
 */
export function setBookArchived(plan: Plan, bookId: string, archived: boolean): Plan {
  return {
    ...plan,
    books: plan.books.map((b) => (b.id === bookId ? { ...b, archived } : b)),
  };
}

/**
 * Returns all chapters for a specific book, sorted by chapter_order ascending, then created_at.
 */
export function getChaptersForBook(
  docs: DocumentMetadata[],
  bookId: string,
  bookName?: string
): DocumentMetadata[] {
  return docs
    .filter((d) => {
      if (d.doc_type !== 'lorebook' || isCatalog(d)) return false;
      const meta = parseLoreMetadata(d);
      if (meta.book_id) return meta.book_id === bookId;
      if (bookName && meta.entry_type === 'chapter' && meta.book === bookName) return true;
      return false;
    })
    .sort((a, b) => {
      const metaA = parseLoreMetadata(a);
      const metaB = parseLoreMetadata(b);
      const orderA = typeof metaA.chapter_order === 'number' ? metaA.chapter_order : 999999;
      const orderB = typeof metaB.chapter_order === 'number' ? metaB.chapter_order : 999999;
      if (orderA !== orderB) return orderA - orderB;
      return a.created_at.localeCompare(b.created_at);
    });
}

/**
 * Automatically syncs documents belonging to a universe into `plan.entities`.
 * Newly created documents are registered with { id, universe_id }.
 * Preserves existing entities.
 */
export function syncPlanEntities(plan: Plan, docs: DocumentMetadata[], universeId: string): Plan {
  const universeDocs = getUniverseEntities(docs, universeId, plan.universes);
  const existingEntityIds = new Set(plan.entities.map((e) => e.id));
  const newEntities = [...plan.entities];

  let changed = false;
  for (const doc of universeDocs) {
    if (!existingEntityIds.has(doc.id)) {
      newEntities.push({ id: doc.id, universe_id: universeId });
      existingEntityIds.add(doc.id);
      changed = true;
    }
  }

  if (!changed) return plan;
  return { ...plan, entities: newEntities };
}

/**
 * Synchronizes all lore documents across all universes into `plan.entities`.
 * - Ensures every document assigned to a universe has an entry { id: doc.id, universe_id } in plan.entities.
 * - Updates universe_id if a document was reassigned to a different universe.
 * - Preserves existing entity IDs for entities whose documents are archived/missing (to keep history/relationship referential integrity).
 */
export function syncAllPlanEntities(plan: Plan, docs: DocumentMetadata[]): Plan {
  const entityMap = new Map<string, Entity>(plan.entities.map((e) => [e.id, { ...e }]));
  let changed = false;

  for (const doc of docs) {
    if (doc.doc_type !== 'lorebook' || isCatalog(doc)) continue;
    const res = resolveEntityUniverse(doc, plan.universes);
    if (res.universeId) {
      const existing = entityMap.get(doc.id);
      if (!existing || existing.universe_id !== res.universeId) {
        entityMap.set(doc.id, { id: doc.id, universe_id: res.universeId });
        changed = true;
      }
    }
  }

  if (!changed) return plan;
  return {
    ...plan,
    entities: Array.from(entityMap.values()),
  };
}

export interface CreateRelationshipParams {
  sourceId: string;
  targetId: string;
  label: string;
  universeId: string;
  directed?: boolean;
  description?: string;
  reuseExisting?: boolean;
}

/**
 * Validates and creates a new relationship between two lore entities.
 * Invariants enforced:
 * 1. Label cannot be empty.
 * 2. An entity cannot connect to itself.
 * 3. Both endpoints must exist in documents library.
 * 4. Both endpoints must belong to the specified Universe (rejects cross-universe links).
 * 5. Prevents duplicate active relationships between the same endpoints with the same label.
 * 6. Ensures both endpoints are registered in plan.entities with the target universeId.
 */
export function validateAndCreateRelationship(
  plan: Plan,
  docs: DocumentMetadata[],
  params: CreateRelationshipParams
): { updatedPlan: Plan; relationship: Relationship } {
  const cleanLabel = (params.label || '').trim();
  if (!cleanLabel) {
    throw new Error('Relationship label cannot be empty.');
  }

  if (!params.sourceId || !params.targetId) {
    throw new Error('Both source and target entities must be specified.');
  }

  if (params.sourceId === params.targetId) {
    throw new Error('An entity cannot be connected to itself.');
  }

  const sourceDoc = docs.find((d) => d.id === params.sourceId);
  const targetDoc = docs.find((d) => d.id === params.targetId);

  if (!sourceDoc) {
    throw new Error('Source entity not found in library.');
  }
  if (!targetDoc) {
    throw new Error('Target entity not found in library.');
  }

  const sourceRes = resolveEntityUniverse(sourceDoc, plan.universes);
  const targetRes = resolveEntityUniverse(targetDoc, plan.universes);

  if (sourceRes.universeId !== params.universeId || targetRes.universeId !== params.universeId) {
    throw new Error('Both entities must belong to the same Universe. Cross-Universe links are not supported.');
  }

  const directed = relationshipMeaning(cleanLabel)?.symmetric ? false : params.directed ?? true;

  const identity=relationshipIdentity({source_id:params.sourceId,target_id:params.targetId,label:cleanLabel,directed,universe_id:params.universeId,book_id:null,context_node_id:null});
  const existingRel=plan.relationships.find(r=>!r.archived&&relationshipIdentity(r)===identity);

  if (existingRel) {
    if (params.reuseExisting) {
      return { updatedPlan: plan, relationship: existingRel };
    }
    throw new Error(`A "${cleanLabel}" relationship already exists between these entities.`);
  }

  // Ensure both endpoints exist in plan.entities
  const syncedPlan = syncAllPlanEntities(plan, docs);
  const existingEntities = new Map<string, Entity>(syncedPlan.entities.map((e) => [e.id, e]));

  if (!existingEntities.has(params.sourceId)) {
    existingEntities.set(params.sourceId, { id: params.sourceId, universe_id: params.universeId });
  }
  if (!existingEntities.has(params.targetId)) {
    existingEntities.set(params.targetId, { id: params.targetId, universe_id: params.universeId });
  }

  const newRel: Relationship = {
    id: uid(),
    universe_id: params.universeId,
    book_id: null,
    source_id: params.sourceId,
    target_id: params.targetId,
    label: cleanLabel,
    description: (params.description || '').trim(),
    directed,
    context_node_id: null,
    archived: false,
  };

  const updatedPlan: Plan = {
    ...syncedPlan,
    entities: Array.from(existingEntities.values()),
    relationships: [...syncedPlan.relationships, newRel],
  };

  return { updatedPlan, relationship: newRel };
}

/**
 * Safely archives a relationship in the plan.
 */
export function archiveRelationshipInPlan(plan: Plan, relationshipId: string): Plan {
  return {
    ...plan,
    relationships: plan.relationships.map((r) =>
      r.id === relationshipId ? { ...r, archived: true } : r
    ),
  };
}

/**
 * Archives all active relationships connected to a deleted lore entity document,
 * while retaining the entity in plan.entities for timeline continuity.
 */
export function handleEntityDeletionInPlan(plan: Plan, deletedDocId: string): Plan {
  return {
    ...plan,
    relationships: plan.relationships.map((r) =>
      !r.archived && (r.source_id === deletedDocId || r.target_id === deletedDocId)
        ? { ...r, archived: true }
        : r
    ),
  };
}


export const GUIDED_RELATIONSHIP_KINDS = new Set([
  'membership',
  'residence',
  'leadership',
  'control',
  'ownership',
  'creation',
  'site',
  'participation',
]);

/**
 * Checks whether a relationship belongs to one of the guided connection categories.
 */
export function isGuidedRelationship(rel: Relationship): boolean {
  const meaning = relationshipMeaning(rel.label);
  return !!meaning && GUIDED_RELATIONSHIP_KINDS.has(meaning.kind);
}

/**
 * Returns 'guided' if the relationship corresponds to a guided connection kind,
 * or 'custom' if it represents a freeform or custom writer-defined relationship.
 */
export function getRelationshipCategory(rel: Relationship): 'guided' | 'custom' {
  return isGuidedRelationship(rel) ? 'guided' : 'custom';
}

export const AFFILIATION_LABEL = 'Member of';
export const RESIDENCE_LABEL = 'Resides in';
export const LEADERSHIP_LABEL = 'Led by';
export const TERRITORY_LABEL = 'Controls';
export const ALLY_LABEL = 'Allied with';
export const RIVAL_LABEL = 'Rival of';
export const OWNER_LABEL = 'Owned by';
export const CREATOR_LABEL = 'Created by';
export const OCCURRED_AT_LABEL = 'Occurred at';
export const PARTICIPANT_LABEL = 'Participant in';

export interface EntityRelationshipQueryOptions {
  label?: string;
  labels?: string[];
  isSource?: boolean;
  reciprocalLabels?: string[];
}

/**
 * Queries active relationships for an entity, matching specified labels and direction.
 */
export function getEntityLinkedRelationships(
  plan: Plan | null,
  docId: string,
  options?: EntityRelationshipQueryOptions
): Relationship[] {
  if (!plan) return [];
  const labels = options?.labels
    ? options.labels.map((l) => l.toLowerCase())
    : options?.label
    ? [options.label.toLowerCase()]
    : [];
  const reciprocalLabels = options?.reciprocalLabels
    ? options.reciprocalLabels.map((l) => l.toLowerCase())
    : [];

  return plan.relationships.filter((r) => {
    if (r.archived) return false;
    const rLabel = (r.label || '').toLowerCase();
    const primary=labels[0];
    if(primary&&relationshipMeaning(primary)){
      if(options?.isSource===undefined)return (r.source_id===docId||r.target_id===docId)&&labels.some(label=>relationshipMeaning(label)?.kind===relationshipMeaning(r.label)?.kind);
      if(r.source_id!==docId&&r.target_id!==docId)return false;
      const wanted=options?.isSource===false
        ? relationshipPerspective({ ...r,label:primary,source_id:'other',target_id:docId,directed:true },docId)
        : relationshipPerspective({ ...r,label:primary,source_id:docId,target_id:'other',directed:true },docId);
      return relationshipPerspective(r,docId)===wanted;
    }

    // Case A: docId is source
    if (r.source_id === docId) {
      if (options?.isSource === false) {
        if (reciprocalLabels.length > 0 && reciprocalLabels.includes(rLabel)) {
          return true;
        }
        return false;
      }
      if (labels.length === 0) return true;
      return labels.includes(rLabel);
    }

    // Case B: docId is target
    if (r.target_id === docId) {
      if (options?.isSource === true) {
        if (reciprocalLabels.length > 0 && reciprocalLabels.includes(rLabel)) {
          return true;
        }
        return false;
      }
      if (labels.length === 0) return true;
      return labels.includes(rLabel);
    }

    return false;
  });
}

/**
 * Returns the connected entity ID (the other side of the relationship relative to docId).
 */
export function getOtherEntityId(rel: Relationship, currentDocId: string): string {
  return rel.source_id === currentDocId ? rel.target_id : rel.source_id;
}

/**
 * Queries active affiliation relationships for a given character.
 */
export function getCharacterAffiliations(
  plan: Plan | null,
  characterDocId: string
): Relationship[] {
  return getEntityLinkedRelationships(plan,characterDocId,{label:AFFILIATION_LABEL,isSource:true});
}

/**
 * Analyzes a legacy free-text entity reference against existing candidate entities.
 */
export function resolveLegacyEntityMatch(
  legacyText: string,
  candidates: DocumentMetadata[]
): { status: 'none' | 'single' | 'ambiguous'; matches: DocumentMetadata[] } {
  const clean = (legacyText || '').trim().toLowerCase();
  if (!clean) return { status: 'none', matches: [] };
  const matches = candidates.filter((c) => c.title.trim().toLowerCase() === clean);
  if (matches.length === 1) return { status: 'single', matches };
  if (matches.length > 1) return { status: 'ambiguous', matches };
  return { status: 'none', matches: [] };
}

/**
 * Analyzes a legacy free-text affiliation string against existing faction/nation entities.
 */
export function resolveLegacyAffiliation(
  legacyText: string,
  availableFactions: DocumentMetadata[]
): { status: 'none' | 'single' | 'ambiguous'; matches: DocumentMetadata[] } {
  return resolveLegacyEntityMatch(legacyText, availableFactions);
}


/**
 * Resolves the active base plan for universe or book creation,
 * initializing a valid plan from existing documents if no catalog exists yet.
 */
export function resolveBasePlan(
  existingPlan: Plan | null,
  docs: DocumentMetadata[] = []
): { plan: Plan; expectedRevision: number } {
  if (existingPlan) {
    return { plan: existingPlan, expectedRevision: existingPlan.revision };
  }
  return { plan: initialize(docs), expectedRevision: 0 };
}

/**
 * Creates a new Universe in the plan.
 */
export function createUniverseInPlan(
  plan: Plan,
  name: string,
  description?: string
): { plan: Plan; universe: Universe } {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Universe name cannot be empty');
  const universe: Universe = {
    id: uid(),
    name: trimmed,
    description: description?.trim() || undefined,
  };
  return {
    plan: {
      ...plan,
      universes: [...plan.universes, universe],
    },
    universe,
  };
}

/**
 * Renames an existing Universe and optionally updates its description, preserving stable ID.
 */
export function renameUniverseInPlan(
  plan: Plan,
  universeId: string,
  newName: string,
  newDescription?: string
): Plan {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('Universe name cannot be empty');
  return {
    ...plan,
    universes: plan.universes.map((u) =>
      u.id === universeId
        ? {
            ...u,
            name: trimmed,
            description:
              newDescription !== undefined
                ? newDescription.trim() || undefined
                : u.description,
          }
        : u
    ),
  };
}

/**
 * Creates a new Book in a Universe.
 */
export function createBookInPlan(
  plan: Plan,
  universeId: string,
  name: string,
  continuity: Continuity = 'standalone',
  description?: string
): { plan: Plan; book: Book } {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Book title cannot be empty');
  const universe = plan.universes.find((u) => u.id === universeId);
  if (!universe) throw new Error('Target Universe not found');

  const book: Book = {
    id: uid(),
    universe_id: universeId,
    name: trimmed,
    continuity,
    description: description?.trim() || undefined,
  };

  return {
    plan: {
      ...plan,
      books: [...plan.books, book],
    },
    book,
  };
}

/**
 * Updates a Book's details (title, continuity, description) in the plan.
 */
export function updateBookInPlan(plan: Plan, bookId: string, patch: Partial<Book>): Plan {
  return {
    ...plan,
    books: plan.books.map((b) => (b.id === bookId ? { ...b, ...patch } : b)),
  };
}

/**
 * Merges modifications from an attempted plan into a fresher base plan,
 * preventing lost updates and resolving revision divergence.
 */
export function reconcilePlans(freshBase: Plan, attempted: Plan): Plan {
  const universeMap = new Map(freshBase.universes.map((u) => [u.id, { ...u }]));
  for (const u of attempted.universes) {
    if (!universeMap.has(u.id)) {
      universeMap.set(u.id, u);
    } else {
      const existing = universeMap.get(u.id)!;
      if (u.name !== existing.name || u.description !== existing.description) {
        universeMap.set(u.id, { ...existing, name: u.name, description: u.description });
      }
    }
  }

  const bookMap = new Map(freshBase.books.map((b) => [b.id, { ...b }]));
  for (const b of attempted.books) {
    if (!bookMap.has(b.id)) {
      bookMap.set(b.id, b);
    } else {
      const existing = bookMap.get(b.id)!;
      bookMap.set(b.id, { ...existing, ...b });
    }
  }

  const entityMap = new Map(freshBase.entities.map((e) => [e.id, { ...e }]));
  for (const e of attempted.entities) {
    if (!entityMap.has(e.id)) {
      entityMap.set(e.id, e);
    }
  }

  const relMap = new Map(freshBase.relationships.map((r) => [r.id, { ...r }]));
  for (const r of attempted.relationships) {
    if (!relMap.has(r.id)) {
      relMap.set(r.id, r);
    } else {
      const existing = relMap.get(r.id)!;
      if (r.archived !== existing.archived || r.label !== existing.label || r.description !== existing.description) {
        relMap.set(r.id, { ...existing, ...r });
      }
    }
  }

  const nodeMap = new Map(freshBase.nodes.map((n) => [n.id, { ...n }]));
  for (const n of attempted.nodes) {
    if (!nodeMap.has(n.id)) {
      nodeMap.set(n.id, n);
    } else {
      const existing = nodeMap.get(n.id)!;
      nodeMap.set(n.id, { ...existing, ...n });
    }
  }

  return {
    version: 1,
    revision: freshBase.revision,
    universes: Array.from(universeMap.values()),
    books: Array.from(bookMap.values()),
    entities: Array.from(entityMap.values()),
    nodes: Array.from(nodeMap.values()),
    relationships: Array.from(relMap.values()),
  };
}

// ============================================================================
// Phase C2: Faction Hierarchy & Organizational Structures
// ============================================================================

export interface CharacterHeldOffice {
  factionId: string;
  factionTitle: string;
  positionId: string;
  positionTitle: string;
  branchId?: string | null;
  branchName?: string | null;
  description?: string;
}

/**
 * Checks whether assigning candidateParentId as the parent of positionId would create a reporting cycle.
 */
export function wouldFormPositionCycle(
  positions: FactionPosition[],
  positionId: string,
  candidateParentId: string | null | undefined
): boolean {
  if (!candidateParentId) return false;
  if (candidateParentId === positionId) return true;
  const visited = new Set<string>([positionId]);
  let curr: string | null | undefined = candidateParentId;
  while (curr) {
    if (visited.has(curr)) return true;
    visited.add(curr);
    const parentPos = positions.find((p) => p.id === curr);
    curr = parentPos?.parent_position_id;
  }
  return false;
}

/**
 * Checks whether assigning candidateParentId as the parent of branchId would create a branch hierarchy cycle.
 */
export function wouldFormBranchCycle(
  branches: FactionBranch[],
  branchId: string,
  candidateParentId: string | null | undefined
): boolean {
  if (!candidateParentId) return false;
  if (candidateParentId === branchId) return true;
  const visited = new Set<string>([branchId]);
  let curr: string | null | undefined = candidateParentId;
  while (curr) {
    if (visited.has(curr)) return true;
    visited.add(curr);
    const parentBr = branches.find((b) => b.id === curr);
    curr = parentBr?.parent_branch_id;
  }
  return false;
}

/**
 * Safely removes a position from an array, resetting any child positions' parent_position_id to null
 * so child positions are never cascade-deleted.
 */
export function removePositionSafely(
  positions: FactionPosition[],
  positionIdToRemove: string
): FactionPosition[] {
  return positions
    .filter((p) => p.id !== positionIdToRemove)
    .map((p) => {
      if (p.parent_position_id === positionIdToRemove) {
        return { ...p, parent_position_id: null };
      }
      return p;
    });
}

/**
 * Safely removes a branch from an array, unassigning positions belonging to that branch
 * and resetting child branches' parent_branch_id to null. Never deletes positions or child branches.
 */
export function removeBranchSafely(
  branches: FactionBranch[],
  positions: FactionPosition[],
  branchIdToRemove: string
): { branches: FactionBranch[]; positions: FactionPosition[] } {
  const updatedBranches = branches
    .filter((b) => b.id !== branchIdToRemove)
    .map((b) => {
      if (b.parent_branch_id === branchIdToRemove) {
        return { ...b, parent_branch_id: null };
      }
      return b;
    });

  const updatedPositions = positions.map((p) => {
    if (p.branch_id === branchIdToRemove) {
      return { ...p, branch_id: null };
    }
    return p;
  });

  return { branches: updatedBranches, positions: updatedPositions };
}

/**
 * Scoped reverse lookup: finds all official faction positions held by a character document.
 * Resolves dynamically from Faction canonical metadata without modifying Character documents.
 */
export function getCharacterHeldOffices(
  characterDocId: string,
  allDocuments: DocumentMetadata[],
  universeId?: string,
  universes?: Universe[]
): CharacterHeldOffice[] {
  if (!characterDocId || !allDocuments.length) return [];
  const offices: CharacterHeldOffice[] = [];

  for (const doc of allDocuments) {
    const meta = parseLoreMetadata(doc);
    if (meta.entry_type !== 'faction') continue;

    // Universe scoping: if specified, ensure the faction belongs to the same universe
    if (universeId && universes && universes.length > 0) {
      const res = resolveEntityUniverse(doc, universes);
      if (res.universeId !== universeId) continue;
    }

    const positions = meta.faction_fields?.positions;
    if (!positions || !Array.isArray(positions)) continue;
    const branches = meta.faction_fields?.branches || [];

    for (const pos of positions) {
      if (pos.holder_ids && Array.isArray(pos.holder_ids) && pos.holder_ids.includes(characterDocId)) {
        const branch = pos.branch_id ? branches.find((b) => b.id === pos.branch_id) : undefined;
        offices.push({
          factionId: doc.id,
          factionTitle: doc.title,
          positionId: pos.id,
          positionTitle: pos.title,
          branchId: pos.branch_id,
          branchName: branch ? branch.name : undefined,
          description: pos.description,
        });
      }
    }
  }

  return offices;
}



export * from './stateEngine';
