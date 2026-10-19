# v0.6.2 Relationship Graph, Reciprocal Synchronization & Archive Safety

Date: 2026-10-19 (Asia/Shanghai). Windows / PowerShell. No commit, push, tag, publication or release.

## Outcome and architecture audit

Extended the existing SVG implementation without a new dependency or Lorebook redesign. Audited EntityLinkField, CharacterAffiliationSelector, EntityRelationshipsCard, EntityGuidedFields, UniverseDashboard, LorebookStudio, WebOfThought, App, relationship utilities, MutationQueue/CommandQueue, canonical frontmatter validation, storage safe_delete, native document commands, startup reindex, Vault recovery and the current tests/reports.

Markdown remains canonical. All planning Universes, Books, node/relationship identities and historical records share the special Lorebook catalog's `_web_of_thought` frontmatter. Ordinary entity/chapter documents remain separate Markdown files. SQLite indexes documents; it is not a second relationship store. Universe/Book context and starting milestones must remain attached to stable identities, even after an entity document is missing or archived.

## Confirmed synchronization root causes

1. **Acknowledgement overwritten:** LorebookStudio maintained a local plan and mutable planRef. Its save wrapper first accepted the backend acknowledgement, then `if (ok) setPlan(nextPlan)` replaced that acknowledged result with the submitted snapshot, including the old revision and possibly missing other queued changes.
2. **Racing fetch and mirrored prop:** Lorebook also performed an independent mount-time `thoughtGet()` while receiving App's plan prop. A late fetch could overwrite newer state; the prop effect skipped null updates. App library reads had no generation guard.
3. **Snapshot mutation/reconciliation:** Multiple forms computed full plan snapshots from the same render. App's reconciliation replayed whole attempted records over fresher records and automatically retried disk conflicts, allowing stale labels/archive flags or other fields to overwrite newer intent. A deferred expected-revision callback could also disguise a snapshot's original revision.
4. **Failures treated as UI success:** Editors awaited `Promise<boolean>` without checking false, then cleared input/closed the form. Several unlink paths only logged errors. Attempting `discard()` from within an in-flight queue drain did not discard it because MutationQueue intentionally refuses that operation.
5. **Direction-specific queries:** Character affiliations assumed the Character was always source and used `target_id` directly. Generic field queries only partially recognized inverse labels; no explicit Faction Members field existed. Duplicate checks compared raw label/direction rather than known semantic inverse pairs.
6. **Unsafe deletion ordering:** App archived the document first, then attempted relationship cleanup in a separate save whose failure was only logged. Native deletion had no relationship/catalog guard. The storage filename used second-resolution timestamps, and a fallback copy ignored a failed removal of the original.
7. **Graph geometry:** The old graph sliced twelve edges, placed nodes in two fixed columns, used one central x coordinate for every label and had neither entity metadata nor interactive camera/filter/focus state.

These are confirmed from source paths and exercised by helper, integration-renderer and temporary-fixture regression tests. No native desktop reproduction session was performed during this change.

## Canonical mutation and rendering behavior

Lorebook now renders App's acknowledged plan directly. Its independent fetch/mirror and stale post-save overwrite are removed. Entity editors are keyed by document ID; their transient input/Undo state does not migrate to another entity. Relationship-plan changes no longer reinitialize the current document body. Web of Thought receives the canonical App plan/documents and keeps only its existing explicitly-unsaved editing draft until acknowledgement.

Relationship editors submit functions applied against the latest acknowledged plan inside the existing ordered queues. The first attempted payload, generated IDs and expected revision are retained for idempotent retry. Snapshot callers capture their original expected revision at submission. App publishes a successful acknowledgement to every view before notification; a later failure in a shared queue drain does not turn an already acknowledged action into a false failure. Late library reads are invalidated. New/reactivated edges verify that both endpoints still exist in the live library.

Backend optimistic revision checks remain. External conflicts are no longer blindly merged or silently overwritten. A failure remains visibly queued for Ctrl+S / Retry or explicit cancellation. Further relationship submissions do not stack behind a known failed head. Cancelling retained changes refreshes canonical planning data after pending writing is flushed. Completed actions stay; writing is retained. Forms close only on their own successful save. Renames resolve from current document metadata and never require rewriting relationships.

## Reciprocal rules

| Stored relation | View from other endpoint | Rule |
|---|---|---|
| Character Member of / Affiliated with Faction | Faction Members Character | Membership only; never implies leadership |
| Faction Led by Character | Character Leads Faction | Equivalent to reversed Leads storage |
| Faction Controls Location | Location Controlled by Faction | Equivalent reversed storage accepted |
| Faction Allied with Faction | Allied with from either endpoint | Symmetric, including legacy directed storage |
| Faction Rival of Faction | Rival of from either endpoint | Symmetric |

The existing residence and other explicitly supported inverse aliases also use centralized perspective/identity rules. Unknown/custom labels retain their stored semantics; an incoming custom relation is labeled as incoming, not invented as a new fact. Known symmetric relations are created undirected and rendered without an arrow even for legacy directed storage. No inverse record is inserted. Duplicate identity includes Universe, Book and starting milestone, preserving independent contextual records. Existing historical duplicate IDs are not merged automatically.

Faction editors expose a visible **Members** field using canonical membership records and the existing entity picker. Both endpoint editors immediately derive their views from the published plan. Single-value field replacement only archives baseline links, leaving timeline-scoped history intact.

## Graph layout and interaction

- Dependency-free SVG, extracted into a reusable graph component. No package dependency added/upgraded.
- Deterministic force relaxation, rectangle separation and grouped curved paths for parallel/reversed connections. Cubic self-loops preserve legacy records. Labels are placed on their corresponding curve midpoints with collision-avoidance attempts; fit bounds include nodes/curves/labels.
- Characters: blue, person icon, ellipse. Factions: amber, shield, hexagon. Locations: emerald, map pin, rounded rectangle. Artifacts: cyan, sword, diamond. Events: rose, calendar. Rules/systems: violet, sparkles, hexagon. Culture/history: orange, compass, diamond. Chapters: orange, book, rectangle. Other/missing lore: Gilded primary, compass, rectangle. Every node also carries type text and a full-title tooltip. Legend and colors support existing Light/Dark/System tokens.
- Filter by semantic relationship type and entity type at either endpoint. Filtering never creates or rewrites edges. Empty and zero-match states distinguish absent data from filters.
- Click/Enter/Space focuses a node and highlights only its direct neighbors; Open focused entity navigates explicitly. Pointer drag pans empty space. Buttons zoom in/out and fit. Focus the SVG for arrow-key panning, + / - zoom and Home to fit. Zoom is bounded to 0.15-4 times fit. Responsive SVG and a stable-height viewport retain pan/zoom after resizing; Fit resets the camera.
- Render at most **240 matching edges**. The complete record list remains available. Web of Thought's graph now receives all matching contextual rows rather than only the current 40-row list page. Dense graphs can still have crossings or labels requiring zoom/filtering; this is not a general crossing-free graph engine.

## Unlink and entity archive safety

Unlink archives exactly the selected relationship; neither endpoint is deleted. A visible status and panel-local **Undo unlink** report progress/failure/success. Undo preserves the original ID and observations, verifies live endpoints through App and refuses an equivalent active replacement. Undo state is transient, not a revision history feature; it is lost when the editor unmounts. Archived records remain in the canonical plan and can be inspected through existing recovery controls.

A library archive action for a lore entity now opens an impact dialog listing affected active relationships and counting retained milestone references. It explains backup, ordering and limitations before explicit confirmation. The shared catalog is blocked instead of showing an entity-delete action.

After approval, pending writing flushes; the queued operation checks that no unreviewed active links appeared, commits relationship archives first, then archives the document. Failed stage one never moves a document. If stage two fails, completed link archives stay and the document/copy remains recoverable. Retry resumes completed stages; Cancel queued changes explicitly stops uncompleted work. Native commands recheck under the database lock that no active relationship remains, and reject direct catalog deletion. Native guards protect against interleaved calls as well as the UI path.

**This is not a multi-file transaction and has no persistent deletion-intent journal.** Process termination between stages can leave an intact visible entity with archived links, a valid recoverable state. The plan retains IDs and historical observations. After a file move but before index deletion, Backups retains the Markdown and startup reconstructs the index from disk. A failed DB deletion must not be treated as proof that the document file stayed in its original path. Preserve Backups and verified Vault copies; inspect/reindex after an interrupted archive. There is no one-click document restore or automatic entity Undo. A panel Undo restores only a relationship and cannot restore a missing endpoint document.

Archive filenames now include a UUID in addition to the timestamp/original filename, preserving separate successive copies. A fallback copy followed by a failed original-file removal is reported instead of silently succeeding. No user-library destructive fixture tests were run.

## Universe Settings danger zone

Impact review includes assigned/referenced documents, Books, chapters, entity references, Universe-history/Book milestones, active and archived relationships. Book/document lists are inspectable. The backup action opens existing Settings / The Vault; users choose Create Backup and wait for verification. No encrypted export, cloud backup or automatic pre-archive backup is claimed.

Typing the exact current Universe name enables **Archive Universe (keep all content)**. It changes only that Universe's selector-visibility flag. Nothing is moved/deleted; Books, documents, nodes, relationships, history and other Universes remain. The normal selector hides archived entries and exposes **Archived Universes** with Inspect and Recover. Ownership resolution still includes archived Universes so their documents do not become Unassigned Lore. Direct inspection remains possible.

**Permanent Universe deletion is unavailable.** Separate canonical files, shared planning data and local index operations do not currently provide a validated bulk-deletion/recovery transaction. The disabled action explains this. No typing a name can enable an unsafe hard-delete path.

## Metadata and compatibility

- Added optional `Universe.archived` within existing version-1 planning metadata. Native serde defaults false and omits false when serializing; old documents/backups require no migration or startup rewrite. Explicit archiving persists true. Recovering restores false.
- SQLite schema and relationship/node shapes are unchanged. No canonical paths were casually renamed or moved.
- Older strict readers may reject a catalog containing `archived: true`; use v0.6.2 or later after this feature is used. Files remain canonical/recoverable; new app reads both forms. Recovering all Universe flags to false removes the optional field on native serialization.
- Vault validation/restore and relocated-notebook tests cover archived Universe metadata. Relationship unlink/Undo, entity IDs and historical records survive reopening.
- Root app/frontend/native manifests and version assertions align at 0.6.2. Dependency versions are unchanged.

## Verification results

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS, exit 0; repeated during implementation. |
| `npm test` | PASS: **295 tests**, **21 suites**, **0 failed/skipped/cancelled/todo**. Final full run passed with the current 24-test safety suite. |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS with approved temporary-fixture execution: **83 tests** (70 library + 3 thinking_desk + 10 workshop), **0 failed/ignored**; main/doc tests 0. |
| `npm run build` | PASS, exit 0; TypeScript + Vite 6.4.4, **1,645 modules**. Main JS **711.75 kB**, gzip **189.41 kB**. Non-fatal over-500-kB chunk warning. |
| `npm run tauri -- build --debug --no-bundle` | PASS, exit 0; frontend before-build also passed. Windows debug executable: `target/debug/meta-cognition-notebook.exe`. No installer bundle or app launch. |
| `npx tsx --test tests/v061_help.test.ts tests/v061_manual.test.ts tests/v062_graph_safety.test.ts` | PASS after the final guidance update: **52 tests**, **0 failed**. |
| `git diff --check` | PASS; existing CreateDocumentModal LF/CRLF advisory may appear. |

24 new frontend regressions cover reciprocal creation from both editors, Faction Members rendering, directions/no leadership inference, symmetric alliances/rivalries, contextual duplicates, parallel relations, rapid queued updates, switching a captured entity while pending, rename propagation, retained failed actions/retry IDs, snapshot revision capture, unlink/Undo and duplicate-safe Undo, impact rendering, both archive failure stages, changed-impact rejection, Universe isolation/visibility, filtering/direct neighbors, dense layout, accessible graph controls and one acknowledged Lorebook plan. Existing autosave/manual-save/immediate-exit, studios, Cipher, Vault, planning and Help tests remain enabled.

Native additions cover legacy Universe defaults/archive/reopen, relationship history/unlink/reopen/Undo, direct catalog deletion rejection, entity archive preconditions/history retention, and repeated file archives preserving distinct contents. The existing verified Vault restore/relocation case now also carries an archived Universe.

Intermediate findings were corrected: the first focused run exposed a direction-unspecified residence query compatibility case (64/65 passed); it now recognizes the whole requested family when direction is unspecified. A subsequent new-test run caught a missing JSX expression brace in the keyboard graph handler before rendering tests could load; corrected. Later full runs passed 294 tests, then 295 after adding duplicate-safe Undo. No assertion was disabled and Rust/native guards were not relaxed.

These are automated unit/helper, SSR integration and temporary filesystem/database tests. There was **no native desktop, pointer interaction, screen-reader or installed-app QA session** for this change. Build success does not establish visual acceptance.

## Changed files

New:
- `src/utils/relationships.ts`: reciprocal identity/perspective, queued attempt preparation, impact and archive helpers.
- `src/utils/relationshipGraph.ts`: layout, filters, neighbors and camera bounds.
- `src/components/studios/lorebook/RelationshipGraph.tsx`: reusable interactive graph.
- `src/components/studios/lorebook/RelationshipFeedback.tsx`: unlink feedback/Undo.
- `src/components/studios/lorebook/UniverseSafety.tsx`: impact review and safe Universe archive.
- `src/components/common/EntityArchivePreview.tsx`: explicit entity impact confirmation.
- `src/services/entityArchive.ts`: resumable in-session, ordered archive stages.
- `tests/v062_graph_safety.test.ts`: 24 regressions.
- This report.

Updated:
- `src/App.tsx`: canonical queue publication, retained failures, read generation guard, live endpoint checks, preview/archive/close coordination.
- `LorebookStudio.tsx`: direct canonical props, keyed editors and backup routing; `WebOfThought.tsx`: shared graph/canonical input/queued transforms.
- `lorebook/EntityLinkField.tsx`, `CharacterAffiliationSelector.tsx`, `EntityRelationshipsCard.tsx`, `EntityGuidedFields.tsx`: reciprocal views, functional edits, Members, checked outcomes and Undo.
- `lorebook/UniverseDashboard.tsx`, `UniverseSelector.tsx`, `BookView.tsx`, `layout/AppLayout.tsx`: graph/safety integration, archive visibility, save type and settings routing.
- `src/utils/universe.ts`, `src/utils/thought.ts`: semantic dedup/query and optional Universe visibility flag; `src/index.css`: graph focus visibility.
- `src-tauri/src/thought.rs`, `thought/tests.rs`, `commands.rs`, `storage.rs`: optional metadata, archive guards, safe filenames/removal handling and fixtures.
- Version manifests/locks, Settings footer and `tests/v030_regression_suites.test.ts`: 0.6.2 alignment; `package.json`: register regression suite.
- `README.md`, `SYSTEM_DESIGN.md`, earlier relationship report pointers and relevant in-app guidance: actual behavior/limits.

The checkout already contained unfinished v0.6.2 entity-link/Living Universe work, including CreateDocumentModal, types/index and tests/reports. It was preserved. Not all files in git status originated in this task.

## Manual Windows QA still required

Use a disposable notebook with a verified Vault backup, never the real library for failure injection.

1. Create Character/Faction/Location entries in one Universe and unrelated content in another. Add membership from Character, immediately open Faction Members, then add another member from Faction and verify Character affiliation. Repeat reciprocal leadership/control and symmetric alliance/rival links. Membership must never imply leadership.
2. Create multiple different links between the same pair and legacy reversed equivalents. Check separate paths/labels; confirm equivalent duplicate creation is rejected without breaking the queued-change controls. Rename an endpoint and verify every profile/table/graph label.
3. Queue rapid adds/removes; navigate while pending. Confirm operations keep their original endpoint IDs, views update after acknowledgement and unrelated edits remain. Simulate disk/permission failure and external revision conflict: show failure, preserve input, retry or explicitly cancel/reload; never silently overwrite external writing.
4. Inspect graphs with 5, 20 and 50 entities plus dense parallel edges. Use every legend type, semantic/type filters, zero-match state, click focus/direct neighbors, explicit Open focused entity, pointer pan, keyboard pan, zoom and fit. Resize/narrow the window and use 100-200% scaling. Check Light/Dark/System, label clipping, crossing readability, contrast, Tab focus and screen-reader names. Check the explicit 240-edge bound and complete record list.
5. Unlink one edge and Undo it. Verify both endpoints/entities persist. Add an equivalent replacement before Undo and confirm duplicate-safe rejection. Archive an endpoint, then check that relationship Undo does not silently recreate a missing document.
6. Review entity archive impact. Cancel once, then confirm with pending prose. Verify writing flush, link archive before file move, unique Backups copy, retained node/relationship observations and unaffected other endpoints/Universes. Inject first-stage failure (no document move) and second-stage failure (recoverable links, retained files). Retry/cancel from the preview. Kill a disposable process between stages; restart and inspect Backups/rebuilt index.
7. Try to archive the special catalog: native/UI guards must reject it. Attempt a direct entity archive while links remain: reject without moving files. Inspect historical timeline references after supported archival and reopen/reindex.
8. Open Universe Settings. Check full scoped counts/lists, backup/verification action, wrong-name rejection, correct-name selector archive, retained content, Archived Universes inspection/recovery, and unavailable permanent deletion. Other Universes and the shared catalog must remain byte-safe except the intended catalog metadata update.
9. Backup and restore a notebook with archived Universes/links, including separate extraction and active recovery/restart. Verify all writing and context/history. Smoke-test Poetry, Philosophy, Cipher, Help, automatic/manual saves and normal/native close, including closing the archive preview with unsaved manual-mode writing.

## Remaining risks and recommendation

Graph placement minimizes overlap but does not guarantee a crossing-free dense graph; filters/zoom and the full list remain necessary. The production build retains a non-fatal large-chunk advisory; no dependency was added. Camera/filter/Undo state is transient. Unknown entity types use the Other style; long labels/titles truncate visually with full tooltips and records. Existing semantic duplicates are retained rather than destructive identity consolidation. Profile relationship summaries show canonical records, not an inferred world simulation.

Entity archive is recoverable but not a crash-atomic transaction; there is no durable intent/resume journal or one-click document recovery. After a crash inspect retained files and use startup reindex/verified Vault recovery before restoring missing references. Universe archive is selector visibility only; permanent bulk deletion remains deliberately unavailable. Older strict planning readers may reject the optional true archive flag. Native visual/accessibility/usability acceptance remains outstanding.

Recommendation: **READY FOR MANUAL WINDOWS ACCEPTANCE WITH WARNINGS**. Automated coverage supports review; the user's visual/synchronization acceptance requires the manual checklist. No release created.
