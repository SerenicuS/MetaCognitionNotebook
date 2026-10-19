import type { DocumentMetadata, LoreCategory, LorebookEntryType, LorebookMetadata } from '../types';
import type { Book, Continuity, Plan, Universe } from './thought';
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
export function getBooksForUniverse(plan: Plan, universeId: string): Book[] {
  return plan.books.filter((b) => b.universe_id === universeId);
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
      if (meta.book_id === bookId) return true;
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

