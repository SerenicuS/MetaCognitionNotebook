import React, { useEffect, useRef, useState } from 'react';
import { initialWalkthrough, localPreferences, readPreferences, saveWalkthroughStatus, steps, transitionWalkthrough, type GuideTarget } from '@/help/onboarding';
import { useHelp } from '@/components/common/HelpCenter';

export const ThoughtWalkthrough:React.FC<{notebookKey:string;onNavigate:(target:GuideTarget)=>boolean;onStartGuide?:()=>void}>=({notebookKey,onNavigate,onStartGuide})=>{
  const [prefs,setPrefs]=useState(()=>readPreferences(localPreferences()));
  const [state,setState]=useState(()=>initialWalkthrough(notebookKey));
  const [notice,setNotice]=useState('');const heading=useRef<HTMLHeadingElement>(null);const start=useRef<HTMLButtonElement>(null);const {openHelp}=useHelp();
  useEffect(()=>{setState(old=>transitionWalkthrough(old,{type:'context',context:notebookKey}));setNotice('');},[notebookKey]);
  useEffect(()=>{if(state.open)heading.current?.focus();},[state.open,state.step]);
  const dispatch=(type:'restart'|'next'|'back'|'skip'|'finish')=>{
    if(type==='restart')onStartGuide?.();
    if(type==='skip'||(type==='finish'&&state.step===steps.length-1)){
      const result=saveWalkthroughStatus(localPreferences(),type==='skip'?'skipped':'completed');setPrefs(result.preferences);
      setNotice(result.persisted?'Walkthrough closed. Restart it whenever you like.':'Walkthrough closed for this session; local preference storage is unavailable.');
      requestAnimationFrame(()=>start.current?.focus());
    }else setNotice('');
    setState(old=>transitionWalkthrough(old,{type}));
  };
  const step=steps[state.step];
  return <aside className="thought-onboarding rounded-xl border border-primary/35 bg-primary/5 p-4 space-y-3" aria-label="Web of Thought guided walkthrough">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-serif text-lg">Beginning → ending, at your pace</h3>{prefs.status==='unseen'&&!state.open&&<p className="text-sm text-muted-foreground">New here? Six short steps explain the controls. Nothing is created automatically.</p>}</div>
      <div className="flex flex-wrap gap-2"><button ref={start} className="help-button" onClick={()=>dispatch('restart')}>{prefs.status==='unseen'?'Start guided walkthrough':'Restart guided walkthrough'}</button>{!state.open&&prefs.status==='unseen'&&<button className="help-button" onClick={()=>dispatch('skip')}>Skip introduction</button>}<button className="help-button" onClick={()=>openHelp('web')}>Read the Web of Thought guide</button></div></div>
    {state.open&&<div className="space-y-3">
      <p className="text-xs text-muted-foreground" aria-live="polite">Step {state.step+1} of {steps.length}</p><progress className="w-full accent-primary" aria-label="Walkthrough progress" value={state.step+1} max={steps.length}/>
      <h4 ref={heading} tabIndex={-1} className="font-semibold text-foreground">{step.title}</h4><p className="text-sm leading-relaxed">{step.text}</p><p className="text-sm text-muted-foreground border-l-2 border-primary pl-3">{step.example}</p>
      <p className="text-xs text-muted-foreground">Instructions only. The Eryndor example is never written to your notebook by this walkthrough.</p>
      <div className="flex flex-wrap gap-2"><button className="help-button" onClick={()=>{const found=onNavigate(step.target);setNotice(found?'Relevant controls are revealed and focused. Choose any data-changing action yourself.':'That control is not available yet. Follow the instructions above; first create/select the planning desk, Universe, Book or milestone as needed.');}}>Show this step</button>
        <button className="help-button" disabled={state.step===0} onClick={()=>dispatch('back')}>Back</button><button className="help-button" disabled={state.step===steps.length-1} onClick={()=>dispatch('next')}>Next</button><button className="help-button" onClick={()=>dispatch('skip')}>Skip</button><button className="help-button" disabled={state.step!==steps.length-1} onClick={()=>dispatch('finish')}>Finish</button></div>
    </div>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </aside>;
};
