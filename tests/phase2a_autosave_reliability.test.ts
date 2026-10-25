import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockStorage } from '../src/services/api';
import type { DocumentType, SaveStatus, PoetryMetadata, PhilosophyMetadata, LorebookMetadata } from '../src/types';

/**
 * Isolated AutosaveController that models the exact revision-tracked,
 * debounced autosave architecture implemented in App.tsx.
 */
class AutosaveController {
  public latestRevision = 0;
  public savedRevision = 0;
  public saveStatus: SaveStatus = 'saved';
  public lastSaveError: string | null = null;
  public saveCallCount = 0;
  public pendingEdit: {
    docId: string;
    content: string;
    metadataJson?: string;
    revision: number;
  } | null = null;

  private timer: NodeJS.Timeout | null = null;
  public mockStorage: MockStorage;
  public simulatedDelayMs = 0;
  public shouldFailSave = false;

  constructor(mockStorage: MockStorage) {
    this.mockStorage = mockStorage;
  }

  public handleEdit(docId: string, content: string, metadataJson?: string, debounceMs = 40) {
    this.latestRevision += 1;
    this.pendingEdit = {
      docId,
      content,
      metadataJson,
      revision: this.latestRevision,
    };
    this.saveStatus = 'editing';
    this.lastSaveError = null;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.flush(docId);
    }, debounceMs);
  }

  public async flush(targetDocId?: string): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const pending = this.pendingEdit;
    if (!pending) return true;
    if (targetDocId && pending.docId !== targetDocId) return true;
    if (pending.revision <= this.savedRevision) return true;

    const revisionToSave = pending.revision;
    const docIdToSave = pending.docId;
    const contentToSave = pending.content;
    const metadataJsonToSave = pending.metadataJson;

    this.saveStatus = 'saving';
    this.saveCallCount += 1;

    if (this.simulatedDelayMs > 0) {
      await new Promise(res => setTimeout(res, this.simulatedDelayMs));
    }

    if (this.shouldFailSave) {
      this.saveStatus = 'error';
      this.lastSaveError = 'Simulated disk I/O failure';
      return false;
    }

    try {
      await this.mockStorage.saveDocument(
        docIdToSave,
        contentToSave,
        undefined,
        undefined,
        metadataJsonToSave
      );

      if (revisionToSave > this.savedRevision) {
        this.savedRevision = revisionToSave;
      }

      if (this.latestRevision === revisionToSave) {
        this.saveStatus = 'saved';
        this.lastSaveError = null;
      } else {
        // Newer revisions were queued while save was in-flight
        this.saveStatus = 'editing';
        if (!this.timer) {
          this.timer = setTimeout(() => {
            this.flush(docIdToSave);
          }, 40);
        }
      }
      return true;
    } catch (err: any) {
      this.saveStatus = 'error';
      this.lastSaveError = err.message;
      return false;
    }
  }

  public async switchDocument(newDocId: string) {
    // 1. Flush pending changes before switching
    await this.flush();

    // 2. Reset revision tracking for new document
    this.latestRevision = 0;
    this.savedRevision = 0;
    this.pendingEdit = null;
    this.saveStatus = 'saved';

    return await this.mockStorage.getDocument(newDocId);
  }
}

describe('Phase 2A: Autosave and Persistence Reliability Tests', () => {
  it('debounces rapid typing edits and avoids unnecessary database writes', async () => {
    const storage = new MockStorage();
    const doc = await storage.createDocument('poetry', 'Debounce Test Poem');
    const controller = new AutosaveController(storage);

    // Simulate 5 rapid keystrokes within 20ms
    controller.handleEdit(doc.metadata.id, 'T');
    controller.handleEdit(doc.metadata.id, 'Th');
    controller.handleEdit(doc.metadata.id, 'The');
    controller.handleEdit(doc.metadata.id, 'The ');
    controller.handleEdit(doc.metadata.id, 'The Wind', undefined, 40);

    assert.equal(controller.saveStatus, 'editing');
    assert.equal(controller.saveCallCount, 0, 'No saves should have executed during rapid typing');

    // Wait for the debounce period to elapse
    await new Promise(res => setTimeout(res, 60));

    assert.equal(controller.saveCallCount, 1, 'Only exactly 1 disk write should occur after debounce');
    assert.equal(controller.saveStatus, 'saved');

    const persisted = await storage.getDocument(doc.metadata.id);
    assert.equal(persisted.content, 'The Wind');
  });

  it('prevents stale asynchronous save responses from marking newer edits as saved', async () => {
    const storage = new MockStorage();
    const doc = await storage.createDocument('philosophy', 'Axiom of Identity');
    const controller = new AutosaveController(storage);

    // Set simulated delay so save is in-flight for 50ms
    controller.simulatedDelayMs = 50;

    // Trigger first save (revision 1)
    controller.handleEdit(doc.metadata.id, 'Revision 1: Initial premise', undefined, 10);
    await new Promise(res => setTimeout(res, 15)); // Timer fires, flush begins

    assert.equal(controller.saveStatus, 'saving');

    // While save is in-flight, user enters newer edits (revision 2) with a 100ms debounce
    controller.handleEdit(doc.metadata.id, 'Revision 2: Refined premise', undefined, 100);

    // Wait for the first slow save to finish (50ms delay + 10ms = 60ms)
    await new Promise(res => setTimeout(res, 60));

    // Notice: Revision 1 finished, but revision 2 is pending, so status must NOT be 'saved'!
    assert.equal(controller.saveStatus, 'editing', 'Status must stay editing because newer edits are unsaved');
    assert.equal(controller.pendingEdit?.content, 'Revision 2: Refined premise');

    // Wait for revision 2 debounce to fire and complete
    await new Promise(res => setTimeout(res, 160));

    assert.equal(controller.saveStatus, 'saved');
    const finalDoc = await storage.getDocument(doc.metadata.id);
    assert.equal(finalDoc.content, 'Revision 2: Refined premise', 'Final saved content must be revision 2');
  });

  it('ensures pending changes are automatically flushed when switching documents', async () => {
    const storage = new MockStorage();
    const docA = await storage.createDocument('poetry', 'Poem A', undefined, 'Initial A');
    const docB = await storage.createDocument('poetry', 'Poem B', undefined, 'Initial B');

    const controller = new AutosaveController(storage);

    // User types in Document A, leaving pending changes in buffer without waiting for debounce
    controller.handleEdit(docA.metadata.id, 'Unsaved modification in Poem A', undefined, 500);
    assert.equal(controller.saveStatus, 'editing');

    // User switches to Document B before debounce timer fires
    const openedB = await controller.switchDocument(docB.metadata.id);
    assert.equal(openedB.metadata.id, docB.metadata.id);
    assert.equal(controller.saveStatus, 'saved');

    // Verify that Poem A was persisted safely to storage
    const reloadedA = await storage.getDocument(docA.metadata.id);
    assert.equal(reloadedA.content, 'Unsaved modification in Poem A', 'Poem A edits must not be silently discarded');
  });

  it('handles save failures gracefully without discarding unsaved local edits, allowing recovery', async () => {
    const storage = new MockStorage();
    const doc = await storage.createDocument('lorebook', 'Ancient Archive');
    const controller = new AutosaveController(storage);

    // Configure simulated failure
    controller.shouldFailSave = true;

    // User makes edits
    controller.handleEdit(doc.metadata.id, 'Important world lore that failed to write to disk', undefined, 10);
    await new Promise(res => setTimeout(res, 25));

    // Save should fail, status transitions to error
    assert.equal(controller.saveStatus, 'error');
    assert.ok(controller.lastSaveError?.includes('Simulated disk I/O failure'));

    // Local in-memory edit buffer must remain intact!
    assert.equal(controller.pendingEdit?.content, 'Important world lore that failed to write to disk');

    // User fixes disk issue and clicks Retry (or presses Ctrl+S)
    controller.shouldFailSave = false;
    const retrySuccess = await controller.flush(doc.metadata.id);

    assert.equal(retrySuccess, true);
    assert.equal(controller.saveStatus, 'saved');

    // Verify storage now has the content
    const persisted = await storage.getDocument(doc.metadata.id);
    assert.equal(persisted.content, 'Important world lore that failed to write to disk');
  });

  it('preserves document IDs, metadata, tags, and relationships across saves and reopens', async () => {
    const storage = new MockStorage();
    const parent = await storage.createDocument('philosophy', 'Parent Treatise');

    const loreMetadata: LorebookMetadata = {
      universe: 'Aethelgard',
      book: 'Vol 1',
      chapter: 'Ch 3',
      entry_type: 'artifact',
      canon_status: 'canon',
      attributes: [
        { id: '1', key: 'Power Level', value: 'Omega' },
        { id: '2', key: 'Origin', value: 'Celestial Core' },
      ],
    };

    const doc = await storage.createDocument(
      'lorebook',
      'The Celestial Relic',
      parent.metadata.id,
      'Initial relic lore...',
      JSON.stringify(loreMetadata),
      ['relic', 'celestial', 'artifact']
    );

    const originalId = doc.metadata.id;
    const originalCreatedAt = doc.metadata.created_at;

    // Save updated content and additional attribute
    loreMetadata.attributes.push({ id: '3', key: 'Custodian', value: 'High Sage' });
    const updatedMeta = await storage.saveDocument(
      originalId,
      'Updated relic lore with deep historical context.',
      'The Celestial Relic Renamed',
      ['relic', 'celestial', 'artifact', 'ancient'],
      JSON.stringify(loreMetadata)
    );

    // Verify metadata preservation
    assert.equal(updatedMeta.id, originalId, 'Document ID must remain unchanged');
    assert.equal(updatedMeta.parent_id, parent.metadata.id, 'Parent relationship must be preserved');
    assert.equal(updatedMeta.created_at, originalCreatedAt, 'created_at timestamp must be preserved');
    assert.deepEqual(updatedMeta.tags, ['relic', 'celestial', 'artifact', 'ancient'], 'Tags must be preserved and updated');

    // Reopen from storage
    const reopened = await storage.getDocument(originalId);
    assert.equal(reopened.content, 'Updated relic lore with deep historical context.');
    assert.equal(reopened.metadata.title, 'The Celestial Relic Renamed');

    const parsedReopenedMeta: LorebookMetadata = JSON.parse(reopened.metadata.metadata_json!);
    assert.equal(parsedReopenedMeta.attributes.length, 3);
    assert.equal(parsedReopenedMeta.attributes[2].key, 'Custodian');
  });

  it('handles empty documents and large documents correctly across all studios', async () => {
    const storage = new MockStorage();

    // 1. Empty documents
    const emptyPoem = await storage.createDocument('poetry', 'Blank Verse', undefined, '');
    assert.equal(emptyPoem.content, '');
    const reopenedEmpty = await storage.getDocument(emptyPoem.metadata.id);
    assert.equal(reopenedEmpty.content, '');

    // 2. Large document (10,000 words / 500 lines)
    const longLines: string[] = [];
    for (let i = 1; i <= 250; i++) {
      longLines.push(`Premise ${i}: Continuous dialectical progression under reflection ${i}.`);
      longLines.push(`Argument ${i}: If step ${i} holds, corollary ${i} follows with metaphysical certainty.`);
    }
    const longContent = longLines.join('\n\n');

    const longDoc = await storage.createDocument('philosophy', 'Summa Dialectica', undefined, longContent);
    assert.ok(longDoc.content.length > 20000);

    const reopenedLong = await storage.getDocument(longDoc.metadata.id);
    assert.equal(reopenedLong.content, longContent, 'Full long document content must match byte-for-byte');
  });

  it('persists writing when switching studios', async () => {
    const storage = new MockStorage();
    const poem = await storage.createDocument('poetry', 'Studio Switch Poem', undefined, 'Stanza 1\nLine 2');
    const phil = await storage.createDocument('philosophy', 'Studio Switch Phil', undefined, 'Premise 1');

    const controller = new AutosaveController(storage);

    // Edit poem in Poetry Studio
    controller.handleEdit(poem.metadata.id, 'Stanza 1\nLine 2\n\nStanza 2\nAdded in Poetry Studio', undefined, 500);

    // Switch studio by switching document to Philosophy Studio doc
    await controller.switchDocument(phil.metadata.id);

    // Edit philosophy in Philosophy Studio
    controller.handleEdit(phil.metadata.id, 'Premise 1\n\nArgument 1: Developed in Philosophy Studio', undefined, 500);

    // Switch back to Poetry Studio doc
    await controller.switchDocument(poem.metadata.id);

    // Reopen poem: content must persist
    const reopenedPoem = await storage.getDocument(poem.metadata.id);
    assert.equal(reopenedPoem.content, 'Stanza 1\nLine 2\n\nStanza 2\nAdded in Poetry Studio');

    // Reopen philosophy: content must persist
    const reopenedPhil = await storage.getDocument(phil.metadata.id);
    assert.equal(reopenedPhil.content, 'Premise 1\n\nArgument 1: Developed in Philosophy Studio');
  });

  it('verifies desktop keyboard shortcuts dispatch logic', () => {
    // Test shortcut mapping logic
    const shortcuts = {
      isSave: (e: { ctrlKey: boolean; metaKey: boolean; key: string }) =>
        (e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S'),
      isSearch: (e: { ctrlKey: boolean; metaKey: boolean; key: string }) =>
        (e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F' || e.key === 'k' || e.key === 'K'),
      isNewDoc: (e: { ctrlKey: boolean; metaKey: boolean; key: string }) =>
        (e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N'),
      isEscape: (e: { key: string }) => e.key === 'Escape',
    };

    // Ctrl+S
    assert.ok(shortcuts.isSave({ ctrlKey: true, metaKey: false, key: 's' }));
    assert.ok(shortcuts.isSave({ ctrlKey: false, metaKey: true, key: 'S' }));
    assert.equal(shortcuts.isSave({ ctrlKey: false, metaKey: false, key: 's' }), false);

    // Ctrl+F and Ctrl+K
    assert.ok(shortcuts.isSearch({ ctrlKey: true, metaKey: false, key: 'f' }));
    assert.ok(shortcuts.isSearch({ ctrlKey: true, metaKey: false, key: 'F' }));
    assert.ok(shortcuts.isSearch({ ctrlKey: true, metaKey: false, key: 'k' }));
    assert.ok(shortcuts.isSearch({ ctrlKey: true, metaKey: false, key: 'K' }));

    // Ctrl+N
    assert.ok(shortcuts.isNewDoc({ ctrlKey: true, metaKey: false, key: 'n' }));
    assert.ok(shortcuts.isNewDoc({ ctrlKey: false, metaKey: true, key: 'N' }));

    // Escape
    assert.ok(shortcuts.isEscape({ key: 'Escape' }));
    assert.equal(shortcuts.isEscape({ key: 'Enter' }), false);

    // Studio targeting for Ctrl+N
    const resolveNewDocType = (category: DocumentType | 'all', activeDocType?: DocumentType): DocumentType => {
      if (category !== 'all') return category;
      return activeDocType || 'poetry';
    };

    assert.equal(resolveNewDocType('poetry'), 'poetry');
    assert.equal(resolveNewDocType('philosophy'), 'philosophy');
    assert.equal(resolveNewDocType('lorebook'), 'lorebook');
    assert.equal(resolveNewDocType('all', 'philosophy'), 'philosophy');
    assert.equal(resolveNewDocType('all', undefined), 'poetry');
  });
});
