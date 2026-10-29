import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { DocumentMetadata } from '@/types';
import type { Plan } from '@/utils/thought';
import { api } from '@/services/api';
import {
  lorebookPublishPreview,
  lorebookPublishMarkdown,
  lorebookPublishPdf,
  coordinateLorebookPublication,
  type ChapterExcerptSelection,
  type PublicationPreview,
  type PublicationRequest,
  type PublishMarkdownResult,
} from '@/services/publication';
import { CommandQueue } from '@/services/autosave';
import {
  FileCheck,
  Share2,
  FileText,
  FileDown,
  Download,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  FolderOpen,
  X,
  Shield,
  Calendar,
  Layers,
  Info,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/utils/cn';

export interface LorebookPublicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  universeId: string;
  plan: Plan | null;
  documents: DocumentMetadata[];
  onFlushSave?: () => Promise<boolean>;
}

const DEFAULT_CATEGORIES = [
  'characters',
  'locations',
  'factions',
  'rules',
  'cultures',
  'artifacts',
  'events',
  'other',
];

export const LorebookPublicationModal: React.FC<LorebookPublicationModalProps> = ({
  isOpen,
  onClose,
  universeId,
  plan,
  documents,
  onFlushSave,
}) => {
  const universe = plan?.universes.find((u) => u.id === universeId);

  // Format selection
  const [format, setFormat] = useState<'markdown' | 'pdf'>('pdf');

  // Metadata
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [author, setAuthor] = useState('');
  const [includeUniverseDesc, setIncludeUniverseDesc] = useState(true);
  const [includeToc, setIncludeToc] = useState(true);

  // Category and entity selection
  const [selectedCategories, setSelectedCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set());
  const [includeProse, setIncludeProse] = useState(true);

  // Factions & Relationships
  const [includeFactions, setIncludeFactions] = useState(true);
  const [includeHierarchy, setIncludeHierarchy] = useState(true);
  const [includeHolders, setIncludeHolders] = useState(true);
  const [includeRelationships, setIncludeRelationships] = useState(true);

  // Timeline & Spoilers
  const [includeTimeline, setIncludeTimeline] = useState(true);
  const [spoilerMilestoneId, setSpoilerMilestoneId] = useState<string>('');
  const [includeContinuities, setIncludeContinuities] = useState(false);

  // Excerpts
  const [selectedExcerpts, setSelectedExcerpts] = useState<ChapterExcerptSelection[]>([]);

  // Destination & Status
  const [destinationPath, setDestinationPath] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<PublicationPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // PDF Glyph approval
  const [glyphApproved, setGlyphApproved] = useState(false);

  // Publication execution
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<
    (PublishMarkdownResult & { page_count?: number }) | null
  >(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Expanded categories accordion in UI
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['characters']));

  // All lore documents for this universe
  const universeDocs = useMemo(() => {
    return documents.filter((d) => {
      if (d.doc_type !== 'lorebook') return false;
      try {
        const meta = d.metadata_json ? JSON.parse(d.metadata_json) : {};
        return meta.universe_id === universeId && meta.entry_type !== 'chapter';
      } catch {
        return false;
      }
    });
  }, [documents, universeId]);

  // All chapters for excerpts
  const universeChapters = useMemo(() => {
    return documents.filter((d) => {
      if (d.doc_type !== 'lorebook') return false;
      try {
        const meta = d.metadata_json ? JSON.parse(d.metadata_json) : {};
        return meta.universe_id === universeId && meta.entry_type === 'chapter';
      } catch {
        return false;
      }
    });
  }, [documents, universeId]);

  // Timeline milestones
  const universeMilestones = useMemo(() => {
    return plan?.nodes.filter((n) => n.universe_id === universeId && !n.archived) || [];
  }, [plan?.nodes, universeId]);

  // Initialize fields on open
  useEffect(() => {
    if (isOpen && universe) {
      setTitle(`${universe.name} Encyclopedia`);
      setSubtitle('Canonical Worldbuilding Reference');
      setAuthor('');
      setSelectedCategories([...DEFAULT_CATEGORIES]);
      // Default: select all active entities
      setSelectedEntityIds(new Set(universeDocs.map((d) => d.id)));
      setDestinationPath('');
      setPublishResult(null);
      setPublishError(null);
      setGlyphApproved(false);
    }
  }, [isOpen, universe?.id]);

  // Group entities by category
  const docsByCategory = useMemo(() => {
    const map = new Map<string, DocumentMetadata[]>();
    for (const cat of DEFAULT_CATEGORIES) {
      map.set(cat, []);
    }
    for (const doc of universeDocs) {
      let entryType = 'other';
      try {
        const meta = doc.metadata_json ? JSON.parse(doc.metadata_json) : {};
        entryType = meta.entry_type || 'other';
      } catch {}

      let catKey = 'other';
      if (entryType === 'character') catKey = 'characters';
      else if (entryType === 'location') catKey = 'locations';
      else if (entryType === 'faction') catKey = 'factions';
      else if (entryType === 'rule' || entryType === 'concept') catKey = 'rules';
      else if (entryType === 'culture') catKey = 'cultures';
      else if (entryType === 'artifact') catKey = 'artifacts';
      else if (entryType === 'event') catKey = 'events';

      const list = map.get(catKey) || [];
      list.push(doc);
      map.set(catKey, list);
    }
    return map;
  }, [universeDocs]);

  // Construct current publication request
  const buildCurrentRequest = useCallback((): PublicationRequest => {
    return {
      universe_id: universeId,
      title: title.trim() || undefined,
      subtitle: subtitle.trim() || undefined,
      author: author.trim() || undefined,
      include_universe_description: includeUniverseDesc,
      include_table_of_contents: includeToc,
      selected_categories: selectedCategories,
      selected_entity_ids: Array.from(selectedEntityIds),
      include_entity_prose: includeProse,
      include_factions: includeFactions,
      include_faction_hierarchy: includeHierarchy,
      include_faction_holders: includeHolders,
      include_relationships: includeRelationships,
      include_timeline: includeTimeline,
      selected_milestone_ids: undefined,
      include_alternate_continuities: includeContinuities,
      selected_excerpts: selectedExcerpts,
      filter_spoilers_after_milestone_id: spoilerMilestoneId || undefined,
      include_drafts: false,
      include_speculative: false,
      include_archived: false,
    };
  }, [
    universeId,
    title,
    subtitle,
    author,
    includeUniverseDesc,
    includeToc,
    selectedCategories,
    selectedEntityIds,
    includeProse,
    includeFactions,
    includeHierarchy,
    includeHolders,
    includeRelationships,
    includeTimeline,
    includeContinuities,
    selectedExcerpts,
    spoilerMilestoneId,
  ]);

  // Refresh preview
  const refreshPreview = useCallback(async () => {
    if (!universeId) return;
    setIsPreviewLoading(true);
    setPreviewError(null);
    try {
      const req = buildCurrentRequest();
      const prev = await lorebookPublishPreview(req);
      setPreview(prev);
    } catch (err: any) {
      setPreviewError(err?.message || 'Failed to generate publication preview.');
    } finally {
      setIsPreviewLoading(false);
    }
  }, [universeId, buildCurrentRequest]);

  // Debounced preview update on configuration change
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      refreshPreview();
    }, 300);
    return () => clearTimeout(timer);
  }, [isOpen, refreshPreview]);

  // Check for unsupported glyph warnings in preview
  const glyphWarnings = useMemo(() => {
    return preview?.warnings.filter((w) => w.code === 'unsupported_glyphs') || [];
  }, [preview?.warnings]);

  const hasGlyphWarnings = glyphWarnings.length > 0;

  // Toggle category
  const handleToggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  // Toggle entity
  const handleToggleEntity = (docId: string) => {
    setSelectedEntityIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  // Select/Deselect all in category
  const handleSelectAllInCategory = (cat: string, select: boolean) => {
    const docs = docsByCategory.get(cat) || [];
    setSelectedEntityIds((prev) => {
      const next = new Set(prev);
      for (const d of docs) {
        if (select) next.add(d.id);
        else next.delete(d.id);
      }
      return next;
    });
  };

  const handleToggleCategoryAccordion = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Browse destination path
  const handleBrowseDestination = async () => {
    const ext = format === 'pdf' ? 'pdf' : 'md';
    const filterName = format === 'pdf' ? 'PDF Document (*.pdf)' : 'Markdown File (*.md)';
    const safeTitle = (title.trim() || universe?.name || 'Encyclopedia').replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );

    try {
      const path = await api.pickSaveDialog({
        title: `Save ${format.toUpperCase()} Publication`,
        suggestedName: `${safeTitle}.${ext}`,
        filterName,
        filterExt: ext,
      });
      if (path) {
        setDestinationPath(path.endsWith(`.${ext}`) ? path : `${path}.${ext}`);
      }
    } catch {
      // Browser fallback or dialog canceled
    }
  };

  // Execute publication
  const handleExecutePublish = async () => {
    if (!preview) {
      setPublishError('Publication preview not ready.');
      return;
    }

    let dest = destinationPath.trim();
    const ext = format === 'pdf' ? '.pdf' : '.md';
    if (!dest) {
      setPublishError(`Please specify a destination ${ext} file path.`);
      return;
    }
    if (!dest.toLowerCase().endsWith(ext)) {
      dest = `${dest}${ext}`;
      setDestinationPath(dest);
    }

    if (format === 'pdf' && hasGlyphWarnings && !glyphApproved) {
      setPublishError(
        'Informed confirmation required: Please approve character substitution for unsupported glyphs before exporting PDF.'
      );
      return;
    }

    setIsPublishing(true);
    setPublishError(null);
    setPublishResult(null);

    const queue = new CommandQueue();
    const flushFn = onFlushSave || (async () => true);

    try {
      const req = buildCurrentRequest();
      if (format === 'markdown') {
        const res = await coordinateLorebookPublication(flushFn, queue, async () => {
          return await lorebookPublishMarkdown({
            request: req,
            destination_path: dest,
            expected_source_fingerprint: preview.source_fingerprint,
          });
        });
        setPublishResult(res);
      } else {
        // Trusted backend PDF renderer: pass pdf_bytes: undefined to ensure strict allowlist
        const res = await coordinateLorebookPublication(flushFn, queue, async () => {
          return await lorebookPublishPdf({
            request: req,
            destination_path: dest,
            expected_source_fingerprint: preview.source_fingerprint,
            pdf_bytes: undefined,
          });
        });
        setPublishResult(res);
      }
    } catch (err: any) {
      setPublishError(err?.message || 'Publication failed.');
    } finally {
      setIsPublishing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col w-full max-w-5xl max-h-[92vh] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-foreground">
                Publish Lorebook Encyclopedia
              </h2>
              <p className="text-xs text-muted-foreground">
                Generate a reader-facing, privacy-filtered Markdown or PDF encyclopedia.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* DISTINCTION NOTICE */}
        <div className="px-6 py-2.5 bg-primary/5 border-b border-primary/20 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-primary shrink-0" />
            <span>
              <strong>Reader-Facing Publication:</strong> Internal document UUIDs, House IDs, private author notes, and editor status fields are stripped. <em>This output cannot be imported back as a Universe backup.</em>
            </span>
          </div>
        </div>

        {/* BODY SPLIT: CONFIGURATION (LEFT) & LIVE PREVIEW (RIGHT) */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-border">
          
          {/* =============================================================== */}
          {/* LEFT COLUMN: PUBLICATION CONFIGURATION (7 COLS) */}
          {/* =============================================================== */}
          <div className="md:col-span-7 overflow-y-auto p-6 space-y-6 max-h-[calc(92vh-170px)]">
            
            {/* Format Selection */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-2">
                1. Publication Format
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormat('pdf')}
                  className={cn(
                    'p-3 rounded-xl border text-left transition-all flex items-center gap-3',
                    format === 'pdf'
                      ? 'border-primary bg-primary/10 text-foreground shadow-sm'
                      : 'border-border/80 bg-background/50 text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                >
                  <FileDown className="w-5 h-5 text-primary shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-foreground">PDF Document (.pdf)</div>
                    <div className="text-[11px] text-muted-foreground">Formatted book with TOC &amp; pagination</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat('markdown')}
                  className={cn(
                    'p-3 rounded-xl border text-left transition-all flex items-center gap-3',
                    format === 'markdown'
                      ? 'border-primary bg-primary/10 text-foreground shadow-sm'
                      : 'border-border/80 bg-background/50 text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                >
                  <FileText className="w-5 h-5 text-primary shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-foreground">Markdown File (.md)</div>
                    <div className="text-[11px] text-muted-foreground">Standard portable plain-text encyclopedia</div>
                  </div>
                </button>
              </div>
            </div>

            {/* General Info */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-foreground">
                2. Document Information
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Solaris Encyclopedia"
                    className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Subtitle</label>
                  <input
                    type="text"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="A Guide to the Golden Realm"
                    className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Author Attribution</label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Chronicler Elian"
                    className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex items-center gap-4 pt-5">
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeUniverseDesc}
                      onChange={(e) => setIncludeUniverseDesc(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span>Include Intro</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeToc}
                      onChange={(e) => setIncludeToc(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span>Table of Contents</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Categories & Entity Picker */}
            <div className="border border-border/80 rounded-xl p-4 bg-card/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  3. Categories &amp; Entities ({selectedEntityIds.size} of {universeDocs.length} selected)
                </span>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeProse}
                    onChange={(e) => setIncludeProse(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Include Prose</span>
                </label>
              </div>

              {/* Accordion Categories */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {DEFAULT_CATEGORIES.map((cat) => {
                  const docs = docsByCategory.get(cat) || [];
                  const isCatSelected = selectedCategories.includes(cat);
                  const isExpanded = expandedCategories.has(cat);
                  const selectedCount = docs.filter((d) => selectedEntityIds.has(d.id)).length;

                  return (
                    <div key={cat} className="border border-border/50 rounded-lg bg-background/50 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isCatSelected}
                            onChange={() => handleToggleCategory(cat)}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                          <span className="font-medium capitalize text-foreground">{cat}</span>
                          <span className="text-[10px] text-muted-foreground">
                            ({selectedCount}/{docs.length})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {docs.length > 0 && isCatSelected && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSelectAllInCategory(cat, true)}
                                className="text-[10px] text-primary hover:underline"
                              >
                                All
                              </button>
                              <span className="text-muted-foreground text-[10px]">•</span>
                              <button
                                type="button"
                                onClick={() => handleSelectAllInCategory(cat, false)}
                                className="text-[10px] text-muted-foreground hover:underline"
                              >
                                None
                              </button>
                            </>
                          )}
                          {docs.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleToggleCategoryAccordion(cat)}
                              className="p-1 text-muted-foreground hover:text-foreground"
                            >
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded entities */}
                      {isExpanded && isCatSelected && docs.length > 0 && (
                        <div className="px-3 py-2 bg-muted/10 border-t border-border/30 space-y-1.5 pl-7">
                          {docs.map((doc) => (
                            <label key={doc.id} className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedEntityIds.has(doc.id)}
                                onChange={() => handleToggleEntity(doc.id)}
                                className="rounded border-border text-primary focus:ring-primary"
                              />
                              <span className="truncate">{doc.title}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Factions, Relationships & Spoilers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Factions & Relationships */}
              <div className="border border-border/80 rounded-xl p-3 bg-card/60 space-y-2 text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  Structures &amp; Connections
                </span>
                <label className="flex items-center gap-2 text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeFactions}
                    onChange={(e) => setIncludeFactions(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Include Faction Details</span>
                </label>
                <label className="flex items-center gap-2 text-muted-foreground cursor-pointer pl-4">
                  <input
                    type="checkbox"
                    disabled={!includeFactions}
                    checked={includeHierarchy}
                    onChange={(e) => setIncludeHierarchy(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Organizational Hierarchy</span>
                </label>
                <label className="flex items-center gap-2 text-muted-foreground cursor-pointer pl-4">
                  <input
                    type="checkbox"
                    disabled={!includeFactions}
                    checked={includeHolders}
                    onChange={(e) => setIncludeHolders(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Position Holders</span>
                </label>
                <label className="flex items-center gap-2 text-muted-foreground cursor-pointer pt-1 border-t border-border/40">
                  <input
                    type="checkbox"
                    checked={includeRelationships}
                    onChange={(e) => setIncludeRelationships(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Include Relationships</span>
                </label>
              </div>

              {/* Timeline & Spoilers */}
              <div className="border border-border/80 rounded-xl p-3 bg-card/60 space-y-2 text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  Timeline &amp; Spoiler Safety
                </span>
                <label className="flex items-center gap-2 text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeTimeline}
                    onChange={(e) => setIncludeTimeline(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Include Historical Timeline</span>
                </label>
                <div className="pt-1">
                  <label className="block text-[10px] text-muted-foreground mb-1">
                    Spoiler Cutoff Milestone:
                  </label>
                  <select
                    disabled={!includeTimeline}
                    value={spoilerMilestoneId}
                    onChange={(e) => setSpoilerMilestoneId(e.target.value)}
                    className="w-full px-2 py-1 text-[11px] bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Include All Milestones (No Cutoff)</option>
                    {universeMilestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        Cut off after: {m.title}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-muted-foreground cursor-pointer pt-1 border-t border-border/40">
                  <input
                    type="checkbox"
                    checked={includeContinuities}
                    onChange={(e) => setIncludeContinuities(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Include Alternate Continuities</span>
                </label>
              </div>
            </div>

            {universeChapters.length > 0 && <details className="rounded-xl border border-border p-3 text-xs"><summary className="cursor-pointer font-medium">Chapter citations (titles only)</summary><p className="text-muted-foreground my-2">Choose chapters whose titles and Book names may appear in eligible milestone chronicles. This does not publish their prose.</p><div className="space-y-1 max-h-40 overflow-y-auto">{universeChapters.map(chapter => <label key={chapter.id} className="flex gap-2 items-center"><input type="checkbox" checked={selectedEntityIds.has(chapter.id)} onChange={e => setSelectedEntityIds(current => { const next = new Set(current); if (e.target.checked) next.add(chapter.id); else next.delete(chapter.id); return next; })}/>{chapter.title}</label>)}</div></details>}

            {/* Chapter Excerpts (Optional) */}
            {universeChapters.length > 0 && (
              <div className="border border-border/80 rounded-xl p-3 bg-card/60 space-y-2 text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  Chapter Prose Excerpts ({selectedExcerpts.length} included)
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Select chapters and enter the passages you want to publish. Eligible milestone chronicles will link to these selected excerpts; unselected chapter titles and manuscript text are omitted.
                </p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {universeChapters.map((ch) => {
                    const isChecked = selectedExcerpts.some((ex) => ex.chapter_id === ch.id);
                    return (
                      <label key={ch.id} className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedExcerpts((prev) => [
                                ...prev,
                                {
                                  chapter_id: ch.id,
                                  heading: `${ch.title} Excerpt`,
                                  excerpt_text: '',
                                },
                              ]);
                            } else {
                              setSelectedExcerpts((prev) => prev.filter((ex) => ex.chapter_id !== ch.id));
                            }
                          }}
                          className="rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="truncate">{ch.title}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedExcerpts.length > 0 && <div className="space-y-3">{selectedExcerpts.map(excerpt => <label key={excerpt.chapter_id} className="block text-xs space-y-1"><span>Approved passage from {universeChapters.find(c => c.id === excerpt.chapter_id)?.title || 'Selected Chapter'}</span><textarea className="help-input w-full block" rows={4} value={excerpt.excerpt_text} onChange={e => setSelectedExcerpts(current => current.map(item => item.chapter_id === excerpt.chapter_id ? { ...item, excerpt_text: e.target.value } : item))} placeholder="Enter only the passage you intend to publish. Empty passages are omitted."/></label>)}</div>}

            {/* Destination Picker */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                4. Destination File Path ({format === 'pdf' ? '.pdf' : '.md'})
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={destinationPath}
                  onChange={(e) => setDestinationPath(e.target.value)}
                  placeholder={format === 'pdf' ? 'C:/Exports/Encyclopedia.pdf' : 'C:/Exports/Encyclopedia.md'}
                  className="flex-1 px-3 py-2 text-xs bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                <button
                  type="button"
                  onClick={handleBrowseDestination}
                  className="px-3.5 py-2 rounded-xl border border-border text-xs font-medium hover:bg-muted/40 transition-colors flex items-center gap-1.5"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Browse...
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Will not overwrite existing files. Destination must be a new path.
              </p>
            </div>
          </div>

          {/* =============================================================== */}
          {/* RIGHT COLUMN: LIVE PREVIEW, METRICS, GLYPH SAFETY (5 COLS) */}
          {/* =============================================================== */}
          <div className="md:col-span-5 flex flex-col p-6 space-y-4 max-h-[calc(92vh-170px)] overflow-y-auto bg-muted/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-primary" />
                Live Publication Preview
              </span>
              <button
                type="button"
                disabled={isPreviewLoading}
                onClick={refreshPreview}
                className="text-xs text-primary hover:underline flex items-center gap-1 font-medium disabled:opacity-50"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', isPreviewLoading && 'animate-spin')} />
                Refresh
              </button>
            </div>

            {/* Metrics Grid */}
            {preview && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-card border border-border/80">
                  <span className="text-[10px] text-muted-foreground block">Entries</span>
                  <span className="font-semibold text-sm text-foreground">{preview.entry_count}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-card border border-border/80">
                  <span className="text-[10px] text-muted-foreground block">Word Count</span>
                  <span className="font-semibold text-sm text-foreground">~{preview.word_count} words</span>
                </div>
                <div className="p-2.5 rounded-xl bg-card border border-border/80">
                  <span className="text-[10px] text-muted-foreground block">Relationships</span>
                  <span className="font-semibold text-sm text-foreground">{preview.relationship_count}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-card border border-border/80">
                  <span className="text-[10px] text-muted-foreground block">Milestones</span>
                  <span className="font-semibold text-sm text-foreground">{preview.milestone_count}</span>
                </div>
              </div>
            )}

            {/* GLYPH SAFETY BANNER (WHEN PDF FORMAT SELECTED) */}
            {format === 'pdf' && hasGlyphWarnings && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-2">
                <div className="flex items-start gap-2 font-semibold text-amber-400">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>Standard PDF Font Unsupported Glyphs</div>
                </div>
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  The standard PDF renderer font does not support glyphs from CJK or complex scripts present in your selection. The renderer will substitute <code>[?]</code> for these characters.
                </p>
                <div className="space-y-1 max-h-24 overflow-y-auto text-[10px] font-mono bg-black/20 p-2 rounded">
                  {glyphWarnings.map((w, idx) => (
                    <div key={idx}>{w.message}</div>
                  ))}
                </div>
                <label className="flex items-center gap-2 pt-1 text-xs font-medium text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={glyphApproved}
                    onChange={(e) => setGlyphApproved(e.target.checked)}
                    className="rounded border-border text-amber-400 focus:ring-amber-400"
                  />
                  <span>I approve character substitution [?] for this export</span>
                </label>
              </div>
            )}

            {/* Table of Contents Preview */}
            <div className="flex-1 min-h-[140px] border border-border/80 rounded-xl p-3 bg-card/60 overflow-y-auto space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground block uppercase tracking-wider">
                Table of Contents Preview
              </span>
              {preview?.table_of_contents && preview.table_of_contents.length > 0 ? (
                <div className="space-y-1 text-xs">
                  {preview.table_of_contents.map((item, idx) => (
                    <div key={idx} className="space-y-0.5">
                      <div className="font-medium text-foreground">• {item.title}</div>
                      {item.children && (
                        <div className="pl-4 space-y-0.5 text-[11px] text-muted-foreground">
                          {item.children.map((child, cIdx) => (
                            <div key={cIdx}>- {child.title}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Select at least one category and entity to preview the Table of Contents.
                </p>
              )}
            </div>

            {/* Diagnostics Warnings if non-glyph */}
            {preview && preview.warnings.some((w) => w.code !== 'unsupported_glyphs') && (
              <div className="p-2.5 rounded-xl bg-muted/40 border border-border text-xs space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Notices &amp; Pruned Elements
                </span>
                {preview.warnings
                  .filter((w) => w.code !== 'unsupported_glyphs')
                  .map((w, idx) => (
                    <div key={idx} className="text-[11px] text-muted-foreground">
                      • {w.message}
                    </div>
                  ))}
              </div>
            )}

            {/* Preview Error Feedback */}
            {previewError && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{previewError}</span>
              </div>
            )}

            {/* Error Feedback */}
            {publishError && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{publishError}</span>
              </div>
            )}

            {/* Success Feedback */}
            {publishResult && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Encyclopedia Published Successfully!</span>
                </div>
                <div className="text-[11px] text-muted-foreground break-all">
                  File: <span className="font-mono">{publishResult.destination_path}</span>
                </div>
                <div className="flex gap-4 text-[11px] text-muted-foreground">
                  <span>Bytes: {publishResult.bytes_written}</span>
                  {publishResult.page_count !== undefined && (
                    <span>Pages: {publishResult.page_count}</span>
                  )}
                  <span>Words: ~{publishResult.word_count}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
          <div className="text-xs text-muted-foreground">
            Snapshot consistency verified via SHA-256 fingerprint coordination.
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border text-xs font-medium hover:bg-muted/40 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              disabled={
                isPublishing ||
                !preview ||
                preview.entry_count === 0 ||
                !destinationPath ||
                (format === 'pdf' && hasGlyphWarnings && !glyphApproved)
              }
              onClick={handleExecutePublish}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-gold-hover transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              {isPublishing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Flushing &amp; Publishing...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Publish {format === 'pdf' ? 'PDF' : 'Markdown'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
