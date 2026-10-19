import { ContextHelp, useHelp } from '@/components/common/HelpCenter';
import { ThoughtWalkthrough } from './ThoughtWalkthrough';
import { planningViews, focusGuideTarget, localPreferences, readPreferences, writePreferences, type GuideTarget } from '@/help/onboarding';
import React, { useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';
import type { DocumentMetadata } from '@/types';
import { archiveNode, compare, initialize, insertNode, isCatalog, moveNode, newNode, promote, relationshipAt, timeline, uid, warnings, worldAt, type Plan, type Thought, type StoryNode, type Evidence, type Relationship } from '@/utils/thought';

type Save=(revision:()=>number,plan:Plan,acknowledge:(result:Thought)=>void)=>Promise<boolean>;
const field='w-full rounded-lg border border-border bg-background text-foreground p-2 text-sm';
const button='rounded-lg border border-primary/40 px-3 py-1.5 text-xs text-primary disabled:opacity-40';
const Label:React.FC<{text:string;children:React.ReactNode}>=({text,children})=><label className="block space-y-1 text-xs text-muted-foreground"><span>{text}</span>{children}</label>;
const EvidenceView:React.FC<{e:Evidence;plan:Plan}>=({e,plan})=><div><span>{e.value===null?'Unknown / unrecorded':e.value}</span><p className="text-xs text-muted-foreground">{e.kind==='earlier'?'Earlier recorded evidence; intervening state uncertain':e.kind==='direct'?'Recorded at this milestone':e.kind==='baseline'?'Explicit baseline':'No known value'}{e.source&&` · ${plan.nodes.find(n=>n.id===e.source)?.title||'Missing milestone'}`}</p>{e.conflict&&<p className="text-xs text-amber-600">Conflict: {e.conflict}</p>}</div>;

export const RelationshipGraph:React.FC<{rows:{relationship:Relationship;evidence:Evidence}[];name:(id:string)=>string}>=({rows,name})=>{
  const shown=rows.slice(0,12);const ids=[...new Set(shown.flatMap(r=>[r.relationship.source_id,r.relationship.target_id]))];
  const point=(id:string)=>({x:ids.indexOf(id)%2===0?100:580,y:45+Math.floor(ids.indexOf(id)/2)*90});
  return <svg role="img" aria-label="Contextual lore relationships; full records appear below" viewBox={`0 0 680 ${Math.max(180,Math.ceil(ids.length/2)*90+30)}`} className="w-full max-h-96 border border-border rounded-lg text-primary">
    <defs><marker id="thought-arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="currentColor" /></marker></defs>
    {shown.map(({relationship:r,evidence:e},i)=>{const a=point(r.source_id),b=point(r.target_id);return <g key={r.id}><path d={r.source_id===r.target_id?`M${a.x} ${a.y} c-60 -65 60 -65 0 0`:`M${a.x} ${a.y} Q340 ${30+i*22} ${b.x} ${b.y}`} fill="none" stroke="currentColor" strokeDasharray={e.value===null?'5 5':undefined} markerEnd={r.directed?'url(#thought-arrow)':undefined}/><text x="340" y={35+i*22} textAnchor="middle" fontSize="11" fill="currentColor">{e.value??'Unknown relationship'}</text></g>;})}
    {ids.map(id=>{const p=point(id);return <g key={id}><rect x={p.x-85} y={p.y-15} width="170" height="32" rx="8" fill="hsl(var(--background))" stroke="currentColor"/><text x={p.x} y={p.y+5} textAnchor="middle" fill="currentColor" fontSize="12">{name(id).slice(0,24)}</text></g>;})}
  </svg>;
};

export const WebOfThought:React.FC<{onSave:Save;onBack:()=>void;catalogDocument:boolean;notebookKey?:string}>=({onSave,onBack,catalogDocument,notebookKey='browser-preview'})=>{
  const {openHelp}=useHelp();
  const [advanced,setAdvanced]=useState(()=>readPreferences(localPreferences()).mode==='advanced');
  const [preferenceNotice,setPreferenceNotice]=useState('');
  const referenceDetailsRef=useRef<HTMLDetailsElement>(null),entitySelectRef=useRef<HTMLSelectElement>(null);
  const createDeskRef=useRef<HTMLButtonElement>(null),universeRef=useRef<HTMLSelectElement>(null),bookRef=useRef<HTMLSelectElement>(null);
  const namesRef=useRef<HTMLDetailsElement>(null),beginningRef=useRef<HTMLButtonElement>(null),endingRef=useRef<HTMLButtonElement>(null),addRef=useRef<HTMLButtonElement>(null),middleRef=useRef<HTMLButtonElement>(null),changeRef=useRef<HTMLButtonElement>(null);
  const toggleAdvanced=()=>{const mode=advanced?'beginner':'advanced';setAdvanced(!advanced);setTab('milestones');const p={...readPreferences(localPreferences()),mode} as const;setPreferenceNotice(writePreferences(localPreferences(),p)?'':'View preference is available for this session only.');};
  const [plan,setPlan]=useState<Plan|null>(null),[docs,setDocs]=useState<DocumentMetadata[]>([]),[loaded,setLoaded]=useState(false),[message,setMessage]=useState('Loading planning desk…');
  const local=useRef<Plan|null>(null),revision=useRef(0),pending=useRef(0),failed=useRef(false);
  const [universe,setUniverse]=useState(''),[book,setBook]=useState<string|null>(null),[selected,setSelected]=useState(''),[compareId,setCompareId]=useState(''),[page,setPage]=useState(0);
  const [tab,setTab]=useState<'milestones'|'compare'|'relationships'>('milestones'),[focusEntity,setFocusEntity]=useState('');
  const [newName,setNewName]=useState('');
  const [relationshipLimit,setRelationshipLimit]=useState(40);
  useEffect(()=>setRelationshipLimit(40),[focusEntity,universe,book]);
  const load=async()=>{
    if(pending.current||failed.current){setMessage('Wait for queued edits or use Ctrl+S / Retry before reloading. After explicitly canceling failed changes, leave and reopen this view.');return;}
    setLoaded(false);
    try{const [data,documents]=await Promise.all([api.thoughtGet(),api.listDocuments('lorebook')]);local.current=data.plan;revision.current=data.plan?.revision||0;setPlan(data.plan);setDocs(documents);setUniverse(data.plan?.universes[0]?.id||'');setBook(null);setSelected('');setLoaded(true);setMessage('Planning ready. Recorded evidence is not an automatic simulation.');}
    catch(error){setMessage(`Planning could not load: ${String(error)}. Existing files were not reset.`);}
  };
  useEffect(()=>{void load();},[]);
  const persist=(next:Plan)=>{
    if(new TextEncoder().encode(JSON.stringify(next)).length>8*1024*1024){setMessage('Planning exceeds the 8 MiB limit. This edit was not queued.');return;}
    if(next.nodes.some(n=>new Set(n.changes.map(c=>JSON.stringify([c.entity_id,c.property_key]))).size!==n.changes.length)){
      setMessage('Each entity/property can have only one change at a milestone. Choose another property; the conflicting edit was not queued.');return;
    }
    local.current=next;setPlan(next);pending.current++;setMessage('Saving planning changes…');
    void onSave(()=>revision.current,next,result=>{failed.current=false;revision.current=result.plan!.revision;local.current={...local.current!,revision:revision.current};setPlan(local.current);setMessage(pending.current>1?'Saving queued planning changes…':'Planning saved.');}).then(ok=>{if(!ok){failed.current=true;setMessage('Not saved. Changes remain queued; use Ctrl+S / Retry before exiting.');}else setMessage('Planning saved.');}).catch(error=>{failed.current=true;setMessage(`Not saved: ${String(error)}`);}).finally(()=>{pending.current--;});
  };
  const update=(transform:(p:Plan)=>Plan)=>{if(local.current)persist(transform(local.current));};
  const nodes=plan?timeline(plan,universe,book):[],node=plan?.nodes.find(n=>n.id===selected&&!n.archived),u=plan?.universes.find(u=>u.id===universe),b=plan?.books.find(b=>b.id===book);
  useEffect(()=>{setPage(p=>Math.min(p,Math.max(0,Math.ceil(nodes.length/40)-1)));},[nodes.length]);
  const name=(id:string)=>docs.find(d=>d.id===id)?.title||`Missing/archived entity (${id})`;
  const entityOptions=plan?.entities.filter(e=>e.universe_id===universe)||[];
  const patch=(change:Partial<StoryNode>)=>update(p=>({...p,nodes:p.nodes.map(n=>n.id===selected?{...n,...change,updated_at:new Date().toISOString()}:n)}));
  const addNode=(after?:string,title?:string,atStart=false)=>{if(!plan)return;const n=newNode(plan,universe,book,after);if(title)n.title=title;if(atStart)n.position=0;update(p=>insertNode(p,n));setSelected(n.id);setTab('milestones');};
  const matchingRelationships=(plan?.relationships||[]).filter(r=>!r.archived&&r.universe_id===universe&&(r.book_id===null||r.book_id===book)&&focusEntity&&(r.source_id===focusEntity||r.target_id===focusEntity));
  const relationRows=matchingRelationships.slice(0,relationshipLimit).map(r=>({relationship:r,evidence:plan&&node?relationshipAt(plan,r,node.id):{value:null,source:null,kind:'unknown' as const,conflict:null}}));
  const problems=plan?warnings(plan,docs):[];
  const switchTimeline=(u:string,b:string|null)=>{setUniverse(u);setBook(b);setSelected('');setCompareId('');setPage(0);};
  const navigateGuide=(target:GuideTarget)=>{
    if(target==='universe'||target==='book'){
      if(namesRef.current)namesRef.current.open=true;
      return focusGuideTarget(target,{universe:universeRef.current||createDeskRef.current,book:bookRef.current});
    }
    if(!u||(target==='changes'&&!node)||(target==='middle'&&!nodes.length))return false;
    if(target==='changes'&&!entityOptions.length){if(referenceDetailsRef.current)referenceDetailsRef.current.open=true;return focusGuideTarget('changes',{changes:entitySelectRef.current});}
    setTab('milestones');
    requestAnimationFrame(()=>focusGuideTarget(target,{beginning:beginningRef.current||addRef.current,ending:endingRef.current||addRef.current,middle:middleRef.current||addRef.current,changes:changeRef.current}));
    return true;
  };
  return <div className="web-thought h-full overflow-y-auto bg-background text-foreground p-6 space-y-5">
    <header className="flex flex-wrap gap-3 items-center justify-between"><div><h2 className="font-serif text-2xl text-primary">Web of Thought</h2><p className="text-xs text-muted-foreground">Know where your world ends. Discover how it gets there. · Lorebook planning</p></div><div className="flex flex-wrap gap-2"><button className="help-button" onClick={()=>openHelp('web')}>Web of Thought guide</button><button className="help-button" aria-pressed={advanced} onClick={toggleAdvanced}>{advanced?'Beginner view':'Show advanced tools'}</button>{!catalogDocument&&<button className={button} onClick={onBack}>Back to lore writing</button>}<button className={button} onClick={()=>void load()}>Reload from notebook</button></div></header>
    <ThoughtWalkthrough key={notebookKey} notebookKey={notebookKey} onNavigate={navigateGuide} onStartGuide={()=>{setAdvanced(false);setTab('milestones');}}/>
    {preferenceNotice&&<p className="text-xs">{preferenceNotice}</p>}
    <p role="status" className="text-sm">{message}</p>
    {!plan?<div className="rounded-xl border border-border p-6 space-y-3"><p>No planning data is created merely by opening this view. Existing lore, chapters and manuscripts remain unchanged.</p><p className="text-sm text-muted-foreground">Create a planning desk for your story’s milestones. Choose a Universe and Book, then add a beginning and ending. Your existing lore and chapters stay separate. Books start Standalone / Undecided until you decide their continuity.</p><button ref={createDeskRef} className={button} disabled={!loaded} onClick={()=>{const next=initialize(docs);persist(next);setUniverse(next.universes[0]?.id||'');}}>Create planning desk from existing lore</button></div>:<>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4">
        <Label text="Universe"><select ref={universeRef} className={field} value={universe} onChange={e=>switchTimeline(e.target.value,null)}><option value="">Choose a Universe</option>{plan.universes.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></Label><ContextHelp term="universe"/>
        <Label text="Timeline"><select ref={bookRef} className={field} value={book||''} onChange={e=>switchTimeline(universe,e.target.value||null)}><option value="">Universe history</option>{plan.books.filter(b=>b.universe_id===universe).map(b=><option key={b.id} value={b.id}>Book · {b.name}</option>)}</select></Label>
        <ContextHelp term="book"/>
        {b&&<details open={advanced}><summary className="text-xs text-primary cursor-pointer">Advanced: Book continuity</summary><ContextHelp term="continuity"/><Label text="Book continuity"><select className={field} value={b.continuity} onChange={e=>update(p=>({...p,books:p.books.map(old=>old.id===b.id?{...old,continuity:e.target.value as typeof b.continuity}:old)}))}><option value="standalone">Standalone / Undecided</option><option value="canonical">Canonical</option><option value="alternate">Alternate</option></select></Label></details>}
        <details ref={namesRef} open={!advanced&&(!u||!b)} className="text-xs"><summary className="cursor-pointer text-primary">Create or rename a Universe / Book</summary><div className="space-y-2 mt-2">
          {u&&<Label text="Rename Universe (IDs stay stable)"><input className={field} value={u.name} onChange={e=>update(p=>({...p,universes:p.universes.map(old=>old.id===u.id?{...old,name:e.target.value||'Unnamed Universe'}:old)}))}/></Label>}
          {b&&<Label text="Rename Book"><input className={field} value={b.name} onChange={e=>update(p=>({...p,books:p.books.map(old=>old.id===b.id?{...old,name:e.target.value||'Unnamed Book'}:old)}))}/></Label>}
          <Label text="New name"><input className={field} value={newName} onChange={e=>setNewName(e.target.value)}/></Label>
          <button className={button} disabled={!newName.trim()} onClick={()=>{const id=uid();update(p=>({...p,universes:[...p.universes,{id,name:newName.trim()}]}));switchTimeline(id,null);setNewName('');}}>Add Universe</button>{' '}
          <button className={button} disabled={!u||!newName.trim()} onClick={()=>{const id=uid();update(p=>({...p,books:[...p.books,{id,universe_id:universe,name:newName.trim(),continuity:'standalone'}]}));switchTimeline(universe,id);setNewName('');}}>Add Book</button>
        </div></details>
      </div>
      <p className="text-xs text-muted-foreground">{advanced?(book?'Book narrative · independent order and state evidence. Shared events are references, not automatic state imports.':'Universe history · shared across Books only through explicit links.'):(book?'This Book has its own story moments. You can add the ending before filling in the middle.':'Choose a Book in Timeline to plan its beginning and ending. Universe history is for events shared by several Books.')} Milestones never create chapters.</p>
      <details ref={referenceDetailsRef} className="text-xs"><summary className="text-primary cursor-pointer">Lore entities & reference health ({entityOptions.length})</summary><p className="mt-2">Existing document identities are reused. Missing/archived documents keep their references. Universe membership is recorded explicitly and does not rename original hierarchy labels.</p><button className="help-button my-2" onClick={async()=>{try{setDocs(await api.listDocuments('lorebook'));setMessage('Available lore entries refreshed. Attach an unassigned entry explicitly; no notebook data was changed by refreshing.');}catch(error){setMessage(`Could not refresh lore entries: ${String(error)}`);}}}>Refresh lore entries</button><Label text="Attach an unassigned lore entity to this Universe"><select ref={entitySelectRef} className={field} value="" disabled={!u} onChange={e=>{if(e.target.value)update(p=>({...p,entities:[...p.entities,{id:e.target.value,universe_id:universe}]}));}}><option value="">Choose entity…</option>{docs.filter(d=>!isCatalog(d)&&!plan.entities.some(e=>e.id===d.id)).map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></Label>{problems.map((p,i)=><p key={i} className="mt-2 text-amber-600">{p}</p>)}{!problems.length&&<p>No missing references found.</p>}</details>
      <nav aria-label="Planning views" className="flex gap-2">{planningViews(advanced).map(t=><button key={t} className={`${button} ${t===tab?'bg-primary/15':''}`} aria-pressed={t===tab} onClick={()=>setTab(t)}>{t==='milestones'?'Milestones':t==='compare'?'Compare Story Nodes':'Relationships'}</button>)}</nav>
      {u&&<div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-5">
        <aside className="space-y-2"><h3 className="font-serif text-lg">{book?'Book timeline':'Universe timeline'}</h3><ContextHelp term="node"/>{!advanced&&<div className="flex flex-wrap gap-2"><button ref={beginningRef} className={button} onClick={()=>addNode(undefined,'Beginning',true)}>Add Beginning Story Node</button><button ref={endingRef} className={button} onClick={()=>addNode(undefined,'Ending')}>Add Ending Story Node</button></div>}<button ref={addRef} className={button} onClick={()=>addNode()}>Add milestone at end</button>
          {!nodes.length&&<p className="text-sm text-muted-foreground p-3">Start with the ending, the beginning, or any milestone. No dates or intermediate chapters are required.</p>}
          <ol className="space-y-2 max-h-[65vh] overflow-y-auto">{nodes.slice(page*40,page*40+40).map((n,i)=><li key={n.id} className={`rounded-lg border p-3 ${selected===n.id?'border-primary bg-primary/10':'border-border'}`}>
            <button className="w-full text-left" onClick={()=>setSelected(n.id)}><strong className="text-sm block">{page*40+i+1}. {n.title}</strong><span className="text-xs text-muted-foreground line-clamp-2">{n.description||'Summary not yet recorded'}</span><span className="text-xs text-primary block">{n.era||'No date required'} · {n.status}</span></button>
            <div className="flex gap-2 mt-2"><button className={button} aria-label={`Move ${n.title} earlier`} onClick={()=>update(p=>moveNode(p,n.id,-1))}>↑</button><button className={button} aria-label={`Move ${n.title} later`} onClick={()=>update(p=>moveNode(p,n.id,1))}>↓</button><button ref={i===0?middleRef:undefined} className={button} onClick={()=>addNode(n.id)}>Insert after</button></div>
            {nodes.indexOf(n)<nodes.length-1&&<p className="text-xs text-muted-foreground mt-3 border-l border-dashed border-primary/50 pl-2">Transition unexplained unless recorded in milestone notes. Gaps are welcome.</p>}
          </li>)}</ol>
          {nodes.length>40&&<div className="flex gap-2 items-center text-xs"><button className={button} disabled={!page} onClick={()=>setPage(page-1)}>Previous</button>Page {page+1}<button className={button} disabled={(page+1)*40>=nodes.length} onClick={()=>setPage(page+1)}>Next</button></div>}
          {plan.nodes.some(n=>n.archived&&n.universe_id===universe&&n.book_id===book)&&<details className="text-xs"><summary>Archived milestones</summary>{plan.nodes.filter(n=>n.archived&&n.universe_id===universe&&n.book_id===book).map(n=><p key={n.id}>{n.title} <button className={button} onClick={()=>update(p=>({...p,nodes:p.nodes.map(old=>old.id===n.id?{...old,archived:false}:old)}))}>Recover milestone</button></p>)}</details>}
        </aside>
        <section className="min-w-0 space-y-4">
          {!node?<p className="rounded-lg border border-border p-6 text-muted-foreground">Choose a milestone to edit its summary, state evidence and relationship context.</p>:<>
          <div className="flex justify-between items-center gap-2"><h3 className="font-serif text-xl">{node.title}</h3><button className={button} onClick={()=>{if(window.confirm(`Archive milestone “${node.title}”? Entity documents, chapters and Book perspectives will remain. Its changes stop contributing until recovered.`)){update(p=>archiveNode(p,node.id));setSelected('');}}}>Delete / archive milestone</button></div>
          {tab==='milestones'&&<>
            <Label text="Milestone title"><input className={field} value={node.title} onChange={e=>patch({title:e.target.value||'Untitled milestone'})}/></Label>
            <Label text="Narrative summary / Book perspective"><textarea className={field} rows={4} value={node.description} onChange={e=>patch({description:e.target.value})}/></Label>
            <details open={advanced}><summary className="text-sm text-primary cursor-pointer">Optional date & planning status</summary><div className="grid sm:grid-cols-2 gap-3"><Label text="In-world date or era (optional)"><input className={field} value={node.era} onChange={e=>patch({era:e.target.value})}/></Label><Label text="Planning status"><select className={field} value={node.status} onChange={e=>patch({status:e.target.value as StoryNode['status']})}><option value="planned">Planned</option><option value="drafted">Drafted</option><option value="written">Written</option></select></Label></div></details>
            <Label text="Unresolved plot questions / unexplained journey"><textarea className={field} rows={2} value={node.questions} onChange={e=>patch({questions:e.target.value})}/></Label>
            <details><summary className="cursor-pointer text-sm text-primary">Referenced lore entities ({node.entity_ids.length})</summary><div className="grid gap-2 mt-2 max-h-48 overflow-y-auto">{entityOptions.map(e=><label key={e.id} className="text-sm"><input type="checkbox" checked={node.entity_ids.includes(e.id)} onChange={event=>patch({entity_ids:event.target.checked?[...node.entity_ids,e.id]:node.entity_ids.filter(id=>id!==e.id)})}/> {name(e.id)}</label>)}</div></details>
            <h4 className="font-serif text-lg">What changed in the world?</h4><ContextHelp term="world"/><ContextHelp term="unknown"/><p className="text-xs text-muted-foreground">Record only the properties that matter here. Earlier values are evidence, not proof that nothing changed between milestones.</p>
            {node.changes.map(c=><div key={c.id} className="rounded-lg border border-border p-3 space-y-2">
              <Label text="Entity"><select className={field} value={c.entity_id} onChange={e=>patch({changes:node.changes.map(old=>old.id===c.id?{...old,entity_id:e.target.value}:old)})}>{entityOptions.map(e=><option key={e.id} value={e.id}>{name(e.id)}</option>)}</select></Label>
              <Label text="Property (custom keys welcome)"><input className={field} list="thought-properties" value={c.property_key} onChange={e=>patch({changes:node.changes.map(old=>old.id===c.id?{...old,property_key:e.target.value||'status'}:old)})}/></Label>
              <div className="grid sm:grid-cols-2 gap-2"><Label text="Previous value (optional expectation)"><input className={field} value={c.previous_value??''} onChange={e=>patch({changes:node.changes.map(old=>old.id===c.id?{...old,previous_value:e.target.value||null}:old)})}/></Label><Label text="New value (blank explicitly records unknown)"><input className={field} value={c.new_value??''} onChange={e=>patch({changes:node.changes.map(old=>old.id===c.id?{...old,new_value:e.target.value||null}:old)})}/></Label></div>
              <Label text="Change explanation (optional)"><input className={field} value={c.note} onChange={e=>patch({changes:node.changes.map(old=>old.id===c.id?{...old,note:e.target.value}:old)})}/></Label>
              <button className={button} onClick={()=>{if(window.confirm('Remove this recorded change? No lore document is deleted.'))patch({changes:node.changes.filter(old=>old.id!==c.id)});}}>Remove change</button>
            </div>)}
            <button ref={changeRef} className={button} disabled={!entityOptions.length} onClick={()=>{const entity=entityOptions[0];let property='status';let i=2;while(node.changes.some(c=>c.entity_id===entity.id&&c.property_key===property))property=`status ${i++}`;patch({changes:[...node.changes,{id:uid(),entity_id:entity.id,property_key:property,previous_value:null,new_value:null,note:''}]});}}>Record entity change</button>
            {!entityOptions.length&&<p className="text-sm text-muted-foreground">No lore entry is attached to this Universe yet. Open Lore entities &amp; reference health above, use Refresh lore entries, then attach an unassigned entry. To create one first, press Ctrl+N and choose Lorebook; return here afterward.</p>}
            <datalist id="thought-properties">{['status','alive','location','political control','allegiance','condition'].map(p=><option key={p} value={p}/>)}</datalist>
            <details><summary className="cursor-pointer text-primary text-sm">Advanced: recorded state & conflicts</summary>{[...worldAt(plan,node.id)].map(([key,e])=>{const [id,property]=JSON.parse(key);return <div key={key} className="border-b border-border py-2 text-sm"><strong>{name(id)} · {property}</strong><EvidenceView e={e} plan={plan}/></div>;})}</details>
            {book&&<details open={advanced} className="rounded-lg border border-primary/30 p-4 space-y-3"><summary className="font-serif cursor-pointer">Advanced: shared Universe event</summary><ContextHelp term="event"/>
              <Label text="Link this Book perspective to existing history"><select className={field} value={node.linked_event_id||''} onChange={e=>patch({linked_event_id:e.target.value||null})}><option value="">No shared event</option>{node.linked_event_id&&!plan.nodes.some(n=>n.id===node.linked_event_id&&!n.archived)&&<option value={node.linked_event_id}>Missing/archived event · reference retained</option>}{timeline(plan,universe,null).map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select></Label>
              {node.linked_event_id&&<button className={button} disabled={!plan.nodes.some(n=>n.id===node.linked_event_id&&!n.archived)} onClick={()=>{const event=plan.nodes.find(n=>n.id===node.linked_event_id)!;switchTimeline(universe,null);setSelected(event.id);}}>Inspect linked Universe event</button>}
              <p className="text-xs text-muted-foreground">Linking shares identity without overwriting this Book’s perspective. Promotion copies summary and world changes; Book-only relationship changes stay in this Book.</p>
              <button className={button} disabled={b?.continuity!=='canonical'} onClick={()=>{if(window.confirm(`Publish “${node.title}” as a NEW shared Universe event? This changes shared history. The original Book milestone and perspective remain.`))update(p=>promote(p,node.id,true));}}>Confirm promotion to Universe history</button><ContextHelp term="promotion"/>{b?.continuity!=='canonical'&&<p className="text-xs">Alternate and Standalone Books may link history but cannot publish it.</p>}
            </details>}
          </>}
          {tab==='compare'&&<div className="space-y-3"><ContextHelp term="comparison"/><ContextHelp term="unknown"/><Label text="Compare selected milestone with"><select className={field} value={compareId} onChange={e=>setCompareId(e.target.value)}><option value="">Choose another milestone</option>{nodes.filter(n=>n.id!==node.id).map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select></Label><p className="text-xs text-muted-foreground">Unknown is not unchanged. Earlier evidence does not explain an intervening journey. Reordering recomputes these views; it never rewrites recorded values.</p>{compareId&&nodes.some(n=>n.id===compareId)&&<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Entity / property</th><th className="text-left">{node.title}</th><th className="text-left">{plan.nodes.find(n=>n.id===compareId)?.title}</th></tr></thead><tbody>{compare(plan,node.id,compareId).map(row=><tr key={row.key} className="border-t border-border align-top"><td className="p-2">{name(row.entity_id)}<p className="text-xs">{row.property}</p></td><td className="p-2"><EvidenceView e={row.a} plan={plan}/></td><td className="p-2"><EvidenceView e={row.b} plan={plan}/></td></tr>)}</tbody></table>{!compare(plan,node.id,compareId).length&&<p>No properties recorded at or before either milestone. World state is unknown.</p>}</div>}</div>}
          {advanced&&tab==='relationships'&&<div className="space-y-3"><ContextHelp term="relationship"/>
            <Label text="Focus one entity (choose one to draw connected records)"><select className={field} value={focusEntity} onChange={e=>setFocusEntity(e.target.value)}><option value="">Choose entity…</option>{entityOptions.map(e=><option key={e.id} value={e.id}>{name(e.id)}</option>)}</select></Label>
            <p className="text-xs text-muted-foreground">Dashed edges are unknown. The graph shows up to 12 contextual connections; the record list keeps every match. Later labels are stored at milestones, not over the definition.</p>
            {focusEntity?<RelationshipGraph rows={relationRows} name={name}/>:<p className="text-muted-foreground">Select an entity to avoid displaying the entire world at once.</p>}
            <button className={button} disabled={entityOptions.length<1} onClick={()=>{const r:Relationship={id:uid(),universe_id:universe,book_id:book,source_id:entityOptions[0].id,target_id:entityOptions[Math.min(1,entityOptions.length-1)].id,label:'relates to',description:'',directed:true,context_node_id:node.id,archived:false};update(p=>({...p,relationships:[...p.relationships,r]}));setFocusEntity(r.source_id);}}>Add relationship starting here</button>
            {(focusEntity?relationRows.slice(0,relationshipLimit):[]).map(({relationship:r,evidence:e})=><details key={r.id} className="border border-border rounded-lg p-3"><summary className="cursor-pointer text-sm">{name(r.source_id)} {r.directed?'→':'↔'} {name(r.target_id)} · {e.value??'Unknown / unrecorded'}</summary><div className="space-y-2 mt-3">
              <EvidenceView e={e} plan={plan}/>
              {book!==null&&r.book_id===null&&<p className="text-xs text-muted-foreground">Shared Universe definition is read-only in a Book. Record this Book’s label change below, or inspect the Universe timeline to edit shared history.</p>}
              <fieldset disabled={book!==null&&r.book_id===null} className="space-y-2 disabled:opacity-60">
              {(['source_id','target_id'] as const).map(key=><Label key={key} text={key==='source_id'?'From entity':'To entity'}><select className={field} value={r[key]} onChange={event=>update(p=>({...p,relationships:p.relationships.map(old=>old.id===r.id?{...old,[key]:event.target.value}:old)}))}>{entityOptions.map(e=><option key={e.id} value={e.id}>{name(e.id)}</option>)}</select></Label>)}
              <label className="text-xs"><input type="checkbox" checked={r.directed} onChange={event=>update(p=>({...p,relationships:p.relationships.map(old=>old.id===r.id?{...old,directed:event.target.checked}:old)}))}/> Directed relationship</label>
              <Label text="Initial label (editing corrects the original record)"><input className={field} value={r.label} onChange={event=>update(p=>({...p,relationships:p.relationships.map(old=>old.id===r.id?{...old,label:event.target.value||'relates to'}:old)}))}/></Label>
              <Label text="Description"><textarea className={field} value={r.description} onChange={event=>update(p=>({...p,relationships:p.relationships.map(old=>old.id===r.id?{...old,description:event.target.value}:old)}))}/></Label>
              <Label text="Starting context"><select className={field} value={r.context_node_id||''} onChange={event=>update(p=>({...p,relationships:p.relationships.map(old=>old.id===r.id?{...old,context_node_id:event.target.value||null}:old)}))}><option value="">Explicit timeless baseline</option>{timeline(plan,universe,r.book_id).map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select></Label>
              </fieldset>
              <Label text="Record a changed label at the SELECTED milestone (blank = unknown)"><input className={field} value={node.relationship_changes.find(c=>c.relationship_id===r.id)?.label??''} onChange={event=>patch({relationship_changes:[...node.relationship_changes.filter(c=>c.relationship_id!==r.id),{relationship_id:r.id,label:event.target.value||null,note:''}]})}/></Label>
              {!node.relationship_changes.some(c=>c.relationship_id===r.id)&&<p className="text-xs text-muted-foreground">No local change recorded here. The evidence above may come from an earlier milestone.</p>}
              <button className={button} onClick={()=>patch({relationship_changes:[...node.relationship_changes.filter(c=>c.relationship_id!==r.id),{relationship_id:r.id,label:null,note:'Explicitly unknown'}]})}>Record unknown here</button>
              {node.relationship_changes.some(c=>c.relationship_id===r.id)&&<button className={button} onClick={()=>{if(window.confirm('Remove this milestone’s relationship observation? Earlier records remain.'))patch({relationship_changes:node.relationship_changes.filter(c=>c.relationship_id!==r.id)});}}>Remove local observation</button>}
              <button className={button} disabled={book!==null&&r.book_id===null} onClick={()=>{if(window.confirm('Archive this relationship? Historical records and entity documents remain.'))update(p=>({...p,relationships:p.relationships.map(old=>old.id===r.id?{...old,archived:true}:old)}));}}>Delete / archive relationship</button>
            </div></details>)}
            {focusEntity&&matchingRelationships.length>relationshipLimit&&<button className={button} onClick={()=>setRelationshipLimit(relationshipLimit+40)}>Show 40 more relationship records</button>}
            {focusEntity&&!relationRows.length&&<p>No active relationships in this context. Nothing is inferred automatically.</p>}
            <details className="text-xs"><summary>Archived relationship records</summary>{plan.relationships.filter(r=>r.archived&&r.universe_id===universe&&(r.book_id===null||r.book_id===book)).map(r=><p key={r.id} className="mt-2">{name(r.source_id)} · {r.label} · {name(r.target_id)} <button className={button} disabled={book!==null&&r.book_id===null} onClick={()=>update(p=>({...p,relationships:p.relationships.map(old=>old.id===r.id?{...old,archived:false}:old)}))}>Recover relationship</button></p>)}</details>
          </div>}
          </>}
        </section>
      </div>}
    </>}
  </div>;
};
