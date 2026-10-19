import React from 'react';
import { Modal } from './Modal';
import { AlertCircle, Save, Trash2, X } from 'lucide-react';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  documentTitle?: string;
  isExiting?: boolean;
  onSave: () => Promise<void> | void;
  onDiscard: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  documentTitle,
  isExiting = false,
  onSave,
  onDiscard,
  onCancel,
  isSaving = false,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={isExiting ? 'Save Before Exiting?' : 'Unsaved Changes'}
      description={
        isExiting
          ? 'You have unsaved changes that will be lost if you exit without saving.'
          : `You have unsaved changes in "${documentTitle || 'Untitled'}". How would you like to proceed?`
      }
      maxWidth="max-w-md"
    >
      <div className="space-y-4 pt-1">
        <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/40 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-200/90 leading-relaxed">
            Manual save mode is active. Leaving this document without saving will discard your latest edits.
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {/* Primary Save Action */}
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving Changes…' : 'Save Changes'}</span>
          </button>

          {/* Secondary Discard Action */}
          <button
            type="button"
            onClick={onDiscard}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-950/30 border border-rose-800/50 text-rose-300 font-medium text-xs hover:bg-rose-950/50 transition-colors"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>Discard Changes & Continue</span>
          </button>

          {/* Tertiary Cancel Action */}
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 font-medium text-xs transition-colors"
          >
            <X className="w-4 h-4" />
            <span>Cancel</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
