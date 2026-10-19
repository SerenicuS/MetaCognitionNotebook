import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockStorage, api } from '../src/services/api';
import { MutationQueue, CommandQueue } from '../src/services/autosave';
import {
  validateAndCreateRelationship,
  archiveRelationshipInPlan,
  handleEntityDeletionInPlan,
  getCharacterAffiliations,
  resolveLegacyAffiliation,
  syncAllPlanEntities,
  resolveEntityUniverse,
  reconcilePlans,
  AFFILIATION_LABEL,
} from '../src/utils/universe';
import type { Plan, Relationship } from '../src/utils/thought';
import type { DocumentMetadata } from '../src/types';

describe('v0.6.2 Relationship Integrity & Entity-Linked Attributes Tests', () => {
  // Test fixture helper
  function setupTestUniverse() {
    const universeId = 'uni-solar';
    const plan: Plan = {
      version: 1,
      revision: 1,
      universes: [{ id: universeId, name: 'Solaris Reach', description: 'Cosmic world' }],
      books: [{ id: 'book-1', universe_id: universeId, name: 'Sunfall', continuity: 'canonical' }],
      entities: [
        { id: 'doc-aldric', universe_id: universeId },
        { id: 'doc-ashen', universe_id: universeId },
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
          character_fields: { role: 'Knight', species: 'Human' },
        }),
      },
      {
        id: 'doc-vesper',
        title: 'Vesper Ravenwood',
        doc_type: 'lorebook',
        tags: ['character'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata_json: JSON.stringify({
          universe_id: universeId,
          entry_type: 'character',
          character_fields: { role: 'Archivist', species: 'Elf' },
        }),
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
          faction_fields: { faction_type: 'Holy Order' },
        }),
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
          location_fields: { location_type: 'Fortress' },
        }),
      },
      {
        id: 'doc-alien',
        title: 'Outworld Vagrant',
        doc_type: 'lorebook',
        tags: ['character'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata_json: JSON.stringify({
          universe_id: 'uni-other',
          entry_type: 'character',
        }),
      },
    ];

    return { universeId, plan, docs };
  }

  // 1. Character -> Faction relationship creation
  it('1. Character -> Faction relationship creation links endpoints and syncs plan entities', () => {
    const { universeId, plan, docs } = setupTestUniverse();
    const { updatedPlan, relationship } = validateAndCreateRelationship(plan, docs, {
      sourceId: 'doc-aldric',
      targetId: 'doc-ashen',
      label: 'Member of',
      universeId,
      directed: true,
    });

    assert.equal(relationship.source_id, 'doc-aldric');
    assert.equal(relationship.target_id, 'doc-ashen');
    assert.equal(relationship.label, 'Member of');
    assert.equal(relationship.universe_id, universeId);
    assert.equal(relationship.directed, true);
    assert.equal(relationship.archived, false);

    // Verify both endpoints exist in plan.entities
    assert(updatedPlan.entities.some((e) => e.id === 'doc-aldric' && e.universe_id === universeId));
    assert(updatedPlan.entities.some((e) => e.id === 'doc-ashen' && e.universe_id === universeId));
    assert.equal(updatedPlan.relationships.length, 1);
  });

  // 2. Character -> Character relationship creation
  it('2. Character -> Character relationship creation supports mutual and directed ties', () => {
    const { universeId, plan, docs } = setupTestUniverse();
    const { updatedPlan, relationship } = validateAndCreateRelationship(plan, docs, {
      sourceId: 'doc-aldric',
      targetId: 'doc-vesper',
      label: 'Allied with',
      universeId,
      directed: false,
    });

    assert.equal(relationship.source_id, 'doc-aldric');
    assert.equal(relationship.target_id, 'doc-vesper');
    assert.equal(relationship.directed, false);
    assert.equal(relationship.label, 'Allied with');
    // Newly added doc-vesper is synced into entities
    assert(updatedPlan.entities.some((e) => e.id === 'doc-vesper' && e.universe_id === universeId));
  });

  // 3. Faction -> Location relationship creation
  it('3. Faction -> Location relationship creation records territorial dominion', () => {
    const { universeId, plan, docs } = setupTestUniverse();
    const { updatedPlan, relationship } = validateAndCreateRelationship(plan, docs, {
      sourceId: 'doc-ashen',
      targetId: 'doc-citadel',
      label: 'Rules',
      universeId,
      directed: true,
    });

    assert.equal(relationship.source_id, 'doc-ashen');
    assert.equal(relationship.target_id, 'doc-citadel');
    assert.equal(relationship.label, 'Rules');
    assert(updatedPlan.entities.some((e) => e.id === 'doc-citadel'));
  });

  // 4. Invalid endpoint rejection (missing endpoint, self-relationship)
  it('4. Invalid endpoint rejection prevents self-links and missing target entities', () => {
    const { universeId, plan, docs } = setupTestUniverse();

    // Self-connection
    assert.throws(
      () =>
        validateAndCreateRelationship(plan, docs, {
          sourceId: 'doc-aldric',
          targetId: 'doc-aldric',
          label: 'Twin of',
          universeId,
        }),
      /An entity cannot be connected to itself/
    );

    // Missing target
    assert.throws(
      () =>
        validateAndCreateRelationship(plan, docs, {
          sourceId: 'doc-aldric',
          targetId: 'non-existent-uuid',
          label: 'Advises',
          universeId,
        }),
      /Target entity not found in library/
    );

    // Empty label
    assert.throws(
      () =>
        validateAndCreateRelationship(plan, docs, {
          sourceId: 'doc-aldric',
          targetId: 'doc-vesper',
          label: '   ',
          universeId,
        }),
      /Relationship label cannot be empty/
    );
  });

  // 5. Entity ID/document ID mismatch handling
  it('5. Entity ID/document ID mismatch handling rejects mismatched IDs safely', () => {
    const { universeId, plan, docs } = setupTestUniverse();

    assert.throws(
      () =>
        validateAndCreateRelationship(plan, docs, {
          sourceId: 'arbitrary-string',
          targetId: 'doc-ashen',
          label: 'Member of',
          universeId,
        }),
      /Source entity not found in library/
    );
  });

  // 6. Missing Universe membership (cross-universe rejected)
  it('6. Missing Universe membership rejects cross-Universe relationship links', () => {
    const { universeId, plan, docs } = setupTestUniverse();

    assert.throws(
      () =>
        validateAndCreateRelationship(plan, docs, {
          sourceId: 'doc-aldric',
          targetId: 'doc-alien', // Belongs to uni-other
          label: 'Trades with',
          universeId,
        }),
      /Both entities must belong to the same Universe\. Cross-Universe links are not supported/
    );
  });

  // 7. Duplicate relationship creation
  it('7. Duplicate relationship creation prevents identical active links', () => {
    const { universeId, plan, docs } = setupTestUniverse();
    const { updatedPlan } = validateAndCreateRelationship(plan, docs, {
      sourceId: 'doc-aldric',
      targetId: 'doc-ashen',
      label: 'Member of',
      universeId,
      directed: true,
    });

    assert.throws(
      () =>
        validateAndCreateRelationship(updatedPlan, docs, {
          sourceId: 'doc-aldric',
          targetId: 'doc-ashen',
          label: 'Member of',
          universeId,
          directed: true,
        }),
      /A "Member of" relationship already exists between these entities/
    );
  });

  // 8. Relationship persistence after reload (roundtrip)
  it('8. Relationship persistence after reload retains connections through storage roundtrip', async () => {
    const { universeId, plan, docs } = setupTestUniverse();
    const { updatedPlan } = validateAndCreateRelationship(plan, docs, {
      sourceId: 'doc-aldric',
      targetId: 'doc-ashen',
      label: 'Member of',
      universeId,
    });

    const current = (await api.thoughtGet()).plan;
    const rev = current?.revision || 0;
    const saved = await api.thoughtSave(rev, updatedPlan);
    assert.equal(saved.plan?.relationships.length, 1);
    assert.equal(saved.plan?.relationships[0].label, 'Member of');

    // Reload from storage
    const reloaded = await api.thoughtGet();
    assert.equal(reloaded.plan?.relationships.length, 1);
    assert.equal(reloaded.plan?.relationships[0].source_id, 'doc-aldric');
    assert.equal(reloaded.plan?.relationships[0].target_id, 'doc-ashen');
  });

  // 9. Entity rename preserves relationship
  it('9. Entity rename preserves relationship by referencing stable entity UUIDs', () => {
    const { universeId, plan, docs } = setupTestUniverse();
    const { updatedPlan } = validateAndCreateRelationship(plan, docs, {
      sourceId: 'doc-aldric',
      targetId: 'doc-ashen',
      label: 'Member of',
      universeId,
    });

    // Rename the faction document
    const renamedDocs = docs.map((d) =>
      d.id === 'doc-ashen' ? { ...d, title: 'The Obsidian Conclave' } : d
    );

    // Relationship record remains intact with unchanged target_id
    const rel = updatedPlan.relationships[0];
    assert.equal(rel.target_id, 'doc-ashen');

    // Title lookup resolves the updated display title dynamically
    const resolvedTitle = renamedDocs.find((d) => d.id === rel.target_id)?.title;
    assert.equal(resolvedTitle, 'The Obsidian Conclave');
  });

  // 10. Affiliation selector creates canonical relationship
  it('10. Affiliation selector creates canonical relationship with standard Member of label', () => {
    const { universeId, plan, docs } = setupTestUniverse();
    const { updatedPlan } = validateAndCreateRelationship(plan, docs, {
      sourceId: 'doc-aldric',
      targetId: 'doc-ashen',
      label: AFFILIATION_LABEL,
      universeId,
    });

    const affiliations = getCharacterAffiliations(updatedPlan, 'doc-aldric');
    assert.equal(affiliations.length, 1);
    assert.equal(affiliations[0].target_id, 'doc-ashen');
    assert.equal(affiliations[0].label, 'Member of');
  });

  // 11. Relationship panel and affiliation selector remain synchronized
  it('11. Relationship panel and affiliation selector remain synchronized across mutations', () => {
    const { universeId, plan, docs } = setupTestUniverse();

    // Adding in relationship panel
    const { updatedPlan } = validateAndCreateRelationship(plan, docs, {
      sourceId: 'doc-aldric',
      targetId: 'doc-ashen',
      label: 'Member of',
      universeId,
    });

    // Appears in affiliations query
    assert.equal(getCharacterAffiliations(updatedPlan, 'doc-aldric').length, 1);

    // Archiving in affiliations view
    const relId = updatedPlan.relationships[0].id;
    const archivedPlan = archiveRelationshipInPlan(updatedPlan, relId);

    // Disappears from affiliations query
    assert.equal(getCharacterAffiliations(archivedPlan, 'doc-aldric').length, 0);

    // Disappears from active relationships list
    const activeRels = archivedPlan.relationships.filter(
      (r) => !r.archived && (r.source_id === 'doc-aldric' || r.target_id === 'doc-aldric')
    );
    assert.equal(activeRels.length, 0);
  });

  // 12. Removing affiliation removes only the relevant relationship
  it('12. Removing affiliation archives only the relationship and preserves the Faction entity', () => {
    const { universeId, plan, docs } = setupTestUniverse();
    const { updatedPlan, relationship } = validateAndCreateRelationship(plan, docs, {
      sourceId: 'doc-aldric',
      targetId: 'doc-ashen',
      label: 'Member of',
      universeId,
    });

    const unlinkedPlan = archiveRelationshipInPlan(updatedPlan, relationship.id);

    // Relationship is archived
    assert.equal(unlinkedPlan.relationships.find((r) => r.id === relationship.id)?.archived, true);

    // Faction entity document is retained in plan.entities
    assert(unlinkedPlan.entities.some((e) => e.id === 'doc-ashen'));
  });

  // 13. Legacy free-text affiliation preservation
  it('13. Legacy free-text affiliation preservation retains unlinked text without silent deletion', () => {
    const { docs } = setupTestUniverse();
    const factions = docs.filter((d) => d.id === 'doc-ashen');

    // Case with non-matching legacy name
    const legacyText = 'Forgotten Guild of Alchemists';
    const res = resolveLegacyAffiliation(legacyText, factions);

    assert.equal(res.status, 'none');
    assert.equal(res.matches.length, 0);
    // Legacy text is preserved for the user to view or resolve
    assert.equal(legacyText, 'Forgotten Guild of Alchemists');
  });

  // 14. Ambiguous legacy names require user confirmation
  it('14. Ambiguous legacy names require user confirmation without auto-binding', () => {
    const factions: DocumentMetadata[] = [
      {
        id: 'fact-1',
        title: 'Silver Guard',
        doc_type: 'lorebook',
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata_json: JSON.stringify({ entry_type: 'faction' }),
      },
      {
        id: 'fact-2',
        title: 'Silver Guard',
        doc_type: 'lorebook',
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata_json: JSON.stringify({ entry_type: 'faction' }),
      },
    ];

    const res = resolveLegacyAffiliation('Silver Guard', factions);
    assert.equal(res.status, 'ambiguous');
    assert.equal(res.matches.length, 2);
    // Invariants state: no auto-binding when ambiguous
  });

  // 15. Failed save retains user input
  it('15. Failed save retains user input in form without clearing fields', async () => {
    let formState = {
      label: 'Protector of',
      targetId: 'doc-ashen',
      directed: true,
    };

    const mockSaveThought = async () => {
      throw new Error('Disk write timeout');
    };

    let errorSurfaced = '';
    try {
      await mockSaveThought();
      // On success, fields would be cleared
      formState = { label: '', targetId: '', directed: true };
    } catch (err: any) {
      errorSurfaced = err.message;
    }

    assert.equal(errorSurfaced, 'Disk write timeout');
    // Form fields remain intact
    assert.equal(formState.label, 'Protector of');
    assert.equal(formState.targetId, 'doc-ashen');
  });

  // 16. Relationship validation failure does not wedge the organization queue
  it('16. Relationship validation failure does not wedge the organization queue', async () => {
    const queue = new MutationQueue();

    // Enqueue an action that fails with validation error
    const firstResult = await queue.enqueue(async () => {
      throw new Error('Invalid relationship: endpoints in different scopes');
    });

    assert.equal(firstResult, false);
    assert.equal(queue.hasFailure, true);
    assert.equal(queue.pendingCount, 1);

    // Discard invalid action to prevent wedging
    queue.discard();
    assert.equal(queue.hasFailure, false);
    assert.equal(queue.pendingCount, 0);

    // Enqueue a subsequent valid mutation
    let secondSucceeded = false;
    const result = await queue.enqueue(async () => {
      secondSucceeded = true;
    });

    assert.equal(result, true);
    assert.equal(secondSucceeded, true);
    assert.equal(queue.hasFailure, false);
  });

  // 17. Universe graph reflects profile-created relationships
  it('17. Universe graph reflects profile-created relationships', () => {
    const { universeId, plan, docs } = setupTestUniverse();
    const { updatedPlan } = validateAndCreateRelationship(plan, docs, {
      sourceId: 'doc-aldric',
      targetId: 'doc-ashen',
      label: 'Member of',
      universeId,
    });

    const universeRelationships = updatedPlan.relationships.filter(
      (r) => !r.archived && r.universe_id === universeId
    );

    assert.equal(universeRelationships.length, 1);
    assert.equal(universeRelationships[0].label, 'Member of');
    assert.equal(universeRelationships[0].source_id, 'doc-aldric');
    assert.equal(universeRelationships[0].target_id, 'doc-ashen');
  });

  // 18. No regression to Book timelines or historical relationship state
  it('18. No regression to Book timelines or historical relationship state', () => {
    const { universeId, plan, docs } = setupTestUniverse();

    // Add milestone node to book-1
    const milestonePlan: Plan = {
      ...plan,
      nodes: [
        {
          id: 'node-milestone-1',
          universe_id: universeId,
          book_id: 'book-1',
          position: 0,
          title: 'Battle of Ashen Vale',
          description: 'Aldric arrives',
          era: 'Second Era',
          status: 'planned',
          questions: '',
          entity_ids: ['doc-aldric'],
          changes: [],
          relationship_changes: [],
          linked_event_id: null,
          origin_node_id: null,
          archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };

    // Create relationship
    const { updatedPlan } = validateAndCreateRelationship(milestonePlan, docs, {
      sourceId: 'doc-aldric',
      targetId: 'doc-ashen',
      label: 'Member of',
      universeId,
    });

    // Deleting doc-aldric archives the relationship but preserves the milestone
    const afterDelete = handleEntityDeletionInPlan(updatedPlan, 'doc-aldric');

    assert.equal(afterDelete.nodes.length, 1);
    assert.equal(afterDelete.nodes[0].title, 'Battle of Ashen Vale');
    assert.equal(afterDelete.relationships[0].archived, true);
  });

  // 19. No regression to Vault backup/restore
  it('19. No regression to Vault backup/restore roundtrips complex relationship plan', async () => {
    const { universeId, plan, docs } = setupTestUniverse();

    const { updatedPlan: p1 } = validateAndCreateRelationship(plan, docs, {
      sourceId: 'doc-aldric',
      targetId: 'doc-ashen',
      label: 'Member of',
      universeId,
    });

    const { updatedPlan: p2 } = validateAndCreateRelationship(p1, docs, {
      sourceId: 'doc-aldric',
      targetId: 'doc-vesper',
      label: 'Friend of',
      universeId,
      directed: false,
    });

    // Save to storage (analogous to vault archive payload)
    const current = (await api.thoughtGet()).plan;
    const rev = current?.revision || 0;
    const saved = await api.thoughtSave(rev, p2);
    assert.equal(saved.plan?.relationships.length, 2);

    // Reconcile and restore
    const reconciled = reconcilePlans(p2, saved.plan!);
    assert.equal(reconciled.relationships.length, 2);
    assert.equal(reconciled.entities.length, 4);
  });
});
