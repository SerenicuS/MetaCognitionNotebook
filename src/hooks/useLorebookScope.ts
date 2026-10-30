import { useCallback, useEffect, useState } from 'react';
import type { DocumentMetadata, HouseRecord } from '../types';
import type { Plan } from '../utils/thought';
import { ALL_UNIVERSES, classifyLoreDocument, readScopePreference, scopeAfterOpen, scopePreferenceKey, scopeValue, validateScope, type LorebookScope } from '../utils/lorebookNavigation';

/** Instantiated once by AppContent. Storage persists intent; it never broadcasts selection. */
export function useLorebookScope(notebook: string, houseId: string, plan: Plan | null, houses: HouseRecord[], ready: boolean) {
  const key = scopePreferenceKey(notebook, houseId);
  const [state, setState] = useState({ key: '', scope: ALL_UNIVERSES });
  const [pendingOpen, setPendingOpen] = useState<{ key: string; document: DocumentMetadata } | null>(null);
  const scope = state.key === key ? state.scope : ALL_UNIVERSES;
  useEffect(() => {
    if (!ready) return;
    setState(current => {
      const stored = current.key === key ? current.scope : readScopePreference(localStorage, key);
      let next = validateScope(stored, plan, houseId, houses);
      if (pendingOpen?.key === key) next = scopeAfterOpen(next, classifyLoreDocument(pendingOpen.document, plan, houseId, houses));
      return current.key === key && scopeValue(current.scope) === scopeValue(next) ? current : { key, scope: next };
    });
    if (pendingOpen?.key === key) setPendingOpen(null);
  }, [key, ready, plan, houses, houseId, pendingOpen]);
  useEffect(() => {
    if (!ready || state.key !== key || scopeValue(validateScope(state.scope, plan, houseId, houses)) !== scopeValue(state.scope)) return;
    try { localStorage.setItem(key, JSON.stringify(state.scope)); } catch { /* Session-only browsing still works. */ }
  }, [key, ready, state, plan, houses, houseId]);
  const selectScope = useCallback((next: LorebookScope, targetHouseId = houseId) => {
    setPendingOpen(null);
    setState({ key: scopePreferenceKey(notebook, targetHouseId), scope: next });
  }, [notebook, houseId]);
  const followOpenedDocument = (document: DocumentMetadata, targetHouseId = houseId) => {
    if (document.doc_type !== 'lorebook') return;
    const targetKey = scopePreferenceKey(notebook, targetHouseId);
    if (!ready || targetKey !== key) { setPendingOpen({ key: targetKey, document }); return; }
    setState(current => {
      const previous = current.key === key ? current.scope : readScopePreference(localStorage, key);
      return { key, scope: scopeAfterOpen(validateScope(previous, plan, houseId, houses), classifyLoreDocument(document, plan, houseId, houses)) };
    });
  };
  return { scope, selectScope, followOpenedDocument, ready: ready && state.key === key };
}
