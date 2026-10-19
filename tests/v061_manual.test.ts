import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {chapters,guides,numberManual,selectGuide,searchGuides,navigateManual,toggleChapter,adjacentGuides} from '../src/help/content';
import {HelpCenter,helpFocusTargets} from '../src/components/common/HelpCenter';
import {DEFAULT_SAVE_PREFERENCES} from '../src/utils/savePreferences';

test('manual derives unique chapter and section numbers from hierarchy, including inserted sections',()=>{
 assert.equal(chapters.length,7);assert.equal(guides.length,35);
 assert.equal(new Set(guides.map(g=>g.id)).size,35);
 chapters.forEach((chapter,c)=>chapter.sections.forEach((section,s)=>{
  const g=selectGuide(section.id);assert.equal(g.number,`${c+1}.${s+1}`);assert.equal(g.chapterNumber,c+1);assert.doesNotMatch(section.title,/^\d+\./);
 }));
 const inserted=numberManual([{id:'new',title:'Inserted chapter',sections:[{...chapters[0].sections[0],id:'new-section'}]},...chapters]);
 assert.equal(inserted.find(g=>g.id==='start')?.number,'2.1');
 const changed=numberManual([{...chapters[0],sections:[{...chapters[0].sections[0],id:'inserted'},...chapters[0].sections]}]);
 assert.equal(changed.find(g=>g.id==='start')?.number,'1.2');
});
test('chapter toggles collapse and expand while navigation reveals the destination and preserves other chapters',()=>{
 let state={selected:'start',expanded:['getting-started']};
 state={...state,expanded:toggleChapter(state.expanded,'getting-started')};assert.deepEqual(state.expanded,[]);
 state=navigateManual(state,'cipher-sharing');assert.equal(state.selected,'cipher-sharing');assert.deepEqual(state.expanded,['poetry-studio']);
 state=navigateManual(state,'web-example');assert.deepEqual(state.expanded,['poetry-studio','lorebook-studio']);
 assert.deepEqual(navigateManual(state,'world-state').expanded,state.expanded);
 state=navigateManual(state,'renamed-missing-section');assert.equal(state.selected,'start');assert.ok(state.expanded.includes('getting-started'));
});
test('search indexes chapters, section titles, headings, keywords, steps, worked examples and optional notes',()=>{
 for(const [query,id] of [['Philosophy Studio','reasoning'],['Golden Age','web-example'],['sender receiver','cipher-sharing'],['poetic analysis','poetry-forms'],['Before you begin','start'],['fingerprint secrecy','cipher-keys'],['64 MiB','vault'],['7.4','file-locations']]){
  assert.ok(searchGuides(query).some(g=>g.id===id),`${query} should find ${id}`);
 }
 assert.ok(searchGuides('ÉRYNDOR').some(g=>g.id==='web-example'));
 assert.equal(searchGuides('no-such-section-98765').length,0);
});
test('search result navigation selects its stable section and reveals its numbered chapter',()=>{
 const result=searchGuides('sender receiver')[0];assert.equal(result.id,'cipher-sharing');
 const next=navigateManual({selected:'start',expanded:[]},result.id);
 assert.equal(selectGuide(next.selected).number,'2.7');assert.deepEqual(next.expanded,['poetry-studio']);
 const html=renderToStaticMarkup(React.createElement(HelpCenter,{guideId:next.selected,onSelect:()=>{},onClose:()=>{}}));
 assert.match(html,/2\.7 Sharing/);assert.match(html,/aria-current="page"/);assert.match(html,/Section breadcrumb/);
});
test('all related links resolve and previous/next navigation crosses chapters without wrapping',()=>{
 for(const g of guides){assert.ok(g.related.length>0);for(const id of g.related)assert.ok(guides.some(target=>target.id===id),`${g.id} -> ${id}`);}
 assert.equal(adjacentGuides(guides[0].id).previous,undefined);assert.equal(adjacentGuides(guides.at(-1)!.id).next,undefined);
 assert.equal(adjacentGuides('interface').next?.id,'poetry');assert.equal(adjacentGuides('poetry').previous?.id,'interface');
 assert.equal(adjacentGuides('missing').next?.id,'create-documents');
});
test('structured blocks provide substantial teaching content and optional technical disclosures',()=>{
 for(const g of guides){
  for(const text of [g.what,g.when,g.prerequisites,g.example,g.result,g.avoid])assert.ok(text.length>=20,g.id);
  assert.ok(g.steps.length>=3);assert.ok(g.blocks.some(b=>b.kind==='steps'));assert.ok(g.blocks.some(b=>b.kind==='example'));assert.ok(g.blocks.some(b=>b.kind==='warning'));assert.ok(g.blocks.some(b=>b.kind==='link'));
 }
 const html=renderToStaticMarkup(React.createElement(HelpCenter,{guideId:'cipher-keys',onSelect:()=>{},onClose:()=>{}}));
 assert.match(html,/<details/);assert.match(html,/<summary/);assert.match(html,/Optional note:/);assert.match(html,/Previous section/);assert.match(html,/Next section/);assert.match(html,/<ol/);
});
test('Eryndor tutorial records both endpoint observations before comparing and inserts the middle afterward',()=>{
 const g=selectGuide('web-example');const text=g.steps.join(' ');
 for(const name of ['Eryndor','The Fall of Eryndor','Kingdom of Eryndor','The Golden Age','The Fall','Peaceful','Destroyed','The Betrayal'])assert.ok(text.includes(name),name);
 assert.ok(text.indexOf('Add Beginning Story Node')<text.indexOf('Add Ending Story Node'));
 assert.ok(text.indexOf('New value to Destroyed')<text.indexOf('Compare Story Nodes'));
 assert.ok(text.indexOf('Compare Story Nodes')<text.indexOf('Insert after'));
 assert.match(g.what,/Tutorial only/);assert.match(g.result,/without any notebook changes/);assert.match(g.avoid,/does not invent/);
 assert.match(selectGuide('story-nodes').result,/original milestones/);assert.match(selectGuide('world-state').avoid,/Unknown is not unchanged/);
});
test('Cipher instructions distinguish modes, exact keys, separate imports and sender/receiver outcomes',()=>{
 const share=selectGuide('cipher-sharing');assert.equal(share.steps.length,6);assert.match(share.steps.join(' '),/Save Ciphered Poem & Key/);assert.match(share.steps.join(' '),/Import & Decode/);
 assert.match(share.result,/recovered original versus stored encoded poem plus key/);
 assert.ok(share.steps[1].indexOf('Export .mccipher')<share.steps[1].indexOf('Save Ciphered Poem & Key'));assert.match(share.steps[1],/saving opens the newly created document/);
 assert.match(selectGuide('cipher-modes').avoid,/Rerolling does not recreate an old key/);
 const formats=selectGuide('poem-files').what;for(const extension of ['.txt','.md','.mcpoem','.mckey','.mccipher'])assert.ok(formats.includes(extension));
 assert.match(selectGuide('cipher').what,/not encryption/);
});
test('manual accurately discloses absent editors, limited analysis and document recovery limits',()=>{
 assert.match(selectGuide('lorebook').steps.join(' '),/does not offer Book or Chapter label editors/);
 assert.match(selectGuide('poetry-forms').avoid,/Do not expect automated scansion/);
 assert.match(selectGuide('archive-recovery').steps.join(' '),/no document trash\/restore browser/);
 assert.match(selectGuide('document-files').avoid,/no Philosophy export toolbar/);
});
test('dialog keyboard targets exclude collapsed chapters and note content but include summaries',()=>{
 const closed={} as HTMLElement;
 const target=(hidden:boolean,detail:HTMLElement|null,tagName='BUTTON',parentElement:HTMLElement|null=null)=>({tagName,parentElement,closest:(q:string)=>q==='[hidden]'?(hidden?{}:null):detail});
 const visible=target(false,null),hidden=target(true,null),noteButton=target(false,closed),summary=target(false,closed,'SUMMARY',closed);
 const root={querySelectorAll:()=>[visible,hidden,noteButton,summary]} as unknown as HTMLElement;
 assert.deepEqual(helpFocusTargets(root),[visible,summary]);
 const html=renderToStaticMarkup(React.createElement(HelpCenter,{guideId:'start',onSelect:()=>{},onClose:()=>{}}));
 assert.match(html,/aria-expanded="true"/);assert.match(html,/aria-expanded="false"/);assert.match(html,/aria-controls=/);assert.match(html,/hidden=""/);assert.match(html,/role="dialog"/);assert.match(html,/tabindex="-1"/);
});
test('reading every manual section renders offline without notebook commands or callbacks',()=>{
 let changed=0;
 for(const g of guides){const html=renderToStaticMarkup(React.createElement(HelpCenter,{guideId:g.id,onSelect:()=>{changed++;},onClose:()=>{changed++;}}));assert.ok(html.includes(g.number));assert.doesNotMatch(html,/<script|<iframe|https?:\/\//);}
 assert.equal(changed,0);
 for(const file of ['src/help/content.ts','src/help/manual.ts','src/components/common/HelpCenter.tsx']){
  const source=readFileSync(file,'utf8');assert.doesNotMatch(source,/from ['"][^'"]*services|\bfetch\(|\binvoke\(|api\.|localStorage\.setItem/);
 }
});

test('current manual distinguishes Universe creation, Book prose and the detailed planning desk',()=>{
 const tutorial=selectGuide('web-example');
 assert.match(tutorial.steps[0], /Create New Universe/);
 assert.doesNotMatch(tutorial.steps[0], /Universe \/ Setting/);
 assert.match(tutorial.steps[1], /Web of Thought in its toolbar/);
 const web=selectGuide('web').steps.join(' ');
 for(const label of ['Chapters & Prose','Story Milestones Timeline','Web of Thought']) assert.ok(web.includes(label));
 const book=readFileSync('src/components/studios/lorebook/BookView.tsx','utf8');
 assert.match(book,/Chapters &amp; Prose/);assert.match(book,/Story Milestones Timeline/);
 const entity=readFileSync('src/components/studios/LorebookStudio.tsx','utf8');
 assert.match(entity,/setActiveTab\('web'\)/);
});

test('manual save guidance matches the configured default and distinguishes independent metadata writes',()=>{
 const saving=selectGuide('saving');const text=saving.steps.join(' ');
 assert.equal(DEFAULT_SAVE_PREFERENCES.mode,'automatic');
 assert.ok(text.includes(`${DEFAULT_SAVE_PREFERENCES.debounceSeconds} seconds by default`));
 for(const instruction of ['1 to 10 seconds','Ctrl+S','Discard Changes','Cancel','persist independently']) assert.ok(text.includes(instruction));
 assert.ok(searchGuides('Manual Ctrl+S').some(g=>g.id==='saving'));
 const links=selectGuide('relationships').steps.join(' ');
 for(const instruction of ['Faction Members','Undo','Open focused entity','240 matching edges']) assert.ok(links.includes(instruction));
});
