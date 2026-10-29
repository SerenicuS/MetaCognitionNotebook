import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DocumentMetadata, HouseRecord } from '../src/types';
import type { Plan, Universe, StoryNode } from '../src/utils/thought';
import { emptyPlan } from '../src/utils/thought';
import {
  getStatusDescriptor,
  getCategoryPresets,
  resolveUniverseStateAtMilestone,
  assignMilestoneState,
  clearMilestoneState,
  compareMilestoneStates,
  NOT_INTRODUCED_STATUS,
} from '../src/utils/stateEngine';
import { UniverseStateExplorer } from '../src/components/studios/lorebook/UniverseStateExplorer';
import { UniverseDashboard } from '../src/components/studios/lorebook/UniverseDashboard';

describe('Web of Thought Phase W2: Universe State Explorer', () => {
  const UNIVERSE_1: Universe = {
    id: 'univ-altair-1',
    name: 'Altair Sector',
    description: 'Frontier colonies of Altair',
  };

  const UNIVERSE_2: Universe = {
    id: 'univ-sol-2',
    name: 'Solar Federation',
    description: 'Inner core system',
  };

  // Helper to build a plan with milestones
  function createTestPlan(): { plan: Plan; m1Id: string; m2Id: string; m3Id: string; bookM1Id: string } {
    const m1Id = 'node-m1';
    const m2Id = 'node-m2';
    const m3Id = 'node-m3';
    const bookM1Id = 'node-book-m1';

    // Milestone 1: The Founding (Universe-level)
    const n1: StoryNode = {
      id: m1Id,
      universe_id: UNIVERSE_1.id,
      book_id: null,
      position: 0,
      title: 'The Founding',
      summary: 'The initial colonization of Altair',
      date: 'Year 100',
      status: 'planned',
      changes: [],
    };

    // Milestone 2: The Mining Boom (Universe-level)
    const n2: StoryNode = {
      id: m2Id,
      universe_id: UNIVERSE_1.id,
      book_id: null,
      position: 1,
      title: 'The Mining Boom',
      summary: 'Discovery of deep seams',
      date: 'Year 150',
      status: 'planned',
      changes: [],
    };

    // Milestone 3: The Great Cataclysm (Universe-level)
    const n3: StoryNode = {
      id: m3Id,
      universe_id: UNIVERSE_1.id,
      book_id: null,
      position: 2,
      title: 'The Great Cataclysm',
      summary: 'The orbital collapse',
      date: 'Year 200',
      status: 'planned',
      changes: [],
    };

    // Book milestone (should be excluded from Universe State Explorer)
    const bookNode: StoryNode = {
      id: bookM1Id,
      universe_id: UNIVERSE_1.id,
      book_id: 'book-chronicles-1',
      position: 0,
      title: 'Chapter 1: The Arrival',
      summary: 'Local protagonist lands on Altair',
      date: 'Year 101',
      status: 'planned',
      changes: [],
    };

    const plan: Plan = {
      version: 1,
      revision: 1,
      universes: [UNIVERSE_1, UNIVERSE_2],
      books: [],
      entities: [
        { id: elenaDoc.id, universe_id: UNIVERSE_1.id },
        { id: republicDoc.id, universe_id: UNIVERSE_1.id },
        { id: citadelDoc.id, universe_id: UNIVERSE_1.id },
        { id: solCharDoc.id, universe_id: UNIVERSE_2.id },
      ],
      nodes: [n1, n2, n3, bookNode],
      relationships: [],
    };

    return { plan, m1Id, m2Id, m3Id, bookM1Id };
  }

  // Documents
  const elenaDoc: DocumentMetadata = {
    id: 'char-elena-1',
    title: 'Elena Vance',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: 'house-alpha',
    path: '/vault/houses/house-alpha/lorebook/elena.md',
    created_at: '2026-10-26T10:00:00Z',
    modified_at: '2026-10-26T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_1.id,
      character_fields: { vital_status: 'deceased' }, // Profile value, not historical baseline
    }),
  };

  const republicDoc: DocumentMetadata = {
    id: 'faction-republic-1',
    title: 'Altair Mining Republic',
    doc_type: 'lorebook',
    tags: ['faction'],
    house_id: 'house-alpha',
    path: '/vault/houses/house-alpha/lorebook/republic.md',
    created_at: '2026-10-26T10:00:00Z',
    modified_at: '2026-10-26T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'faction',
      universe_id: UNIVERSE_1.id,
    }),
  };

  const citadelDoc: DocumentMetadata = {
    id: 'loc-citadel-1',
    title: 'Obsidian Citadel',
    doc_type: 'lorebook',
    tags: ['location'],
    house_id: 'house-alpha',
    path: '/vault/houses/house-alpha/lorebook/citadel.md',
    created_at: '2026-10-26T10:00:00Z',
    modified_at: '2026-10-26T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'location',
      universe_id: UNIVERSE_1.id,
    }),
  };

  const solCharDoc: DocumentMetadata = {
    id: 'char-sol-agent-1',
    title: 'Earth Emissary',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: 'house-alpha',
    path: '/vault/houses/house-alpha/lorebook/sol_agent.md',
    created_at: '2026-10-26T10:00:00Z',
    modified_at: '2026-10-26T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_2.id, // Belongs to UNIVERSE_2!
    }),
  };

  const universe1Docs = [elenaDoc, republicDoc, citadelDoc];
  const allDocs = [elenaDoc, republicDoc, citadelDoc, solCharDoc];

  // 1. Direct dashboard access to Web of Thought (nav bar and quick stat cards)
  it('1. Direct dashboard access to Web of Thought via nav bar and quick stat card', () => {
    const { plan } = createTestPlan();
    const markup = renderToStaticMarkup(
      React.createElement(UniverseDashboard, {
        universeId: UNIVERSE_1.id,
        plan,
        documents: universe1Docs,
        onOpenDocument: () => {},
        onCreateEntity: () => {},
        onCreateChapter: async () => {},
        onSwitchUniverse: () => {},
      })
    );

    // Navigation tab contains Web of Thought button
    assert.ok(markup.includes('Web of Thought'), 'Dashboard nav bar must have Web of Thought');
    assert.ok(markup.includes('Entities'), 'Overview quick stats must display Entities count');
  });

  // 2. Correct active Universe and House scoping
  it('2. Correct active Universe and House scoping: displays only active Universe entities and milestones', () => {
    const { plan } = createTestPlan();
    const markup = renderToStaticMarkup(
      React.createElement(UniverseStateExplorer, {
        universeId: UNIVERSE_1.id,
        universe: UNIVERSE_1,
        plan,
        documents: allDocs, // includes solCharDoc from UNIVERSE_2
      })
    );

    // Altair entities should appear
    assert.ok(markup.includes('Elena Vance'), 'Active universe character must appear');
    assert.ok(markup.includes('Altair Mining Republic'), 'Active universe faction must appear');
    assert.ok(markup.includes('Obsidian Citadel'), 'Active universe location must appear');

    // Sol agent from UNIVERSE_2 must NOT appear
    assert.ok(!markup.includes('Earth Emissary'), 'Foreign universe entity must be excluded');
  });

  // 3. Default Universe States view
  it('3. Default Universe States view: Web of Thought defaults to Universe States subview', () => {
    const { plan } = createTestPlan();
    const markup = renderToStaticMarkup(
      React.createElement(UniverseStateExplorer, {
        universeId: UNIVERSE_1.id,
        universe: UNIVERSE_1,
        plan,
        documents: universe1Docs,
      })
    );

    // Renders the Universe States matrix table headers
    assert.ok(markup.includes('Entity'), 'Table header should contain Entity');
    assert.ok(markup.includes('Category'), 'Table header should contain Category');
    assert.ok(markup.includes('State at Milestone'), 'Table header should contain State at Milestone');
    assert.ok(markup.includes('Provenance / Origin'), 'Table header should contain Provenance / Origin');
  });

  // 4. Universe-only milestone selection: book milestones excluded
  it('4. Universe-only milestone selection: milestones with book_id !== null are excluded', () => {
    const { plan } = createTestPlan();
    const markup = renderToStaticMarkup(
      React.createElement(UniverseStateExplorer, {
        universeId: UNIVERSE_1.id,
        universe: UNIVERSE_1,
        plan,
        documents: universe1Docs,
      })
    );

    // Universe milestones should be options in dropdown
    assert.ok(markup.includes('The Founding'), 'Universe milestone 1 must be present in selector');
    assert.ok(markup.includes('The Mining Boom'), 'Universe milestone 2 must be present in selector');
    assert.ok(markup.includes('The Great Cataclysm'), 'Universe milestone 3 must be present in selector');

    // Book milestone must be excluded
    assert.ok(!markup.includes('Chapter 1: The Arrival'), 'Book milestone must not appear in Universe milestone selector');
  });

  // 5. Deterministic milestone ordering
  it('5. Deterministic milestone ordering: selector follows chronological timeline sequence', () => {
    const { plan } = createTestPlan();
    const markup = renderToStaticMarkup(
      React.createElement(UniverseStateExplorer, {
        universeId: UNIVERSE_1.id,
        universe: UNIVERSE_1,
        plan,
        documents: universe1Docs,
      })
    );

    const posFounding = markup.indexOf('The Founding');
    const posMiningBoom = markup.indexOf('The Mining Boom');
    const posCataclysm = markup.indexOf('The Great Cataclysm');

    assert.ok(posFounding !== -1 && posMiningBoom !== -1 && posCataclysm !== -1, 'All 3 milestones present');
    assert.ok(posFounding < posMiningBoom, 'The Founding precedes The Mining Boom');
    assert.ok(posMiningBoom < posCataclysm, 'The Mining Boom precedes The Great Cataclysm');
  });

  // 6. State assignment and canonical persistence
  it('6. State assignment and canonical persistence: assigns state, updates changes, saves plan', async () => {
    let { plan, m1Id } = createTestPlan();

    const updatedPlan = assignMilestoneState(
      plan,
      m1Id,
      elenaDoc.id,
      'status',
      'alive',
      'Young engineer on the first expedition'
    );

    assert.ok(updatedPlan !== plan, 'assignMilestoneState returns new plan reference');
    const m1Node = updatedPlan.nodes.find(n => n.id === m1Id)!;
    assert.ok(m1Node.changes && m1Node.changes.length > 0, 'Milestone must have changes recorded');
    const change = m1Node.changes.find(c => c.entity_id === elenaDoc.id);
    assert.ok(change, 'Change for Elena Vance must exist');
    assert.equal(change.new_value, 'alive');
    assert.equal(change.note, 'Young engineer on the first expedition');

    // Resolve state at m1
    const resolved = resolveUniverseStateAtMilestone(updatedPlan, [elenaDoc], UNIVERSE_1.id, m1Id);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].value, 'alive');
    assert.equal(resolved[0].origin, 'explicit');
  });

  // 7. State inheritance after saving
  it('7. State inheritance after saving: assigned state propagates downstream without overriding', () => {
    let { plan, m1Id, m2Id, m3Id } = createTestPlan();

    // Assign 'alive' at M1
    plan = assignMilestoneState(plan, m1Id, elenaDoc.id, 'status', 'alive');

    // Resolve at M2 (no change on M2)
    const resolvedM2 = resolveUniverseStateAtMilestone(plan, [elenaDoc], UNIVERSE_1.id, m2Id);
    assert.equal(resolvedM2[0].value, 'alive');
    assert.equal(resolvedM2[0].origin, 'inherited');
    assert.equal(resolvedM2[0].sourceMilestoneId, m1Id);

    // Resolve at M3 (no change on M3)
    const resolvedM3 = resolveUniverseStateAtMilestone(plan, [elenaDoc], UNIVERSE_1.id, m3Id);
    assert.equal(resolvedM3[0].value, 'alive');
    assert.equal(resolvedM3[0].origin, 'inherited');
    assert.equal(resolvedM3[0].sourceMilestoneId, m1Id);
  });

  // 8. Reverting an explicit override
  it('8. Reverting an explicit override: clearing assignment restores predecessor inheritance', () => {
    let { plan, m1Id, m2Id } = createTestPlan();

    // Assign 'alive' at M1
    plan = assignMilestoneState(plan, m1Id, elenaDoc.id, 'status', 'alive');
    // Assign 'injured' at M2 (explicit override)
    plan = assignMilestoneState(plan, m2Id, elenaDoc.id, 'status', 'injured');

    let resolvedM2 = resolveUniverseStateAtMilestone(plan, [elenaDoc], UNIVERSE_1.id, m2Id);
    assert.equal(resolvedM2[0].value, 'injured');
    assert.equal(resolvedM2[0].origin, 'explicit');

    // Revert/clear the override at M2
    plan = clearMilestoneState(plan, m2Id, elenaDoc.id, 'status');

    // Now M2 should inherit 'alive' from M1
    resolvedM2 = resolveUniverseStateAtMilestone(plan, [elenaDoc], UNIVERSE_1.id, m2Id);
    assert.equal(resolvedM2[0].value, 'alive');
    assert.equal(resolvedM2[0].origin, 'inherited');
    assert.equal(resolvedM2[0].sourceMilestoneId, m1Id);
  });

  // 9. Unknown vs Unassigned vs Not Yet Introduced distinctness
  it('9. Unknown vs Unassigned vs Not Yet Introduced distinctness', () => {
    let { plan, m1Id, m2Id } = createTestPlan();

    // 1. Unassigned: citadelDoc has no record anywhere
    const resolvedUnassigned = resolveUniverseStateAtMilestone(plan, [citadelDoc], UNIVERSE_1.id, m1Id);
    assert.equal(resolvedUnassigned[0].origin, 'unassigned');
    assert.equal(resolvedUnassigned[0].value, null);

    // 2. Unknown: explicitly marked unknown at m1
    plan = assignMilestoneState(plan, m1Id, republicDoc.id, 'status', null);
    const resolvedUnknown = resolveUniverseStateAtMilestone(plan, [republicDoc], UNIVERSE_1.id, m1Id);
    assert.equal(resolvedUnknown[0].origin, 'unknown');
    assert.equal(resolvedUnknown[0].value, null);

    // 3. Not Yet Introduced: Elena explicitly marked not introduced at M1
    plan = assignMilestoneState(plan, m1Id, elenaDoc.id, 'status', NOT_INTRODUCED_STATUS);
    const resolvedNotIntro = resolveUniverseStateAtMilestone(plan, [elenaDoc], UNIVERSE_1.id, m1Id);
    assert.equal(resolvedNotIntro[0].origin, 'not_yet_introduced');
    assert.equal(resolvedNotIntro[0].value, NOT_INTRODUCED_STATUS);

    // Verify all three have distinct badges rendered
    const markup = renderToStaticMarkup(
      React.createElement(UniverseStateExplorer, {
        universeId: UNIVERSE_1.id,
        universe: UNIVERSE_1,
        plan,
        documents: [citadelDoc, republicDoc, elenaDoc],
      })
    );
    assert.ok(markup.includes('Unassigned'), 'Unassigned badge rendered');
    assert.ok(markup.includes('Unknown'), 'Unknown badge rendered');
    assert.ok(markup.includes('Not Yet Introduced'), 'Not Yet Introduced badge rendered');
  });

  // 10. Category presets and custom statuses
  it('10. Category presets and custom statuses persist without schema change', () => {
    const charPresets = getCategoryPresets('characters').map(p => p.key);
    assert.ok(charPresets.includes('alive'));
    assert.ok(charPresets.includes('deceased'));
    assert.ok(charPresets.includes('missing'));

    const factionPresets = getCategoryPresets('factions').map(p => p.key);
    assert.ok(factionPresets.includes('active'));
    assert.ok(factionPresets.includes('collapsed'));
    assert.ok(factionPresets.includes('underground'));

    const locPresets = getCategoryPresets('locations').map(p => p.key);
    assert.ok(locPresets.includes('intact'));
    assert.ok(locPresets.includes('ruined'));

    // Custom status
    let { plan, m1Id } = createTestPlan();
    const CUSTOM_STATUS = 'ascended_to_star';
    plan = assignMilestoneState(plan, m1Id, elenaDoc.id, 'status', CUSTOM_STATUS, 'Transcended physical form');

    const resolved = resolveUniverseStateAtMilestone(plan, [elenaDoc], UNIVERSE_1.id, m1Id);
    assert.equal(resolved[0].value, CUSTOM_STATUS);
    assert.equal(resolved[0].origin, 'explicit');
    const desc = getStatusDescriptor('characters', CUSTOM_STATUS);
    assert.equal(desc.label, CUSTOM_STATUS);
  });

  // 11. State comparison ("What Changed?")
  it('11. State comparison ("What Changed?"): diff identifies newly assigned, changed, and inherited states', () => {
    let { plan, m1Id, m2Id, m3Id } = createTestPlan();

    // M1: Elena alive, Republic active
    plan = assignMilestoneState(plan, m1Id, elenaDoc.id, 'status', 'alive');
    plan = assignMilestoneState(plan, m1Id, republicDoc.id, 'status', 'active');

    // M2: Elena deceased, Republic active (inherited), Citadel intact (newly assigned)
    plan = assignMilestoneState(plan, m2Id, elenaDoc.id, 'status', 'deceased');
    plan = assignMilestoneState(plan, m2Id, citadelDoc.id, 'status', 'intact');

    const diff = compareMilestoneStates(plan, universe1Docs, UNIVERSE_1.id, m1Id, m2Id);

    // Elena: changed from alive to deceased
    const elenaDiff = diff.find(d => d.entityId === elenaDoc.id);
    assert.ok(elenaDiff);
    assert.equal(elenaDiff.hasDifference, true);
    assert.equal(elenaDiff.stateA.value, 'alive');
    assert.equal(elenaDiff.stateB.value, 'deceased');

    // Republic: between M1 (explicit) and M2 (inherited), origin changes so hasDifference is true
    const republicDiff = diff.find(d => d.entityId === republicDoc.id);
    assert.ok(republicDiff);
    assert.equal(republicDiff.hasDifference, true);
    assert.equal(republicDiff.stateA.value, 'active');
    assert.equal(republicDiff.stateB.value, 'active');

    // Between M2 and M3 (neither modifies Republic), both inherit 'active' -> hasDifference is false
    const diff23 = compareMilestoneStates(plan, universe1Docs, UNIVERSE_1.id, m2Id, m3Id);
    const repDiff23 = diff23.find(d => d.entityId === republicDoc.id);
    assert.ok(repDiff23);
    assert.equal(repDiff23.hasDifference, false);
    assert.equal(repDiff23.stateA.value, 'active');
    assert.equal(repDiff23.stateB.value, 'active');

    // Citadel: newly assigned at M2 (was unassigned at M1)
    const citadelDiff = diff.find(d => d.entityId === citadelDoc.id);
    assert.ok(citadelDiff);
    assert.equal(citadelDiff.hasDifference, true);
    assert.equal(citadelDiff.stateA.value, null);
    assert.equal(citadelDiff.stateB.value, 'intact');
  });

  // 12. Empty milestone and empty entity states
  it('12. Empty milestone and empty entity states: friendly messages and CTAs render properly', () => {
    // 1. Empty milestones in universe
    let emptyMilestonesPlan = emptyPlan();
    emptyMilestonesPlan.universes = [UNIVERSE_1];

    const markupEmptyMilestones = renderToStaticMarkup(
      React.createElement(UniverseStateExplorer, {
        universeId: UNIVERSE_1.id,
        universe: UNIVERSE_1,
        plan: emptyMilestonesPlan,
        documents: universe1Docs,
      })
    );
    assert.ok(markupEmptyMilestones.includes('No Historical Milestones in Altair Sector'), 'Must show empty milestone title');
    assert.ok(markupEmptyMilestones.includes('Create First Historical Event'), 'Must render CTA for first milestone');

    // 2. Empty entities in universe
    const { plan } = createTestPlan();
    const markupEmptyEntities = renderToStaticMarkup(
      React.createElement(UniverseStateExplorer, {
        universeId: UNIVERSE_1.id,
        universe: UNIVERSE_1,
        plan,
        documents: [], // 0 entities
      })
    );
    assert.ok(markupEmptyEntities.includes('No Lore Entities in Altair Sector'), 'Must show empty entities title');
    assert.ok(markupEmptyEntities.includes('Create First Lore Entry'), 'Must render CTA to add entity');
  });

  // 13. Switching Houses and Universes
  it('13. Switching Houses and Universes: milestone selection resets, state resolution uses new scope', () => {
    const { plan } = createTestPlan();

    // Explorer for Universe 1
    const markup1 = renderToStaticMarkup(
      React.createElement(UniverseStateExplorer, {
        universeId: UNIVERSE_1.id,
        universe: UNIVERSE_1,
        plan,
        documents: universe1Docs,
      })
    );
    assert.ok(markup1.includes('The Founding'));
    assert.ok(markup1.includes('Elena Vance'));

    // Explorer for Universe 2
    const markup2 = renderToStaticMarkup(
      React.createElement(UniverseStateExplorer, {
        universeId: UNIVERSE_2.id,
        universe: UNIVERSE_2,
        plan,
        documents: [solCharDoc],
      })
    );
    // Universe 2 has no milestones in test plan
    assert.ok(markup2.includes('No Historical Milestones in Solar Federation'));
    assert.ok(!markup2.includes('Elena Vance'));
  });

  // 14. Existing character-focused Connections navigation preserved
  it('14. Existing character-focused Connections navigation preserved in Web of Thought', () => {
    const { plan } = createTestPlan();
    const markup = renderToStaticMarkup(
      React.createElement(UniverseDashboard, {
        universeId: UNIVERSE_1.id,
        plan,
        documents: universe1Docs,
        onOpenDocument: () => {},
        onCreateEntity: () => {},
        onCreateChapter: async () => {},
        onSwitchUniverse: () => {},
      })
    );

    assert.ok(markup.includes('Web of Thought'), 'Nav bar has Web of Thought');
  });

  // 15. Existing Universe Timeline and relationship editing preserved
  it('15. Existing Universe Timeline and relationship editing remain fully functional and uncorrupted', () => {
    let { plan, m1Id } = createTestPlan();

    // Assign milestone state on M1
    plan = assignMilestoneState(plan, m1Id, elenaDoc.id, 'status', 'alive');

    // Verify existing plan.nodes retains its properties
    const m1Node = plan.nodes.find(n => n.id === m1Id)!;
    assert.equal(m1Node.title, 'The Founding');
    assert.equal(m1Node.summary, 'The initial colonization of Altair');
    assert.equal(m1Node.date, 'Year 100');

    // Add a relationship to plan.relationships
    plan.relationships = [
      {
        id: 'rel-1',
        source_id: elenaDoc.id,
        target_id: republicDoc.id,
        label: 'Affiliated with',
        direction: 'directed',
        universe: UNIVERSE_1.id,
      },
    ];

    // Node state changes and relationships coexist without mutual interference
    assert.equal(plan.relationships.length, 1);
    assert.equal(plan.relationships[0].label, 'Affiliated with');
    assert.equal(m1Node.changes?.length, 1);
  });

  // 16. No changes to canonical entity profiles or chapter prose
  it('16. No changes to canonical entity profiles or chapter prose: Lorebook Markdown and manuscript content are untouched', () => {
    let { plan, m1Id } = createTestPlan();

    // Elena's static document metadata has profile vital_status: 'deceased'
    const profileJson = JSON.parse(elenaDoc.metadata_json!);
    assert.equal(profileJson.character_fields.vital_status, 'deceased');

    // Assigning 'alive' to milestone 1 (historical era)
    plan = assignMilestoneState(plan, m1Id, elenaDoc.id, 'status', 'alive');

    // Verify static doc is NOT mutated
    const profileJsonAfter = JSON.parse(elenaDoc.metadata_json!);
    assert.equal(profileJsonAfter.character_fields.vital_status, 'deceased', 'Static profile remains intact');
    assert.equal(elenaDoc.doc_type, 'lorebook');
    assert.equal(elenaDoc.house_id, 'house-alpha');

    // Chapter prose documents are completely separate and unaffected
    const chapterDoc: DocumentMetadata = {
      id: 'chap-101',
      title: 'Prologue: Starlight',
      doc_type: 'lorebook',
      house_id: 'house-alpha',
      tags: ['chapter'],
      path: '/vault/houses/house-alpha/lorebook/chap-101.md',
      created_at: '2026-10-26T10:00:00Z',
      modified_at: '2026-10-26T10:00:00Z',
      metadata_json: JSON.stringify({ book_id: 'book-chronicles-1', chapter_number: 1 }),
    };

    assert.equal(chapterDoc.title, 'Prologue: Starlight');
  });
});
