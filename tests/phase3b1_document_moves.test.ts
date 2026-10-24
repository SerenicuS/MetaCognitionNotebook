import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockStorage } from '../src/services/api';
import { CommandQueue, SaveCoordinator, coordinateDocumentMove } from '../src/services/autosave';
import { reconcileDocumentMetadata } from '../src/utils/organization';
import type { DocumentDetail, DocumentMetadata } from '../src/types';

describe('Phase 3B-1: Safe Single-Document House Moves & Save Coordination', () => {
  it('Phase 3A Contract Correction: createDocument validates houseId strictly', async () => {
    const mock = new MockStorage();

    // 1. undefined houseId defaults to house-default
    const doc1 = await mock.createDocument('poetry', 'Poem 1', undefined, undefined, undefined, undefined, undefined);
    assert.strictEqual(doc1.metadata.house_id, 'house-default');

    // 2. Explicit house-default succeeds
    const doc2 = await mock.createDocument('poetry', 'Poem 2', undefined, undefined, undefined, undefined, 'house-default');
    assert.strictEqual(doc2.metadata.house_id, 'house-default');

    // 3. Empty string throws error
    await assert.rejects(
      async () => {
        await mock.createDocument('poetry', 'Poem 3', undefined, undefined, undefined, undefined, '');
      },
      /Malformed target House ID: ''/
    );

    // 4. Whitespace string throws error
    await assert.rejects(
      async () => {
        await mock.createDocument('poetry', 'Poem 4', undefined, undefined, undefined, undefined, '   ');
      },
      /Malformed target House ID: '   '/
    );

    // 5. Invalid prefix throws error
    await assert.rejects(
      async () => {
        await mock.createDocument('poetry', 'Poem 5', undefined, undefined, undefined, undefined, 'not-a-house');
      },
      /Malformed target House ID: 'not-a-house'/
    );
  });

  it('Safe single-document move between houses preserves document identity & metadata', async () => {
    const mock = new MockStorage();

    const houseSol = await mock.createHouse({
      name: 'House Sol',
      enabled_studios: ['poetry', 'philosophy'],
      manuscript_tools_enabled: true,
    });

    const houseLuna = await mock.createHouse({
      name: 'House Luna',
      enabled_studios: ['poetry'],
      manuscript_tools_enabled: false,
    });

    const doc = await mock.createDocument(
      'poetry',
      'Starlight Sonnet',
      undefined,
      'Starlight shines bright.',
      JSON.stringify({ custom_field: 'preserved_val' }),
      ['stars'],
      houseSol.id
    );

    assert.strictEqual(doc.metadata.house_id, houseSol.id);
    const originalPath = doc.metadata.relative_path;
    const originalId = doc.metadata.id;

    // Move to House Luna
    const moved = await mock.moveDocumentToHouse(doc.metadata.id, houseLuna.id);
    assert.strictEqual(moved.house_id, houseLuna.id);
    assert.strictEqual(moved.id, originalId);
    assert.strictEqual(moved.relative_path, originalPath);
    assert.strictEqual(moved.title, 'Starlight Sonnet');

    // Stored document reflects change
    const stored = await mock.getDocument(doc.metadata.id);
    assert.strictEqual(stored.metadata.house_id, houseLuna.id);
    assert.strictEqual(stored.content, 'Starlight shines bright.');
    assert.deepStrictEqual(stored.metadata.tags, ['stars']);

    // Idempotent move: moving to current house is safe no-op
    const noop = await mock.moveDocumentToHouse(doc.metadata.id, houseLuna.id);
    assert.strictEqual(noop.house_id, houseLuna.id);
  });

  it('moveDocumentToHouse enforces studio enablement and validation invariants', async () => {
    const mock = new MockStorage();

    const housePoetryOnly = await mock.createHouse({
      name: 'Poetry Only',
      enabled_studios: ['poetry'],
      manuscript_tools_enabled: false,
    });

    const housePhilOnly = await mock.createHouse({
      name: 'Philosophy Only',
      enabled_studios: ['philosophy'],
      manuscript_tools_enabled: true,
    });

    const archivedHouse = await mock.createHouse({
      name: 'Old Realm',
      enabled_studios: ['poetry', 'philosophy'],
      manuscript_tools_enabled: true,
    });
    await mock.archiveHouse(archivedHouse.id);

    const poem = await mock.createDocument('poetry', 'Verse A', undefined, undefined, undefined, undefined, housePoetryOnly.id);
    const manuscript = await mock.createDocument('manuscript', 'Book B', undefined, undefined, undefined, undefined, housePhilOnly.id);

    // 1. Malformed target house ID
    await assert.rejects(
      async () => {
        await mock.moveDocumentToHouse(poem.metadata.id, 'bad-syntax');
      },
      /Malformed target House ID: 'bad-syntax'/
    );

    // 2. Non-existent house
    await assert.rejects(
      async () => {
        await mock.moveDocumentToHouse(poem.metadata.id, 'house-ghost');
      },
      /House with ID 'house-ghost' not found/
    );

    // 3. Archived target house
    await assert.rejects(
      async () => {
        await mock.moveDocumentToHouse(poem.metadata.id, archivedHouse.id);
      },
      /Cannot move document: House '.*' is archived/
    );

    // 4. Studio disabled in target house (poetry moving to house with only philosophy)
    await assert.rejects(
      async () => {
        await mock.moveDocumentToHouse(poem.metadata.id, housePhilOnly.id);
      },
      /Authoring studio 'poetry' is disabled for House 'Philosophy Only'/
    );

    // 5. Manuscript tools disabled in target house
    await assert.rejects(
      async () => {
        await mock.moveDocumentToHouse(manuscript.metadata.id, housePoetryOnly.id);
      },
      /Manuscript Tools is disabled for House 'Poetry Only'/
    );

    // 6. Cannot move shared planning catalog
    const catalog = await mock.createDocument(
      'lorebook',
      '_web_of_thought',
      undefined,
      undefined,
      JSON.stringify({ _web_of_thought: { version: 1, revision: 1 } }),
      undefined,
      'house-default'
    );
    await assert.rejects(
      async () => {
        await mock.moveDocumentToHouse(catalog.metadata.id, housePhilOnly.id);
      },
      /Cannot move the shared Web of Thought planning catalog/
    );
  });

  it('moveDocumentToHouse respects Lorebook Universe ownership boundaries', async () => {
    const mock = new MockStorage();

    const houseLoreA = await mock.createHouse({
      name: 'House Lore A',
      enabled_studios: ['lorebook'],
      manuscript_tools_enabled: false,
    });
    houseLoreA.universe_ids.push('uni-solaris');

    const houseLoreB = await mock.createHouse({
      name: 'House Lore B',
      enabled_studios: ['lorebook'],
      manuscript_tools_enabled: false,
    });

    // Lorebook entity belonging to uni-solaris
    const entity = await mock.createDocument(
      'lorebook',
      'Solar Spire',
      undefined,
      'A tower of sunlight.',
      JSON.stringify({ universe_id: 'uni-solaris', entity_type: 'Location' }),
      undefined,
      houseLoreA.id
    );

    // Attempting to move entity away from its owning Universe fails
    await assert.rejects(
      async () => {
        await mock.moveDocumentToHouse(entity.metadata.id, houseLoreB.id);
      },
      /Cannot move Lorebook entity 'Solar Spire' to House 'house-.*': entity belongs to Universe 'uni-solaris' which is owned by House 'house-.*/
    );

    // Standalone entity without universe moves freely
    const standalone = await mock.createDocument(
      'lorebook',
      'Drifting Scholar',
      undefined,
      'An unaffiliated traveler.',
      JSON.stringify({ entity_type: 'Character' }),
      undefined,
      houseLoreA.id
    );

    const movedStandalone = await mock.moveDocumentToHouse(standalone.metadata.id, houseLoreB.id);
    assert.strictEqual(movedStandalone.house_id, houseLoreB.id);
  });

  it('Save coordination: coordinateDocumentMove flushes pending edits and serializes through CommandQueue', async () => {
    const commandQueue = new CommandQueue();
    let flushed = false;
    let savedContent = 'old version';
    let acceptedMetadata: DocumentMetadata | null = null;

    const flushSave = async (): Promise<boolean> => {
      // Simulate settling debounced autosave before the move
      flushed = true;
      savedContent = 'latest flushed version';
      return true;
    };

    const mockMeta: DocumentMetadata = {
      id: 'doc-coord-test',
      title: 'Coordinated Doc',
      doc_type: 'philosophy',
      house_id: 'house-target',
      relative_path: 'Philosophy/Coordinated_Doc.md',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tags: [],
    };

    const moveAction = async (): Promise<DocumentMetadata> => {
      // Verify flushSave ran before the move action started
      assert.strictEqual(flushed, true);
      assert.strictEqual(savedContent, 'latest flushed version');
      return mockMeta;
    };

    const result = await coordinateDocumentMove(
      flushSave,
      commandQueue,
      moveAction,
      updated => {
        acceptedMetadata = updated;
      }
    );

    assert.strictEqual(result.house_id, 'house-target');
    assert.strictEqual(acceptedMetadata?.house_id, 'house-target');
  });

  it('Hardening: coordinateDocumentMove aborts when flushSave fails and never invokes moveAction', async () => {
    const commandQueue = new CommandQueue();
    let moveInvoked = false;
    let acceptInvoked = false;

    await assert.rejects(
      async () => {
        await coordinateDocumentMove(
          async () => false,
          commandQueue,
          async () => {
            moveInvoked = true;
            return {} as DocumentMetadata;
          },
          () => {
            acceptInvoked = true;
          }
        );
      },
      /Document move did not start because pending changes could not be saved/
    );

    assert.strictEqual(moveInvoked, false);
    assert.strictEqual(acceptInvoked, false);
  });

  it('Hardening: Save in flight, save after move begins, and concurrent move+save callers serialize deterministically', async () => {
    const mock = new MockStorage();
    const houseA = await mock.createHouse({
      name: 'House A',
      enabled_studios: ['poetry'],
      manuscript_tools_enabled: true,
    });
    const houseB = await mock.createHouse({
      name: 'House B',
      enabled_studios: ['poetry'],
      manuscript_tools_enabled: true,
    });
    const houseC = await mock.createHouse({
      name: 'House C',
      enabled_studios: ['poetry'],
      manuscript_tools_enabled: true,
    });

    const created = await mock.createDocument(
      'poetry',
      'Concurrency Poem',
      undefined,
      'Rev 0',
      JSON.stringify({ form: 'Ode', _workshop: { favorite: true } }),
      ['ode'],
      houseA.id
    );

    let activeDoc: DocumentDetail | null = structuredClone(created);
    let pendingEdit: { docId: string; content: string; metadataJson?: string; revision: number } | null = {
      docId: created.metadata.id,
      content: 'Rev 1 (in-flight before move)',
      metadataJson: JSON.stringify({ form: 'Ode' }),
      revision: 1,
    };
    let latestRevision = 1;
    let savedRevision = 0;

    const saveCoordinator = new SaveCoordinator();
    const commandQueue = new CommandQueue();
    const events: string[] = [];

    const flushSave = () =>
      saveCoordinator.flush(() =>
        commandQueue.run(async () => {
          if (!pendingEdit || pendingEdit.revision <= savedRevision) return 'saved';
          const rev = pendingEdit.revision;
          const content = pendingEdit.content;
          const metaJson = pendingEdit.metadataJson;
          events.push(`save-start-rev-${rev}`);
          await Promise.resolve();
          const updatedMeta = await mock.saveDocument(
            pendingEdit.docId,
            content,
            undefined,
            undefined,
            metaJson
          );
          savedRevision = rev;
          activeDoc = reconcileDocumentMetadata(activeDoc, updatedMeta, pendingEdit);
          if (activeDoc) activeDoc.content = pendingEdit.content;
          events.push(`save-done-rev-${rev}-house-${updatedMeta.house_id}`);
          return latestRevision === rev ? 'saved' : 'more';
        })
      );

    // 1. Start an in-flight save before move 1 begins
    const inFlightSavePromise = flushSave();

    // 2. Invoke Move 1 (to House B) and Move 2 (to House C) concurrently while save is in flight
    const move1Promise = coordinateDocumentMove(
      flushSave,
      commandQueue,
      async () => {
        events.push('move1-start');
        // Simulate an edit arriving AFTER move1 has started in commandQueue
        latestRevision = 2;
        pendingEdit = {
          docId: created.metadata.id,
          content: 'Rev 2 (edited during move1)',
          metadataJson: JSON.stringify({ form: 'Sonnet' }),
          revision: 2,
        };
        const moved = await mock.moveDocumentToHouse(created.metadata.id, houseB.id);
        events.push(`move1-done-house-${moved.house_id}`);
        return moved;
      },
      updated => {
        activeDoc = reconcileDocumentMetadata(activeDoc, updated, pendingEdit);
        events.push(`accept1-house-${activeDoc?.metadata.house_id}`);
      }
    );

    const move2Promise = coordinateDocumentMove(
      flushSave,
      commandQueue,
      async () => {
        events.push('move2-start');
        const moved = await mock.moveDocumentToHouse(created.metadata.id, houseC.id);
        events.push(`move2-done-house-${moved.house_id}`);
        return moved;
      },
      updated => {
        activeDoc = reconcileDocumentMetadata(activeDoc, updated, pendingEdit);
        events.push(`accept2-house-${activeDoc?.metadata.house_id}`);
      }
    );

    await Promise.all([inFlightSavePromise, move1Promise, move2Promise]);

    // Verify deterministic ordering:
    // Rev 1 save finishes -> Move 1 runs & accepts House B -> Rev 2 save flushes (keeping House B!) -> Move 2 runs & accepts House C
    assert.deepStrictEqual(events, [
      'save-start-rev-1',
      `save-done-rev-1-house-${houseA.id}`,
      'move1-start',
      `move1-done-house-${houseB.id}`,
      `accept1-house-${houseB.id}`,
      'save-start-rev-2',
      `save-done-rev-2-house-${houseB.id}`,
      'move2-start',
      `move2-done-house-${houseC.id}`,
      `accept2-house-${houseC.id}`,
    ]);

    // Verify final canonical state and activeDoc reconciliation
    const finalStored = await mock.getDocument(created.metadata.id);
    assert.strictEqual(finalStored.metadata.house_id, houseC.id);
    assert.strictEqual(finalStored.content, 'Rev 2 (edited during move1)');
    assert.strictEqual(activeDoc?.metadata.house_id, houseC.id);
    assert.strictEqual(activeDoc?.content, 'Rev 2 (edited during move1)');
    assert.deepStrictEqual(JSON.parse(activeDoc?.metadata.metadata_json || '{}'), {
      form: 'Sonnet',
      _workshop: { favorite: true },
    });

    // 3. Verify reconcileDocumentMetadata does not touch activeDoc if user navigated to another document
    const otherDoc: DocumentDetail = {
      metadata: {
        id: 'other-doc-id',
        title: 'Other Doc',
        doc_type: 'poetry',
        house_id: houseA.id,
        relative_path: 'Poetry/Other_Doc.md',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: [],
      },
      content: 'Other content',
    };
    const untouched = reconcileDocumentMetadata(otherDoc, finalStored.metadata, null);
    assert.strictEqual(untouched?.metadata.id, 'other-doc-id');
    assert.strictEqual(untouched?.metadata.house_id, houseA.id);
  });
});
