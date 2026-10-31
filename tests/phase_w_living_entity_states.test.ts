import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DocumentMetadata } from '../src/types';
import type { Plan, Universe, StoryNode, Book, Relationship } from '../src/utils/thought';
import {
  uid,
  emptyPlan,
  newNode,
  insertNode,
  createBranch,
  timeline,
} from '../src/utils/thought';
import { convertDocumentToEchoEntity } from '../src/utils/echoLore';
import { buildEchoCatalog } from '../src/utils/echoContext';
import type { HouseRecord } from '../src/types';
import {
  resolveUniverseStateAtMilestone,
  assignMilestoneState,
  clearMilestoneState,
  validatePropertyKey,
  getEntityBaselinePropertyValue,
  resolveEntityLivingState,
  resolveMilestoneRelationships,
  assignMilestoneRelationshipChange,
  clearMilestoneRelationshipChange,
  severMilestoneRelationship,
  restoreMilestoneRelationship,
  RESTORED_RELATIONSHIP_LABEL,
  escapeLiteralPropertyValue,
  unescapeLiteralPropertyValue,
  escapeLiteralRelationshipLabel,
  unescapeLiteralRelationshipLabel,
  isClearedValue,
  isSeveredRelationship,
  isRestoredRelationship,
  CLEARED_PROPERTY_VALUE,
  SEVERED_RELATIONSHIP_LABEL,
  NOT_INTRODUCED_STATUS,
} from '../src/utils/stateEngine';

test('Living Entity States — Phase 1 & Phase 2: Historical Property & Relationship Resolution', async (t) => {
  const UNIVERSE_ID = 'univ-valoria-1';
  const HOUSE_ID = 'house-valoria-alpha';

  const universe: Universe = {
    id: UNIVERSE_ID,
    name: 'Valoria Realm',
    description: 'High fantasy world with living entity states',
  };

  // Canonical entity: Kael (baseline: Knight, Northern Guard, Crown Ally)
  const kaelDoc: DocumentMetadata = {
    id: 'char-kael-101',
    title: 'Kael the Brave',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: HOUSE_ID,
    path: '/vault/houses/house-valoria-alpha/lorebook/kael.md',
    created_at: '2026-10-31T10:00:00Z',
    modified_at: '2026-10-31T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_ID,
      character_fields: {
        role: 'Knight',
        occupation: 'Commander',
        affiliation: 'Northern Guard',
        residence: 'Fortress North',
        vital_status: 'alive',
      },
      attributes: [
        { id: 'attr-1', key: 'weapon', value: 'Sunsteel Blade' },
      ],
    }),
  };

  // Canonical entity: The Crown (Faction)
  const crownDoc: DocumentMetadata = {
    id: 'faction-crown-201',
    title: 'The Valorian Crown',
    doc_type: 'lorebook',
    tags: ['faction'],
    house_id: HOUSE_ID,
    path: '/vault/houses/house-valoria-alpha/lorebook/crown.md',
    created_at: '2026-10-31T10:00:00Z',
    modified_at: '2026-10-31T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'faction',
      universe_id: UNIVERSE_ID,
      faction_fields: {
        faction_type: 'Monarchy',
        leadership: 'King Alden',
        headquarters: 'Solaris Keep',
      },
    }),
  };

  // Canonical entity: Theron (Character)
  const theronDoc: DocumentMetadata = {
    id: 'char-theron-301',
    title: 'Theron the Outcast',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: HOUSE_ID,
    path: '/vault/houses/house-valoria-alpha/lorebook/theron.md',
    created_at: '2026-10-31T10:00:00Z',
    modified_at: '2026-10-31T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_ID,
      character_fields: {
        role: 'Rebel Leader',
        vital_status: 'alive',
      },
    }),
  };

  const allDocs: DocumentMetadata[] = [kaelDoc, crownDoc, theronDoc];

  // Base plan setup
  let plan: Plan = emptyPlan();
  plan.universes = [universe];
  plan.entities = allDocs.map((d) => ({ id: d.id, universe_id: UNIVERSE_ID }));

  // Create Milestones
  // Milestone 1 (M1): Year 100 - The Royal Oath
  const m1: StoryNode = {
    ...newNode(plan, UNIVERSE_ID, null),
    id: 'node-m1-year-100',
    title: 'The Royal Oath',
    era: 'Year 100',
    position: 0,
    description: 'Kael swears allegiance to the Northern Guard and Crown',
  };
  plan = insertNode(plan, m1);

  // Milestone 2 (M2): Year 120 - The Great Exile
  const m2: StoryNode = {
    ...newNode(plan, UNIVERSE_ID, null),
    id: 'node-m2-year-120',
    title: 'The Great Exile',
    era: 'Year 120',
    position: 1,
    description: 'Kael is falsely accused of treason and banished to the Ashen Wastes',
  };
  plan = insertNode(plan, m2);

  // Milestone 3 (M3): Year 150 - The Coronation
  const m3: StoryNode = {
    ...newNode(plan, UNIVERSE_ID, null),
    id: 'node-m3-year-150',
    title: 'The Coronation',
    era: 'Year 150',
    position: 2,
    description: 'Kael returns from exile and claims the Valorian Crown',
  };
  plan = insertNode(plan, m3);

  // Relationships:
  // r1: Kael serves The Crown (Baseline relationship starting at M1)
  const relKaelCrown: Relationship = {
    id: 'rel-kael-crown-1',
    universe_id: UNIVERSE_ID,
    book_id: null,
    source_id: kaelDoc.id,
    target_id: crownDoc.id,
    label: 'serves',
    description: 'Sworn vassal of the royal house',
    directed: true,
    context_node_id: m1.id,
    archived: false,
  };

  // r2: Kael allied with Theron (Activates later at M2)
  const relKaelTheron: Relationship = {
    id: 'rel-kael-theron-2',
    universe_id: UNIVERSE_ID,
    book_id: null,
    source_id: kaelDoc.id,
    target_id: theronDoc.id,
    label: 'allied with',
    description: 'Mutual pact in exile',
    directed: false,
    context_node_id: m2.id,
    archived: false,
  };

  plan.relationships = [relKaelCrown, relKaelTheron];

  // ==========================================================================
  // Phase 1 Tests: Historical Property Resolution
  // ==========================================================================

  await t.test('1. Baseline property extraction from entity document', () => {
    assert.equal(getEntityBaselinePropertyValue(kaelDoc, 'role'), 'Knight');
    assert.equal(getEntityBaselinePropertyValue(kaelDoc, 'character.role'), 'Knight');
    assert.equal(getEntityBaselinePropertyValue(kaelDoc, 'affiliation'), 'Northern Guard');
    assert.equal(getEntityBaselinePropertyValue(kaelDoc, 'weapon'), 'Sunsteel Blade');
    assert.equal(getEntityBaselinePropertyValue(kaelDoc, 'attribute.weapon'), 'Sunsteel Blade');
    assert.equal(getEntityBaselinePropertyValue(kaelDoc, 'nonexistent_key'), null);
  });

  await t.test('2. Property key validation prevents invalid syntax or control characters', () => {
    assert.equal(validatePropertyKey('role').valid, true);
    assert.equal(validatePropertyKey('character.role').valid, true);
    assert.equal(validatePropertyKey('attribute.magic-affinity').valid, true);
    assert.equal(validatePropertyKey('').valid, false);
    assert.equal(validatePropertyKey('   ').valid, false);
    assert.equal(validatePropertyKey('bad key with spaces').valid, false);
    assert.equal(validatePropertyKey('bad$char').valid, false);
    assert.equal(validatePropertyKey('a'.repeat(129)).valid, false);
  });

  await t.test('3. Baseline inheritance at M1 when no milestone overrides exist', () => {
    const living = resolveEntityLivingState(plan, allDocs, UNIVERSE_ID, m1.id, kaelDoc.id);
    assert.ok(living);
    assert.equal(living.entityId, kaelDoc.id);
    assert.equal(living.milestoneId, m1.id);
    assert.equal(living.isIntroduced, true);

    const roleProp = living.properties.get('role');
    assert.ok(roleProp);
    assert.equal(roleProp.value, 'Knight');
    assert.equal(roleProp.origin, 'baseline');
    assert.equal(roleProp.hasChangedAtThisMilestone, false);

    const affilProp = living.properties.get('affiliation');
    assert.ok(affilProp);
    assert.equal(affilProp.value, 'Northern Guard');
    assert.equal(affilProp.origin, 'baseline');
  });

  await t.test('4. Explicit property override at M2 and downstream inheritance at M3', () => {
    // Override role at M2: Kael becomes 'Exile'
    plan = assignMilestoneState(plan, m2.id, kaelDoc.id, 'role', 'Exile', 'Exiled after the trial');

    // M1 should remain baseline 'Knight'
    const livingM1 = resolveEntityLivingState(plan, allDocs, UNIVERSE_ID, m1.id, kaelDoc.id);
    assert.equal(livingM1?.properties.get('role')?.value, 'Knight');
    assert.equal(livingM1?.properties.get('role')?.origin, 'baseline');

    // M2 should have explicit 'Exile'
    const livingM2 = resolveEntityLivingState(plan, allDocs, UNIVERSE_ID, m2.id, kaelDoc.id);
    assert.equal(livingM2?.properties.get('role')?.value, 'Exile');
    assert.equal(livingM2?.properties.get('role')?.origin, 'explicit');
    assert.equal(livingM2?.properties.get('role')?.hasChangedAtThisMilestone, true);
    assert.equal(livingM2?.properties.get('role')?.sourceMilestoneId, m2.id);

    // M3 should inherit 'Exile' from M2
    const livingM3 = resolveEntityLivingState(plan, allDocs, UNIVERSE_ID, m3.id, kaelDoc.id);
    assert.equal(livingM3?.properties.get('role')?.value, 'Exile');
    assert.equal(livingM3?.properties.get('role')?.origin, 'inherited');
    assert.equal(livingM3?.properties.get('role')?.hasChangedAtThisMilestone, false);
    assert.equal(livingM3?.properties.get('role')?.sourceMilestoneId, m2.id);
  });

  await t.test('5. Explicit attribute clearing at M2 masks baseline value', () => {
    // Clear affiliation at M2 (stripped of Northern Guard title)
    plan = assignMilestoneState(
      plan,
      m2.id,
      kaelDoc.id,
      'affiliation',
      CLEARED_PROPERTY_VALUE,
      'Stripped of ranks and titles'
    );

    const livingM2 = resolveEntityLivingState(plan, allDocs, UNIVERSE_ID, m2.id, kaelDoc.id);
    const affilPropM2 = livingM2?.properties.get('affiliation');
    assert.ok(affilPropM2);
    assert.equal(affilPropM2.value, null);
    assert.equal(affilPropM2.displayLabel, 'Cleared');
    assert.equal(affilPropM2.origin, 'cleared');
    assert.equal(affilPropM2.hasChangedAtThisMilestone, true);

    // M3 also reflects the cleared affiliation
    const livingM3 = resolveEntityLivingState(plan, allDocs, UNIVERSE_ID, m3.id, kaelDoc.id);
    const affilPropM3 = livingM3?.properties.get('affiliation');
    assert.equal(affilPropM3?.value, null);
    assert.equal(affilPropM3?.origin, 'inherited');
  });

  await t.test('6. Removing an override at M2 restores inheritance from baseline', () => {
    // Remove the 'role' override at M2
    plan = clearMilestoneState(plan, m2.id, kaelDoc.id, 'role');

    // Both M2 and M3 now inherit baseline 'Knight'
    const livingM2 = resolveEntityLivingState(plan, allDocs, UNIVERSE_ID, m2.id, kaelDoc.id);
    assert.equal(livingM2?.properties.get('role')?.value, 'Knight');
    assert.equal(livingM2?.properties.get('role')?.origin, 'baseline');

    const livingM3 = resolveEntityLivingState(plan, allDocs, UNIVERSE_ID, m3.id, kaelDoc.id);
    assert.equal(livingM3?.properties.get('role')?.value, 'Knight');
    assert.equal(livingM3?.properties.get('role')?.origin, 'baseline');

    // Re-apply M2 role override for subsequent tests
    plan = assignMilestoneState(plan, m2.id, kaelDoc.id, 'role', 'Exile', 'Exiled');
    // And M3 role override: 'King'
    plan = assignMilestoneState(plan, m3.id, kaelDoc.id, 'role', 'King', 'Crowned King');
  });

  await t.test('7. Alternate branch divergence inherits divergence point and isolates branch changes', () => {
    // Create an alternate branch diverging at M2 ("Timeline of the Rebel King")
    const branchRes = createBranch(plan, UNIVERSE_ID, 'Rebel King Continuity', m2.id);
    plan = branchRes.plan;
    const branchId = branchRes.branch.id;

    // Add milestone B1 on the branch
    const b1: StoryNode = {
      ...newNode(plan, UNIVERSE_ID, null, undefined, branchId),
      id: 'node-b1-rebel-ascent',
      title: 'The Rebel Ascent',
      era: 'Year 130 (Alt)',
      branch_id: branchId,
    };
    plan = insertNode(plan, b1);

    // On the branch at B1, Kael becomes 'Warlord'
    plan = assignMilestoneState(plan, b1.id, kaelDoc.id, 'role', 'Warlord', 'Leads the Ashen Horde');

    // On the branch at B1, Kael is 'Warlord'
    const livingB1 = resolveEntityLivingState(plan, allDocs, UNIVERSE_ID, b1.id, kaelDoc.id);
    assert.equal(livingB1?.properties.get('role')?.value, 'Warlord');
    assert.equal(livingB1?.properties.get('role')?.origin, 'explicit');
    assert.equal(livingB1?.continuityName, 'Alternate: Rebel King Continuity');

    // Canonical M3 remains 'King' (isolated from branch B1 change)
    const livingM3 = resolveEntityLivingState(plan, allDocs, UNIVERSE_ID, m3.id, kaelDoc.id);
    assert.equal(livingM3?.properties.get('role')?.value, 'King');
    assert.equal(livingM3?.continuityName, 'Canonical Timeline');
  });

  await t.test('8. Same-date milestone ordering tie-breaks deterministically', () => {
    // Add two milestones with identical era string 'Year 200'
    const s1: StoryNode = {
      ...newNode(plan, UNIVERSE_ID, null),
      id: 'node-same-date-1',
      title: 'Festival of Light',
      era: 'Year 200',
      position: 10,
    };
    const s2: StoryNode = {
      ...newNode(plan, UNIVERSE_ID, null),
      id: 'node-same-date-2',
      title: 'The Eclipse',
      era: 'Year 200',
      position: 11,
    };
    plan = insertNode(plan, s1);
    plan = insertNode(plan, s2);

    plan = assignMilestoneState(plan, s1.id, kaelDoc.id, 'residence', 'Solaris Palace');
    plan = assignMilestoneState(plan, s2.id, kaelDoc.id, 'residence', 'Moon Temple');

    const livingS1 = resolveEntityLivingState(plan, allDocs, UNIVERSE_ID, s1.id, kaelDoc.id);
    assert.equal(livingS1?.properties.get('residence')?.value, 'Solaris Palace');

    const livingS2 = resolveEntityLivingState(plan, allDocs, UNIVERSE_ID, s2.id, kaelDoc.id);
    assert.equal(livingS2?.properties.get('residence')?.value, 'Moon Temple');
  });

  await t.test('9. Conflict detection flags mismatch with previous_value expectation', () => {
    const s3: StoryNode = {
      ...newNode(plan, UNIVERSE_ID, null),
      id: 'node-conflict-test',
      title: 'Unexpected Shift',
      era: 'Year 205',
      position: 12,
    };
    plan = insertNode(plan, s3);

    // Kael's residence at s2 was 'Moon Temple'. Author sets previous_value = 'Solaris Palace'
    plan = assignMilestoneState(
      plan,
      s3.id,
      kaelDoc.id,
      'residence',
      'Hermit Cave',
      'Conflicted record',
      'Solaris Palace' // Expecting Solaris Palace, but earlier record was Moon Temple!
    );

    const livingS3 = resolveEntityLivingState(plan, allDocs, UNIVERSE_ID, s3.id, kaelDoc.id);
    const resProp = livingS3?.properties.get('residence');
    assert.ok(resProp?.conflict);
    assert.match(resProp.conflict!, /Expected Solaris Palace; earlier record was Moon Temple/);
    assert.ok(livingS3?.warnings.length! > 0);
  });

  await t.test('10. Missing or archived milestone returns null gracefully without crash', () => {
    const resMissing = resolveEntityLivingState(plan, allDocs, UNIVERSE_ID, 'nonexistent-milestone', kaelDoc.id);
    assert.equal(resMissing, null);
  });

  // ==========================================================================
  // Phase 2 Tests: Historical Relationship Evolution
  // ==========================================================================

  await t.test('11. Relationship activation: context_node_id controls milestone visibility', () => {
    // relKaelTheron has context_node_id: m2.
    // At M1, Kael and Theron have not met yet.
    const relsM1 = resolveMilestoneRelationships(plan, allDocs, UNIVERSE_ID, m1.id, kaelDoc.id);
    const theronRelM1 = relsM1.find((r) => r.relationshipId === relKaelTheron.id);
    assert.equal(theronRelM1, undefined); // Inactive before context_node_id

    // At M2, Kael and Theron alliance activates!
    const relsM2 = resolveMilestoneRelationships(plan, allDocs, UNIVERSE_ID, m2.id, kaelDoc.id);
    const theronRelM2 = relsM2.find((r) => r.relationshipId === relKaelTheron.id);
    assert.ok(theronRelM2);
    assert.equal(theronRelM2.isActive, true);
    assert.equal(theronRelM2.currentLabel, 'allied with');
    assert.equal(theronRelM2.origin, 'activated_here');
    assert.equal(theronRelM2.targetTitle, 'Theron the Outcast');
  });

  await t.test('12. Relationship modification: changing vassal into enemy at M2', () => {
    // At M1, Kael serves Crown
    const relsM1 = resolveMilestoneRelationships(plan, allDocs, UNIVERSE_ID, m1.id, kaelDoc.id);
    const crownRelM1 = relsM1.find((r) => r.relationshipId === relKaelCrown.id);
    assert.ok(crownRelM1);
    assert.equal(crownRelM1.currentLabel, 'serves');
    assert.equal(crownRelM1.relationTypeFromSource, 'serves'); // Perspective for unmapped custom label

    // At M2, Kael is exiled and becomes an enemy of Crown
    plan = assignMilestoneRelationshipChange(
      plan,
      m2.id,
      relKaelCrown.id,
      'enemy of',
      'Crown sentenced Kael to death'
    );

    // M1 remains 'serves' (past history is never rewritten)
    const relsM1Check = resolveMilestoneRelationships(plan, allDocs, UNIVERSE_ID, m1.id, kaelDoc.id);
    assert.equal(relsM1Check.find((r) => r.relationshipId === relKaelCrown.id)?.currentLabel, 'serves');

    // M2 is now 'enemy of'
    const relsM2 = resolveMilestoneRelationships(plan, allDocs, UNIVERSE_ID, m2.id, kaelDoc.id);
    const crownRelM2 = relsM2.find((r) => r.relationshipId === relKaelCrown.id);
    assert.ok(crownRelM2);
    assert.equal(crownRelM2.currentLabel, 'enemy of');
    assert.equal(crownRelM2.origin, 'modified_here');
    assert.equal(crownRelM2.sourceMilestoneId, m2.id);
  });

  await t.test('13. Reciprocal relationship consistency', () => {
    // When resolving from Kael's perspective at M2:
    const kaelRelsM2 = resolveMilestoneRelationships(plan, allDocs, UNIVERSE_ID, m2.id, kaelDoc.id);
    const kaelPerspective = kaelRelsM2.find((r) => r.relationshipId === relKaelCrown.id);
    assert.ok(kaelPerspective);
    assert.equal(kaelPerspective.relationTypeFromSource, 'Rival of');

    // When resolving from Crown's perspective at M2:
    const crownRelsM2 = resolveMilestoneRelationships(plan, allDocs, UNIVERSE_ID, m2.id, crownDoc.id);
    const crownPerspective = crownRelsM2.find((r) => r.relationshipId === relKaelCrown.id);
    assert.ok(crownPerspective);
    assert.equal(crownPerspective.relationTypeFromTarget, 'Rival of');
  });

  await t.test('14. Relationship severance at M3: alliance dissolved', () => {
    // At M3, Theron and Kael part ways, severing their alliance
    plan = severMilestoneRelationship(
      plan,
      m3.id,
      relKaelTheron.id,
      'Theron refused to enter the capital'
    );

    const relsM3 = resolveMilestoneRelationships(plan, allDocs, UNIVERSE_ID, m3.id, kaelDoc.id);
    const theronRelM3 = relsM3.find((r) => r.relationshipId === relKaelTheron.id);
    assert.ok(theronRelM3);
    assert.equal(theronRelM3.isSevered, true);
    assert.equal(theronRelM3.isActive, false);
    assert.equal(theronRelM3.currentLabel, null);
    assert.equal(theronRelM3.origin, 'severed_here');

    // Earlier milestone M2 still shows active alliance
    const relsM2 = resolveMilestoneRelationships(plan, allDocs, UNIVERSE_ID, m2.id, kaelDoc.id);
    assert.equal(relsM2.find((r) => r.relationshipId === relKaelTheron.id)?.isActive, true);
  });

  await t.test('15. Clearing relationship change restores inherited relationship state', () => {
    // Clear severance at M3
    plan = clearMilestoneRelationshipChange(plan, m3.id, relKaelTheron.id);

    const relsM3 = resolveMilestoneRelationships(plan, allDocs, UNIVERSE_ID, m3.id, kaelDoc.id);
    const theronRelM3 = relsM3.find((r) => r.relationshipId === relKaelTheron.id);
    assert.ok(theronRelM3);
    assert.equal(theronRelM3.isSevered, false);
    assert.equal(theronRelM3.isActive, true);
    assert.equal(theronRelM3.currentLabel, 'allied with');
    assert.equal(theronRelM3.origin, 'inherited');
  });

  // ==========================================================================
  // Phase 3 Tests: Echo E3 and Historical Dossier Integration
  // ==========================================================================

  const houses: HouseRecord[] = [
    {
      id: HOUSE_ID,
      name: 'House Alpha',
      color: 'gold',
      icon: 'shield',
      created_at: '2026-10-31T00:00:00Z',
      updated_at: '2026-10-31T00:00:00Z',
      universe_ids: [UNIVERSE_ID],
      enabled_studios: ['lorebook'],
      manuscript_tools_enabled: true,
      archived: false,
    },
  ];

  await t.test('16. Echo dossier at M1 resolves baseline profile and relationships without mutation', () => {
    const echoKaelM1 = convertDocumentToEchoEntity(kaelDoc, allDocs, plan, universe.name, undefined, m1.id);
    assert.equal(echoKaelM1.id, kaelDoc.id);
    assert.equal(echoKaelM1.guidedAttributes['Narrative Role'], 'Knight');
    assert.equal(echoKaelM1.guidedAttributes['Affiliation'], 'Northern Guard');
    assert.equal(echoKaelM1.guidedAttributes['Residence'], 'Fortress North');

    // Relationships at M1: Kael serves Crown
    assert.equal(echoKaelM1.relationships.length, 1);
    assert.equal(echoKaelM1.relationships[0].targetId, crownDoc.id);
    assert.equal(echoKaelM1.relationships[0].relationType, 'serves');

    // Canonical frontmatter was not mutated
    assert.equal(JSON.parse(kaelDoc.metadata_json!).character_fields.role, 'Knight');
  });

  await t.test('17. Echo dossier at M2 resolves historical overrides and relationship modifications', () => {
    const echoKaelM2 = convertDocumentToEchoEntity(kaelDoc, allDocs, plan, universe.name, undefined, m2.id);
    assert.equal(echoKaelM2.guidedAttributes['Narrative Role'], 'Exile');
    // Affiliation was explicitly cleared at M2
    assert.equal(echoKaelM2.guidedAttributes['Affiliation'], undefined);

    // Relationships at M2: Kael is enemy of Crown, allied with Theron
    assert.equal(echoKaelM2.relationships.length, 2);
    const crownRel = echoKaelM2.relationships.find((r) => r.targetId === crownDoc.id);
    assert.ok(crownRel);
    assert.equal(crownRel.relationType, 'Rival of');

    const theronRel = echoKaelM2.relationships.find((r) => r.targetId === theronDoc.id);
    assert.ok(theronRel);
    assert.equal(theronRel.relationType, 'Allied with');
  });

  await t.test('18. Echo Catalog projectEntity projects historical state for same entity at different milestones', () => {
    const catalog = buildEchoCatalog(allDocs, UNIVERSE_ID, HOUSE_ID, plan, houses);

    const projectedM1 = catalog.projectEntity(kaelDoc.id, m1.id);
    assert.ok(projectedM1);
    assert.equal(projectedM1.guidedAttributes['Narrative Role'], 'Knight');

    const projectedM2 = catalog.projectEntity(kaelDoc.id, m2.id);
    assert.ok(projectedM2);
    assert.equal(projectedM2.guidedAttributes['Narrative Role'], 'Exile');

    const projectedM3 = catalog.projectEntity(kaelDoc.id, m3.id);
    assert.ok(projectedM3);
    assert.equal(projectedM3.guidedAttributes['Narrative Role'], 'King');
  });

  await t.test('19. Nested Echo exploration preserves chapter historical milestone context', () => {
    const catalog = buildEchoCatalog(allDocs, UNIVERSE_ID, HOUSE_ID, plan, houses);

    // When inspecting Kael in M2 chapter, author clicks Theron in relationships
    const projectedTheronM2 = catalog.projectEntity(theronDoc.id, m2.id);
    assert.ok(projectedTheronM2);
    assert.equal(projectedTheronM2.id, theronDoc.id);
    // Theron's reciprocal relationship to Kael at M2 is active
    const kaelLink = projectedTheronM2.relationships.find((r) => r.targetId === kaelDoc.id);
    assert.ok(kaelLink);
    assert.equal(kaelLink.relationType, 'Allied with');
  });

  await t.test('20. Persistent Echo E3 reference targets canonical UUID and resolves milestone state on demand', () => {
    // A persistent pronoun binding "He" -> Kael UUID
    const boundPronounRef = {
      id: 'ref-he-101',
      targetId: kaelDoc.id, // Strictly canonical UUID
      from: 10,
      to: 12,
      matchedText: 'He',
      status: 'active' as const,
    };

    assert.equal(boundPronounRef.targetId, kaelDoc.id);

    // Chapter 1 is in Year 100 (M1)
    const catalog = buildEchoCatalog(allDocs, UNIVERSE_ID, HOUSE_ID, plan, houses);
    const resolvedInChapter1 = catalog.projectEntity(boundPronounRef.targetId, m1.id);
    assert.equal(resolvedInChapter1?.guidedAttributes['Narrative Role'], 'Knight');

    // Chapter 2 is in Year 120 (M2)
    const resolvedInChapter2 = catalog.projectEntity(boundPronounRef.targetId, m2.id);
    assert.equal(resolvedInChapter2?.guidedAttributes['Narrative Role'], 'Exile');

    // Chapter 3 is in Year 150 (M3)
    const resolvedInChapter3 = catalog.projectEntity(boundPronounRef.targetId, m3.id);
    assert.equal(resolvedInChapter3?.guidedAttributes['Narrative Role'], 'King');

    // The reference itself was never mutated or duplicated
    assert.equal(boundPronounRef.targetId, kaelDoc.id);
  });

  await t.test('21. Serialization & roundtrip portability preserves living states and severed relationships', () => {
    // Roundtrip serialize/deserialize plan
    const serialized = JSON.stringify(plan);
    const deserializedPlan: Plan = JSON.parse(serialized);

    // Verify M2 living state survives JSON round-trip
    const stateM2 = resolveEntityLivingState(deserializedPlan, allDocs, UNIVERSE_ID, m2.id, kaelDoc.id);
    assert.equal(stateM2.properties.get('role')?.value, 'Exile');
    assert.equal(stateM2.properties.get('affiliation')?.origin, 'cleared');
    assert.equal(stateM2.properties.get('affiliation')?.value, null);

    // Sever relationship at M3 and verify round-trip persistence
    const planWithSeverance = severMilestoneRelationship(
      deserializedPlan,
      m3.id,
      relKaelTheron.id,
      'Severed across serialization'
    );
    const serializedWithSeverance = JSON.stringify(planWithSeverance);
    const reloadedPlan: Plan = JSON.parse(serializedWithSeverance);

    const relsM3 = resolveMilestoneRelationships(reloadedPlan, allDocs, UNIVERSE_ID, m3.id, kaelDoc.id);
    const theronRel = relsM3.find((r) => r.relationshipId === relKaelTheron.id);
    assert.ok(theronRel);
    assert.equal(theronRel.isActive, false);
    assert.equal(theronRel.isSevered, true);
  });

  await t.test('22. Separate Copy UUID remapping preserves living state mechanics under new identities', () => {
    // Simulate UUID remapping in Portable Universe import
    const idMap = new Map<string, string>([
      [UNIVERSE_ID, 'u-cloned-999'],
      [kaelDoc.id, 'doc-cloned-kael'],
      [crownDoc.id, 'doc-cloned-crown'],
      [m1.id, 'm-cloned-100'],
      [m2.id, 'm-cloned-120'],
      [relKaelCrown.id, 'rel-cloned-kael-crown'],
    ]);

    const remappedPlan: Plan = {
      ...plan,
      universes: plan.universes.map((u) => (u.id === UNIVERSE_ID ? { ...u, id: idMap.get(u.id)! } : u)),
      entities: plan.entities.map((e) => (idMap.has(e.id) ? { ...e, id: idMap.get(e.id)! } : e)),
      relationships: plan.relationships.map((r) => ({
        ...r,
        id: idMap.get(r.id) || r.id,
        universe_id: idMap.get(r.universe_id) || r.universe_id,
        source_id: idMap.get(r.source_id) || r.source_id,
        target_id: idMap.get(r.target_id) || r.target_id,
        context_node_id: r.context_node_id ? idMap.get(r.context_node_id) || r.context_node_id : null,
      })),
      nodes: plan.nodes.map((n) => ({
        ...n,
        id: idMap.get(n.id) || n.id,
        universe_id: idMap.get(n.universe_id) || n.universe_id,
        entity_ids: n.entity_ids.map((eid) => idMap.get(eid) || eid),
        changes: n.changes.map((c) => ({
          ...c,
          id: `c-cloned-${c.id}`,
          entity_id: idMap.get(c.entity_id) || c.entity_id,
        })),
        relationship_changes: n.relationship_changes.map((rc) => ({
          ...rc,
          relationship_id: idMap.get(rc.relationship_id) || rc.relationship_id,
        })),
      })),
    };

    const remappedDocs: DocumentMetadata[] = [
      {
        ...kaelDoc,
        id: idMap.get(kaelDoc.id)!,
        metadata_json: JSON.stringify({
          ...JSON.parse(kaelDoc.metadata_json!),
          universe_id: 'u-cloned-999',
        }),
      },
      {
        ...crownDoc,
        id: idMap.get(crownDoc.id)!,
        metadata_json: JSON.stringify({
          ...JSON.parse(crownDoc.metadata_json!),
          universe_id: 'u-cloned-999',
        }),
      },
    ];

    // Verify living state resolution on remapped entity at M2
    const remappedStateM2 = resolveEntityLivingState(
      remappedPlan,
      remappedDocs,
      'u-cloned-999',
      'm-cloned-120',
      'doc-cloned-kael'
    );
    assert.ok(remappedStateM2);
    assert.equal(remappedStateM2.properties.get('role')?.value, 'Exile');
    assert.equal(remappedStateM2.properties.get('affiliation')?.origin, 'cleared');

    // Verify modified relationship on remapped relationship at M2
    const remappedRelsM2 = resolveMilestoneRelationships(
      remappedPlan,
      remappedDocs,
      'u-cloned-999',
      'm-cloned-120',
      'doc-cloned-kael'
    );
    const remappedCrown = remappedRelsM2.find((r) => r.targetId === 'doc-cloned-crown');
    assert.ok(remappedCrown);
    assert.equal(remappedCrown.isActive, true);
    assert.equal(remappedCrown.relationTypeFromSource, 'Rival of');
  });

  await t.test('23. Baseline purity invariant: canonical frontmatter and prose remain immutable under living state overrides', () => {
    // Before any changes, record baseline frontmatter and prose
    const originalMetadataJson = kaelDoc.metadata_json;
    const parsedOriginal = JSON.parse(originalMetadataJson!);

    // Ensure living state resolution and thought mutations did not mutate kaelDoc object or frontmatter
    assert.equal(kaelDoc.metadata_json, originalMetadataJson);
    assert.equal(parsedOriginal.character_fields.role, 'Knight');
    assert.equal(parsedOriginal.character_fields.affiliation, 'Northern Guard');

    // getEntityBaselinePropertyValue directly returns untouched baseline
    assert.equal(getEntityBaselinePropertyValue(kaelDoc, 'role'), 'Knight');
    assert.equal(getEntityBaselinePropertyValue(kaelDoc, 'affiliation'), 'Northern Guard');

    // Baseline resolution at M1 (no overrides) returns baseline values with 'baseline' origin
    const baselineResolution = resolveEntityLivingState(plan, allDocs, UNIVERSE_ID, m1.id, kaelDoc.id);
    assert.ok(baselineResolution);
    assert.equal(baselineResolution.properties.get('role')?.value, 'Knight');
    assert.equal(baselineResolution.properties.get('role')?.origin, 'baseline');
    assert.equal(baselineResolution.properties.get('affiliation')?.value, 'Northern Guard');
    assert.equal(baselineResolution.properties.get('affiliation')?.origin, 'baseline');
  });

  await t.test('24. Downstream relationship restoration at MB after severance at MA (F-01)', () => {
    let testPlan = emptyPlan();
    testPlan = {
      ...testPlan,
      universes: [universe],
      entities: [
        { id: kaelDoc.id, universe_id: UNIVERSE_ID },
        { id: crownDoc.id, universe_id: UNIVERSE_ID },
      ],
    };

    // Timeline: m0 -> mA -> mB -> mC (create then insert sequentially to advance positions)
    const m0 = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'M0 — Era of Peace' };
    testPlan = insertNode(testPlan, m0);
    const mA = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'MA — War Begins' };
    testPlan = insertNode(testPlan, mA);
    const mB = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'MB — Treaty Signed' };
    testPlan = insertNode(testPlan, mB);
    const mC = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'MC — Golden Era' };
    testPlan = insertNode(testPlan, mC);

    const relKaelCrownTest: Relationship = {
      id: 'rel-kael-crown-f01',
      universe_id: UNIVERSE_ID,
      book_id: null,
      source_id: kaelDoc.id,
      target_id: crownDoc.id,
      label: 'Royal Champion',
      description: 'Sworn defender of the throne',
      directed: true,
      context_node_id: m0.id,
      archived: false,
    };
    testPlan = { ...testPlan, relationships: [relKaelCrownTest] };

    // At M0, relationship is active
    const relsM0 = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, m0.id, kaelDoc.id);
    const relM0 = relsM0.find((r) => r.relationshipId === relKaelCrownTest.id);
    assert.ok(relM0);
    assert.equal(relM0.isActive, true);
    assert.equal(relM0.isSevered, false);
    assert.equal(relM0.relationTypeFromSource, 'Royal Champion');

    // Sever at MA
    testPlan = severMilestoneRelationship(testPlan, mA.id, relKaelCrownTest.id, 'War declared, champion exiled');

    // At MA: severed here
    const relsMA = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, mA.id, kaelDoc.id);
    const relMA = relsMA.find((r) => r.relationshipId === relKaelCrownTest.id);
    assert.ok(relMA);
    assert.equal(relMA.isActive, false);
    assert.equal(relMA.isSevered, true);
    assert.equal(relMA.origin, 'severed_here');
    assert.equal(relMA.note, 'War declared, champion exiled');

    // At MB before restoration: inherited severance
    const relsMBBefore = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, mB.id, kaelDoc.id);
    const relMBBefore = relsMBBefore.find((r) => r.relationshipId === relKaelCrownTest.id);
    assert.ok(relMBBefore);
    assert.equal(relMBBefore.isActive, false);
    assert.equal(relMBBefore.isSevered, true);
    assert.equal(relMBBefore.origin, 'inherited');

    // Explicitly restore at MB
    testPlan = restoreMilestoneRelationship(testPlan, mB.id, relKaelCrownTest.id, undefined, 'Reconciled under treaty');

    // At MB after restoration: active, restored_here
    const relsMB = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, mB.id, kaelDoc.id);
    const relMB = relsMB.find((r) => r.relationshipId === relKaelCrownTest.id);
    assert.ok(relMB);
    assert.equal(relMB.isActive, true);
    assert.equal(relMB.isSevered, false);
    assert.equal(relMB.origin, 'restored_here');
    assert.equal(relMB.relationTypeFromSource, 'Royal Champion');

    // At MC downstream: inherits restored active state
    const relsMC = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, mC.id, kaelDoc.id);
    const relMC = relsMC.find((r) => r.relationshipId === relKaelCrownTest.id);
    assert.ok(relMC);
    assert.equal(relMC.isActive, true);
    assert.equal(relMC.isSevered, false);
    assert.equal(relMC.origin, 'inherited');
    assert.equal(relMC.relationTypeFromSource, 'Royal Champion');

    // MA remains severed (not mutated by MB's restoration)
    const relsMARecheck = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, mA.id, kaelDoc.id);
    const relMARecheck = relsMARecheck.find((r) => r.relationshipId === relKaelCrownTest.id);
    assert.ok(relMARecheck);
    assert.equal(relMARecheck.isActive, false);
    assert.equal(relMARecheck.isSevered, true);
    assert.equal(relMARecheck.origin, 'severed_here');

    // M0 remains unaffected
    const relsM0Recheck = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, m0.id, kaelDoc.id);
    const relM0Recheck = relsM0Recheck.find((r) => r.relationshipId === relKaelCrownTest.id);
    assert.ok(relM0Recheck);
    assert.equal(relM0Recheck.isActive, true);
    assert.equal(relM0Recheck.isSevered, false);
  });

  await t.test('25. Sibling alternate branch diverging between MA and MB retains inherited severance', () => {
    let testPlan = emptyPlan();
    testPlan = {
      ...testPlan,
      universes: [universe],
      entities: [
        { id: kaelDoc.id, universe_id: UNIVERSE_ID },
        { id: crownDoc.id, universe_id: UNIVERSE_ID },
      ],
    };

    // Setup timeline: m0 -> mA
    const m0 = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'M0' };
    testPlan = insertNode(testPlan, m0);
    const mA = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'MA' };
    testPlan = insertNode(testPlan, mA);

    const rel: Relationship = {
      id: 'rel-branch-test',
      universe_id: UNIVERSE_ID,
      book_id: null,
      source_id: kaelDoc.id,
      target_id: crownDoc.id,
      label: 'Allied',
      description: '',
      directed: true,
      context_node_id: m0.id,
      archived: false,
    };
    testPlan = { ...testPlan, relationships: [rel] };

    // Sever at mA
    testPlan = severMilestoneRelationship(testPlan, mA.id, rel.id, 'War');

    // Create alternate branch diverging from mA
    const { plan: planWithBranch, branch: altBranch } = createBranch(testPlan, UNIVERSE_ID, 'Dark Timeline', mA.id);
    const mAlt = { ...newNode(planWithBranch, UNIVERSE_ID, null, undefined, altBranch.id), title: 'MAlt — Endless War' };
    const altPlan = insertNode(planWithBranch, mAlt);

    // On canonical continuity, add mB and restore relationship
    const mB = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'MB — Peace Treaty' };
    testPlan = insertNode(testPlan, mB);
    testPlan = restoreMilestoneRelationship(testPlan, mB.id, rel.id, undefined, 'Restored on canonical branch');

    // Canonical mB: active, restored_here
    const relsMB = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, mB.id, kaelDoc.id);
    const relMB = relsMB.find((r) => r.relationshipId === rel.id);
    assert.ok(relMB);
    assert.equal(relMB.isActive, true);
    assert.equal(relMB.origin, 'restored_here');

    // Alternate branch mAlt: still severed, inherited from mA!
    const relsMAlt = resolveMilestoneRelationships(altPlan, allDocs, UNIVERSE_ID, mAlt.id, kaelDoc.id);
    const relMAlt = relsMAlt.find((r) => r.relationshipId === rel.id);
    assert.ok(relMAlt);
    assert.equal(relMAlt.isActive, false);
    assert.equal(relMAlt.isSevered, true);
    assert.equal(relMAlt.origin, 'inherited');
  });

  await t.test('26. Redo of severance at MD after restoration transitions back to severed', () => {
    let testPlan = emptyPlan();
    testPlan = {
      ...testPlan,
      universes: [universe],
      entities: [
        { id: kaelDoc.id, universe_id: UNIVERSE_ID },
        { id: crownDoc.id, universe_id: UNIVERSE_ID },
      ],
    };

    // m0 -> mA (sever) -> mB (restore) -> mC (active) -> mD (sever again)
    const m0 = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'M0' };
    testPlan = insertNode(testPlan, m0);
    const mA = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'MA' };
    testPlan = insertNode(testPlan, mA);
    const mB = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'MB' };
    testPlan = insertNode(testPlan, mB);
    const mC = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'MC' };
    testPlan = insertNode(testPlan, mC);
    const mD = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'MD' };
    testPlan = insertNode(testPlan, mD);

    const rel: Relationship = {
      id: 'rel-cycle-test',
      universe_id: UNIVERSE_ID,
      book_id: null,
      source_id: kaelDoc.id,
      target_id: crownDoc.id,
      label: 'Defenders',
      description: '',
      directed: true,
      context_node_id: m0.id,
      archived: false,
    };
    testPlan = { ...testPlan, relationships: [rel] };

    // Sever at mA
    testPlan = severMilestoneRelationship(testPlan, mA.id, rel.id, 'First Betrayal');
    // Restore at mB
    testPlan = restoreMilestoneRelationship(testPlan, mB.id, rel.id, undefined, 'Forgiven');
    // Sever again at mD
    testPlan = severMilestoneRelationship(testPlan, mD.id, rel.id, 'Second Betrayal');

    // At mD: severed_here with 'Second Betrayal'
    const relsMD = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, mD.id, kaelDoc.id);
    const relMD = relsMD.find((r) => r.relationshipId === rel.id);
    assert.ok(relMD);
    assert.equal(relMD.isActive, false);
    assert.equal(relMD.isSevered, true);
    assert.equal(relMD.origin, 'severed_here');
    assert.equal(relMD.note, 'Second Betrayal');

    // At mC: remains active (inherited)
    const relsMC = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, mC.id, kaelDoc.id);
    const relMC = relsMC.find((r) => r.relationshipId === rel.id);
    assert.ok(relMC);
    assert.equal(relMC.isActive, true);
    assert.equal(relMC.origin, 'inherited');

    // At mB: remains restored_here
    const relsMB = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, mB.id, kaelDoc.id);
    const relMB = relsMB.find((r) => r.relationshipId === rel.id);
    assert.ok(relMB);
    assert.equal(relMB.isActive, true);
    assert.equal(relMB.origin, 'restored_here');

    // At mA: remains severed_here with 'First Betrayal'
    const relsMA = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, mA.id, kaelDoc.id);
    const relMA = relsMA.find((r) => r.relationshipId === rel.id);
    assert.ok(relMA);
    assert.equal(relMA.isActive, false);
    assert.equal(relMA.origin, 'severed_here');
    assert.equal(relMA.note, 'First Betrayal');
  });

  await t.test('27. Reciprocal consistency across severance, restoration, and redo from target perspective', () => {
    let testPlan = emptyPlan();
    testPlan = {
      ...testPlan,
      universes: [universe],
      entities: [
        { id: kaelDoc.id, universe_id: UNIVERSE_ID },
        { id: crownDoc.id, universe_id: UNIVERSE_ID },
      ],
    };

    // Check same timeline from crownDoc perspective
    const m0 = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'M0' };
    testPlan = insertNode(testPlan, m0);
    const mA = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'MA' };
    testPlan = insertNode(testPlan, mA);
    const mB = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'MB' };
    testPlan = insertNode(testPlan, mB);
    const mC = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'MC' };
    testPlan = insertNode(testPlan, mC);
    const mD = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'MD' };
    testPlan = insertNode(testPlan, mD);

    const rel: Relationship = {
      id: 'rel-recip-test',
      universe_id: UNIVERSE_ID,
      book_id: null,
      source_id: kaelDoc.id,
      target_id: crownDoc.id,
      label: 'Defender of',
      description: '',
      directed: true,
      context_node_id: m0.id,
      archived: false,
    };
    testPlan = { ...testPlan, relationships: [rel] };
    testPlan = severMilestoneRelationship(testPlan, mA.id, rel.id, 'Severed');
    testPlan = restoreMilestoneRelationship(testPlan, mB.id, rel.id, undefined, 'Restored');
    testPlan = severMilestoneRelationship(testPlan, mD.id, rel.id, 'Severed Again');

    // From Crown's perspective:
    // At m0: active
    const relsCrownM0 = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, m0.id, crownDoc.id);
    assert.equal(relsCrownM0.length, 1);
    assert.equal(relsCrownM0[0]?.isActive, true);

    // At mA: severed
    const relsCrownMA = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, mA.id, crownDoc.id);
    assert.equal(relsCrownMA.length, 1);
    assert.equal(relsCrownMA[0]?.isActive, false);
    assert.equal(relsCrownMA[0]?.isSevered, true);

    // At mB: active (restored_here)
    const relsCrownMB = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, mB.id, crownDoc.id);
    assert.equal(relsCrownMB.length, 1);
    assert.equal(relsCrownMB[0]?.isActive, true);
    assert.equal(relsCrownMB[0]?.origin, 'restored_here');

    // At mC: active (inherited)
    const relsCrownMC = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, mC.id, crownDoc.id);
    assert.equal(relsCrownMC.length, 1);
    assert.equal(relsCrownMC[0]?.isActive, true);
    assert.equal(relsCrownMC[0]?.origin, 'inherited');

    // At mD: severed (severed_here)
    const relsCrownMD = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, mD.id, crownDoc.id);
    assert.equal(relsCrownMD.length, 1);
    assert.equal(relsCrownMD[0]?.isActive, false);
    assert.equal(relsCrownMD[0]?.isSevered, true);
    assert.equal(relsCrownMD[0]?.origin, 'severed_here');
  });

  await t.test('28. Sentinel escaping and literal text vs legacy unescaped sentinels (F-03)', () => {
    // 1. Author entering literal '[cleared]' or '__LIVING_STATE_CLEARED__' is escaped with leading '\\'
    const escapedCleared = escapeLiteralPropertyValue('[cleared]');
    assert.equal(escapedCleared, '\\[cleared]');
    assert.equal(isClearedValue(escapedCleared), false);

    const escapedSentinel = escapeLiteralPropertyValue('__LIVING_STATE_CLEARED__');
    assert.equal(escapedSentinel, '\\__LIVING_STATE_CLEARED__');
    assert.equal(isClearedValue(escapedSentinel), false);

    const escapedSevered = escapeLiteralRelationshipLabel('[severed]');
    assert.equal(escapedSevered, '\\[severed]');
    assert.equal(isSeveredRelationship(escapedSevered), false);

    // 2. Unescape functions strip the leading backslash for literal strings
    assert.equal(unescapeLiteralPropertyValue(escapedCleared), '[cleared]');
    assert.equal(unescapeLiteralPropertyValue(escapedSentinel), '__LIVING_STATE_CLEARED__');
    assert.equal(unescapeLiteralRelationshipLabel(escapedSevered), '[severed]');

    // Normal values pass through unescaped
    assert.equal(escapeLiteralPropertyValue('Normal Value'), 'Normal Value');
    assert.equal(unescapeLiteralPropertyValue('Normal Value'), 'Normal Value');

    // 3. Store escaped value in stateEngine and verify resolveEntityLivingState returns literal value
    let testPlan = emptyPlan();
    testPlan = {
      ...testPlan,
      universes: [universe],
      entities: [{ id: kaelDoc.id, universe_id: UNIVERSE_ID }],
    };
    const mTest = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'Test Milestone' };
    testPlan = insertNode(testPlan, mTest);

    // Author literally wrote "[cleared]" into occupation
    testPlan = assignMilestoneState(testPlan, mTest.id, kaelDoc.id, 'occupation', escapedCleared, 'Literal clear text');
    const stateWithLiteral = resolveEntityLivingState(testPlan, allDocs, UNIVERSE_ID, mTest.id, kaelDoc.id);
    const occProp = stateWithLiteral.properties.get('occupation');
    assert.ok(occProp);
    assert.equal(occProp.origin, 'explicit'); // Not 'cleared'!
    assert.equal(occProp.value, '[cleared]'); // Unescaped in resolution!

    // 4. Legacy unescaped sentinel continues to be recognized as cleared
    const mLegacy = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'Legacy Milestone' };
    testPlan = insertNode(testPlan, mLegacy);
    testPlan = assignMilestoneState(testPlan, mLegacy.id, kaelDoc.id, 'residence', CLEARED_PROPERTY_VALUE, 'Legacy clear');
    const stateLegacy = resolveEntityLivingState(testPlan, allDocs, UNIVERSE_ID, mLegacy.id, kaelDoc.id);
    const resProp = stateLegacy.properties.get('residence');
    assert.ok(resProp);
    assert.equal(resProp.origin, 'cleared');
    assert.equal(resProp.value, null);

    // 5. Literal escaped relationship label '[severed]' remains active with label '[severed]'
    const relLiteral: Relationship = {
      id: 'rel-literal-label',
      universe_id: UNIVERSE_ID,
      book_id: null,
      source_id: kaelDoc.id,
      target_id: crownDoc.id,
      label: 'Allied',
      description: '',
      directed: true,
      context_node_id: mTest.id,
      archived: false,
    };
    testPlan = { ...testPlan, relationships: [relLiteral] };
    testPlan = assignMilestoneRelationshipChange(testPlan, mTest.id, relLiteral.id, escapedSevered, 'Literal severed label');
    const relsLiteral = resolveMilestoneRelationships(testPlan, allDocs, UNIVERSE_ID, mTest.id, kaelDoc.id);
    const resolvedLit = relsLiteral.find((r) => r.relationshipId === relLiteral.id);
    assert.ok(resolvedLit);
    assert.equal(resolvedLit.isActive, true);
    assert.equal(resolvedLit.isSevered, false);
    assert.equal(resolvedLit.relationTypeFromSource, '[severed]');
  });

  await t.test('29. Rapid sequential functional mutations coexistence (F-02)', () => {
    let testPlan = emptyPlan();
    testPlan = {
      ...testPlan,
      universes: [universe],
      entities: [
        { id: kaelDoc.id, universe_id: UNIVERSE_ID },
        { id: crownDoc.id, universe_id: UNIVERSE_ID },
      ],
    };

    // Preceding milestone where war severs the alliance
    const mWar = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'War Milestone' };
    testPlan = insertNode(testPlan, mWar);

    const rel1: Relationship = {
      id: 'rel-seq-1',
      universe_id: UNIVERSE_ID,
      book_id: null,
      source_id: kaelDoc.id,
      target_id: crownDoc.id,
      label: 'Ally',
      description: '',
      directed: true,
      context_node_id: mWar.id,
      archived: false,
    };
    testPlan = { ...testPlan, relationships: [rel1] };
    testPlan = severMilestoneRelationship(testPlan, mWar.id, rel1.id, 'War begins');

    // Downstream sequential milestone where rapid edits occur
    const mSeq = { ...newNode(testPlan, UNIVERSE_ID, null), title: 'Sequential Milestone' };
    testPlan = insertNode(testPlan, mSeq);

    // Simulate 5 rapid functional mutations executed against the accumulator:
    // 1. Set role = 'Archmage'
    // 2. Set residence = 'Tower of Light'
    // 3. Clear affiliation
    // 4. Sever rel1
    // 5. Restore rel1 with label 'Uneasy Truce'
    const mutators: Array<(p: Plan) => Plan> = [
      (p) => assignMilestoneState(p, mSeq.id, kaelDoc.id, 'role', 'Archmage', 'Ascension'),
      (p) => assignMilestoneState(p, mSeq.id, kaelDoc.id, 'residence', 'Tower of Light', 'New home'),
      (p) => assignMilestoneState(p, mSeq.id, kaelDoc.id, 'affiliation', CLEARED_PROPERTY_VALUE, 'Renounced guild'),
      (p) => severMilestoneRelationship(p, mSeq.id, rel1.id, 'Severed in war'),
      (p) => restoreMilestoneRelationship(p, mSeq.id, rel1.id, 'Uneasy Truce', 'Truce negotiated'),
    ];

    // Execute sequentially as the save queue does with functional updates
    let accumulatedPlan = testPlan;
    for (const mutate of mutators) {
      accumulatedPlan = mutate(accumulatedPlan);
    }

    // Verify all 5 mutations coexist in accumulatedPlan
    const resolved = resolveEntityLivingState(accumulatedPlan, allDocs, UNIVERSE_ID, mSeq.id, kaelDoc.id);
    assert.equal(resolved.properties.get('role')?.value, 'Archmage');
    assert.equal(resolved.properties.get('residence')?.value, 'Tower of Light');
    assert.equal(resolved.properties.get('affiliation')?.origin, 'cleared');
    assert.equal(resolved.properties.get('affiliation')?.value, null);

    const rels = resolveMilestoneRelationships(accumulatedPlan, allDocs, UNIVERSE_ID, mSeq.id, kaelDoc.id);
    const r1 = rels.find((r) => r.relationshipId === rel1.id);
    assert.ok(r1);
    assert.equal(r1.isActive, true);
    assert.equal(r1.isSevered, false);
    assert.equal(r1.relationTypeFromSource, 'Uneasy Truce');
    assert.equal(r1.origin, 'restored_here');
  });
});
