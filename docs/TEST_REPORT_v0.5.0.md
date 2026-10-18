# v0.5.0 — The Vault: Implementation and Regression Report

Date: 2026-10-18. Platform: Windows; PowerShell; Tauri 2 / Rust / React / TypeScript.

Recommendation: **READY WITH WARNINGS**. Phase A is implemented with automated coverage. Native desktop interaction and rendered branding checks remain pending. Phase B is deferred. No commit, push, tag, installer publication or release was performed.

## Architecture assessment

- Canonical Markdown remains in Documents/MetaCognitionNotebook. Poetry, Philosophy and Lorebooks retain their existing paths, frontmatter and studio metadata.
- SQLite is an app-local WAL index. Writing and organization commands serialize through AppState.db; frontend saves use the existing queues and flushWorkspace.
- Attachments/ exists without an attachment-editing UI; existing files are captured. Backups/ holds archived deletions, not full-library snapshots.
- A live database/WAL copy would be unsafe. Vault captures canonical files plus a small catalog for unused tags and indexed raw-import identity, then rebuilds SQLite on recovery.
- Recovery uses the explicitly permitted separate-folder fallback. There is no active-library replacement or activation, so no active state reload or rollback database swap is required.

## Implemented behavior

Settings contains a separate Vault utility with Create Backup, known-backup history with file date/size, Verify Backup, Choose Backup File, Open Backup Folder, status/error feedback, compatibility preview and explicitly confirmed Restore to Separate Folder. Selecting an archive only verifies/previews it. Browser mode refuses durable Vault operations.

Before work begins, the frontend saves pending writing and organizational changes. A failed save aborts the operation. An interaction overlay pauses editing/navigation, the existing command queue orders work, and normal window close/Ctrl+Q waits for the Vault operation before the existing final save/exit sequence. Rust runs dialogs and filesystem work on blocking workers and holds the shared write mutex during capture. The app compares the final archive against a second inventory/hash pass over its source files; detected external changes abort publication.

No writing studio, document paths, existing schema, Tauri filesystem capabilities or other studio artwork was changed.

## Format, compatibility and locations

- Managed backups: <app-local-data>/Vault/, beside the existing index; the exact path appears in Settings. A missing managed directory is created on demand.
- Filename: MetaCognitionNotebook-<UTC timestamp>-<UUID>.mcbackup. A capture is written as .partial, flushed, fully verified and then renamed.
- Format version 1: ordinary uncompressed ZIP with manifest.json, library/... files and state/catalog.json. It is **not encrypted**.
- Manifest: format_version, app_version, UTC created_at, and files containing portable relative path, byte size and SHA-256. It introduces no absolute machine-specific paths.
- Includes canonical documents, frontmatter, tags, favorites, last-opened metadata, custom studio metadata, existing attachments, archived deletions and library.json if present. Unassigned tag names and raw-import indexed metadata are in the catalog.
- Excludes live SQLite/WAL, caches, preferences, credentials, unsupported collection/link state and other .mcbackup archives. Unknown studio files fail validation rather than silently disappearing.
- Existing canonical files are backed up byte-for-byte. A raw import receives frontmatter only in its recovered copy to retain indexed identity; its prose and original file are preserved.
- Limits: 10,000 payload/catalog files plus manifest, 64 MiB per file, 1 GiB payload, 4 MiB manifest/catalog, 16 MiB ZIP central directory, bounded Windows-safe names. Format 1 rejects compression, encryption, ZIP64, comments, links and multipart ZIPs. Third-party ZIP repacking may make an archive incompatible even if its contents look similar.
- Backups on the same physical drive do not protect against drive failure. The UI advises keeping a verified copy elsewhere.

## Verification and restore safety

A bounded ZIP preflight precedes ZipArchive allocation. It checks entry counts, local/central names, flags, CRC/size fields and contiguous non-overlapping data extents. Verification rejects unsafe/traversal/absolute/ADS paths, Windows device names, Unicode/case aliases, exact duplicate entries and file/directory conflicts. It then checks manifest version/date/membership, byte sizes, SHA-256 and document identity/studio/metadata. Recognized but unterminated canonical frontmatter is rejected. Checksums are not source authentication: a party can rewrite both payload and manifest.

The preview is pinned by the entire archive's SHA-256. Restore verifies again before creating a unique staging folder under a selected parent outside the active library. Files use create_new, are flushed, and are checked against the manifest. Free-space preflight requires twice the payload plus 64 MiB; later disk/quota errors still fail safely. A fresh SQLite index is built, tags restored, document counts and integrity checked, WAL checkpointed and the new database closed. A second whole-archive digest check precedes publication of the validated folder.

The final folder is MetaCognitionNotebook-Restored-<UUID>/. Its .vault-recovery/ contains the catalog, rebuilt metadata.db and staging/validated journal. Active documents and the active database are never written by restore. A failed operation retains the archive and any .partial staging copy with its error path. Retry creates a new folder. There is no deletion of recovery evidence, no automatic startup cleanup/resume, and no claim that replacing a set of live files/databases is atomic. Process termination after publication but before acknowledgement may leave an already completed folder for review.

## Official Vault visual identity

The supplied vault.jpg and vault-light.jpg were absent from the repository and copied unchanged from the supplied Desktop paths into src/assets/brand/. Both masters are 2048×2048 JPEGs. No replacement artwork, derivative, cropping or color filter was created.

| Asset | SHA-256 | Approximate gold artwork bounds |
| --- | --- | --- |
| vault.jpg | 9c07fb4351af23a37b79a49bc3ccc5e7704075e9db104198bada9078b264bc1b | (304,304)–(1744,1745) |
| vault-light.jpg | 9ffddc93d1c268ae5c40d4b44d2a555425bdd5369f194f9fa3f34172c11b987c | (299,299)–(1748,1749) |

The artwork occupies about 70% of each image. A 64px object-contain frame yields about 45px visible artwork, near the existing studio emblem size. The full proportions and baked-in charcoal/ivory backgrounds remain intact. The header uses the existing root-class observer; Dark selects vault.jpg, Light selects vault-light.jpg, and System follows the resolved OS preference. The shared root-theme binding now reacts to live OS changes in System mode. Other studio icons are unchanged; Vault has no fourth-studio navigation entry.

Automated tests pin both original hashes, dark/light/system selection, live simulated OS changes, manual-mode isolation and listener cleanup. The supplied images were visually inspected and their boundaries measured. Rendered header alignment/background blending and real OS/native WebView theme switching are **not manually verified**. The in-app browser timed out loading the local preview; Windows computer-use access to Firefox was denied. Vite started on port 5173 after Windows rejected port 1420. These attempts do not count as native verification.

## Automated results

All data tests use temporary fixture libraries, archives and recovery destinations. No backup/restore test ran against the user's real library.

| Command | Exact result |
| --- | --- |
| npm test | PASS: 80 tests, 11 suites, 0 failed, 0 canceled, 0 skipped, 0 todo. Includes all existing frontend suites and 11 new Vault tests. |
| cargo test --manifest-path src-tauri/Cargo.toml | PASS: 30 library unit tests + 3 thinking_desk integration tests + 10 workshop integration tests = 43 passed, 0 failed/ignored. Main and doc-test targets each contained 0 tests. Includes 19 Vault tests. Final rerun includes unterminated-frontmatter rejection and recovered-file reopening assertions. |
| npx tsc --noEmit | PASS, exit 0; no diagnostics. |
| npm run build | PASS, exit 0; TypeScript and Vite production build, 1,630 modules transformed. Both official JPEGs appear in output. |
| cargo check --manifest-path src-tauri/Cargo.toml --offline | PASS, exit 0. |
| cargo build --manifest-path src-tauri/Cargo.toml --offline | PASS, exit 0; final debug native build after the last Rust change. No installer or GUI launch. |
| rustfmt --edition 2021 --check src-tauri/src/vault.rs | PASS, exit 0, including its tests module. |
| git diff --check | PASS, exit 0; no whitespace errors. |

An additional repository-wide cargo fmt --manifest-path src-tauri/Cargo.toml --check returned exit 1 because existing Rust files do not match rustfmt formatting. No broad reformat was applied. The new Vault module and its tests pass the targeted formatting check. Dependency retrieval required network approval; Rust fixture runs required approved execution because the sandbox blocks the atomic rename operations used by existing storage tests. Initial compilation errors encountered during implementation were corrected before the final passing runs.

Coverage includes:

- All three studios, empty libraries, Unicode names/prose, multiline writing, arbitrary studio JSON, parent metadata, tags/favorites/open history, unused tag names, attachments and archived deletions.
- Exact canonical byte preservation, raw-import identity/prose preservation, fresh-index integrity and reopening recovered documents.
- Corruption despite recomputed ZIP CRC, malformed manifest and metadata, missing/unlisted entries, unsupported versions, truncated/oversized directories and files, compressed/encrypted/symlink entries, nested backups, exact/case/Unicode duplicate paths and Windows devices.
- Save-before-capture, failed-save abort/retry, close waiting, concurrent-operation rejection, failed-operation gate cleanup and explicit preview confirmation.
- Failure injection at staging, extracted-file and pre-publication validation points; active-library inventory unchanged; retained staging; safe fresh retry; changed-archive preview refusal; unsafe destinations; backup recursion exclusion; observed external edits; disk-space calculation overflow and invalid catalog rejection.
- Existing organization/search/autosave/immediate-exit suites remain enabled and pass. These are automated checks, not evidence of actual native dialogs or hard process-kill recovery.

## Google Drive: deferred

Phase B was assessed after local tests passed. There is no cloud UI, OAuth runtime, upload, download or credential in this implementation. Prerequisites are:

1. Google Cloud project, enabled Drive API, consent/test-user setup and a registered Desktop OAuth client configured outside source control.
2. System-browser authorization with PKCE S256, state validation and an ephemeral loopback callback; refresh, revocation and disconnect behavior.
3. Reviewed Windows Credential Locker/DPAPI-backed token storage; no tokens in logs, archives, localStorage or repository files.
4. A least-privilege scope/storage decision: drive.file for app-created user-visible backups versus drive.appdata for hidden app data, including its deletion lifecycle. Broad Drive access is unnecessary.
5. Explicit user-triggered transfers that create distinct remote backups, retain local copies, handle resumable transfer interruptions/quota/backoff and verify downloaded archives before recovery. Authentication/token/network tests are required before claiming support.

Primary references: [installed-app OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [token storage](https://developers.google.com/identity/protocols/oauth2/resources/best-practices), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [app-data behavior](https://developers.google.com/workspace/drive/api/guides/appdata), [uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [quota/error handling](https://developers.google.com/workspace/drive/api/guides/limits).

## Changed-file inventory

| Files | Purpose |
| --- | --- |
| src-tauri/src/vault.rs; src-tauri/src/vault/tests.rs | Archive format, bounded verification, capture/history, staged recovery, native dialogs/commands and 19 regression tests. |
| src-tauri/src/db.rs; src-tauri/src/lib.rs | Restore tag catalog/integrity helpers and Vault command registration. No schema migration. |
| src/App.tsx; src/services/vault.ts | Save/close coordination and interaction gate. |
| src/services/api.ts; src/services/commands.ts | Typed native adapters; explicit browser refusal. |
| src/components/common/VaultPanel.tsx; VaultPreviewCard.tsx; SettingsModal.tsx | Settings utility, history/status, preview and confirmation. |
| src/components/common/BrandIcon.tsx; src/utils/theme.ts | Official emblem and shared live System theme binding. |
| src/assets/brand/vault.jpg; vault-light.jpg | Unmodified supplied official assets. |
| tests/v050_vault.test.ts; tests/v030_regression_suites.test.ts | 11 new tests and existing version-alignment expectations. |
| package.json; package-lock.json; src-tauri/Cargo.toml; src-tauri/tauri.conf.json; Cargo.lock | Version 0.5.0, test script, locked zip/sha2/fs2/rfd dependencies. |
| README.md; SYSTEM_DESIGN.md; docs/TEST_REPORT_v0.5.0.md | User workflow, embedded development roadmap, architecture, limits and actual verification status. |

## Manual desktop checklist — pending

Use a disposable Windows account/library and temporary recovery folders; never destructive fixtures in the real library.

- [ ] Inspect Settings at normal and narrow window sizes; header visible, controls readable, scroll area reachable, Vault separate from studios.
- [ ] Switch Dark → Light → System without restart; inspect correct full JPEG, apparent size, alignment and charcoal/ivory blending. In System mode change the OS preference; confirm immediate change. Check 100%/150%/200% scaling and keyboard focus.
- [ ] Edit each studio immediately before Create Backup. Verify current writing, organization changes and block metadata in recovery. Close/Ctrl+Q during capture; verify operation completes and writing persists after restart.
- [ ] Exercise native file/folder pickers, cancel paths, Open Backup Folder, history date/size, malformed archive errors and explicit restore confirmation. Choosing a file alone must never extract it.
- [ ] Restore a verified copy to another drive and inspect all recovered Markdown, metadata, attachments, archives and rebuilt index. Active library and open draft must stay unchanged.
- [ ] In disposable fixtures exercise read-only/denied/locked destinations, actual full-disk/quota conditions and removable-drive interruption; inspect actionable errors and retained partial files.
- [ ] Kill the process during staging and around publication in disposable fixtures; confirm active files unchanged, partial/completed folders discoverable and a fresh retry safe. The implementation does not auto-resume staging.
- [ ] Move an archive to another Windows machine and verify/recover it; check long-path and non-ASCII parent directories.

## Remaining limits and release decision

Separate-folder recovery requires manual inspection; there is no in-app library activation, destructive replacement, automatic staging cleanup/resume, encryption, signature/source authentication, scheduler or Google Drive. Backup location is managed; copy a verified archive elsewhere through normal file management. External selected archives are not persisted in the managed history. Verification is explicit rather than remembered across sessions. Limits deliberately reject oversized or unsupported libraries/ZIP variants. Reparse/OneDrive placeholder sources may be rejected until made ordinary local files. Capturing supported application state does not provide VSS consistency against arbitrary external writers.

Automated coverage supports committing for review **with warnings**, after native desktop smoke checks above. It does not establish release readiness, physical-drive disaster recovery, actual disk-full/permission behavior, installer correctness or visual approval. No release was published.

## v0.5.1 follow-up

The separate-folder-only limitation described above is historical v0.5.0 behavior. v0.5.1 adds explicitly confirmed active-notebook selection through a preserved, staged copy and restart, with startup fallback and a write barrier. Separate-folder recovery itself is unchanged. See [the v0.5.1 recovery report](TEST_REPORT_v0.5.1.md) for current behavior, validation and remaining native Windows checks.
