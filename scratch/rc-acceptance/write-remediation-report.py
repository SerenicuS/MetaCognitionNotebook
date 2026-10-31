from pathlib import Path
import json
rows=[json.loads(line) for line in Path('scratch/rc-acceptance/remediation-discovery.jsonl').read_text(encoding='utf-8-sig').splitlines()]
inventory='\n'.join(f"| `{Path(row['file']).name}` | {row['tests']} | {row['suites']} |" for row in rows if 'file' in row)
# Windows paths also need to render as basename when this script runs on another host.
inventory=inventory.replace('D:\\Jetbrains_IDE_Projects\\rustrover\\MetaCognitionNotebook\\tests\\','')
report='''# v0.8.0 release-candidate acceptance — remediation results

Updated **2026-10-31 (Asia/Shanghai)** for **0.8.0-beta.4 — The Living Continuity**. Base commit `6a9d4c2`; evidence applies to the current dirty working tree, including implementation already present before this stabilization pass.

**Revised verdict: NO-GO for the final v0.8.0 release until isolated native Windows acceptance passes. RC-01 through RC-05 are remediated and automated regression verification passes.** Portable Universe's Poetry exclusion is an explicit supported-scope decision, rather than an outstanding implementation defect. The remaining release gate is actual packaged behavior, not a reproduced failure in the remediated cipher paths.

No application version declarations, canonical prose formats, House/Universe ownership rules or SQLite schemas were changed. No real notebook, release, commit, push, tag or v0.9.0 work was performed. Tests use generated files and temporary notebooks. The [initial audit snapshot](../scratch/rc-acceptance/initial-acceptance-report.txt) and its logs preserve the earlier failing evidence; they are superseded by this report's current results.

## 1. RC-01 through RC-05 remediation

| Finding | Result and permanent evidence |
| --- | --- |
| **RC-01 — saved scope restoration** | Returning from Whole Poem uses authoritative `per_stanza_backup`, including empty mapping sets, IDs and manifests. It no longer reconstructs saved local mappings from the unified dictionary. Repeated JSON save/reopen cycles and the actual encoded Whole Poem save shape restore `love → ember / silence / home`. First-time transitions still clone global rules when there is no authoritative backup, including when the UI initialized empty stanza entries. All pass |
| **RC-02 — silent recovery-metadata loss** | TS and Rust preserve/validate the optional `recovery_version: 1` extension: `whole_poem_backup`, `per_stanza_backup`, `unresolved_stanzas`, `stanza_snapshot`. Legacy unversioned versions of these known fields are accepted and labelled version 1 by key validation; unsupported versions or unsupported/malformed recovery-record fields are explicitly rejected. Manual key save/export, encoded/decoded package import and new-poem save carry the extension. Reassignment retains conflicting alternatives rather than clearing all unresolved rules. Actual TS → disk → Rust → disk → TS verification passes |
| **RC-03 — identity drift** | Removed equal-count and proximity fallback. Explicit coordinated editor IDs or an exact saved ordered-text snapshot supply identity evidence; otherwise only unique content fingerprints match. Duplicate refrains, reorder+edit, same-count insert/delete and external split/merge retain uncertain entries as unresolved with fresh unmapped target IDs. No positional reassignment overrides contradictory content. Snapshot reopen, safe structural operations and duplicate-ID evidence tests pass |
| **RC-04 — unsafe merge** | `mergeStanzaEntries` returns a proposal with `entries`, `unresolved`, `conflicts`, `merged`. Conflicts leave the original entries unchanged and recoverable. Every conflicting word needs an explicit valid choice before a merged dictionary is authoritative. Resolved and non-conflicting merges retain both source entries as recovery records. Cancellation and incomplete-choice tests pass. No split/merge UI or drag-and-drop support is claimed |
| **RC-05 — algorithm metadata** | `.mccipher` preserves algorithm 2.0 through file serialization, validation and import, independently of its version-1 envelope. Contradictory package/key algorithm labels are rejected explicitly. Missing per-stanza key algorithms default to 2.0 in both TS and Rust; legacy whole-poem v1 defaults to 1.0. Legacy/v2 decoding and round trips pass |

Scope and identity changes are integrated into the actual Poetry/Cipher save/import paths. Poetry Studio reopens metadata with unresolved records intact and uses known editor order for add/delete/up/down operations. A blank-line structural change inside a textarea lacks one-to-one identity evidence and reconciles conservatively. Revert matches UUIDs, not index proximity. Per-stanza key creation retains individual manifests and fingerprints. These are code/backend/editor-model results; the packaged UI journey remains unverified.

## 2. Package responsibilities and Portable Universe scope

| Format | Supported responsibility and verified limit |
| --- | --- |
| `.mcpoem` | Envelope version 1 retains the supported poem editing metadata, including version-2 cipher metadata, stanza IDs, both backups and unresolved records. TS disk export/import compares complete cipher metadata. Unsupported recovery metadata is validated/rejected rather than silently coerced. This is the complete supported poem-editing transfer format |
| `.mckey` | Portable decoding key, legacy key version 1 or per-stanza key version 2. The optional recovery-version-1 extension carries **cipher** editing recovery, not the entire poem's form/tags/document/House state. Active mapping data and all supported extension fields survive the real TS/Rust file bridge |
| `.mccipher` | Version-1 envelope containing encoded text plus the exact key (algorithm 1.0/2.0) and its supported recovery extension. Imported encoded and decoded documents retain that extension. Three independent stanza mappings decode correctly. This does not replace a complete poem or notebook backup |
| `.mcuniverse` | Existing format-1 **Lorebook/Universe** archive: supported entities, Books, selected Chapters, historical planning/relationships, archives and referenced assets. **Poetry and Philosophy documents are excluded even when they carry a Universe ID.** Scope was not expanded |
| `.mcbackup` | Vault whole-notebook backup/recovery, including Poetry, other studios, cipher keys, complete supported metadata, Houses/Universes, planning and recovery state. Exact poem/catalog bytes and full cipher recovery metadata survive a real separate restore |

**Portable Universe decision (former RC-07): closed by explicit scope clarification.** A fresh real-export test creates a Poetry document with the exported Universe ID and verifies its absence from the package inventory. Preserve Identities, Separate Copy UUID remapping, historical relationship changes and E3 anchors/targets retain their existing real Rust integration coverage. No Portable implementation was expanded in this pass. Poetry-inclusive Universe portability would require a separately scoped enhancement and acceptance contract; Vault remains the whole-notebook mechanism.

The in-app export disclosure and manual now distinguish key/cipher packages from complete poem editing state. Unsupported future recovery versions are rejected before a successful import/export. No blanket forward-compatibility or universal lossless-decoding claim is made.

## 3. Files changed in this stabilization pass

Production and runner changes:

- [emotionalCipher.ts](../src/utils/emotionalCipher.ts): scope restoration, recovery validation/transport, evidence-based reconciliation, safe merge proposals, recovery reassignment and algorithm checks.
- [EmotionalCipherModal.tsx](../src/components/studios/EmotionalCipherModal.tsx): hydrate/reopen complete state, retain recovery on key/package/document save and import, preserve per-stanza manifests, UUID-only revert and conflict-safe recovery reassignment.
- [PoetryStudio.tsx](../src/components/studios/PoetryStudio.tsx): reconcile reopened metadata and serialize known editor identity evidence without prose markers.
- [cipher.rs](../src-tauri/src/cipher.rs): typed optional recovery extension, validation and rejection of unsupported recovery records, legacy algorithm defaults; existing test constructors updated for optional fields.
- [package.json](../package.json): add the permanent Poetry integrity suite to the explicit test command. Its application version remains `0.8.0-beta.4`.

Permanent tests: [Poetry integrity](../tests/poetry_release_integrity.test.ts), [existing stanza suite](../tests/poetry_per_stanza_cipher.test.ts), [Rust integration](../src-tauri/tests/poetry_release_integrity.rs), [TS/Rust file bridge](../tests/fixtures/cipher-package-bridge.ts).

Documentation: README, SYSTEM_DESIGN, ROADMAP, in-app manual, Living States acceptance report, this report, documentation index and checker. The restored checker also exposed machine-specific/broken links in the E3, Living States, Poetry architecture and Lorebook navigation audits; those references were repaired or labelled as historical unbundled evidence. No link checks were disabled. Existing unrelated dirty source changes were preserved.

## 4. Permanent regression coverage

The new frontend file contains **27 counted tests**. It promotes all 11 original disposable boundary probes without removing their assertions and adds coverage for repeated restart-shaped scope cycles, empty mappings, saved encoded text, explicit conflict choices, duplicate refrains with/without identity evidence, reorder+edit, same-count insert/delete, split/merge ambiguity, repeated saved snapshots, duplicate/contradictory IDs, cancelled/resolved and non-conflicting merges, malformed/future recovery records, legacy/v2 algorithms and conflict-safe reassignment.

The existing stanza suite retains **23 counted tests**. Its in-editor edit and duplicate-refrain cases now supply explicit stable-ID evidence instead of implicitly treating position as identity; their mapping/UUID assertions remain. New tests separately prove that the same text-only ambiguous cases detach safely. Editor evidence is not synthesized during an unknown external reorder.

The new Rust integration target contains **7 tests**:

1. TS writes real `.mckey`/`.mcpoem` files; Rust imports, saves and exports the key; TS reads it back, compares active and recovery fields, writes/reads `.mccipher`, and verifies exact decoded text and complete `.mcpoem` metadata.
2. Legacy v1 import and actual export preserve algorithm 1.0 and mappings.
3. Real `.mcbackup` creation/separate restore preserves canonical Poetry/catalog bytes and full cipher metadata.
4. Known unversioned recovery fields survive real key import and gain explicit recovery version 1.
5. Real Portable Universe export excludes a Poetry document with matching Universe metadata.
6. Unsupported/malformed recovery metadata fails import; no dictionary is created.
7. A per-stanza key without an algorithm label defaults to 2.0.

The Rust target is discovered normally by Cargo; the TS file is explicitly registered in `npm test`. The bridge is a fixture helper, not an extra counted test. No permanent test depends on scratch-generated files. The original disposable TypeScript probes were also rerun unchanged: **11/11 pass**; the formerly failing Rust recovery-field assertion is promoted into the permanent target and now passes with assertions for all three recovery fields.

## 5. Real round trips and durability evidence

The TS/Rust bridge uses a newly generated directory under `tempfile`. Node/tsx is invoked locally by the Rust test to write the input and verify the returned output; the test fails if either side fails. It compares stanza entries (including manifests), algorithm/scope and each supported recovery field, rather than merely counting mappings or JSON-stringifying an object in memory. Rust still has no `.mccipher` or `.mcpoem` decoder: those formats are validated in TypeScript, and Rust handles key files/canonical storage/Vault. No Rust decoder coverage is implied where none exists.

All original Rust Vault/Notebook/Portable tests still pass, including staged restore failure/retry, interrupted operations, concurrent external changes, UUID/House isolation, exact body/frontmatter preservation, stale revisions, E3 target remapping and historical relationship-change remapping. The added Vault probe's catalog is minimal; native inspection of populated restored historical dossiers remains a required acceptance step. Injected failures are backend recovery evidence, not a power-loss or desktop-interaction certification.

## 6. Actual discovery, counts and exit codes

Current frontend discovery: **56 files, 812 tests, 48 Node suites, 297 top-level entries**. All tests pass, with no skips, cancellations or todos. The explicit package list exactly matches test files on disk; the checker also rejects duplicate/missing inventory entries. A final event-reporter execution of the exact package test list confirms each originating file: [discovery records](../scratch/rc-acceptance/remediation-discovery.jsonl).

Count reconciliation: the earlier 762 total preceded Poetry's **22 children plus parent = 23 counted tests**, yielding 785. This remediation adds **27 tests**, yielding **812**. Parent `test(...)` wrappers are counted as tests, not Node suites; the suite total remains 48. E3 contributes 18 (17 children plus parent); Living States contributes 30 (29 children plus parent). The new Rust target raises **206 to 213** (193 library + 7 Poetry integration + 3 thinking_desk + 10 workshop; binary/doc targets have zero tests).

| Final verification | Exit | Actual result / evidence |
| --- | ---: | --- |
| Focused Poetry suites (stanza, release-integrity, legacy cipher) | 0 | **110/110**; [log](../scratch/rc-acceptance/remediation-poetry-final.log) |
| Complete frontend list with per-file event reporter | 0 | **812/812**, 56 files, 48 suites; [records](../scratch/rc-acceptance/remediation-discovery.jsonl) |
| Exact `npm test`, frozen implementation | NPM_EXIT | NPM_RESULT; [log](../scratch/rc-acceptance/remediation-npm-final.log) |
| `cargo test --workspace --no-fail-fast` | 0 | **213/213**; [log](../scratch/rc-acceptance/remediation-rust-final.log) |
| `npx tsc --noEmit` | 0 | No diagnostics; [log](../scratch/rc-acceptance/remediation-typecheck-final.log) |
| `npm run build` | 0 | Production Vite build succeeds; chunk-size advisory remains; [log](../scratch/rc-acceptance/remediation-build-final.log) |
| `cargo clippy --workspace --all-targets` | 0 | Completes with **17 source lint warnings**; [log](../scratch/rc-acceptance/remediation-clippy-final.log) |
| Strict Clippy, `-- -D warnings` | 101 | Same 17 existing lint diagnostics promoted to errors; [log](../scratch/rc-acceptance/remediation-clippy-strict.log) |
| Documentation checker | DOC_EXIT | DOC_RESULT; [log](../scratch/rc-acceptance/remediation-docs-final.log) |
| Original disposable TS release-invariant probes | 0 | **11/11**; [log](../scratch/rc-acceptance/remediation-probes-final.log) |

Strict Clippy is not reported as green: the existing diagnostics concern argument count, boolean/character comparisons, collapsible conditions, `map_or`, single-character `push_str`, and `PdfGenerator::Default`. Default Clippy has no functional build failure and this pass introduces no new strict lint category. Cache hard-link warnings were environmental. Global `git diff --check` also sees pre-existing whitespace in unrelated Echo/types files; this pass did not modify those lines.

Every file below was observed passing in the final discovery run. Counts include parent tests where Node counts them; suite nodes are separate.

| Test file (under `tests/`) | Tests | Suites |
| --- | ---: | ---: |
INVENTORY

## 7. Documentation verification

README, SYSTEM_DESIGN, ROADMAP and the in-app manual now describe implemented cipher/E3 work separately from released features; beta.4 remains the latest released prerelease baseline and final v0.8.0 acceptance is pending. No beta.5 release was inferred from an engineering candidate or a commit message. The Living States report and documentation index refer to current counts, and distinguish frontend JSON/remapping simulations from actual backend ZIP/import tests.

The checker now validates **0.8.0-beta.4 in seven version locations**, including the human-readable Settings footer, correct milestone labels, local Markdown links/anchors, complete explicit test discovery, package commands and MIT license. Its old hardcoded 0.6.2 assertion was replaced; application version declarations were not changed. Repaired historical links remain checked. External URLs and native/manual interaction are explicitly outside this checker.

The supported-scope docs are deliberate: no explicit split/merge UI, drag-and-drop, structural metadata undo or Poetry-inclusive Universe packaging is claimed. `.mcpoem`, optional key recovery extensions, package algorithm/envelope versions, and Vault responsibilities are described separately.

## 8. Remaining native Windows acceptance (RC-06)

**Still open.** This remediation verified a production frontend build, not a rebuilt or exercised native installer. The initial audit built an NSIS installer successfully after a sandbox DNS failure; that artifact predates these production changes and cannot certify this tree. Signing, installation and actual packaged interactions remain unverified.

GUI automation is available (the initial audit's helper worked after a reset), but startup selects the current user's Documents notebook and persistent app-local activation data before the UI can select disposable data. No launch-time disposable-root override was found. No real notebook/activation configuration was read, redirected or modified here. Use a fresh Windows account or VM with disposable Documents and app-local directories. Record tester/date, OS/WebView2, version and fresh executable/installer SHA-256; keep screenshots and canonical-file comparisons.

Required acceptance sequence:

1. Rebuild NSIS from the remediated tree; install/launch in the isolated profile. Verify studios, help, resources, close/relaunch and restart behavior. A Vite build or old installer is insufficient.
2. Create two Houses and two Universes; add entities, relationships, branches, historical property changes and relationship modification/severance/restoration at three milestones. Link chapters to different milestones.
3. Bind repeated pronouns to canonical UUIDs (including after an emoji). Inspect each chapter's historical attributes/relationships; navigate three nested Echo targets, Back/Forward and breadcrumbs. Preserve original chapter context, editor focus and House/Universe isolation.
4. Edit inside/before bindings, undo/redo edits and bindings, immediately switch studio/House, save/close/reopen/restart. Compare canonical prose, reference IDs/offsets/status and catalog revisions; no synthetic prose markers may appear.
5. Create the three-stanza `love → ember / silence / home` poem. Save/reopen/restart; switch scopes, cancel conflicts without mutation, resolve explicitly, save Whole Poem, reopen and return to Per Stanza. Compare original IDs, independent mappings, empty mappings, both backups and unresolved records.
6. Exercise add/delete/up/down, blank-line split and text merge. Confirm uncertain identities retain recoverable rules. Test recovery reassignment with conflicts. Record available textarea undo/redo separately; do not assume structural/mapping undo or explicit split/merge controls exist.
7. Import/export `.mcpoem`, legacy/v2 `.mckey` and `.mccipher` into fresh disposable notebooks; compare metadata/algorithm labels and exact decode. Unsupported recovery versions must fail explicitly. Confirm complete editing state uses `.mcpoem`/Vault rather than claiming all poem state is in a key.
8. Exercise actual Portable Preserve and Separate Copy imports: verify historical state, E3 remapping, archives/assets and failure atomicity. Confirm Poetry is explicitly excluded, not silently counted as included.
9. Create a complete Vault backup, restore separately, activate/restart, inspect populated historical dossiers and Poetry recovery data, compare bytes, and verify restart rollback preserves the original generation.
10. Deny writes and terminate the disposable app during staged import/restore. Verify pending edits, error feedback, journals, retry/restart recovery and no partial publication claimed as complete.

## 9. Revised release decision

**RC-01–RC-05: remediated with permanent automated evidence. Former RC-07: resolved by the explicitly retained Lorebook/Universe scope. RC-06: pending.**

**NO-GO for final v0.8.0 publication until the isolated Windows acceptance sequence passes against a freshly packaged remediated build.** The working tree is ready for that native acceptance pass. Default Clippy and functional verification pass; the strict lint gate remains documented debt. No release, commit, tag, version bump or unrelated feature work is authorized or performed by these results.
'''
report=report.replace('INVENTORY',inventory)
Path('docs/v0.8.0-release-candidate-acceptance.md').write_text(report,encoding='utf-8')
# Current counts are explicit rather than keeping a historical report's stale passing totals.
p=Path('docs/living-entity-states-acceptance-report.md');s=p.read_text(encoding='utf-8');s=s.replace('Current release-blocker remediation discovery is recorded in', 'Current verification: **812 frontend tests across 48 suites and 213 Rust tests pass**. Release-blocker remediation discovery is recorded in');p.write_text(s,encoding='utf-8')
