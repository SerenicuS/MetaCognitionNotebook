import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DocumentDetail, PoetryMetadata, SaveStatus } from '@/types';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  FileDown,
  FileUp,
  Sparkles,
  ChevronDown,
  Check,
  AlertTriangle,
  Sliders,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { EmotionalCipherModal } from './EmotionalCipherModal';
import {
  PoemExportFormat,
  serializePoemExport,
  parsePoemImport,
  truncateDisplayLabel,
  moveStanzaEntry,
  insertStanzaEntry,
  deleteStanzaEntry,
  computeTextFingerprint,
  extractLinePreview,
  reconcilePoemCipherMetadata,
  splitPoemStanzas,
  poemStanzasFromMetadata,
} from '@/utils/emotionalCipher';
import { api } from '@/services/api';

interface PoetryStudioProps {
  document: DocumentDetail;
  onSave: (content: string, metadataJson?: string) => Promise<void> | void;
  saveStatus: SaveStatus;
  onCreateNewPoem?: (
    title: string,
    content: string,
    metadataJson?: string,
    tags?: string[]
  ) => Promise<void>;
}

function readPoetryMetadata(document: DocumentDetail): PoetryMetadata & { cipher?: any } {
  const parsed = document.metadata.metadata_json ? JSON.parse(document.metadata.metadata_json) : {};
  if (parsed.cipher?.scope === 'per_stanza' || Array.isArray(parsed.cipher?.per_stanza_backup)) {
    parsed.cipher = reconcilePoemCipherMetadata(document.content, parsed.cipher);
  }
  return parsed;
}

export const PoetryStudio: React.FC<PoetryStudioProps> = ({ document, onSave, onCreateNewPoem }) => {
  // Parse stanzas from content (separated by \n\n+) while preserving line-level whitespace
  const parseStanzas = (raw: string): string[] => {
    try {
      const cipher = document.metadata.metadata_json ? JSON.parse(document.metadata.metadata_json).cipher : undefined;
      if (cipher?.scope === 'per_stanza' || Array.isArray(cipher?.per_stanza_backup)) return poemStanzasFromMetadata(raw, cipher);
    } catch { /* Legacy plain poems use their existing line-preserving parser. */ }
    const normalized = (raw ?? '').replace(/\r\n/g, '\n');
    const list = normalized.split(/\n\s*\n/).map(s => s.replace(/^\n+|\n+$/g, ''));
    return list.length > 0 && list[0] !== '' ? list : [''];
  };

  const [stanzas, setStanzas] = useState<string[]>(() => parseStanzas(document.content));
  const [fontFamily, setFontFamily] = useState<'serif' | 'sans' | 'mono'>('serif');
  const [activeStanzaIdx, setActiveStanzaIdx] = useState<number>(0);
  const [isCipherModalOpen, setIsCipherModalOpen] = useState<boolean>(false);
  const [cipherInitialTab, setCipherInitialTab] = useState<'quick' | 'random' | 'manual' | 'decode' | 'keys' | undefined>(undefined);
  const [cipherInitialStanza, setCipherInitialStanza] = useState<number | undefined>(undefined);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);
  const [studioNotice, setStudioNotice] = useState<{ text: string; isError?: boolean } | null>(null);
  const importPoemInputRef = useRef<HTMLInputElement>(null);

  const [metadata, setMetadata] = useState<PoetryMetadata & { cipher?: any }>(() => {
    try {
      return readPoetryMetadata(document);
    } catch {
      return {};
    }
  });

  const cipherEntryField = metadata.cipher?.scope === 'per_stanza' ? 'stanzas' : 'per_stanza_backup';
  const cipherEntries = metadata.cipher?.[cipherEntryField];

  // Keep stanzas synced when switching document
  useEffect(() => {
    setStanzas(parseStanzas(document.content));
    try {
      setMetadata(readPoetryMetadata(document));
    } catch {
      setMetadata({});
    }
    setActiveStanzaIdx(0);
    setIsExportMenuOpen(false);
  }, [document.metadata.id, document.metadata.metadata_json]);

  const showNotice = (text: string, isError = false) => {
    setStudioNotice({ text, isError });
    setTimeout(() => {
      setStudioNotice(prev => (prev?.text === text ? null : prev));
    }, 4500);
  };

  // Combine stanzas into canonical Markdown representation
  const serializeStanzas = (list: string[]): string => {
    return list.map(s => s.replace(/\n+$/g, '')).join('\n\n');
  };

  // Trigger auto-save with debounce
  const triggerSave = useCallback(
    (newStanzas: string[], newMeta: PoetryMetadata) => {
      const content = serializeStanzas(newStanzas);
      let nextMeta = newMeta;
      if (newMeta.cipher?.scope === 'per_stanza' || Array.isArray(newMeta.cipher?.per_stanza_backup)) {
        const field = newMeta.cipher.scope === 'per_stanza' ? 'stanzas' : 'per_stanza_backup';
        // These IDs came from coordinated textarea/add/delete/up/down operations. A blank-line
        // split inside a textarea has no such one-to-one evidence and must reconcile conservatively.
        const knownOrder = newStanzas.every(stanza => splitPoemStanzas(stanza).length === 1) &&
          newMeta.cipher[field]?.length === newStanzas.length;
        nextMeta = { ...newMeta, cipher: reconcilePoemCipherMetadata(content, {
          ...newMeta.cipher, stanza_snapshot: knownOrder ? computeTextFingerprint(content) : undefined,
        }) };
        setMetadata(nextMeta);
      }
      const metaJson = JSON.stringify(nextMeta);
      onSave(content, metaJson);
    },
    [onSave]
  );

  const handleStanzaChange = (idx: number, text: string) => {
    const updated = [...stanzas];
    updated[idx] = text;
    setStanzas(updated);

    let updatedMeta = metadata;
    if (Array.isArray(cipherEntries)) {
      const nextCipherStanzas = [...cipherEntries];
      if (nextCipherStanzas[idx]) {
        nextCipherStanzas[idx] = {
          ...nextCipherStanzas[idx],
          content_fingerprint: computeTextFingerprint(splitPoemStanzas(text)[0]),
          line_preview: extractLinePreview(text),
        };
        updatedMeta = {
          ...metadata,
          cipher: {
            ...metadata.cipher,
            [cipherEntryField]: nextCipherStanzas,
          },
        };
        setMetadata(updatedMeta);
      }
    }
    triggerSave(updated, updatedMeta);
  };

  const handleAddStanza = (afterIdx?: number) => {
    const updated = [...stanzas];
    const targetIdx = afterIdx !== undefined && afterIdx >= 0 ? afterIdx + 1 : updated.length;
    if (afterIdx !== undefined && afterIdx >= 0) {
      updated.splice(targetIdx, 0, '');
      setActiveStanzaIdx(targetIdx);
    } else {
      updated.push('');
      setActiveStanzaIdx(updated.length - 1);
    }
    setStanzas(updated);

    let updatedMeta = metadata;
    if (Array.isArray(cipherEntries)) {
      const insertedCipherStanzas = insertStanzaEntry(cipherEntries, targetIdx);
      updatedMeta = {
        ...metadata,
        cipher: {
          ...metadata.cipher,
          [cipherEntryField]: insertedCipherStanzas,
        },
      };
      setMetadata(updatedMeta);
    }
    triggerSave(updated, updatedMeta);
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

    let updatedMeta = metadata;
    if (Array.isArray(cipherEntries)) {
      const { entries: deletedCipherStanzas, removed } = deleteStanzaEntry(cipherEntries, idx);
      const unresolved = [...(metadata.cipher.unresolved_stanzas || [])];
      if (removed && removed.mappings && removed.mappings.some((m: any) => m.original && m.original.trim())) {
        unresolved.push(removed);
      }
      updatedMeta = {
        ...metadata,
        cipher: {
          ...metadata.cipher,
          [cipherEntryField]: deletedCipherStanzas,
          unresolved_stanzas: unresolved.length > 0 ? unresolved : undefined,
        },
      };
      setMetadata(updatedMeta);
    }
    triggerSave(updated, updatedMeta);
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

    let updatedMeta = metadata;
    if (Array.isArray(cipherEntries)) {
      const movedCipherStanzas = moveStanzaEntry(cipherEntries, idx, targetIdx);
      updatedMeta = {
        ...metadata,
        cipher: {
          ...metadata.cipher,
          [cipherEntryField]: movedCipherStanzas,
        },
      };
      setMetadata(updatedMeta);
    }
    triggerSave(updated, updatedMeta);
  };

  const handleMetaChange = (field: keyof PoetryMetadata, value: string) => {
    const updated = { ...metadata, [field]: value };
    setMetadata(updated);
    triggerSave(stanzas, updated);
  };

  const handleExportPoem = (format: PoemExportFormat) => {
    try {
      const exported = serializePoemExport(
        {
          title: document.metadata.title,
          content: serializeStanzas(stanzas),
          poeticForm: metadata.poetic_form || 'Free Verse',
          rhymeScheme: metadata.rhyme_scheme,
          meter: metadata.meter,
          tags: document.metadata.tags,
          cipherMeta: metadata.cipher ?? null,
        },
        format
      );
      const blob = new Blob([exported.content], { type: exported.mimeType });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = exported.filename;
      a.click();
      URL.revokeObjectURL(url);
      setIsExportMenuOpen(false);
      showNotice(`Exported "${exported.filename}"`);
    } catch (err: any) {
      showNotice(err?.message || 'Failed to export poem', true);
    }
  };

  const handleImportPoemFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showNotice('Poem file exceeds maximum size limit (5 MB).', true);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const rawText = String(event.target?.result ?? '');
        const existingDocs = await api.listDocuments();
        const existingTitles = existingDocs.map(d => d.title);

        const imported = parsePoemImport(file.name, rawText, {
          existingTitles,
        });

        if (onCreateNewPoem) {
          await onCreateNewPoem(
            imported.title,
            imported.content,
            imported.metadataJson,
            imported.tags
          );
        } else {
          await api.createDocument(
            'poetry',
            imported.title,
            undefined,
            imported.content,
            imported.metadataJson,
            imported.tags
          );
        }
        showNotice(`Imported poem "${imported.title}" (.${imported.sourceFormat})`);
      } catch (err: any) {
        showNotice(err?.message || 'Failed to import poem file', true);
      } finally {
        if (importPoemInputRef.current) {
          importPoemInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
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

        {/* Right actions: Typography, Emotional Cipher, Import Poem, and Export Poem */}
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
            onClick={() => {
              setCipherInitialTab(undefined);
              setIsCipherModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-xs font-medium text-primary hover:bg-primary/20 transition-colors shadow-sm"
            title="Open The Emotional Cipher (Playful reversible text substitution)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Emotional Cipher</span>
          </button>

          <input
            ref={importPoemInputRef}
            type="file"
            accept=".txt,.md,.mcpoem"
            onChange={handleImportPoemFile}
            className="hidden"
          />

          <button
            onClick={() => importPoemInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
            title="Import poem from .txt, .md, or .mcpoem file as a new document"
          >
            <FileUp className="w-3.5 h-3.5 text-muted-foreground" />
            Import
          </button>

          {/* Export Dropdown (.txt, .md, .mcpoem) */}
          <div className="relative">
            <button
              onClick={() => setIsExportMenuOpen(prev => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
              title="Export poem as .txt, .md, or .mcpoem package"
            >
              <FileDown className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-60 rounded-xl border border-border bg-card shadow-xl py-1.5 z-30">
                <button
                  onClick={() => handleExportPoem('txt')}
                  className="w-full px-3.5 py-2 text-left text-xs hover:bg-muted/60 flex items-center justify-between transition-colors"
                >
                  <span className="font-medium text-foreground">Plain Text (`.txt`)</span>
                  <span className="text-[10px] text-muted-foreground">Stanzas only</span>
                </button>
                <button
                  onClick={() => handleExportPoem('md')}
                  className="w-full px-3.5 py-2 text-left text-xs hover:bg-muted/60 flex items-center justify-between transition-colors"
                >
                  <span className="font-medium text-foreground">Markdown (`.md`)</span>
                  <span className="text-[10px] text-muted-foreground">With frontmatter</span>
                </button>
                <button
                  onClick={() => handleExportPoem('mcpoem')}
                  className="w-full px-3.5 py-2 text-left text-xs hover:bg-muted/60 flex items-center justify-between transition-colors"
                >
                  <span className="font-medium text-primary">Poem Package (`.mcpoem`)</span>
                  <span className="text-[10px] text-muted-foreground">Full metadata</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Studio Import/Export Notice Banner */}
      {studioNotice && (
        <div
          className={cn(
            'px-8 py-2 text-xs font-medium flex items-center justify-between shrink-0 border-b',
            studioNotice.isError
              ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
          )}
        >
          <div className="flex items-center gap-2">
            {studioNotice.isError ? (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Check className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{studioNotice.text}</span>
          </div>
          <button
            onClick={() => setStudioNotice(null)}
            className="text-[11px] opacity-75 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

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
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {metadata.poetic_form && (
                <span className="text-xs font-sans uppercase tracking-widest text-muted-foreground">
                  {metadata.poetic_form}
                </span>
              )}
              {metadata.cipher && (metadata.cipher.key_id || metadata.cipher.dictionary_id) && (
                <button
                  onClick={() => {
                    setCipherInitialTab('decode');
                    setIsCipherModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 border border-primary/40 text-[11px] font-medium text-primary hover:bg-primary/25 transition-colors"
                  title={`Bound to Cipher Key: ${metadata.cipher.dictionary_name || metadata.cipher.key_id || metadata.cipher.dictionary_id}. Click to decode.`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>
                    Cipher Key:{' '}
                    {truncateDisplayLabel(
                      metadata.cipher.dictionary_name ||
                        metadata.cipher.key_id ||
                        metadata.cipher.dictionary_id,
                      40
                    )}
                  </span>
                  <span className="underline ml-1">Decode</span>
                </button>
              )}
            </div>
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

                  {/* Stanza Index Indicator & Per-Stanza Cipher Badge */}
                  <div className="text-xs font-mono text-muted-foreground/70 mb-2.5 select-none flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>STANZA {idx + 1}</span>
                      {metadata.cipher?.scope === 'per_stanza' &&
                        Array.isArray(metadata.cipher?.stanzas) &&
                        (metadata.cipher.stanzas[idx]?.mappings?.filter((m: any) => m.original?.trim()).length ?? 0) > 0 && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setCipherInitialTab('manual');
                              setCipherInitialStanza(idx);
                              setIsCipherModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-primary/15 border border-primary/30 text-primary font-mono hover:bg-primary/25 transition-colors"
                            title="Click to view/edit cipher rules for this stanza"
                          >
                            <Sliders className="w-2.5 h-2.5" />
                            Cipher: {metadata.cipher.stanzas[idx].mappings.filter((m: any) => m.original?.trim()).length} {metadata.cipher.stanzas[idx].mappings.filter((m: any) => m.original?.trim()).length === 1 ? 'rule' : 'rules'}
                          </button>
                        )}
                    </div>
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

      <EmotionalCipherModal
        isOpen={isCipherModalOpen}
        onClose={() => {
          setIsCipherModalOpen(false);
          setCipherInitialStanza(undefined);
        }}
        poemId={document.metadata.id}
        poemContent={serializeStanzas(stanzas)}
        poemTitle={document.metadata.title}
        poemMetadataJson={JSON.stringify(metadata)}
        initialTab={cipherInitialTab}
        initialStanzaIndex={cipherInitialStanza}
        onCreateNewPoem={onCreateNewPoem}
      />
    </div>
  );
};
