import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as W from '../src/utils/thought';
import { RelationshipGraph } from '../src/components/studios/WebOfThought';
import { MockStorage, api } from '../src/services/api';
import { MutationQueue, CommandQueue, flushWorkspace, ExitCoordinator } from '../src/services/autosave';

function fixture(){const docs=new MockStorage().documents.map(d=>d.metadata);const p=W.initialize(docs);const u=p.universes[0].id;const entity=p.entities[0].id;const book={id:W.uid(),universe_id:u,name:'I',continuity:'standalone' as W.Continuity};p.books.push(book);return {p,u,entity,book,docs};}
function node(p:W.Plan,u:string,b:string|null,title:string){const n={...W.newNode(p,u,b),title};return {p:W.insertNode(p,n),n};}

test('legacy hierarchy imports only Lorebook labels with stable entities and safe undecided Books',()=>{
 const docs=new MockStorage().documents.map(d=>d.metadata);const before=JSON.stringify(docs);const p=W.initialize(docs);
 assert.equal(p.entities.length,1);assert.equal(p.entities[0].id,'demo-lore-1');assert.equal(p.books[0].continuity,'standalone');assert.equal(JSON.stringify(docs),before);
 const nullMetadata=docs.map(d=>({...d,metadata_json:'null'}));assert.equal(W.initialize(nullMetadata).entities.length,1);
});
test('ending-first insertion, duplicate titles and absent dates preserve stable attached changes',()=>{
 let {p,u,entity}=fixture();let a=node(p,u,null,'Golden Age');p=a.p;let z=node(p,u,null,'Fall');p=z.p;
 p.nodes[1].changes=[{id:W.uid(),entity_id:entity,property_key:'status',previous_value:null,new_value:'destroyed',note:'Cause unresolved'}];
 const middle={...W.newNode(p,u,null,a.n.id),title:'Fall'};p=W.insertNode(p,middle);
 assert.deepEqual(W.timeline(p,u,null).map(n=>n.id),[a.n.id,middle.id,z.n.id]);assert.equal(p.nodes[1].changes[0].new_value,'destroyed');assert.equal(middle.era,'');
 p=W.moveNode(p,z.n.id,-1);assert.deepEqual(W.timeline(p,u,null).map(n=>n.id),[a.n.id,z.n.id,middle.id]);
});
test('multiple Books and Universe timelines remain independent',()=>{
 let {p,u,book}=fixture();const b2={...book,id:W.uid(),name:'II'};p.books.push(b2);
 for(const scope of [null,book.id,b2.id])p=node(p,u,scope,'Same title').p;
 assert.equal(W.timeline(p,u,null).length,1);assert.equal(W.timeline(p,u,book.id).length,1);assert.equal(W.timeline(p,u,b2.id).length,1);
});
test('classification changes never publish or remove nodes or shared references',()=>{
 let {p,u,book}=fixture();p=node(p,u,book.id,'Book ending').p;const before=JSON.stringify(p.nodes);
 for(const continuity of ['canonical','alternate','standalone'] as const){p={...p,books:p.books.map(b=>({...b,continuity}))};assert.equal(JSON.stringify(p.nodes),before);assert.equal(W.timeline(p,u,null).length,0);}
});
test('state diff distinguishes unknown endpoints, explicit unknown and direct/earlier evidence',()=>{
 let {p,u,entity}=fixture();const a=node(p,u,null,'A');p=a.p;const b=node(p,u,null,'B');p=b.p;const c=node(p,u,null,'C');p=c.p;
 p.nodes.find(n=>n.id===b.n.id)!.changes.push({id:W.uid(),entity_id:entity,property_key:'status',previous_value:'Alive',new_value:'Dead',note:''});
 const row=W.compare(p,a.n.id,c.n.id)[0];assert.equal(row.a.kind,'unknown');assert.equal(row.a.value,null);assert.equal(row.b.kind,'earlier');assert.equal(row.b.value,'Dead');
 assert.equal(W.worldAt(p,b.n.id).values().next().value!.kind,'direct');
 p.nodes.find(n=>n.id===c.n.id)!.changes.push({id:W.uid(),entity_id:entity,property_key:'status',previous_value:null,new_value:null,note:'Uncertain'});
 assert.equal(W.compare(p,b.n.id,c.n.id)[0].b.value,null);
});
test('reordering recomputes expectation conflicts instead of rewriting history',()=>{
 let {p,u,entity}=fixture();for(const title of ['Alive','Dead'])p=node(p,u,null,title).p;
 p.nodes[0].changes=[{id:W.uid(),entity_id:entity,property_key:'alive',previous_value:null,new_value:'Alive',note:''}];
 p.nodes[1].changes=[{id:W.uid(),entity_id:entity,property_key:'alive',previous_value:'Alive',new_value:'Dead',note:''}];
 assert.equal([...W.worldAt(p,p.nodes[1].id).values()][0].conflict,null);
 p.nodes[0].changes[0].previous_value='Unborn';p=W.moveNode(p,p.nodes[1].id,-1);
 assert.match([...W.worldAt(p,p.nodes[0].id).values()][0].conflict!,/earlier record says Dead/);
 assert.equal(p.nodes[1].changes[0].new_value,'Dead');
});
test('different Book endpoints cannot be compared or leak state',()=>{
 let {p,u,book,entity}=fixture();p=node(p,u,null,'Universe').p;p=node(p,u,book.id,'Book').p;
 p.nodes[0].changes=[{id:W.uid(),entity_id:entity,property_key:'status',previous_value:null,new_value:'Ruined',note:''}];
 assert.equal(W.worldAt(p,p.nodes[1].id).size,0);assert.throws(()=>W.compare(p,p.nodes[0].id,p.nodes[1].id),/same timeline/);
});
test('node deletion archives only the milestone and retains shared Book perspectives',()=>{
 let {p,u,book,docs}=fixture();p=node(p,u,null,'Event').p;p=node(p,u,book.id,'Perspective').p;p.nodes[1].linked_event_id=p.nodes[0].id;
 p=W.archiveNode(p,p.nodes[0].id);assert.equal(W.timeline(p,u,null).length,0);assert.equal(W.timeline(p,u,book.id).length,1);assert.match(W.warnings(p,docs).join(' '),/linked Universe event/);assert.equal(p.entities.length,1);
});
test('relationships retain directed/undirected history and unknown contextual states',()=>{
 let {p,u,entity}=fixture();for(const title of ['Before','A','B','C'])p=node(p,u,null,title).p;
 const r:W.Relationship={id:W.uid(),universe_id:u,book_id:null,source_id:entity,target_id:entity,label:'Protects',description:'',directed:true,context_node_id:p.nodes[1].id,archived:false};p.relationships=[r];
 p.nodes[2].relationship_changes=[{relationship_id:r.id,label:'Distrusts',note:''}];p.nodes[3].relationship_changes=[{relationship_id:r.id,label:'Opposes',note:''}];
 assert.equal(W.relationshipAt(p,r,p.nodes[0].id).value,null);assert.equal(W.relationshipAt(p,r,p.nodes[1].id).value,'Protects');assert.equal(W.relationshipAt(p,r,p.nodes[2].id).value,'Distrusts');assert.equal(W.relationshipAt(p,r,p.nodes[3].id).value,'Opposes');assert.equal(r.label,'Protects');
 const html=renderToStaticMarkup(React.createElement(RelationshipGraph,{rows:[{relationship:{...r,directed:false},evidence:W.relationshipAt(p,r,p.nodes[3].id)}],name:()=> 'King'}));assert.match(html,/svg/);assert.doesNotMatch(html,/marker-end=/);
});
test('missing entities and archived relationship contexts remain explicit',()=>{
 let {p,u,entity}=fixture();p=node(p,u,null,'A').p;const r:W.Relationship={id:W.uid(),universe_id:u,book_id:null,source_id:entity,target_id:entity,label:'Rules',description:'',directed:true,context_node_id:'missing',archived:false};p.relationships=[r];
 assert.equal(W.relationshipAt(p,r,p.nodes[0].id).kind,'unknown');assert.match(W.warnings(p,[]).join(' '),/Missing or archived lore entity/);assert.match(W.warnings(p,[]).join(' '),/starting milestone missing/);
});
test('shared event promotion is explicit and canonical only, preserving perspectives and identity',()=>{
 let {p,u,book}=fixture();p=node(p,u,book.id,'Soldier perspective').p;const source=p.nodes[0];
 assert.throws(()=>W.promote(p,source.id,true),/Canonical/);p.books.find(b=>b.id===book.id)!.continuity='canonical';assert.throws(()=>W.promote(p,source.id,false),/confirmation/);
 p=W.promote(p,source.id,true);const event=p.nodes.find(n=>n.book_id===null)!;assert.equal(p.nodes[0].description,source.description);assert.equal(p.nodes[0].linked_event_id,event.id);assert.equal(event.origin_node_id,source.id);
 const second={...book,id:W.uid(),name:'II'};p.books.push(second);const other=node(p,u,second.id,'Civilian perspective');p=other.p;p.nodes.find(n=>n.id===other.n.id)!.linked_event_id=event.id;assert.equal(W.timeline(p,u,null).length,1);
 event.title='New shared title';assert.equal(p.nodes[0].title,'Soldier perspective');p.books[0].continuity='alternate';assert.equal(p.nodes.length,3);
});
test('planning stores sparse changes rather than world snapshots at every node',()=>{
 let {p,u}=fixture();for(let i=0;i<200;i++)p=node(p,u,null,`N${i}`).p;
 assert.equal(p.nodes.reduce((total,n)=>total+n.changes.length,0),0);assert.equal(p.entities.length,1);assert.equal(W.timeline(p,u,null).length,200);
});
test('queued planning writes drain before backup/exit and use acknowledged revision at execution',async()=>{
 let saved=(await api.thoughtGet()).plan;let rev=saved?.revision||0;let plan=saved||fixture().p;const queue=new MutationQueue(),commands=new CommandQueue(),events:string[]=[];
 const put=(p:W.Plan)=>queue.enqueue(()=>commands.run(async()=>{const result=await api.thoughtSave(rev,p);rev=result.plan!.revision;events.push('saved');}));
 const first=put({...plan,universes:plan.universes.map(u=>({...u,name:'First'}))});const last=put({...plan,universes:plan.universes.map(u=>({...u,name:'Latest'}))});
 await new ExitCoordinator().run(()=>flushWorkspace(queue,async()=>true),async()=>{events.push('exit');});await first;await last;
 assert.deepEqual(events,['saved','saved','exit']);assert.equal((await api.thoughtGet()).plan!.universes[0].name,'Latest');
});
test('browser planning persistence rejects stale revisions and unsupported versions',async()=>{
 const current=(await api.thoughtGet()).plan!;await assert.rejects(api.thoughtSave(current.revision-1,{...current,universes:[]}),/changed/);
 await assert.rejects(api.thoughtSave(current.revision,{...current,version:99 as 1}),/Unsupported/);
});
