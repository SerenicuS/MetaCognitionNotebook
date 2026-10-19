import {useRef,useEffect} from 'react';
import type {Plan} from '@/utils/thought';
import type {DocumentMetadata} from '@/types';
import {entityDeletionImpact} from '@/utils/relationships';
export function EntityArchivePreview({document,plan,documents,busy,pending,onRetry,onCancelQueued,onConfirm,onCancel,onBackup}:{document:DocumentMetadata;plan:Plan|null;documents:DocumentMetadata[];busy:boolean;pending:boolean;onRetry:()=>void;onCancelQueued:()=>void;onConfirm:()=>void;onCancel:()=>void;onBackup:()=>void}){
 const impact=entityDeletionImpact(plan,document.id),panel=useRef<HTMLDivElement>(null);
 useEffect(()=>{panel.current?.focus();},[]);
 return <div className="fixed inset-0 z-[80] bg-background/95 p-4 flex items-center justify-center"><div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="entity-archive-title" className="max-w-xl w-full max-h-[85vh] overflow-y-auto bg-card border border-border rounded-xl p-6 space-y-4" onKeyDown={e=>{if(e.key==='Escape'&&!busy&&!pending)onCancel();if(e.key==='Tab'){const controls=Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')||[]),index=controls.indexOf(window.document.activeElement as HTMLButtonElement);if(index<0||(!e.shiftKey&&index===controls.length-1)||(e.shiftKey&&index===0)){e.preventDefault();controls[e.shiftKey?controls.length-1:0]?.focus();}}}}>
  <h2 id="entity-archive-title" className="font-serif text-xl text-primary">Archive entity: {document.title}</h2>
  <p className="text-sm">This first archives the selected entity’s active relationships, then moves its Markdown document to Backups. Endpoint documents, other Universes and the shared planning catalog are not deleted.</p>
  <h3 className="font-semibold">Affected active relationships ({impact.relationships.length})</h3><ul className="text-sm space-y-2">{impact.relationships.map(r=><li key={r.id}>{documents.find(d=>d.id===r.source_id)?.title||'Missing entity'} — {r.label} → {documents.find(d=>d.id===r.target_id)?.title||'Missing entity'}</li>)}</ul>
  {!impact.relationships.length&&<p className="text-sm text-muted-foreground">No active relationships will be unlinked.</p>}
  <p className="text-sm">{impact.nodes.length} milestone references remain intact. Historical observations and stable entity IDs are preserved.</p>
  <p className="text-sm">This is a recoverable two-stage operation, not an atomic transaction. If interrupted, relationships may be archived while the entity remains visible. No automatic document Undo is provided; retain Backups and make a verified Vault backup first.</p>
  <button className="help-button" disabled={busy||pending} onClick={onBackup}>Open Settings → The Vault</button>
  {pending&&<div className="text-sm border border-border p-3"><p>Changes remain queued. Retry to finish, or explicitly cancel uncompleted queued changes. Completed changes stay; writing is retained.</p><button className="help-button" disabled={busy} onClick={onRetry}>Retry queued changes</button><button className="help-button" disabled={busy} onClick={onCancelQueued}>Cancel queued changes and close</button></div>}
  <div className="flex flex-wrap gap-3"><button className="help-button" disabled={busy||pending} onClick={onCancel}>Cancel</button><button className="help-button" disabled={busy||pending} onClick={onConfirm}>{busy?'Archiving…':'Archive relationships and entity'}</button></div>
 </div></div>;
}
