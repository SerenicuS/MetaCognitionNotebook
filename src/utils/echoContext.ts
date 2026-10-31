import type { DocumentMetadata, HouseRecord } from '../types';
import type { Plan } from './thought';
import { isCatalog } from './thought';
import { classifyLoreDocument } from './lorebookNavigation';
import { convertDocumentToEchoEntity } from './echoLore';
import { parseLoreMetadata } from './universe';
import { buildEchoSearchIndex } from './echoMatching';

export const AUTHOR_ECHO_POLICY = 'author-echo-ownership-v1';
export interface EchoSourceContext {
  readonly notebookKey: string;
  readonly documentId: string;
  readonly houseId: string;
  readonly universeId: string;
  readonly milestoneId: string | null;
  readonly policy: typeof AUTHOR_ECHO_POLICY;
}

/** Same conservative ownership rules as Lorebook navigation. No reader/spoiler policy changes. */
export function isEchoEligible(doc: DocumentMetadata, universeId: string, houseId: string, plan: Plan, houses: HouseRecord[]): boolean {
  if (!universeId || doc.doc_type !== 'lorebook' || isCatalog(doc) || parseLoreMetadata(doc).archived) return false;
  // A malformed registry must not make the first House claiming a Universe authoritative.
  if (houses.filter(h => h.universe_ids?.includes(universeId)).length > 1) return false;
  const attribution = classifyLoreDocument(doc, plan, houseId, houses);
  return attribution.kind === 'assigned' && attribution.universe?.id === universeId;
}

export function buildEchoCatalog(docs: DocumentMetadata[], universeId: string, houseId: string, plan: Plan | null, houses: HouseRecord[]) {
  const registrations = new Map<string, Plan['entities']>();
  for (const registration of plan?.entities || []) {
    const entries = registrations.get(registration.id) || [];
    entries.push(registration); registrations.set(registration.id, entries);
  }
  // The classifier only consults registrations for this document. Index them once, preserving conflicts.
  const eligibleDocs = plan ? docs.filter(d => isEchoEligible(d, universeId, houseId, { ...plan, entities: registrations.get(d.id) || [] }, houses)) : [];
  const ids = new Set(eligibleDocs.map(d => d.id));
  // Project secondary information exclusively from allowed sources and endpoints.
  const safePlan = plan ? { ...plan, relationships: plan.relationships.filter(r => r.universe_id === universeId && ids.has(r.source_id) && ids.has(r.target_id)) } : null;
  const universeName = plan?.universes.find(u => u.id === universeId)?.name;
  const entities = eligibleDocs.map(d => ({
    ...convertDocumentToEchoEntity(d, [], null, universeName), universeId, houseId,
    // Recognition needs identity/profile fields, not an eager full-catalog office/relationship scan.
    factionStructure: undefined,
  }));
  const metadataById = new Map(eligibleDocs.map(d => [d.id, d]));
  function projectEntity(id: string) {
    const doc = metadataById.get(id);
    if (!doc) return undefined;
    const meta = parseLoreMetadata(doc);
    const projection = { ...doc, metadata_json: JSON.stringify({ ...meta, universe_id: universeId,
      ...(meta.faction_fields?.positions ? { faction_fields: { ...meta.faction_fields, positions: meta.faction_fields.positions.map(p => ({ ...p, holder_ids: p.holder_ids?.filter(target => ids.has(target)) })) } } : {}),
    }) };
    return { ...convertDocumentToEchoEntity(projection, eligibleDocs, safePlan, universeName), universeId, houseId };
  }
  return { docs: eligibleDocs, entities, byId: new Map(entities.map(e => [e.id, e])), index: buildEchoSearchIndex(entities), projectEntity };
}
export type EchoCatalog = ReturnType<typeof buildEchoCatalog>;
