# Universe overview and milestone narrative context — acceptance report

Date: 2026-10-28. Version remains `0.8.0-beta.4`. No commit, push, tag, release, or stable promotion was performed. Existing uncommitted work, including the previous relationship acceptance fixes, was preserved.

## 1. Architecture findings and reused canonical fields

The Web of Thought catalog is the existing canonical Markdown document with JSON frontmatter; SQLite indexes the saved documents. A Universe already owns `name` and optional `description`. A milestone already owns `title` and `description`, and existing per-entity `Change.note` fields hold author-written state explanations. Chapters already own stable `book_id` and optional `milestone_id` metadata.

The implementation reuses these fields. Overview premise and extended introduction are an editing presentation of the first paragraph and remaining paragraphs of `Universe.description`. Chronicle summary and extended account similarly share milestone `description`. There are no additional canonical summary, overview, consequence, chapter-list, or Book-link fields.

Chapter references are reverse lookups of existing `milestone_id` associations. The related Book is resolved from the chapter's stable `book_id`. A Universe milestone's `book_id` continues to describe timeline ownership; it is not repurposed as a related-Book field. No titles are used to match reference identities.

Portable v1 already serializes these descriptions and chapter metadata. Its import remapping already carries both descriptions and remaps chapter milestone IDs. No archive schema, importer, recovery machinery, or canonical model was changed.

## 2. Files changed in this enhancement

| File | Purpose |
| --- | --- |
| `src/utils/narrativeContext.ts` | Shared description presentation, safe narrative mutations, compatible chapter validation and reverse reference lookup. |
| `src/components/studios/lorebook/UniverseOverview.tsx` | Editable dashboard overview using existing Universe fields. |
| `src/components/studios/lorebook/MilestoneNarrative.tsx` | Chronicle viewing/editing and metadata-only chapter association controls. |
| `src/components/studios/lorebook/UniverseDashboard.tsx` | Prominent overview and timeline-to-chronicle navigation; reference callbacks. |
| `src/components/studios/lorebook/UniverseSelector.tsx` | Existing overview editing remains available; failed saves keep the form open. |
| `src/components/studios/lorebook/UniverseStateExplorer.tsx` | Chronicle before the state views and navigation to a state's recorded source chronicle. |
| `src/components/studios/lorebook/LorebookPublicationModal.tsx` | Explicit title-only chapter citation selection and author-entered excerpt passages; no fabricated excerpt text. |
| `src/services/publication.ts` | Matching reader-facing narrative reference model. |
| `src/utils/lorebookPdf.ts` | Introduction and canonical/alternate chronicle reference rendering, wrapping and glyph diagnostics. |
| `src-tauri/src/publication/models.rs` | Internal filtered chapter-source lookup and reader-facing narrative reference projection. |
| `src-tauri/src/publication/export.rs` | Filter selected chapter sources by House, Universe, Book, archive/draft state and compatible milestone binding. |
| `src-tauri/src/publication/generator.rs` | Selected manuscript citations, excerpt anchors, introduction headings, chronicle selection and spoiler filtering; regression tests. |
| `src-tauri/src/publication/pdf.rs` | Matching introduction, chronicle references and alternate state change output. |
| `src-tauri/src/publication/tests.rs` | Real-storage selection, privacy and spoiler regression. |
| `src-tauri/src/thought/tests.rs` | Canonical save/reload regression for multiline descriptions. |
| `src-tauri/src/portable/tests_l2b.rs` | Existing portable v1 export/import round-trip verification only. |
| `tests/narrative_context.test.ts` | Seven focused narrative/reference/state/PDF regressions. |
| `tests/fixtures/narrative-context.html` | Isolated browser acceptance entry point. |
| `tests/fixtures/narrative-context-browser.tsx` | Browser interaction checks with fictional fixture data and test persistence callbacks. |
| `package.json` | Register focused frontend tests; version unchanged. |
| `docs/ACCEPTANCE_NARRATIVE_CONTEXT_BETA4.md` | This report. |

Several files already contained uncommitted or untracked work before this request. This table identifies the files touched for this enhancement, not ownership of their complete contents.

## 3. Universe Dashboard

A prominent Universe Overview card appears before the overview counts and navigation cards. It presents the premise and extended introduction with preserved line breaks. Edit Overview is available after creation, including for empty Universes. Title, premise and introduction can be edited without recreating the Universe.

Empty overviews display “Every universe has a story. Start by describing yours.” That invitation is UI text only. Empty descriptions remain empty. Opening a dashboard or editor does not rewrite canonical files. The selector's existing overview editor remains compatible with the same single description field.

## 4. Milestone editor and viewer

The explorer presents a Chronicle panel before its existing state matrix, differences and continuity comparisons. The panel offers a short summary and collapsible historical account/aftermath editor, backed by the one existing milestone description. Empty narratives remain valid and show a neutral empty state.

The timeline offers Open Chronicle & World Changes. Recorded state provenance also offers Open source Chronicle, including earlier source milestones. Existing author-written state notes remain visible. Editing a chronicle does not modify state changes, unknown/not-introduced values, relationship history, comparison results, or ancestry.

Accounts may describe circumstances and consequences in ordinary authored text or headings. No cause of death or event-to-state causation is inferred. The panel explicitly distinguishes recorded changes from causal claims.

## 5. Book and Chapter navigation

A milestone lists compatible chapters whose canonical metadata points to its ID. Read the event in [Chapter] opens that document by stable ID; the adjacent Book action uses the existing Book navigation callback.

The author can choose a compatible Book and Chapter, attach an existing chapter, or unlink it. One chapter retains one historical milestone binding, as supported by the existing schema; multiple chapters can reference one milestone. Reassigning a chapter clearly states that its previous binding will be replaced. Written accounts and manuscript references can coexist or be absent independently.

Reference edits fetch the latest canonical chapter metadata, preserve unrelated metadata, and save with `isMetadataOnly: true` and no body/title/tag payload. Manuscript text is never copied into a milestone. Unlinking rechecks the latest binding and refuses to remove a different milestone's newer association.

Missing, archived, foreign-House, foreign-Universe and incompatible-continuity sources are excluded or rejected. Chapters use compatible Universe/branch milestones and the existing permitted divergence fallback. No new standalone Book-only association is created.

## 6. Markdown and PDF publications

The existing `PublicationDocument.universe_name` and `universe_description` carry the introduction. An authored introduction gains a Universe Introduction heading in Markdown and both PDF paths; an empty introduction adds no invented description. The frontend PDF also preserves the introduction when its decorative title page is disabled.

Existing historical/alternate milestone models retain the complete authored description and state changes. Their added reference projection contains reader-facing chapter/Book titles and a publication-local excerpt anchor, never canonical IDs.

Chapter citations are explicitly approved through the existing publication document allowlist. A title-only citation publishes no manuscript prose. If an author also selects and supplies a permitted excerpt, Markdown links the citation to that excerpt's internal anchor. PDF includes the same citation text. PDF clickable internal reference annotations are not introduced.

The excerpt selector now accepts an author-entered passage instead of automatically inserting “Selected excerpt passage”. Empty passages remain omitted. Unselected source titles and manuscript bodies are not automatically incorporated into chronicles. Publication remains opt-in through the existing introduction, timeline, branch and document selections.

## 7. Compatibility, privacy and timeline safety

No canonical schema or portable v1 format change was needed. There is no migration or bulk rewrite. Descriptions retain their existing string representation, catalog revisions and UUIDs remain authoritative, and normal save/indexing paths are reused.

Publication chapter source collection now applies archive/draft eligibility before collecting title information, and validates owning House, Universe, Book and milestone compatibility. Invalid or excluded sources do not fall back to publishing supplied excerpts with guessed source names.

Canonical spoiler cutoffs exclude future/unknown-bound chapter sources and future chronicles. Invalid cutoffs fail closed. Alternate chronicles are omitted with a warning when a canonical cutoff is active, because branch-local later narratives cannot safely be ordered against that cutoff. Branch and milestone allowlists apply to alternate chronicles and citations; excluded divergence titles are not revealed as fallback context.

Private planning questions and per-character private notes are not added to publications. Authored narrative prose is published only under the applicable publication selections; arbitrary prose is not automatically redacted or summarized. Authors remain responsible for reviewing the narrative they explicitly choose to publish.

## 8. Verification

Final results:

- `npm test`: 658 passed, zero failed (46 suites).
- `cargo test --workspace`: 198 passed, zero failed (185 library tests and 13 integration tests; binary and doc-test targets also passed).
- `npm run build`: TypeScript compilation and the production Vite build passed. The existing large-chunk warning remains.
- Focused coverage includes empty/legacy overviews, editing after creation, canonical save/reload, all four narrative/reference combinations, missing/deleted/foreign sources, alternate continuity and historical selection, unchanged death/unknown/not-introduced records, Markdown/PDF content parity, title-only citations, multiple approved excerpts with distinct anchors, glyph diagnostics, privacy/spoiler exclusions, and an actual portable v1 export/import round-trip.

Storage test commands ran outside the sandbox because sandboxed temporary-file renames are restricted on this host. No dependency or application version changes were needed.

The isolated browser fixture passed overview empty-state/edit/save, summary and extended chronicle editing, Book/Chapter navigation, metadata-only chapter linking/unlinking, and absence of copied manuscript prose or invented state changes. It uses fictional content and in-memory callbacks; real canonical persistence and portable copying are covered by Rust storage tests.

## 9. Remaining limitations

- A chapter has one existing historical milestone binding. Attaching it to another milestone replaces that binding; it does not create a second relation.
- Book navigation is derived from selected chapters. A separate Book-only event association is intentionally not invented.
- Consequences and circumstances are authored paragraphs/headings inside the existing description, not separately indexed canonical fields.
- Canonical cutoffs conservatively omit alternate chronicles rather than guessing cross-branch chronology.
- Full Windows/Tauri acceptance with the user's actual notebooks, queued save/restart behavior through the complete desktop shell, and native navigation still needs manual acceptance. The browser component workflows and backend persistence/portable paths were tested separately.
- The existing Vite bundle-size warning remains. No stable promotion or release was performed.
