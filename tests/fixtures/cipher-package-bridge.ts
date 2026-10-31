// Invoked by the Rust integration test against a tempfile notebook, never a user library.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as c from '../../src/utils/emotionalCipher.ts';

export function recoveryFixture() {
  const text = 'love at dawn\n\nlove at noon\n\nlove at dusk';
  const entries = c.initializePoemStanzas(text).map((entry, i) => ({ ...entry, id: `bridge-stanza-${i}`,
    mappings: [{ original: 'love', replacement: ['ember', 'silence', 'home'][i] }] }));
  const meta: c.PoemCipherMetadata = { version: 2, scope: 'per_stanza', recovery_version: 1,
    stanzas: entries, per_stanza_backup: entries,
    whole_poem_backup: { mappings: [{ original: 'love', replacement: 'warmth' }], key_id: 'old-key', dictionary_name: 'Whole backup' },
    unresolved_stanzas: [{ id: 'bridge-detached', index: 4, mappings: [{ original: 'lost', replacement: 'found' }] }] };
  const encoded = c.encodePoemWithStanzas(c.splitPoemStanzas(text), entries);
  const key = c.withCipherRecovery(c.validateCipherKey({ version: 2, algorithm_version: '2.0', id: 'bridge-key', name: 'Disposable bridge',
    created_at: '2026-10-31T00:00:00Z', updated_at: '2026-10-31T00:00:00Z',
    scope: 'per_stanza', mappings: entries.flatMap(e => e.mappings), stanzas: entries.map((entry, i) => ({ ...entry,
      manifest: encoded.stanzaResults[i].manifest, source_fingerprint: encoded.stanzaResults[i].sourceFingerprint,
      encoded_fingerprint: encoded.stanzaResults[i].encodedFingerprint })),
    source_fingerprint: c.computeTextFingerprint(text), encoded_fingerprint: c.computeTextFingerprint(encoded.encodedText) }), meta);
  return { text, entries, meta, encoded, key };
}

const [action, directory] = process.argv.slice(2);
if (action === 'export' || action === 'verify') {
  const f = recoveryFixture();
  if (action === 'export') {
    writeFileSync(join(directory, 'ts-input.mckey'), JSON.stringify(f.key));
    writeFileSync(join(directory, 'ts-poem.mcpoem'), c.serializePoemExport({ title: 'Bridge', content: f.text, cipherMeta: f.meta as any }, 'mcpoem').content);
  } else {
    const before = c.validateCipherKey(JSON.parse(readFileSync(join(directory, 'ts-input.mckey'), 'utf8')));
    const after = c.validateCipherKey(JSON.parse(readFileSync(join(directory, 'rust-output.mckey'), 'utf8')));
    for (const field of ['stanzas', 'whole_poem_backup', 'per_stanza_backup', 'unresolved_stanzas', 'recovery_version', 'algorithm_version'] as const) {
      assert.deepEqual(after[field], before[field], field);
    }
    const pkg = c.createCipherPackage({ poemTitle: 'Bridge', encodedText: f.encoded.encodedText, key: after });
    writeFileSync(join(directory, 'ts-output.mccipher'), JSON.stringify(pkg));
    const imported = c.decodeCipherPackage(readFileSync(join(directory, 'ts-output.mccipher'), 'utf8'));
    assert.equal(imported.packageData.algorithm_version, '2.0');
    assert.equal(imported.decodeResult.decodedText, f.text);
    assert.deepEqual(imported.packageData.key.unresolved_stanzas, f.meta.unresolved_stanzas);
    const poem = c.parsePoemImport('ts-poem.mcpoem', readFileSync(join(directory, 'ts-poem.mcpoem'), 'utf8'));
    assert.deepEqual(poem.cipher, f.meta);
  }
}
