import type {DocumentMetadata} from '../types';
import type {Plan,Relationship,Thought} from './thought';

const clean=(value:string)=>value.trim().toLowerCase();
const rules:[string[],string[],string,string,string,boolean][]=[
 [['member of','affiliated with'],['members','has member'],'membership','Member of','Members',false],
 [['leads','commander of'],['led by'],'leadership','Leads','Led by',false],
 [['controls'],['controlled by'],'control','Controls','Controlled by',false],
 [['allied with','ally','allies'],[],'alliance','Allied with','Allied with',true],
 [['rival of','rival','enemy of','hostile to'],[],'rivalry','Rival of','Rival of',true],
 [['resides in','resident of'],['inhabited by'],'residence','Resides in','Inhabited by',false],
 [['possesses','wields'],['owned by'],'ownership','Possesses','Owned by',false],
 [['created','forged'],['created by','forged by'],'creation','Created','Created by',false],
 [['occurred at'],['site of'],'site','Occurred at','Site of',false],
 [['participant in','participated in'],['participants'],'participation','Participant in','Participants',false],
];
export function relationshipMeaning(label:string){
 const value=clean(label);
 for(const [forward,reverse,kind,outgoing,incoming,symmetric] of rules){
  if(forward.includes(value)||reverse.includes(value))return {kind,outgoing,incoming,symmetric,reversed:reverse.includes(value)};
 }
 return null;
}
export function relationshipPerspective(r:Relationship,id:string):string{
 const meaning=relationshipMeaning(r.label);
 if(!meaning)return r.source_id===id||!r.directed?r.label:`Incoming: ${r.label}`;
 return meaning.symmetric?meaning.outgoing:((r.source_id===id)!==meaning.reversed?meaning.outgoing:meaning.incoming);
}
export function relationshipIdentity(r:Pick<Relationship,'source_id'|'target_id'|'label'|'directed'|'universe_id'|'book_id'|'context_node_id'>):string{
 const meaning=relationshipMeaning(r.label);let from=r.source_id,to=r.target_id;
 if(meaning?.reversed)[from,to]=[to,from];
 const symmetric=meaning?.symmetric||!r.directed;
 if(symmetric&&from>to)[from,to]=[to,from];
 return JSON.stringify([r.universe_id,r.book_id,r.context_node_id,meaning?.kind||clean(r.label),symmetric?'symmetric':'directed',from,to]);
}
export function entityRelationships(plan:Plan|null,id:string,universeId?:string){
 return (plan?.relationships||[]).filter(r=>!r.archived&&(!universeId||r.universe_id===universeId)&&(r.source_id===id||r.target_id===id));
}
export type PlanMutation=Plan|((current:Plan)=>Plan);
export type SaveThought=(expected:()=>number,edit:PlanMutation,acknowledge:(result:Thought)=>void)=>Promise<boolean>;

/** Freeze the first attempt, including IDs/revision, so retries remain idempotent. */
export function preparePlanMutation(getCurrent:()=>Plan|null,expected:()=>number,edit:PlanMutation){
 const snapshotRevision=typeof edit==='function'?undefined:expected();
 let prepared:{expected:number;plan:Plan}|undefined;
 return ()=>{
  if(prepared)return prepared;
  const current=getCurrent();
  if(typeof edit==='function'){
   if(!current)throw new Error('Planning is unavailable. Reopen the notebook before editing relationships.');
   prepared={expected:current.revision,plan:edit(current)};
  }else prepared={expected:snapshotRevision!,plan:edit};
  return prepared;
 };
}
export function requireSaved(ok:boolean){if(!ok)throw new Error('Not saved. This operation remains queued. Use Ctrl+S / Retry, or explicitly cancel queued changes before resubmitting.');}
export function updateRelationshipDescription(plan: Plan, id: string, universeId: string, expected: string, description: string): Plan {
 const relationship = plan.relationships.find(r => r.id === id && !r.archived && r.universe_id === universeId);
 if (!relationship) throw new Error('Relationship is missing, archived, or outside this Universe.');
 if (relationship.description !== expected) throw new Error('The explanation changed. Reopen it before saving.');
 return { ...plan, relationships: plan.relationships.map(r => r.id === id ? { ...r, description: description.trim() } : r) };
}
export function setRelationshipArchived(plan:Plan,id:string,archived:boolean):Plan{
 const target=plan.relationships.find(r=>r.id===id);
 if(!target)throw new Error('Relationship no longer exists. Refresh before trying again.');
 if(!archived&&plan.relationships.some(r=>r.id!==id&&!r.archived&&relationshipIdentity(r)===relationshipIdentity(target)))throw new Error('An equivalent active relationship already exists. Keep the historical record archived.');
 return {...plan,relationships:plan.relationships.map(r=>r.id===id?{...r,archived}:r)};
}
export function entityDeletionImpact(plan:Plan|null,id:string){
 return {relationships:entityRelationships(plan,id),nodes:(plan?.nodes||[]).filter(n=>n.entity_ids.includes(id)||n.changes.some(c=>c.entity_id===id))};
}
export function universeImpact(plan:Plan,id:string,docs:DocumentMetadata[]){
 const ids=new Set(plan.entities.filter(e=>e.universe_id===id).map(e=>e.id));
 const documents=docs.filter(d=>{
  if(d.doc_type!=='lorebook')return false;
  try{const meta=JSON.parse(d.metadata_json||'{}');const name=typeof meta.universe==='string'?meta.universe.trim().toLowerCase():'';const matches=plan.universes.filter(u=>u.name.trim().toLowerCase()===name);const assigned=meta.universe_id?meta.universe_id:(matches.length===1?matches[0].id:null);return meta._web_of_thought===undefined&&(ids.has(d.id)||assigned===id);}catch{return ids.has(d.id);}
 });
 return {documents,books:plan.books.filter(b=>b.universe_id===id),nodes:plan.nodes.filter(n=>n.universe_id===id),relationships:plan.relationships.filter(r=>r.universe_id===id),entities:plan.entities.filter(e=>e.universe_id===id)};
}
export function setUniverseArchived(plan:Plan,id:string,name:string,archived:boolean):Plan{
 const universe=plan.universes.find(u=>u.id===id);
 if(!universe||universe.name!==name)throw new Error('Universe name changed. Review and type its current name before confirming.');
 return {...plan,universes:plan.universes.map(u=>u.id===id?{...u,archived}:u)};
}
