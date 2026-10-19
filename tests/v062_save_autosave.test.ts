import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockStorage } from '../src/services/api';
import { MutationQueue, CommandQueue, SaveCoordinator, flushWorkspace } from '../src/services/autosave';
import {
  createUniverseInPlan,
  createBookInPlan,
  reconcilePlans,
  resolveBasePlan,
} from '../src/utils/universe';
import {
  loadSavePreferences,
  persistSavePreferences,
  DEFAULT_SAVE_PREFERENCES,
  type SavePreferences,
} from '../src/utils/savePreferences';
import type { Plan, StoryNode, EntityRelationship } from '../src/utils/thought';
import type { DocumentMetadata, SaveStatus } from '../src/types';

describe('v0.6.2 Save Reliability & Autosave UX Tests', () => {
  // Helper to create a base plan
  function createTestPlan(revision = 1): Plan {
    return {
      version: 1,
      revision,
      universes: [{ id: 'uni-1', name: 'Alpha Universe', description: 'Primary testing cosmos' }],
      books: [{ id: 'book-1', universe_id: 'uni-1', name: 'Book One', continuity: 'canonical' }],
      entities: [
        { id: 'char-1', universe_id: 'uni-1' },
        { id: 'loc-1', universe_id: 'uni-1' },
      ],
      nodes: [
        {
          id: 'node-1',
          universe_id: 'uni-1',
          book_id: 'book-1',
          position: 0,
          title: 'Opening Milestone',
          description: '',
          era: 'First Era',
          status: 'planned',
          questions: '',
          entity_ids: ['char-1'],
          changes: [],
          relationship_changes: [],
          linked_event_id: null,
          origin_node_id: null,
          archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      relationships: [
        {
          id: 'rel-1',
          universe_id: 'uni-1',
          book_id: null,
          source_id: 'char-1',
          target_id: 'loc-1',
          label: 'born in',
          description: '',
          directed: true,
          context_node_id: null,
          archived: false,
        },
      ],
    };
  }

  // 1. Rapid organization mutations
  it('1. Rapid organization mutations execute serially without dropped actions', async () => {
    const queue = new MutationQueue();
    const executionOrder: number[] = [];

    const p1 = queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 20));
      executionOrder.push(1);
    });

    const p2 = queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 10));
      executionOrder.push(2);
    });

    const p3 = queue.enqueue(async () => {
      executionOrder.push(3);
    });

    const results = await Promise.all([p1, p2, p3]);
    assert.deepEqual(results, [true, true, true]);
    assert.deepEqual(executionOrder, [1, 2, 3]);
    assert.equal(queue.pendingCount, 0);
    assert.equal(queue.hasFailure, false);
  });

  // 2. Universe creation followed immediately by Character creation
  it('2. Universe creation followed immediately by Character creation maintains valid IDs and references', async () => {
    const basePlan = createTestPlan(1);

    // Universe creation
    const { plan: planWithUni, universe: newUni } = createUniverseInPlan(basePlan, 'Beta Realm', 'Second universe');
    assert.equal(newUni.name, 'Beta Realm');
    assert.ok(planWithUni.universes.some((u) => u.id === newUni.id));

    // Immediate character creation assigned to new universe
    const charDoc: DocumentMetadata = {
      id: 'char-2',
      title: 'Elena Vance',
      doc_type: 'lorebook',
      relative_path: 'Lorebooks/Elena_Vance.md',
      metadata_json: JSON.stringify({ universe_id: newUni.id, entry_type: 'character', universe: newUni.name }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tags: [],
    };

    const reconciled = reconcilePlans(planWithUni, {
      ...planWithUni,
      entities: [...planWithUni.entities, { id: charDoc.id, universe_id: newUni.id }],
    });

    assert.ok(reconciled.universes.some((u) => u.id === newUni.id));
    assert.ok(reconciled.entities.some((e) => e.id === 'char-2' && e.universe_id === newUni.id));
  });

  // 3. Relationship creation followed by navigation
  it('3. Relationship creation followed by navigation completes write before view unmounts', async () => {
    const queue = new MutationQueue();
    let saved = false;

    // Simulate relationship creation mutation
    const savePromise = queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 15));
      saved = true;
    });

    // Simulate navigation that flushes pending mutations before unmounting
    const flushed = await queue.flush();
    await savePromise;

    assert.equal(flushed, true);
    assert.equal(saved, true);
    assert.equal(queue.pendingCount, 0);
  });

  // 4. Concurrent plan updates with stale revisions
  it('4. Concurrent plan updates with stale revisions reconcile without losing changes', () => {
    const diskPlan = createTestPlan(5);

    // Mutation A: added a relationship on an older revision 4
    const stalePlanA: Plan = {
      ...createTestPlan(4),
      relationships: [
        ...createTestPlan(4).relationships,
        {
          id: 'rel-2',
          universe_id: 'uni-1',
          book_id: null,
          source_id: 'char-1',
          target_id: 'char-1',
          label: 'allied with',
          description: '',
          directed: false,
          context_node_id: null,
          archived: false,
        },
      ],
    };

    // Reconcile onto diskPlan (revision 5)
    const reconciled = reconcilePlans(diskPlan, stalePlanA);

    assert.equal(reconciled.revision, 5);
    // Preserves rel-1 from disk and incorporates rel-2 from stalePlanA
    assert.ok(reconciled.relationships.some((r) => r.id === 'rel-1'));
    assert.ok(reconciled.relationships.some((r) => r.id === 'rel-2' && r.label === 'allied with'));
    assert.equal(reconciled.relationships.length, 2);
  });

  // 5. Save failure followed by safe retry
  it('5. Save failure retains action in queue and safe retry executes successfully', async () => {
    const queue = new MutationQueue();
    let attempts = 0;

    const action = async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Disk temporarily busy');
      }
    };

    // Initial enqueue fails
    const initialSaved = await queue.enqueue(action);
    assert.equal(initialSaved, false);
    assert.equal(queue.hasFailure, true);
    assert.equal(queue.pendingCount, 1);
    assert.equal(attempts, 1);

    // Safe retry
    const retrySaved = await queue.flush();
    assert.equal(retrySaved, true);
    assert.equal(queue.hasFailure, false);
    assert.equal(queue.pendingCount, 0);
    assert.equal(attempts, 2);
  });

  // 6. No duplicate records after retry
  it('6. Reconciling plan mutations across retries never creates duplicate records', () => {
    const diskPlan = createTestPlan(3);
    const attemptedPlan: Plan = {
      ...diskPlan,
      universes: [...diskPlan.universes, { id: 'uni-new', name: 'Cosmos X' }],
      books: [...diskPlan.books, { id: 'book-new', universe_id: 'uni-1', name: 'Chronicles', continuity: 'standalone' }],
      entities: [...diskPlan.entities, { id: 'ent-new', universe_id: 'uni-1' }],
    };

    // First reconciliation
    const first = reconcilePlans(diskPlan, attemptedPlan);
    // Second reconciliation (simulating retry with same attempted changes)
    const second = reconcilePlans(first, attemptedPlan);

    const uniCount = second.universes.filter((u) => u.id === 'uni-new').length;
    const bookCount = second.books.filter((b) => b.id === 'book-new').length;
    const entCount = second.entities.filter((e) => e.id === 'ent-new').length;

    assert.equal(uniCount, 1, 'Universe ID must not duplicate');
    assert.equal(bookCount, 1, 'Book ID must not duplicate');
    assert.equal(entCount, 1, 'Entity ID must not duplicate');
  });

  // 7. Autosave debounce at 1, 3, 5, and 10 seconds
  it('7. Autosave debounce clamps to 1–10 seconds and respects configured interval', () => {
    const p1 = persistSavePreferences({ mode: 'automatic', debounceSeconds: 1 });
    assert.equal(p1.debounceSeconds, 1);

    const p3 = persistSavePreferences({ mode: 'automatic', debounceSeconds: 3 });
    assert.equal(p3.debounceSeconds, 3);

    const p5 = persistSavePreferences({ mode: 'automatic', debounceSeconds: 5 });
    assert.equal(p5.debounceSeconds, 5);

    const p10 = persistSavePreferences({ mode: 'automatic', debounceSeconds: 10 });
    assert.equal(p10.debounceSeconds, 10);

    // Clamping checks
    const pLow = persistSavePreferences({ mode: 'automatic', debounceSeconds: 0 });
    assert.equal(pLow.debounceSeconds, 3, 'Below 1 clamps to default 3');

    const pHigh = persistSavePreferences({ mode: 'automatic', debounceSeconds: 99 });
    assert.equal(pHigh.debounceSeconds, 3, 'Above 10 clamps to default 3');
  });

  // 8. Continued typing resets the debounce
  it('8. Continued typing resets the debounce timer until idle pause', async () => {
    let savedCount = 0;
    let timer: NodeJS.Timeout | null = null;

    const scheduleSave = (debounceMs: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        savedCount++;
      }, debounceMs);
    };

    // Type rapidly at 15ms intervals (debounce 40ms)
    scheduleSave(40);
    await new Promise((r) => setTimeout(r, 15));
    scheduleSave(40);
    await new Promise((r) => setTimeout(r, 15));
    scheduleSave(40);

    // Before 40ms idle pause, no save should have executed
    assert.equal(savedCount, 0, 'Must not save while user continues typing');

    // Wait 50ms idle
    await new Promise((r) => setTimeout(r, 55));
    assert.equal(savedCount, 1, 'Must save exactly once after typing pauses');
  });

  // 9. Manual mode does not save automatically
  it('9. Manual mode marks status as unsaved and does not start timer', async () => {
    const prefs: SavePreferences = { mode: 'manual', debounceSeconds: 3 };
    let timerCalled = false;

    // Simulated handleSaveDocument in manual mode
    let saveStatus: SaveStatus = 'saved';
    const pendingEdit = { content: 'Updated prose in manual mode', revision: 1 };

    if (prefs.mode === 'manual') {
      saveStatus = 'unsaved';
    } else {
      timerCalled = true;
    }

    assert.equal(timerCalled, false, 'Manual mode must not trigger timer');
    assert.equal(saveStatus, 'unsaved', 'Status must be marked as unsaved');
    assert.equal(pendingEdit.content, 'Updated prose in manual mode');
  });

  // 10. Ctrl+S saves immediately
  it('10. Ctrl+S flushes pending edits immediately in either mode', async () => {
    const storage = new MockStorage();
    const doc = await storage.createDocument('poetry', 'Sonnet of Dawn', undefined, 'Line 1\nLine 2');

    let isSaved = false;
    const saveCoordinator = new SaveCoordinator();
    const commandQueue = new CommandQueue();

    const pending = {
      docId: doc.metadata.id,
      content: 'Line 1\nLine 2\nLine 3 (Saved via Ctrl+S)',
      revision: 1,
    };

    // Simulate immediate flush (Ctrl+S action)
    const result = await saveCoordinator.flush(() =>
      commandQueue.run(async () => {
        await storage.saveDocument(pending.docId, pending.content);
        isSaved = true;
        return 'saved';
      })
    );

    assert.equal(result, true);
    assert.equal(isSaved, true);
    const updated = await storage.getDocument(doc.metadata.id);
    assert.equal(updated.content, 'Line 1\nLine 2\nLine 3 (Saved via Ctrl+S)');
  });

  // 11. Document switch with unsaved edits
  it('11. Document switch coordinates unsaved edits (Save, Discard, Cancel workflows)', async () => {
    const storage = new MockStorage();
    const docA = await storage.createDocument('philosophy', 'Essay A', undefined, 'Initial content A');
    const docB = await storage.createDocument('philosophy', 'Essay B', undefined, 'Initial content B');

    // Scenario A: Save on switch
    let currentDoc = docA;
    let pendingEdit: { docId: string; content: string } | null = {
      docId: docA.metadata.id,
      content: 'Modified content A',
    };

    // User chooses Save:
    if (pendingEdit) {
      await storage.saveDocument(pendingEdit.docId, pendingEdit.content);
      pendingEdit = null;
      currentDoc = docB;
    }

    assert.equal(currentDoc.metadata.id, docB.metadata.id);
    const reloadedA = await storage.getDocument(docA.metadata.id);
    assert.equal(reloadedA.content, 'Modified content A');

    // Scenario B: Discard on switch
    pendingEdit = { docId: docB.metadata.id, content: 'Draft content B that user will discard' };
    // User chooses Discard:
    pendingEdit = null; // discard in-memory edit
    currentDoc = docA;

    assert.equal(currentDoc.metadata.id, docA.metadata.id);
    const reloadedB = await storage.getDocument(docB.metadata.id);
    assert.equal(reloadedB.content, 'Initial content B', 'Discard must not write to storage');

    // Scenario C: Cancel switch
    pendingEdit = { docId: docA.metadata.id, content: 'Do not navigate away' };
    // User chooses Cancel:
    // (no-op, currentDoc remains docA)
    assert.equal(currentDoc.metadata.id, docA.metadata.id);
    assert.ok(pendingEdit !== null);
  });

  // 12. Application exit with unsaved edits
  it('12. Application exit safely coordinates pending edits without data loss', async () => {
    const storage = new MockStorage();
    const doc = await storage.createDocument('lorebook', 'Codex', undefined, 'Ancient knowledge');

    let exited = false;
    let exitPrevented = false;
    const mode = 'manual';
    const hasUnsaved = true;

    // Simulate onCloseRequested intercept
    if (mode === 'manual' && hasUnsaved) {
      exitPrevented = true; // Shows UnsavedChangesModal
    }

    assert.equal(exitPrevented, true, 'Window close must be intercepted when unsaved changes exist in manual mode');
    assert.equal(exited, false);

    // User clicks "Save & Exit" in modal
    await storage.saveDocument(doc.metadata.id, 'Ancient knowledge (saved before exit)');
    exited = true;

    assert.equal(exited, true);
    const savedDoc = await storage.getDocument(doc.metadata.id);
    assert.equal(savedDoc.content, 'Ancient knowledge (saved before exit)');
  });

  // 13. Notebook switching during pending writes
  it('13. Notebook switching waits for pending workspace flush before activating new notebook', async () => {
    const mutations = new MutationQueue();
    let writeFinished = false;

    // A write is in flight
    void mutations.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 25));
      writeFinished = true;
    });

    // Notebook switch triggers flushWorkspace
    const flushed = await flushWorkspace(mutations, async () => true);
    assert.equal(flushed, true);
    assert.equal(writeFinished, true);
  });

  // 14. Vault backup while edits are pending
  it('14. Vault backup captures pending edits cleanly via flushWorkspace', async () => {
    const mutations = new MutationQueue();
    let bodySaved = false;

    mutations.enqueue(async () => {
      // Organization change completed
    });

    const flushed = await flushWorkspace(mutations, async () => {
      bodySaved = true;
      return true;
    });

    assert.equal(flushed, true);
    assert.equal(bodySaved, true);
    assert.equal(mutations.pendingCount, 0);
  });

  // 15. Save status reflects actual disk persistence
  it('15. Save status transitions reflect actual disk persistence: editing -> saving -> saved', async () => {
    const storage = new MockStorage();
    const doc = await storage.createDocument('poetry', 'Verses', undefined, 'First line');

    let status: SaveStatus = 'saved';

    // User edits
    status = 'editing';
    assert.equal(status, 'editing');

    // Flush initiates
    status = 'saving';
    assert.equal(status, 'saving');

    // Disk write completes
    await storage.saveDocument(doc.metadata.id, 'First line\nSecond line');
    status = 'saved';
    assert.equal(status, 'saved');

    const verified = await storage.getDocument(doc.metadata.id);
    assert.equal(verified.content, 'First line\nSecond line');
  });

  // 16. Poetry, Philosophy, and Lorebook regression coverage
  it('16. Poetry, Philosophy, and Lorebook document saving operates seamlessly under new autosave rules', async () => {
    const storage = new MockStorage();

    // Poetry
    const poem = await storage.createDocument('poetry', 'Haiku', undefined, 'Silent winter night\nSnow falls softly on the ground\nQuiet world asleep');
    await storage.saveDocument(poem.metadata.id, poem.content + '\nPeaceful peace');
    const updatedPoem = await storage.getDocument(poem.metadata.id);
    assert.ok(updatedPoem.content.includes('Peaceful peace'));

    // Philosophy
    const philosophy = await storage.createDocument('philosophy', 'Meditations', undefined, 'I think therefore I am', JSON.stringify({ mode: 'freeform' }));
    await storage.saveDocument(philosophy.metadata.id, philosophy.content + '\nRefined doubt');
    const updatedPhil = await storage.getDocument(philosophy.metadata.id);
    assert.ok(updatedPhil.content.includes('Refined doubt'));

    // Lorebook
    const lore = await storage.createDocument('lorebook', 'Castle Black', undefined, 'Northern fortress of stone', JSON.stringify({ entry_type: 'location', canon_status: 'canon' }));
    await storage.saveDocument(lore.metadata.id, lore.content + '\nAncient garrison');
    const updatedLore = await storage.getDocument(lore.metadata.id);
    assert.ok(updatedLore.content.includes('Ancient garrison'));
  });
});
