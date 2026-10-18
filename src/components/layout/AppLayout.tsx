import React, { useState, useEffect } from 'react';
import {
  Search,
  Settings,
  Plus,
  Trash2,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Check,
  Clock,
  Tag,
  FolderOpen,
  AlertCircle,
  Star,
} from 'lucide-react';
import { DocumentOrganization } from '@/components/common/DocumentOrganization';
import { TagManager } from '@/components/common/TagManager';
import { api } from '@/services/api';
import { selectLibrary, workshop, type LibraryView, type LibrarySort, type OrganizationPatch } from '@/utils/organization';
import type { SearchResult } from '@/types';
import { DocumentMetadata, DocumentType, DocumentDetail, LibraryInfo, SaveStatus } from '@/types';
import { PoetryStudio } from '@/components/studios/PoetryStudio';
import { PhilosophyStudio } from '@/components/studios/PhilosophyStudio';
import { LorebookStudio } from '@/components/studios/LorebookStudio';
import { BrandSquareIcon, StudioIcon } from '@/components/common/BrandIcon';
import { cn } from '@/utils/cn';

interface AppLayoutProps {
  documents: DocumentMetadata[];
  activeDocument: DocumentDetail | null;
  selectedCategory: DocumentType | 'all';
  onSelectCategory: (category: DocumentType | 'all') => void;
  onSelectDocument: (id: string, docType?: DocumentType) => void;
  onOpenCreateModal: (defaultType?: DocumentType) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onSaveDocument: (content: string, metadataJson?: string) => Promise<void> | void;
  onRetrySave?: () => Promise<boolean>;
  onRenameDocument: (id: string, newTitle: string) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  onUpdateOrganization: (id: string, patch: OrganizationPatch) => Promise<boolean>;
  onManageTag: (oldName: string, newName?: string) => Promise<boolean>;
  organizationBusy: boolean;
  tagCatalog: string[];
  onCancelOrganization: () => void;
  saveStatus: SaveStatus;
  libraryInfo: LibraryInfo | null;
  isLoadingDoc?: boolean;
  onCreateDocument?: (
    docType: DocumentType,
    title: string,
    initialContent?: string,
    metadataJson?: string,
    tags?: string[]
  ) => Promise<void>;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  documents,
  activeDocument,
  selectedCategory,
  onSelectCategory,
  onSelectDocument,
  onOpenCreateModal,
  onOpenSearch,
  onOpenSettings,
  onSaveDocument,
  onRetrySave,
  onRenameDocument,
  onDeleteDocument,
  saveStatus,
  onUpdateOrganization,
  onManageTag,
  organizationBusy,
  tagCatalog,
  onCancelOrganization,
  libraryInfo,
  isLoadingDoc = false,
  onCreateDocument,
}) => {
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);
  const [isSecondaryCollapsed, setIsSecondaryCollapsed] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [view, setView] = useState<LibraryView>('all');
  const [sort, setSort] = useState<LibrarySort>('modified');
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | undefined>();
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searchRetry, setSearchRetry] = useState(0);

  useEffect(() => {
    let current = true;
    if (!filterQuery.trim()) { setSearchResults(undefined); setSearching(false); setSearchError(false); return; }
    setSearching(true);
    setSearchError(false);
    setSearchResults([]);
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchDocuments(filterQuery.trim());
        if (current) setSearchResults(results);
      } catch {
        if (current) { setSearchResults([]); setSearchError(true); }
      } finally { if (current) setSearching(false); }
    }, 150);
    return () => { current = false; clearTimeout(timer); };
  }, [filterQuery, documents, searchRetry]);

  // Editable document title in header
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');

  useEffect(() => {
    if (activeDocument) {
      setTitleValue(activeDocument.metadata.title);
      setEditingTitle(false);
    }
  }, [activeDocument?.metadata.id]);

  const handleTitleBlur = async () => {
    setEditingTitle(false);
    if (activeDocument && titleValue.trim() && titleValue.trim() !== activeDocument.metadata.title) {
      await onRenameDocument(activeDocument.metadata.id, titleValue.trim());
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleBlur();
    } else if (e.key === 'Escape') {
      setTitleValue(activeDocument ? activeDocument.metadata.title : '');
      setEditingTitle(false);
    }
  };

  const filteredDocs = selectLibrary(documents, { studio: selectedCategory, tags: selectedTags, view, sort, query: filterQuery }, searchResults);
  const allTags = Array.from(new Set([...tagCatalog, ...documents.flatMap(doc => doc.tags)])).sort((a, b) => a.localeCompare(b));
  const clearFilters = () => { setSelectedTags([]); setFilterQuery(''); setView('all'); };


  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background app-atmospheric-bg text-foreground font-sans">
      {/* ======================================================== */}
      {/* ======================================================== */}
      {/* REGION A: PRIMARY SIDEBAR */}
      {/* ======================================================== */}
      <aside
        className={cn(
          'relative flex flex-col justify-between border-r border-border/80 bg-card/60 transition-all duration-200 select-none shrink-0 z-20',
          isPrimaryCollapsed ? 'w-20' : 'w-[272px]'
        )}
      >
        <div>
          {/* Brand Identity */}
          <div className="flex items-center justify-between p-3.5 border-b border-border/80">
            <div className="flex items-center overflow-hidden">
              <BrandSquareIcon className="w-11 h-11 rounded-lg" />
            </div>

            <button
              onClick={() => setIsPrimaryCollapsed(!isPrimaryCollapsed)}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-md transition-colors"
              title={isPrimaryCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              {isPrimaryCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Quick Create Button */}
          <div className="p-3">
            <button
              onClick={() => onOpenCreateModal(selectedCategory === 'all' ? 'poetry' : selectedCategory)}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-lg bg-primary text-primary-foreground font-serif font-semibold tracking-wide text-sm shadow-sm hover:bg-gold-hover hover:text-charcoal transition-all',
                isPrimaryCollapsed && 'px-0'
              )}
              title="Create New Document"
            >
              <Plus className="w-4 h-4 shrink-0" />
              {!isPrimaryCollapsed && <span>New Document</span>}
            </button>
          </div>

          {/* Primary Navigation Sections */}
          <nav className="px-2.5 space-y-1.5 mt-2">
            <button
              onClick={() => onSelectCategory('all')}
              className={cn(
                'w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-[15px] font-medium transition-colors',
                selectedCategory === 'all'
                  ? 'bg-accent/80 text-gold-rich border-l-2 border-l-gold-rich border-primary/30 font-semibold shadow-[0_0_12px_rgba(221,186,120,0.12)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
              )}
              title="All Documents"
            >
              <Layers className="w-5 h-5 shrink-0 text-muted-foreground" />
              {!isPrimaryCollapsed && (
                <>
                  <span className="flex-1 text-left truncate">All Library</span>
                  <span className="text-xs font-mono text-muted-foreground/70">{documents.length}</span>
                </>
              )}
            </button>

            <button
              onClick={() => onSelectCategory('poetry')}
              className={cn(
                'w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-[15.5px] font-medium transition-colors',
                selectedCategory === 'poetry'
                  ? 'bg-accent/80 text-gold-rich border-l-2 border-l-gold-rich border-primary/30 font-semibold shadow-[0_0_12px_rgba(221,186,120,0.12)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
              )}
              title="Poetry Studio"
            >
              <StudioIcon type="poetry" className="w-9 h-9 rounded-lg shrink-0" isActive={selectedCategory === 'poetry'} />
              {!isPrimaryCollapsed && (
                <>
                  <span className="flex-1 text-left truncate font-serif font-semibold tracking-wide">Poetry Studio</span>
                  <span className="text-xs font-mono text-muted-foreground/70">{libraryInfo?.poetry_count ?? 0}</span>
                </>
              )}
            </button>

            <button
              onClick={() => onSelectCategory('philosophy')}
              className={cn(
                'w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-[15.5px] font-medium transition-colors',
                selectedCategory === 'philosophy'
                  ? 'bg-accent/80 text-gold-rich border-l-2 border-l-gold-rich border-primary/30 font-semibold shadow-[0_0_12px_rgba(221,186,120,0.12)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
              )}
              title="Philosophy Studio"
            >
              <StudioIcon type="philosophy" className="w-9 h-9 rounded-lg shrink-0" isActive={selectedCategory === 'philosophy'} />
              {!isPrimaryCollapsed && (
                <>
                  <span className="flex-1 text-left truncate font-serif font-semibold tracking-wide">Philosophy Studio</span>
                  <span className="text-xs font-mono text-muted-foreground/70">{libraryInfo?.philosophy_count ?? 0}</span>
                </>
              )}
            </button>

            <button
              onClick={() => onSelectCategory('lorebook')}
              className={cn(
                'w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-[15.5px] font-medium transition-colors',
                selectedCategory === 'lorebook'
                  ? 'bg-accent/80 text-gold-rich border-l-2 border-l-gold-rich border-primary/30 font-semibold shadow-[0_0_12px_rgba(221,186,120,0.12)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
              )}
              title="Lorebook Studio"
            >
              <StudioIcon type="lorebook" className="w-9 h-9 rounded-lg shrink-0" isActive={selectedCategory === 'lorebook'} />
              {!isPrimaryCollapsed && (
                <>
                  <span className="flex-1 text-left truncate font-serif font-semibold tracking-wide">Lorebook Studio</span>
                  <span className="text-xs font-mono text-muted-foreground/70">{libraryInfo?.lorebook_count ?? 0}</span>
                </>
              )}
            </button>
          </nav>
        </div>

        {/* Bottom Actions: Search & Settings */}
        <div className="p-2.5 border-t border-border/60 space-y-1.5">
          <button
            onClick={onOpenSearch}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[13.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
            title="Search (Ctrl + F / K)"
          >
            <Search className="w-4 h-4 shrink-0" />
            {!isPrimaryCollapsed && (
              <>
                <span className="flex-1 text-left">Search</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted text-[11px] text-muted-foreground font-mono">Ctrl F / K</kbd>
              </>
            )}
          </button>

          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[13.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
            title="Workspace Settings"
          >
            <Settings className="w-4 h-4 shrink-0" />
            {!isPrimaryCollapsed && <span>Settings</span>}
          </button>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* REGION B: SECONDARY NAVIGATION PANEL */}
      {/* ======================================================== */}
      <aside
        className={cn(
          'relative flex flex-col border-r border-border/60 bg-card/30 transition-all duration-200 select-none shrink-0 z-10',
          isSecondaryCollapsed ? 'w-0 overflow-hidden' : 'w-80'
        )}
      >
        {/* Panel Header */}
        <div className="p-3.5 border-b border-border/60">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              {selectedCategory !== 'all' ? (
                <StudioIcon type={selectedCategory} className="w-7 h-7 rounded-md shrink-0" isActive={true} />
              ) : (
                <Layers className="w-4.5 h-4.5 text-primary shrink-0" />
              )}
              <span className="text-[15px] font-semibold uppercase tracking-wider text-muted-foreground font-serif truncate">
                {selectedCategory === 'all'
                  ? 'All Documents'
                  : selectedCategory === 'poetry'
                  ? 'Poetry Library'
                  : selectedCategory === 'philosophy'
                  ? 'Philosophical Works'
                  : 'Lorebook Entries'}
              </span>
            </div>
            <button
              onClick={() => onOpenCreateModal(selectedCategory === 'all' ? 'poetry' : selectedCategory)}
              className="text-primary hover:text-gold-hover p-1.5 rounded hover:bg-muted/40 transition-colors shrink-0"
              title="Create in category"
            >
              <Plus className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Quick Filter Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
            <input
              type="text"
              value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
              aria-label="Search library titles and writing"
              placeholder="Search titles and writing..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-background/80 border border-border/60 text-[13.5px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div role="group" aria-label="Library view" className="flex gap-1 mt-3 text-xs">
            {(['all', 'favorites', 'recent'] as const).map(value => <button key={value} aria-pressed={view === value} onClick={() => setView(value)} className={cn('flex-1 rounded py-1.5 capitalize', view === value ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/50')}>{value === 'all' ? 'All' : value}</button>)}
          </div>
          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Sort &amp; filter{selectedTags.length ? ` · ${selectedTags.length} tags` : ''}</summary>
            <div className="mt-3 max-h-48 overflow-y-auto space-y-3">
              {view === 'recent' ? <p>Most recently opened first.</p> : <label className="flex items-center justify-between gap-2">Sort by
                <select aria-label="Sort documents" value={sort} onChange={event => setSort(event.target.value as LibrarySort)} className="rounded border border-border bg-background text-foreground p-1.5">
                  <option value="modified">Last modified</option><option value="created">Date created</option><option value="title-asc">Title A–Z</option><option value="title-desc">Title Z–A</option>
                </select>
              </label>}
              <p>Match every selected tag</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by tags">
                {Array.from(new Set([...allTags, ...selectedTags])).map(tag => <button key={tag} aria-pressed={selectedTags.includes(tag)} onClick={() => setSelectedTags(previous => previous.includes(tag) ? previous.filter(value => value !== tag) : [...previous, tag])} className={cn('px-2 py-1 rounded break-all border', selectedTags.includes(tag) ? 'bg-primary/15 text-primary border-primary/40' : 'bg-muted/40 border-transparent')}><Tag className="inline w-3 h-3 mr-1" />{tag}</button>)}
                {!allTags.length && <p>No tags yet. Add one from a document.</p>}
              </div>
              <button onClick={() => setTagManagerOpen(true)} className="text-primary hover:underline">Manage library tags</button>
            </div>
          </details>
          {(filterQuery || selectedTags.length > 0 || view !== 'all') && <button onClick={clearFilters} className="text-xs text-primary mt-2 hover:underline">Clear filters</button>}
          <p role="status" className="text-xs text-muted-foreground mt-2">{searching ? 'Searching…' : searchError ? 'Search unavailable.' : `${filteredDocs.length} documents`}
            {searchError && <button onClick={() => setSearchRetry(value => value + 1)} className="ml-2 text-primary underline">Retry search</button>}
          </p>
          {!activeDocument && organizationBusy && saveStatus === 'error' && <div role="alert" className="text-xs text-rose-500 mt-2">
            Organization update not saved.
            <div className="flex gap-3 mt-1"><button onClick={() => onRetrySave?.()} className="underline">Retry</button><button onClick={onCancelOrganization} className="underline">Cancel pending update</button></div>
          </div>}
        </div>

        {/* Document List */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {filteredDocs.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <FolderOpen className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <div className="text-sm font-medium text-foreground">No documents found</div>
              <p className="text-xs text-muted-foreground mt-1">
                {searching ? 'Searching your writing…' : view === 'recent' ? 'Documents appear here when you open them.' : view === 'favorites' ? 'Star a document to keep it close.' : filterQuery || selectedTags.length ? 'Try clearing filters or choosing fewer tags.' : 'Create your first piece to begin writing'}
              </p>
              <button
                onClick={() => onOpenCreateModal(selectedCategory === 'all' ? 'poetry' : selectedCategory)}
                className="mt-3 text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Create now
              </button>
            </div>
          ) : (
            filteredDocs.map(doc => {
              const isActive = activeDocument?.metadata.id === doc.id;
              return (
                <div
                  key={doc.id}
                  onClick={() => onSelectDocument(doc.id)}
                  className={cn(
                    'group relative flex items-start gap-2.5 p-3 rounded-xl cursor-pointer transition-all border',
                    isActive
                      ? 'bg-accent border-primary/40 text-accent-foreground shadow-sm'
                      : 'border-transparent hover:bg-accent/40 text-foreground/80'
                  )}
                >
                  <div className="pt-1.5 shrink-0">
                    <span
                      className={cn(
                        'w-2.5 h-2.5 rounded-full inline-block transition-colors',
                        isActive ? 'bg-primary shadow-sm shadow-primary/50' : 'bg-muted-foreground/40 group-hover:bg-primary/70'
                      )}
                    />
                  </div>

                  <div className="flex-1 min-w-0 pr-6">
                    <button onClick={event => { event.stopPropagation(); onSelectDocument(doc.id); }} className="block text-left w-full text-[14.5px] font-medium truncate leading-tight font-serif tracking-wide text-foreground focus-visible:outline-primary">{doc.title}</button>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                      <span className="uppercase text-[10.5px] font-mono tracking-wider text-muted-foreground/80">{doc.doc_type}</span>
                      <span>•</span>
                      <span title={view === 'recent' ? 'Last opened' : 'Last modified'}>{new Date(view === 'recent' ? workshop(doc).last_opened_at! : doc.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      {doc.tags.length > 0 && (
                        <>
                          <span>•</span>
                          <span title={doc.tags.join(', ')} className="truncate max-w-[120px]">#{doc.tags[0]}{doc.tags.length > 1 ? ` +${doc.tags.length - 1}` : ''}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <button disabled={organizationBusy} aria-label={`${workshop(doc).favorite ? 'Unstar' : 'Star'} ${doc.title}`} aria-pressed={workshop(doc).favorite}
                    onClick={event => { event.stopPropagation(); void onUpdateOrganization(doc.id, { favorite: !workshop(doc).favorite }); }}
                    className="absolute right-2 bottom-2 p-1.5 rounded text-primary hover:bg-primary/10 disabled:opacity-40">
                    <Star className="w-3.5 h-3.5" fill={workshop(doc).favorite ? 'currentColor' : 'none'} />
                  </button>
                  {/* Delete Action on Hover */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (window.confirm(`Archive "${doc.title}" to Backups?`)) {
                        onDeleteDocument(doc.id);
                      }
                    }}
                    className="absolute right-2 top-2 p-1.5 rounded text-muted-foreground/60 hover:text-rose-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                    title="Delete document"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ======================================================== */}
      {/* REGION C: MAIN EDITOR WORKSPACE */}
      {/* ======================================================== */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        {activeDocument ? (
          <>
            {/* Top Workspace Header */}
            <div className="flex items-center justify-between px-7 py-3 border-b border-border/80 bg-card/20 shrink-0">
              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                {/* Secondary Sidebar Toggle */}
                <button
                  onClick={() => setIsSecondaryCollapsed(!isSecondaryCollapsed)}
                  className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted/40 transition-colors"
                  title="Toggle Document Navigator"
                >
                  <Layers className="w-4.5 h-4.5" />
                </button>

                {/* Document Type Badge */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-primary/30 bg-accent/70 text-gold-rich shrink-0 shadow-sm">
                  <StudioIcon type={activeDocument.metadata.doc_type} className="w-6 h-6 rounded-md shrink-0" isActive={true} />
                  <span className="text-[13px] font-serif uppercase tracking-wider font-semibold text-gold-rich">
                    {activeDocument.metadata.doc_type}
                  </span>
                </div>

                {/* Inline Editable Document Title */}
                {editingTitle ? (
                  <input
                    type="text"
                    value={titleValue}
                    autoFocus
                    onChange={e => setTitleValue(e.target.value)}
                    onBlur={handleTitleBlur}
                    onKeyDown={handleTitleKeyDown}
                    aria-label="Active document title"
                    className="text-lg font-serif font-semibold text-foreground bg-muted/60 px-2.5 py-1 rounded-md border border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 flex-1 max-w-md transition-all shadow-sm"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingTitle(true)}
                    aria-label="Click to rename document"
                    className="group/title flex items-center gap-2 cursor-pointer py-1 px-2 rounded-md hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 text-left"
                    title="Click to rename document"
                  >
                    <span className="text-lg font-serif font-semibold text-foreground truncate max-w-md tracking-wide">
                      {activeDocument.metadata.title}
                    </span>
                    <Edit2 className="w-4 h-4 text-muted-foreground opacity-40 group-hover/title:opacity-100 group-hover/title:text-primary transition-all" />
                  </button>
                )}
              </div>

              {/* Autosave Status Indicator */}
              <div className="flex items-center gap-3">
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-1.5 text-xs select-none"
                >
                  {saveStatus === 'saved' && (
                    <div className="flex items-center gap-1.5 text-emerald-500 dark:text-emerald-400" title="All changes saved to disk">
                      <Check className="w-4 h-4" />
                      <span className="text-xs font-medium">Saved</span>
                    </div>
                  )}
                  {saveStatus === 'saving' && (
                    <div className="flex items-center gap-1.5 text-sky-500 dark:text-sky-400" title="Saving changes...">
                      <Clock className="w-4 h-4 animate-spin" />
                      <span className="text-xs font-medium">Saving...</span>
                    </div>
                  )}
                  {(saveStatus === 'editing' || saveStatus === 'unsaved') && (
                    <div className="flex items-center gap-1.5 text-primary dark:text-primary" title="Unsaved changes (saving automatically)">
                      <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse inline-block" />
                      <span className="text-xs font-medium">Editing</span>
                    </div>
                  )}
                  {saveStatus === 'error' && (
                    <div className="flex items-center gap-1.5 text-rose-500 dark:text-rose-400">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-xs font-medium">Save Error</span>
                      {organizationBusy && <button onClick={onCancelOrganization} title="Cancel queued organization changes. Completed changes stay; writing is retained." className="text-[11px] underline ml-1">Cancel organization update</button>}
                      {onRetrySave && (
                        <button
                          type="button"
                          onClick={() => onRetrySave()}
                          className="text-[11px] underline font-semibold hover:text-rose-600 dark:hover:text-rose-300 ml-1 px-1.5 py-0.5 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500"
                          title="Retry saving document (Ctrl+S)"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DocumentOrganization key={activeDocument.metadata.id} document={activeDocument.metadata} tags={allTags} busy={organizationBusy} onUpdate={onUpdateOrganization} />
            {/* Specialized Studio Body / Document Loading State */}
            {isLoadingDoc ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground animate-in fade-in duration-150">
                <Clock className="w-6 h-6 animate-spin text-primary mb-2" />
                <span className="text-xs font-medium">Opening document...</span>
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                {activeDocument.metadata.doc_type === 'poetry' && (
                  <PoetryStudio
                    document={activeDocument}
                    onSave={onSaveDocument}
                    saveStatus={saveStatus}
                    onCreateNewPoem={
                      onCreateDocument
                        ? async (title, content, meta, tags) => {
                            await onCreateDocument('poetry', title, content, meta, tags);
                          }
                        : undefined
                    }
                  />
                )}
                {activeDocument.metadata.doc_type === 'philosophy' && (
                  <PhilosophyStudio
                    document={activeDocument}
                    onSave={onSaveDocument}
                    saveStatus={saveStatus}
                  />
                )}
                {activeDocument.metadata.doc_type === 'lorebook' && (
                  <LorebookStudio
                    document={activeDocument}
                    onSave={onSaveDocument}
                    saveStatus={saveStatus}
                  />
                )}
              </div>
            )}
          </>
        ) : (
          /* Empty Workspace State */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
            <BrandSquareIcon className="w-32 h-32 rounded-3xl mb-6 shadow-xl" />
            <h2 className="text-4xl font-serif font-bold tracking-wide text-foreground">
              MetaCognition Notebook
            </h2>
            <p className="text-base text-muted-foreground max-w-lg mt-3 leading-relaxed font-sans">
              A universal workspace designed for poetic rhythm, philosophical inquiry, and conceptual worldbuilding.
            </p>

            <div className="grid grid-cols-3 gap-6 mt-10 max-w-3xl w-full">
              <div
                onClick={() => onOpenCreateModal('poetry')}
                className="p-7 rounded-2xl border border-border/80 bg-card/60 hover:bg-card hover:border-gold-rich/70 hover:shadow-[0_0_20px_rgba(221,186,120,0.18)] cursor-pointer transition-all text-left group"
              >
                <StudioIcon type="poetry" className="w-20 h-20 rounded-2xl mb-4 shrink-0 group-hover:scale-105 transition-transform" isActive={true} />
                <div className="text-lg font-semibold text-foreground font-serif tracking-wide group-hover:text-gold-rich transition-colors">Poetry Studio</div>
                <div className="text-sm text-muted-foreground mt-2 leading-relaxed">Stanzas, lines, meter, and exact cadence.</div>
              </div>

              <div
                onClick={() => onOpenCreateModal('philosophy')}
                className="p-7 rounded-2xl border border-border/80 bg-card/60 hover:bg-card hover:border-gold-rich/70 hover:shadow-[0_0_20px_rgba(221,186,120,0.18)] cursor-pointer transition-all text-left group"
              >
                <StudioIcon type="philosophy" className="w-20 h-20 rounded-2xl mb-4 shrink-0 group-hover:scale-105 transition-transform" isActive={true} />
                <div className="text-lg font-semibold text-foreground font-serif tracking-wide group-hover:text-gold-rich transition-colors">Philosophy Studio</div>
                <div className="text-sm text-muted-foreground mt-2 leading-relaxed">Dialectics, premises, arguments, and objections.</div>
              </div>

              <div
                onClick={() => onOpenCreateModal('lorebook')}
                className="p-7 rounded-2xl border border-border/80 bg-card/60 hover:border-gold-rich/70 hover:shadow-[0_0_20px_rgba(221,186,120,0.18)] cursor-pointer transition-all text-left group"
              >
                <StudioIcon type="lorebook" className="w-20 h-20 rounded-2xl mb-4 shrink-0 group-hover:scale-105 transition-transform" isActive={true} />
                <div className="text-lg font-semibold text-foreground font-serif tracking-wide group-hover:text-gold-rich transition-colors">Lorebook Studio</div>
                <div className="text-sm text-muted-foreground mt-2 leading-relaxed">Cosmologies, factions, characters, and canon.</div>
              </div>
            </div>

            <div className="mt-9 text-[13px] text-muted-foreground flex items-center gap-4">
              <span>Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-foreground font-mono text-xs">Ctrl + S</kbd> to save</span>
              <span>•</span>
              <span>Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-foreground font-mono text-xs">Ctrl + F</kbd> to search</span>
              <span>•</span>
              <span>Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-foreground font-mono text-xs">Ctrl + N</kbd> for new document</span>
            </div>
          </div>
        )}
      </main>
      {tagManagerOpen && <TagManager tags={allTags} busy={organizationBusy} onClose={() => setTagManagerOpen(false)} onChange={async (oldName, newName) => {
        const saved = await onManageTag(oldName, newName);
        if (saved) setSelectedTags(previous => Array.from(new Set(previous.flatMap(tag => tag === oldName ? newName === undefined ? [] : [newName.trim()] : [tag]))));
        return saved;
      }} />}
    </div>
  );
};
