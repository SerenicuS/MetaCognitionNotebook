/** Open /tests/browser/echo-nested.html with Vite; all documents/API reads are disposable in-memory fixtures. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { redo, undo } from '@codemirror/commands';
import '../../src/index.css';
import { MarkdownEditor, type MarkdownEditorProps } from '../../src/components/editor/MarkdownEditor';
import { LorebookStudio } from '../../src/components/studios/LorebookStudio';
import { BookView } from '../../src/components/studios/lorebook/BookView';
import { api } from '../../src/services/api';
import { echoFixture } from '../fixtures/echoNested';

const target = document.getElementById('fixture')!;
const root = createRoot(target);
const results = document.getElementById('results')!;
const previousPreference = localStorage.getItem('mc_echo_recognition_active');
const previousEngine = localStorage.getItem('mc_editor_engine');
localStorage.setItem('mc_echo_recognition_active', 'true');
localStorage.setItem('mc_editor_engine', 'codemirror');
let data = echoFixture();
let sequence = 0, edits = 0, opens = 0, writes = 0, manualSaves = 0;
const originalApi = { ...api };
for (const key of Object.keys(api) as (keyof typeof api)[]) {
  if (/save|update|create|archive|delete|move|publish|vault|import|export|organization/i.test(key)) {
    (api as any)[key] = () => { writes++; throw new Error(`Unexpected mutation API: ${key}`); };
  }
}
const read = async (id: string) => {
  const metadata = data.documents.find(d => d.id === id);
  if (!metadata || id === 'missing') throw new Error('Document not found');
  return { metadata, content: data.bodies[id] || '' };
};
api.getDocument = read;
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame); };
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function dialog() { const element = target.querySelector('[role="dialog"]') as HTMLElement; assert(element, 'Missing dossier'); return element; }
function view() { const dom = target.querySelector('.cm-editor') as HTMLElement; assert(dom, 'Missing mounted CodeMirror'); const editor = EditorView.findFromDOM(dom); assert(editor, 'Missing EditorView'); return editor; }
const button = (name: string, within: ParentNode = dialog()) => {
  const ordered = [...within.querySelectorAll('.prose-container button'), ...within.querySelectorAll('button')];
  const b = ordered.find(b => b.textContent?.trim() === name || b.getAttribute('aria-label') === name);
  assert(b, `Missing button: ${name}`); return b;
};
async function click(name: string, within?: ParentNode) { button(name, within).click(); await settle(); }
function title(name: string) { assert(dialog().getAttribute('aria-label') === `Echo Lore Documentation: ${name}`, `Expected dossier ${name}, got ${dialog().getAttribute('aria-label')}`); }
async function open() { const el = target.querySelector('.cm-echo-candidate') as HTMLElement; assert(el, 'No recognized source reference'); el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); el.click(); await settle(); title('Abyssals'); }
function EditorHarness({ options = {} }: { options?: Partial<MarkdownEditorProps> }) {
  const [value, setValue] = useState(data.draft);
  return <MarkdownEditor documentId="source" value={value} onChange={v => { edits++; setValue(v); }}
    echoEnabled allDocuments={data.documents} plan={data.plan} universeId="u" houseId="house-default" houses={data.houses}
    notebookKey="disposable-one" chapterMilestoneId="milestone" onOpenEntity={() => { opens++; }}
    onManualSave={() => { manualSaves++; }} {...options} />;
}
async function fresh(options: Partial<MarkdownEditorProps> = {}) {
  data = echoFixture(); api.getDocument = read;
  root.render(<EditorHarness key={++sequence} options={options} />); await settle();
}
const passed: string[] = [], failed: string[] = [];
async function run(name: string, check: () => Promise<void>) {
  try { await fresh(); await check(); passed.push(name); }
  catch (error) { failed.push(`${name}: ${String(error)}`); }
  results.textContent = [...passed.map(name => `PASS ${name}`), ...failed.map(name => `FAIL ${name}`)].join('\n');
}
function escape() { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); }
const deferred = () => { let resolve!: (value: Awaited<ReturnType<typeof read>>) => void; const promise = new Promise<Awaited<ReturnType<typeof read>>>(r => { resolve = r; }); return { promise, resolve }; };

await run('mounted CodeMirror: three levels, stable surface, Back/Forward and breadcrumbs', async () => {
  const editor = view(), dom = editor.dom; await open(); const surface = dialog();
  await click('Vibrant Land'); title('Vibrant Land'); await click('Empyreans'); title('Empyreans');
  assert(dialog() === surface && view() === editor && view().dom === dom, 'Dossier or editor remounted');
  await click('← Back'); title('Vibrant Land'); await click('Forward →'); title('Empyreans');
  const crumb = dialog().querySelector('nav[aria-label="Echo exploration history"] button') as HTMLButtonElement;
  crumb.click(); await settle(); title('Abyssals');
});
await run('ambiguity stays in-surface; Escape cancels before closing', async () => {
  await open(); const surface = dialog(); await click('Twins');
  assert(target.querySelectorAll('[role="dialog"]').length === 1, 'Cascading dialogs');
  assert(dialog().querySelector('[aria-label="Choose lore entry"]'), 'No inline chooser');
  assert(document.activeElement?.textContent?.includes('twin-one'), 'Chooser did not receive focus');
  escape(); await settle(); assert(dialog() === surface, 'Escape closed chooser and dossier together');
  assert(!dialog().querySelector('[aria-label="Choose lore entry"]'), 'Chooser remained open');
  await click('Twins'); await click('Twins · character · twin-two'); assert(dialog().textContent?.includes('second Twins'), 'Choice ignored UUID');
});
await run('relationship actions use UUID even with duplicate titles', async () => {
  await open(); await click('Relationships (1)'); await click('Twins');
  assert(dialog().textContent?.includes('second Twins'), 'Relationship chose arbitrary same-title entity');
  assert(!dialog().textContent?.includes('MUST NOT LEAK'), 'Denied relationship description exposed');
});
await run('self references remain text and explicit cycles remain navigable', async () => {
  await open(); assert(![...dialog().querySelectorAll('.prose-container button')].some(b => b.textContent === 'Abyssals'), 'Self link created');
  await click('Vibrant Land'); await click('Abyssals'); title('Abyssals'); await click('← Back'); title('Vibrant Land');
});
await run('new navigation after Back discards Forward branch', async () => {
  await open(); await click('Vibrant Land'); await click('Empyreans'); await click('← Back'); await click('Abyssals');
  assert(button('Forward →').disabled, 'Forward branch survived new push');
});
await run('sections and independent body scroll restore on Back', async () => {
  await open(); const editorScroll = view().scrollDOM.scrollTop;
  const scroll = dialog().querySelector('.overscroll-contain') as HTMLElement; scroll.scrollTop = 220; scroll.dispatchEvent(new Event('scroll')); await settle();
  await click('Vibrant Land'); await click('← Back');
  assert(Math.abs((dialog().querySelector('.overscroll-contain') as HTMLElement).scrollTop - 220) < 1, `Preview scroll lost on Back: ${(dialog().querySelector('.overscroll-contain') as HTMLElement).scrollTop}`);
  assert(view().scrollDOM.scrollTop === editorScroll, 'Preview scrolling changed editor scroll');
  await click('Relationships (1)'); await click('Twins'); await click('← Back'); assert(button('Relationships (1)').getAttribute('aria-pressed') === 'true', 'Section lost');
});
await run('draft, multiple selections, EditorView identity and undo/redo survive exploration', async () => {
  const editor = view(); editor.dispatch({ changes: { from: editor.state.doc.length, insert: ' unsaved edit' }, selection: EditorSelection.create([EditorSelection.range(2, 5), EditorSelection.cursor(20)]) }); await settle();
  const text = editor.state.doc.toString(), selection = editor.state.selection.toJSON(), baselineEdits = edits;
  editor.scrollDOM.scrollTop = 100; const scroll = editor.scrollDOM.scrollTop;
  await open(); await click('Vibrant Land'); await click('Empyreans'); await click('Close Documentation');
  assert(view() === editor && editor.state.doc.toString() === text, 'Writer state replaced');
  assert(JSON.stringify(editor.state.selection.toJSON()) === JSON.stringify(selection), 'Selection changed');
  assert(editor.scrollDOM.scrollTop === scroll, 'Writer scroll changed'); assert(edits === baselineEdits, 'Exploration emitted prose edit');
  assert(document.activeElement === editor.contentDOM, 'Close did not return focus');
  assert(undo(editor), 'Undo history lost'); assert(!editor.state.doc.toString().endsWith(' unsaved edit'), 'Undo affected wrong content'); assert(redo(editor), 'Redo history lost');
});
await run('deliberate source cursor movement is preserved on Close', async () => {
  await open(); view().dispatch({ selection: { anchor: 25 } }); await click('Close Documentation'); assert(view().state.selection.main.head === 25, 'Stale selection restored');
});
await run('safe formatting, inert code/destinations/HTML and denied prose targets', async () => {
  await open(); assert(dialog().querySelector('strong button')?.textContent === 'Vibrant Land', 'Bold reference lost');
  assert(!dialog().querySelector('code button, img, a[href]'), 'Executable markup or code linkification');
  assert(![...dialog().querySelectorAll('button')].some(b => /Foreign Secret|Archived One/.test(b.textContent || '')), 'Forbidden target control');
});
await run('select/copy text does not activate a nested target', async () => {
  await open(); const b = button('Vibrant Land'); const range = document.createRange(); range.selectNodeContents(b);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  assert(window.getSelection()?.toString() === 'Vibrant Land', 'Text cannot be selected');
  assert(getComputedStyle(dialog()).userSelect === 'text', 'Dossier selection disabled');
  b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); await settle(); title('Abyssals'); window.getSelection()!.removeAllRanges();
});
await run('loading failure and Retry use canonical read without writes', async () => {
  let failing = true; api.getDocument = id => id === 'failing' && failing ? Promise.reject(new Error('Read failed')) : read(id);
  await open(); await click('Failing One'); assert(dialog().querySelector('[role="alert"]'), 'Read failure hidden');
  failing = false; await click('Retry'); assert(dialog().textContent?.includes('Recovered entry.'), 'Retry failed');
});
await run('missing or moved responses expose only neutral unavailable state', async () => {
  await open(); await click('Missing One'); title('Unavailable entry'); assert(!dialog().textContent?.includes('Missing One'), 'Missing target label leaked');
  await fresh(); api.getDocument = async id => { const detail = await read(id); return id === 'land' ? { ...detail, metadata: { ...detail.metadata, house_id: 'foreign-house' } } : detail; };
  await open(); await click('Vibrant Land'); title('Unavailable entry'); assert(!dialog().textContent?.includes('Vibrant Land'), 'Moved target metadata leaked');
});
await run('rapid deferred A→B→C responses cannot overwrite current destination', async () => {
  const pending = deferred(); api.getDocument = id => id === 'land' ? pending.promise : read(id);
  await open(); await click('Vibrant Land'); await click('← Back'); await click('Empyreans'); title('Empyreans');
  pending.resolve(await read('land')); await settle(); title('Empyreans'); assert(!dialog().textContent?.includes('Vibrant Land remembers'), 'Stale body published');
});
await run('close/reopen discards old in-flight response', async () => {
  const pending = deferred(); api.getDocument = id => id === 'abyssals' ? pending.promise : read(id);
  await open(); escape(); await settle(); api.getDocument = read; await open();
  pending.resolve({ metadata: data.documents[1], content: 'STALE CLOSED SESSION' }); await settle(); assert(!dialog().textContent?.includes('STALE CLOSED SESSION'), 'Closed result published');
});
await run('same-ID notebook and House context changes invalidate immediately', async () => {
  await open(); root.render(<EditorHarness key={sequence} options={{ notebookKey: 'disposable-two' }} />); await settle(); assert(!target.querySelector('[role="dialog"]'), 'Notebook switch retained dossier');
  await open(); root.render(<EditorHarness key={sequence} options={{ notebookKey: 'disposable-two', houseId: 'foreign-house' }} />); await settle(); assert(!target.querySelector('[role="dialog"]'), 'House switch retained dossier'); assert(!target.querySelector('.cm-echo-candidate'), 'Foreign context used source Universe');
});
await run('eligible catalog refresh keeps the dossier and removes stale chooser candidates', async () => {
  await open(); await click('Twins');
  data.documents = data.documents.filter(d => d.id !== 'twin-two');
  const surface = dialog();
  root.render(<EditorHarness key={sequence} />); await settle();
  assert(dialog() === surface, 'Catalog refresh dismissed the active dossier');
  const choices = dialog().querySelector('[aria-label="Choose lore entry"]');
  assert(choices?.textContent?.includes('twin-one') && !choices?.textContent?.includes('twin-two'), 'Catalog refresh retained stale candidates');
});
await run('delayed save acknowledgement does not dismiss Abyssals → Empyreans', async () => {
  await open(); await click('Empyreans'); title('Empyreans');
  const surface = dialog(), editor = view();
  // Match the host save acknowledgement: a new metadata array arrives after a debounce.
  await new Promise<void>(resolve => setTimeout(() => {
    data.documents = data.documents.map(doc => doc.id === 'source' ? { ...doc, updated_at: new Date().toISOString() } : doc);
    root.render(<EditorHarness key={sequence} />);
    resolve();
  }, 1500));
  await settle(); title('Empyreans');
  assert(dialog() === surface && view() === editor, 'Background save remounted the dossier or editor');
  await click('← Back'); title('Abyssals'); await click('Forward →'); title('Empyreans');
  await click('Close Documentation'); assert(document.activeElement === editor.contentDOM, 'Refresh invalidated return focus');
});
await run('refresh at the third visit retains history and ignores an older entity response', async () => {
  const oldRead = deferred(), refreshedRead = deferred(); let reads = 0;
  api.getDocument = id => id === 'empyreans' ? (++reads === 1 ? oldRead.promise : refreshedRead.promise) : read(id);
  await open(); await click('Vibrant Land'); await click('Empyreans'); title('Empyreans');
  const surface = dialog();
  data.documents = data.documents.map(doc => ({ ...doc }));
  data.plan = { ...data.plan, revision: data.plan.revision + 1 };
  data.houses = data.houses.map(h => ({ ...h }));
  root.render(<EditorHarness key={sequence} />); await settle(); title('Empyreans');
  refreshedRead.resolve({ ...(await read('empyreans')), content: 'LATEST refreshed Empyreans body.' });
  await settle();
  oldRead.resolve({ ...(await read('empyreans')), content: 'STALE before catalog refresh.' });
  await settle();
  assert(dialog() === surface && dialog().textContent?.includes('LATEST refreshed'), 'Refresh replaced the surface or lost its current response');
  assert(!dialog().textContent?.includes('STALE before'), 'Old catalog response overwrote the current body');
  api.getDocument = read;
  await click('← Back'); title('Vibrant Land'); await click('Forward →'); title('Empyreans');
  const crumb = dialog().querySelector('nav[aria-label="Echo exploration history"] button') as HTMLButtonElement;
  crumb.click(); await settle(); title('Abyssals');
});
await run('source ownership changes on refresh still invalidate exploration immediately', async () => {
  await open(); await click('Empyreans');
  data.documents = data.documents.map(doc => doc.id === 'source' ? { ...doc, house_id: 'foreign-house' } : doc);
  root.render(<EditorHarness key={sequence} />); await settle();
  assert(!target.querySelector('[role="dialog"]') && !target.querySelector('.cm-echo-candidate'), 'Foreign source ownership retained an authorized-looking view');
});
await run('intentional milestone, source document and Universe changes still end exploration', async () => {
  await open(); root.render(<EditorHarness key={sequence} options={{ chapterMilestoneId: null }} />); await settle();
  assert(!target.querySelector('[role="dialog"]'), 'Milestone change retained old historical context');
  await open(); root.render(<EditorHarness key={sequence} options={{ documentId: 'abyssals', chapterMilestoneId: null }} />); await settle();
  assert(!target.querySelector('[role="dialog"]'), 'Source document change retained exploration');
  await open(); root.render(<EditorHarness key={sequence} options={{ documentId: 'abyssals', universeId: 'foreign' }} />); await settle();
  assert(!target.querySelector('[role="dialog"]') && !target.querySelector('.cm-echo-candidate'), 'Universe change retained cross-scope exploration');
});
await run('Echo preference disable closes dossier without recreating EditorView', async () => {
  await open(); const editor = view(); await click('Echo On', target); assert(!target.querySelector('[role="dialog"]'), 'Disabled Echo stayed visible'); assert(view() === editor, 'Toggle remounted editor');
  localStorage.setItem('mc_echo_recognition_active', 'true');
});
await run('historical badge remains tied to original chapter at deeper levels', async () => {
  await open(); assert(dialog().textContent?.includes('Chapter moment'), 'Root historical context missing'); await click('Vibrant Land');
  assert(dialog().textContent?.includes('Chapter moment') && dialog().textContent?.includes('Ruined'), 'Nested historical context changed');
  assert(dialog().textContent?.includes('Attributes and relationships reflect chapter milestone context. Canonical prose is preserved.'), 'Historical projection/current prose distinction missing');
});
await run('fallback Inspect preserves textarea node, native selection, scroll and save shortcut', async () => {
  await fresh({ engine: 'textarea' }); const textarea = target.querySelector('textarea')!; textarea.focus(); textarea.setSelectionRange(2, 5); textarea.scrollTop = 100; const scroll = textarea.scrollTop;
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', altKey: true, bubbles: true })); await settle(); title('Abyssals'); await click('Vibrant Land'); await click('Close Documentation');
  assert(target.querySelector('textarea') === textarea && textarea.value === data.draft, 'Fallback remounted/changed');
  assert(textarea.selectionStart === 2 && textarea.selectionEnd === 5 && textarea.scrollTop === scroll, 'Native state lost'); assert(document.activeElement === textarea, 'Fallback focus lost');
  const saves = manualSaves; textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true })); await settle(); assert(manualSaves === saves + 1, 'Save shortcut regressed');
});
await run('Lorebook Studio host preserves unsaved draft and separates sidebar scope', async () => {
  root.render(<LorebookStudio key={++sequence} document={{ metadata: data.documents[0], content: data.draft }} allDocuments={data.documents}
    plan={data.plan} activeHouse={data.houses[0]} houses={data.houses} notebookKey="disposable" scope={{ kind: 'universe', universeId: 'foreign' }}
    onSave={() => { writes++; }} saveStatus="unsaved" onOpenDocument={() => { opens++; }} />); await settle();
  const editor = view(); await open(); await click('Vibrant Land'); assert(dialog().textContent?.includes('Chapter moment'), 'Studio chapter historical context missing'); await click('Close Documentation'); assert(view() === editor && editor.state.doc.toString() === data.draft, 'Studio draft/view changed');
});
await run('Book View chapter host opens real editor and preserves historical exploration', async () => {
  root.render(<BookView key={++sequence} book={data.plan.books[0]} universe={data.plan.universes[0]} plan={data.plan} documents={data.documents}
    activeHouse={data.houses[0]} houses={data.houses} notebookKey="disposable" onCreateChapter={async () => { writes++; }} onOpenDocument={() => { opens++; }} onBackToUniverse={() => { opens++; }} />); await settle();
  await click('Write Prose', target); const editor = view(); await open(); await click('Vibrant Land'); assert(dialog().textContent?.includes('Chapter moment'), 'Book historical context missing'); await click('Close Documentation'); assert(view() === editor && editor.state.doc.toString() === data.draft, 'Book editor changed');
});
await run('narrow surface remains reachable without clipping', async () => {
  await open(); const rect = dialog().getBoundingClientRect();
  assert(rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight, 'Dossier outside viewport');
  const sections = dialog().querySelector('nav[aria-label="Echo preview sections"]')!;
  assert(sections.scrollWidth <= sections.clientWidth, 'Section controls overflow');
  for (const name of ['Close Documentation', 'Return to Editor', 'Forward →']) { const bounds = button(name).getBoundingClientRect(); assert(bounds.top >= rect.top && bounds.bottom <= rect.bottom, `${name} clipped by dossier`); }
});
await run('exploration never invokes document-opening, Recent, save or mutation paths', async () => {
  const before = { opens, writes, manualSaves, edits, canonical: JSON.stringify(data) };
  await open(); await click('Vibrant Land'); await click('Empyreans'); await click('← Back'); await click('Forward →'); await click('Close Documentation');
  assert(opens === before.opens && writes === before.writes && manualSaves === before.manualSaves && edits === before.edits, 'Exploration side effect'); assert(JSON.stringify(data) === before.canonical, 'Canonical fixture mutated');
});
await run('CodeMirror keyboard Inspect and Escape retain the source selection', async () => {
  const editor = view(); editor.dispatch({ selection: { anchor: 3 } }); editor.focus();
  editor.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', altKey: true, bubbles: true, cancelable: true })); await settle(); title('Abyssals');
  assert(document.activeElement?.tagName === 'H3', 'Keyboard opening did not focus heading');
  escape(); await settle(); assert(!target.querySelector('[role="dialog"]') && editor.state.selection.main.head === 3, 'Keyboard close lost selection');
});
await run('explicit Web of Thought inspection keeps original historical context and target UUID', async () => {
  let inspected: unknown[] = [];
  await fresh({ onNavigateWebOfThought: (...args) => { inspected = args; } }); await open(); await click('Vibrant Land'); await click('Inspect in Web of Thought');
  assert(JSON.stringify(inspected) === JSON.stringify(['u', null, 'milestone', 'land']), 'Historical inspection context changed'); assert(!target.querySelector('[role="dialog"]'), 'Inspection did not close');
});
await run('engine changes invalidate exploration without silently switching engines', async () => {
  await open(); root.render(<EditorHarness key={sequence} options={{ engine: 'textarea' }} />); await settle();
  assert(!target.querySelector('[role="dialog"]') && target.querySelector('textarea') && !target.querySelector('.cm-editor'), 'Engine change retained old exploration');
});
await run('overlay remains inside the Vault/recovery blocking boundary', async () => {
  await open(); assert(dialog().closest('[data-echo-boundary]') === target, 'Portal escaped application boundary');
  const outside = document.querySelector('h1')!; outside.tabIndex = -1; outside.focus();
  assert(document.activeElement === outside, 'External test focus unavailable'); target.setAttribute('inert', '');
  try { button('Close Documentation').focus(); assert(document.activeElement === outside, 'Inert overlay still accepts focus'); }
  finally { target.removeAttribute('inert'); }
});
await run('explicit Open Entry retains separate guarded host callback', async () => {
  const before = opens; await open(); await click('Vibrant Land'); await click('Open in Lorebook'); assert(opens === before + 1, 'Explicit open callback lost'); assert(!target.querySelector('[role="dialog"]'), 'Explicit open did not close');
});

results.textContent += `\n\n${passed.length} passed, ${failed.length} failed. Viewport ${innerWidth}×${innerHeight}.\nClipboard system integration and packaged Windows acceptance are separate manual checks.`;
document.title = `${failed.length ? 'FAIL' : 'PASS'}: Echo nested acceptance (${passed.length}/${passed.length + failed.length})`;
// Leave an interactive production editor available after the automated scenarios.
await fresh();
if (previousPreference === null) localStorage.removeItem('mc_echo_recognition_active'); else localStorage.setItem('mc_echo_recognition_active', previousPreference);
if (previousEngine === null) localStorage.removeItem('mc_editor_engine'); else localStorage.setItem('mc_editor_engine', previousEngine);
// Read remains fixture-only for the interactive demo; mutation stubs remain protective.
void originalApi;
