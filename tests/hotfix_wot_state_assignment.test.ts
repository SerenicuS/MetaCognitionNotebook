import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DocumentMetadata, DocumentDetail, HouseRecord, LoreCategory } from '../src/types';
import type { Plan, StoryNode, Thought, Universe, Book, Branch } from '../src/utils/thought';
import {
  assignMilestoneState,
  clearMilestoneState,
  resolveUniverseStateAtMilestone,
  type ResolvedEntityState,
} from '../src/utils/stateEngine';
import { LorebookStudio } from '../src/components/studios/LorebookStudio';
import { UniverseStateExplorer } from '../src/components/studios/lorebook/UniverseStateExplorer';
import { UniverseDashboard } from '../src/components/studios/lorebook/UniverseDashboard';
import { EchoDocumentationPopup } from '../src/components/echo/EchoDocumentationPopup';
import type { EchoResolvedEntity } from '../src/components/echo/types';

// Setup node test mock environment for window and localStorage
const store = new Map<string, string>();
const mockStorage = {
  getItem: (k: string) => store.get(k) || null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
};
(globalThis as any).localStorage = mockStorage;
(globalThis as any).window = {
  localStorage: mockStorage,
  addEventListener: () => {},
  removeEventListener: () => {},
  innerWidth: 1024,
  innerHeight: 768,
};

test('Hotfix: Web of Thought State Assignment & Character UI Cleanup', async (t) => {
  const UNIVERSE_A_ID = 'univ-a-solaria';
  const UNIVERSE_B_ID = 'univ-b-nebula';
  const HOUSE_A_ID = 'house-alpha';
  const HOUSE_B_ID = 'house-beta';

  const houses: HouseRecord[] = [
    {
      id: HOUSE_A_ID,
      name: 'House Alpha',
      color: 'amber',
      icon: 'castle',
      created_at: '2026-10-28T00:00:00Z',
      updated_at: '2026-10-28T00:00:00Z',
      universe_ids: [UNIVERSE_A_ID],
      enabled_studios: ['poetry', 'philosophy', 'lorebook'],
      manuscript_tools_enabled: true,
      archived: false,
    },
    {
      id: HOUSE_B_ID,
      name: 'House Beta',
      color: 'indigo',
      icon: 'shield',
      created_at: '2026-10-28T00:00:00Z',
      updated_at: '2026-10-28T00:00:00Z',
      universe_ids: [UNIVERSE_B_ID],
      enabled_studios: ['poetry', 'philosophy', 'lorebook'],
      manuscript_tools_enabled: true,
      archived: false,
    },
  ];

  const universeA: Universe = {
    id: UNIVERSE_A_ID,
    name: 'Solaria System',
    description: 'A binary star system of solar monarchies.',
    archived: false,
  };

  const universeB: Universe = {
    id: UNIVERSE_B_ID,
    name: 'Nebula Veil',
    description: 'An ethereal nebula civilization.',
    archived: false,
  };

  // Lorebook character in Universe A, House A (not initially in plan.entities)
  const charDocId = 'doc-1793153466087-9725k7';
  const charOriginalProse = '# Test Character Profile\n\nA seasoned diplomat from the inner rings.';
  const charDoc: DocumentMetadata = {
    id: charDocId,
    title: 'test character',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: HOUSE_A_ID,
    path: '/vault/houses/house-alpha/lorebook/test_character.md',
    created_at: '2026-10-28T01:00:00Z',
    modified_at: '2026-10-28T01:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_A_ID,
      character_fields: {
        vital_status: 'alive',
      },
    }),
  };

  // Foreign-Universe character (Universe B, House A - same house, but different universe)
  const foreignUnivDocId = 'doc-foreign-univ-8821x1';
  const foreignUnivDoc: DocumentMetadata = {
    id: foreignUnivDocId,
    title: 'Nebula Outcast',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: HOUSE_A_ID,
    path: '/vault/houses/house-alpha/lorebook/outcast.md',
    created_at: '2026-10-28T01:00:00Z',
    modified_at: '2026-10-28T01:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_B_ID,
    }),
  };

  // Foreign-House character (Universe A, but in foreign house B)
  const foreignHouseDocId = 'doc-foreign-house-3392y4';
  const foreignHouseDoc: DocumentMetadata = {
    id: foreignHouseDocId,
    title: 'Infiltrator',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: HOUSE_B_ID,
    path: '/vault/houses/house-beta/lorebook/infiltrator.md',
    created_at: '2026-10-28T01:00:00Z',
    modified_at: '2026-10-28T01:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_A_ID,
    }),
  };

  const allDocuments: DocumentMetadata[] = [
    charDoc,
    foreignUnivDoc,
    foreignHouseDoc,
  ];

  // Base plan with Milestone 1 ("The Beginning") and empty plan.entities
  const m1Id = 'node-milestone-beginning-100';
  const m2Id = 'node-milestone-reign-200';
  const basePlan: Plan = {
    version: 1,
    revision: 1,
    universes: [universeA, universeB],
    books: [],
    branches: [],
    entities: [], // Crucial test condition: entity is NOT pre-populated in plan.entities
    nodes: [
      {
        id: m1Id,
        universe_id: UNIVERSE_A_ID,
        book_id: null,
        branch_id: null,
        position: 0,
        title: 'The Beginning',
        description: 'First historical milestone of Solaria.',
        era: 'Year 1',
        status: 'planned',
        questions: '',
        entity_ids: [],
        changes: [],
        relationship_changes: [],
        linked_event_id: null,
        origin_node_id: null,
        archived: false,
        created_at: '2026-10-28T01:00:00Z',
        updated_at: '2026-10-28T01:00:00Z',
      },
      {
        id: m2Id,
        universe_id: UNIVERSE_A_ID,
        book_id: null,
        branch_id: null,
        position: 1,
        title: 'The Golden Age',
        description: 'Era of solar prosperity.',
        era: 'Year 50',
        status: 'planned',
        questions: '',
        entity_ids: [],
        changes: [],
        relationship_changes: [],
        linked_event_id: null,
        origin_node_id: null,
        archived: false,
        created_at: '2026-10-28T01:00:00Z',
        updated_at: '2026-10-28T01:00:00Z',
      },
    ],
    relationships: [],
  };

  await t.test('1. Historical state assignment for an existing Lorebook character succeeds', () => {
    // Calling assignMilestoneState with docs resolves the canonical entity and saves state
    const updatedPlan = assignMilestoneState(
      basePlan,
      m1Id,
      charDocId,
      'status',
      'Active / Alive',
      'Coronation day',
      undefined,
      allDocuments,
      { activeHouseId: HOUSE_A_ID, houses }
    );

    assert.ok(updatedPlan, 'assignMilestoneState should return updated plan');
    const milestone = updatedPlan.nodes.find((n) => n.id === m1Id);
    assert.ok(milestone);
    assert.equal(milestone.changes.length, 1);
    assert.equal(milestone.changes[0].entity_id, charDocId);
    assert.equal(milestone.changes[0].property_key, 'status');
    assert.equal(milestone.changes[0].new_value, 'Active / Alive');
    assert.equal(milestone.changes[0].note, 'Coronation day');
  });

  await t.test('2. Canonical entity ID resolution registers entity without ID modification', () => {
    const updatedPlan = assignMilestoneState(
      basePlan,
      m1Id,
      charDocId,
      'status',
      'Active / Alive',
      undefined,
      undefined,
      allDocuments,
      { activeHouseId: HOUSE_A_ID, houses }
    );

    // Entity must be registered in plan.entities with exact canonical ID and matching universe
    const registered = updatedPlan.entities.find((e) => e.id === charDocId);
    assert.ok(registered, 'Entity must be registered in plan.entities');
    assert.equal(registered.id, charDocId, 'Canonical document UUID must be preserved verbatim');
    assert.equal(registered.universe_id, UNIVERSE_A_ID, 'Entity universe must match milestone universe');
  });

  await t.test('3. Successful save and reload resolves historical state at milestone', () => {
    const updatedPlan = assignMilestoneState(
      basePlan,
      m1Id,
      charDocId,
      'status',
      'Active / Alive',
      'Coronation note',
      undefined,
      allDocuments,
      { activeHouseId: HOUSE_A_ID, houses }
    );

    // Simulate reload into historical state engine
    const states = resolveUniverseStateAtMilestone(updatedPlan, allDocuments, UNIVERSE_A_ID, m1Id);
    const resolved = states.find((s) => s.entityId === charDocId);
    assert.ok(resolved, 'Character must be found in resolved states');
    assert.equal(resolved.value, 'Active / Alive');
    assert.equal(resolved.origin, 'explicit');
    assert.equal(resolved.hasChangedAtThisMilestone, true);
    assert.equal(resolved.note, 'Coronation note');
  });

  await t.test('4. Correct historical state inheritance across subsequent milestones', () => {
    // Assign at M1: Active / Alive
    let plan = assignMilestoneState(
      basePlan,
      m1Id,
      charDocId,
      'status',
      'Active / Alive',
      undefined,
      undefined,
      allDocuments,
      { activeHouseId: HOUSE_A_ID, houses }
    );

    // Check at M2: No change made at M2, should inherit Active / Alive from M1
    const statesAtM2 = resolveUniverseStateAtMilestone(plan, allDocuments, UNIVERSE_A_ID, m2Id);
    const charAtM2 = statesAtM2.find((s) => s.entityId === charDocId);
    assert.ok(charAtM2);
    assert.equal(charAtM2.value, 'Active / Alive');
    assert.equal(charAtM2.origin, 'inherited');
    assert.equal(charAtM2.hasChangedAtThisMilestone, false);
    assert.equal(charAtM2.sourceMilestoneId, m1Id);

    // Now explicitly mark deceased at M2
    plan = assignMilestoneState(
      plan,
      m2Id,
      charDocId,
      'status',
      'deceased',
      'Fell in battle',
      undefined,
      allDocuments,
      { activeHouseId: HOUSE_A_ID, houses }
    );

    // M2 must be explicit deceased, while M1 remains explicit Active / Alive
    const recheckM2 = resolveUniverseStateAtMilestone(plan, allDocuments, UNIVERSE_A_ID, m2Id);
    assert.equal(recheckM2.find((s) => s.entityId === charDocId)?.value, 'deceased');
    assert.equal(recheckM2.find((s) => s.entityId === charDocId)?.origin, 'explicit');

    const recheckM1 = resolveUniverseStateAtMilestone(plan, allDocuments, UNIVERSE_A_ID, m1Id);
    assert.equal(recheckM1.find((s) => s.entityId === charDocId)?.value, 'Active / Alive');
    assert.equal(recheckM1.find((s) => s.entityId === charDocId)?.origin, 'explicit');
  });

  await t.test('5. Alternate branch isolation preserves canonical state history', () => {
    // Canonical M1: Active / Alive
    let plan = assignMilestoneState(
      basePlan,
      m1Id,
      charDocId,
      'status',
      'Active / Alive',
      undefined,
      undefined,
      allDocuments,
      { activeHouseId: HOUSE_A_ID, houses }
    );

    // Create alternate branch diverging from M1
    const branchId = 'branch-shadow-timeline';
    const altMilestoneId = 'node-alt-crisis-300';
    const altBranch: Branch = {
      id: branchId,
      universe_id: UNIVERSE_A_ID,
      name: 'Shadow Continuity',
      divergence_node_id: m1Id,
      archived: false,
      created_at: '2026-10-28T02:00:00Z',
      updated_at: '2026-10-28T02:00:00Z',
    };
    const altMilestone: StoryNode = {
      id: altMilestoneId,
      universe_id: UNIVERSE_A_ID,
      book_id: null,
      branch_id: branchId,
      position: 0,
      title: 'Exile from the Light',
      description: 'Alternative history where character fled.',
      era: 'Year 5 (Branch)',
      status: 'planned',
      questions: '',
      entity_ids: [],
      changes: [],
      relationship_changes: [],
      linked_event_id: null,
      origin_node_id: null,
      archived: false,
      created_at: '2026-10-28T02:00:00Z',
      updated_at: '2026-10-28T02:00:00Z',
    };

    plan = {
      ...plan,
      branches: [altBranch],
      nodes: [...plan.nodes, altMilestone],
    };

    // Assign on alternate branch: In Hiding
    plan = assignMilestoneState(
      plan,
      altMilestoneId,
      charDocId,
      'status',
      'In Hiding',
      'Fled into the outer dark',
      undefined,
      allDocuments,
      { activeHouseId: HOUSE_A_ID, houses }
    );

    // Verify alternate milestone has In Hiding
    const altStates = resolveUniverseStateAtMilestone(plan, allDocuments, UNIVERSE_A_ID, altMilestoneId);
    assert.equal(altStates.find((s) => s.entityId === charDocId)?.value, 'In Hiding');

    // Canonical M1 and M2 must remain completely untouched
    const canonM1States = resolveUniverseStateAtMilestone(plan, allDocuments, UNIVERSE_A_ID, m1Id);
    assert.equal(canonM1States.find((s) => s.entityId === charDocId)?.value, 'Active / Alive');

    const canonM2States = resolveUniverseStateAtMilestone(plan, allDocuments, UNIVERSE_A_ID, m2Id);
    assert.equal(canonM2States.find((s) => s.entityId === charDocId)?.value, 'Active / Alive');
    assert.equal(canonM2States.find((s) => s.entityId === charDocId)?.origin, 'inherited');
  });

  await t.test('6. Rejection of foreign-Universe entities', () => {
    // Attempting to assign foreignUnivDoc (Universe B) to Milestone M1 (Universe A) must throw
    assert.throws(
      () => {
        assignMilestoneState(
          basePlan,
          m1Id,
          foreignUnivDocId,
          'status',
          'active',
          undefined,
          undefined,
          allDocuments,
          { activeHouseId: HOUSE_A_ID, houses }
        );
      },
      /Foreign-Universe entity rejected/,
      'Must reject entity belonging to a different Universe'
    );
  });

  await t.test('7. Rejection of foreign-House entities', () => {
    // Attempting to assign foreignHouseDoc (House B) to Milestone in House A must throw
    assert.throws(
      () => {
        assignMilestoneState(
          basePlan,
          m1Id,
          foreignHouseDocId,
          'status',
          'active',
          undefined,
          undefined,
          allDocuments,
          { activeHouseId: HOUSE_A_ID, houses }
        );
      },
      /Foreign-House entity rejected/,
      'Must reject entity belonging to a different House'
    );
  });

  await t.test('8. No duplicate planning-desk entities are created on multiple saves', () => {
    // Save state at M1
    let plan = assignMilestoneState(
      basePlan,
      m1Id,
      charDocId,
      'status',
      'Active / Alive',
      undefined,
      undefined,
      allDocuments,
      { activeHouseId: HOUSE_A_ID, houses }
    );
    assert.equal(plan.entities.filter((e) => e.id === charDocId).length, 1);

    // Save state at M2 for the same entity
    plan = assignMilestoneState(
      plan,
      m2Id,
      charDocId,
      'status',
      'deceased',
      undefined,
      undefined,
      allDocuments,
      { activeHouseId: HOUSE_A_ID, houses }
    );
    assert.equal(plan.entities.filter((e) => e.id === charDocId).length, 1, 'Entities array must not contain duplicate entity registrations');

    // Update state again on M1
    plan = assignMilestoneState(
      plan,
      m1Id,
      charDocId,
      'status',
      'missing',
      undefined,
      undefined,
      allDocuments,
      { activeHouseId: HOUSE_A_ID, houses }
    );
    assert.equal(plan.entities.filter((e) => e.id === charDocId).length, 1, 'Entities array must still have exactly one entry');
  });

  await t.test('9. No entity Markdown modification', () => {
    // Simulating document detail on disk
    const originalDetail: DocumentDetail = {
      metadata: charDoc,
      content: charOriginalProse,
    };

    // State assignment operates strictly on Plan, not document content
    const updatedPlan = assignMilestoneState(
      basePlan,
      m1Id,
      charDocId,
      'status',
      'Active / Alive',
      undefined,
      undefined,
      allDocuments,
      { activeHouseId: HOUSE_A_ID, houses }
    );

    assert.ok(updatedPlan);
    assert.equal(originalDetail.content, charOriginalProse, 'Document prose content must be completely untouched');
    assert.equal(originalDetail.metadata.metadata_json, charDoc.metadata_json, 'Document metadata frontmatter must be untouched');
  });

  await t.test('10. No manuscript prose modification', () => {
    const chapterProse = 'Chapter 1: Dawn of Solaria\n\nUnder the light of the twin suns, the travelers gathered.';
    const manuscriptDoc: DocumentDetail = {
      metadata: {
        id: 'doc-chapter-1',
        title: 'Chapter 1',
        doc_type: 'manuscript',
        tags: [],
        house_id: HOUSE_A_ID,
        created_at: '2026-10-28T01:00:00Z',
        updated_at: '2026-10-28T01:00:00Z',
      },
      content: chapterProse,
    };

    const updatedPlan = assignMilestoneState(
      basePlan,
      m1Id,
      charDocId,
      'status',
      'Active / Alive',
      undefined,
      undefined,
      allDocuments,
      { activeHouseId: HOUSE_A_ID, houses }
    );

    assert.ok(updatedPlan);
    assert.equal(manuscriptDoc.content, chapterProse, 'Manuscript prose must remain 100% byte-for-byte identical');
  });

  await t.test('11. Removal of the redundant entity-header Web of Thought button', () => {
    // Render LorebookStudio for character document
    const charDetail: DocumentDetail = {
      metadata: charDoc,
      content: charOriginalProse,
    };

    const html = renderToStaticMarkup(
      React.createElement(LorebookStudio, {
        document: charDetail,
        allDocuments,
        activeHouse: houses[0],
        houses,
        saveStatus: 'idle',
        plan: basePlan,
        onSave: () => {},
        onSaveThought: async () => true,
      })
    );

    // Verify Write, Preview, and Export Lore actions exist
    assert.match(html, /Write/);
    assert.match(html, /Preview/);
    assert.match(html, /Export Lore/);

    // In Bug 2, the standalone "Web of Thought" button in the document header was removed
    // Ensure that the header button (which was next to Export Lore) is not rendered
    const hasHeaderWotButton = /<button[^>]*>[^<]*Web of Thought[^<]*<\/button>/i.test(html);
    assert.equal(hasHeaderWotButton, false, 'Redundant standalone Web of Thought button must be removed from character header');
  });

  await t.test('12. Preservation of Universe Dashboard Web of Thought', () => {
    // Render UniverseDashboard in overview
    const dashHtml = renderToStaticMarkup(
      React.createElement(UniverseDashboard, {
        universeId: UNIVERSE_A_ID,
        plan: basePlan,
        documents: allDocuments,
        activeHouse: houses[0],
        houses,
        onOpenDocument: () => {},
        onCreateEntity: () => {},
        onCreateChapter: async () => {},
        onSwitchUniverse: () => {},
      })
    );

    // Main tab navigation preserves Web of Thought
    assert.match(dashHtml, /Web of Thought/, 'Universe Dashboard must preserve Web of Thought navigation tab');

    // Render UniverseStateExplorer directly to verify Universe States
    const explorerHtml = renderToStaticMarkup(
      React.createElement(UniverseStateExplorer, {
        universeId: UNIVERSE_A_ID,
        universe: universeA,
        plan: basePlan,
        documents: allDocuments,
        activeHouse: houses[0],
        houses,
        onOpenDocument: () => {},
        onCreateEntity: () => {},
      })
    );

    assert.match(explorerHtml, /State at Milestone/, 'UniverseStateExplorer must render historical state explorer');
  });

  await t.test('13. Preservation of Echo historical navigation and reference dossier', () => {
    const echoEntity: any = {
      id: charDocId,
      name: 'test character',
      aliases: ['Test'],
      category: 'character',
      overview: 'A seasoned diplomat from the inner rings.',
      documentId: charDocId,
      guidedAttributes: {},
      customAttributes: [],
      relationships: [],
    };

    const resolvedState: ResolvedEntityState = {
      entityId: charDocId,
      entityTitle: 'test character',
      category: 'characters',
      propertyKey: 'status',
      value: 'Active / Alive',
      displayLabel: 'Active / Alive',
      origin: 'explicit',
      hasChangedAtThisMilestone: true,
      note: 'Coronation day',
    };

    let inspectedEntityId: string | null = null;
    let inspectedMilestoneId: string | null = null;

    const historicalContextData: any = {
      universeId: UNIVERSE_A_ID,
      milestoneId: m1Id,
      milestoneTitle: 'The Beginning',
      milestoneEra: 'Year 1',
      continuityName: 'Canonical History',
      branchId: null,
      resolvedState,
      onNavigateWebOfThought: (u: string, b: string | null, m: string | null, e: string | null) => {
        inspectedEntityId = e;
        inspectedMilestoneId = m;
      },
    };

    const html = renderToStaticMarkup(
      React.createElement(EchoDocumentationPopup, {
        entity: echoEntity,
        position: { top: 100, left: 100 },
        onClose: () => {},
        historicalContext: historicalContextData,
      })
    );

    // Verify historical context section renders properly in Echo popup
    assert.match(html, /Historical Context/, 'Echo dossier must display Historical Context header');
    assert.match(html, /The Beginning/, 'Echo dossier must display historical milestone title');
    assert.match(html, /Active \/ Alive/, 'Echo dossier must display resolved state');
    assert.match(html, /Inspect in Web of Thought/, 'Echo dossier must preserve "Inspect in Web of Thought" button');
  });
});
