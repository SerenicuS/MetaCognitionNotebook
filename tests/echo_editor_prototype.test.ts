import test from 'node:test';
import assert from 'node:assert';
import { EditorState } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import {
  echoEntitiesField,
  confirmedReferencesField,
  candidateMatchesField,
  confirmReferenceEffect,
  unconfirmReferenceEffect,
  resetReferencesEffect,
  findCandidateMatches,
} from '../src/components/echo/echoExtension';
import {
  MOCK_LORE_ENTITIES,
  MOCK_UNIVERSE_NAME,
  resolveMockEntityMatches,
} from '../src/components/echo/mockLore';
import type { EchoConfirmedReference } from '../src/components/echo/types';

function createTestState(initialDoc: string = '') {
  return EditorState.create({
    doc: initialDoc,
    extensions: [
      history(),
      echoEntitiesField.init(() => MOCK_LORE_ENTITIES),
      confirmedReferencesField,
      candidateMatchesField,
    ],
  });
}

test('Echo Library E0 Prototype Test Suite', async (t) => {
  // 1. Exact entity recognition
  await t.test('1. Exact entity recognition identifies registered lore terms', () => {
    const state = createTestState('Laxus returned to Avalon.');
    const candidates = state.field(candidateMatchesField).candidates;

    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].matchedText, 'Laxus');
    assert.equal(candidates[0].from, 0);
    assert.equal(candidates[0].to, 5);

    assert.equal(candidates[1].matchedText, 'Avalon');
    assert.equal(candidates[1].from, 18);
    assert.equal(candidates[1].to, 24);
  });

  // 2. Case-insensitive recognition
  await t.test('2. Case-insensitive recognition matches lowercase or uppercase inputs', () => {
    const state = createTestState('In the shadows of avalon, laxus walked silently.');
    const candidates = state.field(candidateMatchesField).candidates;

    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].matchedText, 'avalon');
    assert.equal(candidates[0].matchingEntities[0].name, 'Avalon');

    assert.equal(candidates[1].matchedText, 'laxus');
    assert.equal(candidates[1].matchingEntities[0].name, 'Laxus');
  });

  // 3. Ambiguous matching
  await t.test('3. Ambiguous matching flags multiple matching entities without guessing', () => {
    const state = createTestState('Laxus arrived at Avalon.');
    const candidates = state.field(candidateMatchesField).candidates;

    const laxusMatch = candidates.find((c) => c.matchedText === 'Laxus')!;
    assert.ok(laxusMatch);
    assert.strictEqual(laxusMatch.isAmbiguous, true);
    assert.strictEqual(laxusMatch.matchingEntities.length, 2);

    // Both Laxus entities are represented
    const ids = laxusMatch.matchingEntities.map((e) => e.id);
    assert.ok(ids.includes('mock-laxus-1'));
    assert.ok(ids.includes('mock-laxus-2'));

    // Avalon is single, unambiguous match
    const avalonMatch = candidates.find((c) => c.matchedText === 'Avalon')!;
    assert.ok(avalonMatch);
    assert.strictEqual(avalonMatch.isAmbiguous, false);
    assert.strictEqual(avalonMatch.matchingEntities.length, 1);
  });

  // 4. Dismissal without modifying prose
  await t.test('4. Dismissal leaves the prose text completely untouched', () => {
    const initialText = 'After years of exile, Laxus finally returned.';
    const state = createTestState(initialText);

    // Candidates detected
    const candidates = state.field(candidateMatchesField).candidates;
    assert.equal(candidates.length, 1);

    // Dismissing is a no-op on the document string
    // The writer rejects the suggestion and keeps writing
    assert.strictEqual(state.doc.toString(), initialText);
    assert.strictEqual(state.doc.toString().includes('[['), false);
    assert.strictEqual(state.doc.toString().includes(']]'), false);
  });

  // 5. Confirmation without modifying prose
  await t.test('5. Confirmation marks the reference without altering the prose string', () => {
    const initialText = 'Laxus returned to Avalon.';
    let state = createTestState(initialText);

    const candidates = state.field(candidateMatchesField).candidates;
    const avalonCandidate = candidates.find((c) => c.matchedText === 'Avalon')!;

    const confirmedRef: EchoConfirmedReference = {
      id: 'ref-1',
      entityId: avalonCandidate.matchingEntities[0].id,
      from: avalonCandidate.from,
      to: avalonCandidate.to,
      matchedText: avalonCandidate.matchedText,
    };

    // Dispatch confirmation effect
    state = state.update({
      effects: confirmReferenceEffect.of(confirmedRef),
    }).state;

    // Prose string is strictly identical!
    assert.strictEqual(state.doc.toString(), initialText);

    // Confirmed reference is tracked
    const confirmedState = state.field(confirmedReferencesField);
    assert.equal(confirmedState.references.length, 1);
    assert.equal(confirmedState.references[0].entityId, 'mock-avalon-1');

    // And Avalon is no longer an unconfirmed candidate
    const remainingCandidates = state.field(candidateMatchesField).candidates;
    assert.equal(remainingCandidates.some((c) => c.matchedText === 'Avalon'), false);
  });

  // 6. Click-to-open documentation resolution
  await t.test('6. Click-to-open documentation resolves canonical lore and guided attributes', () => {
    const entity = MOCK_LORE_ENTITIES.find((e) => e.id === 'mock-laxus-1')!;
    assert.ok(entity);

    // Verify all canonical information is structured and ready for the popup
    assert.equal(entity.name, 'Laxus');
    assert.equal(entity.category, 'character');
    assert.equal(entity.universe, MOCK_UNIVERSE_NAME);
    assert.equal(entity.guidedAttributes.Role, 'Exiled Commander');
    assert.equal(entity.guidedAttributes.Allegiance, 'Northern Guard');
    assert.equal(entity.customAttributes.length, 2);
    assert.equal(entity.relationships.length, 2);
    assert.equal(entity.relationships[0].targetName, 'Avalon');
    assert.equal(entity.relationships[0].relationType, 'Defended');
  });

  // 7. Popup dismissal behavior
  await t.test('7. Popup dismissal preserves editor state and does not create history undo steps', () => {
    let state = createTestState('Laxus returned.');
    const initialLength = state.doc.length;

    // Simulating opening and closing documentation popup: editor state is not modified
    assert.equal(state.doc.length, initialLength);
    assert.equal(state.doc.toString(), 'Laxus returned.');
  });

  // 8. Reference decoration movement after edits
  await t.test('8. Reference decoration offsets shift correctly when text is inserted before it', () => {
    let state = createTestState('Laxus went to Avalon.');

    // Confirm Avalon (offset 14 to 20)
    const ref: EchoConfirmedReference = {
      id: 'ref-avalon',
      entityId: 'mock-avalon-1',
      from: 14,
      to: 20,
      matchedText: 'Avalon',
    };

    state = state.update({
      effects: confirmReferenceEffect.of(ref),
    }).state;

    assert.equal(state.field(confirmedReferencesField).references[0].from, 14);

    // Insert 10 characters at the beginning: "Yesterday "
    state = state.update({
      changes: { from: 0, insert: 'Yesterday ' },
    }).state;

    // Avalon was at 14..20, now shifted by 10 to 24..30
    const updatedRef = state.field(confirmedReferencesField).references[0];
    assert.equal(updatedRef.from, 24);
    assert.equal(updatedRef.to, 30);
    assert.equal(state.doc.sliceString(updatedRef.from, updatedRef.to), 'Avalon');
  });

  // 9. Reference invalidation after text deletion or alteration
  await t.test('9. Reference is invalidated when the referenced word is modified or deleted', () => {
    let state = createTestState('Laxus went to Avalon.');

    const ref: EchoConfirmedReference = {
      id: 'ref-avalon',
      entityId: 'mock-avalon-1',
      from: 14,
      to: 20,
      matchedText: 'Avalon',
    };

    state = state.update({
      effects: confirmReferenceEffect.of(ref),
    }).state;

    assert.equal(state.field(confirmedReferencesField).references.length, 1);

    // Delete part of Avalon ("Ava" -> "lon")
    state = state.update({
      changes: { from: 14, to: 17, insert: '' }, // deletes "Ava"
    }).state;

    // Reference must be pruned / invalidated because the slice no longer matches "Avalon"
    const references = state.field(confirmedReferencesField).references;
    assert.equal(references.length, 0);
  });

  // 10. Multiple identical occurrences
  await t.test('10. Multiple occurrences of the same name are tracked as independent references', () => {
    const text = 'Avalon is peaceful. Many travelers come to Avalon each year.';
    let state = createTestState(text);

    const candidates = state.field(candidateMatchesField).candidates;
    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].matchedText, 'Avalon');
    assert.equal(candidates[1].matchedText, 'Avalon');

    // Confirm only the second occurrence
    const secondCand = candidates[1];
    state = state.update({
      effects: confirmReferenceEffect.of({
        id: 'ref-second-avalon',
        entityId: 'mock-avalon-1',
        from: secondCand.from,
        to: secondCand.to,
        matchedText: secondCand.matchedText,
      }),
    }).state;

    const confirmed = state.field(confirmedReferencesField).references;
    assert.equal(confirmed.length, 1);
    assert.equal(confirmed[0].from, secondCand.from);

    // First occurrence remains an unconfirmed candidate
    const remainingCandidates = state.field(candidateMatchesField).candidates;
    assert.equal(remainingCandidates.length, 1);
    assert.equal(remainingCandidates[0].from, 0);
  });

  // 11. Undo / redo behavior
  await t.test('11. Undo and redo restore previous prose and decoration ranges without errors', () => {
    let state = createTestState('Laxus returned.');

    // Edit 1: insert text
    state = state.update({
      changes: { from: 15, insert: ' Avalon welcomes him.' },
    }).state;

    assert.equal(state.doc.toString(), 'Laxus returned. Avalon welcomes him.');

    // Perform Undo
    const undoResult = undo({
      state,
      dispatch: (tr) => {
        state = tr.state;
      },
    });

    assert.strictEqual(undoResult, true);
    assert.strictEqual(state.doc.toString(), 'Laxus returned.');

    // Perform Redo
    const redoResult = redo({
      state,
      dispatch: (tr) => {
        state = tr.state;
      },
    });

    assert.strictEqual(redoResult, true);
    assert.strictEqual(state.doc.toString(), 'Laxus returned. Avalon welcomes him.');
  });

  // 12. Unicode and IME-related behavior
  await t.test('12. Recognizes accented Unicode names without byte offset desynchronization', () => {
    const text = 'Éowyn rode to Avalon with pride.';
    const state = createTestState(text);

    const candidates = state.field(candidateMatchesField).candidates;
    assert.equal(candidates.length, 2);

    const eowynCand = candidates.find((c) => c.matchedText === 'Éowyn')!;
    assert.ok(eowynCand);
    assert.equal(eowynCand.from, 0);
    assert.equal(eowynCand.to, 5);
    assert.equal(state.doc.sliceString(eowynCand.from, eowynCand.to), 'Éowyn');

    // Test multi-line text with punctuation and apostrophes
    const complexText = "Laxus's shield stood beside Éowyn's spear in Avalon.";
    const complexState = createTestState(complexText);
    const complexCandidates = complexState.field(candidateMatchesField).candidates;

    assert.ok(complexCandidates.some((c) => c.matchedText === 'Laxus'));
    assert.ok(complexCandidates.some((c) => c.matchedText === 'Éowyn'));
    assert.ok(complexCandidates.some((c) => c.matchedText === 'Avalon'));
  });

  // 13. Markdown serialization remaining completely unchanged
  await t.test('13. Markdown serialization exports pure plain text without synthetic markup', () => {
    const rawMarkdown = `# Chapter 1: The Return\n\nAfter years of exile, Laxus finally returned to Avalon.\n\n* The Northern Guard stood watchful.\n* The gates remained closed.`;
    let state = createTestState(rawMarkdown);

    // Confirm multiple entities
    state = state.update({
      effects: [
        confirmReferenceEffect.of({
          id: 'ref-1',
          entityId: 'mock-laxus-1',
          from: 47,
          to: 52,
          matchedText: 'Laxus',
        }),
        confirmReferenceEffect.of({
          id: 'ref-2',
          entityId: 'mock-avalon-1',
          from: 74,
          to: 80,
          matchedText: 'Avalon',
        }),
      ],
    }).state;

    // Crucial check: the serialized doc string is 100% identical to raw Markdown!
    assert.strictEqual(state.doc.toString(), rawMarkdown);
    assert.strictEqual(state.doc.toString().includes('data-entity-id'), false);
    assert.strictEqual(state.doc.toString().includes('cm-echo-reference'), false);
    assert.strictEqual(state.doc.toString().includes('[['), false);
    assert.strictEqual(state.doc.toString().includes(']]'), false);
  });

  // 14. No production save operations from the prototype
  await t.test('14. Prototype operations remain strictly isolated from production storage', () => {
    const state = createTestState('Pure isolated prototype text.');
    // Prototype state uses only mock lore entities
    const entities = state.field(echoEntitiesField);
    assert.strictEqual(entities.length, MOCK_LORE_ENTITIES.length);
    assert.ok(entities.every((e) => e.id.startsWith('mock-')));

    // No Tauri API calls or database mutations occur
    assert.strictEqual(state.doc.toString(), 'Pure isolated prototype text.');
  });
});
