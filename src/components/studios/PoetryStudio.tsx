import React, { useState, useEffect, useCallback } from 'react';
import { DocumentDetail, PoetryMetadata, SaveStatus } from '@/types';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  FileDown,
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface PoetryStudioProps {
  document: DocumentDetail;
  onSave: (content: string, metadataJson?: string) => Promise<void> | void;
  saveStatus: SaveStatus;
}

export const PoetryStudio: React.FC<PoetryStudioProps> = ({ document, onSave }) => {
  // Parse stanzas from content (separated by \n\n+)
  const parseStanzas = (raw: string): string[] => {
    const list = raw.split(/\n\s*\n/).map(s => s.trim());
    return list.length > 0 && list[0] !== '' ? list : [''];
  };

  const [stanzas, setStanzas] = useState<string[]>(() => parseStanzas(document.content));
  const [fontFamily, setFontFamily] = useState<'serif' | 'sans' | 'mono'>('serif');
  const [activeStanzaIdx, setActiveStanzaIdx] = useState<number>(0);
  const [metadata, setMetadata] = useState<PoetryMetadata>(() => {
    try {
      return document.metadata.metadata_json ? JSON.parse(document.metadata.metadata_json) : {};
    } catch {
      return {};
    }
  });

  // Keep stanzas synced when switching document
  useEffect(() => {
    setStanzas(parseStanzas(document.content));
    try {
      setMetadata(document.metadata.metadata_json ? JSON.parse(document.metadata.metadata_json) : {});
    } catch {
      setMetadata({});
    }
    setActiveStanzaIdx(0);
  }, [document.metadata.id]);

  // Combine stanzas into canonical Markdown representation
  const serializeStanzas = (list: string[]): string => {
    return list.map(s => s.trimEnd()).join('\n\n');
  };

  // Trigger auto-save with debounce
  const triggerSave = useCallback(
    (newStanzas: string[], newMeta: PoetryMetadata) => {
      const content = serializeStanzas(newStanzas);
      const metaJson = JSON.stringify(newMeta);
      onSave(content, metaJson);
    },
    [onSave]
  );

  const handleStanzaChange = (idx: number, text: string) => {
    const updated = [...stanzas];
    updated[idx] = text;
    setStanzas(updated);
    triggerSave(updated, metadata);
  };

  const handleAddStanza = (afterIdx?: number) => {
    const updated = [...stanzas];
    if (afterIdx !== undefined && afterIdx >= 0) {
      updated.splice(afterIdx + 1, 0, '');
      setActiveStanzaIdx(afterIdx + 1);
    } else {
      updated.push('');
      setActiveStanzaIdx(updated.length - 1);
    }
    setStanzas(updated);
    triggerSave(updated, metadata);
  };

  const handleDeleteStanza = (idx: number) => {
    if (stanzas.length <= 1) {
      // Clear instead of removing last stanza
      setStanzas(['']);
      triggerSave([''], metadata);
      return;
    }
    const updated = stanzas.filter((_, i) => i !== idx);
    setStanzas(updated);
    setActiveStanzaIdx(Math.max(0, idx - 1));
    triggerSave(updated, metadata);
  };

  const handleMoveStanza = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= stanzas.length) return;

    const updated = [...stanzas];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setStanzas(updated);
    setActiveStanzaIdx(targetIdx);
    triggerSave(updated, metadata);
  };

  const handleMetaChange = (field: keyof PoetryMetadata, value: string) => {
    const updated = { ...metadata, [field]: value };
    setMetadata(updated);
    triggerSave(stanzas, updated);
  };

  const handleExportMarkdown = () => {
    const markdown = `# ${document.metadata.title}\n\n${serializeStanzas(stanzas)}\n`;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document.metadata.title.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Stats calculation
  const totalLines = stanzas.reduce((acc, s) => acc + (s.trim() ? s.split('\n').length : 0), 0);
  const totalWords = stanzas.reduce((acc, s) => acc + (s.trim() ? s.split(/\s+/).length : 0), 0);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Studio Toolbar */}
      <div className="flex items-center justify-between px-8 py-3.5 border-b border-border/60 bg-muted/10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[13.5px] text-muted-foreground">
            <span className="font-semibold text-foreground">{stanzas.length}</span> {stanzas.length === 1 ? 'Stanza' : 'Stanzas'}
            <span className="opacity-40">•</span>
            <span className="font-semibold text-foreground">{totalLines}</span> Lines
            <span className="opacity-40">•</span>
            <span className="font-semibold text-foreground">{totalWords}</span> Words
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Form Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Form:</span>
            <select
              value={metadata.poetic_form || 'Free Verse'}
              onChange={e => handleMetaChange('poetic_form', e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border/80 text-xs text-foreground focus:outline-none"
            >
              <option value="Free Verse">Free Verse</option>
              <option value="Rhymed Stanzas">Rhymed Stanzas</option>
              <option value="Sonnet">Sonnet</option>
              <option value="Haiku / Tanka">Haiku / Tanka</option>
              <option value="Villanelle">Villanelle</option>
              <option value="Ghazal">Ghazal</option>
            </select>
          </div>
        </div>

        {/* Right actions: Typography and Export */}
        <div className="flex items-center gap-2.5">
          {/* Typography font toggle */}
          <div className="flex items-center rounded-lg border border-border p-0.5 bg-muted/20">
            <button
              onClick={() => setFontFamily('serif')}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-serif transition-colors',
                fontFamily === 'serif' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Serif typography (classic literary)"
            >
              Serif
            </button>
            <button
              onClick={() => setFontFamily('sans')}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-sans transition-colors',
                fontFamily === 'sans' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Sans-serif typography (clean modern)"
            >
              Sans
            </button>
            <button
              onClick={() => setFontFamily('mono')}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-mono transition-colors',
                fontFamily === 'mono' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Monospace (rhythm & fixed spacing)"
            >
              Mono
            </button>
          </div>

          <button
            onClick={handleExportMarkdown}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
            title="Export poem as Markdown file"
          >
            <FileDown className="w-4 h-4 text-muted-foreground" />
            Export
          </button>
        </div>
      </div>

      {/* Main Writing Surface */}
      <div className="flex-1 overflow-y-auto px-6 py-10">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Poem Prominent Header */}
          <div className="text-center pb-5 border-b border-border/40">
            <h1
              className={cn(
                'text-3xl font-normal tracking-wide text-foreground mb-2.5',
                fontFamily === 'serif' && 'font-serif italic',
                fontFamily === 'mono' && 'font-mono'
              )}
            >
              {document.metadata.title}
            </h1>
            {metadata.poetic_form && (
              <span className="text-xs font-sans uppercase tracking-widest text-muted-foreground">
                {metadata.poetic_form}
              </span>
            )}
          </div>

          {/* Stanzas List */}
          <div className="space-y-6">
            {stanzas.map((stanza, idx) => {
              const lines = stanza.split('\n');
              const isSelected = activeStanzaIdx === idx;

              return (
                <div
                  key={idx}
                  onClick={() => setActiveStanzaIdx(idx)}
                  className={cn(
                    'group relative rounded-2xl transition-all duration-200 border p-6',
                    isSelected
                      ? 'bg-card border-primary/40 shadow-sm ring-1 ring-primary/20'
                      : 'bg-card/50 border-border/60 hover:border-border hover:bg-card'
                  )}
                >
                  {/* Floating Action Controls for Stanza */}
                  <div className="absolute right-3.5 top-3.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-background/90 backdrop-blur-sm p-1 rounded-md border border-border/60 shadow-sm z-10">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleMoveStanza(idx, 'up');
                      }}
                      disabled={idx === 0}
                      className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                      title="Move Stanza Up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleMoveStanza(idx, 'down');
                      }}
                      disabled={idx === stanzas.length - 1}
                      className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                      title="Move Stanza Down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <div className="h-3 w-px bg-border mx-0.5" />
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleAddStanza(idx);
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
                      title="Insert Stanza Below"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleDeleteStanza(idx);
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-rose-400 transition-colors"
                      title="Delete Stanza"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Stanza Index Indicator */}
                  <div className="text-xs font-mono text-muted-foreground/70 mb-2.5 select-none flex items-center justify-between">
                    <span>STANZA {idx + 1}</span>
                    <span>{lines.length} {lines.length === 1 ? 'line' : 'lines'}</span>
                  </div>

                  {/* Line-preserving textarea */}
                  <textarea
                    value={stanza}
                    onChange={e => handleStanzaChange(idx, e.target.value)}
                    placeholder="Write verses here... (press Enter for a new line, line breaks are preserved exactly)"
                    rows={Math.max(3, lines.length)}
                    className={cn(
                      'w-full bg-transparent resize-none focus:outline-none leading-[1.8] text-[18px] tracking-wide text-foreground placeholder:text-muted-foreground/40',
                      fontFamily === 'serif' && 'font-serif',
                      fontFamily === 'sans' && 'font-sans',
                      fontFamily === 'mono' && 'font-mono'
                    )}
                    style={{ whiteSpace: 'pre-wrap' }}
                  />
                </div>
              );
            })}
          </div>

          {/* Add Stanza Button at Bottom */}
          <div className="text-center pt-4">
            <button
              onClick={() => handleAddStanza()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-dashed border-border/80 text-sm font-medium text-muted-foreground hover:text-primary hover:border-primary/60 hover:bg-primary/5 transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Next Stanza
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
