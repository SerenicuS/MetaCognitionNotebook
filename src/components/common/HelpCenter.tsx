import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { adjacentGuides, chapters, glossary, guides, navigateManual, revealChapter, searchGuides, selectGuide, toggleChapter, type ContentBlock, type GuideId, type HelpTerm } from '@/help/content';

interface HelpContextValue { helpOpen:boolean; openHelp:(id?:GuideId)=>void; closeHelp:()=>void }
const HelpContext=createContext<HelpContextValue>({helpOpen:false,openHelp:()=>{},closeHelp:()=>{}});
export const useHelp=()=>useContext(HelpContext);
export function nextFocusIndex(count:number,current:number,backward:boolean){if(count<1)return -1;return backward?(current<=0?count-1:current-1):(current<0||current>=count-1?0:current+1);}
// Closed optional notes must not intercept the dialog's keyboard focus wrap.
export function helpFocusTargets(root:HTMLElement):HTMLElement[]{
 return Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), summary, a[href], [tabindex="0"]')).filter(el=>{
  if(el.closest('[hidden]'))return false;
  const closed=el.closest('details:not([open])');
  return !closed||(el.tagName==='SUMMARY'&&el.parentElement===closed);
 });
}
function ManualBlock({block,choose}:{block:ContentBlock;choose:(id:GuideId)=>void}){
 switch(block.kind){
  case 'heading':return <h3 className="font-serif text-lg text-foreground pt-5 first:pt-0">{block.text}</h3>;
  case 'paragraph':return <p>{block.text}</p>;
  case 'steps':return <ol className="list-decimal pl-6 space-y-4 marker:text-primary marker:font-semibold">{block.items.map((step,i)=><li className="pl-1" key={i}>{step}</li>)}</ol>;
  case 'example':return <div className="border-l-2 border-primary bg-primary/5 pl-4 pr-3 py-3"><p>{block.text}</p></div>;
  case 'warning':return <p className="border-l-2 border-border pl-4">{block.text}</p>;
  case 'note':return <details className="rounded-lg border border-border px-4 py-3"><summary className="cursor-pointer text-primary font-medium">Optional note: {block.title}</summary><p className="mt-3">{block.text}</p></details>;
  case 'link':{const target=selectGuide(block.id);return <button className="help-guide-link !w-auto !px-0 text-primary underline underline-offset-4 block" onClick={()=>choose(target.id)}>{target.number} {target.title}</button>;}
 }
}
export const HelpCenter:React.FC<{guideId:string;onSelect:(id:GuideId)=>void;onClose:()=>void;expandedChapters?:string[];onExpandedChange?:(ids:string[])=>void}>=({guideId,onSelect,onClose,expandedChapters,onExpandedChange})=>{
 const [query,setQuery]=useState('');const results=searchGuides(query);const selected=selectGuide(guideId);const adjacent=adjacentGuides(selected.id);
 const [localExpanded,setLocalExpanded]=useState<string[]>(()=>revealChapter(expandedChapters||[],selected.chapterId));
 const expanded=expandedChapters||localExpanded;
 const changeExpanded=(ids:string[])=>{setLocalExpanded(ids);onExpandedChange?.(ids);};
 const container=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null),heading=useRef<HTMLHeadingElement>(null),reader=useRef<HTMLElement>(null);
 const titleId=useId(),searchId=useId();
 useEffect(()=>{changeExpanded(revealChapter(expanded,selected.chapterId));},[guideId]);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;search.current?.focus();return()=>{if(previous?.isConnected&&!previous.closest('[inert]'))previous.focus();};},[]);
 const choose=(id:GuideId)=>{
  const next=navigateManual({selected:selected.id,expanded},id);changeExpanded(next.expanded);setQuery('');onSelect(next.selected);
  requestAnimationFrame(()=>{if(reader.current)reader.current.scrollTop=0;heading.current?.focus();});
 };
 return <div className="help-center fixed inset-0 z-[90] bg-background/95 p-2 sm:p-6 flex items-center justify-center" ref={container} role="dialog" aria-modal="true" aria-labelledby={titleId}
  onKeyDown={event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}
   if((event.ctrlKey||event.metaKey)&&['f','k'].includes(event.key.toLowerCase())){event.preventDefault();event.stopPropagation();search.current?.focus();}
   if(event.key==='Tab'&&container.current){const elements=helpFocusTargets(container.current);const current=elements.indexOf(document.activeElement as HTMLElement);if(current<0||(!event.shiftKey&&current===elements.length-1)||(event.shiftKey&&current===0)){event.preventDefault();elements[nextFocusIndex(elements.length,current,event.shiftKey)]?.focus();}}
  }}>
  <div className="w-full max-w-6xl h-[94vh] sm:h-[90vh] rounded-xl border border-border bg-card text-foreground shadow-xl flex flex-col overflow-hidden">
   <header className="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4 border-b border-border shrink-0"><div><h1 id={titleId} className="font-serif text-2xl text-primary">Help & Guide</h1><p className="text-xs text-muted-foreground">Offline user manual · Reading never creates or edits notebook content.</p></div><button className="help-button" onClick={onClose}>Close Help <span className="text-muted-foreground">(Esc)</span></button></header>
   <div className="px-3 py-2 sm:px-4 border-b border-border shrink-0"><label htmlFor={searchId} className="text-sm">Search guides</label><input id={searchId} ref={search} className="help-input mt-1" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Try beginning, unknown state, restore, or Cipher Key"/><p role="status" className="text-xs text-muted-foreground mt-1">{results.length} {results.length===1?'section':'sections'} found{query.trim()?' · Choose a result to open its chapter.':''}</p></div>
   <div className="min-h-0 flex-1 flex flex-col md:grid md:grid-cols-[280px_minmax(0,1fr)]">
    <nav aria-label="Help guides" className="help-manual-nav max-h-[28vh] md:max-h-none overflow-y-auto p-3 border-b md:border-b-0 md:border-r border-border space-y-2 shrink-0">
     {query.trim()?<><h2 className="text-sm font-semibold px-2">Search results</h2>{results.map(g=><button key={g.id} aria-current={selected.id===g.id?'page':undefined} className={`help-guide-link ${selected.id===g.id?'bg-primary/10 text-primary':'text-foreground'}`} onClick={()=>choose(g.id)}><span className="text-xs text-muted-foreground block">{g.chapterNumber}. {g.chapterTitle}</span>{g.number} {g.title}</button>)}{!results.length&&<div className="text-sm p-2"><p>No section matches “{query}”. Try a broader term.</p><button className="help-button mt-2" onClick={()=>setQuery('')}>Clear search</button></div>}</>:
     chapters.map((chapter,i)=>{const open=expanded.includes(chapter.id);const panelId=`${titleId}-${chapter.id}`;return <div key={chapter.id}>
      <button className="help-guide-link font-semibold flex gap-2 items-start" aria-expanded={open} aria-controls={panelId} onClick={()=>changeExpanded(toggleChapter(expanded,chapter.id))}><span aria-hidden="true">{open?'−':'+'}</span><span>{i+1}. {chapter.title}</span></button>
      <div id={panelId} hidden={!open} className="pl-3 border-l border-border ml-3 space-y-1">{guides.filter(g=>g.chapterId===chapter.id).map(g=><button key={g.id} aria-current={selected.id===g.id?'page':undefined} className={`help-guide-link ${selected.id===g.id?'bg-primary/10 text-primary font-medium':'text-muted-foreground'}`} onClick={()=>choose(g.id)}>{g.number} {g.title}</button>)}</div>
     </div>;})}
    </nav>
    <article ref={reader} className="min-h-0 overflow-y-auto p-5 sm:p-8" aria-labelledby={`${titleId}-article`}>
     <div className="max-w-[68ch] mx-auto text-sm leading-7 space-y-3 break-words">
      {!guides.some(g=>g.id===guideId)&&<p role="status">That guide is unavailable. Getting started is shown instead.</p>}
      <p aria-label="Section breadcrumb" className="text-xs text-muted-foreground">{selected.chapterNumber}. {selected.chapterTitle} / {selected.number} {selected.title}</p>
      <h2 ref={heading} tabIndex={-1} id={`${titleId}-article`} className="font-serif text-2xl sm:text-3xl leading-tight text-primary">{selected.number} {selected.title}</h2>
      {selected.blocks.map((block,i)=><ManualBlock key={`${selected.id}-${i}`} block={block} choose={choose}/>)}
      {selected.id==='web'&&<p className="text-xs text-muted-foreground">In Web of Thought, choose Start guided walkthrough or Restart guided walkthrough. The panel has Back, Next, Skip and Finish. It never runs notebook actions for you.</p>}
      <nav aria-label="Adjacent manual sections" className="border-t border-border pt-5 mt-6 grid sm:grid-cols-2 gap-3"><button disabled={!adjacent.previous} className="help-button text-left" onClick={()=>adjacent.previous&&choose(adjacent.previous.id)}>Previous section{adjacent.previous&&<span className="block text-xs mt-1">{adjacent.previous.number} {adjacent.previous.title}</span>}</button><button disabled={!adjacent.next} className="help-button text-left" onClick={()=>adjacent.next&&choose(adjacent.next.id)}>Next section{adjacent.next&&<span className="block text-xs mt-1">{adjacent.next.number} {adjacent.next.title}</span>}</button></nav>
     </div>
    </article>
   </div>
  </div>
 </div>;
};
export const HelpProvider:React.FC<{children:React.ReactNode}>=({children})=>{
 const [guide,setGuide]=useState<string|null>(null);const [expanded,setExpanded]=useState<string[]>([]);const lastGuide=useRef('start');
 const opener=useRef<HTMLElement|null>(null);
 const close=()=>{if(guide===null)return;setGuide(null);requestAnimationFrame(()=>{if(opener.current?.isConnected&&!opener.current.closest('[inert]'))opener.current.focus();});};
 const select=(id:string)=>{lastGuide.current=id;setExpanded(previous=>revealChapter(previous,selectGuide(id).chapterId));setGuide(id);};
 return <HelpContext.Provider value={{helpOpen:guide!==null,openHelp:id=>{if(guide===null)opener.current=document.activeElement as HTMLElement|null;select(id||lastGuide.current);},closeHelp:close}}>
  <div className="contents" {...(guide!==null?{inert:''}:{})}>{children}</div>
  {guide!==null&&<HelpCenter guideId={guide} onSelect={select} onClose={close} expandedChapters={expanded} onExpandedChange={setExpanded}/>}
 </HelpContext.Provider>;
};

export const ContextHelp:React.FC<{term:HelpTerm}>=({term})=>{
  const [open,setOpen]=useState(false);const id=useId();const button=useRef<HTMLButtonElement>(null);
  return <span className="context-help inline-block align-middle ml-2" onKeyDown={event=>{if(open&&event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);button.current?.focus();}}}>
    <button ref={button} type="button" className="help-button !px-2 !py-0.5" aria-label={`Help: ${glossary[term].split(':')[0]}`} aria-expanded={open} aria-controls={id} aria-describedby={open?id:undefined} onClick={()=>setOpen(!open)}>?</button>
    <span id={id} hidden={!open} role="note" className="block max-w-md mt-2 p-3 rounded-lg border border-primary/30 bg-card text-foreground text-sm font-normal leading-relaxed">{glossary[term]}</span>
  </span>;
};
