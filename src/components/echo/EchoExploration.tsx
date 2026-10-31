import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { HouseRecord } from '@/types';
import { api } from '@/services/api';
import type { Plan } from '@/utils/thought';
import { buildEchoCatalog, isEchoEligible, type EchoCatalog, type EchoSourceContext } from '@/utils/echoContext';
import { matchEchoText } from '@/utils/echoMatching';
import { resolveUniverseStateAtMilestone } from '@/utils/stateEngine';
import { getCategoryForEntryType, parseLoreMetadata } from '@/utils/universe';
import type { EchoCandidateMatch, EchoHistoricalContextData } from './types';
import { EchoDocumentationPopup } from './EchoDocumentationPopup';
import { EchoRequestGate, explorationReducer, initialHistory } from './explorationState';

interface Props {
  entityId: string;
  position: { top: number; left: number };
  source: EchoSourceContext;
  catalog: EchoCatalog;
  plan: Plan;
  houses: HouseRecord[];
  onClose: (returnFocus?: boolean) => void;
  onOpenDocument?: (id: string) => void;
  onNavigateWebOfThought?: EchoHistoricalContextData['onNavigateWebOfThought'];
  boundReference?: import('./types').EchoPersistentReference | null;
  onChangeTarget?: (ref: import('./types').EchoPersistentReference) => void;
  onRemoveReference?: (id: string) => void;
  onOpenManageReferences?: () => void;
}

/** One read-only exploration surface. It owns no editor, save, relationship or Recent API. */
export function EchoExploration({
  entityId,
  position,
  source,
  catalog,
  plan,
  houses,
  onClose,
  onOpenDocument,
  onNavigateWebOfThought,
  boundReference,
  onChangeTarget,
  onRemoveReference,
  onOpenManageReferences,
}: Props) {
  const [history, dispatch] = useReducer(explorationReducer, entityId, initialHistory);
  const visit = history.visits[history.cursor];
  const entity = catalog.byId.get(visit.entityId);
  const [chooser, setChooser] = useState<EchoCandidateMatch | null>(null);
  const [denied, setDenied] = useState<Set<string>>(() => new Set());
  const [unavailable, setUnavailable] = useState(false);
  const [body, setBody] = useState<{ id: string; status: 'loading' | 'ready' | 'error' | 'unavailable'; prose: string }>({ id: '', status: 'loading', prose: '' });
  const [retry, setRetry] = useState(0);
  const gate = useRef(new EchoRequestGate());
  const current = useRef({ source, catalog, plan, houses });
  current.current = { source, catalog, plan, houses };
  const visibleCatalog = useMemo(() => denied.size ? buildEchoCatalog(catalog.docs.filter(d => !denied.has(d.id)), source.universeId, source.houseId, plan, houses) : catalog, [catalog, source, plan, houses, denied]);
  const dossierEntity = useMemo(() => visibleCatalog.projectEntity(visit.entityId, source.milestoneId), [visibleCatalog, visit.entityId, source.milestoneId]);
  const chooserRef = useRef<HTMLDivElement>(null);
  const chooserOrigin = useRef<HTMLElement | null>(null);
  const visitKey = `${history.cursor}:${visit.entityId}`;

  useEffect(() => {
    if (chooser) chooserRef.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [chooser]);

  useEffect(() => {
    const isCurrent = gate.current.start();
    const id = visit.entityId;
    setBody({ id, status: 'loading', prose: '' });
    if (!catalog.byId.has(id) || denied.has(id)) { setBody({ id, status: 'unavailable', prose: '' }); return; }
    api.getDocument(id).then(detail => {
      if (!isCurrent() || current.current.source !== source || current.current.catalog !== catalog) return;
      const allowed = detail?.metadata.id === id && current.current.catalog.byId.has(id) && isEchoEligible(detail.metadata, source.universeId, source.houseId, current.current.plan, current.current.houses);
      if (!allowed) setDenied(previous => new Set([...previous, id]));
      setBody({ id, status: allowed ? 'ready' : 'unavailable', prose: allowed ? detail.content : '' });
    }).catch(error => {
      if (isCurrent() && current.current.source === source && current.current.catalog === catalog) {
        const missing = /not found|missing|deleted/i.test(String(error));
        if (missing) setDenied(previous => new Set([...previous, id]));
        setBody({ id, status: missing ? 'unavailable' : 'error', prose: '' });
      }
    });
    return () => gate.current.invalidate();
  }, [visit.entityId, source, catalog, retry, denied]);

  function navigate(id: string) {
    setChooser(null);
    if (!current.current.catalog.byId.has(id) || denied.has(id)) { setUnavailable(true); return; }
    setUnavailable(false);
    dispatch({ type: 'push', entityId: id });
  }
  function go(cursor: number) {
    setChooser(null); setUnavailable(false);
    dispatch({ type: 'go', cursor });
  }
  function cancelChooser() {
    setChooser(null);
    chooserOrigin.current?.focus({ preventScroll: true });
  }
  function renderText(text: string) {
    const matches = matchEchoText(text, visibleCatalog.index);
    const nodes: React.ReactNode[] = [];
    let last = 0;
    for (const match of matches) {
      nodes.push(text.slice(last, match.from));
      const candidates = match.matchingEntities.filter(e => e.id !== visit.entityId && catalog.byId.has(e.id) && !denied.has(e.id));
      if (!candidates.length) nodes.push(match.matchedText);
      else nodes.push(<button key={match.from} type="button" className="inline p-0 text-primary underline decoration-dotted underline-offset-2 rounded-sm focus-visible:outline focus-visible:outline-primary select-text"
        title={candidates.length > 1 ? `Choose lore entry for ${match.matchedText}` : `Explore ${candidates[0].name}`}
        onClick={event => {
          // Dragging to select/copy text must never navigate.
          const selection = window.getSelection();
          if (event.detail !== 0 && selection?.toString() && event.currentTarget.closest('[role=dialog]')?.contains(selection.anchorNode)) return;
          if (candidates.length === 1) navigate(candidates[0].id);
          else { chooserOrigin.current = event.currentTarget; setChooser({ ...match, matchingEntities: candidates, isAmbiguous: true }); }
        }}>{match.matchedText}</button>);
      last = match.to;
    }
    nodes.push(text.slice(last));
    return nodes;
  }

  const historicalContext = useMemo<EchoHistoricalContextData | null>(() => {
    if (!source.milestoneId) return null;
    const milestone = plan.nodes.find(n => n.id === source.milestoneId && n.universe_id === source.universeId && !n.archived);
    if (!milestone) return null;
    const branch = plan.branches?.find(b => b.id === milestone.branch_id && b.universe_id === source.universeId);
    
    const currentEntityId = visit.entityId;
    const currentDoc = visibleCatalog.docs.find(d => d.id === currentEntityId);
    const currentTitle = currentDoc?.title || catalog.byId.get(currentEntityId)?.name || 'Lore Entity';
    const currentCategory = currentDoc ? getCategoryForEntryType(parseLoreMetadata(currentDoc).entry_type) : (catalog.byId.get(currentEntityId)?.category || 'other');

    // Session-local derivation avoids the older global cache's cross-notebook key assumptions.
    const resolved = resolveUniverseStateAtMilestone(plan, visibleCatalog.docs.map(doc => ({ ...doc, metadata_json: JSON.stringify({ ...JSON.parse(doc.metadata_json || '{}'), universe_id: source.universeId }) })), source.universeId, milestone.id).find(s => s.entityId === currentEntityId);
    return {
      universeId: source.universeId, milestoneId: milestone.id, milestoneTitle: milestone.title, milestoneEra: milestone.era,
      continuityName: milestone.branch_id ? `Alternate: ${branch?.name || 'Alternate Branch'}` : 'Canonical Timeline', branchId: milestone.branch_id || null,
      resolvedState: resolved || { entityId: currentEntityId, entityTitle: currentTitle, category: currentCategory as import('@/utils/stateEngine').ResolvedEntityState['category'], propertyKey: 'status', value: null, displayLabel: 'Unassigned', origin: 'unassigned', hasChangedAtThisMilestone: false },
      onNavigateWebOfThought,
    };
  }, [visit.entityId, source, plan, visibleCatalog, catalog, onNavigateWebOfThought]);

  if (!entity) return null; // parent invalidates the entire session when eligibility changes
  const visibleBody = unavailable || (body.id === visit.entityId && body.status === 'unavailable')
    ? { status: 'unavailable' as const, prose: '' }
    : body.id === visit.entityId ? body : { status: 'loading' as const, prose: '' };
  const displayedEntity = visibleBody.status === 'unavailable' ? { ...entity, name: 'Unavailable entry', category: 'other' as const, description: '', templateEntryType: 'other', aliases: undefined, universe: '', guidedAttributes: {}, customAttributes: [], relationships: [], characterProfile: undefined, heldOffices: undefined, factionStructure: undefined } : dossierEntity || entity;
  const visitName = (id: string) => denied.has(id) ? 'Unavailable entry' : catalog.byId.get(id)?.name || 'Unavailable entry';
  return <EchoDocumentationPopup entity={displayedEntity} position={position} onClose={onClose}
    body={{ ...visibleBody, retry: () => setRetry(n => n + 1) }}
    onNavigateEntity={navigate}
    onOpenDocument={visibleBody.status === 'ready' ? onOpenDocument : undefined}
    historicalContext={visibleBody.status === 'unavailable' ? null : historicalContext}
    renderText={renderText} visitKey={visitKey} section={visit.section} scrollTop={visit.scrollTop}
    onRemember={(section, scrollTop, focusKey) => dispatch({ type: 'remember', section, scrollTop, focusKey })}
    onCancelChooser={chooser ? cancelChooser : undefined}
    boundReference={boundReference}
    onChangeTarget={onChangeTarget}
    onRemoveReference={onRemoveReference}
    onOpenManageReferences={onOpenManageReferences}
    navigation={<div className="shrink-0 pb-2 space-y-2">
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" disabled={history.cursor === 0} onClick={() => go(history.cursor - 1)} className="disabled:opacity-40">← Back</button>
        <button type="button" disabled={history.cursor === history.visits.length - 1} onClick={() => go(history.cursor + 1)} className="disabled:opacity-40">Forward →</button>
      </div>
      <nav aria-label="Echo exploration history" className="flex flex-wrap gap-1 text-[11px]">
        {history.truncated && <span title="Only the latest 50 visits are retained">Earlier visits omitted · </span>}
        {history.visits.length > 4 && <details className="max-h-[24vh] overflow-y-auto"><summary>All visits ({history.visits.length})</summary>{history.visits.map((v, i) => <button className="block" type="button" key={i} onClick={() => go(i)}>{i + 1}. {visitName(v.entityId)}</button>)}</details>}
        {history.visits.slice(Math.max(0, history.cursor - 2), history.cursor + 1).map((v, i) => {
          const cursor = Math.max(0, history.cursor - 2) + i;
          return <button className="max-w-full truncate underline" type="button" key={cursor} aria-current={cursor === history.cursor ? 'page' : undefined} onClick={() => go(cursor)}>{i > 0 ? ' › ' : ''}{visitName(v.entityId)}</button>;
        })}
      </nav>
      <span className="sr-only" role="status" aria-live="polite">{displayedEntity.name}: {visibleBody.status}</span>
    </div>}
    chooser={chooser && <div ref={chooserRef} role="group" aria-label="Choose lore entry" className="shrink-0 max-h-[25vh] overflow-y-auto p-2 mb-2 border rounded space-y-2">
      <p>Choose an entry for “{chooser.matchedText}”</p>
      {chooser.matchingEntities.filter(e => catalog.byId.has(e.id)).map(e => <button className="block underline text-xs" type="button" key={e.id} onClick={() => navigate(e.id)}>{e.name} · {e.category} · {e.id.slice(-8)}</button>)}
      <button type="button" onClick={cancelChooser}>Cancel choice</button>
    </div>}
  />;
}
