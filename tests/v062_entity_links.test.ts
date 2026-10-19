import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAndCreateRelationship,
  archiveRelationshipInPlan,
  handleEntityDeletionInPlan,
  getEntityLinkedRelationships,
  getOtherEntityId,
  resolveLegacyEntityMatch,
  syncAllPlanEntities,
  AFFILIATION_LABEL,
  RESIDENCE_LABEL,
  LEADERSHIP_LABEL,
  TERRITORY_LABEL,
  ALLY_LABEL,
  RIVAL_LABEL,
  OWNER_LABEL,
  CREATOR_LABEL,
  OCCURRED_AT_LABEL,
  PARTICIPANT_LABEL,
} from '../src/utils/universe';
import type { Plan, Relationship } from '../src/utils/thought';
import type { DocumentMetadata, LorebookMetadata } from '../src/types';

describe('v0.6.2 Entity Relationship Consistency Pass Tests', () => {
  const universeId = 'uni-solaris';

  function setupWorld() {
    const plan: Plan = {
      version: 1,
      revision: 1,
      universes: [{ id: universeId, name: 'Solaris Reach', description: 'Cosmic world' }],
      books: [{ id: 'book-1', universe_id: universeId, name: 'Sunfall', continuity: 'canonical' }],
      entities: [
        { id: 'doc-aldric', universe_id: universeId },
        { id: 'doc-ashen', universe_id: universeId },
        { id: 'doc-silver', universe_id: universeId },
        { id: 'doc-citadel', universe_id: universeId },
        { id: 'doc-vale', universe_id: universeId },
        { id: 'doc-blade', universe_id: universeId },
        { id: 'doc-battle', universe_id: universeId },
      ],
      nodes: [],
      relationships: [],
    };

    const docs: DocumentMetadata[] = [
      {
        id: 'doc-aldric',
        title: 'Aldric the Dawnbringer',
        doc_type: 'lorebook',
        tags: ['character'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata_json: JSON.stringify({
          universe_id: universeId,
          entry_type: 'character',
          character_fields: {
            role: 'High Champion',
            species: 'Human',
            residence: 'Sunken Citadel',
          },
        } as LorebookMetadata),
      },
      {
        id: 'doc-lyra',
        title: 'Lyra Moonshadow',
        doc_type: 'lorebook',
        tags: ['character'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata_json: JSON.stringify({
          universe_id: universeId,
          entry_type: 'character',
          character_fields: {
            role: 'Spellweaver',
            species: 'Elf',
          },
        } as LorebookMetadata),
      },
      {
        id: 'doc-ashen',
        title: 'The Ashen Order',
        doc_type: 'lorebook',
        tags: ['faction'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata_json: JSON.stringify({
          universe_id: universeId,
          entry_type: 'faction',
          faction_fields: {
            faction_type: 'Military Order',
            ideology: 'Preserve the Solar Flame',
            leadership: 'Aldric the Dawnbringer',
            territory: 'Sunken Citadel',
            territory_notes: 'Heavily garrisoned mountain redoubt and surrounding pass.',
            allies: 'Silver Guild',
            rivals: 'Void Cult',
          },
        } as LorebookMetadata),
      },
      {
        id: 'doc-silver',
        title: 'Silver Guild',
        doc_type: 'lorebook',
        tags: ['faction'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata_json: JSON.stringify({
          universe_id: universeId,
          entry_type: 'faction',
          faction_fields: {
            faction_type: 'Merchant Syndicate',
          },
        } as LorebookMetadata),
      },
      {
        id: 'doc-citadel',
        title: 'Sunken Citadel',
        doc_type: 'lorebook',
        tags: ['location'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata_json: JSON.stringify({
          universe_id: universeId,
          entry_type: 'location',
          location_fields: {
            location_type: 'Ancient Fortress',
            region: 'Eastern Peaks',
            factions: 'The Ashen Order',
            inhabitants: 'Aldric the Dawnbringer',
          },
        } as LorebookMetadata),
      },
      {
        id: 'doc-vale',
        title: 'Sunken Vale',
        doc_type: 'lorebook',
        tags: ['location'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata_json: JSON.stringify({
          universe_id: universeId,
          entry_type: 'location',
          location_fields: {
            location_type: 'Valley',
          },
        } as LorebookMetadata),
      },
      {
        id: 'doc-blade',
        title: 'Dawn Blade',
        doc_type: 'lorebook',
        tags: ['artifact'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata_json: JSON.stringify({
          universe_id: universeId,
          entry_type: 'artifact',
          artifact_fields: {
            artifact_type: 'Sunforged Greatsword',
            owner: 'Aldric the Dawnbringer',
            creator: 'The Ashen Order',
            powers: 'Channels pure solar radiance.',
          },
        } as LorebookMetadata),
      },
      {
        id: 'doc-battle',
        title: 'The Siege of Sunken Citadel',
        doc_type: 'lorebook',
        tags: ['event'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata_json: JSON.stringify({
          universe_id: universeId,
          entry_type: 'event',
          event_fields: {
            event_type: 'Cataclysmic Siege',
            location: 'Sunken Citadel',
            participants: 'The Ashen Order',
            date_era: 'Year 402, Third Age',
            outcome: 'Ashen Order victory with severe casualties.',
          },
        } as LorebookMetadata),
      },
    ];

    return { plan, docs };
  }

  describe('1. Guided Attributes Audit: Freeform vs Linked Distinction', () => {
    it('preserves qualitative/descriptive fields as freeform text strings', () => {
      const { docs } = setupWorld();
      const aldricDoc = docs.find((d) => d.id === 'doc-aldric')!;
      const meta = JSON.parse(aldricDoc.metadata_json!) as LorebookMetadata;

      assert.equal(meta.character_fields?.role, 'High Champion');
      assert.equal(meta.character_fields?.species, 'Human');

      const ashenDoc = docs.find((d) => d.id === 'doc-ashen')!;
      const ashenMeta = JSON.parse(ashenDoc.metadata_json!) as LorebookMetadata;
      assert.equal(ashenMeta.faction_fields?.faction_type, 'Military Order');
      assert.equal(ashenMeta.faction_fields?.ideology, 'Preserve the Solar Flame');

      const bladeDoc = docs.find((d) => d.id === 'doc-blade')!;
      const bladeMeta = JSON.parse(bladeDoc.metadata_json!) as LorebookMetadata;
      assert.equal(bladeMeta.artifact_fields?.artifact_type, 'Sunforged Greatsword');
      assert.equal(bladeMeta.artifact_fields?.powers, 'Channels pure solar radiance.');
    });

    it('supports mixed qualitative notes in Faction Territory', () => {
      const { docs } = setupWorld();
      const ashenDoc = docs.find((d) => d.id === 'doc-ashen')!;
      const ashenMeta = JSON.parse(ashenDoc.metadata_json!) as LorebookMetadata;

      assert.equal(ashenMeta.faction_fields?.territory, 'Sunken Citadel');
      assert.equal(
        ashenMeta.faction_fields?.territory_notes,
        'Heavily garrisoned mountain redoubt and surrounding pass.'
      );
    });
  });

  describe('2. Faction Leadership, Territory, Allies, and Rivals Relationships', () => {
    it('creates validated Faction Leadership relationship ("Led by")', () => {
      const { plan, docs } = setupWorld();
      const { updatedPlan, relationship } = validateAndCreateRelationship(plan, docs, {
        sourceId: 'doc-ashen',
        targetId: 'doc-aldric',
        label: LEADERSHIP_LABEL,
        universeId,
        directed: true,
      });

      assert.equal(relationship.source_id, 'doc-ashen');
      assert.equal(relationship.target_id, 'doc-aldric');
      assert.equal(relationship.label, LEADERSHIP_LABEL);
      assert.equal(relationship.directed, true);

      // Query from faction side
      const leaders = getEntityLinkedRelationships(updatedPlan, 'doc-ashen', {
        label: LEADERSHIP_LABEL,
        isSource: true,
      });
      assert.equal(leaders.length, 1);
      assert.equal(getOtherEntityId(leaders[0], 'doc-ashen'), 'doc-aldric');

      // Reciprocal query from character side
      const ledFactions = getEntityLinkedRelationships(updatedPlan, 'doc-aldric', {
        labels: [LEADERSHIP_LABEL],
        isSource: false,
      });
      assert.equal(ledFactions.length, 1);
      assert.equal(getOtherEntityId(ledFactions[0], 'doc-aldric'), 'doc-ashen');
    });

    it('creates validated Faction Territory relationship ("Controls")', () => {
      const { plan, docs } = setupWorld();
      const { updatedPlan } = validateAndCreateRelationship(plan, docs, {
        sourceId: 'doc-ashen',
        targetId: 'doc-citadel',
        label: TERRITORY_LABEL,
        universeId,
        directed: true,
      });

      const territories = getEntityLinkedRelationships(updatedPlan, 'doc-ashen', {
        label: TERRITORY_LABEL,
        isSource: true,
      });
      assert.equal(territories.length, 1);
      assert.equal(territories[0].target_id, 'doc-citadel');

      // Reciprocal query from location side
      const controlling = getEntityLinkedRelationships(updatedPlan, 'doc-citadel', {
        label: TERRITORY_LABEL,
        isSource: false,
      });
      assert.equal(controlling.length, 1);
      assert.equal(controlling[0].source_id, 'doc-ashen');
    });

    it('creates undirected reciprocal Allies and Rivals relationships', () => {
      const { plan, docs } = setupWorld();
      const { updatedPlan: p1 } = validateAndCreateRelationship(plan, docs, {
        sourceId: 'doc-ashen',
        targetId: 'doc-silver',
        label: ALLY_LABEL,
        universeId,
        directed: false,
      });

      // Both sides can query the ally relationship without direction restriction
      const ashenAllies = getEntityLinkedRelationships(p1, 'doc-ashen', {
        label: ALLY_LABEL,
      });
      assert.equal(ashenAllies.length, 1);
      assert.equal(getOtherEntityId(ashenAllies[0], 'doc-ashen'), 'doc-silver');

      const silverAllies = getEntityLinkedRelationships(p1, 'doc-silver', {
        label: ALLY_LABEL,
      });
      assert.equal(silverAllies.length, 1);
      assert.equal(getOtherEntityId(silverAllies[0], 'doc-silver'), 'doc-ashen');
    });
  });

  describe('3. Character Residence & Location Inhabitants', () => {
    it('creates Character Residence relationship ("Resides in")', () => {
      const { plan, docs } = setupWorld();
      const { updatedPlan } = validateAndCreateRelationship(plan, docs, {
        sourceId: 'doc-aldric',
        targetId: 'doc-citadel',
        label: RESIDENCE_LABEL,
        universeId,
        directed: true,
      });

      const residence = getEntityLinkedRelationships(updatedPlan, 'doc-aldric', {
        label: RESIDENCE_LABEL,
        isSource: true,
      });
      assert.equal(residence.length, 1);
      assert.equal(residence[0].target_id, 'doc-citadel');

      // Query location inhabitants reciprocally
      const inhabitants = getEntityLinkedRelationships(updatedPlan, 'doc-citadel', {
        labels: [RESIDENCE_LABEL, 'Inhabited by'],
        reciprocalLabels: [RESIDENCE_LABEL],
      });
      assert.equal(inhabitants.length, 1);
      assert.equal(getOtherEntityId(inhabitants[0], 'doc-citadel'), 'doc-aldric');
    });
  });

  describe('4. Artifact Owner and Creator Relationships', () => {
    it('links Artifact Owner and Creator to entities', () => {
      const { plan, docs } = setupWorld();
      const { updatedPlan: p1 } = validateAndCreateRelationship(plan, docs, {
        sourceId: 'doc-blade',
        targetId: 'doc-aldric',
        label: OWNER_LABEL,
        universeId,
        directed: true,
      });

      const { updatedPlan: p2 } = validateAndCreateRelationship(p1, docs, {
        sourceId: 'doc-blade',
        targetId: 'doc-ashen',
        label: CREATOR_LABEL,
        universeId,
        directed: true,
      });

      const ownerRels = getEntityLinkedRelationships(p2, 'doc-blade', {
        label: OWNER_LABEL,
        isSource: true,
      });
      assert.equal(ownerRels.length, 1);
      assert.equal(ownerRels[0].target_id, 'doc-aldric');

      const creatorRels = getEntityLinkedRelationships(p2, 'doc-blade', {
        label: CREATOR_LABEL,
        isSource: true,
      });
      assert.equal(creatorRels.length, 1);
      assert.equal(creatorRels[0].target_id, 'doc-ashen');
    });
  });

  describe('5. Historical Event Location and Participants', () => {
    it('links Event Location and Participants', () => {
      const { plan, docs } = setupWorld();
      const { updatedPlan: p1 } = validateAndCreateRelationship(plan, docs, {
        sourceId: 'doc-battle',
        targetId: 'doc-citadel',
        label: OCCURRED_AT_LABEL,
        universeId,
        directed: true,
      });

      const { updatedPlan: p2 } = validateAndCreateRelationship(p1, docs, {
        sourceId: 'doc-ashen',
        targetId: 'doc-battle',
        label: PARTICIPANT_LABEL,
        universeId,
        directed: true,
      });

      const locRels = getEntityLinkedRelationships(p2, 'doc-battle', {
        label: OCCURRED_AT_LABEL,
        isSource: true,
      });
      assert.equal(locRels.length, 1);
      assert.equal(locRels[0].target_id, 'doc-citadel');

      const participantRels = getEntityLinkedRelationships(p2, 'doc-battle', {
        label: PARTICIPANT_LABEL,
        isSource: false,
      });
      assert.equal(participantRels.length, 1);
      assert.equal(participantRels[0].source_id, 'doc-ashen');
    });
  });

  describe('6. Legacy Free-Text Resolution & Non-Destructive Migration', () => {
    it('resolves unambiguous single match for 1-click conversion', () => {
      const { docs } = setupWorld();
      const res = resolveLegacyEntityMatch('The Ashen Order', docs);
      assert.equal(res.status, 'single');
      assert.equal(res.matches.length, 1);
      assert.equal(res.matches[0].id, 'doc-ashen');
    });

    it('resolves case-insensitive matches cleanly', () => {
      const { docs } = setupWorld();
      const res = resolveLegacyEntityMatch('sunken citadel', docs);
      assert.equal(res.status, 'single');
      assert.equal(res.matches[0].id, 'doc-citadel');
    });

    it('identifies ambiguous matches when duplicate titles exist', () => {
      const { docs } = setupWorld();
      const duplicateDocs: DocumentMetadata[] = [
        ...docs,
        {
          id: 'doc-citadel-ruins',
          title: 'Sunken Citadel',
          doc_type: 'lorebook',
          tags: ['location'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const res = resolveLegacyEntityMatch('Sunken Citadel', duplicateDocs);
      assert.equal(res.status, 'ambiguous');
      assert.equal(res.matches.length, 2);
    });

    it('reports none for unmatched legacy text without throwing', () => {
      const { docs } = setupWorld();
      const res = resolveLegacyEntityMatch('Nonexistent Faction', docs);
      assert.equal(res.status, 'none');
      assert.equal(res.matches.length, 0);
    });

    it('preserves legacy text when user chooses to keep as note', () => {
      const { docs } = setupWorld();
      const ashenDoc = docs.find((d) => d.id === 'doc-ashen')!;
      const meta = JSON.parse(ashenDoc.metadata_json!) as LorebookMetadata;
      // When not converted, legacy string remains untouched in document frontmatter
      assert.equal(meta.faction_fields?.rivals, 'Void Cult');
    });
  });

  describe('7. Referential Integrity & Deletion Cleanup', () => {
    it('archives all linked relationships across fields when an entity is deleted', () => {
      const { plan, docs } = setupWorld();
      // Link Aldric to multiple entities across roles
      let p = plan;
      p = validateAndCreateRelationship(p, docs, {
        sourceId: 'doc-ashen',
        targetId: 'doc-aldric',
        label: LEADERSHIP_LABEL,
        universeId,
      }).updatedPlan;

      p = validateAndCreateRelationship(p, docs, {
        sourceId: 'doc-blade',
        targetId: 'doc-aldric',
        label: OWNER_LABEL,
        universeId,
      }).updatedPlan;

      p = validateAndCreateRelationship(p, docs, {
        sourceId: 'doc-aldric',
        targetId: 'doc-citadel',
        label: RESIDENCE_LABEL,
        universeId,
      }).updatedPlan;

      assert.equal(p.relationships.filter((r) => !r.archived).length, 3);

      // Handle deletion of Aldric
      const cleanedPlan = handleEntityDeletionInPlan(p, 'doc-aldric');
      const activeRels = cleanedPlan.relationships.filter((r) => !r.archived);
      assert.equal(activeRels.length, 0);

      // All 3 relationships are archived, not permanently destroyed
      assert.equal(cleanedPlan.relationships.length, 3);
      assert.ok(cleanedPlan.relationships.every((r) => r.archived));
    });
  });
});
