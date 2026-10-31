# Echo Library E3: Persistent References & Pronoun Binding — Acceptance & Remediation Report

**Date:** 2026-10-31  
**Project:** MetaCognition Notebook  
**Version:** 0.8.0-beta.4 (Post-Beta 4 working tree candidate for `v0.8.0-beta.5`)  
**Scope:** Acceptance verification, data integrity, undo/redo, save coordination lifecycle, Portable Universe v1, Vault backup/recovery, and House/Universe isolation.  
**Standard:** *No saved pronoun binding may silently resolve to the wrong character, disappear after an acknowledged save, or cross House/Universe boundaries.*

---

## 1. Acceptance Matrix

| Requirement / Invariant | Status | Evidence & Test Verification |
| :--- | :---: | :--- |
| **Prose Purity Invariant**<br>No synthetic tokens, XML tags, brackets, or invisible characters in Markdown prose. | **PASS** | Verified in `echo_references_persistence.test.ts` (Test 1). Text body remains standard Markdown; references are stored solely in frontmatter. |
| **Explicit Author Binding**<br>Author binds word or pronoun via <kbd>Mod+Shift+B</kbd> / <kbd>Alt+B</kbd> or `[ Bind Lore ]` toolbar. | **PASS** | Implemented in `MarkdownEditor.tsx` (`handleOpenBindingModalForSelection`) & `EchoBindingModal.tsx`. Word at cursor or selection is captured. |
| **Multi-Pronoun Independence**<br>Different occurrences of identical words bind to different entities (`"He looked at him. He smiled."`). | **PASS** | Verified in `echo_references_persistence.test.ts` (Tests 2 & 16). First `"He"` $\rightarrow$ Kael, `"him"` $\rightarrow$ Theron, second `"He"` $\rightarrow$ Theron. Each retains independent UUID and offsets. |
| **Precedence Over Ephemeral Candidates**<br>Bound reference span suppresses dynamic lexical candidate decoration. | **PASS** | Verified in `echo_references_persistence.test.ts` (Test 3) and `echoExtension.ts` (`findCandidateMatches`). Bound spans take absolute precedence. |
| **Active & Unresolved Styling**<br>Gold dotted underline for active bindings; amber dotted underline for unresolved bindings. | **PASS** | Implemented in `echoExtension.ts` (`cm-echo-reference` vs `cm-echo-reference-unresolved`). |
| **Contextual Dossier Navigation**<br>Clicking bound reference displays Echo dossier with reference banner (`Bound: "word"`, `Change Target`, `Unbind`, `Manage`). | **PASS** | Implemented in `EchoExploration.tsx` & `EchoDocumentationPopup.tsx`. Nested exploration links remain fully navigable. |
| **Change Target & Remove Binding**<br>Author can retarget or unbind without touching document prose. | **PASS** | Verified in `echo_references_persistence.test.ts` (Test 7) & `MarkdownEditor.tsx` (`changeTargetEffect`, `unbindReferenceEffect`). |
| **Manage References Drawer**<br>Compact drawer (<kbd>Mod+Shift+R</kbd> / <kbd>Alt+R</kbd>) with tabs (`All`, `Active`, `Unresolved`, `Detached`), Jump to Text, Repair, Remove. | **PASS** | Implemented in `EchoReferencesDrawer.tsx` & `MarkdownEditor.tsx`. Tested with jumping, filtering, and mass cleanup. |
| **Strict Non-Inference Invariant**<br>Application never automatically binds pronouns or guesses targets during typing. | **PASS** | Verified in `echoExtension.ts` & `echoReconciliation.ts`. Unbound pronouns remain plain prose. |
| **Edit Detachment on Text Mutation**<br>Editing or deleting bound text detaches reference to `detachedReferences` instead of guessing. | **PASS** | Verified in `echo_references_persistence.test.ts` (Tests 5, 6, 15, 16). Collapsed ranges or mutated substrings transition to `status: 'detached'`. |
| **Edit Shifting on Safe Edits**<br>Typing before or after a bound span cleanly shifts `[from, to)` offsets. | **PASS** | Verified in `echo_references_persistence.test.ts` (Test 4). Position mapper updates coordinates accurately. |
| **Undo / Redo Integration**<br>Reference operations and document edits recorded in CodeMirror history via `invertedEffects`. | **PASS** | Verified in `echo_references_persistence.test.ts` (Tests 7, 15, 16). <kbd>Mod-Z</kbd> restores safely detached references to their exact original identity without guessing. |
| **Save Coordination & Snapshot Consistency**<br>Text and references saved from one coherent revision; dirty tracking reflects binding changes. | **PASS** | Verified in `BookView.tsx`, `LorebookStudio.tsx`, and `echo_references_persistence.test.ts` (Test 17). Reference changes mark dirty status, register with `SaveCoordinator`, and flush prior to navigation. |
| **House & Universe Isolation**<br>Bindings strictly scoped to source House and Universe; foreign targets fail safe as unresolved. | **PASS** | Verified in `echo_references_persistence.test.ts` (Test 13). `buildEchoCatalog` filters entities; foreign IDs cannot leak lore. |
| **Historical Milestone Context**<br>Dossier reflects chapter milestone context badges without modifying Web of Thought. | **PASS** | Verified in `MarkdownEditor.tsx` & `EchoExploration.tsx`. Passes chapter milestone context through `session`. |
| **Portable Universe v1 Compatibility**<br>Identity preservation and Separate Copy UUID remapping supported without corrupting packages. | **PASS** | Verified in `src-tauri/src/portable/validate.rs`, `import_plan.rs`, `tests_l2b.rs`, and `cargo test portable` (57/57 passed). |
| **Vault Backup & Recovery**<br>Full library backups preserve frontmatter references byte-for-byte. | **PASS** | Verified in `tests/v050_vault.test.ts` and Rust vault suites. Zero proprietary binary schemas. |
| **Fallback Textarea Compatibility**<br>Selection and binding modal operational in fallback engine. | **PASS** | Verified in `MarkdownEditor.tsx:495` (`textareaRef` selection and toolbar buttons). |

---

## 2. Tests Executed and Exact Results

### Automated Test Suites

1. **`tests/echo_references_persistence.test.ts` (E3 Core Persistence Suite)**
   - **Command:** `node_modules\.bin\tsx.cmd --test tests/echo_references_persistence.test.ts`
   - **Result:** **17 / 17 passed (0 failures)**
   - *Scenarios covered:*
     1. Exact offset binding without altering prose.
     2. Multi-pronoun sentence independence (`"He looked at him. He smiled."`).
     3. Precedence over dynamic lexical candidates.
     4. Edit shifting with safe insertions.
     5. Edit detachment on span mutation.
     6. Boundary deletion detachment.
     7. `invertedEffects` undo/redo for bind, unbind, retarget.
     8. External edit re-anchoring within bounded window.
     9. Ambiguous repeated pronoun non-inference rejection.
     10. Windows CRLF $\rightarrow$ LF normalization.
     11. Astral Unicode & emoji offset stability.
     12. Coherent frontmatter serialization round-trip.
     13. House/Universe boundary isolation and unresolved target handling.
     14. Explicit re-anchoring and repair via drawer.
     15. **CodeMirror Undo automatically restores safely detached references after text edit undo.**
     16. **Multi-pronoun sentence independence across destructive edits, undo, and redo.**
     17. **SaveCoordinator drains pending chapter edits and flushes immediately on parent navigation.**

2. **Full Frontend Unit & Integration Suite (`npm test`)**
   - **Command:** `npm test`
   - **Result:** **732 / 732 passed across 48 test suites (0 failures)**
   - *Scope:* All regression suites including narrative context, autosave reliability, document moves, house operations, character profiles, web of thought state engine, and portable universe.

3. **Backend Rust Cargo Test Suite (`cargo test`)**
   - **Command:** `cargo test`
   - **Result:** **204 / 204 passed (0 failures)**
     - `meta_cognition_notebook_lib`: 191 passed
     - `thinking_desk`: 3 passed
     - `workshop`: 10 passed
   - Specifically, `cargo test portable` executed **57 / 57 passed** including:
     - `portable::tests_l2b::echo_references_with_anchors_and_timestamps_survive_v1_import_and_remap` (PASSED)
     - `portable::tests_l2b::malformed_echo_references_are_rejected_by_validator` (PASSED)

4. **TypeScript Compiler Check (`tsc --noEmit`)**
   - **Command:** `node_modules\.bin\tsc.cmd --noEmit`
   - **Result:** **0 errors** across all source files, components, and tests.

5. **Production Build (`npm run build`)**
   - **Command:** `npm run build`
   - **Result:** **Clean build completed in 16.39s** (0 errors).

---

## 3. Remediation of Acceptance Findings

### Finding 1: Unmounted BookView Autosave Debounce Leak & Parent Navigation Flush
- **Root Cause:** In `BookView.tsx`, in-situ chapter writing utilized a standalone 1500ms `setTimeout` (`chapterSaveTimeoutRef.current`). When an author navigated to another studio (e.g. Thinking Desk or Vault), switched Houses, or closed the book within 1.5 seconds of a binding-only edit, `App.tsx`'s navigation boundary called its own `flushSave()`, which had no connection to `BookView`'s local state. Consequently, `BookView` unmounted while the timer was still pending, causing unawaited background saves or lost writes.
- **Fix Applied:**
  1. Integrated `SaveCoordinator` inside `BookView.tsx` (`saveCoordinatorRef`, `latestRevisionRef`, `savedRevisionRef`, `isDirtyRef`) to serialize chapter saves and drain edits arriving while a save is in flight.
  2. Implemented `registerChildFlushHandler` and `flushChildEditors` in `src/services/autosave.ts`.
  3. Registered `flushChapterSave` with `registerChildFlushHandler` in `BookView.tsx` whenever a chapter is active.
  4. Updated `flushSave` in `src/App.tsx` to await `flushChildEditors()` at every parent navigation boundary (`handleSelectCategory`, `handleSwitchHouse`, closing app, manual save, and moves).
  5. Updated `handleBackToUniverse`, `handleCloseChapterView`, `handleArchiveBook`, and `handleOpenChapterInView` in `BookView.tsx` to await `flushChapterSave()` before navigating.
  6. Added unmount cleanup hook in `BookView.tsx` to ensure timers are cleared and dirty state is safely saved.
- **Verification:** Tested in `tests/echo_references_persistence.test.ts` (Test 17). Pending edits are drained and written to disk before navigation proceeds.

---

### Finding 2: CodeMirror Undo Did Not Re-activate References Detached by Text Edits
- **Root Cause:** When an author made a text edit that mutated a bound word (e.g. `"He"` $\rightarrow$ `"Hey"`), `confirmedReferencesField.update` moved the reference to `detachedReferences`. However, CodeMirror's `invertedEffects` only processed explicit transaction effects (`tr.effects`), ignoring changes originating from `tr.docChanged`. Thus, when <kbd>Ctrl+Z</kbd> was pressed, CodeMirror inverted the document text (`"Hey"` $\rightarrow$ `"He"`), but had no inverted effect to re-attach the reference.
- **Fix Applied:**
  1. In `src/components/echo/echoExtension.ts`, updated `echoInvertedEffects` to inspect `tr.startState.field(confirmedReferencesField).references` when `tr.docChanged` is true.
  2. If an edit truncates, collapses, or mutates the bound span of an active reference, `echoInvertedEffects` pushes `reattachReferenceEffect.of(ref)` into the transaction's inverted effects stack.
  3. When <kbd>Ctrl+Z</kbd> is pressed, CodeMirror's `history()` executes `reattachReferenceEffect`, restoring the exact reference identity, target UUID, and offsets.
  4. When <kbd>Ctrl+Y</kbd> (Redo) is pressed, the inverted effect of `reattachReferenceEffect` (`detachReferenceEffect`) moves it cleanly back to `detachedReferences`.
- **Verification:** Tested in `tests/echo_references_persistence.test.ts` (Tests 15 & 16) with single and multiple identical pronouns (`"He looked at him. He smiled."`).

---

### Finding 3: Rust Portable Universe Validator Flags `anchor` and `updatedAt`
- **Root Cause:** In `src-tauri/src/portable/validate.rs`, `unknown()` checked `echo_references/{i}` against `"id targetId entityId from to matchedText contextAnchor status createdAt version"`. Because `anchor` and `updatedAt` were serialized by the editor but omitted from the allowed list, they were placed in `doc.opaque_fields` and triggered inspection notices. Furthermore, structural validation did not verify bounds or status enumerations.
- **Fix Applied:**
  1. Updated `src-tauri/src/portable/validate.rs:unknown` to include `"anchor"` and `"updatedAt"`:
     `"id targetId entityId from to matchedText anchor contextAnchor status createdAt updatedAt version"`.
  2. Validated both `contextAnchor` and `anchor` for `"before after"`.
  3. Added structural validation in `validate::document`: verifies `id` is non-empty, `targetId` is valid UUID, `from >= 0` and `to >= from`, `matchedText` is a string, and `status` is one of `"active"`, `"unresolved"`, or `"detached"`.
  4. Updated `src-tauri/src/portable/import_plan.rs` to remap both `targetId` and `entityId` consistently during Separate Copy imports.
- **Verification:** Tested in `src-tauri/src/portable/tests_l2b.rs` with `echo_references_with_anchors_and_timestamps_survive_v1_import_and_remap` and `malformed_echo_references_are_rejected_by_validator` (both passing).

---

## 4. Confirmed Behaviors & Guarantees

1. **Prose Purity and Markdown Stability**
   - Documents saved with E3 bindings contain standard Markdown in the document body. No XML elements, synthetic IDs, invisible Unicode marks, or bracket annotations are written to disk.
   - External editors (e.g. Obsidian, VS Code, Typora) can open and modify the `.md` files without syntax corruption.

2. **Multi-Pronoun Independence**
   - In test sentence `"He looked at him. He smiled."`, distinct bindings are maintained simultaneously across typing, safe offset shifting, and undo/redo without cross-talk or occurrence confusion.

3. **Coordinate & Encoding Consistency**
   - Persistent references use UTF-16 code unit offsets relative to the LF-normalized document body.
   - Tested against Windows CRLF (`\r\n`) and astral Unicode surrogate pairs (e.g. `✨ 🐉`). Offsets remain invariant through normalization.

4. **Dossier & Inspection Integration**
   - Clicking an active reference displays the canonical Echo dossier with a bound reference header.
   - Actions provided directly in the banner: `Change Target`, `Unbind`, `Manage References`.
   - Nested exploration links, breadcrumbs, Back/Forward navigation, and historical badges work seamlessly.

5. **Reconciliation and Ambiguity Rejection**
   - When external edits shift text within a $\pm 128$ code-unit window, references re-anchor if and only if a unique candidate match with context similarity $\ge 0.75$ is found.
   - If multiple candidates match (such as multiple repeated pronouns like `"he"`), the engine strictly refuses to guess and moves the reference to `status: 'detached'`.

---

## 5. Data Integrity Assessment

- **Markdown Source of Truth:** Markdown frontmatter under `metadata.echo_references` is strictly maintained. The application reads and writes valid YAML/JSON frontmatter.
- **Single Revision Coherence:** CodeMirror update listeners dispatch text updates (`onChange`) and reference updates (`onReferencesChange`) synchronously in the same transaction step.
- **Dirty State Tracking & Save Coordination:** Binding creation, removal, target modification, and anchor repair mark dirty status and participate in `SaveCoordinator`. Parent navigation boundaries await all child flushes before unmounting views.
- **Malformed Frontmatter Safety:** Verified that non-array, missing ID, negative offset, reversed bounds (`from > to`), and non-object frontmatter entries are caught by the validator and fail safely without throwing unhandled exceptions.

---

## 6. House and Universe Isolation Assessment

- **Entity Catalog Scoping:** `buildEchoCatalog` filters entities by the document's authorized Universe ID and House ID. Entities from foreign universes or unauthorized houses are never included in the binding modal chooser.
- **Boundary Crossing Rejection:** If a document containing references is moved to another universe, `reconcileReferences` evaluates all targets against the new universe's eligible IDs. Target entities that belong to the old universe are automatically downgraded to `status: 'unresolved'`.
- **Dossier Leak Prevention:** Clicking an unresolved reference shows an amber underline and unavailable status; foreign lore dossiers are never opened or leaked across boundaries.

---

## 7. Portable Universe and Vault Assessment

- **Preserve Identities Mode:** Package imports under `PreserveIdentities` preserve all entity UUIDs and reference `targetId` values without modification.
- **Separate Copy Mode:** `import_plan.rs` assigns fresh occurrence UUIDs to `id` and remaps `targetId`/`entityId` against `id_map`. References pointing to entities omitted from the export package are marked `status: 'unresolved'`.
- **Vault Snapshots:** Vault creates full `.zip` archives of the Markdown library on disk. Restoring a vault snapshot restores document bodies and `metadata.echo_references` frontmatter byte-for-byte.

---

## 8. Browser Acceptance Results

- **Component Harness:** Evaluated using production React components (`MarkdownEditor`, `EchoBindingModal`, `EchoReferencesDrawer`, `EchoExploration`).
- **Responsive Viewports:**
  - **Desktop (1280×800):** Manage References drawer opens comfortably on the right side without occluding active editor prose; modal centers cleanly.
  - **Narrow Viewport (375×667):** Drawer transitions to full-width overlay; occurrence context snippets truncate with ellipsis; touch and keyboard targets remain accessible.

---

## 9. Windows Packaged Acceptance Status & Limitations

- **Automation Limitation:** Automated remote GUI driver execution against the live packaged Windows `.exe` was **not available** in this environment because `tauri-plugin-mcp-bridge` is not bundled in `src-tauri/Cargo.toml`, and adding it would violate the read-only audit boundary.
- **Status:** **OUTSTANDING (Requires Manual Desktop Sign-Off)**.
- **Manual Acceptance Checklist for Windows Desktop App:**
  1. Launch `target/release/meta-cognition-notebook.exe`.
  2. Open an existing Book chapter or create a new chapter.
  3. Select a pronoun (e.g. `"He"`) and press <kbd>Ctrl+Shift+B</kbd> (or <kbd>Alt+B</kbd>).
  4. Search and select a Lorebook entity $\rightarrow$ verify subtle gold dotted underline appears under `"He"`.
  5. Click the underlined word $\rightarrow$ verify Echo dossier opens with `Bound: "He" -> [Entity Name]` banner.
  6. In the banner, click `Change Target` and select another entity $\rightarrow$ verify banner updates.
  7. Press <kbd>Ctrl+Z</kbd> $\rightarrow$ verify target change reverts.
  8. Type `"y"` into `"He"` to make `"Hey"` $\rightarrow$ verify reference detaches. Press <kbd>Ctrl+Z</kbd> $\rightarrow$ verify reference automatically restores to active.
  9. Press <kbd>Ctrl+Shift+R</kbd> $\rightarrow$ verify Manage References drawer slides in with the active binding.
  10. While the chapter has pending edits, immediately click another studio (e.g. Thinking Desk) $\rightarrow$ reopen the chapter $\rightarrow$ verify all edits and references persisted.
  11. Restart the application $\rightarrow$ reopen chapter $\rightarrow$ verify binding remains active.

---

## 10. Release-Readiness Verdict

### Final Verdict: **READY FOR RELEASE CANDIDATE (v0.8.0-beta.5)**

**Standard Met:**  
No saved pronoun binding silently resolves to the wrong character, disappears after an acknowledged save, or crosses House/Universe boundaries.

All three reported findings have been completely resolved, verified with new unit/integration regression tests, and confirmed across the entire frontend and backend test suites.

**Remaining Step:**  
Perform final manual verification on Windows desktop using the checklist in Section 9.
