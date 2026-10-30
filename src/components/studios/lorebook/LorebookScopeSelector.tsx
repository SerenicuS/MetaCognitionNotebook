import React, { useId } from 'react';
import type { HouseRecord } from '@/types';
import type { Plan } from '@/utils/thought';
import { houseUniverses, scopeFromValue, scopeValue, universeChoiceLabel, type LorebookScope } from '@/utils/lorebookNavigation';

export const LorebookScopeSelector: React.FC<{ scope: LorebookScope; plan: Plan | null; houseId: string; houseName?: string; houses: HouseRecord[]; ready: boolean; onChange: (scope: LorebookScope) => void }> = ({ scope, plan, houseId, houseName, houses, ready, onChange }) => {
  const id = useId();
  const choices = houseUniverses(plan, houseId, houses);
  const selected = scope.kind === 'universe' ? choices.find(u => u.id === scope.universeId) : undefined;
  return <div className="mb-3 min-w-0 text-xs space-y-1.5">
    <label htmlFor={id} className="block font-medium text-foreground">Browse Universe</label>
    <select id={id} aria-label="Lorebook browsing scope" className="w-full min-w-0 rounded-lg border border-border bg-background text-foreground px-2 py-2" value={scopeValue(scope)} disabled={!ready} onChange={e => onChange(scopeFromValue(e.target.value))}>
      <option value="all">All Universes</option>
      <optgroup label={`Active Universes · ${houseName || 'This House'}`}>{choices.filter(u => !u.archived).map(u => <option key={u.id} value={`universe:${u.id}`}>{universeChoiceLabel(u, choices)}</option>)}</optgroup>
      <option value="unresolved">Unassigned / Unresolved Lore</option>
      {choices.some(u => u.archived) && <optgroup label="Archived Universes — inspect / recover">{choices.filter(u => u.archived).map(u => <option key={u.id} value={`universe:${u.id}`}>{universeChoiceLabel(u, choices)}</option>)}</optgroup>}
      {scope.kind === 'universe' && !selected && <option value={scopeValue(scope)}>Selected Universe — planning unavailable</option>}
    </select>
    <p className="break-words text-muted-foreground" role="status">{!ready ? 'Waiting for Universe planning and House information. Saved scope is retained.' : scope.kind === 'all' ? `Browsing all Universes in ${houseName || 'this House'}.` : scope.kind === 'unresolved' ? 'Browsing entries without a safe Universe attribution.' : `Browsing ${selected ? universeChoiceLabel(selected, choices) : 'selected Universe'}.`}</p>
  </div>;
};
