# v0.4.0 - The Writer's Workshop

Date: 2026-10-18 (Asia/Shanghai)

Recommendation: **READY WITH WARNINGS**. Automated checks pass. Native visual, interaction, installer and OS-close verification remain manual.

## Implemented features

- Shared document tags above Poetry, Philosophy and Lorebook: add/create naturally, select existing suggestions, add several comma-separated names and remove assignments.
- Global tag manager: rename, merge into an existing name, or remove a tag everywhere with an inline confirmation. Existing unused catalog names can also be managed; unrelated unused names are preserved.
- Star/unstar from the editor or library row. Favorite state is visible in the library, with a dedicated Favorites view.
- Last modified, Date created, Title A-Z and Title Z-A sorting in All and Favorites.
- Composable studio, multiple-tag intersection (AND), Favorites and title/body search filters. Clear-filter feedback and contextual empty states.
- Recent view ordered strictly by actual last opening. Startup auto-display, document selection and newly created editor display record an opening. Search, list and API reads do not record openings. No history is fabricated from modification dates.
- Compact library tabs and a collapsible Sort & filter section retain the Gilded Identity and leave the writing canvases intact. No folder manager or canonical path reshuffling was added.
- Organization actions and body saves share command ordering and flush together on navigation/exit. Failed organization actions remain queued for Retry/Ctrl+S, with an explicit cancel option that retains writing. Retry/cancel remain accessible without an active document.

## Storage, schema and compatibility

**No schema migration.** Existing `tags`, `document_tags`, `documents.metadata_json` and JSON frontmatter are sufficient.

Assigned tags remain in canonical frontmatter. A reserved namespace inside existing studio metadata stores:

```json
{
  "_workshop": {
    "favorite": true,
    "last_opened_at": "2026-10-18T08:00:00+00:00"
  }
}
```

Existing documents default to unstarred with no recorded opening history. A conflicting non-object namespace is reported instead of overwritten. Unknown object properties are retained. Older app versions may drop this new namespace during studio saves; durable organization preservation is guaranteed by the v0.4.0 save path, not by older binaries.

`update_organization` accepts only an ID and metadata patch, never a body. `manage_tag` returns updated metadata plus explicit per-file errors. Both read current canonical files under the existing database mutex. Content, studio metadata, IDs, parent IDs, created/modified timestamps and paths are preserved. The file writer preserves unknown top-level frontmatter fields during same-file updates, although JSON formatting may be normalized. Raw Markdown imports keep their indexed identity and receive durable frontmatter on their first metadata update.

Favorites and openings do not advance logical `updated_at`. The OS file modification time still changes when frontmatter is written. The backend timestamps an opening when its patch is persisted. Only the latest opening per document is stored, not a full event log.

Full studio saves preserve the current reserved namespace despite earlier in-memory metadata snapshots. Organization acknowledgements retain newer local draft text and studio metadata. Metadata-only changes cannot overwrite an unsaved body because they never submit one.

Each metadata update writes atomically and updates SQLite. An index failure attempts to restore the exact original file bytes. A simulated SQLite failure verifies both restoration and unchanged index contents. If restoration itself fails, the error requests reindex recovery. A crash between filesystem and SQLite writes remains a cross-resource limitation; canonical files are used for startup reindexing.

Library-wide tag changes are per-document operations. They can partially succeed; errors identify failures, and retries finish remaining assignments without duplicating completed work. Cancellation discards only uncompleted queued actions, not successful changes already applied elsewhere.

## Files changed

| File | Change |
| --- | --- |
| src/utils/organization.ts (new) | Organization metadata, tag normalization and shared sort/filter/search selection |
| src/components/common/DocumentOrganization.tsx (new) | Shared tag editor and favorite control |
| src/components/common/TagManager.tsx (new) | Global tag rename/merge/remove UI |
| src/components/layout/AppLayout.tsx | Library views, compact filters/sorts, combined search, star indicators, empty states and recovery controls |
| src/components/common/SearchModal.tsx | Reject obsolete responses and clear obsolete results |
| src/App.tsx | Opening events, catalog state, metadata updates and combined write/organization flushing |
| src/services/autosave.ts | Metadata retry queue, serialized command queue and combined workspace flush |
| src/services/commands.ts | Typed organization and tag-management command arguments |
| src/services/api.ts | Native adapters and equivalent MockStorage behavior |
| src-tauri/src/organization.rs (new) | Canonical metadata-only operations, namespace protection, rollback and partial-failure reporting |
| src-tauri/src/commands.rs | New IPC handlers, protected studio saves and stable imported-document reads |
| src-tauri/src/lib.rs | Register organization module and handlers |
| src-tauri/src/db.rs | Targeted tag-catalog rename/removal, preserving unrelated names; no schema changes |
| src-tauri/src/storage.rs | Unknown frontmatter preservation, exact-byte rollback support and UTF-8-safe search snippets |
| tests/v040_workshop.test.ts (new) | 14 focused frontend regression tests |
| src-tauri/tests/workshop.rs (new) | 10 native persistence and compatibility tests |
| tests/v030_regression_suites.test.ts | Version assertions aligned to v0.4.0 |
| package.json | v0.4.0 and new suite in npm test |
| package-lock.json | Aligned package version; no new dependency for this milestone |
| src-tauri/Cargo.toml | v0.4.0 |
| src-tauri/tauri.conf.json | v0.4.0 |
| Cargo.lock | Aligned native package version |
| README.md | Implemented behavior, workflows, current roadmap and limits |
| SYSTEM_DESIGN.md | Namespace, command contracts, data integrity, query semantics and test coverage |
| docs/TEST_REPORT_v0.4.0.md (new) | This report |

## Commands and exact results

| Command | Final result |
| --- | --- |
| npm test | PASS: 69 tests, 11 suites; 0 failed, 0 canceled, 0 skipped, 0 todo |
| cargo test --manifest-path src-tauri/Cargo.toml | PASS: 11 existing unit tests + 3 Thinking Desk integration tests + 10 Workshop integration tests = 24 tests; 0 failed; main/doc-test targets also complete |
| npx tsc --noEmit | PASS: exit code 0; no diagnostics |
| npm run build | PASS: TypeScript and Vite; 1,624 modules transformed |
| git diff --check | PASS: no whitespace errors; Git may print configured LF/CRLF conversion notices |
| git -c core.safecrlf=false diff --check | PASS: exit code 0, no diagnostics |

Rust tests ran outside the filesystem sandbox because this environment restricts atomic renames of temporary files inside the sandbox. All fixture files and SQLite databases were temporary. No tests accessed, reset, deleted or reindexed the user's real library.

An interim Rust run failed one new fixture assertion that expected SQLite's alphabetical tag presentation from a canonical-file read. The assertion was corrected to verify both canonical assignment order and index presentation separately; the final complete Rust run passed. This was not counted as a passing interim run.

New frontend tests exercise production normalization, namespace protection, selectors, adapters, rendered shared controls, queue failure/retry/cancellation, command ordering, a metadata action arriving during close, and an enqueue immediately after an empty flush. These are not mounted native UI tests. Existing suites continue to cover document operations, debounce/revisions and Thinking Desk compatibility.

New Rust tests exercise all studios, creation/removal/persistence, favorites/openings across file-backed database restart and reindex, global rename/merge/delete, stale studio saves, unknown frontmatter, injected indexing failure with exact-byte restoration, explicit partial-failure retry, Unicode search, empty documents, raw Markdown imports, namespace collision protection and unused catalog names.

## Remaining limitations

- Native desktop interaction, keyboard/IME input, WebView2 layout, both-theme contrast, OS close events and actual GUI restart have not been manually verified for v0.4.0. No desktop executable or installer packaging command was run in this milestone. The production frontend and native test targets were built.
- Sort/view/filter controls are session state. Tags, favorites and latest opening timestamps persist. Recent always uses last-opened order; the four other sort orders apply to All and Favorites.
- Global search retains its independent studio filter. The library's title/body search composes with its own tags/view/studio controls; those panel filters are not silently imposed on global search.
- Tag names are case-sensitive. Commas separate names in the document tag input. Unused tag names are catalog entries in SQLite; recreating the database from canonical files restores assigned tags, not unassigned catalog-only names.
- Multi-file tag operations have explicit partial completion rather than global transactional rollback. Failed actions can be retried or canceled; cancel does not undo completed updates.
- Native body search scans files rather than using FTS. Large-library performance is not benchmarked. External canonical edits should be followed by reindexing and reopening affected documents.
- A permanently stalled write keeps normal exit waiting. Forced termination or power failure cannot guarantee persistence of changes still in memory. Browser preview remains volatile MockStorage.
- No nested folders, backup/cloud integration, backlinks, export, revisions, Echo Library, Conversation Archive, Notes/Essay studios or generated-writing features were implemented. Export remains planned for v0.7.0.

## Native desktop checklist - not yet performed

Use a disposable Windows profile or VM with temporary fixture documents and a separate library. Do not reset or clear the normal user's library.

- [ ] Open existing Poetry, Philosophy (both modes) and Lorebook fixtures. Verify bodies, classifications, metadata, tags and paths before and after organization actions.
- [ ] Add tags by typing and suggestion selection; assign/remove several tags; verify visible status and restart persistence in all studios.
- [ ] Rename a tag globally, merge into an existing name, remove it everywhere, and manage an unused name. Confirm unrelated tags survive and canceled removal does nothing.
- [ ] Star/unstar from both locations; combine Favorites with a studio and two tags; confirm persistence after GUI restart and reindex.
- [ ] Verify all four sort orders. Open an older document without editing, edit a different document, and confirm Recent follows opening rather than modification. Confirm searching and starring a closed document do not record an opening.
- [ ] Combine body-only search, studio, multiple tags and Favorites/Recent. Change queries rapidly; verify obsolete results are not shown, clear filters and inspect empty states.
- [ ] Type unsaved text, then tag/star or perform a global tag action and immediately close. Repeat with title-bar X, Alt+F4, Ctrl+Q and Settings Exit. Confirm both final writing and organization state after restart.
- [ ] Simulate a failed file write in the disposable profile; verify error feedback, retained draft, navigation/exit protection, Retry/Ctrl+S, and explicit cancellation. Repeat with no active document and with one file unavailable during global tag management.
- [ ] Check minimum window size, both themes, long titles/tags, keyboard access, suggestion selection, modal behavior and writing focus/IME input.

No Git commit, push, tag, or release was created.
