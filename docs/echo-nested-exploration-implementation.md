# Echo Nested Lore Exploration — implementation and acceptance

Implemented against `0.8.0-beta.4` on 2026-10-31. No version bump or release was made. The pre-existing untracked architecture audit was preserved.

## Implemented behavior

Authors can inspect an editor reference, activate names embedded in the dossier overview, explore deeper, and use Back, Forward or breadcrumbs within one surface. New navigation after Back discards the Forward branch. History retains at most 50 visits, indicates truncation, and allows continued exploration and deliberate cycles. Visits retain UUID, section and preview scroll, without canonical bodies or rendered trees.

Duplicate titles/aliases produce an in-surface chooser with permitted names, categories and UUID suffixes. Self mentions remain ordinary text, while a collision with another eligible UUID still permits that other entry. Existing relationship buttons now navigate by `targetId`, never a first-match title lookup. Hover opening, cascading popovers, pin requirements and side-panel docking are not included.

The overview's existing React Markdown subset is retained. Discovery runs on visible text leaves after factory-template suppression, including bold/italic text, headings, quotes and lists. Inline/fenced code, literal HTML tags, Markdown link/image syntax and destinations do not become Echo controls. HTML is escaped; no `dangerouslySetInnerHTML` or general Markdown engine was added. Prose is selectable, preview scrolling is independent, mouse selection does not activate references, and native button keyboard activation remains available.

Loading, empty bodies, unavailable entries and read failures with Retry are distinct states. No shared entity object is mutated to cache prose. Bodies are fetched lazily for the active UUID, with no neighbor prefetch or global/persistent body cache.

## Identity, eligibility and isolation

`echoContext.ts` uses the existing `classifyLoreDocument` ownership contract, with an additional denial for a malformed registry claiming a Universe in multiple Houses:

- Valid same-House Universe UUIDs resolve normally. Invalid/foreign explicit UUIDs never fall back to names.
- Legacy names must be unique in the correct House. Missing House uses `house-default`, not universal access.
- Catalog-only ownership is accepted consistently with Lorebook navigation. Conflicting registrations or ownership are denied.
- Existing author Echo `metadata.archived` behavior is preserved. No new private/spoiler flags, draft/speculative restrictions, Universe archive policy, or publication filtering were introduced.

Production session identity includes notebook key, original source UUID, normalized House, resolved source Universe, original chapter milestone, author-policy identifier, catalog identity/revision and editor engine. The session object is frozen. Sidebar browsing scope and the preview target never determine authorization. Source-context or catalog changes hide/unmount the old surface immediately and invalidate its requests, history and chooser. Catalog-only response ownership uses the same classifier as initial eligibility.

Secondary dossiers are projected only for the active visit, from eligible documents and allowed relationship endpoints. Office/roster lookups exclude denied or archived sources; foreign holders are not resolved into labels or UUID placeholders. An endpoint newly discovered to be missing/ineligible is removed from subsequent secondary projections and chooser discovery for the session. Unavailable targets show a neutral identity/category rather than their title, alias, snippet, profile, historical note or relationship information.

Before each read, the target must exist in the source catalog. After completion, the loader verifies response UUID, document type, House, Universe and existing archive policy. Request generations plus session/catalog identity prevent publication of stale responses after rapid navigation, close/reopen or source switches. IPC work that has already started is not physically cancelled; obsolete results are discarded.

Reader publication, Portable Universe v1, Vault formats and backend canonical storage remain unchanged. There are no automatic relationships, persistent prose references, Markdown rewrites, migrations or new tables.

## Editor preservation and integration

Both production hosts use the shared implementation: Lorebook Studio and Book View's chapter editor. Source chapter milestone context is supplied in both hosts when valid. Historical badges stay rooted in that chapter while the canonical body and static relationships are explicitly labeled as canonical information, not historical reconstructions. Explicit Web of Thought inspection retains original Universe, branch/milestone and current target UUID.

Exploration does not alter the source UUID/key, editor value, engine, studio, House or Universe. It dispatches no prose edits, save operations, relationship mutations or Recent-opening actions. Existing writer autosave may finish normally. The mounted EditorView and its undo/redo remain in place. Inspection avoids native pointer caret movement; Close/Escape return focus without a selection transaction, while intentional live cursor/scroll changes remain authoritative. Outside pointer dismissal does not refocus over the clicked editor/control. Session invalidation never focuses an obsolete view.

The fallback textarea supports Inspect lore at cursor, Alt+E and Mod-Shift-E using the same controller; it never switches engines or adds a fake decoration overlay. Native content/selection/scroll and Ctrl+S are retained. Packaged native undo/clipboard/IME behavior remains in the manual checklist below.

The portal attaches inside the application boundary that inherits Vault/recovery `inert` blocking, outside studio overflow containers. The nonmodal dialog retains visible navigation/Close/Return controls while its body scrolls independently. Escape cancels a chooser first, otherwise closes. Initial keyboard inspection focuses the heading; native buttons support Tab, Enter and Space.

## Files

| Area | Added/modified files |
| --- | --- |
| Shared discovery and authorization | Added `src/utils/echoMatching.ts`, `src/utils/echoContext.ts`; adapted `src/utils/echoLore.ts` and `src/components/echo/echoExtension.ts`. |
| Exploration UI | Added `src/components/echo/EchoExploration.tsx`, `src/components/echo/explorationState.ts`; extended `EchoDocumentationPopup.tsx`, `EchoClarificationModal.tsx`; corrected the prototype's UUID callback and kept its mock body independent of canonical reads in `EchoEditorPrototype.tsx`. |
| Production hosts | Updated `src/components/editor/MarkdownEditor.tsx`, `src/components/studios/LorebookStudio.tsx`, `src/components/studios/lorebook/BookView.tsx`, `UniverseDashboard.tsx`, and the inert portal boundary in `src/App.tsx`. |
| Tests and performance | Added `tests/echo_nested_exploration.test.ts`, `tests/fixtures/echoNested.ts`, `tests/browser/echo-nested.html`, `tests/browser/echo-nested.tsx`, `scripts/benchmark-echo-nested.ts`; included the new suite in `package.json`. Updated the Help test to require actual inspect shortcuts, navigation instructions and fallback guidance. |
| Documentation | Updated `README.md`, `src/help/manual.ts`, and `docs/ROADMAP.md`; added this report. The audit was not rewritten. |

## Verification

Baseline inspection confirmed no application-source drift from the audit, and confirmed the two production Echo hosts. The original six focused suites passed **82 tests**, with zero failures before implementation.

Commands executed:

```powershell
# Baseline
node_modules/.bin/tsx.cmd --test tests/echo_editor_prototype.test.ts tests/phase_e2_live_lore_recognition.test.ts tests/phase_e2_5_chapter_editor_integration.test.ts tests/issue_a_b_wrapping_dossier.test.ts tests/phase_w4_echo_historical_context.test.ts tests/acceptance_remediation.test.ts

# Existing focused suites plus new nested-exploration coverage
node_modules/.bin/tsx.cmd --test tests/echo_nested_exploration.test.ts tests/echo_editor_prototype.test.ts tests/phase_e2_live_lore_recognition.test.ts tests/phase_e2_5_chapter_editor_integration.test.ts tests/issue_a_b_wrapping_dossier.test.ts tests/phase_w4_echo_historical_context.test.ts tests/acceptance_remediation.test.ts

# Documentation and new focused coverage
node_modules/.bin/tsx.cmd --test tests/echo_nested_exploration.test.ts tests/writing_atmosphere_and_help.test.ts

# Complete frontend suite and production build
npm.cmd test
npm.cmd run build
node_modules/.bin/tsc.cmd --noEmit
git diff --check

# Disposable browser harness and reproducible in-memory benchmark
node_modules/.bin/vite.cmd --host 127.0.0.1 --port 5174
node_modules/.bin/tsx.cmd scripts/benchmark-echo-nested.ts
```

Focused suites: **101 passed, 0 failed**. Documentation/new-feature focused check before the final parity addition: **28 passed, 0 failed**. Full frontend suite: **714 passed, 0 failed**, including 19 new nested-exploration unit tests. TypeScript and production build pass; Vite reports a large-chunk warning, without a build failure. `git diff --check` passes.

The initial full-suite sandbox run reported **674 passes and 21 failures**, caused by `EPERM` atomic rename operations in existing temporary-file persistence fixtures. The full suite was rerun with authorized access outside that sandbox; all 714 tests passed. An early renderer compatibility assertion also caught a literal-HTML tokenization regression; rendering was corrected and the original assertion retained. Browser history tests were corrected to target prose rather than same-text breadcrumbs; scroll comparisons use a subpixel tolerance rather than assuming integer browser coordinates.

No Rust source, command signature, schema or persistence behavior was changed, so no separate Rust suite was invoked for this frontend change. Frontend validation is not a claim of packaged Windows acceptance.

### Browser acceptance

Open `/tests/browser/echo-nested.html` on the local Vite server. The harness mounts the actual production editor/dossier and actual Lorebook Studio/Book View hosts, uses disposable in-memory data, stubs writes defensively, and leaves a production editor available for interactive exploration. It includes Abyssals, Vibrant Land, Empyreans, duplicate names, cycles, foreign and archived targets, a missing entry, Retry and a long dossier. No canonical notebook is opened.

The 28 browser scenarios cover:

- Three-level navigation, stable surface/EditorView identity, Back/Forward/breadcrumbs and branch truncation.
- In-surface ambiguity with focus/Escape, UUID relationship navigation and self/circular references.
- Section/body-scroll restoration, multiple source selections, unsaved text, undo/redo and deliberate cursor movement.
- Safe formatted rendering, inert code/HTML/destinations, unauthorized targets and selectable text without accidental navigation.
- Deferred-promise races, close/reopen, moved/missing entries, Retry, same-ID notebook/House changes, catalog refresh and Echo disable.
- Chapter historical context, both production hosts, fallback Inspect/save shortcut, engine changes and recovery-boundary inheritance.
- Narrow geometry, reachable navigation controls, no writes/Recent/document-open side effects, and explicit Open Entry/Web of Thought callbacks.

**Final browser results: 28/28 scenarios passed at 320×700, and 28/28 passed again at 1280×800.** Navigation/Close/Return geometry was checked after the final layout refinement. Real browser key input additionally verified Alt+E, Enter and Space navigation. Programmatic selection checks establish selectable prose; they do not substitute for native system clipboard or screen-reader acceptance.

### Performance evidence

Reproducible fixture: 40,000-word bodies, 7,500 repeated name/long-alias matches, 100/1,000/10,000 registered entities. Each measurement is one local run, not a portable performance guarantee.

| Entities | Catalog build | Cold scan | Warm scan |
| ---: | ---: | ---: | ---: |
| 100 | 5.65 ms | 47.60 ms | 25.31 ms |
| 1,000 | 12.78 ms | 36.39 ms | 25.04 ms |
| 10,000 | 166.30 ms | 39.61 ms | 35.04 ms |

The original large alternation scan took about 3,207 ms at 1,000 entries and did not complete the 10,000-entry scan during the observation interval; that benchmark was interrupted. This justified a small indexed matcher change: test distinct normalized term lengths at the same Unicode boundaries, using longest-first lookup and preserving confirmed-range overlap semantics. Generated parity tests compare it with the former regex scanner, in addition to the existing recognition suites. No trie, worker or recursive traversal was introduced.

Catalog ownership registrations are indexed once. Rich offices/relationships are projected for the current visit, instead of repeatedly scanning the full Lorebook for every indexed entity. The term index is memoized per catalog. Bodies are loaded lazily and history is lightweight. Highly varied term lengths, very large relationship graphs, real IPC latency and packaged memory use still require representative product profiling.

## Packaged Windows acceptance — outstanding

No packaged installer or Windows WebView application was launched. Use a disposable notebook with two Houses/Universes and the browser fixture's equivalent authored entries; do not run repairs/migrations. Perform this checklist before release:

1. In Lorebook Studio and in a Book chapter, make an unsaved edit, multiple CodeMirror selections and a nonzero editor scroll; inspect Abyssals, navigate three levels, cycle, Back/Forward and close. Verify identical active UUID, draft, selections, scroll, undo/redo and EditorView lifetime.
2. Repeat in manual-save mode, during a pending autosave, and with a save error. Only already scheduled writer saves may finish; exploration must not flush or start saves, mutate the plan, or update Recent.
3. Use Alt+E and Mod-Shift-E, Tab/Shift+Tab, Enter/Space, chooser Escape and dossier Escape. Verify focus return, no focus trap, and preservation of intentional source caret movements. Test IME composition and Windows screen-reader names/loading announcements.
4. Drag-select/copy prose containing references with Ctrl+C; paste into a disposable text field and verify the copied text. Confirm no navigation from selection. Test long body scrolling and Back restoration with mouse wheel, touchpad and keyboard.
5. Check approximately 320×700, normal desktop, Windows scaling/zoom and live resize. Confirm header/Close/Return controls remain reachable, no studio clipping, and independent body scrolling.
6. Test identical titles/alias collisions, rename, archived/deleted/moved targets, invalid explicit ownership, ambiguous House-local legacy names and catalog-only ownership. Confirm no foreign title/snippet/relationship/organization metadata appears.
7. Switch House, notebook, engine and Echo preference with a request pending; refresh after Portable Universe import and perform approved Vault/restart recovery in the disposable notebook. Verify old history/results disappear and overlays inherit blocking. This checks integration; it does not authorize a repair or format change.
8. Confirm chapter badges retain milestone/continuity at every hop while prose remains canonical. Explicit Open in Lorebook and Inspect in Web of Thought must use normal guards and the intended UUID/context.
9. Repeat fallback textarea Inspect while testing native undo/redo, caret/selection, scroll, save shortcut and Ctrl+C. No engine switch should occur.
10. Compare canonical Markdown/frontmatter, plan relationships/ownership, SQLite schema, publication output, portable packages and Recent before/after exploration alone. They must be unchanged. Keep already scheduled autosave activity separate.

## Deferred capabilities and limitations

Persistent UUID prose bindings remain planned in the roadmap. Dynamic text discovery does not survive rename as a durable author binding. Hover opening, a docked panel, reader-facing Echo, historical prose reconstruction and Living Entity States are deferred. Author Echo does not acquire publication privacy/spoiler semantics.

Catalog/source updates intentionally end the exploration session rather than trying to preserve potentially stale history. An already issued IPC read may finish in the background, but cannot publish into a newer session. There is no cross-session body cache. The fallback has caret inspection rather than inline decorations. Packaged Windows clipboard/native undo/IME/screen-reader and restore/import workflows remain outstanding.

Implementation stops at code, documentation and validation. No schema or canonical notebook data was changed; no version bump, commit, push, tag or release was performed.
