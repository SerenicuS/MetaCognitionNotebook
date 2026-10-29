import { validateMilestoneAncestry, resolveUniverseStateAtMilestone } from './stateEngine';
import type { DocumentMetadata } from '../types';
import type { Relationship, Evidence, Plan } from './thought';
import { parseLoreMetadata } from './universe';
import { relationshipMeaning } from './relationships';

/** Ephemeral projection only. Never save these records to the planning catalog. */
export interface GraphConnection extends Relationship {
  provenance?: 'authored' | 'office';
  positionId?: string;
  positionTitle?: string;
  branchName?: string;
  evidence?: Evidence;
  authoredLabel?: string;
}

export function connectionPriority(r: GraphConnection): number {
  if (r.provenance === 'office') return 1;
  if (relationshipMeaning(r.label)?.kind === 'membership') return 3;
  return 2;
}

// Unicode scalar ordering matches the publication generator and is independent of locale.
function compareText(a: string, b: string): number {
  const left = Array.from(a), right = Array.from(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const difference = left[i].codePointAt(0)! - right[i].codePointAt(0)!;
    if (difference) return difference;
  }
  return left.length - right.length;
}

export function compareConnections(a: GraphConnection, b: GraphConnection): number {
  return connectionPriority(a) - connectionPriority(b) || compareText(a.label, b.label) || compareText(a.id, b.id);
}

export function graphConnections(
  rows: { relationship: Relationship; evidence: Evidence }[],
  documents: DocumentMetadata[],
  universeId?: string,
  historical = false,
): GraphConnection[] {
  const docs = new Map(documents.map(d => [d.id, d]));
  const result: GraphConnection[] = rows.filter(({ relationship: r }) =>
    !r.archived && (!universeId || r.universe_id === universeId) &&
    docs.has(r.source_id) && docs.has(r.target_id) &&
    [r.source_id, r.target_id].every(id => !parseLoreMetadata(docs.get(id)!).universe_id || parseLoreMetadata(docs.get(id)!).universe_id === r.universe_id) &&
    (docs.get(r.source_id)!.house_id || 'house-default') === (docs.get(r.target_id)!.house_id || 'house-default')
  ).map(({ relationship, evidence }) => ({
    ...relationship, label: historical ? evidence.value ?? 'Unknown / unrecorded' : relationship.label,
    description: historical ? '' : relationship.description,
    provenance: 'authored', authoredLabel: relationship.label, evidence,
  }));
  // Office assignments have no dated history. Do not project current holders into the past.
  if (historical) return result;
  for (const faction of documents) {
    const meta = parseLoreMetadata(faction);
    if (!['faction', 'nation'].includes(meta.entry_type || '') || !meta.universe_id || (universeId && meta.universe_id !== universeId)) continue;
    for (const position of meta.faction_fields?.positions || []) {
      for (const holderId of new Set(position.holder_ids || [])) {
        const holder = docs.get(holderId);
        if (!holder || parseLoreMetadata(holder).entry_type !== 'character' ||
          parseLoreMetadata(holder).universe_id !== meta.universe_id ||
          (holder.house_id || 'house-default') !== (faction.house_id || 'house-default')) continue;
        result.push({
          id: `office:${JSON.stringify([faction.id, position.id, holderId])}`,
          universe_id: meta.universe_id, book_id: null, source_id: holderId, target_id: faction.id,
          label: `Holds ${position.title} in`, description: '', directed: true,
          context_node_id: null, archived: false, provenance: 'office',
          positionId: position.id, positionTitle: position.title,
          branchName: meta.faction_fields?.branches?.find(b => b.id === position.branch_id)?.name,
        });
      }
    }
  }
  return result;
}

/** Select a bounded set of pairs while keeping every fact for each visible pair. */
export function limitGraphPairs<T extends Relationship>(rows: T[], limit: number): T[] {
  const pairs = new Set<string>();
  return rows.filter(r => {
    const key = JSON.stringify([r.source_id, r.target_id].sort());
    if (!pairs.has(key) && pairs.size >= limit) return false;
    pairs.add(key);
    return true;
  });
}

export function toggleConnectionSelection(selectedId: string | null, clickedId: string): string | null {
  return selectedId === clickedId ? null : clickedId;
}

/** Resolve authored relationship changes along the existing canonical/alternate ancestry. */
export function historicalGraphRows(plan: Plan, relationships: Relationship[], documents: DocumentMetadata[], universeId: string, milestoneId: string) {
  const target = plan.nodes.find(n => n.id === milestoneId && !n.archived && n.universe_id === universeId);
  const ancestry = validateMilestoneAncestry(plan, milestoneId);
  if (!target || !ancestry.valid) return [];
  const absent = new Set(resolveUniverseStateAtMilestone(plan, documents, universeId, milestoneId, { includeProfileContext: false })
    .filter(s => s.origin === 'not_yet_introduced').map(s => s.entityId));
  return relationships.filter(r => !r.archived && r.universe_id === universeId &&
    (r.book_id === null || r.book_id === target.book_id) && !absent.has(r.source_id) && !absent.has(r.target_id))
    .map(relationship => {
      let evidence: Evidence = { value: relationship.context_node_id === null ? relationship.label : null,
        source: null, kind: relationship.context_node_id === null ? 'baseline' : 'unknown', conflict: null };
      for (const node of ancestry.lineage) {
        if (node.id === relationship.context_node_id) evidence = { value: relationship.label, source: node.id, kind: node.id === milestoneId ? 'direct' : 'earlier', conflict: null };
        for (const change of node.relationship_changes.filter(c => c.relationship_id === relationship.id)) {
          evidence = { value: change.label, source: node.id, kind: node.id === milestoneId ? 'direct' : 'earlier', conflict: null };
        }
      }
      return { relationship, evidence };
    });
}
