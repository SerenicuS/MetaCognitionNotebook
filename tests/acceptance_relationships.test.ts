import test from 'node:test';
import assert from 'node:assert/strict';
import { graphConnections, historicalGraphRows, limitGraphPairs, toggleConnectionSelection } from '../src/utils/graphConnections';
import { layoutRelationships, filterGraph } from '../src/utils/relationshipGraph';
import { emptyPlan, newNode, insertNode, createBranch, type Relationship, type Evidence } from '../src/utils/thought';
import type { DocumentMetadata } from '../src/types';
import { generateLorebookPdf } from '../src/utils/lorebookPdf';

const doc = (id: string, entry_type: string, fields = {}, universe_id = 'u', house_id = 'h'): DocumentMetadata => ({
  id, title: id === 'f2' ? 'f' : id, doc_type: 'lorebook', house_id, relative_path: '', created_at: '', updated_at: '', tags: [],
  metadata_json: JSON.stringify({ universe_id, entry_type, faction_fields: fields }),
});
const c = doc('c', 'character');
const faction = (holders = ['c']) => doc('f', 'faction', { branches: [{ id: 'fleet', name: 'Fleet' }], positions: [
  { id: 'emperor', title: 'Cognitive Emperor', holder_ids: holders },
  { id: 'admiral', title: 'Galactic Admiral', branch_id: 'fleet', holder_ids: holders },
] });
const relation = (id = 'r', source_id = 'c', target_id = 'f', label = 'Member of'): Relationship => ({ id, source_id, target_id, label, universe_id: 'u', book_id: null, description: 'authored prose', directed: true, context_node_id: null, archived: false });
const evidence: Evidence = { value: 'Member of', source: null, kind: 'baseline', conflict: null };

test('offices and membership aggregate by stable identity with deterministic priority and original provenance', () => {
  const connections = graphConnections([{ relationship: relation(), evidence }], [c, faction()], 'u');
  const group = layoutRelationships(connections).groupedEdges[0];
  assert.equal(group.count, 3);
  assert.equal(group.relationships[0].label, 'Holds Cognitive Emperor in');
  assert.equal(group.relationships[0].provenance, 'office');
  assert.equal(group.relationships[1].branchName, 'Fleet');
  assert.equal(group.relationships[2].id, 'r');
  assert.equal(group.relationships[2].description, 'authored prose');
  assert.deepEqual(layoutRelationships([...connections].reverse()).groupedEdges[0].labels, group.labels);
  assert.ok(!group.labels.some(l => l === 'Leads' || l === 'Resides in'));
  const authored = relation('a', 'f', 'c', 'Protects');
  const mixed = layoutRelationships([...connections, authored]).groupedEdges[0];
  assert.equal(mixed.relationships[2].source_id, 'f');
  assert.equal(mixed.relationships[2].target_id, 'c');
  assert.equal(mixed.relationships[2].label, 'Protects');
});

test('multiple factions with the same name remain distinct; reassignment/removal is immediately reflected', () => {
  const f2 = doc('f2', 'faction', { positions: [{ id: 'seat', title: 'Envoy', holder_ids: ['c'] }] });
  assert.equal(layoutRelationships(graphConnections([], [c, faction(), f2], 'u')).groupedEdges.length, 2);
  assert.equal(graphConnections([], [c, faction(['different']), f2], 'u').length, 1);
  assert.equal(graphConnections([], [c, doc('f', 'faction')], 'u').length, 0);
});

test('universe, House, missing holder and residence isolation', () => {
  for (const excluded of [doc('c', 'character', {}, 'other'), doc('c', 'character', {}, 'u', 'other')]) {
    assert.equal(graphConnections([], [excluded, faction()], 'u').length, 0);
  }
  assert.equal(graphConnections([], [faction()], 'u').length, 0);
  const residence = relation('home', 'c', 'home', 'Resides in');
  const rows = graphConnections([{ relationship: residence, evidence: { ...evidence, value: residence.label } }], [c, faction(), doc('home', 'location')], 'u');
  assert.equal(rows.filter(r => r.target_id === 'home').length, 1);
  assert.equal(filterGraph(rows, () => 'character', 'Member of', '').length, 0);
});

test('pair render limit retains all facts and reversed directions for selected pairs', () => {
  const rows = [relation(), relation('other', 'x', 'y'), relation('reverse', 'f', 'c', 'Has member')];
  const limited = limitGraphPairs(rows, 1);
  assert.deepEqual(limited.map(r => r.id), ['r', 'reverse']);
  assert.equal(layoutRelationships(limited).groupedEdges.length, 1);
});

test('edge selection expands, collapses, and switches without changing node focus or camera', () => {
  assert.equal(toggleConnectionSelection(null, 'edge-a'), 'edge-a');
  assert.equal(toggleConnectionSelection('edge-a', 'edge-a'), null);
  assert.equal(toggleConnectionSelection('edge-a', 'edge-b'), 'edge-b');
});

test('historical and alternate ancestry preserve unknown and not-introduced states and omit offices', () => {
  let plan = emptyPlan();
  plan.universes.push({ id: 'u', name: 'Universe' });
  const first = newNode(plan, 'u', null); first.id = 'first';
  first.relationship_changes = [{ relationship_id: 'r', label: 'Ally', note: 'private note' }];
  plan = insertNode(plan, first);
  const future = newNode(plan, 'u', null); future.id = 'future';
  future.relationship_changes = [{ relationship_id: 'r', label: 'Enemy', note: '' }];
  plan = insertNode(plan, future);
  const branch = createBranch(plan, 'u', 'Alternate', first.id);
  plan = branch.plan;
  const alt = newNode(plan, 'u', null, undefined, branch.branch.id); alt.id = 'alternate';
  plan = insertNode(plan, alt);
  let rows = historicalGraphRows(plan, [relation()], [c, faction()], 'u', alt.id);
  assert.equal(rows[0].evidence.value, 'Ally');
  assert.equal(rows[0].evidence.source, first.id);
  assert.equal(graphConnections(rows, [c, faction()], 'u', true).length, 1);
  assert.equal(graphConnections(rows, [c, faction()], 'u', true)[0].label, 'Ally');
  plan.nodes.find(n => n.id === alt.id)!.relationship_changes = [{ relationship_id: 'r', label: null, note: '' }];
  rows = historicalGraphRows(plan, [relation()], [c, faction()], 'u', alt.id);
  assert.equal(rows[0].evidence.value, null);
  assert.equal(graphConnections(rows, [c, faction()], 'u', true)[0].label, 'Unknown / unrecorded');
  const unborn = { ...relation('unborn'), context_node_id: future.id };
  assert.equal(historicalGraphRows(plan, [unborn], [c, faction()], 'u', first.id)[0].evidence.value, null);
  plan.nodes.find(n => n.id === alt.id)!.changes = [{ id: 'absent', entity_id: 'c', property_key: 'status', previous_value: null, new_value: 'not_introduced', note: '' }];
  assert.equal(historicalGraphRows(plan, [relation()], [c, faction()], 'u', alt.id).length, 0);
});

test('PDF consumes institutional positions and every aggregate connection with direction and source', () => {
  const result = generateLorebookPdf({ title: 'Book', universe_name: 'Universe', sections: [{ category: 'characters', title: 'Characters', anchor: 'characters', entries: [{
    title: 'Character', anchor: 'character', category: 'characters', institutional_positions: [{ label: 'Galactic Admiral', value: 'Faction / Fleet' }],
  }] }], relationships: [{ source_title: 'Character', source_anchor: 'character', target_title: 'Faction', target_anchor: 'faction', label: 'Holds Galactic Admiral in', directed: true, connections: [
    { source_title: 'Character', source_anchor: 'character', target_title: 'Faction', target_anchor: 'faction', label: 'Member of', directed: true, provenance: 'authored', description: 'Explicit membership' },
    { source_title: 'Faction', source_anchor: 'faction', target_title: 'Character', target_anchor: 'character', label: 'Protects', directed: true, provenance: 'authored' },
  ] }] }, { includeToc: false });
  const text = new TextDecoder().decode(result.pdfBytes);
  for (const label of ['Institutional Positions', 'Galactic Admiral', 'Faction / Fleet', 'Member of', 'Protects', 'Explicit membership']) assert.ok(text.includes(label), label);
});
