import {relationshipMeaning} from './relationships';
import type {Relationship} from './thought';
export interface GraphNode {id:string;x:number;y:number}
export interface GraphEdge {id:string;path:string;labelX:number;labelY:number;source:string;target:string}
export interface GraphLayout {nodes:GraphNode[];edges:GraphEdge[];width:number;height:number;x:number;y:number}
export function filterGraph(rows:Relationship[],typeOf:(id:string)=>string,relationshipType:string,entityType:string){
 return rows.filter(r=>!r.archived&&(!relationshipType||(relationshipMeaning(r.label)?.kind||r.label)===(relationshipMeaning(relationshipType)?.kind||relationshipType))&&(!entityType||(typeOf(r.source_id)===entityType||typeOf(r.target_id)===entityType)));
}
/** Deterministic force placement followed by rectangle collision resolution. No inferred edges. */
export function layoutRelationships(rows:Relationship[]):GraphLayout{
 const ids=[...new Set(rows.flatMap(r=>[r.source_id,r.target_id]))].sort();
 const nodes=ids.map((id,i)=>({id,x:Math.cos(i*2*Math.PI/ids.length)*Math.max(200,ids.length*35),y:Math.sin(i*2*Math.PI/ids.length)*Math.max(180,ids.length*30)}));
 const byId=new Map(nodes.map(n=>[n.id,n]));
 for(let pass=0;pass<120;pass++){
  const force=new Map(ids.map(id=>[id,{x:0,y:0}]));
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
   const a=nodes[i],b=nodes[j],dx=b.x-a.x||0.1,dy=b.y-a.y||0.1,d=Math.max(1,Math.hypot(dx,dy));
   const push=45000/(d*d);force.get(a.id)!.x-=dx/d*push;force.get(a.id)!.y-=dy/d*push;force.get(b.id)!.x+=dx/d*push;force.get(b.id)!.y+=dy/d*push;
  }
  for(const r of rows){const a=byId.get(r.source_id)!,b=byId.get(r.target_id)!;const dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy)),pull=(d-300)*0.008;force.get(a.id)!.x+=dx/d*pull;force.get(a.id)!.y+=dy/d*pull;force.get(b.id)!.x-=dx/d*pull;force.get(b.id)!.y-=dy/d*pull;}
  for(const n of nodes){const f=force.get(n.id)!;n.x+=Math.max(-20,Math.min(20,f.x));n.y+=Math.max(-20,Math.min(20,f.y));}
 }
 for(let pass=0;pass<80;pass++)for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
  const a=nodes[i],b=nodes[j],dx=b.x-a.x,dy=b.y-a.y;
  if(Math.abs(dx)<238&&Math.abs(dy)<126){const move=(238-Math.abs(dx))/2+1;a.x-=Math.sign(dx||1)*move;b.x+=Math.sign(dx||1)*move;}
 }
 const groups=new Map<string,Relationship[]>();
 for(const r of rows){const key=JSON.stringify([r.source_id,r.target_id].sort());groups.set(key,[...(groups.get(key)||[]),r]);}
 const edges:GraphEdge[]=[];const labels:{x:number;y:number}[]=[];
 for(const group of groups.values())group.sort((a,b)=>a.id.localeCompare(b.id)).forEach((r,index)=>{
  const a=byId.get(r.source_id)!,b=byId.get(r.target_id)!;
  if(a.id===b.id){const lift=105+index*60;const y=a.y-lift;edges.push({id:r.id,path:`M ${a.x-45} ${a.y-32} C ${a.x-170} ${y-70}, ${a.x+170} ${y-70}, ${a.x+45} ${a.y-32}`,labelX:a.x,labelY:a.y*0.25+y*0.75-60.5,source:a.id,target:b.id});labels.push({x:a.x,y:a.y*0.25+y*0.75-60.5});return;}
  const left=a.id<b.id?a:b,right=a.id<b.id?b:a,dx=right.x-left.x,dy=right.y-left.y,d=Math.max(1,Math.hypot(dx,dy)),nx=-dy/d,ny=dx/d;
  let lane=(index-(group.length-1)/2)*100;let cx=0,cy=0,lx=0,ly=0;
  for(let attempt=0;attempt<45;attempt++){
   cx=(a.x+b.x)/2+nx*lane;cy=(a.y+b.y)/2+ny*lane;lx=(a.x+2*cx+b.x)/4;ly=(a.y+2*cy+b.y)/4;
   const collision=nodes.some(n=>Math.abs(n.x-lx)<195&&Math.abs(n.y-ly)<59)||labels.some(p=>Math.abs(p.x-lx)<225&&Math.abs(p.y-ly)<30);
   if(!collision)break;lane+=(index%2?-1:1)*70;
  }
  const boundary=(n:GraphNode,cx:number,cy:number)=>{const dx=cx-n.x,dy=cy-n.y;const scale=Math.min(106/Math.max(0.1,Math.abs(dx)),34/Math.max(0.1,Math.abs(dy)));return {x:n.x+dx*scale,y:n.y+dy*scale};};
  const start=boundary(a,cx,cy),end=boundary(b,cx,cy);
  lx=(start.x+2*cx+end.x)/4;ly=(start.y+2*cy+end.y)/4;
  edges.push({id:r.id,path:`M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`,labelX:lx,labelY:ly,source:a.id,target:b.id});labels.push({x:lx,y:ly});
 });
 // Path controls and labels can extend beyond node bounds; retain generous padding.
 const xs=nodes.flatMap(n=>[n.x-130,n.x+130]),ys=nodes.flatMap(n=>[n.y-60,n.y+60]);
 for(const label of labels){xs.push(label.x-140,label.x+140);ys.push(label.y-50,label.y+50);}
 // Quadratic controls can be twice as far from the midpoint as their labels.
 for(const e of edges){const a=byId.get(e.source)!,b=byId.get(e.target)!;xs.push(2*e.labelX-(a.x+b.x)/2);ys.push(2*e.labelY-(a.y+b.y)/2-80);}
 const x=Math.min(0,...xs)-70,y=Math.min(0,...ys)-70;
 return {nodes,edges,x,y,width:Math.max(300,Math.max(0,...xs)-x+70),height:Math.max(240,Math.max(0,...ys)-y+70)};
}
export interface GraphCamera {x:number;y:number;scale:number}
export function zoomCamera(camera:GraphCamera,factor:number):GraphCamera{return {...camera,scale:Math.max(0.15,Math.min(4,camera.scale*factor))};}

export function graphNeighbors(rows:Relationship[],focus:string){return new Set(rows.filter(r=>!r.archived&&(r.source_id===focus||r.target_id===focus)).flatMap(r=>[r.source_id,r.target_id]));}
