import type { DocumentMetadata, HouseRecord } from '../types';
import type { Book, Plan, Universe } from './thought';
import { getHouseUniverses, resolveUniverseHouseId } from './house';
import { isCatalogDoc } from './organization';
import { getChaptersForBook, parseLoreMetadata } from './universe';

export type LorebookScope = { kind: 'all' } | { kind: 'unresolved' } | { kind: 'universe'; universeId: string };
export const ALL_UNIVERSES: LorebookScope = { kind: 'all' };
export interface LoreAttribution {
  kind: 'assigned' | 'unresolved';
  universe?: Universe;
  reason: string;
  code?: 'unassigned';
}

export function houseUniverses(plan: Plan | null, houseId: string, houses: HouseRecord[]) {
  return getHouseUniverses(plan, { id: houseId } as HouseRecord, houses);
}
export function universeChoiceLabel(universe: Universe, choices: Universe[]) {
  const duplicate = choices.filter(u => u.name.trim().toLowerCase() === universe.name.trim().toLowerCase()).length > 1;
  return `${universe.name}${duplicate ? ` · ${universe.id}` : ''}${universe.archived ? ' (Archived — inspect)' : ''}`;
}

/** Read-only authoring projection. No inferred ownership from UI context or invalid IDs. */
export function classifyLoreDocument(doc: DocumentMetadata, plan: Plan | null, houseId: string, houses: HouseRecord[]): LoreAttribution {
  const unresolved = (reason: string, code?: LoreAttribution['code']): LoreAttribution => ({ kind: 'unresolved', reason, code });
  if ((doc.house_id || 'house-default') !== houseId) return unresolved('This entry belongs to another House.');
  let meta: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(doc.metadata_json || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return unresolved('Malformed Lorebook metadata.');
    meta = value as Record<string, unknown>;
  } catch { return unresolved('Malformed Lorebook metadata; the original document is preserved.'); }
  if (!plan) return unresolved('Universe planning data is not available.');
  const registrations = plan.entities.filter(e => e.id === doc.id);
  if (registrations.length > 1) return unresolved('Conflicting catalog registrations.');
  const catalogId = registrations[0]?.universe_id;
  let universe: Universe | undefined;
  let reason = 'Assigned by Universe UUID.';
  if (meta.universe_id !== undefined && meta.universe_id !== null) {
    if (typeof meta.universe_id !== 'string' || !meta.universe_id.trim()) return unresolved('Invalid explicit Universe UUID.');
    universe = plan.universes.find(u => u.id === meta.universe_id);
    if (!universe) return unresolved(`Unknown explicit Universe UUID: ${meta.universe_id}.`);
  } else if (meta.universe !== undefined && meta.universe !== null && meta.universe !== '') {
    if (typeof meta.universe !== 'string') return unresolved('Invalid legacy Universe name.');
    const matches = houseUniverses(plan, houseId, houses).filter(u => u.name.trim().toLowerCase() === (meta.universe as string).trim().toLowerCase());
    if (matches.length !== 1) return unresolved(matches.length ? 'Ambiguous legacy Universe name; choose a UUID explicitly when editing ownership.' : 'Legacy Universe name has no match in this House.');
    universe = matches[0]; reason = 'Legacy name resolved uniquely within this House; metadata is unchanged.';
  } else if (catalogId) {
    universe = plan.universes.find(u => u.id === catalogId); reason = 'Universe recorded in the planning catalog; document metadata is unchanged.';
  } else return unresolved('No Universe association is recorded.', 'unassigned');
  if (!universe) return unresolved('The catalog references an unknown Universe.');
  if (resolveUniverseHouseId(universe.id, houses) !== houseId) return unresolved('The recorded Universe belongs to another House.');
  if (catalogId && catalogId !== universe.id) return unresolved('Document and catalog Universe attribution conflict.');
  return { kind: 'assigned', universe, reason };
}

export function attributionLabel(attribution: LoreAttribution, choices: Universe[]) {
  return attribution.kind === 'assigned' && attribution.universe ? universeChoiceLabel(attribution.universe, choices) : `Unassigned / Unresolved — ${attribution.reason}`;
}
export function scopeValue(scope: LorebookScope) { return scope.kind === 'universe' ? `universe:${scope.universeId}` : scope.kind; }
export function scopeFromValue(value: string): LorebookScope {
  return value.startsWith('universe:') ? { kind: 'universe', universeId: value.slice(9) } : value === 'unresolved' ? { kind: 'unresolved' } : ALL_UNIVERSES;
}
export function validateScope(scope: LorebookScope, plan: Plan | null, houseId: string, houses: HouseRecord[]): LorebookScope {
  return scope.kind !== 'universe' || houseUniverses(plan, houseId, houses).some(u => u.id === scope.universeId) ? scope : ALL_UNIVERSES;
}
export function scopedSidebarDocuments(documents: DocumentMetadata[], scope: LorebookScope, plan: Plan | null, houseId: string, houses: HouseRecord[]) {
  return documents.filter(doc => {
    if ((doc.house_id || 'house-default') !== houseId || isCatalogDoc(doc)) return false;
    if (doc.doc_type !== 'lorebook') return true; // Only the Lorebook view applies this projection.
    if (scope.kind === 'all') return true;
    const attribution = classifyLoreDocument(doc, plan, houseId, houses);
    return scope.kind === 'unresolved' ? attribution.kind === 'unresolved' : attribution.kind === 'assigned' && attribution.universe?.id === scope.universeId;
  });
}
export function scopeAfterOpen(scope: LorebookScope, attribution: LoreAttribution): LorebookScope {
  if (scope.kind !== 'universe') return scope;
  return attribution.kind === 'assigned' && attribution.universe ? { kind: 'universe', universeId: attribution.universe.id } : { kind: 'unresolved' };
}
export function scopePreferenceKey(notebook: string, houseId: string) {
  return `mc:lorebook-browse:v1:${encodeURIComponent(notebook)}:${encodeURIComponent(houseId)}`;
}
export function readScopePreference(storage: Pick<Storage, 'getItem'>, key: string): LorebookScope {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    if (value?.kind === 'universe' && typeof value.universeId === 'string') return { kind: 'universe', universeId: value.universeId };
    if (value?.kind === 'unresolved') return { kind: 'unresolved' };
  } catch { /* Preferences are optional; never repair canonical data. */ }
  return ALL_UNIVERSES;
}
export function requireCreationUniverse(plan: Plan | null, universeId: string | undefined, houseId: string, houses: HouseRecord[]) {
  const universe = houseUniverses(plan, houseId, houses).find(u => u.id === universeId && !u.archived);
  if (!universe) throw new Error('Select an active Universe in this House before creating an entry.');
  return universe;
}
export function validBookForUniverse(plan: Plan | null, bookId: string | null, universeId: string, houseId: string, houses: HouseRecord[], allowArchivedUniverse = false) {
  if (!houseUniverses(plan, houseId, houses).some(u => u.id === universeId && (allowArchivedUniverse || !u.archived))) return undefined;
  return plan?.books.find(b => b.id === bookId && b.universe_id === universeId && !b.archived);
}
export function chapterCreationMetadata(plan: Plan | null, universeId: string | undefined, bookId: string, title: string, order: number, houseId: string, houses: HouseRecord[]) {
  const universe = requireCreationUniverse(plan, universeId, houseId, houses);
  const book = validBookForUniverse(plan, bookId, universe.id, houseId, houses);
  if (!book) throw new Error('The selected Book is missing, archived, or belongs to another Universe.');
  return { universe: universe.name, universe_id: universe.id, book: book.name, book_id: book.id, chapter: title, chapter_order: order, entry_type: 'chapter' as const, canon_status: 'canon' as const, attributes: [] };
}

export function initialCreationUniverse(choices: Universe[], initialId?: string, initialName?: string): string {
  if (initialId) return choices.some(u => u.id === initialId && !u.archived) ? initialId : '';
  if (initialName) {
    const matches = choices.filter(u => !u.archived && u.name.trim().toLowerCase() === initialName.trim().toLowerCase());
    if (matches.length === 1) return matches[0].id;
  }
  return ''; // All/Unresolved and ambiguous names require an explicit choice.
}

/** Book links are an independent reference projection, not a source of browsing ownership. */
export function scopedBookChapters(documents: DocumentMetadata[], plan: Plan, book: Book, houseId: string, houses: HouseRecord[]) {
  const candidates = documents.filter(doc => {
    if ((doc.house_id || 'house-default') !== houseId) return false;
    const attribution = classifyLoreDocument(doc, plan, houseId, houses);
    if (attribution.kind === 'assigned') return attribution.universe?.id === book.universe_id;
    const meta = parseLoreMetadata(doc);
    // Preserve an explicit legacy Book UUID link when Universe attribution was never recorded.
    // It still appears in Unresolved browsing; conflicting or malformed ownership never gets this fallback.
    return attribution.code === 'unassigned' && meta.book_id === book.id;
  });
  const uniqueName = plan.books.filter(b => b.universe_id === book.universe_id && b.name === book.name).length === 1;
  return getChaptersForBook(candidates, book.id, uniqueName ? book.name : undefined);
}
