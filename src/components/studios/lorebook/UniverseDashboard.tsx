import { UniverseOverview } from './UniverseOverview';
import {UniverseSafety} from './UniverseSafety';
import {RelationshipFeedback,useRelationshipUndo} from './RelationshipFeedback';
import {requireSaved} from '@/utils/relationships';
import React, { useState } from 'react';
import type { DocumentMetadata, LoreCategory, LorebookEntryType } from '@/types';
import type { Continuity, Plan, Thought } from '@/utils/thought';
import {
  newNode,
  insertNode,
  archiveNode,
  timeline,
} from '@/utils/thought';
import {
  LORE_CATEGORIES,
  getCategoryForEntryType,
  getUniverseEntities,
  getBooksForUniverse,
  createBookInPlan,
  setBookArchived,
  parseLoreMetadata,
  getUnassignedEntities,
  validateAndCreateRelationship,
} from '@/utils/universe';
import { BookView } from './BookView';
import { UniverseStateExplorer } from './UniverseStateExplorer';
import { RelationshipGraph } from '../WebOfThought';
import { PortableUniverseModal } from './PortableUniverseModal';
import { LorebookPublicationModal } from './LorebookPublicationModal';
import {
  Globe,
  Plus,
  Users,
  MapPin,
  Shield,
  Sparkles,
  Sword,
  Calendar,
  Compass,
  BookOpen,
  Share2,
  ArrowRight,
  ExternalLink,
  Layers,
  Search,
  FolderArchive,
  FolderInput,
  Trash2,
  Package,
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface UniverseDashboardProps {
  activeHouse?: import('@/types').HouseRecord | null;
  houses?: import('@/types').HouseRecord[];
  universeId: string;
  onRequestBackup?:()=>void;
  plan: Plan | null;
  documents: DocumentMetadata[];
  onSaveThought?: (
    expected: () => number,
    plan: import('@/utils/relationships').PlanMutation,
    acknowledge: (result: Thought) => void
  ) => Promise<boolean>;
  onOpenDocument: (docId: string) => void;
  onCreateEntity: (category: LoreCategory, defaultTitle?: string) => void;
  onCreateChapter: (bookId: string, chapterTitle: string, order: number) => Promise<void>;
  onSaveDocument?: (id: string, content?: string, title?: string, tags?: string[], metadataJson?: string, options?: { isMetadataOnly?: boolean }) => Promise<void>;
  onSwitchUniverse: () => void;
  onOpenUnassigned?: () => void;
  onOpenCreateModal?: (options?: {
    universeId?: string;
    entryType?: LorebookEntryType | 'book';
    action?: 'create_universe' | 'add_to_universe';
  }) => void;
  onMoveUniverse?: (universeId: string) => void;
  onFlushSave?: () => Promise<boolean>;
  onSelectUniverse?: (universeId: string) => void;
  onRefreshLibrary?: () => Promise<void>;
}

const CATEGORY_ICONS: Record<LoreCategory, React.ElementType> = {
  characters: Users,
  locations: MapPin,
  factions: Shield,
  rules: Sparkles,
  cultures: Compass,
  artifacts: Sword,
  events: Calendar,
  other: Layers,
};

export const UniverseDashboard: React.FC<UniverseDashboardProps> = ({
  activeHouse,
  houses,
  universeId,
  onRequestBackup,
  plan,
  documents,
  onSaveThought,
  onOpenDocument,
  onCreateEntity,
  onCreateChapter,
  onSaveDocument,
  onSwitchUniverse,
  onOpenUnassigned,
  onOpenCreateModal,
  onMoveUniverse,
  onFlushSave,
  onSelectUniverse,
  onRefreshLibrary,
}) => {
  const unlinkActions=useRelationshipUndo(plan,onSaveThought);
  const [isPortableModalOpen, setIsPortableModalOpen] = useState(false);
  const [portableModalTab, setPortableModalTab] = useState<'export' | 'import'>('export');
  const [isPublicationModalOpen, setIsPublicationModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'worldbuilding' | 'books' | 'timeline' | 'relationships' | 'web_of_thought'
  >('overview');
  const [wotView, setWotView] = useState<'states' | 'connections'>('states');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<LoreCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Book for sub-view
  const [selectedBookId, setSelectedBookId] = useState<string | null>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('mc_selected_book_id') || null;
    }
    return null;
  });

  const [wotNavContinuityId, setWotNavContinuityId] = useState<string | null>(null);
  const [wotNavMilestoneId, setWotNavMilestoneId] = useState<string | null>(null);
  const [wotNavEntityId, setWotNavEntityId] = useState<string | null>(null);

  const handleNavigateToWebOfThought = (
    _universeId: string,
    continuityId: string | null,
    milestoneId: string | null,
    entityId: string | null
  ) => {
    setSelectedBookId(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('mc_selected_book_id');
    }
    setActiveTab('web_of_thought');
    setWotView('states');
    setWotNavContinuityId(continuityId);
    setWotNavMilestoneId(milestoneId);
    setWotNavEntityId(entityId);
  };

  const handleRestoreBook = async (bookId: string) => {
    if (!plan || !onSaveThought) return;
    const targetBook = plan.books.find((b) => b.id === bookId);
    if (!targetBook) return;
    const updatedPlan = setBookArchived(plan, bookId, false);
    await onSaveThought(
      () => plan.revision,
      updatedPlan,
      () => {}
    );
  };

  const handleSelectBook = (id: string | null) => {
    setSelectedBookId(id);
    if (typeof localStorage !== 'undefined') {
      if (id) {
        localStorage.setItem('mc_selected_book_id', id);
      } else {
        localStorage.removeItem('mc_selected_book_id');
      }
    }
  };

  // Book Creation Modal state
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookDesc, setNewBookDesc] = useState('');
  const [newBookContinuity, setNewBookContinuity] = useState<Continuity>('standalone');
  const [bookCreating, setBookCreating] = useState(false);

  // Universe Timeline Milestone modal
  const [isAddingHistoryNode, setIsAddingHistoryNode] = useState(false);
  const [historyTitle, setHistoryTitle] = useState('');
  const [historyEra, setHistoryEra] = useState('');
  const [historyDesc, setHistoryDesc] = useState('');

  // Relationships tab state
  const [relSourceId, setRelSourceId] = useState('');
  const [relTargetId, setRelTargetId] = useState('');
  const [relLabel, setRelLabel] = useState('');
  const [relDirected, setRelDirected] = useState(true);
  const [relFilterEntity, setRelFilterEntity] = useState('');
  const [relSaving, setRelSaving] = useState(false);
  const [relError, setRelError] = useState('');

  const universe = plan?.universes.find((u) => u.id === universeId);
  const universeDocs = plan ? getUniverseEntities(documents, universeId, plan.universes) : [];
  const books = plan ? getBooksForUniverse(plan, universeId) : [];
  const archivedBooks = plan ? plan.books.filter((b) => b.universe_id === universeId && b.archived) : [];
  const universeTimeline = plan ? timeline(plan, universeId, null) : [];

  if (!universe) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center select-none">
        <Globe className="w-12 h-12 text-muted-foreground/50 mb-3" />
        <h2 className="text-lg font-serif font-bold text-foreground">Universe Not Found</h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          The selected Universe could not be located in this notebook.
        </p>
        <button
          type="button"
          onClick={onSwitchUniverse}
          className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-gold-hover transition-colors"
        >
          Select Another Universe
        </button>
      </div>
    );
  }

  // If a book is selected, render BookView
  if (selectedBookId) {
    const book = plan?.books.find((b) => b.id === selectedBookId);
    if (book && plan) {
      return (
        <BookView
          book={book}
          universe={universe}
          plan={plan}
          documents={documents}
          onSaveThought={onSaveThought}
          onCreateChapter={onCreateChapter}
          onSaveDocument={onSaveDocument}
          onOpenDocument={onOpenDocument}
          onBackToUniverse={() => handleSelectBook(null)}
          onNavigateToWebOfThought={handleNavigateToWebOfThought}
        />
      );
    }
  }

  // Filter entities
  const filteredEntities = universeDocs.filter((doc) => {
    const meta = parseLoreMetadata(doc);
    const cat = getCategoryForEntryType(meta.entry_type);
    if (selectedCategoryFilter !== 'all' && cat !== selectedCategoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return doc.title.toLowerCase().includes(q);
    }
    return true;
  });

  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan || !onSaveThought) return;
    const cleanTitle = newBookTitle.trim();
    if (!cleanTitle) return;

    setBookCreating(true);
    try {
      const { plan: updatedPlan, book: newBook } = createBookInPlan(
        plan,
        universeId,
        cleanTitle,
        newBookContinuity,
        newBookDesc
      );
      await onSaveThought(
        () => plan.revision,
        updatedPlan,
        () => {}
      );
      setNewBookTitle('');
      setNewBookDesc('');
      setIsCreatingBook(false);
      handleSelectBook(newBook.id);
    } catch (err: any) {
      console.error('Failed to create book:', err);
    } finally {
      setBookCreating(false);
    }
  };

  const handleCreateHistoryNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan || !onSaveThought) return;
    const cleanTitle = historyTitle.trim();
    if (!cleanTitle) return;

    const node = {
      ...newNode(plan, universeId, null),
      title: cleanTitle,
      era: historyEra.trim(),
      description: historyDesc.trim(),
    };

    const updatedPlan = insertNode(plan, node);
    await onSaveThought(
      () => plan.revision,
      updatedPlan,
      () => {}
    );

    setHistoryTitle('');
    setHistoryEra('');
    setHistoryDesc('');
    setIsAddingHistoryNode(false);
  };

  const handleArchiveHistoryNode = async (nodeId: string) => {
    if (!plan || !onSaveThought) return;
    const updatedPlan = archiveNode(plan, nodeId);
    await onSaveThought(
      () => plan.revision,
      updatedPlan,
      () => {}
    );
  };

  const handleAddRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan || !onSaveThought) return;
    setRelError('');

    if (!relSourceId || !relTargetId) {
      setRelError('Please select both source and target entities.');
      return;
    }
    const cleanLabel = relLabel.trim();
    if (!cleanLabel) {
      setRelError('Please specify a relationship label.');
      return;
    }

    setRelSaving(true);
    try {
      requireSaved(await onSaveThought(()=>plan.revision,current=>validateAndCreateRelationship(current,documents,{sourceId:relSourceId,targetId:relTargetId,label:cleanLabel,universeId,directed:relDirected}).updatedPlan,()=>setRelError('')));
      setRelLabel('');
      setRelError('');
    } catch (err: any) {
      setRelError(err?.message || 'Failed to add relationship.');
    } finally {
      setRelSaving(false);
    }
  };

  const handleDeleteRelationship = unlinkActions.unlink;

  // Relationships in this universe
  const universeRelationships = plan
    ? plan.relationships.filter((r) => !r.archived && r.universe_id === universeId)
    : [];

  const filteredRelationships = universeRelationships.filter((r) => {
    if (!relFilterEntity) return true;
    return r.source_id === relFilterEntity || r.target_id === relFilterEntity;
  });

  const getEntityTitle = (id: string) => {
    const doc = documents.find((d) => d.id === id);
    return doc?.title || `Entity #${id.slice(0, 6)}`;
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-8 max-w-6xl mx-auto space-y-6">
      {/* UNIVERSE HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Globe className="w-3.5 h-3.5 text-primary" />
            <span>Universe</span>
            <span>/</span>
            <button
              type="button"
              onClick={onSwitchUniverse}
              className="hover:text-foreground underline decoration-dotted"
            >
              Switch Universe
            </button>
            {onOpenUnassigned && plan && getUnassignedEntities(documents, plan.universes).length > 0 && (
              <>
                <span>/</span>
                <button
                  type="button"
                  onClick={onOpenUnassigned}
                  className="hover:text-amber-300 text-amber-400/90 inline-flex items-center gap-1"
                >
                  <FolderArchive className="w-3 h-3" />
                  Unassigned Lore ({getUnassignedEntities(documents, plan.universes).length})
                </button>
              </>
            )}
          </div>
          <h1 className="text-3xl font-serif font-bold text-foreground tracking-wide">
            {universe.name}
          </h1>

        </div>

        {/* QUICK CREATION ACTION BUTTONS */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (onOpenCreateModal) {
                onOpenCreateModal({ universeId, entryType: 'character', action: 'add_to_universe' });
              } else {
                onCreateEntity('characters');
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-gold-hover transition-colors shadow-sm"
          >
            <Users className="w-3.5 h-3.5" />
            + Add Character
          </button>
          <button
            type="button"
            onClick={() => {
              if (onOpenCreateModal) {
                onOpenCreateModal({ universeId, entryType: 'location', action: 'add_to_universe' });
              } else {
                onCreateEntity('locations');
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-medium hover:bg-muted/40 transition-colors"
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            + Add Location
          </button>
          <button
            type="button"
            onClick={() => {
              if (onOpenCreateModal) {
                onOpenCreateModal({ universeId, entryType: 'faction', action: 'add_to_universe' });
              } else {
                onCreateEntity('factions');
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-medium hover:bg-muted/40 transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            + Add Faction
          </button>
          <button
            type="button"
            onClick={() => {
              if (onOpenCreateModal) {
                onOpenCreateModal({ universeId, entryType: 'book', action: 'add_to_universe' });
              } else {
                setIsCreatingBook(true);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-medium hover:bg-muted/40 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5 text-sky-400" />
            + Add Book
          </button>
          {onMoveUniverse && (
            <button
              type="button"
              onClick={() => onMoveUniverse(universeId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-medium hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
              title="Move Universe to another House"
            >
              <FolderInput className="w-3.5 h-3.5 text-primary" />
              Move Universe
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setPortableModalTab('export');
              setIsPortableModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-medium hover:bg-muted/40 transition-colors text-foreground"
            title="Export or Import Portable Universe (.mcuniverse) archive"
          >
            <Package className="w-3.5 h-3.5 text-primary" />
            Archive (.mcuniverse)
          </button>
          <button
            type="button"
            onClick={() => setIsPublicationModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/40 bg-primary/10 text-xs font-medium hover:bg-primary/20 transition-colors text-primary font-semibold"
            title="Publish reader-facing encyclopedia in Markdown (.md) or PDF (.pdf)"
          >
            <Share2 className="w-3.5 h-3.5" />
            Publish Lorebook
          </button>
        </div>
      </div>

      {/* DASHBOARD TABS NAVIGATION */}
      <div className="flex gap-2 border-b border-border/60 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0',
            activeTab === 'overview'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
          )}
        >
          <Globe className="w-3.5 h-3.5" />
          Universe Overview
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('worldbuilding')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0',
            activeTab === 'worldbuilding'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          Worldbuilding ({universeDocs.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('books')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0',
            activeTab === 'books'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
          )}
        >
          <BookOpen className="w-3.5 h-3.5" />
          Books &amp; Stories ({books.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('timeline')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0',
            activeTab === 'timeline'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
          )}
        >
          <Calendar className="w-3.5 h-3.5" />
          Universe Timeline ({universeTimeline.length})
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('web_of_thought');
            setWotView('states');
          }}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0',
            activeTab === 'web_of_thought' || activeTab === 'relationships'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
          )}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Web of Thought</span>
          <span className="sr-only">World Relationships</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* 1. OVERVIEW VIEW */}
      {/* ======================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <UniverseOverview key={universe.id} universe={universe} revision={plan!.revision} save={onSaveThought}/>
          {/* STATS OVERVIEW CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div
              onClick={() => setActiveTab('worldbuilding')}
              className="p-5 rounded-2xl border border-border/80 bg-card/60 hover:bg-card cursor-pointer transition-all"
            >
              <div className="text-2xl font-serif font-bold text-foreground">
                {universeDocs.length}
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary" />
                Lore Entities
              </div>
            </div>

            <div
              onClick={() => setActiveTab('books')}
              className="p-5 rounded-2xl border border-border/80 bg-card/60 hover:bg-card cursor-pointer transition-all"
            >
              <div className="text-2xl font-serif font-bold text-foreground">{books.length}</div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-primary" />
                Books &amp; Stories
              </div>
            </div>

            <div
              onClick={() => setActiveTab('timeline')}
              className="p-5 rounded-2xl border border-border/80 bg-card/60 hover:bg-card cursor-pointer transition-all"
            >
              <div className="text-2xl font-serif font-bold text-foreground">
                {universeTimeline.length}
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                Historical Milestones
              </div>
            </div>

            <div
              onClick={() => {
                setActiveTab('web_of_thought');
                setWotView('states');
              }}
              className="p-5 rounded-2xl border border-border/80 bg-card/60 hover:bg-card cursor-pointer transition-all"
            >
              <div className="text-2xl font-serif font-bold text-foreground">
                {universeRelationships.length}
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Web of Thought
              </div>
            </div>
          </div>

          {/* DISTRIBUTION & PUBLICATION WORKFLOW CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-border/80 rounded-2xl p-5 bg-card/40">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-serif font-bold text-foreground">Portable Universe (.mcuniverse)</h3>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Full-fidelity application data package. Preserves complete worldbuilding lore, Books, chapters, Web of Thought history, and alternate continuities. Used for durable backups and moving universes between Houses and notebooks.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setPortableModalTab('export');
                    setIsPortableModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-gold-hover transition-colors"
                >
                  Export Universe
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPortableModalTab('import');
                    setIsPortableModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-border text-xs font-medium hover:bg-muted/40 transition-colors text-foreground"
                >
                  Import Universe
                </button>
              </div>
            </div>

            <div className="space-y-2 border-t sm:border-t-0 sm:border-l border-border/60 pt-4 sm:pt-0 sm:pl-5">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-serif font-bold text-foreground">Reader Publication (.md / .pdf)</h3>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Reader-facing encyclopedia export. Strips internal IDs, private author notes, and planning metadata. Includes spoiler thresholds, faction hierarchies, and optional excerpts. <em>Note: A published Lorebook cannot be imported as a Universe backup.</em>
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setIsPublicationModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                >
                  Publish Encyclopedia (.md / .pdf)
                </button>
              </div>
            </div>
          </div>

          {/* CATEGORIES GRID */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-serif font-bold text-foreground">
                Worldbuilding Categories
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('worldbuilding')}
                className="text-xs text-primary hover:underline"
              >
                View all entities →
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              {LORE_CATEGORIES.map((cat) => {
                const Icon = CATEGORY_ICONS[cat.id];
                const count = universeDocs.filter((d) => {
                  const meta = parseLoreMetadata(d);
                  return getCategoryForEntryType(meta.entry_type) === cat.id;
                }).length;

                return (
                  <div
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategoryFilter(cat.id);
                      setActiveTab('worldbuilding');
                    }}
                    className="p-4 rounded-xl border border-border/70 bg-card/50 hover:bg-card hover:border-gold-rich/60 cursor-pointer transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Icon className="w-4 h-4 text-primary" />
                        <span className="text-xs font-mono font-semibold text-muted-foreground">
                          {count}
                        </span>
                      </div>
                      <div className="text-xs font-serif font-bold text-foreground truncate">
                        {cat.label}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenCreateModal) {
                          const entryType: any =
                            cat.id === 'characters'
                              ? 'character'
                              : cat.id === 'locations'
                              ? 'location'
                              : cat.id === 'factions'
                              ? 'faction'
                              : cat.id === 'rules'
                              ? 'rule'
                              : cat.id === 'cultures'
                              ? 'culture'
                              : cat.id === 'artifacts'
                              ? 'artifact'
                              : cat.id === 'events'
                              ? 'event'
                              : 'other';
                          onOpenCreateModal({ universeId, entryType, action: 'add_to_universe' });
                        } else {
                          onCreateEntity(cat.id);
                        }
                      }}
                      className="mt-3 text-[11px] text-primary/80 hover:text-primary inline-flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add {cat.singularLabel}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* BOOKS SUMMARY SECTION */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-serif font-bold text-foreground">Books &amp; Stories</h2>
              <button
                type="button"
                onClick={() => {
                  if (onOpenCreateModal) {
                    onOpenCreateModal({ universeId, entryType: 'book', action: 'add_to_universe' });
                  } else {
                    setIsCreatingBook(true);
                  }
                }}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                New Book
              </button>
            </div>

            {books.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-border/80 rounded-2xl bg-card/20 space-y-2 text-xs">
                <BookOpen className="w-6 h-6 mx-auto text-muted-foreground/60" />
                <div className="font-semibold text-foreground">No books created yet</div>
                <p className="text-muted-foreground max-w-xs mx-auto">
                  Create a Book to begin writing stories and chapters set within {universe.name}.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenCreateModal) {
                      onOpenCreateModal({ universeId, entryType: 'book', action: 'add_to_universe' });
                    } else {
                      setIsCreatingBook(true);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-gold-hover transition-colors inline-block mt-2"
                >
                  Create First Book
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {books.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => handleSelectBook(b.id)}
                    className="p-4 rounded-xl border border-border/70 bg-card/60 hover:bg-card hover:border-gold-rich/50 cursor-pointer transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <h3 className="font-serif font-bold text-foreground truncate">{b.name}</h3>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase bg-muted text-muted-foreground">
                          {b.continuity}
                        </span>
                      </div>
                      {b.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {b.description}
                        </p>
                      )}
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-primary">
                      <span>Open Book &amp; Chapters</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. WORLDBUILDING VIEW */}
      {/* ======================================================== */}
      {activeTab === 'worldbuilding' && (
        <div className="space-y-4">
          {/* SEARCH & CATEGORY BAR */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search entities in this universe..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto text-xs pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter('all')}
                className={cn(
                  'px-2.5 py-1 rounded-lg transition-colors shrink-0',
                  selectedCategoryFilter === 'all'
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted/40'
                )}
              >
                All ({universeDocs.length})
              </button>
              {LORE_CATEGORIES.map((cat) => {
                const count = universeDocs.filter((d) => {
                  const meta = parseLoreMetadata(d);
                  return getCategoryForEntryType(meta.entry_type) === cat.id;
                }).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(cat.id)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg transition-colors shrink-0',
                      selectedCategoryFilter === cat.id
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-muted-foreground hover:bg-muted/40'
                    )}
                  >
                    {cat.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* ENTITIES LIST */}
          {filteredEntities.length === 0 ? (
            <div className="p-10 text-center border border-dashed border-border/80 rounded-2xl bg-card/20 space-y-3">
              <Layers className="w-7 h-7 mx-auto text-muted-foreground/60" />
              <div className="text-sm font-serif font-semibold text-foreground">
                No entities found
              </div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {selectedCategoryFilter === 'all'
                  ? `Begin worldbuilding in ${universe.name} by creating characters, locations, or factions.`
                  : `No ${selectedCategoryFilter} created in this universe yet.`}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (onOpenCreateModal) {
                    const filter = selectedCategoryFilter === 'all' ? 'characters' : selectedCategoryFilter;
                    const entryType: any =
                      filter === 'characters'
                        ? 'character'
                        : filter === 'locations'
                        ? 'location'
                        : filter === 'factions'
                        ? 'faction'
                        : filter === 'rules'
                        ? 'rule'
                        : filter === 'cultures'
                        ? 'culture'
                        : filter === 'artifacts'
                        ? 'artifact'
                        : filter === 'events'
                        ? 'event'
                        : 'other';
                    onOpenCreateModal({ universeId, entryType, action: 'add_to_universe' });
                  } else {
                    onCreateEntity(selectedCategoryFilter === 'all' ? 'characters' : selectedCategoryFilter);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-gold-hover transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Entity Now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {filteredEntities.map((doc) => {
                const meta = parseLoreMetadata(doc);
                const cat = getCategoryForEntryType(meta.entry_type);
                const Icon = CATEGORY_ICONS[cat];

                return (
                  <div
                    key={doc.id}
                    onClick={() => onOpenDocument(doc.id)}
                    className="p-4 rounded-xl border border-border/70 bg-card/60 hover:bg-card hover:border-gold-rich/60 cursor-pointer transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Icon className="w-3.5 h-3.5 text-primary" />
                          <span className="capitalize">{meta.entry_type || 'Lore'}</span>
                        </div>
                        {meta.canon_status && (
                          <span
                            className={cn(
                              'text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase',
                              meta.canon_status === 'canon'
                                ? 'border-emerald-800 text-emerald-400 bg-emerald-950/20'
                                : 'border-amber-800 text-amber-400 bg-amber-950/20'
                            )}
                          >
                            {meta.canon_status}
                          </span>
                        )}
                      </div>

                      <h3 className="font-serif font-bold text-foreground group-hover:text-gold-rich transition-colors text-sm truncate">
                        {doc.title}
                      </h3>
                    </div>

                    <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{new Date(doc.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      <span className="text-primary group-hover:underline inline-flex items-center gap-1">
                        Open <ExternalLink className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. BOOKS VIEW */}
      {/* ======================================================== */}
      {activeTab === 'books' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-serif font-bold text-foreground">
                Books &amp; Narrative Stories
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Books group narrative chapters and story timelines inside this Universe.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (onOpenCreateModal) {
                  onOpenCreateModal({ universeId, entryType: 'book', action: 'add_to_universe' });
                } else {
                  setIsCreatingBook(true);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-gold-hover transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Book
            </button>
          </div>

          {books.length === 0 ? (
            <div className="p-10 text-center border border-dashed border-border/80 rounded-2xl bg-card/20 space-y-3">
              <BookOpen className="w-8 h-8 mx-auto text-muted-foreground/60" />
              <div className="text-sm font-serif font-semibold text-foreground">
                No books in {universe.name}
              </div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Create a Book to begin writing stories and chapters set within this world.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (onOpenCreateModal) {
                    onOpenCreateModal({ universeId, entryType: 'book', action: 'add_to_universe' });
                  } else {
                    setIsCreatingBook(true);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-gold-hover transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Book
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {books.map((b) => (
                <div
                  key={b.id}
                  onClick={() => handleSelectBook(b.id)}
                  className="p-5 rounded-2xl border border-border/70 bg-card/60 hover:bg-card hover:border-gold-rich/60 cursor-pointer transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h3 className="text-base font-serif font-bold text-foreground">{b.name}</h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase bg-muted text-muted-foreground">
                        {b.continuity}
                      </span>
                    </div>
                    {b.description ? (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                        {b.description}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground/60 italic">No synopsis recorded.</p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-primary font-medium">
                    <span>Manage Chapters &amp; Milestones</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {archivedBooks.length > 0 && (
            <div className="mt-8 pt-6 border-t border-border/60">
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-muted-foreground uppercase tracking-wider select-none hover:text-foreground transition-colors">
                  <FolderArchive className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                  <span>Archived Books ({archivedBooks.length})</span>
                </summary>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  Archived books are hidden from active universe navigation. Their chapters, prose, and milestones remain safely preserved and recoverable.
                </p>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {archivedBooks.map((b) => (
                    <div
                      key={b.id}
                      className="p-4 rounded-xl border border-dashed border-border/80 bg-muted/20 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h4 className="text-sm font-serif font-semibold text-foreground/85">{b.name}</h4>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase bg-muted text-muted-foreground">
                            {b.continuity}
                          </span>
                        </div>
                        {b.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{b.description}</p>
                        )}
                      </div>
                      <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleSelectBook(b.id)}
                          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                        >
                          Inspect Book
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRestoreBook(b.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium transition-colors"
                        >
                          <FolderInput className="w-3.5 h-3.5" />
                          Recover Book
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. UNIVERSE TIMELINE VIEW */}
      {/* ======================================================== */}
      {activeTab === 'timeline' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-serif font-bold text-foreground">
                Universe Shared Timeline
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Official historical events, cataclysms, and milestones across the entire world.
              </p>
            </div>
            {onSaveThought && (
              <button
                type="button"
                onClick={() => setIsAddingHistoryNode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-gold-hover transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Historical Event
              </button>
            )}
          </div>

          {/* ADD HISTORICAL EVENT FORM */}
          {isAddingHistoryNode && (
            <form
              onSubmit={handleCreateHistoryNode}
              className="p-4 rounded-xl border border-primary/40 bg-card space-y-3 text-xs"
            >
              <div className="font-semibold text-foreground">Add Historical Event:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-foreground mb-1">Event Title *</label>
                  <input
                    type="text"
                    autoFocus
                    value={historyTitle}
                    onChange={(e) => setHistoryTitle(e.target.value)}
                    placeholder="e.g. The Cataclysm of the Sundered Moon"
                    className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-muted-foreground mb-1">Historical Era (Optional)</label>
                  <input
                    type="text"
                    value={historyEra}
                    onChange={(e) => setHistoryEra(e.target.value)}
                    placeholder="e.g. Year 120, Era of Ash"
                    className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-muted-foreground mb-1">Description</label>
                <textarea
                  rows={2}
                  value={historyDesc}
                  onChange={(e) => setHistoryDesc(e.target.value)}
                  placeholder="Record the world-level historical impact of this event."
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingHistoryNode(false)}
                  className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!historyTitle.trim()}
                  className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-gold-hover transition-colors disabled:opacity-40"
                >
                  Save Historical Event
                </button>
              </div>
            </form>
          )}

          {/* TIMELINE LIST */}
          {universeTimeline.length === 0 ? (
            <div className="p-10 text-center border border-dashed border-border/80 rounded-2xl bg-card/20 space-y-3">
              <Calendar className="w-8 h-8 mx-auto text-muted-foreground/60" />
              <div className="text-sm font-serif font-semibold text-foreground">
                No historical events recorded
              </div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Shared historical events mark ancient eras, wars, and world-changing moments that every
                book in this Universe references.
              </p>
              {onSaveThought && (
                <button
                  type="button"
                  onClick={() => setIsAddingHistoryNode(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-gold-hover transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add First Historical Event
                </button>
              )}
            </div>
          ) : (
            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-border/60">
              {universeTimeline.map((node) => (
                <div
                  key={node.id}
                  className="relative p-4 rounded-xl border border-border/70 bg-card/60 hover:bg-card transition-all text-xs group space-y-1.5"
                >
                  <span className="absolute -left-[27px] top-4 w-3.5 h-3.5 rounded-full bg-background border-2 border-primary" />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-serif font-bold text-foreground text-sm">
                          {node.title}
                        </h3>
                        {node.era && (
                          <span className="text-[11px] text-muted-foreground font-mono">
                            ({node.era})
                          </span>
                        )}
                      </div>
                      <button type="button" className="help-button mt-2" onClick={() => handleNavigateToWebOfThought(universeId, node.branch_id || null, node.id, null)}>Open Chronicle &amp; World Changes</button>
                      {node.description && (
                        <p className="text-muted-foreground mt-1 leading-relaxed">
                          {node.description}
                        </p>
                      )}
                    </div>
                    {onSaveThought && (
                      <button
                        type="button"
                        onClick={() => handleArchiveHistoryNode(node.id)}
                        className="opacity-70 hover:opacity-100 focus:opacity-100 p-1 text-muted-foreground hover:text-rose-400 rounded transition-all"
                        title="Archive historical event"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. WEB OF THOUGHT VIEW (UNIVERSE STATES & CONNECTIONS)  */}
      {/* ======================================================== */}
      {(activeTab === 'web_of_thought' || activeTab === 'relationships') && (
        <div className="space-y-6">
          {/* Subview Switcher Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <h2 className="text-base font-serif font-bold text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>Web of Thought</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {wotView === 'states' && activeTab !== 'relationships'
                  ? `Inspect and assign worldbuilding entity states across ${universe.name}'s historical milestones.`
                  : `Explore connections, alliances, rivalries, and bloodlines across ${universe.name}.`}
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-muted/30 p-1 rounded-xl border border-border/60 self-start sm:self-auto text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('web_of_thought');
                  setWotView('states');
                }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all',
                  wotView === 'states' && activeTab !== 'relationships'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Universe States</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('web_of_thought');
                  setWotView('connections');
                }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all',
                  wotView === 'connections' || activeTab === 'relationships'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                )}
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Connections ({universeRelationships.length})</span>
              </button>
            </div>
          </div>

          {wotView === 'states' && activeTab !== 'relationships' ? (
            <UniverseStateExplorer
              universeId={universeId}
              universe={universe}
              plan={plan}
              documents={documents}
              activeHouse={activeHouse}
              houses={houses}
              onSaveThought={onSaveThought}
              onOpenDocument={onOpenDocument}
              onCreateEntity={onCreateEntity}
              onSaveDocument={onSaveDocument}
              onOpenBook={handleSelectBook}
              initialContinuityId={wotNavContinuityId}
              initialMilestoneId={wotNavMilestoneId}
              initialEntityId={wotNavEntityId}
            />
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-serif font-bold text-foreground">
                    World Relationships Graph
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Explore the network of alliances, kingdoms, bloodlines, and rivalries in {universe.name}.
                  </p>
                </div>

            <RelationshipFeedback actions={unlinkActions}/>
          {/* Filter by Entity */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Focus Entity:</span>
              <select
                value={relFilterEntity}
                onChange={(e) => setRelFilterEntity(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-- All Relationships --</option>
                {universeDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* VISUAL GRAPH */}
          <div className="p-4 rounded-2xl border border-border/80 bg-card/60 space-y-3">
            <div>
                <RelationshipGraph
                  key={relFilterEntity || 'all'}
                  initialFocus={relFilterEntity}
                  rows={filteredRelationships.map((r) => ({
                    relationship: r,
                    evidence: { value: r.label, kind: 'baseline', source: null, conflict: null },
                  }))}
                  documents={universeDocs}
                  universeId={universeId}
                  onOpenEntity={onOpenDocument}
                  name={getEntityTitle}
                />
            </div>
          </div>

          {/* ADD RELATIONSHIP FORM */}
          {onSaveThought && universeDocs.length >= 2 && (
            <form
              onSubmit={handleAddRelationship}
              className="p-4 rounded-xl border border-primary/30 bg-card space-y-3 text-xs"
            >
              <div className="font-semibold text-foreground">Add New Relationship:</div>

              {relError && (
                <div className="text-rose-400 bg-rose-950/30 border border-rose-600/40 p-2 rounded">
                  {relError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-muted-foreground mb-1">Source Entity</label>
                  <select
                    value={relSourceId}
                    onChange={(e) => setRelSourceId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-foreground"
                  >
                    <option value="">-- Select Source --</option>
                    {universeDocs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-muted-foreground mb-1">Relationship Label</label>
                  <input
                    type="text"
                    value={relLabel}
                    onChange={(e) => setRelLabel(e.target.value)}
                    placeholder="e.g. Rules, Allied with, Rival of"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-muted-foreground mb-1">Target Entity</label>
                  <select
                    value={relTargetId}
                    onChange={(e) => setRelTargetId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-foreground"
                  >
                    <option value="">-- Select Target --</option>
                    {universeDocs
                      .filter((d) => d.id !== relSourceId)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={relDirected}
                    onChange={(e) => setRelDirected(e.target.checked)}
                    className="rounded text-primary focus:ring-primary"
                  />
                  <span className="text-muted-foreground">Directed relationship (Source → Target)</span>
                </label>

                <button
                  type="submit"
                  disabled={relSaving || !relSourceId || !relTargetId || !relLabel.trim()}
                  className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-gold-hover transition-colors disabled:opacity-40"
                >
                  {relSaving ? 'Connecting...' : 'Create Relationship'}
                </button>
              </div>
            </form>
          )}

          {/* RELATIONSHIPS TABLE */}
          {filteredRelationships.length > 0 && (
            <div className="border border-border/70 rounded-xl overflow-hidden bg-card/40 text-xs">
              <div className="p-3 bg-muted/20 border-b border-border/60 font-semibold text-foreground">
                All Recorded Relationships ({filteredRelationships.length})
              </div>
              <div className="divide-y divide-border/40">
                {filteredRelationships.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-muted/20 group"
                  >
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenDocument(r.source_id)}
                        className="font-serif font-semibold text-foreground hover:text-primary hover:underline"
                      >
                        {getEntityTitle(r.source_id)}
                      </button>
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono text-[11px]">
                        {r.label} {r.directed ? '→' : '↔'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenDocument(r.target_id)}
                        className="font-serif font-semibold text-foreground hover:text-primary hover:underline"
                      >
                        {getEntityTitle(r.target_id)}
                      </button>
                    </div>

                    {onSaveThought && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRelationship(r.id)}
                        className="opacity-70 hover:opacity-100 focus:opacity-100 p-1 text-muted-foreground hover:text-rose-400 rounded transition-all"
                        title="Archive relationship"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
            </div>
          )}
        </div>
      )}

      {plan&&<UniverseSafety key={universeId} plan={plan} universeId={universeId} documents={documents} save={onSaveThought} onBackup={onRequestBackup}/>}

      {/* CREATE BOOK MODAL */}
      {isCreatingBook && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4">
            <h2 className="text-base font-serif font-bold text-foreground">
              Create Book in {universe.name}
            </h2>

            <form onSubmit={handleCreateBook} className="space-y-4 text-xs">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  Book Title <span className="text-primary">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newBookTitle}
                  onChange={(e) => setNewBookTitle(e.target.value)}
                  placeholder="e.g. The Fall of Eryndor, Book I"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  Continuity Classification
                </label>
                <select
                  value={newBookContinuity}
                  onChange={(e) => setNewBookContinuity(e.target.value as Continuity)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                >
                  <option value="canonical">Canonical (Official Universe History)</option>
                  <option value="alternate">Alternate (What-If Timeline)</option>
                  <option value="standalone">Standalone (Independent Story)</option>
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {newBookContinuity === 'canonical' &&
                    'Canonical books can promote milestones to shared world history.'}
                  {newBookContinuity === 'alternate' &&
                    'Alternate books diverge and do not alter official world history.'}
                  {newBookContinuity === 'standalone' &&
                    'Standalone books are independent adventures without shared timeline changes.'}
                </p>
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  Description / Synopsis (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newBookDesc}
                  onChange={(e) => setNewBookDesc(e.target.value)}
                  placeholder="A brief overview of the plot or conflict."
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingBook(false)}
                  className="px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bookCreating || !newBookTitle.trim()}
                  className="px-5 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-gold-hover transition-colors disabled:opacity-40"
                >
                  {bookCreating ? 'Creating...' : 'Create Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PORTABLE UNIVERSE MODAL (EXPORT / IMPORT / RECOVERY) */}
      <PortableUniverseModal
        isOpen={isPortableModalOpen}
        onClose={() => setIsPortableModalOpen(false)}
        universeId={universeId}
        activeHouse={activeHouse}
        houses={houses}
        plan={plan}
        documents={documents}
        onSelectUniverse={(uid) => {
          if (onSelectUniverse) {
            onSelectUniverse(uid);
          }
        }}
        onFlushSave={onFlushSave}
        onRefreshLibrary={onRefreshLibrary}
        initialTab={portableModalTab}
      />

      {/* LOREBOOK PUBLICATION MODAL (MARKDOWN / PDF) */}
      <LorebookPublicationModal
        isOpen={isPublicationModalOpen}
        onClose={() => setIsPublicationModalOpen(false)}
        universeId={universeId}
        plan={plan}
        documents={documents}
        onFlushSave={onFlushSave}
      />
    </div>
  );
};
