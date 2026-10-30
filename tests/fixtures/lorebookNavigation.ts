import type { DocumentMetadata, HouseRecord } from '../../src/types';
import { emptyPlan } from '../../src/utils/thought';

export const house = (id: string, name: string, universe_ids: string[]): HouseRecord => ({
  id, name, universe_ids, color: 'gold', icon: 'home', enabled_studios: ['poetry', 'philosophy', 'lorebook'],
  manuscript_tools_enabled: true, archived: false, created_at: '2026-01-01', updated_at: '2026-01-01',
});
export function loreDoc(id: string, metadata: unknown, extra: Partial<DocumentMetadata> = {}): DocumentMetadata {
  return { id, title: id, doc_type: 'lorebook', house_id: 'house-default', relative_path: `${id}.md`, tags: [],
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', metadata_json: JSON.stringify(metadata), ...extra };
}
export function navigationFixture() {
  const plan = emptyPlan();
  plan.universes = [{ id: 'a', name: 'Psychosis' }, { id: 'b', name: 'Another Universe' }, { id: 'empty', name: 'Empty Universe' },
    { id: 'duplicate-1', name: 'Duplicate' }, { id: 'duplicate-2', name: 'Duplicate' },
    { id: 'archived', name: 'Archived Universe', archived: true }, { id: 'foreign', name: 'Psychosis' }];
  plan.books = [{ id: 'book-a', name: 'Shared Book', universe_id: 'a', continuity: 'canonical' },
    { id: 'book-b', name: 'Shared Book', universe_id: 'b', continuity: 'canonical' },
    { id: 'book-archived', name: 'Archived Book', universe_id: 'a', continuity: 'canonical', archived: true }];
  const houses = [house('house-default', 'Dark Stories', ['a', 'b', 'empty', 'duplicate-1', 'duplicate-2', 'archived']), house('other', 'Other House', ['foreign'])];
  const documents = [
    loreDoc('a-entry', { universe_id: 'a', entry_type: 'character', _workshop: { favorite: true, last_opened_at: '2026-01-01T00:00:00Z' } }, { title: 'Same Character', tags: ['a-only', 'shared'] }),
    loreDoc('b-entry', { universe_id: 'b', entry_type: 'character', _workshop: { favorite: true, last_opened_at: '2026-02-01T00:00:00Z' } }, { title: 'Same Character', tags: ['b-only', 'shared'] }),
    loreDoc('a-legacy', { universe: 'Psychosis', entry_type: 'location' }, { tags: ['a-only'] }),
    loreDoc('ambiguous', { universe: 'Duplicate' }),
    loreDoc('unknown', { universe_id: 'missing', universe: 'Psychosis' }),
    loreDoc('unassigned', {}),
    loreDoc('malformed', {}, { metadata_json: '{broken' }),
    loreDoc('archived-entry', { universe_id: 'archived' }),
    loreDoc('foreign-entry', { universe_id: 'foreign' }, { house_id: 'other' }),
    loreDoc('catalog', { _web_of_thought: plan }),
  ];
  return { plan, houses, documents };
}
