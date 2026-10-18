import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhilosophyStudio } from '../src/components/studios/PhilosophyStudio';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockStorage } from '../src/services/api';
import { SaveCoordinator } from '../src/services/autosave';
import { CLASSIFICATIONS, compositionMode, parsePhilosophy, philosophyEdit, readPhilosophyMetadata, switchPhilosophyMode } from '../src/utils/philosophy';
import type { PhilosophyClassification } from '../src/types';

const legacy = '<!-- premise -->\nA reason.\n\n<!-- objection -->\nA challenge.\n\nUnclassified prose.';

test('new empty Philosophy documents default to freeform without a template', async () => {
  const storage = new MockStorage();
  const doc = await storage.createDocument('philosophy', 'Thinking');
  assert.equal(doc.content, '');
  assert.equal(compositionMode(readPhilosophyMetadata(doc.metadata.metadata_json)), 'freeform');
});

test('legacy classified and unclassified documents open structured, with original order', () => {
  assert.equal(compositionMode({}), 'structured');
  assert.deepEqual(parsePhilosophy(legacy, {}).map(p => [p.classification, p.text]), [
    ['premise', 'A reason.'], ['objection', 'A challenge.'], ['prose', 'Unclassified prose.'],
  ]);
  assert.equal(parsePhilosophy('old prose', {})[0].text, 'old prose');
});

test('freeform multiline text, indentation, trailing lines, Unicode and literal comments roundtrip', async () => {
  const storage = new MockStorage();
  const doc = await storage.createDocument('philosophy', 'Thinking');
  const metadata = readPhilosophyMetadata(doc.metadata.metadata_json);
  const text = '  Why?\nA second line.\n\n\n思想 🧠\n\n<!-- premise -->\nStill my words.\n  ';
  const edit = philosophyEdit([{ id: 'one', classification: 'prose', text }], metadata);
  await storage.saveDocument(doc.metadata.id, edit.content, undefined, undefined, JSON.stringify(edit.metadata));
  const reopened = await storage.getDocument(doc.metadata.id);
  assert.equal(reopened.content, text);
  assert.equal(parsePhilosophy(reopened.content, readPhilosophyMetadata(reopened.metadata.metadata_json))[0].text, text);
});

test('all classifications, empty blocks and multiline block bodies survive serialization', () => {
  const blocks = Object.keys(CLASSIFICATIONS).map((classification, i) => ({ id: `${i}`, classification: classification as PhilosophyClassification, text: i % 2 ? '' : 'First\n\nSecond\n\n<!-- argument -->\nliteral\n' }));
  const edit = philosophyEdit(blocks, { chapter: 'II', custom: { retained: true } });
  assert.deepEqual(parsePhilosophy(edit.content, edit.metadata).map(({ classification, text }) => ({ classification, text })), blocks.map(({ classification, text }) => ({ classification, text })));
  assert.deepEqual(edit.metadata.custom, { retained: true });
});

test('mode-only saves keep legacy body byte-for-byte and preserve metadata and tags', async () => {
  const storage = new MockStorage();
  const doc = await storage.createDocument('philosophy', 'Old', undefined, legacy, JSON.stringify({ work_title: 'Work', unknown: 42 }), ['tag']);
  let metadata = readPhilosophyMetadata(doc.metadata.metadata_json);
  const before = parsePhilosophy(legacy, metadata);
  for (const composition_mode of ['freeform', 'structured', 'freeform', 'structured'] as const) {
    metadata = switchPhilosophyMode(metadata, composition_mode);
    // This is the same metadata-only save contract used by PhilosophyStudio.
    await storage.saveDocument(doc.metadata.id, legacy, undefined, undefined, JSON.stringify(metadata));
    assert.deepEqual(parsePhilosophy(legacy, metadata), before);
  }
  const reopened = await storage.getDocument(doc.metadata.id);
  assert.equal(reopened.content, legacy);
  assert.deepEqual(parsePhilosophy(reopened.content, metadata), before);
  assert.equal(metadata.unknown, 42);
  assert.deepEqual(reopened.metadata.tags, ['tag']);
});

test('empty and whitespace-only documents remain editable without fabricated content', () => {
  for (const text of ['', '   ', '\n\n']) {
    const blocks = parsePhilosophy(text, { composition_mode: 'freeform' });
    assert.equal(blocks.length, 1);
    assert.equal(philosophyEdit(blocks, {}).content, text);
  }
});

test('malformed boundary metadata falls back to readable legacy content', () => {
  for (const philosophy_blocks of [[{ classification: 'premise', length: 9999 }], [{ classification: '__proto__', length: 0 }], [null]]) {
    const blocks = parsePhilosophy(legacy, { philosophy_blocks } as any);
    assert.equal(blocks[0].classification, 'premise');
    assert.equal(blocks[0].text, 'A reason.');
  }
});

test('production save coordinator serializes writes and drains a mode switch during either mode save', async () => {
  for (const initialMode of ['freeform', 'structured'] as const) {
    const storage = new MockStorage();
    const doc = await storage.createDocument('philosophy', 'Autosave');
    const coordinator = new SaveCoordinator();
    let pending = { content: 'Unsaved\n\nthought', metadata: { composition_mode: initialMode }, revision: 1 };
    let savedRevision = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const writes: number[] = [];
    const writeNext = async () => {
      const snapshot = pending;
      if (writes.length === 0) await gate;
      writes.push(snapshot.revision);
      await storage.saveDocument(doc.metadata.id, snapshot.content, undefined, undefined, JSON.stringify(snapshot.metadata));
      savedRevision = snapshot.revision;
      return savedRevision === pending.revision ? 'saved' as const : 'more' as const;
    };
    const first = coordinator.flush(writeNext);
    pending = { content: 'Unsaved\n\nthought plus new text', metadata: { composition_mode: initialMode === 'freeform' ? 'structured' : 'freeform' }, revision: 2 };
    const exitFlush = coordinator.flush(writeNext);
    assert.equal(first, exitFlush);
    release();
    assert.equal(await exitFlush, true);
    assert.deepEqual(writes, [1, 2]);
    const reopened = await storage.getDocument(doc.metadata.id);
    assert.equal(reopened.content, pending.content);
    assert.equal(readPhilosophyMetadata(reopened.metadata.metadata_json).composition_mode, pending.metadata.composition_mode);
  }
});

test('production save coordinator reports failure and permits a retry', async () => {
  const coordinator = new SaveCoordinator();
  assert.equal(await coordinator.flush(async () => 'error'), false);
  assert.equal(await coordinator.flush(async () => 'saved'), true);
});

test('real Studio renders an immediately usable freeform canvas and dismissible introduction', async () => {
  const doc = await new MockStorage().createDocument('philosophy', 'An open question');
  const html = renderToStaticMarkup(React.createElement(PhilosophyStudio, { document: doc, onSave: () => {}, saveStatus: 'saved' }));
  assert.match(html, /aria-label="Freeform writing"/);
  assert.match(html, /Dismiss introduction/);
  assert.doesNotMatch(html, /Role for block/);
  assert.doesNotMatch(html, /Insert Next Proposition/);
});

test('real Studio opens legacy classification controls and role explanations', async () => {
  const doc = await new MockStorage().createDocument('philosophy', 'Legacy', undefined, legacy);
  const html = renderToStaticMarkup(React.createElement(PhilosophyStudio, { document: doc, onSave: () => {}, saveStatus: 'saved' }));
  assert.match(html, /Role for block 1/);
  assert.match(html, /A statement offered as a reason or starting assumption/);
  assert.match(html, /A challenge/);
  assert.doesNotMatch(html, /Dismiss introduction/);
});

test('mode switching and reopening untouched multiline freeform never splits its canvas', () => {
  const content = 'Question?\n\nA thought.\n\n<!-- premise -->\nliteral text';
  let metadata = { composition_mode: 'freeform' as const };
  for (const mode of ['structured', 'freeform', 'structured', 'freeform'] as const) {
    metadata = switchPhilosophyMode(metadata, mode) as typeof metadata;
    const blocks = parsePhilosophy(content, metadata);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].text, content);
  }
});

test('editing a legacy block in Freeform preserves every role, its neighbors and ordering', () => {
  const metadata = switchPhilosophyMode({ chapter: 'I', custom: 'keep' }, 'freeform');
  const blocks = parsePhilosophy(legacy, metadata);
  blocks[1].text += '\n\nA second paragraph inside the objection.';
  const edited = philosophyEdit(blocks, metadata);
  const reopened = parsePhilosophy(edited.content, switchPhilosophyMode(edited.metadata, 'structured'));
  assert.deepEqual(reopened.map(({ text, classification }) => ({ text, classification })), blocks.map(({ text, classification }) => ({ text, classification })));
});

test('legacy whitespace and case do not hide a classification', () => {
  const blocks = parsePhilosophy('  <!-- PREMISE -->\r\nReason with trailing space.  ', {});
  assert.equal(blocks[0].classification, 'premise');
  assert.equal(blocks[0].text, '  Reason with trailing space.  ');
});
