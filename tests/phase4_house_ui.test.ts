import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockStorage } from '../src/services/api';
import { CommandQueue, SaveCoordinator, coordinateDocumentMove, coordinateUniverseMove } from '../src/services/autosave';
import { isStudioEnabled, isManuscriptEnabled, getHouseColorTheme, getHouseIconComponent, computeStudioCounts, isCatalogDoc } from '../src/utils/house';
import type { DocumentDetail, DocumentMetadata, HouseRecord } from '../src/types';

describe('Phase 4: House of Thoughts UI & Navigation', () => {
  it('1. House registry initialization, active house resolution, and fallback', async () => {
    const mock = new MockStorage();

    const houses = await mock.listHouses();
    assert.ok(houses.length >= 1, 'Default house should exist');
    const defaultHouse = houses.find(h => h.id === 'house-default');
    assert.ok(defaultHouse, 'house-default must be present in registry');
    assert.strictEqual(defaultHouse.archived, false);
    assert.ok(defaultHouse.enabled_studios.includes('poetry'));
    assert.ok(defaultHouse.enabled_studios.includes('philosophy'));
    assert.ok(defaultHouse.enabled_studios.includes('lorebook'));
    assert.strictEqual(defaultHouse.manuscript_tools_enabled, true);

    // Active house resolution logic
    const resolveActiveHouse = (activeId: string, houseList: HouseRecord[]) => {
      return houseList.find(h => h.id === activeId && !h.archived)
        || houseList.find(h => h.id === 'house-default')
        || (houseList.length > 0 ? houseList[0] : null);
    };

    // Resolves default when matching
    const active1 = resolveActiveHouse('house-default', houses);
    assert.strictEqual(active1?.id, 'house-default');

    // Resolves default when nonexistent id given
    const active2 = resolveActiveHouse('house-nonexistent', houses);
    assert.strictEqual(active2?.id, 'house-default');
  });

  it('2. House management: Create, update, archive protection, restore', async () => {
    const mock = new MockStorage();

    // Create custom house
    const created = await mock.createHouse({
      name: 'House of Logic',
      description: 'Formal epistemology & philosophy workspace',
      enabled_studios: ['philosophy'],
      manuscript_tools_enabled: false,
      color: 'indigo',
      icon: 'compass',
    });

    assert.ok(created.id.startsWith('house-'));
    assert.strictEqual(created.name, 'House of Logic');
    assert.deepStrictEqual(created.enabled_studios, ['philosophy']);
    assert.strictEqual(created.manuscript_tools_enabled, false);
    assert.strictEqual(created.color, 'indigo');
    assert.strictEqual(created.icon, 'compass');
    assert.strictEqual(created.archived, false);

    // Update house (takes UpdateHouseInput object)
    const updated = await mock.updateHouse({
      id: created.id,
      name: 'House of Rigorous Logic',
      manuscript_tools_enabled: true,
    });
    assert.strictEqual(updated.name, 'House of Rigorous Logic');
    assert.strictEqual(updated.manuscript_tools_enabled, true);

    // Default house cannot be archived
    await assert.rejects(
      async () => {
        await mock.archiveHouse('house-default');
      },
      /Default House cannot be archived/i
    );

    // Archive custom house
    const archived = await mock.archiveHouse(created.id);
    assert.strictEqual(archived.archived, true);

    // Active resolution falls back to house-default when active house is archived
    const houseList = await mock.listHouses();
    const resolveActive = (activeId: string) => {
      return houseList.find(h => h.id === activeId && !h.archived)
        || houseList.find(h => h.id === 'house-default');
    };
    assert.strictEqual(resolveActive(created.id)?.id, 'house-default');

    // Restore custom house
    const restored = await mock.restoreHouse(created.id);
    assert.strictEqual(restored.archived, false);
    const houseListAfterRestore = await mock.listHouses();
    const resolveAfterRestore = (activeId: string) => {
      return houseListAfterRestore.find(h => h.id === activeId && !h.archived)
        || houseListAfterRestore.find(h => h.id === 'house-default');
    };
    assert.strictEqual(resolveAfterRestore(created.id)?.id, created.id);
  });

  it('3. Studio and Manuscript Tool enablement helpers', async () => {
    const houseMinimal: HouseRecord = {
      id: 'house-minimal',
      name: 'Poetry Only',
      enabled_studios: ['poetry'],
      manuscript_tools_enabled: false,
      universe_ids: [],
      archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    assert.strictEqual(isStudioEnabled(houseMinimal, 'poetry'), true);
    assert.strictEqual(isStudioEnabled(houseMinimal, 'philosophy'), false);
    assert.strictEqual(isStudioEnabled(houseMinimal, 'lorebook'), false);
    assert.strictEqual(isManuscriptEnabled(houseMinimal), false);

    const houseFull: HouseRecord = {
      id: 'house-full',
      name: 'Full Studio House',
      enabled_studios: ['poetry', 'philosophy', 'lorebook'],
      manuscript_tools_enabled: true,
      universe_ids: [],
      archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    assert.strictEqual(isStudioEnabled(houseFull, 'poetry'), true);
    assert.strictEqual(isStudioEnabled(houseFull, 'philosophy'), true);
    assert.strictEqual(isStudioEnabled(houseFull, 'lorebook'), true);
    assert.strictEqual(isManuscriptEnabled(houseFull), true);
  });

  it('4. House Library scoping: documents filtered by active house without cross-house contamination', async () => {
    const mock = new MockStorage();

    const houseA = await mock.createHouse({
      name: 'House Alpha',
      enabled_studios: ['poetry', 'philosophy'],
      manuscript_tools_enabled: true,
    });

    const houseB = await mock.createHouse({
      name: 'House Beta',
      enabled_studios: ['poetry'],
      manuscript_tools_enabled: false,
    });

    // Create documents in each house
    const docA1 = await mock.createDocument('poetry', 'Alpha Poem 1', undefined, undefined, undefined, undefined, houseA.id);
    const docA2 = await mock.createDocument('philosophy', 'Alpha Essay', undefined, undefined, undefined, undefined, houseA.id);
    const docB1 = await mock.createDocument('poetry', 'Beta Sonnet', undefined, undefined, undefined, undefined, houseB.id);
    const docDef = await mock.createDocument('poetry', 'Default Piece', undefined, undefined, undefined, undefined, 'house-default');

    const allDocs = await mock.listDocuments();

    // Filtering helper used by App layout:
    const getHouseDocuments = (docs: DocumentMetadata[], activeHouseId: string) => {
      return docs.filter(d => (d.house_id || 'house-default') === activeHouseId);
    };

    const alphaDocs = getHouseDocuments(allDocs, houseA.id);
    assert.strictEqual(alphaDocs.length, 2);
    assert.ok(alphaDocs.some(d => d.id === docA1.metadata.id));
    assert.ok(alphaDocs.some(d => d.id === docA2.metadata.id));
    assert.ok(!alphaDocs.some(d => d.id === docB1.metadata.id), 'House Beta doc must not appear in House Alpha');
    assert.ok(!alphaDocs.some(d => d.id === docDef.metadata.id), 'Default doc must not appear in House Alpha');

    const betaDocs = getHouseDocuments(allDocs, houseB.id);
    assert.strictEqual(betaDocs.length, 1);
    assert.strictEqual(betaDocs[0].id, docB1.metadata.id);

    const defDocs = getHouseDocuments(allDocs, 'house-default');
    assert.ok(defDocs.some(d => d.id === docDef.metadata.id));
    assert.ok(!defDocs.some(d => d.id === docA1.metadata.id));
  });

  it('5. Safe House switching: flushes active edits, blocks switch on save error', async () => {
    let mockSaveCalled = false;
    let shouldSaveFail = false;

    const fakeFlushSave = async (): Promise<boolean> => {
      mockSaveCalled = true;
      if (shouldSaveFail) return false;
      return true;
    };

    let activeHouseId = 'house-default';
    const queue = new CommandQueue();

    const switchHouseSafe = async (targetId: string, flush: () => Promise<boolean>) => {
      const saved = await flush();
      if (!saved) {
        throw new Error('Switch Blocked: Unsaved changes could not be saved.');
      }
      await queue.waitForIdle();
      activeHouseId = targetId;
      return activeHouseId;
    };

    // 1. Successful switch flushes edits
    mockSaveCalled = false;
    shouldSaveFail = false;
    const switched = await switchHouseSafe('house-sol', fakeFlushSave);
    assert.strictEqual(mockSaveCalled, true);
    assert.strictEqual(switched, 'house-sol');
    assert.strictEqual(activeHouseId, 'house-sol');

    // 2. Failed save blocks switch
    mockSaveCalled = false;
    shouldSaveFail = true;
    await assert.rejects(
      async () => {
        await switchHouseSafe('house-luna', fakeFlushSave);
      },
      /Switch Blocked/
    );
    assert.strictEqual(mockSaveCalled, true);
    assert.strictEqual(activeHouseId, 'house-sol', 'Active house must remain unchanged when save fails');
  });

  it('6. Coordinated single-document move with destination eligibility validation', async () => {
    const mock = new MockStorage();

    const housePoetry = await mock.createHouse({
      name: 'House Verse',
      enabled_studios: ['poetry'],
      manuscript_tools_enabled: false,
    });

    const housePhilosophy = await mock.createHouse({
      name: 'House Thought',
      enabled_studios: ['philosophy'],
      manuscript_tools_enabled: false,
    });

    // Create poetry document in House Verse
    const poem = await mock.createDocument('poetry', 'Ode to the Stars', undefined, undefined, undefined, undefined, housePoetry.id);
    assert.strictEqual(poem.metadata.house_id, housePoetry.id);

    // Moving poem to House Thought should fail because House Thought does not enable poetry studio
    await assert.rejects(
      async () => {
        await mock.moveDocumentToHouse(poem.metadata.id, housePhilosophy.id);
      },
      /disabled for House 'House Thought'/
    );

    // Create House Full that enables poetry
    const houseFull = await mock.createHouse({
      name: 'House Library',
      enabled_studios: ['poetry', 'philosophy'],
      manuscript_tools_enabled: true,
    });

    // Coordinated move to House Full
    const commandQueue = new CommandQueue();
    let flushCalled = false;

    const moved = await coordinateDocumentMove(
      async () => {
        flushCalled = true;
        return true;
      },
      commandQueue,
      () => mock.moveDocumentToHouse(poem.metadata.id, houseFull.id)
    );

    assert.strictEqual(flushCalled, true);
    assert.strictEqual(moved.id, poem.metadata.id);
    assert.strictEqual(moved.house_id, houseFull.id);

    // Verify persisted metadata in mock
    const retrieved = await mock.getDocument(poem.metadata.id);
    assert.strictEqual(retrieved.metadata.house_id, houseFull.id);
  });

  it('7. Universe-bound Lorebook entity guardrail prevents partial entity drift', async () => {
    // Universe-bound Lorebook entity metadata
    const entityMetadataJson = JSON.stringify({
      universe_id: 'universe-sol',
      universe: 'Solaris Universe',
      category: 'characters',
      entry_type: 'character',
    });

    const isUniverseBound = (metaJson?: string): boolean => {
      if (!metaJson) return false;
      try {
        const parsed = JSON.parse(metaJson);
        return Boolean(parsed.universe_id || parsed.universe);
      } catch {
        return false;
      }
    };

    assert.strictEqual(isUniverseBound(entityMetadataJson), true);

    // Guardrail rule: individual move modal blocks bound entities
    const validateCanMoveDocumentIndividually = (docType: string, metaJson?: string) => {
      if (docType === 'lorebook' && isUniverseBound(metaJson)) {
        throw new Error('This document belongs to a Lorebook Universe. Move the entire Universe to transfer all associated entities and story nodes together.');
      }
      return true;
    };

    assert.throws(
      () => validateCanMoveDocumentIndividually('lorebook', entityMetadataJson),
      /Move the entire Universe to transfer all associated entities/
    );

    // Non-lorebook or unassigned lorebook documents can move individually
    assert.strictEqual(validateCanMoveDocumentIndividually('poetry', undefined), true);
    assert.strictEqual(validateCanMoveDocumentIndividually('philosophy', '{}'), true);
    assert.strictEqual(validateCanMoveDocumentIndividually('lorebook', JSON.stringify({ category: 'characters' })), true);
  });

  it('8. Coordinated Lorebook Universe move transfers all owned writing and entities', async () => {
    const mock = new MockStorage();

    const houseSource = await mock.createHouse({
      name: 'House Alpha Lore',
      enabled_studios: ['lorebook', 'poetry'],
      manuscript_tools_enabled: true,
    });

    const houseDest = await mock.createHouse({
      name: 'House Dest Lore',
      enabled_studios: ['lorebook', 'poetry'],
      manuscript_tools_enabled: true,
    });

    const uId = 'uni-eldoria';
    mock.thought = {
      document_id: 'doc-wot',
      plan: {
        version: 1,
        revision: 1,
        universes: [
          {
            id: uId,
            name: 'Eldoria',
            archived: false,
          },
        ],
        books: [
          {
            id: 'book-eldoria',
            universe_id: uId,
            name: 'Eldoria Chronicles',
            continuity: 'canonical',
          },
        ],
        entities: [],
        relationships: [],
        nodes: [],
      },
    };

    mock.houses.find(h => h.id === houseSource.id)!.universe_ids.push(uId);

    // Create entities belonging to this universe
    const entityDoc = await mock.createDocument(
      'lorebook',
      'King Alden',
      undefined,
      'The ruler of Eldoria',
      JSON.stringify({ universe_id: uId, universe: 'Eldoria', category: 'characters', entry_type: 'character' }),
      ['royalty'],
      houseSource.id
    );

    const commandQueue = new CommandQueue();
    let flushCalled = false;

    // Coordinated universe move
    const moveResult = await coordinateUniverseMove(
      async () => {
        flushCalled = true;
        return true;
      },
      commandQueue,
      () => mock.moveUniverseToHouse(uId, houseDest.id)
    );

    assert.strictEqual(flushCalled, true);
    assert.strictEqual(moveResult.universe_id, uId);
    assert.strictEqual(moveResult.target_house_id, houseDest.id);

    // Check entity document house ownership is updated
    const updatedEntity = await mock.getDocument(entityDoc.metadata.id);
    assert.strictEqual(updatedEntity.metadata.house_id, houseDest.id);

    // Check destination house now lists this universe
    const destHouse = (await mock.listHouses()).find(h => h.id === houseDest.id);
    assert.ok(destHouse?.universe_ids.includes(uId));
  });

  it('9. House Search Scoping: House vs Global search & cross-house attribution', async () => {
    const mock = new MockStorage();

    const houseA = await mock.createHouse({
      name: 'Sanctuary of Letters',
      enabled_studios: ['poetry'],
      manuscript_tools_enabled: false,
    });

    const houseB = await mock.createHouse({
      name: 'Athenaeum of Reason',
      enabled_studios: ['philosophy'],
      manuscript_tools_enabled: false,
    });

    await mock.createDocument('poetry', 'Silver Moonlight', undefined, 'Gleaming upon the lake', undefined, undefined, houseA.id);
    await mock.createDocument('philosophy', 'Silver Reflections on Dualism', undefined, 'An argument concerning body and mind', undefined, undefined, houseB.id);

    // Global search query
    const globalResults = await mock.searchDocuments('Silver');
    assert.strictEqual(globalResults.length, 2);

    // House-scoped search query
    const houseAResults = await mock.searchDocuments('Silver', undefined, houseA.id);
    assert.strictEqual(houseAResults.length, 1);
    assert.strictEqual(houseAResults[0].title, 'Silver Moonlight');

    const houseBResults = await mock.searchDocuments('Silver', undefined, houseB.id);
    assert.strictEqual(houseBResults.length, 1);
    assert.strictEqual(houseBResults[0].title, 'Silver Reflections on Dualism');
  });

  it('10. House Integrity Diagnostics', async () => {
    const mock = new MockStorage();

    const report = await mock.inspectHouseIntegrity();
    assert.strictEqual(typeof report.total_documents_scanned, 'number');
    assert.ok(Array.isArray(report.issues));
    assert.strictEqual(typeof report.orphaned_document_count, 'number');
  });

  it('11. Studio document counts isolation and catalog exclusion', () => {
    // Sample documents representing a multi-house workspace
    const docs: DocumentMetadata[] = [
      {
        id: 'doc-p1',
        title: 'Poem One',
        doc_type: 'poetry',
        house_id: 'house-alpha',
        tags: [],
        word_count: 50,
        reading_time: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'doc-ph1',
        title: 'Philosophy One',
        doc_type: 'philosophy',
        house_id: 'house-beta', // in Beta, NOT in Alpha!
        tags: [],
        word_count: 200,
        reading_time: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'doc-l1',
        title: 'Lore Entity',
        doc_type: 'lorebook',
        house_id: 'house-alpha',
        tags: [],
        word_count: 100,
        reading_time: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '_web_of_thought',
        title: '_web_of_thought',
        doc_type: 'lorebook',
        house_id: 'house-alpha',
        tags: [],
        metadata_json: JSON.stringify({ _web_of_thought: { version: '1.0.0' } }),
        word_count: 500,
        reading_time: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'doc-m1',
        title: 'Alpha Manuscript',
        doc_type: 'manuscript',
        house_id: 'house-alpha',
        tags: [],
        word_count: 350,
        reading_time: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'doc-legacy',
        title: 'Legacy Thought',
        doc_type: 'philosophy',
        // missing house_id -> implicitly house-default
        tags: [],
        word_count: 150,
        reading_time: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    // Filter for House Alpha
    const alphaDocs = docs.filter(d => (d.house_id || 'house-default') === 'house-alpha');
    const alphaCounts = computeStudioCounts(alphaDocs);

    // Alpha has 1 poem, 0 philosophy, 1 lorebook (catalog excluded), 1 manuscript, total 3
    assert.strictEqual(alphaCounts.poetry, 1);
    assert.strictEqual(alphaCounts.philosophy, 0, 'House Alpha must have exactly 0 philosophy documents');
    assert.strictEqual(alphaCounts.lorebook, 1, 'Web of Thought catalog must be excluded from lorebook count');
    assert.strictEqual(alphaCounts.manuscript, 1);
    assert.strictEqual(alphaCounts.all, 3, 'All count must exclude the catalog document (1 poem + 1 lore + 1 manuscript)');

    // Filter for House Beta
    const betaDocs = docs.filter(d => (d.house_id || 'house-default') === 'house-beta');
    const betaCounts = computeStudioCounts(betaDocs);

    assert.strictEqual(betaCounts.poetry, 0);
    assert.strictEqual(betaCounts.philosophy, 1);
    assert.strictEqual(betaCounts.lorebook, 0);
    assert.strictEqual(betaCounts.manuscript, 0);
    assert.strictEqual(betaCounts.all, 1);

    // Filter for house-default
    const defaultDocs = docs.filter(d => (d.house_id || 'house-default') === 'house-default');
    const defaultCounts = computeStudioCounts(defaultDocs);

    assert.strictEqual(defaultCounts.philosophy, 1, 'Legacy document resolves to house-default');
    assert.strictEqual(defaultCounts.all, 1);
  });

  it('12. Studio counts lifecycle: document creation, movement across houses, and deletion', async () => {
    const mock = new MockStorage();

    const houseAlpha = await mock.createHouse({
      name: 'House Alpha',
      enabled_studios: ['poetry', 'philosophy'],
      manuscript_tools_enabled: false,
    });

    const houseBeta = await mock.createHouse({
      name: 'House Beta',
      enabled_studios: ['poetry', 'philosophy'],
      manuscript_tools_enabled: false,
    });

    const getHouseCounts = async (houseId: string) => {
      const allDocs = await mock.listDocuments();
      const houseDocs = allDocs.filter(d => (d.house_id || 'house-default') === houseId);
      return computeStudioCounts(houseDocs);
    };

    // Initially both houses have 0 documents
    let alphaCounts = await getHouseCounts(houseAlpha.id);
    let betaCounts = await getHouseCounts(houseBeta.id);
    assert.strictEqual(alphaCounts.all, 0);
    assert.strictEqual(alphaCounts.poetry, 0);
    assert.strictEqual(betaCounts.all, 0);
    assert.strictEqual(betaCounts.philosophy, 0);

    // Create a poem in Alpha
    const poem = await mock.createDocument('poetry', 'Alpha Sonnet', undefined, 'Words flow', undefined, undefined, houseAlpha.id);
    alphaCounts = await getHouseCounts(houseAlpha.id);
    betaCounts = await getHouseCounts(houseBeta.id);
    assert.strictEqual(alphaCounts.poetry, 1);
    assert.strictEqual(alphaCounts.all, 1);
    assert.strictEqual(betaCounts.poetry, 0, 'House Beta poetry count must remain 0');

    // Create a philosophy doc in Beta
    const phil = await mock.createDocument('philosophy', 'Beta Dialectic', undefined, 'Premises and conclusions', undefined, undefined, houseBeta.id);
    alphaCounts = await getHouseCounts(houseAlpha.id);
    betaCounts = await getHouseCounts(houseBeta.id);
    assert.strictEqual(alphaCounts.philosophy, 0, 'House Alpha philosophy count must remain 0');
    assert.strictEqual(betaCounts.philosophy, 1);
    assert.strictEqual(betaCounts.all, 1);

    // Move the poem from Alpha to Beta
    await mock.moveDocumentToHouse(poem.metadata.id, houseBeta.id);
    alphaCounts = await getHouseCounts(houseAlpha.id);
    betaCounts = await getHouseCounts(houseBeta.id);
    assert.strictEqual(alphaCounts.poetry, 0, 'Poetry count in Alpha drops to 0 after move');
    assert.strictEqual(alphaCounts.all, 0);
    assert.strictEqual(betaCounts.poetry, 1, 'Poetry count in Beta increases to 1 after move');
    assert.strictEqual(betaCounts.philosophy, 1);
    assert.strictEqual(betaCounts.all, 2);

    // Archive the philosophy document in Beta
    await mock.deleteDocument(phil.metadata.id);
    betaCounts = await getHouseCounts(houseBeta.id);
    assert.strictEqual(betaCounts.philosophy, 0, 'Philosophy count drops to 0 after archive');
    assert.strictEqual(betaCounts.poetry, 1);
    assert.strictEqual(betaCounts.all, 1);
  });

  it('13. Manuscript Tools as optional House-level tool and enablement policy', async () => {
    const mock = new MockStorage();

    const houseDisabled = await mock.createHouse({
      name: 'Pure Lyric House',
      enabled_studios: ['poetry'],
      manuscript_tools_enabled: false,
    });

    const houseEnabled = await mock.createHouse({
      name: 'Opus House',
      enabled_studios: ['poetry', 'philosophy'],
      manuscript_tools_enabled: true,
    });

    assert.strictEqual(isManuscriptEnabled(houseDisabled), false);
    assert.strictEqual(isManuscriptEnabled(houseEnabled), true);

    // Create manuscript document in houseEnabled
    const msDoc = await mock.createDocument('manuscript', 'Book of Fragments', undefined, 'Unified collection', undefined, undefined, houseEnabled.id);
    assert.strictEqual(msDoc.metadata.house_id, houseEnabled.id);

    const allDocs = await mock.listDocuments();
    const enabledDocs = allDocs.filter(d => (d.house_id || 'house-default') === houseEnabled.id);
    const enabledCounts = computeStudioCounts(enabledDocs);
    assert.strictEqual(enabledCounts.manuscript, 1);

    const disabledDocs = allDocs.filter(d => (d.house_id || 'house-default') === houseDisabled.id);
    const disabledCounts = computeStudioCounts(disabledDocs);
    assert.strictEqual(disabledCounts.manuscript, 0);
  });

  it('14. Document selection and category switching isolation prevents cross-house leak', async () => {
    const mock = new MockStorage();

    const houseA = await mock.createHouse({
      name: 'House A (Poetry Only)',
      enabled_studios: ['poetry'],
      manuscript_tools_enabled: false,
    });

    const houseB = await mock.createHouse({
      name: 'House B (Philosophy & Poetry)',
      enabled_studios: ['poetry', 'philosophy'],
      manuscript_tools_enabled: false,
    });

    // Create poetry doc in House A
    const poemA = await mock.createDocument('poetry', 'House A Rhyme', undefined, 'Stanzas', undefined, undefined, houseA.id);
    // Create philosophy doc in House B
    const philB = await mock.createDocument('philosophy', 'House B Ethics', undefined, 'Virtue', undefined, undefined, houseB.id);

    const allDocs = await mock.listDocuments();

    // Simulate switching category to 'philosophy' while active house is House A:
    const houseADocs = allDocs.filter(d => (d.house_id || 'house-default') === houseA.id);
    const matchingInHouseA = houseADocs.find(d => d.doc_type === 'philosophy' && !isCatalogDoc(d));
    assert.strictEqual(matchingInHouseA, undefined, 'There should be no matching philosophy doc in House A');

    // Simulate auto-open on loadLibrary when active house is House A
    const curHouseId = houseA.id;
    const houseDocsToOpen = allDocs.filter(d => (d.house_id || 'house-default') === curHouseId && !isCatalogDoc(d));
    assert.strictEqual(houseDocsToOpen.length, 1);
    assert.strictEqual(houseDocsToOpen[0].id, poemA.metadata.id, 'Should auto-open House A document, never House B document');

    // If active house had 0 documents, openFirst sets activeDoc to null without opening foreign docs
    const emptyHouse = await mock.createHouse({
      name: 'Empty House',
      enabled_studios: ['poetry'],
      manuscript_tools_enabled: false,
    });
    const emptyHouseDocs = allDocs.filter(d => (d.house_id || 'house-default') === emptyHouse.id && !isCatalogDoc(d));
    assert.strictEqual(emptyHouseDocs.length, 0);
  });
});
