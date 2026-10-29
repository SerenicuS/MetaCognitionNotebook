# v0.8.0-beta.4 acceptance remediation

The starting working tree was clean. Commit `78339833566c04caa2ab09337f09ce4ce7a6a029` (`0.8.0-beta.4`) checkpointed the completed feature work. No version change, commit, push, tag, release, or promotion was performed.

| Finding | Root cause | Implemented behavior |
| --- | --- | --- |
| 1. Open source Chronicle | The action only updated continuity and milestone state. It did not bring the already-rendered Chronicle into view or move focus, so same-milestone clicks had no visible effect. Invalid sources failed silently. | Resolve the source against the inspected milestone's ancestry, select its actual continuity and milestone, then scroll and focus the rendered Chronicle after React updates. Repeated clicks refocus it. Missing, archived, foreign, unrelated, and inaccessible sources produce feedback without a write. |
| 2. Missing Book | `MilestoneNarrative` built Book options from compatible chapter candidates. Dashboard creation stores a canonical Book in `plan.books`, independently of chapters, so a new empty Book was excluded. | Derive options from canonical Book IDs, Universe/House ownership and existing continuity rules. Empty Books are selectable and explain the chapter requirement. Parent plan updates refresh options immediately. Removed/archived selections clear safely. A fresh document read is revalidated against the latest plan before saving, including a Book archived during that read. |
| 3. Missing status label | The state editor/resolver used a label table while publication printed the stored value. This was a display mismatch: the canonical enum contains one `missing` value, not two separately stored meanings. | Share `resources/status-labels.json` between TypeScript and Rust. Display `Unaccounted for / Missing` consistently for the legacy preset. Preserve the enum and authored custom values. |
| 4. Initial state called a transition | Publication replaced null previous values with `unassigned` and always rendered a before/after sentence. | Resolve earlier assignments through the full canonical/alternate ancestry, including earlier milestones omitted from publication selection. Use `Initial recorded status: ...` only when supported; retain known transitions, explicit absence and unknown states. Invalid/unknown ancestry gets cautious recorded-value wording. Markdown and both PDF renderers consume the same presentation semantics. |
| 5. Explicit Override | The provenance badge exposed engine terminology. | Show `Recorded at this milestone`; update the corresponding filter label. Keep engine origin `explicit` and inherited provenance unchanged. Existing contextual copy states that records do not establish causation. |
| 6. Echo factory instructions | Echo rendered the raw canonical body; publication had its own exact factory-template suppression. | Share exact template text and original-heading rules in `resources/lore-template-prose.json`. Echo suppresses untouched instructions in its display projection, preserves edited/authored prose, and retains raw canonical Markdown. Legacy artifact templates and the new item label are recognized. |
| 7. Cramped Echo sections | The narrow card used a single horizontal flex row whose labels could shrink and overflow. Position clamping also assumed a wider viewport. | Use a two-column section-button grid with native keyboard navigation, visible focus and `aria-pressed`. Keep the preview area height stable between sections. Clamp width, position and height to the viewport and update them on resize. |
| 8. Relationship Why? | The canonical `description` field, graph details and publication support already existed, but the entity relationship form did not expose the field. | Add a labeled optional multiline creation field and an explicit save/cancel editor for existing explanations. Update the original relationship UUID with a queued mutation and reject stale explanation edits. Preserve each explanation within aggregate graph details, with multiline display. Existing publication selection/privacy rules include approved current explanations and omit undated explanations from historical views. |
| 9. Restrictive artifact category | Reader-facing labels and examples emphasized relics, despite the existing optional free-text `artifact_fields.artifact_type` field. | Use Items & Artifacts / Item / Artifact terminology in category navigation, creation, editor, graph, Echo and publication. Add classification suggestions plus unrestricted custom text using the existing field. Ordinary objects require no rarity, powers or significance. Separate authored relationship labels are available for legal ownership, possession, origin and storage location. |

Compatibility decisions:

- Canonical Markdown with JSON frontmatter, SQLite's derived-index role, stable UUIDs, House/Universe scoping and queued saves remain unchanged.
- Canonical entity type `artifact`, metadata field `artifact_fields.artifact_type`, relationship `description`, chapter `milestone_id`, and status `missing` remain unchanged. No canonical files are renamed and no data migration runs.
- The optional `assignment_kind` field belongs only to the derived publication projection. Older publication projections remain readable; it is never added to canonical planning records or Portable Universe payloads.
- Book references still derive from chapter-owned milestone bindings. Selecting an empty Book does not invent a Book-only milestone binding or duplicate a Book.
- No pairwise relationships are generated for groups. Existing Event entities and authored Chronicle accounts remain the shared-event mechanism.
- Legacy Owner / Bearer relationship semantics are retained. New explicit labels such as `Legally owned by`, `Held by`, `Originated in`, and `Stored at` allow distinct authored facts without reinterpreting old records or inferring facts from prose.
- Separating “unaccounted for” and “missing” into distinct canonical meanings would require a future schema/design decision; this pass intentionally does not do that.

Final verification:

| Check | Result |
| --- | --- |
| `npm test` | 666 passed, 0 failed, 0 skipped; 46 suites. |
| `cargo test --workspace` | 202 passed, 0 failed, 0 ignored: 189 library tests, 3 Thinking Desk integration tests, 10 Workshop integration tests; binary/doc targets contain 0 tests. |
| `npm run build` | Passed: TypeScript and Vite production build. Vite reports the large-chunk warning. |
| `git diff --check` | Passed. Git reports LF/CRLF normalization notices on some Windows working-copy files. |
| Browser React harness | Five scenarios pass: inherited/repeated Chronicle navigation; alternate-source navigation; live empty/new Book options, chapter binding and stale archive race; multiline relationship save/reload; Echo suppression and four section buttons. |
| Responsive Echo | Checked at 320×700 and 1280×800, including live resizing. All four section buttons remain visible without horizontal overflow; the card stays inside the viewport. Tab focuses the next section and Enter activates it. Card height remained unchanged across activation. |
| Portable Universe v1 | Added disk-backed export/import/reload coverage under both Preserve and Separate Copy policies for ordinary-item classification, multiline explanations and legacy `missing`. Source bytes remain unchanged. Existing archive, recovery and Vault suites pass. |

Initial sandbox runs encountered Windows temporary-file rename/socket permission failures. Required tests succeeded after permitted reruns outside the sandbox. No required command remains unrun.

The browser harness uses real React components and native DOM events with disposable in-memory data and mocked document I/O. It verifies the callback/render/focus path, but does not replace a packaged Tauri Windows acceptance session or a screen-reader session. Run it with `npm run dev`, then open `/tests/browser/acceptance.html`. Its data never touches the active notebook.

Changed files:

- Shared presentation data: `resources/status-labels.json`, `resources/lore-template-prose.json`.
- Navigation and Book linkage: `src/utils/chronicleNavigation.ts`, `src/utils/narrativeContext.ts`, `src/components/studios/lorebook/UniverseStateExplorer.tsx`, `src/components/studios/lorebook/MilestoneNarrative.tsx`.
- Status and publication: `src/utils/stateEngine.ts`, `src/utils/statusPresentation.ts`, `src/utils/lorebookPdf.ts`, `src/services/publication.ts`, `src/components/studios/lorebook/CharacterProfileFields.tsx`, `src-tauri/src/publication/models.rs`, `src-tauri/src/publication/generator.rs`, `src-tauri/src/publication/pdf.rs`.
- Echo: `src/utils/loreTemplateProse.ts`, `src/utils/echoLore.ts`, `src/components/echo/types.ts`, `src/components/echo/EchoDocumentationPopup.tsx`.
- Relationship explanations: `src/utils/relationships.ts`, `src/components/studios/lorebook/RelationshipExplanation.tsx`, `src/components/studios/lorebook/EntityRelationshipsCard.tsx`, `src/components/studios/lorebook/RelationshipGraph.tsx`.
- Item terminology and classification: `src/utils/universe.ts`, `src/components/common/CreateDocumentModal.tsx`, `src/components/studios/LorebookStudio.tsx`, `src/components/studios/lorebook/EntityGuidedFields.tsx`, plus the graph, Echo and publication files above.
- Regression coverage: `tests/acceptance_remediation.test.ts`, `tests/browser/acceptance.html`, `tests/browser/acceptance.tsx`, `tests/narrative_context.test.ts`, `src-tauri/src/publication/tests.rs`, `src-tauri/src/portable/tests_l2b.rs`, `package.json`.
- This report: `docs/acceptance-remediation-beta4.md`. Generated test/build logs are under `scratch/acceptance-*` and are not application source.

Manual Windows retest checklist:

1. In an existing notebook, inspect a later milestone with inherited status. Click Open source Chronicle from low in the matrix. Confirm the actual source title, visible panel, keyboard focus, correct Universe and continuity. Repeat while already at the source, then repeat across alternate and nested histories. Confirm archived/deleted sources do not navigate or alter data.
2. Create a zero-chapter Book on the Dashboard. Return to Web of Thought without restarting, select it in the Chronicle linker, and confirm the empty-Book guidance. Open it, create a chapter, return and link the chapter. Confirm the original Book UUID is reused. Archive the Book and confirm stale selections clear; check a foreign House/Universe remains absent.
3. Assign `missing` as the first recorded character state. Inspect the editor/explorer and publish Markdown and PDF. Confirm `Unaccounted for / Missing` and initial-assignment wording. Add a genuine later transition and verify its known before/after values. Repeat with explicit Unknown, Not Yet Introduced and alternate inheritance.
4. Compare a local assignment with an inherited one. Confirm `Recorded at this milestone`, source attribution, and the contextual causation clarification.
5. Open Echo for an untouched factory entry and for a partially edited entry. Confirm instructions disappear, authored paragraphs remain, and the source Markdown is unchanged. Try all four sections at narrow and wide window sizes, resize while open, and navigate with Tab/Shift+Tab and Enter/Space.
6. Create two different relationships between the same entities, each with a multiline explanation. Edit one, save, close/reopen and restart. Confirm both explanations remain separate in expanded graph details and approved Markdown/PDF output. Check historical and privacy/spoiler-filtered exports for omissions.
7. Create an everyday item and a device through Item / Artifact. Select a suggested classification, enter a custom one, then leave another blank. Save/reopen and verify search, graph, Echo and publication discoverability. Confirm a legacy artifact retains its UUID, path and fields. Author ownership, possession, origin and location separately without relying on prose inference.
8. Export/import a `.mcuniverse` with these records using both identity policies; verify statuses, Book/chapter references, explanations, classifications and alternate history after restart. Perform the normal Vault backup/recovery smoke test on a disposable notebook.

Remaining limitations are the deliberate compatibility boundaries above: no independent empty-Book milestone reference, no split missing/unaccounted enum, no new group-event schema, and no dated history invented for undated relationship descriptions. Packaged Windows and assistive-technology retesting remains manual.
