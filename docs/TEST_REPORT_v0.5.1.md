# v0.5.1 — The Vault Recovery Polish

Date: 2026-10-18. Windows / PowerShell. Recommendation: **READY WITH WARNINGS** for review; native desktop acceptance is still required before release.

## Problem and architectural decision

v0.5.0 extracted a verified notebook into a separate folder while the running process continued to use its original notebook. That behavior remains available and unchanged as an inspection/recovery tool.

Inspection confirmed that canonical files default to Documents/MetaCognitionNotebook, SQLite is an app-local WAL index, AppState holds a fixed StorageManager and live connection, and startup creates/reindexes that fixed library. Frontend pending edits and organizational changes use flushWorkspace plus command/mutation queues. Native close requests wait for the save coordinator before process exit. Replacing those live paths or switching a mounted editor between connections would risk stale writes, Windows file-sharing errors and ambiguous partial replacement.

The supported alternative is **persistent active-notebook selection with restart**. Activation prepares a new notebook/index, retains the original, and publishes a small selection record. It does not overwrite active Markdown or move/replace the live SQLite database. No database schema migration or new dependency was introduced. Backup format 1 and the official Vault branding are unchanged.

## User workflow and preservation

1. Verify a known backup or choose a .mcbackup file. Selection alone never extracts or activates it.
2. The existing separate-copy confirmation and folder picker still extract only an inspection copy. Its current-library impact remains unchanged.
3. The distinct **Restore as Active Notebook** confirmation names the archive, date, document count and current notebook path. It explains preservation, editing pause and required restart, and starts unchecked.
4. After pending writing and organizational changes save successfully, activation holds the backend write mutex, rechecks the selected archive digest, and creates a fully verified pre-restore archive in app-local Vault/.
5. A new unique notebook is staged/restored under app-local Notebooks/. Canonical files, identities and metadata are checked, a separate SQLite index is rebuilt/validated and closed, and a new startup selection is published.
6. The restart screen distinguishes **selection saved** from **notebook activated**, keeps the old interface inert, and displays both the previous notebook folder and verified pre-restore archive path. The original folder/index are retained in place. Nothing is silently deleted.
7. Restart & open selected notebook uses Tauri relaunch; Close safely and manual reopening use the same persisted selection. Startup opens the selected slot before frontend document loading. All three studios appear through the existing library APIs; empty recovery opens an empty notebook.
8. A startup toast and Settings identify the outcome/current notebook. Settings retains the preservation paths and offers an explicitly confirmed **Return to Previous Notebook**. Returning first saves/backups current writing, retains both folders and uses the same selection/restart protocol. Repeated restores create new notebook copies rather than overwriting earlier generations.

Backups remain in app-local Vault/ regardless of selected index location. The default notebook remains at its existing path until an explicit activation. Active recovered notebooks use their own .vault-recovery/metadata.db. Neither selected path nor local activation journal is portable; .mcbackup remains the cross-machine recovery format.

## Protocol, failures and startup recovery

- notebook.lock is held with an exclusive OS file lock for the process lifetime. Another v0.5.1 instance cannot open the same app-data store. Relaunch waits up to three seconds for the departing process; manual reopening is the fallback. Older versions do not participate and must be closed.
- NotebookActivations/ contains immutable, numbered format-1 selection records. Fields include generation, selected root/index, previous root/index, verified preservation-backup path and outcome message. The local absolute paths are not added to portable archives.
- Publication writes a unique .partial record using create_new, fsyncs/closes it, then renames it to a new generation filename in the same directory. Existing records are never overwritten. Partial records are ignored on startup. Malformed/noncanonical committed records block startup rather than trigger an empty fallback. Record reads/counts are bounded.
- Backup/staging/database/permission/disk-space failures before publication leave the current notebook selected and writable after the operation ends. Captured archives, staging folders, completed unselected notebooks and journal fragments are retained. The existing restore free-space check/write-error handling remains in force.
- After publication, the old runtime's backend write barrier rejects document creation/save/rename/delete, reindex and tag/organization mutations before their filesystem changes. The frontend also blocks interaction. Failed IPC acknowledgement is reconciled against persisted selection; an unknown outcome keeps editing blocked until reopening.
- Normal close waits for activation. Once publication is confirmed or its outcome is unknown, it does not issue redundant old-notebook writes. A failed autosave before preparation prevents activation and keeps ordinary save/retry behavior.
- Startup checks canonical document paths/identities/metadata and SQLite integrity, then rebuilds the selected document/tag index in one SQLite transaction. Failed insertion rolls back the index transaction. Raw imports retain indexed identity; canonical frontmatter is authoritative. Startup validation does not apply archive file/count/attachment limits to a notebook that grows after activation.
- If the committed selected slot cannot open, startup validates the recorded previous slot and publishes a new rollback generation before allowing editing. If both slots fail, the journal is corrupt, or rollback publication fails, startup stops with a native recovery dialog and all notebooks retained.
- Process termination before publication leaves the older selection in force. Termination after publication is resolved by startup without relying on an acknowledgement from the old editor. A completed restored folder can remain unselected; this is intentional recovery evidence.

This is a single-file selection publication protocol, **not** an atomic replacement of files plus databases, a VSS snapshot or an unconditional guarantee against hardware/power failure. No existing notebook directories are moved by activation. There is no automatic staging resume, cleanup or deletion. Actual filesystem/device failure timing and relaunch remain native verification items.

## Automated results

Tests use disposable directories, fixture notebooks, databases and archives only. No native backup/restore or destructive test was run against the real user library.

| Command | Result |
| --- | --- |
| npm test | PASS: 88 tests, 11 suites; 88 passed, 0 failed/canceled/skipped/todo. Includes 8 new recovery frontend tests and all existing suites. |
| cargo test --manifest-path src-tauri/Cargo.toml --offline | PASS: 45 library unit tests + 3 thinking_desk + 10 workshop integration tests = 58 passed, 0 failed/ignored. Main/doc-test targets each have 0 tests. Includes 15 new notebook recovery tests and all 19 existing Vault tests. |
| npx tsc --noEmit | PASS, exit 0, no diagnostics. |
| npm run build | PASS, exit 0; TypeScript plus Vite production build, 1,631 modules transformed. |
| cargo check --manifest-path src-tauri/Cargo.toml --offline | PASS, exit 0; incremental-cache hard-link warnings fell back to copying. |
| cargo build --manifest-path src-tauri/Cargo.toml --offline | PASS, exit 0; debug native executable compiled, no GUI/installer acceptance implied. |
| rustfmt --edition 2021 --check src-tauri/src/notebook.rs src-tauri/src/vault.rs | PASS, exit 0, including the two test modules; no repository-wide formatting claim. |
| git diff --check | PASS, exit 0; final documentation check repeated before delivery. Git may print its existing Cargo.lock LF/CRLF advisory. |

Rust fixture tests required approved execution for Windows storage renames outside sandbox restrictions. No GUI/installer/release build acceptance is implied by compilation. Existing repository-wide formatting differences from v0.5.0 were not broadly reformatted.

The new frontend tests exercise production coordination/helpers and rendered confirmation markup: separate/active distinction, disabled unchecked confirmation naming the archive/original path, flush-before-selection, failed-autosave abort, restart barrier, lost/unknown acknowledgement, close waiting without old-library writes, ordinary failed-save shutdown behavior and browser refusal.

The new Rust tests cover all-studio successful activation and metadata/body reopening; original-folder byte preservation and verified pre-backup; stale mutation rejection; failure injection before publication; process/IPC acknowledgement loss after publication; missing selected folder/corrupt selected database startup fallback; ignored partial/corrupt committed journals; repeated activation and user return; real blocked-path preservation/publication failures and tampered archives; saved-draft inclusion; transactional index failure rollback; exclusive lock/release; both slots unavailable; empty activation; failed rollback publication; and attachment growth beyond archive limits without selection fallback.

Fault injection simulates interruption/error boundaries. It is not a claim that power loss, physical full disks or Tauri restart were manually exercised. The original separate-folder Vault tests continue to pass.

## Files changed for the recovery improvement

- src-tauri/src/notebook.rs and notebook/tests.rs: selection protocol, process lock, startup validation/fallback, activation/return/restart APIs and tests.
- src-tauri/src/lib.rs: resolve selected notebook before exposing AppState; retain process lock; fail-closed native startup error.
- src-tauri/src/vault.rs: reuse capture under the existing write mutex, stable app-local backup folder, read-only canonical validation for selection. Separate-folder recovery implementation is retained.
- src-tauri/src/db.rs: in-memory write barrier and transactional index rebuild using the existing SQL schema.
- src-tauri/src/commands.rs and organization.rs: reject stale mutation commands before filesystem changes.
- src/App.tsx and src/services/vault.ts: authoritative selection check, post-publication/uncertain-outcome barrier, inert workspace, startup result, restart/close handling and coordinator tests.
- src/services/api.ts and commands.ts: typed activation/status/return/restart commands; desktop-only refusal in browser mode.
- src/components/common/ActiveNotebookConfirmation.tsx and VaultPanel.tsx: separate active confirmation, retained paths, success/failure instructions and previous-notebook return. VaultPreviewCard.tsx remains unchanged for separate-folder extraction.
- tests/v051_recovery.test.ts, package.json and tests/v030_regression_suites.test.ts: new test registration and version alignment.
- package-lock.json, Cargo.lock, src-tauri/Cargo.toml, src-tauri/tauri.conf.json and SettingsModal.tsx: version 0.5.1. No added recovery dependencies.
- README.md, SYSTEM_DESIGN.md, this report and the v0.5.0 report follow-up link: actual behavior and limitations.

The workspace also contains the prior v0.5.0 implementation/official assets from the preceding task; they were retained. No commit, push, tag, release or publication was performed.

## Manual Windows acceptance checklist — still required

Use a disposable Windows account/library and external temporary destinations. Do not perform destructive tests in the real notebook.

- [ ] Create recognizable content in all studios, change tags/favorites/roles, type immediately before activation, then verify both the selected backup and pre-restore backup contain the expected different versions.
- [ ] Confirm separate-folder extraction still leaves active documents and selection unchanged, including cancellation of its folder picker. Confirm archive selection alone never activates anything.
- [ ] Confirm active recovery requires its separate checkbox, identifies the correct archive/current path, and displays preservation locations. Keyboard, mouse and IME editing must stay blocked during work and on the restart screen; restart/close controls must remain usable.
- [ ] Restart through the button and through close/reopen. Confirm recovered Poetry, Philosophy and Lorebook documents actually appear, selected root/index paths are correct, empty notebooks clear the prior document, and the success message is accurate.
- [ ] Exercise X, Alt+F4 and Ctrl+Q during preservation/staging and after publication. Confirm safe waiting, no stale old-library writes and no dropped saved draft. Test lost IPC/UI refresh and automatic-restart failure; manual reopening must resolve selection.
- [ ] Restore repeatedly and use Return to Previous Notebook. Confirm each folder and verified archive remains, current edits are preserved, paths remain accurate and no live database file is replaced or locked during publication.
- [ ] With disposable fixtures, test actual read-only/denied/locked paths, quota/full-disk conditions, missing drives and long/non-ASCII paths. Inspect errors and retained partial artifacts.
- [ ] Kill the process around staging/selection rename/relaunch, then reopen. Confirm old selection before publication and validated new selection afterward. Make selected notebook/index unavailable and confirm explicit startup fallback; make both unavailable or the journal unusable and confirm startup blocks without creating an empty replacement.
- [ ] Start a second v0.5.1 process and verify lock rejection; verify relaunch releases the old lock in time, including slow antivirus/disk conditions. Close any older versions first.
- [ ] Inspect Dark/Light/System, narrow window/scaling, long preservation paths, scrollability and focus on both confirmations and the restart screen. Official emblems/other studios must remain unchanged.

## Remaining limitations and recovery instructions

Restart is required; there is no live notebook hot-swap or destructive in-place replacement. Selection data is local to the machine. There is no arbitrary notebook-folder selector, automatic retention pruning or UI for browsing every historical generation. Return to Previous Notebook addresses the immediately preceding selection, while all older folders/backups remain on disk. If backup limits prevent preservation, activation refuses rather than proceeding without a pre-restore archive; ordinary startup can still open an already-grown notebook.

If restart fails, close and reopen normally. If startup reports unavailable notebooks, first restore drive/path access or release file locks; retain originals, app-local Notebooks/, Vault/ and NotebookActivations/. A damaged committed journal or two unusable slots requires manual recovery assistance; the app deliberately does not guess a path or create a new empty library. Preserve copies before any manual repair. Portable verified backups remain available for separate-copy recovery once the app can start. No automatic deletion/resume/repair is claimed.

Original retained folders can still be changed by outside programs; the verified pre-restore archive provides a separate recovery copy. The existing SHA-256 checks detect changes against the manifest but do not authenticate its author or provide encryption. Google Drive, The Esoteric Cipher, Echo Library, export and other milestones are outside this change.

**READY WITH WARNINGS**: automated coverage supports review/commit consideration. Complete the native restart, interruption, permissions/full-disk and UI checks before calling this release-ready.
