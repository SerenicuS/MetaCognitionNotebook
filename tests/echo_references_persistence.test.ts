import test from 'node:test';
import assert from 'node:assert';
import { EditorState } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import {
  echoEntitiesField,
  confirmedReferencesField,
  candidateMatchesField,
  echoInvertedEffects,
  buildConfirmedDecorations,
  bindReferenceEffect,
  unbindReferenceEffect,
  changeTargetEffect,
  detachReferenceEffect,
  reattachReferenceEffect,
  loadReferencesEffect,
} from '../src/components/echo/echoExtension';
import type { EchoEntity, EchoPersistentReference } from '../src/components/echo/types';
import {
  normalizeDocumentText,
  createContextAnchor,
  reconcileReferences,
} from '../src/utils/echoReconciliation';
import { SaveCoordinator, registerChildFlushHandler, flushChildEditors } from '../src/services/autosave';

const MOCK_ENTITIES: EchoEntity[] = [
  {
    id: 'ent-kael-001',
    name: 'Kael',
    category: 'character',
    universe: 'Avalon',
    universeId: 'univ-avalon-01',
    houseId: 'house-default',
    description: 'A valiant knight of the Silver Order.',
    guidedAttributes: {},
    customAttributes: [],
    relationships: [],
    status: 'active',
  },
  {
    id: 'ent-theron-002',
    name: 'Theron',
    category: 'character',
    universe: 'Avalon',
    universeId: 'univ-avalon-01',
    houseId: 'house-default',
    description: 'Arch-mage of the High Tower.',
    guidedAttributes: {},
    customAttributes: [],
    relationships: [],
    status: 'active',
  },
  {
    id: 'ent-avalon-003',
    name: 'Avalon',
    category: 'location',
    universe: 'Avalon',
    universeId: 'univ-avalon-01',
    houseId: 'house-default',
    description: 'The ancient capital realm.',
    guidedAttributes: {},
    customAttributes: [],
    relationships: [],
    status: 'active',
  },
];

function createTestState(
  initialDoc: string,
  initialRefs: EchoPersistentReference[] = []
): EditorState {
  const norm = normalizeDocumentText(initialDoc);
  const eligibleIds = new Set(MOCK_ENTITIES.map((e) => e.id));
  const rec = reconcileReferences(norm, initialRefs, eligibleIds);

  return EditorState.create({
    doc: norm,
    extensions: [
      history(),
      echoInvertedEffects,
      echoEntitiesField.init(() => MOCK_ENTITIES),
      confirmedReferencesField.init(() => ({
        references: rec.active,
        detachedReferences: rec.detached,
        decorations: buildConfirmedDecorations(rec.active),
      })),
      candidateMatchesField,
    ],
  });
}

test('Echo Library E3: Persistent References & Pronoun Binding Test Suite', async (t) => {
  // 1. Binding creation and exact offset verification
  await t.test('1. Explicit pronoun binding creation targets exact UTF-16 span and entity UUID without altering prose', () => {
    const prose = 'The knight entered the temple. He knew the Abyssals were waiting.';
    let state = createTestState(prose);

    const from = 31;
    const to = 33;
    assert.strictEqual(state.doc.sliceString(from, to), 'He');

    const anchor = createContextAnchor(state.doc.toString(), from, to);
    const newRef: EchoPersistentReference = {
      id: 'ref-test-01',
      targetId: 'ent-kael-001',
      entityId: 'ent-kael-001',
      from,
      to,
      matchedText: 'He',
      anchor,
      contextAnchor: anchor,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    state = state.update({
      effects: bindReferenceEffect.of(newRef),
    }).state;

    const fieldState = state.field(confirmedReferencesField);
    assert.strictEqual(fieldState.references.length, 1);
    assert.strictEqual(fieldState.references[0].id, 'ref-test-01');
    assert.strictEqual(fieldState.references[0].targetId, 'ent-kael-001');
    assert.strictEqual(fieldState.references[0].from, 31);
    assert.strictEqual(fieldState.references[0].to, 33);
    assert.strictEqual(fieldState.references[0].matchedText, 'He');
    assert.strictEqual(fieldState.references[0].status, 'active');

    // Prose purity invariant: exactly unchanged Markdown
    assert.strictEqual(state.doc.toString(), prose);
  });

  // 2. Multi-pronoun sentence independence
  await t.test('2. Multi-pronoun sentence supports independent binding of identical words to different entities', () => {
    // "He looked at him. He smiled."
    //  0123456789012345678901234567
    //  He (0..2) -> Kael
    //  him (13..16) -> Theron
    //  He (18..20) -> Theron
    const prose = 'He looked at him. He smiled.';
    let state = createTestState(prose);

    const ref1: EchoPersistentReference = {
      id: 'ref-multi-1',
      targetId: 'ent-kael-001',
      from: 0,
      to: 2,
      matchedText: 'He',
      anchor: createContextAnchor(prose, 0, 2),
      status: 'active',
    };
    const ref2: EchoPersistentReference = {
      id: 'ref-multi-2',
      targetId: 'ent-theron-002',
      from: 13,
      to: 16,
      matchedText: 'him',
      anchor: createContextAnchor(prose, 13, 16),
      status: 'active',
    };
    const ref3: EchoPersistentReference = {
      id: 'ref-multi-3',
      targetId: 'ent-theron-002',
      from: 18,
      to: 20,
      matchedText: 'He',
      anchor: createContextAnchor(prose, 18, 20),
      status: 'active',
    };

    state = state.update({
      effects: [
        bindReferenceEffect.of(ref1),
        bindReferenceEffect.of(ref2),
        bindReferenceEffect.of(ref3),
      ],
    }).state;

    const field = state.field(confirmedReferencesField);
    assert.strictEqual(field.references.length, 3);

    const r1 = field.references.find((r) => r.from === 0);
    const r2 = field.references.find((r) => r.from === 13);
    const r3 = field.references.find((r) => r.from === 18);

    assert.ok(r1 && r2 && r3);
    assert.strictEqual(r1.targetId, 'ent-kael-001');
    assert.strictEqual(r2.targetId, 'ent-theron-002');
    assert.strictEqual(r3.targetId, 'ent-theron-002');
    assert.strictEqual(r1.matchedText, 'He');
    assert.strictEqual(r3.matchedText, 'He');
  });

  // 3. Precedence over dynamic lexical candidates
  await t.test('3. Bound persistent references take precedence over dynamic lexical candidates', () => {
    // "Avalon is glorious."
    // Dynamic matching normally catches "Avalon" (0..6)
    const prose = 'Avalon is glorious.';
    let state = createTestState(prose);

    // Initial state: dynamic candidate exists for Avalon
    let candidates = state.field(candidateMatchesField).candidates;
    assert.ok(candidates.some((c) => c.matchedText === 'Avalon'));

    // Bind Avalon explicitly to ent-avalon-003
    const boundRef: EchoPersistentReference = {
      id: 'ref-avalon-p0',
      targetId: 'ent-avalon-003',
      from: 0,
      to: 6,
      matchedText: 'Avalon',
      anchor: createContextAnchor(prose, 0, 6),
      status: 'active',
    };

    state = state.update({
      effects: bindReferenceEffect.of(boundRef),
    }).state;

    // Invariant: candidate matches field suppresses candidates overlapping the bound reference
    candidates = state.field(candidateMatchesField).candidates;
    const overlapping = candidates.filter((c) => c.from < 6 && c.to > 0);
    assert.strictEqual(overlapping.length, 0);
  });

  // 4. Edit shifting: text inserted before span shifts offsets cleanly
  await t.test('4. Insertions before bound reference shift offsets forward cleanly and preserve active status', () => {
    const prose = 'The knight waited. He smiled.';
    // 'He' is at [19, 21)
    let state = createTestState(prose);

    const ref: EchoPersistentReference = {
      id: 'ref-shift-01',
      targetId: 'ent-kael-001',
      from: 19,
      to: 21,
      matchedText: 'He',
      anchor: createContextAnchor(prose, 19, 21),
      status: 'active',
    };
    state = state.update({ effects: bindReferenceEffect.of(ref) }).state;

    // Insert " brave" at index 10: "The knight brave waited. He smiled." (+6 chars)
    state = state.update({
      changes: { from: 10, insert: ' brave' },
    }).state;

    const field = state.field(confirmedReferencesField);
    assert.strictEqual(field.references.length, 1);
    assert.strictEqual(field.references[0].from, 25);
    assert.strictEqual(field.references[0].to, 27);
    assert.strictEqual(field.references[0].matchedText, 'He');
    assert.strictEqual(field.references[0].status, 'active');
    assert.strictEqual(state.doc.sliceString(25, 27), 'He');
  });

  // 5. Edit detachment: mutating inside span marks reference detached
  await t.test('5. Editing inside bound span marks reference detached rather than retaining corrupted link', () => {
    const prose = 'He smiled.';
    // 'He' at [0, 2)
    let state = createTestState(prose);

    const ref: EchoPersistentReference = {
      id: 'ref-detach-01',
      targetId: 'ent-kael-001',
      from: 0,
      to: 2,
      matchedText: 'He',
      anchor: createContextAnchor(prose, 0, 2),
      status: 'active',
    };
    state = state.update({ effects: bindReferenceEffect.of(ref) }).state;

    // Mutate 'He' -> 'Hey' (replace 'e' at index 1..2 with 'ey')
    state = state.update({
      changes: { from: 1, to: 2, insert: 'ey' },
    }).state;

    const field = state.field(confirmedReferencesField);
    // Active references should no longer hold the corrupted span
    assert.strictEqual(field.references.length, 0);
    // Detached collection retains the reference for manual author repair
    assert.strictEqual(field.detachedReferences.length, 1);
    assert.strictEqual(field.detachedReferences[0].id, 'ref-detach-01');
    assert.strictEqual(field.detachedReferences[0].status, 'detached');
  });

  // 6. Boundary deletion marks reference detached
  await t.test('6. Deleting across reference boundary detaches reference safely', () => {
    const prose = 'He walked.';
    let state = createTestState(prose);

    const ref: EchoPersistentReference = {
      id: 'ref-del-01',
      targetId: 'ent-kael-001',
      from: 0,
      to: 2,
      matchedText: 'He',
      anchor: createContextAnchor(prose, 0, 2),
      status: 'active',
    };
    state = state.update({ effects: bindReferenceEffect.of(ref) }).state;

    // Delete character 'e' at index 1..2
    state = state.update({
      changes: { from: 1, to: 2 },
    }).state;

    const field = state.field(confirmedReferencesField);
    assert.strictEqual(field.references.length, 0);
    assert.strictEqual(field.detachedReferences.length, 1);
    assert.strictEqual(field.detachedReferences[0].id, 'ref-del-01');
  });

  // 7. CodeMirror invertedEffects undo/redo support
  await t.test('7. Undo/redo restores reference binding, removal, and target changes via invertedEffects', () => {
    const prose = 'He entered.';
    let state = createTestState(prose);

    const ref: EchoPersistentReference = {
      id: 'ref-undo-01',
      targetId: 'ent-kael-001',
      from: 0,
      to: 2,
      matchedText: 'He',
      anchor: createContextAnchor(prose, 0, 2),
      status: 'active',
    };

    // Helper to dispatch through history
    const dispatch = (tr: any) => {
      state = tr.state;
    };

    // 1. Dispatch binding
    state = state.update({ effects: bindReferenceEffect.of(ref) }).state;
    assert.strictEqual(state.field(confirmedReferencesField).references.length, 1);

    // 2. Undo binding
    undo({ state, dispatch });
    assert.strictEqual(state.field(confirmedReferencesField).references.length, 0);

    // 3. Redo binding
    redo({ state, dispatch });
    assert.strictEqual(state.field(confirmedReferencesField).references.length, 1);
    assert.strictEqual(state.field(confirmedReferencesField).references[0].targetId, 'ent-kael-001');

    // 4. Change target to Theron
    state = state.update({
      effects: changeTargetEffect.of({ id: 'ref-undo-01', targetId: 'ent-theron-002' }),
    }).state;
    assert.strictEqual(state.field(confirmedReferencesField).references[0].targetId, 'ent-theron-002');

    // 5. Undo retarget
    undo({ state, dispatch });
    assert.strictEqual(state.field(confirmedReferencesField).references[0].targetId, 'ent-kael-001');

    // 6. Redo retarget
    redo({ state, dispatch });
    assert.strictEqual(state.field(confirmedReferencesField).references[0].targetId, 'ent-theron-002');
  });

  // 8. External edit re-anchoring with shifted text within bounded window
  await t.test('8. External edits shift text within bounded window: re-anchors unambiguously', () => {
    const originalProse = 'In the ancient citadel, he waited alone.';
    // 'he' is at [24, 26)
    const anchor = createContextAnchor(originalProse, 24, 26);
    const persisted: EchoPersistentReference[] = [
      {
        id: 'ref-reanchor-01',
        targetId: 'ent-kael-001',
        from: 24,
        to: 26,
        matchedText: 'he',
        anchor,
        status: 'active',
      },
    ];

    // External edit adds 10 characters at the start
    const externallyEditedProse = 'Long ago, In the ancient citadel, he waited alone.';
    // 'he' is now at [34, 36)

    const eligible = new Set(['ent-kael-001', 'ent-theron-002']);
    const result = reconcileReferences(externallyEditedProse, persisted, eligible);

    assert.strictEqual(result.active.length, 1);
    assert.strictEqual(result.active[0].from, 34);
    assert.strictEqual(result.active[0].to, 36);
    assert.strictEqual(result.active[0].matchedText, 'he');
    assert.strictEqual(result.active[0].status, 'active');
    assert.strictEqual(result.hasRepairedOffsets, true);
  });

  // 9. Ambiguous repeated pronoun rejection (strict non-inference)
  await t.test('9. Strict non-inference invariant: ambiguous repeated pronouns without unique anchor are detached, never guessed', () => {
    // "He entered. He waited. He spoke."
    // 3 occurrences of 'He'
    const prose = 'He entered. He waited. He spoke.';
    // Persisted ref had stale offset 99 and blank/generic anchor that cannot distinguish which 'He'
    const ambiguousRef: EchoPersistentReference = {
      id: 'ref-ambig-01',
      targetId: 'ent-kael-001',
      from: 99,
      to: 101,
      matchedText: 'He',
      anchor: { before: '', after: '' },
      status: 'active',
    };

    const eligible = new Set(['ent-kael-001']);
    const result = reconcileReferences(prose, [ambiguousRef], eligible);

    // Invariant: MUST NOT GUESS. Detaches to preserve author intent.
    assert.strictEqual(result.active.length, 0);
    assert.strictEqual(result.detached.length, 1);
    assert.strictEqual(result.detached[0].id, 'ref-ambig-01');
    assert.strictEqual(result.detached[0].status, 'detached');
  });

  // 10. Line ending normalization (CRLF -> LF)
  await t.test('10. Windows CRLF documents normalize to LF, maintaining exact UTF-16 coordinate alignment', () => {
    const crlfText = 'Line 1\r\nLine 2\r\nHe walked.';
    const normalized = normalizeDocumentText(crlfText);

    assert.ok(!normalized.includes('\r'));
    assert.strictEqual(normalized, 'Line 1\nLine 2\nHe walked.');

    // In normalized text:
    // "Line 1\nLine 2\nHe walked."
    // "Line 1\n" = 7 chars
    // "Line 2\n" = 7 chars
    // "He" starts at 14
    const from = 14;
    const to = 16;
    assert.strictEqual(normalized.slice(from, to), 'He');

    const anchor = createContextAnchor(normalized, from, to);
    const persisted: EchoPersistentReference[] = [
      {
        id: 'ref-crlf-01',
        targetId: 'ent-kael-001',
        from,
        to,
        matchedText: 'He',
        anchor,
        status: 'active',
      },
    ];

    const result = reconcileReferences(crlfText, persisted, new Set(['ent-kael-001']));
    assert.strictEqual(result.active.length, 1);
    assert.strictEqual(result.active[0].from, 14);
    assert.strictEqual(result.active[0].to, 16);
    assert.strictEqual(result.active[0].status, 'active');
  });

  // 11. Astral Unicode / surrogate pairs / emoji offset stability
  await t.test('11. Astral Unicode and emoji preserve exact UTF-16 code unit offset stability', () => {
    // "🛡️ The knight smiled. He knew."
    // 🛡️ = \uD83D\uDEE1 (2 code units) + \uFE0F (1 code unit) = 3 code units
    // " " = 1
    // "The knight smiled. " = 19
    // "He" starts at 3 + 1 + 19 = 23
    const prose = '🛡️ The knight smiled. He knew.';
    const from = prose.indexOf('He');
    const to = from + 2;
    assert.strictEqual(prose.slice(from, to), 'He');

    const anchor = createContextAnchor(prose, from, to);
    const persisted: EchoPersistentReference[] = [
      {
        id: 'ref-astral-01',
        targetId: 'ent-kael-001',
        from,
        to,
        matchedText: 'He',
        anchor,
        status: 'active',
      },
    ];

    const result = reconcileReferences(prose, persisted, new Set(['ent-kael-001']));
    assert.strictEqual(result.active.length, 1);
    assert.strictEqual(result.active[0].from, from);
    assert.strictEqual(result.active[0].to, to);
    assert.strictEqual(result.active[0].matchedText, 'He');
  });

  // 12. Coherent snapshot save & reload round-trip
  await t.test('12. Coherent snapshot frontmatter serialization round-trips cleanly without data loss', () => {
    const prose = 'The knight entered. He knew.';
    let state = createTestState(prose);

    const ref: EchoPersistentReference = {
      id: 'ref-snapshot-01',
      targetId: 'ent-kael-001',
      from: 20,
      to: 22,
      matchedText: 'He',
      anchor: createContextAnchor(prose, 20, 22),
      status: 'active',
      createdAt: '2026-10-31T12:00:00.000Z',
    };

    state = state.update({ effects: bindReferenceEffect.of(ref) }).state;

    // Simulate saving frontmatter metadata
    const field = state.field(confirmedReferencesField);
    const savedMeta = {
      title: 'Chapter 1',
      echo_references: [...field.references, ...field.detachedReferences],
    };
    const serializedJson = JSON.stringify(savedMeta);

    // Simulate reloading from disk
    const parsed = JSON.parse(serializedJson);
    const reloadedRefs: EchoPersistentReference[] = parsed.echo_references;

    assert.strictEqual(reloadedRefs.length, 1);
    assert.strictEqual(reloadedRefs[0].id, 'ref-snapshot-01');
    assert.strictEqual(reloadedRefs[0].targetId, 'ent-kael-001');
    assert.strictEqual(reloadedRefs[0].from, 20);
    assert.strictEqual(reloadedRefs[0].to, 22);
    assert.strictEqual(reloadedRefs[0].matchedText, 'He');
    assert.strictEqual(reloadedRefs[0].status, 'active');

    // Create a new editor state with reloaded metadata
    const stateReloaded = createTestState(prose, reloadedRefs);
    const reloadedField = stateReloaded.field(confirmedReferencesField);
    assert.strictEqual(reloadedField.references.length, 1);
    assert.strictEqual(reloadedField.references[0].id, 'ref-snapshot-01');
  });

  // 13. House/Universe isolation and unresolved target handling
  await t.test('13. Unresolved targets outside authorized House/Universe boundary retain span as unresolved without leaking', () => {
    const prose = 'He wandered through foreign lands.';
    // 'He' at [0, 2)
    // Target entity 'ent-foreign-999' is NOT in the eligible entity list
    const foreignRef: EchoPersistentReference = {
      id: 'ref-foreign-01',
      targetId: 'ent-foreign-999',
      from: 0,
      to: 2,
      matchedText: 'He',
      anchor: createContextAnchor(prose, 0, 2),
      status: 'active',
    };

    const eligible = new Set(['ent-kael-001', 'ent-theron-002']); // Foreign ID not included
    const result = reconcileReferences(prose, [foreignRef], eligible);

    // Status is transitioned to 'unresolved'
    assert.strictEqual(result.active.length, 1);
    assert.strictEqual(result.active[0].status, 'unresolved');
    assert.strictEqual(result.unresolvedCount, 1);
  });

  // 14. Manage References drawer operations: repair anchor & remove unresolved
  await t.test('14. Explicit re-anchoring repairs detached references and restores active binding', () => {
    const prose = 'After the long journey, He rested.';
    // 'He' is at [24, 26)
    let state = createTestState(prose);

    // Initially detached reference (e.g. from an earlier edit)
    const detachedRef: EchoPersistentReference = {
      id: 'ref-repair-01',
      targetId: 'ent-kael-001',
      from: 0,
      to: 2,
      matchedText: 'He',
      anchor: { before: '', after: '' },
      status: 'detached',
    };

    state = state.update({
      effects: loadReferencesEffect.of({
        references: [],
        detachedReferences: [detachedRef],
      }),
    }).state;

    let field = state.field(confirmedReferencesField);
    assert.strictEqual(field.references.length, 0);
    assert.strictEqual(field.detachedReferences.length, 1);

    // Author repairs anchor to [24, 26)
    const anchor = createContextAnchor(prose, 24, 26);
    state = state.update({
      effects: reattachReferenceEffect.of({
        ...detachedRef,
        from: 24,
        to: 26,
        anchor,
        contextAnchor: anchor,
        status: 'active',
      }),
    }).state;

    field = state.field(confirmedReferencesField);
    assert.strictEqual(field.references.length, 1);
    assert.strictEqual(field.detachedReferences.length, 0);
    assert.strictEqual(field.references[0].id, 'ref-repair-01');
    assert.strictEqual(field.references[0].from, 24);
    assert.strictEqual(field.references[0].to, 26);
    assert.strictEqual(field.references[0].status, 'active');
  });

  // 15. History-aware restoration of safely detached references via Undo/Redo
  await t.test('15. CodeMirror Undo automatically restores safely detached references after text edit undo', () => {
    let state = createTestState('He smiled.');
    const anchor = createContextAnchor('He smiled.', 0, 2);

    // Bind 'He' [0, 2)
    state = state.update({
      effects: bindReferenceEffect.of({
        id: 'ref-undo-01',
        targetId: 'ent-kael-001',
        from: 0,
        to: 2,
        matchedText: 'He',
        anchor,
        status: 'active',
      }),
    }).state;

    assert.strictEqual(state.field(confirmedReferencesField).references.length, 1);
    assert.strictEqual(state.field(confirmedReferencesField).detachedReferences.length, 0);

    // Destructive text edit: 'He' -> 'Hey' (mutates span)
    state = state.update({
      changes: { from: 1, to: 2, insert: 'ey' },
    }).state;

    assert.strictEqual(state.doc.toString(), 'Hey smiled.');
    assert.strictEqual(state.field(confirmedReferencesField).references.length, 0);
    assert.strictEqual(state.field(confirmedReferencesField).detachedReferences.length, 1);
    assert.strictEqual(state.field(confirmedReferencesField).detachedReferences[0].id, 'ref-undo-01');

    // Undo the edit: should restore original 'He' AND original reference identity
    undo({ state, dispatch: (tr) => { state = tr.state; } });

    assert.strictEqual(state.doc.toString(), 'He smiled.');
    assert.strictEqual(state.field(confirmedReferencesField).references.length, 1);
    assert.strictEqual(state.field(confirmedReferencesField).detachedReferences.length, 0);
    assert.strictEqual(state.field(confirmedReferencesField).references[0].id, 'ref-undo-01');
    assert.strictEqual(state.field(confirmedReferencesField).references[0].targetId, 'ent-kael-001');
    assert.strictEqual(state.field(confirmedReferencesField).references[0].from, 0);
    assert.strictEqual(state.field(confirmedReferencesField).references[0].to, 2);

    // Redo the edit: should detach again cleanly
    redo({ state, dispatch: (tr) => { state = tr.state; } });

    assert.strictEqual(state.doc.toString(), 'Hey smiled.');
    assert.strictEqual(state.field(confirmedReferencesField).references.length, 0);
    assert.strictEqual(state.field(confirmedReferencesField).detachedReferences.length, 1);
  });

  // 16. Multi-pronoun sentence independence across edits, undo, and redo
  await t.test('16. Multi-pronoun sentence independence across destructive edits, undo, and redo', () => {
    const prose = 'He looked at him. He smiled.';
    let state = createTestState(prose);

    // Bind first 'He' [0, 2) -> Kael
    state = state.update({
      effects: bindReferenceEffect.of({
        id: 'ref-kael-1',
        targetId: 'ent-kael-001',
        from: 0,
        to: 2,
        matchedText: 'He',
        status: 'active',
      }),
    }).state;

    // Bind second 'He' [18, 20) -> Theron
    state = state.update({
      effects: bindReferenceEffect.of({
        id: 'ref-theron-2',
        targetId: 'ent-theron-002',
        from: 18,
        to: 20,
        matchedText: 'He',
        status: 'active',
      }),
    }).state;

    assert.strictEqual(state.field(confirmedReferencesField).references.length, 2);

    // Edit only the second 'He' [18, 20) -> 'Hey'
    state = state.update({
      changes: { from: 19, to: 20, insert: 'ey' },
    }).state;

    // First 'He' must remain active; second 'He' must be detached
    let field = state.field(confirmedReferencesField);
    assert.strictEqual(field.references.length, 1);
    assert.strictEqual(field.references[0].id, 'ref-kael-1');
    assert.strictEqual(field.references[0].targetId, 'ent-kael-001');
    assert.strictEqual(field.detachedReferences.length, 1);
    assert.strictEqual(field.detachedReferences[0].id, 'ref-theron-2');
    assert.strictEqual(field.detachedReferences[0].targetId, 'ent-theron-002');

    // Undo edit on second 'He'
    undo({ state, dispatch: (tr) => { state = tr.state; } });

    field = state.field(confirmedReferencesField);
    assert.strictEqual(state.doc.toString(), prose);
    assert.strictEqual(field.references.length, 2);
    assert.strictEqual(field.detachedReferences.length, 0);

    const refKael = field.references.find((r) => r.id === 'ref-kael-1');
    const refTheron = field.references.find((r) => r.id === 'ref-theron-2');
    assert.ok(refKael && refTheron);
    assert.strictEqual(refKael.from, 0);
    assert.strictEqual(refKael.to, 2);
    assert.strictEqual(refTheron.from, 18);
    assert.strictEqual(refTheron.to, 20);

    // Redo edit
    redo({ state, dispatch: (tr) => { state = tr.state; } });

    field = state.field(confirmedReferencesField);
    assert.strictEqual(field.references.length, 1);
    assert.strictEqual(field.references[0].id, 'ref-kael-1');
    assert.strictEqual(field.detachedReferences.length, 1);
    assert.strictEqual(field.detachedReferences[0].id, 'ref-theron-2');
  });

  // 17. Lifecycle-safe SaveCoordinator & parent navigation flush
  await t.test('17. SaveCoordinator drains pending chapter edits and flushes immediately on parent navigation', async () => {
    let savedDocuments: { id: string; content?: string; metaJson?: string }[] = [];
    let saveCallCount = 0;

    const mockSaveDocument = async (id: string, content?: string, title?: string, tags?: string[], metadataJson?: string) => {
      saveCallCount++;
      savedDocuments.push({ id, content, metaJson: metadataJson });
    };

    const saveCoordinator = new SaveCoordinator();
    let isDirty = false;
    let latestRev = 0;
    let savedRev = 0;
    let chapterContent = 'Draft text';
    let chapterRefs: EchoPersistentReference[] = [];

    const flushChapterSave = async (): Promise<boolean> => {
      if (!isDirty && latestRev <= savedRev) return true;
      return await saveCoordinator.flush(async () => {
        const rev = latestRev;
        const content = chapterContent;
        const refs = chapterRefs;
        await mockSaveDocument('chap-01', content, 'Chapter 1', [], JSON.stringify({ echo_references: refs }));
        if (rev > savedRev) savedRev = rev;
        if (latestRev === rev) {
          isDirty = false;
          return 'saved';
        }
        return 'more';
      });
    };

    // Register child flush handler
    registerChildFlushHandler(flushChapterSave);

    // 1. Author binds a pronoun in the chapter
    latestRev++;
    isDirty = true;
    chapterRefs = [{
      id: 'ref-nav-01',
      targetId: 'ent-kael-001',
      from: 0,
      to: 2,
      matchedText: 'He',
      status: 'active',
    }];

    // 2. Author navigates immediately to another studio before debounce expires
    // Parent navigation triggers flushChildEditors()
    const flushSuccess = await flushChildEditors();
    assert.strictEqual(flushSuccess, true);
    assert.strictEqual(saveCallCount, 1);
    assert.strictEqual(savedDocuments[0].id, 'chap-01');
    assert.ok(savedDocuments[0].metaJson?.includes('ref-nav-01'));
    assert.strictEqual(isDirty, false);

    // Unregister on unmount
    registerChildFlushHandler(null);
  });
});
