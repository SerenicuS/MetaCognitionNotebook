import {useState} from 'react';
import type {Plan} from '@/utils/thought';
import type {DocumentMetadata} from '@/types';
import {universeImpact,setUniverseArchived,requireSaved,type SaveThought} from '@/utils/relationships';
export function UniverseSafety({plan,universeId,documents,save,onBackup}:{plan:Plan;universeId:string;documents:DocumentMetadata[];save?:SaveThought;onBackup?:()=>void}){
 const [name,setName]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const universe=plan.universes.find(u=>u.id===universeId);if(!universe)return null;
 const impact=universeImpact(plan,universeId,documents);
 const archive=async()=>{
  if(!save||name!==universe.name)return;setBusy(true);
  try{requireSaved(await save(()=>plan.revision,current=>setUniverseArchived(current,universeId,name,!universe.archived),()=>{}));setStatus('Universe selector visibility updated. All writing, Book/chapter content, timeline records and historical references are retained.');setName('');}
  catch(error){setStatus(`Not saved: ${String(error)}`);}finally{setBusy(false);}
 };
 return <details className="border border-rose-500/40 rounded-xl p-4 text-sm space-y-3"><summary className="cursor-pointer font-serif text-primary">Universe Settings · Danger zone</summary>
  <p>This notebook uses separate Markdown documents and one shared planning catalog. Permanent bulk deletion has no validated recovery transaction and is unavailable. Archiving here only hides this Universe from the normal selector; it never deletes or moves its contents.</p>
  <dl className="grid sm:grid-cols-2 gap-2"><div>Documents: {impact.documents.length}</div><div>Books: {impact.books.length}</div><div>Chapters: {impact.documents.filter(d=>{try{return JSON.parse(d.metadata_json||'{}').entry_type==='chapter';}catch{return false;}}).length}</div><div>Entity references: {impact.entities.length}</div><div>Milestones: {impact.nodes.length} ({impact.nodes.filter(n=>n.archived).length} archived)</div><div>Relationships: {impact.relationships.length} ({impact.relationships.filter(r=>r.archived).length} archived)</div></dl>
  <p>Universe history milestones: {impact.nodes.filter(n=>n.book_id===null).length}. Book milestones: {impact.nodes.filter(n=>n.book_id!==null).length}. {universe.archived?'This Universe is currently archived from the normal selector.':'This Universe is currently visible in the selector.'}</p>
  <details><summary className="cursor-pointer">Review Books</summary><ul>{impact.books.map(b=><li key={b.id}>{b.name}</li>)}</ul></details>
  <details><summary className="cursor-pointer">Review affected document list</summary><ul className="max-h-48 overflow-auto list-disc pl-5">{impact.documents.map(d=><li key={d.id}>{d.title}</li>)}</ul></details>
  <button className="help-button" disabled={!onBackup||busy} onClick={onBackup}>Open Settings → The Vault for a verified backup</button>
  <p>Use Create Backup and wait for verification before any manual recovery or file cleanup. Archiving does not make an automatic backup. The shared catalog and unrelated Universes remain intact. Recover through Archived Universes in the selector.</p>
  <label className="block">Type the exact Universe name to confirm: <strong>{universe.name}</strong><input className="help-input mt-2" value={name} onChange={e=>setName(e.target.value)} aria-label="Confirm Universe name" disabled={busy}/></label>
  <div className="flex flex-wrap gap-2"><button className="help-button" disabled={busy||!save||name!==universe.name} onClick={()=>void archive()}>{universe.archived?'Recover Universe':'Archive Universe (keep all content)'}</button><button className="help-button" disabled title="A recoverable multi-file permanent deletion protocol is not implemented">Permanently delete Universe — unavailable</button></div>
  {status&&<p role={status.startsWith('Not saved')?'alert':'status'}>{status}</p>}
 </details>;
}
