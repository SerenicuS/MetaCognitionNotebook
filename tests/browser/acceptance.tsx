/** Run with Vite at /tests/browser/acceptance.html. Uses disposable in-memory records only. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { UniverseStateExplorer } from '../../src/components/studios/lorebook/UniverseStateExplorer';
import { MilestoneNarrative } from '../../src/components/studios/lorebook/MilestoneNarrative';
import { EntityRelationshipsCard } from '../../src/components/studios/lorebook/EntityRelationshipsCard';
import { EchoDocumentationPopup } from '../../src/components/echo/EchoDocumentationPopup';
import { emptyPlan, insertNode, newNode, createBranch, type Plan } from '../../src/utils/thought';
import { convertDocumentToEchoEntity } from '../../src/utils/echoLore';
import { api } from '../../src/services/api';
import type { DocumentMetadata } from '../../src/types';

const fixture = document.getElementById('fixture')!;
const root = createRoot(fixture);
const output = document.getElementById('results')!;
const results: string[] = [];
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); };
const mount = async (element: React.ReactNode) => { root.render(element); await settle(); };
const click = async (text: string) => {
  const button = [...fixture.querySelectorAll('button')].find(b => b.textContent?.trim() === text);
  assert(button, `Missing button: ${text}`); button.click(); await settle();
};
const choose = async (label: string, value: string) => {
  const select = fixture.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
  assert(select, `Missing select: ${label}`);
  select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); await settle();
};
function doc(id: string, entry_type = 'character', extra = {}): DocumentMetadata {
  return { id, title: id, doc_type: 'lorebook', house_id: 'house-default', relative_path: `${id}.md`, tags: [], created_at: '', updated_at: '', metadata_json: JSON.stringify({ universe_id: 'u', entry_type, ...extra }) };
}
let plan = emptyPlan(); plan.universes = [{ id: 'u', name: 'Universe' }];
plan = insertNode(plan, { ...newNode(plan, 'u', null), id: 'first', title: 'First', changes: [{ id: 's', entity_id: 'c', property_key: 'status', previous_value: null, new_value: 'missing', note: '' }] });
plan = insertNode(plan, { ...newNode(plan, 'u', null), id: 'later', title: 'Later' });
const branched = createBranch(plan, 'u', 'Alternate', 'later'); plan = branched.plan;
plan = insertNode(plan, { ...newNode(plan, 'u', null, undefined, branched.branch.id), id: 'alternate', title: 'Alternate ending' });
plan.books = [{ id: 'empty', name: 'Empty Book', universe_id: 'u', continuity: 'canonical' }];
const documents = [doc('c'), doc('d')];
const baseline = JSON.stringify(plan);
api.getDocument = async id => ({ metadata: documents.find(d => d.id === id) || doc(id), content: '### Overview\n\nProvide the canonical context for this character in Universe.\n\n### Historical Lore\n\nAn authored historical account.' });
const saveDocument = async () => {};

async function run(name: string, check: () => Promise<void>) {
  try { await check(); results.push(`PASS ${name}`); }
  catch (error) { results.push(`FAIL ${name}: ${String(error)}`); }
  output.textContent = results.join('\n'); output.style.whiteSpace = 'pre-wrap';
}

await run('Chronicle: resolver → source button → continuity selection → rendered focus, inherited and repeated', async () => {
  await mount(<UniverseStateExplorer universeId="u" universe={plan.universes[0]} plan={plan} documents={documents} initialMilestoneId="later" onOpenDocument={() => {}} onCreateEntity={() => {}}/>);
  await click('Open source Chronicle');
  assert(document.activeElement?.getAttribute('aria-label') === 'First Chronicle', 'Source panel did not receive focus');
  assert(fixture.textContent?.includes('Recorded at this milestone') && !fixture.textContent?.includes('Explicit Override'), 'Technical provenance label remains');
  const rect = document.activeElement!.getBoundingClientRect();
  assert(rect.top >= 0 && rect.top < innerHeight, 'Chronicle was not scrolled into view');
  await click('Open source Chronicle');
  assert(document.activeElement?.getAttribute('aria-label') === 'First Chronicle', 'Repeated navigation did not refocus');
  assert(JSON.stringify(plan) === baseline, 'Navigation changed canonical data');
});
await run('Chronicle: inherited alternate continuity navigates to the actual canonical source', async () => {
  await mount(<UniverseStateExplorer key="alternate" universeId="u" universe={plan.universes[0]} plan={plan} documents={documents} initialContinuityId={branched.branch.id} initialMilestoneId="alternate" onOpenDocument={() => {}} onCreateEntity={() => {}}/>);
  await click('Open source Chronicle');
  assert(document.activeElement?.getAttribute('aria-label') === 'First Chronicle', 'Alternate ancestry source navigation failed');
  assert(JSON.stringify(plan) === baseline, 'Alternate navigation changed canonical data');
});
await run('Book selector: empty Books, creation refresh, stale selection clearing and no duplication', async () => {
  let savedMetadata = '';
  const Harness = () => {
    const [current, setCurrent] = useState(plan);
    const [currentDocs, setCurrentDocs] = useState(documents);
    return <><button onClick={() => setCurrent(p => ({ ...p, books: [...p.books, { id: 'new', name: 'New Book', universe_id: 'u', continuity: 'canonical' }] }))}>Create test Book</button><button onClick={() => { const chapter = doc('chapter', 'chapter', { book_id: 'new' }); documents.push(chapter); setCurrentDocs([...documents]); }}>Write test chapter</button><button onClick={() => setCurrent(p => ({ ...p, books: p.books.map(b => b.id === 'new' ? { ...b, archived: true } : b) }))}>Archive test Book</button><MilestoneNarrative milestone={current.nodes[0]} plan={current} documents={currentDocs} saveDocument={async (_id, _content, _title, _tags, metadata) => { savedMetadata = metadata!; }} onOpenDocument={() => {}}/></>;
  };
  await mount(<Harness/>);
  await choose('Related Book', 'empty');
  assert(fixture.textContent?.includes('No compatible chapters in this Book yet'), 'Empty Book cannot be selected');
  await click('Create test Book'); await choose('Related Book', 'new');
  assert((fixture.querySelector('select[aria-label="Related Book"]') as HTMLSelectElement).value === 'new', 'Created Book missing without restart');
  await click('Write test chapter'); await choose('Related Chapter', 'chapter'); await click('Link Chapter');
  assert(JSON.parse(savedMetadata).book_id === 'new' && JSON.parse(savedMetadata).milestone_id === 'first', 'Existing Book/Chapter reference not saved by UUID');
  assert(fixture.textContent?.includes('Read the event in chapter'), 'Saved chapter reference is not displayed');
  const readDocument = api.getDocument;
  let finishRead: (() => Promise<void>) | undefined;
  api.getDocument = id => new Promise(resolve => { finishRead = async () => resolve(await readDocument(id)); });
  savedMetadata = '';
  await click('Link Chapter');
  await click('Archive test Book');
  await finishRead!(); await settle(); api.getDocument = readDocument;
  assert(!savedMetadata && fixture.textContent?.includes('incompatible'), 'A Book archived during refresh still saved a stale chapter binding');
  assert((fixture.querySelector('select[aria-label="Related Book"]') as HTMLSelectElement).value === '', 'Stale Book selection retained');
  assert(JSON.stringify(plan) === baseline, 'Selection duplicated a Book');
});
await run('Relationship explanation editor saves multiline text on its original record and reloads', async () => {
  let saved: Plan = { ...plan, relationships: [{ id: 'r', universe_id: 'u', book_id: null, source_id: 'c', target_id: 'd', label: 'Friends', description: '', directed: false, context_node_id: null, archived: false }] };
  const Harness = () => {
    const [current, setCurrent] = useState(saved);
    return <EntityRelationshipsCard documentId="c" plan={current} availableEntities={documents} universeId="u" onNavigateToEntity={() => {}} onSaveThought={async (_revision, edit, acknowledge) => {
      saved = JSON.parse(JSON.stringify(typeof edit === 'function' ? edit(saved) : edit)); setCurrent(saved); acknowledge({ plan: saved, document_id: null }); return true;
    }}/>;
  };
  await mount(<Harness/>); await click('Why? Add explanation');
  const textarea = fixture.querySelector('textarea')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  setter.call(textarea, 'They grew up together.\nA shared promise.'); textarea.dispatchEvent(new Event('input', { bubbles: true })); await settle();
  await click('Save explanation');
  assert(saved.relationships[0].description === 'They grew up together.\nA shared promise.', 'Multiline explanation was not saved');
  await mount(<div/>); await mount(<Harness/>);
  assert(fixture.textContent?.includes('A shared promise.'), 'Explanation missing on reload');
  assert(saved.relationships.length === 1 && saved.relationships[0].id === 'r', 'Relationship duplicated');
});
await run('Echo: exact placeholders suppressed, authored history and accessible section controls remain', async () => {
  const echo = convertDocumentToEchoEntity(doc('c'), documents, plan);
  echo.heldOffices = [{ factionId: 'f', factionTitle: 'Council', positionTitle: 'Archivist' }];
  await mount(<EchoDocumentationPopup entity={echo} position={{ top: 40, left: 30 }} onClose={() => {}}/>);
  assert(!fixture.textContent?.includes('Provide the canonical'), 'Factory prose leaked into preview');
  assert(fixture.textContent?.includes('An authored historical account.'), 'Authored prose lost');
  await click('Attributes (0)');
  assert(fixture.querySelector('button[aria-pressed="true"]')?.textContent === 'Attributes (0)', 'Active tab not exposed');
  const nav = fixture.querySelector('nav[aria-label="Echo preview sections"]')!;
  assert(nav.scrollWidth <= nav.clientWidth, 'Tabs overflow their card');
  await click('Offices');
  assert(fixture.textContent?.includes('Archivist'), 'Office tab lost its content');
});
document.title = results.some(r => r.startsWith('FAIL')) ? 'FAIL: acceptance UI regressions' : 'PASS: acceptance UI regressions';
output.setAttribute('role', 'status');
