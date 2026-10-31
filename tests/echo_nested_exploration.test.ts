import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditorState } from '@codemirror/state';
import { buildEchoCatalog, isEchoEligible } from '../src/utils/echoContext';
import { buildEchoSearchIndex, matchEchoText } from '../src/utils/echoMatching';
import { findCandidateMatches } from '../src/components/echo/echoExtension';
import { renderMarkdownBlocks } from '../src/components/echo/EchoDocumentationPopup';
import { suppressTemplateProse } from '../src/utils/loreTemplateProse';
import { EchoRequestGate, explorationReducer, initialHistory } from '../src/components/echo/explorationState';
import { echoFixture } from './fixtures/echoNested';
import { house, loreDoc } from './fixtures/lorebookNavigation';

const fixture = echoFixture();
const { plan, houses, documents } = fixture;
const catalog = buildEchoCatalog(documents, 'u', 'house-default', plan, houses);

test('shared matcher retains CodeMirror case, Unicode, aliases, longest terms and boundary semantics', () => {
  const text = 'ABYSSALS, 深渊族; Colorless Ones visit Vibrant Land. NotAbyssals is ordinary.';
  const matches = matchEchoText(text, catalog.index);
  assert.deepEqual(matches.map(m => m.matchedText), ['ABYSSALS', '深渊族', 'Colorless Ones', 'Vibrant Land']);
  assert.deepEqual(findCandidateMatches(EditorState.create({ doc: text }).doc, catalog.entities), matches);
  assert.equal(matchEchoText('Abyssals', catalog.index, [{ id: 'r', entityId: 'abyssals', from: 0, to: 8, matchedText: 'Abyssals' }]).length, 0);
});
test('ambiguity ordering is deterministic across input ordering and never a single first match', () => {
  const resolve = (reverse: boolean) => matchEchoText('Twins', buildEchoSearchIndex(reverse ? [...catalog.entities].reverse() : catalog.entities))[0];
  assert.equal(resolve(false).isAmbiguous, true);
  assert.deepEqual(resolve(false).matchingEntities.map(e => e.id), ['twin-one', 'twin-two']);
  assert.deepEqual(resolve(false), resolve(true));
});
test('minimum terms and alias collisions deduplicate by UUID', () => {
  const entity = catalog.byId.get('abyssals')!;
  const index = buildEchoSearchIndex([{ ...entity, name: 'X', aliases: ['Abyssals', 'Abyssals'] }, { ...entity, id: 'other', aliases: ['Abyssals'] }]);
  assert.equal(matchEchoText('X', index).length, 0);
  assert.equal(matchEchoText('Abyssals', index)[0].matchingEntities.length, 2);
});
test('formatted visible leaves are recognized without crossing nodes or linkifying code/destinations/HTML', () => {
  const seen: string[] = [];
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, renderMarkdownBlocks('## Abyssals\n\n**Vibrant Land** and *Empyreans*\n\n- Abyssals\n- `Empyreans`\n\n> Vibrant Land\n\n[hidden](https://invalid/Abyssals) <img src="Empyreans" onerror="evil()">', text => {
    seen.push(text); return React.createElement('span', null, text);
  })));
  assert.ok(seen.includes('Vibrant Land')); assert.ok(seen.includes('Empyreans'));
  assert.ok(!seen.some(s => s.includes('https:') || s.includes('src=') || s.includes('`')));
  assert.match(html, /<code/); assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img|<a href/);
});
test('factory suppression occurs before discovery and leaves canonical Markdown untouched', () => {
  const prose = '### Overview\n\nProvide the canonical context for this character in Echo world.\n\n### Historical Lore\n\nAbyssals lived here.';
  const projected = suppressTemplateProse(prose, 'character', 'Echo world');
  assert.doesNotMatch(projected, /Provide the canonical/); assert.match(projected, /Abyssals/); assert.match(prose, /Provide/);
});
test('root eligibility excludes foreign Houses/Universes, archived entities and malformed ownership', () => {
  assert.ok(!catalog.byId.has('foreign-entry')); assert.ok(!catalog.byId.has('archived'));
  assert.equal(isEchoEligible(loreDoc('x', { universe_id: 'missing', universe: 'Echo world' }), 'u', 'house-default', plan, houses), false);
  assert.equal(isEchoEligible(loreDoc('x', { universe_id: 'foreign', universe: 'Echo world' }), 'u', 'house-default', plan, houses), false);
  assert.equal(isEchoEligible(loreDoc('x', { universe_id: 'u' }, { house_id: 'foreign-house' }), 'u', 'house-default', plan, houses), false);
});
test('legacy names resolve uniquely inside the correct House, not globally', () => {
  const nextPlan = { ...plan, universes: [...plan.universes, { id: 'same-foreign', name: 'Echo world' }] };
  const registry = [houses[0], house('foreign-house', 'Other', ['foreign', 'same-foreign'])];
  const doc = loreDoc('legacy', { universe: 'Echo world' });
  assert.equal(isEchoEligible(doc, 'u', 'house-default', nextPlan, registry), true);
  assert.equal(isEchoEligible(doc, 'u', 'house-default', { ...nextPlan, universes: [...nextPlan.universes, { id: 'duplicate', name: 'Echo world' }] }, registry), false);
});
test('missing House follows default convention; conflicting catalog and registry ownership is denied', () => {
  const doc = loreDoc('legacy', { universe_id: 'u' }, { house_id: undefined });
  assert.equal(isEchoEligible(doc, 'u', 'house-default', plan, houses), true);
  assert.equal(isEchoEligible(doc, 'u', 'foreign-house', plan, houses), false);
  assert.equal(isEchoEligible(doc, 'u', 'house-default', { ...plan, entities: [{ id: doc.id, universe_id: 'foreign' }] }, houses), false);
  assert.equal(isEchoEligible(doc, 'u', 'house-default', plan, [...houses, house('bad', 'Bad registry', ['u'])]), false);
});
test('catalog-only ownership agrees with Lorebook navigation and normalized projected UUID', () => {
  const doc = loreDoc('catalog-only', { entry_type: 'character' });
  const next = { ...plan, entities: [{ id: doc.id, universe_id: 'u' }] };
  assert.equal(buildEchoCatalog([doc], 'u', 'house-default', next, houses).entities[0].universeId, 'u');
});
test('secondary relationship metadata never exposes denied endpoint names or descriptions', () => {
  const entity = catalog.projectEntity('abyssals')!;
  assert.deepEqual(entity.relationships.map(r => r.targetId), ['twin-two']);
  assert.doesNotMatch(JSON.stringify(entity), /MUST NOT LEAK|Foreign Secret/);
});
test('office and roster projections exclude archived/foreign targets', () => {
  const faction = loreDoc('faction', { universe_id: 'u', entry_type: 'faction', faction_fields: { positions: [{ id: 'p', title: 'Keeper', holder_ids: ['foreign-entry', 'abyssals'] }] } });
  const result = buildEchoCatalog([...documents, faction], 'u', 'house-default', plan, houses);
  assert.deepEqual(result.projectEntity('faction')!.factionStructure!.positions[0].holders, ['Abyssals']);
  assert.equal(result.projectEntity('abyssals')!.heldOffices![0].factionId, 'faction');
});
test('author policy retains draft/speculative and legacy status behavior without reader filtering', () => {
  for (const meta of [{ canon_status: 'draft' }, { canon_status: 'speculative' }, { status: 'archived' }, { private: true }]) {
    assert.equal(isEchoEligible(loreDoc('x', { universe_id: 'u', ...meta }), 'u', 'house-default', plan, houses), true);
  }
});
test('self pushes are no-ops; cycles and three-level visits are explicit', () => {
  let state = initialHistory('abyssals'); const original = state;
  state = explorationReducer(state, { type: 'push', entityId: 'abyssals' }); assert.equal(state, original);
  for (const entityId of ['land', 'empyreans', 'abyssals']) state = explorationReducer(state, { type: 'push', entityId });
  assert.deepEqual(state.visits.map(v => v.entityId), ['abyssals', 'land', 'empyreans', 'abyssals']);
});
test('Back/Forward and breadcrumbs preserve section and scroll, and branch truncation works', () => {
  let state = explorationReducer(initialHistory('abyssals'), { type: 'remember', section: 'relationships', scrollTop: 123, focusKey: 'target' });
  state = explorationReducer(state, { type: 'push', entityId: 'land' });
  state = explorationReducer(state, { type: 'go', cursor: 0 }); assert.equal(state.visits[state.cursor].scrollTop, 123); assert.equal(state.visits[0].section, 'relationships');
  state = explorationReducer(state, { type: 'go', cursor: 1 }); assert.equal(state.visits[state.cursor].entityId, 'land');
  state = explorationReducer(state, { type: 'go', cursor: 0 }); state = explorationReducer(state, { type: 'push', entityId: 'empyreans' });
  assert.deepEqual(state.visits.map(v => v.entityId), ['abyssals', 'empyreans']);
  assert.equal(explorationReducer(state, { type: 'go', cursor: 8 }), state);
});
test('retained history caps at 50 without capping total exploration depth or storing bodies', () => {
  let state = initialHistory('0');
  for (let i = 1; i <= 120; i++) state = explorationReducer(state, { type: 'push', entityId: String(i) });
  assert.equal(state.visits.length, 50); assert.equal(state.visits[0].entityId, '71'); assert.equal(state.cursor, 49); assert.equal(state.truncated, true);
  assert.ok(state.visits.every(v => !('prose' in v)));
});
test('request generations discard rapid navigation and close/reopen deferred responses', async () => {
  const gate = new EchoRequestGate(); const published: string[] = [];
  const deferred = () => { let resolve!: (s: string) => void; const promise = new Promise<string>(r => { resolve = r; }); return { promise, resolve }; };
  const a = deferred(), b = deferred(), c = deferred();
  const start = (p: Promise<string>) => { const current = gate.start(); return p.then(s => { if (current()) published.push(s); }); };
  const pending = [start(a.promise), start(b.promise), start(c.promise)];
  b.resolve('B'); a.resolve('A'); c.resolve('C'); await Promise.all(pending); assert.deepEqual(published, ['C']);
  const closed = deferred(); const closing = start(closed.promise); gate.invalidate(); closed.resolve('closed'); await closing; assert.deepEqual(published, ['C']);
});
test('catalog construction and all discovery/history operations leave canonical fixture data unchanged', () => {
  const before = JSON.stringify(fixture);
  const projected = buildEchoCatalog(documents, 'u', 'house-default', plan, houses);
  matchEchoText(fixture.bodies.abyssals, projected.index);
  explorationReducer(initialHistory('abyssals'), { type: 'push', entityId: 'land' });
  assert.equal(JSON.stringify(fixture), before);
});

test('nested formatting and fenced code never expose hidden Markdown destinations to discovery', () => {
  const leaves: string[] = [];
  renderMarkdownBlocks('**[label](https://invalid/Abyssals)** and `Abyssals`\n\n```\nAbyssals\n\nEmpyreans\n```', text => { leaves.push(text); return text; });
  assert.ok(!leaves.some(text => /Abyssals|Empyreans|https:/.test(text)));
});

test('indexed scanner agrees with the former Unicode regex scanner across generated overlap/boundary cases', () => {
  const base = catalog.entities[0];
  const names = ['Abyssals', 'Vibrant', 'Vibrant Land', 'Land', '深渊族', 'Éowyn', '𐐀born', 'O\'Neill', 'C++', '(Realm)', 'Long alias 12', 'Long alias 123'];
  const entities = names.map((name, i) => ({ ...base, id: String(i), name, aliases: [name.toUpperCase()] }));
  const index = buildEchoSearchIndex(entities);
  const pattern = `(?<![\\p{L}\\p{N}])(?:${index.sortedTerms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`;
  const separator = [' ', ', ', '\n', '—', '_', '123', 'x', '😀'];
  for (let seed = 0; seed < 80; seed++) {
    const text = Array.from({ length: 20 }, (_, i) => names[(seed * 7 + i * 3) % names.length] + separator[(seed + i) % separator.length]).join('');
    const confirmed = [{ id: 'ref', entityId: '0', from: seed % 25, to: seed % 25 + 9, matchedText: '' }];
    const expected = [...text.matchAll(new RegExp(pattern, 'giu'))].filter(m => index.termMap.has(m[0].toLowerCase()) && !confirmed.some(r => m.index! < r.to && m.index! + m[0].length > r.from)).map(m => [m.index, m[0]]);
    assert.deepEqual(matchEchoText(text, index, confirmed).map(m => [m.from, m.matchedText]), expected);
  }
});
