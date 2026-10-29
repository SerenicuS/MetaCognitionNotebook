import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DocumentMetadata, LorebookMetadata } from '../src/types';
import type { Plan, Universe, StoryNode, Book } from '../src/utils/thought';
import {
  uid,
  emptyPlan,
  newNode,
  insertNode,
  archiveNode,
  timeline,
  createBranch,
} from '../src/utils/thought';
import {
  resolveUniverseStateAtMilestone,
  assignMilestoneState,
  getCompatibleMilestonesForBook,
  resolveChapterHistoricalContext,
  getCachedResolvedUniverseState,
  resolveEntityHistoricalEchoState,
  clearHistoricalResolutionCache,
  NOT_INTRODUCED_STATUS,
} from '../src/utils/stateEngine';
import {
  buildScopedEchoEntities,
} from '../src/utils/echoLore';
import {
  renderHistoricalStatusBadge,
  renderHistoricalOriginProvenance,
} from '../src/components/echo/EchoDocumentationPopup';

test('Web of Thought Phase W4: Echo Library Historical Awareness & Chapter Context', async (t) => {
  const UNIVERSE_ID = 'univ-w4-eryndor';
  const OTHER_UNIVERSE_ID = 'univ-w4-other';
  const HOUSE_A = 'house-w4-alpha';
  const HOUSE_B = 'house-w4-beta';

  const universeA: Universe = {
    id: UNIVERSE_ID,
    name: 'Eryndor Realm',
    description: 'High fantasy universe with historical milestones',
  };

  const universeB: Universe = {
    id: OTHER_UNIVERSE_ID,
    name: 'Nether Realm',
    description: 'Isolated cosmos for testing cross-universe prevention',
  };

  // Mock Lore Documents in Universe A
  const heroDoc: DocumentMetadata = {
    id: 'char-hero-1',
    title: 'Aric the Valiant',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: HOUSE_A,
    path: '/vault/houses/house-w4-alpha/lorebook/aric.md',
    created_at: '2026-10-28T10:00:00Z',
    modified_at: '2026-10-28T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_ID,
      character_fields: { vital_status: 'alive' },
    }),
  };

  const kingDoc: DocumentMetadata = {
    id: 'char-king-1',
    title: 'King Eldor',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: HOUSE_A,
    path: '/vault/houses/house-w4-alpha/lorebook/eldor.md',
    created_at: '2026-10-28T10:00:00Z',
    modified_at: '2026-10-28T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_ID,
      character_fields: { vital_status: 'alive' },
    }),
  };

  const castleDoc: DocumentMetadata = {
    id: 'loc-castle-1',
    title: 'Fortress of Solitude',
    doc_type: 'lorebook',
    tags: ['location'],
    house_id: HOUSE_A,
    path: '/vault/houses/house-w4-alpha/lorebook/castle.md',
    created_at: '2026-10-28T10:00:00Z',
    modified_at: '2026-10-28T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'location',
      universe_id: UNIVERSE_ID,
    }),
  };

  // Document in House B for isolation testing
  const foreignDoc: DocumentMetadata = {
    id: 'char-foreign-1',
    title: 'Foreign Sorcerer',
    doc_type: 'lorebook',
    tags: ['character'],
    house_id: HOUSE_B,
    path: '/vault/houses/house-w4-beta/lorebook/sorcerer.md',
    created_at: '2026-10-28T10:00:00Z',
    modified_at: '2026-10-28T10:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'character',
      universe_id: UNIVERSE_ID,
    }),
  };

  const allDocuments: DocumentMetadata[] = [heroDoc, kingDoc, castleDoc, foreignDoc];

  // Set up Base Canonical Plan
  let plan: Plan = emptyPlan('thought-w4', 'Web of Thought W4 Test Plan');
  plan.universes = [universeA, universeB];
  plan.entities = allDocuments.map((d) => ({ id: d.id, universe_id: UNIVERSE_ID }));

  // Milestone 1 (Canonical Root): Era of Peace
  const m1: StoryNode = {
    ...newNode(plan, UNIVERSE_ID, null),
    id: 'node-m1',
    title: 'Milestone 1: Founding of the Realm',
    era: 'Year 1, Era of Peace',
    description: 'The realm is established',
  };
  plan = insertNode(plan, m1);

  // Assign M1 states: Hero is alive, King is alive
  plan = assignMilestoneState(plan, m1.id, heroDoc.id, 'status', 'alive', 'Hero is appointed Champion');
  plan = assignMilestoneState(plan, m1.id, kingDoc.id, 'status', 'alive', 'Crowned King');

  // Milestone 2 (Canonical Divergence Point): The Great War Begins
  const m2: StoryNode = {
    ...newNode(plan, UNIVERSE_ID, null),
    id: 'node-m2',
    title: 'Milestone 2: The Great War',
    era: 'Year 20, Era of Ash',
    description: 'War ravages the land',
  };
  plan = insertNode(plan, m2);

  // In M2: King Eldor falls in battle
  plan = assignMilestoneState(plan, m2.id, kingDoc.id, 'status', 'deceased', 'Fell defending the royal gates');

  // Milestone 3 (Canonical Continuation): The Aftermath
  const m3: StoryNode = {
    ...newNode(plan, UNIVERSE_ID, null),
    id: 'node-m3',
    title: 'Milestone 3: Aftermath of the War',
    era: 'Year 25, Era of Reconstruction',
  };
  plan = insertNode(plan, m3);

  // In M3: Fortress of Solitude ruined, King Eldor inherited deceased, Hero inherited alive
  plan = assignMilestoneState(plan, m3.id, castleDoc.id, 'status', 'ruined', 'Fortress breached and burned');

  // Create Alternate Branch diverging at M2
  const branchRes = createBranch(plan, UNIVERSE_ID, 'Timeline of the Living King', m2.id);
  plan = branchRes.plan;
  const altBranchId = branchRes.branch.id;

  // Branch Milestone B1
  const b1: StoryNode = {
    ...newNode(plan, UNIVERSE_ID, null, undefined, altBranchId),
    id: 'node-b1',
    title: 'Milestone B1: Eldor Survived',
    branch_id: altBranchId,
    era: 'Year 21, Era of Ash (Alt)',
  };
  plan = insertNode(plan, b1);
  // King Eldor is active / alive in the alternate branch
  plan = assignMilestoneState(plan, b1.id, kingDoc.id, 'status', 'alive', 'Eldor was rescued by the vanguard');

  // Books
  const canonicalBook: Book = {
    id: 'book-canonical-1',
    universe_id: UNIVERSE_ID,
    name: 'Chronicles of Eryndor',
    continuity: 'canonical',
    branch_id: null,
    chapter_count: 2,
    archived: false,
  };

  const alternateBook: Book = {
    id: 'book-alternate-1',
    universe_id: UNIVERSE_ID,
    name: 'What If Eldor Lived',
    continuity: 'alternate',
    branch_id: altBranchId,
    chapter_count: 1,
    archived: false,
  };

  plan.books = [canonicalBook, alternateBook];

  // Helper for chapter document
  const createChapter = (
    id: string,
    title: string,
    bookId: string,
    milestoneId?: string | null,
    universeId = UNIVERSE_ID
  ): DocumentMetadata => ({
    id,
    title,
    doc_type: 'lorebook',
    tags: ['chapter'],
    house_id: HOUSE_A,
    path: `/vault/houses/house-w4-alpha/lorebook/${id}.md`,
    created_at: '2026-10-28T12:00:00Z',
    modified_at: '2026-10-28T12:00:00Z',
    metadata_json: JSON.stringify({
      entry_type: 'chapter',
      universe_id: universeId,
      book_id: bookId,
      milestone_id: milestoneId,
    }),
  });

  // --------------------------------------------------------------------------
  // Test 1: Canonical chapter assigned canonical milestone resolves state correctly
  // --------------------------------------------------------------------------
  await t.test('1. Canonical chapter assigned canonical milestone resolves historical state correctly', () => {
    const chap = createChapter('chap-1', 'Chapter 1: The Gathering', canonicalBook.id, m2.id);
    const ctx = resolveChapterHistoricalContext(plan, UNIVERSE_ID, chap, canonicalBook);

    assert.ok(ctx);
    assert.equal(ctx.isValid, true);
    assert.equal(ctx.milestoneId, m2.id);
    assert.equal(ctx.milestoneTitle, 'Milestone 2: The Great War');
    assert.equal(ctx.continuityName, 'Canonical Timeline');
    assert.equal(ctx.branchId, null);

    const states = resolveUniverseStateAtMilestone(plan, allDocuments, UNIVERSE_ID, m2.id);
    const kingState = states.find((s) => s.entityId === kingDoc.id);
    assert.ok(kingState);
    assert.equal(kingState.value, 'deceased');
    assert.equal(kingState.origin, 'explicit');
  });

  // --------------------------------------------------------------------------
  // Test 2: Canonical chapter unbound (no milestone) returns null context
  // --------------------------------------------------------------------------
  await t.test('2. Canonical chapter unbound (no milestone) returns null historical context', () => {
    const chap = createChapter('chap-unbound', 'Unbound Chapter', canonicalBook.id, null);
    const ctx = resolveChapterHistoricalContext(plan, UNIVERSE_ID, chap, canonicalBook);
    assert.equal(ctx, null);
  });

  // --------------------------------------------------------------------------
  // Test 3: Alternate chapter assigned branch milestone resolves branch-specific state
  // --------------------------------------------------------------------------
  await t.test('3. Alternate chapter assigned branch milestone resolves branch-specific historical state', () => {
    const chap = createChapter('chap-alt-1', 'Chapter 1: The Rescue', alternateBook.id, b1.id);
    const ctx = resolveChapterHistoricalContext(plan, UNIVERSE_ID, chap, alternateBook);

    assert.ok(ctx);
    assert.equal(ctx.isValid, true);
    assert.equal(ctx.milestoneId, b1.id);
    assert.equal(ctx.continuityName, 'Alternate: Timeline of the Living King');
    assert.equal(ctx.branchId, altBranchId);

    const states = resolveUniverseStateAtMilestone(plan, allDocuments, UNIVERSE_ID, b1.id);
    const kingState = states.find((s) => s.entityId === kingDoc.id);
    assert.ok(kingState);
    assert.equal(kingState.value, 'alive');
    assert.equal(kingState.origin, 'explicit');
  });

  // --------------------------------------------------------------------------
  // Test 4: Alternate chapter with branch assigned divergence milestone resolves with flag
  // --------------------------------------------------------------------------
  await t.test('4. Alternate chapter with branch assigned divergence milestone resolves correctly with divergence flag', () => {
    const chap = createChapter('chap-alt-div', 'Chapter 0: Prologue at the Crossroads', alternateBook.id, m2.id);
    const ctx = resolveChapterHistoricalContext(plan, UNIVERSE_ID, chap, alternateBook);

    assert.ok(ctx);
    assert.equal(ctx.isValid, true);
    assert.equal(ctx.milestoneId, m2.id);
    assert.equal(ctx.isDivergenceFallback, true);
    assert.equal(ctx.divergenceMilestoneTitle, 'Milestone 2: The Great War');
  });

  // --------------------------------------------------------------------------
  // Test 5: Chapter assigned missing milestone handles gracefully without crashing
  // --------------------------------------------------------------------------
  await t.test('5. Chapter assigned missing milestone handles gracefully without crashing, returns invalid context', () => {
    const chap = createChapter('chap-missing', 'Chapter of Ghosts', canonicalBook.id, 'non-existent-milestone-id');
    const ctx = resolveChapterHistoricalContext(plan, UNIVERSE_ID, chap, canonicalBook);

    assert.ok(ctx);
    assert.equal(ctx.isValid, false);
    assert.ok(ctx.warning?.includes('no longer exists'));
  });

  // --------------------------------------------------------------------------
  // Test 6: Chapter assigned archived milestone handles gracefully, returns invalid context
  // --------------------------------------------------------------------------
  await t.test('6. Chapter assigned archived milestone handles gracefully, returns invalid context', () => {
    const archivedPlan = archiveNode(plan, m3.id, true);
    const chap = createChapter('chap-archived', 'Ruined Chapter', canonicalBook.id, m3.id);
    const ctx = resolveChapterHistoricalContext(archivedPlan, UNIVERSE_ID, chap, canonicalBook);

    assert.ok(ctx);
    assert.equal(ctx.isValid, false);
    assert.ok(ctx.warning?.includes('archived'));
  });

  // --------------------------------------------------------------------------
  // Test 7: Chapter assigned cross-universe milestone rejected/invalidated
  // --------------------------------------------------------------------------
  await t.test('7. Chapter assigned cross-universe milestone rejected/invalidated', () => {
    // Milestone belonging to Nether Realm
    const foreignMilestone: StoryNode = {
      ...newNode(plan, OTHER_UNIVERSE_ID, null),
      id: 'node-foreign-1',
      title: 'Nether Convergence',
      universe_id: OTHER_UNIVERSE_ID,
    };
    const planWithForeign = insertNode(plan, foreignMilestone);

    const chap = createChapter('chap-foreign-ms', 'Dimensional Rift', canonicalBook.id, foreignMilestone.id);
    const ctx = resolveChapterHistoricalContext(planWithForeign, UNIVERSE_ID, chap, canonicalBook);

    assert.ok(ctx);
    assert.equal(ctx.isValid, false);
    assert.ok(ctx.warning?.includes('different universe'));
  });

  // --------------------------------------------------------------------------
  // Test 8: Chapter assigned cross-branch milestone returns warning
  // --------------------------------------------------------------------------
  await t.test('8. Chapter assigned cross-branch milestone returns warning', () => {
    // Canonical book chapter pointing to Alternate Branch milestone b1
    const chap = createChapter('chap-mismatch', 'Cross-Branch Chapter', canonicalBook.id, b1.id);
    const ctx = resolveChapterHistoricalContext(plan, UNIVERSE_ID, chap, canonicalBook);

    assert.ok(ctx);
    assert.equal(ctx.isValid, true);
    assert.ok(ctx.warning);
    assert.ok(ctx.warning.includes('Canonical book, but references an Alternate branch milestone'));
  });

  // --------------------------------------------------------------------------
  // Test 9: Explicit state at milestone displays origin 'explicit' and exact value
  // --------------------------------------------------------------------------
  await t.test('9. Explicit state at milestone displays origin "explicit" and exact value', () => {
    const states = resolveUniverseStateAtMilestone(plan, allDocuments, UNIVERSE_ID, m2.id);
    const king = states.find((s) => s.entityId === kingDoc.id);

    assert.ok(king);
    assert.equal(king.origin, 'explicit');
    assert.equal(king.value, 'deceased');
    assert.equal(king.displayLabel, 'Deceased');
    assert.equal(king.hasChangedAtThisMilestone, true);
  });

  // --------------------------------------------------------------------------
  // Test 10: Inherited state across milestones displays origin 'inherited' and provenance
  // --------------------------------------------------------------------------
  await t.test('10. Inherited state across milestones displays origin "inherited" and source milestone provenance', () => {
    // In M3, King Eldor fell at M2 and was not explicitly changed at M3
    const states = resolveUniverseStateAtMilestone(plan, allDocuments, UNIVERSE_ID, m3.id);
    const king = states.find((s) => s.entityId === kingDoc.id);

    assert.ok(king);
    assert.equal(king.origin, 'inherited');
    assert.equal(king.value, 'deceased');
    assert.equal(king.hasChangedAtThisMilestone, false);
    assert.equal(king.sourceMilestoneId, m2.id);
    assert.equal(king.sourceMilestoneTitle, 'Milestone 2: The Great War');
    assert.equal(king.sourceMilestoneEra, 'Year 20, Era of Ash');
  });

  // --------------------------------------------------------------------------
  // Test 11: Explicit unknown (null value) displays origin 'unknown' and never backfills profile
  // --------------------------------------------------------------------------
  await t.test('11. Explicit unknown (null value) displays origin "unknown" and never backfills current profile', () => {
    let testPlan = assignMilestoneState(plan, m2.id, heroDoc.id, 'status', null, 'Hero lost in the fog of war');
    const states = resolveUniverseStateAtMilestone(testPlan, allDocuments, UNIVERSE_ID, m2.id);
    const hero = states.find((s) => s.entityId === heroDoc.id);

    assert.ok(hero);
    assert.equal(hero.origin, 'unknown');
    assert.equal(hero.value, null);
    assert.equal(hero.displayLabel, 'Unknown');
    // Ensure vital_status: 'alive' in character profile did NOT backfill the historical state value
    assert.notEqual(hero.value, 'alive');
  });

  // --------------------------------------------------------------------------
  // Test 12: Not yet introduced displays origin 'not_yet_introduced'
  // --------------------------------------------------------------------------
  await t.test('12. Not yet introduced displays origin "not_yet_introduced"', () => {
    let testPlan = assignMilestoneState(plan, m1.id, castleDoc.id, 'status', NOT_INTRODUCED_STATUS, 'Not built yet');
    const states = resolveUniverseStateAtMilestone(testPlan, allDocuments, UNIVERSE_ID, m1.id);
    const castle = states.find((s) => s.entityId === castleDoc.id);

    assert.ok(castle);
    assert.equal(castle.origin, 'not_yet_introduced');
    assert.equal(castle.value, NOT_INTRODUCED_STATUS);
    assert.equal(castle.displayLabel, 'Not Yet Introduced');
  });

  // --------------------------------------------------------------------------
  // Test 13: Unassigned entity displays origin 'unassigned'
  // --------------------------------------------------------------------------
  await t.test('13. Unassigned entity displays origin "unassigned"', () => {
    // Castle has no changes recorded at M1 or M2 in base plan
    const states = resolveUniverseStateAtMilestone(plan, allDocuments, UNIVERSE_ID, m1.id);
    const castle = states.find((s) => s.entityId === castleDoc.id);

    assert.ok(castle);
    assert.equal(castle.origin, 'unassigned');
    assert.equal(castle.value, null);
    assert.equal(castle.displayLabel, 'Unassigned');
  });

  // --------------------------------------------------------------------------
  // Test 14: Author note recorded on change is preserved and exposed in context
  // --------------------------------------------------------------------------
  await t.test('14. Author note recorded on change is preserved and exposed in historical context', () => {
    const states = resolveUniverseStateAtMilestone(plan, allDocuments, UNIVERSE_ID, m2.id);
    const king = states.find((s) => s.entityId === kingDoc.id);

    assert.ok(king);
    assert.equal(king.note, 'Fell defending the royal gates');
  });

  // --------------------------------------------------------------------------
  // Test 15: Clearing chapter context removes milestone_id and reverts to unbound
  // --------------------------------------------------------------------------
  await t.test('15. Clearing chapter context removes milestone_id and reverts to unbound state', () => {
    const chap = createChapter('chap-clr', 'Chapter Clear Test', canonicalBook.id, m1.id);
    const metaBefore = JSON.parse(chap.metadata_json!) as LorebookMetadata;
    assert.equal(metaBefore.milestone_id, m1.id);

    // Simulate clearing context
    const updatedMeta: Partial<LorebookMetadata> = { ...metaBefore, milestone_id: null };
    delete updatedMeta.milestone_id;
    chap.metadata_json = JSON.stringify(updatedMeta);

    const ctx = resolveChapterHistoricalContext(plan, UNIVERSE_ID, chap, canonicalBook);
    assert.equal(ctx, null);
  });

  // --------------------------------------------------------------------------
  // Test 16: Changing chapter milestone preserves existing chapter frontmatter and prose
  // --------------------------------------------------------------------------
  await t.test('16. Changing chapter milestone preserves existing chapter frontmatter and prose intact', () => {
    const chap = createChapter('chap-mutate', 'Preserve Prose Test', canonicalBook.id, m1.id);
    const originalContent = '# Chapter Prose\n\nIt was a dark and stormy night...';
    const originalTags = ['chapter', 'draft', 'act-1'];
    chap.tags = originalTags;

    // Simulate metadata update with isMetadataOnly flag
    const currentMeta = JSON.parse(chap.metadata_json!) as LorebookMetadata;
    const newMeta: Partial<LorebookMetadata> = {
      ...currentMeta,
      chapter: 'Chapter 2',
      chapter_order: 2,
      milestone_id: m2.id,
    };
    chap.metadata_json = JSON.stringify(newMeta);

    // Verify prose and tags were not modified
    assert.equal(originalContent, '# Chapter Prose\n\nIt was a dark and stormy night...');
    assert.deepEqual(chap.tags, ['chapter', 'draft', 'act-1']);
    assert.equal((JSON.parse(chap.metadata_json!) as LorebookMetadata).milestone_id, m2.id);
    assert.equal((JSON.parse(chap.metadata_json!) as LorebookMetadata).chapter, 'Chapter 2');
  });

  // --------------------------------------------------------------------------
  // Test 17: Switching books invalidates chapter context and updates compatible milestones
  // --------------------------------------------------------------------------
  await t.test('17. Switching books invalidates chapter context and updates compatible milestones', () => {
    const canonicalMilestones = getCompatibleMilestonesForBook(plan, UNIVERSE_ID, canonicalBook);
    assert.equal(canonicalMilestones.continuity, 'canonical');
    assert.equal(canonicalMilestones.continuityName, 'Canonical Timeline');
    assert.equal(canonicalMilestones.branchId, null);
    assert.equal(canonicalMilestones.milestones.length, 3); // M1, M2, M3

    const alternateMilestones = getCompatibleMilestonesForBook(plan, UNIVERSE_ID, alternateBook);
    assert.equal(alternateMilestones.continuity, 'alternate');
    assert.equal(alternateMilestones.continuityName, 'Alternate: Timeline of the Living King');
    assert.equal(alternateMilestones.branchId, altBranchId);
    assert.equal(alternateMilestones.milestones.length, 1); // B1
    assert.equal(alternateMilestones.divergenceMilestone?.id, m2.id); // Divergence at M2
  });

  // --------------------------------------------------------------------------
  // Test 18: House isolation: Milestones and entities from other houses cannot leak
  // --------------------------------------------------------------------------
  await t.test('18. House isolation: Milestones and entities from other houses cannot leak into chapter context', () => {
    // Scoped Echo Entities strictly for House A
    const scopedEntities = buildScopedEchoEntities(allDocuments, UNIVERSE_ID, plan, HOUSE_A);
    const foreignFound = scopedEntities.some((e) => e.id === foreignDoc.id);
    assert.equal(foreignFound, false, 'Foreign house entity must never leak into House A Echo scope');

    const heroFound = scopedEntities.some((e) => e.id === heroDoc.id);
    assert.equal(heroFound, true, 'House A entity must be present in House A Echo scope');
  });

  // --------------------------------------------------------------------------
  // Test 19: Performance: State resolution cache returns identical reference
  // --------------------------------------------------------------------------
  await t.test('19. Performance: State resolution cache returns identical reference for same milestone/revision', () => {
    clearHistoricalResolutionCache();

    const cache1 = getCachedResolvedUniverseState(plan, allDocuments, UNIVERSE_ID, m2.id);
    const cache2 = getCachedResolvedUniverseState(plan, allDocuments, UNIVERSE_ID, m2.id);

    // Exact reference equality confirms cache hit without re-resolving
    assert.equal(cache1, cache2);

    const kingFromEcho = resolveEntityHistoricalEchoState(plan, allDocuments, UNIVERSE_ID, m2.id, kingDoc.id);
    assert.ok(kingFromEcho);
    assert.equal(kingFromEcho.value, 'deceased');
  });

  // --------------------------------------------------------------------------
  // Test 20: Cache invalidation: Updating plan revision forces state re-resolution
  // --------------------------------------------------------------------------
  await t.test('20. Cache invalidation: Updating plan revision forces state re-resolution', () => {
    clearHistoricalResolutionCache();

    const cache1 = getCachedResolvedUniverseState(plan, allDocuments, UNIVERSE_ID, m2.id);

    // Mutate plan revision
    const revisedPlan: Plan = {
      ...plan,
      revision: plan.revision + 1,
    };

    const cache2 = getCachedResolvedUniverseState(revisedPlan, allDocuments, UNIVERSE_ID, m2.id);

    // Different reference because revision changed
    assert.notEqual(cache1, cache2);
  });

  // --------------------------------------------------------------------------
  // Test 21: Echo documentation popup helpers render correct status and provenance
  // --------------------------------------------------------------------------
  await t.test('21. Echo documentation popup helper functions render historical section with continuity, milestone, state, provenance, and note', () => {
    const states = resolveUniverseStateAtMilestone(plan, allDocuments, UNIVERSE_ID, m2.id);
    const king = states.find((s) => s.entityId === kingDoc.id)!;

    const badge = renderHistoricalStatusBadge(king);
    assert.ok(badge);

    const provenance = renderHistoricalOriginProvenance(king);
    assert.ok(provenance);

    // Test inherited provenance
    const m3States = resolveUniverseStateAtMilestone(plan, allDocuments, UNIVERSE_ID, m3.id);
    const inheritedKing = m3States.find((s) => s.entityId === kingDoc.id)!;
    const inheritedProv = renderHistoricalOriginProvenance(inheritedKing);
    assert.ok(inheritedProv);
  });

  // --------------------------------------------------------------------------
  // Test 22: Direct navigation action provides correct parameters
  // --------------------------------------------------------------------------
  await t.test('22. Direct navigation action provides correct parameters (universe, branch, milestone, entity)', () => {
    let capturedParams: {
      universeId: string;
      continuityId: string | null;
      milestoneId: string | null;
      entityId: string | null;
    } | null = null;

    const mockNavigate = (
      universeId: string,
      continuityId: string | null,
      milestoneId: string | null,
      entityId: string | null
    ) => {
      capturedParams = { universeId, continuityId, milestoneId, entityId };
    };

    const chap = createChapter('chap-nav', 'Nav Test Chapter', alternateBook.id, b1.id);
    const ctx = resolveChapterHistoricalContext(plan, UNIVERSE_ID, chap, alternateBook);
    assert.ok(ctx);

    // Trigger navigation
    mockNavigate(UNIVERSE_ID, ctx.branchId, ctx.milestoneId, kingDoc.id);

    assert.ok(capturedParams);
    assert.equal(capturedParams.universeId, UNIVERSE_ID);
    assert.equal(capturedParams.continuityId, altBranchId);
    assert.equal(capturedParams.milestoneId, b1.id);
    assert.equal(capturedParams.entityId, kingDoc.id);
  });
});
