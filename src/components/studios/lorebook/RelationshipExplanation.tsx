import React, { useState } from 'react';
import type { Plan, Relationship } from '@/utils/thought';
import { requireSaved, updateRelationshipDescription, type SaveThought } from '@/utils/relationships';

export const RelationshipExplanation: React.FC<{ relationship: Relationship; plan: Plan; save?: SaveThought }> = ({ relationship, plan, save }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [expected, setExpected] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  return <div className="w-full space-y-1">
    {editing ? <form className="space-y-2" onSubmit={async e => {
      e.preventDefault(); if (!save || busy) return;
      setBusy(true); setFeedback('');
      try {
        requireSaved(await save(() => plan.revision, current => updateRelationshipDescription(current, relationship.id, relationship.universe_id, expected, draft), () => {}));
        setEditing(false);
      } catch (error) { setFeedback(String(error)); } finally { setBusy(false); }
    }}>
      <label className="block">Why this relationship exists (optional)<textarea className="help-input w-full block" rows={4} value={draft} disabled={busy} onChange={e => setDraft(e.target.value)}/></label>
      <button type="submit" className="help-button" disabled={busy}>Save explanation</button>{' '}
      <button type="button" className="help-button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
    </form> : <>
      {relationship.description && <p className="whitespace-pre-wrap break-words text-muted-foreground">{relationship.description}</p>}
      {save && <button type="button" className="help-button" onClick={() => { setDraft(relationship.description); setExpected(relationship.description); setFeedback(''); setEditing(true); }}>{relationship.description ? 'Edit explanation' : 'Why? Add explanation'}</button>}
    </>}
    {feedback && <p role="status">{feedback}</p>}
  </div>;
};
