import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlan, newNode, insertNode, createBranch, type Plan } from '../src/utils/thought';
import { chapterMilestoneMetadata, compatibleChapter, joinNarrative, milestoneChapterReferences, splitNarrative, updateMilestoneNarrative, updateUniverseOverview } from '../src/utils/narrativeContext';
import { resolveUniverseStateAtMilestone } from '../src/utils/stateEngine';
import { generateLorebookPdf } from '../src/utils/lorebookPdf';
import type { DocumentMetadata } from '../src/types';

function fixture() {
  let plan = emptyPlan(); plan.universes = [{ id: 'u', name: 'Universe' }, { id: 'other', name: 'Other' }];
  plan.books = [{ id: 'book', universe_id: 'u', name: 'Volume I', continuity: 'canonical' }];
  const node = newNode(plan, 'u', null); node.id = 'm'; node.title = 'Succession';
  plan = insertNode(plan, node);
  const chapter: DocumentMetadata = { id: 'chapter', title: 'Chapter 17', doc_type: 'lorebook', house_id: 'house-default', relative_path: 'Lorebooks/chapter.md', created_at: '', updated_at: '', tags: [], metadata_json: JSON.stringify({ universe_id: 'u', book_id: 'book', entry_type: 'chapter', milestone_id: 'm', attributes: [{ key: 'Author field', value: 'Retained' }] }) };
  return { plan, node: plan.nodes[0], chapter };
}

test('empty and legacy Universe overviews use the existing optional description', () => {
  const { plan } = fixture();
  assert.deepEqual(splitNarrative(plan.universes[0].description), { summary: '', account: '' });
  const updated = updateUniverseOverview(plan, 'u', 'Renamed', joinNarrative('A premise.', 'A longer world introduction.\nSecond line.'));
  const reloaded: Plan = JSON.parse(JSON.stringify(updated));
  assert.equal(reloaded.universes[0].id, 'u');
  assert.deepEqual(splitNarrative(reloaded.universes[0].description), { summary: 'A premise.', account: 'A longer world introduction.\nSecond line.' });
  assert.equal(plan.universes[0].description, undefined);
  assert.equal(updateUniverseOverview(reloaded, 'u', 'Renamed', '').universes[0].description, undefined);
  assert.throws(() => updateUniverseOverview(plan, 'deleted', 'Name', 'Text'));
  assert.throws(() => updateUniverseOverview(plan, 'u', ' ', 'Text'));
});

test('summary only, full account and no narrative all round-trip without additional canonical fields', () => {
  const { plan } = fixture();
  for (const [summary, account] of [['An event.', ''], ['An event.', '## Circumstances\nAn authored account.\n\n## Consequences\nA disputed succession.'], ['', '']]) {
    const text = joinNarrative(summary, account);
    const updated = updateMilestoneNarrative(plan, 'u', 'm', 'Succession', text);
    assert.equal(JSON.parse(JSON.stringify(updated)).nodes[0].description, text);
    assert.equal(updated.nodes[0].book_id, null);
    assert.equal(updated.nodes[0].questions, plan.nodes[0].questions);
  }
});

test('reference-only, narrative-only, both and neither reuse chapter-owned milestone IDs', () => {
  const { plan, node, chapter } = fixture();
  assert.equal(milestoneChapterReferences(plan, [chapter], node).length, 1);
  const withText = updateMilestoneNarrative(plan, 'u', 'm', 'Succession', 'The empire faced a crisis.');
  assert.equal(milestoneChapterReferences(withText, [chapter], withText.nodes[0]).length, 1);
  const unlinked = { ...chapter, metadata_json: chapterMilestoneMetadata(plan, chapter, node, false) };
  assert.equal(milestoneChapterReferences(withText, [unlinked], withText.nodes[0]).length, 0);
  assert.equal(milestoneChapterReferences(plan, [unlinked], node).length, 0);
  const linked = JSON.parse(chapterMilestoneMetadata(plan, unlinked, node, true));
  assert.equal(linked.milestone_id, 'm'); assert.equal(linked.book_id, 'book');
  assert.equal(linked.attributes[0].value, 'Retained');
  assert.equal(node.description, '');
  assert.ok(!('chapter_ids' in node));
});

test('deleted, invalid, archived, foreign Universe and House references are excluded', () => {
  const { plan, node, chapter } = fixture();
  const metadata = JSON.parse(chapter.metadata_json!);
  for (const patch of [{ book_id: 'missing' }, { universe_id: 'other' }, { entry_type: 'other' }, { archived: true }]) {
    const invalid = { ...chapter, metadata_json: JSON.stringify({ ...metadata, ...patch }) };
    assert.equal(compatibleChapter(plan, invalid, node), null);
    assert.throws(() => chapterMilestoneMetadata(plan, invalid, node, true));
  }
  assert.equal(milestoneChapterReferences(plan, [], node).length, 0);
  assert.equal(milestoneChapterReferences(plan, [{ ...chapter, house_id: 'other-house' }], node).length, 0);
  assert.equal(milestoneChapterReferences({ ...plan, books: [] }, [chapter], node).length, 0);
  assert.equal(compatibleChapter(plan, chapter, { ...node, archived: true }), null);
  assert.throws(() => updateMilestoneNarrative(plan, 'other', node.id, 'Changed', ''));
});

test('alternate chapters use their own branch or its divergence, never another branch', () => {
  const { plan: base, chapter } = fixture();
  let plan = createBranch(base, 'u', 'Alternate', 'm').plan;
  const branch = plan.branches![0];
  const alt = newNode(plan, 'u', null, undefined, branch.id); plan = insertNode(plan, alt);
  const milestone = plan.nodes.find(n => n.id === alt.id)!;
  assert.equal(compatibleChapter(plan, chapter, milestone), null);
  plan.books = [{ ...plan.books[0], continuity: 'alternate', branch_id: branch.id }];
  assert.ok(compatibleChapter(plan, chapter, milestone));
  const bound = { ...chapter, metadata_json: chapterMilestoneMetadata(plan, chapter, milestone, true) };
  assert.equal(milestoneChapterReferences(plan, [bound], milestone).length, 1);
  assert.equal(milestoneChapterReferences(plan, [bound], plan.nodes[0]).length, 0);
  const foreign = { ...plan, books: [{ ...plan.books[0], universe_id: 'other' }] };
  assert.equal(compatibleChapter(foreign, bound, milestone), null);
});

test('editing a chronicle leaves death, unknown and not-introduced records unchanged and invents no cause', () => {
  const { plan, node } = fixture();
  node.changes = ['deceased', null, 'not_introduced'].map((status, i) => ({ id: `change-${i}`, entity_id: `c-${i}`, property_key: 'status', previous_value: null, new_value: status, note: '' }));
  const docs = node.changes.map(change => ({ ...fixture().chapter, id: change.entity_id, metadata_json: JSON.stringify({ entry_type: 'character', universe_id: 'u' }) }));
  const before = resolveUniverseStateAtMilestone(plan, docs, 'u', 'm');
  const updated = updateMilestoneNarrative(plan, 'u', 'm', node.title, 'An authored political account.');
  assert.deepEqual(resolveUniverseStateAtMilestone(updated, docs, 'u', 'm'), before);
  assert.deepEqual(updated.nodes[0].changes, node.changes);
  assert.equal(updated.nodes[0].description, 'An authored political account.');
  assert.equal(plan.nodes[0].description, '');
});

test('PDF includes introduction and canonical/alternate chronicles, links and glyph diagnostics', () => {
  const milestone = { title: 'Succession', anchor: 'succession', description: 'The empire faced a crisis.\n\nConsequences: A disputed succession.', references: [{ chapter_title: 'Chapter 17', book_name: 'Volume I', excerpt_anchor: 'excerpt' }], changes: [{ entity_title: 'Emperor', entity_anchor: 'emperor', property_key: 'status', previous_value: 'alive', new_value: 'deceased' }] };
  const result = generateLorebookPdf({ title: 'Encyclopedia', universe_name: 'Universe', universe_description: 'Premise.\n\nExtended introduction.', timeline: { title: 'Historical Timeline', anchor: 'history', milestones: [milestone] }, alternate_continuities: [{ name: 'Alternate', anchor: 'alt', milestones: [{ ...milestone, references: [{ chapter_title: 'Chapter 18', book_name: 'Volume II', excerpt_anchor: 'alt-excerpt' }], changes: [{ entity_title: '皇帝', entity_anchor: 'emperor', property_key: 'status', previous_value: 'alive', new_value: 'deceased' }] }] }] }, { includeTitlePage: false });
  const pdf = new TextDecoder().decode(result.pdfBytes);
  for (const text of ['Universe Introduction', 'Premise.', 'Extended introduction.', 'Succession', 'Consequences:', 'Chapter 17', 'Volume I', 'deceased']) assert.ok(pdf.includes(text), text);
  assert.ok(result.diagnostics.some(d => d.code === 'unsupported_glyphs'));
});
