import React, { useState, useEffect, useCallback } from 'react';
import { DocumentDetail, PhilosophyClassification, PhilosophyParagraph, PhilosophyMetadata, SaveStatus } from '@/types';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  FileDown,
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface PhilosophyStudioProps {
  document: DocumentDetail;
  onSave: (content: string, metadataJson?: string) => Promise<void> | void;
  saveStatus: SaveStatus;
}

const CLASSIFICATION_COLORS: Record<PhilosophyClassification, { bg: string; border: string; text: string; label: string }> = {
  premise: { bg: 'bg-indigo-950/20', border: 'border-l-indigo-500', text: 'text-indigo-400', label: 'Premise / Axiom' },
  argument: { bg: 'bg-sky-950/20', border: 'border-l-sky-500', text: 'text-sky-400', label: 'Argument / Dialectic' },
  objection: { bg: 'bg-amber-950/20', border: 'border-l-amber-500', text: 'text-amber-400', label: 'Objection / Counterpoint' },
  example: { bg: 'bg-emerald-950/20', border: 'border-l-emerald-500', text: 'text-emerald-400', label: 'Example / Thought Experiment' },
  conclusion: { bg: 'bg-purple-950/20', border: 'border-l-purple-500', text: 'text-purple-400', label: 'Conclusion / Corollary' },
  prose: { bg: 'bg-card/50', border: 'border-l-border', text: 'text-muted-foreground', label: 'General Prose' },
};

export const PhilosophyStudio: React.FC<PhilosophyStudioProps> = ({ document, onSave }) => {
  // Parse paragraphs with optional <!-- classification --> markers
  const parseParagraphs = (raw: string): PhilosophyParagraph[] => {
    const rawBlocks = raw.split(/\n\s*\n/).filter(Boolean);
    if (rawBlocks.length === 0) {
      return [{ id: '1', classification: 'prose', text: '' }];
    }

    return rawBlocks.map((block, idx) => {
      let classification: PhilosophyClassification = 'prose';
      let text = block.trim();

      const match = text.match(/^<!--\s*(premise|argument|objection|example|conclusion|prose)\s*-->\n?([\s\S]*)$/i);
      if (match) {
        classification = match[1].toLowerCase() as PhilosophyClassification;
        text = match[2].trim();
      }

      return {
        id: `p-${idx}-${Date.now()}`,
        classification,
        text,
      };
    });
  };

  const [paragraphs, setParagraphs] = useState<PhilosophyParagraph[]>(() => parseParagraphs(document.content));
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [metadata, setMetadata] = useState<PhilosophyMetadata>(() => {
    try {
      return document.metadata.metadata_json ? JSON.parse(document.metadata.metadata_json) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    setParagraphs(parseParagraphs(document.content));
    try {
      setMetadata(document.metadata.metadata_json ? JSON.parse(document.metadata.metadata_json) : {});
    } catch {
      setMetadata({});
    }
    setActiveIdx(0);
  }, [document.metadata.id]);

  const serializeContent = (list: PhilosophyParagraph[]): string => {
    return list
      .map(p => {
        if (p.classification !== 'prose') {
          return `<!-- ${p.classification} -->\n${p.text}`;
        }
        return p.text;
      })
      .join('\n\n');
  };

  const triggerSave = useCallback(
    (newParagraphs: PhilosophyParagraph[], newMeta: PhilosophyMetadata) => {
      const content = serializeContent(newParagraphs);
      const metaJson = JSON.stringify(newMeta);
      onSave(content, metaJson);
    },
    [onSave]
  );

  const handleTextChange = (idx: number, text: string) => {
    const updated = [...paragraphs];
    updated[idx] = { ...updated[idx], text };
    setParagraphs(updated);
    triggerSave(updated, metadata);
  };

  const handleClassificationChange = (idx: number, classification: PhilosophyClassification) => {
    const updated = [...paragraphs];
    updated[idx] = { ...updated[idx], classification };
    setParagraphs(updated);
    triggerSave(updated, metadata);
  };

  const handleAddParagraph = (afterIdx?: number, classification: PhilosophyClassification = 'prose') => {
    const updated = [...paragraphs];
    const newP: PhilosophyParagraph = {
      id: `p-${Date.now()}`,
      classification,
      text: '',
    };
    if (afterIdx !== undefined && afterIdx >= 0) {
      updated.splice(afterIdx + 1, 0, newP);
      setActiveIdx(afterIdx + 1);
    } else {
      updated.push(newP);
      setActiveIdx(updated.length - 1);
    }
    setParagraphs(updated);
    triggerSave(updated, metadata);
  };

  const handleDeleteParagraph = (idx: number) => {
    if (paragraphs.length <= 1) {
      const cleared = [{ id: '1', classification: 'prose' as const, text: '' }];
      setParagraphs(cleared);
      triggerSave(cleared, metadata);
      return;
    }
    const updated = paragraphs.filter((_, i) => i !== idx);
    setParagraphs(updated);
    setActiveIdx(Math.max(0, idx - 1));
    triggerSave(updated, metadata);
  };

  const handleMoveParagraph = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= paragraphs.length) return;

    const updated = [...paragraphs];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setParagraphs(updated);
    setActiveIdx(targetIdx);
    triggerSave(updated, metadata);
  };

  const handleExportMarkdown = () => {
    let md = `# ${document.metadata.title}\n\n`;
    if (metadata.work_title) md += `**Treatise:** ${metadata.work_title}\n`;
    if (metadata.chapter) md += `**Section:** ${metadata.chapter}\n`;
    md += `\n---\n\n`;

    md += paragraphs
      .map(p => {
        if (p.classification !== 'prose') {
          return `> **[${p.classification.toUpperCase()}]**\n> ${p.text.replace(/\n/g, '\n> ')}`;
        }
        return p.text;
      })
      .join('\n\n');

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document.metadata.title.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const wordCount = paragraphs.reduce((acc, p) => acc + (p.text.trim() ? p.text.split(/\s+/).length : 0), 0);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Studio Header Toolbar */}
      <div className="flex items-center justify-between px-8 py-3.5 border-b border-border/60 bg-muted/10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[13.5px] text-muted-foreground">
            <span className="font-semibold text-foreground">{paragraphs.length}</span> Paragraphs
            <span className="opacity-40">•</span>
            <span className="font-semibold text-foreground">{wordCount}</span> Words
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Work / Chapter Info */}
          <div className="flex items-center gap-2 text-[13px]">
            {metadata.work_title && (
              <span className="font-medium text-foreground bg-muted/50 px-2.5 py-0.5 rounded">
                {metadata.work_title}
              </span>
            )}
            {metadata.chapter && (
              <span className="text-muted-foreground">
                § {metadata.chapter}
              </span>
            )}
          </div>
        </div>

        {/* Export */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportMarkdown}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <FileDown className="w-4 h-4 text-muted-foreground" />
            Export Treatise
          </button>
        </div>
      </div>

      {/* Writing Canvas */}
      <div className="flex-1 overflow-y-auto px-6 py-10">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Document Title Header */}
          <div className="pb-4 border-b border-border/40">
            <div className="text-xs font-serif uppercase tracking-widest text-primary mb-1.5 font-semibold">
              Philosophical Treatise
            </div>
            <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground">
              {document.metadata.title}
            </h1>
          </div>

          {/* Paragraph Blocks */}
          <div className="space-y-4">
            {paragraphs.map((p, idx) => {
              const isSelected = activeIdx === idx;
              const style = CLASSIFICATION_COLORS[p.classification];

              return (
                <div
                  key={p.id}
                  onClick={() => setActiveIdx(idx)}
                  className={cn(
                    'group relative rounded-xl border border-l-4 p-5 transition-all duration-200',
                    style.border,
                    isSelected
                      ? 'bg-card shadow-sm ring-1 ring-primary/40'
                      : 'bg-card/40 hover:bg-card hover:border-border'
                  )}
                >
                  {/* Top Bar for Paragraph: Classification Badge & Action Controls */}
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={p.classification}
                        onChange={e =>
                          handleClassificationChange(idx, e.target.value as PhilosophyClassification)
                        }
                        className={cn(
                          'text-xs font-semibold px-2.5 py-1 rounded bg-muted/40 border border-border/60 focus:outline-none transition-colors cursor-pointer',
                          style.text
                        )}
                      >
                        <option value="prose">General Prose</option>
                        <option value="premise">Premise</option>
                        <option value="argument">Argument</option>
                        <option value="objection">Objection</option>
                        <option value="example">Example</option>
                        <option value="conclusion">Conclusion</option>
                      </select>

                      <span className="text-xs font-mono text-muted-foreground/50">§ {idx + 1}</span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm p-1 rounded-md border border-border/60">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleMoveParagraph(idx, 'up');
                        }}
                        disabled={idx === 0}
                        className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleMoveParagraph(idx, 'down');
                        }}
                        disabled={idx === paragraphs.length - 1}
                        className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <div className="h-3 w-px bg-border mx-0.5" />
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleAddParagraph(idx, 'prose');
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-primary"
                        title="Insert Paragraph Below"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleDeleteParagraph(idx);
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-rose-400"
                        title="Delete Paragraph"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Writing Area */}
                  <textarea
                    value={p.text}
                    onChange={e => handleTextChange(idx, e.target.value)}
                    placeholder={`Write ${style.label.toLowerCase()} here...`}
                    rows={Math.max(2, p.text.split('\n').length)}
                    className="w-full bg-transparent resize-none focus:outline-none text-[16.5px] leading-relaxed text-foreground placeholder:text-muted-foreground/40 font-sans"
                  />
                </div>
              );
            })}
          </div>

          {/* Quick Insert Classification Bar */}
          <div className="pt-4 border-t border-border/40">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 text-center">
              Insert Next Proposition
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => handleAddParagraph(undefined, 'premise')}
                className="px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-950/20 text-xs font-medium text-indigo-300 hover:bg-indigo-950/40 transition-colors"
              >
                + Premise
              </button>
              <button
                onClick={() => handleAddParagraph(undefined, 'argument')}
                className="px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-950/20 text-xs font-medium text-sky-300 hover:bg-sky-950/40 transition-colors"
              >
                + Argument
              </button>
              <button
                onClick={() => handleAddParagraph(undefined, 'objection')}
                className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-950/20 text-xs font-medium text-amber-300 hover:bg-amber-950/40 transition-colors"
              >
                + Objection
              </button>
              <button
                onClick={() => handleAddParagraph(undefined, 'example')}
                className="px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/20 text-xs font-medium text-emerald-300 hover:bg-emerald-950/40 transition-colors"
              >
                + Example
              </button>
              <button
                onClick={() => handleAddParagraph(undefined, 'conclusion')}
                className="px-3 py-1.5 rounded-lg border border-purple-500/30 bg-purple-950/20 text-xs font-medium text-purple-300 hover:bg-purple-950/40 transition-colors"
              >
                + Conclusion
              </button>
              <button
                onClick={() => handleAddParagraph(undefined, 'prose')}
                className="px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors"
              >
                + General Prose
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
