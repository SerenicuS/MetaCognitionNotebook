import {chapters, type ChapterSource, type SectionSource} from './manual';
export {chapters} from './manual';
export type GuideId=string;
export type ContentBlock =
  | {kind:'paragraph'|'heading'|'example'|'warning';text:string}
  | {kind:'steps';items:string[]}
  | {kind:'note';title:string;text:string}
  | {kind:'link';id:GuideId};
export interface Guide extends SectionSource {
 chapterId:string; chapterTitle:string; chapterNumber:number; number:string; blocks:ContentBlock[];
}
export function numberManual(source:ChapterSource[]):Guide[]{
 return source.flatMap((chapter,c)=>chapter.sections.map((section,s)=>({...section,
  chapterId:chapter.id,chapterTitle:chapter.title,chapterNumber:c+1,number:`${c+1}.${s+1}`,
  blocks:[
   {kind:'heading',text:'Overview'},{kind:'paragraph',text:section.what},
   {kind:'heading',text:'When to use it'},{kind:'paragraph',text:section.when},
   {kind:'heading',text:'Before you begin'},{kind:'paragraph',text:section.prerequisites},
   {kind:'heading',text:'Step by step'},{kind:'steps',items:section.steps},
   {kind:'heading',text:'Worked example'},{kind:'example',text:section.example},
   {kind:'heading',text:'Understanding the result'},{kind:'paragraph',text:section.result},
   {kind:'heading',text:'Common mistakes'},{kind:'warning',text:section.avoid},
   ...(section.notes||[]).map(note=>({kind:'note' as const,...note})),
   {kind:'heading',text:'Related sections'},...section.related.map(id=>({kind:'link' as const,id})),
  ] as ContentBlock[],
 })));
}
export const guides=numberManual(chapters);
export function selectGuide(id:string):Guide {return guides.find(g=>g.id===id)||guides[0];}
export function guideForStudio(studio:string|null):GuideId {return studio==='poetry'?'poetry':studio==='philosophy'?'philosophy':studio==='lorebook'?'lorebook':studio==='manuscript'?'manuscript-assembler':'start';}
const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
export function searchGuides(query:string):Guide[]{
 const terms=normalize(query).trim().split(/\s+/).filter(Boolean);
 return guides.filter(g=>{
  const text=normalize([g.chapterTitle,g.title,g.number,g.what,g.when,g.prerequisites,...g.steps,g.example,g.result,g.avoid,...g.tags,...(g.notes||[]).flatMap(n=>[n.title,n.text]),...g.blocks.flatMap(b=>b.kind==='heading'?[b.text]:[])].join(' '));
  return terms.every(term=>text.includes(term));
 });
}
export function adjacentGuides(id:string){const index=guides.findIndex(g=>g.id===selectGuide(id).id);return {previous:guides[index-1],next:guides[index+1]};}
export function revealChapter(expanded:string[],id:string):string[]{return expanded.includes(id)?expanded:[...expanded,id];}
export function toggleChapter(expanded:string[],id:string):string[]{return expanded.includes(id)?expanded.filter(c=>c!==id):[...expanded,id];}
export interface ManualNavigation {selected:string;expanded:string[]}
export function navigateManual(state:ManualNavigation,id:string):ManualNavigation {
 const guide=selectGuide(id);return {selected:guide.id,expanded:revealChapter(state.expanded,guide.chapterId)};
}

export const glossary={
  universe:'Universe Timeline: the shared history of a fictional world. A founding or war can be referenced by several Books.',
  book:'Book Timeline: one Book’s own sequence of story moments. Other Books keep independent timelines.',
  node:'Story Node: a major moment in your story. Write the beginning and ending now, then fill in the middle later. It is not a chapter.',
  world:'World State: a record of what changed in your fictional world, such as a character becoming ruler or a city being destroyed.',
  comparison:'State Comparison: compare two Story Nodes from the same timeline. An unknown value is not proof that nothing changed.',
  continuity:'Canonical: part of official continuity. Alternate: a different outcome. Standalone / Undecided: its impact is not established. Changing this never publishes history.',
  relationship:'Entity Relationship: a connection between lore entries, such as King Aldric → Rules → Eryndor. Later labels can be recorded at later milestones.',
  event:'Shared Universe Event: one historical milestone referenced by several Books. Each Book retains its own perspective.',
  promotion:'Promote to Universe: add a Canonical Book milestone to shared Universe history. This requires explicit confirmation and preserves the Book milestone.',
  unknown:'Unknown: no reliable value is recorded here. Earlier records are evidence, not proof of unchanged state. A conflict means an expected prior value disagrees with earlier evidence; check the order and your records.',
} as const;
export type HelpTerm=keyof typeof glossary;
