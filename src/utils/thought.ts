import type { DocumentMetadata } from '../types';
export interface Universe { id:string; name:string; description?:string }
export type Continuity='canonical'|'alternate'|'standalone';
export interface Book { id:string; universe_id:string; name:string; continuity:Continuity; description?:string }
export interface Entity { id:string; universe_id:string }
export interface Change { id:string; entity_id:string; property_key:string; previous_value:string|null; new_value:string|null; note:string }
export interface RelationshipChange { relationship_id:string; label:string|null; note:string }
export interface StoryNode {
  id:string; universe_id:string; book_id:string|null; position:number; title:string; description:string; era:string;
  status:'planned'|'drafted'|'written'; questions:string; entity_ids:string[]; changes:Change[]; relationship_changes:RelationshipChange[];
  linked_event_id:string|null; origin_node_id:string|null; archived:boolean; created_at:string; updated_at:string;
}
export interface Relationship { id:string; universe_id:string; book_id:string|null; source_id:string; target_id:string; label:string; description:string; directed:boolean; context_node_id:string|null; archived:boolean }
export interface Plan { version:1; revision:number; universes:Universe[]; books:Book[]; entities:Entity[]; nodes:StoryNode[]; relationships:Relationship[] }
export interface Thought { document_id:string|null; plan:Plan|null }
export const uid=()=>globalThis.crypto.randomUUID();
export const emptyPlan=():Plan=>({version:1,revision:0,universes:[],books:[],entities:[],nodes:[],relationships:[]});
export const isCatalog=(doc:DocumentMetadata)=>{try{return JSON.parse(doc.metadata_json||'{}')._web_of_thought!==undefined;}catch{return false;}};
export function initialize(docs:DocumentMetadata[]):Plan {
  const plan=emptyPlan();
  for(const doc of docs.filter(d=>d.doc_type==='lorebook'&&!isCatalog(d))) {
    let meta:Record<string,unknown>;try{const parsed=JSON.parse(doc.metadata_json||'{}');meta=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};}catch{continue;}
    const name=typeof meta.universe==='string'&&meta.universe.trim()?meta.universe:'Unassigned Cosmos';
    let universe=plan.universes.find(u=>u.name===name);
    if(!universe){universe={id:uid(),name};plan.universes.push(universe);}
    plan.entities.push({id:doc.id,universe_id:universe.id});
    if(typeof meta.book==='string'&&meta.book.trim()&&!plan.books.some(b=>b.universe_id===universe!.id&&b.name===meta.book))
      plan.books.push({id:uid(),universe_id:universe.id,name:meta.book,continuity:'standalone'});
  }
  return plan;
}
export const timeline=(p:Plan,u:string,b:string|null)=>p.nodes.filter(n=>!n.archived&&n.universe_id===u&&n.book_id===b).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
export function newNode(p:Plan,u:string,b:string|null,after?:string):StoryNode {
  const ordered=timeline(p,u,b);const index=after?ordered.findIndex(n=>n.id===after)+1:ordered.length;
  // Integral ranks are normalized on insertion/move. Identity and attached changes never depend on rank.
  const now=new Date().toISOString();
  return {id:uid(),universe_id:u,book_id:b,position:index,title:'Untitled milestone',description:'',era:'',status:'planned',questions:'',entity_ids:[],changes:[],relationship_changes:[],linked_event_id:null,origin_node_id:null,archived:false,created_at:now,updated_at:now};
}
export function insertNode(p:Plan,n:StoryNode):Plan {
  const ordered=timeline(p,n.universe_id,n.book_id);ordered.splice(n.position,0,n);
  const ranks=new Map(ordered.map((n,i)=>[n.id,i]));
  return {...p,nodes:[...p.nodes,n].map(node=>ranks.has(node.id)?{...node,position:ranks.get(node.id)!}:node)};
}
export function moveNode(p:Plan,id:string,offset:number):Plan {
  const node=p.nodes.find(n=>n.id===id);if(!node)return p;
  const ordered=timeline(p,node.universe_id,node.book_id);const i=ordered.findIndex(n=>n.id===id),j=Math.max(0,Math.min(ordered.length-1,i+offset));
  ordered.splice(i,1);ordered.splice(j,0,node);
  const ranks=new Map(ordered.map((n,i)=>[n.id,i]));
  return {...p,nodes:p.nodes.map(n=>ranks.has(n.id)?{...n,position:ranks.get(n.id)!,updated_at:new Date().toISOString()}:n)};
}
export function archiveNode(p:Plan,id:string):Plan { return {...p,nodes:p.nodes.map(n=>n.id===id?{...n,archived:true,updated_at:new Date().toISOString()}:n)}; }
export function promote(p:Plan,id:string,confirmed:boolean):Plan {
  const source=p.nodes.find(n=>n.id===id&&!n.archived);const book=p.books.find(b=>b.id===source?.book_id);
  if(!confirmed||!source||book?.continuity!=='canonical')throw new Error('Promotion requires explicit confirmation and a Canonical Book.');
  const event={...source,id:uid(),book_id:null,origin_node_id:source.id,linked_event_id:null,relationship_changes:source.relationship_changes.filter(c=>p.relationships.some(r=>r.id===c.relationship_id&&r.book_id===null)),changes:source.changes.map(c=>({...c,id:uid()})),position:timeline(p,source.universe_id,null).length,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  return {...p,nodes:[...p.nodes.map(n=>n.id===id?{...n,linked_event_id:event.id}:n),event]};
}
export interface Evidence { value:string|null; source:string|null; kind:'unknown'|'direct'|'earlier'|'baseline'; conflict:string|null }
export const unknown=():Evidence=>({value:null,source:null,kind:'unknown',conflict:null});
export function worldAt(p:Plan,id:string):Map<string,Evidence> {
  const target=p.nodes.find(n=>n.id===id&&!n.archived);const result=new Map<string,Evidence>();if(!target)return result;
  for(const node of timeline(p,target.universe_id,target.book_id)) {
    for(const c of node.changes) {
      const key=JSON.stringify([c.entity_id,c.property_key]);const before=result.get(key);
      const conflict=c.previous_value!==null&&before?.value!==undefined&&before.value!==null&&before.value!==c.previous_value?`Expected ${c.previous_value}; earlier record says ${before.value}. Recheck order or record.`:null;
      result.set(key,{value:c.new_value,source:node.id,kind:node.id===id?'direct':'earlier',conflict});
    }
    if(node.id===id)break;
  }
  return result;
}
export function compare(p:Plan,a:string,b:string) {
  const left=p.nodes.find(n=>n.id===a),right=p.nodes.find(n=>n.id===b);
  if(!left||!right||left.archived||right.archived||left.universe_id!==right.universe_id||left.book_id!==right.book_id)throw new Error('Choose two active milestones from the same timeline.');
  const A=worldAt(p,a),B=worldAt(p,b);
  return [...new Set([...A.keys(),...B.keys()])].map(key=>({key,entity_id:JSON.parse(key)[0] as string,property:JSON.parse(key)[1] as string,a:A.get(key)||unknown(),b:B.get(key)||unknown()}));
}
export function relationshipAt(p:Plan,r:Relationship,nodeId:string):Evidence {
  const node=p.nodes.find(n=>n.id===nodeId&&!n.archived);
  if(!node||r.archived||r.universe_id!==node.universe_id||(r.book_id!==null&&r.book_id!==node.book_id))return unknown();
  let evidence:Evidence=r.context_node_id===null?{value:r.label,kind:'baseline',source:null,conflict:null}:unknown();
  for(const n of timeline(p,node.universe_id,node.book_id)) {
    if(n.id===r.context_node_id)evidence={value:r.label,source:n.id,kind:n.id===nodeId?'direct':'earlier',conflict:null};
    for(const c of n.relationship_changes.filter(c=>c.relationship_id===r.id))evidence={value:c.label,source:n.id,kind:n.id===nodeId?'direct':'earlier',conflict:null};
    if(n.id===nodeId)break;
  }
  return evidence;
}
export function warnings(p:Plan,docs:DocumentMetadata[]):string[] {
  const messages:string[]=[];const available=new Set(docs.filter(d=>d.doc_type==='lorebook'&&!isCatalog(d)).map(d=>d.id));
  for(const e of p.entities)if(!available.has(e.id))messages.push(`Missing or archived lore entity: ${e.id}. References retained.`);
  for(const n of p.nodes.filter(n=>!n.archived)) {
    if(n.linked_event_id&&!p.nodes.some(e=>e.id===n.linked_event_id&&!e.archived))messages.push(`${n.title}: linked Universe event is missing or archived; Book perspective retained.`);
    for(const c of n.relationship_changes)if(!p.relationships.some(r=>r.id===c.relationship_id&&!r.archived))messages.push(`${n.title}: relationship missing/archived; history retained.`);
  }
  for(const r of p.relationships.filter(r=>!r.archived))if(r.context_node_id&&!p.nodes.some(n=>n.id===r.context_node_id&&!n.archived))messages.push(`${r.label}: starting milestone missing/archived; state is unrecorded until new evidence.`);
  return messages;
}
