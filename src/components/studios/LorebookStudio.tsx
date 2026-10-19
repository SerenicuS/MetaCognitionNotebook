import React, { useState, useEffect, useCallback } from 'react';
import type {
  DocumentDetail,
  DocumentMetadata,
  DocumentType,
  LorebookMetadata,
  LorebookEntryType,
  CanonStatus,
  LorebookAttribute,
  SaveStatus,
  LoreCategory,
} from '@/types';
import type { Plan, Thought } from '@/utils/thought';
import { api } from '@/services/api';
import { resolveEntityUniverse } from '@/utils/universe';
import { WebOfThought } from './WebOfThought';
import { UniverseSelector } from './lorebook/UniverseSelector';
import { UniverseDashboard } from './lorebook/UniverseDashboard';
import { EntityGuidedFields } from './lorebook/EntityGuidedFields';
import { EntityRelationshipsCard } from './lorebook/EntityRelationshipsCard';
import {
  FileDown,
  Compass,
  Plus,
  Trash2,
  Shield,
  MapPin,
  Users,
  Calendar,
  Sparkles,
  Sword,
  Sliders,
  Eye,
  Edit3,
  BookOpen,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface LorebookStudioProps {
  document?: DocumentDetail | null;
  allDocuments?: DocumentMetadata[];
  onSave: (content: string, metadataJson?: string) => Promise<void> | void;
  saveStatus: SaveStatus;
  notebookKey?: string;
  onSaveThought?: (
    expected: () => number,
    plan: Plan,
    acknowledge: (result: Thought) => void
  ) => Promise<boolean>;
  onOpenDocument?: (id: string) => void;
  onCreateDocument?: (
    docType: DocumentType,
    title: string,
    initialContent?: string,
    metadataJson?: string,
    tags?: string[]
  ) => Promise<void>;
  onSaveDocument?: (
    id: string,
    content: string,
    title?: string,
    tags?: string[],
    metadataJson?: string
  ) => Promise<void>;
  onOpenCreateModal?: (options?: {
    universeId?: string;
    entryType?: LorebookEntryType | 'book';
    action?: 'create_universe' | 'add_to_universe';
  }) => void;
  plan?: Plan | null;
}

const ENTRY_TYPE_CONFIG: Record<
  LorebookEntryType,
  { label: string; icon: React.ElementType; color: string }
> = {
  character: { label: 'Character', icon: Users, color: 'text-blue-400' },
  location: { label: 'Location', icon: MapPin, color: 'text-emerald-400' },
  faction: { label: 'Faction / Nation', icon: Shield, color: 'text-amber-400' },
  event: { label: 'Event', icon: Calendar, color: 'text-rose-400' },
  concept: { label: 'Rule / System', icon: Sparkles, color: 'text-violet-400' },
  artifact: { label: 'Artifact', icon: Sword, color: 'text-cyan-400' },
  chapter: { label: 'Chapter', icon: BookOpen, color: 'text-amber-500' },
  rule: { label: 'Rule / System', icon: Sparkles, color: 'text-violet-400' },
  culture: { label: 'Culture / History', icon: Compass, color: 'text-orange-400' },
  other: { label: 'Lore Entry', icon: Compass, color: 'text-muted-foreground' },
};

const CANON_STATUS_CONFIG: Record<
  CanonStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  canon: {
    label: 'Canon',
    bg: 'bg-emerald-950/30',
    text: 'text-emerald-400',
    border: 'border-emerald-700/60',
  },
  draft: {
    label: 'Draft',
    bg: 'bg-amber-950/30',
    text: 'text-amber-400',
    border: 'border-amber-700/60',
  },
  speculative: {
    label: 'Speculative',
    bg: 'bg-violet-950/30',
    text: 'text-violet-400',
    border: 'border-violet-700/60',
  },
};

export const LorebookStudio: React.FC<LorebookStudioProps> = ({
  document,
  allDocuments = [],
  onSave,
  onSaveThought,
  notebookKey,
  onOpenDocument,
  onCreateDocument,
  onSaveDocument,
  onOpenCreateModal,
  plan: propPlan,
}) => {
  // Plan state
  const [plan, setPlan] = useState<Plan | null>(propPlan || null);
  const planRef = React.useRef<Plan | null>(plan);

  useEffect(() => {
    if (propPlan) {
      setPlan(propPlan);
      planRef.current = propPlan;
    }
  }, [propPlan]);

  // Active Universe tracking
  const [activeUniverseId, setActiveUniverseId] = useState<string | null>(() => {
    return localStorage.getItem('mc_active_universe_id');
  });

  // Mode: 'document' (editing opened lore doc) or 'universe' (universe dashboard/selection)
  const [viewMode, setViewMode] = useState<'document' | 'universe'>(() =>
    document ? 'document' : 'universe'
  );

  // Document Editing state
  const [content, setContent] = useState<string>(document ? document.content : '');
  const [activeTab, setActiveTab] = useState<'write' | 'preview' | 'web'>(() =>
    document?.metadata.metadata_json?.includes('"_web_of_thought"') ? 'web' : 'write'
  );
  const [metadata, setMetadata] = useState<LorebookMetadata>(() => {
    if (!document) {
      return {
        universe: 'Unassigned Cosmos',
        entry_type: 'other',
        canon_status: 'canon',
        attributes: [],
      };
    }
    try {
      const parsed = document.metadata.metadata_json
        ? JSON.parse(document.metadata.metadata_json)
        : {};
      return {
        ...parsed,
        universe: parsed.universe || 'Unassigned Cosmos',
        book: parsed.book || '',
        chapter: parsed.chapter || '',
        entry_type: parsed.entry_type || 'other',
        canon_status: parsed.canon_status || 'canon',
        attributes: parsed.attributes || [],
      };
    } catch {
      return {
        universe: 'Unassigned Cosmos',
        entry_type: 'other',
        canon_status: 'canon',
        attributes: [],
      };
    }
  });

  // Load planning desk
  const fetchPlan = useCallback(async () => {
    try {
      const result = await api.thoughtGet();
      setPlan(result.plan);
    } catch (err) {
      console.error('Failed to load Web of Thought plan:', err);
    }
  }, []);

  useEffect(() => {
    void fetchPlan();
  }, [fetchPlan]);

  // Synchronize when document changes
  useEffect(() => {
    if (document) {
      setContent(document.content);
      setViewMode('document');
      try {
        const parsed = document.metadata.metadata_json
          ? JSON.parse(document.metadata.metadata_json)
          : {};
        const meta: LorebookMetadata = {
          ...parsed,
          universe: parsed.universe || 'Unassigned Cosmos',
          book: parsed.book || '',
          chapter: parsed.chapter || '',
          entry_type: parsed.entry_type || 'other',
          canon_status: parsed.canon_status || 'canon',
          attributes: parsed.attributes || [],
        };
        setMetadata(meta);

        // Update active universe if resolved
        if (plan) {
          const res = resolveEntityUniverse(document.metadata, plan.universes);
          if (res.universeId) {
            setActiveUniverseId(res.universeId);
            localStorage.setItem('mc_active_universe_id', res.universeId);
          }
        }
      } catch {
        setMetadata({
          universe: 'Unassigned Cosmos',
          entry_type: 'other',
          canon_status: 'canon',
          attributes: [],
        });
      }
    } else {
      setViewMode('universe');
    }
  }, [document?.metadata.id, plan]);

  // If no active universe is set but universes exist, set to first universe
  useEffect(() => {
    if (plan && plan.universes.length > 0 && !activeUniverseId) {
      const firstId = plan.universes[0].id;
      setActiveUniverseId(firstId);
      localStorage.setItem('mc_active_universe_id', firstId);
    }
  }, [plan, activeUniverseId]);

  // Wrapped save for plan to sync local state
  const handleSaveThought = async (
    expected: () => number,
    nextPlan: Plan,
    acknowledge: (result: Thought) => void
  ): Promise<boolean> => {
    if (!onSaveThought) return false;
    planRef.current = nextPlan;
    const ok = await onSaveThought(
      () => (planRef.current ? planRef.current.revision : expected()),
      nextPlan,
      (res) => {
        if (res.plan) {
          planRef.current = res.plan;
          setPlan(res.plan);
        }
        acknowledge(res);
      }
    );
    if (ok) {
      setPlan(nextPlan);
      planRef.current = nextPlan;
    }
    return ok;
  };

  const triggerSave = useCallback(
    (newContent: string, newMeta: LorebookMetadata) => {
      const metaJson = JSON.stringify(newMeta);
      onSave(newContent, metaJson);
    },
    [onSave]
  );

  const handleContentChange = (text: string) => {
    setContent(text);
    triggerSave(text, metadata);
  };

  const handleMetaFieldChange = <K extends keyof LorebookMetadata>(
    field: K,
    value: LorebookMetadata[K]
  ) => {
    const updated = { ...metadata, [field]: value };
    setMetadata(updated);
    triggerSave(content, updated);
  };

  const handleGuidedFieldsChange = (patch: Partial<LorebookMetadata>) => {
    const updated = { ...metadata, ...patch };
    setMetadata(updated);
    triggerSave(content, updated);
  };

  const handleAddAttribute = () => {
    const newAttr: LorebookAttribute = {
      id: Math.random().toString(36).substring(2, 9),
      key: '',
      value: '',
    };
    const updatedAttrs = [...(metadata.attributes || []), newAttr];
    handleMetaFieldChange('attributes', updatedAttrs);
  };

  const handleUpdateAttribute = (id: string, key: string, value: string) => {
    const updatedAttrs = (metadata.attributes || []).map((a) =>
      a.id === id ? { ...a, key, value } : a
    );
    handleMetaFieldChange('attributes', updatedAttrs);
  };

  const handleDeleteAttribute = (id: string) => {
    const updatedAttrs = (metadata.attributes || []).filter((a) => a.id !== id);
    handleMetaFieldChange('attributes', updatedAttrs);
  };

  const handleExportMarkdown = () => {
    if (!document) return;
    let md = `# ${document.metadata.title}\n\n`;
    md += `**Universe:** ${metadata.universe || 'None'}\n`;
    md += `**Entry Type:** ${metadata.entry_type}\n`;
    md += `**Canon Status:** ${metadata.canon_status}\n\n`;

    if (metadata.attributes && metadata.attributes.length > 0) {
      md += `### Attributes\n\n`;
      metadata.attributes.forEach((a) => {
        if (a.key.trim()) {
          md += `- **${a.key}:** ${a.value}\n`;
        }
      });
      md += `\n`;
    }

    md += `---\n\n${content}\n`;

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document.metadata.title.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Direct entity creation within active universe
  const handleCreateEntity = async (category: LoreCategory, defaultTitle?: string) => {
    if (!onCreateDocument || !plan) return;
    const currentUniverse = plan.universes.find((u) => u.id === activeUniverseId) || plan.universes[0];
    if (!currentUniverse) {
      // Switch to universe selector
      setActiveUniverseId(null);
      setViewMode('universe');
      return;
    }

    let defaultEntryType: LorebookEntryType = 'character';
    switch (category) {
      case 'characters':
        defaultEntryType = 'character';
        break;
      case 'locations':
        defaultEntryType = 'location';
        break;
      case 'factions':
        defaultEntryType = 'faction';
        break;
      case 'rules':
        defaultEntryType = 'concept';
        break;
      case 'cultures':
        defaultEntryType = 'culture';
        break;
      case 'artifacts':
        defaultEntryType = 'artifact';
        break;
      case 'events':
        defaultEntryType = 'event';
        break;
      default:
        defaultEntryType = 'other';
        break;
    }

    const title =
      defaultTitle || `Untitled ${category.charAt(0).toUpperCase() + category.slice(1, -1)}`;
    const initialMetadata: LorebookMetadata = {
      universe: currentUniverse.name,
      universe_id: currentUniverse.id,
      entry_type: defaultEntryType,
      canon_status: 'canon',
      attributes: [],
    };

    const initialContent = `### Overview\n\nProvide the canonical context for this ${defaultEntryType} in ${currentUniverse.name}.\n\n### Historical Lore\n\n`;

    await onCreateDocument(
      'lorebook',
      title,
      initialContent,
      JSON.stringify(initialMetadata),
      []
    );
  };

  const handleCreateChapter = async (bookId: string, chapterTitle: string, order: number) => {
    if (!onCreateDocument || !plan) return;
    const currentUniverse = plan.universes.find((u) => u.id === activeUniverseId) || plan.universes[0];
    const book = plan.books.find((b) => b.id === bookId);

    const chapterMeta: LorebookMetadata = {
      universe: currentUniverse?.name || 'Cosmos',
      universe_id: currentUniverse?.id,
      book: book?.name || '',
      book_id: bookId,
      chapter: chapterTitle,
      chapter_order: order,
      entry_type: 'chapter',
      canon_status: 'canon',
      attributes: [],
    };

    await onCreateDocument(
      'lorebook',
      chapterTitle,
      `# ${chapterTitle}\n\n`,
      JSON.stringify(chapterMeta),
      []
    );
  };

  // Web of Thought planning desk tab
  if (
    activeTab === 'web' ||
    (document && document.metadata.metadata_json?.includes('"_web_of_thought"'))
  ) {
    if (onSaveThought) {
      return (
        <WebOfThought
          notebookKey={notebookKey}
          onSave={onSaveThought}
          onBack={() => setActiveTab('write')}
          catalogDocument={!!document?.metadata.metadata_json?.includes('"_web_of_thought"')}
        />
      );
    }
  }

  // ==========================================================
  // UNIVERSE DASHBOARD & UNIVERSE SELECTOR VIEWS
  // ==========================================================
  if (viewMode === 'universe' || !document) {
    if (!activeUniverseId || !plan?.universes.some((u) => u.id === activeUniverseId)) {
      return (
        <UniverseSelector
          plan={plan}
          documents={allDocuments}
          onSelectUniverse={(uid) => {
            setActiveUniverseId(uid);
            localStorage.setItem('mc_active_universe_id', uid);
          }}
          onSaveThought={handleSaveThought}
          onOpenCreateModal={onOpenCreateModal}
          onOpenUnassigned={() => {
            // Pick first unassigned doc if available
            const unassigned = allDocuments.find(
              (d) => d.doc_type === 'lorebook' && !d.metadata_json?.includes('"_web_of_thought"')
            );
            if (unassigned && onOpenDocument) onOpenDocument(unassigned.id);
          }}
        />
      );
    }

    return (
      <UniverseDashboard
        universeId={activeUniverseId}
        plan={plan}
        documents={allDocuments}
        onSaveThought={handleSaveThought}
        onOpenDocument={(id) => {
          if (onOpenDocument) onOpenDocument(id);
        }}
        onCreateEntity={handleCreateEntity}
        onCreateChapter={handleCreateChapter}
        onSaveDocument={onSaveDocument}
        onOpenCreateModal={onOpenCreateModal}
        onSwitchUniverse={() => {
          setActiveUniverseId(null);
          localStorage.removeItem('mc_active_universe_id');
        }}
        onOpenUnassigned={() => {
          const unassigned = allDocuments.find(
            (d) => d.doc_type === 'lorebook' && !d.metadata_json?.includes('"_web_of_thought"')
          );
          if (unassigned && onOpenDocument) onOpenDocument(unassigned.id);
        }}
      />
    );
  }

  // ==========================================================
  // DOCUMENT WRITING & ENTITY EDITING VIEW
  // ==========================================================
  const TypeIcon = ENTRY_TYPE_CONFIG[metadata.entry_type]?.icon || Compass;
  const canonStyle = CANON_STATUS_CONFIG[metadata.canon_status] || CANON_STATUS_CONFIG.canon;

  // Active universe name for breadcrumb
  const resolvedUniverse =
    plan?.universes.find((u) => u.id === metadata.universe_id) ||
    plan?.universes.find(
      (u) => u.name.toLowerCase() === (metadata.universe || '').trim().toLowerCase()
    );
  const universeDisplay = resolvedUniverse?.name || metadata.universe || 'Universe';

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden select-none">
      {/* Studio Header Toolbar */}
      <div className="flex items-center justify-between px-8 py-3.5 border-b border-border/60 bg-muted/10 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          {/* Back to Universe Dashboard Button */}
          <button
            type="button"
            onClick={() => setViewMode('universe')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/80 bg-card hover:bg-muted/40 text-xs text-foreground font-medium transition-colors shrink-0"
            title="Return to Universe Dashboard"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-primary" />
            <span>Dashboard</span>
          </button>

          <div className="h-4 w-px bg-border shrink-0" />

          {/* Breadcrumb Hierarchy */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
            <span className="font-serif font-bold text-foreground truncate">
              {universeDisplay}
            </span>
            <span>/</span>
            <span className="capitalize">{metadata.entry_type}</span>
            {metadata.book && (
              <>
                <span>/</span>
                <span className="truncate">{metadata.book}</span>
              </>
            )}
          </div>

          <div className="h-4 w-px bg-border shrink-0" />

          {/* Entry Type Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <TypeIcon className={cn('w-4 h-4', ENTRY_TYPE_CONFIG[metadata.entry_type]?.color)} />
            <select
              aria-label="Lorebook Entry Type"
              value={metadata.entry_type}
              onChange={(e) =>
                handleMetaFieldChange('entry_type', e.target.value as LorebookEntryType)
              }
              className="px-2.5 py-1 rounded-lg bg-muted/40 border border-border/80 text-xs text-foreground focus:outline-none"
            >
              <option value="character">Character</option>
              <option value="location">Location</option>
              <option value="faction">Faction / Nation</option>
              <option value="concept">Rule / System</option>
              <option value="culture">Culture / History</option>
              <option value="artifact">Artifact</option>
              <option value="event">Event</option>
              <option value="chapter">Chapter</option>
              <option value="other">Other Lore</option>
            </select>
          </div>

          {/* Canon Status Selector */}
          <div className="flex items-center gap-1.5 shrink-0">
            <select
              aria-label="Canon Status"
              value={metadata.canon_status}
              onChange={(e) => handleMetaFieldChange('canon_status', e.target.value as CanonStatus)}
              className={cn(
                'px-2.5 py-1 rounded-lg border text-xs font-semibold focus:outline-none',
                canonStyle.bg,
                canonStyle.text,
                canonStyle.border
              )}
            >
              <option value="canon">Canon</option>
              <option value="draft">Draft</option>
              <option value="speculative">Speculative</option>
            </select>
          </div>
        </div>

        {/* Right Action buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          {onSaveThought && (
            <button
              type="button"
              className="text-xs text-primary border border-primary/40 px-3 py-1.5 rounded-lg hover:bg-primary/10 transition-colors"
              onClick={() => setActiveTab('web')}
            >
              Web of Thought
            </button>
          )}

          <div className="flex items-center rounded-lg border border-border p-0.5 bg-muted/20">
            <button
              type="button"
              onClick={() => setActiveTab('write')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                activeTab === 'write'
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Edit3 className="w-3.5 h-3.5" />
              Write
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                activeTab === 'preview'
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Eye className="w-3.5 h-3.5" />
              Preview
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportMarkdown}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <FileDown className="w-4 h-4 text-muted-foreground" />
            Export Lore
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Entry Title & Universe Details */}
          <div className="pb-5 border-b border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={cn(
                  'text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded',
                  canonStyle.bg,
                  canonStyle.text
                )}
              >
                {metadata.canon_status}
              </span>
              <span className="text-xs text-muted-foreground font-serif">
                {universeDisplay} • {ENTRY_TYPE_CONFIG[metadata.entry_type]?.label}
              </span>
            </div>
            <h1 className="text-3xl font-serif font-bold tracking-wide text-foreground">
              {document.metadata.title}
            </h1>
          </div>

          {/* GUIDED ENTITY-SPECIFIC FIELDS */}
          <EntityGuidedFields
            metadata={metadata}
            onChange={handleGuidedFieldsChange}
            readOnly={activeTab === 'preview'}
          />

          {/* IN-CONTEXT RELATIONSHIPS CARD */}
          <EntityRelationshipsCard
            documentId={document.metadata.id}
            plan={plan}
            onSaveThought={handleSaveThought}
            availableEntities={allDocuments.filter(
              (d) =>
                d.doc_type === 'lorebook' &&
                !d.metadata_json?.includes('"_web_of_thought"')
            )}
            onNavigateToEntity={(id) => {
              if (onOpenDocument) onOpenDocument(id);
            }}
            universeId={metadata.universe_id || resolvedUniverse?.id}
            readOnly={activeTab === 'preview'}
          />

          {/* Quick Facts / Attributes Panel */}
          <div className="rounded-xl border border-border/80 bg-card/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-primary" />
                Custom Parameters &amp; Index Attributes
              </span>
              {activeTab === 'write' && (
                <button
                  type="button"
                  onClick={handleAddAttribute}
                  className="flex items-center gap-1 text-xs text-primary font-medium hover:text-gold-hover transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Field
                </button>
              )}
            </div>

            {!metadata.attributes || metadata.attributes.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 italic">
                No custom parameters defined yet. Add attributes like Region, Allegiance, Power, or Epoch.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {metadata.attributes.map((attr) => (
                  <div
                    key={attr.id}
                    className="flex items-center gap-2 p-1.5 rounded-lg bg-background border border-border/50 text-xs"
                  >
                    <input
                      type="text"
                      disabled={activeTab === 'preview'}
                      value={attr.key}
                      onChange={(e) => handleUpdateAttribute(attr.id, e.target.value, attr.value)}
                      placeholder="Property (e.g. Leader)"
                      className="w-1/3 bg-transparent text-xs font-medium text-muted-foreground focus:outline-none"
                    />
                    <span className="text-border">:</span>
                    <input
                      type="text"
                      disabled={activeTab === 'preview'}
                      value={attr.value}
                      onChange={(e) => handleUpdateAttribute(attr.id, attr.key, e.target.value)}
                      placeholder="Value"
                      className="flex-1 bg-transparent text-xs text-foreground focus:outline-none"
                    />
                    {activeTab === 'write' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAttribute(attr.id)}
                        className="text-muted-foreground hover:text-rose-400 p-1 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Editor or Preview */}
          {activeTab === 'write' ? (
            <div className="rounded-xl border border-border/60 bg-card/40 p-5 focus-within:border-border">
              <textarea
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder="Write worldbuilding lore, descriptions, chronology, and connections in Markdown..."
                rows={18}
                className="w-full bg-transparent resize-y focus:outline-none text-[16px] leading-relaxed text-foreground placeholder:text-muted-foreground/40 font-mono"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 bg-card p-6 prose prose-invert max-w-none text-[15.5px] leading-relaxed text-foreground">
              {content ? (
                <div className="whitespace-pre-wrap">{content}</div>
              ) : (
                <div className="text-muted-foreground italic">No lore content written yet.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
