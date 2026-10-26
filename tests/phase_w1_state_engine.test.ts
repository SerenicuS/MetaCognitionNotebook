import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DocumentMetadata, HouseRecord } from '../src/types';
import type { Plan, Universe, StoryNode } from '../src/utils/thought';
import { uid, emptyPlan, insertNode, newNode } from '../src/utils/thought';
import {
  getStatusDescriptor,
  getCategoryPresets,
  validateMilestoneAncestry,
  getMilestonePredecessors,
  resolveUniverseStateAtMilestone,
  assignMilestoneState,
  clearMilestoneState,
  compareMilestoneStates,
  NOT_INTRODUCED_STATUS,
} from '../src/utils/stateEngine';

test('Phase W1: Universe State Engine & Predecessor Inheritance', async (t) => {
  const UNIVERSE_ID = 'univ-altair-1';
  const OTHER_UNIVERSE_ID = 'univ-sol-2';

  const universeA: Universe = {
    id: UNIVERSE_ID,
    name: 'Altair Sector',
    description: 'Frontier colonies of Altair',
  };

  const universeB: Universe = {
    id: OTHER_UNIVERSE_ID,
    name: 'Solar Federation',
    description: 'Inner core system',
  };

  // Test documents
  const charDoc: DocumentMetadata = {
    id: 'char-elena-101',
    title: 'Elena Vance',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: 'house-alpha',
    path: '/vault/houses/house-alpha/lorebook/elena.md',
    created_at: '2026-10-26T10:00:00Z',
    modified_at: '2026-10-26T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_ID,
      character_fields: {
        vital_status: 'deceased', // Current present-day profile value! Must NOT overwrite historical baselines.
      },
    }),
  };

  const unintroducedCharDoc: DocumentMetadata = {
    id: 'char-grandchild-102',
    title: 'Leo Vance',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: 'house-alpha',
    path: '/vault/houses/house-alpha/lorebook/leo.md',
    created_at: '2026-10-26T10:00:00Z',
    modified_at: '2026-10-26T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_ID,
    }),
  };

  const nationDoc: DocumentMetadata = {
    id: 'faction-republic-201',
    title: 'Altair Mining Republic',
    doc_type: 'lorebook',
    tags: ['faction'],
    house_id: 'house-alpha',
    path: '/vault/houses/house-alpha/lorebook/republic.md',
    created_at: '2026-10-26T10:00:00Z',
    modified_at: '2026-10-26T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'faction',
      universe_id: UNIVERSE_ID,
    }),
  };

  const locationDoc: DocumentMetadata = {
    id: 'loc-citadel-301',
    title: 'Obsidian Citadel',
    doc_type: 'lorebook',
    tags: ['location'],
    house_id: 'house-alpha',
    path: '/vault/houses/house-alpha/lorebook/citadel.md',
    created_at: '2026-10-26T10:00:00Z',
    modified_at: '2026-10-26T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'location',
      universe_id: UNIVERSE_ID,
    }),
  };

  const unassignedDoc: DocumentMetadata = {
    id: 'artifact-orb-401',
    title: 'Crying Stone of Altair',
    doc_type: 'lorebook',
    tags: ['artifact'],
    house_id: 'house-alpha',
    path: '/vault/houses/house-alpha/lorebook/orb.md',
    created_at: '2026-10-26T10:00:00Z',
    modified_at: '2026-10-26T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'artifact',
      universe_id: UNIVERSE_ID,
    }),
  };

  const foreignDoc: DocumentMetadata = {
    id: 'char-foreign-501',
    title: 'Earth Diplomat',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: 'house-alpha',
    path: '/vault/houses/house-alpha/lorebook/diplomat.md',
    created_at: '2026-10-26T10:00:00Z',
    modified_at: '2026-10-26T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: OTHER_UNIVERSE_ID,
    }),
  };

  const docs: DocumentMetadata[] = [
    charDoc,
    unintroducedCharDoc,
    nationDoc,
    locationDoc,
    unassignedDoc,
    foreignDoc,
  ];

  // Base plan setup
  let plan: Plan = {
    version: 1,
    revision: 1,
    universes: [universeA, universeB],
    books: [],
    entities: [
      { id: charDoc.id, universe_id: UNIVERSE_ID },
      { id: unintroducedCharDoc.id, universe_id: UNIVERSE_ID },
      { id: nationDoc.id, universe_id: UNIVERSE_ID },
      { id: locationDoc.id, universe_id: UNIVERSE_ID },
      { id: unassignedDoc.id, universe_id: UNIVERSE_ID },
      { id: foreignDoc.id, universe_id: OTHER_UNIVERSE_ID },
    ],
    nodes: [],
    relationships: [],
  };

  // Milestone 1 (M1): Year 2100 - Founding
  const m1: StoryNode = {
    id: 'node-m1',
    universe_id: UNIVERSE_ID,
    book_id: null,
    position: 0,
    title: 'Colonial Founding',
    description: 'The first orbital elevator is anchored.',
    era: '2100 CE',
    status: 'planned',
    questions: '',
    entity_ids: [charDoc.id, nationDoc.id, locationDoc.id],
    changes: [
      {
        id: 'c-m1-1',
        entity_id: charDoc.id,
        property_key: 'status',
        previous_value: null,
        new_value: 'alive',
        note: 'Elena arrives on the flagship',
      },
      {
        id: 'c-m1-2',
        entity_id: nationDoc.id,
        property_key: 'status',
        previous_value: null,
        new_value: 'active',
        note: 'Republic charter signed',
      },
      {
        id: 'c-m1-3',
        entity_id: locationDoc.id,
        property_key: 'status',
        previous_value: null,
        new_value: 'intact',
        note: 'Citadel construction finished',
      },
      {
        id: 'c-m1-4',
        entity_id: unintroducedCharDoc.id,
        property_key: 'status',
        previous_value: null,
        new_value: NOT_INTRODUCED_STATUS,
        note: 'Born two generations later',
      },
    ],
    relationship_changes: [],
    linked_event_id: null,
    origin_node_id: null,
    archived: false,
    created_at: '2026-10-26T10:00:00Z',
    updated_at: '2026-10-26T10:00:00Z',
  };

  // Milestone 2 (M2): Year 2125 - The Long Winter (Intermediate milestone with no changes to Elena)
  const m2: StoryNode = {
    id: 'node-m2',
    universe_id: UNIVERSE_ID,
    book_id: null,
    position: 1,
    title: 'The Long Winter',
    description: 'Solar flare cuts off core trade.',
    era: '2125 CE',
    status: 'planned',
    questions: '',
    entity_ids: [nationDoc.id],
    changes: [
      {
        id: 'c-m2-1',
        entity_id: nationDoc.id,
        property_key: 'status',
        previous_value: 'active',
        new_value: 'contested',
        note: 'Ration riots break out across districts',
      },
      {
        id: 'c-m2-2',
        entity_id: locationDoc.id,
        property_key: 'status',
        previous_value: 'intact',
        new_value: 'damaged',
        note: 'Outer perimeter breached',
      },
    ],
    relationship_changes: [],
    linked_event_id: null,
    origin_node_id: null,
    archived: false,
    created_at: '2026-10-26T10:10:00Z',
    updated_at: '2026-10-26T10:10:00Z',
  };

  // Milestone 3 (M3): Year 2150 - The Fall
  const m3: StoryNode = {
    id: 'node-m3',
    universe_id: UNIVERSE_ID,
    book_id: null,
    position: 2,
    title: 'The Fall of Altair',
    description: 'Catastrophic reactor breach destroys the capital.',
    era: '2150 CE',
    status: 'written',
    questions: '',
    entity_ids: [charDoc.id, nationDoc.id, locationDoc.id],
    changes: [
      {
        id: 'c-m3-1',
        entity_id: charDoc.id,
        property_key: 'status',
        previous_value: 'alive',
        new_value: 'deceased',
        note: 'Sacrificed herself to seal the blast doors',
      },
      {
        id: 'c-m3-2',
        entity_id: nationDoc.id,
        property_key: 'status',
        previous_value: 'contested',
        new_value: 'collapsed',
        note: 'Dissolved into warlord factions',
      },
      {
        id: 'c-m3-3',
        entity_id: locationDoc.id,
        property_key: 'status',
        previous_value: 'damaged',
        new_value: 'ruined',
        note: 'Glassed by atomic blast',
      },
    ],
    relationship_changes: [],
    linked_event_id: null,
    origin_node_id: null,
    archived: false,
    created_at: '2026-10-26T10:20:00Z',
    updated_at: '2026-10-26T10:20:00Z',
  };

  // Milestone 4 (M4): Year 2200 - The Dark Age (Custom status and explicit unknown)
  const m4: StoryNode = {
    id: 'node-m4',
    universe_id: UNIVERSE_ID,
    book_id: null,
    position: 3,
    title: 'The Dark Age',
    description: 'Scavenger era in the ruins.',
    era: '2200 CE',
    status: 'planned',
    questions: '',
    entity_ids: [charDoc.id, locationDoc.id],
    changes: [
      {
        id: 'c-m4-1',
        entity_id: charDoc.id,
        property_key: 'status',
        previous_value: 'deceased',
        new_value: 'crystallized in stasis lore', // Custom author status!
        note: 'Pilgrims claim her consciousness survived in crystalline matrix',
      },
      {
        id: 'c-m4-2',
        entity_id: locationDoc.id,
        property_key: 'status',
        previous_value: 'ruined',
        new_value: null, // Explicitly unknown / historical record destroyed!
        note: 'Radiation storms obscure satellite survey',
      },
    ],
    relationship_changes: [],
    linked_event_id: null,
    origin_node_id: null,
    archived: false,
    created_at: '2026-10-26T10:30:00Z',
    updated_at: '2026-10-26T10:30:00Z',
  };

  plan.nodes = [m1, m2, m3, m4];

  await t.test('1. Character alive at Milestone A (M1) and deceased at Milestone B (M3)', () => {
    const statesAtM1 = resolveUniverseStateAtMilestone(plan, docs, UNIVERSE_ID, m1.id);
    const elenaAtM1 = statesAtM1.find((s) => s.entityId === charDoc.id);
    assert.ok(elenaAtM1);
    assert.strictEqual(elenaAtM1.value, 'alive');
    assert.strictEqual(elenaAtM1.origin, 'explicit');
    assert.strictEqual(elenaAtM1.hasChangedAtThisMilestone, true);
    assert.strictEqual(elenaAtM1.displayLabel, 'Active / Alive');

    const statesAtM3 = resolveUniverseStateAtMilestone(plan, docs, UNIVERSE_ID, m3.id);
    const elenaAtM3 = statesAtM3.find((s) => s.entityId === charDoc.id);
    assert.ok(elenaAtM3);
    assert.strictEqual(elenaAtM3.value, 'deceased');
    assert.strictEqual(elenaAtM3.origin, 'explicit');
    assert.strictEqual(elenaAtM3.hasChangedAtThisMilestone, true);
    assert.strictEqual(elenaAtM3.displayLabel, 'Deceased');
  });

  await t.test('2. Earlier milestone remains alive after later death (no retroactive mutation)', () => {
    // Calling resolveUniverseStateAtMilestone for M1 AFTER M3 has been added/modified
    // must strictly resolve Elena as alive at M1.
    const statesAtM1 = resolveUniverseStateAtMilestone(plan, docs, UNIVERSE_ID, m1.id);
    const elenaAtM1 = statesAtM1.find((s) => s.entityId === charDoc.id);
    assert.ok(elenaAtM1);
    assert.strictEqual(elenaAtM1.value, 'alive');
    assert.strictEqual(elenaAtM1.origin, 'explicit');
    assert.strictEqual(elenaAtM1.sourceMilestoneId, m1.id);
  });

  await t.test('3. Inherited states persist across intermediate milestones', () => {
    // Elena Vance had no change recorded at M2. She must inherit 'alive' from M1.
    const statesAtM2 = resolveUniverseStateAtMilestone(plan, docs, UNIVERSE_ID, m2.id);
    const elenaAtM2 = statesAtM2.find((s) => s.entityId === charDoc.id);
    assert.ok(elenaAtM2);
    assert.strictEqual(elenaAtM2.value, 'alive');
    assert.strictEqual(elenaAtM2.origin, 'inherited');
    assert.strictEqual(elenaAtM2.hasChangedAtThisMilestone, false);
    assert.strictEqual(elenaAtM2.sourceMilestoneId, m1.id);
    assert.strictEqual(elenaAtM2.sourceMilestoneTitle, 'Colonial Founding');
    assert.strictEqual(elenaAtM2.sourceMilestoneEra, '2100 CE');
  });

  await t.test('4. Unknown remains distinct from unassigned', () => {
    const statesAtM4 = resolveUniverseStateAtMilestone(plan, docs, UNIVERSE_ID, m4.id);

    // Location at M4 was set to new_value: null -> explicitly 'unknown'
    const locAtM4 = statesAtM4.find((s) => s.entityId === locationDoc.id);
    assert.ok(locAtM4);
    assert.strictEqual(locAtM4.value, null);
    assert.strictEqual(locAtM4.origin, 'unknown');
    assert.strictEqual(locAtM4.displayLabel, 'Unknown');
    assert.strictEqual(locAtM4.hasChangedAtThisMilestone, true);

    // Artifact has NEVER been touched in any milestone -> strictly 'unassigned'
    const orbAtM4 = statesAtM4.find((s) => s.entityId === unassignedDoc.id);
    assert.ok(orbAtM4);
    assert.strictEqual(orbAtM4.value, null);
    assert.strictEqual(orbAtM4.origin, 'unassigned');
    assert.strictEqual(orbAtM4.displayLabel, 'Unassigned');
    assert.strictEqual(orbAtM4.sourceMilestoneId, undefined);
  });

  await t.test('5. Entity not yet introduced does not receive an invented historical status', () => {
    // unintroducedCharDoc had new_value: 'not_introduced' at M1
    const statesAtM1 = resolveUniverseStateAtMilestone(plan, docs, UNIVERSE_ID, m1.id);
    const unintroduced = statesAtM1.find((s) => s.entityId === unintroducedCharDoc.id);
    assert.ok(unintroduced);
    assert.strictEqual(unintroduced.value, NOT_INTRODUCED_STATUS);
    assert.strictEqual(unintroduced.origin, 'not_yet_introduced');
    assert.strictEqual(unintroduced.displayLabel, 'Not Yet Introduced');

    // It must NOT invent a vital status or inherit an active state
    assert.notStrictEqual(unintroduced.value, 'alive');
  });

  await t.test('6. Present-day profile attribute does not overwrite historical baseline', () => {
    // charDoc has character_fields.vital_status = 'deceased' in its current file
    // But at M1, it was explicitly recorded as 'alive'.
    // The historical state at M1 must be 'alive', with profile value supplied purely as context.
    const statesAtM1 = resolveUniverseStateAtMilestone(plan, docs, UNIVERSE_ID, m1.id);
    const elena = statesAtM1.find((s) => s.entityId === charDoc.id);
    assert.ok(elena);
    assert.strictEqual(elena.value, 'alive');
    assert.strictEqual(elena.currentProfileValue, 'deceased');
  });

  await t.test('7. Nation active then contested then collapsed', () => {
    const s1 = resolveUniverseStateAtMilestone(plan, docs, UNIVERSE_ID, m1.id).find((s) => s.entityId === nationDoc.id);
    const s2 = resolveUniverseStateAtMilestone(plan, docs, UNIVERSE_ID, m2.id).find((s) => s.entityId === nationDoc.id);
    const s3 = resolveUniverseStateAtMilestone(plan, docs, UNIVERSE_ID, m3.id).find((s) => s.entityId === nationDoc.id);

    assert.strictEqual(s1?.value, 'active');
    assert.strictEqual(s1?.displayLabel, 'Active / Thriving');

    assert.strictEqual(s2?.value, 'contested');
    assert.strictEqual(s2?.displayLabel, 'Contested / Besieged');

    assert.strictEqual(s3?.value, 'collapsed');
    assert.strictEqual(s3?.displayLabel, 'Collapsed / Extinct');
  });

  await t.test('8. Location intact then damaged then ruined', () => {
    const s1 = resolveUniverseStateAtMilestone(plan, docs, UNIVERSE_ID, m1.id).find((s) => s.entityId === locationDoc.id);
    const s2 = resolveUniverseStateAtMilestone(plan, docs, UNIVERSE_ID, m2.id).find((s) => s.entityId === locationDoc.id);
    const s3 = resolveUniverseStateAtMilestone(plan, docs, UNIVERSE_ID, m3.id).find((s) => s.entityId === locationDoc.id);

    assert.strictEqual(s1?.value, 'intact');
    assert.strictEqual(s1?.displayLabel, 'Intact / Inhabited');

    assert.strictEqual(s2?.value, 'damaged');
    assert.strictEqual(s2?.displayLabel, 'Damaged / Contested');

    assert.strictEqual(s3?.value, 'ruined');
    assert.strictEqual(s3?.displayLabel, 'Ruined');
  });

  await t.test('9. Custom statuses round-trip and resolve safely', () => {
    const statesAtM4 = resolveUniverseStateAtMilestone(plan, docs, UNIVERSE_ID, m4.id);
    const elena = statesAtM4.find((s) => s.entityId === charDoc.id);
    assert.ok(elena);
    assert.strictEqual(elena.value, 'crystallized in stasis lore');
    assert.strictEqual(elena.displayLabel, 'crystallized in stasis lore');

    const desc = getStatusDescriptor('characters', elena.value);
    assert.strictEqual(desc.isCustom, true);
    assert.strictEqual(desc.isPreset, false);
    assert.strictEqual(desc.label, 'crystallized in stasis lore');
  });

  await t.test('10. Conflicting expectations (previous_value mismatch) are detected non-destructively', () => {
    // Create an artificial conflict: milestone expects previous_value = 'in_hiding', but earlier record was 'alive'
    let conflictedPlan = assignMilestoneState(
      plan,
      m2.id,
      charDoc.id,
      'status',
      'deceased',
      'Contradictory report',
      'in_hiding' // mismatch with actual M1 value 'alive'
    );

    const states = resolveUniverseStateAtMilestone(conflictedPlan, docs, UNIVERSE_ID, m2.id);
    const elena = states.find((s) => s.entityId === charDoc.id);
    assert.ok(elena);
    assert.strictEqual(elena.value, 'deceased');
    assert.ok(elena.conflict);
    assert.ok(elena.conflict.includes('Expected in_hiding; earlier record was alive'));
  });

  await t.test('11. Predecessor ancestry validates ordering and rejects cross-universe ancestors', () => {
    const ancestry = validateMilestoneAncestry(plan, m3.id);
    assert.strictEqual(ancestry.valid, true);
    assert.strictEqual(ancestry.lineage.length, 3);
    assert.strictEqual(ancestry.lineage[0].id, m1.id);
    assert.strictEqual(ancestry.lineage[1].id, m2.id);
    assert.strictEqual(ancestry.lineage[2].id, m3.id);

    // Future milestone M4 is strictly excluded from M3 lineage
    assert.strictEqual(ancestry.lineage.some((n) => n.id === m4.id), false);

    // Non-existent or archived milestone returns invalid
    const invalidAncestry = validateMilestoneAncestry(plan, 'node-nonexistent');
    assert.strictEqual(invalidAncestry.valid, false);
    assert.ok(invalidAncestry.error);
  });

  await t.test('12. House and Universe boundaries remain enforced', () => {
    // foreignDoc belongs to OTHER_UNIVERSE_ID
    const states = resolveUniverseStateAtMilestone(plan, docs, UNIVERSE_ID, m1.id);
    // Foreign entity must NEVER appear in UNIVERSE_ID's state explorer
    assert.strictEqual(states.some((s) => s.entityId === foreignDoc.id), false);

    // Attempting to assign foreign entity into UNIVERSE_ID milestone throws error
    assert.throws(() => {
      assignMilestoneState(plan, m1.id, foreignDoc.id, 'status', 'alive');
    }, /Entity and Milestone must belong to the same Universe/);
  });

  await t.test('13. Explicit override clearing allows safe rollback to inherited predecessor', () => {
    // At M3, Elena died
    let updatedPlan = clearMilestoneState(plan, m3.id, charDoc.id, 'status');

    // After clearing M3 override, resolving Elena at M3 must fall back to inherited alive from M1
    const states = resolveUniverseStateAtMilestone(updatedPlan, docs, UNIVERSE_ID, m3.id);
    const elena = states.find((s) => s.entityId === charDoc.id);
    assert.ok(elena);
    assert.strictEqual(elena.value, 'alive');
    assert.strictEqual(elena.origin, 'inherited');
    assert.strictEqual(elena.sourceMilestoneId, m1.id);
  });

  await t.test('14. Milestone state diffing (compareMilestoneStates) correctly surfaces changes', () => {
    const diffs = compareMilestoneStates(plan, docs, UNIVERSE_ID, m1.id, m3.id);

    const elenaDiff = diffs.find((d) => d.entityId === charDoc.id);
    assert.ok(elenaDiff);
    assert.strictEqual(elenaDiff.hasDifference, true);
    assert.strictEqual(elenaDiff.stateA.value, 'alive');
    assert.strictEqual(elenaDiff.stateB.value, 'deceased');

    const orbDiff = diffs.find((d) => d.entityId === unassignedDoc.id);
    assert.ok(orbDiff);
    assert.strictEqual(orbDiff.hasDifference, false); // Both are unassigned
  });

  await t.test('15. Category presets and descriptors provide expected vocabularies', () => {
    const charPresets = getCategoryPresets('characters');
    assert.ok(charPresets.some((p) => p.key === 'alive'));
    assert.ok(charPresets.some((p) => p.key === 'deceased'));
    assert.ok(charPresets.some((p) => p.key === 'missing'));

    const factionPresets = getCategoryPresets('factions');
    assert.ok(factionPresets.some((p) => p.key === 'active'));
    assert.ok(factionPresets.some((p) => p.key === 'collapsed'));

    const locationPresets = getCategoryPresets('locations');
    assert.ok(locationPresets.some((p) => p.key === 'intact'));
    assert.ok(locationPresets.some((p) => p.key === 'ruined'));
  });
});
