import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MockStorage, api, invokeTauri } from '../src/services/api';
import { CommandQueue, ExitCoordinator, MutationQueue, SaveCoordinator, flushWorkspace } from '../src/services/autosave';
import { applyOrganization, defaultFilters, normalizeTags, preserveWorkshop, selectLibrary, workshop } from '../src/utils/organization';
import { DocumentOrganization } from '../src/components/common/DocumentOrganization';
import { TagManager } from '../src/components/common/TagManager';
import type { DocumentMetadata } from '../src/types';

const fixtures = (): DocumentMetadata[] => [
  { id: 'a', title: 'Apple', doc_type: 'poetry', relative_path: 'Poetry/a.md', created_at: '2026-01-01', updated_at: '2026-04-01', tags: ['shared', 'verse'], metadata_json: JSON.stringify({ poetic_form: 'Sonnet', _workshop: { favorite: true, last_opened_at: '2026-03-01T00:00:00Z' } }) },
  { id: 'b', title: 'Banana', doc_type: 'philosophy', relative_path: 'Philosophy/b.md', created_at: '2026-02-01', updated_at: '2026-03-01', tags: ['shared', 'logic'], metadata_json: JSON.stringify({ composition_mode: 'structured', _workshop: { favorite: true, last_opened_at: '2026-05-01T00:00:00Z' } }) },
  { id: 'c', title: 'Cherry', doc_type: 'lorebook', relative_path: 'Lorebooks/c.md', created_at: '2026-03-01', updated_at: '2026-02-01', tags: ['shared'] },
];

test('tag assignment creates, normalizes and removes tags without touching bodies or studio metadata', async () => {
  const storage = new MockStorage();
  for (const type of ['poetry', 'philosophy', 'lorebook'] as const) {
    const document = await storage.createDocument(type, 'Fixture', undefined, '  body\n\n思想 🧠\n', JSON.stringify({ custom: { keep: true }, chapter: 'II' }), ['old']);
    const before = JSON.stringify(document);
    const updated = await storage.updateOrganization(document.metadata.id, { tags: [' old ', 'new', 'new', ''] });
    assert.deepEqual(updated.tags, ['old', 'new']);
    assert.equal(updated.updated_at, JSON.parse(before).metadata.updated_at);
    await storage.updateOrganization(document.metadata.id, { tags: ['new'] });
    const read = await storage.getDocument(document.metadata.id);
    assert.equal(read.content, JSON.parse(before).content);
    assert.equal(read.metadata.metadata_json, JSON.parse(before).metadata.metadata_json);
    assert.deepEqual(read.metadata.tags, ['new']);
  }
  assert.deepEqual(normalizeTags(['same', ' same ', '', 'Same']), ['same', 'Same']);
});

test('library tag rename merges assignments and deletion removes the tag across studios', async () => {
  const storage = new MockStorage();
  storage.documents = fixtures().map(metadata => ({ metadata, content: 'original body' }));
  const merged = await storage.manageTag('verse', 'shared');
  assert.equal(merged.updated.length, 1);
  assert.deepEqual(merged.updated[0].tags, ['shared']);
  const renamed = await storage.manageTag('shared', 'common');
  assert.equal(renamed.updated.length, 3);
  const removed = await storage.manageTag('common');
  assert.equal(removed.updated.length, 3);
  assert.ok(storage.documents.every(doc => !doc.metadata.tags.includes('common') && doc.content === 'original body'));
  assert.ok(!(await storage.listTags()).includes('common'));
  await assert.rejects(storage.manageTag('logic', '   '));
});

test('favorites and actual-open history survive stale studio saves independently of modification dates', async () => {
  const storage = new MockStorage();
  const document = await storage.createDocument('philosophy', 'Favorite', undefined, 'reason', JSON.stringify({ chapter: 'I', custom: 42 }));
  const oldMetadata = document.metadata.metadata_json!;
  const originalModified = document.metadata.updated_at;
  await storage.getDocument(document.metadata.id); // reads and searches never record opens implicitly
  assert.equal(workshop(document.metadata).last_opened_at, undefined);
  await storage.updateOrganization(document.metadata.id, { favorite: true, opened: true });
  assert.equal(document.metadata.updated_at, originalModified);
  const opened = workshop(document.metadata).last_opened_at;
  await storage.saveDocument(document.metadata.id, 'latest writing', undefined, undefined, oldMetadata);
  const read = await storage.getDocument(document.metadata.id);
  assert.equal(read.content, 'latest writing');
  assert.deepEqual(workshop(read.metadata), { favorite: true, last_opened_at: opened });
  assert.equal(JSON.parse(read.metadata.metadata_json!).custom, 42);
  await storage.updateOrganization(document.metadata.id, { favorite: false });
  assert.equal(workshop(await storage.getDocument(document.metadata.id).then(doc => doc.metadata)).favorite, false);
});

test('all sort orders are deterministic and do not mutate the source array', () => {
  const documents = fixtures();
  const ids = (sort: typeof defaultFilters.sort) => selectLibrary(documents, { ...defaultFilters, sort }).map(doc => doc.id);
  assert.deepEqual(ids('modified'), ['a', 'b', 'c']);
  assert.deepEqual(ids('created'), ['c', 'b', 'a']);
  assert.deepEqual(ids('title-asc'), ['a', 'b', 'c']);
  assert.deepEqual(ids('title-desc'), ['c', 'b', 'a']);
  assert.deepEqual(documents.map(doc => doc.id), ['a', 'b', 'c']);
});

test('studio, multiple tags, Favorites, sorting and full-body search result IDs compose', () => {
  const documents = fixtures();
  const filters = { ...defaultFilters, studio: 'philosophy' as const, tags: ['shared', 'logic'], view: 'favorites' as const, query: 'body-only term' };
  const results = [{ id: 'b' }] as any;
  assert.deepEqual(selectLibrary(documents, filters, results).map(doc => doc.id), ['b']);
  assert.equal(selectLibrary(documents, { ...filters, tags: ['shared', 'verse'] }, results).length, 0);
  assert.equal(selectLibrary(documents, filters, []).length, 0);
  assert.equal(selectLibrary(documents, { ...defaultFilters, query: '  APP  ' }).length, 1);
});

test('Recent uses only valid actual opening history, ordered by opening rather than editing', () => {
  const documents = fixtures();
  assert.deepEqual(selectLibrary(documents, { ...defaultFilters, view: 'recent' }).map(doc => doc.id), ['b', 'a']);
  assert.deepEqual(selectLibrary(documents, { ...defaultFilters, view: 'recent', tags: ['verse'] }).map(doc => doc.id), ['a']);
  assert.equal(workshop({ metadata_json: '{broken' }).favorite, false);
  assert.equal(workshop({ metadata_json: '{"_workshop":{"last_opened_at":"bad"}}' }).last_opened_at, undefined);
});

test('organization updates preserve legacy metadata and fail safely on namespace collisions', () => {
  const legacy = fixtures()[2];
  assert.deepEqual(workshop(legacy), { favorite: false, last_opened_at: undefined });
  const updated = applyOrganization(legacy, { favorite: true });
  assert.equal(updated.relative_path, legacy.relative_path);
  assert.equal(updated.created_at, legacy.created_at);
  assert.throws(() => applyOrganization({ ...legacy, metadata_json: '{"_workshop":"keep"}' }, { favorite: true }));
  assert.equal(preserveWorkshop('{"chapter":"II"}', '{"_workshop":{"favorite":true,"future":42}}'), '{"chapter":"II","_workshop":{"favorite":true,"future":42}}');
});

test('IPC adapters use metadata-only patch and camelCase tag-management arguments', async () => {
  const document = await api.createDocument('poetry', 'IPC fixture', undefined, 'body');
  const updated = await invokeTauri<DocumentMetadata>('update_organization', { id: document.metadata.id, patch: { tags: ['ipc'], favorite: true } });
  assert.equal(workshop(updated).favorite, true);
  const report = await api.manageTag('ipc', 'ipc-renamed');
  assert.ok(report.updated.some(doc => doc.id === document.metadata.id && doc.tags.includes('ipc-renamed')));
  assert.equal((await api.getDocument(document.metadata.id)).content, 'body');
});

test('body search can be composed with tags and favorite status without recording an opening', async () => {
  const storage = new MockStorage();
  const document = await storage.createDocument('lorebook', 'A title', undefined, 'A hidden moon', undefined, ['sky']);
  await storage.updateOrganization(document.metadata.id, { favorite: true });
  const results = await storage.searchDocuments('hidden');
  const selected = selectLibrary(await storage.listDocuments(), { ...defaultFilters, query: 'hidden', tags: ['sky'], view: 'favorites' }, results);
  assert.deepEqual(selected.map(doc => doc.id), [document.metadata.id]);
  assert.equal(workshop(selected[0]).last_opened_at, undefined);
});

test('real shared document controls render consistent tags and favorite state', () => {
  for (const doc_type of ['poetry', 'philosophy', 'lorebook'] as const) {
    const html = renderToStaticMarkup(React.createElement(DocumentOrganization, { document: { ...fixtures()[0], doc_type }, tags: ['shared'], busy: false, onUpdate: async () => true }));
    assert.match(html, /Remove from favorites/);
    assert.match(html, /Remove tag shared/);
    assert.match(html, /New document tags/);
  }
  const manager = renderToStaticMarkup(React.createElement(TagManager, { tags: ['shared'], busy: false, onClose: () => {}, onChange: async () => true }));
  assert.match(manager, /Rename tag shared/);
  assert.match(manager, /Manage tags/);
});

test('failed metadata actions block exit, stay queued, retry, and support explicit cancellation', async () => {
  const queue = new MutationQueue();
  const exit = new ExitCoordinator();
  let fail = true;
  let exited = false;
  assert.equal(await queue.enqueue(async () => { if (fail) throw new Error('disk failed'); }), false);
  assert.equal(queue.pendingCount, 1);
  assert.equal(await exit.run(() => flushWorkspace(queue, async () => true), async () => { exited = true; }), false);
  assert.equal(exited, false);
  fail = false;
  assert.equal(await exit.run(() => flushWorkspace(queue, async () => true), async () => { exited = true; }), true);
  assert.equal(exited, true);
  assert.equal(queue.pendingCount, 0);
  await queue.enqueue(async () => { throw new Error('failed'); });
  assert.equal(queue.discard(), true);
  assert.equal(queue.pendingCount, 0);
});

test('immediate exit awaits metadata enqueued during an in-flight writing save', async () => {
  const mutations = new MutationQueue();
  const commands = new CommandQueue();
  const writing = new SaveCoordinator();
  const order: string[] = [];
  let releaseBody!: () => void;
  let releaseMetadata!: () => void;
  const bodyGate = new Promise<void>(resolve => { releaseBody = resolve; });
  const metadataGate = new Promise<void>(resolve => { releaseMetadata = resolve; });
  let hasBody = true;
  const close = new ExitCoordinator().run(() => flushWorkspace(mutations, () => writing.flush(() => commands.run(async () => {
    if (hasBody) { await bodyGate; order.push('writing'); hasBody = false; }
    return 'saved';
  }))), async () => { order.push('exit'); });
  await new Promise(resolve => setTimeout(resolve, 10));
  const favorite = mutations.enqueue(() => commands.run(async () => { await metadataGate; order.push('favorite'); }));
  releaseBody();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(order, ['writing']);
  assert.equal(mutations.discard(), false); // never discard an active write
  releaseMetadata();
  assert.equal(await favorite, true);
  assert.equal(await close, true);
  assert.deepEqual(order, ['writing', 'favorite', 'exit']);
});

test('managing an unused tag preserves unrelated catalog entries', async () => {
  const storage = new MockStorage();
  storage.tags.add('unused');
  storage.tags.add('unrelated');
  const renamed = await storage.manageTag('unused', 'renamed-unused');
  assert.equal(renamed.updated.length, 0);
  assert.ok((await storage.listTags()).includes('renamed-unused'));
  assert.ok((await storage.listTags()).includes('unrelated'));
  assert.ok(!(await storage.listTags()).includes('unused'));
  await storage.manageTag('renamed-unused');
  assert.ok(!(await storage.listTags()).includes('renamed-unused'));
  assert.ok((await storage.listTags()).includes('unrelated'));
});

test('an empty flush cannot strand a metadata action enqueued in the same turn', async () => {
  const queue = new MutationQueue();
  const empty = queue.flush();
  let applied = false;
  const change = queue.enqueue(async () => { applied = true; });
  assert.equal(await change, true);
  assert.equal(await empty, true);
  assert.equal(applied, true);
  assert.equal(queue.pendingCount, 0);
});
