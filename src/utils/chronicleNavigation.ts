import type { Plan } from './thought';
import { validateMilestoneAncestry } from './stateEngine';

/** Resolve a provenance link within the currently inspected history, without editing it. */
export function sourceChronicleRoute(plan: Plan, universeId: string, currentId: string, sourceId: string) {
  const ancestry = validateMilestoneAncestry(plan, currentId);
  const source = ancestry.lineage.find(n => n.id === sourceId);
  if (!ancestry.valid || !source || source.universe_id !== universeId || source.book_id !== null ||
      !plan.universes.some(u => u.id === universeId && !u.archived) ||
      ancestry.lineage.some(n => n.universe_id !== universeId || (n.branch_id &&
        !plan.branches?.some(b => b.id === n.branch_id && b.universe_id === universeId && !b.archived)))) {
    throw new Error('The source Chronicle is missing, archived, or inaccessible in this history.');
  }
  return { continuityId: source.branch_id || null, milestoneId: source.id };
}

export function focusChronicle(panel: HTMLElement) {
  panel.scrollIntoView({ block: 'center', behavior: 'auto' });
  panel.focus({ preventScroll: true });
}
