import {relationshipMeaning} from '@/utils/relationships';
import React,{useId,useMemo,useRef,useState} from 'react';
import {Users,Shield,MapPin,Sparkles,Sword,Calendar,BookOpen,Compass} from 'lucide-react';
import type {DocumentMetadata} from '@/types';
import type {Relationship,Evidence} from '@/utils/thought';
import {filterGraph,layoutRelationships,zoomCamera,graphNeighbors} from '@/utils/relationshipGraph';
const styles={
 character:{label:'Character',Icon:Users,color:'text-blue-700 dark:text-blue-300',shape:'circle'},
 faction:{label:'Faction / Nation',Icon:Shield,color:'text-amber-700 dark:text-amber-300',shape:'hexagon'},
 location:{label:'Location',Icon:MapPin,color:'text-emerald-700 dark:text-emerald-300',shape:'rect'},
 artifact:{label:'Artifact',Icon:Sword,color:'text-cyan-700 dark:text-cyan-300',shape:'diamond'},
 event:{label:'Event',Icon:Calendar,color:'text-rose-700 dark:text-rose-300',shape:'rect'},
 concept:{label:'Rule / System',Icon:Sparkles,color:'text-violet-700 dark:text-violet-300',shape:'hexagon'},
 culture:{label:'Culture / History',Icon:Compass,color:'text-orange-700 dark:text-orange-300',shape:'diamond'},
 chapter:{label:'Chapter',Icon:BookOpen,color:'text-orange-700 dark:text-orange-300',shape:'rect'},
 other:{label:'Other / missing lore',Icon:Compass,color:'text-primary',shape:'rect'},
} as const;
export const RelationshipGraph:React.FC<{rows:{relationship:Relationship;evidence:Evidence}[];name:(id:string)=>string;documents?:DocumentMetadata[];onOpenEntity?:(id:string)=>void}>=({rows,name,documents=[],onOpenEntity})=>{
 const [relType,setRelType]=useState(''),[entityType,setEntityType]=useState(''),[focus,setFocus]=useState('');
 const [camera,setCamera]=useState({x:0,y:0,scale:1});const svg=useRef<SVGSVGElement>(null),drag=useRef<{x:number;y:number}|null>(null);const markerId=`relationship-arrow-${useId().replace(/:/g,'')}`;
 const typeOf=(id:string)=>{try{let t=JSON.parse(documents.find(d=>d.id===id)?.metadata_json||'{}').entry_type;if(t==='rule')t='concept';return t in styles?t as keyof typeof styles:'other';}catch{return 'other';}};
 const all=rows.map(row=>row.relationship).filter(r=>!r.archived);
 const filtered=filterGraph(all,typeOf,relType,entityType);
 const visible=filtered.slice(0,240); // Explicit rendering bound; full records remain below.
 const key=visible.map(r=>`${r.id}:${r.source_id}:${r.target_id}`).join('|');
 const layout=useMemo(()=>layoutRelationships(visible),[key]);
 const neighborIds=graphNeighbors(visible,focus);
 const activeFocus=layout.nodes.some(n=>n.id===focus)?focus:'';
 const reset=()=>setCamera({x:0,y:0,scale:1});
 const changeFilter=(change:()=>void)=>{change();setFocus('');reset();};
 const w=layout.width/camera.scale,h=layout.height/camera.scale;
 return <section aria-label="World Relationships Graph" className="relationship-graph space-y-3">
  <div className="flex flex-wrap gap-3 text-xs items-end">
   <label>Relationship type<select aria-label="Graph relationship type" className="help-input" value={relType} onChange={e=>changeFilter(()=>setRelType(e.target.value))}><option value="">All relationship types</option>{[...new Map(all.map(r=>[relationshipMeaning(r.label)?.kind||r.label,r.label])).values()].sort().map(label=><option value={label} key={label}>{relationshipMeaning(label)?`${relationshipMeaning(label)!.outgoing} / ${relationshipMeaning(label)!.incoming}`:label}</option>)}</select></label>
   <label>Entity type (either endpoint)<select aria-label="Graph entity type" className="help-input" value={entityType} onChange={e=>changeFilter(()=>setEntityType(e.target.value))}><option value="">All entity types</option>{Object.entries(styles).map(([value,s])=><option value={value} key={value}>{s.label}</option>)}</select></label>
   <button className="help-button" aria-label="Zoom in graph" onClick={()=>setCamera(c=>zoomCamera(c,1.3))}>+</button><button className="help-button" aria-label="Zoom out graph" onClick={()=>setCamera(c=>zoomCamera(c,1/1.3))}>−</button><button className="help-button" onClick={reset}>Fit to view</button>
   <button className="help-button" onClick={()=>{setFocus('');setRelType('');setEntityType('');reset();}}>Clear graph filters & focus</button>
  </div>
  <div aria-label="Entity type legend" className="flex flex-wrap gap-x-4 gap-y-2 text-xs">{Object.entries(styles).map(([id,{label,Icon,color}])=><span key={id} className={`inline-flex gap-1 items-center ${color}`}><Icon size={15}/>{label}</span>)}</div>
  {!all.length?<p className="p-6 text-muted-foreground">No active relationships. Add a real relationship to connect existing lore entities.</p>:!visible.length?<p className="p-6 text-muted-foreground">No relationships match these graph filters. Clear graph filters & focus to see all records.</p>:<>
   <p className="text-xs text-muted-foreground">{filtered.length} matching relationships. Click a node to highlight its direct neighbors. Drag empty space to pan; use + / − to zoom. Tab to a node and press Enter to focus. Focus never creates a relationship.</p>
   <svg ref={svg} role="group" tabIndex={0} aria-label="Interactive lore relationship graph; arrow keys pan, plus and minus zoom, Home fits" onKeyDown={e=>{if(e.target!==e.currentTarget)return;const moves:Record<string,[number,number]>={ArrowLeft:[-60,0],ArrowRight:[60,0],ArrowUp:[0,-60],ArrowDown:[0,60]};if(moves[e.key]){e.preventDefault();const [x,y]=moves[e.key];setCamera(c=>({...c,x:c.x+x/c.scale,y:c.y+y/c.scale}));}else if(e.key==='Home'){e.preventDefault();reset();}else if(['+','-','='].includes(e.key)){e.preventDefault();setCamera(c=>zoomCamera(c,e.key==='-'?1/1.3:1.3));}}} className="w-full h-[420px] sm:h-[500px] border border-border rounded-lg bg-background touch-none" viewBox={`${layout.x+(layout.width-w)/2+camera.x} ${layout.y+(layout.height-h)/2+camera.y} ${w} ${h}`}
    onPointerDown={e=>{if((e.target as Element).closest('[data-entity-node]'))return;drag.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{if(!drag.current||!svg.current)return;const rect=svg.current.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;const factor=Math.max(w/rect.width,h/rect.height);const dx=(e.clientX-drag.current.x)*factor,dy=(e.clientY-drag.current.y)*factor;drag.current={x:e.clientX,y:e.clientY};setCamera(c=>({...c,x:c.x-dx,y:c.y-dy}));}}
    onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
    <defs><marker id={markerId} markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="currentColor"/></marker></defs>
    {layout.edges.map(edge=>{const row=rows.find(r=>r.relationship.id===edge.id)!;const highlight=!activeFocus||edge.source===activeFocus||edge.target===activeFocus;const label=row.evidence.value??'Unknown relationship';return <g key={edge.id} className="text-primary" opacity={highlight?1:0.18}><path d={edge.path} fill="none" stroke="currentColor" strokeWidth={highlight?2:1} strokeDasharray={row.evidence.value===null?'6 5':undefined} markerEnd={row.relationship.directed&&!relationshipMeaning(row.relationship.label)?.symmetric?`url(#${markerId})`:undefined}/><g transform={`translate(${edge.labelX} ${edge.labelY})`}><title>{label}</title><rect x={-112} y={-15} width={224} height={30} rx={6} fill="hsl(var(--card))" stroke="hsl(var(--border))"/><text textAnchor="middle" y={5} fontSize={14} fill="hsl(var(--foreground))">{label.length>29?`${label.slice(0,27)}…`:label}</text></g></g>;})}
    {layout.nodes.map(n=>{const {Icon,color,shape,label}=styles[typeOf(n.id)];const activate=()=>setFocus(current=>current===n.id?'':n.id);return <g data-entity-node={n.id} key={n.id} role="button" tabIndex={0} aria-label={`Focus ${label}: ${name(n.id)}`} aria-pressed={activeFocus===n.id} className={`${color} cursor-pointer`} opacity={!activeFocus||neighborIds.has(n.id)?1:0.25} transform={`translate(${n.x} ${n.y})`} onClick={activate} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();activate();}}}>
     <title>{label}: {name(n.id)}</title>{shape==='circle'?<ellipse rx={108} ry={35} fill="hsl(var(--card))" stroke="currentColor" strokeWidth={3}/>:shape==='hexagon'?<path d="M-92 -34 L92 -34 L110 0 L92 34 L-92 34 L-110 0 Z" fill="hsl(var(--card))" stroke="currentColor" strokeWidth={3}/>:shape==='diamond'?<path d="M0 -42 L112 0 L0 42 L-112 0 Z" fill="hsl(var(--card))" stroke="currentColor" strokeWidth={3}/>:<rect x={-108} y={-34} width={216} height={68} rx={8} fill="hsl(var(--card))" stroke="currentColor" strokeWidth={3}/>}
     <Icon x={-91} y={-10} width={20} height={20}/><text x={10} y={-3} textAnchor="middle" fontSize={14} fill="hsl(var(--foreground))">{name(n.id).length>21?`${name(n.id).slice(0,19)}…`:name(n.id)}</text><text x={10} y={17} textAnchor="middle" fontSize={11} fill="currentColor">{label}</text>
    </g>;})}
   </svg>
   {activeFocus&&<div className="text-xs flex flex-wrap gap-3 items-center"><strong>Focused: {name(activeFocus)}</strong>{onOpenEntity&&<button className="help-button" onClick={()=>onOpenEntity(activeFocus)}>Open focused entity</button>}<button className="help-button" onClick={()=>setFocus('')}>Clear focus</button></div>}
   {filtered.length>visible.length&&<p role="status" className="text-xs">Graph shows the first {visible.length} of {filtered.length} matches. Narrow filters to inspect more. The record list below retains all records.</p>}
  </>}
 </section>;
};
