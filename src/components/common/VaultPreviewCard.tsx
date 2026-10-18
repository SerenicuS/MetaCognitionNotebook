import React, { useState } from 'react';
import { backupSize, type VaultPreview } from '@/services/vault';
export const VaultPreviewCard: React.FC<{ preview: VaultPreview; onRestore: () => void }> = ({ preview, onRestore }) => {
  const [confirmed, setConfirmed] = useState(false);
  return <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 text-sm">
    <h3 className="font-serif text-lg text-foreground">Verified backup · Restore preview</h3>
    <p className="text-xs text-muted-foreground break-all select-text">{preview.path}</p>
    <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
      <div><dt>Created (UTC)</dt><dd className="text-foreground">{new Date(preview.created_at).toISOString()}</dd></div>
      <div><dt>Compatibility</dt><dd className="text-foreground">Format {preview.format_version} · Compatible</dd></div>
      <div><dt>Documents</dt><dd className="text-foreground">{preview.document_count} · {preview.studios.join(', ') || 'Empty library'}</dd></div>
      <div><dt>Other files</dt><dd className="text-foreground">{preview.attachment_count} attachments · {preview.archived_count} archived deletions</dd></div>
      <div><dt>Archive size</dt><dd className="text-foreground">{backupSize(preview.size)}</dd></div>
      <div><dt>Source app</dt><dd className="text-foreground">{preview.app_version}</dd></div>
    </dl>
    <p className="text-xs text-foreground">Restore creates a new folder with a rebuilt index. Your current library stays unchanged. Automatic replacement or switching to the recovered library is not included.</p>
    <p className="text-xs text-muted-foreground">Checksums verify file integrity, not who created the archive. Backups are not encrypted.</p>
    <label className="flex gap-2 items-start text-xs"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-0.5 accent-primary" />I reviewed this backup and want to create a separate restored copy.</label>
    <button disabled={!confirmed} onClick={onRestore} className="rounded-lg border border-primary/40 text-primary px-3 py-2 text-xs disabled:opacity-40">Choose folder &amp; restore separate copy</button>
  </div>;
};
