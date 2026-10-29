import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlan, newNode, insertNode, createBranch, type Plan } from '../src/utils/thought';
import { resolveUniverseStateAtMilestone, getStatusDescriptor } from '../src/utils/stateEngine';
import { sourceChronicleRoute, focusChronicle } from '../src/utils/chronicleNavigation';
import { milestoneBookOptions, compatibleChapter, chapterMilestoneMetadata } from '../src/utils/narrativeContext';
import { suppressTemplateProse } from '../src/utils/loreTemplateProse';
import { stateChangeText, statusLabel } from '../src/utils/statusPresentation';
import { validateAndCreateRelationship, LORE_CATEGORIES, getCategoryForEntryType } from '../src/utils/universe';
import { updateRelationshipDescription } from '../src/utils/relationships';
import { graphConnections } from '../src/utils/graphConnections';
import { layoutRelationships } from '../src/utils/relationshipGraph';
import { convertDocumentToEchoEntity } from '../src/utils/echoLore';
import { generateLorebookPdf } from '../src/utils/lorebookPdf';
import type { DocumentMetadata, HouseRecord } from '../src/types';

const doc = (id: string, entry_type = 'character', extra = {}): DocumentMetadata => ({ id, title: id, doc_type: 'lorebook', house_id: 'house-default', relative_path: `${id}.md`, created_at: '', updated_at: '', tags: [], metadata_json: JSON.stringify({ entry_type, universe_id: 'u', ...extra }) });
function fixture() {
  let plan = emptyPlan(); plan.universes = [{ id: 'u', name: 'Universe' }, { id: 'other', name: 'Other' }];
  const first = { ...newNode(plan, 'u', null), id: 'first', title: 'First', changes: [{ id: 's', entity_id: 'c', property_key: 'status', previous_value: null, new_value: 'missing', note: '' }] };
  plan = insertNode(plan, first);
  const later = { ...newNode(plan, 'u', null), id: 'later', title: 'Later' }; plan = insertNode(plan, later);
  plan.books = [{ id: 'book', universe_id: 'u', name: 'Same title', continuity: 'canonical' }, { id: 'foreign', universe_id: 'other', name: 'Same title', continuity: 'canonical' }];
  return { plan, first: plan.nodes[0], later: plan.nodes[1], documents: [doc('c')] };
}

test('resolver provenance navigates inherited canonical and alternate ancestry without edits', () => {
  let { plan, later, documents } = fixture();
  const branch = createBranch(plan, 'u', 'Alternate', later.id); plan = branch.plan;
  const alternate = newNode(plan, 'u', null, undefined, branch.branch.id); plan = insertNode(plan, alternate);
  const before = JSON.stringify(plan);
  for (const current of [later.id, alternate.id]) {
    const state = resolveUniverseStateAtMilestone(plan, documents, 'u', current)[0];
    assert.equal(state.value, 'missing'); assert.equal(state.origin, 'inherited');
    assert.deepEqual(sourceChronicleRoute(plan, 'u', current, state.sourceMilestoneId!), { continuityId: null, milestoneId: 'first' });
  }
  assert.deepEqual(sourceChronicleRoute(plan, 'u', 'first', 'first'), { continuityId: null, milestoneId: 'first' });
  assert.equal(JSON.stringify(plan), before);
  const operations: unknown[] = [];
  focusChronicle({ scrollIntoView: options => operations.push(options), focus: options => operations.push(options) } as HTMLElement);
  assert.deepEqual(operations, [{ block: 'center', behavior: 'auto' }, { preventScroll: true }]);
  for (const invalid of ['deleted', 'foreign']) assert.throws(() => sourceChronicleRoute(plan, 'u', later.id, invalid));
  assert.throws(() => sourceChronicleRoute(plan, 'other', later.id, 'first'));
  assert.throws(() => sourceChronicleRoute(plan, 'u', 'first', later.id));
  assert.throws(() => sourceChronicleRoute({ ...plan, nodes: plan.nodes.map(n => n.id === 'first' ? { ...n, archived: true } : n) }, 'u', later.id, 'first'));
  assert.throws(() => sourceChronicleRoute({ ...plan, branches: plan.branches!.map(b => ({ ...b, archived: true })) }, 'u', alternate.id, 'first'));
});

test('provenance follows an alternate ancestor through a nested continuity', () => {
  const { plan: base, later, documents } = fixture();
  const parent = createBranch(base, 'u', 'Parent', later.id);
  const source = { ...newNode(parent.plan, 'u', null, undefined, parent.branch.id), id: 'parent-source', changes: [{ id: 'alt-status', entity_id: 'c', property_key: 'status', previous_value: 'missing', new_value: 'alive', note: '' }] };
  const planWithSource = insertNode(parent.plan, source);
  const child = createBranch(planWithSource, 'u', 'Child', source.id);
  const target = newNode(child.plan, 'u', null, undefined, child.branch.id);
  const plan = insertNode(child.plan, target);
  const state = resolveUniverseStateAtMilestone(plan, documents, 'u', target.id)[0];
  assert.equal(state.sourceMilestoneId, source.id);
  assert.deepEqual(sourceChronicleRoute(plan, 'u', target.id, state.sourceMilestoneId!), { continuityId: parent.branch.id, milestoneId: source.id });
});

test('Book eligibility comes from canonical ownership, not chapter count or title, and refreshes', () => {
  const { plan, first } = fixture();
  assert.deepEqual(milestoneBookOptions(plan, first).map(b => b.id), ['book']);
  const created: Plan = { ...plan, books: [...plan.books, { id: 'new', universe_id: 'u', name: 'Same title', continuity: 'standalone' }] };
  assert.deepEqual(milestoneBookOptions(created, first).map(b => b.id), ['book', 'new']);
  assert.equal(milestoneBookOptions({ ...plan, books: plan.books.map(b => ({ ...b, archived: true })) }, first).length, 0);
  assert.equal(milestoneBookOptions(plan, first, 'other-house').length, 0);
  const houses = [{ id: 'other-house', universe_ids: ['u'] }] as HouseRecord[];
  assert.equal(milestoneBookOptions(plan, first, 'house-default', houses).length, 0);
  assert.equal(milestoneBookOptions(plan, first, 'other-house', houses).length, 1);
  const chapter = doc('chapter', 'chapter', { book_id: 'new', attributes: [{ key: 'Notes', value: 'Authored' }] });
  assert.ok(compatibleChapter(created, chapter, first));
  const linked = JSON.parse(chapterMilestoneMetadata(created, chapter, first, true));
  assert.equal(linked.book_id, 'new'); assert.equal(linked.milestone_id, 'first'); assert.equal(linked.attributes[0].value, 'Authored');
  assert.equal(created.books.length, 3);
  assert.equal(compatibleChapter(created, { ...chapter, house_id: 'foreign' }, first), null);
});

test('Book continuity and invalid branches remain restricted', () => {
  const { plan: base, first } = fixture();
  const { plan, branch } = createBranch(base, 'u', 'Alternate', first.id);
  const alternate = newNode(plan, 'u', null, undefined, branch.id);
  const updated = insertNode(plan, alternate);
  updated.books.push({ id: 'alt-book', name: 'Alternate', universe_id: 'u', continuity: 'alternate', branch_id: branch.id });
  assert.deepEqual(milestoneBookOptions(updated, alternate).map(b => b.id), ['alt-book']);
  assert.equal(milestoneBookOptions({ ...updated, branches: [{ ...branch, archived: true }] }, alternate).length, 0);
});

test('combined status label is consistent and canonical missing survives round-trip', () => {
  const { plan, documents } = fixture();
  const reloaded = JSON.parse(JSON.stringify(plan));
  assert.equal(reloaded.nodes[0].changes[0].new_value, 'missing');
  assert.equal(getStatusDescriptor('characters', 'missing').label, 'Unaccounted for / Missing');
  assert.equal(resolveUniverseStateAtMilestone(reloaded, documents, 'u', 'first')[0].displayLabel, statusLabel('missing'));
  const change = { entity_title: 'Character', entity_anchor: 'c', property_key: 'status', previous_value: 'unassigned', new_value: 'missing', assignment_kind: 'initial' as const };
  assert.equal(stateChangeText(change), 'Initial recorded status: Unaccounted for / Missing');
  assert.match(stateChangeText({ ...change, assignment_kind: 'recorded' }), /previous value unknown/);
  assert.match(stateChangeText({ ...change, assignment_kind: 'transition', previous_value: 'alive' }), /changed from Active \/ Alive to Unaccounted for \/ Missing/);
  const pdf = generateLorebookPdf({ title: 'Test', universe_name: 'Universe', timeline: { title: 'History', anchor: 'h', milestones: [{ title: 'First', anchor: 'f', changes: [change] }] } }, { includeTitlePage: false });
  assert.ok(new TextDecoder().decode(pdf.pdfBytes).includes('Initial recorded status: Unaccounted for / Missing'));
});

test('Echo shares exact factory detection and keeps edited or differently headed authored prose', () => {
  for (const entry of ['character', 'artifact']) {
    const singular = entry === 'artifact' ? 'Artifact / Relic' : 'Character';
    for (const overview of [`Provide the canonical context for this ${entry} in Universe.`, `Provide the canonical definition and context for this ${singular} in Universe.`]) {
      const factory = `### Overview\n\n${overview}\n\n### Historical Lore\n\nDescribe the origin, background, and cultural impact within the world.`;
      assert.equal(suppressTemplateProse(factory, entry, 'Universe'), '');
      assert.ok(suppressTemplateProse(factory.replace(overview, `${overview} Edited.`), entry, 'Universe').includes('Edited.'));
      assert.ok(suppressTemplateProse(`### Authored\n${overview}`, entry, 'Universe').includes(overview));
      assert.equal(factory.includes(overview), true);
    }
  }
  assert.equal(suppressTemplateProse('### Overview\n\nProvide the canonical definition and context for this Item / Artifact in Universe.', 'artifact', 'Universe'), '');
  assert.match(suppressTemplateProse('### Historical Lore\n\nA historical account.', 'artifact', 'Universe'), /A historical account/);
});

test('multiline explanations retain relationship identity, survive reload, aggregate separately and stay out of historical projections', () => {
  const { plan } = fixture(); const documents = [doc('c'), doc('d')];
  let result = validateAndCreateRelationship(plan, documents, { sourceId: 'c', targetId: 'd', label: 'Rival of', universeId: 'u', description: 'A dispute.\nAn unresolved debt.' });
  result = validateAndCreateRelationship(result.updatedPlan, documents, { sourceId: 'c', targetId: 'd', label: 'Friends', universeId: 'u', description: 'They grew up together.' });
  const target = result.updatedPlan.relationships[0];
  const updated = updateRelationshipDescription(result.updatedPlan, target.id, 'u', target.description, 'A dispute.\nA later disagreement.');
  const reloaded = JSON.parse(JSON.stringify(updated)) as Plan;
  assert.equal(reloaded.relationships.length, 2); assert.equal(reloaded.relationships[0].id, target.id);
  assert.throws(() => updateRelationshipDescription(updated, target.id, 'u', 'stale', 'Changed'));
  assert.throws(() => updateRelationshipDescription(updated, target.id, 'other', target.description, 'Changed'));
  const rows = reloaded.relationships.map(relationship => ({ relationship, evidence: { value: relationship.label, source: null, kind: 'baseline' as const, conflict: null } }));
  const group = layoutRelationships(graphConnections(rows, documents, 'u')).groupedEdges[0];
  assert.deepEqual(new Set(group.relationships.map(r => r.description)), new Set(['A dispute.\nA later disagreement.', 'They grew up together.']));
  assert.ok(graphConnections(rows, documents, 'u', true).every(r => !r.description));
  assert.deepEqual(updated.entities, result.updatedPlan.entities);
});

test('ordinary item classification uses legacy artifact fields and remains discoverable', () => {
  const { plan } = fixture();
  const item = doc('radio', 'artifact', { artifact_fields: { artifact_type: 'Technology/Device' } });
  const reloaded = JSON.parse(JSON.stringify(item));
  assert.equal(getCategoryForEntryType('artifact'), 'artifacts');
  assert.equal(LORE_CATEGORIES.find(c => c.id === 'artifacts')!.label, 'Items & Artifacts');
  const echo = convertDocumentToEchoEntity(reloaded, [reloaded], plan);
  assert.equal(echo.id, 'radio'); assert.equal(echo.category, 'artifact'); assert.equal(echo.guidedAttributes.Type, 'Technology/Device');
  assert.equal(JSON.parse(item.metadata_json!).artifact_fields.rarity, undefined);
});
