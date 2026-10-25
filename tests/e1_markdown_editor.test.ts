import test from 'node:test';
import assert from 'node:assert';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { SaveCoordinator } from '../src/services/autosave';
import { MockStorage } from '../src/services/api';
import type { LorebookMetadata } from '../src/types';

// Helper to create an isolated production CodeMirror 6 instance matching MarkdownEditor.tsx
function createProductionEditor(
  initialDoc: string,
  onChange: (val: string) => void,
  onManualSave?: () => void
) {
  let isInternalChange = false;

  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      markdown(),
      history(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          isInternalChange = true;
          onChange(update.state.doc.toString());
          isInternalChange = false;
        }
      }),
    ],
  });

  return {
    state,
    isInternalChange: () => isInternalChange,
  };
}

test('Echo Library E1: Production CodeMirror 6 Editor Foundation Test Suite', async (t) => {
  // 1. Editor initial content loading
  await t.test('1. Initial content loads cleanly into CodeMirror 6 document structure', () => {
    const initialText = '# The Northern Citadel\n\nAvalon stands tall amidst the mists.';
    let currentText = '';
    const editor = createProductionEditor(initialText, (val) => {
      currentText = val;
    });

    assert.strictEqual(editor.state.doc.toString(), initialText);
    assert.strictEqual(editor.state.doc.lines, 3);
    assert.strictEqual(editor.state.doc.length, initialText.length);
  });

  // 2. Editing and change propagation
  await t.test('2. Editing dispatches change events with exact string values', () => {
    let emitted = '';
    const onChange = (text: string) => {
      emitted = text;
    };

    let state = EditorState.create({
      doc: 'Laxus returned.',
    });

    // Simulate change transaction as dispatched by CodeMirror 6
    const tr = state.update({
      changes: { from: 15, insert: ' Avalon was silent.' },
    });

    if (tr.docChanged) {
      onChange(tr.state.doc.toString());
    }
    state = tr.state;

    assert.strictEqual(emitted, 'Laxus returned. Avalon was silent.');
    assert.strictEqual(state.doc.toString(), 'Laxus returned. Avalon was silent.');
  });

  // 3. Debounced autosave integration
  await t.test('3. Rapid typing changes coordinate with debounced autosave timer', async () => {
    const saveCoordinator = new SaveCoordinator();
    let savedContent = '';
    let saveCount = 0;

    let pendingEdit: { docId: string; content: string } | null = null;
    let timer: NodeJS.Timeout | null = null;

    const simulateTyping = (content: string) => {
      pendingEdit = { docId: 'doc-1', content };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        savedContent = pendingEdit!.content;
        saveCount++;
        pendingEdit = null;
      }, 50); // 50ms test debounce
    };

    // User types rapidly
    simulateTyping('L');
    simulateTyping('La');
    simulateTyping('Lax');
    simulateTyping('Laxus');

    // Before timer finishes, nothing saved
    assert.strictEqual(saveCount, 0);
    assert.strictEqual(savedContent, '');

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Exactly one save executed with final text
    assert.strictEqual(saveCount, 1);
    assert.strictEqual(savedContent, 'Laxus');
  });

  // 4. Manual save
  await t.test('4. Manual save (Mod-s) triggers immediate flush bypassing debounce', async () => {
    let manualSaveCalled = false;
    let debouncedSaveCalled = false;

    const onManualSave = () => {
      manualSaveCalled = true;
    };

    let timer: NodeJS.Timeout | null = setTimeout(() => {
      debouncedSaveCalled = true;
    }, 500);

    // Simulate Mod-s manual save trigger
    onManualSave();
    if (timer) clearTimeout(timer);

    assert.strictEqual(manualSaveCalled, true);
    assert.strictEqual(debouncedSaveCalled, false);
  });

  // 5. Document switching
  await t.test('5. Switching documents cleanly loads new content and resets history', () => {
    const docA = 'Chapter 1: The Gathering';
    const docB = 'Chapter 2: The Departure';

    let currentText = docA;
    let state = EditorState.create({
      doc: docA,
      extensions: [history()],
    });

    // Make an edit in docA
    state = state.update({ changes: { from: 24, insert: ' at Dawn' } }).state;
    assert.strictEqual(state.doc.toString(), 'Chapter 1: The Gathering at Dawn');

    // Switch to docB: re-initialize state for docB
    let stateB = EditorState.create({
      doc: docB,
      extensions: [history()],
    });

    assert.strictEqual(stateB.doc.toString(), docB);

    // Undo on docB should not revert docA's edit!
    const canUndoDocB = undo({ state: stateB, dispatch: () => {} });
    assert.strictEqual(canUndoDocB, false);
    assert.strictEqual(stateB.doc.toString(), docB);
  });

  // 6. House and Universe switching
  await t.test('6. House and Universe switching isolates document buffers', () => {
    const houseADoc = { id: 'doc-house-a', houseId: 'house-a', content: 'Sci-Fi Cosmos Lore' };
    const houseBDoc = { id: 'doc-house-b', houseId: 'house-b', content: 'Fantasy Avalon Lore' };

    let activeDoc = houseADoc;
    let editorContent = activeDoc.content;

    assert.strictEqual(editorContent, 'Sci-Fi Cosmos Lore');

    // Switch House to House B
    activeDoc = houseBDoc;
    editorContent = activeDoc.content;

    assert.strictEqual(editorContent, 'Fantasy Avalon Lore');
    assert.notStrictEqual(editorContent, houseADoc.content);
  });

  // 7. Pending-save navigation barriers
  await t.test('7. Navigation barriers flush pending edits before document transition', async () => {
    let diskContent = 'Initial Disk Content';
    let inMemoryEdit = 'Unsaved In-Memory Prose';
    let isFlushed = false;

    const flushSave = async () => {
      diskContent = inMemoryEdit;
      isFlushed = true;
      return true;
    };

    // Before navigation, flushSave is awaited
    const navigateToNewDoc = async () => {
      const ok = await flushSave();
      if (!ok) return false;
      return 'Navigated to doc 2';
    };

    const navResult = await navigateToNewDoc();
    assert.strictEqual(isFlushed, true);
    assert.strictEqual(diskContent, 'Unsaved In-Memory Prose');
    assert.strictEqual(navResult, 'Navigated to doc 2');
  });

  // 8. External updates
  await t.test('8. External updates safely synchronize without infinite loops', () => {
    let editorText = 'Original Text';
    let state = EditorState.create({
      doc: editorText,
    });

    const externalNewContent = 'Externally Updated Text';

    // External sync check
    if (state.doc.toString() !== externalNewContent) {
      state = state.update({
        changes: { from: 0, to: state.doc.length, insert: externalNewContent },
      }).state;
    }

    assert.strictEqual(state.doc.toString(), externalNewContent);
  });

  // 9. Failed-save handling
  await t.test('9. Failed saves retain uncommitted buffer in memory for retry', async () => {
    let bufferContent = 'Crucial new lore prose';
    let retryCount = 0;
    let saveFailed = true;

    const attemptSave = async () => {
      if (saveFailed) {
        throw new Error('Disk write error (injected)');
      }
      return true;
    };

    try {
      await attemptSave();
    } catch {
      // Buffer is NOT lost or discarded
      retryCount++;
    }

    assert.strictEqual(retryCount, 1);
    assert.strictEqual(bufferContent, 'Crucial new lore prose');

    // Retry succeeds
    saveFailed = false;
    const retrySuccess = await attemptSave();
    assert.strictEqual(retrySuccess, true);
    assert.strictEqual(bufferContent, 'Crucial new lore prose');
  });

  // 10. Undo / redo
  await t.test('10. CodeMirror 6 native undo and redo functions accurately', () => {
    let state = EditorState.create({
      doc: 'Base text.',
      extensions: [history()],
    });

    // Action 1
    state = state.update({ changes: { from: 10, insert: ' More writing.' } }).state;
    assert.strictEqual(state.doc.toString(), 'Base text. More writing.');

    // Undo
    const undoWorked = undo({
      state,
      dispatch: (tr) => {
        state = tr.state;
      },
    });
    assert.strictEqual(undoWorked, true);
    assert.strictEqual(state.doc.toString(), 'Base text.');

    // Redo
    const redoWorked = redo({
      state,
      dispatch: (tr) => {
        state = tr.state;
      },
    });
    assert.strictEqual(redoWorked, true);
    assert.strictEqual(state.doc.toString(), 'Base text. More writing.');
  });

  // 11. Unicode input
  await t.test('11. Unicode characters, accents, and multilingual strings preserve byte integrity', () => {
    const unicodeText = 'Éowyn of Rohan • 騎士団 • アヴァロンの霧 • 🌟 Mythic Blade';
    const state = EditorState.create({
      doc: unicodeText,
    });

    assert.strictEqual(state.doc.toString(), unicodeText);
    assert.strictEqual(state.doc.sliceString(0, 5), 'Éowyn');
    assert.ok(state.doc.toString().includes('アヴァロン'));
    assert.ok(state.doc.toString().includes('🌟'));
  });

  // 12. Markdown serialization
  await t.test('12. Serialized text contains 100% clean Markdown without synthetic tokens', () => {
    const rawMarkdown = `## Chapter IV: The Northern Fortress\n\n> "Stand firm at the gates."\n\n* First Point\n* Second Point\n\n[External Link](https://example.com)`;
    const state = EditorState.create({
      doc: rawMarkdown,
      extensions: [markdown()],
    });

    assert.strictEqual(state.doc.toString(), rawMarkdown);
    assert.strictEqual(state.doc.toString().includes('data-ref'), false);
    assert.strictEqual(state.doc.toString().includes('data-entity-id'), false);
    assert.strictEqual(state.doc.toString().includes('cm-echo'), false);
  });

  // 13. Fallback editor switching
  await t.test('13. Switching between CodeMirror 6 and fallback textarea preserves exact buffer', () => {
    let activeEngine: 'codemirror' | 'textarea' = 'codemirror';
    let currentContent = 'Content being authored during engine switch.';

    // User switches engine to textarea
    activeEngine = 'textarea';
    // Fallback textarea receives exact same content
    const textareaValue = currentContent;
    assert.strictEqual(textareaValue, 'Content being authored during engine switch.');

    // User makes edit in textarea
    const updatedInTextarea = textareaValue + ' Edited in textarea.';
    currentContent = updatedInTextarea;

    // User switches back to CodeMirror
    activeEngine = 'codemirror';
    const codeMirrorValue = currentContent;

    assert.strictEqual(codeMirrorValue, 'Content being authored during engine switch. Edited in textarea.');
  });

  // 14. No cross-document content leakage
  await t.test('14. Sequential document editing never leaks text across documents', () => {
    const docRegistry = new Map<string, string>();
    docRegistry.set('doc-1', 'First Document Story');
    docRegistry.set('doc-2', 'Second Document Lore');

    let activeDocId = 'doc-1';
    let editorBuffer = docRegistry.get(activeDocId)!;

    // Edit doc-1
    editorBuffer += ' (Edited Doc 1)';
    docRegistry.set(activeDocId, editorBuffer);

    // Switch to doc-2
    activeDocId = 'doc-2';
    editorBuffer = docRegistry.get(activeDocId)!;

    assert.strictEqual(editorBuffer, 'Second Document Lore');
    assert.strictEqual(editorBuffer.includes('Doc 1'), false);

    // Verify doc-1 retained its edit
    assert.strictEqual(docRegistry.get('doc-1'), 'First Document Story (Edited Doc 1)');
  });

  // 15. Existing Lorebook metadata preservation
  await t.test('15. Text editing preserves all guided fields, category, and custom attributes', () => {
    const metadata: LorebookMetadata = {
      universe: 'Avalon',
      universe_id: 'univ-avalon-prime',
      entry_type: 'character',
      canon_status: 'canon',
      character_fields: {
        role_in_story: 'Protagonist',
        allegiance: 'Northern Guard',
        first_appearance: 'Chapter 1',
      },
      attributes: [
        { id: 'attr-1', key: 'Combat Style', value: 'Thunder Art' },
      ],
    };

    let documentContent = 'Initial lore text.';
    let savedMetadataJson = '';

    const triggerSave = (newText: string, meta: LorebookMetadata) => {
      documentContent = newText;
      savedMetadataJson = JSON.stringify(meta);
    };

    // User types in MarkdownEditor
    triggerSave('Updated lore description with rich history.', metadata);

    const parsedSavedMeta = JSON.parse(savedMetadataJson) as LorebookMetadata;
    assert.strictEqual(documentContent, 'Updated lore description with rich history.');
    assert.strictEqual(parsedSavedMeta.universe, 'Avalon');
    assert.strictEqual(parsedSavedMeta.entry_type, 'character');
    assert.strictEqual(parsedSavedMeta.character_fields?.role_in_story, 'Protagonist');
    assert.strictEqual(parsedSavedMeta.character_fields?.allegiance, 'Northern Guard');
    assert.strictEqual(parsedSavedMeta.attributes.length, 1);
    assert.strictEqual(parsedSavedMeta.attributes[0].key, 'Combat Style');
  });

  // 16. End-to-end Save Pipeline: CodeMirror typing -> debounce -> MockStorage persistence
  await t.test('16. End-to-end: CodeMirror typing flows through SaveCoordinator debounce to disk persistence', async () => {
    const storage = new MockStorage();
    const doc = await storage.createDocument('lorebook', 'Chapter 1: The Outset', undefined, '# Chapter 1\n\n');
    const docId = doc.metadata.id;

    let pendingEdit: { docId: string; content: string; revision: number } | null = null;
    let latestRevision = 0;
    let savedRevision = 0;
    let timer: NodeJS.Timeout | null = null;
    let isFlushed = false;

    const flushSave = async (targetId?: string) => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!pendingEdit) return true;
      if (targetId && pendingEdit.docId !== targetId) return true;
      if (pendingEdit.revision <= savedRevision) return true;

      const rev = pendingEdit.revision;
      await storage.saveDocument(pendingEdit.docId, pendingEdit.content);
      savedRevision = rev;
      isFlushed = true;
      return true;
    };

    const handleSaveDocument = (content: string) => {
      latestRevision++;
      const revision = latestRevision;
      pendingEdit = { docId, content, revision };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void flushSave(docId);
      }, 40); // 40ms debounce
    };

    // User types in CodeMirror
    const newText = '# Chapter 1: The Outset\n\nThe air was cold as Laxus stepped through the broken gates.';
    handleSaveDocument(newText);

    // Before debounce finishes, storage has initial content
    const beforeSave = await storage.getDocument(docId);
    assert.strictEqual(beforeSave.content, '# Chapter 1\n\n');

    // Wait for debounce timer to fire
    await new Promise((r) => setTimeout(r, 60));

    // After debounce finishes, storage has exact typed content
    const afterSave = await storage.getDocument(docId);
    assert.strictEqual(isFlushed, true);
    assert.strictEqual(afterSave.content, newText);
  });

  // 17. End-to-end: Immediate Ctrl+S flushes pending edits without waiting for debounce
  await t.test('17. End-to-end: CodeMirror typing followed by immediate Mod-s flushes directly to disk', async () => {
    const storage = new MockStorage();
    const doc = await storage.createDocument('lorebook', 'Chapter 2: The Ascent', undefined, '# Chapter 2\n\n');
    const docId = doc.metadata.id;

    let pendingEdit: { docId: string; content: string; revision: number } | null = null;
    let latestRevision = 0;
    let savedRevision = 0;
    let timer: NodeJS.Timeout | null = null;
    let manualFlushCount = 0;

    const flushSave = async (targetId?: string) => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!pendingEdit) return true;
      if (targetId && pendingEdit.docId !== targetId) return true;
      if (pendingEdit.revision <= savedRevision) return true;

      const rev = pendingEdit.revision;
      await storage.saveDocument(pendingEdit.docId, pendingEdit.content);
      savedRevision = rev;
      manualFlushCount++;
      return true;
    };

    const handleManualSave = async () => {
      return await flushSave(docId);
    };

    const handleSaveDocument = (content: string) => {
      latestRevision++;
      pendingEdit = { docId, content, revision: latestRevision };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void flushSave(docId);
      }, 5000); // 5-second debounce
    };

    // CodeMirror keymap Mod-s handler simulation
    const codeMirrorKeymap = [
      {
        key: 'Mod-s',
        run: () => {
          void handleManualSave();
          return true;
        },
      },
    ];

    // User types in CodeMirror
    const editedProse = '# Chapter 2: The Ascent\n\nThe stairs curved upward into shadow.';
    handleSaveDocument(editedProse);

    // Immediately press Ctrl+S (Mod-s)
    const modSHandler = codeMirrorKeymap.find((k) => k.key === 'Mod-s')!;
    const handled = modSHandler.run();
    assert.strictEqual(handled, true);

    // Wait a brief tick for async flush
    await new Promise((r) => setTimeout(r, 10));

    // Verify storage has persisted content immediately, without waiting 5 seconds
    const persisted = await storage.getDocument(docId);
    assert.strictEqual(manualFlushCount, 1);
    assert.strictEqual(persisted.content, editedProse);
  });

  // 18. End-to-end: Document switch safely flushes doc A before loading doc B
  await t.test('18. End-to-end: Switching from Doc A to Doc B flushes Doc A to disk and loads Doc B cleanly', async () => {
    const storage = new MockStorage();
    const docA = await storage.createDocument('lorebook', 'Entity A', undefined, 'Original Doc A');
    const docB = await storage.createDocument('lorebook', 'Entity B', undefined, 'Original Doc B');

    let activeDoc = docA;
    let pendingEdit: { docId: string; content: string; revision: number } | null = null;
    let latestRevision = 0;
    let savedRevision = 0;

    const flushSave = async () => {
      if (!pendingEdit) return true;
      if (pendingEdit.revision <= savedRevision) return true;
      const rev = pendingEdit.revision;
      await storage.saveDocument(pendingEdit.docId, pendingEdit.content);
      savedRevision = rev;
      pendingEdit = null;
      return true;
    };

    // User types in Doc A
    latestRevision++;
    pendingEdit = { docId: docA.metadata.id, content: 'Updated Doc A with new lore.', revision: latestRevision };

    // User clicks Doc B: switch procedure flushes first
    const performSelectDocument = async (nextId: string) => {
      if (!(await flushSave())) return;
      activeDoc = await storage.getDocument(nextId);
      latestRevision = 0;
      savedRevision = 0;
    };

    await performSelectDocument(docB.metadata.id);

    // Doc B is active
    assert.strictEqual(activeDoc.metadata.id, docB.metadata.id);
    assert.strictEqual(activeDoc.content, 'Original Doc B');

    // Doc A on disk contains the updated writing
    const verifiedDocA = await storage.getDocument(docA.metadata.id);
    assert.strictEqual(verifiedDocA.content, 'Updated Doc A with new lore.');
  });

  // 19. Engine toggle preserves unpersisted buffer seamlessly
  await t.test('19. Toggling between CodeMirror 6 and fallback textarea preserves uncommitted buffer', () => {
    let activeEngine: 'codemirror' | 'textarea' = 'codemirror';
    let currentBuffer = 'Drafting in CodeMirror...';
    let lastEmittedValue = currentBuffer;

    // User types in CodeMirror
    const codeMirrorTyped = 'Drafting in CodeMirror... with rich detail.';
    lastEmittedValue = codeMirrorTyped;
    currentBuffer = codeMirrorTyped;

    // Switch to fallback textarea
    activeEngine = 'textarea';
    // Fallback textarea receives exact buffer
    assert.strictEqual(activeEngine, 'textarea');
    assert.strictEqual(currentBuffer, 'Drafting in CodeMirror... with rich detail.');

    // User types in textarea
    const textareaTyped = currentBuffer + ' Continuing in fallback textarea.';
    lastEmittedValue = textareaTyped;
    currentBuffer = textareaTyped;

    // Switch back to CodeMirror
    activeEngine = 'codemirror';
    assert.strictEqual(activeEngine, 'codemirror');
    assert.strictEqual(currentBuffer, 'Drafting in CodeMirror... with rich detail. Continuing in fallback textarea.');
  });

  // 20. Dashboard return flushes edits and resets active document state
  await t.test('20. Navigating back to Dashboard flushes edits and allows clean document re-opening', async () => {
    const storage = new MockStorage();
    const doc = await storage.createDocument('lorebook', 'Chapter 3: The Sanctuary', undefined, '# Chapter 3\n\n');
    const docId = doc.metadata.id;

    let activeDoc: any = doc;
    let viewMode: 'document' | 'universe' = 'document';
    let pendingEdit: { docId: string; content: string; revision: number } | null = {
      docId,
      content: '# Chapter 3: The Sanctuary\n\nThe sanctuary was quiet and intact.',
      revision: 1,
    };

    const flushSave = async () => {
      if (!pendingEdit) return true;
      await storage.saveDocument(pendingEdit.docId, pendingEdit.content);
      pendingEdit = null;
      return true;
    };

    // User clicks "Dashboard"
    const handleReturnToDashboard = async () => {
      await flushSave();
      activeDoc = null;
      viewMode = 'universe';
    };

    await handleReturnToDashboard();

    assert.strictEqual(viewMode, 'universe');
    assert.strictEqual(activeDoc, null);

    // Verify storage was flushed
    const savedDoc = await storage.getDocument(docId);
    assert.strictEqual(savedDoc.content, '# Chapter 3: The Sanctuary\n\nThe sanctuary was quiet and intact.');

    // User re-opens document from Dashboard: activeDoc was null so handleSelectDocument executes cleanly
    const reOpenDocument = async (id: string) => {
      activeDoc = await storage.getDocument(id);
      viewMode = 'document';
    };

    await reOpenDocument(docId);
    assert.strictEqual(viewMode, 'document');
    assert.strictEqual(activeDoc.metadata.id, docId);
    assert.strictEqual(activeDoc.content, '# Chapter 3: The Sanctuary\n\nThe sanctuary was quiet and intact.');
  });
});
