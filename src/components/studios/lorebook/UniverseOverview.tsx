import React, { useState } from 'react';
import type { Universe, Thought } from '@/utils/thought';
import { joinNarrative, splitNarrative, updateUniverseOverview } from '@/utils/narrativeContext';
import { requireSaved, type PlanMutation } from '@/utils/relationships';

export type SaveNarrativeThought = (expected: () => number, edit: PlanMutation, acknowledge: (result: Thought) => void) => Promise<boolean>;
export const UniverseOverview: React.FC<{ universe: Universe; revision: number; save?: SaveNarrativeThought }> = ({ universe, revision, save }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [account, setAccount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const narrative = splitNarrative(universe.description);
  return <section aria-label="Universe Overview" className="rounded-2xl border border-border bg-card/60 p-5 space-y-3 select-text">
    <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-lg">Universe Overview</h2>{save && !editing && <button type="button" className="help-button" onClick={() => { setName(universe.name); setSummary(narrative.summary); setAccount(narrative.account); setError(''); setEditing(true); }}>Edit Overview</button>}</div>
    {editing ? <form className="space-y-3 text-sm" onSubmit={async e => { e.preventDefault(); if (!save || saving) return; setSaving(true); setError(''); try { requireSaved(await save(() => revision, current => updateUniverseOverview(current, universe.id, name, joinNarrative(summary, account)), () => {})); setEditing(false); } catch (err) { setError(String(err)); } finally { setSaving(false); } }}>
      <label className="block">Universe title<input required className="help-input block w-full" value={name} onChange={e => setName(e.target.value)} disabled={saving}/></label>
      <label className="block">Short summary / premise (optional)<textarea className="help-input block w-full" rows={2} value={summary} onChange={e => setSummary(e.target.value)} disabled={saving}/></label>
      <label className="block">Extended overview / world introduction (optional)<textarea className="help-input block w-full" rows={6} value={account} onChange={e => setAccount(e.target.value)} disabled={saving}/></label>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2"><button className="help-button" disabled={saving}>{saving ? 'Saving…' : 'Save Overview'}</button><button type="button" className="help-button" disabled={saving} onClick={() => setEditing(false)}>Cancel</button></div>
    </form> : universe.description?.trim() ? <><p className="whitespace-pre-wrap leading-relaxed">{narrative.summary}</p>{narrative.account && <p className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">{narrative.account}</p>}</> : <p className="text-muted-foreground">Every universe has a story. Start by describing yours.</p>}
  </section>;
};
