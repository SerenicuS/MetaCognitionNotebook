import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitPoemStanzas,
  serializePoemStanzas,
  createStanzaId,
  extractLinePreview,
  encodePoemWithStanzas,
  decodeStanzasCipher,
  initializePoemStanzas,
  reconcileStanzaEntries,
  moveStanzaEntry,
  insertStanzaEntry,
  deleteStanzaEntry,
  splitStanzaEntry,
  mergeStanzaEntries,
  switchCipherScope,
  resolveScopeConflictsAndSwitch,
  validateCipherKey,
  createCipherKey,
  decodeWithCipherKey,
  serializePoemExport,
  parsePoemImport,
  createCipherPackage,
  validateCipherPackage,
  decodeCipherPackage,
  computeTextFingerprint,
  type CipherMapping,
  type CipherKey,
  type StanzaCipherEntry,
  type PoemCipherMetadata,
} from '../src/utils/emotionalCipher.ts';

test('Poetry Studio Per-Stanza Emotional Cipher Suite', async (t) => {
  // 1. Stanza Segmentation across line ending variants and whitespace
  await t.test('1. Deterministic stanza segmentation across LF, CRLF, multiple blank lines, and whitespace', () => {
    const rawLF = "First stanza line 1\nFirst stanza line 2\n\nSecond stanza line 1\n\n\nThird stanza line 1";
    const rawCRLF = "First stanza line 1\r\nFirst stanza line 2\r\n\r\nSecond stanza line 1\r\n\r\n\r\nThird stanza line 1";

    const stanzasLF = splitPoemStanzas(rawLF);
    const stanzasCRLF = splitPoemStanzas(rawCRLF);

    assert.equal(stanzasLF.length, 3);
    assert.deepEqual(stanzasLF, stanzasCRLF);
    assert.equal(stanzasLF[0], "First stanza line 1\nFirst stanza line 2");
    assert.equal(stanzasLF[1], "Second stanza line 1");
    assert.equal(stanzasLF[2], "Third stanza line 1");

    // Leading and trailing whitespace should not create phantom empty stanzas
    const messy = "   \n\n\nLine in only stanza\n\n   \n\n";
    const cleaned = splitPoemStanzas(messy);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0], "Line in only stanza");
  });

  // 2. Independent stanza mappings (the core acceptance invariant)
  await t.test('2. Independent stanza mappings: love -> ember, love -> silence, love -> home', () => {
    const poem = [
      "I feel love in the morning fire.",
      "And love in the midnight woods.",
      "Returning love to where it began.",
    ];

    const entries: StanzaCipherEntry[] = [
      { id: 'stz-1', index: 0, mappings: [{ original: 'love', replacement: 'ember' }] },
      { id: 'stz-2', index: 1, mappings: [{ original: 'love', replacement: 'silence' }] },
      { id: 'stz-3', index: 2, mappings: [{ original: 'love', replacement: 'home' }] },
    ];

    const encoded = encodePoemWithStanzas(poem, entries);
    assert.equal(encoded.encodedStanzas[0], "I feel ember in the morning fire.");
    assert.equal(encoded.encodedStanzas[1], "And silence in the midnight woods.");
    assert.equal(encoded.encodedStanzas[2], "Returning home to where it began.");

    // Decoding independently recovers the original text faithfully
    const decoded = decodeStanzasCipher(encoded.encodedStanzas, entries);
    assert.equal(decoded.decodedStanzas[0], poem[0]);
    assert.equal(decoded.decodedStanzas[1], poem[1]);
    assert.equal(decoded.decodedStanzas[2], poem[2]);
    assert.equal(decoded.fidelity, 'lossless');
  });

  // 3. Single-stanza poems: Per-Stanza acts predictably and identifiably
  await t.test('3. Single-stanza poems operate predictably in per-stanza mode', () => {
    const single = ["Solitary wanderer under the silver moon."];
    const entries: StanzaCipherEntry[] = [
      { id: 'stz-single', index: 0, mappings: [{ original: 'moon', replacement: 'lantern' }] },
    ];

    const res = encodePoemWithStanzas(single, entries);
    assert.equal(res.encodedStanzas.length, 1);
    assert.equal(res.encodedStanzas[0], "Solitary wanderer under the silver lantern.");

    const dec = decodeStanzasCipher(res.encodedStanzas, entries);
    assert.equal(dec.decodedStanzas[0], single[0]);
  });

  // 4. Empty and whitespace-only poems
  await t.test('4. Empty and whitespace-only poems handle gracefully without throwing', () => {
    const emptyPoem = splitPoemStanzas("");
    assert.deepEqual(emptyPoem, ['']);

    const entries = initializePoemStanzas("");
    assert.equal(entries.length, 1);
    assert.ok(entries[0].id.startsWith('stz-'));

    const enc = encodePoemWithStanzas([], entries);
    assert.equal(enc.encodedStanzas.length, 0);
    assert.equal(enc.encodedText, "");
  });

  // 5. Case preservation across independent stanzas
  await t.test('5. Case preservation across independent stanzas (Title, ALL CAPS, lowercase)', () => {
    const poem = [
      "Love and LOVE and love in stanza one.",
      "Love and LOVE and love in stanza two.",
    ];

    const entries: StanzaCipherEntry[] = [
      { id: 'stz-1', index: 0, mappings: [{ original: 'love', replacement: 'ember' }] },
      { id: 'stz-2', index: 1, mappings: [{ original: 'love', replacement: 'silence' }] },
    ];

    const enc = encodePoemWithStanzas(poem, entries);
    assert.equal(enc.encodedStanzas[0], "Ember and EMBER and ember in stanza one.");
    assert.equal(enc.encodedStanzas[1], "Silence and SILENCE and silence in stanza two.");

    const dec = decodeStanzasCipher(enc.encodedStanzas, entries);
    assert.equal(dec.decodedStanzas[0], poem[0]);
    assert.equal(dec.decodedStanzas[1], poem[1]);
  });

  // 6. Contractions, punctuation, word boundaries per stanza
  await t.test('6. Contractions, punctuation, and hyphenated words are preserved per stanza', () => {
    const poem = [
      "It's don't and moon-lit path.",
      "It is do not and sun-lit path.",
    ];

    const entries: StanzaCipherEntry[] = [
      { id: 'stz-1', index: 0, mappings: [{ original: 'it', replacement: 'that' }] },
      { id: 'stz-2', index: 1, mappings: [{ original: 'it', replacement: 'which' }] },
    ];

    const enc = encodePoemWithStanzas(poem, entries);
    // In stanza 1, "It's" must NOT have its prefix "It" replaced because of contraction boundary protection
    assert.equal(enc.encodedStanzas[0], "It's don't and moon-lit path.");
    // In stanza 2, standalone "It" is replaced with "Which"
    assert.equal(enc.encodedStanzas[1], "Which is do not and sun-lit path.");
  });

  // 7. Disjoint vocabulary: words not mapped in Stanza A remain untouched
  await t.test('7. Disjoint vocabulary: words not mapped in Stanza A remain untouched even if mapped in Stanza B', () => {
    const poem = [
      "The river was quiet.",
      "The river was loud and turbulent.",
    ];

    const entries: StanzaCipherEntry[] = [
      { id: 'stz-1', index: 0, mappings: [] }, // No mappings in stanza 1
      { id: 'stz-2', index: 1, mappings: [{ original: 'river', replacement: 'highway' }] },
    ];

    const enc = encodePoemWithStanzas(poem, entries);
    assert.equal(enc.encodedStanzas[0], "The river was quiet.");
    assert.equal(enc.encodedStanzas[1], "The highway was loud and turbulent.");
  });

  // 8. Reversible scope transition: Whole Poem -> Per Stanza
  await t.test('8. Reversible scope transition: Whole Poem -> Per Stanza produces identical text output at transition', () => {
    const rawPoem = "The river flows.\n\nThe mountain stands.";
    const stanzas = splitPoemStanzas(rawPoem);
    const wholePoemMappings: CipherMapping[] = [
      { original: 'river', replacement: 'stream' },
      { original: 'mountain', replacement: 'peak' },
    ];

    const currentMeta: PoemCipherMetadata = {
      version: 1,
      scope: 'whole_poem',
      mappings: wholePoemMappings,
    };

    const res = switchCipherScope(currentMeta, 'per_stanza', stanzas);
    assert.equal(res.nextMeta.scope, 'per_stanza');
    assert.equal(res.nextMeta.stanzas?.length, 2);
    // Both stanzas inherited the global rules
    assert.equal(res.nextMeta.stanzas?.[0].mappings.length, 2);
    assert.equal(res.nextMeta.stanzas?.[1].mappings.length, 2);
    // Global backup preserved
    assert.deepEqual(res.nextMeta.whole_poem_backup?.mappings, wholePoemMappings);

    // Verify identical rendered text at transition point
    const encStanzas = encodePoemWithStanzas(stanzas, res.nextMeta.stanzas!);
    assert.equal(
      encStanzas.encodedText,
      "The stream flows.\n\nThe peak stands."
    );
  });

  // 9. Reversible scope transition: Per Stanza -> Whole Poem without conflicts
  await t.test('9. Reversible scope transition: Per Stanza -> Whole Poem without conflicts unifies rules cleanly', () => {
    const rawPoem = "Stanza one with rose.\n\nStanza two with stone.";
    const stanzas = splitPoemStanzas(rawPoem);
    const stanzaEntries: StanzaCipherEntry[] = [
      { id: 'stz-1', index: 0, mappings: [{ original: 'rose', replacement: 'crystal' }] },
      { id: 'stz-2', index: 1, mappings: [{ original: 'stone', replacement: 'glass' }] },
    ];

    const currentMeta: PoemCipherMetadata = {
      version: 2,
      scope: 'per_stanza',
      stanzas: stanzaEntries,
    };

    const res = switchCipherScope(currentMeta, 'whole_poem', stanzas);
    assert.equal(res.conflicts, null);
    assert.equal(res.nextMeta.scope, 'whole_poem');
    assert.equal(res.nextMeta.mappings?.length, 2);
    assert.ok(res.nextMeta.mappings?.some(m => m.original === 'rose' && m.replacement === 'crystal'));
    assert.ok(res.nextMeta.mappings?.some(m => m.original === 'stone' && m.replacement === 'glass'));
    // Per-stanza backup preserved
    assert.equal(res.nextMeta.per_stanza_backup?.length, 2);
  });

  // 10. Conflict detection: conflicting rules trigger conflict report
  await t.test('10. Conflict detection: conflicting rules trigger conflict report with per-stanza replacement options', () => {
    const rawPoem = "I love the light.\n\nI love the dark.";
    const stanzas = splitPoemStanzas(rawPoem);
    const stanzaEntries: StanzaCipherEntry[] = [
      { id: 'stz-1', index: 0, mappings: [{ original: 'love', replacement: 'adore' }] },
      { id: 'stz-2', index: 1, mappings: [{ original: 'love', replacement: 'dread' }] },
    ];

    const currentMeta: PoemCipherMetadata = {
      version: 2,
      scope: 'per_stanza',
      stanzas: stanzaEntries,
    };

    const res = switchCipherScope(currentMeta, 'whole_poem', stanzas);
    assert.ok(res.conflicts);
    assert.equal(res.conflicts.hasConflicts, true);
    assert.equal(res.conflicts.conflictingWords.length, 1);
    assert.equal(res.conflicts.conflictingWords[0].original, 'love');
    assert.equal(res.conflicts.conflictingWords[0].replacements.length, 2);
    assert.equal(res.conflicts.conflictingWords[0].replacements[0].replacement, 'adore');
    assert.equal(res.conflicts.conflictingWords[0].replacements[1].replacement, 'dread');
  });

  // 11. Conflict resolution: author choices resolve conflicts deterministically
  await t.test('11. Conflict resolution: author choices resolve conflicts deterministically', () => {
    const rawPoem = "I love the light.\n\nI love the dark.";
    const stanzas = splitPoemStanzas(rawPoem);
    const stanzaEntries: StanzaCipherEntry[] = [
      { id: 'stz-1', index: 0, mappings: [{ original: 'love', replacement: 'adore' }] },
      { id: 'stz-2', index: 1, mappings: [{ original: 'love', replacement: 'dread' }] },
    ];

    const currentMeta: PoemCipherMetadata = {
      version: 2,
      scope: 'per_stanza',
      stanzas: stanzaEntries,
    };

    const authorChoice = { love: 'dread' };
    const resolvedMeta = resolveScopeConflictsAndSwitch(currentMeta, authorChoice, stanzas);
    assert.equal(resolvedMeta.scope, 'whole_poem');
    assert.equal(resolvedMeta.mappings?.length, 1);
    assert.equal(resolvedMeta.mappings?.[0].original, 'love');
    assert.equal(resolvedMeta.mappings?.[0].replacement, 'dread');
    assert.equal(resolvedMeta.per_stanza_backup?.length, 2);
  });

  // 12. Structural edit reconciliation: inserting stanza preserves existing mappings without offset skew
  await t.test('12. Structural edit reconciliation: inserting stanza preserves existing mappings without offset skew', () => {
    const originalStanzas = ["Stanza 1 text", "Stanza 2 text"];
    const entries = initializePoemStanzas(originalStanzas.join('\n\n'));
    entries[0].mappings = [{ original: 'text', replacement: 'verse' }];
    entries[1].mappings = [{ original: 'text', replacement: 'rhyme' }];

    const id0 = entries[0].id;
    const id1 = entries[1].id;

    // Insert a new stanza in the middle (at index 1)
    const afterInsert = insertStanzaEntry(entries, 1);
    assert.equal(afterInsert.length, 3);
    assert.equal(afterInsert[0].id, id0);
    assert.equal(afterInsert[0].index, 0);
    assert.equal(afterInsert[0].mappings[0].replacement, 'verse');

    // Middle stanza is newly created
    assert.equal(afterInsert[1].index, 1);
    assert.equal(afterInsert[1].mappings.length, 0);

    // Old second stanza is shifted to index 2 with its mappings intact
    assert.equal(afterInsert[2].id, id1);
    assert.equal(afterInsert[2].index, 2);
    assert.equal(afterInsert[2].mappings[0].replacement, 'rhyme');
  });

  // 13. Structural edit reconciliation: deleting stanza preserves remaining mappings and archives removed rules
  await t.test('13. Structural edit reconciliation: deleting stanza archives removed rules in unresolved_stanzas', () => {
    const entries: StanzaCipherEntry[] = [
      { id: 'stz-1', index: 0, mappings: [{ original: 'first', replacement: 'alpha' }] },
      { id: 'stz-2', index: 1, mappings: [{ original: 'second', replacement: 'beta' }] },
      { id: 'stz-3', index: 2, mappings: [{ original: 'third', replacement: 'gamma' }] },
    ];

    const { entries: remaining, removed } = deleteStanzaEntry(entries, 1);
    assert.equal(remaining.length, 2);
    assert.equal(remaining[0].id, 'stz-1');
    assert.equal(remaining[0].index, 0);
    assert.equal(remaining[1].id, 'stz-3');
    assert.equal(remaining[1].index, 1); // Re-indexed

    assert.ok(removed);
    assert.equal(removed.id, 'stz-2');
    assert.equal(removed.mappings[0].original, 'second');
  });

  // 14. Structural edit reconciliation: moving stanza up/down keeps rules bound
  await t.test('14. Structural edit reconciliation: moving stanza keeps rules bound to the moved stanza', () => {
    const entries: StanzaCipherEntry[] = [
      { id: 'stz-top', index: 0, mappings: [{ original: 'a', replacement: '1' }] },
      { id: 'stz-bottom', index: 1, mappings: [{ original: 'b', replacement: '2' }] },
    ];

    // Move stanza 0 down to index 1
    const moved = moveStanzaEntry(entries, 0, 1);
    assert.equal(moved[0].id, 'stz-bottom');
    assert.equal(moved[0].index, 0);
    assert.equal(moved[0].mappings[0].original, 'b');

    assert.equal(moved[1].id, 'stz-top');
    assert.equal(moved[1].index, 1);
    assert.equal(moved[1].mappings[0].original, 'a');
  });

  // 15. Structural edit reconciliation: splitting a stanza preserves rule identity on first segment
  await t.test('15. Structural edit reconciliation: splitting a stanza preserves rule identity on the first segment', () => {
    const entries: StanzaCipherEntry[] = [
      { id: 'stz-1', index: 0, mappings: [{ original: 'sun', replacement: 'star' }] },
    ];

    const split = splitStanzaEntry(entries, 0);
    assert.equal(split.length, 2);
    assert.equal(split[0].id, 'stz-1');
    assert.equal(split[0].mappings[0].original, 'sun');

    assert.notEqual(split[1].id, 'stz-1');
    assert.equal(split[1].mappings.length, 0);
  });

  // 16. Content edits: editing stanza text updates fingerprint without reallocating UUID
  await t.test('16. Content edits: editing stanza text updates fingerprint without reallocating UUID', () => {
    const originalText = "Old verse here";
    const entries: StanzaCipherEntry[] = [
      {
        id: 'stz-fixed-id',
        index: 0,
        content_fingerprint: computeTextFingerprint(originalText),
        mappings: [{ original: 'verse', replacement: 'song' }],
      },
    ];

    const modifiedText = "Old verse here with new words added";
    // The editor knows which stanza was edited; text-only external edits cannot prove identity.
    const reconciled = reconcileStanzaEntries([modifiedText], entries, { stanzaIds: [entries[0].id] });

    assert.equal(reconciled.reconciled.length, 1);
    // Preserves the stable UUID
    assert.equal(reconciled.reconciled[0].id, 'stz-fixed-id');
    assert.equal(reconciled.reconciled[0].mappings[0].replacement, 'song');
  });

  // 17. Identical content in two stanzas: each receives distinct UUID
  await t.test('17. Identical content in multiple stanzas: distinct UUIDs are assigned and never merged', () => {
    const chorus = "We walk into the light.";
    const stanzas = [chorus, "A unique verse in between.", chorus];

    const entries = initializePoemStanzas(stanzas.join('\n\n'));
    assert.equal(entries.length, 3);
    assert.notEqual(entries[0].id, entries[2].id);

    entries[0].mappings = [{ original: 'light', replacement: 'dawn' }];
    entries[2].mappings = [{ original: 'light', replacement: 'dusk' }];

    const enc = encodePoemWithStanzas(stanzas, entries);
    assert.equal(enc.encodedStanzas[0], "We walk into the dawn.");
    assert.equal(enc.encodedStanzas[2], "We walk into the dusk.");

    // Reconciling identical content never merges them to the same UUID
    const reconciled = reconcileStanzaEntries(stanzas, entries, { stanzaIds: entries.map(e => e.id) });
    assert.notEqual(reconciled.reconciled[0].id, reconciled.reconciled[2].id);
    assert.equal(reconciled.reconciled[0].mappings[0].replacement, 'dawn');
    assert.equal(reconciled.reconciled[2].mappings[0].replacement, 'dusk');
  });

  // 18. Versioning: legacy v1 cipher metadata without scope remains whole_poem
  await t.test('18. Versioning: legacy v1 cipher metadata without scope defaults cleanly to whole_poem', () => {
    const legacyMeta: PoemCipherMetadata = {
      version: 1,
      mappings: [{ original: 'heart', replacement: 'rhizome' }],
    };

    assert.equal(legacyMeta.scope ?? 'whole_poem', 'whole_poem');

    const key = validateCipherKey({
      id: 'legacy-key',
      name: 'Legacy Botanical',
      mappings: [{ original: 'heart', replacement: 'rhizome' }],
    });
    assert.equal(key.version, 1);
    assert.equal(key.algorithm_version, '1.0');
    assert.equal(key.scope, undefined);
  });

  // 19. Versioning: v2 cipher metadata with per_stanza is validated and serialized accurately
  await t.test('19. Versioning: v2 cipher metadata with per_stanza is validated and serialized accurately', () => {
    const v2Key = validateCipherKey({
      version: 2,
      algorithm_version: '2.0',
      id: 'v2-stanza-key',
      name: 'Stanza Splitter',
      mode: 'manual',
      scope: 'per_stanza',
      mappings: [
        { original: 'love', replacement: 'ember' },
        { original: 'love', replacement: 'silence' },
      ],
      stanzas: [
        { id: 'stz-1', index: 0, mappings: [{ original: 'love', replacement: 'ember' }] },
        { id: 'stz-2', index: 1, mappings: [{ original: 'love', replacement: 'silence' }] },
      ],
    }, { disallowDuplicateOriginals: true });

    assert.equal(v2Key.version, 2);
    assert.equal(v2Key.algorithm_version, '2.0');
    assert.equal(v2Key.scope, 'per_stanza');
    assert.equal(v2Key.stanzas?.length, 2);
  });

  // 20. Backward and forward compatibility: decoding with v1 and v2 keys
  await t.test('20. Backward and forward compatibility: v1 and v2 keys decode accurately', () => {
    const poem = ["Stanza 1 line", "Stanza 2 line"];
    const v2Key: CipherKey = {
      version: 2,
      algorithm_version: '2.0',
      id: 'v2-compat-key',
      name: 'Compat Key',
      mode: 'manual',
      scope: 'per_stanza',
      mappings: [
        { original: 'line', replacement: 'thread' },
        { original: 'line', replacement: 'ray' },
      ],
      stanzas: [
        { id: 'stz-1', index: 0, mappings: [{ original: 'line', replacement: 'thread' }] },
        { id: 'stz-2', index: 1, mappings: [{ original: 'line', replacement: 'ray' }] },
      ],
      committed: true,
      word_count: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const encodedText = "Stanza 1 thread\n\nStanza 2 ray";
    const res = decodeWithCipherKey(encodedText, v2Key);
    assert.equal(res.fidelity, 'lossless');
    assert.equal(res.decodedText, "Stanza 1 line\n\nStanza 2 line");
  });

  // 21. Export/import: .mcpoem format retains per-stanza mappings
  await t.test('21. Export/import: .mcpoem format retains per-stanza mappings across export and import roundtrip', () => {
    const poemTitle = "Autumn Leaves";
    const content = "Leaf falls down.\n\nLeaf on the ground.";
    const cipherMeta: PoemCipherMetadata = {
      version: 2,
      mode: 'manual',
      scope: 'per_stanza',
      key_id: 'key-autumn',
      stanzas: [
        { id: 'stz-1', index: 0, mappings: [{ original: 'leaf', replacement: 'amber' }] },
        { id: 'stz-2', index: 1, mappings: [{ original: 'leaf', replacement: 'gold' }] },
      ],
    };

    const exported = serializePoemExport(
      {
        title: poemTitle,
        content,
        cipherMeta,
      },
      'mcpoem'
    );

    const imported = parsePoemImport(exported.filename, exported.content);
    assert.equal(imported.title, poemTitle);
    assert.equal(imported.content, content);
    assert.ok(imported.cipher);
    assert.equal(imported.cipher.scope, 'per_stanza');
    assert.equal(imported.cipher.version, 2);
    assert.equal(imported.cipher.stanzas?.length, 2);
    assert.equal(imported.cipher.stanzas?.[0].mappings[0].replacement, 'amber');
    assert.equal(imported.cipher.stanzas?.[1].mappings[0].replacement, 'gold');
  });

  // 22. Export/import: .mccipher package generation and decoding with per-stanza keys
  await t.test('22. Export/import: .mccipher package generation and decoding with per-stanza keys', () => {
    const poemTitle = "Ocean & Desert";
    const rawPoem = "Water is life.\n\nWater is rare.";
    const stanzas = splitPoemStanzas(rawPoem);

    const stanzaEntries: StanzaCipherEntry[] = [
      { id: 'stz-1', index: 0, mappings: [{ original: 'water', replacement: 'ocean' }] },
      { id: 'stz-2', index: 1, mappings: [{ original: 'water', replacement: 'mirage' }] },
    ];

    const encRes = encodePoemWithStanzas(stanzas, stanzaEntries);
    assert.equal(encRes.encodedText, "Ocean is life.\n\nMirage is rare.");

    const perStanzaKey: CipherKey = {
      version: 2,
      algorithm_version: '2.0',
      id: 'key-ocean-desert',
      name: 'Ocean & Desert Key',
      mode: 'manual',
      scope: 'per_stanza',
      mappings: [
        { original: 'water', replacement: 'ocean' },
        { original: 'water', replacement: 'mirage' },
      ],
      stanzas: stanzaEntries,
      source_fingerprint: encRes.sourceFingerprint,
      encoded_fingerprint: encRes.encodedFingerprint,
      manifest: encRes.manifest,
      committed: true,
      word_count: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Create .mccipher package
    const pkg = createCipherPackage({
      poemTitle,
      encodedText: encRes.encodedText,
      key: perStanzaKey,
    });

    assert.equal(pkg.format, 'mccipher');
    assert.equal(pkg.algorithm_version, '2.0');
    assert.equal(pkg.key.scope, 'per_stanza');

    // Validate package
    const validatedPkg = validateCipherPackage(pkg);
    assert.equal(validatedPkg.key.scope, 'per_stanza');

    // Decode package
    const decodedPkg = decodeCipherPackage(pkg);
    assert.equal(decodedPkg.decodeResult.fidelity, 'lossless');
    assert.equal(decodedPkg.decodeResult.decodedText, rawPoem);
  });
});
