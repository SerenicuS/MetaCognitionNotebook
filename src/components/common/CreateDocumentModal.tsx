import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { DocumentType, LorebookEntryType, CanonStatus } from '@/types';
import { Plus, AlertCircle } from 'lucide-react';
import { StudioIcon } from '@/components/common/BrandIcon';
import { cn } from '@/utils/cn';

interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: DocumentType;
  onCreate: (
    docType: DocumentType,
    title: string,
    initialContent?: string,
    metadataJson?: string,
    tags?: string[]
  ) => Promise<void>;
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
  onCreate,
}) => {
  const [docType, setDocType] = useState<DocumentType>(defaultType);
  const [title, setTitle] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track modal open transitions to preserve user input on failure / rerenders
  const wasOpenRef = useRef(false);

  // Poetry specific
  const [poeticForm, setPoeticForm] = useState('Free Verse');

  // Philosophy specific
  const [workTitle, setWorkTitle] = useState('');
  const [chapter, setChapter] = useState('');

  // Lorebook specific
  const [universe, setUniverse] = useState('');
  const [entryType, setEntryType] = useState<LorebookEntryType>('character');
  const [canonStatus, setCanonStatus] = useState<CanonStatus>('canon');

  const resetForm = () => {
    setTitle('');
    setSubmitError('');
    setTagInput('');
    setPoeticForm('Free Verse');
    setWorkTitle('');
    setChapter('');
    setUniverse('');
    setEntryType('character');
    setCanonStatus('canon');
  };

  useEffect(() => {
    // When opening, if no draft in progress, align with defaultType
    if (isOpen && !wasOpenRef.current) {
      if (!title.trim()) {
        setDocType(defaultType);
      }
      setSubmitError('');
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, defaultType, title]);

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

    let initialContent = '';
    let metadataJson = '';

    if (docType === 'poetry') {
      metadataJson = JSON.stringify({ poetic_form: poeticForm });
      initialContent = `\n\n`; // Initial blank stanza
    } else if (docType === 'philosophy') {
      metadataJson = JSON.stringify({
        composition_mode: 'freeform',
        work_title: workTitle.trim() || undefined,
        chapter: chapter.trim() || undefined,
      });
      initialContent = '';
    } else if (docType === 'lorebook') {
      metadataJson = JSON.stringify({
        universe: universe.trim() || 'Cosmos',
        entry_type: entryType,
        canon_status: canonStatus,
        attributes: [],
      });
      initialContent = `### Overview\n\nProvide the canonical definition and context for this ${entryType}.\n\n### Historical Lore\n\nDescribe the origin, background, and cultural impact within the world.`;
    }

    try {
      await onCreate(docType, cleanTitle, initialContent, metadataJson, tags);
      resetForm();
      onClose();
    } catch (err) {
      const errorMsg = extractErrorMessage(err);
      setSubmitError(errorMsg);

      // Record useful diagnostics WITHOUT exposing sensitive writing content
      console.error('[DocumentCreation] Failed to create document:', {
        timestamp: new Date().toISOString(),
        docType,
        titleCharCount: cleanTitle.length,
        hasTags: tags.length > 0,
        tagCount: tags.length,
        initialContentBytes: initialContent.length,
        hasMetadata: Boolean(metadataJson),
        errorMessage: errorMsg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Document"
      description="Select the studio and initialize document metadata."
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {submitError && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-rose-200">Document Creation Failed</p>
              <p className="text-rose-300/90 break-words">{submitError}</p>
            </div>
          </div>
        )}

        {/* Document Type Selector */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
            Studio Mode
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setDocType('poetry')}
              className={cn(
                'flex flex-col items-center gap-3 p-4 rounded-xl border text-sm font-medium transition-all text-center',
                docType === 'poetry'
                  ? 'bg-accent/80 border-gold-rich text-gold-rich ring-1 ring-gold-rich/50 font-semibold shadow-[0_0_14px_rgba(221,186,120,0.18)]'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              )}
            >
              <StudioIcon type="poetry" className="w-16 h-16 rounded-xl shrink-0" isActive={docType === 'poetry'} />
              <span className="font-serif font-semibold tracking-wide text-[15px]">Poetry Studio</span>
            </button>

            <button
              type="button"
              onClick={() => setDocType('philosophy')}
              className={cn(
                'flex flex-col items-center gap-3 p-4 rounded-xl border text-sm font-medium transition-all text-center',
                docType === 'philosophy'
                  ? 'bg-accent/80 border-gold-rich text-gold-rich ring-1 ring-gold-rich/50 font-semibold shadow-[0_0_14px_rgba(221,186,120,0.18)]'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              )}
            >
              <StudioIcon type="philosophy" className="w-16 h-16 rounded-xl shrink-0" isActive={docType === 'philosophy'} />
              <span className="font-serif font-semibold tracking-wide text-[15px]">Philosophy Studio</span>
            </button>

            <button
              type="button"
              onClick={() => setDocType('lorebook')}
              className={cn(
                'flex flex-col items-center gap-3 p-4 rounded-xl border text-sm font-medium transition-all text-center',
                docType === 'lorebook'
                  ? 'bg-accent/80 border-gold-rich text-gold-rich ring-1 ring-gold-rich/50 font-semibold shadow-[0_0_14px_rgba(221,186,120,0.18)]'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              )}
            >
              <StudioIcon type="lorebook" className="w-16 h-16 rounded-xl shrink-0" isActive={docType === 'lorebook'} />
              <span className="font-serif font-semibold tracking-wide text-[15px]">Lorebook Studio</span>
            </button>
          </div>
        </div>

        {/* Title Input */}
        <div>
          <label className="text-xs font-medium text-foreground block mb-1.5">
            Title <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            required
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={
              docType === 'poetry'
                ? 'e.g. Song of the Wanderer'
                : docType === 'philosophy'
                ? 'e.g. Critique of Pure Intuition'
                : 'e.g. Sovereign Order of Oakhaven'
            }
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Mode Specific Inputs */}
        {docType === 'poetry' && (
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
        )}

        {docType === 'philosophy' && (
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
                Chapter / Section
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
        )}

        {docType === 'lorebook' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Universe / Setting
              </label>
              <input
                type="text"
                value={universe}
                onChange={e => setUniverse(e.target.value)}
                placeholder="e.g. Eldoria, The Void Sea"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Entry Type
                </label>
                <select
                  value={entryType}
                  onChange={e => setEntryType(e.target.value as LorebookEntryType)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="character">Character</option>
                  <option value="location">Location</option>
                  <option value="faction">Faction</option>
                  <option value="event">Event</option>
                  <option value="concept">Concept / Magic</option>
                  <option value="artifact">Artifact / Relic</option>
                  <option value="other">Other Element</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Canon Status
                </label>
                <select
                  value={canonStatus}
                  onChange={e => setCanonStatus(e.target.value as CanonStatus)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="canon">Canon (Established)</option>
                  <option value="draft">Draft (In Progress)</option>
                  <option value="speculative">Speculative (Hypothetical)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Tags */}
        <div>
          <label className="text-xs font-medium text-foreground block mb-1.5">
            Tags (Comma separated)
          </label>
          <input
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            placeholder="e.g. metaphysics, consciousness, ethics"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          {title.trim() ? (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-muted-foreground hover:text-rose-400 transition-colors"
            >
              Discard draft
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
              disabled={!title.trim() || isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-gold-hover hover:text-charcoal disabled:opacity-50 transition-colors shadow-sm font-serif tracking-wide"
            >
              <Plus className="w-4 h-4" />
              {isSubmitting ? 'Creating...' : 'Create Document'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
