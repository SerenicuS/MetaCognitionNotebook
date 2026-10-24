import React, { useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { BookOpen, AlertCircle } from 'lucide-react';

export interface CreateManuscriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    title: string,
    subtitle?: string,
    author?: string,
    tags?: string[]
  ) => Promise<void>;
}

export const CreateManuscriptModal: React.FC<CreateManuscriptModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [author, setAuthor] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const resetForm = () => {
    setTitle('');
    setSubtitle('');
    setAuthor('');
    setTagInput('');
    setSubmitError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    setSubmitError('');
    setIsSubmitting(true);

    const tags = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      await onCreate(cleanTitle, subtitle.trim() || undefined, author.trim() || undefined, tags);
      resetForm();
      onClose();
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to create manuscript.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create New Manuscript"
      description="Initialize a cross-Studio manuscript to organize and export writings from Poetry, Philosophy, and Lorebook."
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-1">
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

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
            Manuscript Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Selected Verse and Contemplations"
            className="w-full px-3.5 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm font-serif"
            autoFocus
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Subtitle / Tagline (Optional)
            </label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="e.g. Poems, Reflections & Lore"
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Author / Editor Name (Optional)
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. Eleanor Vance"
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-xs"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Tags (comma-separated, optional)
          </label>
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="e.g. anthology, collection, 2026"
            className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-xs"
          />
        </div>

        <div className="pt-3 border-t border-border/60 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-border hover:bg-muted/50 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || isSubmitting}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Creating Manuscript...' : 'Create Manuscript'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
