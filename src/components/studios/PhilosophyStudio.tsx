import React, { useState, useEffect, useRef } from 'react';
import {
  ArgumentSourceRef,
  ArgumentWeb,
  DocumentDetail,
  PhilosophyClassification,
  PhilosophyParagraph,
  PhilosophyMetadata,
  SaveStatus,
} from '@/types';
import { Plus, Trash2, ArrowUp, ArrowDown, X, Network, BookOpen, ExternalLink } from 'lucide-react';
import { cn } from '@/utils/cn';
import {
  CLASSIFICATIONS,
  compositionMode,
  parsePhilosophy,
  philosophyEdit,
  readPhilosophyMetadata,
  switchPhilosophyMode,
} from '@/utils/philosophy';
import { ArgumentWebEditor } from './philosophy/ArgumentWebEditor';
import {
  getOrCreateArgumentWeb,
  addArgumentNode,
  setMainThesis,
} from '@/utils/argumentWeb';

interface PhilosophyStudioProps {
  document: DocumentDetail;
  onSave: (content: string, metadataJson?: string) => Promise<void> | void;
  saveStatus: SaveStatus;
}

// Grow with wrapped lines as well as explicit line breaks, keeping one scrolling canvas.
const WritingArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resize = () => {
      element.style.height = '0px';
      element.style.height = `${element.scrollHeight}px`;
    };
    resize();
    let width = element.getBoundingClientRect().width;
    const onResize = new ResizeObserver((entries) => {
      if (entries[0].contentRect.width !== width) {
        width = entries[0].contentRect.width;
        resize();
      }
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

  // Active view: 'writing' or 'web'
  const [view, setView] = useState<'writing' | 'web'>('writing');

  // Retain text selection across focus changes
  const [selection, setSelection] = useState<{
    text: string;
    blockIndex: number;
    startOffset: number;
    endOffset: number;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Refs for persistence safety across async autosaves and view switching
  const contentRef = useRef(content);
  contentRef.current = content;
  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;

  useEffect(() => {
    const next = readPhilosophyMetadata(document.metadata.metadata_json);
    setMetadata(next);
    metadataRef.current = next;
    setParagraphs(parsePhilosophy(document.content, next));
    setContent(document.content);
    contentRef.current = document.content;
    setActiveIdx(0);
  }, [document.metadata.id]);

  const mode = compositionMode(metadata);
  const structured = mode === 'structured';

  const updateMetadata = (next: PhilosophyMetadata) => {
    setMetadata(next);
    metadataRef.current = next;
    onSave(contentRef.current, JSON.stringify(next));
  };

  const handleUpdateWeb = (nextWeb: ArgumentWeb) => {
    const nextMeta: PhilosophyMetadata = {
      ...metadataRef.current,
      argument_web: nextWeb,
    };
    setMetadata(nextMeta);
    metadataRef.current = nextMeta;
    onSave(contentRef.current, JSON.stringify(nextMeta));
  };

  const editBlocks = (next: PhilosophyParagraph[]) => {
    const edit = philosophyEdit(next, metadataRef.current);
    setParagraphs(next);
    setContent(edit.content);
    contentRef.current = edit.content;
    setMetadata(edit.metadata);
    metadataRef.current = edit.metadata;
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

  const wordCount = paragraphs.reduce(
    (count, p) => count + (p.text.trim() ? p.text.trim().split(/\s+/).length : 0),
    0
  );

  const argumentWeb = getOrCreateArgumentWeb(metadata);
  const argumentCount = argumentWeb.nodes.length + (argumentWeb.main_thesis ? 1 : 0);

  // Reliable passage selection capture that survives textarea focus changes
  const handleSelectText = (e: React.SyntheticEvent<HTMLTextAreaElement>, blockIndex: number) => {
    const target = e.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    if (typeof start === 'number' && typeof end === 'number' && end > start) {
      const selected = target.value.substring(start, end);
      if (selected.trim().length > 0) {
        setSelection({
          text: selected,
          blockIndex,
          startOffset: start,
          endOffset: end,
        });
      }
    }
  };

  const handleAddSelectionAsArgument = () => {
    if (!selection) return;
    const currentWeb = getOrCreateArgumentWeb(metadataRef.current);
    const sourceRef: ArgumentSourceRef = {
      block_index: structured ? selection.blockIndex : undefined,
      start_offset: selection.startOffset,
      end_offset: selection.endOffset,
    };
    const trimmed = selection.text.trim();
    const title = trimmed.length > 36 ? trimmed.slice(0, 36) + '…' : trimmed;
    const { web: nextWeb } = addArgumentNode(
      currentWeb,
      title,
      selection.text,
      sourceRef
    );
    handleUpdateWeb(nextWeb);
    setToastMessage(`Added "${title}" to Argument Web`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSetSelectionAsThesis = () => {
    if (!selection) return;
    const currentWeb = getOrCreateArgumentWeb(metadataRef.current);
    const sourceRef: ArgumentSourceRef = {
      block_index: structured ? selection.blockIndex : undefined,
      start_offset: selection.startOffset,
      end_offset: selection.endOffset,
    };
    const trimmed = selection.text.trim();
    const title = trimmed.length > 36 ? trimmed.slice(0, 36) + '…' : (trimmed || 'Main Thesis');
    const nextWeb = setMainThesis(
      currentWeb,
      title,
      selection.text,
      sourceRef
    );
    handleUpdateWeb(nextWeb);
    setToastMessage(`Set "${title}" as Main Thesis`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      {/* TOP APPLICATION BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 border-b border-border/60 bg-muted/10 shrink-0">
        <div className="flex items-center gap-3">
          {/* Primary View Switcher: Writing View vs Argument Web */}
          <div role="tablist" aria-label="Studio view" className="flex items-center gap-1 rounded-lg border border-border p-1 bg-card/60">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'writing'}
              onClick={() => setView('writing')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-primary',
                view === 'writing'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Writing View</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'web'}
              onClick={() => setView('web')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-primary',
                view === 'web'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Argument Web</span>
              {argumentCount > 0 && (
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                    view === 'web' ? 'bg-primary-foreground text-primary' : 'bg-primary/20 text-primary'
                  )}
                >
                  {argumentCount}
                </span>
              )}
            </button>
          </div>

          {view === 'writing' && (
            <div role="group" aria-label="Composition mode" className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
              {(['freeform', 'structured'] as const).map((v) => (
                <button
                  key={v}
                  aria-pressed={mode === v}
                  onClick={() => updateMetadata(switchPhilosophyMode(metadata, v))}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-primary',
                    mode === v ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {v === 'freeform' ? 'Freeform Writing' : 'Structured Reasoning'}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {toastMessage && (
            <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5 animate-in fade-in">
              <span>{toastMessage}</span>
              <button
                type="button"
                onClick={() => setView('web')}
                className="underline font-bold hover:text-emerald-700 dark:hover:text-emerald-300 ml-1 inline-flex items-center gap-0.5"
              >
                <span>Open Web</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          )}
          {view === 'writing' && (
            <span className="text-xs text-muted-foreground">
              {wordCount} Words{structured ? ` · ${paragraphs.length} Blocks` : ''}
            </span>
          )}
        </div>
      </div>

      {/* VIEWPORT BODY */}
      {view === 'web' ? (
        <div className="flex-1 overflow-hidden">
          <ArgumentWebEditor
            web={argumentWeb}
            content={content}
            paragraphs={paragraphs}
            onUpdateWeb={handleUpdateWeb}
            onBackToWriting={() => setView('writing')}
            onJumpToPassage={(source) => {
              setView('writing');
              if (source?.block_index !== undefined) {
                setActiveIdx(source.block_index);
              }
            }}
            currentSelectionText={selection?.text || ''}
            currentSelectionSource={
              selection
                ? {
                    block_index: structured ? selection.blockIndex : undefined,
                    start_offset: selection.startOffset,
                    end_offset: selection.endOffset,
                  }
                : null
            }
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-8 sm:py-10 relative">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="pb-4 border-b border-border/40">
              <p className="text-xs font-serif uppercase tracking-widest text-primary mb-2">
                {structured ? 'Structured Reasoning' : 'Philosophical Notebook'}
              </p>
              <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground break-words">
                {document.metadata.title}
              </h1>
              {(metadata.work_title || metadata.chapter) && (
                <p className="text-sm text-muted-foreground mt-2">
                  {metadata.work_title}
                  {metadata.chapter ? ` · § ${metadata.chapter}` : ''}
                </p>
              )}
              {metadata.epigraph && (
                <p className="font-serif italic text-muted-foreground mt-3 whitespace-pre-wrap">
                  {metadata.epigraph}
                </p>
              )}
            </div>

            {!metadata.thinking_desk_intro_dismissed && metadata.composition_mode === 'freeform' && (
              <aside className="flex items-start gap-3 text-sm text-muted-foreground bg-primary/5 border border-primary/20 rounded-lg p-3">
                <p className="flex-1">
                  Think freely first. Explore questions and unfinished thoughts here. Choose Structured Reasoning whenever you want to give your ideas a role.
                </p>
                <button
                  aria-label="Dismiss introduction"
                  title="Dismiss introduction"
                  onClick={() => updateMetadata({ ...metadata, thinking_desk_intro_dismissed: true })}
                  className="p-1 rounded hover:text-foreground focus-visible:outline focus-visible:outline-primary"
                >
                  <X className="w-4 h-4" />
                </button>
              </aside>
            )}

            {!structured && paragraphs.length > 1 && (
              <p className="text-xs text-muted-foreground">
                Your existing blocks stay separate so their roles and order are preserved. Write naturally within each block.
              </p>
            )}

            {structured && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-primary w-fit">About reasoning roles</summary>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {Object.entries(CLASSIFICATIONS).map(([key, value]) => (
                    <div key={key}>
                      <dt className="font-semibold text-foreground">{value.label}</dt>
                      <dd>{value.description}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}

            <div className={structured ? 'space-y-4' : 'space-y-2'}>
              {paragraphs.map((p, index) => (
                <div
                  key={p.id}
                  onFocus={() => setActiveIdx(index)}
                  className={cn(
                    'group',
                    structured && 'rounded-xl border p-4 sm:p-5 bg-card/40',
                    structured && activeIdx === index && 'border-primary/40'
                  )}
                >
                  {structured && (
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <select
                        aria-label={`Role for block ${index + 1}`}
                        value={p.classification}
                        title={CLASSIFICATIONS[p.classification].description}
                        onChange={(event) =>
                          editBlocks(
                            paragraphs.map((block, i) =>
                              i === index
                                ? { ...block, classification: event.target.value as PhilosophyClassification }
                                : block
                            )
                          )
                        }
                        className="max-w-full bg-background text-foreground border border-border rounded-md px-2 py-1 text-xs focus:outline-primary"
                      >
                        {Object.entries(CLASSIFICATIONS).map(([key, value]) => (
                          <option key={key} value={key}>
                            {value.label}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <button
                          aria-label={`Move block ${index + 1} up`}
                          title="Move up"
                          disabled={index === 0}
                          onClick={() => moveBlock(index, -1)}
                          className="p-1.5 rounded hover:text-primary disabled:opacity-30"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          aria-label={`Move block ${index + 1} down`}
                          title="Move down"
                          disabled={index === paragraphs.length - 1}
                          onClick={() => moveBlock(index, 1)}
                          className="p-1.5 rounded hover:text-primary disabled:opacity-30"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          aria-label={`Insert block after ${index + 1}`}
                          title="Insert block below"
                          onClick={() => addBlock('prose', index)}
                          className="p-1.5 rounded hover:text-primary"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          aria-label={`Delete block ${index + 1}`}
                          title="Delete block"
                          onClick={() => {
                            editBlocks(
                              paragraphs.length === 1
                                ? [{ ...p, text: '', classification: 'prose' }]
                                : paragraphs.filter((_, i) => i !== index)
                            );
                            setActiveIdx(Math.max(0, index - 1));
                          }}
                          className="p-1.5 rounded hover:text-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="w-full text-xs text-muted-foreground">
                        {CLASSIFICATIONS[p.classification].description}
                      </p>
                    </div>
                  )}
                  <WritingArea
                    aria-label={
                      structured
                        ? `Text for block ${index + 1}`
                        : paragraphs.length === 1
                        ? 'Freeform writing'
                        : `Writing block ${index + 1}`
                    }
                    value={p.text}
                    onSelect={(e) => handleSelectText(e, index)}
                    onMouseUp={(e) => handleSelectText(e, index)}
                    onKeyUp={(e) => handleSelectText(e, index)}
                    onChange={(event) =>
                      editBlocks(
                        paragraphs.map((block, i) =>
                          i === index ? { ...block, text: event.target.value } : block
                        )
                      )
                    }
                    placeholder={
                      structured
                        ? 'Develop this thought…'
                        : 'What is on your mind? Follow a question, explore an idea, leave room for uncertainty…'
                    }
                    rows={structured || paragraphs.length > 1 ? 3 : 14}
                    className={cn(
                      'block w-full bg-transparent resize-none overflow-hidden focus:outline-none text-[17px] leading-loose text-foreground placeholder:text-muted-foreground/60 font-serif',
                      structured ? 'min-h-24' : paragraphs.length === 1 ? 'min-h-[45vh] py-2' : 'min-h-24 py-2'
                    )}
                  />
                </div>
              ))}
            </div>

            {structured && (
              <div className="flex flex-wrap gap-2 pt-4 border-t border-border/40" aria-label="Add reasoning block">
                {Object.entries(CLASSIFICATIONS).map(([key, value]) => (
                  <button
                    key={key}
                    title={value.description}
                    onClick={() => addBlock(key as PhilosophyClassification)}
                    className="px-3 py-2 text-xs rounded-lg border border-border text-foreground bg-card hover:border-primary/50 focus-visible:outline-primary"
                  >
                    + {value.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* PERSISTENT PASSAGE SELECTION ACTION DOCK */}
          {selection && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-xl p-3 rounded-xl bg-card/95 border border-primary/40 shadow-2xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3 z-30 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase font-bold tracking-wider text-primary flex items-center gap-1.5">
                  <Network className="w-3 h-3" />
                  <span>Passage Selected</span>
                  <span className="text-muted-foreground font-normal">({selection.text.length} chars)</span>
                </div>
                <p className="text-xs text-foreground font-serif italic truncate mt-0.5">
                  “{selection.text}”
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleAddSelectionAsArgument}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add to Argument Web</span>
                </button>
                <button
                  type="button"
                  onClick={handleSetSelectionAsThesis}
                  className="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 font-semibold text-xs transition-colors"
                >
                  Set as Thesis
                </button>
                <button
                  type="button"
                  onClick={() => setSelection(null)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground"
                  title="Clear selection"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
