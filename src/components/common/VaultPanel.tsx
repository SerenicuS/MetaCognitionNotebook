import { useHelp } from './HelpCenter';
import React, { useEffect, useState } from 'react';
import { VaultEmblem } from './BrandIcon';
import { VaultPreviewCard } from './VaultPreviewCard';
import { ActiveNotebookConfirmation } from './ActiveNotebookConfirmation';
import type { ActivationStatus } from '@/services/vault';
import { api, isTauri } from '@/services/api';
import { backupSize, type RunVault, type VaultHistory, type VaultPreview, type VaultRestore, type VaultPhase } from '@/services/vault';

export const VaultPanel: React.FC<{ runVault: RunVault }> = ({ runVault }) => {
  const {openHelp}=useHelp();
  const [history, setHistory] = useState<VaultHistory | null>(null);
  const [preview, setPreview] = useState<VaultPreview | null>(null);
  const [restored, setRestored] = useState<VaultRestore | null>(null);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activation, setActivation] = useState<ActivationStatus | null>(null);
  const [returnConfirmed, setReturnConfirmed] = useState(false);
  const desktop = isTauri();
  const refresh = async () => { setHistory(await api.vaultHistory()); };
  useEffect(() => {
    if (!desktop) return;
    let current = true;
    api.vaultActivationStatus().then(value => { if (current) setActivation(value); }).catch(() => {});
    api.vaultHistory().then(value => { if (current) setHistory(value); }).catch(error => { if (current) { setFailed(true); setStatus(String(error)); } });
    return () => { current = false; };
  }, [desktop]);
  const perform = async (phase: VaultPhase, action: () => Promise<VaultPreview | null>) => {
    setBusy(true); setFailed(false); setStatus(`${phase}...`); setRestored(null); setPreview(null);
    try {
      const selected = await runVault(phase, action);
      if (selected) { setPreview(selected); setStatus('Verified. Review the backup before choosing whether to restore.'); }
      else setStatus('No backup selected.');
      await refresh();
    } catch (error) { setFailed(true); setStatus(`Failed: ${String(error)}`); }
    finally { setBusy(false); }
  };
  const restore = async () => {
    if (!preview) return;
    setBusy(true); setFailed(false); setStatus('Restoring...');
    try {
      const result = await runVault('Restoring', () => api.vaultRestore(preview.path, preview.archive_sha256));
      setRestored(result); setStatus(result ? 'Restore complete. Your active library was not changed.' : 'Restore canceled. No library was replaced.');
    } catch (error) { setFailed(true); setStatus(`Failed: ${String(error)}`); setPreview(null); }
    finally { setBusy(false); }
  };
  const activate = async (previous = false) => {
    if (!previous && !preview) return;
    setBusy(true); setFailed(false); setStatus('Preparing notebook activation and preserving current writing...');
    try {
      await runVault(previous ? 'Returning' : 'Activating', () => previous ? api.vaultRollback() : api.vaultActivate(preview!.path, preview!.archive_sha256));
      setStatus('Selection saved. Restart to activate the selected notebook.');
    } catch (error) { setFailed(true); setStatus(`Activation did not finish: ${String(error)}. If a selection was published, the restart screen will remain visible. Keep all recovery files.`); }
    finally { setBusy(false); }
  };
  return <section className="border-t border-border pt-5 space-y-4" aria-label="The Vault backup and recovery">
    <header className="flex items-center gap-3 rounded-xl bg-background/70 p-2">
      <VaultEmblem />
      <div><h2 className="font-serif text-xl text-foreground">The Vault</h2><p className="text-xs text-muted-foreground mt-1">Local backup and recovery · A utility for all three studios</p></div>
    </header>
    <button className="help-button" onClick={()=>openHelp('vault')}>Backup &amp; recovery guide</button>
    <p className="text-xs text-muted-foreground">A backup on the same drive does not protect against drive failure. Keep a verified copy on another drive.</p>
    {!desktop ? <p className="text-sm text-muted-foreground">The Vault requires the Windows desktop app. Browser preview has no durable library.</p> : <>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => perform('Creating', api.vaultCreate)} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">Create Backup</button>
        <button disabled={busy} onClick={() => perform('Verifying', api.vaultChoose)} className="px-3 py-2 rounded-lg border border-border text-foreground text-xs disabled:opacity-50">Choose Backup File</button>
        <button disabled={busy} onClick={async () => {
          setBusy(true); setFailed(false);
          try { await runVault('Opening folder', api.vaultOpenFolder); }
          catch (error) { setFailed(true); setStatus(`Failed: ${String(error)}`); }
          finally { setBusy(false); }
        }} className="px-3 py-2 rounded-lg border border-border text-foreground text-xs disabled:opacity-50">Open Backup Folder</button>
      </div>
      <p role={failed ? 'alert' : 'status'} className={`text-xs break-words select-text ${failed ? 'text-rose-500' : 'text-muted-foreground'}`}>{status}</p>
      {activation && <div className="text-xs text-muted-foreground space-y-2 break-all select-text">
        <p>{activation.message}</p><p>Active notebook: {activation.active_path}</p>
        {activation.previous_path && <><p>Previous notebook retained at: {activation.previous_path}</p><p>Verified pre-switch backup: {activation.preserved_backup}</p>
          <details><summary className="cursor-pointer text-primary">Return to the previous notebook</summary>
            <p className="mt-2">This selects the previous folder after restart. Current writing is saved and backed up first. Both folders remain available.</p>
            <label className="flex items-start gap-2 mt-2"><input type="checkbox" checked={returnConfirmed} onChange={event => setReturnConfirmed(event.target.checked)} />I want to use {activation.previous_path} after restart.</label>
            <button disabled={busy || !returnConfirmed} onClick={() => activate(true)} className="mt-2 px-3 py-2 rounded-lg border border-primary/40 text-primary disabled:opacity-40">Return to Previous Notebook</button>
          </details></>}
      </div>}
      {preview && <><VaultPreviewCard key={preview.archive_sha256} preview={preview} onRestore={restore} />
        {activation && <ActiveNotebookConfirmation key={`active-${preview.archive_sha256}`} preview={preview} currentPath={activation.active_path} onActivate={() => activate()} />}</>}
      {restored && <div className="rounded-lg border border-primary/30 p-3 text-xs text-foreground"><p>Recovered {restored.document_count} documents into a separate folder:</p><p className="font-mono break-all select-text mt-2">{restored.restored_path}</p><p className="mt-2 text-muted-foreground">Review its Markdown files. The active editor and library remain unchanged.</p></div>}
      <div><h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Known local backups</h3>
        {history && <p className="text-xs text-muted-foreground break-all select-text mb-2">{history.folder}</p>}
        {!history?.backups.length ? <p className="text-xs text-muted-foreground">No local backups listed yet. Create one or choose an archive from disk.</p> : <ul className="space-y-2 max-h-48 overflow-y-auto">
          {history.backups.map(backup => <li key={backup.path} className="flex gap-3 items-center rounded-lg bg-muted/20 border border-border/60 p-3">
            <div className="flex-1 min-w-0"><p className="text-xs text-foreground break-all">{backup.name}</p><p className="text-xs text-muted-foreground mt-1">{new Date(backup.file_date).toLocaleString()} · {backupSize(backup.size)}</p><p className="text-xs text-muted-foreground">{backup.incomplete ? 'Interrupted capture — retained for review' : preview?.path === backup.path ? 'Verified in this session' : 'Verify before use'}</p></div>
            <button disabled={busy || backup.incomplete} onClick={() => perform('Verifying', () => api.vaultVerify(backup.path))} className="text-xs text-primary disabled:opacity-40 shrink-0">Verify Backup</button>
          </li>)}
        </ul>}
      </div>
    </>}
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Backup contents and limits</summary>
      <p className="mt-2">Includes Markdown/frontmatter, tags, favorites, studio metadata, files in Attachments, archived deletions, and the tag catalog. The SQLite index is rebuilt. Format 1 is an uncompressed ZIP: up to 10,000 files, 64 MiB per file, 1 GiB payload. Backups inside the library are excluded from capture.</p>
      <p className="mt-2">Separate-folder recovery extracts an inspection copy. Restore as Active Notebook selects a new validated copy after restart and preserves the current notebook. Interrupted recovery folders are retained. Google Drive and encryption are not enabled.</p>
    </details>
  </section>;
};
