export const preferenceKey='mc_thought_help_v1';
export interface OnboardingPreferences { version:1; mode:'beginner'|'advanced'; status:'unseen'|'skipped'|'completed' }
export interface PreferenceStorage { getItem:(key:string)=>string|null; setItem:(key:string,value:string)=>void }
export function readPreferences(storage?:Pick<PreferenceStorage,'getItem'>):OnboardingPreferences {
  const fallback:OnboardingPreferences={version:1,mode:'beginner',status:'unseen'};
  try{const p=JSON.parse(storage?.getItem(preferenceKey)||'null');return p?.version===1&&['beginner','advanced'].includes(p.mode)&&['unseen','skipped','completed'].includes(p.status)?p:fallback;}catch{return fallback;}
}
export function writePreferences(storage:Pick<PreferenceStorage,'setItem'>|undefined,p:OnboardingPreferences):boolean {try{if(!storage)return false;storage.setItem(preferenceKey,JSON.stringify(p));return true;}catch{return false;}}
export function localPreferences():PreferenceStorage|undefined {try{return typeof window==='undefined'?undefined:window.localStorage;}catch{return undefined;}}
export function saveWalkthroughStatus(storage:PreferenceStorage|undefined,status:OnboardingPreferences['status']) {
  const preferences={...readPreferences(storage),status};return {preferences,persisted:writePreferences(storage,preferences)};
}
export const planningViews=(advanced:boolean):('milestones'|'compare'|'relationships')[]=>advanced?['milestones','compare','relationships']:['milestones','compare'];
export const initialWalkthrough=(context:string):WalkthroughState=>({open:false,step:0,context});
export const steps=[
  {target:'universe',title:'1. Choose your Universe',text:'A Universe is your fictional world. Select one, or expand Create or rename a Universe / Book, enter a New name and choose Add Universe. If no desk exists, create it explicitly first.',example:'Tutorial only: Eryndor.'},
  {target:'book',title:'2. Choose your Book',text:'Choose a Book in Timeline. To create one, enter a New name and choose Add Book. Each Book keeps its own milestones. Standalone / Undecided is a safe starting classification.',example:'Tutorial only: The Fall of Eryndor.'},
  {target:'beginning',title:'3. Add a Beginning Story Node',text:'Click Add Beginning Story Node yourself, then edit Milestone title and Narrative summary. A Story Node is a major moment, not a chapter. No date is required. In advanced tools, Add milestone at end can create the same kind of node.',example:'Tutorial only: The kingdom is peaceful.'},
  {target:'ending',title:'4. Add an Ending Story Node',text:'Click Add Ending Story Node yourself. Describe where the story ends. You do not need to explain the journey yet. In advanced tools, use Add milestone at end and title it Ending.',example:'Tutorial only: The kingdom is destroyed.'},
  {target:'changes',title:'5. Record what changed',text:'Select the ending and choose Record entity change. Use an existing lore entry and property status, with previous value Peaceful and new value Destroyed. Also record Peaceful on the beginning if you want that milestone to have a known value. Compare Story Nodes shows both endpoints.',example:'Tutorial only: Kingdom status, Peaceful → Destroyed. If the kingdom is not listed, create its Lorebook entry with Ctrl+N, then return and use Refresh lore entries under Lore entities & reference health before attaching it.'},
  {target:'middle',title:'6. Fill the middle later — or leave it open',text:'Use Insert after on a milestone to add an intermediate event later. Relationships, Book continuity and shared history remain available under Show advanced tools. Nothing requires you to fill every gap.',example:'Tutorial only: insert The Great Betrayal. These instructions never install example data.'},
] as const;
export type GuideTarget=typeof steps[number]['target'];
export interface WalkthroughState { open:boolean; step:number; context:string }
export type WalkthroughAction={type:'restart'|'next'|'back'|'skip'|'finish'}|{type:'context';context:string};
export function transitionWalkthrough(state:WalkthroughState,action:WalkthroughAction):WalkthroughState {
  switch(action.type){
    case 'restart':return {...state,open:true,step:0};
    case 'next':return state.open?{...state,step:Math.min(steps.length-1,state.step+1)}:state;
    case 'back':return state.open?{...state,step:Math.max(0,state.step-1)}:state;
    case 'finish':return state.open&&state.step===steps.length-1?{...state,open:false}:state;
    case 'skip':return {...state,open:false};
    case 'context':return action.context===state.context?state:{open:false,step:0,context:action.context};
  }
}
export function focusGuideTarget(target:GuideTarget,controls:Partial<Record<GuideTarget,{focus:()=>void;disabled?:boolean;isConnected?:boolean}|null>>):boolean {
  try{const control=controls[target];if(!control||control.disabled||control.isConnected===false)return false;control.focus();return true;}catch{return false;}
}
