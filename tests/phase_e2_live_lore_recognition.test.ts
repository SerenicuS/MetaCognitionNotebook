import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
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
  extractEntityAliases,
  mapEntryTypeToEchoCategory,
  buildLoreSearchIndex,
} from '../src/utils/echoLore';
import type { DocumentMetadata, LorebookMetadata } from '../src/types';
import type { Plan } from '../src/utils/thought';

test('Echo Library Phase E2: Live Lore Recognition & Contextual Dossiers', async (t) => {
  // Test Fixture Data
  const UNIVERSE_ID_A = 'univ-a-1111';
  const UNIVERSE_ID_B = 'univ-b-2222';
  const HOUSE_ID_1 = 'house-alpha';
  const HOUSE_ID_2 = 'house-beta';

  const MOCK_PLAN: Plan = {
    version: 1,
    universes: [
      { id: UNIVERSE_ID_A, name: 'Avalon Realm', description: 'Primary realm' },
      { id: UNIVERSE_ID_B, name: 'Cyberia', description: 'Secondary realm' },
    ],
    books: [],
    characters: [],
    concepts: [],
    relationships: [
      {
        id: 'rel-1',
        source_id: 'doc-char-1',
        target_id: 'doc-fac-1',
        label: 'Member of',
        description: 'Grand Marshall of the Northern Guard',
        directed: true,
      },
      {
        id: 'rel-2',
        source_id: 'doc-char-1',
        target_id: 'doc-char-2',
        label: 'Rival of',
        description: 'Feud of three decades',
        directed: false,
      },
    ],
  };

  const MOCK_DOCS: DocumentMetadata[] = [
    // 1. Character in Universe A, House 1 with C1 aliases
    {
      id: 'doc-char-1',
      title: 'Voltaire Manus',
      doc_type: 'lorebook',
      house_id: HOUSE_ID_1,
      metadata_json: JSON.stringify({
        entry_type: 'character',
        universe_id: UNIVERSE_ID_A,
        universe: 'Avalon Realm',
        canon_status: 'canonical',
        attributes: [],
        character_fields: {
          age: '54',
          species: 'Human',
          gender: 'Male',
          vital_status: 'Alive',
          occupation: 'High Chancellor',
          narrative_role: 'Antagonist turned ally',
          personality: 'Stoic, calculated, fiercely loyal to Avalon',
          aliases: ['The Iron Chancellor', 'Old Wolf'],
        },
        custom_fields: {
          'Signature Weapon': 'Riftforged Claymore',
          'Sigil': 'Silver Falcon on Obsidian',
        },
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    // 2. Second Character with Unicode Name
    {
      id: 'doc-char-2',
      title: 'Éowyn Vane',
      doc_type: 'lorebook',
      house_id: HOUSE_ID_1,
      metadata_json: JSON.stringify({
        entry_type: 'character',
        universe_id: UNIVERSE_ID_A,
        universe: 'Avalon Realm',
        canon_status: 'canonical',
        attributes: [],
        character_fields: {
          age: '28',
          species: 'Highlander',
          vital_status: 'Alive',
          occupation: 'Shieldmaiden',
          aliases: ['The Pale Lady'],
        },
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    // 3. Faction in Universe A with C2 Organization Structure
    {
      id: 'doc-fac-1',
      title: 'Northern Guard',
      doc_type: 'lorebook',
      house_id: HOUSE_ID_1,
      metadata_json: JSON.stringify({
        entry_type: 'faction',
        universe_id: UNIVERSE_ID_A,
        universe: 'Avalon Realm',
        canon_status: 'canonical',
        attributes: [],
        faction_fields: {
          faction_type: 'Military Order',
          leadership: 'High Marshal Voltaire Manus',
          headquarters: 'Fortress of Dunharrow',
          territory: 'Northern Marches',
          branches: [
            { id: 'br-1', name: 'First Vanguard' },
            { id: 'br-2', name: 'Iron Watch' },
          ],
          positions: [
            {
              id: 'pos-1',
              title: 'High Marshal',
              branch_id: 'br-1',
              holder_ids: ['doc-char-1'],
            },
            {
              id: 'pos-2',
              title: 'Scout Captain',
              branch_id: 'br-2',
              holder_ids: ['doc-char-2'],
            },
            {
              id: 'pos-3',
              title: 'Quartermaster',
              branch_id: 'br-2',
              holder_ids: [], // Vacant
            },
          ],
        },
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    // 4. Duplicate name entity in Universe A to test disambiguation
    {
      id: 'doc-loc-1',
      title: 'Avalon',
      doc_type: 'lorebook',
      house_id: HOUSE_ID_1,
      metadata_json: JSON.stringify({
        entry_type: 'location',
        universe_id: UNIVERSE_ID_A,
        universe: 'Avalon Realm',
        canon_status: 'canonical',
        attributes: [],
        location_fields: {
          location_type: 'Capital Fortress',
          region: 'Heartland Valley',
        },
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'doc-rule-1',
      title: 'Avalon',
      doc_type: 'lorebook',
      house_id: HOUSE_ID_1,
      metadata_json: JSON.stringify({
        entry_type: 'concept',
        universe_id: UNIVERSE_ID_A,
        universe: 'Avalon Realm',
        canon_status: 'canonical',
        attributes: [],
        rule_fields: {
          system_type: 'Planar Barrier',
        },
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    // 5. Archived entity (should be excluded)
    {
      id: 'doc-archived-1',
      title: 'Forgotten Sovereign',
      doc_type: 'lorebook',
      house_id: HOUSE_ID_1,
      metadata_json: JSON.stringify({
        entry_type: 'character',
        universe_id: UNIVERSE_ID_A,
        universe: 'Avalon Realm',
        canon_status: 'canonical',
        attributes: [],
        archived: true,
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    // 6. Entity belonging to House 2 (should be excluded when House 1 is active)
    {
      id: 'doc-house2-char',
      title: 'Kaelen Vance',
      doc_type: 'lorebook',
      house_id: HOUSE_ID_2,
      metadata_json: JSON.stringify({
        entry_type: 'character',
        universe_id: UNIVERSE_ID_A,
        universe: 'Avalon Realm',
        canon_status: 'canonical',
        attributes: [],
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    // 7. Entity belonging to Universe B (should be excluded when Universe A is active)
    {
      id: 'doc-univB-char',
      title: 'Neon Ghost',
      doc_type: 'lorebook',
      house_id: HOUSE_ID_1,
      metadata_json: JSON.stringify({
        entry_type: 'character',
        universe_id: UNIVERSE_ID_B,
        universe: 'Cyberia',
        canon_status: 'canonical',
        attributes: [],
      } satisfies Partial<LorebookMetadata>),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  await t.test('1. Multi-word and canonical name recognition in continuous prose', () => {
    const scopedEntities = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_ID_A, MOCK_PLAN, HOUSE_ID_1);
    assert.ok(scopedEntities.length >= 3, 'Scoped entities should include active entities');

    const prose = 'Early that dawn, Voltaire Manus stepped through the gateway into the courtyard of the Northern Guard.';
    const candidates = findCandidateMatches(EditorState.create({ doc: prose }).doc, scopedEntities, []);

    // Verify Voltaire Manus is recognized as a full multi-word term
    const vmCandidate = candidates.find((c) => c.matchedText === 'Voltaire Manus');
    assert.ok(vmCandidate, 'Voltaire Manus candidate must be recognized');
    assert.equal(vmCandidate.from, 17);
    assert.equal(vmCandidate.to, 31);
    assert.equal(vmCandidate.matchingEntities[0].id, 'doc-char-1');
    assert.equal(vmCandidate.isAmbiguous, false);

    // Verify Northern Guard is recognized
    const ngCandidate = candidates.find((c) => c.matchedText === 'Northern Guard');
    assert.ok(ngCandidate, 'Northern Guard candidate must be recognized');
    assert.equal(ngCandidate.matchingEntities[0].id, 'doc-fac-1');
  });

  await t.test('2. Character alias recognition from C1 metadata', () => {
    const scopedEntities = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_ID_A, MOCK_PLAN, HOUSE_ID_1);
    const vmEntity = scopedEntities.find((e) => e.id === 'doc-char-1');
    assert.ok(vmEntity);
    assert.deepEqual(vmEntity.aliases, ['The Iron Chancellor', 'Old Wolf']);

    const prose = 'Many feared The Iron Chancellor, but soldiers knew him simply as the Old Wolf.';
    const candidates = findCandidateMatches(EditorState.create({ doc: prose }).doc, scopedEntities, []);

    const ironCandidate = candidates.find((c) => c.matchedText === 'The Iron Chancellor');
    assert.ok(ironCandidate, '"The Iron Chancellor" alias must be recognized');
    assert.equal(ironCandidate.isAliasMatch, true);
    assert.equal(ironCandidate.matchingEntities[0].id, 'doc-char-1');

    const wolfCandidate = candidates.find((c) => c.matchedText === 'Old Wolf');
    assert.ok(wolfCandidate, '"Old Wolf" alias must be recognized');
    assert.equal(wolfCandidate.isAliasMatch, true);
    assert.equal(wolfCandidate.matchingEntities[0].id, 'doc-char-1');
  });

  await t.test('3. Unicode names and punctuation boundaries', () => {
    const scopedEntities = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_ID_A, MOCK_PLAN, HOUSE_ID_1);

    // Test Unicode character 'É' in Éowyn Vane
    const prose = 'Across the misty plains, Éowyn Vane rode swiftly. Later, Éowyn Vane, paused at the crest.';
    const candidates = findCandidateMatches(EditorState.create({ doc: prose }).doc, scopedEntities, []);

    const eowynMatches = candidates.filter((c) => c.matchedText === 'Éowyn Vane');
    assert.equal(eowynMatches.length, 2, 'Should detect both occurrences of Éowyn Vane');

    // First occurrence before period
    assert.equal(eowynMatches[0].from, 25);
    assert.equal(eowynMatches[0].to, 35);
    assert.equal(prose.slice(eowynMatches[0].from, eowynMatches[0].to), 'Éowyn Vane');

    // Second occurrence followed by comma
    assert.equal(eowynMatches[1].from, 57);
    assert.equal(eowynMatches[1].to, 67);
    assert.equal(prose.slice(eowynMatches[1].from, eowynMatches[1].to), 'Éowyn Vane');
  });

  await t.test('4. Rejection of partial-word false positives', () => {
    // Entities: "Arthur", "Dan", "Lax"
    const entities: EchoEntity[] = [
      {
        id: 'e-arthur',
        name: 'Arthur',
        category: 'character',
        universe: 'Test',
        description: 'King Arthur',
        guidedAttributes: {},
        customAttributes: [],
        relationships: [],
        status: 'active',
      },
      {
        id: 'e-dan',
        name: 'Dan',
        category: 'character',
        universe: 'Test',
        description: 'Dan',
        guidedAttributes: {},
        customAttributes: [],
        relationships: [],
        status: 'active',
      },
      {
        id: 'e-lax',
        name: 'Lax',
        category: 'location',
        universe: 'Test',
        description: 'Lax Port',
        guidedAttributes: {},
        customAttributes: [],
        relationships: [],
        status: 'active',
      },
    ];

    // Prose contains words embedding these names as substrings
    const prose = 'General MacArthur and the famous author faced dangerous peril across the galactic highway.';
    const candidates = findCandidateMatches(EditorState.create({ doc: prose }).doc, entities, []);

    assert.equal(candidates.length, 0, 'Partial-word matches (MacArthur, author, dangerous, galactic) must NOT produce false positives');
  });

  await t.test('5. Ambiguous name detection flags multiple candidate entities', () => {
    const scopedEntities = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_ID_A, MOCK_PLAN, HOUSE_ID_1);

    const prose = 'The traveler entered Avalon at sunrise.';
    const candidates = findCandidateMatches(EditorState.create({ doc: prose }).doc, scopedEntities, []);

    const avalonCandidate = candidates.find((c) => c.matchedText === 'Avalon');
    assert.ok(avalonCandidate, 'Avalon must be recognized');
    assert.equal(avalonCandidate.isAmbiguous, true, 'Avalon must be flagged as ambiguous');
    assert.equal(avalonCandidate.matchingEntities.length, 2, 'Should list both Location and Rule entities');

    const categories = avalonCandidate.matchingEntities.map((e) => e.category).sort();
    assert.deepEqual(categories, ['location', 'rule']);
  });

  await t.test('6. Alias collision handling without silent dropped matches', () => {
    const entities: EchoEntity[] = [
      {
        id: 'e-1',
        name: 'Silver Falcon',
        category: 'character',
        universe: 'Test',
        description: 'Hero',
        guidedAttributes: {},
        customAttributes: [],
        relationships: [],
        status: 'active',
      },
      {
        id: 'e-2',
        name: 'Marcus Gray',
        aliases: ['Silver Falcon'],
        category: 'character',
        universe: 'Test',
        description: 'Disguised agent',
        guidedAttributes: {},
        customAttributes: [],
        relationships: [],
        status: 'active',
      },
    ];

    const prose = 'The shadow of the Silver Falcon fell upon the tower.';
    const candidates = findCandidateMatches(EditorState.create({ doc: prose }).doc, entities, []);

    assert.equal(candidates.length, 1);
    const cand = candidates[0];
    assert.equal(cand.matchedText, 'Silver Falcon');
    assert.equal(cand.isAmbiguous, true);
    assert.equal(cand.matchingEntities.length, 2);
    assert.ok(cand.matchingEntities.some((e) => e.id === 'e-1'));
    assert.ok(cand.matchingEntities.some((e) => e.id === 'e-2'));
  });

  await t.test('7. House and Universe isolation: cross-universe and cross-house terms are excluded', () => {
    // 1. Scoped to Universe A and House 1
    const scopedA1 = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_ID_A, MOCK_PLAN, HOUSE_ID_1);
    const namesA1 = scopedA1.map((e) => e.name);

    assert.ok(namesA1.includes('Voltaire Manus'), 'Voltaire Manus must be present in House 1 Universe A');
    assert.ok(!namesA1.includes('Kaelen Vance'), 'House 2 entity must NOT leak into House 1 index');
    assert.ok(!namesA1.includes('Neon Ghost'), 'Universe B entity must NOT leak into Universe A index');

    // 2. Scoped to Universe B and House 1
    const scopedB1 = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_ID_B, MOCK_PLAN, HOUSE_ID_1);
    const namesB1 = scopedB1.map((e) => e.name);
    assert.ok(namesB1.includes('Neon Ghost'), 'Neon Ghost must be present in Universe B');
    assert.ok(!namesB1.includes('Voltaire Manus'), 'Universe A entity must NOT leak into Universe B index');

    // 3. Scoped to Universe A and House 2
    const scopedA2 = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_ID_A, MOCK_PLAN, HOUSE_ID_2);
    const namesA2 = scopedA2.map((e) => e.name);
    assert.ok(namesA2.includes('Kaelen Vance'), 'House 2 entity must be present in House 2 index');
    assert.ok(!namesA2.includes('Voltaire Manus'), 'House 1 entity must NOT leak into House 2 index');
  });

  await t.test('8. Archived entities are excluded from live candidate recognition', () => {
    const scopedEntities = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_ID_A, MOCK_PLAN, HOUSE_ID_1);
    const names = scopedEntities.map((e) => e.name);

    assert.ok(!names.includes('Forgotten Sovereign'), 'Archived entity must NOT be indexed in candidate matches');

    const prose = 'The legend of the Forgotten Sovereign echoed in the dark halls.';
    const candidates = findCandidateMatches(EditorState.create({ doc: prose }).doc, scopedEntities, []);
    assert.equal(candidates.find((c) => c.matchedText === 'Forgotten Sovereign'), undefined);
  });

  await t.test('9. Contextual dossier generation incorporates C1 attributes, C2 held offices, and C3/C4 relationships', () => {
    const scopedEntities = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_ID_A, MOCK_PLAN, HOUSE_ID_1);
    const vm = scopedEntities.find((e) => e.id === 'doc-char-1')!;
    assert.ok(vm);

    // C1 Character Profile verification
    assert.ok(vm.characterProfile);
    assert.equal(vm.characterProfile.age, '54');
    assert.equal(vm.characterProfile.species, 'Human');
    assert.equal(vm.characterProfile.gender, 'Male');
    assert.equal(vm.characterProfile.occupation, 'High Chancellor');
    assert.equal(vm.characterProfile.narrativeRole, 'Antagonist turned ally');

    // Guided attributes check
    assert.equal(vm.guidedAttributes['Age'], '54');
    assert.equal(vm.guidedAttributes['Occupation'], 'High Chancellor');

    // Custom attributes check
    const sigWeapon = vm.customAttributes.find((a) => a.key === 'Signature Weapon');
    assert.ok(sigWeapon);
    assert.equal(sigWeapon.value, 'Riftforged Claymore');

    // C2 Held Offices reverse lookup check
    assert.ok(vm.heldOffices && vm.heldOffices.length > 0);
    const office = vm.heldOffices[0];
    assert.equal(office.factionTitle, 'Northern Guard');
    assert.equal(office.positionTitle, 'High Marshal');
    assert.equal(office.branchName, 'First Vanguard');

    // C2 Faction Structure on Faction entity
    const faction = scopedEntities.find((e) => e.id === 'doc-fac-1')!;
    assert.ok(faction);
    assert.ok(faction.factionStructure);
    assert.equal(faction.factionStructure.positions.length, 3);
    const vacantPos = faction.factionStructure.positions.find((p) => p.title === 'Quartermaster')!;
    assert.equal(vacantPos.isVacant, true);
    const marshalPos = faction.factionStructure.positions.find((p) => p.title === 'High Marshal')!;
    assert.equal(marshalPos.holders[0], 'Voltaire Manus');

    // C3/C4 Relationships with perspective
    assert.ok(vm.relationships.length >= 2);
    const guardRel = vm.relationships.find((r) => r.targetId === 'doc-fac-1')!;
    assert.equal(guardRel.targetCategory, 'faction');
    assert.equal(guardRel.isDirected, true);
    assert.equal(guardRel.categoryKind, 'guided');

    const rivalRel = vm.relationships.find((r) => r.targetId === 'doc-char-2')!;
    assert.equal(rivalRel.targetCategory, 'character');
    assert.equal(rivalRel.isDirected, false);
  });

  await t.test('10. CodeMirror 6 non-destructive ephemeral decorations & undo/redo preservation', () => {
    const scopedEntities = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_ID_A, MOCK_PLAN, HOUSE_ID_1);
    const initialText = 'Voltaire Manus walked past the grand banners of the Northern Guard.';

    const state = EditorState.create({
      doc: initialText,
      extensions: [
        echoEntitiesField.init(() => scopedEntities),
        confirmedReferencesField,
        candidateMatchesField,
      ],
    });

    // 1. Verify candidate matches exist without altering the doc
    const initialCandidates = state.field(candidateMatchesField).candidates;
    assert.equal(initialCandidates.length, 2);
    assert.equal(state.doc.toString(), initialText);

    // 2. Dispatch a confirmed reference effect
    const ref: EchoConfirmedReference = {
      id: 'ref-test-1',
      entityId: 'doc-char-1',
      from: 0,
      to: 14,
      matchedText: 'Voltaire Manus',
    };

    const tr = state.update({
      effects: confirmReferenceEffect.of(ref),
    });

    // 3. Document text must remain 100% byte-for-byte identical (zero synthetic tokens, zero markdown alteration)
    assert.equal(tr.newDoc.toString(), initialText);

    // 4. Confirmed reference state contains the reference
    const confirmed = tr.state.field(confirmedReferencesField).references;
    assert.equal(confirmed.length, 1);
    assert.equal(confirmed[0].matchedText, 'Voltaire Manus');

    // 5. Insert text at the beginning of the document: offsets must map cleanly
    const insertTr = tr.state.update({
      changes: { from: 0, insert: 'Lord ' },
    });

    assert.equal(insertTr.newDoc.toString(), 'Lord Voltaire Manus walked past the grand banners of the Northern Guard.');
    const shiftedRefs = insertTr.state.field(confirmedReferencesField).references;
    assert.equal(shiftedRefs.length, 1);
    assert.equal(shiftedRefs[0].from, 5); // Shifted by +5 ('Lord ')
    assert.equal(shiftedRefs[0].to, 19);
  });

  await t.test('11. Incremental change handling and long document performance', () => {
    const scopedEntities = buildScopedEchoEntities(MOCK_DOCS, UNIVERSE_ID_A, MOCK_PLAN, HOUSE_ID_1);

    // Build a 5,000 word document repeating paragraphs
    const paragraph = 'Voltaire Manus commanded the ranks of the Northern Guard while Éowyn Vane kept vigil over Avalon.\n\n';
    const longProse = paragraph.repeat(250); // ~5,500 words

    const start = performance.now();
    const doc = EditorState.create({ doc: longProse }).doc;
    const candidates = findCandidateMatches(doc, scopedEntities, []);
    const duration = performance.now() - start;

    assert.ok(candidates.length > 500, 'Should detect candidate matches across the long text');
    assert.ok(duration < 250, `Candidate matching over 5k words took ${duration.toFixed(2)}ms (must be under 250ms)`);
  });
});
