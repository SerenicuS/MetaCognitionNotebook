# MetaCognition Notebook — v0.5.2 Release & Verification Audit Report
## Milestone: The Emotional Cipher — Reliability, Mandatory Cipher Keys (`.mckey`) & Key Library Management

**Document Version:** 1.2.0  
**Audit Date:** 2026-10-18  
**Operating Environment:** Windows 11 Pro x86_64, Node.js v20+, Rust 1.80+ / Cargo, Tauri 2.2.0  
**Scope:** Root-cause investigation of 64/92-word Quick Cipher decoding failures, implementation of Mandatory Cipher Keys (`.mckey`), Key Library management with reference-protected deletion, full automated regression testing (`npm test`, `cargo test`), TypeScript verification (`tsc --noEmit`), and Vite production build (`npm run build`).

---

## 1. Root-Cause Investigation of 64-Word and 92-Word Decode Failures

Following manual testing with 64 and 92 participating words in Quick Cipher, a forensic code audit of `src/utils/emotionalCipher.ts`, `src/components/studios/EmotionalCipherModal.tsx`, and `src/components/studios/PoetryStudio.tsx` uncovered **five concrete root causes** that caused intermittent or corrupted decoding:

1. **Root Cause 1 — Contraction & Hyphenated Word Boundary Splitting in `encodeCipher` / `decodeCipher`:**
   - `analyzeWordFrequency` extracted words using `WORD_REGEX = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu`, treating contractions (`it's`, `don't`, `we'll`), possessives (`night's`, `heart's`), and hyphenated words (`moon-lit`, `star-crossed`) as single tokens.
   - However, `encodeCipher` and `decodeCipher` previously used `(?<![\p{L}\p{N}])` and `(?![\p{L}\p{N}])` as word boundaries. Because `'`, `’`, and `-` are not in `[\p{L}\p{N}]`, mapping a shorter word like `"it"`, `"night"`, or `"moon"` matched *inside* `"it's"`, `"night's"`, or `"moon-lit"`, corrupting tokens whenever a poem contained both root words and contractions/possessives/hyphens (which is virtually guaranteed at 64 or 92 words).
   - **Fix:** Implemented `buildWordBoundaryPattern` with `(?<![\p{L}\p{N}])(?<![\p{L}\p{N}]['’\-])` and `(?![\p{L}\p{N}])(?![\'’\-][\p{L}\p{N}])`, aligning substitution boundaries 1:1 with `WORD_REGEX`.

2. **Root Cause 2 — Single-Letter Capitalized Word Case Corruption in `applyCase`:**
   - In `applyCase(source, replacement)`, `isAllCaps` was computed as `source === source.toUpperCase() && source !== source.toLowerCase()`.
   - For any single-letter uppercase word (`"I"`, `"A"`, `"O"`), `isAllCaps` evaluated to `true`.
   - When `"I"` or `"A"` was swapped with `"river"`, `"I"` became `"RIVER"` (ALL CAPS) instead of `"River"`. Worse, when a Title-Cased word at the start of a line (e.g., `"Morning"`) was swapped with `"a"`, encoding produced `"A"`, and decoding `"A"` back to `"morning"` saw `isAllCaps === true` and produced `"MORNING"` (ALL CAPS) instead of `"Morning"`.
   - **Fix:** `isAllCaps` now requires `letters.length > 1`, treating single-letter uppercase words (`"I"`, `"A"`, `"O"`) as Title Case so heuristic roundtrips preserve exact capitalization, while manifest-backed `CipherKey` decoding restores exact original token spans.

3. **Root Cause 3 — Saving a Quick/Random Cipher Poem or Dictionary Did Not Bind or Select the Generated Key:**
   - Previously, `handleSaveGeneratedDictionary` saved the Quick/Random dictionary to disk but kept `selectedDictId` pointing to the default Manual dictionary (`"Botanical Surrealism"`), and `handleSaveAsNewPoem` wrote the Manual `selectedDictId` (without the Quick/Random mappings or manifest) into the new poem's `metadata_json`.
   - Furthermore, `PoetryStudio.tsx` did not pass `poemId` or `poemMetadataJson` into `EmotionalCipherModal`, so reopening a saved ciphered poem never auto-selected its associated key.
   - **Fix:** Saving a ciphered poem now atomically commits the active `CipherKey` (including `mappings`, `manifest`, `source_fingerprint`, and `encoded_fingerprint`), binds `key_id` in the poem's `metadata_json`, and `PoetryStudio` passes `poemId` and `poemMetadataJson` so reopening any ciphered poem automatically selects its matching `CipherKey`.

4. **Root Cause 4 — Stale `decodeInput` State Across Modal Sessions:**
   - Switching to the `Decode` tab previously checked `if (!decodeInput)` before loading `poemContent`, leaving stale text from an earlier poem in `decodeInput`.
   - **Fix:** Opening the modal or clicking the `Decode Poem` tab always synchronizes `decodeInput` to the active poem's content and validates the selected key's `encoded_fingerprint`.

5. **Root Cause 5 — Unseeded `Math.random()` Inside `useMemo`:**
   - `generateQuickCipher` was previously called with `Math.random` inside a React `useMemo`, causing silent re-rolls when unrelated dependencies updated.
   - **Fix:** Added a deterministic seeded PRNG (`createSeededRng` using Mulberry32) keyed by roll index so mappings only change when the user explicitly clicks **Randomize Again**.

---

## 2. Mandatory Cipher Keys (`.mckey`), UX Cleanup & Poetry Import/Export Architecture

1. **First-Class `CipherKey` Schema (`.mckey` / v1 JSON) & Non-Nesting Naming (Part 1):**
   - Every cipher pass creates a structured `CipherKey` containing `version: 1`, `algorithm_version: "1.0"`, `id`, `name`, `mode` (`'quick' | 'random' | 'manual'`), `committed`, `word_count`, `mappings`, `manifest`, `source_fingerprint` (`mcfp1:...`), `encoded_fingerprint` (`mcfp1:...`), and `associated_poem_ids` / `associated_poem_titles`.
   - Automatic key names use a short, non-nesting format via `extractBasePoemTitle` and `formatDefaultCipherKeyName`: `"<Base Poem Title> — <Mode> #<N>"` (e.g., `"Women as Both Art and Craftswoman — Quick #1"`). Saved ciphered/decoded poem titles (`formatCipheredPoemTitle`) strip any existing cipher/decode suffixes so titles never recursively nest.
   - Legacy pre-v1 keys without `version` or fingerprints load cleanly as reusable dictionaries without false corruption warnings.
2. **Streamlined Decode UX & Diagnostic Mismatch Messages (Part 2):**
   - Opening Decode on a saved ciphered poem automatically resolves its associated Cipher Key (by `key_id` or `encoded_fingerprint`) and renders a compact **Matched Cipher Key Summary Card** instead of a cluttered dropdown, with secondary **Choose Different Key** (grouped into **Poem Cipher Keys** vs **Reusable Manual Dictionaries** with truncated labels via `truncateDisplayLabel`) and **Import Key (`.mckey`)** actions.
   - `decodeWithCipherKey` explicitly distinguishes between:
     - `wrong_key`: `"This Cipher Key does not match the selected poem."` when a different poem's key is selected.
     - `text_modified`: `"The ciphered poem text was modified after encoding. Its fingerprint no longer matches this Cipher Key."` when the poem's associated key is selected but the ciphered poem text was edited after encoding.
3. **Poetry Studio Import & Export — `.txt`, `.md`, `.mcpoem` (Parts 3 & 4):**
   - `serializePoemExport` exports any poem as Plain Text (`.txt`), canonical Markdown with `---json` frontmatter (`.md`), or a portable versioned JSON Poem Package (`.mcpoem`) without machine-specific paths.
   - `parsePoemImport` imports `.txt`, `.md`, and `.mcpoem` files as new documents, enforcing safe extensions, UTF-8 text (rejecting null bytes), maximum size (5 MB), and path-traversal rejection (`..` or absolute paths), while resolving duplicate titles via `resolveUniquePoemTitle` so existing poems are never overwritten.
4. **Portable Cipher Package Sharing — `.mccipher` (Part 5):**
   - `createCipherPackage`, `validateCipherPackage`, and `decodeCipherPackage` bundle a ciphered poem, its exact `CipherKey`, integrity fingerprints, and `MCCIPHER_DISCLOSURE` (*"Creative obfuscation for literary wordplay — not cryptographic encryption."*).
   - Supports one-step **Import & Decode (`.mccipher`)** in a completely fresh notebook without requiring the sender's local database.
5. **Key Library Management & Reference Protection (Part 6):**
   - Dedicated **Key Library** tab distinguishing **Poem Cipher Keys** from **Reusable Dictionaries**, supporting search, sort, filter (`All`, `Unreferenced / Test Keys Only`, `Referenced by Saved Poems`), inline rename, key details inspection, `.mckey` import/export, and multi-select bulk deletion.
   - Both Rust (`cipher::delete_dictionary_impl`) and frontend storage block ordinary deletion of any key referenced by a saved ciphered poem, naming the dependent poem(s).

---

## 3. Automated Test Execution & Build Verification

### 3.1 Full Frontend Test Suite (`npm test`)
**Command:** `npm test`
- **Total Suites:** 11
- **Total Tests:** **148 passed**, 0 failed, 0 skipped
- **Dedicated Cipher Suite (`tests/v052_cipher.test.ts`):** **60 tests passed**, covering all reliability scenarios (**A through L**) and UX Cleanup / Import-Export scenarios (**Part 1 through Part 7**):
  - **A & L:** 64-word and 92-word Quick Cipher across 5 seeded trials each: generate, save key, save poem, reopen, decode, and verify `assert.strictEqual(decodedText, originalPoem)` across punctuation, case (`"I"`, `"A"`, `"O"`, `"ETERNITY"`), contractions (`"don't"`, `"it's"`, `"we'll"`, `"night's"`, `"heart's"`), hyphenated words (`"moon-lit"`, `"half-forgotten"`, `"star-crossed"`), Unicode (`"naïve"`, `"étoile"`, `"café"`, `"—"`), and stanza breaks.
  - **B:** Two different 92-word Quick Ciphers on the same poem: each decodes losslessly with its own key and rejects the other key with `"This Cipher Key does not match the selected poem."`
  - **C:** Repeated rerolls (10x) never overwrite or mutate previously committed keys.
  - **D & G:** Random Cipher with offline vocabulary: export `.mckey`, copy/paste ciphered text (including CRLF line endings) into a fresh notebook, import `.mckey`, and decode with `assert.strictEqual`.
  - **E:** Manual Cipher with multiword phrases, overlapping replacements, and mixed case: verifies manifest lossless recovery and proves heuristic reversal without manifest is never falsely reported as `lossless` when `source_fingerprint` differs.
  - **F & K:** Encode/decode persistence across simulated application restart and Vault snapshot serialization.
  - **H:** Rapidly switching between 10 keys and decoding has zero state races.
  - **I:** Rejects wrong keys, missing keys, corrupted keys (duplicate conflicting originals), and incompatible key/algorithm versions.
  - **J:** Deletes unreferenced test keys (single and bulk delete) while blocking ordinary deletion of keys referenced by saved ciphered poems.
  - **Part 7.1:** Legacy pre-v1 dictionaries without `version` or fingerprints load and decode without false corruption warnings.
  - **Part 7.2:** Automatic key names (`"Women as Both Art and Craftswoman — Quick #1"`) and saved ciphered/decoded poem titles never recursively nest titles, modes, or timestamps.
  - **Part 7.3:** Saved ciphered poems automatically match their associated key after restart by `key_id` or `encoded_fingerprint`.
  - **Part 7.4 & 7.5:** Explicitly distinguishes `wrong_key` (`"This Cipher Key does not match the selected poem."`) from `text_modified` (`"The ciphered poem text was modified after encoding..."`).
  - **Part 7.6:** `.txt`, `.md`, and `.mcpoem` poem export/import roundtrips preserve content, stanza structure, poetic form, and tags without machine-specific paths.
  - **Part 7.7:** `.mccipher` export and one-step **Import & Decode** recover the exact original poem in a fresh notebook without the sender's database, and reject tampered packages.
  - **Part 7.9 & 7.10:** Duplicate poem titles on import are resolved cleanly without overwriting existing poems; malformed, oversized, null-byte, path-traversal, and unsupported-extension imports fail safely.

### 3.2 TypeScript Type Check (`npx tsc --noEmit`)
**Command:** `npx tsc --noEmit`
- **Result:** Passed with **0 errors**.

### 3.3 Rust Backend Test Suite (`cargo test`)
**Command:** `cargo test --manifest-path src-tauri/Cargo.toml`
- **Unit tests (`src/lib.rs`):** **50 passed**, 0 failed (including `test_cipher_dictionary_crud`, `test_cipher_mckey_import_export_and_validation`, `test_referenced_cipher_key_deletion_protection`, `test_vocabulary_pool_crud_and_sampling`, and `cipher_dictionaries_survive_vault_roundtrip`).
- **Integration tests (`tests/thinking_desk.rs`):** **3 passed**, 0 failed.
- **Integration tests (`tests/workshop.rs`):** **10 passed**, 0 failed.
- **Total Rust Tests:** **63 passed**, 0 failed.

### 3.4 Production Frontend Build (`npm run build`)
**Command:** `npm run build`
- **Result:** Built cleanly (`tsc && vite build`, 1,633 modules transformed) in 6.57s with 0 errors.

---

## 4. Manual Desktop Verification Checklist

While automated unit and integration tests verify the deterministic substitution, fingerprinting, key binding, import/export roundtrips, and reference-protection logic, the following interactive checks are recommended in the Windows desktop app:
1. Open Poetry Studio on a 100+ word poem, open **Emotional Cipher**, select **64** and **92** words in **Quick Cipher**, verify the short key name (`"<Poem Title> — Quick #1"`), click **Save Ciphered Poem & Key**, reopen the saved ciphered poem, click the **Cipher Key — Decode** pill in the poem header, and confirm the **Matched Cipher Key Summary Card** appears and restores the exact original poem.
2. In Poetry Studio, test **Export** (`.txt`, `.md`, `.mcpoem`) and **Import** (`.txt`, `.md`, `.mcpoem`) and verify duplicate titles create `"<Title> (2)"` without overwriting existing poems.
3. Export a `.mccipher` Cipher Package and test **Import & Decode (`.mccipher`)** from the Decode tab.
4. Open the **Key Library** tab, click **Select All Unreferenced Test Keys**, and confirm bulk deletion removes only unreferenced test keys while keeping keys bound to saved poems locked and protected.

