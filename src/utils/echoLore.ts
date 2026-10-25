import type { DocumentMetadata, DocumentDetail, LorebookMetadata, FactionPosition, FactionBranch } from '../types';
import type { Plan } from './thought';
import { isCatalog } from './thought';
import {
  parseLoreMetadata,
  resolveEntityUniverse,
  getCharacterHeldOffices,
  getOtherEntityId,
  getRelationshipCategory,
} from './universe';
import { relationshipPerspective } from './relationships';
import type {
  EchoEntity,
  EchoCategory,
  EchoRelationship,
  EchoAttribute,
  EchoHeldOffice,
  EchoFactionStructure,
  EchoCharacterProfile,
} from '../components/echo/types';

/**
 * Maps Lorebook entry_type to EchoCategory.
 */
export function mapEntryTypeToEchoCategory(entryType?: string): EchoCategory {
  switch (entryType?.toLowerCase()) {
    case 'character':
      return 'character';
    case 'location':
      return 'location';
    case 'faction':
      return 'faction';
    case 'item':
    case 'artifact':
      return 'artifact';
    case 'event':
      return 'event';
    case 'rule':
    case 'concept':
      return 'rule';
    default:
      return 'other';
  }
}

/**
 * Parses and extracts character aliases from metadata, supporting both string[] and comma-separated string formats.
 */
export function extractEntityAliases(meta: Partial<LorebookMetadata>): string[] {
  const raw = meta.character_fields?.aliases as unknown;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((a: unknown) => (typeof a === 'string' ? a.trim() : ''))
      .filter((a: string) => a.length >= 2);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,;\n]+/)
      .map((a: string) => a.trim())
      .filter((a: string) => a.length >= 2);
  }
  return [];
}

/**
 * Converts a canonical Lorebook document into a rich, structured EchoEntity dossier.
 */
export function convertDocumentToEchoEntity(
  doc: DocumentMetadata | DocumentDetail,
  allDocs: DocumentMetadata[] = [],
  plan: Plan | null = null,
  universeName?: string,
  entityContent?: string
): EchoEntity {
  const isDetail = 'content' in doc && typeof (doc as DocumentDetail).content === 'string';
  const docMeta = 'metadata' in doc ? (doc as DocumentDetail).metadata : (doc as DocumentMetadata);
  const rawContent = entityContent ?? (isDetail ? (doc as DocumentDetail).content : undefined);
  const meta = parseLoreMetadata(docMeta);
  const category = mapEntryTypeToEchoCategory(meta.entry_type);
  const universeId = meta.universe_id || '';
  const resolvedUniverseName =
    universeName ||
    (plan?.universes?.find((u) => u.id === universeId)?.name) ||
    (typeof meta.universe === 'string' ? meta.universe : undefined) ||
    'Unknown Universe';

  const aliases = extractEntityAliases(meta);

  // 1. Character profile (Phase C1)
  let characterProfile: EchoCharacterProfile | undefined;
  if (category === 'character' && meta.character_fields) {
    const cf = meta.character_fields;
    const profile: EchoCharacterProfile = {};
    if (cf.age?.trim()) profile.age = cf.age.trim();
    if (cf.species?.trim()) profile.species = cf.species.trim();
    if (cf.gender?.trim()) profile.gender = cf.gender.trim();
    if (cf.vital_status?.trim()) profile.vitalStatus = cf.vital_status.trim();
    if (cf.physical_appearance?.trim()) profile.physicalAppearance = cf.physical_appearance.trim();
    if (cf.clothing_attire?.trim()) profile.clothingAttire = cf.clothing_attire.trim();
    if (cf.personality?.trim()) profile.personality = cf.personality.trim();
    if (cf.occupation?.trim()) profile.occupation = cf.occupation.trim();
    if (cf.narrative_role?.trim()) profile.narrativeRole = cf.narrative_role.trim();

    if (Object.keys(profile).length > 0) {
      characterProfile = profile;
    }
  }

  // 2. Guided attributes (only non-empty fields)
  const guidedAttributes: Record<string, string> = {};
  if (category === 'character') {
    if (characterProfile?.age) guidedAttributes['Age'] = characterProfile.age;
    if (characterProfile?.species) guidedAttributes['Species / Race'] = characterProfile.species;
    if (characterProfile?.gender) guidedAttributes['Gender'] = characterProfile.gender;
    if (characterProfile?.vitalStatus) guidedAttributes['Vital Status'] = characterProfile.vitalStatus;
    if (characterProfile?.occupation) guidedAttributes['Occupation'] = characterProfile.occupation;
    if (characterProfile?.narrativeRole) guidedAttributes['Narrative Role'] = characterProfile.narrativeRole;
    if (typeof meta.affiliation === 'string' && meta.affiliation.trim()) {
      guidedAttributes['Affiliation'] = meta.affiliation.trim();
    }
    if (typeof meta.residence === 'string' && meta.residence.trim()) {
      guidedAttributes['Residence'] = meta.residence.trim();
    }
  } else if (category === 'location') {
    if (meta.location_fields?.region?.trim()) guidedAttributes['Region'] = meta.location_fields.region.trim();
    if (meta.location_fields?.location_type?.trim()) guidedAttributes['Type'] = meta.location_fields.location_type.trim();
    if (meta.location_fields?.inhabitants?.trim()) guidedAttributes['Inhabitants'] = meta.location_fields.inhabitants.trim();
  } else if (category === 'faction') {
    if (meta.faction_fields?.faction_type?.trim()) guidedAttributes['Type'] = meta.faction_fields.faction_type.trim();
    if (typeof meta.faction_fields?.headquarters === 'string' && meta.faction_fields.headquarters.trim()) {
      guidedAttributes['Headquarters'] = meta.faction_fields.headquarters.trim();
    }
    if (meta.faction_fields?.leadership?.trim()) guidedAttributes['Leadership'] = meta.faction_fields.leadership.trim();
    if (meta.faction_fields?.territory?.trim()) guidedAttributes['Territory'] = meta.faction_fields.territory.trim();
  } else if (category === 'artifact') {
    if (meta.artifact_fields?.artifact_type?.trim()) guidedAttributes['Type'] = meta.artifact_fields.artifact_type.trim();
    if (meta.artifact_fields?.owner?.trim()) guidedAttributes['Owner'] = meta.artifact_fields.owner.trim();
    if (meta.artifact_fields?.creator?.trim()) guidedAttributes['Creator'] = meta.artifact_fields.creator.trim();
    if (meta.artifact_fields?.powers?.trim()) guidedAttributes['Powers'] = meta.artifact_fields.powers.trim();
  } else if (category === 'event') {
    if (meta.event_fields?.date_era?.trim()) guidedAttributes['Date / Era'] = meta.event_fields.date_era.trim();
    if (meta.event_fields?.event_type?.trim()) guidedAttributes['Type'] = meta.event_fields.event_type.trim();
    if (meta.event_fields?.location?.trim()) guidedAttributes['Location'] = meta.event_fields.location.trim();
  }

  // 3. Custom attributes (canonical meta.attributes: LorebookAttribute[] and legacy/extended meta.custom_fields)
  const customAttributes: EchoAttribute[] = [];
  const seenKeys = new Set<string>();

  if (Array.isArray(meta.attributes)) {
    for (const attr of meta.attributes) {
      if (
        attr &&
        typeof attr.key === 'string' &&
        attr.key.trim() &&
        typeof attr.value === 'string' &&
        attr.value.trim()
      ) {
        const cleanKey = attr.key.trim();
        seenKeys.add(cleanKey.toLowerCase());
        customAttributes.push({
          id: attr.id || `attr-${customAttributes.length}`,
          key: cleanKey,
          value: attr.value.trim(),
        });
      }
    }
  }

  if (meta.custom_fields && typeof meta.custom_fields === 'object') {
    for (const [key, val] of Object.entries(meta.custom_fields as Record<string, unknown>)) {
      if (typeof val === 'string' && val.trim() && !seenKeys.has(key.toLowerCase())) {
        seenKeys.add(key.toLowerCase());
        customAttributes.push({
          id: `attr-${customAttributes.length}`,
          key: key.trim(),
          value: val.trim(),
        });
      }
    }
  }

  // 4. Held official offices (Phase C2 reverse lookup)
  let heldOffices: EchoHeldOffice[] | undefined;
  if (category === 'character') {
    const offices = getCharacterHeldOffices(docMeta.id, allDocs, universeId, plan?.universes);
    if (offices.length > 0) {
      heldOffices = offices.map((o) => ({
        factionId: o.factionId,
        factionTitle: o.factionTitle,
        positionTitle: o.positionTitle,
        branchName: o.branchName || undefined,
        description: o.description || undefined,
      }));
    }
  }

  // 5. Faction organization structure (Phase C2)
  let factionStructure: EchoFactionStructure | undefined;
  if (category === 'faction' && meta.faction_fields) {
    const rawPositions: FactionPosition[] = meta.faction_fields.positions || [];
    const rawBranches: FactionBranch[] = meta.faction_fields.branches || [];
    const branchMap = new Map(rawBranches.map((b) => [b.id, b.name]));

    const positions = rawPositions.map((p) => {
      const branchName = p.branch_id ? branchMap.get(p.branch_id) : undefined;
      const holders = (p.holder_ids || []).map((hId) => {
        const hDoc = allDocs.find((d) => d.id === hId);
        return hDoc?.title || `Character #${hId.slice(0, 6)}`;
      });
      return {
        id: p.id,
        title: p.title,
        branchName,
        holders,
        isVacant: holders.length === 0,
      };
    });

    factionStructure = {
      factionType: meta.faction_fields.faction_type,
      headquarters: typeof meta.faction_fields.headquarters === 'string' ? meta.faction_fields.headquarters : undefined,
      leadership: meta.faction_fields.leadership,
      positions,
    };
  }

  // 6. Connected lore relationships (Phase C3/C4)
  const relationships: EchoRelationship[] = [];
  if (plan?.relationships) {
    const activeRels = plan.relationships.filter(
      (r) => !r.archived && (r.source_id === docMeta.id || r.target_id === docMeta.id)
    );
    for (const r of activeRels) {
      const otherId = getOtherEntityId(r, docMeta.id);
      const otherDoc = allDocs.find((d) => d.id === otherId);
      const otherMeta = otherDoc ? parseLoreMetadata(otherDoc) : null;
      const safeRel = {
        ...r,
        label: r.label || (r as unknown as { type?: string }).type || 'related_to',
      };
      const relationType = relationshipPerspective(safeRel, docMeta.id);
      const categoryKind = getRelationshipCategory(safeRel);

      relationships.push({
        targetId: otherId,
        targetName: otherDoc?.title || `Entity #${otherId.slice(0, 6)}`,
        relationType,
        targetCategory: mapEntryTypeToEchoCategory(otherMeta?.entry_type),
        categoryKind,
        isDirected: r.directed,
        description: r.description || undefined,
      });
    }
  }

  return {
    id: docMeta.id,
    name: docMeta.title.trim(),
    aliases: aliases.length > 0 ? aliases : undefined,
    category,
    universe: resolvedUniverseName,
    universeId,
    houseId: docMeta.house_id,
    description: (rawContent && rawContent.trim()) ? rawContent.trim() : '',
    guidedAttributes,
    customAttributes,
    relationships,
    status: meta.archived ? 'archived' : 'active',
    characterProfile,
    heldOffices,
    factionStructure,
  };
}

/**
 * Builds the scoped, isolated list of EchoEntities for the active Universe and House.
 * Enforces:
 * - Active House isolation
 * - Active Universe isolation
 * - Skips catalog documents and archived entities
 */
export function buildScopedEchoEntities(
  allDocs: (DocumentMetadata | DocumentDetail)[],
  universeId?: string,
  plan?: Plan | null,
  houseId?: string
): EchoEntity[] {
  if (!universeId || !allDocs.length) return [];

  const universeObj = plan?.universes?.find((u) => u.id === universeId);
  const universeName = universeObj?.name;

  const rawDocs: DocumentMetadata[] = allDocs.map((d) => ('metadata' in d ? (d as DocumentDetail).metadata : d));

  const scopedDocs = allDocs.filter((d) => {
    const docMeta = 'metadata' in d ? (d as DocumentDetail).metadata : d;
    if (docMeta.doc_type !== 'lorebook' || isCatalog(docMeta)) return false;
    if (houseId && docMeta.house_id && docMeta.house_id !== houseId) return false;

    const res = resolveEntityUniverse(docMeta, plan?.universes || []);
    if (res.universeId !== universeId) return false;

    const meta = parseLoreMetadata(docMeta);
    if (meta.archived) return false;

    return true;
  });

  return scopedDocs.map((doc) => {
    const docMeta = 'metadata' in doc ? (doc as DocumentDetail).metadata : doc;
    const content = 'content' in doc ? (doc as DocumentDetail).content : undefined;
    return convertDocumentToEchoEntity(docMeta, rawDocs, plan || null, universeName, content);
  });
}

/**
 * Builds an index mapping normalized terms (canonical titles and aliases) to candidate EchoEntities.
 */
export function buildLoreSearchIndex(entities: EchoEntity[]): {
  termMap: Map<string, { entity: EchoEntity; isAlias: boolean }[]>;
  sortedTerms: string[];
} {
  const termMap = new Map<string, { entity: EchoEntity; isAlias: boolean }[]>();

  for (const entity of entities) {
    if (entity.status === 'archived') continue;

    // Canonical name
    const nameTerm = entity.name.toLowerCase().trim();
    if (nameTerm.length >= 2) {
      if (!termMap.has(nameTerm)) termMap.set(nameTerm, []);
      termMap.get(nameTerm)!.push({ entity, isAlias: false });
    }

    // Aliases
    if (entity.aliases && Array.isArray(entity.aliases)) {
      for (const alias of entity.aliases) {
        const aliasTerm = alias.toLowerCase().trim();
        if (aliasTerm.length >= 2 && aliasTerm !== nameTerm) {
          if (!termMap.has(aliasTerm)) termMap.set(aliasTerm, []);
          termMap.get(aliasTerm)!.push({ entity, isAlias: true });
        }
      }
    }
  }

  const sortedTerms = Array.from(termMap.keys()).sort((a, b) => b.length - a.length);
  return { termMap, sortedTerms };
}
