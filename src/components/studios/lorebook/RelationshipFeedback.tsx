import {useState} from 'react';
import type {Plan} from '@/utils/thought';
import {requireSaved,setRelationshipArchived,type SaveThought} from '@/utils/relationships';

export function useRelationshipUndo(plan:Plan|null,save?:SaveThought){
 const [undoId,setUndoId]=useState<string|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const change=async(id:string,archived:boolean)=>{
  if(!save||!plan)return;
  setBusy(true);setNotice('Saving relationship change…');
  try{requireSaved(await save(()=>plan.revision,current=>setRelationshipArchived(current,id,archived),()=>{setUndoId(archived?id:null);setNotice(archived?'Relationship unlinked. Both entity documents and historical observations remain.':'Relationship restored.');}));setUndoId(archived?id:null);setNotice(archived?'Relationship unlinked. Both entity documents and historical observations remain.':'Relationship restored.');}
  catch(error){setNotice(`Not saved: ${String(error)}`);}
  finally{setBusy(false);}
 };
 return {unlink:(id:string)=>change(id,true),undo:()=>undoId?change(undoId,false):Promise.resolve(),notice,busy,undoId};
}
export function RelationshipFeedback({actions}:{actions:ReturnType<typeof useRelationshipUndo>}){
 return actions.notice?<div role={actions.notice.startsWith('Not saved')?'alert':'status'} className="text-xs text-foreground border border-border rounded-lg p-2 my-2"><p>{actions.notice}</p>{actions.undoId&&<button disabled={actions.busy} className="help-button mt-2" onClick={()=>void actions.undo()}>Undo unlink</button>}</div>:null;
}
