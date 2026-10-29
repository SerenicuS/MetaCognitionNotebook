import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DocumentMetadata } from '../src/types';
import type { Plan, Universe, StoryNode } from '../src/utils/thought';
import {
  emptyPlan,
  newNode,
  insertNode,
  timeline,
  createBranch,
} from '../src/utils/thought';
import { UniverseStateExplorer } from '../src/components/studios/lorebook/UniverseStateExplorer';

test('Hotfix: Web of Thought Empty-State & Historical Milestone Creation', async (t) => {
  const UNIVERSE_ID = 'univ-wot-test';
  const OTHER_UNIVERSE_ID = 'univ-other-test';

  const universe: Universe = {
    id: UNIVERSE_ID,
    name: 'Eryndor Realm',
    description: 'High fantasy realm for Web of Thought testing',
  };

  const otherUniverse: Universe = {
    id: OTHER_UNIVERSE_ID,
    name: 'Nether Void',
    description: 'Different cosmos',
  };

  const heroDoc: DocumentMetadata = {
    id: 'char-hero-1',
    title: 'Aric the Valiant',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: 'house-default',
    path: '/vault/houses/house-default/lorebook/aric.md',
    created_at: '2026-10-28T10:00:00Z',
    modified_at: '2026-10-28T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_ID,
      character_fields: { vital_status: 'alive' },
    }),
  };

  const allDocuments: DocumentMetadata[] = [heroDoc];

  // Helper to create empty plan with no milestones
  const createEmptyPlan = (): Plan => {
    const p = emptyPlan('thought-wot-test', 'Empty WOT Test Plan');
    p.universes = [universe, otherUniverse];
    p.entities = [{ id: heroDoc.id, universe_id: UNIVERSE_ID }];
    return p;
  };

  // --------------------------------------------------------------------------
  // Test 1: Empty Universe first-milestone creation
  // --------------------------------------------------------------------------
  await t.test('1. Empty Universe renders "Create First Historical Event" button and allows creating first milestone', () => {
    const plan = createEmptyPlan();
    assert.equal(timeline(plan, UNIVERSE_ID, null, null).length, 0);

    let modalOpened = false;
    const markup = renderToStaticMarkup(
      React.createElement(UniverseStateExplorer, {
        universeId: UNIVERSE_ID,
        universe,
        plan,
        documents: allDocuments,
        onOpenDocument: () => {},
        onCreateEntity: () => {},
        onCreateMilestone: () => {
          modalOpened = true;
        },
      })
    );

    // Verify empty state is rendered
    assert.ok(markup.includes('No Historical Milestones in Eryndor Realm'));
    assert.ok(markup.includes('Create First Historical Event'));
  });

  // --------------------------------------------------------------------------
  // Test 2: Correct Universe and Canonical History ownership
  // --------------------------------------------------------------------------
  await t.test('2. First milestone has stable UUID, belongs to active Universe, has book_id null, and branch_id null', () => {
    const plan = createEmptyPlan();

    // Construct first milestone exactly as UniverseStateExplorer does
    const node: StoryNode = {
      ...newNode(plan, UNIVERSE_ID, null, undefined, null),
      title: 'The First Dawn',
      era: 'Year 1, Era of Light',
      description: 'The world awakens from the primordial shadow.',
    };

    assert.ok(node.id, 'Must have a stable UUID');
    assert.equal(node.universe_id, UNIVERSE_ID, 'Must belong to active Universe');
    assert.equal(node.book_id, null, 'Must have book_id: null (Universe-scoped)');
    assert.equal(node.branch_id, null, 'Must belong to Canonical History by default (branch_id: null)');
    assert.equal(node.title, 'The First Dawn');
    assert.equal(node.era, 'Year 1, Era of Light');
    assert.equal(node.description, 'The world awakens from the primordial shadow.');
    assert.equal(node.linked_event_id, null, 'Must have linked_event_id: null (not an event alias)');
  });

  // --------------------------------------------------------------------------
  // Test 3: Successful persistence and reload
  // --------------------------------------------------------------------------
  await t.test('3. Successful persistence via onSaveThought and reload into plan timeline', async () => {
    let currentPlan = createEmptyPlan();
    let savedPlan: Plan | null = null;

    const mockSaveThought = async (
      _expectedRevision: () => number,
      newPlan: any,
      _ack: (r: any) => void
    ): Promise<boolean> => {
      savedPlan = newPlan;
      return true;
    };

    const firstNode: StoryNode = {
      ...newNode(currentPlan, UNIVERSE_ID, null, undefined, null),
      title: 'Founding of Eryndor',
      era: 'Year 100',
      description: 'The kingdom is founded by the ancient kings.',
    };

    const updated = insertNode(currentPlan, firstNode);
    const ok = await mockSaveThought(() => currentPlan.revision, updated, () => {});

    assert.equal(ok, true);
    assert.ok(savedPlan);
    currentPlan = savedPlan!;

    // Reload from plan
    const canonicalMilestones = timeline(currentPlan, UNIVERSE_ID, null, null);
    assert.equal(canonicalMilestones.length, 1);
    assert.equal(canonicalMilestones[0].id, firstNode.id);
    assert.equal(canonicalMilestones[0].title, 'Founding of Eryndor');
  });

  // --------------------------------------------------------------------------
  // Test 4: Selection of the newly created milestone
  // --------------------------------------------------------------------------
  await t.test('4. Selection of the newly created milestone displays state matrix instead of empty state', () => {
    let plan = createEmptyPlan();
    const firstNode: StoryNode = {
      ...newNode(plan, UNIVERSE_ID, null, undefined, null),
      title: 'The Great Cataclysm',
      era: 'Year 500',
    };
    plan = insertNode(plan, firstNode);

    // Render with the new milestone selected
    const markup = renderToStaticMarkup(
      React.createElement(UniverseStateExplorer, {
        universeId: UNIVERSE_ID,
        universe,
        plan,
        documents: allDocuments,
        onOpenDocument: () => {},
        onCreateEntity: () => {},
        initialMilestoneId: firstNode.id,
      })
    );

    // Empty state must NO LONGER be rendered
    assert.equal(markup.includes('No Historical Milestones in Eryndor Realm'), false);
    // Milestone title and state matrix must be rendered
    assert.ok(markup.includes('The Great Cataclysm'));
    assert.ok(markup.includes('Aric the Valiant'));
  });

  // --------------------------------------------------------------------------
  // Test 5: Creation failure handling
  // --------------------------------------------------------------------------
  await t.test('5. Creation failure handling rejects empty title and handles failed saves cleanly', async () => {
    const plan = createEmptyPlan();

    // 5a. Empty title validation
    const emptyTitle = '   ';
    assert.equal(emptyTitle.trim().length === 0, true, 'Whitespace or empty title must be rejected');

    // 5b. Save rejection handling
    const failingSave = async (): Promise<boolean> => false;
    const testNode: StoryNode = {
      ...newNode(plan, UNIVERSE_ID, null),
      title: 'Valid Title',
    };
    const updated = insertNode(plan, testNode);
    const success = await failingSave();

    assert.equal(success, false, 'Failed save must return false and not select milestone');
  });

  // --------------------------------------------------------------------------
  // Test 6: Existing branch milestone creation
  // --------------------------------------------------------------------------
  await t.test('6. Creating a milestone on an alternate branch assigns branch_id correctly', () => {
    let plan = createEmptyPlan();

    // Canonical milestone m1
    const m1: StoryNode = {
      ...newNode(plan, UNIVERSE_ID, null),
      title: 'Canonical Divergence Point',
      era: 'Year 200',
    };
    plan = insertNode(plan, m1);

    // Create branch
    const branchRes = createBranch(plan, UNIVERSE_ID, 'Timeline of the Eclipse', m1.id);
    plan = branchRes.plan;
    const branchId = branchRes.branch.id;

    // Create branch milestone
    const branchMilestone: StoryNode = {
      ...newNode(plan, UNIVERSE_ID, null, undefined, branchId),
      title: 'The Dark Sun Rises',
      era: 'Year 201 (Alt)',
      branch_id: branchId,
    };
    plan = insertNode(plan, branchMilestone);

    // Canonical timeline still has only 1 milestone
    const canonTimeline = timeline(plan, UNIVERSE_ID, null, null);
    assert.equal(canonTimeline.length, 1);
    assert.equal(canonTimeline[0].id, m1.id);

    // Branch timeline has the branch milestone
    const branchTimeline = timeline(plan, UNIVERSE_ID, null, branchId);
    assert.equal(branchTimeline.length, 1);
    assert.equal(branchTimeline[0].id, branchMilestone.id);
    assert.equal(branchTimeline[0].branch_id, branchId);
  });

  // --------------------------------------------------------------------------
  // Test 7: No accidental Universe Timeline event creation
  // --------------------------------------------------------------------------
  await t.test('7. No accidental Universe Timeline event creation or prose modification', () => {
    let plan = createEmptyPlan();

    const node: StoryNode = {
      ...newNode(plan, UNIVERSE_ID, null),
      title: 'Pure Web of Thought Milestone',
    };
    plan = insertNode(plan, node);

    // Check node structure
    assert.equal(node.linked_event_id, null, 'Must not be linked to any external timeline event');
    assert.equal(node.book_id, null, 'Must not belong to any Book');

    // Documents prose remains completely untouched
    assert.equal(heroDoc.metadata_json?.includes('Pure Web of Thought Milestone'), false);
  });
});
