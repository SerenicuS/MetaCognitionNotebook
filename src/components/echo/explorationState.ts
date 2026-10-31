export type EchoSection = 'overview' | 'attributes' | 'relationships' | 'organization';
export interface EchoVisit { entityId: string; section: EchoSection; scrollTop: number; focusKey?: string }
export interface ExplorationHistory { visits: EchoVisit[]; cursor: number; truncated: boolean }
export type HistoryAction = { type: 'push'; entityId: string } | { type: 'go'; cursor: number } | { type: 'remember'; section: EchoSection; scrollTop: number; focusKey?: string };
export function initialHistory(entityId: string): ExplorationHistory {
  return { visits: [{ entityId, section: 'overview', scrollTop: 0 }], cursor: 0, truncated: false };
}
export function explorationReducer(state: ExplorationHistory, action: HistoryAction): ExplorationHistory {
  if (action.type === 'remember') {
    return { ...state, visits: state.visits.map((v, i) => i === state.cursor ? { ...v, section: action.section, scrollTop: action.scrollTop, focusKey: action.focusKey } : v) };
  }
  if (action.type === 'go') return action.cursor >= 0 && action.cursor < state.visits.length ? { ...state, cursor: action.cursor } : state;
  if (state.visits[state.cursor].entityId === action.entityId) return state;
  const visits = [...state.visits.slice(0, state.cursor + 1), { entityId: action.entityId, section: 'overview' as const, scrollTop: 0 }];
  const truncated = state.truncated || visits.length > 50;
  return { visits: visits.slice(-50), cursor: Math.min(visits.length, 50) - 1, truncated };
}

/** Guards even transports that cannot cancel IPC work. Invalidation never publishes old results. */
export class EchoRequestGate {
  private generation = 0;
  start() { const generation = ++this.generation; return () => generation === this.generation; }
  invalidate() { this.generation++; }
}
