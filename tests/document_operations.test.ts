import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockStorage, invokeTauri, api } from '../src/services/api';
import type { DocumentType } from '../src/types';

describe('Document Operations & IPC Contract Tests', () => {
  it('creates documents across all three studios with correct doc_type and metadata', async () => {
    const storage = new MockStorage();

    // 1. Poetry Studio Document
    const poem = await storage.createDocument(
      'poetry',
      'Whispering Pines',
      undefined,
      'Wind through the needles,\nTwilight approaches.',
      JSON.stringify({ poetic_form: 'Free Verse' }),
      ['nature', 'twilight']
    );

    assert.equal(poem.metadata.title, 'Whispering Pines');
    assert.equal(poem.metadata.doc_type, 'poetry');
    assert.equal(poem.metadata.relative_path, 'Poetry/Whispering_Pines.md');
    assert.deepEqual(poem.metadata.tags, ['nature', 'twilight']);
    assert.equal(poem.metadata.parent_id, null);
    assert.equal(poem.content, 'Wind through the needles,\nTwilight approaches.');

    // 2. Philosophy Studio Document
    const phil = await storage.createDocument(
      'philosophy',
      'The Phenomenon of Time',
      undefined,
      '<!-- premise -->\nTime is experienced as duration.',
      JSON.stringify({ work_title: 'Phenomenology', chapter: 'IV' }),
      ['time', 'phenomenology']
    );

    assert.equal(phil.metadata.title, 'The Phenomenon of Time');
    assert.equal(phil.metadata.doc_type, 'philosophy');
    assert.equal(phil.metadata.relative_path, 'Philosophy/The_Phenomenon_of_Time.md');
    assert.equal(phil.metadata.metadata_json, JSON.stringify({ work_title: 'Phenomenology', chapter: 'IV' }));

    // 3. Lorebook Studio Document with parent relationship
    const lore = await storage.createDocument(
      'lorebook',
      'Obsidian Gate',
      phil.metadata.id,
      '### Overview\nPortal of black glass.',
      JSON.stringify({ universe: 'Cosmos', entry_type: 'location', canon_status: 'canon', attributes: [] }),
      ['portal', 'glass']
    );

    assert.equal(lore.metadata.title, 'Obsidian Gate');
    assert.equal(lore.metadata.doc_type, 'lorebook');
    assert.equal(lore.metadata.parent_id, phil.metadata.id);
    assert.equal(lore.metadata.relative_path, 'Lorebooks/Obsidian_Gate.md');
  });

  it('filters documents correctly by studio type', async () => {
    const storage = new MockStorage();

    const poetryDocs = await storage.listDocuments('poetry');
    assert.ok(poetryDocs.length >= 1);
    assert.ok(poetryDocs.every(d => d.doc_type === 'poetry'));

    const philDocs = await storage.listDocuments('philosophy');
    assert.ok(philDocs.length >= 1);
    assert.ok(philDocs.every(d => d.doc_type === 'philosophy'));

    const loreDocs = await storage.listDocuments('lorebook');
    assert.ok(loreDocs.length >= 1);
    assert.ok(loreDocs.every(d => d.doc_type === 'lorebook'));

    const allDocs = await storage.listDocuments();
    assert.equal(allDocs.length, poetryDocs.length + philDocs.length + loreDocs.length);
  });

  it('renames document and updates timestamp', async () => {
    const storage = new MockStorage();
    const created = await storage.createDocument('poetry', 'Original Title');

    const renamed = await storage.renameDocument(created.metadata.id, 'Renamed Title');
    assert.equal(renamed.title, 'Renamed Title');

    const fetched = await storage.getDocument(created.metadata.id);
    assert.equal(fetched.metadata.title, 'Renamed Title');
  });

  it('saves document content and metadata updates', async () => {
    const storage = new MockStorage();
    const created = await storage.createDocument('philosophy', 'Axioms');

    const updated = await storage.saveDocument(
      created.metadata.id,
      'Revised axiom content',
      'Updated Axioms',
      ['logic', 'formalism'],
      JSON.stringify({ work_title: 'Principia', chapter: '1' })
    );

    assert.equal(updated.title, 'Updated Axioms');
    assert.deepEqual(updated.tags, ['logic', 'formalism']);
    assert.equal(updated.metadata_json, JSON.stringify({ work_title: 'Principia', chapter: '1' }));

    const fetched = await storage.getDocument(created.metadata.id);
    assert.equal(fetched.content, 'Revised axiom content');
    assert.equal(fetched.metadata.title, 'Updated Axioms');
  });

  it('deletes document and verifies removal', async () => {
    const storage = new MockStorage();
    const created = await storage.createDocument('lorebook', 'Temporary Entry');

    await storage.deleteDocument(created.metadata.id);

    await assert.rejects(
      async () => storage.getDocument(created.metadata.id),
      /not found/i
    );
  });

  it('searches documents by title and content with optional doc_type filtering', async () => {
    const storage = new MockStorage();

    const titleResults = await storage.searchDocuments('Silent Hourglass');
    assert.ok(titleResults.length > 0);
    assert.equal(titleResults[0].match_type, 'title');

    const contentResults = await storage.searchDocuments('temporal distribution');
    assert.ok(contentResults.length > 0);
    assert.equal(contentResults[0].doc_type, 'philosophy');
    assert.equal(contentResults[0].match_type, 'content');

    // Filter by type
    const poetryResults = await storage.searchDocuments('temporal distribution', 'poetry');
    assert.equal(poetryResults.length, 0);
  });

  it('verifies invokeTauri dispatches camelCase IPC contracts and accepts fallback arguments', async () => {
    // 1. Calling create_document with camelCase args (standard Tauri contract)
    const newDoc = await invokeTauri<any, 'create_document'>('create_document', {
      docType: 'poetry' as DocumentType,
      title: 'Sonnet of Autumn',
      parentId: undefined,
      initialContent: 'Golden leaves descend.',
      metadataJson: JSON.stringify({ poetic_form: 'Sonnet' }),
      tags: ['autumn', 'sonnet'],
    });

    assert.equal(newDoc.metadata.title, 'Sonnet of Autumn');
    assert.equal(newDoc.metadata.doc_type, 'poetry');
    assert.deepEqual(newDoc.metadata.tags, ['autumn', 'sonnet']);

    // 2. Calling list_documents with camelCase docType
    const filteredPoetry = await invokeTauri<any[], 'list_documents'>('list_documents', {
      docType: 'poetry' as DocumentType,
    });
    assert.ok(filteredPoetry.some(d => d.title === 'Sonnet of Autumn'));

    // 3. Fallback compatibility with snake_case argument keys
    const fallbackDoc = await invokeTauri<any, 'create_document'>('create_document', {
      doc_type: 'philosophy',
      title: 'Dialectical Inquiry',
      parent_id: undefined,
      initial_content: 'Thesis and Antithesis',
      metadata_json: JSON.stringify({ chapter: '1' }),
      tags: ['dialectic'],
    } as any);

    assert.equal(fallbackDoc.metadata.title, 'Dialectical Inquiry');
    assert.equal(fallbackDoc.metadata.doc_type, 'philosophy');

    // 4. rename_document with camelCase newTitle
    const renamed = await invokeTauri<any, 'rename_document'>('rename_document', {
      id: fallbackDoc.metadata.id,
      newTitle: 'Dialectical Inquiry Revised',
    });
    assert.equal(renamed.title, 'Dialectical Inquiry Revised');
  });

  it('verifies api object methods invoke without errors', async () => {
    const libInfo = await api.getLibraryInfo();
    assert.ok(libInfo.document_count > 0);

    const doc = await api.createDocument(
      'lorebook',
      'API Created Citadel',
      undefined,
      'Overview content',
      JSON.stringify({ canon_status: 'canon' }),
      ['citadel']
    );
    assert.equal(doc.metadata.title, 'API Created Citadel');
    assert.equal(doc.metadata.doc_type, 'lorebook');

    const fetched = await api.getDocument(doc.metadata.id);
    assert.equal(fetched.metadata.id, doc.metadata.id);

    const updated = await api.saveDocument(
      doc.metadata.id,
      'Updated overview content',
      'API Citadel Renamed',
      ['citadel', 'updated']
    );
    assert.equal(updated.title, 'API Citadel Renamed');

    await api.deleteDocument(doc.metadata.id);
  });
});
