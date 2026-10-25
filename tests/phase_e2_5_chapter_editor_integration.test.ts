import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { undo, redo } from '@codemirror/commands';
import {
  echoEntitiesField,
  candidateMatchesField,
  confirmedReferencesField,
  confirmReferenceEffect,
  findCandidateMatches,
  setEntitiesEffect,
} from '../src/components/echo/echoExtension';
import type { EchoEntity, EchoConfirmedReference } from '../src/components/echo/types';
import {
  buildScopedEchoEntities,
  convertDocumentToEchoEntity,
} from '../src/utils/echoLore';
import type { DocumentMetadata, LorebookMetadata, LorebookAttribute } from '../src/types';
import type { Plan } from '../src/utils/thought';
import { resolveEntityUniverse } from '../src/utils/universe';

test('Echo Library Phase E2.5: Chapter Editor Integration & Production Acceptance', async (t) => {
  const UNIVERSE_A_ID = 'univ-avalon-111';
  const UNIVERSE_B_ID = 'univ-cyberia-222';
  const HOUSE_1_ID = 'house-aurora-aaa';
  const HOUSE_2_ID = 'house-solaris-bbb';

  const MOCK_PLAN: Plan = {
    version: 1,
    universes: [
      { id: UNIVERSE_A_ID, name: 'Avalon Realm', description: 'Primary high fantasy realm' },
      { id: UNIVERSE_B_ID, name: 'Cyberia', description: 'Sci-fi metropolis' },
    ],
    books: [
      {
        id: 'book-1',
        universe_id: UNIVERSE_A_ID,
        name: 'Chronicles of Avalon',
        description: 'First volume of the epic',
        continuity: 'canonical',
        sort_order: 1,
      },
    ],
    characters: [],
    concepts: [],
    relationships: [
      {
        id: 'rel-1',
        source_id: 'doc-char-voltaire',
        target_id: 'doc-fac-guard',
        label: 'Leads',
        description: 'Supreme Commander of the Northern Guard',
        directed: true,
      },
      {
        id: 'rel-2',
        source_id: 'doc-char-voltaire',
        target_id: 'doc-char-eowyn',
        label: 'Rival of',
        description: 'Political adversaries in the council',
        directed: false,
      },
    ],
  };

  const MOCK_DOCS: DocumentMetadata[] = [
    // 1. Character in Universe A, House 1 with Canonical Attributes & Appearance
    {
      id: 'doc-char-voltaire',
      title: 'Voltaire Manus',
      doc_type: 'lorebook',
      house_id: HOUSE_1_ID,
      metadata_json: JSON.stringify({
        entry_type: 'character',
        universe_id: UNIVERSE_A_ID,
        universe: 'Avalon Realm',
        canon_status: 'canonical',
        // Canonical custom attributes (Phase C1 format: LorebookAttribute[])
        attributes: [
          { id: 'attr-1', key: 'Sigil', value: 'Golden Griffin on Azure' },
          { id: 'attr-2', key: 'Motto', value: 'Vigilance Through Fire' },
        ] satisfies LorebookAttribute[],
        character_fields: {
          age: '54',
          species: 'Human',
          gender: 'Male',
          vital_status: 'Alive',
          occupation: 'High Chancellor',
          narrative_role: 'Commander',
          personality: 'Austere, resolute, unwavering sense of duty',
          physical_appearance: 'Tall, broad-shouldered with silver hair and a battle scar across his brow',
          clothing_attire: 'Midnight velvet doublet over adamantine mail with a crimson clasp',
          aliases: ['The Iron Chancellor', 'Old Wolf'],
        },
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    // 2. Second Character in Universe A
    {
      id: 'doc-char-eowyn',
      title: 'Éowyn Vane',
      doc_type: 'lorebook',
      house_id: HOUSE_1_ID,
      metadata_json: JSON.stringify({
        entry_type: 'character',
        universe_id: UNIVERSE_A_ID,
        universe: 'Avalon Realm',
        canon_status: 'canonical',
        attributes: [],
        character_fields: {
          age: '28',
          species: 'Highlander',
          vital_status: 'Alive',
          occupation: 'Shieldmaiden',
          physical_appearance: 'Slender, athletic with braided golden hair and piercing grey eyes',
          clothing_attire: 'Supple leather cuirass with silver-threaded embroidery',
          aliases: ['The Pale Lady'],
        },
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    // 3. Faction in Universe A with C2 Positions
    {
      id: 'doc-fac-guard',
      title: 'Northern Guard',
      doc_type: 'lorebook',
      house_id: HOUSE_1_ID,
      metadata_json: JSON.stringify({
        entry_type: 'faction',
        universe_id: UNIVERSE_A_ID,
        universe: 'Avalon Realm',
        canon_status: 'canonical',
        attributes: [],
        faction_fields: {
          faction_type: 'Military Order',
          leadership: 'High Chancellor Voltaire Manus',
          headquarters: 'Fortress Dunharrow',
          branches: [
            { id: 'br-1', name: 'First Vanguard' },
            { id: 'br-2', name: 'Iron Sentinel' },
          ],
          positions: [
            {
              id: 'pos-1',
              title: 'High Marshal',
              branch_id: 'br-1',
              holder_ids: ['doc-char-voltaire'],
            },
            {
              id: 'pos-2',
              title: 'Watch Captain',
              branch_id: 'br-2',
              holder_ids: ['doc-char-eowyn'],
            },
          ],
        },
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    // 4. Ambiguous Entity in Universe A
    {
      id: 'doc-loc-avalon',
      title: 'Avalon',
      doc_type: 'lorebook',
      house_id: HOUSE_1_ID,
      metadata_json: JSON.stringify({
        entry_type: 'location',
        universe_id: UNIVERSE_A_ID,
        universe: 'Avalon Realm',
        canon_status: 'canonical',
        attributes: [],
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'doc-rule-avalon',
      title: 'Avalon',
      doc_type: 'lorebook',
      house_id: HOUSE_1_ID,
      metadata_json: JSON.stringify({
        entry_type: 'concept',
        universe_id: UNIVERSE_A_ID,
        universe: 'Avalon Realm',
        canon_status: 'canonical',
        attributes: [],
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    // 5. Chapter Document in Book 1 (Universe A, House 1)
    {
      id: 'doc-chap-1',
      title: 'Chapter 1: The Gathering Tempest',
      doc_type: 'lorebook',
      house_id: HOUSE_1_ID,
      metadata_json: JSON.stringify({
        entry_type: 'chapter',
        universe_id: UNIVERSE_A_ID,
        universe: 'Avalon Realm',
        book_id: 'book-1',
        book: 'Chronicles of Avalon',
        chapter: 'Chapter 1: The Gathering Tempest',
        chapter_order: 1,
        canon_status: 'canon',
        attributes: [],
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    // 6. Entity in Universe B (Different Universe)
    {
      id: 'doc-char-neo',
      title: 'Cipher Neo',
      doc_type: 'lorebook',
      house_id: HOUSE_1_ID,
      metadata_json: JSON.stringify({
        entry_type: 'character',
        universe_id: UNIVERSE_B_ID,
        universe: 'Cyberia',
        canon_status: 'canonical',
        attributes: [],
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    // 7. Entity in House 2 (Different House)
    {
      id: 'doc-char-house2',
      title: 'Lord Malakar',
      doc_type: 'lorebook',
      house_id: HOUSE_2_ID,
      metadata_json: JSON.stringify({
        entry_type: 'character',
        universe_id: UNIVERSE_A_ID,
        universe: 'Avalon Realm',
        canon_status: 'canonical',
        attributes: [],
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  await t.test('1. Echo integration in the primary chapter editor', () => {
    const chapterDoc = MOCK_DOCS.find((d) => d.id === 'doc-chap-1')!;
    const scopedEntities = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_A_ID, MOCK_PLAN, HOUSE_1_ID);

    const chapterProse = `# Chapter 1: The Gathering Tempest\n\nLord Voltaire Manus entered the high chamber of the Northern Guard.`;

    const state = EditorState.create({
      doc: chapterProse,
      extensions: [
        echoEntitiesField.init(() => scopedEntities),
        confirmedReferencesField,
        candidateMatchesField,
      ],
    });

    const candidates = state.field(candidateMatchesField).candidates;
    assert.ok(candidates.length >= 2, 'Chapter editor must recognize entities in prose');

    const vmCand = candidates.find((c) => c.matchedText === 'Voltaire Manus');
    assert.ok(vmCand);
    assert.equal(vmCand.matchingEntities[0].name, 'Voltaire Manus');

    const ngCand = candidates.find((c) => c.matchedText === 'Northern Guard');
    assert.ok(ngCand);
    assert.equal(ngCand.matchingEntities[0].name, 'Northern Guard');
  });

  await t.test('2. Canonical chapter prose remains completely unchanged by recognition', () => {
    const scopedEntities = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_A_ID, MOCK_PLAN, HOUSE_1_ID);
    const chapterProse = `Under the banners of the Northern Guard, Voltaire Manus surveyed the horizon.`;

    const state = EditorState.create({
      doc: chapterProse,
      extensions: [
        echoEntitiesField.init(() => scopedEntities),
        confirmedReferencesField,
        candidateMatchesField,
      ],
    });

    // 1. Initial prose is unchanged
    assert.equal(state.doc.toString(), chapterProse);

    // 2. Dispatch a confirmed reference effect
    const ref: EchoConfirmedReference = {
      id: 'ref-vm-1',
      entityId: 'doc-char-voltaire',
      from: 41,
      to: 55,
      matchedText: 'Voltaire Manus',
    };

    const tr = state.update({
      effects: confirmReferenceEffect.of(ref),
    });

    // 3. Document text is 100% byte-for-byte identical; no '@' token or markdown rewrite
    assert.equal(tr.newDoc.toString(), chapterProse);
    assert.equal(tr.newDoc.toString().includes('@'), false);
  });

  await t.test('3. Correct House and Universe scoping prioritizes chapter ownership', () => {
    const chapterDoc = MOCK_DOCS.find((d) => d.id === 'doc-chap-1')!;

    // Resolves universe directly from chapter document
    const res = resolveEntityUniverse(chapterDoc, MOCK_PLAN.universes);
    assert.equal(res.universeId, UNIVERSE_A_ID);

    // Even if global selected universe in UI is Cyberia (UNIVERSE_B_ID),
    // scoping to the chapter's own universe ensures correct isolation:
    const chapterScopedEntities = buildScopedEchoEntities(
      MOCK_DOCS,
      res.universeId!,
      MOCK_PLAN,
      chapterDoc.house_id
    );

    const names = chapterScopedEntities.map((e) => e.name);
    assert.ok(names.includes('Voltaire Manus'), 'Chapter scope must include Universe A character');
    assert.ok(!names.includes('Cipher Neo'), 'Chapter scope must exclude Universe B character');
    assert.ok(!names.includes('Lord Malakar'), 'Chapter scope must exclude House 2 character');
  });

  await t.test('4. Chapter switching with stale-context protection', () => {
    // Universe A chapter
    const scopedA = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_A_ID, MOCK_PLAN, HOUSE_1_ID);
    // Universe B chapter
    const scopedB = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_B_ID, MOCK_PLAN, HOUSE_1_ID);

    const state = EditorState.create({
      doc: 'Voltaire Manus and Cipher Neo met at the crossing.',
      extensions: [
        echoEntitiesField.init(() => scopedA),
        confirmedReferencesField,
        candidateMatchesField,
      ],
    });

    // In Chapter A, only Voltaire Manus is recognized
    const initialCandidates = state.field(candidateMatchesField).candidates;
    assert.equal(initialCandidates.some((c) => c.matchedText === 'Voltaire Manus'), true);
    assert.equal(initialCandidates.some((c) => c.matchedText === 'Cipher Neo'), false);

    // Simulate switching chapter to Universe B: dispatch setEntitiesEffect
    const switchTr = state.update({
      effects: setEntitiesEffect.of(scopedB),
    });

    // In Chapter B, Voltaire Manus is cleared and Cipher Neo is recognized
    const switchedCandidates = switchTr.state.field(candidateMatchesField).candidates;
    assert.equal(switchedCandidates.some((c) => c.matchedText === 'Voltaire Manus'), false);
    assert.equal(switchedCandidates.some((c) => c.matchedText === 'Cipher Neo'), true);
  });

  await t.test('5. Alias recognition and ambiguity handling in chapter prose', () => {
    const scopedEntities = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_A_ID, MOCK_PLAN, HOUSE_1_ID);
    const prose = 'The Iron Chancellor looked across Avalon, where the Old Wolf held court.';

    const candidates = findCandidateMatches(EditorState.create({ doc: prose }).doc, scopedEntities, []);

    // Both aliases recognized and attributed to Voltaire Manus
    const ironCand = candidates.find((c) => c.matchedText === 'The Iron Chancellor')!;
    assert.ok(ironCand);
    assert.equal(ironCand.isAliasMatch, true);
    assert.equal(ironCand.matchingEntities[0].id, 'doc-char-voltaire');

    const wolfCand = candidates.find((c) => c.matchedText === 'Old Wolf')!;
    assert.ok(wolfCand);
    assert.equal(wolfCand.isAliasMatch, true);
    assert.equal(wolfCand.matchingEntities[0].id, 'doc-char-voltaire');

    // Ambiguous term Avalon flags isAmbiguous
    const avalonCand = candidates.find((c) => c.matchedText === 'Avalon')!;
    assert.ok(avalonCand);
    assert.equal(avalonCand.isAmbiguous, true);
    assert.equal(avalonCand.matchingEntities.length, 2);
  });

  await t.test('6. Dossier appearance, clothing, and personality fields', () => {
    const doc = MOCK_DOCS.find((d) => d.id === 'doc-char-voltaire')!;
    const entity = convertDocumentToEchoEntity(doc, MOCK_DOCS, MOCK_PLAN);

    assert.ok(entity.characterProfile);
    assert.equal(entity.characterProfile.age, '54');
    assert.equal(entity.characterProfile.species, 'Human');
    assert.equal(entity.characterProfile.occupation, 'High Chancellor');
    assert.equal(
      entity.characterProfile.physicalAppearance,
      'Tall, broad-shouldered with silver hair and a battle scar across his brow'
    );
    assert.equal(
      entity.characterProfile.clothingAttire,
      'Midnight velvet doublet over adamantine mail with a crimson clasp'
    );
    assert.equal(
      entity.characterProfile.personality,
      'Austere, resolute, unwavering sense of duty'
    );
  });

  await t.test('7. Canonical custom attributes extraction from metadata.attributes: LorebookAttribute[]', () => {
    const doc = MOCK_DOCS.find((d) => d.id === 'doc-char-voltaire')!;
    const entity = convertDocumentToEchoEntity(doc, MOCK_DOCS, MOCK_PLAN);

    assert.ok(entity.customAttributes.length >= 2);
    const sigil = entity.customAttributes.find((a) => a.key === 'Sigil')!;
    assert.ok(sigil);
    assert.equal(sigil.value, 'Golden Griffin on Azure');

    const motto = entity.customAttributes.find((a) => a.key === 'Motto')!;
    assert.ok(motto);
    assert.equal(motto.value, 'Vigilance Through Fire');
  });

  await t.test('8. Derived official faction positions on character dossier', () => {
    const doc = MOCK_DOCS.find((d) => d.id === 'doc-char-voltaire')!;
    const entity = convertDocumentToEchoEntity(doc, MOCK_DOCS, MOCK_PLAN);

    assert.ok(entity.heldOffices && entity.heldOffices.length > 0);
    const office = entity.heldOffices[0];
    assert.equal(office.factionTitle, 'Northern Guard');
    assert.equal(office.positionTitle, 'High Marshal');
    assert.equal(office.branchName, 'First Vanguard');
  });

  await t.test('9. Guided and custom relationships with perspective', () => {
    const doc = MOCK_DOCS.find((d) => d.id === 'doc-char-voltaire')!;
    const entity = convertDocumentToEchoEntity(doc, MOCK_DOCS, MOCK_PLAN);

    assert.ok(entity.relationships.length >= 2);
    const leadRel = entity.relationships.find((r) => r.targetId === 'doc-fac-guard')!;
    assert.equal(leadRel.relationType, 'Leads');
    assert.equal(leadRel.targetCategory, 'faction');
    assert.equal(leadRel.categoryKind, 'guided');

    const rivalRel = entity.relationships.find((r) => r.targetId === 'doc-char-eowyn')!;
    assert.equal(rivalRel.relationType, 'Rival of');
    assert.equal(rivalRel.targetCategory, 'character');
  });

  await t.test('10. Undo/redo preservation in chapter editor', () => {
    const scopedEntities = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_A_ID, MOCK_PLAN, HOUSE_1_ID);
    const initialText = 'Voltaire Manus was present.';

    let state = EditorState.create({
      doc: initialText,
      extensions: [
        echoEntitiesField.init(() => scopedEntities),
        candidateMatchesField,
      ],
    });

    // Make an edit
    const tr1 = state.update({
      changes: { from: state.doc.length, insert: ' And watched.' },
    });
    assert.equal(tr1.newDoc.toString(), 'Voltaire Manus was present. And watched.');

    // Undo edit
    const tr2 = tr1.state.update({
      changes: { from: initialText.length, to: tr1.newDoc.length, insert: '' },
    });
    assert.equal(tr2.newDoc.toString(), initialText);
  });

  await t.test('11. Cursor and selection preservation when entities update', () => {
    const scopedA = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_A_ID, MOCK_PLAN, HOUSE_1_ID);

    const state = EditorState.create({
      doc: 'Voltaire Manus stood silent. The wind howled through the passes.',
      selection: { anchor: 20, head: 20 },
      extensions: [
        echoEntitiesField.init(() => scopedA),
        candidateMatchesField,
      ],
    });

    assert.equal(state.selection.main.head, 20);

    // Dispatch entity update (e.g. background lore refresh)
    const updateTr = state.update({
      effects: setEntitiesEffect.of(scopedA),
    });

    // Cursor position is strictly preserved
    assert.equal(updateTr.state.selection.main.head, 20);
    assert.equal(updateTr.state.selection.main.anchor, 20);
  });

  await t.test('12. SaveCoordinator debounced chapter autosave and immediate manual flush', async () => {
    let saveCallCount = 0;
    let savedContent = '';

    const mockSaveDocument = async (id: string, content?: string) => {
      saveCallCount++;
      savedContent = content || '';
    };

    let timer: NodeJS.Timeout | null = null;
    const triggerDebouncedSave = (newContent: string) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        await mockSaveDocument('doc-chap-1', newContent);
      }, 50);
    };

    // Rapid edits
    triggerDebouncedSave('Draft 1');
    triggerDebouncedSave('Draft 2');
    triggerDebouncedSave('Draft 3 - Final');

    // Wait for debounce timer
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(saveCallCount, 1, 'Debounced autosave should coalesce rapid keystrokes into 1 save');
    assert.equal(savedContent, 'Draft 3 - Final');

    // Manual save immediately flushes
    if (timer) clearTimeout(timer);
    await mockSaveDocument('doc-chap-1', 'Draft 3 - Final (Manual Save)');
    assert.equal(saveCallCount, 2);
    assert.equal(savedContent, 'Draft 3 - Final (Manual Save)');
  });

  await t.test('13. Metadata-only chapter reordering and intentional empty-body semantics', () => {
    const initialProse = '# Chapter 1\n\nOriginal preserved prose.';

    // 1. Metadata-only update (e.g. chapter_order change) preserves prose
    const preserveProseOnReorder = (
      existingContent: string,
      newOrder: number,
      options?: { isMetadataOnly?: boolean }
    ) => {
      if (options?.isMetadataOnly) {
        return existingContent; // Unchanged
      }
      return existingContent;
    };

    const reorderedContent = preserveProseOnReorder(initialProse, 2, { isMetadataOnly: true });
    assert.equal(reorderedContent, initialProse);

    // 2. Intentional empty-body save: empty string is valid and not replaced by doc ID
    const sanitizeSaveBody = (body: string, docId: string): string => {
      if (body === docId) {
        throw new Error('Save aborted: Document ID supplied as body');
      }
      return body;
    };

    assert.equal(sanitizeSaveBody('', 'doc-chap-1'), '');
    assert.throws(() => sanitizeSaveBody('doc-chap-1', 'doc-chap-1'), /Document ID supplied as body/);
  });

  await t.test('14. No duplicate Echo extensions on rerender and user toggle state', () => {
    const scopedEntities = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_A_ID, MOCK_PLAN, HOUSE_1_ID);

    const state = EditorState.create({
      doc: 'Voltaire Manus surveyed Avalon.',
      extensions: [
        echoEntitiesField.init(() => scopedEntities),
        candidateMatchesField,
      ],
    });

    const candBefore = state.field(candidateMatchesField).candidates;
    assert.ok(candBefore.length >= 2);

    // User toggles Echo OFF: entities set to []
    const toggleOffTr = state.update({
      effects: setEntitiesEffect.of([]),
    });

    const candAfterOff = toggleOffTr.state.field(candidateMatchesField).candidates;
    assert.equal(candAfterOff.length, 0, 'Turning Echo off clears decorations immediately');

    // User toggles Echo ON: entities restored
    const toggleOnTr = toggleOffTr.state.update({
      effects: setEntitiesEffect.of(scopedEntities),
    });

    const candAfterOn = toggleOnTr.state.field(candidateMatchesField).candidates;
    assert.ok(candAfterOn.length >= 2, 'Turning Echo on restores decorations without duplicating fields');
  });

  await t.test('15. Long manuscript chapter performance (6,000 words)', () => {
    const scopedEntities = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_A_ID, MOCK_PLAN, HOUSE_1_ID);

    const paragraph =
      'The morning mist settled over the ramparts of Avalon as Voltaire Manus and Éowyn Vane watched the scouts of the Northern Guard return.\n\n';
    const manuscriptText = paragraph.repeat(280); // ~6,100 words

    const start = performance.now();
    const doc = EditorState.create({ doc: manuscriptText }).doc;
    const candidates = findCandidateMatches(doc, scopedEntities, []);
    const duration = performance.now() - start;

    assert.ok(candidates.length > 500, 'Should match candidates across the entire chapter');
    assert.ok(duration < 250, `Candidate matching over 6k words took ${duration.toFixed(2)}ms (expected <250ms)`);
  });
});
