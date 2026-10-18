import React, { useState } from 'react';
import type { VaultPreview } from '@/services/vault';

export const ActiveNotebookConfirmation: React.FC<{ preview: VaultPreview; currentPath: string; onActivate: () => void }> = ({ preview, currentPath, onActivate }) => {
  const [confirmed, setConfirmed] = useState(false);
  return <div className="rounded-xl border border-primary/40 p-4 space-y-3 text-xs text-foreground">
    <h3 className="font-serif text-lg">Restore as Active Notebook</h3>
    <p>This changes which documents the app uses after restart. Separate-folder recovery above only extracts a copy for inspection.</p>
    <p className="break-all select-text">Backup to activate: {preview.path}<br />Created: {preview.created_at} · {preview.document_count} documents</p>
    <p className="break-all select-text">Current notebook retained at: {currentPath}</p>
    <p>Your saved current writing will also receive a verified pre-restore backup. A new notebook and index are validated before selection. Editing pauses; restart is required. Neither notebook is silently deleted.</p>
    <label className="flex gap-2 items-start"><input type="checkbox" className="mt-0.5 accent-primary" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I want to use this backup as my active notebook after restart, and retain my current notebook for recovery.</label>
    <button disabled={!confirmed} onClick={onActivate} className="rounded-lg bg-primary text-primary-foreground px-3 py-2 disabled:opacity-40">Restore as Active Notebook</button>
  </div>;
};
