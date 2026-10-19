import type { DocumentMetadata, DocumentType, SearchResult } from '../types';

export interface OrganizationPatch { tags?: string[]; favorite?: boolean; opened?: boolean }
export interface TagChangeReport { updated: DocumentMetadata[]; errors: string[] }
export type LibraryView = 'all' | 'favorites' | 'recent';
export type LibrarySort = 'modified' | 'created' | 'title-asc' | 'title-desc';
export interface LibraryFilters {
  studio: DocumentType | 'all'; tags: string[]; view: LibraryView; sort: LibrarySort; query: string;
}
export const defaultFilters: LibraryFilters = { studio: 'all', tags: [], view: 'all', sort: 'modified', query: '' };

export function metadataObject(raw?: string | null): Record<string, unknown> {
  const value = JSON.parse(raw || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Document metadata must be an object.');
  return value;
}
export function workshop(doc: Pick<DocumentMetadata, 'metadata_json'>): { favorite: boolean; last_opened_at?: string } {
  try {
    const data = metadataObject(doc.metadata_json)._workshop as Record<string, unknown> | undefined;
    return { favorite: data?.favorite === true, last_opened_at: typeof data?.last_opened_at === 'string' && Number.isFinite(Date.parse(data.last_opened_at)) ? data.last_opened_at : undefined };
  } catch { return { favorite: false }; }
}
export const normalizeTags = (tags: string[]) => [...new Set(tags.map(tag => tag.trim()).filter(Boolean))];

/** Studio serializers cannot replace organization state with an earlier snapshot. */
export function preserveWorkshop(incoming?: string | null, current?: string | null): string | undefined {
  const original = JSON.parse(current || '{}');
  const stored = original && typeof original === 'object' && !Array.isArray(original) ? original._workshop : undefined;
  if (stored === undefined) return incoming ?? undefined;
  return JSON.stringify({ ...metadataObject(incoming), _workshop: stored });
}

export function applyOrganization(doc: DocumentMetadata, patch: OrganizationPatch, now = new Date().toISOString()): DocumentMetadata {
  const result = { ...doc, tags: patch.tags ? normalizeTags(patch.tags) : [...doc.tags] };
  if (patch.favorite !== undefined || patch.opened) {
    const metadata = metadataObject(doc.metadata_json);
    const previous = metadata._workshop;
    if (previous !== undefined && (!previous || typeof previous !== 'object' || Array.isArray(previous))) throw new Error('The reserved _workshop metadata must be an object.');
    const state = { ...(previous as Record<string, unknown> | undefined) };
    if (patch.favorite !== undefined) state.favorite = patch.favorite;
    if (patch.opened) state.last_opened_at = now;
    result.metadata_json = JSON.stringify({ ...metadata, _workshop: state });
  }
  return result;
}

export function isCatalogDoc(doc: DocumentMetadata): boolean {
  if (doc.doc_type !== 'lorebook') return false;
  try {
    const meta = JSON.parse(doc.metadata_json || '{}');
    return Boolean(meta && typeof meta === 'object' && meta._web_of_thought !== undefined);
  } catch {
    return false;
  }
}

export function selectLibrary(documents: DocumentMetadata[], filters: LibraryFilters, searchResults?: SearchResult[]): DocumentMetadata[] {
  const ids = searchResults ? new Set(searchResults.map(result => result.id)) : undefined;
  const query = filters.query.trim().toLocaleLowerCase();
  const result = documents.filter(doc => !isCatalogDoc(doc)
    && (filters.studio === 'all' || doc.doc_type === filters.studio)
    && filters.tags.every(tag => doc.tags.includes(tag))
    && (filters.view !== 'favorites' || workshop(doc).favorite)
    && (filters.view !== 'recent' || !!workshop(doc).last_opened_at)
    && (!query || (ids ? ids.has(doc.id) : doc.title.toLocaleLowerCase().includes(query))));
  return result.sort((a, b) => {
    // Recent always means most recently OPENED; editing dates never infer history.
    if (filters.view === 'recent') return Date.parse(workshop(b).last_opened_at!) - Date.parse(workshop(a).last_opened_at!) || a.id.localeCompare(b.id);
    if (filters.sort.startsWith('title')) {
      const comparison = a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
      return (filters.sort === 'title-desc' ? -comparison : comparison) || a.id.localeCompare(b.id);
    }
    const field = filters.sort === 'created' ? 'created_at' : 'updated_at';
    return (Date.parse(b[field]) || 0) - (Date.parse(a[field]) || 0) || a.id.localeCompare(b.id);
  });
}
