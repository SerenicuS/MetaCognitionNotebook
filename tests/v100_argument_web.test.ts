import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockStorage } from '../src/services/api';
import {
  getOrCreateArgumentWeb,
  setMainThesis,
  updateMainThesis,
  removeMainThesis,
  addArgumentNode,
  updateArgumentNode,
  removeArgumentNode,
  relinkArgumentNode,
  addArgumentRelationship,
  updateArgumentRelationship,
  removeArgumentRelationship,
  validateSourceLocation,
  computeStructuralInsights,
  dismissInsight,
  restoreInsight,
  layoutArgumentWeb,
} from '../src/utils/argumentWeb';
import { philosophyEdit, readPhilosophyMetadata } from '../src/utils/philosophy';
import type { ArgumentWeb, PhilosophyMetadata, PhilosophyParagraph } from '../src/types';

test('getOrCreateArgumentWeb: initializes empty web on legacy or missing metadata', () => {
  const empty = getOrCreateArgumentWeb({});
  assert.equal(empty.main_thesis, null);
  assert.deepEqual(empty.nodes, []);
  assert.deepEqual(empty.relationships, []);
  assert.deepEqual(empty.dismissed_insights, []);

  const nullWeb = getOrCreateArgumentWeb(null);
  assert.equal(nullWeb.main_thesis, null);
  assert.deepEqual(nullWeb.nodes, []);

  const existing: ArgumentWeb = {
    main_thesis: { id: 'th-1', title: 'Determinism', content: 'Free will is an illusion.' },
    nodes: [{ id: 'node-1', title: 'Causality', snapshot: 'Every event has a cause.', created_at: '2026-01-01', updated_at: '2026-01-01' }],
    relationships: [{ id: 'rel-1', source_id: 'node-1', target_id: 'th-1', relation_type: 'supports' }],
    dismissed_insights: ['disconnected:node-1'],
  };
  const loaded = getOrCreateArgumentWeb({ argument_web: existing });
  assert.equal(loaded.main_thesis?.title, 'Determinism');
  assert.equal(loaded.nodes.length, 1);
  assert.equal(loaded.relationships.length, 1);
  assert.deepEqual(loaded.dismissed_insights, ['disconnected:node-1']);
});

test('Main Thesis CRUD: creation, update, and cascading relationship deletion', () => {
  let web = getOrCreateArgumentWeb({});

  // 1. Set main thesis
  web = setMainThesis(web, 'Compatibilism', 'Freedom of action is compatible with physical determinism.');
  assert.ok(web.main_thesis);
  assert.equal(web.main_thesis.title, 'Compatibilism');
  const thesisId = web.main_thesis.id;

  // 2. Add an argument node and connect it to the thesis
  const { web: webWithNode, node } = addArgumentNode(web, 'Definition of Freedom', 'Freedom means acting without external coercion.');
  web = webWithNode;
  const { web: webWithRel, relationship } = addArgumentRelationship(web, {
    source_id: node.id,
    target_id: thesisId,
    relation_type: 'supports',
    explanation: 'Defines the operative sense of free will.',
  });
  web = webWithRel;
  assert.equal(web.relationships.length, 1);

  // 3. Update main thesis
  web = updateMainThesis(web, { title: 'Classical Compatibilism' });
  assert.equal(web.main_thesis?.title, 'Classical Compatibilism');
  assert.equal(web.main_thesis?.content, 'Freedom of action is compatible with physical determinism.');

  // 4. Remove main thesis and verify cascading relationship cleanup
  web = removeMainThesis(web);
  assert.equal(web.main_thesis, null);
  assert.equal(web.relationships.length, 0); // Relationship to thesis removed
  assert.equal(web.nodes.length, 1); // Node itself is preserved
});

test('Argument Node CRUD: creation, updating, and cascading relationship removal', () => {
  let web = getOrCreateArgumentWeb({});
  const { web: w1, node: n1 } = addArgumentNode(web, 'Premise A', 'All physical systems obey laws.');
  const { web: w2, node: n2 } = addArgumentNode(w1, 'Premise B', 'Human brains are physical systems.');
  web = w2;

  assert.equal(web.nodes.length, 2);
  assert.equal(n1.title, 'Premise A');
  assert.equal(n1.snapshot, 'All physical systems obey laws.');

  // Update node
  web = updateArgumentNode(web, n1.id, { title: 'Universal Physical Laws' });
  assert.equal(web.nodes.find((n) => n.id === n1.id)?.title, 'Universal Physical Laws');

  // Establish relationship between n1 and n2
  const { web: w3 } = addArgumentRelationship(web, {
    source_id: n1.id,
    target_id: n2.id,
    relation_type: 'expands',
  });
  web = w3;
  assert.equal(web.relationships.length, 1);

  // Remove n1 and confirm cascading relationship removal
  web = removeArgumentNode(web, n1.id);
  assert.equal(web.nodes.length, 1);
  assert.equal(web.nodes[0].id, n2.id);
  assert.equal(web.relationships.length, 0);
});

test('Argument Node Relinking: preserves stable node ID and existing relationships', () => {
  let web = getOrCreateArgumentWeb({});
  const { web: w1, node: n1 } = addArgumentNode(web, 'Original Premise', 'Old passage text.', {
    start_offset: 10,
    end_offset: 28,
  });
  const { web: w2, node: n2 } = addArgumentNode(w1, 'Conclusion', 'Conclusion text.');
  const { web: w3, relationship: rel } = addArgumentRelationship(w2, {
    source_id: n1.id,
    target_id: n2.id,
    relation_type: 'supports',
  });
  web = w3;

  // Relink n1 to new passage text and new offsets
  web = relinkArgumentNode(web, n1.id, 'Rewritten passage text in revised section.', {
    start_offset: 120,
    end_offset: 162,
  });

  // Verify node ID is unchanged
  const relinked = web.nodes.find((n) => n.id === n1.id);
  assert.ok(relinked);
  assert.equal(relinked.id, n1.id);
  assert.equal(relinked.snapshot, 'Rewritten passage text in revised section.');
  assert.equal(relinked.source?.start_offset, 120);
  assert.equal(relinked.source?.end_offset, 162);

  // Verify relationship is preserved
  assert.equal(web.relationships.length, 1);
  assert.equal(web.relationships[0].id, rel.id);
  assert.equal(web.relationships[0].source_id, n1.id);
  assert.equal(web.relationships[0].target_id, n2.id);
});

test('Relationship Rules: self-loops, endpoint validation, duplicates, and symmetric relations', () => {
  let web = getOrCreateArgumentWeb({});
  const { web: w1, node: n1 } = addArgumentNode(web, 'Node 1', 'Passage 1');
  const { web: w2, node: n2 } = addArgumentNode(w1, 'Node 2', 'Passage 2');
  web = w2;

  // 1. Self-loop prohibited
  assert.throws(() => {
    addArgumentRelationship(web, {
      source_id: n1.id,
      target_id: n1.id,
      relation_type: 'supports',
    });
  }, /cannot connect to itself/i);

  // 2. Non-existent endpoint prohibited
  assert.throws(() => {
    addArgumentRelationship(web, {
      source_id: n1.id,
      target_id: 'non-existent-id',
      relation_type: 'supports',
    });
  }, /endpoints must exist/i);

  // 3. Directed connection succeeds
  const { web: w3 } = addArgumentRelationship(web, {
    source_id: n1.id,
    target_id: n2.id,
    relation_type: 'supports',
  });
  web = w3;

  // 4. Duplicate directed connection prohibited
  assert.throws(() => {
    addArgumentRelationship(web, {
      source_id: n1.id,
      target_id: n2.id,
      relation_type: 'supports',
    });
  }, /already exists/i);

  // 5. Distinct relationship type between same nodes is permitted
  const { web: w4 } = addArgumentRelationship(web, {
    source_id: n1.id,
    target_id: n2.id,
    relation_type: 'expands',
  });
  web = w4;
  assert.equal(web.relationships.length, 2);

  // 6. Symmetric 'related' connection prevents duplicate in opposite direction
  const { web: w5 } = addArgumentRelationship(web, {
    source_id: n2.id,
    target_id: n1.id,
    relation_type: 'related',
  });
  web = w5;

  assert.throws(() => {
    addArgumentRelationship(web, {
      source_id: n1.id,
      target_id: n2.id,
      relation_type: 'related',
    });
  }, /already exists/i);
});

test('Two-Tier Source Validation: verified, moved (with candidates), and unlocated', () => {
  const content = 'Philosophy begins in wonder. Knowledge requires justified true belief. Action follows deliberation.';

  // Case 1: Verified at exact recorded offsets
  const start1 = content.indexOf('Knowledge requires');
  const end1 = start1 + 'Knowledge requires justified true belief.'.length;
  const res1 = validateSourceLocation(content, 'Knowledge requires justified true belief.', {
    start_offset: start1,
    end_offset: end1,
  });
  assert.equal(res1.status, 'verified');

  // Case 2: Moved - text has moved to different offsets (e.g. earlier text was inserted)
  const modifiedContent = 'Introduction.\n\n' + content;
  const res2 = validateSourceLocation(modifiedContent, 'Knowledge requires justified true belief.', {
    start_offset: start1, // old offset
    end_offset: end1,
  });
  assert.equal(res2.status, 'moved');
  assert.ok(res2.occurrences.length > 0);
  assert.equal(res2.occurrences[0].start_offset, modifiedContent.indexOf('Knowledge requires'));
  // Never silently relinks; returns status and candidate occurrences

  // Case 3: Unlocated - text was deleted or significantly altered
  const res3 = validateSourceLocation(content, 'A statement that does not appear anywhere here.', {
    start_offset: 0,
    end_offset: 10,
  });
  assert.equal(res3.status, 'unlocated');
  assert.equal(res3.occurrences.length, 0);

  // Case 4: Structured paragraphs validation
  const paragraphs: PhilosophyParagraph[] = [
    { id: 'b0', classification: 'premise', text: 'First block argument.' },
    { id: 'b1', classification: 'conclusion', text: 'Second block conclusion.' },
  ];
  const structuredContent = '<!-- premise -->\nFirst block argument.\n\n<!-- conclusion -->\nSecond block conclusion.';
  const resStructured = validateSourceLocation(structuredContent, 'Second block conclusion.', {
    block_index: 1,
    start_offset: 0,
    end_offset: 24,
  }, paragraphs);
  assert.equal(resStructured.status, 'verified');
});

test('Structural Insights: non-judgmental structural reporting & dismissal', () => {
  let web = getOrCreateArgumentWeb({});
  const { web: w1, node: n1 } = addArgumentNode(web, 'Premise 1', 'Snapshot 1');
  const { web: w2, node: n2 } = addArgumentNode(w1, 'Premise 2', 'Snapshot 2');
  const { web: w3, node: n3 } = addArgumentNode(w2, 'Premise 3', 'Snapshot 3');
  web = w3;

  // n1 and n2 are connected, n3 is disconnected
  const { web: w4 } = addArgumentRelationship(web, {
    source_id: n1.id,
    target_id: n2.id,
    relation_type: 'supports',
  });
  web = w4;

  const content = 'Snapshot 1 and Snapshot 2 and Snapshot 3.';
  const insights = computeStructuralInsights(web, content);

  // Should detect disconnected node n3
  const disconnectedInsight = insights.find((i) => i.id === `disconnected:${n3.id}`);
  assert.ok(disconnectedInsight, 'Must detect disconnected argument node');
  assert.ok(!disconnectedInsight.description.includes('invalid') && !disconnectedInsight.description.includes('fallacy'),
    'Insights must never evaluate logical validity or soundness');

  // Dismiss insight
  web = dismissInsight(web, disconnectedInsight.id);
  assert.ok(web.dismissed_insights?.includes(disconnectedInsight.id));

  // Verify dismissed insight is filtered out
  const insightsAfterDismiss = computeStructuralInsights(web, content);
  assert.ok(!insightsAfterDismiss.some((i) => i.id === disconnectedInsight.id));

  // Restore insight
  web = restoreInsight(web, disconnectedInsight.id);
  assert.ok(!web.dismissed_insights?.includes(disconnectedInsight.id));
  const insightsAfterRestore = computeStructuralInsights(web, content);
  assert.ok(insightsAfterRestore.some((i) => i.id === disconnectedInsight.id));
});

test('Deterministic Graph Layout: thesis positioning and node scaling up to 50 nodes', () => {
  let web = getOrCreateArgumentWeb({});
  web = setMainThesis(web, 'Main Thesis', 'Overarching claim');

  // Add 40 argument nodes and relationships
  for (let i = 0; i < 40; i++) {
    const res = addArgumentNode(web, `Argument ${i + 1}`, `Passage ${i + 1}`);
    web = res.web;
    const { web: relWeb } = addArgumentRelationship(web, {
      source_id: res.node.id,
      target_id: web.main_thesis!.id,
      relation_type: i % 2 === 0 ? 'supports' : 'expands',
    });
    web = relWeb;
  }

  assert.equal(web.nodes.length, 40);
  const layout = layoutArgumentWeb(web);

  // Verify all 40 nodes + 1 thesis are placed without omission
  assert.equal(layout.nodes.length, 41);
  assert.equal(layout.edges.length, 40);

  // Thesis is positioned at center (0, 0)
  const thesisLayout = layout.nodes.find((n) => n.isThesis);
  assert.ok(thesisLayout);
  assert.equal(thesisLayout.x, 0);
  assert.equal(thesisLayout.y, 0);

  // Node coordinates are finite numbers
  for (const n of layout.nodes) {
    assert.ok(Number.isFinite(n.x));
    assert.ok(Number.isFinite(n.y));
  }
});

test('Persistence & Save Safety: argument web stored in metadata does not alter prose', async () => {
  const storage = new MockStorage();
  const initialContent = 'This is the author\'s original philosophical essay.\nIt must remain verbatim.';
  const doc = await storage.createDocument('philosophy', 'Compatibilist Reflections', undefined, initialContent);

  // Add an argument web to metadata
  let web = getOrCreateArgumentWeb({});
  web = setMainThesis(web, 'Free Action', 'Acting in accord with desires.');
  const { web: webWithNode } = addArgumentNode(web, 'Desire formation', 'First-order vs second-order desires.');
  web = webWithNode;

  const currentMeta = readPhilosophyMetadata(doc.metadata.metadata_json);
  const updatedMeta: PhilosophyMetadata = {
    ...currentMeta,
    argument_web: web,
  };

  // Save via storage
  await storage.saveDocument(
    doc.metadata.id,
    doc.content,
    undefined,
    undefined,
    JSON.stringify(updatedMeta)
  );

  // Reload document
  const reloaded = await storage.getDocument(doc.metadata.id);
  assert.equal(reloaded.content, initialContent, 'Prose content must remain untouched');
  const reloadedMeta = readPhilosophyMetadata(reloaded.metadata.metadata_json);
  assert.ok(reloadedMeta.argument_web);
  assert.equal(reloadedMeta.argument_web.main_thesis?.title, 'Free Action');
  assert.equal(reloadedMeta.argument_web.nodes.length, 1);
  assert.equal(reloadedMeta.argument_web.nodes[0].title, 'Desire formation');

  // Verify editing prose preserves argument_web in metadata
  const edit = philosophyEdit([{ id: 'p1', classification: 'prose', text: initialContent + '\n\nAddendum.' }], reloadedMeta);
  await storage.saveDocument(
    doc.metadata.id,
    edit.content,
    undefined,
    undefined,
    JSON.stringify(edit.metadata)
  );

  const finalDoc = await storage.getDocument(doc.metadata.id);
  const finalMeta = readPhilosophyMetadata(finalDoc.metadata.metadata_json);
  assert.ok(finalMeta.argument_web);
  assert.equal(finalMeta.argument_web.main_thesis?.title, 'Free Action');
  assert.equal(finalMeta.argument_web.nodes.length, 1);
  assert.ok(finalDoc.content.includes('Addendum.'));
});
