/** Actual App callbacks and a focused hook/Studio fixture. Disposable memory only; no notebook I/O. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import '../../src/index.css';
import { App } from '../../src/App';
import { api } from '../../src/services/api';
import { applyOrganization } from '../../src/utils/organization';
import { useLorebookScope } from '../../src/hooks/useLorebookScope';
import { LorebookStudio } from '../../src/components/studios/LorebookStudio';
import { UniverseDashboard } from '../../src/components/studios/lorebook/UniverseDashboard';
import { CreateDocumentModal } from '../../src/components/common/CreateDocumentModal';
import { scopePreferenceKey, scopeValue, type LorebookScope } from '../../src/utils/lorebookNavigation';
import { navigationFixture, loreDoc } from '../fixtures/lorebookNavigation';
import type { Plan } from '../../src/utils/thought';
import type { DocumentDetail } from '../../src/types';
import type { ImportPreview, PortableInspection } from '../../src/services/portable';

const fixture = document.getElementById('fixture')!;
const output = document.getElementById('results')!;
const root = createRoot(fixture);
const results: string[] = [];
const notebook = 'finding10:test-notebook';
const secondNotebook = 'finding10:second-notebook';
const touchedKeys = ['mc_active_house_id', 'mc_selected_book_id', 'mc_active_universe_id', 'mc_editor_engine', 'mc_save_preferences', 'mc_theme', 'mc_atmosphere_preferences',
  ...[notebook, secondNotebook].flatMap(n => ['house-default', 'other'].map(h => scopePreferenceKey(n, h)))];
const savedPreferences = new Map(touchedKeys.map(k => [k, localStorage.getItem(k)]));
const restorePreferences = () => {
  for (const [key, value] of savedPreferences) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); }
};
window.addEventListener('pagehide', restorePreferences, { once: true });
const originals = { ...api };
let store = navigationFixture();
let bodies = new Map(store.documents.map(d => [d.id, `# ${d.id}\n\nOriginal authored content.`]));
let events: string[] = [];
let failSave = false;
let failRefresh = false;
let failHouseRefresh = false;
let importedHouse = 'house-default';
let currentNotebook = notebook;
let importCommits = 0;
let deferInitialOpen = false;
let releaseInitialOpen: (() => void) | undefined;

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const pause = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check: () => unknown, message: string) {
  for (let i = 0; i < 300; i++) { if (check()) return; await pause(20); }
  throw new Error(`${message}; ${fixture.textContent?.slice(-1500)}`);
}
const mount = async (element: React.ReactNode) => { root.render(element); await pause(70); };
const buttons = (scope: ParentNode = fixture) => [...scope.querySelectorAll('button')];
async function click(text: string, parent: ParentNode = fixture) {
  const button = buttons(parent).find(b => b.textContent?.trim().toLowerCase() === text.toLowerCase());
  assert(button && !button.disabled, `Missing/enabled button: ${text}`); button.click(); await pause();
}
async function choose(label: string, value: string) {
  const select = fixture.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
  assert(select && !select.disabled, `Missing/enabled select: ${label}`);
  select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); await pause();
  assert(select.value === value, `Selection not accepted: ${value}`);
}
async function fill(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true })); await pause();
}
function shortcut(key: string) { window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true })); }
const scopeSelect = () => fixture.querySelector('select[aria-label="Lorebook browsing scope"]') as HTMLSelectElement | null;
const sidebar = () => fixture.querySelector('aside[aria-label="Lorebook entries"]')!;
const rowIds = () => [...sidebar().querySelectorAll('[data-document-id]')].map(e => e.getAttribute('data-document-id')).sort().join(',');
const editor = () => fixture.querySelector('textarea[placeholder^="Write worldbuilding lore"], textarea[placeholder^="Write chapter prose"]') as HTMLTextAreaElement;
const specific = (universeId: string): LorebookScope => ({ kind: 'universe', universeId });

api.listDocuments = async () => { events.push('documents'); return structuredClone(store.documents); };
api.getLibraryInfo = async () => ({ library_path: currentNotebook, db_path: ':memory:', document_count: store.documents.length, poetry_count: 0, philosophy_count: 0, lorebook_count: store.documents.length });
api.listHouses = async () => { if (failHouseRefresh) throw Error('disposable House registry failure'); return structuredClone(store.houses); };
api.updateHouse = async input => {
  const existing = store.houses.find(h => h.id === input.id)!;
  Object.assign(existing, input); return structuredClone(existing);
};
api.listTags = async id => [...new Set(store.documents.filter(d => d.house_id === id).flatMap(d => d.tags))];
api.thoughtGet = async () => { events.push('plan'); if (failRefresh) throw Error('disposable refresh failure'); return { plan: structuredClone(store.plan) }; };
api.getDocument = async id => {
  events.push(`get:${id}`); const metadata = store.documents.find(d => d.id === id); assert(metadata, `Unknown fixture document: ${id}`);
  const detail = { metadata: structuredClone(metadata), content: bodies.get(id)! };
  if (deferInitialOpen && id === 'a-entry') { deferInitialOpen = false; return new Promise<DocumentDetail>(resolve => { releaseInitialOpen = () => resolve(detail); }); }
  return detail;
};
api.musicListTracks = async () => [];
api.updateOrganization = async (id, patch) => {
  events.push(`${patch.opened ? 'opened' : 'organization'}:${id}`);
  const index = store.documents.findIndex(d => d.id === id);
  store.documents[index] = applyOrganization(store.documents[index], patch);
  return structuredClone(store.documents[index]);
};
api.saveDocument = async (id, content, title, tags, metadata) => {
  events.push(`save:${id}`); if (failSave) throw Error('disposable save failure');
  const doc = store.documents.find(d => d.id === id)!;
  if (content !== undefined) bodies.set(id, content);
  if (title !== undefined) doc.title = title;
  if (tags !== undefined) doc.tags = tags;
  if (metadata !== undefined) doc.metadata_json = metadata;
  return structuredClone(doc);
};
api.searchDocuments = async (query, type, houseId) => store.documents.filter(d => (!houseId || d.house_id === houseId) && (!type || d.doc_type === type) && (query === 'all-writing' || d.id.includes(query)))
  .map(d => ({ id: d.id, title: d.title, doc_type: d.doc_type, relative_path: d.relative_path, snippet: 'Full authored writing', match_type: 'content' as const }));
api.portableUniverseHasPendingJournal = async () => false;
api.portableUniverseInspect = async path => ({ path, compatible: true, unsupported_features: [], document_count: 1, archived_count: 0, chapter_count: 0, asset_count: 0, book_count: 0, branch_count: 0, milestone_count: 0, relationship_count: 0,
  universe: { id: 'import-source', name: 'Imported World' }, archived_records: [], total_bytes: 10, manifest: { format_version: 1, source_house: { id: 'source', name: 'Fixture Source House' }, created_at: '2026-01-01', package_id: 'disposable', warnings: [], unresolved_references: [] } } as unknown as PortableInspection);
api.portableUniverseImportPreview = async request => {
  importedHouse = request.target_house_id;
  return { operation_id: request.operation_id!, package_path: request.package_path, target_house_id: request.target_house_id, target_house_name: store.houses.find(h => h.id === request.target_house_id)!.name,
    policy: request.policy, destination_fingerprint: 'fresh-fixture', proposed_universe_id: 'imported', proposed_universe_name: 'Imported World', is_valid: true,
    id_mappings: {}, document_paths: [], asset_paths: [], collisions: [], diagnostics: [], summary: { documents_count: 1, books_count: 0 } } as ImportPreview;
};
api.portableUniverseImportCommit = async request => {
  events.push('commit'); importCommits++;
  assert(request.target_house_id === importedHouse && request.expected_destination_fingerprint === 'fresh-fixture', 'Import v1 destination/fingerprint changed');
  store.plan.universes.push({ id: 'imported', name: 'Imported World' });
  store.houses.find(h => h.id === importedHouse)!.universe_ids.push('imported');
  const doc = loreDoc('imported-entry', { universe_id: 'imported' }, { house_id: importedHouse }); store.documents.push(doc); bodies.set(doc.id, 'Imported authored content');
  return { operation_id: request.operation_id, universe_id: 'imported', universe_name: 'Imported World', house_id: importedHouse, house_name: 'Destination', documents_imported: 1, archived_documents_imported: 0, assets_imported: 0, plan_revision: 1 };
};

async function start(scope?: LorebookScope, deferFirstOpen = false) {
  await mount(<></>);
  store = navigationFixture(); bodies = new Map(store.documents.map(d => [d.id, `# ${d.id}\n\nOriginal authored content.`]));
  events = []; failSave = false; failRefresh = false; failHouseRefresh = false; currentNotebook = notebook; importCommits = 0;
  deferInitialOpen = deferFirstOpen; releaseInitialOpen = undefined;
  for (const n of [notebook, secondNotebook]) for (const h of ['house-default', 'other']) localStorage.removeItem(scopePreferenceKey(n, h));
  localStorage.setItem('mc_active_house_id', 'house-default'); localStorage.setItem('mc_editor_engine', 'textarea'); localStorage.setItem('mc_save_preferences', '{"mode":"manual","debounceSeconds":3}'); localStorage.removeItem('mc_selected_book_id');
  if (scope) localStorage.setItem(scopePreferenceKey(notebook, 'house-default'), JSON.stringify(scope));
  await mount(<App/>);
  if (!deferFirstOpen) await waitFor(() => editor(), 'App did not open the fixture document');
  fixture.querySelector<HTMLButtonElement>('button[title="Lorebook Studio"]')!.click();
  await waitFor(() => scopeSelect() && !scopeSelect()!.disabled, 'Lorebook scope did not initialize'); await pause(60);
}
async function openSearchResult(id: string) {
  shortcut('k'); await pause();
  const input = fixture.querySelector<HTMLInputElement>('input[placeholder^="Search in "]')!;
  assert(input, 'Global search was not opened'); await fill(input, id); await pause(240);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await pause(100);
}
async function openImport(destination = 'house-default') {
  await start(); await click('Universe Dashboard', sidebar()); await click('Import Universe (.mcuniverse)');
  const input = fixture.querySelector<HTMLInputElement>('input[placeholder$="Aetheria.mcuniverse"]')!;
  assert(input, 'Import dialog was not wired through the workspace'); await fill(input, 'disposable.mcuniverse'); await click('Inspect');
  await waitFor(() => buttons().some(b => b.textContent?.trim() === 'Commit Universe Import'), 'Import preview missing');
  if (destination !== 'house-default') {
    const select = [...fixture.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'other'))!;
    select.value = destination; select.dispatchEvent(new Event('change', { bubbles: true })); await pause(80);
  }
}
async function run(name: string, test: () => Promise<void>) {
  try { await test(); results.push(`PASS ${name}`); }
  catch (err) { results.push(`FAIL ${name}: ${String(err)}`); }
  output.textContent = results.join('\n');
}

try {
  if (new URLSearchParams(location.search).has('preview')) {
    await start(); await choose('Lorebook browsing scope', 'universe:b');
    output.textContent = 'Disposable visual preview: browsing Another Universe, with the Psychosis entry still open.';
    await new Promise<void>(resolve => {
      const finish = document.createElement('button'); finish.textContent = 'Finish visual check';
      finish.style.cssText = 'position:fixed;right:12px;bottom:40px;z-index:100001;background:#222;color:white;padding:8px;border:1px solid #999';
      finish.onclick = () => { finish.remove(); resolve(); }; document.body.appendChild(finish);
    });
  } else {
  await run('App: All default, two Universes, duplicate titles, empty world, no canonical writes', async () => {
    await start(); assert(scopeSelect()!.value === 'all', 'First use did not default to All');
    assert(rowIds().includes('a-entry') && rowIds().includes('b-entry'), 'All lost House discovery');
    const before = JSON.stringify(store); const opened = events.filter(e => e.startsWith('opened:')).length;
    await choose('Lorebook browsing scope', 'universe:a'); assert(rowIds() === 'a-entry,a-legacy', 'Universe A projection is mixed');
    await choose('Lorebook browsing scope', 'universe:b'); assert(rowIds() === 'b-entry', 'Universe B projection is mixed');
    assert(editor().value.includes('a-entry') && fixture.textContent?.includes('Open entry: Psychosis'), 'Open document lost its content/Universe caption');
    await choose('Lorebook browsing scope', 'universe:empty'); assert(rowIds() === '', 'Empty Universe has rows');
    assert(events.filter(e => e.startsWith('opened:')).length === opened && JSON.stringify(store) === before, 'Browsing wrote canonical data or history');
  });
  await run('App: unsaved body survives scope changes, then saves to its original UUID', async () => {
    await start(specific('a')); const body = 'Unsaved authored draft belonging to A.';
    await fill(editor(), body); const opened = events.filter(e => e.startsWith('opened:')).length;
    await choose('Lorebook browsing scope', 'universe:b'); await choose('Lorebook browsing scope', 'unresolved');
    assert(editor().value === body, 'Scope change reset unsaved editor content');
    assert(!events.some(e => e.startsWith('save:')) && events.filter(e => e.startsWith('opened:')).length === opened, 'Scope selection saved/opened a document');
    shortcut('s'); await waitFor(() => bodies.get('a-entry') === body, 'Draft did not save to its original document');
    assert(!events.includes('save:b-entry'), 'Draft was written to the browsing target');
  });
  await run('App: global search follows a specific scope; intentional All stays All', async () => {
    await start(specific('a')); await openSearchResult('b-entry');
    assert(scopeSelect()!.value === 'universe:b' && editor().value.includes('b-entry'), 'Specific context did not follow explicit document open');
    await choose('Lorebook browsing scope', 'all'); await openSearchResult('a-entry');
    assert(scopeSelect()!.value === 'all', 'Explicit All was overridden by document attribution');
  });
  await run('App/CodeMirror: scope changes retain the editor instance, unsaved buffer and save UUID', async () => {
    await start(specific('a')); await click('Switch to CodeMirror 6');
    await waitFor(() => fixture.querySelector('.cm-content'), 'CodeMirror did not mount');
    const content = fixture.querySelector<HTMLElement>('.cm-content')!;
    const view = EditorView.findFromDOM(content)!; assert(view, 'CodeMirror view missing');
    const body = 'CodeMirror draft retained across Universe scopes.';
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: body } }); await pause();
    await choose('Lorebook browsing scope', 'universe:b'); await choose('Lorebook browsing scope', 'unresolved');
    assert(fixture.querySelector('.cm-content') === content && view.state.doc.toString() === body, 'Scope change remounted/reset CodeMirror');
    shortcut('s'); await waitFor(() => bodies.get('a-entry') === body, 'CodeMirror saved to another context');
    assert(!events.includes('save:b-entry'), 'CodeMirror wrote to browsing target');
  });
  await run('App: a delayed startup document cannot replace a newer explicit open or its draft', async () => {
    await start(specific('a'), true); await openSearchResult('b-entry');
    await fill(editor(), 'Newer B draft survives the delayed startup response.');
    assert(releaseInitialOpen, 'Initial document request was not deferred'); releaseInitialOpen(); await pause(100);
    assert(editor().value === 'Newer B draft survives the delayed startup response.' && scopeSelect()!.value === 'universe:b', 'Startup response replaced explicit navigation');
    shortcut('s'); await pause(80);
  });
  await run('App: actual Unresolved view, explicit archived inspection, duplicate UUID labels', async () => {
    await start(); await choose('Lorebook browsing scope', 'unresolved');
    assert(rowIds() === 'ambiguous,malformed,unassigned,unknown', 'Unresolved list contains assigned/foreign entries');
    await click('Universe Dashboard', sidebar());
    assert(fixture.querySelector('section[aria-label="Unassigned and unresolved Lore"]'), 'Unassigned navigation opened an arbitrary document');
    assert(fixture.textContent?.includes('Unknown explicit Universe UUID'), 'Unresolved reasons missing');
    await choose('Lorebook browsing scope', 'universe:archived'); assert(rowIds() === 'archived-entry', 'Archived entries lost');
    const options = [...scopeSelect()!.options]; assert(options.find(o => o.value === 'universe:duplicate-1')!.text.includes('duplicate-1'), 'Duplicate choice is ambiguous');
    assert(options.find(o => o.value === 'universe:archived')!.parentElement?.getAttribute('label')?.includes('Archived'), 'Archived inspection is an ordinary target');
  });
  await run('App: Favorites, Recent, body search, tags, scoped counts and House badge', async () => {
    await start(); await choose('Lorebook browsing scope', 'universe:b');
    await click('Favorites', sidebar()); assert(rowIds() === 'b-entry', 'Favorites escaped scope');
    await click('Recent', sidebar()); assert(rowIds() === 'b-entry', 'Recent escaped scope'); await click('All', sidebar());
    await fill(sidebar().querySelector<HTMLInputElement>('input[aria-label="Search library titles and writing"]')!, 'all-writing'); await pause(240);
    assert(rowIds() === 'b-entry', 'Full-text results escaped scoped UUIDs'); sidebar().querySelector('details')!.open = true;
    assert(!sidebar().querySelector('[aria-label="Filter by tags"]')!.textContent?.includes('a-only'), 'Foreign-scope tags leaked');
    assert(sidebar().textContent?.includes('1 documents') && fixture.textContent?.includes('8 · House'), 'Scoped count and House badge confused');
  });
  await run('App: per-House preferences survive actual guarded switches', async () => {
    await start(specific('a')); fixture.querySelector<HTMLButtonElement>('button[aria-label^="Current House:"]')!.click(); await pause();
    fixture.querySelector<HTMLButtonElement>('button[role="option"][aria-selected="false"]')!.click();
    await waitFor(() => scopeSelect()?.value === 'all' && !scopeSelect()?.disabled && fixture.textContent?.includes('Other House'), 'Foreign House did not initialize All');
    await choose('Lorebook browsing scope', 'universe:foreign'); fixture.querySelector<HTMLButtonElement>('button[aria-label^="Current House:"]')!.click(); await pause();
    fixture.querySelector<HTMLButtonElement>('button[role="option"][aria-selected="false"]')!.click();
    await waitFor(() => scopeSelect()?.value === 'universe:a' && !scopeSelect()?.disabled, 'Original House preference was not restored');
  });
  await run('App: Ctrl+N uses controlled scope; archived creation is excluded', async () => {
    await start(); await choose('Lorebook browsing scope', 'universe:b'); shortcut('n'); await pause(80);
    const target = fixture.querySelector<HTMLSelectElement>('select[aria-label="Target Universe"]')!;
    assert(target?.value === 'b', 'Keyboard creation used a stale localStorage world');
    assert(![...target.options].some(o => o.value === 'archived'), 'Archived world is an ordinary creation target');
  });
  await run('App: failed House management refresh retains the registry and specific-world preference', async () => {
    await start(specific('a')); const saved = localStorage.getItem(scopePreferenceKey(notebook, 'house-default'));
    fixture.querySelector<HTMLButtonElement>('button[aria-label^="Current House:"]')!.click(); await pause(); await click('Manage Houses...');
    fixture.querySelector<HTMLButtonElement>('button[title="Edit House settings"]')!.click(); await pause();
    failHouseRefresh = true; await click('Save Changes'); await pause(100);
    assert(scopeSelect()?.value === 'universe:a' && scopeSelect()?.disabled, 'Registry failure replaced acknowledged attribution');
    assert(localStorage.getItem(scopePreferenceKey(notebook, 'house-default')) === saved, 'Registry failure overwrote specific preference');
    assert(fixture.textContent?.includes('House information failed to refresh'), 'House refresh failure was hidden');
    failHouseRefresh = false; await click('Save Changes'); await pause(100);
    assert(scopeSelect()?.value === 'universe:a' && !scopeSelect()?.disabled, 'House refresh retry lost the preference');
  });
  await run('App: failed save blocks explicit Dashboard navigation and retains the draft', async () => {
    await start(specific('a')); await fill(editor(), 'Draft blocked by disposable save failure.'); failSave = true; await click('Dashboard'); await pause(100);
    assert(editor()?.value === 'Draft blocked by disposable save failure.' && scopeSelect()!.value === 'universe:a', 'Failed save allowed Dashboard navigation');
    failSave = false; shortcut('s'); await pause(100);
  });
  await run('App: same-House import refreshes canonical collections before navigation', async () => {
    await openImport(); await click('Commit Universe Import');
    await waitFor(() => buttons().some(b => b.textContent?.trim() === 'Open Imported Universe' && !b.disabled), 'Refresh did not retain success dialog');
    assert(events.indexOf('commit') < events.lastIndexOf('documents') && events.indexOf('commit') < events.lastIndexOf('plan'), 'Canonical collections not refreshed');
    await click('Open Imported Universe'); await waitFor(() => scopeSelect()?.value === 'universe:imported', 'Imported scope not selected');
    assert(rowIds() === 'imported-entry' && importCommits === 1, 'Imported collection missing or commit repeated');
  });
  await run('App: cross-House import uses guarded switching and destination preferences', async () => {
    await openImport('other'); await click('Commit Universe Import'); await pause(160); await click('Open Imported Universe');
    await waitFor(() => scopeSelect()?.value === 'universe:imported' && !scopeSelect()?.disabled, 'Cross-House import did not open');
    assert(localStorage.getItem('mc_active_house_id') === 'other' && rowIds() === 'imported-entry', 'Stale source-House context');
    await waitFor(() => localStorage.getItem(scopePreferenceKey(notebook, 'other'))?.includes('imported'), 'Wrong preference key');
  });
  await run('App: failed refresh retains the committed import and supports refresh-only retry', async () => {
    await openImport(); const previous = localStorage.getItem(scopePreferenceKey(notebook, 'house-default')); failRefresh = true;
    await click('Commit Universe Import'); await pause(160);
    assert(buttons().find(b => b.textContent?.trim() === 'Open Imported Universe')?.disabled, 'Unrefreshed import can navigate');
    assert(localStorage.getItem(scopePreferenceKey(notebook, 'house-default')) === previous, 'Failed plan load overwrote scope');
    failRefresh = false; await click('Retry library refresh'); await click('Open Imported Universe');
    await waitFor(() => scopeSelect()?.value === 'universe:imported', 'Refreshed import failed to open'); assert(importCommits === 1, 'Retry duplicated commit');
  });
  await run('Dashboard: foreign, archived and deleted Book hints clear before rendering', async () => {
    for (const id of ['book-b', 'book-archived', 'missing']) {
      await mount(<></>); const value = navigationFixture(); value.plan.books[1].name = 'Foreign Book from B'; localStorage.setItem('mc_selected_book_id', id);
      await mount(<UniverseDashboard activeHouse={value.houses[0]} houses={value.houses} universeId="a" plan={value.plan} documents={value.documents} onOpenDocument={() => {}} onCreateEntity={() => {}} onCreateChapter={async () => { throw Error('must not create'); }} onSwitchUniverse={() => {}}/>);
      assert(!fixture.textContent?.includes('Foreign Book from B'), 'Foreign Book rendered under A'); assert(localStorage.getItem('mc_selected_book_id') === null, `Stale hint retained: ${id}`);
    }
  });
  await run('Creation dialog: ambiguous names require a UUID; archives excluded', async () => {
    const value = navigationFixture(); await mount(<CreateDocumentModal isOpen onClose={() => {}} defaultType="lorebook" plan={value.plan} planStatus="loaded" initialUniverseName="Duplicate" houses={value.houses} activeHouse={value.houses[0]} onCreate={async () => { throw Error('must not create'); }}/>);
    const target = fixture.querySelector<HTMLSelectElement>('select[aria-label="Target Universe"]')!;
    assert(target.value === '' && ![...target.options].some(o => o.value === 'archived'), 'Unsafe initial creation choice'); await choose('Target Universe', 'duplicate-2');
  });

  await run('Studio: direct entity creation uses the validated Universe; archived actions are disabled', async () => {
    await mount(<></>); localStorage.removeItem('mc_selected_book_id'); const value = navigationFixture();
    const created: Record<string, unknown>[] = [];
    const render = (world: string) => <LorebookStudio scope={specific(world)} activeHouse={value.houses[0]} houses={value.houses} plan={value.plan} allDocuments={value.documents} saveStatus="saved" onSave={async () => {}}
      onCreateDocument={async (_type, _title, _content, raw) => { created.push(JSON.parse(raw!)); }}/>;
    await mount(render('a')); await click('+ Add Character');
    assert(created.length === 1 && created[0].universe_id === 'a', 'Direct entity creation chose another Universe');
    await mount(render('archived'));
    assert(buttons().find(b => b.textContent?.trim() === '+ Add Character')?.disabled, 'Archived direct creation is available');
    await mount(render('missing')); assert(!buttons().some(b => b.textContent?.trim() === '+ Add Character'), 'Invalid scope exposed first-world creation');
  });
  await run('Studio/BookView: chapter creation and same-named legacy Book links stay within their Universe', async () => {
    await mount(<></>); const value = navigationFixture(); localStorage.setItem('mc_selected_book_id', 'book-a');
    value.documents.push(loreDoc('legacy-uuid-chapter', { entry_type: 'chapter', book_id: 'book-a' }, { title: 'Legacy Book UUID chapter' }), loreDoc('chapter-a', { universe_id: 'a', entry_type: 'chapter', book_id: 'book-a' }, { title: 'Chapter belonging to A' }),
      loreDoc('chapter-b', { universe_id: 'b', entry_type: 'chapter', book: 'Shared Book' }, { title: 'Foreign legacy chapter from B' }));
    const created: Record<string, unknown>[] = [];
    await mount(<LorebookStudio scope={specific('a')} activeHouse={value.houses[0]} houses={value.houses} plan={value.plan} allDocuments={value.documents} saveStatus="saved" onSave={async () => {}}
      onCreateDocument={async (_type, _title, _content, raw) => { created.push(JSON.parse(raw!)); }}/>);
    assert(fixture.textContent?.includes('Chapter belonging to A') && fixture.textContent?.includes('Legacy Book UUID chapter') && !fixture.textContent?.includes('Foreign legacy chapter from B'), 'Book linking crossed Universe boundaries');
    await click('New Chapter'); await fill(fixture.querySelector<HTMLInputElement>('input[placeholder^="e.g. Chapter 1"]')!, 'Authored chapter'); await click('Create Chapter');
    assert(created.length === 1 && created[0].universe_id === 'a' && created[0].book_id === 'book-a', 'Chapter callback combined foreign Book/Universe IDs');
  });

  let controller: ReturnType<typeof useLorebookScope>;
  const HookFixture = ({ available, ready, book = notebook, houseId = 'house-default', open }: { available: Plan | null; ready: boolean; book?: string; houseId?: string; open?: DocumentDetail }) => {
    const value = navigationFixture(); controller = useLorebookScope(book, houseId, available, value.houses, ready);
    return <><output data-hook-scope>{scopeValue(controller.scope)}</output><button onClick={() => controller.followOpenedDocument(value.documents.find(d => d.id === 'b-entry')!)}>Explicitly open B while loading</button>
      <LorebookStudio scope={controller.scope} scopeReady={controller.ready} onScopeChange={controller.selectScope} document={open} activeHouse={value.houses.find(h => h.id === houseId)} houses={value.houses} plan={available} allDocuments={value.documents} saveStatus="saved" onSave={async () => {}}/></>;
  };
  await run('StrictMode hook + Studio: pending explicit open reconciles on late plan without losing edits', async () => {
    await mount(<></>); localStorage.setItem(scopePreferenceKey(notebook, 'house-default'), JSON.stringify(specific('a')));
    const value = navigationFixture(); const open = { metadata: value.documents.find(d => d.id === 'b-entry')!, content: 'B document loaded before planning.' };
    await mount(<React.StrictMode><HookFixture available={null} ready={false} open={open}/></React.StrictMode>);
    assert(localStorage.getItem(scopePreferenceKey(notebook, 'house-default'))?.includes('"a"'), 'Loading overwrote preference');
    await click('Explicitly open B while loading'); await fill(editor(), 'Unsaved B body before plan acknowledgement.');
    await mount(<React.StrictMode><HookFixture available={value.plan} ready open={open}/></React.StrictMode>);
    await waitFor(() => fixture.querySelector('[data-hook-scope]')?.textContent === 'universe:b', 'Late plan did not reconcile explicit open');
    assert(editor().value === 'Unsaved B body before plan acknowledgement.' && fixture.textContent?.includes('Another Universe'), 'Late plan reset body or retained wrong breadcrumb');
  });
  await run('React hook: notebook/House isolation, invalid UUID fallback, intentional All and Unresolved', async () => {
    await mount(<></>); const value = navigationFixture(); localStorage.setItem(scopePreferenceKey(notebook, 'house-default'), JSON.stringify(specific('a')));
    await mount(<HookFixture available={value.plan} ready/>); assert(scopeValue(controller!.scope) === 'universe:a', 'Valid preference lost');
    await mount(<HookFixture available={value.plan} ready book={secondNotebook}/>); assert(scopeValue(controller!.scope) === 'all', 'Notebook scope leaked');
    controller!.selectScope({ kind: 'unresolved' }); await pause(); controller!.followOpenedDocument(value.documents[1]); await pause(); assert(scopeValue(controller!.scope) === 'unresolved', 'Unresolved overridden');
    await mount(<HookFixture available={value.plan} ready book={secondNotebook} houseId="other"/>); assert(scopeValue(controller!.scope) === 'all', 'House scope leaked');
    await mount(<></>); localStorage.setItem(scopePreferenceKey(secondNotebook, 'other'), JSON.stringify(specific('a')));
    await mount(<HookFixture available={value.plan} ready book={secondNotebook} houseId="other"/>); assert(scopeValue(controller!.scope) === 'all', 'Foreign preference did not fall back to All');
  });
  }
} finally {
  await mount(<></>); Object.assign(api, originals);
  restorePreferences(); window.removeEventListener('pagehide', restorePreferences);
}
const failed = results.filter(r => r.startsWith('FAIL')).length;
output.textContent = `${results.join('\n')}\n${results.length - failed} passed; ${failed} failed; 0 skipped.`;
output.setAttribute('role', 'status');
document.title = failed ? 'FAIL: Universe navigation acceptance' : 'PASS: Universe navigation acceptance';
