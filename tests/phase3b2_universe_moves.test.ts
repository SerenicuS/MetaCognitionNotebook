import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockStorage } from '../src/services/api';
import { CommandQueue, coordinateUniverseMove } from '../src/services/autosave';
import { reconcileDocumentMetadata } from '../src/utils/organization';
import type { DocumentDetail } from '../src/types';

describe('Phase 3B-2: Coordinated Lorebook Universe Moves', () => {
  it('successfully moves a universe and all owned entity documents across houses', async () => {
    const mock = new MockStorage();

    const houseA = await mock.createHouse({
      name: 'House A',
      enabled_studios: ['lorebook', 'poetry'],
      manuscript_tools_enabled: true,
    });

    const houseB = await mock.createHouse({
      name: 'House B',
      enabled_studios: ['lorebook'],
      manuscript_tools_enabled: true,
    });

    // Set up Web of Thought with universe uni-valenrift
    mock.thought = {
      document_id: 'doc-wot',
      plan: {
        version: 1,
        revision: 1,
        universes: [
          {
            id: 'uni-valenrift',
            name: 'Valenrift Cosmos',
            archived: false,
          },
          {
            id: 'uni-other',
            name: 'Other Cosmos',
            archived: false,
          },
        ],
        books: [
          {
            id: 'book-spire',
            universe_id: 'uni-valenrift',
            name: 'Spire Chronicles',
            continuity: 'canonical',
          },
        ],
        entities: [],
        nodes: [],
        relationships: [],
      },
    };

    // Assign universe to House A in mock storage
    const targetHouseA = mock.houses.find(h => h.id === houseA.id)!;
    targetHouseA.universe_ids.push('uni-valenrift');
    targetHouseA.universe_ids.push('uni-other');

    // Create 2 Lorebook documents in uni-valenrift in House A
    const doc1 = await mock.createDocument(
      'lorebook',
      'Valenrift Spire',
      undefined,
      'Crystalline Spire prose.',
      JSON.stringify({ universe_id: 'uni-valenrift', entry_type: 'location' }),
      ['landmark', 'crystal'],
      houseA.id
    );

    const doc2 = await mock.createDocument(
      'lorebook',
      'Archmage Cynthia',
      undefined,
      'Guardian prose.',
      JSON.stringify({ universe_id: 'uni-valenrift', entry_type: 'character' }),
      ['guardian'],
      houseA.id
    );

    // Link doc1 and doc2 in plan entities and books
    mock.thought.plan!.entities.push(
      { id: doc1.metadata.id, universe_id: 'uni-valenrift' },
      { id: doc2.metadata.id, universe_id: 'uni-valenrift' }
    );
    mock.thought.plan!.relationships.push({
      id: 'rel-guard',
      universe_id: 'uni-valenrift',
      book_id: 'book-spire',
      source_id: doc2.metadata.id,
      target_id: doc1.metadata.id,
      label: 'Guards',
      description: 'Guardian of the Spire',
      directed: true,
      context_node_id: undefined,
      archived: false,
    });

    // Create an entity in uni-other in House A and a poem in House A
    const otherEntity = await mock.createDocument(
      'lorebook',
      'Unrelated Relic',
      undefined,
      'Other universe content.',
      JSON.stringify({ universe_id: 'uni-other', entry_type: 'item' }),
      [],
      houseA.id
    );

    const poem = await mock.createDocument(
      'poetry',
      'House A Verse',
      undefined,
      'Poem content.',
      undefined,
      [],
      houseA.id
    );

    // Move universe to House B
    const result = await mock.moveUniverseToHouse('uni-valenrift', houseB.id);

    assert.strictEqual(result.universe_id, 'uni-valenrift');
    assert.strictEqual(result.source_house_id, houseA.id);
    assert.strictEqual(result.target_house_id, houseB.id);
    assert.strictEqual(result.document_count, 2);
    assert.ok(result.moved_document_ids.includes(doc1.metadata.id));
    assert.ok(result.moved_document_ids.includes(doc2.metadata.id));

    // Verify owned documents moved to House B
    const updatedDoc1 = mock.documents.find(d => d.metadata.id === doc1.metadata.id);
    const updatedDoc2 = mock.documents.find(d => d.metadata.id === doc2.metadata.id);
    assert.strictEqual(updatedDoc1?.metadata.house_id, houseB.id);
    assert.strictEqual(updatedDoc2?.metadata.house_id, houseB.id);
    assert.strictEqual(updatedDoc1?.content, 'Crystalline Spire prose.');

    // Verify unrelated documents in House A were not touched
    const updatedOther = mock.documents.find(d => d.metadata.id === otherEntity.metadata.id);
    const updatedPoem = mock.documents.find(d => d.metadata.id === poem.metadata.id);
    assert.strictEqual(updatedOther?.metadata.house_id, houseA.id);
    assert.strictEqual(updatedPoem?.metadata.house_id, houseA.id);

    // Verify registry mapping
    const regA = mock.houses.find(h => h.id === houseA.id)!;
    const regB = mock.houses.find(h => h.id === houseB.id)!;
    assert.ok(!regA.universe_ids.includes('uni-valenrift'));
    assert.ok(regA.universe_ids.includes('uni-other'));
    assert.ok(regB.universe_ids.includes('uni-valenrift'));

    // Verify Web of Thought plan structures preserved
    assert.strictEqual(mock.thought.plan!.universes.length, 2);
    assert.strictEqual(mock.thought.plan!.books.length, 1);
    assert.strictEqual(mock.thought.plan!.entities.length, 2);
    assert.strictEqual(mock.thought.plan!.relationships.length, 1);
    assert.strictEqual(mock.thought.plan!.relationships[0].label, 'Guards');
  });

  it('validates target and source constraints and rejects invalid operations', async () => {
    const mock = new MockStorage();

    const houseA = await mock.createHouse({
      name: 'House Lore A',
      enabled_studios: ['lorebook'],
      manuscript_tools_enabled: true,
    });

    const houseNoLore = await mock.createHouse({
      name: 'House No Lore',
      enabled_studios: ['poetry'],
      manuscript_tools_enabled: true,
    });

    mock.thought = {
      document_id: 'doc-wot',
      plan: {
        version: 1,
        revision: 1,
        universes: [{ id: 'uni-test', name: 'Test Universe', archived: false }],
        books: [],
        entities: [],
        nodes: [],
        relationships: [],
      },
    };
    mock.houses.find(h => h.id === houseA.id)!.universe_ids.push('uni-test');

    // 1. Target with Lorebook disabled throws
    await assert.rejects(
      async () => {
        await mock.moveUniverseToHouse('uni-test', houseNoLore.id);
      },
      /Authoring studio 'lorebook' is disabled for House 'House No Lore'/
    );

    // 2. Archived target throws
    await mock.archiveHouse(houseNoLore.id);
    await assert.rejects(
      async () => {
        await mock.moveUniverseToHouse('uni-test', houseNoLore.id);
      },
      /Target House '.*' is archived/
    );

    // 3. Archived source throws
    await mock.archiveHouse(houseA.id);
    const houseB = await mock.createHouse({
      name: 'House Lore B',
      enabled_studios: ['lorebook'],
      manuscript_tools_enabled: true,
    });
    await assert.rejects(
      async () => {
        await mock.moveUniverseToHouse('uni-test', houseB.id);
      },
      /current owning House '.*' is archived/
    );
    await mock.restoreHouse(houseA.id);

    // 4. Unknown Universe ID throws
    await assert.rejects(
      async () => {
        await mock.moveUniverseToHouse('uni-unknown', houseB.id);
      },
      /Universe 'uni-unknown' does not exist in the Lorebook catalog/
    );

    // 5. Malformed Universe ID throws
    await assert.rejects(
      async () => {
        await mock.moveUniverseToHouse('   ', houseB.id);
      },
      /Universe ID cannot be empty/
    );
    await assert.rejects(
      async () => {
        await mock.moveUniverseToHouse('uni/invalid', houseB.id);
      },
      /Invalid universe ID syntax: 'uni\/invalid'/
    );

    // 6. Conflicting universe attribution on entity document throws
    const conflictingDoc = await mock.createDocument(
      'lorebook',
      'Conflicted Lore',
      undefined,
      'Conflicted body.',
      JSON.stringify({ universe_id: 'uni-other-realm', entry_type: 'location' }),
      [],
      houseA.id
    );
    mock.thought.plan!.entities.push({ id: conflictingDoc.metadata.id, universe_id: 'uni-test' });

    await assert.rejects(
      async () => {
        await mock.moveUniverseToHouse('uni-test', houseB.id);
      },
      /Conflicting Universe attribution for Lorebook entity 'Conflicted Lore'/
    );
  });

  it('same-House move succeeds as idempotent no-op without mutating state', async () => {
    const mock = new MockStorage();

    const houseA = await mock.createHouse({
      name: 'House Origin',
      enabled_studios: ['lorebook'],
      manuscript_tools_enabled: true,
    });

    mock.thought = {
      document_id: 'doc-wot',
      plan: {
        version: 1,
        revision: 1,
        universes: [{ id: 'uni-idemp', name: 'Idempotent Cosmos', archived: false }],
        books: [],
        entities: [],
        nodes: [],
        relationships: [],
      },
    };
    mock.houses.find(h => h.id === houseA.id)!.universe_ids.push('uni-idemp');

    const doc = await mock.createDocument(
      'lorebook',
      'Sacred Shrine',
      undefined,
      'Shrine body.',
      JSON.stringify({ universe_id: 'uni-idemp', entry_type: 'location' }),
      [],
      houseA.id
    );

    const result = await mock.moveUniverseToHouse('uni-idemp', houseA.id);
    assert.strictEqual(result.source_house_id, houseA.id);
    assert.strictEqual(result.target_house_id, houseA.id);
    assert.strictEqual(result.document_count, 1);
    assert.deepStrictEqual(result.moved_document_ids, [doc.metadata.id]);
  });

  it('coordinateUniverseMove flushes saves, serializes concurrent moves, and updates local state', async () => {
    const mock = new MockStorage();
    const commandQueue = new CommandQueue();

    const houseA = await mock.createHouse({
      name: 'House Alpha',
      enabled_studios: ['lorebook'],
      manuscript_tools_enabled: true,
    });

    const houseB = await mock.createHouse({
      name: 'House Beta',
      enabled_studios: ['lorebook'],
      manuscript_tools_enabled: true,
    });

    mock.thought = {
      document_id: 'doc-wot',
      plan: {
        version: 1,
        revision: 1,
        universes: [{ id: 'uni-coord', name: 'Coordinated Cosmos', archived: false }],
        books: [],
        entities: [],
        nodes: [],
        relationships: [],
      },
    };
    mock.houses.find(h => h.id === houseA.id)!.universe_ids.push('uni-coord');

    const doc = await mock.createDocument(
      'lorebook',
      'Active Entity',
      undefined,
      'Original prose.',
      JSON.stringify({ universe_id: 'uni-coord', entry_type: 'character' }),
      [],
      houseA.id
    );

    // Active document state in editor
    let activeDoc: DocumentDetail | null = { ...doc };
    let flushSaveCalled = false;

    const flushSave = async () => {
      flushSaveCalled = true;
      return true;
    };

    // 1. Move universe via coordinateUniverseMove
    const moveResult = await coordinateUniverseMove(
      flushSave,
      commandQueue,
      async () => mock.moveUniverseToHouse('uni-coord', houseB.id),
      (res) => {
        if (activeDoc && res.moved_document_ids.includes(activeDoc.metadata.id)) {
          activeDoc = reconcileDocumentMetadata(activeDoc, {
            ...activeDoc.metadata,
            house_id: res.target_house_id,
          });
        }
      }
    );

    assert.ok(flushSaveCalled);
    assert.strictEqual(moveResult.target_house_id, houseB.id);
    assert.strictEqual(activeDoc?.metadata.house_id, houseB.id);

    // 2. Abort if flushSave fails (e.g. unsaved changes cannot be persisted)
    const failingFlush = async () => false;
    await assert.rejects(
      async () => {
        await coordinateUniverseMove(
          failingFlush,
          commandQueue,
          async () => mock.moveUniverseToHouse('uni-coord', houseA.id)
        );
      },
      /Universe move did not start because pending changes could not be saved/
    );
  });
});
