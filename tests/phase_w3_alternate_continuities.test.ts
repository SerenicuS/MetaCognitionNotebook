import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DocumentMetadata } from '../src/types';
import type { Plan, Universe, StoryNode, Book } from '../src/utils/thought';
import {
  uid,
  emptyPlan,
  newNode,
  insertNode,
  moveNode,
  archiveNode,
  timeline,
  createBranch,
  renameBranch,
  archiveBranch,
} from '../src/utils/thought';
import {
  validateMilestoneAncestry,
  getMilestonePredecessors,
  resolveUniverseStateAtMilestone,
  assignMilestoneState,
  clearMilestoneState,
  compareMilestoneStates,
  NOT_INTRODUCED_STATUS,
} from '../src/utils/stateEngine';

test('Web of Thought Phase W3: Explicit Alternate Continuities & Historical State Comparison', async (t) => {
  const UNIVERSE_ID = 'univ-w3-eryndor';
  const OTHER_UNIVERSE_ID = 'univ-w3-other';

  const universeA: Universe = {
    id: UNIVERSE_ID,
    name: 'Eryndor Realm',
    description: 'High fantasy world with branching historical timelines',
  };

  const universeB: Universe = {
    id: OTHER_UNIVERSE_ID,
    name: 'Shadow Realm',
    description: 'Distinct cosmos for cross-universe rejection testing',
  };

  // Mock Lore Documents in Universe A
  const heroDoc: DocumentMetadata = {
    id: 'char-hero-1',
    title: 'Aric the Valiant',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: 'house-w3',
    path: '/vault/houses/house-w3/lorebook/aric.md',
    created_at: '2026-10-27T10:00:00Z',
    modified_at: '2026-10-27T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_ID,
      character_fields: { vital_status: 'alive' },
    }),
  };

  const villainDoc: DocumentMetadata = {
    id: 'char-villain-2',
    title: 'Morvath the Undying',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: 'house-w3',
    path: '/vault/houses/house-w3/lorebook/morvath.md',
    created_at: '2026-10-27T10:00:00Z',
    modified_at: '2026-10-27T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_ID,
      character_fields: { vital_status: 'deceased' },
    }),
  };

  const factionDoc: DocumentMetadata = {
    id: 'fac-order-3',
    title: 'Order of the Dawn',
    doc_type: 'lorebook',
    tags: ['faction'],
    house_id: 'house-w3',
    path: '/vault/houses/house-w3/lorebook/order.md',
    created_at: '2026-10-27T10:00:00Z',
    modified_at: '2026-10-27T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'faction',
      universe_id: UNIVERSE_ID,
    }),
  };

  const unintroducedDoc: DocumentMetadata = {
    id: 'char-descendant-4',
    title: 'Lyra Vance',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: 'house-w3',
    path: '/vault/houses/house-w3/lorebook/lyra.md',
    created_at: '2026-10-27T10:00:00Z',
    modified_at: '2026-10-27T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_ID,
    }),
  };

  const otherUniverseDoc: DocumentMetadata = {
    id: 'char-void-walker-5',
    title: 'Void Walker',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: 'house-w3',
    path: '/vault/houses/house-w3/lorebook/walker.md',
    created_at: '2026-10-27T10:00:00Z',
    modified_at: '2026-10-27T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: OTHER_UNIVERSE_ID,
    }),
  };

  const docs = [heroDoc, villainDoc, factionDoc, unintroducedDoc, otherUniverseDoc];

  // Helper to construct a base canonical timeline
  function createBasePlan(): { plan: Plan; c1: StoryNode; c2: StoryNode; c3: StoryNode } {
    let plan = emptyPlan();
    plan.universes = [universeA, universeB];
    plan.entities = docs.map((d) => ({
      id: d.id,
      universe_id: d.id === otherUniverseDoc.id ? OTHER_UNIVERSE_ID : UNIVERSE_ID,
    }));

    // C1: First Age (Year 100) - Founding
    const c1: StoryNode = {
      ...newNode(plan, UNIVERSE_ID, null),
      id: 'node-canon-1',
      title: 'The Great Awakening',
      era: 'Year 100',
      position: 0,
      changes: [
        {
          id: 'ch-1',
          entity_id: heroDoc.id,
          property_key: 'status',
          previous_value: null,
          new_value: 'alive',
          note: 'Aric is born and begins training',
        },
        {
          id: 'ch-2',
          entity_id: villainDoc.id,
          property_key: 'status',
          previous_value: null,
          new_value: 'alive',
          note: 'Morvath establishes his necromantic tower',
        },
        {
          id: 'ch-3',
          entity_id: unintroducedDoc.id,
          property_key: 'status',
          previous_value: null,
          new_value: NOT_INTRODUCED_STATUS,
          note: 'Lyra will not be born until centuries later',
        },
      ],
    };
    plan = insertNode(plan, c1);

    // C2: Second Age (Year 200) - Divergence Point
    const c2: StoryNode = {
      ...newNode(plan, UNIVERSE_ID, null, c1.id),
      id: 'node-canon-2-divergence',
      title: 'Battle of the Sunken Citadel',
      era: 'Year 200',
      position: 1,
      changes: [
        {
          id: 'ch-4',
          entity_id: factionDoc.id,
          property_key: 'status',
          previous_value: null,
          new_value: 'active',
          note: 'Order of the Dawn mobilizes',
        },
      ],
    };
    plan = insertNode(plan, c2);

    // C3: Third Age (Year 300) - Canonical Victory
    const c3: StoryNode = {
      ...newNode(plan, UNIVERSE_ID, null, c2.id),
      id: 'node-canon-3',
      title: 'Fall of the Necromancer',
      era: 'Year 300',
      position: 2,
      changes: [
        {
          id: 'ch-5',
          entity_id: villainDoc.id,
          property_key: 'status',
          previous_value: 'alive',
          new_value: 'deceased',
          note: 'Morvath is slain by Aric',
        },
      ],
    };
    plan = insertNode(plan, c3);

    return { plan, c1, c2, c3 };
  }

  // --------------------------------------------------------------------------
  // 1. Legacy Compatibility & Round-trip
  // --------------------------------------------------------------------------
  await t.test('1. Legacy compatibility: planning JSON without branches deserializes and serializes cleanly', () => {
    const legacyJson = JSON.stringify({
      version: 1,
      revision: 0,
      universes: [universeA],
      books: [],
      entities: [{ id: heroDoc.id, universe_id: UNIVERSE_ID }],
      nodes: [
        {
          id: 'node-legacy',
          universe_id: UNIVERSE_ID,
          book_id: null,
          position: 0,
          title: 'Legacy Milestone',
          description: '',
          era: 'Year 50',
          status: 'planned',
          questions: '',
          entity_ids: [],
          changes: [],
          relationship_changes: [],
          linked_event_id: null,
          origin_node_id: null,
          archived: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      relationships: [],
    });

    const parsed: Plan = JSON.parse(legacyJson);
    assert.strictEqual(parsed.version, 1);
    assert.strictEqual(parsed.nodes.length, 1);
    assert.strictEqual(parsed.nodes[0].branch_id, undefined);

    // Round-trip back to JSON retains validity
    const reserialized = JSON.stringify(parsed);
    assert.ok(reserialized.includes('node-legacy'));
  });

  // --------------------------------------------------------------------------
  // 2. Branch Creation & Persistence
  // --------------------------------------------------------------------------
  await t.test('2. Branch creation & persistence: creates branch with stable UUID, divergence ID, timestamps', () => {
    const { plan, c2 } = createBasePlan();
    const { plan: updatedPlan, branch } = createBranch(
      plan,
      UNIVERSE_ID,
      'The Dark Sun Timeline',
      c2.id,
      'What if Morvath triumphed at the Sunken Citadel?'
    );

    assert.ok(branch.id);
    assert.strictEqual(branch.universe_id, UNIVERSE_ID);
    assert.strictEqual(branch.name, 'The Dark Sun Timeline');
    assert.strictEqual(branch.divergence_node_id, c2.id);
    assert.strictEqual(branch.parent_continuity_id, null);
    assert.strictEqual(branch.archived, false);
    assert.ok(branch.created_at);
    assert.ok(branch.updated_at);
    assert.strictEqual(updatedPlan.branches?.length, 1);
    assert.strictEqual(updatedPlan.branches[0].id, branch.id);
  });

  // --------------------------------------------------------------------------
  // 3. Divergence State Inheritance
  // --------------------------------------------------------------------------
  await t.test('3. Divergence state inheritance: branch resolves identical states to divergence milestone before branch milestones exist', () => {
    const { plan, c2 } = createBasePlan();
    const { plan: branchPlan, branch } = createBranch(
      plan,
      UNIVERSE_ID,
      'Branch 1',
      c2.id
    );

    // Before any branch milestone is authored, resolving state at divergence node yields identical values
    const canonicalStateAtC2 = resolveUniverseStateAtMilestone(branchPlan, docs, UNIVERSE_ID, c2.id);
    const heroState = canonicalStateAtC2.find((s) => s.entityId === heroDoc.id);
    const villainState = canonicalStateAtC2.find((s) => s.entityId === villainDoc.id);
    const factionState = canonicalStateAtC2.find((s) => s.entityId === factionDoc.id);

    assert.strictEqual(heroState?.value, 'alive');
    assert.strictEqual(heroState?.origin, 'inherited');
    assert.strictEqual(heroState?.sourceMilestoneId, 'node-canon-1');

    assert.strictEqual(villainState?.value, 'alive');
    assert.strictEqual(villainState?.origin, 'inherited');

    assert.strictEqual(factionState?.value, 'active');
    assert.strictEqual(factionState?.origin, 'explicit');
  });

  // --------------------------------------------------------------------------
  // 4. Canonical Isolation
  // --------------------------------------------------------------------------
  await t.test('4. Canonical isolation: modifying state on branch milestone never mutates canonical history', () => {
    const { plan, c2, c3 } = createBasePlan();
    const { plan: branchPlan, branch } = createBranch(
      plan,
      UNIVERSE_ID,
      'Dark Sun',
      c2.id
    );

    // Add milestone B1 on branch where Aric dies instead
    const b1: StoryNode = {
      ...newNode(branchPlan, UNIVERSE_ID, null, undefined, branch.id),
      id: 'node-branch-dark-1',
      title: 'Aric Slain in Shadows',
      era: 'Year 210 (Alternate)',
      changes: [
        {
          id: 'ch-b1-1',
          entity_id: heroDoc.id,
          property_key: 'status',
          previous_value: 'alive',
          new_value: 'deceased',
          note: 'Aric is ambushed and killed',
        },
      ],
    };
    let updatedPlan = insertNode(branchPlan, b1);

    // Resolve state on branch milestone B1
    const branchState = resolveUniverseStateAtMilestone(updatedPlan, docs, UNIVERSE_ID, b1.id);
    const heroOnBranch = branchState.find((s) => s.entityId === heroDoc.id);
    assert.strictEqual(heroOnBranch?.value, 'deceased');
    assert.strictEqual(heroOnBranch?.origin, 'explicit');
    assert.strictEqual(heroOnBranch?.sourceBranchId, branch.id);

    // Resolve state on canonical C3: Aric MUST STILL BE ALIVE on canonical C3!
    const canonicalStateAtC3 = resolveUniverseStateAtMilestone(updatedPlan, docs, UNIVERSE_ID, c3.id);
    const heroOnCanonical = canonicalStateAtC3.find((s) => s.entityId === heroDoc.id);
    assert.strictEqual(heroOnCanonical?.value, 'alive');
    assert.strictEqual(heroOnCanonical?.origin, 'inherited');
    assert.strictEqual(heroOnCanonical?.sourceMilestoneId, 'node-canon-1');
    assert.strictEqual(heroOnCanonical?.sourceBranchId, null);
  });

  // --------------------------------------------------------------------------
  // 5. Branch Isolation
  // --------------------------------------------------------------------------
  await t.test('5. Branch isolation: changes on one branch do not leak into another branch from same divergence', () => {
    const { plan, c2 } = createBasePlan();
    const { plan: planWithB1, branch: branch1 } = createBranch(
      plan,
      UNIVERSE_ID,
      'Branch 1: Dark Sun',
      c2.id
    );
    const { plan: planWithBoth, branch: branch2 } = createBranch(
      planWithB1,
      UNIVERSE_ID,
      'Branch 2: Golden Dawn',
      c2.id
    );

    // Branch 1: Morvath conquers Eryndor
    const nodeB1 = {
      ...newNode(planWithBoth, UNIVERSE_ID, null, undefined, branch1.id),
      id: 'node-b1-event',
      changes: [
        {
          id: 'ch-b1',
          entity_id: villainDoc.id,
          property_key: 'status',
          previous_value: 'alive',
          new_value: 'corrupted',
          note: 'Morvath transforms into a Void God',
        },
      ],
    };

    // Branch 2: Order of the Dawn conquers Eryndor
    const nodeB2 = {
      ...newNode(planWithBoth, UNIVERSE_ID, null, undefined, branch2.id),
      id: 'node-b2-event',
      changes: [
        {
          id: 'ch-b2',
          entity_id: factionDoc.id,
          property_key: 'status',
          previous_value: 'active',
          new_value: 'flourishing',
          note: 'The Order establishes peace',
        },
      ],
    };

    let fullPlan = insertNode(planWithBoth, nodeB1);
    fullPlan = insertNode(fullPlan, nodeB2);

    // Verify Branch 1 state
    const stateB1 = resolveUniverseStateAtMilestone(fullPlan, docs, UNIVERSE_ID, nodeB1.id);
    const villainB1 = stateB1.find((s) => s.entityId === villainDoc.id);
    const factionB1 = stateB1.find((s) => s.entityId === factionDoc.id);
    assert.strictEqual(villainB1?.value, 'corrupted');
    assert.strictEqual(factionB1?.value, 'active'); // Inherited from C2, NOT flourishing from B2!

    // Verify Branch 2 state
    const stateB2 = resolveUniverseStateAtMilestone(fullPlan, docs, UNIVERSE_ID, nodeB2.id);
    const villainB2 = stateB2.find((s) => s.entityId === villainDoc.id);
    const factionB2 = stateB2.find((s) => s.entityId === factionDoc.id);
    assert.strictEqual(villainB2?.value, 'alive'); // Inherited from C1/C2, NOT corrupted from B1!
    assert.strictEqual(factionB2?.value, 'flourishing');
  });

  // --------------------------------------------------------------------------
  // 6. Multiple Branches from Same Milestone
  // --------------------------------------------------------------------------
  await t.test('6. Multiple branches from same milestone: maintain independent timelines and lineages', () => {
    const { plan, c2 } = createBasePlan();
    const { plan: p1, branch: bA } = createBranch(plan, UNIVERSE_ID, 'Timeline A', c2.id);
    const { plan: p2, branch: bB } = createBranch(p1, UNIVERSE_ID, 'Timeline B', c2.id);
    const { plan: p3, branch: bC } = createBranch(p2, UNIVERSE_ID, 'Timeline C', c2.id);

    assert.strictEqual(p3.branches?.length, 3);
    assert.strictEqual(bA.divergence_node_id, c2.id);
    assert.strictEqual(bB.divergence_node_id, c2.id);
    assert.strictEqual(bC.divergence_node_id, c2.id);

    assert.notStrictEqual(bA.id, bB.id);
    assert.notStrictEqual(bB.id, bC.id);
  });

  // --------------------------------------------------------------------------
  // 7. Nested Branches
  // --------------------------------------------------------------------------
  await t.test('7. Nested branches: branch can diverge from a milestone on another branch, correctly traversing parent continuity chain', () => {
    const { plan, c1, c2 } = createBasePlan();

    // Primary branch diverging from C2
    const { plan: p1, branch: branchA } = createBranch(plan, UNIVERSE_ID, 'Branch A', c2.id);
    const nodeA1 = {
      ...newNode(p1, UNIVERSE_ID, null, undefined, branchA.id),
      id: 'node-A1',
      title: 'Branch A1 Event',
      changes: [
        {
          id: 'ch-a1',
          entity_id: villainDoc.id,
          property_key: 'status',
          previous_value: 'alive',
          new_value: 'missing',
          note: 'Morvath disappears into the rift',
        },
      ],
    };
    const p2 = insertNode(p1, nodeA1);

    // Nested branch diverging from nodeA1 on branchA
    const { plan: p3, branch: branchNested } = createBranch(
      p2,
      UNIVERSE_ID,
      'Nested Sub-Branch',
      nodeA1.id
    );
    assert.strictEqual(branchNested.divergence_node_id, nodeA1.id);
    assert.strictEqual(branchNested.parent_continuity_id, branchA.id);

    // Milestone on nested branch
    const nodeNested1 = {
      ...newNode(p3, UNIVERSE_ID, null, undefined, branchNested.id),
      id: 'node-nested-1',
      title: 'Nested Milestone Event',
      changes: [],
    };
    const fullPlan = insertNode(p3, nodeNested1);

    // Lineage should contain: [c1, c2, nodeA1, nodeNested1]
    const lineage = getMilestonePredecessors(fullPlan, nodeNested1.id);
    assert.strictEqual(lineage.length, 4);
    assert.strictEqual(lineage[0].id, c1.id);
    assert.strictEqual(lineage[1].id, c2.id);
    assert.strictEqual(lineage[2].id, nodeA1.id);
    assert.strictEqual(lineage[3].id, nodeNested1.id);

    // Resolved state on nested branch inherits Morvath missing from nodeA1
    const nestedState = resolveUniverseStateAtMilestone(fullPlan, docs, UNIVERSE_ID, nodeNested1.id);
    const villainNested = nestedState.find((s) => s.entityId === villainDoc.id);
    assert.strictEqual(villainNested?.value, 'missing');
    assert.strictEqual(villainNested?.origin, 'inherited');
    assert.strictEqual(villainNested?.sourceMilestoneId, nodeA1.id);
    assert.strictEqual(villainNested?.sourceBranchId, branchA.id);
    assert.strictEqual(villainNested?.sourceContinuityName, 'Branch A');
  });

  // --------------------------------------------------------------------------
  // 8. Missing / Invalid Divergence Milestone Rejection
  // --------------------------------------------------------------------------
  await t.test('8. Missing/invalid divergence milestone rejection: branching from nonexistent or archived milestone fails', () => {
    const { plan, c2 } = createBasePlan();

    // Nonexistent milestone
    assert.throws(
      () => createBranch(plan, UNIVERSE_ID, 'Invalid', 'nonexistent-node-id'),
      /not found/i
    );

    // Archived milestone
    const archivedPlan = archiveNode(plan, c2.id);
    assert.throws(
      () => createBranch(archivedPlan, UNIVERSE_ID, 'Invalid', c2.id),
      /not found or is archived/i
    );
  });

  // --------------------------------------------------------------------------
  // 9. Cross-Universe Branch Rejection
  // --------------------------------------------------------------------------
  await t.test('9. Cross-Universe branch rejection: attempting to branch milestone from another universe is rejected', () => {
    const { plan, c2 } = createBasePlan();

    // Trying to create branch in universe B with divergence milestone from universe A
    assert.throws(
      () => createBranch(plan, OTHER_UNIVERSE_ID, 'Cross Branch', c2.id),
      /belongs to universe/i
    );
  });

  // --------------------------------------------------------------------------
  // 10. Cyclic Ancestry Rejection
  // --------------------------------------------------------------------------
  await t.test('10. Cyclic ancestry rejection: detected and safely rejected without infinite loop', () => {
    const { plan, c2 } = createBasePlan();
    const { plan: p1, branch: branch1 } = createBranch(plan, UNIVERSE_ID, 'Branch 1', c2.id);

    const nodeB1 = {
      ...newNode(p1, UNIVERSE_ID, null, undefined, branch1.id),
      id: 'node-b1',
    };
    let cyclicPlan = insertNode(p1, nodeB1);

    // Artificially create a cycle in branch divergence
    // branch1 diverges from nodeB1 on branch1 itself!
    cyclicPlan.branches = cyclicPlan.branches!.map((b) =>
      b.id === branch1.id ? { ...b, divergence_node_id: nodeB1.id } : b
    );

    const res = validateMilestoneAncestry(cyclicPlan, nodeB1.id);
    assert.strictEqual(res.valid, false);
    assert.match(res.error || '', /cycle/i);
  });

  // --------------------------------------------------------------------------
  // 11. Deterministic Milestone Ordering
  // --------------------------------------------------------------------------
  await t.test('11. Deterministic milestone ordering: adding milestones to branch maintains independent position ordering', () => {
    const { plan, c2 } = createBasePlan();
    const { plan: p1, branch } = createBranch(plan, UNIVERSE_ID, 'Ordering Branch', c2.id);

    const m1 = { ...newNode(p1, UNIVERSE_ID, null, undefined, branch.id), id: 'b-node-1', position: 0 };
    let p2 = insertNode(p1, m1);

    const m2 = { ...newNode(p2, UNIVERSE_ID, null, m1.id, branch.id), id: 'b-node-2', position: 1 };
    p2 = insertNode(p2, m2);

    const branchTimeline = timeline(p2, UNIVERSE_ID, null, branch.id);
    assert.strictEqual(branchTimeline.length, 2);
    assert.strictEqual(branchTimeline[0].id, 'b-node-1');
    assert.strictEqual(branchTimeline[1].id, 'b-node-2');

    // Canonical timeline remains untouched
    const canonicalTimeline = timeline(p2, UNIVERSE_ID, null, null);
    assert.strictEqual(canonicalTimeline.length, 3);
  });

  // --------------------------------------------------------------------------
  // 12. Historical State Provenance
  // --------------------------------------------------------------------------
  await t.test('12. Historical state provenance: clearly identifies direct branch assignment vs canonical inheritance', () => {
    const { plan, c2 } = createBasePlan();
    const { plan: p1, branch } = createBranch(plan, UNIVERSE_ID, 'Provenance Branch', c2.id);

    const bNode = {
      ...newNode(p1, UNIVERSE_ID, null, undefined, branch.id),
      id: 'b-prov-node',
      title: 'Branch Event',
      changes: [
        {
          id: 'ch-prov-1',
          entity_id: villainDoc.id,
          property_key: 'status',
          previous_value: 'alive',
          new_value: 'imprisoned',
          note: 'Morvath sealed in runic chains',
        },
      ],
    };
    const p2 = insertNode(p1, bNode);

    const states = resolveUniverseStateAtMilestone(p2, docs, UNIVERSE_ID, bNode.id);

    // Villain was directly modified on branch
    const villain = states.find((s) => s.entityId === villainDoc.id);
    assert.strictEqual(villain?.value, 'imprisoned');
    assert.strictEqual(villain?.origin, 'explicit');
    assert.strictEqual(villain?.sourceBranchId, branch.id);
    assert.strictEqual(villain?.sourceContinuityName, 'Provenance Branch');

    // Hero was modified on Canonical C1 (before divergence) and inherited
    const hero = states.find((s) => s.entityId === heroDoc.id);
    assert.strictEqual(hero?.value, 'alive');
    assert.strictEqual(hero?.origin, 'inherited');
    assert.strictEqual(hero?.sourceBranchId, null);
    assert.strictEqual(hero?.sourceContinuityName, 'Canonical History');
  });

  // --------------------------------------------------------------------------
  // 13. Unknown vs. Unassigned vs. Not-Yet-Introduced Semantics
  // --------------------------------------------------------------------------
  await t.test('13. Unknown vs unassigned vs not-yet-introduced semantics on branches', () => {
    const { plan, c2 } = createBasePlan();
    const { plan: p1, branch } = createBranch(plan, UNIVERSE_ID, 'Semantics Branch', c2.id);

    const bNode = {
      ...newNode(p1, UNIVERSE_ID, null, undefined, branch.id),
      id: 'b-sem-node',
      changes: [
        {
          id: 'ch-sem-unknown',
          entity_id: villainDoc.id,
          property_key: 'status',
          previous_value: 'alive',
          new_value: null, // Explicitly marked unknown
          note: 'Fate unknown',
        },
      ],
    };
    const p2 = insertNode(p1, bNode);

    const states = resolveUniverseStateAtMilestone(p2, docs, UNIVERSE_ID, bNode.id);

    // Villain: explicit unknown
    const villain = states.find((s) => s.entityId === villainDoc.id);
    assert.strictEqual(villain?.value, null);
    assert.strictEqual(villain?.origin, 'unknown');
    assert.strictEqual(villain?.displayLabel, 'Unknown');

    // Lyra: not yet introduced (inherited from C1)
    const lyra = states.find((s) => s.entityId === unintroducedDoc.id);
    assert.strictEqual(lyra?.value, NOT_INTRODUCED_STATUS);
    assert.strictEqual(lyra?.origin, 'not_yet_introduced');
    assert.strictEqual(lyra?.displayLabel, 'Not Yet Introduced');

    // Faction: unassigned (if cleared) or inherited
    // Other doc: void walker is from other universe, not in map
    assert.ok(!states.some((s) => s.entityId === otherUniverseDoc.id));
  });

  // --------------------------------------------------------------------------
  // 14. Cross-Continuity Comparison
  // --------------------------------------------------------------------------
  await t.test('14. Cross-continuity comparison: detects value difference, provenance-only, and introduced states', () => {
    const { plan, c2, c3 } = createBasePlan();
    const { plan: p1, branch } = createBranch(plan, UNIVERSE_ID, 'Alt Branch', c2.id);

    const bNode = {
      ...newNode(p1, UNIVERSE_ID, null, undefined, branch.id),
      id: 'b-comp-node',
      title: 'Branch Milestone',
      changes: [
        {
          id: 'ch-comp-1',
          entity_id: villainDoc.id,
          property_key: 'status',
          previous_value: 'alive',
          new_value: 'alive', // Morvath survived on branch! On canonical C3, he is 'deceased'
          note: 'Morvath survives on branch',
        },
        {
          id: 'ch-comp-2',
          entity_id: heroDoc.id,
          property_key: 'status',
          previous_value: 'alive',
          new_value: 'alive', // Value is same as canonical, but explicit on branch!
          note: 'Reaffirmed alive on branch',
        },
      ],
    };
    const fullPlan = insertNode(p1, bNode);

    // Compare Canonical C3 vs Branch Milestone
    const diffs = compareMilestoneStates(
      fullPlan,
      docs,
      UNIVERSE_ID,
      c3.id,
      bNode.id
    );

    // 1. Villain: Canonical C3 is 'deceased', Branch is 'alive' => value_change
    const villainDiff = diffs.find((d) => d.entityId === villainDoc.id);
    assert.strictEqual(villainDiff?.hasDifference, true);
    assert.strictEqual(villainDiff?.differenceType, 'value_change');
    assert.strictEqual(villainDiff?.stateA.value, 'deceased');
    assert.strictEqual(villainDiff?.stateB.value, 'alive');

    // 2. Hero: Value is 'alive' in both, but stateB has explicit override on branch => provenance_only
    const heroDiff = diffs.find((d) => d.entityId === heroDoc.id);
    assert.strictEqual(heroDiff?.hasDifference, true);
    assert.strictEqual(heroDiff?.differenceType, 'provenance_only');
    assert.strictEqual(heroDiff?.stateA.value, 'alive');
    assert.strictEqual(heroDiff?.stateB.value, 'alive');

    // 3. Faction: Value is 'active' in both, same source milestone C2 => none
    const factionDiff = diffs.find((d) => d.entityId === factionDoc.id);
    assert.strictEqual(factionDiff?.hasDifference, false);
    assert.strictEqual(factionDiff?.differenceType, 'none');
  });

  // --------------------------------------------------------------------------
  // 15. Safe Branch Rename / Archive
  // --------------------------------------------------------------------------
  await t.test('15. Safe branch rename and archive: updates display and visibility without data corruption', () => {
    const { plan, c2 } = createBasePlan();
    const { plan: p1, branch } = createBranch(plan, UNIVERSE_ID, 'Original Name', c2.id);

    // Rename
    const renamed = renameBranch(p1, branch.id, 'Renamed Name', 'New Description');
    assert.strictEqual(renamed.branches![0].name, 'Renamed Name');
    assert.strictEqual(renamed.branches![0].description, 'New Description');

    // Archive
    const archived = archiveBranch(renamed, branch.id, true);
    assert.strictEqual(archived.branches![0].archived, true);

    // Unarchive
    const unarchived = archiveBranch(archived, branch.id, false);
    assert.strictEqual(unarchived.branches![0].archived, false);
  });

  // --------------------------------------------------------------------------
  // 16. Timeline & Connections Regression
  // --------------------------------------------------------------------------
  await t.test('16. Timeline operations regression: moveNode, archiveNode, assignMilestoneState on branch milestones', () => {
    const { plan, c2 } = createBasePlan();
    const { plan: p1, branch } = createBranch(plan, UNIVERSE_ID, 'Regression Branch', c2.id);

    const m1 = { ...newNode(p1, UNIVERSE_ID, null, undefined, branch.id), id: 'b-reg-1', title: 'M1' };
    let p2 = insertNode(p1, m1);

    const m2 = { ...newNode(p2, UNIVERSE_ID, null, m1.id, branch.id), id: 'b-reg-2', title: 'M2' };
    p2 = insertNode(p2, m2);

    // Assign milestone state on branch milestone
    p2 = assignMilestoneState(p2, m1.id, heroDoc.id, 'status', 'incapacitated');
    const stateM1 = resolveUniverseStateAtMilestone(p2, docs, UNIVERSE_ID, m1.id);
    assert.strictEqual(stateM1.find((s) => s.entityId === heroDoc.id)?.value, 'incapacitated');

    // Clear state
    p2 = clearMilestoneState(p2, m1.id, heroDoc.id, 'status');
    const stateCleared = resolveUniverseStateAtMilestone(p2, docs, UNIVERSE_ID, m1.id);
    assert.strictEqual(stateCleared.find((s) => s.entityId === heroDoc.id)?.value, 'alive'); // falls back to predecessor C1

    // Move node
    p2 = moveNode(p2, m1.id, 1);
    const timelineAfterMove = timeline(p2, UNIVERSE_ID, null, branch.id);
    assert.strictEqual(timelineAfterMove[0].id, 'b-reg-2');
    assert.strictEqual(timelineAfterMove[1].id, 'b-reg-1');

    // Archive node
    p2 = archiveNode(p2, m2.id);
    const timelineAfterArchive = timeline(p2, UNIVERSE_ID, null, branch.id);
    assert.strictEqual(timelineAfterArchive.length, 1);
    assert.strictEqual(timelineAfterArchive[0].id, 'b-reg-1');
  });

  // --------------------------------------------------------------------------
  // 17. Save & Reload Revision Conflict Handling
  // --------------------------------------------------------------------------
  await t.test('17. Book continuity association and branch linking compatibility', () => {
    const { plan, c2 } = createBasePlan();
    const { plan: p1, branch } = createBranch(plan, UNIVERSE_ID, 'Book Branch', c2.id);

    const alternateBook: Book = {
      id: 'book-alternate-1',
      universe_id: UNIVERSE_ID,
      name: 'Chronicles of the Dark Sun',
      continuity: 'alternate',
      branch_id: branch.id,
      archived: false,
    };
    p1.books.push(alternateBook);

    assert.strictEqual(alternateBook.continuity, 'alternate');
    assert.strictEqual(alternateBook.branch_id, branch.id);

    // Serialization and deserialization preserves book branch_id
    const json = JSON.stringify(p1);
    const parsed: Plan = JSON.parse(json);
    const parsedBook = parsed.books.find((b) => b.id === 'book-alternate-1');
    assert.strictEqual(parsedBook?.branch_id, branch.id);
  });
});
