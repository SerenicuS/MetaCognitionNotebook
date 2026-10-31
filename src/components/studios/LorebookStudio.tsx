import { ALL_UNIVERSES, attributionLabel, chapterCreationMetadata, classifyLoreDocument, requireCreationUniverse, scopedSidebarDocuments, type LorebookScope } from '@/utils/lorebookNavigation';
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
import { LORE_CATEGORIES, resolveChapterHistoricalContext, getCategoryForEntryType } from '@/utils/universe';
import { WebOfThought } from './WebOfThought';
import { UniverseSelector } from './lorebook/UniverseSelector';
import { UniverseDashboard } from './lorebook/UniverseDashboard';
import { EntityGuidedFields } from './lorebook/EntityGuidedFields';
import { EntityRelationshipsCard } from './lorebook/EntityRelationshipsCard';
import { HistoricalEntityStatesCard } from './lorebook/HistoricalEntityStatesCard';
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
import { MarkdownEditor, type EditorEngine } from '@/components/editor/MarkdownEditor';
import { getHouseUniverses } from '@/utils/house';
import type { HouseRecord } from '@/types';

interface LorebookStudioProps {
  scope?: LorebookScope;
  scopeReady?: boolean;
  onScopeChange?: (scope: LorebookScope) => void;
  onOpenUniverse?: (id: string) => Promise<void>;
  onOpenImportedUniverse?: (id: string, houseId: string) => Promise<void>;
  onRefreshLibrary?: () => Promise<void>;
  activeHouse?: HouseRecord | null;
  houses?: HouseRecord[];
  document?: DocumentDetail | null;
  allDocuments?: DocumentMetadata[];
  onSave: (content: string, metadataJson?: string) => Promise<void> | void;
  onManualSave?: () => Promise<boolean> | void;
  saveStatus: SaveStatus;
  notebookKey?: string;
  onRequestBackup?:()=>void;
  onSaveThought?: (
    expected: () => number,
    plan: import('@/utils/relationships').PlanMutation,
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
    content?: string,
    title?: string,
    tags?: string[],
    metadataJson?: string,
    options?: { isMetadataOnly?: boolean }
  ) => Promise<void>;
  onOpenCreateModal?: (options?: {
    universeId?: string;
    entryType?: LorebookEntryType | 'book';
    action?: 'create_universe' | 'add_to_universe';
    initialTitle?: string;
  }) => void;
  plan?: Plan | null;
  onMoveUniverse?: (universeId: string) => void;
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
  artifact: { label: 'Item / Artifact', icon: Sword, color: 'text-cyan-400' },
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
  scope = ALL_UNIVERSES,
  scopeReady = true,
  onScopeChange = () => {},
  onOpenUniverse,
  onOpenImportedUniverse,
  onRefreshLibrary,
  activeHouse,
  houses = [],
  document,
  allDocuments = [],
  onSave,
  onManualSave,
  onSaveThought,
  notebookKey,
  onRequestBackup,
  onOpenDocument,
  onCreateDocument,
  onSaveDocument,
  onOpenCreateModal,
  plan: propPlan,
  onMoveUniverse,
}) => {
  // App owns the acknowledged canonical plan; do not fetch or mirror it locally.
  const plan = propPlan || null;
  const activeUniverseId = scope.kind === 'universe' ? scope.universeId : undefined;
  const houseId = activeHouse?.id || 'house-default';
  const houseUniverses = getHouseUniverses(plan, activeHouse, houses);
  const [creationError, setCreationError] = useState('');
  const selectUniverse = (id: string) => {
    if (onOpenUniverse) void onOpenUniverse(id);
    else onScopeChange({ kind: 'universe', universeId: id });
  };
  // Document Editing state
  const [content, setContent] = useState<string>(document ? document.content : '');
  const [prevDocId, setPrevDocId] = useState(document?.metadata.id);
  if (document?.metadata.id !== prevDocId) {
    setPrevDocId(document?.metadata.id);
    setContent(document ? document.content : '');
  }
  const [activeTab, setActiveTab] = useState<'write' | 'preview' | 'web'>(() =>
    document?.metadata.metadata_json?.includes('"_web_of_thought"') ? 'web' : 'write'
  );

  // Editor Engine: 'codemirror' (production default) or 'textarea' (safe rollback fallback)
  const [editorEngine, setEditorEngine] = useState<EditorEngine>(() => {
    return (localStorage.getItem('mc_editor_engine') as EditorEngine) || 'codemirror';
  });

  const handleToggleEngine = (newEngine: EditorEngine) => {
    setEditorEngine(newEngine);
    localStorage.setItem('mc_editor_engine', newEngine);
  };
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

  // Synchronize when document changes
  useEffect(() => {
    if (document) {
      setContent(document.content);
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

      } catch {
        setMetadata({
          universe: 'Unassigned Cosmos',
          entry_type: 'other',
          canon_status: 'canon',
          attributes: [],
        });
      }
    }
  }, [document?.metadata.id]);

  const handleSaveThought: import('@/utils/relationships').SaveThought = async (expected,edit,acknowledge) => {
    if(!onSaveThought)return false;
    return onSaveThought(expected,edit,acknowledge);
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

  const handleReferencesChange = useCallback(
    (
      references: import('@/components/echo/types').EchoPersistentReference[],
      detached: import('@/components/echo/types').EchoPersistentReference[]
    ) => {
      const updated = {
        ...metadata,
        echo_references: [...references, ...detached],
      };
      setMetadata(updated);
      triggerSave(content, updated);
    },
    [metadata, content, triggerSave]
  );

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
    if (!onCreateDocument) return;
    let currentUniverse;
    try {
      currentUniverse = requireCreationUniverse(plan, activeUniverseId, houseId, houses);
      setCreationError('');
    } catch (err) { setCreationError(err instanceof Error ? err.message : String(err)); return; }

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
    if (!onCreateDocument) throw new Error('Chapter creation is unavailable.');
    const chapterMeta = chapterCreationMetadata(plan, activeUniverseId, bookId, chapterTitle, order, houseId, houses);

    await onCreateDocument(
      'lorebook',
      chapterTitle,
      `# ${chapterTitle}\n\n`,
      JSON.stringify(chapterMeta),
      []
    );
  };

  // Web of Thought planning desk tab.
  // Note: Standalone button was removed from entity header; setActiveTab('web') is retained for catalog document fallback.
  if (
    activeTab === 'web' ||
    (document && document.metadata.metadata_json?.includes('"_web_of_thought"'))
  ) {
    if (onSaveThought) {
      return (
        <WebOfThought
          activeHouse={activeHouse}
          houses={houses}
          canonicalPlan={plan}
          canonicalDocuments={allDocuments}
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
  if (!document) {
    if (!scopeReady && !plan) return <div role="status" className="p-6 text-sm text-muted-foreground">Waiting for Universe planning and House information. Your saved browsing scope is retained.</div>;
    if (scope.kind === 'unresolved') {
      const entries = scopedSidebarDocuments(allDocuments, scope, plan, houseId, houses).filter(d => d.doc_type === 'lorebook');
      return <section aria-label="Unassigned and unresolved Lore" className="p-6 h-full overflow-y-auto space-y-4">
        <h2 className="text-xl font-serif">Unassigned / Unresolved Lore</h2>
        <p className="text-sm text-muted-foreground">{entries.length} entries in {activeHouse?.name || 'this House'}. Attribution is read-only; opening an entry does not repair its metadata.</p>
        <button onClick={() => onScopeChange(ALL_UNIVERSES)} className="text-sm text-primary underline">Browse all Universes</button>
        {!entries.length && <p>No unassigned or unresolved entries in this House.</p>}
        {entries.map(entry => <article key={entry.id} className="rounded-lg border border-border p-3">
          <button className="font-medium text-primary underline" onClick={() => onOpenDocument?.(entry.id)}>{entry.title}</button>
          <p className="text-xs mt-1 text-muted-foreground">{classifyLoreDocument(entry, plan, houseId, houses).reason}</p>
        </article>)}
      </section>;
    }
    if (scope.kind === 'all' || !houseUniverses.some(u => u.id === activeUniverseId)) {
      return <UniverseSelector activeHouse={activeHouse} houses={houses} onMoveUniverse={onMoveUniverse}
        plan={plan} documents={allDocuments} onSelectUniverse={selectUniverse}
        onFlushSave={onManualSave ? async () => await onManualSave() !== false : undefined}
        onSaveThought={handleSaveThought} onOpenCreateModal={onOpenCreateModal}
        onRefreshLibrary={onRefreshLibrary} onOpenImportedUniverse={onOpenImportedUniverse}
        onOpenUnassigned={() => onScopeChange({ kind: 'unresolved' })}/>;
    }
    return <div className="h-full flex flex-col">
      {creationError && <p role="alert" className="p-3 text-sm text-rose-400">{creationError}</p>}
      <UniverseDashboard notebookKey={notebookKey} activeHouse={activeHouse} houses={houses}
        onMoveUniverse={onMoveUniverse} onRequestBackup={onRequestBackup} universeId={activeUniverseId!}
        plan={plan} documents={allDocuments} onSaveThought={handleSaveThought}
        onOpenDocument={id => onOpenDocument?.(id)} onCreateEntity={handleCreateEntity} onCreateChapter={handleCreateChapter}
        onSaveDocument={onSaveDocument} onOpenCreateModal={onOpenCreateModal}
        onSwitchUniverse={() => onScopeChange(ALL_UNIVERSES)} onSelectUniverse={selectUniverse}
        onRefreshLibrary={onRefreshLibrary} onOpenImportedUniverse={onOpenImportedUniverse}
        onFlushSave={onManualSave ? async () => await onManualSave() !== false : undefined}
        onOpenUnassigned={() => onScopeChange({ kind: 'unresolved' })}/>
    </div>;
  }

  // ==========================================================
  // DOCUMENT WRITING & ENTITY EDITING VIEW
  // ==========================================================
  const TypeIcon = ENTRY_TYPE_CONFIG[metadata.entry_type]?.icon || Compass;
  const canonStyle = CANON_STATUS_CONFIG[metadata.canon_status] || CANON_STATUS_CONFIG.canon;

  // Active universe name for breadcrumb
  const attribution = classifyLoreDocument(document.metadata, plan, houseId, houses);
  const resolvedUniverse = attribution.kind === 'assigned' ? attribution.universe : undefined;
  const universeDisplay = attributionLabel(attribution, houseUniverses);
  const sourceBook = plan?.books.find(book => book.id === metadata.book_id && book.universe_id === resolvedUniverse?.id && !book.archived);
  const chapterContext = metadata.entry_type === 'chapter' && plan && resolvedUniverse && sourceBook
    ? resolveChapterHistoricalContext(plan, resolvedUniverse.id, document.metadata, sourceBook) : null;

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden select-none">
      {/* Studio Header Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between px-4 lg:px-8 py-3.5 border-b border-border/60 bg-muted/10 shrink-0">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          {/* Back to Universe Dashboard Button */}
          <button
            type="button"
            onClick={async () => {
              if (resolvedUniverse && onOpenUniverse) { await onOpenUniverse(resolvedUniverse.id); return; }
              if (onManualSave && await onManualSave() === false) return;
              if (!resolvedUniverse) onScopeChange({ kind: 'unresolved' });
              onOpenDocument?.('');
            }}
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
              <option value="artifact">Item / Artifact</option>
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
            key={`fields:${document.metadata.id}`}
            metadata={metadata}
            onChange={handleGuidedFieldsChange}
            readOnly={activeTab === 'preview'}
            documentId={document.metadata.id}
            universeId={resolvedUniverse?.id}
            plan={plan}
            onSaveThought={handleSaveThought}
            allDocuments={allDocuments}
            onNavigateToEntity={(id) => {
              if (onOpenDocument) onOpenDocument(id);
            }}
            onOpenCreateFaction={(initialName) => {
              if (onOpenCreateModal) {
                onOpenCreateModal({
                  universeId: resolvedUniverse?.id,
                  entryType: 'faction',
                  action: 'add_to_universe',
                  initialTitle: initialName,
                });
              }
            }}
            onOpenCreateEntity={(category, initialName) => {
              if (onOpenCreateModal) {
                const catInfo = LORE_CATEGORIES.find((c) => c.id === category);
                onOpenCreateModal({
                  universeId: resolvedUniverse?.id,
                  entryType: catInfo ? catInfo.defaultEntryType : 'other',
                  action: 'add_to_universe',
                  initialTitle: initialName,
                });
              }
            }}
          />

          {/* HISTORICAL ENTITY LIVING STATES CARD */}
          {metadata.entry_type !== 'chapter' && resolvedUniverse?.id && (
            <HistoricalEntityStatesCard
              key={`historical:${document.metadata.id}`}
              documentId={document.metadata.id}
              universeId={resolvedUniverse.id}
              plan={plan}
              allDocuments={allDocuments}
              category={getCategoryForEntryType(metadata.entry_type)}
              readOnly={activeTab === 'preview'}
              onSaveThought={handleSaveThought}
            />
          )}

          {/* IN-CONTEXT RELATIONSHIPS CARD */}
          {metadata.entry_type !== 'chapter' && (
            <EntityRelationshipsCard
              key={`relationships:${document.metadata.id}`}
              documentId={document.metadata.id}
              plan={plan}
              onSaveThought={handleSaveThought}
              availableEntities={allDocuments.filter(
                (d) =>
                  d.doc_type === 'lorebook' &&
                  !d.metadata_json?.includes('"_web_of_thought"')
              )}
              allDocuments={allDocuments}
              onNavigateToEntity={(id) => {
                if (onOpenDocument) onOpenDocument(id);
              }}
              universeId={resolvedUniverse?.id}
              readOnly={activeTab === 'preview'}
            />
          )}

          {/* Quick Facts / Attributes Panel */}
          {metadata.entry_type !== 'chapter' && (
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
          )}

          {/* Editor or Preview */}
          {activeTab === 'write' ? (
            <MarkdownEditor
              key={document.metadata.id}
              documentId={document.metadata.id}
              value={content}
              className="min-w-0 w-full"
              onChange={handleContentChange}
              onManualSave={onManualSave}
              placeholder={
                metadata.entry_type === 'chapter'
                  ? 'Write chapter prose, dialogue, narration, and scene descriptions in Markdown...'
                  : 'Write worldbuilding lore, descriptions, chronology, and connections in Markdown...'
              }
              engine={editorEngine}
              onToggleEngine={handleToggleEngine}
              minHeight={metadata.entry_type === 'chapter' ? '540px' : '420px'}
              notebookKey={notebookKey}
              houses={houses}
              echoEnabled={true}
              initialReferences={metadata.echo_references || []}
              onReferencesChange={handleReferencesChange}
              allDocuments={allDocuments}
              plan={plan}
              universeId={resolvedUniverse?.id}
              houseId={document.metadata.house_id || activeHouse?.id || 'house-default'}
              chapterMilestoneId={chapterContext?.isValid ? chapterContext.milestoneId : null}
              onOpenEntity={onOpenDocument}
            />
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
