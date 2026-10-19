import type {Plan,Thought} from '../utils/thought';
import {handleEntityDeletionInPlan} from '../utils/universe';
/** Recoverable ordering, NOT a multi-file transaction. A failure never proceeds to the next stage. */
export function entityArchiveOperation(id:string,approvedRelationshipIds:string[],deps:{
 current:()=>Plan|null;save:(expected:number,plan:Plan)=>Promise<Thought>;publish:(result:Thought)=>void;
 archiveDocument:(id:string)=>Promise<void>;
}){
 let linksDone=false,documentDone=false;
 let attempt:{expected:number;plan:Plan}|null=null;
 return async()=>{
  if(!linksDone){
   const current=deps.current();
   const active=current?.relationships.filter(r=>!r.archived&&(r.source_id===id||r.target_id===id))||[];
   if(active.some(r=>!approvedRelationshipIds.includes(r.id)))throw new Error('Relationship impact changed. Cancel this queued operation and review the archive preview again.');
   if(active.length||attempt){
    if(!attempt)attempt={expected:current!.revision,plan:handleEntityDeletionInPlan(current!,id)};
    const result=await deps.save(attempt.expected,attempt.plan);deps.publish(result);
   }
   linksDone=true;
  }
  if(!documentDone){
   try{await deps.archiveDocument(id);documentDone=true;}
   catch(error){throw new Error(`Relationship archiving completed; document archive could not be confirmed: ${String(error)}. Entity and historical IDs are retained. Keep the notebook Backups folder. Use Retry to finish, or cancel and inspect before restoring links.`);}
  }
 };
}
