import React, { useEffect, useRef, useState } from 'react';
import type { DocumentMetadata, HouseRecord } from '@/types';
import type { Plan, StoryNode } from '@/utils/thought';
import { chapterMilestoneMetadata, compatibleChapter, milestoneBookOptions, joinNarrative, milestoneChapterReferences, splitNarrative, updateMilestoneNarrative } from '@/utils/narrativeContext';
import { parseLoreMetadata } from '@/utils/universe';
import { requireSaved } from '@/utils/relationships';
import { api } from '@/services/api';
import type { SaveNarrativeThought } from './UniverseOverview';
export type SaveNarrativeDocument = (id: string, content?: string, title?: string, tags?: string[], metadataJson?: string, options?: { isMetadataOnly?: boolean }) => Promise<void>;

export const MilestoneNarrative: React.FC<{ milestone: StoryNode; plan: Plan; documents: DocumentMetadata[]; houseId?: string; houses?: HouseRecord[]; save?: SaveNarrativeThought; saveDocument?: SaveNarrativeDocument; onOpenDocument: (id: string) => void; onOpenBook?: (id: string) => void }> = ({ milestone, plan, documents, houseId = 'house-default', houses = [], save, saveDocument, onOpenDocument, onOpenBook }) => {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [bookId, setBookId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [overrides, setOverrides] = useState<Record<string, DocumentMetadata>>({});
  const currentContext = useRef({ plan, milestone, houseId });
  currentContext.current = { plan, milestone, houseId };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => setOverrides({}), [documents]);
  const docs = documents.map(d => overrides[d.id] || d);
  const narrative = splitNarrative(milestone.description);
  const references = milestoneChapterReferences(plan, docs, milestone, houseId);
  const candidates = docs.filter(d => compatibleChapter(plan, d, milestone, houseId));
  const books = milestoneBookOptions(plan, milestone, houseId, houses);
  const selectedBook = books.find(b => b.id === bookId);
  const chapters = selectedBook ? candidates.filter(d => parseLoreMetadata(d).book_id === selectedBook.id) : [];
  useEffect(() => {
    if (bookId && !selectedBook) { setBookId(''); setChapterId(''); }
    else if (chapterId && !chapters.some(d => d.id === chapterId)) setChapterId('');
  }, [plan, documents, houseId, bookId, chapterId, selectedBook, chapters.map(d => d.id).join(',')]);
  const selectedChapter = docs.find(d => d.id === chapterId);
  const bind = async (id: string, attach: boolean) => {
    if (!saveDocument || busy) return;
    setBusy(true); setFeedback('');
    try {
      if (attach && !chapters.some(d => d.id === id)) throw new Error('Chapter selection is stale. Choose a compatible chapter again.');
      const latest = (await api.getDocument(id)).metadata;
      if (!mounted.current) return;
      const current = currentContext.current;
      const metadata = chapterMilestoneMetadata(current.plan, latest, current.milestone, attach, current.houseId);
      await saveDocument(id, undefined, undefined, undefined, metadata, { isMetadataOnly: true });
      setOverrides(current => ({ ...current, [id]: { ...latest, metadata_json: metadata } }));
      setFeedback(attach ? 'Chapter reference saved.' : 'Chapter reference removed.');
    } catch (err) { setFeedback(String(err)); } finally { setBusy(false); }
  };
  return <section aria-label="Milestone narrative context" className="p-4 rounded-xl border border-border bg-card/50 space-y-3 text-sm select-text">
    <div className="flex justify-between gap-2 items-center"><h3 className="font-serif font-semibold">{milestone.title} — Chronicle</h3>{save && !editing && <button type="button" className="help-button" onClick={() => { setTitle(milestone.title); setSummary(narrative.summary); setAccount(narrative.account); setFeedback(''); setEditing(true); }}>Edit Chronicle</button>}</div>
    {editing ? <form className="space-y-3" onSubmit={async e => { e.preventDefault(); if (!save || busy) return; setBusy(true); setFeedback(''); try { requireSaved(await save(() => plan.revision, current => updateMilestoneNarrative(current, milestone.universe_id, milestone.id, title, joinNarrative(summary, account)), () => {})); setEditing(false); } catch (err) { setFeedback(String(err)); } finally { setBusy(false); } }}>
      <label className="block">Milestone title<input required disabled={busy} className="help-input w-full block" value={title} onChange={e => setTitle(e.target.value)}/></label>
      <label className="block">Event summary (optional)<textarea disabled={busy} className="help-input w-full block" rows={3} value={summary} onChange={e => setSummary(e.target.value)}/></label>
      <details open={Boolean(account)}><summary className="cursor-pointer">Historical account, circumstances &amp; aftermath (optional)</summary><textarea aria-label="Historical account" disabled={busy} className="help-input w-full block mt-2" rows={6} value={account} onChange={e => setAccount(e.target.value)}/><p className="text-xs text-muted-foreground">Describe only what you have authored. Paragraphs or headings can explain circumstances and consequences.</p></details>
      <div className="flex gap-2"><button className="help-button" disabled={busy}>Save Chronicle</button><button type="button" className="help-button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button></div>
    </form> : milestone.description?.trim() ? <><p className="whitespace-pre-wrap">{narrative.summary}</p>{narrative.account && <details open><summary>Historical account &amp; aftermath</summary><p className="whitespace-pre-wrap mt-2 text-muted-foreground">{narrative.account}</p></details>}</> : <p className="text-muted-foreground">No narrative account has been written for this milestone.</p>}
    <div className="space-y-2"><h4 className="font-medium">Read the event</h4>{references.length ? references.map(({ chapter, book }) => <div key={chapter.id} className="flex flex-wrap items-center gap-2 text-xs"><button type="button" className="help-button" onClick={() => onOpenDocument(chapter.id)}>Read the event in {chapter.title}</button>{onOpenBook ? <button type="button" className="help-button" onClick={() => onOpenBook(book.id)}>{book.name}</button> : <span>{book.name}</span>}{saveDocument && <button type="button" className="help-button" disabled={busy} onClick={() => void bind(chapter.id, false)}>Unlink chapter</button>}</div>) : <p className="text-xs text-muted-foreground">No related chapters linked. A written account can stand on its own.</p>}</div>
    {saveDocument && <details><summary className="cursor-pointer">Link an existing Book / Chapter</summary><div className="flex flex-wrap gap-2 mt-2"><select aria-label="Related Book" className="help-input" value={selectedBook?.id || ''} onChange={e => { setBookId(e.target.value); setChapterId(''); }}><option value="">Choose Book…</option>{books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><select aria-label="Related Chapter" className="help-input" value={chapterId} onChange={e => setChapterId(e.target.value)}><option value="">Choose Chapter…</option>{chapters.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select><button type="button" className="help-button" disabled={busy || !chapters.some(d => d.id === chapterId)} onClick={() => void bind(chapterId, true)}>Link Chapter</button></div>{selectedBook && onOpenBook && <button type="button" className="help-button mt-2" onClick={() => onOpenBook(selectedBook.id)}>Open {selectedBook.name}</button>}{selectedBook && !chapters.length && <p className="text-xs mt-2">No compatible chapters in this Book yet. Open the Book to write one, then link it here.</p>}{selectedChapter && parseLoreMetadata(selectedChapter).milestone_id && parseLoreMetadata(selectedChapter).milestone_id !== milestone.id && <p className="text-xs mt-2">This chapter is linked to another milestone. Linking here will replace that historical binding.</p>}<p className="text-xs text-muted-foreground mt-2">Eligible Books appear even before chapters are written. Select a Chapter to save its milestone reference. Book references come from linked chapters; no Book is duplicated.</p></details>}
    {feedback && <p role="status" className="text-xs">{feedback}</p>}
    <p className="text-xs text-muted-foreground">The state records below describe changes at this milestone; they do not establish a cause.</p>
  </section>;
};
