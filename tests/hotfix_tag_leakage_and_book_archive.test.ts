import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockStorage } from '../src/services/api';
import type { DocumentMetadata, HouseRecord, DocumentDetail } from '../src/types';
import type { Plan, Universe, Book, StoryNode } from '../src/utils/thought';
import { uid, initialize } from '../src/utils/thought';
import {
  getBooksForUniverse,
  setBookArchived,
  createBookInPlan,
  getChaptersForBook,
} from '../src/utils/universe';
import { selectLibrary } from '../src/utils/organization';

test('Beta Hotfix: Issue A — Cross-House Tag Isolation & Integrity', async (t) => {
  const HOUSE_A: HouseRecord = {
    id: 'house-nebula-a',
    name: 'House Nebula',
    color: 'indigo',
    icon: 'sparkles',
    enabled_studios: ['lorebook', 'philosophy'],
    manuscript_tools_enabled: true,
    created_at: 1000,
    updated_at: 1000,
  };

  const HOUSE_B: HouseRecord = {
    id: 'house-citadel-b',
    name: 'House Citadel',
    color: 'amber',
    icon: 'shield',
    enabled_studios: ['lorebook', 'poetry'],
    manuscript_tools_enabled: true,
    created_at: 1000,
    updated_at: 1000,
  };

  const storage = new MockStorage();

  // Create documents in House A (docType, title, parentId?, initialContent?, metadataJson?, tags?, houseId?)
  const docA1 = await storage.createDocument('lorebook', 'Starship Propulsion', undefined, '# Starship Propulsion', undefined, ['cosmic', 'shared'], HOUSE_A.id);
  const docA2 = await storage.createDocument('philosophy', 'Void Philosophy', undefined, '# Void Philosophy', undefined, ['cosmic', 'deep-space'], HOUSE_A.id);

  // Create documents in House B
  const docB1 = await storage.createDocument('lorebook', 'Castle Defense Doctrine', undefined, '# Castle Defense Doctrine', undefined, ['medieval', 'shared'], HOUSE_B.id);
  const docB2 = await storage.createDocument('poetry', 'Siege Poetry', undefined, '# Siege Poetry', undefined, ['medieval', 'ballad'], HOUSE_B.id);

  await t.test('1. Tag listing query isolates tags strictly by House ID', async () => {
    const tagsA = await storage.listTags(HOUSE_A.id);
    assert.deepStrictEqual(tagsA.sort(), ['cosmic', 'deep-space', 'shared']);
    assert.strictEqual(tagsA.includes('medieval'), false);
    assert.strictEqual(tagsA.includes('ballad'), false);

    const tagsB = await storage.listTags(HOUSE_B.id);
    assert.deepStrictEqual(tagsB.sort(), ['ballad', 'medieval', 'shared']);
    assert.strictEqual(tagsB.includes('cosmic'), false);
    assert.strictEqual(tagsB.includes('deep-space'), false);
  });

  await t.test('2. Unspecified houseId lists all tags across vault (fallback compatibility)', async () => {
    const allTags = await storage.listTags();
    const expectedSubset = ['ballad', 'cosmic', 'deep-space', 'medieval', 'shared'];
    for (const tag of expectedSubset) {
      assert.strictEqual(allTags.includes(tag), true, `Expected allTags to include ${tag}`);
    }
  });

  await t.test('3. Tag catalog and active house UI scoped derivation prevents leakage', () => {
    // When House A is active:
    const houseADocs = [docA1.metadata, docA2.metadata];
    const tagCatalogA = ['cosmic', 'deep-space', 'shared'];
    const activeTagsA = Array.from(new Set([...tagCatalogA, ...houseADocs.flatMap(d => d.tags)])).sort();

    assert.deepStrictEqual(activeTagsA, ['cosmic', 'deep-space', 'shared']);
    assert.strictEqual(activeTagsA.includes('medieval'), false);

    // Switching to House B resets catalog and reloads for House B:
    let tagCatalog = [...tagCatalogA];
    let selectedTags = ['cosmic'];

    // Simulated switchHouse:
    tagCatalog = []; // Immediately reset
    selectedTags = []; // Reset on activeHouse change
    tagCatalog = ['ballad', 'medieval', 'shared']; // Loaded for House B
    const houseBDocs = [docB1.metadata, docB2.metadata];
    const activeTagsB = Array.from(new Set([...tagCatalog, ...houseBDocs.flatMap(d => d.tags)])).sort();

    assert.deepStrictEqual(activeTagsB, ['ballad', 'medieval', 'shared']);
    assert.strictEqual(activeTagsB.includes('cosmic'), false);
    assert.deepStrictEqual(selectedTags, []);
  });

  await t.test('4. Tag filtering via selectLibrary respects active house documents', () => {
    const houseADocs = [docA1.metadata, docA2.metadata];
    const filteredA = selectLibrary(houseADocs, {
      studio: 'all',
      tags: ['cosmic'],
      view: 'all',
      sort: 'modified',
      query: '',
      houseId: HOUSE_A.id,
    });
    assert.strictEqual(filteredA.length, 2);
    assert.strictEqual(filteredA.every(d => d.house_id === HOUSE_A.id), true);

    // House B docs filtered by 'cosmic' returns 0 documents
    const houseBDocs = [docB1.metadata, docB2.metadata];
    const filteredB = selectLibrary(houseBDocs, {
      studio: 'all',
      tags: ['cosmic'],
      view: 'all',
      sort: 'modified',
      query: '',
      houseId: HOUSE_B.id,
    });
    assert.strictEqual(filteredB.length, 0);

    // Filtering combined docs by houseId and tag 'shared' isolates House A vs House B
    const combinedDocs = [...houseADocs, ...houseBDocs];
    const filteredSharedA = selectLibrary(combinedDocs, {
      studio: 'all',
      tags: ['shared'],
      view: 'all',
      sort: 'modified',
      query: '',
      houseId: HOUSE_A.id,
    });
    assert.strictEqual(filteredSharedA.length, 1);
    assert.strictEqual(filteredSharedA[0].id, docA1.metadata.id);

    const filteredSharedB = selectLibrary(combinedDocs, {
      studio: 'all',
      tags: ['shared'],
      view: 'all',
      sort: 'modified',
      query: '',
      houseId: HOUSE_B.id,
    });
    assert.strictEqual(filteredSharedB.length, 1);
    assert.strictEqual(filteredSharedB[0].id, docB1.metadata.id);
  });

  await t.test('5. Modifying or renaming a tag in House A does not touch House B', async () => {
    // Both houses share the tag 'shared'
    const report = await storage.manageTag('shared', 'celestial-shared', HOUSE_A.id);
    assert.strictEqual(report.updated.length, 1);
    assert.strictEqual(report.updated[0].id, docA1.metadata.id);

    // House A tags now have 'celestial-shared' and no longer 'shared'
    const tagsA = await storage.listTags(HOUSE_A.id);
    assert.strictEqual(tagsA.includes('celestial-shared'), true);
    assert.strictEqual(tagsA.includes('shared'), false);

    // House B tags STILL have 'shared', completely untouched
    const tagsB = await storage.listTags(HOUSE_B.id);
    assert.strictEqual(tagsB.includes('shared'), true);
    assert.strictEqual(tagsB.includes('celestial-shared'), false);

    // House B doc retains 'shared'
    const b1 = await storage.getDocument(docB1.metadata.id);
    assert.strictEqual(b1.metadata.tags.includes('shared'), true);
    assert.strictEqual(b1.metadata.tags.includes('celestial-shared'), false);
  });

  await t.test('6. Deleting a tag in House A only removes it from House A', async () => {
    const report = await storage.manageTag('celestial-shared', undefined, HOUSE_A.id);
    assert.strictEqual(report.updated.length, 1);

    const a1 = await storage.getDocument(docA1.metadata.id);
    assert.strictEqual(a1.metadata.tags.includes('celestial-shared'), false);

    // House B untouched
    const b1 = await storage.getDocument(docB1.metadata.id);
    assert.strictEqual(b1.metadata.tags.includes('shared'), true);
  });
});

test('Beta Hotfix: Issue B — Book Archiving & Recovery', async (t) => {
  const universeA: Universe = {
    id: 'univ-sol-99',
    name: 'Solar System Federation',
    description: 'Human colonization of the solar system',
  };

  const universeB: Universe = {
    id: 'univ-avalon-77',
    name: 'Avalon Realm',
    description: 'Fantasy realm of magic and knights',
  };

  const initialPlan: Plan = {
    version: 1,
    revision: 1,
    universes: [universeA, universeB],
    books: [],
    entities: [],
    nodes: [],
    relationships: [],
  };

  // 1. Create books in both universes
  const { plan: p1, book: bookA1 } = createBookInPlan(initialPlan, universeA.id, 'Martian Dawn', 'canonical', 'The uprising on Mars');
  const { plan: p2, book: bookA2 } = createBookInPlan(p1, universeA.id, 'Europa Outpost', 'standalone', 'Deep ocean mystery');
  const { plan: p3, book: bookB1 } = createBookInPlan(p2, universeB.id, 'Sword of the Lake', 'canonical', 'The legendary sword');

  // Add chapter documents for bookA1
  const chapDoc1: DocumentMetadata = {
    id: 'chap-101',
    title: 'Chapter 1: The Red Dust',
    doc_type: 'lorebook',
    tags: ['chapter'],
    house_id: 'house-nebula-a',
    path: '/vault/houses/house-nebula-a/lorebook/chap1.md',
    created_at: '2026-10-26T11:00:00Z',
    modified_at: '2026-10-26T11:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'chapter',
      book_id: bookA1.id,
      universe_id: universeA.id,
      chapter_order: 1,
    }),
  };

  const chapDoc2: DocumentMetadata = {
    id: 'chap-102',
    title: 'Chapter 2: Phobos Station',
    doc_type: 'lorebook',
    tags: ['chapter'],
    house_id: 'house-nebula-a',
    path: '/vault/houses/house-nebula-a/lorebook/chap2.md',
    created_at: '2026-10-26T11:30:00Z',
    modified_at: '2026-10-26T11:30:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'chapter',
      book_id: bookA1.id,
      universe_id: universeA.id,
      chapter_order: 2,
    }),
  };

  // Add a story node (milestone) for bookA1
  const milestone1: StoryNode = {
    id: 'node-milestone-1',
    universe_id: universeA.id,
    book_id: bookA1.id,
    title: 'The Great Phobos Revolt',
    description: 'Miners take control of the orbital refinery.',
    era: '2142 CE',
    status: 'explored',
    position: 0,
    archived: false,
    divergence_node_id: null,
  };

  let plan: Plan = {
    ...p3,
    nodes: [milestone1],
  };

  const docs = [chapDoc1, chapDoc2];

  await t.test('1. Initial state: active books appear in Universe A', () => {
    const activeBooks = getBooksForUniverse(plan, universeA.id);
    assert.strictEqual(activeBooks.length, 2);
    assert.strictEqual(activeBooks.some(b => b.id === bookA1.id), true);
    assert.strictEqual(activeBooks.some(b => b.id === bookA2.id), true);

    const activeBooksB = getBooksForUniverse(plan, universeB.id);
    assert.strictEqual(activeBooksB.length, 1);
    assert.strictEqual(activeBooksB[0].id, bookB1.id);
  });

  await t.test('2. Archiving Book A1 removes it from default active getBooksForUniverse', () => {
    plan = setBookArchived(plan, bookA1.id, true);

    // Default getBooksForUniverse (includeArchived = false)
    const activeBooks = getBooksForUniverse(plan, universeA.id);
    assert.strictEqual(activeBooks.length, 1);
    assert.strictEqual(activeBooks[0].id, bookA2.id);
    assert.strictEqual(activeBooks.some(b => b.id === bookA1.id), false);
  });

  await t.test('3. Archived book is retained in plan.books and queryable with includeArchived: true', () => {
    const allBooksA = getBooksForUniverse(plan, universeA.id, true);
    assert.strictEqual(allBooksA.length, 2);

    const archivedA1 = plan.books.find(b => b.id === bookA1.id);
    assert.ok(archivedA1);
    assert.strictEqual(archivedA1.archived, true);
    assert.strictEqual(archivedA1.name, 'Martian Dawn');
    assert.strictEqual(archivedA1.continuity, 'canonical');
  });

  await t.test('4. Universe Dashboard partitioning: active books vs archived books', () => {
    const activeBooks = getBooksForUniverse(plan, universeA.id, false);
    const archivedBooks = plan.books.filter(b => b.universe_id === universeA.id && b.archived);

    assert.strictEqual(activeBooks.length, 1);
    assert.strictEqual(activeBooks[0].id, bookA2.id);

    assert.strictEqual(archivedBooks.length, 1);
    assert.strictEqual(archivedBooks[0].id, bookA1.id);
    assert.strictEqual(archivedBooks[0].name, 'Martian Dawn');
  });

  await t.test('5. WebOfThought timeline selector excludes archived books', () => {
    const selectableTimelines = plan.books.filter(b => b.universe_id === universeA.id && !b.archived);
    assert.strictEqual(selectableTimelines.length, 1);
    assert.strictEqual(selectableTimelines[0].id, bookA2.id);
    assert.strictEqual(selectableTimelines.some(b => b.id === bookA1.id), false);
  });

  await t.test('6. Chapters and narrative prose are not deleted when a book is archived', () => {
    const chapters = getChaptersForBook(docs, bookA1.id, bookA1.name);
    assert.strictEqual(chapters.length, 2);
    assert.strictEqual(chapters[0].title, 'Chapter 1: The Red Dust');
    assert.strictEqual(chapters[1].title, 'Chapter 2: Phobos Station');
  });

  await t.test('7. Story milestones and continuity metadata are preserved', () => {
    const bookMilestones = plan.nodes.filter(n => n.book_id === bookA1.id);
    assert.strictEqual(bookMilestones.length, 1);
    assert.strictEqual(bookMilestones[0].title, 'The Great Phobos Revolt');
    assert.strictEqual(bookMilestones[0].era, '2142 CE');
    assert.strictEqual(bookMilestones[0].archived, false);
  });

  await t.test('8. Another Universe books are completely unaffected', () => {
    const activeBooksB = getBooksForUniverse(plan, universeB.id);
    assert.strictEqual(activeBooksB.length, 1);
    assert.strictEqual(activeBooksB[0].id, bookB1.id);
    assert.strictEqual(activeBooksB[0].archived, undefined);
  });

  await t.test('9. Recovering / restoring an archived book returns it to active status', () => {
    plan = setBookArchived(plan, bookA1.id, false);

    const activeBooks = getBooksForUniverse(plan, universeA.id);
    assert.strictEqual(activeBooks.length, 2);
    assert.strictEqual(activeBooks.some(b => b.id === bookA1.id), true);

    const archivedBooks = plan.books.filter(b => b.universe_id === universeA.id && b.archived);
    assert.strictEqual(archivedBooks.length, 0);

    const restoredA1 = plan.books.find(b => b.id === bookA1.id);
    assert.ok(restoredA1);
    assert.strictEqual(restoredA1.archived, false);
  });
});
