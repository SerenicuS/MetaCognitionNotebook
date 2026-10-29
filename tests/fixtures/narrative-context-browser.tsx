import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { UniverseOverview } from '../../src/components/studios/lorebook/UniverseOverview';
import { MilestoneNarrative } from '../../src/components/studios/lorebook/MilestoneNarrative';
import { emptyPlan, newNode, insertNode, type Plan } from '../../src/utils/thought';
import type { DocumentMetadata } from '../../src/types';
import { api } from '../../src/services/api';
import '../../src/index.css';
let initial = emptyPlan(); initial.universes = [{ id: 'u', name: 'Fixture Universe' }]; initial.books = [{ id: 'book', universe_id: 'u', name: 'Fixture Volume', continuity: 'canonical' }]; initial = insertNode(initial, { ...newNode(initial, 'u', null), id: 'milestone', title: 'Succession' });
let savedPlan: Plan = initial;
let savedDocuments: DocumentMetadata[] = [{ id: 'chapter', title: 'Chapter 17', doc_type: 'lorebook', house_id: 'house-default', relative_path: '', created_at: '', updated_at: '', tags: [], metadata_json: JSON.stringify({ entry_type: 'chapter', universe_id: 'u', book_id: 'book' }) }];
let metadataOnly = false; const opened: string[] = [];
api.getDocument = async id => ({ metadata: savedDocuments.find(d => d.id === id)!, content: 'PRIVATE MANUSCRIPT BODY' });
function App() {
  const [plan, setPlan] = useState(initial); const [documents, setDocuments] = useState(savedDocuments);
  const save = async (_expected: () => number, edit: Plan | ((p: Plan) => Plan), acknowledge: (r: { document_id: string; plan: Plan }) => void) => { const next = typeof edit === 'function' ? edit(savedPlan) : edit; savedPlan = { ...next, revision: next.revision + 1 }; setPlan(savedPlan); acknowledge({ document_id: 'catalog', plan: savedPlan }); return true; };
  return <><UniverseOverview universe={plan.universes[0]} revision={plan.revision} save={save}/><MilestoneNarrative milestone={plan.nodes[0]} plan={plan} documents={documents} save={save} saveDocument={async (id, content, title, tags, metadata, options) => { metadataOnly = content === undefined && title === undefined && tags === undefined && Boolean(options?.isMetadataOnly); savedDocuments = savedDocuments.map(d => d.id === id ? { ...d, metadata_json: metadata } : d); setDocuments(savedDocuments); }} onOpenDocument={id => opened.push(id)} onOpenBook={id => opened.push(id)}/></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
const pause = () => new Promise(resolve => setTimeout(resolve, 80));
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const button = (text: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent === text)!;
const click = (el: Element) => { check(el, 'Missing click target'); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
const input = (label: string, value: string) => { const el = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.includes(label))?.querySelector('input,textarea') as HTMLInputElement | HTMLTextAreaElement; check(el, `Missing ${label}`); const prototype = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); };
async function run() {
  await pause(); check(document.body.textContent?.includes('Every universe has a story.'), 'Overview empty state');
  click(button('Edit Overview')); await pause(); input('Universe title', 'Updated Universe'); input('Short summary', 'A short premise.'); input('Extended overview', 'An extended world introduction.'); await pause(); click(button('Save Overview')); await pause();
  check(savedPlan.universes[0].description === 'A short premise.\n\nAn extended world introduction.', 'Overview canonical save');
  check(document.body.textContent?.includes('An extended world introduction.'), 'Overview view after save');
  click(button('Edit Chronicle')); await pause(); input('Event summary', 'The empire entered a crisis.'); const account = document.querySelector('textarea[aria-label="Historical account"]')!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(account, 'Consequences: A disputed succession.'); account.dispatchEvent(new Event('input', { bubbles: true })); await pause(); click(button('Save Chronicle')); await pause();
  check(savedPlan.nodes[0].description.includes('Consequences: A disputed succession.'), 'Milestone account saved'); check(savedPlan.nodes[0].changes.length === 0, 'No invented state changes');
  click(Array.from(document.querySelectorAll('summary')).find(s => s.textContent?.includes('Link an existing'))!); await pause();
  const book = document.querySelector('select[aria-label="Related Book"]') as HTMLSelectElement; book.value = 'book'; book.dispatchEvent(new Event('change', { bubbles: true })); await pause();
  const chapter = document.querySelector('select[aria-label="Related Chapter"]') as HTMLSelectElement; chapter.value = 'chapter'; chapter.dispatchEvent(new Event('change', { bubbles: true })); await pause(); click(button('Link Chapter')); await pause();
  check(metadataOnly, 'Chapter link must be metadata-only'); check(JSON.parse(savedDocuments[0].metadata_json!).milestone_id === 'milestone', 'Chapter-owned milestone binding'); check(!document.body.textContent?.includes('PRIVATE MANUSCRIPT BODY'), 'No manuscript prose copied');
  click(button('Read the event in Chapter 17')); click(button('Fixture Volume')); check(opened.join(',') === 'chapter,book', 'Stable chapter and Book navigation');
  click(button('Unlink chapter')); await pause(); check(!JSON.parse(savedDocuments[0].metadata_json!).milestone_id, 'Binding removed without affecting narrative');
  document.getElementById('result')!.textContent = 'PASS: empty overview; edit/save overview and chronicle; summary/extended account; stable Book/Chapter navigation; metadata-only chapter linking/unlinking; no manuscript copying or invented state changes.';
}
void run().catch(error => { document.getElementById('result')!.textContent = `FAIL: ${error.message}`; });
