import React, { useState, useEffect, useRef } from 'react';
import { DocumentDetail, PhilosophyClassification, PhilosophyParagraph, PhilosophyMetadata, SaveStatus } from '@/types';
import { Plus, Trash2, ArrowUp, ArrowDown, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { CLASSIFICATIONS, compositionMode, parsePhilosophy, philosophyEdit, readPhilosophyMetadata, switchPhilosophyMode } from '@/utils/philosophy';

interface PhilosophyStudioProps {
  document: DocumentDetail;
  onSave: (content: string, metadataJson?: string) => Promise<void> | void;
  saveStatus: SaveStatus;
}

// Grow with wrapped lines as well as explicit line breaks, keeping one scrolling canvas.
const WritingArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = props => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resize = () => { element.style.height = '0px'; element.style.height = `${element.scrollHeight}px`; };
    resize();
    let width = element.getBoundingClientRect().width;
    const onResize = new ResizeObserver(entries => {
      if (entries[0].contentRect.width !== width) { width = entries[0].contentRect.width; resize(); }
    });
    onResize.observe(element);
    return () => onResize.disconnect();
  }, [props.value]);
  return <textarea {...props} ref={ref} />;
};

export const PhilosophyStudio: React.FC<PhilosophyStudioProps> = ({ document, onSave }) => {
  const initialMetadata = readPhilosophyMetadata(document.metadata.metadata_json);
  const [metadata, setMetadata] = useState<PhilosophyMetadata>(initialMetadata);
  const [paragraphs, setParagraphs] = useState(() => parsePhilosophy(document.content, initialMetadata));
  // Keep canonical bytes for metadata-only actions; switching never serializes the body.
  const [content, setContent] = useState(document.content);
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    const next = readPhilosophyMetadata(document.metadata.metadata_json);
    setMetadata(next);
    setParagraphs(parsePhilosophy(document.content, next));
    setContent(document.content);
    setActiveIdx(0);
  }, [document.metadata.id]);

  const mode = compositionMode(metadata);
  const structured = mode === 'structured';
  const updateMetadata = (next: PhilosophyMetadata) => {
    setMetadata(next);
    onSave(content, JSON.stringify(next));
  };
  const editBlocks = (next: PhilosophyParagraph[]) => {
    const edit = philosophyEdit(next, metadata);
    setParagraphs(next);
    setContent(edit.content);
    setMetadata(edit.metadata);
    onSave(edit.content, JSON.stringify(edit.metadata));
  };
  const addBlock = (classification: PhilosophyClassification = 'prose', after = paragraphs.length - 1) => {
    const next = [...paragraphs];
    next.splice(after + 1, 0, { id: crypto.randomUUID(), text: '', classification });
    editBlocks(next);
    setActiveIdx(after + 1);
  };
  const moveBlock = (index: number, direction: number) => {
    const next = [...paragraphs];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    editBlocks(next);
    setActiveIdx(target);
  };
  const wordCount = paragraphs.reduce((count, p) => count + (p.text.trim() ? p.text.trim().split(/\s+/).length : 0), 0);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-border/60 bg-muted/10 shrink-0">
        <div role="group" aria-label="Composition mode" className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
          {(['freeform', 'structured'] as const).map(value => (
            <button key={value} aria-pressed={mode === value}
              onClick={() => updateMetadata(switchPhilosophyMode(metadata, value))}
              className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-primary',
                mode === value ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}>
              {value === 'freeform' ? 'Freeform Writing' : 'Structured Reasoning'}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{wordCount} Words{structured ? ` · ${paragraphs.length} Blocks` : ''}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-8 sm:py-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="pb-4 border-b border-border/40">
            <p className="text-xs font-serif uppercase tracking-widest text-primary mb-2">{structured ? 'Structured Reasoning' : 'Philosophical Notebook'}</p>
            <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground break-words">{document.metadata.title}</h1>
            {(metadata.work_title || metadata.chapter) && <p className="text-sm text-muted-foreground mt-2">{metadata.work_title}{metadata.chapter ? ` · § ${metadata.chapter}` : ''}</p>}
            {metadata.epigraph && <p className="font-serif italic text-muted-foreground mt-3 whitespace-pre-wrap">{metadata.epigraph}</p>}
          </div>
          {!metadata.thinking_desk_intro_dismissed && metadata.composition_mode === 'freeform' && (
            <aside className="flex items-start gap-3 text-sm text-muted-foreground bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="flex-1">Think freely first. Explore questions and unfinished thoughts here. Choose Structured Reasoning whenever you want to give your ideas a role.</p>
              <button aria-label="Dismiss introduction" title="Dismiss introduction" onClick={() => updateMetadata({ ...metadata, thinking_desk_intro_dismissed: true })} className="p-1 rounded hover:text-foreground focus-visible:outline focus-visible:outline-primary"><X className="w-4 h-4" /></button>
            </aside>
          )}
          {!structured && paragraphs.length > 1 && <p className="text-xs text-muted-foreground">Your existing blocks stay separate so their roles and order are preserved. Write naturally within each block.</p>}
          {structured && <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-primary w-fit">About reasoning roles</summary>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              {Object.entries(CLASSIFICATIONS).map(([key, value]) => <div key={key}><dt className="font-semibold text-foreground">{value.label}</dt><dd>{value.description}</dd></div>)}
            </dl>
          </details>}
          <div className={structured ? 'space-y-4' : 'space-y-2'}>
            {paragraphs.map((p, index) => (
              <div key={p.id} onFocus={() => setActiveIdx(index)} className={cn('group', structured && 'rounded-xl border p-4 sm:p-5 bg-card/40', structured && activeIdx === index && 'border-primary/40')}>
                {structured && <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <select aria-label={`Role for block ${index + 1}`} value={p.classification} title={CLASSIFICATIONS[p.classification].description}
                    onChange={event => editBlocks(paragraphs.map((block, i) => i === index ? { ...block, classification: event.target.value as PhilosophyClassification } : block))}
                    className="max-w-full bg-background text-foreground border border-border rounded-md px-2 py-1 text-xs focus:outline-primary">
                    {Object.entries(CLASSIFICATIONS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                  </select>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <button aria-label={`Move block ${index + 1} up`} title="Move up" disabled={index === 0} onClick={() => moveBlock(index, -1)} className="p-1.5 rounded hover:text-primary disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                    <button aria-label={`Move block ${index + 1} down`} title="Move down" disabled={index === paragraphs.length - 1} onClick={() => moveBlock(index, 1)} className="p-1.5 rounded hover:text-primary disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                    <button aria-label={`Insert block after ${index + 1}`} title="Insert block below" onClick={() => addBlock('prose', index)} className="p-1.5 rounded hover:text-primary"><Plus className="w-4 h-4" /></button>
                    <button aria-label={`Delete block ${index + 1}`} title="Delete block" onClick={() => { editBlocks(paragraphs.length === 1 ? [{ ...p, text: '', classification: 'prose' }] : paragraphs.filter((_, i) => i !== index)); setActiveIdx(Math.max(0, index - 1)); }} className="p-1.5 rounded hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <p className="w-full text-xs text-muted-foreground">{CLASSIFICATIONS[p.classification].description}</p>
                </div>}
                <WritingArea aria-label={structured ? `Text for block ${index + 1}` : paragraphs.length === 1 ? 'Freeform writing' : `Writing block ${index + 1}`}
                  value={p.text} onChange={event => editBlocks(paragraphs.map((block, i) => i === index ? { ...block, text: event.target.value } : block))}
                  placeholder={structured ? 'Develop this thought…' : 'What is on your mind? Follow a question, explore an idea, leave room for uncertainty…'}
                  rows={structured || paragraphs.length > 1 ? 3 : 14}
                  className={cn('block w-full bg-transparent resize-none overflow-hidden focus:outline-none text-[17px] leading-loose text-foreground placeholder:text-muted-foreground/60 font-serif', structured ? 'min-h-24' : paragraphs.length === 1 ? 'min-h-[45vh] py-2' : 'min-h-24 py-2')} />
              </div>
            ))}
          </div>
          {structured && <div className="flex flex-wrap gap-2 pt-4 border-t border-border/40" aria-label="Add reasoning block">
            {Object.entries(CLASSIFICATIONS).map(([key, value]) => <button key={key} title={value.description} onClick={() => addBlock(key as PhilosophyClassification)} className="px-3 py-2 text-xs rounded-lg border border-border text-foreground bg-card hover:border-primary/50 focus-visible:outline-primary">+ {value.label}</button>)}
          </div>}
        </div>
      </div>
    </div>
  );
};
