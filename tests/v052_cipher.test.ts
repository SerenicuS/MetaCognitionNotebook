import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeWordFrequency,
  applyCase,
  detectCollisions,
  encodeCipher,
  decodeCipher,
  decodeWithCipherKey,
  validateCipherDictionary,
  validateCipherKey,
  generateQuickCipher,
  generateRandomCipher,
  createCipherKey,
  createSeededRng,
  computeTextFingerprint,
  extractBasePoemTitle,
  formatDefaultCipherKeyName,
  formatCipheredPoemTitle,
  resolveUniquePoemTitle,
  truncateDisplayLabel,
  classifyCipherKey,
  serializePoemExport,
  parsePoemImport,
  sanitizePortableFilename,
  createCipherPackage,
  validateCipherPackage,
  decodeCipherPackage,
  MCCIPHER_DISCLOSURE,
  type CipherMapping,
  type CipherDictionary,
  type CipherKey,
} from '../src/utils/emotionalCipher.ts';

test('Emotional Cipher — Word Frequency Analysis', async (t) => {
  await t.test('extracts unique words and counts occurrences accurately', () => {
    const poem = `The river sings, the river flows,\nWhere cold wind blows and winter grows.\nThe river knows what no one knows.`;
    const freqs = analyzeWordFrequency(poem);

    const freqMap = new Map(freqs.map(f => [f.word, f.count]));
    assert.equal(freqMap.get('the'), 3);
    assert.equal(freqMap.get('river'), 3);
    assert.equal(freqMap.get('knows'), 2);
    assert.equal(freqMap.get('flows'), 1);
    assert.equal(freqMap.get('wind'), 1);

    // Verify ordering: frequency descending, then alphabetical
    assert.equal(freqs[0].count, 3);
    assert.equal(freqs[1].count, 3);
  });

  await t.test('handles contractions and hyphenated words gracefully', () => {
    const text = `I don't know why the rose-scented garden wouldn't bloom.`;
    const freqs = analyzeWordFrequency(text);
    const words = freqs.map(f => f.word);

    assert.ok(words.includes("don't"));
    assert.ok(words.includes("rose-scented"));
    assert.ok(words.includes("wouldn't"));
  });

  await t.test('returns empty array on empty or whitespace string', () => {
    assert.deepEqual(analyzeWordFrequency(''), []);
    assert.deepEqual(analyzeWordFrequency('   \n\n\t  '), []);
  });
});

test('Emotional Cipher — Case Preservation', async (t) => {
  await t.test('preserves Capitalized title case', () => {
    assert.equal(applyCase('Love', 'chlorophyll'), 'Chlorophyll');
    assert.equal(applyCase('Rose', 'rhizome'), 'Rhizome');
  });

  await t.test('preserves ALL CAPS uppercase for multi-letter words', () => {
    assert.equal(applyCase('LOVE', 'chlorophyll'), 'CHLOROPHYLL');
    assert.equal(applyCase('HEART', 'rhizome'), 'RHIZOME');
  });

  await t.test('treats single-letter uppercase words ("I", "A", "O") as Title Case for exact roundtripping', () => {
    assert.equal(applyCase('I', 'river'), 'River');
    assert.equal(applyCase('A', 'morning'), 'Morning');
    assert.equal(applyCase('Morning', 'a'), 'A');
    assert.equal(applyCase('A', 'morning'), 'Morning');
  });

  await t.test('preserves lowercase', () => {
    assert.equal(applyCase('love', 'chlorophyll'), 'chlorophyll');
  });

  await t.test('preserves multiword Title Case', () => {
    assert.equal(applyCase('Dark Night', 'gilded sunrise'), 'Gilded Sunrise');
  });
});

test('Emotional Cipher — Single-Pass Non-Recursive Substitution', async (t) => {
  await t.test('prevents chain substitution loops (love -> hate, hate -> chicken)', () => {
    const poem = `I love the morning, but I hate the cold darkness.`;
    const mappings: CipherMapping[] = [
      { original: 'love', replacement: 'hate' },
      { original: 'hate', replacement: 'chicken' },
    ];

    const result = encodeCipher(poem, mappings);
    // "love" becomes "hate"
    // "hate" becomes "chicken"
    // "love" must NOT become "chicken"!
    assert.equal(result.encodedText, `I hate the morning, but I chicken the cold darkness.`);
  });

  await t.test('longest-phrase matches take precedence over single words', () => {
    const text = `In the dark night of winter, the night was dark.`;
    const mappings: CipherMapping[] = [
      { original: 'dark night', replacement: 'gilded sunrise' },
      { original: 'dark', replacement: 'amber' },
      { original: 'night', replacement: 'noon' },
    ];

    const result = encodeCipher(text, mappings);
    assert.equal(result.encodedText, `In the gilded sunrise of winter, the noon was amber.`);
  });

  await t.test('does not split contractions or hyphenated words when shorter prefix/suffix is mapped', () => {
    const text = `It is clear that it's a moon-lit night, and night's moon shines.`;
    const mappings: CipherMapping[] = [
      { original: 'it', replacement: 'stone' },
      { original: 'moon', replacement: 'sun' },
      { original: 'night', replacement: 'day' },
    ];

    const result = encodeCipher(text, mappings);
    // "it's", "moon-lit", and "night's" must remain untouched because they are distinct tokens!
    assert.strictEqual(
      result.encodedText,
      `Stone is clear that it's a moon-lit day, and night's sun shines.`
    );
    const decoded = decodeCipher(result.encodedText, mappings);
    assert.strictEqual(decoded.decodedText, text);
  });

  await t.test('selective substitution ignores empty replacements', () => {
    const text = `The wind whispers to the trees.`;
    const mappings: CipherMapping[] = [
      { original: 'whispers', replacement: 'roars' },
      { original: 'trees', replacement: '' },
      { original: 'wind', replacement: '   ' },
    ];

    const result = encodeCipher(text, mappings);
    assert.equal(result.encodedText, `The wind roars to the trees.`);
  });

  await t.test('preserves stanzas, line breaks, whitespace, and punctuation', () => {
    const poem = `First stanza line one,\nWith comma, and pause.\n\nSecond stanza:\n  Indented line — em dash; end.`;
    const mappings: CipherMapping[] = [
      { original: 'stanza', replacement: 'chapter' },
      { original: 'line', replacement: 'verse' },
      { original: 'pause', replacement: 'breath' },
    ];

    const result = encodeCipher(poem, mappings);
    assert.equal(
      result.encodedText,
      `First chapter verse one,\nWith comma, and breath.\n\nSecond chapter:\n  Indented verse — em dash; end.`
    );
  });
});

test('Emotional Cipher — Collision and Ambiguity Detection', async (t) => {
  await t.test('detects duplicate target collisions', () => {
    const text = `The sun shines and the moon glows.`;
    const mappings: CipherMapping[] = [
      { original: 'sun', replacement: 'gold' },
      { original: 'moon', replacement: 'gold' },
    ];

    const report = detectCollisions(text, mappings);
    assert.equal(report.hasCollisions, true);
    assert.equal(report.duplicateTargets.length, 1);
    assert.equal(report.duplicateTargets[0].replacement, 'gold');
    assert.deepEqual(report.duplicateTargets[0].originals, ['sun', 'moon']);
    assert.ok(report.warnings.some(w => w.includes('Target collision')));
  });

  await t.test('detects vocabulary overlap with unchanged poem words', () => {
    const text = `My heart turned to stone as the cold river flowed.`;
    const mappings: CipherMapping[] = [
      { original: 'heart', replacement: 'stone' },
    ];

    const report = detectCollisions(text, mappings);
    assert.equal(report.hasCollisions, true);
    assert.equal(report.vocabularyOverlaps.length, 1);
    assert.equal(report.vocabularyOverlaps[0].word, 'stone');
    assert.equal(report.vocabularyOverlaps[0].mappedFrom, 'heart');
    assert.ok(report.warnings.some(w => w.includes('Vocabulary overlap')));
  });

  await t.test('reports no collisions for clean independent mappings', () => {
    const text = `The quiet owl watched the forest.`;
    const mappings: CipherMapping[] = [
      { original: 'owl', replacement: 'raven' },
      { original: 'forest', replacement: 'canopy' },
    ];

    const report = detectCollisions(text, mappings);
    assert.equal(report.hasCollisions, false);
    assert.equal(report.warnings.length, 0);
  });
});

test('Emotional Cipher — Reversible Decoding Engine', async (t) => {
  await t.test('lossless decoding with manifest even across duplicate targets', () => {
    const poem = `The Sun shines and the Moon shines bright.`;
    const mappings: CipherMapping[] = [
      { original: 'sun', replacement: 'gold' },
      { original: 'moon', replacement: 'gold' },
    ];

    const encoded = encodeCipher(poem, mappings);
    assert.equal(encoded.encodedText, `The Gold shines and the Gold shines bright.`);

    const decoded = decodeCipher(encoded.encodedText, mappings, encoded.manifest);
    assert.equal(decoded.decodedText, poem);
    assert.equal(decoded.fidelity, 'lossless');
  });

  await t.test('heuristic decoding without manifest succeeds for non-colliding dictionaries', () => {
    const poem = `Whisper softly in the garden of dreams.`;
    const mappings: CipherMapping[] = [
      { original: 'whisper', replacement: 'shout' },
      { original: 'garden', replacement: 'meadow' },
      { original: 'dreams', replacement: 'echoes' },
    ];

    const encoded = encodeCipher(poem, mappings);
    assert.equal(encoded.encodedText, `Shout softly in the meadow of echoes.`);

    const decoded = decodeCipher(encoded.encodedText, mappings);
    assert.equal(decoded.decodedText, poem);
    assert.equal(decoded.fidelity, 'lossless');
  });

  await t.test('heuristic decoding flags ambiguous fidelity when duplicate targets exist', () => {
    const poem = `Sun and Moon.`;
    const mappings: CipherMapping[] = [
      { original: 'sun', replacement: 'gold' },
      { original: 'moon', replacement: 'gold' },
    ];

    const encoded = encodeCipher(poem, mappings);
    const decoded = decodeCipher(encoded.encodedText, mappings);
    assert.equal(decoded.fidelity, 'ambiguous');
    assert.ok(decoded.warnings.length > 0);
  });
});

test('Emotional Cipher — Dictionary Schema and Validation', async (t) => {
  await t.test('validates and normalizes valid dictionary', () => {
    const raw = {
      version: 1,
      id: 'dict-123',
      name: 'Surreal Forest',
      description: 'Transforms urban words to flora',
      created_at: '2026-10-18T10:00:00.000Z',
      updated_at: '2026-10-18T10:00:00.000Z',
      mappings: [
        { original: ' street ', replacement: ' path ' },
        { original: 'car', replacement: 'deer' },
      ],
    };

    const validated = validateCipherDictionary(raw);
    assert.equal(validated.id, 'dict-123');
    assert.equal(validated.name, 'Surreal Forest');
    assert.equal(validated.mappings[0].original, 'street');
    assert.equal(validated.mappings[0].replacement, 'path');
  });

  await t.test('rejects missing or invalid fields', () => {
    assert.throws(() => validateCipherDictionary(null), /Expected a JSON object/);
    assert.throws(() => validateCipherDictionary({ version: 2, id: 'a', name: 'b', mappings: [] }), /version/);
    assert.throws(() => validateCipherDictionary({ version: 1, id: '', name: 'b', mappings: [] }), /id/);
    assert.throws(() => validateCipherDictionary({ version: 1, id: 'a', name: '', mappings: [] }), /name/);
    assert.throws(() => validateCipherDictionary({ version: 1, id: 'a', name: 'b', mappings: 'invalid' }), /mappings/);
    assert.throws(() => validateCipherDictionary({ version: 1, id: 'a', name: 'b', mappings: [{ original: 123, replacement: 'x' }] }), /string/);
  });
});

test('Emotional Cipher — Frontend API and MockStorage CRUD', async (t) => {
  const { api, mock } = await import('../src/services/api.ts');

  await t.test('lists seeded dictionaries and supports CRUD', async () => {
    mock.seedDefaultDocuments();
    const list = await api.listCipherDictionaries();
    assert.ok(list.length >= 1);
    assert.equal(list[0].id, 'dict-botanical-default');

    const created: CipherDictionary = {
      version: 1,
      id: 'dict-celestial',
      name: 'Celestial Spheres',
      description: 'Cosmic vocabulary',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      mappings: [
        { original: 'sun', replacement: 'quasar' },
        { original: 'moon', replacement: 'nebula' },
      ],
    };

    const saved = await api.saveCipherDictionary(created);
    assert.equal(saved.id, 'dict-celestial');

    const fetched = await api.getCipherDictionary('dict-celestial');
    assert.equal(fetched.name, 'Celestial Spheres');
    assert.equal(fetched.mappings.length, 2);

    await api.deleteCipherDictionary('dict-celestial');
    const afterDelete = await api.listCipherDictionaries();
    assert.ok(!afterDelete.some(d => d.id === 'dict-celestial'));
  });

  await t.test('supports vocabulary pool listing, sampling, and importing', async () => {
    mock.seedDefaultDocuments();
    const pools = await api.listVocabularyPools();
    assert.ok(pools.length >= 1);
    const bundled = pools.find(p => p.id === 'bundled-english');
    assert.ok(bundled);
    assert.equal(bundled?.is_bundled, true);

    const sample = await api.getVocabularySample('bundled-english', 5, ['astronomy', 'telescope']);
    assert.equal(sample.length, 5);
    assert.ok(!sample.includes('astronomy'));
    assert.ok(!sample.includes('telescope'));

    const imported = await api.importVocabularyPool('Dream Symbols', 'mirror\nshadow\nstaircase\nclock\nkey\n');
    assert.equal(imported.name, 'Dream Symbols');
    assert.equal(imported.word_count, 5);

    const poolsAfter = await api.listVocabularyPools();
    assert.ok(poolsAfter.some(p => p.id === imported.id));

    const customSample = await api.getVocabularySample(imported.id, 2, ['mirror']);
    assert.equal(customSample.length, 2);
    assert.ok(!customSample.includes('mirror'));

    await api.deleteVocabularyPool(imported.id);
    const finalPools = await api.listVocabularyPools();
    assert.ok(!finalPools.some(p => p.id === imported.id));
  });
});

test('Emotional Cipher — Quick Cipher (Existing-Word Swaps)', async (t) => {
  const poem = `The golden sun rises in the morning.\nThe silver moon rests in the night.\nSun and moon watch the quiet world.`;

  await t.test('strictly enforces even swap count and boundaries', () => {
    assert.throws(() => generateQuickCipher(poem, 3), /even number/);
    assert.throws(() => generateQuickCipher(poem, -2), /between 0 and/);
    assert.throws(() => generateQuickCipher(poem, 998), /between 0 and/);
  });

  await t.test('handles 0 count gracefully', () => {
    const res = generateQuickCipher(poem, 0);
    assert.equal(res.encodedText, poem);
    assert.equal(res.pairs.length, 0);
    assert.equal(res.mappings.length, 0);
    assert.equal(res.swapCount, 0);
  });

  await t.test('pairs words into non-overlapping bidirectional swaps', () => {
    const rng = createSeededRng(101);
    const res = generateQuickCipher(poem, 4, rng);
    assert.equal(res.pairs.length, 2);
    assert.equal(res.mappings.length, 4);

    const [pair1, pair2] = res.pairs;
    assert.notEqual(pair1[0], pair1[1]);
    assert.notEqual(pair2[0], pair2[1]);

    assert.ok(res.mappings.some(m => m.original === pair1[0] && m.replacement === pair1[1]));
    assert.ok(res.mappings.some(m => m.original === pair1[1] && m.replacement === pair1[0]));
    assert.ok(res.mappings.some(m => m.original === pair2[0] && m.replacement === pair2[1]));
    assert.ok(res.mappings.some(m => m.original === pair2[1] && m.replacement === pair2[0]));
  });

  await t.test('satisfies exact involution property f(f(poem)) === poem', () => {
    for (const count of [2, 4, 6, 8]) {
      const rng = createSeededRng(42 + count);
      const forward = generateQuickCipher(poem, count, rng);
      assert.notEqual(forward.encodedText, poem, `Poem should be altered when swapCount=${count}`);

      const backward = encodeCipher(forward.encodedText, forward.mappings);
      assert.strictEqual(
        backward.encodedText,
        poem,
        `Involution f(f(poem)) === poem failed for swapCount=${count}`
      );
    }
  });
});

test('Emotional Cipher — Random Cipher (Offline Vocabulary Substitution)', async (t) => {
  const poem = `A quiet river flows beneath the ancient stone bridge.\nWater murmurs in the stillness.`;
  const candidatePool = [
    'starship',
    'quantum',
    'algorithm',
    'galaxy',
    'pulsar',
    'tachyon',
    'telescope',
    'supernova',
    'comet',
    'river',
    'quiet',
  ];

  await t.test('supports odd or even transform counts up to total unique', () => {
    const rng = createSeededRng(500);
    const resOdd = generateRandomCipher(poem, 3, candidatePool, rng);
    assert.equal(resOdd.pairs.length, 3);
    assert.equal(resOdd.mappings.length, 3);

    const resEven = generateRandomCipher(poem, 4, candidatePool, rng);
    assert.equal(resEven.pairs.length, 4);
    assert.equal(resEven.mappings.length, 4);
  });

  await t.test('strictly excludes any candidates that appear in the poem', () => {
    const rng = createSeededRng(300);
    const res = generateRandomCipher(poem, 5, candidatePool, rng);
    const chosenReplacements = res.mappings.map(m => m.replacement.toLowerCase());

    assert.ok(!chosenReplacements.includes('river'));
    assert.ok(!chosenReplacements.includes('quiet'));
  });

  await t.test('guarantees unique non-colliding replacements', () => {
    const rng = createSeededRng(700);
    const res = generateRandomCipher(poem, 6, candidatePool, rng);
    const replacements = res.mappings.map(m => m.replacement.toLowerCase());
    const uniqueReplacements = new Set(replacements);
    assert.equal(uniqueReplacements.size, replacements.length);

    const report = detectCollisions(poem, res.mappings);
    assert.equal(report.hasCollisions, false);
    assert.equal(report.duplicateTargets.length, 0);
  });

  await t.test('throws descriptive error when eligible candidates are insufficient', () => {
    const tinyPool = ['starship', 'river', 'quiet'];
    assert.throws(
      () => generateRandomCipher(poem, 3, tinyPool),
      /Insufficient vocabulary words in pool/
    );
  });
});

// ============================================================================
// COMPREHENSIVE RELIABILITY & MANDATORY CIPHER KEY TESTS (Requirements A – L)
// ============================================================================

const LARGE_92_WORD_POEM = [
  `I walked beside a moon-lit river where the ancient willow weeps,`,
  `And watched the silver lantern flicker while the quiet valley sleeps.`,
  `A thousand distant constellations shimmered through the autumn haze,`,
  `As memory wove its golden tapestry from half-forgotten days.`,
  ``,
  `O traveler of the twilight road, why don't you rest your weary mind?`,
  `The winter wind has swept away the footprints that we left behind.`,
  `It's strange how every shadow whispers secrets to the listening stone,`,
  `Yet in the cathedral of the forest, nobody truly walks alone.`,
  ``,
  `Beneath the arch of ETERNITY, a naïve étoile softly gleams,`,
  `Pouring amber nectar into chalices of porcelain and dreams.`,
  `We'll gather fallen chestnuts by the hearth before the embers fade,`,
  `And drink the fragrant café where the night's last symphony is played.`,
  ``,
  `Though iron gates and granite towers crumble into silent dust,`,
  `The compass of the human heart's devotion keeps its sacred trust.`,
  `From mountain peak to ocean cavern, echoes of the Harper's song`,
  `Remind the star-crossed wanderer where fragile mortal souls belong.`,
].join('\n');

test('Mandatory Cipher Keys & Reliability Suite (Requirements A – L)', async (t) => {
  const { api, mock } = await import('../src/services/api.ts');

  await t.test(' Verify test poem has >= 92 unique words for 64-word and 92-word Quick Cipher tests', () => {
    const freqs = analyzeWordFrequency(LARGE_92_WORD_POEM);
    assert.ok(
      freqs.length >= 96,
      `Expected at least 96 unique words, found ${freqs.length}`
    );
  });

  await t.test('A & L. Quick Cipher with 64 and 92 words: generate, save key, save poem, reopen, decode character-for-character', async () => {
    mock.seedDefaultDocuments();

    for (const swapCount of [64, 92]) {
      for (let trial = 1; trial <= 5; trial++) {
        const rng = createSeededRng(`trial-${swapCount}-${trial}`);
        const generated = generateQuickCipher(LARGE_92_WORD_POEM, swapCount, rng, {
          poemTitle: 'The Twilight Traveler',
          poemId: 'poem-orig-1',
        });

        assert.equal(generated.swapCount, swapCount);
        assert.equal(generated.pairs.length, swapCount / 2);
        assert.equal(generated.mappings.length, swapCount);
        assert.notStrictEqual(generated.encodedText, LARGE_92_WORD_POEM);

        // Save key to library
        const savedKey = await api.saveCipherDictionary(generated.key);
        assert.equal(savedKey.committed, true);
        assert.equal(savedKey.mode, 'quick');

        // Save ciphered poem with associated key metadata
        const cipheredDoc = await api.createDocument(
          'poetry',
          `The Twilight Traveler (Quick ${swapCount} #${trial})`,
          undefined,
          generated.encodedText,
          JSON.stringify({
            poetic_form: 'Free Verse',
            cipher: {
              mode: 'quick',
              key_id: savedKey.id,
              dictionary_id: savedKey.id,
              dictionary_name: savedKey.name,
              source_fingerprint: savedKey.source_fingerprint,
              encoded_fingerprint: savedKey.encoded_fingerprint,
              manifest: savedKey.manifest,
            },
          })
        );

        // Reopen poem and fetch associated key from library
        const reopenedDoc = await api.getDocument(cipheredDoc.metadata.id);
        const reopenedMeta = JSON.parse(reopenedDoc.metadata.metadata_json!);
        const loadedKey = await api.getCipherDictionary(reopenedMeta.cipher.key_id);

        // 1. Decode with full CipherKey
        const decoded = decodeWithCipherKey(reopenedDoc.content, loadedKey, {
          expectedKeyId: reopenedMeta.cipher.key_id,
          poemManifest: reopenedMeta.cipher.manifest,
        });

        assert.equal(decoded.fidelity, 'lossless');
        assert.equal(decoded.sourceFingerprintMatched, true);
        assert.equal(decoded.encodedFingerprintMatched, true);
        assert.strictEqual(decoded.decodedText, LARGE_92_WORD_POEM);

        // 2. Also verify standalone exported/re-imported .mckey decodes 100% character-for-character!
        const exportedMckey = JSON.parse(JSON.stringify(loadedKey));
        const decodedFromPortableMckey = decodeWithCipherKey(
          reopenedDoc.content,
          exportedMckey
        );
        assert.strictEqual(decodedFromPortableMckey.decodedText, LARGE_92_WORD_POEM);
        assert.equal(decodedFromPortableMckey.fidelity, 'lossless');
        assert.equal(decodedFromPortableMckey.sourceFingerprintMatched, true);
      }
    }
  });

  await t.test('B. Two different 92-word Quick Ciphers on the same poem: each decodes ONLY with its own key', () => {
    const cipher1 = generateQuickCipher(
      LARGE_92_WORD_POEM,
      92,
      createSeededRng('cipher-92-alpha'),
      { poemTitle: 'Poem Alpha' }
    );
    const cipher2 = generateQuickCipher(
      LARGE_92_WORD_POEM,
      92,
      createSeededRng('cipher-92-beta'),
      { poemTitle: 'Poem Beta' }
    );

    assert.notStrictEqual(cipher1.encodedText, cipher2.encodedText);
    assert.notEqual(cipher1.key.id, cipher2.key.id);
    assert.notEqual(cipher1.encodedFingerprint, cipher2.encodedFingerprint);

    // Key 1 decodes Cipher 1 losslessly
    const ok1 = decodeWithCipherKey(cipher1.encodedText, cipher1.key);
    assert.equal(ok1.fidelity, 'lossless');
    assert.strictEqual(ok1.decodedText, LARGE_92_WORD_POEM);

    // Key 2 decodes Cipher 2 losslessly
    const ok2 = decodeWithCipherKey(cipher2.encodedText, cipher2.key);
    assert.equal(ok2.fidelity, 'lossless');
    assert.strictEqual(ok2.decodedText, LARGE_92_WORD_POEM);

    // Key 2 MUST REJECT Cipher 1 with exact mismatch message
    const wrong1 = decodeWithCipherKey(cipher1.encodedText, cipher2.key);
    assert.equal(wrong1.fidelity, 'mismatch');
    assert.equal(wrong1.error, 'This Cipher Key does not match the selected poem.');

    // Key 1 MUST REJECT Cipher 2 with exact mismatch message
    const wrong2 = decodeWithCipherKey(cipher2.encodedText, cipher1.key);
    assert.equal(wrong2.fidelity, 'mismatch');
    assert.equal(wrong2.error, 'This Cipher Key does not match the selected poem.');
  });

  await t.test('C. Reroll repeatedly and verify old committed keys remain unchanged', async () => {
    mock.seedDefaultDocuments();

    // Roll #1 and commit it
    const roll1 = generateQuickCipher(
      LARGE_92_WORD_POEM,
      92,
      createSeededRng('roll-1'),
      { poemTitle: 'Reroll Poem' }
    );
    const committedRoll1 = await api.saveCipherDictionary(roll1.key);
    const snapshotMappings = JSON.stringify(committedRoll1.mappings);

    // Reroll 10 times without committing or with committing separate keys
    for (let r = 2; r <= 11; r++) {
      const nextRoll = generateQuickCipher(
        LARGE_92_WORD_POEM,
        92,
        createSeededRng(`roll-${r}`),
        { poemTitle: 'Reroll Poem' }
      );
      assert.notEqual(nextRoll.key.id, committedRoll1.id);
    }

    // Fetch Roll #1 from library and verify it was never overwritten
    const fetchedRoll1 = await api.getCipherDictionary(committedRoll1.id);
    assert.strictEqual(JSON.stringify(fetchedRoll1.mappings), snapshotMappings);
    const decodedRoll1 = decodeWithCipherKey(roll1.encodedText, fetchedRoll1);
    assert.equal(decodedRoll1.fidelity, 'lossless');
    assert.strictEqual(decodedRoll1.decodedText, LARGE_92_WORD_POEM);
  });

  await t.test('D & G. Random Cipher with offline vocabulary: export .mckey, paste ciphered text & import .mckey in fresh notebook, decode', async () => {
    mock.seedDefaultDocuments();
    const poemFreqs = analyzeWordFrequency(LARGE_92_WORD_POEM);
    const exclude = poemFreqs.map(f => f.word);

    // Build a 200-word offline candidate pool
    const offlineVocab = Array.from({ length: 200 }, (_, i) => `surrealvocab${i + 1}`);
    const randomCipher = generateRandomCipher(
      LARGE_92_WORD_POEM,
      45,
      offlineVocab,
      createSeededRng('random-45-seed'),
      { poemTitle: 'Surreal Odyssey', vocabularyPoolId: 'bundled-english' }
    );

    assert.equal(randomCipher.transformCount, 45);
    assert.notStrictEqual(randomCipher.encodedText, LARGE_92_WORD_POEM);

    // Export .mckey as serialized JSON string
    const exportedMckeyJson = JSON.stringify(randomCipher.key, null, 2);
    // Simulate copy-pasting ciphered text with Windows CRLF line endings
    const pastedCipherTextCrlf = randomCipher.encodedText.replace(/\n/g, '\r\n');

    // Reset to a fresh notebook library
    mock.seedDefaultDocuments();
    assert.equal((await api.listCipherDictionaries()).length, 1);

    // Validate and import the .mckey JSON into the fresh notebook
    const parsedImportedKey = validateCipherKey(JSON.parse(exportedMckeyJson), {
      disallowDuplicateOriginals: true,
    });
    const savedImportedKey = await api.saveCipherDictionary(parsedImportedKey);

    // Decode the pasted CRLF text using the imported .mckey
    const decoded = decodeWithCipherKey(pastedCipherTextCrlf, savedImportedKey);
    assert.equal(decoded.fidelity, 'lossless');
    assert.equal(decoded.sourceFingerprintMatched, true);
    assert.strictEqual(decoded.decodedText, LARGE_92_WORD_POEM);
  });

  await t.test('E. Manual Cipher with phrases, overlapping replacements, repeated words, and capitalization', () => {
    const manualPoem = [
      `In the dark night, the Dark Night spoke to my heart.`,
      `My HEART answered the stone, though stone cannot weep.`,
      `Love and dark night linger where love once stood.`,
    ].join('\n');

    const manualMappings: CipherMapping[] = [
      { original: 'dark night', replacement: 'gilded sunrise' },
      { original: 'heart', replacement: 'stone' }, // overlaps with existing 'stone' in poem!
      { original: 'love', replacement: 'chlorophyll' },
    ];

    const { key } = createCipherKey({
      mode: 'manual',
      poemTitle: 'Manual Phrase Test',
      sourceText: manualPoem,
      mappings: manualMappings,
      committed: true,
    });

    const encoded = encodeCipher(manualPoem, manualMappings);
    assert.equal(encoded.collisionReport.hasCollisions, true);

    // 1. Decoding with the full CipherKey (including manifest) is 100% lossless
    const losslessRes = decodeWithCipherKey(encoded.encodedText, key);
    assert.equal(losslessRes.fidelity, 'lossless');
    assert.equal(losslessRes.sourceFingerprintMatched, true);
    assert.strictEqual(losslessRes.decodedText, manualPoem);

    // 2. If manifest is stripped, heuristic reversal turns original 'stone' into 'heart',
    //    so recovered text differs from source_fingerprint -> MUST NOT report 'lossless'!
    const keyWithoutManifest: CipherKey = { ...key, manifest: undefined };
    const heuristicRes = decodeWithCipherKey(encoded.encodedText, keyWithoutManifest);
    assert.notStrictEqual(heuristicRes.decodedText, manualPoem);
    assert.equal(heuristicRes.sourceFingerprintMatched, false);
    assert.equal(
      heuristicRes.fidelity,
      'ambiguous',
      'Must never report lossless when recovered text differs from source_fingerprint'
    );
  });

  await t.test('F & K. Encode/decode across simulated application restart and Vault snapshot serialization', async () => {
    mock.seedDefaultDocuments();
    const q = generateQuickCipher(
      LARGE_92_WORD_POEM,
      64,
      createSeededRng('restart-seed'),
      { poemTitle: 'Restart Persistence Poem' }
    );
    const savedKey = await api.saveCipherDictionary(q.key);
    const savedDoc = await api.createDocument(
      'poetry',
      'Restart Persistence Poem (Ciphered)',
      undefined,
      q.encodedText,
      JSON.stringify({
        poetic_form: 'Free Verse',
        cipher: {
          key_id: savedKey.id,
          dictionary_id: savedKey.id,
          dictionary_name: savedKey.name,
          mode: 'quick',
          source_fingerprint: savedKey.source_fingerprint,
          encoded_fingerprint: savedKey.encoded_fingerprint,
          manifest: savedKey.manifest,
        },
      })
    );

    // Snapshot entire state to JSON (simulating disk persistence / Vault archive)
    const serializedDocs = JSON.stringify(mock.documents);
    const serializedKeys = JSON.stringify(Array.from(mock.cipherDictionaries.entries()));

    // Wipe state and restore from serialized snapshot
    mock.documents = [];
    mock.cipherDictionaries.clear();
    mock.documents = JSON.parse(serializedDocs);
    mock.cipherDictionaries = new Map(JSON.parse(serializedKeys));

    const restoredDoc = await api.getDocument(savedDoc.metadata.id);
    const restoredKey = await api.getCipherDictionary(savedKey.id);
    const decoded = decodeWithCipherKey(restoredDoc.content, restoredKey, {
      expectedKeyId: savedKey.id,
    });

    assert.equal(decoded.fidelity, 'lossless');
    assert.strictEqual(decoded.decodedText, LARGE_92_WORD_POEM);
  });

  await t.test('H. Rapidly switching between keys and decoding has zero state races', () => {
    const keysAndTexts = Array.from({ length: 10 }, (_, idx) => {
      return generateQuickCipher(
        LARGE_92_WORD_POEM,
        64,
        createSeededRng(`rapid-switch-${idx}`),
        { poemTitle: `Rapid Poem ${idx}` }
      );
    });

    // Rapidly alternate keys and verify each decode is deterministic
    for (let i = 0; i < keysAndTexts.length; i++) {
      const current = keysAndTexts[i];
      const next = keysAndTexts[(i + 1) % keysAndTexts.length];

      const validDecode = decodeWithCipherKey(current.encodedText, current.key);
      assert.equal(validDecode.fidelity, 'lossless');
      assert.strictEqual(validDecode.decodedText, LARGE_92_WORD_POEM);

      const mismatchDecode = decodeWithCipherKey(current.encodedText, next.key);
      assert.equal(mismatchDecode.fidelity, 'mismatch');
      assert.equal(mismatchDecode.error, 'This Cipher Key does not match the selected poem.');
    }
  });

  await t.test('I. Wrong key, missing key, corrupted key, and incompatible key version handling', () => {
    const validRun = generateQuickCipher(
      LARGE_92_WORD_POEM,
      64,
      createSeededRng('error-handling-seed')
    );

    // 1. Incompatible key schema version
    const futureVersionKey = { ...validRun.key, version: 2 };
    const resVer = decodeWithCipherKey(validRun.encodedText, futureVersionKey);
    assert.equal(resVer.fidelity, 'invalid_key');
    assert.match(resVer.error || '', /Unsupported Cipher Key version/);

    // 2. Incompatible algorithm version
    const futureAlgoKey = { ...validRun.key, algorithm_version: '9.0' };
    const resAlgo = decodeWithCipherKey(validRun.encodedText, futureAlgoKey);
    assert.equal(resAlgo.fidelity, 'invalid_key');
    assert.match(resAlgo.error || '', /Unsupported Cipher Key algorithm version/);

    // 3. Corrupted key with conflicting duplicate original entries
    const corruptedKey = {
      ...validRun.key,
      mappings: [
        ...validRun.key.mappings,
        {
          original: validRun.key.mappings[0].original,
          replacement: 'conflicting_replacement_word',
        },
      ],
    };
    const resCorrupt = decodeWithCipherKey(validRun.encodedText, corruptedKey);
    assert.equal(resCorrupt.fidelity, 'invalid_key');
    assert.match(resCorrupt.error || '', /Duplicate original entry/);

    // 4. Wrong poem key association ID
    const resWrongId = decodeWithCipherKey(validRun.encodedText, validRun.key, {
      expectedKeyId: 'key-different-poem-999',
    });
    assert.equal(resWrongId.fidelity, 'mismatch');
    assert.equal(resWrongId.error, 'This Cipher Key does not match the selected poem.');
  });

  await t.test('J. Delete unreferenced test keys and protect keys referenced by saved poems', async () => {
    mock.seedDefaultDocuments();

    // Create 3 test keys: 2 unreferenced, 1 referenced by a saved poem
    const unref1 = await api.saveCipherDictionary(
      generateQuickCipher(LARGE_92_WORD_POEM, 20, createSeededRng('u1')).key
    );
    const unref2 = await api.saveCipherDictionary(
      generateQuickCipher(LARGE_92_WORD_POEM, 20, createSeededRng('u2')).key
    );
    const refRun = generateQuickCipher(LARGE_92_WORD_POEM, 20, createSeededRng('ref1'));
    const referencedKey = await api.saveCipherDictionary(refRun.key);

    await api.createDocument(
      'poetry',
      'Protected Cipher Poem',
      undefined,
      refRun.encodedText,
      JSON.stringify({
        poetic_form: 'Free Verse',
        cipher: {
          key_id: referencedKey.id,
          dictionary_id: referencedKey.id,
          dictionary_name: referencedKey.name,
          mode: 'quick',
        },
      })
    );

    // Ordinary delete on referencedKey MUST throw a protective error naming the poem
    await assert.rejects(
      async () => {
        await api.deleteCipherDictionary(referencedKey.id);
      },
      /Protected Cipher Poem/
    );

    // Bulk delete across [unref1, unref2, referencedKey] deletes unref1 & unref2 and blocks referencedKey
    const bulkReport = await api.bulkDeleteCipherDictionaries([
      unref1.id,
      unref2.id,
      referencedKey.id,
    ]);
    assert.deepEqual(bulkReport.deleted, [unref1.id, unref2.id]);
    assert.equal(bulkReport.blocked.length, 1);
    assert.equal(bulkReport.blocked[0].id, referencedKey.id);

    // Verify referencedKey is still intact in library and can decode the poem
    const survivingKey = await api.getCipherDictionary(referencedKey.id);
    assert.equal(survivingKey.id, referencedKey.id);
    assert.deepEqual(survivingKey.associated_poem_titles, ['Protected Cipher Poem']);

    // Explicit force delete succeeds when requested
    await api.deleteCipherDictionary(referencedKey.id, true);
    const remaining = await api.listCipherDictionaries();
    assert.ok(!remaining.some(k => k.id === referencedKey.id));
  });
});

test('Emotional Cipher UX Cleanup & Poetry Import/Export Suite (Part 1 – Part 7)', async (t) => {
  const { api, mock } = await import('../src/services/api.ts');

  await t.test('1. Existing saved keys and legacy pre-v1 dictionaries load without false corruption warnings', () => {
    // Legacy pre-v1 dictionary without version, algorithm_version, or fingerprints
    const legacyDictionary = {
      id: 'legacy-botanical-1',
      name: 'Botanical Silence',
      mappings: [
        { original: 'love', replacement: 'chlorophyll' },
        { original: 'heart', replacement: 'root' },
      ],
    };

    const validated = validateCipherKey(legacyDictionary);
    assert.equal(validated.version, 1);
    assert.equal(validated.algorithm_version, '1.0');
    assert.equal(validated.id, 'legacy-botanical-1');
    assert.equal(classifyCipherKey(validated), 'reusable_dictionary');

    // Decoding a poem using this legacy reusable dictionary works cleanly without corruption errors
    const decoded = decodeWithCipherKey('My chlorophyll and my root remain.', validated);
    assert.notEqual(decoded.fidelity, 'invalid_key');
    assert.equal(decoded.decodedText, 'My love and my heart remain.');
  });

  await t.test('2. New key names and saved ciphered poem titles never recursively nest titles, modes, or timestamps', () => {
    const baseTitle = 'Women as Both Art and Craftswoman';

    // Automatic key naming produces short clean names: "<Base Title> — <Mode> #<N>"
    const keyName1 = formatDefaultCipherKeyName('quick', baseTitle, 1);
    assert.equal(keyName1, 'Women as Both Art and Craftswoman — Quick #1');

    // Passing an already-ciphered title or nested legacy key name into formatDefaultCipherKeyName strips nesting
    const nestedInput =
      'Quick Cipher Key — Women as Both Art and Craftswoman (Quick Cipher) (Quick Cipher #2) — 2026-10-18 19:45';
    assert.equal(extractBasePoemTitle(nestedInput), baseTitle);
    const keyName2 = formatDefaultCipherKeyName('quick', nestedInput, 2);
    assert.equal(keyName2, 'Women as Both Art and Craftswoman — Quick #2');

    // Saved ciphered & decoded poem titles also strip existing suffixes instead of nesting
    const cipherTitle1 = formatCipheredPoemTitle(baseTitle, 'quick', 1);
    assert.equal(cipherTitle1, 'Women as Both Art and Craftswoman (Quick Cipher)');
    const cipherTitle2 = formatCipheredPoemTitle(cipherTitle1, 'random', 2);
    assert.equal(cipherTitle2, 'Women as Both Art and Craftswoman (Random Cipher #2)');
    const decodedTitle = formatCipheredPoemTitle(cipherTitle2, 'decoded');
    assert.equal(decodedTitle, 'Women as Both Art and Craftswoman (Decoded)');

    // Truncation helper preserves readability in compact selectors
    const longLabel = 'Women as Both Art and Craftswoman in the Gilded Twilight — Quick #12';
    const truncated = truncateDisplayLabel(longLabel, 40);
    assert.ok(truncated.length <= 40);
    assert.ok(truncated.endsWith('…'));
  });

  await t.test('3. Saved ciphered poems automatically match their key after restart (by key_id or encoded_fingerprint)', async () => {
    mock.seedDefaultDocuments();
    const run = generateQuickCipher(
      LARGE_92_WORD_POEM,
      64,
      createSeededRng('auto-match-seed'),
      { poemTitle: 'Women as Both Art and Craftswoman', poemId: 'poem-women-1' }
    );
    assert.equal(classifyCipherKey(run.key), 'poem_key');

    const savedKey = await api.saveCipherDictionary(run.key);
    const savedPoem = await api.createDocument(
      'poetry',
      formatCipheredPoemTitle('Women as Both Art and Craftswoman', 'quick', 1),
      undefined,
      run.encodedText,
      JSON.stringify({
        poetic_form: 'Free Verse',
        cipher: {
          mode: 'quick',
          key_id: savedKey.id,
          dictionary_id: savedKey.id,
          dictionary_name: savedKey.name,
          source_fingerprint: savedKey.source_fingerprint,
          encoded_fingerprint: savedKey.encoded_fingerprint,
          manifest: savedKey.manifest,
        },
      })
    );

    // Simulate restart and resolve key from library
    const allKeys = await api.listCipherDictionaries();
    const reopenedPoem = await api.getDocument(savedPoem.metadata.id);
    const poemMeta = JSON.parse(reopenedPoem.metadata.metadata_json!);

    // Match by key_id
    const matchedById = allKeys.find(k => k.id === poemMeta.cipher.key_id);
    assert.ok(matchedById, 'Should automatically resolve associated key by key_id');

    // Also match by encoded_fingerprint even if metadata were stripped
    const currentFp = computeTextFingerprint(reopenedPoem.content);
    const matchedByFp = allKeys.find(k => k.encoded_fingerprint === currentFp);
    assert.ok(matchedByFp, 'Should automatically resolve associated key by encoded_fingerprint');
    assert.equal(matchedByFp!.id, savedKey.id);
  });

  await t.test('4 & 5. Distinguish wrong key selected (wrong_key) vs edited ciphered poem (text_modified)', () => {
    const runA = generateQuickCipher(
      LARGE_92_WORD_POEM,
      64,
      createSeededRng('diag-seed-a'),
      { poemTitle: 'Diagnostic Poem A' }
    );
    const runB = generateQuickCipher(
      LARGE_92_WORD_POEM,
      64,
      createSeededRng('diag-seed-b'),
      { poemTitle: 'Diagnostic Poem B' }
    );

    // Scenario 4: Wrong key selected for Poem A
    const wrongKeyResult = decodeWithCipherKey(runA.encodedText, runB.key, {
      expectedKeyId: runA.key.id,
      isMatchedKey: false,
    });
    assert.equal(wrongKeyResult.fidelity, 'mismatch');
    assert.equal(wrongKeyResult.mismatchReason, 'wrong_key');
    assert.equal(wrongKeyResult.error, 'This Cipher Key does not match the selected poem.');

    // Scenario 5: Poem A's ciphered text was edited after encoding, while using Poem A's matched key
    const editedCipherText = runA.encodedText + '\nAn extra edited line added after encoding.';
    const modifiedTextResult = decodeWithCipherKey(editedCipherText, runA.key, {
      expectedKeyId: runA.key.id,
      isMatchedKey: true,
    });
    assert.equal(modifiedTextResult.fidelity, 'mismatch');
    assert.equal(modifiedTextResult.mismatchReason, 'text_modified');
    assert.equal(modifiedTextResult.statusLabel, 'Ciphered Text Modified');
    assert.match(modifiedTextResult.error || '', /modified after encoding/i);
  });

  await t.test('6. Poem Export & Import (.txt, .md, .mcpoem) roundtrips preserve content, stanzas, and metadata without machine paths', () => {
    const poemData = {
      title: 'Women as Both Art and Craftswoman',
      content: 'First stanza line one,\nFirst stanza line two.\n\nSecond stanza line one,\nSecond stanza line two.',
      poeticForm: 'Elegy',
      tags: ['craft', 'identity', 'gilded'],
    };

    // 1. Plain Text (.txt) roundtrip
    const txtSerialized = serializePoemExport(poemData, 'txt');
    const txtImported = parsePoemImport(
      'Women_as_Both_Art_and_Craftswoman.txt',
      txtSerialized.content
    );
    assert.equal(txtImported.sourceFormat, 'txt');
    assert.equal(txtImported.title, 'Women as Both Art and Craftswoman');
    assert.equal(txtImported.content, poemData.content);
    assert.equal(txtImported.stanzas.length, 2);

    // 2. Markdown (.md) roundtrip with frontmatter
    const mdSerialized = serializePoemExport(poemData, 'md');
    const mdImported = parsePoemImport('poem.md', mdSerialized.content);
    assert.equal(mdImported.sourceFormat, 'md');
    assert.equal(mdImported.title, poemData.title);
    assert.equal(mdImported.poetic_form, 'Elegy');
    assert.deepEqual(mdImported.tags, ['craft', 'identity', 'gilded']);
    assert.equal(mdImported.content, poemData.content);
    assert.equal(mdImported.stanzas.length, 2);

    // 3. Portable Poem Package (.mcpoem) roundtrip
    const mcpoemSerialized = serializePoemExport(poemData, 'mcpoem');
    assert.ok(!mcpoemSerialized.content.includes('C:\\'), 'Must not include Windows machine paths');
    assert.ok(!mcpoemSerialized.content.includes('/Users/'), 'Must not include Unix machine paths');
    const mcpoemImported = parsePoemImport('poem.mcpoem', mcpoemSerialized.content);
    assert.equal(mcpoemImported.sourceFormat, 'mcpoem');
    assert.equal(mcpoemImported.title, poemData.title);
    assert.equal(mcpoemImported.poetic_form, 'Elegy');
    assert.deepEqual(mcpoemImported.tags, ['craft', 'identity', 'gilded']);
    assert.equal(mcpoemImported.content, poemData.content);
    assert.equal(mcpoemImported.stanzas.length, 2);
  });

  await t.test('7. Cipher Package (.mccipher) export and Import & Decode work in a fresh notebook without sender database', async () => {
    const run = generateQuickCipher(
      LARGE_92_WORD_POEM,
      92,
      createSeededRng('mccipher-share-92'),
      { poemTitle: 'The Shared Tapestry', poemId: 'sender-local-id-99' }
    );

    const pkg = createCipherPackage({
      poemTitle: formatCipheredPoemTitle('The Shared Tapestry', 'quick', 1),
      encodedText: run.encodedText,
      key: run.key,
      poeticForm: 'Ballad',
      tags: ['shared', 'cipher'],
    });

    assert.equal(pkg.format, 'mccipher');
    assert.equal(pkg.version, 1);
    assert.equal(pkg.disclosure, MCCIPHER_DISCLOSURE);
    assert.match(pkg.disclosure, /creative obfuscation/i);
    assert.match(pkg.disclosure, /not cryptographic encryption/i);

    const serializedPkg = JSON.stringify(pkg, null, 2);

    // Simulate recipient with a completely fresh notebook database
    mock.seedDefaultDocuments();
    const initialKeys = await api.listCipherDictionaries();
    assert.ok(!initialKeys.some(k => k.id === run.key.id));

    // Recipient runs Import & Decode on the .mccipher file
    const { packageData, decodeResult, cipheredPoemTitle, recoveredPoemTitle } =
      decodeCipherPackage(serializedPkg);
    assert.equal(packageData.poem.title, 'The Shared Tapestry');
    assert.equal(cipheredPoemTitle, 'The Shared Tapestry (Quick Cipher)');
    assert.equal(recoveredPoemTitle, 'The Shared Tapestry (Decoded)');
    assert.equal(decodeResult.fidelity, 'lossless');
    assert.equal(decodeResult.sourceFingerprintMatched, true);
    assert.strictEqual(decodeResult.decodedText, LARGE_92_WORD_POEM);

    // Verify tamper detection if encoded_text in .mccipher is modified in transit
    const tamperedRaw = JSON.parse(serializedPkg);
    tamperedRaw.poem.encoded_text += '\nTampered line in transit.';
    assert.throws(
      () => decodeCipherPackage(tamperedRaw),
      /integrity check failed/i
    );
  });

  await t.test('9. Duplicate poem titles on import or save are resolved cleanly without overwriting existing poems', () => {
    const existing = [
      'The Silent Hourglass',
      'The Silent Hourglass (2)',
      'Women as Both Art and Craftswoman (Quick Cipher)',
    ];

    assert.equal(
      resolveUniquePoemTitle('The Silent Hourglass', existing),
      'The Silent Hourglass (3)'
    );
    assert.equal(
      resolveUniquePoemTitle('Women as Both Art and Craftswoman (Quick Cipher)', existing),
      'Women as Both Art and Craftswoman (Quick Cipher) (2)'
    );
    assert.equal(
      resolveUniquePoemTitle('Brand New Poem', existing),
      'Brand New Poem'
    );
  });

  await t.test('10. Malformed, oversized, null-byte, path-traversal, or unsupported-extension imports fail safely', () => {
    // Path traversal filename rejection
    assert.throws(
      () => parsePoemImport('../secret/poem.txt', 'Hello world'),
      /Unsafe path or traversal sequence/i
    );
    assert.throws(
      () => parsePoemImport('..\\secret\\poem.txt', 'Hello world'),
      /Unsafe path or traversal sequence/i
    );

    // Unsupported file extension rejection
    assert.throws(
      () => parsePoemImport('poem.exe', 'Hello world'),
      /Unsupported poem import file type/i
    );

    // Oversized file rejection
    assert.throws(
      () => parsePoemImport('huge.txt', 'Hello world', { maxBytes: 5 }),
      /exceeds maximum allowed size/i
    );

    // Binary / null-byte file rejection
    assert.throws(
      () => parsePoemImport('binary.txt', 'Hello\0world'),
      /null bytes/i
    );

    // Malformed .mcpoem JSON rejection
    assert.throws(
      () => parsePoemImport('broken.mcpoem', '{not valid json'),
      /Malformed JSON/i
    );

    // Wrong schema format in .mcpoem rejection
    assert.throws(
      () =>
        parsePoemImport(
          'wrong.mcpoem',
          JSON.stringify({ format: 'wrong-format', version: 1, poem: { title: 'T', content: 'C' } })
        ),
      /Expected format "mcpoem"/i
    );

    // Malformed .mccipher package validation rejection
    assert.throws(
      () => validateCipherPackage({ format: 'wrong', version: 99 }),
      /Expected "mccipher"/i
    );

    // Filename sanitization strips dangerous characters and path traversal
    assert.equal(sanitizePortableFilename('../../CON:poem?.txt', 'fallback'), 'CON_poem_.txt');
  });
});



