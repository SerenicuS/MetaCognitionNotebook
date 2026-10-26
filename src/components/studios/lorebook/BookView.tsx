import { api } from '@/services/api';
import React, { useState, useRef, useCallback } from 'react';
import type { DocumentMetadata, SaveStatus } from '@/types';
import type { Book, Continuity, Plan, StoryNode, Thought, Universe } from '@/utils/thought';
import {
  timeline,
  newNode,
  insertNode,
  moveNode,
  archiveNode,
  promote,
} from '@/utils/thought';
import {
  getChaptersForBook,
  updateBookInPlan,
  parseLoreMetadata,
  setBookArchived,
} from '@/utils/universe';
import {
  BookOpen,
  ArrowLeft,
  Plus,
  ArrowUp,
  ArrowDown,
  Calendar,
  CheckCircle2,
  Trash2,
  FileText,
  ExternalLink,
  FolderArchive,
  FolderInput,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { MarkdownEditor, type EditorEngine } from '@/components/editor/MarkdownEditor';

interface BookViewProps {
  book: Book;
  universe: Universe;
  plan: Plan;
  documents: DocumentMetadata[];
  onSaveThought?: (
    expected: () => number,
    plan: import('@/utils/relationships').PlanMutation,
    acknowledge: (result: Thought) => void
  ) => Promise<boolean>;
  onCreateChapter: (bookId: string, chapterTitle: string, order: number) => Promise<void>;
  onSaveDocument?: (
    id: string,
    content?: string,
    title?: string,
    tags?: string[],
    metadataJson?: string,
    options?: { isMetadataOnly?: boolean }
  ) => Promise<void>;
  onOpenDocument: (docId: string) => void;
  onBackToUniverse: () => void;
}

const CONTINUITY_CONFIG: Record<
  Continuity,
  { label: string; badgeClass: string; description: string }
> = {
  canonical: {
    label: 'Canonical Book',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-700/60',
    description:
      'The official narrative history of this Universe. Milestones can be explicitly promoted to shared Universe history.',
  },
  alternate: {
    label: 'Alternate Timeline',
    badgeClass: 'bg-violet-950/40 text-violet-400 border-violet-700/60',
    description:
      'Explores a "what if?" timeline or divergence. Does not alter canonical Universe history.',
  },
  standalone: {
    label: 'Standalone Story',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-700/60',
    description:
      'An independent story within the world. Story milestones do not publish shared events.',
  },
};

export const BookView: React.FC<BookViewProps> = ({
  book,
  universe,
  plan,
  documents,
  onSaveThought,
  onCreateChapter,
  onSaveDocument,
  onOpenDocument,
  onBackToUniverse,
}) => {
  const [activeTab, setActiveTab] = useState<'chapters' | 'timeline'>('chapters');
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [title, setTitle] = useState(book.name);
  const [description, setDescription] = useState(book.description || '');
  const [continuity, setContinuity] = useState<Continuity>(book.continuity);

  // In-situ Chapter Writing state
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [chapterContent, setChapterContent] = useState<string>('');
  const [chapterLoading, setChapterLoading] = useState<boolean>(false);
  const [chapterSaveStatus, setChapterSaveStatus] = useState<SaveStatus>('saved');
  const [editorEngine, setEditorEngine] = useState<EditorEngine>(() => {
    if (typeof localStorage !== 'undefined') {
      return (localStorage.getItem('mc_editor_engine') as EditorEngine) || 'codemirror';
    }
    return 'codemirror';
  });

  // Chapter Creation state
  const [isAddingChapter, setIsAddingChapter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [chapterCreating, setChapterCreating] = useState(false);
  const [chapterError, setChapterError] = useState('');

  // Milestone Creation state
  const [isAddingMilestone, setIsAddingMilestone] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDesc, setMilestoneDesc] = useState('');
  const [milestoneEra, setMilestoneEra] = useState('');
  const [milestonePosition, setMilestonePosition] = useState<'start' | 'end'>('end');
  const [milestoneStatus, setMilestoneStatus] = useState<'planned' | 'drafted' | 'written'>('planned');

  // Promotion Confirmation
  const [promotionTarget, setPromotionTarget] = useState<StoryNode | null>(null);
  const [promotedSuccess, setPromotedSuccess] = useState('');

  const chapters = getChaptersForBook(documents, book.id, book.name);
  const bookTimeline = timeline(plan, universe.id, book.id);
  const activeChapterDoc = chapters.find((c) => c.id === activeChapterId) || null;

  const chapterSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chapterContentRef = useRef<string>(chapterContent);
  chapterContentRef.current = chapterContent;

  const flushChapterSave = useCallback(
    async (contentToSave?: string) => {
      if (!activeChapterId || !onSaveDocument) return;
      const currentDoc = chapters.find((c) => c.id === activeChapterId);
      if (!currentDoc) return;

      const content = contentToSave !== undefined ? contentToSave : chapterContentRef.current;
      setChapterSaveStatus('saving');
      try {
        await onSaveDocument(
          activeChapterId,
          content,
          currentDoc.title,
          currentDoc.tags,
          currentDoc.metadata_json || undefined
        );
        setChapterSaveStatus('saved');
      } catch (err) {
        console.error('Chapter save failed:', err);
        setChapterSaveStatus('error');
      }
    },
    [activeChapterId, onSaveDocument, chapters]
  );

  const handleOpenChapterInView = async (chapterId: string) => {
    if (chapterSaveTimeoutRef.current) {
      clearTimeout(chapterSaveTimeoutRef.current);
      await flushChapterSave();
    }

    setActiveChapterId(chapterId);
    setChapterLoading(true);
    setChapterSaveStatus('saved');

    try {
      const detail = await api.getDocument(chapterId);
      setChapterContent(detail.content);
      chapterContentRef.current = detail.content;
    } catch (err) {
      console.error('Failed to load chapter prose:', err);
    } finally {
      setChapterLoading(false);
    }
  };

  const handleChapterContentChange = (newContent: string) => {
    setChapterContent(newContent);
    chapterContentRef.current = newContent;
    setChapterSaveStatus('editing');

    if (chapterSaveTimeoutRef.current) {
      clearTimeout(chapterSaveTimeoutRef.current);
    }

    chapterSaveTimeoutRef.current = setTimeout(async () => {
      await flushChapterSave(newContent);
    }, 1500);
  };

  const handleChapterManualSave = async () => {
    if (chapterSaveTimeoutRef.current) {
      clearTimeout(chapterSaveTimeoutRef.current);
    }
    await flushChapterSave();
  };

  const handleCloseChapterView = async () => {
    if (chapterSaveTimeoutRef.current) {
      clearTimeout(chapterSaveTimeoutRef.current);
      await flushChapterSave();
    }
    setActiveChapterId(null);
  };

  const handleArchiveBook = async () => {
    if (!onSaveThought) return;
    const confirmed = window.confirm(
      `Archive book "${book.name}"?\n\nChapters, prose, and milestones will remain safely preserved and can be recovered at any time from the Universe Dashboard.`
    );
    if (!confirmed) return;

    const updatedPlan = setBookArchived(plan, book.id, true);
    await onSaveThought(
      () => plan.revision,
      updatedPlan,
      () => {}
    );
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('mc_selected_book_id');
    }
    onBackToUniverse();
  };

  const handleRecoverBook = async () => {
    if (!onSaveThought) return;
    const updatedPlan = setBookArchived(plan, book.id, false);
    await onSaveThought(
      () => plan.revision,
      updatedPlan,
      () => {}
    );
  };

  const handleSaveMetadata = async () => {
    if (!onSaveThought) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    const updatedPlan = updateBookInPlan(plan, book.id, {
      name: cleanTitle,
      description: description.trim() || undefined,
      continuity,
    });

    await onSaveThought(
      () => plan.revision,
      updatedPlan,
      () => {}
    );
    setIsEditingMetadata(false);
  };

  const handleCreateChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = newChapterTitle.trim();
    if (!cleanTitle) {
      setChapterError('Please enter a chapter title.');
      return;
    }

    setChapterCreating(true);
    setChapterError('');
    try {
      const nextOrder = chapters.length + 1;
      await onCreateChapter(book.id, cleanTitle, nextOrder);
      setNewChapterTitle('');
      setIsAddingChapter(false);
    } catch (err: any) {
      setChapterError(err?.message || 'Failed to create chapter.');
    } finally {
      setChapterCreating(false);
    }
  };

  const handleMoveChapter = async (chapIndex: number, direction: 'up' | 'down') => {
    if (!onSaveDocument) return;
    const targetIndex = direction === 'up' ? chapIndex - 1 : chapIndex + 1;
    if (targetIndex < 0 || targetIndex >= chapters.length) return;

    const currentDoc = chapters[chapIndex];
    const targetDoc = chapters[targetIndex];

    const currentMeta = parseLoreMetadata(currentDoc);
    const targetMeta = parseLoreMetadata(targetDoc);

    const newCurrentMeta = { ...currentMeta, chapter_order: targetIndex + 1 };
    const newTargetMeta = { ...targetMeta, chapter_order: chapIndex + 1 };

    // F-02: Fetch full document details to preserve canonical Markdown prose
    const [currentDetail, targetDetail] = await Promise.all([
      api.getDocument(currentDoc.id),
      api.getDocument(targetDoc.id),
    ]);

    await Promise.all([
      onSaveDocument(currentDoc.id, currentDetail.content, currentDoc.title, currentDoc.tags, JSON.stringify(newCurrentMeta), { isMetadataOnly: true }),
      onSaveDocument(targetDoc.id, targetDetail.content, targetDoc.title, targetDoc.tags, JSON.stringify(newTargetMeta), { isMetadataOnly: true }),
    ]);
  };

  const handleCreateMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveThought) return;
    const cleanTitle = milestoneTitle.trim();
    if (!cleanTitle) return;

    const afterId =
      milestonePosition === 'start'
        ? undefined
        : bookTimeline.length > 0
        ? bookTimeline[bookTimeline.length - 1].id
        : undefined;

    const node = {
      ...newNode(plan, universe.id, book.id, afterId),
      title: cleanTitle,
      description: milestoneDesc.trim(),
      era: milestoneEra.trim(),
      status: milestoneStatus,
    };

    if (milestonePosition === 'start') {
      node.position = 0;
    }

    const updatedPlan = insertNode(plan, node);
    await onSaveThought(
      () => plan.revision,
      updatedPlan,
      () => {}
    );

    setMilestoneTitle('');
    setMilestoneDesc('');
    setMilestoneEra('');
    setIsAddingMilestone(false);
  };

  const handleMoveMilestone = async (nodeId: string, offset: number) => {
    if (!onSaveThought) return;
    const updatedPlan = moveNode(plan, nodeId, offset);
    await onSaveThought(
      () => plan.revision,
      updatedPlan,
      () => {}
    );
  };

  const handleArchiveMilestone = async (nodeId: string) => {
    if (!onSaveThought) return;
    const updatedPlan = archiveNode(plan, nodeId);
    await onSaveThought(
      () => plan.revision,
      updatedPlan,
      () => {}
    );
  };

  const handleConfirmPromotion = async () => {
    if (!promotionTarget || !onSaveThought) return;
    try {
      const updatedPlan = promote(plan, promotionTarget.id, true);
      await onSaveThought(
        () => plan.revision,
        updatedPlan,
        () => {}
      );
      setPromotedSuccess(`"${promotionTarget.title}" promoted to shared Universe History.`);
      setTimeout(() => setPromotedSuccess(''), 5000);
    } catch (err: any) {
      console.error('Promotion failed:', err);
    } finally {
      setPromotionTarget(null);
    }
  };

  // Dedicated In-Situ Chapter Writing View
  if (activeChapterDoc && activeChapterId) {
    return (
      <div className="flex-1 h-full overflow-y-auto p-8 max-w-5xl mx-auto space-y-5 animate-in fade-in duration-150 min-w-0 w-full">
        {/* Navigation / Header */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleCloseChapterView}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform text-primary" />
            <span>Back to {book.name} Chapters</span>
          </button>

          <div className="flex items-center gap-3">
            {/* Save Status Telemetry */}
            <div className="flex items-center gap-1.5 text-xs font-mono">
              {chapterSaveStatus === 'saving' && (
                <span className="text-amber-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  Saving...
                </span>
              )}
              {chapterSaveStatus === 'saved' && (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Saved
                </span>
              )}
              {chapterSaveStatus === 'editing' && (
                <span className="text-amber-300">Unsaved edits</span>
              )}
              {chapterSaveStatus === 'error' && (
                <span className="text-rose-400">Save failed</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => onOpenDocument(activeChapterDoc.id)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2.5 py-1 rounded border border-border/60 hover:bg-muted/30 transition-colors"
              title="Open full studio view"
            >
              <span>Full Studio</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Chapter Header */}
        <div className="p-5 rounded-2xl border border-border/80 bg-card/60 space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-serif font-bold text-foreground">{universe.name}</span>
            <span>/</span>
            <span>{book.name}</span>
            <span>/</span>
            <span className="font-semibold text-primary">{activeChapterDoc.title}</span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-foreground">{activeChapterDoc.title}</h1>
        </div>

        {/* Writing Editor with Echo Live Lore Recognition */}
        {chapterLoading ? (
          <div className="p-16 text-center text-xs text-muted-foreground animate-pulse">
            Loading chapter prose...
          </div>
        ) : (
          <MarkdownEditor
            key={activeChapterDoc.id}
            documentId={activeChapterDoc.id}
            value={chapterContent}
            className="min-w-0 w-full"
            onChange={handleChapterContentChange}
            onManualSave={handleChapterManualSave}
            placeholder="Write chapter prose, dialogue, narration, and scene descriptions in Markdown..."
            engine={editorEngine}
            onToggleEngine={(e) => {
              setEditorEngine(e);
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem('mc_editor_engine', e);
              }
            }}
            minHeight="540px"
            echoEnabled={true}
            allDocuments={documents}
            plan={plan}
            universeId={universe.id}
            houseId={activeChapterDoc.house_id || (universe as unknown as { house_id?: string }).house_id}
            onOpenEntity={onOpenDocument}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-y-auto p-8 max-w-5xl mx-auto space-y-6">
      {/* BREADCRUMB / BACK */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToUniverse}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to {universe.name}</span>
        </button>

        {promotedSuccess && (
          <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-600/40 px-3 py-1 rounded-full flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {promotedSuccess}
          </div>
        )}
      </div>

      {/* ARCHIVED WARNING BANNER */}
      {book.archived && (
        <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs">
            <FolderArchive className="w-4 h-4 text-amber-400 shrink-0" />
            <span>This book is archived and hidden from active world navigation. Its chapters, prose, and milestones are preserved.</span>
          </div>
          {onSaveThought && (
            <button
              type="button"
              onClick={handleRecoverBook}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 text-xs font-medium transition-colors shrink-0"
            >
              <FolderInput className="w-3.5 h-3.5" />
              Recover Book
            </button>
          )}
        </div>
      )}

      {/* BOOK HEADER */}
      <div className="p-6 rounded-2xl border border-border/80 bg-card/60 space-y-4">
        {isEditingMetadata ? (
          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-muted-foreground font-medium mb-1">Book Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-serif text-base focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-muted-foreground font-medium mb-1">Continuity</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(['canonical', 'alternate', 'standalone'] as Continuity[]).map((c) => (
                  <label
                    key={c}
                    className={cn(
                      'p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between',
                      continuity === c
                        ? 'border-primary bg-primary/10'
                        : 'border-border/60 hover:bg-muted/30'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="continuity"
                        checked={continuity === c}
                        onChange={() => setContinuity(c)}
                        className="text-primary focus:ring-primary"
                      />
                      <span className="font-semibold text-foreground">
                        {CONTINUITY_CONFIG[c].label}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                      {CONTINUITY_CONFIG[c].description}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Description / Synopsis
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setTitle(book.name);
                  setDescription(book.description || '');
                  setContinuity(book.continuity);
                  setIsEditingMetadata(false);
                }}
                className="px-3.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveMetadata}
                className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-gold-hover transition-colors"
              >
                Save Book Details
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-serif font-bold text-foreground">{book.name}</h1>
                <span
                  className={cn(
                    'text-[11px] font-medium px-2.5 py-0.5 rounded-full border',
                    CONTINUITY_CONFIG[book.continuity].badgeClass
                  )}
                >
                  {CONTINUITY_CONFIG[book.continuity].label}
                </span>
              </div>
              {book.description ? (
                <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                  {book.description}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground/60 italic">
                  No synopsis recorded yet.
                </p>
              )}
            </div>

            {onSaveThought && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditingMetadata(true)}
                  className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 text-xs font-medium transition-colors"
                >
                  Edit Details
                </button>
                {book.archived ? (
                  <button
                    type="button"
                    onClick={handleRecoverBook}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium transition-colors"
                  >
                    <FolderInput className="w-3.5 h-3.5" />
                    Recover Book
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleArchiveBook}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-900/40 text-rose-400 hover:bg-rose-950/30 text-xs font-medium transition-colors"
                    title="Archive this book"
                  >
                    <FolderArchive className="w-3.5 h-3.5" />
                    Archive Book
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* WORKSPACE NAVIGATION TABS */}
        <div className="flex gap-2 pt-3 border-t border-border/60">
          <button
            type="button"
            onClick={() => setActiveTab('chapters')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all',
              activeTab === 'chapters'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Chapters &amp; Prose ({chapters.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all',
              activeTab === 'timeline'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <Calendar className="w-3.5 h-3.5" />
            Story Milestones Timeline ({bookTimeline.length})
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* CHAPTERS TAB */}
      {/* ======================================================== */}
      {activeTab === 'chapters' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-serif font-bold text-foreground">
              Manuscript Chapters
            </h2>

            <button
              type="button"
              onClick={() => setIsAddingChapter(!isAddingChapter)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-gold-hover transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {isAddingChapter ? 'Cancel' : 'New Chapter'}
            </button>
          </div>

          {/* ADD CHAPTER FORM */}
          {isAddingChapter && (
            <form
              onSubmit={handleCreateChapter}
              className="p-4 rounded-xl border border-primary/40 bg-card space-y-3 text-xs"
            >
              <div className="font-semibold text-foreground">Add New Chapter:</div>
              {chapterError && (
                <div className="text-rose-400 bg-rose-950/40 p-2 rounded">{chapterError}</div>
              )}
              <div className="flex gap-3">
                <input
                  type="text"
                  autoFocus
                  value={newChapterTitle}
                  onChange={(e) => setNewChapterTitle(e.target.value)}
                  placeholder="e.g. Chapter 1: The Gathering Storm"
                  className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={chapterCreating || !newChapterTitle.trim()}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-gold-hover transition-colors disabled:opacity-40"
                >
                  {chapterCreating ? 'Creating...' : 'Create Chapter'}
                </button>
              </div>
            </form>
          )}

          {/* CHAPTER LIST */}
          {chapters.length === 0 ? (
            <div className="p-10 text-center border border-dashed border-border/80 rounded-2xl bg-card/20 space-y-3">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground/60" />
              <div className="text-sm font-serif font-semibold text-foreground">
                No chapters written yet
              </div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Begin drafting this book by creating Chapter 1. Chapters contain the narrative prose of
                your story.
              </p>
              <button
                type="button"
                onClick={() => setIsAddingChapter(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-gold-hover transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Chapter 1
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {chapters.map((chap, idx) => (
                <div
                  key={chap.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-card/60 hover:bg-card hover:border-gold-rich/50 transition-all text-xs group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-muted/60 text-muted-foreground flex items-center justify-center font-mono font-semibold shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => handleOpenChapterInView(chap.id)}
                        className="font-serif font-semibold text-foreground hover:text-primary hover:underline text-sm truncate block text-left transition-colors"
                        title="Click to write chapter prose"
                      >
                        {chap.title}
                      </button>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Last edited {new Date(chap.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Reordering */}
                    {onSaveDocument && (
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveChapter(idx, 'up')}
                          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20 rounded"
                          title="Move chapter up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === chapters.length - 1}
                          onClick={() => handleMoveChapter(idx, 'down')}
                          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20 rounded"
                          title="Move chapter down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenChapterInView(chap.id)}
                      className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium inline-flex items-center gap-1.5 hover:bg-gold-hover transition-colors shadow-sm"
                      title="Write chapter prose in Book View"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      Write Prose
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenDocument(chap.id)}
                      className="px-2.5 py-1.5 rounded-lg border border-border/60 hover:bg-muted/40 text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                      title="Open in Lorebook Studio"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* STORY TIMELINE TAB */}
      {/* ======================================================== */}
      {activeTab === 'timeline' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-serif font-bold text-foreground">
                Story Milestones
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Plan plot points, character arcs, and world-state changes for this book.
              </p>
            </div>

            {onSaveThought && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMilestonePosition('start');
                    setIsAddingMilestone(true);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-border text-xs font-medium hover:bg-muted/40 transition-colors"
                >
                  + Add Beginning
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMilestonePosition('end');
                    setIsAddingMilestone(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-gold-hover transition-colors"
                >
                  + Add Milestone
                </button>
              </div>
            )}
          </div>

          {/* ADD MILESTONE FORM */}
          {isAddingMilestone && (
            <form
              onSubmit={handleCreateMilestone}
              className="p-4 rounded-xl border border-primary/40 bg-card space-y-3 text-xs"
            >
              <div className="font-semibold text-foreground">
                {milestonePosition === 'start' ? 'Add Beginning Milestone' : 'Add Story Milestone'}:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-foreground mb-1">Milestone Title *</label>
                  <input
                    type="text"
                    autoFocus
                    value={milestoneTitle}
                    onChange={(e) => setMilestoneTitle(e.target.value)}
                    placeholder="e.g. Arrival at the Sun Gate"
                    className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-muted-foreground mb-1">Era / Chronology (Optional)</label>
                  <input
                    type="text"
                    value={milestoneEra}
                    onChange={(e) => setMilestoneEra(e.target.value)}
                    placeholder="e.g. Year 402, Dawn of the Second Age"
                    className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-muted-foreground mb-1">Description / What changes?</label>
                <textarea
                  rows={2}
                  value={milestoneDesc}
                  onChange={(e) => setMilestoneDesc(e.target.value)}
                  placeholder="What happens in this milestone? Who is present?"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <label className="text-muted-foreground">Status:</label>
                  <select
                    value={milestoneStatus}
                    onChange={(e) => setMilestoneStatus(e.target.value as any)}
                    className="px-2 py-1 rounded bg-background border border-border text-foreground"
                  >
                    <option value="planned">Planned</option>
                    <option value="drafted">Drafted</option>
                    <option value="written">Written</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingMilestone(false)}
                    className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!milestoneTitle.trim()}
                    className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-gold-hover transition-colors disabled:opacity-40"
                  >
                    Save Milestone
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* TIMELINE LIST */}
          {bookTimeline.length === 0 ? (
            <div className="p-10 text-center border border-dashed border-border/80 rounded-2xl bg-card/20 space-y-3">
              <Calendar className="w-8 h-8 mx-auto text-muted-foreground/60" />
              <div className="text-sm font-serif font-semibold text-foreground">
                No story milestones planned
              </div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Outline your story beats from Beginning to Ending. Milestones help track narrative pacing
                and lore world-state evolution.
              </p>
              {onSaveThought && (
                <button
                  type="button"
                  onClick={() => {
                    setMilestonePosition('start');
                    setIsAddingMilestone(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-gold-hover transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Story Beginning
                </button>
              )}
            </div>
          ) : (
            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-border/60">
              {bookTimeline.map((node, idx) => {
                const isPromoted = Boolean(node.linked_event_id);
                const canPromote = book.continuity === 'canonical' && !isPromoted;

                return (
                  <div
                    key={node.id}
                    className="relative p-4 rounded-xl border border-border/70 bg-card/60 hover:bg-card transition-all text-xs group space-y-2"
                  >
                    {/* Node Dot on Timeline */}
                    <span className="absolute -left-[27px] top-4 w-3.5 h-3.5 rounded-full bg-background border-2 border-primary" />

                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-serif font-bold text-foreground text-sm">
                            {node.title}
                          </h3>
                          <span
                            className={cn(
                              'text-[10.5px] px-2 py-0.5 rounded-full uppercase tracking-wider font-mono',
                              node.status === 'written'
                                ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40'
                                : node.status === 'drafted'
                                ? 'bg-amber-950/40 text-amber-400 border border-amber-800/40'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {node.status}
                          </span>
                          {node.era && (
                            <span className="text-[11px] text-muted-foreground font-mono">
                              ({node.era})
                            </span>
                          )}
                          {isPromoted && (
                            <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-700/40 px-2 py-0.5 rounded-full">
                              Promoted to Universe History
                            </span>
                          )}
                        </div>

                        {node.description && (
                          <p className="text-muted-foreground mt-1.5 leading-relaxed">
                            {node.description}
                          </p>
                        )}
                      </div>

                      {/* ACTIONS */}
                      {onSaveThought && (
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveMilestone(node.id, -1)}
                            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20 rounded"
                            title="Move earlier"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === bookTimeline.length - 1}
                            onClick={() => handleMoveMilestone(node.id, 1)}
                            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20 rounded"
                            title="Move later"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          {canPromote && (
                            <button
                              type="button"
                              onClick={() => setPromotionTarget(node)}
                              className="px-2 py-0.5 rounded border border-emerald-600/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40 transition-colors text-[11px]"
                              title="Promote milestone to shared Universe history"
                            >
                              Promote
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleArchiveMilestone(node.id)}
                            className="p-1 text-muted-foreground hover:text-rose-400 rounded"
                            title="Archive milestone"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* PROMOTION CONFIRMATION MODAL */}
      {promotionTarget && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-serif font-bold text-foreground">
              Promote to Universe History
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Promoting <strong className="text-foreground">&quot;{promotionTarget.title}&quot;</strong> will
              record it as an official historical event on the shared Universe Timeline of{' '}
              <strong className="text-primary">{universe.name}</strong>.
            </p>
            <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
              This milestone retains its originating identity in this Book, and any changes will become
              visible across all books sharing this continuity.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPromotionTarget(null)}
                className="px-4 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-colors text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPromotion}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors text-xs"
              >
                Confirm Promotion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
