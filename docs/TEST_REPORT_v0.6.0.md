# v0.6.0 — Web of Thought

Date: 2026-10-19 (Asia/Shanghai). Windows / PowerShell. **READY WITH WARNINGS** for review; native acceptance and upper-bound performance remain unverified. No commit, push, tag or release was created.

## Architecture and implementation phases

Inspection covered LorebookStudio, AppLayout/App queues, JSON frontmatter/storage writer, SQLite schema, commands, organization rollback, notebook selection/startup, Vault verification/extraction, theme tokens, README/SYSTEM_DESIGN and the v0.5.2/v0.5.1 reports. The checked-out source includes Emotional Cipher and its current regression suites; it was not assumed to match an earlier milestone. Package/native manifests still said 0.5.1 while documentation said 0.5.2; manifests and version assertions now consistently say 0.6.0.

1. **Persistence:** Existing hierarchy consists of free-text Universe/Book/Chapter fields. Entity document UUIDs are reused; an explicitly created canonical planning catalog adds stable Universe/Book IDs. No SQLite migration, folder rewrite or automatic legacy-file conversion is required. Opening the desk does not write anything.
2. **Timelines:** Universe history and each Book have independent ordered Story Nodes. IDs, attached changes and references survive insertion/reordering; endings can precede middle-node creation. Duplicate titles/missing dates are valid. Books start Standalone / Undecided and can become Canonical or Alternate without publishing/deleting history. Nodes have summaries, optional era/status, entity references, unresolved questions and timestamps; they are not chapters.
3. **World state:** Sparse entity/property observations, custom keys, optional prior expectations, nullable new values, source/provenance and explanations. Comparison is restricted to two nodes in the same timeline and labels direct, earlier recorded, unknown and conflicting evidence. Reordering recomputes interpretation without rewriting observations. Earlier evidence is explicitly uncertain between milestones; missing state is never shown as automatically unchanged.
4. **Relationships:** Stable directed/undirected entity links, descriptions, starting milestone or explicit timeless baseline, sparse milestone-specific label changes and confirmed archival/recovery. Contextual SVG connected-node visualization focuses one entity and draws at most 12 edges; a record list retains all matching links. Shared Universe definitions are read-only inside Book views, while Book-local observations remain editable.
5. **Shared history:** Multiple Book nodes can link one Universe node/event and keep their own perspective/order. Canonical Books can explicitly confirm promotion, creating a new shared event and linking/retaining the origin. Alternate/Standalone promotion is blocked. Linked event edits/archival never overwrite Book descriptions; missing references warn. Promotion copies sparse world observations and shared relationship observations, leaving Book-only relationships in the Book. Linking alone does not import shared world state.
6. **Integration:** Lorebook-only Web of Thought entry, Gilded Identity tokens, empty states, 40-node timeline pages, progressive disclosure, queued persistence/close handling, malformed-data protection, Vault validation, documentation and regression coverage. Poetry, Philosophy and cipher source/features were not changed. Existing Lorebook export behavior was not extended.

## Canonical format and compatibility

The planning document is `Lorebooks/Web_of_Thought_<document-id>.md`, with standard JSON frontmatter and an explanatory body. `_web_of_thought` contains version 1, revision, universes, books, entity memberships, Story Nodes and relationships. Universe nodes are shared events rather than duplicated in a second event registry. Membership references actual lore document IDs; no prose/world snapshots are copied into each milestone. Registry renames preserve IDs and intentionally do not rewrite legacy breadcrumbs. New/unassigned entities are attached explicitly. Existing missing entity IDs are retained for reference recovery, while references to known Poetry/Philosophy documents are rejected.

Story Nodes store id/universe_id/book_id/position/title/description/era/status/questions/entity_ids/changes/relationship_changes/linked_event_id/origin_node_id/archive flag/creation-modification timestamps. Property changes store id/entity_id/property_key/expected previous value/nullable new value/note. Relationship definitions store ID, Universe/optional Book, stable endpoints, label, direction, description, optional starting context and archive flag; later labels live on nodes. A null value explicitly records unknown. Linked Universe state is not silently replayed into a Book.

`thought_get` scans canonical Lorebook files, rejects duplicate/malformed/future catalogs and never guesses a winner or resets data. `thought_save` validates schema, scope, IDs, duplicate properties and shared links; checks expected canonical revision; holds the existing database/write mutex and activation write barrier; and uses the established atomic document writer. Existing body, unrelated metadata and unknown top-level frontmatter are retained. Manuscript save rejects planning catalog overwrite. An indexing failure on update restores original canonical bytes; first-save failure retains a discoverable catalog, and an identical retry repairs its index row. Lost-ack retries are idempotent. Stale conflicting edits are rejected before file replacement. This is established per-file persistence, not a claim of a multi-file atomic transaction or VSS consistency.

The UI queues optimistic snapshots through existing MutationQueue/CommandQueue, obtains the expected revision at execution from previous acknowledgements, and keeps newer local edits when older saves acknowledge. Planning writes participate in normal navigation/close and Vault flushes. Failed saves remain queued for Ctrl+S/Retry; Reload refuses to silently discard them. On an external revision conflict, preserve intended edits, explicitly cancel failed queued actions using the existing workspace control, leave/reopen the desk and reapply changes. A forced process kill can still lose unacknowledged UI edits; normal close waits.

SQLite remains a derived index; there are no new tables or dependencies. The ordinary catalog file is included automatically by Vault. Backup/startup canonical metadata validation validates its planning namespace too. Malformed planning metadata blocks a supposedly valid backup rather than being silently dropped. Keep a copy of damaged canonical data for repair. Whole-notebook relocation retains all references; copying only the catalog without entity documents intentionally yields missing-entity warnings. Backups, entity archival, separate-folder extraction, active notebook selection and Emotional Cipher remain in their existing architectures.

## Automated checks

All filesystem/index/archive tests use temporary fixture libraries. No destructive test or native recovery operation ran on the real notebook.

| Command | Exact result |
| --- | --- |
| `npm test` | PASS: 162 tests, 11 suites; 162 passed, 0 failed/canceled/skipped/todo. Includes 14 new Web of Thought tests. Serial rerun passed without changing the existing autosave test. |
| `cargo test --manifest-path src-tauri/Cargo.toml --offline` | PASS: 64 library unit tests + 3 thinking_desk + 10 workshop integration tests = 77 passed, 0 failed/ignored; main/doc targets each contain 0 tests. Includes 14 new native planning tests. |
| `npx tsc --noEmit` | PASS, exit 0; no diagnostics. |
| `npm run build` | PASS, exit 0; TypeScript + Vite, 1,635 modules transformed. |
| `cargo check --manifest-path src-tauri/Cargo.toml --offline` | PASS, exit 0. |
| `cargo build --manifest-path src-tauri/Cargo.toml --offline` | PASS, exit 0; debug native build only, not installer/manual acceptance. |
| `rustfmt --edition 2021 --check src-tauri/src/thought.rs` | PASS, exit 0, including the tests module; no repository-wide formatting claim. |
| `git diff --check` | PASS, exit 0; repeated after documentation. Existing Cargo.lock LF/CRLF advisory may appear. |

The first frontend run identified a promotion-test fixture selecting the wrong Book, corrected before passing. A subsequent run under simultaneous compiler/build load failed the existing timer-based `phase2a_autosave_reliability` stale-response test (`saving` versus expected `saved`). Inspection confirmed its fixed real-time sleeps; an unchanged serial rerun passed all 162 tests. No autosave test assertion was weakened. Rust fixture runs used approved execution because existing atomic Windows renames require it outside the sandbox. A TypeScript scope error during implementation was corrected before the final passing checks. Compiler-cache hard-link fallback warnings are environmental, not a source-code failure.

New frontend coverage: safe legacy label import; ending-first/insert/reorder/stable IDs; duplicate titles/missing dates; independent Universe/multiple Books; continuity-only changes; sparse direct/earlier/unknown state and explicit unknown; conflicts after reorder; rejection of cross-timeline comparisons; non-destructive archival/missing links; historical directed/undirected graph labels; missing entities/context; canonical-only explicit promotion with multiple perspectives; 200-node sparse timeline; queued save-before-close; stale/unsupported browser preview revisions.

New native coverage: read-only opening without migration; canonical reopen/metadata/history identity; stale/lost-ack writes; malformed/version/duplicate/scope validation; body/unknown-metadata/actual lore-file preservation; old-runtime write barrier and manuscript overwrite refusal; canonical-only promotion/classification change preservation; missing/archived reference retention; verified Vault restore plus actual fixture-folder relocation; corrupt metadata refusal during backup; duplicate catalog protection; update index failure rollback/retry; first-insert failure canonical retention/index repair; and cross-studio entity rejection. Existing Poetry/Philosophy/cipher/organization/Vault/active-recovery tests remain enabled.

## Changed files

- `src-tauri/src/thought.rs`, `thought/tests.rs`: typed format/validation, canonical discovery, revision-aware persistence, index recovery, native commands and tests.
- `src-tauri/src/lib.rs`, `commands.rs`, `vault.rs`: command registration, catalog overwrite protection and backup/startup metadata validation.
- `src/utils/thought.ts`: stable-ID model, legacy registration, sparse evaluation/diff, ordering, relationship history, warnings and explicit promotion.
- `src/components/studios/WebOfThought.tsx`: planning desk, timeline/node/property/relationship editors, graph, comparison and shared-history UI.
- `LorebookStudio.tsx`, `src/components/layout/AppLayout.tsx`, `src/App.tsx`: Lorebook-only entry, metadata-field retention and existing save-queue integration.
- `src/services/api.ts`, `commands.ts`: typed native adapters and volatile browser preview behavior.
- `tests/v060_thought.test.ts`, existing version assertions, package test script: new coverage and version alignment.
- `package.json`, `package-lock.json`, `Cargo.lock`, `src-tauri/Cargo.toml`, `tauri.conf.json`, Settings version footer: 0.6.0, no added dependency.
- `README.md`, `SYSTEM_DESIGN.md`, this report: user workflow, updated roadmap, schema, trade-offs, real results and deferred functionality.

The pre-existing `.idea/MetaCognitionNotebook.iml` modification was left untouched.

## Manual desktop checklist — pending

- [ ] On a disposable notebook, open existing lore and confirm no catalog is written until explicit creation. Verify Universe/Book labels, safe Standalone defaults, original chapters/body/metadata and Emotional Cipher remain intact.
- [ ] Create only a beginning and ending, insert duplicate-title middle milestones, reorder across pages, omit dates, edit questions and confirm IDs/references/state changes persist after restart. Test keyboard/IME input, focus, small windows, 100–200% scaling and Dark/Light/System.
- [ ] With multiple Books in one Universe, verify independent timelines/classifications. Change Canonical → Alternate without losing nodes or shared references. Confirm Book views cannot edit/delete shared Universe relationship definitions.
- [ ] Compare direct, prior-evidence and unknown endpoints; record custom properties and explicit unknowns; reorder conflicting expectations. Ensure the UI never invents intermediate causes or labels absent state as unchanged.
- [ ] Edit directed/undirected/self relationships; change labels at later milestones; inspect unknown-before-context states, archived/recovered contexts and missing entities. Inspect SVG readability and filtering with larger worlds.
- [ ] Link several Book perspectives to one event; explicitly confirm canonical promotion; verify no automatic publication and no perspective overwrite after editing/archiving shared history. Alternate/Standalone promotion must remain unavailable.
- [ ] Type rapidly then navigate, close, create a Vault backup and activate/restore it in disposable fixtures. Verify latest acknowledged planning data, unchanged manuscripts and current active-notebook selection. Simulate write permissions/disk-full/locked-file errors and retry; compare canonical files and rebuilt index.
- [ ] Test an external concurrent catalog edit, duplicate/malformed/future metadata, canceled queued changes and lost IPC acknowledgement. Preserve data and verify explicit reload/repair instructions rather than reset.
- [ ] Exercise catalogs near practical size limits and long timelines. Measure typing/save latency and graph/scroll responsiveness; no upper-bound performance claim is made by the 200-node unit fixture.

## Limits and deliberate deferrals

The catalog is one full-file snapshot per queued edit, bounded to 8 MiB and 30,000 identified records. Discovery scans Lorebook files. Timeline pages show 40 milestones; graphs show 12 focused edges with progressive matching lists. This favors maintainable canonical storage over a graph database, graph-layout engine or speculative infrastructure. Large-world editing latency needs native measurement. Unknown/missing references are retained and warned; there is no automatic repair or inference. Reload is explicit after external entity changes.

Universe/Book identity is added beside legacy labels; there is no hierarchy rebuild, automatic duplicate-name merge or migration of manuscript metadata. Timeline order is linear, with no calendar math, branching simulation or cross-Book state fusion. Initial relationship corrections can intentionally alter the original record, while later changes belong on milestones. Shared event promotion is explicit copying/linking, not synchronization. Deletion is archival with recovery, not destructive history erasure.

Echo Library is foundation only: entity IDs, timeline context, histories, classifications and shared-event references are retained. Entity detection in prose, hover references, AI checks/suggestions, contradiction resolution and background scanning are deferred. No cross-studio links, cloud integration, new export workflow or unrelated cipher changes were implemented.

No native Tauri interaction or new visual QA was performed; compilation/SSR are not desktop verification. **READY WITH WARNINGS** means ready for review and native acceptance, not a published or manually certified release.
