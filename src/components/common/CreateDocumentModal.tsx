import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import type { DocumentType, LorebookEntryType, CanonStatus, PlanStatus } from '@/types';
import type { Continuity, Plan } from '@/utils/thought';
import {
  Plus,
  AlertCircle,
  Globe,
  Users,
  MapPin,
  Shield,
  Sparkles,
  Compass,
  Sword,
  Calendar,
  Layers,
  BookOpen,
  Sliders,
} from 'lucide-react';
import { StudioIcon } from '@/components/common/BrandIcon';
import { cn } from '@/utils/cn';

export type LorebookItemChoice =
  | 'character'
  | 'location'
  | 'faction'
  | 'nation'
  | 'rule'
  | 'culture'
  | 'artifact'
  | 'event'
  | 'other'
  | 'book';

export interface LorebookItemConfig {
  id: LorebookItemChoice;
  label: string;
  singular: string;
  icon: React.ElementType;
  color: string;
  placeholder: string;
}

export const LOREBOOK_ITEM_OPTIONS: LorebookItemConfig[] = [
  { id: 'character', label: 'Character', singular: 'Character', icon: Users, color: 'text-blue-400', placeholder: 'e.g. Queen Valerie, Sir Gareth' },
  { id: 'location', label: 'Location', singular: 'Location', icon: MapPin, color: 'text-emerald-400', placeholder: 'e.g. Whispering Woods, Sun Citadel' },
  { id: 'faction', label: 'Faction', singular: 'Faction', icon: Shield, color: 'text-amber-400', placeholder: 'e.g. The Silver Vanguard, Shadow Covenant' },
  { id: 'nation', label: 'Nation', singular: 'Nation / Kingdom', icon: Globe, color: 'text-sky-400', placeholder: 'e.g. Kingdom of Eryndor, Solarian Empire' },
  { id: 'rule', label: 'World Rule', singular: 'World Rule / System', icon: Sparkles, color: 'text-violet-400', placeholder: 'e.g. Law of Conservation of Aether, Blood Binding' },
  { id: 'culture', label: 'Culture / History', singular: 'Culture / Era', icon: Compass, color: 'text-orange-400', placeholder: 'e.g. The Ashfall Dynasties, Nomads of the Rust Sea' },
  { id: 'artifact', label: 'Artifact', singular: 'Artifact / Relic', icon: Sword, color: 'text-cyan-400', placeholder: 'e.g. Staff of the First Dawn, Crown of Thorns' },
  { id: 'event', label: 'Event', singular: 'Event', icon: Calendar, color: 'text-rose-400', placeholder: 'e.g. The Siege of Solitude, The Treaty of Glass' },
  { id: 'other', label: 'Other Lore', singular: 'Lore Entry', icon: Layers, color: 'text-muted-foreground', placeholder: 'e.g. Ancient Runes, Nightfall Flora' },
  { id: 'book', label: 'Book / Story', singular: 'Book / Story', icon: BookOpen, color: 'text-gold-rich', placeholder: 'e.g. The Fall of Eryndor, Chronicles of the Void' },
];

export interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: DocumentType;
  initialUniverseId?: string;
  initialUniverseName?: string;
  initialEntryType?: LorebookEntryType | 'book';
  initialAction?: 'create_universe' | 'add_to_universe';
  initialTitle?: string;
  plan?: Plan | null;
  planStatus?: PlanStatus;
  planError?: string | null;
  enabledStudios?: ('poetry' | 'philosophy' | 'lorebook')[];
  activeHouseName?: string;
  onCreate: (
    docType: DocumentType,
    title: string,
    initialContent?: string,
    metadataJson?: string,
    tags?: string[]
  ) => Promise<void>;
  onCreateUniverse?: (name: string, description?: string) => Promise<string | void>;
  onCreateBook?: (
    universeId: string,
    title: string,
    continuity?: Continuity,
    description?: string
  ) => Promise<string | void>;
}

const extractErrorMessage = (err: unknown): string => {
  if (!err) return 'An unexpected error occurred while creating the document.';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    if ('message' in err && typeof (err as any).message === 'string') {
      return (err as any).message;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return 'Failed to create document.';
    }
  }
  return String(err);
};

export const CreateDocumentModal: React.FC<CreateDocumentModalProps> = ({
  isOpen,
  onClose,
  defaultType = 'poetry',
  initialUniverseId,
  initialUniverseName,
  initialEntryType,
  initialAction,
  initialTitle,
  plan,
  planStatus,
  planError,
  enabledStudios,
  activeHouseName,
  onCreate,
  onCreateUniverse,
  onCreateBook,
}) => {
  const [docType, setDocType] = useState<DocumentType>(() => {
    const initial = defaultType === 'manuscript' ? 'poetry' : defaultType;
    if (enabledStudios && !enabledStudios.includes(initial as any)) {
      return (enabledStudios[0] as DocumentType) || 'poetry';
    }
    return initial;
  });
  const [title, setTitle] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track modal open transitions
  const wasOpenRef = useRef(false);

  // Poetry specific
  const [poeticForm, setPoeticForm] = useState('Free Verse');

  // Philosophy specific
  const [workTitle, setWorkTitle] = useState('');
  const [chapter, setChapter] = useState('');

  // Lorebook Universe-First specific
  const universes = plan?.universes || [];
  const hasUniverses = universes.length > 0;

  const resolveTargetUniverseId = (): string => {
    if (initialUniverseId && universes.some(u => u.id === initialUniverseId)) return initialUniverseId;
    if (initialUniverseName) {
      const matchByName = universes.find(
        u => u.name.trim().toLowerCase() === initialUniverseName.trim().toLowerCase()
      );
      if (matchByName) return matchByName.id;
    }
    const stored =
      typeof localStorage !== 'undefined' ? localStorage.getItem('mc_active_universe_id') : null;
    if (stored && universes.some(u => u.id === stored)) return stored;
    return universes[0]?.id || '';
  };

  const [lorebookAction, setLorebookAction] = useState<'create_universe' | 'add_to_universe'>(
    !hasUniverses ? 'create_universe' : initialAction || 'add_to_universe'
  );
  const [selectedUniverseId, setSelectedUniverseId] = useState<string>(resolveTargetUniverseId);
  const [selectedItemType, setSelectedItemType] = useState<LorebookItemChoice | null>(
    (initialEntryType as LorebookItemChoice) || null
  );
  const [universeDesc, setUniverseDesc] = useState('');
  const [bookDesc, setBookDesc] = useState('');
  const [bookContinuity, setBookContinuity] = useState<Continuity>('canonical');
  const [canonStatus, setCanonStatus] = useState<CanonStatus>('canon');
  const [showAdvancedLore, setShowAdvancedLore] = useState(false);

  const resetForm = () => {
    setTitle('');
    setSubmitError('');
    setTagInput('');
    setPoeticForm('Free Verse');
    setWorkTitle('');
    setChapter('');
    setUniverseDesc('');
    setBookDesc('');
    setBookContinuity('canonical');
    setCanonStatus('canon');
    setShowAdvancedLore(false);
  };

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const resolvedInitial = defaultType === 'manuscript' ? 'poetry' : defaultType;
      const initial = enabledStudios && !enabledStudios.includes(resolvedInitial as any)
        ? (enabledStudios[0] as DocumentType) || 'poetry'
        : resolvedInitial;
      setDocType(initial);
      setSubmitError('');
      resetForm();

      if (!hasUniverses) {
        setLorebookAction('create_universe');
        setSelectedUniverseId('');
      } else {
        setLorebookAction(initialAction || 'add_to_universe');
        setSelectedUniverseId(resolveTargetUniverseId());
      }

      setSelectedItemType((initialEntryType as LorebookItemChoice) || null);
      if (initialTitle) {
        setTitle(initialTitle);
      }
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, defaultType, initialUniverseId, initialUniverseName, initialEntryType, initialAction, initialTitle, hasUniverses, universes]);

  const selectedItemConfig = LOREBOOK_ITEM_OPTIONS.find(opt => opt.id === selectedItemType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    setSubmitError('');
    setIsSubmitting(true);

    const tags = tagInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    try {
      if (docType === 'poetry') {
        const metadataJson = JSON.stringify({ poetic_form: poeticForm });
        const initialContent = `\n\n`; // Initial blank stanza
        await onCreate('poetry', cleanTitle, initialContent, metadataJson, tags);
        resetForm();
        onClose();
      } else if (docType === 'philosophy') {
        const metadataJson = JSON.stringify({
          composition_mode: 'freeform',
          work_title: workTitle.trim() || undefined,
          chapter: chapter.trim() || undefined,
        });
        await onCreate('philosophy', cleanTitle, '', metadataJson, tags);
        resetForm();
        onClose();
      } else if (docType === 'lorebook') {
        if (lorebookAction === 'create_universe') {
          if (!onCreateUniverse) {
            throw new Error('Universe creation handler not available.');
          }
          await onCreateUniverse(cleanTitle, universeDesc);
          resetForm();
          onClose();
        } else {
          // add_to_universe
          if (!selectedUniverseId) {
            throw new Error('Please select a target Universe.');
          }
          const targetUniverse = universes.find(u => u.id === selectedUniverseId);
          if (!targetUniverse) {
            throw new Error('Selected Universe was not found.');
          }

          if (!selectedItemType) {
            throw new Error('Please choose what element to create.');
          }

          if (selectedItemType === 'book') {
            if (!onCreateBook) {
              throw new Error('Book creation handler not available.');
            }
            await onCreateBook(selectedUniverseId, cleanTitle, bookContinuity, bookDesc);
            resetForm();
            onClose();
          } else {
            // Worldbuilding entity
            const entryType = selectedItemType === 'nation' ? 'faction' : selectedItemType;
            const metadataJson = JSON.stringify({
              universe: targetUniverse.name,
              universe_id: targetUniverse.id,
              entry_type: entryType,
              canon_status: canonStatus,
              attributes: [],
            });
            const initialContent = `### Overview\n\nProvide the canonical definition and context for this ${selectedItemConfig?.singular || entryType} in ${targetUniverse.name}.\n\n### Historical Lore\n\nDescribe the origin, background, and cultural impact within the world.`;
            await onCreate('lorebook', cleanTitle, initialContent, metadataJson, tags);
            resetForm();
            onClose();
          }
        }
      }
    } catch (err) {
      const errorMsg = extractErrorMessage(err);
      setSubmitError(errorMsg);
      console.error('[DocumentCreation] Failed to create document:', {
        timestamp: new Date().toISOString(),
        docType,
        titleCharCount: cleanTitle.length,
        errorMessage: errorMsg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Dynamic submit button label and title placeholder
  let titleLabel = 'Title *';
  let titlePlaceholder = 'e.g. Untitled Document';
  let submitButtonLabel = 'Create Document';

  if (docType === 'poetry') {
    titleLabel = 'Poem Title *';
    titlePlaceholder = 'e.g. Song of the Wanderer';
    submitButtonLabel = isSubmitting ? 'Creating...' : 'Create Poem';
  } else if (docType === 'philosophy') {
    titleLabel = 'Reflection / Inquiry Title *';
    titlePlaceholder = 'e.g. Critique of Pure Intuition';
    submitButtonLabel = isSubmitting ? 'Creating...' : 'Create Reflection';
  } else if (docType === 'lorebook') {
    if (planStatus === 'loading') {
      submitButtonLabel = 'Loading Planning Data...';
    } else if (planStatus === 'error') {
      submitButtonLabel = 'Planning Data Unavailable';
    } else if (lorebookAction === 'create_universe') {
      titleLabel = 'Universe Name *';
      titlePlaceholder = 'e.g. Eryndor, The Void Sea, Solar Expanse';
      submitButtonLabel = isSubmitting ? 'Creating Universe...' : 'Create & Open Universe';
    } else {
      if (!selectedItemType) {
        titleLabel = 'Select an element above *';
        titlePlaceholder = 'Choose what to create first...';
        submitButtonLabel = 'Select What to Create';
      } else if (selectedItemType === 'book') {
        titleLabel = 'Book Title *';
        titlePlaceholder = selectedItemConfig?.placeholder || 'e.g. The Fall of Eryndor';
        submitButtonLabel = isSubmitting ? 'Creating Book...' : 'Create Book & Open';
      } else {
        titleLabel = `${selectedItemConfig?.singular || 'Entity'} Name *`;
        titlePlaceholder = selectedItemConfig?.placeholder || 'Enter title...';
        submitButtonLabel = isSubmitting
          ? 'Creating...'
          : `Create ${selectedItemConfig?.singular || 'Entity'} & Edit`;
      }
    }
  }

  const isSubmitDisabled =
    !title.trim() ||
    isSubmitting ||
    (docType === 'lorebook' && (planStatus === 'loading' || planStatus === 'error')) ||
    (docType === 'lorebook' && lorebookAction === 'add_to_universe' && !selectedItemType);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        docType === 'lorebook' && lorebookAction === 'create_universe'
          ? 'Create New Universe'
          : 'Create New Document'
      }
      description={
        activeHouseName
          ? `Creating in ${activeHouseName}. Select the studio and initialize document metadata.`
          : docType === 'lorebook'
          ? 'Establish worldbuilding universes, entities, and books.'
          : 'Select the studio and initialize document metadata.'
      }
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {submitError && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-rose-200">Creation Failed</p>
              <p className="text-rose-300/90 break-words">{submitError}</p>
            </div>
          </div>
        )}

        {/* Studio Mode Selector */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
            Studio Mode
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => {
                setDocType('poetry');
                setSubmitError('');
              }}
              className={cn(
                'flex flex-col items-center gap-2.5 p-3.5 rounded-xl border text-sm font-medium transition-all text-center',
                docType === 'poetry'
                  ? 'bg-accent/80 border-gold-rich text-gold-rich ring-1 ring-gold-rich/50 font-semibold shadow-[0_0_14px_rgba(221,186,120,0.18)]'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              )}
            >
              <StudioIcon type="poetry" className="w-12 h-12 rounded-xl shrink-0" isActive={docType === 'poetry'} />
              <span className="font-serif font-semibold tracking-wide text-xs">Poetry Studio</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDocType('philosophy');
                setSubmitError('');
              }}
              className={cn(
                'flex flex-col items-center gap-2.5 p-3.5 rounded-xl border text-sm font-medium transition-all text-center',
                docType === 'philosophy'
                  ? 'bg-accent/80 border-gold-rich text-gold-rich ring-1 ring-gold-rich/50 font-semibold shadow-[0_0_14px_rgba(221,186,120,0.18)]'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              )}
            >
              <StudioIcon type="philosophy" className="w-12 h-12 rounded-xl shrink-0" isActive={docType === 'philosophy'} />
              <span className="font-serif font-semibold tracking-wide text-xs">Philosophy Studio</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDocType('lorebook');
                setSubmitError('');
              }}
              className={cn(
                'flex flex-col items-center gap-2.5 p-3.5 rounded-xl border text-sm font-medium transition-all text-center',
                docType === 'lorebook'
                  ? 'bg-accent/80 border-gold-rich text-gold-rich ring-1 ring-gold-rich/50 font-semibold shadow-[0_0_14px_rgba(221,186,120,0.18)]'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              )}
            >
              <StudioIcon type="lorebook" className="w-12 h-12 rounded-xl shrink-0" isActive={docType === 'lorebook'} />
              <span className="font-serif font-semibold tracking-wide text-xs">Lorebook Studio</span>
            </button>

          </div>
        </div>

        {/* POETRY STUDIO SPECIFIC */}
        {docType === 'poetry' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                {titleLabel}
              </label>
              <input
                type="text"
                required
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={titlePlaceholder}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Poetic Form
              </label>
              <select
                value={poeticForm}
                onChange={e => setPoeticForm(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="Free Verse">Free Verse</option>
                <option value="Rhymed Stanzas">Rhymed Stanzas</option>
                <option value="Sonnet">Sonnet (Petrarchan / Shakespearean)</option>
                <option value="Haiku / Tanka">Haiku / Tanka</option>
                <option value="Villanelle">Villanelle</option>
                <option value="Ode / Elegy">Ode / Elegy</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Tags (Optional, comma-separated)
              </label>
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                placeholder="e.g. nature, sonnet, cadence"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        )}

        {/* PHILOSOPHY STUDIO SPECIFIC */}
        {docType === 'philosophy' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                {titleLabel}
              </label>
              <input
                type="text"
                required
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={titlePlaceholder}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Work / Treatise Title (Optional)
                </label>
                <input
                  type="text"
                  value={workTitle}
                  onChange={e => setWorkTitle(e.target.value)}
                  placeholder="e.g. Metaphysics of Being"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Chapter / Section (Optional)
                </label>
                <input
                  type="text"
                  value={chapter}
                  onChange={e => setChapter(e.target.value)}
                  placeholder="e.g. Chapter III"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Tags (Optional, comma-separated)
              </label>
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                placeholder="e.g. epistemology, consciousness, ethics"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        )}

        {/* LOREBOOK STUDIO: UNIVERSE-FIRST FLOW */}
        {docType === 'lorebook' && (
          <div className="space-y-4">
            {planStatus === 'error' && (
              <div
                role="alert"
                className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-500/10 flex items-start gap-3 text-xs text-rose-300"
              >
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground font-serif text-sm text-rose-200">
                    Planning Data Failed to Load
                  </p>
                  <p className="text-muted-foreground mt-0.5 leading-relaxed text-rose-300/90">
                    {planError || 'An error occurred while loading planning metadata.'} Your files remain safely preserved on disk. Please resolve this issue before adding new worldbuilding entries.
                  </p>
                </div>
              </div>
            )}

            {planStatus === 'loading' && (
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20 flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                <Sparkles className="w-4 h-4 text-primary shrink-0 animate-spin" />
                <span>Loading planning desk…</span>
              </div>
            )}

            {!hasUniverses ? (
              // Empty Universe state banner explaining why a Universe is required
              <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/10 flex items-start gap-3 text-xs">
                <Globe className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground font-serif text-sm">Every story begins somewhere</p>
                  <p className="text-muted-foreground mt-0.5 leading-relaxed">
                    In MetaCognition Notebook, worldbuilding is organized into <strong>Universes</strong>. Create your first Universe to begin organizing characters, locations, factions, and stories within it.
                  </p>
                </div>
              </div>
            ) : (
              // Segmented Action Selector: Add to Existing Universe vs Create New Universe
              <div className="flex rounded-xl bg-muted/40 p-1 border border-border/60">
                <button
                  type="button"
                  onClick={() => {
                    setLorebookAction('add_to_universe');
                    setSubmitError('');
                  }}
                  className={cn(
                    'flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all text-center',
                    lorebookAction === 'add_to_universe'
                      ? 'bg-card text-foreground shadow-sm font-semibold border border-border/80'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Add to Existing Universe
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLorebookAction('create_universe');
                    setSubmitError('');
                  }}
                  className={cn(
                    'flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all text-center',
                    lorebookAction === 'create_universe'
                      ? 'bg-card text-foreground shadow-sm font-semibold border border-border/80'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  + Create New Universe
                </button>
              </div>
            )}

            {/* CHOICE 1: CREATE NEW UNIVERSE */}
            {lorebookAction === 'create_universe' && (
              <div className="space-y-4 border border-border/80 p-4 rounded-xl bg-card/40">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">
                    {titleLabel}
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={titlePlaceholder}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    The overarching fictional world or setting containing all lore and stories.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">
                    Universe Summary &amp; Premise (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={universeDesc}
                    onChange={e => setUniverseDesc(e.target.value)}
                    placeholder="e.g. A high fantasy realm shaped by ancient elemental magic..."
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>
              </div>
            )}

            {/* CHOICE 2: ADD TO EXISTING UNIVERSE */}
            {lorebookAction === 'add_to_universe' && hasUniverses && (
              <div className="space-y-4">
                {/* 1. Target Universe Selector */}
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">
                    Target Universe <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={selectedUniverseId}
                    onChange={e => setSelectedUniverseId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {universes.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} {u.description ? `— ${u.description.slice(0, 40)}...` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Choose What to Create (Grid of 10 choices) */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                    Choose What to Create <span className="text-rose-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {LOREBOOK_ITEM_OPTIONS.map(opt => {
                      const Icon = opt.icon;
                      const isSelected = selectedItemType === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setSelectedItemType(opt.id);
                            setSubmitError('');
                          }}
                          className={cn(
                            'p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all group',
                            isSelected
                              ? 'bg-accent/80 border-gold-rich text-gold-rich ring-1 ring-gold-rich/40 shadow-sm'
                              : 'bg-card/70 border-border/80 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                          )}
                        >
                          <Icon className={cn('w-4 h-4 mb-1.5 shrink-0', opt.color)} />
                          <span className="text-xs font-medium leading-tight">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Title / Name Input (Revealed once choice is picked) */}
                {selectedItemType && (
                  <div className="space-y-4 pt-1 animate-in fade-in duration-150">
                    <div>
                      <label className="text-xs font-medium text-foreground block mb-1.5">
                        {titleLabel}
                      </label>
                      <input
                        type="text"
                        required
                        autoFocus
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder={titlePlaceholder}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    {/* Book Specific Inputs */}
                    {selectedItemType === 'book' ? (
                      <div className="space-y-3 p-3.5 rounded-xl border border-border/70 bg-card/40">
                        <div>
                          <label className="text-xs font-medium text-foreground block mb-1.5">
                            Premise / Synopsis (Optional)
                          </label>
                          <textarea
                            rows={2}
                            value={bookDesc}
                            onChange={e => setBookDesc(e.target.value)}
                            placeholder="e.g. A chronicle of the fall of the golden kingdom..."
                            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-foreground block mb-1.5">
                            Continuity Classification
                          </label>
                          <select
                            value={bookContinuity}
                            onChange={e => setBookContinuity(e.target.value as Continuity)}
                            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="canonical">Canonical (Official history of the Universe)</option>
                            <option value="alternate">Alternate Timeline (Divergent &quot;what if?&quot; story)</option>
                            <option value="standalone">Standalone Story (Independent narrative)</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      // Worldbuilding Entity: Optional Details (Canon Status & Tags)
                      <div className="pt-1">
                        <details
                          open={showAdvancedLore}
                          onToggle={e => setShowAdvancedLore((e.target as HTMLDetailsElement).open)}
                          className="text-xs text-muted-foreground group"
                        >
                          <summary className="cursor-pointer hover:text-foreground font-medium flex items-center gap-1.5 py-1 select-none">
                            <Sliders className="w-3.5 h-3.5 text-primary" />
                            <span>Optional Details (Canon Status &amp; Tags)</span>
                          </summary>
                          <div className="pt-3 space-y-3 pl-3 border-l-2 border-primary/30 mt-2">
                            <div>
                              <label className="block text-muted-foreground font-medium mb-1">
                                Canon Status
                              </label>
                              <select
                                value={canonStatus}
                                onChange={e => setCanonStatus(e.target.value as CanonStatus)}
                                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              >
                                <option value="canon">Canon (Established Lore — Emerald)</option>
                                <option value="draft">Draft (In Progress — Amber)</option>
                                <option value="speculative">Speculative (Hypothetical — Violet)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-muted-foreground font-medium mb-1">
                                Tags (Optional, comma-separated)
                              </label>
                              <input
                                type="text"
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                placeholder="e.g. nobility, northern-realm, magic"
                                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </div>
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Submit Bar */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          {title.trim() ? (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-muted-foreground hover:text-rose-400 transition-colors"
            >
              Clear title
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-gold-hover hover:text-charcoal disabled:opacity-50 transition-colors shadow-sm font-serif tracking-wide"
            >
              <Plus className="w-4 h-4" />
              {submitButtonLabel}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
