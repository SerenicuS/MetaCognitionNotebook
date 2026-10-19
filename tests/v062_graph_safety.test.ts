import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {emptyPlan,newNode,insertNode,relationshipAt,type Plan,type Relationship} from '../src/utils/thought';
import {validateAndCreateRelationship,getCharacterAffiliations,getEntityLinkedRelationships,getOtherEntityId,archiveRelationshipInPlan} from '../src/utils/universe';
import {relationshipPerspective,relationshipIdentity,preparePlanMutation,requireSaved,entityDeletionImpact,universeImpact,setUniverseArchived,setRelationshipArchived} from '../src/utils/relationships';
import {layoutRelationships,filterGraph,zoomCamera,graphNeighbors} from '../src/utils/relationshipGraph';
import {entityArchiveOperation} from '../src/services/entityArchive';
import {MutationQueue} from '../src/services/autosave';
import {RelationshipGraph} from '../src/components/studios/lorebook/RelationshipGraph';
import {EntityLinkField} from '../src/components/studios/lorebook/EntityLinkField';
import {CharacterAffiliationSelector} from '../src/components/studios/lorebook/CharacterAffiliationSelector';
import {UniverseSafety} from '../src/components/studios/lorebook/UniverseSafety';
import {EntityArchivePreview} from '../src/components/common/EntityArchivePreview';
import type {DocumentMetadata} from '../src/types';

function fixture(){
 const docs:DocumentMetadata[]=[['c','Aldric','character'],['f','Order','faction'],['g','Guild','faction'],['l','Citadel','location'],['z','Other world','character']].map(([id,title,entry_type])=>({id,title,doc_type:'lorebook',tags:[],created_at:'2026-10-19T00:00:00Z',updated_at:'2026-10-19T00:00:00Z',metadata_json:JSON.stringify({universe_id:id==='z'?'v':'u',entry_type})}));
 const p:Plan={...emptyPlan(),universes:[{id:'u',name:'Eryndor'},{id:'v',name:'Other'}],entities:docs.map(d=>({id:d.id,universe_id:d.id==='z'?'v':'u'}))};return {p,docs};
}
const params=(sourceId:string,targetId:string,label:string)=>({sourceId,targetId,label,universeId:'u'});
function add(p:Plan,docs:DocumentMetadata[],source:string,target:string,label:string){return validateAndCreateRelationship(p,docs,params(source,target,label)).updatedPlan;}
function rows(p:Plan){return p.relationships.filter(r=>!r.archived).map(relationship=>({relationship,evidence:{value:relationship.label,source:null,kind:'baseline' as const,conflict:null}}));}

test('Character membership immediately renders from both canonical endpoints, including the Faction Members field',()=>{
 const {p,docs}=fixture(),next=add(p,docs,'c','f','Member of');
 assert.equal(getCharacterAffiliations(next,'c').length,1);
 const members=getEntityLinkedRelationships(next,'f',{label:'Members',isSource:true});assert.equal(members.length,1);assert.equal(getOtherEntityId(members[0],'f'),'c');
 const html=renderToStaticMarkup(React.createElement(EntityLinkField,{currentDocId:'f',universeId:'u',plan:next,allDocuments:docs,onNavigateToEntity:()=>{},fieldLabel:'Members',allowedCategories:['characters'],relationshipLabel:'Members',multiple:true}));
 assert.match(html,/Members/);assert.match(html,/Aldric/);
});
test('Faction-created membership renders Character affiliation without a duplicate record',()=>{
 const {p,docs}=fixture(),next=add(p,docs,'f','c','Members');
 assert.equal(getCharacterAffiliations(next,'c').length,1);
 const html=renderToStaticMarkup(React.createElement(CharacterAffiliationSelector,{characterDocId:'c',universeId:'u',plan:next,allDocuments:docs,onNavigateToEntity:()=>{}}));assert.match(html,/Order/);
 assert.throws(()=>add(next,docs,'c','f','Member of'),/already exists/);assert.equal(next.relationships.length,1);
});
test('reciprocal labels preserve membership, leadership and control without inferring one from another',()=>{
 const {p,docs}=fixture();let next=add(p,docs,'c','f','Member of');
 assert.equal(getEntityLinkedRelationships(next,'f',{label:'Led by',isSource:true}).length,0);
 next=add(next,docs,'f','c','Led by');next=add(next,docs,'f','l','Controls');
 assert.equal(relationshipPerspective(next.relationships[0],'f'),'Members');assert.equal(relationshipPerspective(next.relationships[1],'c'),'Leads');assert.equal(relationshipPerspective(next.relationships[2],'l'),'Controlled by');
 assert.throws(()=>add(next,docs,'c','f','Leads'),/already exists/);assert.throws(()=>add(next,docs,'l','f','Controlled by'),/already exists/);
});
test('alliances and rivalries are symmetric, even for legacy directed storage, while different relationships coexist',()=>{
 const {p,docs}=fixture();let next=add(p,docs,'f','g','Allied with');
 assert.throws(()=>add(next,docs,'g','f','Allied with'),/already exists/);
 next=add(next,docs,'g','f','Rival of');assert.equal(next.relationships.length,2);
 assert.equal(relationshipPerspective(next.relationships[0],'g'),'Allied with');assert.equal(relationshipPerspective(next.relationships[1],'f'),'Rival of');
 assert.equal(getEntityLinkedRelationships(next,'g',{label:'Allied with',isSource:true}).length,1);
});
test('duplicate detection preserves separate Book and milestone contexts',()=>{
 const {p,docs}=fixture();const first=add(p,docs,'c','f','Member of');first.relationships[0]={...first.relationships[0],book_id:'book'};
 const next=add(first,docs,'c','f','Member of');assert.equal(next.relationships.length,2);assert.notEqual(relationshipIdentity(next.relationships[0]),relationshipIdentity(next.relationships[1]));
});
test('rapid queued mutations apply to the latest acknowledged plan and publish both endpoints',async()=>{
 const {p,docs}=fixture();let current=p;const queue=new MutationQueue();const published:Plan[]=[];
 const submit=(source:string,target:string,label:string)=>{const prepare=preparePlanMutation(()=>current,()=>0,base=>add(base,docs,source,target,label));return queue.enqueue(async()=>{const attempt=prepare();assert.equal(attempt.expected,current.revision);await Promise.resolve();current={...attempt.plan,revision:current.revision+1};published.push(current);});};
 const a=submit('c','f','Member of'),b=submit('c','g','Member of'),c=submit('f','l','Controls');assert.ok(await a);assert.ok(await b);assert.ok(await c);
 assert.equal(current.relationships.length,3);assert.equal(current.revision,3);assert.equal(getCharacterAffiliations(current,'c').length,2);assert.equal(published.length,3);
});
test('a pending entity switch cannot retarget a captured relationship mutation',async()=>{
 const {p,docs}=fixture();let current=p,selected='c';const source=selected;
 const prepare=preparePlanMutation(()=>current,()=>0,base=>add(base,docs,source,'f','Member of'));
 selected='l';current=add(current,docs,'f','l','Controls');const attempt=prepare();assert.equal(selected,'l');assert.equal(attempt.plan.relationships.filter(r=>r.source_id==='c').length,1);assert.equal(attempt.plan.relationships.length,2);
});
test('failed writes retain a frozen retry attempt and never publish success until acknowledged',async()=>{
 const {p,docs}=fixture();let current=p,fail=true,publishes=0;const queue=new MutationQueue();
 const prepare=preparePlanMutation(()=>current,()=>0,base=>add(base,docs,'c','f','Member of'));const first=prepare();
 assert.equal(await queue.enqueue(async()=>{const attempt=prepare();assert.strictEqual(attempt,first);if(fail)throw new Error('disk full');current={...attempt.plan,revision:1};publishes++;}),false);
 assert.equal(publishes,0);assert.equal(current.relationships.length,0);assert.equal(queue.pendingCount,1);assert.throws(()=>requireSaved(false),/Not saved/);
 fail=false;assert.equal(await queue.flush(),true);assert.equal(publishes,1);assert.equal(current.relationships[0].id,first.plan.relationships[0].id);
});
test('stale snapshot edits retain their expected revision rather than being blindly merged',()=>{
 const {p}=fixture();let revision=2;const prepare=preparePlanMutation(()=>({...p,revision:9}),()=>revision,{...p,revision:2});revision=9;assert.equal(prepare().expected,2);assert.equal(prepare().plan.revision,2);
});
test('renaming resolves all graph/profile labels from current documents without rewriting relationships',()=>{
 const {p,docs}=fixture();const next=add(p,docs,'c','f','Member of'),snapshot=JSON.stringify(next.relationships);const renamed=docs.map(d=>d.id==='f'?{...d,title:'Renamed Order'}:d);
 const html=renderToStaticMarkup(React.createElement(CharacterAffiliationSelector,{characterDocId:'c',universeId:'u',plan:next,allDocuments:renamed,onNavigateToEntity:()=>{}}));assert.match(html,/Renamed Order/);assert.equal(JSON.stringify(next.relationships),snapshot);
});
test('unlink and Undo affect only the chosen relationship, preserving entities and history',()=>{
 const {p,docs}=fixture();let next=add(p,docs,'c','f','Member of');next=add(next,docs,'f','l','Controls');next=insertNode(next,newNode(next,'u',null));next.nodes[0].relationship_changes=[{relationship_id:next.relationships[0].id,label:'Former member',note:''}];
 const id=next.relationships[0].id,entities=JSON.stringify(next.entities),nodes=JSON.stringify(next.nodes);const archived=archiveRelationshipInPlan(next,id);
 assert.equal(getCharacterAffiliations(archived,'c').length,0);assert.equal(archived.relationships[1].archived,false);assert.equal(JSON.stringify(archived.entities),entities);assert.equal(JSON.stringify(archived.nodes),nodes);
 const recovered=setRelationshipArchived(archived,id,false);assert.equal(getCharacterAffiliations(recovered,'c').length,1);assert.equal(relationshipAt(recovered,recovered.relationships[0],recovered.nodes[0].id).value,'Former member');
});
test('Undo cannot recreate a semantic duplicate added after an unlink',()=>{
 const {p,docs}=fixture();let next=add(p,docs,'c','f','Member of');const id=next.relationships[0].id;
 next=setRelationshipArchived(next,id,true);next=add(next,docs,'f','c','Members');assert.throws(()=>setRelationshipArchived(next,id,false),/equivalent active relationship/);
 assert.equal(next.relationships.filter(r=>!r.archived).length,1);
});
test('entity archive preview lists active impacts and retains historical references',()=>{
 const {p,docs}=fixture();let next=add(p,docs,'c','f','Member of');next=insertNode(next,newNode(next,'u',null));next.nodes[0].entity_ids=['c'];
 assert.equal(entityDeletionImpact(next,'c').relationships.length,1);assert.equal(entityDeletionImpact(next,'c').nodes.length,1);
 const html=renderToStaticMarkup(React.createElement(EntityArchivePreview,{document:docs[0],plan:next,documents:docs,busy:false,pending:false,onConfirm:()=>{},onCancel:()=>{},onBackup:()=>{},onRetry:()=>{},onCancelQueued:()=>{}}));
 assert.match(html,/Aldric/);assert.match(html,/Member of/);assert.match(html,/Order/);assert.match(html,/two-stage/);assert.match(html,/role="dialog"/);
});
test('failed relationship archival prevents document archival entirely',async()=>{
 const {p,docs}=fixture();const next=add(p,docs,'c','f','Member of');let documentsArchived=0;
 const operation=entityArchiveOperation('c',[next.relationships[0].id],{current:()=>next,save:async()=>{throw new Error('permissions');},publish:()=>{},archiveDocument:async()=>{documentsArchived++;}});
 await assert.rejects(operation,/permissions/);assert.equal(documentsArchived,0);assert.equal(next.relationships[0].archived,false);
});
test('document archive failure leaves recoverable archived links, and Retry does not replay the completed stage',async()=>{
 const {p,docs}=fixture();let current=add(p,docs,'c','f','Member of');let saves=0,attempts=0;
 const operation=entityArchiveOperation('c',[current.relationships[0].id],{current:()=>current,save:async(_,plan)=>{saves++;return {document_id:'catalog',plan:{...plan,revision:1}};},publish:r=>{current=r.plan!;},archiveDocument:async()=>{if(++attempts===1)throw new Error('access denied');}});
 await assert.rejects(operation,/Relationship archiving completed/);assert.equal(current.relationships[0].archived,true);assert.equal(current.entities.length,p.entities.length);await operation();assert.equal(saves,1);assert.equal(attempts,2);
});
test('a changed entity archive impact blocks unreviewed relationship cleanup',async()=>{
 const {p,docs}=fixture();const next=add(p,docs,'c','f','Member of');let touched=false;
 const operation=entityArchiveOperation('c',[],{current:()=>next,save:async()=>{touched=true;return {plan:null,document_id:null};},publish:()=>{},archiveDocument:async()=>{touched=true;}});
 await assert.rejects(operation,/impact changed/);assert.equal(touched,false);
});
test('Universe impact stays isolated and archive changes only its visibility flag',()=>{
 const {p,docs}=fixture();const next=add(p,docs,'c','f','Member of');const impact=universeImpact(next,'u',docs);assert.equal(impact.documents.length,4);assert.equal(impact.relationships.length,1);assert.ok(!impact.documents.some(d=>d.id==='z'));
 assert.throws(()=>setUniverseArchived(next,'u','Wrong name',true),/name changed/);
 const archived=setUniverseArchived(next,'u','Eryndor',true);assert.equal(archived.universes[0].archived,true);for(const key of ['entities','nodes','relationships','books'] as const)assert.strictEqual(archived[key],next[key]);assert.strictEqual(archived.universes[1],next.universes[1]);
 assert.equal(setUniverseArchived(archived,'u','Eryndor',false).universes[0].archived,false);
 const html=renderToStaticMarkup(React.createElement(UniverseSafety,{plan:next,universeId:'u',documents:docs}));assert.match(html,/Danger zone/);assert.match(html,/Confirm Universe name/);assert.match(html,/Permanently delete Universe — unavailable/);assert.match(html,/verified backup/);
});
test('graph filters preserve actual edges, both endpoint types and an explicit no-match result',()=>{
 const {p,docs}=fixture();let next=add(p,docs,'c','f','Member of');next=add(next,docs,'f','l','Controls');const type=(id:string)=>JSON.parse(docs.find(d=>d.id===id)!.metadata_json!).entry_type;
 assert.equal(filterGraph(next.relationships,type,'','character').length,1);assert.equal(filterGraph(next.relationships,type,'Controls','location').length,1);assert.equal(filterGraph(next.relationships,type,'Rival of','').length,0);
 assert.deepEqual(layoutRelationships([]).nodes,[]);
 assert.deepEqual([...graphNeighbors(next.relationships,'c')].sort(),['c','f']);
 assert.equal(filterGraph(next.relationships,type,'Controlled by','').length,1);
});
test('parallel and reversed edges receive distinct paths and their own edge labels',()=>{
 const {p,docs}=fixture();let next=add(p,docs,'c','f','Member of');next=add(next,docs,'f','c','Led by');next=add(next,docs,'c','f','Friend of');const layout=layoutRelationships(next.relationships);
 assert.equal(layout.edges.length,3);assert.equal(new Set(layout.edges.map(e=>e.path)).size,3);assert.equal(new Set(layout.edges.map(e=>`${e.labelX},${e.labelY}`)).size,3);
 for(const e of layout.edges){assert.ok(Number.isFinite(e.labelX));assert.ok(Number.isFinite(e.labelY));}
});
test('dense graph positioning is deterministic and prevents node rectangle overlap',()=>{
 const relationships:Relationship[]=Array.from({length:70},(_,i)=>({id:`r${i}`,source_id:`n${i%20}`,target_id:`n${(i*7+3)%20}`,universe_id:'u',book_id:null,label:`Link ${i}`,description:'',directed:true,context_node_id:null,archived:false}));
 const a=layoutRelationships(relationships),b=layoutRelationships(relationships);assert.deepEqual(a,b);assert.equal(a.edges.length,70);
 for(let i=0;i<a.nodes.length;i++)for(let j=i+1;j<a.nodes.length;j++)assert.ok(Math.abs(a.nodes[i].x-a.nodes[j].x)>=220||Math.abs(a.nodes[i].y-a.nodes[j].y)>=85,`${i} overlaps ${j}`);
 for(const e of a.edges){assert.ok(e.labelX>a.x&&e.labelX<a.x+a.width);assert.ok(e.labelY>a.y&&e.labelY<a.y+a.height);}
});
test('graph exposes type icons, keyboard focus, zoom, pan, fit and responsive SVG without inventing edges',()=>{
 const {p,docs}=fixture(),next=add(p,docs,'c','f','Member of');const html=renderToStaticMarkup(React.createElement(RelationshipGraph,{rows:rows(next),documents:docs,name:id=>docs.find(d=>d.id===id)!.title}));
 for(const text of ['Entity type legend','Character','Faction / Nation','Location','Fit to view','Zoom in graph','Graph entity type','Focus Character: Aldric','arrow keys pan'])assert.ok(html.includes(text),text);
 assert.match(html,/aria-pressed="false"/);assert.match(html,/viewBox=/);assert.match(html,/tabindex="0"/);assert.match(html,/Member of/);
 assert.equal(zoomCamera({x:2,y:3,scale:3},10).scale,4);assert.equal(zoomCamera({x:2,y:3,scale:0.2},0.001).scale,0.15);
});
test('relationship roundtrip retains archived history and Universe archive state across serialization',()=>{
 const {p,docs}=fixture();let next=add(p,docs,'c','f','Member of');next=setRelationshipArchived(next,next.relationships[0].id,true);next=setUniverseArchived(next,'u','Eryndor',true);const reopened=JSON.parse(JSON.stringify(next)) as Plan;
 assert.deepEqual(reopened,next);assert.equal(getCharacterAffiliations(reopened,'c').length,0);assert.equal(reopened.entities.length,5);assert.equal(reopened.universes[1].archived,undefined);
});
test('cross-Universe creation is rejected and unrelated documents remain untouched',()=>{
 const {p,docs}=fixture();const snapshot=JSON.stringify(docs);assert.throws(()=>add(p,docs,'c','z','Member of'),/Cross-Universe/);assert.equal(JSON.stringify(docs),snapshot);assert.equal(p.relationships.length,0);
});
test('integration retains one acknowledged Lorebook plan and does not silently discard failed mutations',()=>{
 const lore=readFileSync('src/components/studios/LorebookStudio.tsx','utf8'),app=readFileSync('src/App.tsx','utf8');
 assert.doesNotMatch(lore,/api\.thoughtGet|setPlan\(nextPlan\)|useState<Plan/);assert.match(lore,/const plan = propPlan/);assert.match(app,/preparePlanMutation/);
 const mutation=app.slice(app.indexOf('const handleThoughtSave'),app.indexOf('const handleOrganization'));
 assert.doesNotMatch(mutation,/reconcilePlans|\.discard\(/);assert.match(mutation,/setPlan\(result.plan\)/);
});
