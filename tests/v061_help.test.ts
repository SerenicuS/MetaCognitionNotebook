import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {glossary,guides,guideForStudio,searchGuides,selectGuide} from '../src/help/content';
import {focusGuideTarget,initialWalkthrough,planningViews,preferenceKey,readPreferences,saveWalkthroughStatus,steps,transitionWalkthrough,writePreferences,type PreferenceStorage} from '../src/help/onboarding';
import {ContextHelp,HelpCenter,HelpProvider,nextFocusIndex} from '../src/components/common/HelpCenter';
import {ThoughtWalkthrough} from '../src/components/studios/ThoughtWalkthrough';
import {WebOfThought} from '../src/components/studios/WebOfThought';
import {emptyPlan} from '../src/utils/thought';

function storage(){const values=new Map<string,string>();const s:PreferenceStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>{values.set(key,value);}};return {s,values};}

test('every offline guide answers what, when, how, example and mistakes without external content',()=>{
 assert.equal(new Set(guides.map(g=>g.id)).size,guides.length);assert.equal(guides.length,42);
 for(const guide of guides){assert.ok(guide.what.length>20);assert.ok(guide.when.length>15);assert.ok(guide.steps.length>=3);assert.ok(guide.example.length>15);assert.ok(guide.avoid.length>20);assert.doesNotMatch(JSON.stringify(guide),/https?:\/\//);}
});
test('search covers full guide content, abbreviations, multiple terms and case',()=>{
 assert.ok(searchGuides('UNKNOWN STATE').some(g=>g.id==='web'));assert.ok(searchGuides('mckey').some(g=>g.id==='cipher-keys'));
 assert.ok(searchGuides('previous notebook').some(g=>g.id==='vault-active'));assert.ok(searchGuides('The Golden Age').some(g=>g.id==='web-example'));
 assert.equal(searchGuides('  ').length,guides.length);assert.equal(searchGuides('totally-unmatched-identifier-12345').length,0);
});
test('studio guide routing selects actual Poetry, Philosophy and Lorebook guides with safe fallback',()=>{
 for(const studio of ['poetry','philosophy','lorebook','manuscript']){const id=guideForStudio(studio);const html=renderToStaticMarkup(React.createElement(HelpCenter,{guideId:id,onSelect:()=>{},onClose:()=>{}}));assert.match(html,new RegExp(selectGuide(id).title));assert.match(html,/aria-current="page"/);}
 assert.equal(guideForStudio(null),'start');assert.equal(guideForStudio('retired-studio'),'start');
});
test('direct context guides exist for Web, Vault and Emotional Cipher',()=>{
 for(const id of ['web','vault','cipher'])assert.equal(selectGuide(id).id,id);
 assert.match(selectGuide('vault-separate').result,/Extracted is not activated/);assert.match(selectGuide('cipher').what,/not encryption/);
});
test('Help renders navigable offline search, all sections and an accessible dialog',()=>{
 const html=renderToStaticMarkup(React.createElement(HelpCenter,{guideId:'web',onSelect:()=>{},onClose:()=>{}}));
 assert.match(html,/role="dialog"/);assert.match(html,/aria-modal="true"/);assert.match(html,/Search guides/);assert.match(html,/aria-label="Help guides"/);assert.match(html,/Overview/);assert.match(html,/When to use it/);assert.match(html,/Step by step/);assert.match(html,/Worked example/);assert.match(html,/Common mistakes/);assert.match(html,/Tutorial:/);assert.doesNotMatch(html,/<iframe|<script|https?:\/\//);
});
test('missing guide routes gracefully to Getting started',()=>{
 assert.equal(selectGuide('renamed-guide').id,'start');const html=renderToStaticMarkup(React.createElement(HelpCenter,{guideId:'renamed-guide',onSelect:()=>{},onClose:()=>{}}));assert.match(html,/That guide is unavailable/);assert.match(html,/Understanding Notebooks/);
});
test('Help focus wrapping supports both directions and absent focus',()=>{
 assert.equal(nextFocusIndex(3,2,false),0);assert.equal(nextFocusIndex(3,0,true),2);assert.equal(nextFocusIndex(3,-1,false),0);assert.equal(nextFocusIndex(3,-1,true),2);assert.equal(nextFocusIndex(0,0,false),-1);
});
test('walkthrough is opt-in and bounded through next, back, finish and restart',()=>{
 let state=initialWalkthrough('notebook-A');assert.equal(state.open,false);assert.deepEqual(transitionWalkthrough(state,{type:'next'}),state);
 state=transitionWalkthrough(state,{type:'restart'});assert.equal(state.open,true);state=transitionWalkthrough(state,{type:'back'});assert.equal(state.step,0);
 for(let i=0;i<20;i++)state=transitionWalkthrough(state,{type:'next'});assert.equal(state.step,steps.length-1);
 state=transitionWalkthrough(state,{type:'back'});assert.equal(state.step,steps.length-2);assert.equal(transitionWalkthrough(state,{type:'finish'}).open,true);
 state=transitionWalkthrough(state,{type:'next'});state=transitionWalkthrough(state,{type:'finish'});assert.equal(state.open,false);
 state=transitionWalkthrough(state,{type:'restart'});assert.equal(state.step,0);assert.equal(state.open,true);
});
test('skip is dismissible, restartable and never fabricates completion',()=>{
 let state=transitionWalkthrough(initialWalkthrough('A'),{type:'restart'});state=transitionWalkthrough(state,{type:'next'});state=transitionWalkthrough(state,{type:'skip'});assert.equal(state.open,false);state=transitionWalkthrough(state,{type:'restart'});assert.equal(state.step,0);
 const {s}=storage();saveWalkthroughStatus(s,'skipped');assert.equal(readPreferences(s).status,'skipped');
});
test('notebook switching closes and resets the walkthrough without changing preferences',()=>{
 let state=transitionWalkthrough(initialWalkthrough('A'),{type:'restart'});state=transitionWalkthrough(state,{type:'next'});const same=transitionWalkthrough(state,{type:'context',context:'A'});assert.equal(same,state);
 state=transitionWalkthrough(state,{type:'context',context:'B'});assert.deepEqual(state,{open:false,step:0,context:'B'});
});
test('completion persists across restart and preserves separately chosen advanced mode',()=>{
 const {s,values}=storage();writePreferences(s,{version:1,mode:'advanced',status:'unseen'});const result=saveWalkthroughStatus(s,'completed');assert.equal(result.persisted,true);
 const reopened=readPreferences(s);assert.equal(reopened.status,'completed');assert.equal(reopened.mode,'advanced');assert.equal(initialWalkthrough('reopened-notebook').open,false);assert.deepEqual([...values.keys()],[preferenceKey]);
});
test('missing, malformed or future preferences fail safely to beginner without notebook migration',()=>{
 const {s}=storage();assert.deepEqual(readPreferences(s),{version:1,mode:'beginner',status:'unseen'});
 for(const invalid of ['{broken','null','{"version":99}','{"version":1,"mode":"bad","status":"completed"}']){s.setItem(preferenceKey,invalid);assert.equal(readPreferences(s).mode,'beginner');assert.equal(readPreferences(s).status,'unseen');}
 const blocked={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('quota');}};assert.equal(readPreferences(blocked).mode,'beginner');assert.equal(saveWalkthroughStatus(blocked,'completed').persisted,false);assert.equal(writePreferences(undefined,readPreferences()),false);
});
test('beginner view reduces tool density without removing advanced functions',()=>{
 assert.deepEqual(planningViews(false),['milestones','compare']);assert.deepEqual(planningViews(true),['milestones','compare','relationships']);
 let saves=0;const html=renderToStaticMarkup(React.createElement(WebOfThought,{onSave:async()=>{saves++;return true;},onBack:()=>{},catalogDocument:false,notebookKey:'fixture'}));
 assert.match(html,/Show advanced tools/);assert.match(html,/Start guided walkthrough/);assert.equal(saves,0);
});
test('tutorial content is Eryndor-only illustration and has no data-changing callback',()=>{
 const snapshot=JSON.stringify(emptyPlan());let navigation=0;
 const html=renderToStaticMarkup(React.createElement(ThoughtWalkthrough,{notebookKey:'fixture',onNavigate:()=>{navigation++;return true;}}));
 assert.match(html,/Nothing is created automatically/);assert.equal(navigation,0);assert.equal(JSON.stringify(emptyPlan()),snapshot);
 const examples=steps.map(s=>s.example).join(' ');for(const value of ['Eryndor','The Fall of Eryndor','Peaceful','Destroyed','The Great Betrayal'])assert.ok(examples.includes(value));
 assert.ok(steps.every(s=>s.example.startsWith('Tutorial only')));
});
test('missing, disabled, renamed or detached controls are safe; focusing never clicks',()=>{
 let focused=0,clicked=0;const control={focus:()=>{focused++;},click:()=>{clicked++;}};
 assert.equal(focusGuideTarget('universe',{universe:control}),true);assert.equal(focused,1);assert.equal(clicked,0);
 assert.equal(focusGuideTarget('ending',{}),false);assert.equal(focusGuideTarget('changes',{changes:null}),false);assert.equal(focusGuideTarget('changes',{changes:{...control,disabled:true}}),false);assert.equal(focusGuideTarget('book',{book:{...control,isConnected:false}}),false);
 assert.equal(focusGuideTarget('middle',{middle:{focus:()=>{throw new Error('renamed view');}}}),false);assert.equal(focused,1);
});
test('all contextual explanations use labeled keyboard-operable controls and expandable notes',()=>{
 assert.equal(Object.keys(glossary).length,14);
 for(const term of Object.keys(glossary) as (keyof typeof glossary)[]){const html=renderToStaticMarkup(React.createElement(ContextHelp,{term}));assert.match(html,/<button/);assert.match(html,/aria-expanded="false"/);assert.match(html,/aria-controls=/);assert.match(html,/aria-label="Help:/);assert.match(html,/role="note"/);assert.match(html,/hidden=""/);}
});
test('Help provider initially leaves the writing workspace available and does not force a dialog',()=>{
 const html=renderToStaticMarkup(React.createElement(HelpProvider,null,React.createElement('p',null,'Original writing workspace')));assert.match(html,/Original writing workspace/);assert.doesNotMatch(html,/role="dialog"|inert=""/);
});
