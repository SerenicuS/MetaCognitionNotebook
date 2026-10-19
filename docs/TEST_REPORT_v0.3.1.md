# v0.3.1 — The Thinking Desk: Implementation and Verification

> Historical implementation record. Original results/recommendations below apply to that pass, not current release acceptance. See the [documentation index](README.md) and [current system design](../SYSTEM_DESIGN.md). Source line labels are historical; file links open current files.

Date: 2026-10-18 (Asia/Shanghai)

Recommendation: **READY WITH WARNINGS** — automated checks pass; native interaction and visual QA remain unverified.

## Implemented behavior

New Philosophy documents have an empty Freeform Writing canvas with natural paragraphs and line breaks. The expanding, borderless editor uses the existing ivory/charcoal and gold theme tokens, serif writing typography, and a subtle two-button composition control. A document-scoped, dismissible introduction explains that reasoning roles are optional.

Structured Reasoning retains all six roles, classification editing, insertion, deletion, and movement. Role selectors show a concise contextual definition; an optional details panel explains all roles. Titles, work/chapter metadata, and epigraphs remain visible. No template text is inserted. This milestone adds no export workflow; the old Philosophy export control was removed. User-facing export remains planned for v0.7.0. Poetry, Lorebook, navigation, and global shell UI were not redesigned.

Both views edit the same ordered blocks and the same canonical body. Freeform hides structured controls and classifications; it does not merge existing blocks. A new multiline draft remains one prose block when first viewed in Structured Reasoning. Authors can add further blocks deliberately.

## Compatibility and storage

No SQLite migration is needed. All additional state uses existing metadata_json / JSON frontmatter:

- composition_mode records the view; missing mode means an existing document, which opens Structured Reasoning.
- philosophy_representation records whether an unchanged body originally used plain or legacy paragraph interpretation when switching views.
- philosophy_blocks records ordered classifications and UTF-16 text lengths after block edits. It contains no second copy of the prose. The existing Markdown marker convention remains in the canonical body.
- thinking_desk_intro_dismissed persists the introduction dismissal per document.

Opening a document does not save it. Switching views and dismissing the introduction retain the body byte-for-byte. Block edits update content and boundary metadata together. Length validation preserves multiline blocks, empty blocks, whitespace, literal classification comments, and Unicode. Unknown valid metadata properties, tags, and document identity remain intact. Legacy roles and order are retained in both views.

The shared 400ms autosave path now serializes overlapping writes and drains edits received during an in-flight save. Failed saves block document/studio navigation, creation, rename, and normal desktop exit. All close entry points share an idempotent save-before-exit coordinator. The previous unconditional timeout exit was removed.

## Files changed

| Files | Purpose |
| --- | --- |
| src/components/studios/PhilosophyStudio.tsx | Both writing views, responsive canvas, role guidance, introduction, accessible controls |
| src/utils/philosophy.ts (new) | Production metadata handling, mode selection, parsing and serialization |
| src/types/index.ts | Optional Philosophy composition and boundary metadata |
| src/components/common/CreateDocumentModal.tsx | Empty freeform creation instead of a forced argument template |
| src/services/api.ts | Matching creation defaults in browser MockStorage |
| src-tauri/src/commands.rs | Native empty-document creation default without migration |
| src/services/autosave.ts (new) | Production save drain and exit coordinators |
| src/App.tsx | Serialize flushes, preserve pending metadata, respect save failures, await saves on close |
| tests/v031_thinking_desk.test.ts (new) | Production parser/mode/save checks and actual Studio rendering assertions |
| tests/v030_regression_suites.test.ts | Version alignment and production shutdown checks replacing obsolete timeout-exit expectations |
| src-tauri/tests/thinking_desk.rs (new) | Temporary file-backed library restart, legacy compatibility and reindex tests |
| package.json, package-lock.json | v0.3.1, locked local tsx development dependency, include new test suite |
| src-tauri/Cargo.toml, src-tauri/tauri.conf.json, Cargo.lock | Aligned v0.3.1 application/package versions |
| README.md, SYSTEM_DESIGN.md | Actual behavior, storage contract, compatibility limits, corrected persistence description and roadmap |
| docs/TEST_REPORT_v0.3.1.md (new) | This implementation and verification report |

## Commands actually run

| Exact command | Final result |
| --- | --- |
| npm test | PASS: 55 tests, 11 suites, 0 failures, 0 skipped |
| cargo test --manifest-path src-tauri/Cargo.toml | PASS: 11 existing unit tests + 3 new integration tests; 0 failures; doc-tests also complete |
| npx tsc --noEmit | PASS: exit code 0, no diagnostics |
| npm run build | PASS: TypeScript and Vite production bundle, 1,621 modules transformed |
| git diff --check | PASS after removing trailing whitespace; Git emits line-ending conversion notices only |

The first sandboxed npm test attempt could not resolve registry.npmjs.org for the previously undeclared tsx runner. The authorized unrestricted retry passed. tsx was subsequently added to devDependencies and npm test now invokes the locked local runner; the final run passed inside the sandbox.

The first sandboxed Rust run failed on temporary-file rename access restrictions. An authorized unrestricted run passed, including the final expanded suite. These failures were not counted as passes.

Tests use MockStorage or isolated temporary directories and temporary SQLite databases. No test opened, reset, deleted, or reindexed the user's real document library. Rust restart checks drop and reopen a file-backed database and storage manager, then reindex; they are not a claim that the native GUI was launched or restarted.

Existing autosave tests exercise debounce behavior. New tests exercise the actual production save/exit coordinators, including concurrent flushes, edits and mode changes during writes, failed saves, retry, slow close, and duplicate close requests. Actual Studio markup is server-rendered for freeform/legacy initial states; these checks do not exercise browser focus, textarea sizing, or native events.

## Known limitations

- Existing multi-block documents remain separate writing areas in Freeform. There is no automatic merging, splitting, or inferred argument template.
- The first edit of legacy blocks normalizes inter-block separators to two newlines. Opening or switching views leaves the original bytes unchanged. Recognized legacy marker spelling is serialized canonically after block edits.
- Earlier app versions ignore boundary metadata and may split multiline blocks if used to edit v0.3.1 documents. Forward loading of legacy files is supported; editing new documents in older versions is not guaranteed to retain boundaries.
- External changes that invalidate text lengths fall back to legacy paragraph parsing. Raw content remains readable, but inferred block boundaries or roles can differ. Preserve frontmatter with the body.
- Failed normal saves leave writing in the current window for retry. A permanently stalled write keeps the window open. Forced termination or power loss cannot guarantee persistence of edits still within the debounce interval. The browser preview is volatile in-memory storage.
- Native GUI, WebView2 sizing, focus/caret behavior, IME input, dark/light visual contrast, title-bar close, Alt+F4 and actual process shutdown were not manually verified. Both in-app browser attempts to reach the development preview (127.0.0.1 and localhost) timed out. No desktop executable or installer build was run for this milestone.

## Manual testing checklist (not yet performed)

Use a disposable Windows account or VM with a temporary library. Do not replace or clear the normal user's library.

- [ ] Create a Philosophy document: Freeform is selected, the body is empty, and typing can begin without choosing a role.
- [ ] Enter paragraphs, blank lines, indentation, long wrapped lines, Unicode/IME text and a literal classification comment; verify caret stability, expanding height and scrolling.
- [ ] Dismiss the introduction, switch documents, restart, and confirm that it stays dismissed.
- [ ] Switch repeatedly between modes before autosave completes; verify there is one copy of the latest content after reopen/restart.
- [ ] In Structured Reasoning, create every role, classify, reorder, insert, delete, and clear the last block. Verify descriptions and keyboard access.
- [ ] Load copies of pre-v0.3.1 classified, unclassified and empty documents. Confirm initial Structured mode, roles, order, metadata, and unchanged files before editing.
- [ ] Edit an existing classified document in Freeform; return to Structured and verify original roles and order.
- [ ] Type and immediately close using title-bar X, Alt+F4, Ctrl+Q and Settings Exit, separately. Reopen and verify the final keystrokes and mode. Confirm the process exits normally after saving.
- [ ] Simulate an unavailable write destination in the disposable profile. Confirm save error feedback, navigation/close protection and successful retry after restoring access.
- [ ] Inspect both themes and the minimum desktop size, including the mode control, contextual descriptions, role reference and multiline writing areas.

No Git commit, push, tag, or GitHub Release was created.
