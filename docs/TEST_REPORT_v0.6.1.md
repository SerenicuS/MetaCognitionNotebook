# v0.6.1 — Help Center & Guided Onboarding

> Historical implementation record. Original results/recommendations below apply to that pass, not current release acceptance. See the [documentation index](README.md) and [current system design](../SYSTEM_DESIGN.md). Source line labels are historical; file links open current files.

Current Help content and verification are superseded by [the documentation overhaul report](TEST_REPORT_v0.6.1_HELP_OVERHAUL.md), including the complete seven-chapter, 35-section table of contents. The initial onboarding implementation record below is retained.

Date: 2026-10-19 (Asia/Shanghai). Windows / PowerShell. Recommendation: **READY WITH WARNINGS** for review and native usability acceptance. No commit, push, tag or release was created.

## Inspection and scope

Reviewed App/AppLayout navigation and shortcuts, Settings/Vault, Lorebook and Web of Thought controls, Poetry/Cipher import-export terminology, Philosophy introduction, localStorage theme settings, shared design tokens, README/SYSTEM_DESIGN and latest verification reports. The existing planning model, Rust persistence commands, save queues, notebook activation protocol and backup format were retained.

The source had no integrated Help Center. Web of Thought placed continuity, shared history, relationships and detailed state evidence alongside the initial milestone workflow. This change adds bundled guidance and progressive disclosure, rather than introducing a new planning store, migration or dependency. Existing pending v0.6.0 work and the pre-existing IDE-file modification were retained.

## Implemented guides

Sidebar **Help & Guide** is the global entry. **Studio guide** and F1 select the current studio; Web of Thought and Vault have direct context links. Unknown guide IDs fall back visibly to Getting started. Search covers titles, tags and full guide text, supports multiple case-insensitive terms and gives a clear empty result/Clear search action. Documentation is compiled into the frontend with no remote fetch or network dependency.

Ten guides each answer what, when, how, a concrete example and mistakes to avoid:

1. Getting started: notebooks, documents, library and saves.
2. Poetry Studio and stanza writing.
3. Emotional Cipher, matching keys and recovery packages.
4. Philosophy freeform/structured writing.
5. Lorebook entries, hierarchy labels and entity identity.
6. Web of Thought beginning-to-ending workflow.
7. Vault backup, separate extraction and active recovery/restart.
8. Poem Import/Export formats and their difference from notebook backups.
9. Existing keyboard shortcuts and Help-specific navigation.
10. Failed saves, unknown/conflicting state, missing references and safe recovery troubleshooting.

Guide language uses actual application controls. The beginner terminology updates are reflected in the guides: Compare Story Nodes, Create or rename a Universe / Book, Add Book, Add Beginning Story Node and Add Ending Story Node. No guide promises unsupported cloud, encryption, automatic plot generation, sample installation or automatic continuity repair.

## Beginner presentation and walkthrough

- Beginner view is the default. Universe/Book choice, creation, beginning/ending milestones, entity changes and comparison are primary. Relationships are available through Show advanced tools; continuity, optional date/status, shared history/promotion and full evidence remain in secondary expandable sections. Beginner view reverses the presentation. No feature or stored data is removed.
- Beginning/Ending buttons call the existing node creation/insertion path only on an author's explicit click, using generic titles. Selecting a Universe/Book, opening Help, starting a tutorial or showing a step does not create milestones or copy Eryndor into the notebook.
- The inline, opt-in six-step walkthrough has progress, Back, Next, Skip, Finish and restart. It never opens automatically. Starting it reveals beginner controls for the session without overwriting a separately saved advanced-mode preference. Navigation does not require authors to create data simply to read the tutorial.
- Show this step uses explicit component refs/view callbacks, not DOM selectors or automated clicks. It can reveal relevant sections and focus controls. Missing/disabled/detached controls give instructional fallback; incomplete Universe/Book/node setup is explained rather than guessed around.
- Leaving the component discards active tour state. Notebook context changes close/reset it; the component is keyed by the active notebook path. No active step or notebook-specific data is persisted.
- `mc_thought_help_v1` stores version, beginner/advanced mode and unseen/skipped/completed status via the same localStorage settings approach used for theme. Completion/Skip reread the current mode to avoid clobbering it. Invalid/future/blocked storage falls back safely; write failures are reported as session-only. Preferences are profile/origin-local and excluded from portable Vault backups.
- Eryndor, The Fall of Eryndor, Peaceful → Destroyed and The Great Betrayal appear only in clearly labeled tutorial instructions/examples. No sample-project generator or sample write action was added.

A first-use problem exposed by the tutorial was addressed: a new Universe may have no attached entities, leaving Record entity change disabled. The view now explains why and provides a read-only Refresh lore entries action. Users can create a Lorebook entry, refresh the list and explicitly attach an unassigned entry through the existing membership control. Refresh does not assign membership or write data automatically. Guidance explains that a previous-value expectation at the ending does not backfill the beginning's known state.

## Contextual help and accessibility

Ten explicitly toggled question-mark notes explain Universe Timeline, Book Timeline, Story Node, World State, State Comparison, continuity classifications, Entity Relationship, Shared Universe Event, promotion and unknown/conflicting state. Controls have accessible names, unique controlled-note IDs, expanded state, descriptions when open and Escape dismissal. Notes start hidden; an explicit CSS rule prevents utility classes from inadvertently displaying hidden content.

Help has labeled dialog/search/navigation/article structure, initial search focus, Tab/Shift+Tab wrapping, Escape/Close, guide-selection heading focus and restoration of the invoking control if it is still available. The writing application is inert while the Help dialog is open. Ctrl+F/K searches guides; background create/search dialogs are suppressed, while Ctrl+S/Q retain the normal save/exit path. Vault work closes Help. The walkthrough is an inline panel, not another forced modal. Visible focus, responsive wrapping/scrolling, existing Dark/Light/System tokens and scoped reduced-motion rules are included.

These are implemented behaviors with automated helper/markup coverage. Actual browser/native focus, screen-reader announcements, theme appearance and first-time-writer comprehension require the manual checks below.

## Automated verification

| Command | Exact result |
| --- | --- |
| `npx tsc --noEmit` | PASS, exit 0; no diagnostics, including final changes. |
| `npm test` | PASS: **179 tests**, **11 suites**, 179 passed, 0 failed/canceled/skipped/todo. Includes 17 new Help/onboarding tests and all earlier suites. Final serial rerun passed. |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS: **64** library unit tests + **3** thinking_desk + **10** workshop integration tests = **77 passed**, 0 failed/ignored. Main and doc-test targets each contain 0 tests. |
| `npm run build` | PASS, exit 0; TypeScript + Vite production build, **1,639 modules** transformed. |
| `cargo build --manifest-path src-tauri/Cargo.toml --offline` | PASS, exit 0; native debug executable build. No installer or GUI acceptance implied. |
| `git diff --check` | PASS, exit 0; final documentation check repeated. Existing Cargo.lock LF/CRLF advisory may appear. |

Rust tests used disposable fixture notebooks/databases/archives and approved execution for existing Windows atomic-rename tests. No native destructive tests were run on the user's real library. No new Rust persistence logic or test-only relaxation was introduced. Frontend runs were serial to avoid the existing wall-clock autosave test's known sensitivity to simultaneous compiler load; no assertion was weakened.

New tests cover complete offline guide structure, full-text search, studio/context selection, rendered navigation/search/dialog sections, missing-guide fallback, focus-wrapping logic, next/back/finish/skip/restart, completion persistence, advanced-mode preservation, malformed/unavailable preference storage, notebook-context reset, reduced beginner view composition, no-write initial rendering, tutorial-only examples, missing/disabled/detached/renamed focus targets, contextual-note accessibility attributes and opt-in Help rendering.

The existing Web of Thought state/reference/persistence, Vault verification/recovery, Emotional Cipher and Poetry/Philosophy/Lorebook regression suites remain enabled and pass. SSR/helper tests are not end-to-end keyboard or screen-reader verification. The no-write tests and architecture cover guidance; explicit author actions such as Create planning desk, Add Book and Add Beginning Story Node still intentionally write normal notebook data.

## Changed-file inventory for v0.6.1

- `src/help/content.ts`: bundled guides, glossary, search and guide routing.
- `src/help/onboarding.ts`: versioned preferences, walkthrough state transitions, view choices and safe target focusing.
- `src/components/common/HelpCenter.tsx`: Help provider/dialog, search/navigation, focus handling and contextual disclosures.
- `src/components/studios/ThoughtWalkthrough.tsx`: opt-in, restartable six-step instruction panel.
- `src/components/studios/WebOfThought.tsx`: beginner presentation, guide/ref integration, explicit beginning/ending controls, contextual help and read-only entity refresh.
- `src/components/layout/AppLayout.tsx`, `src/App.tsx`, `LorebookStudio.tsx`: Help entry, studio routing/shortcuts, active-notebook context and provider integration.
- `src/components/common/VaultPanel.tsx`: contextual backup/recovery guide link.
- `src/index.css`: token-based Help controls, visible focus, hidden-note safety and reduced-motion rules.
- `tests/v061_help.test.ts`, `package.json`: 17 new tests and test registration.
- `package-lock.json`, `Cargo.lock`, native/frontend manifests, Settings version footer and version assertions: 0.6.1 alignment; no dependency added or upgraded.
- `README.md`, `SYSTEM_DESIGN.md`, this report: actual workflows, architecture, current roadmap and verification limits.

The canonical planning schema/source, document APIs, database migrations, Vault storage design, cipher implementation and other studio writing logic were not redesigned. The workspace also contains earlier uncommitted v0.6.0 changes. `.idea/MetaCognitionNotebook.iml` was already modified and was left untouched.

## Manual acceptance — still required

Use a disposable notebook/account. Do not run destructive acceptance against the real library.

- [ ] Offline: launch with networking unavailable. Open Help & Guide from expanded/collapsed sidebar, Studio guide from all studios, F1 and Web/Vault context links; verify correct guide selection, search, zero-result messaging and readable examples.
- [ ] Keyboard/screen reader: search focus, Tab/Shift+Tab containment, heading focus after selection, Escape, invoking-control restoration, labeled question-mark notes and their expanded descriptions. Verify Ctrl+F/K stays in Help and Ctrl+S/Q preserves the normal save/exit behavior.
- [ ] First-time author: without README/system documentation, create/select a Lorebook entry, open Web of Thought, opt into guidance, select/create Universe and Book, add beginning/ending, record endpoint state, compare, and insert a middle node. Confirm that no date or graph/database knowledge is required.
- [ ] No sample writes: with all writing already Saved, capture notebook files before Help/tutorial use; exercise Next/Back/Show this step/Skip/Finish/restart without clicking data-changing controls. Files and index must remain unchanged. Eryndor text must remain instructional only.
- [ ] New-Universe path: confirm disabled Record entity change explains missing membership. Create a new lore entry, refresh and explicitly attach it; verify refresh itself is read-only and the beginning can record Peaceful separately from ending Destroyed.
- [ ] Switch between beginner/advanced modes; confirm relationships, continuity, shared events/promotion, dates/status and evidence remain reachable and unchanged. Starting guidance should reveal beginner controls while preserving a separately saved advanced-mode preference.
- [ ] Finish/Skip then close/reopen the application and different notebooks. No forced walkthrough should reappear. Switch studios/leave the view mid-tour and perform active notebook recovery in disposable fixtures; no stale panel or focus action should affect another notebook.
- [ ] Dark/Light/System, narrow windows, 100–200% scaling and reduced motion: inspect readable guide layouts, scrolling, focus visibility, non-spamming contextual notes and comparison controls.
- [ ] Regression smoke: type then open Help/close normally, retry a failed save, verify Vault extraction versus active recovery, decode an existing Cipher poem, and reopen the notebook. All writing/metadata must remain preserved.

## Limits and release recommendation

Guides are bundled English text and require a source update when labels/workflows change; no online documentation fetch, localization system or guide authoring UI was added. Search is over ten built-in guides, not user documents. The tutorial gives instructions, not automatic progress validation or a sample project. It can be completed without writing data. Missing controls use fallback text rather than forced DOM actions. Onboarding settings follow browser-origin/profile storage availability; they are not notebook metadata or Vault content.

No actual native UI, screen-reader or first-time-author session was performed. The build and automated results support review, while the primary usability acceptance criterion still needs the practical author test above. **READY WITH WARNINGS**, pending native accessibility, visual and beginner-workflow acceptance.
