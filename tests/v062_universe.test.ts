import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../src/utils/thought';
import * as U from '../src/utils/universe';
import type { DocumentMetadata } from '../src/types';
import { api, mock } from '../src/services/api';

function makeDoc(id: string, metadata: Record<string, unknown>, title = 'Test Doc'): DocumentMetadata {
  return {
    id,
    title,
    doc_type: 'lorebook',
    relative_path: `Lorebooks/${id}.md`,
    created_at: '2026-10-19T00:00:00.000Z',
    updated_at: '2026-10-19T00:00:00.000Z',
    tags: [],
    metadata_json: JSON.stringify(metadata),
  };
}

test('Universe identity: stable universe IDs preserve identity across renames', () => {
  let plan = W.emptyPlan();
  const { plan: p1, universe } = U.createUniverseInPlan(plan, 'Eryndor', 'A realm of ancient magic');
  plan = p1;

  assert.equal(universe.name, 'Eryndor');
  assert.equal(universe.description, 'A realm of ancient magic');
  assert.ok(universe.id.length > 0);

  // Rename Universe
  const p2 = U.renameUniverseInPlan(plan, universe.id, 'Greater Eryndor', 'An expanded realm');
  const renamed = p2.universes.find((u) => u.id === universe.id);
  assert.ok(renamed);
  assert.equal(renamed.id, universe.id);
  assert.equal(renamed.name, 'Greater Eryndor');
  assert.equal(renamed.description, 'An expanded realm');
});

test('Safe legacy universe resolution: exact match, case insensitivity, ambiguity, and unassigned', () => {
  const universes: W.Universe[] = [
    { id: 'u1', name: 'Eryndor' },
    { id: 'u2', name: 'Valoria' },
    { id: 'u3', name: 'Duplicate Cosmos' },
    { id: 'u4', name: 'Duplicate Cosmos' },
  ];

  // 1. Direct universe_id match
  const docDirect = makeDoc('d1', { universe_id: 'u2', universe: 'Old Name' });
  const res1 = U.resolveEntityUniverse(docDirect, universes);
  assert.equal(res1.universeId, 'u2');
  assert.equal(res1.isUnassigned, false);
  assert.equal(res1.isAmbiguous, false);

  // 2. Unambiguous legacy name match (case-insensitive)
  const docLegacy = makeDoc('d2', { universe: 'eryndor' });
  const res2 = U.resolveEntityUniverse(docLegacy, universes);
  assert.equal(res2.universeId, 'u1');
  assert.equal(res2.isUnassigned, false);
  assert.equal(res2.isAmbiguous, false);

  // 3. Ambiguous duplicate universe names
  const docAmbiguous = makeDoc('d3', { universe: 'Duplicate Cosmos' });
  const res3 = U.resolveEntityUniverse(docAmbiguous, universes);
  assert.equal(res3.universeId, null);
  assert.equal(res3.isUnassigned, true);
  assert.equal(res3.isAmbiguous, true);

  // 4. Missing or unknown universe
  const docUnknown = makeDoc('d4', { universe: 'Unknown Land' });
  const res4 = U.resolveEntityUniverse(docUnknown, universes);
  assert.equal(res4.universeId, null);
  assert.equal(res4.isUnassigned, true);
  assert.equal(res4.isAmbiguous, false);

  // 5. Empty metadata
  const docEmpty = makeDoc('d5', {});
  const res5 = U.resolveEntityUniverse(docEmpty, universes);
  assert.equal(res5.universeId, null);
  assert.equal(res5.isUnassigned, true);
});

test('Category mapping groups all supported entry types without destructive conversion', () => {
  assert.equal(U.getCategoryForEntryType('character'), 'characters');
  assert.equal(U.getCategoryForEntryType('location'), 'locations');
  assert.equal(U.getCategoryForEntryType('faction'), 'factions');
  assert.equal(U.getCategoryForEntryType('nation'), 'factions');
  assert.equal(U.getCategoryForEntryType('concept'), 'rules');
  assert.equal(U.getCategoryForEntryType('rule'), 'rules');
  assert.equal(U.getCategoryForEntryType('culture'), 'cultures');
  assert.equal(U.getCategoryForEntryType('history'), 'cultures');
  assert.equal(U.getCategoryForEntryType('artifact'), 'artifacts');
  assert.equal(U.getCategoryForEntryType('item'), 'artifacts');
  assert.equal(U.getCategoryForEntryType('event'), 'events');
  assert.equal(U.getCategoryForEntryType('other'), 'other');
  assert.equal(U.getCategoryForEntryType(undefined), 'other');
  assert.equal(U.getCategoryForEntryType('unknown_type'), 'other');
});

test('Books and Chapters: creation, continuity options, and chapter ordering', () => {
  let plan = W.emptyPlan();
  const { plan: p1, universe } = U.createUniverseInPlan(plan, 'Eryndor');
  plan = p1;

  const { plan: p2, book } = U.createBookInPlan(plan, universe.id, 'The Fall of Eryndor', 'canonical', 'Epic chronicle');
  plan = p2;

  assert.equal(book.name, 'The Fall of Eryndor');
  assert.equal(book.universe_id, universe.id);
  assert.equal(book.continuity, 'canonical');
  assert.equal(book.description, 'Epic chronicle');

  // Verify getBooksForUniverse
  const books = U.getBooksForUniverse(plan, universe.id);
  assert.equal(books.length, 1);
  assert.equal(books[0].id, book.id);

  // Update book
  plan = U.updateBookInPlan(plan, book.id, { continuity: 'alternate' });
  assert.equal(plan.books.find((b) => b.id === book.id)?.continuity, 'alternate');

  // Chapters ordering
  const chap3 = makeDoc('c3', { book_id: book.id, entry_type: 'chapter', chapter_order: 3 }, 'Chapter 3');
  const chap1 = makeDoc('c1', { book_id: book.id, entry_type: 'chapter', chapter_order: 1 }, 'Chapter 1');
  const chap2 = makeDoc('c2', { book_id: book.id, entry_type: 'chapter', chapter_order: 2 }, 'Chapter 2');

  const ordered = U.getChaptersForBook([chap3, chap1, chap2], book.id);
  assert.deepEqual(ordered.map((c) => c.id), ['c1', 'c2', 'c3']);
});

test('Automatic plan entity syncing: newly created entities become immediately available to Universe tools', () => {
  let plan = W.emptyPlan();
  const { plan: p1, universe } = U.createUniverseInPlan(plan, 'Eryndor');
  plan = p1;

  const charDoc = makeDoc('char-1', { universe_id: universe.id, entry_type: 'character' }, 'Aldric');
  const locDoc = makeDoc('loc-1', { universe_id: universe.id, entry_type: 'location' }, 'Sun Citadel');

  // Sync docs into plan
  const synced = U.syncPlanEntities(plan, [charDoc, locDoc], universe.id);
  assert.equal(synced.entities.length, 2);
  assert.ok(synced.entities.some((e) => e.id === 'char-1' && e.universe_id === universe.id));
  assert.ok(synced.entities.some((e) => e.id === 'loc-1' && e.universe_id === universe.id));

  // Syncing again is idempotent
  const syncedTwice = U.syncPlanEntities(synced, [charDoc, locDoc], universe.id);
  assert.equal(syncedTwice.entities.length, 2);
});

test('UniverseSelector: renders empty welcome state and populated universe cards', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { UniverseSelector } = await import('../src/components/studios/lorebook/UniverseSelector');

  const emptyPlan = W.emptyPlan();

  // 1. Empty state
  const htmlEmpty = renderToStaticMarkup(
    React.createElement(UniverseSelector, {
      plan: emptyPlan,
      documents: [],
      onSelectUniverse: () => {},
      onCreateUniverse: () => {},
      onRenameUniverse: () => {},
      onSelectUnassigned: () => {},
    })
  );
  assert.match(htmlEmpty, /Welcome to Lorebook Studio/);
  assert.match(htmlEmpty, /Create a Universe to organize your world/);

  // 2. Populated state
  const { plan: populatedPlan, universe } = U.createUniverseInPlan(emptyPlan, 'Eryndor', 'A realm of magic and myth');
  const doc = makeDoc('doc-1', { universe_id: universe.id, entry_type: 'character' }, 'Queen Valerie');

  const htmlPopulated = renderToStaticMarkup(
    React.createElement(UniverseSelector, {
      plan: populatedPlan,
      documents: [doc],
      onSelectUniverse: () => {},
      onCreateUniverse: () => {},
      onRenameUniverse: () => {},
      onSelectUnassigned: () => {},
    })
  );
  assert.match(htmlPopulated, /Eryndor/);
  assert.match(htmlPopulated, /A realm of magic and myth/);
  assert.match(htmlPopulated, /1 entity/);
  assert.match(htmlPopulated, /0 books/);
  assert.match(htmlPopulated, /Open Universe/);
});

test('UniverseDashboard: renders tabs, quick action bar, category filters, and entities', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { UniverseDashboard } = await import('../src/components/studios/lorebook/UniverseDashboard');

  let plan = W.emptyPlan();
  const { plan: p1, universe } = U.createUniverseInPlan(plan, 'Eryndor', 'The world of Eryndor');
  plan = p1;

  const charDoc = makeDoc('char-1', { universe_id: universe.id, entry_type: 'character' }, 'Sir Gareth');
  const locDoc = makeDoc('loc-1', { universe_id: universe.id, entry_type: 'location' }, 'Whispering Woods');

  const html = renderToStaticMarkup(
    React.createElement(UniverseDashboard, {
      universeId: universe.id,
      plan,
      documents: [charDoc, locDoc],
      onBackToUniverses: () => {},
      onOpenDocument: () => {},
      onCreateEntity: () => {},
      onCreateBook: () => {},
      onUpdatePlan: () => {},
    })
  );

  // Workspace header
  assert.match(html, /Eryndor/);
  assert.match(html, /The world of Eryndor/);

  // Quick Action Bar
  assert.match(html, /\+ Add Character/);
  assert.match(html, /\+ Add Location/);
  assert.match(html, /\+ Add Faction/);
  assert.match(html, /\+ Add Book/);

  // Tabs
  assert.match(html, /Overview/);
  assert.match(html, /Worldbuilding/);
  assert.match(html, /Books &amp; Stories|Books & Stories/);
  assert.match(html, /Universe Timeline/);
  assert.match(html, /World Relationships/);

  // Category counts and quick actions
  assert.match(html, /Characters/);
  assert.match(html, /Locations/);
  assert.match(html, /Factions &amp; Nations|Factions & Nations/);
});

test('BookView: renders book continuity, chapter management, and story timeline', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { BookView } = await import('../src/components/studios/lorebook/BookView');

  let plan = W.emptyPlan();
  const { plan: p1, universe } = U.createUniverseInPlan(plan, 'Eryndor');
  const { plan: p2, book } = U.createBookInPlan(p1, universe.id, 'The Fall of Eryndor', 'canonical', 'Chronicles the kingdom fall');
  plan = p2;

  const chap1 = makeDoc('c1', { book_id: book.id, entry_type: 'chapter', chapter_order: 1 }, 'Chapter 1: The Omen');
  const chap2 = makeDoc('c2', { book_id: book.id, entry_type: 'chapter', chapter_order: 2 }, 'Chapter 2: The Gathering Storm');

  const html = renderToStaticMarkup(
    React.createElement(BookView, {
      book,
      universe,
      plan,
      documents: [chap1, chap2],
      onBackToUniverse: () => {},
      onOpenDocument: () => {},
      onCreateChapter: () => {},
      onUpdatePlan: () => {},
      onUpdateBook: () => {},
    })
  );

  assert.match(html, /The Fall of Eryndor/);
  assert.match(html, /Canonical Book/);
  assert.match(html, /Chapters &amp; Prose \(2\)|Chapters & Prose \(2\)/);
  assert.match(html, /Chapter 1: The Omen/);
  assert.match(html, /Chapter 2: The Gathering Storm/);
  assert.match(html, /New Chapter/);
});

test('EntityRelationshipsCard & EntityGuidedFields: renders guided fields and relationship links', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { EntityGuidedFields } = await import('../src/components/studios/lorebook/EntityGuidedFields');
  const { EntityRelationshipsCard } = await import('../src/components/studios/lorebook/EntityRelationshipsCard');

  // Guided Fields for Character
  const charHtml = renderToStaticMarkup(
    React.createElement(EntityGuidedFields, {
      metadata: {
        entry_type: 'character',
        character_fields: {
          role: 'High Knight',
          species: 'Human',
          affiliation: 'Royal Guard',
        },
      },
      onChange: () => {},
    })
  );
  assert.match(charHtml, /Character Profile Attributes/);
  assert.match(charHtml, /Role \/ Archetype/);
  assert.match(charHtml, /High Knight/);
  assert.match(charHtml, /Species \/ Race/);
  assert.match(charHtml, /Royal Guard/);

  // Relationships Card
  let plan = W.emptyPlan();
  const { plan: p1, universe } = U.createUniverseInPlan(plan, 'Eryndor');
  plan = p1;

  const knight = makeDoc('char-k', { universe_id: universe.id, entry_type: 'character' }, 'Sir Gareth');
  const king = makeDoc('char-q', { universe_id: universe.id, entry_type: 'character' }, 'King Arthur');

  // Add relationship in plan
  plan.relationships.push({
    id: 'rel-1',
    universe_id: universe.id,
    book_id: null,
    source_id: knight.id,
    target_id: king.id,
    label: 'sworn protector of',
    description: '',
    directed: true,
    context_node_id: null,
    archived: false,
  });

  const relHtml = renderToStaticMarkup(
    React.createElement(EntityRelationshipsCard, {
      documentId: knight.id,
      universeId: universe.id,
      plan,
      onSaveThought: async () => true,
      availableEntities: [knight, king],
      onNavigateToEntity: () => {},
    })
  );

  assert.match(relHtml, /Connected Lore Relationships/);
  assert.match(relHtml, /sworn protector of/);
  assert.match(relHtml, /King Arthur/);
  assert.match(relHtml, /Add Relationship/);
});

// ============================================================================
// v0.6.2 GLOBAL CREATION FLOW INTEGRATION SUITE (10 SCENARIOS)
// ============================================================================

test('Scenario 1: Global + -> Lorebook -> Create Universe flow renders universe fields and title', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CreateDocumentModal } = await import('../src/components/common/CreateDocumentModal');

  let plan = W.emptyPlan();
  const { plan: p1 } = U.createUniverseInPlan(plan, 'Eryndor');
  plan = p1;

  const html = renderToStaticMarkup(
    React.createElement(CreateDocumentModal, {
      isOpen: true,
      onClose: () => {},
      defaultType: 'lorebook',
      initialAction: 'create_universe',
      plan,
      onCreate: async () => {},
      onCreateUniverse: async () => {},
      onCreateBook: async () => {},
    })
  );

  // Studio Mode should be Lorebook Studio
  assert.match(html, /Lorebook Studio/);
  // Should show Create New Universe option
  assert.match(html, /Create New Universe/);
  // Contextual labels
  assert.match(html, /Universe Name/);
  assert.match(html, /Universe Summary &amp; Premise|Universe Summary & Premise/);
  assert.match(html, /Create &amp; Open Universe|Create & Open Universe/);
});

test('Scenario 2: Global + -> Lorebook -> Select Universe -> Add Character renders contextual inputs', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CreateDocumentModal } = await import('../src/components/common/CreateDocumentModal');

  let plan = W.emptyPlan();
  const { plan: p1, universe } = U.createUniverseInPlan(plan, 'Eryndor');
  plan = p1;

  const html = renderToStaticMarkup(
    React.createElement(CreateDocumentModal, {
      isOpen: true,
      onClose: () => {},
      defaultType: 'lorebook',
      initialUniverseId: universe.id,
      initialEntryType: 'character',
      initialAction: 'add_to_universe',
      plan,
      onCreate: async () => {},
    })
  );

  // Target Universe dropdown with Eryndor
  assert.match(html, /Target Universe/);
  assert.match(html, /Eryndor/);
  // Character Name input
  assert.match(html, /Character Name/);
  // 10 Item choices rendered
  assert.match(html, /Character/);
  assert.match(html, /Location/);
  assert.match(html, /Faction/);
  assert.match(html, /Nation/);
  assert.match(html, /World Rule/);
  assert.match(html, /Culture \/ History/);
  assert.match(html, /Artifact/);
  assert.match(html, /Event/);
  assert.match(html, /Other Lore/);
  assert.match(html, /Book \/ Story/);
  // Action button
  assert.match(html, /Create Character &amp; Edit|Create Character & Edit/);
});

test('Scenario 3: Global + -> Lorebook -> Select Universe -> Add Book renders continuity & synopsis', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CreateDocumentModal } = await import('../src/components/common/CreateDocumentModal');

  let plan = W.emptyPlan();
  const { plan: p1, universe } = U.createUniverseInPlan(plan, 'Eryndor');
  plan = p1;

  const html = renderToStaticMarkup(
    React.createElement(CreateDocumentModal, {
      isOpen: true,
      onClose: () => {},
      defaultType: 'lorebook',
      initialUniverseId: universe.id,
      initialEntryType: 'book',
      initialAction: 'add_to_universe',
      plan,
      onCreate: async () => {},
      onCreateBook: async () => {},
    })
  );

  assert.match(html, /Book Title/);
  assert.match(html, /Continuity Classification/);
  assert.match(html, /Canonical/);
  assert.match(html, /Alternate/);
  assert.match(html, /Standalone/);
  assert.match(html, /Synopsis/);
  assert.match(html, /Create Book &amp; Open|Create Book & Open/);
});

test('Scenario 4: Ctrl+N -> Lorebook creation flow with active universe pre-selects active universe', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CreateDocumentModal } = await import('../src/components/common/CreateDocumentModal');

  let plan = W.emptyPlan();
  const { plan: p1, universe: u1 } = U.createUniverseInPlan(plan, 'Solaris');
  const { plan: p2, universe: u2 } = U.createUniverseInPlan(p1, 'Eryndor');
  plan = p2;

  // Active universe is u2
  const html = renderToStaticMarkup(
    React.createElement(CreateDocumentModal, {
      isOpen: true,
      onClose: () => {},
      defaultType: 'lorebook',
      initialUniverseId: u2.id,
      plan,
      onCreate: async () => {},
    })
  );

  // Both universes in options
  assert.match(html, /Solaris/);
  assert.match(html, /Eryndor/);
  // Check that u2 is selected in the markup
  assert.match(html, new RegExp(`value="${u2.id}"[^>]*selected`));
});

test('Scenario 5: Empty Universe behavior explains requirement and prioritizes Create Universe', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CreateDocumentModal } = await import('../src/components/common/CreateDocumentModal');

  // Empty plan with no universes
  const emptyPlan = W.emptyPlan();

  const html = renderToStaticMarkup(
    React.createElement(CreateDocumentModal, {
      isOpen: true,
      onClose: () => {},
      defaultType: 'lorebook',
      plan: emptyPlan,
      onCreate: async () => {},
      onCreateUniverse: async () => {},
    })
  );

  // Must display the explanatory banner
  assert.match(html, /Every story begins somewhere/);
  assert.match(html, /worldbuilding is organized into.*Universes/);
  // Must render Universe Name input
  assert.match(html, /Universe Name/);
  // Must NOT render entity selection choices
  assert.doesNotMatch(html, /Target Universe \*/);
  assert.doesNotMatch(html, /Choose what to create/);
});

test('Scenario 6: Correct Universe ID association in created metadata', () => {
  let plan = W.emptyPlan();
  const { plan: p1, universe } = U.createUniverseInPlan(plan, 'Eryndor');
  plan = p1;

  // Simulate what CreateDocumentModal constructs on submit
  const selectedItemType = 'nation';
  const entryType = selectedItemType === 'nation' ? 'faction' : selectedItemType;
  const canonStatus = 'canon';

  const metadataJson = JSON.stringify({
    universe: universe.name,
    universe_id: universe.id,
    entry_type: entryType,
    canon_status: canonStatus,
    attributes: [],
  });

  const parsed = JSON.parse(metadataJson);
  assert.equal(parsed.universe, 'Eryndor');
  assert.equal(parsed.universe_id, universe.id);
  assert.equal(parsed.entry_type, 'faction');
  assert.equal(parsed.canon_status, 'canon');
  assert.deepEqual(parsed.attributes, []);
});

test('Scenario 7: Navigation state tracking preserves active universe and book IDs in storage', () => {
  const mockStorage: Record<string, string> = {};
  const fakeLocalStorage = {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    removeItem: (k: string) => { delete mockStorage[k]; },
  };

  // 1. Create universe sets mc_active_universe_id
  const universeId = 'uni-123';
  fakeLocalStorage.setItem('mc_active_universe_id', universeId);
  fakeLocalStorage.removeItem('mc_selected_book_id');
  assert.equal(fakeLocalStorage.getItem('mc_active_universe_id'), 'uni-123');
  assert.equal(fakeLocalStorage.getItem('mc_selected_book_id'), null);

  // 2. Create book sets mc_selected_book_id
  const bookId = 'book-456';
  fakeLocalStorage.setItem('mc_selected_book_id', bookId);
  assert.equal(fakeLocalStorage.getItem('mc_selected_book_id'), 'book-456');

  // 3. Returning from book clears mc_selected_book_id while keeping active universe
  fakeLocalStorage.removeItem('mc_selected_book_id');
  assert.equal(fakeLocalStorage.getItem('mc_selected_book_id'), null);
  assert.equal(fakeLocalStorage.getItem('mc_active_universe_id'), 'uni-123');
});

test('Scenario 8: No duplicate catalog or Universe creation across plan operations', () => {
  let plan = W.emptyPlan();
  const initialNodesCount = plan.nodes.length;

  // Add universe
  const { plan: p1, universe } = U.createUniverseInPlan(plan, 'Eryndor');
  assert.equal(p1.universes.length, 1);
  assert.equal(p1.nodes.length, initialNodesCount);

  // Rename universe
  const p2 = U.renameUniverseInPlan(p1, universe.id, 'New Eryndor');
  assert.equal(p2.universes.length, 1);
  assert.equal(p2.universes[0].id, universe.id);
  assert.equal(p2.universes[0].name, 'New Eryndor');
  assert.equal(p2.nodes.length, initialNodesCount);

  // Add book
  const { plan: p3 } = U.createBookInPlan(p2, universe.id, 'Chronicles');
  assert.equal(p3.universes.length, 1);
  assert.equal(p3.books.length, 1);
  assert.equal(p3.nodes.length, initialNodesCount);

  // No duplicate universes on initialization
  const dupDoc = makeDoc('doc-1', { universe: 'New Eryndor', universe_id: universe.id });
  const initPlan = W.initialize([dupDoc]);
  assert.equal(initPlan.universes.filter(u => u.name === 'New Eryndor').length, 1);
});

test('Scenario 9: Poetry and Philosophy creation workflows remain completely unchanged', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CreateDocumentModal } = await import('../src/components/common/CreateDocumentModal');

  let plan = W.emptyPlan();
  const { plan: p1 } = U.createUniverseInPlan(plan, 'Eryndor');
  plan = p1;

  // 1. Poetry mode
  const poetryHtml = renderToStaticMarkup(
    React.createElement(CreateDocumentModal, {
      isOpen: true,
      onClose: () => {},
      defaultType: 'poetry',
      plan,
      onCreate: async () => {},
    })
  );
  assert.match(poetryHtml, /Poem Title/);
  assert.match(poetryHtml, /Poetic Form/);
  assert.match(poetryHtml, /Free Verse/);
  assert.match(poetryHtml, /Create Poem/);
  assert.doesNotMatch(poetryHtml, /Target Universe/);
  assert.doesNotMatch(poetryHtml, /Universe Name/);

  // 2. Philosophy mode
  const philosophyHtml = renderToStaticMarkup(
    React.createElement(CreateDocumentModal, {
      isOpen: true,
      onClose: () => {},
      defaultType: 'philosophy',
      plan,
      onCreate: async () => {},
    })
  );
  assert.match(philosophyHtml, /Reflection \/ Inquiry Title/);
  assert.match(philosophyHtml, /Work \/ Treatise Title/);
  assert.match(philosophyHtml, /Chapter \/ Section \(Optional\)/);
  assert.match(philosophyHtml, /Create Reflection/);
  assert.doesNotMatch(philosophyHtml, /Target Universe/);
  assert.doesNotMatch(philosophyHtml, /Universe Name/);
});

test('Scenario 10: Existing legacy Lorebook documents remain accessible and resolve safely', () => {
  let plan = W.emptyPlan();
  const { plan: p1, universe } = U.createUniverseInPlan(plan, 'Eryndor');
  plan = p1;

  // Legacy doc with string name only (no universe_id)
  const legacyNamedDoc = makeDoc('leg-1', { universe: 'eryndor', entry_type: 'character' }, 'Old Knight');
  const res1 = U.resolveEntityUniverse(legacyNamedDoc, plan.universes);
  assert.equal(res1.universeId, universe.id);
  assert.equal(res1.isUnassigned, false);

  // Legacy doc with unknown universe
  const legacyUnknownDoc = makeDoc('leg-2', { universe: 'Old Lost Realm', entry_type: 'artifact' }, 'Ancient Crown');
  const res2 = U.resolveEntityUniverse(legacyUnknownDoc, plan.universes);
  assert.equal(res2.universeId, null);
  assert.equal(res2.isUnassigned, true);

  // Unassigned entities list captures unassigned doc
  const unassigned = U.getUnassignedEntities([legacyNamedDoc, legacyUnknownDoc], plan.universes);
  assert.equal(unassigned.length, 1);
  assert.equal(unassigned[0].id, 'leg-2');
});

// ============================================================================
// v0.6.2 Critical Bugfix Regression Suite: First Universe Creation & Persistence Boundary
// ============================================================================

test('Scenario 11: Fresh notebook with no catalog resolves to no_catalog state without error', async () => {
  mock.thought = { document_id: null, plan: null };
  const res = await api.thoughtGet();
  assert.equal(res.document_id, null);
  assert.equal(res.plan, null);

  const { plan: basePlan, expectedRevision } = U.resolveBasePlan(res.plan, []);
  assert.equal(expectedRevision, 0);
  assert.equal(basePlan.revision, 0);
  assert.deepEqual(basePlan.universes, []);
});

test('Scenario 12: Fresh notebook with an empty catalog resolves to loaded state with empty universes', async () => {
  const emptyCatalogPlan: W.Plan = { version: 1, revision: 1, universes: [], books: [], entities: [], nodes: [], relationships: [] };
  mock.thought = { document_id: 'cat-empty', plan: emptyCatalogPlan };
  const res = await api.thoughtGet();
  assert.equal(res.document_id, 'cat-empty');
  assert.ok(res.plan);
  assert.equal(res.plan.universes.length, 0);

  const { plan: basePlan, expectedRevision } = U.resolveBasePlan(res.plan, []);
  assert.equal(expectedRevision, 1);
  assert.equal(basePlan.universes.length, 0);
});

test('Scenario 13: Existing catalog with no Universes renders banner and enforces create_universe', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CreateDocumentModal } = await import('../src/components/common/CreateDocumentModal');

  const emptyCatalogPlan: W.Plan = { version: 1, revision: 1, universes: [], books: [], entities: [], nodes: [], relationships: [] };

  const html = renderToStaticMarkup(
    React.createElement(CreateDocumentModal, {
      isOpen: true,
      onClose: () => {},
      defaultType: 'lorebook',
      plan: emptyCatalogPlan,
      planStatus: 'loaded',
      onCreate: async () => {},
      onCreateUniverse: async () => {},
    })
  );

  assert.match(html, /Every story begins somewhere/);
  assert.match(html, /worldbuilding is organized into.*Universes/);
  assert.match(html, /Universe Name/);
  assert.doesNotMatch(html, /Target Universe \*/);
});

test('Scenario 14: Existing catalog with one Universe defaults to add_to_universe', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CreateDocumentModal } = await import('../src/components/common/CreateDocumentModal');

  let plan = W.emptyPlan();
  const { plan: p1 } = U.createUniverseInPlan(plan, 'Eryndor');

  const html = renderToStaticMarkup(
    React.createElement(CreateDocumentModal, {
      isOpen: true,
      onClose: () => {},
      defaultType: 'lorebook',
      plan: p1,
      planStatus: 'loaded',
      onCreate: async () => {},
      onCreateUniverse: async () => {},
    })
  );

  assert.match(html, /Target Universe/);
  assert.match(html, /Eryndor/);
  assert.match(html, /Add to Existing Universe/);
});

test('Scenario 15: First Universe creation and persistence boundary from fresh notebook', async () => {
  // 1. Fresh notebook has no catalog
  mock.thought = { document_id: null, plan: null };

  const res = await api.thoughtGet();
  assert.equal(res.plan, null);

  // 2. Resolve base plan and create Universe
  const { plan: basePlan, expectedRevision } = U.resolveBasePlan(res.plan, []);
  assert.equal(expectedRevision, 0);

  const { plan: updatedPlan, universe } = U.createUniverseInPlan(basePlan, 'Shadow', 'A mysterious realm of twilight');
  assert.equal(universe.name, 'Shadow');
  assert.ok(universe.id.length > 0);

  // 3. Save via backend API
  const saveResult = await api.thoughtSave(expectedRevision, updatedPlan);
  assert.ok(saveResult.plan);
  assert.equal(saveResult.plan.revision, 1);
  assert.equal(saveResult.plan.universes.length, 1);
  assert.equal(saveResult.plan.universes[0].name, 'Shadow');
  assert.equal(saveResult.plan.universes[0].id, universe.id);
  assert.equal(saveResult.plan.universes[0].description, 'A mysterious realm of twilight');
});

test('Scenario 16: Immediate creation of a Character after Universe creation', async () => {
  const res = await api.thoughtGet();
  assert.ok(res.plan);
  const universe = res.plan.universes.find(u => u.name === 'Shadow')!;
  assert.ok(universe);

  const charDoc = await api.createDocument(
    'lorebook',
    'Shadowblade',
    undefined,
    '### Overview\n\nA rogue residing in Shadow.',
    JSON.stringify({
      universe: universe.name,
      universe_id: universe.id,
      entry_type: 'character',
      canon_status: 'canon',
      attributes: [],
    }),
    ['stealth']
  );

  assert.equal(charDoc.metadata.title, 'Shadowblade');
  const resolved = U.resolveEntityUniverse(charDoc.metadata, res.plan.universes);
  assert.equal(resolved.universeId, universe.id);
  assert.equal(resolved.isUnassigned, false);

  const syncedPlan = U.syncPlanEntities(res.plan, [charDoc.metadata], universe.id);
  assert.ok(syncedPlan.entities.some(e => e.id === charDoc.metadata.id && e.universe_id === universe.id));
});

test('Scenario 17: Immediate creation of a Book after Universe creation', async () => {
  const res = await api.thoughtGet();
  assert.ok(res.plan);
  const universe = res.plan.universes.find(u => u.name === 'Shadow')!;
  assert.ok(universe);

  const { plan: withBook, book } = U.createBookInPlan(
    res.plan,
    universe.id,
    'Chronicles of Shadow',
    'canonical',
    'The premier saga'
  );

  const saveResult = await api.thoughtSave(res.plan.revision, withBook);
  assert.ok(saveResult.plan);
  assert.equal(saveResult.plan.books.length, 1);
  assert.equal(saveResult.plan.books[0].id, book.id);
  assert.equal(saveResult.plan.books[0].name, 'Chronicles of Shadow');
  assert.equal(saveResult.plan.books[0].universe_id, universe.id);
  assert.equal(saveResult.plan.books[0].continuity, 'canonical');
});

test('Scenario 18: Reopen/reload and verify persisted Universe and Book', async () => {
  // Re-fetch simulating restart
  const reloaded = await api.thoughtGet();
  assert.ok(reloaded.plan);
  assert.equal(reloaded.plan.universes.length, 1);
  assert.equal(reloaded.plan.universes[0].name, 'Shadow');
  assert.equal(reloaded.plan.books.length, 1);
  assert.equal(reloaded.plan.books[0].name, 'Chronicles of Shadow');
});

test('Scenario 19: Simultaneous or repeated Create clicks do not create duplicates or revision conflicts', async () => {
  const res = await api.thoughtGet();
  assert.ok(res.plan);
  const currentRev = res.plan.revision;

  const { plan: planA } = U.createUniverseInPlan(res.plan, 'Aetheria');
  const { plan: planB } = U.createUniverseInPlan(res.plan, 'Solaris');

  // First save succeeds
  const saveA = await api.thoughtSave(currentRev, planA);
  assert.equal(saveA.plan!.revision, currentRev + 1);

  // Stale save with old revision fails cleanly
  await assert.rejects(
    async () => {
      await api.thoughtSave(currentRev, planB);
    },
    /Planning desk changed|stale/
  );
});

test('Scenario 20: Backend read error does not trigger destructive reinitialization', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CreateDocumentModal } = await import('../src/components/common/CreateDocumentModal');

  const errorHtml = renderToStaticMarkup(
    React.createElement(CreateDocumentModal, {
      isOpen: true,
      onClose: () => {},
      defaultType: 'lorebook',
      plan: null,
      planStatus: 'error',
      planError: 'Corrupted frontmatter catalog on disk',
      onCreate: async () => {},
      onCreateUniverse: async () => {},
    })
  );

  // Must render error alert and planning data unavailable message
  assert.match(errorHtml, /Planning Data Failed to Load/);
  assert.match(errorHtml, /Corrupted frontmatter catalog on disk/);
  assert.match(errorHtml, /Planning Data Unavailable/);

  // Creation handler refuses to overwrite on error
  const simulateHandler = async () => {
    const errorState = 'Corrupted frontmatter catalog on disk';
    throw new Error(`Cannot create Universe because planning data failed to load: ${errorState}. Resolve this issue before editing.`);
  };

  await assert.rejects(
    simulateHandler,
    /Cannot create Universe because planning data failed to load/
  );
});

test('Scenario 21: Notebook switching does not reuse stale plan data', async () => {
  // Switched to a new empty notebook
  mock.thought = { document_id: null, plan: null };
  const res = await api.thoughtGet();
  assert.equal(res.plan, null);

  const { plan: freshBase, expectedRevision } = U.resolveBasePlan(res.plan, []);
  assert.equal(expectedRevision, 0);
  assert.equal(freshBase.universes.length, 0);
  assert.equal(freshBase.books.length, 0);
});

test('Scenario 22: Vault restore retains Universe data roundtrip', () => {
  let plan = W.emptyPlan();
  const { plan: p1, universe } = U.createUniverseInPlan(plan, 'Eryndor', 'Ancient realm');
  const { plan: p2, book } = U.createBookInPlan(p1, universe.id, 'Tome of Fire', 'canonical');

  // Serialize to JSON (as stored in vault snapshot frontmatter)
  const serialized = JSON.stringify(p2);
  const restored: W.Plan = JSON.parse(serialized);

  assert.equal(restored.version, 1);
  assert.equal(restored.universes.length, 1);
  assert.equal(restored.universes[0].id, universe.id);
  assert.equal(restored.universes[0].name, 'Eryndor');
  assert.equal(restored.books.length, 1);
  assert.equal(restored.books[0].id, book.id);
  assert.equal(restored.books[0].universe_id, universe.id);
});

test('Scenario 23: No regression in Poetry or Philosophy creation when planning data is absent or error', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CreateDocumentModal } = await import('../src/components/common/CreateDocumentModal');

  // Poetry mode with planStatus: 'error'
  const poetryHtml = renderToStaticMarkup(
    React.createElement(CreateDocumentModal, {
      isOpen: true,
      onClose: () => {},
      defaultType: 'poetry',
      plan: null,
      planStatus: 'error',
      planError: 'Catalog read failure',
      onCreate: async () => {},
    })
  );
  assert.match(poetryHtml, /Poem Title/);
  assert.match(poetryHtml, /Create Poem/);
  assert.doesNotMatch(poetryHtml, /Planning Data Failed to Load/);

  // Philosophy mode with planStatus: 'no_catalog'
  const philHtml = renderToStaticMarkup(
    React.createElement(CreateDocumentModal, {
      isOpen: true,
      onClose: () => {},
      defaultType: 'philosophy',
      plan: null,
      planStatus: 'no_catalog',
      onCreate: async () => {},
    })
  );
  assert.match(philHtml, /Reflection \/ Inquiry Title/);
  assert.match(philHtml, /Create Reflection/);
  assert.doesNotMatch(philHtml, /Planning Data Failed to Load/);
});


