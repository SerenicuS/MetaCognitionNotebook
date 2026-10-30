import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_UNIVERSES, attributionLabel, chapterCreationMetadata, classifyLoreDocument, houseUniverses, initialCreationUniverse, readScopePreference, requireCreationUniverse, scopeAfterOpen, scopeFromValue, scopePreferenceKey, scopeValue, scopedSidebarDocuments, scopedBookChapters, universeChoiceLabel, validBookForUniverse, validateScope, type LorebookScope } from '../src/utils/lorebookNavigation';
import { refreshAndOpenImportedUniverse } from '../src/services/lorebookNavigation';
import { computeStudioCounts } from '../src/utils/house';
import { selectLibrary, type LibraryFilters } from '../src/utils/organization';
import { getUniverseEntities } from '../src/utils/universe';
import { navigationFixture, loreDoc } from './fixtures/lorebookNavigation';

const specific = (universeId: string): LorebookScope => ({ kind: 'universe', universeId });
const filters: LibraryFilters = { studio: 'lorebook', view: 'all', tags: [], sort: 'title-asc', query: '' };
const ids = (rows: { id: string }[]) => rows.map(d => d.id).sort();

describe('Finding 10 — safe, read-only Lorebook browsing', () => {
  const { plan, houses, documents } = navigationFixture();
  const classify = (doc: typeof documents[number]) => classifyLoreDocument(doc, plan, 'house-default', houses);
  const project = (scope: LorebookScope) => scopedSidebarDocuments(documents, scope, plan, 'house-default', houses);

  it('separates two Universes in one House by UUID, including identical entity titles', () => {
    assert.deepEqual(ids(project(specific('a'))), ['a-entry', 'a-legacy']);
    assert.deepEqual(ids(project(specific('b'))), ['b-entry']);
  });
  it('switching views changes only the projection and never canonical documents or the full plan', () => {
    const before = JSON.stringify({ plan, houses, documents });
    for (const scope of [specific('a'), specific('b'), ALL_UNIVERSES, { kind: 'unresolved' } as const]) project(scope);
    assert.equal(JSON.stringify({ plan, houses, documents }), before);
    assert.equal(getUniverseEntities(documents, 'b', plan.universes)[0].id, 'b-entry');
    assert.equal(plan.universes.length, 7);
  });
  it('All preserves House discovery, archived-world entries, malformed metadata and unresolved rows; excludes catalog and foreign House', () => {
    assert.deepEqual(ids(project(ALL_UNIVERSES)), ['a-entry', 'a-legacy', 'ambiguous', 'archived-entry', 'b-entry', 'malformed', 'unassigned', 'unknown']);
  });
  it('Unresolved contains only actual unresolved Lore in the active House', () => {
    assert.deepEqual(ids(project({ kind: 'unresolved' })), ['ambiguous', 'malformed', 'unassigned', 'unknown']);
  });
  it('empty Universes remain valid selectable scopes', () => {
    assert.deepEqual(validateScope(specific('empty'), plan, 'house-default', houses), specific('empty'));
    assert.equal(project(specific('empty')).length, 0);
  });
  it('duplicate Universe labels include stable UUIDs and ambiguous legacy names never pick the first', () => {
    const choices = houseUniverses(plan, 'house-default', houses);
    assert.match(universeChoiceLabel(choices.find(u => u.id === 'duplicate-1')!, choices), /duplicate-1/);
    assert.match(classify(loreDoc('x', { universe: 'Duplicate' })).reason, /Ambiguous/);
    assert.equal(initialCreationUniverse(choices, undefined, 'Duplicate'), '');
  });
  it('legacy matching is unique within the House, despite the same name in another House', () => {
    assert.equal(classify(loreDoc('x', { universe: '  PSYCHOSIS  ' })).universe?.id, 'a');
    assert.equal(classifyLoreDocument(loreDoc('x', { universe: 'Psychosis' }, { house_id: 'other' }), plan, 'other', houses).universe?.id, 'foreign');
  });
  it('explicit valid UUID takes precedence over a stale or duplicate legacy name', () => {
    assert.equal(classify(loreDoc('x', { universe_id: 'b', universe: 'Duplicate' })).universe?.id, 'b');
  });
  it('unknown explicit UUID cannot fall back to a matching valid legacy name', () => {
    const result = classify(loreDoc('x', { universe_id: 'missing', universe: 'Psychosis' }));
    assert.equal(result.kind, 'unresolved'); assert.match(result.reason, /Unknown explicit/);
  });
  it('foreign UUID never assigns an entry to the current House', () => {
    assert.match(classify(loreDoc('x', { universe_id: 'foreign', universe: 'Psychosis' })).reason, /another House/);
  });
  it('document/catalog conflicts and duplicate catalog registrations remain unresolved', () => {
    for (const entities of [[{ id: 'x', universe_id: 'b' }], [{ id: 'x', universe_id: 'a' }, { id: 'x', universe_id: 'b' }]]) {
      assert.equal(classifyLoreDocument(loreDoc('x', { universe_id: 'a' }), { ...plan, entities }, 'house-default', houses).kind, 'unresolved');
    }
  });
  it('catalog-only attribution can be viewed but is never written back to a document', () => {
    const doc = loreDoc('x', {}); const before = doc.metadata_json;
    const result = classifyLoreDocument(doc, { ...plan, entities: [{ id: 'x', universe_id: 'b' }] }, 'house-default', houses);
    assert.equal(result.universe?.id, 'b'); assert.equal(doc.metadata_json, before); assert.match(result.reason, /unchanged/);
  });
  it('malformed JSON, primitives, arrays and invalid explicit fields are discoverable with diagnostics', () => {
    for (const raw of ['{bad', 'null', '[]', '42', '{"universe_id":5}', '{"universe_id":""}']) {
      const result = classify(loreDoc('x', {}, { metadata_json: raw }));
      assert.equal(result.kind, 'unresolved'); assert.ok(result.reason.length > 10);
    }
  });
  it('archived worlds retain entries and explicit inspection but cannot be ordinary creation targets', () => {
    assert.deepEqual(ids(project(specific('archived'))), ['archived-entry']);
    assert.match(attributionLabel(classify(documents.find(d => d.id === 'archived-entry')!), plan.universes), /Archived/);
    assert.throws(() => requireCreationUniverse(plan, 'archived', 'house-default', houses), /active Universe/);
    assert.equal(initialCreationUniverse(plan.universes, 'archived'), '');
  });
  it('invalid/deleted/foreign remembered UUIDs fall back to All; valid archived inspection survives', () => {
    for (const id of ['missing', 'foreign']) assert.deepEqual(validateScope(specific(id), plan, 'house-default', houses), ALL_UNIVERSES);
    assert.deepEqual(validateScope(specific('archived'), plan, 'house-default', houses), specific('archived'));
    assert.deepEqual(validateScope({ kind: 'unresolved' }, plan, 'house-default', houses), { kind: 'unresolved' });
  });
  it('preferences are namespaced by both notebook and House, default All, and tolerate broken storage', () => {
    const keys = [scopePreferenceKey('C:/one', 'house-default'), scopePreferenceKey('C:/two', 'house-default'), scopePreferenceKey('C:/one', 'other')];
    assert.equal(new Set(keys).size, 3);
    assert.deepEqual(readScopePreference({ getItem: () => null }, keys[0]), ALL_UNIVERSES);
    assert.deepEqual(readScopePreference({ getItem: () => '{bad' }, keys[0]), ALL_UNIVERSES);
    assert.deepEqual(readScopePreference({ getItem: () => { throw Error('denied'); } }, keys[0]), ALL_UNIVERSES);
    assert.deepEqual(readScopePreference({ getItem: () => '{"kind":"unresolved"}' }, keys[0]), { kind: 'unresolved' });
  });
  it('scope serialization is unambiguous even if UUID text resembles a scope name', () => {
    for (const scope of [ALL_UNIVERSES, { kind: 'unresolved' } as const, specific('all'), specific('unresolved')]) assert.deepEqual(scopeFromValue(scopeValue(scope)), scope);
  });
  it('specific-world context follows a valid cross-Universe open; intentional All and Unresolved remain', () => {
    const b = classify(documents.find(d => d.id === 'b-entry')!);
    assert.deepEqual(scopeAfterOpen(specific('a'), b), specific('b'));
    assert.deepEqual(scopeAfterOpen(ALL_UNIVERSES, b), ALL_UNIVERSES);
    assert.deepEqual(scopeAfterOpen({ kind: 'unresolved' }, b), { kind: 'unresolved' });
    assert.deepEqual(scopeAfterOpen(specific('a'), classify(loreDoc('x', {}))), { kind: 'unresolved' });
  });
  it('Favorites, Recent, search, tags, sorting and visible counts all consume the same UUID projection', () => {
    const a = project(specific('a'));
    assert.deepEqual(ids(selectLibrary(a, { ...filters, view: 'favorites' })), ['a-entry']);
    assert.deepEqual(ids(selectLibrary(a, { ...filters, view: 'recent' })), ['a-entry']);
    assert.deepEqual(ids(selectLibrary(a, { ...filters, tags: ['b-only'] })), []);
    const searchResults = documents.map(d => ({ ...d, snippet: '', score: 1 }));
    assert.deepEqual(ids(selectLibrary(a, { ...filters, query: 'full-text' }, searchResults)), ['a-entry', 'a-legacy']);
    assert.deepEqual(selectLibrary(a, filters).map(d => d.id), ['a-legacy', 'a-entry']);
    assert.equal(computeStudioCounts(documents.filter(d => d.house_id === 'house-default')).lorebook, 8);
  });
  it('Book linking preserves explicit UUID-only legacy chapters without assigning browsing ownership', () => {
    const chapter = loreDoc('legacy-chapter', { entry_type: 'chapter', book_id: 'book-a' });
    assert.equal(classify(chapter).kind, 'unresolved');
    assert.deepEqual(ids(scopedBookChapters([chapter], plan, plan.books[0], 'house-default', houses)), ['legacy-chapter']);
  });
  it('same-named Book fallback cannot cross Universes or choose between duplicate same-Universe Books', () => {
    const chapters = [loreDoc('a', { entry_type: 'chapter', universe_id: 'a', book: 'Shared Book' }), loreDoc('b', { entry_type: 'chapter', universe_id: 'b', book: 'Shared Book' }), loreDoc('unknown', { entry_type: 'chapter', universe_id: 'missing', book_id: 'book-a' })];
    assert.deepEqual(ids(scopedBookChapters(chapters, plan, plan.books[0], 'house-default', houses)), ['a']);
    const ambiguous = { ...plan, books: [...plan.books, { ...plan.books[0], id: 'duplicate-book' }] };
    assert.deepEqual(scopedBookChapters(chapters, ambiguous, plan.books[0], 'house-default', houses), []);
  });
  it('other studios and their reference pools are not reduced by a Lorebook scope', () => {
    const poem = { ...loreDoc('poem', {}), doc_type: 'poetry' as const };
    assert.ok(scopedSidebarDocuments([...documents, poem], specific('empty'), plan, 'house-default', houses).some(d => d.id === 'poem'));
    assert.equal(documents.length, 10);
  });
  it('creation requires an explicit validated active same-House UUID, with no first-world fallback', () => {
    for (const id of [undefined, '', 'missing', 'foreign', 'archived']) assert.throws(() => requireCreationUniverse(plan, id, 'house-default', houses), /active Universe/);
    assert.equal(requireCreationUniverse(plan, 'empty', 'house-default', houses).id, 'empty');
    assert.equal(initialCreationUniverse(houseUniverses(plan, 'house-default', houses)), '');
    assert.equal(initialCreationUniverse(plan.universes, 'missing', 'Psychosis'), '');
  });
  it('valid chapters retain explicit Book and Universe IDs; stale/foreign/archived Books never produce metadata', () => {
    const result = chapterCreationMetadata(plan, 'a', 'book-a', 'Chapter One', 1, 'house-default', houses);
    assert.equal(result.universe_id, 'a'); assert.equal(result.book_id, 'book-a');
    for (const id of ['missing', 'book-b', 'book-archived']) assert.throws(() => chapterCreationMetadata(plan, 'a', id, 'Bad chapter', 2, 'house-default', houses), /Book/);
    assert.equal(validBookForUniverse(plan, 'book-a', 'foreign', 'house-default', houses), undefined);
  });
});

describe('Finding 10 — import refresh and guarded destination navigation', () => {
  it('refreshes canonical collections, switches House, refreshes/revalidates again, then opens', async () => {
    const snapshot = navigationFixture(); const events: string[] = []; let currentHouse = 'house-default';
    await refreshAndOpenImportedUniverse('foreign', 'other', {
      refresh: async () => { events.push('refresh'); return snapshot; }, currentHouse: () => currentHouse,
      switchHouse: async id => { events.push(`switch:${id}`); currentHouse = id; return true; },
      open: async (id, house, fresh) => { assert.equal(fresh.documents.length, 10); events.push(`open:${house}:${id}`); return true; },
    });
    assert.deepEqual(events, ['refresh', 'switch:other', 'refresh', 'open:other:foreign']);
  });
  it('same-House import refreshes before opening and does not switch Houses', async () => {
    const events: string[] = [];
    await refreshAndOpenImportedUniverse('a', 'house-default', {
      refresh: async () => { events.push('refresh'); return navigationFixture(); }, currentHouse: () => 'house-default',
      switchHouse: async () => { throw Error('unexpected switch'); }, open: async () => { events.push('open'); return true; },
    });
    assert.deepEqual(events, ['refresh', 'open']);
  });
  it('failed refresh or destination mismatch blocks navigation without retrying the committed import', async () => {
    for (const snapshot of [undefined, navigationFixture()]) {
      let navigated = false;
      await assert.rejects(refreshAndOpenImportedUniverse('a', 'other', {
        refresh: async () => snapshot, currentHouse: () => 'house-default', switchHouse: async () => { navigated = true; return true; }, open: async () => { navigated = true; return true; },
      }), /Refresh could not confirm/);
      assert.equal(navigated, false);
    }
  });
  it('save/House-switch rejection prevents imported navigation', async () => {
    let opened = false;
    await assert.rejects(refreshAndOpenImportedUniverse('foreign', 'other', {
      refresh: async () => navigationFixture(), currentHouse: () => 'house-default', switchHouse: async () => false,
      open: async () => { opened = true; return true; },
    }), /blocked/);
    assert.equal(opened, false);
  });
  it('an imported Universe removed during the guarded switch is revalidated before open', async () => {
    let refreshed = 0;
    await assert.rejects(refreshAndOpenImportedUniverse('foreign', 'other', {
      refresh: async () => { const value = navigationFixture(); if (++refreshed > 1) value.plan.universes = []; return value; },
      currentHouse: () => 'house-default', switchHouse: async () => true, open: async () => { throw Error('must not open'); },
    }), /Refresh could not confirm/);
  });
});
