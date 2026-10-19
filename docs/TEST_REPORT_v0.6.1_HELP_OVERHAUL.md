# v0.6.1 Help & Guide Documentation Overhaul

> Historical implementation record. Original results/recommendations below apply to that pass, not current release acceptance. See the [documentation index](README.md) and [current system design](../SYSTEM_DESIGN.md). Source line labels are historical; file links open current files.

Date: 2026-10-19 (Asia/Shanghai). Windows / PowerShell.

## Outcome and inspection

Extended the existing Help dialog into a bundled offline manual: seven chapters and 35 numbered sections. Inspected the current Help registry/provider, contextual notes, onboarding state/tests, App/AppLayout navigation, creation form, Poetry, Emotional Cipher, Philosophy, Lorebook, Web of Thought, Vault preview/activation controls, Settings paths, README, SYSTEM_DESIGN and prior test reports before implementing.

The source is authoritative. The manual distinguishes implemented behavior from gaps: Lorebook creation offers Universe / Setting, but the writing toolbar does not edit Book/Chapter breadcrumb metadata; Form and counts do not validate meter/rhyme; there is no document trash browser, Philosophy export toolbar, generic import wizard, automatic plot inference, encryption or cloud backup. No new studio, notebook model, document API or migration was introduced.

## Complete table of contents

Numbers below are derived from the same chapter/section order used by the app. Stable IDs in parentheses are internal maintenance references and are not shown as technical instructions in the UI.

### 1. Getting Started

- 1.1 Understanding Notebooks (`start`)
- 1.2 Creating and Opening Documents (`create-documents`)
- 1.3 Saving and Organizing Work (`saving`)
- 1.4 Understanding the Interface (`interface`)

### 2. Poetry Studio

- 2.1 Writing Poetry (`poetry`)
- 2.2 Poetic Forms and Writing Aids (`poetry-forms`)
- 2.3 Emotional Cipher Overview (`cipher`)
- 2.4 Quick, Random and Manual Cipher (`cipher-modes`)
- 2.5 Cipher Keys and Decoding (`cipher-keys`)
- 2.6 Importing and Exporting Poems (`poem-files`)
- 2.7 Sharing .mccipher Packages: Sender to Receiver (`cipher-sharing`)

### 3. Philosophy Studio

- 3.1 Freeform Writing (`philosophy`)
- 3.2 Structured Reasoning (`reasoning`)
- 3.3 Organizing Philosophical Entries (`philosophy-organization`)

### 4. Lorebook Studio & Web of Thought

- 4.1 Universes, Books and Chapters (`lorebook`)
- 4.2 Lore Entities and Attributes (`lore-entities`)
- 4.3 Introduction to Web of Thought (`web`)
- 4.4 Story Nodes and Timeline Planning (`story-nodes`)
- 4.5 World-State Changes and Comparisons (`world-state`)
- 4.6 Entity Relationships (`relationships`)
- 4.7 Canonical, Alternate and Standalone Books (`continuity`)
- 4.8 Shared Universe Events and Promotion (`shared-events`)
- 4.9 Tutorial: Plan a Beginning and Ending Before the Middle (`web-example`)

### 5. The Vault

- 5.1 Creating Backups (`vault`)
- 5.2 Verifying Backups (`vault-verify`)
- 5.3 Restoring to a Separate Folder (`vault-separate`)
- 5.4 Activating a Restored Notebook (`vault-active`)
- 5.5 Recovery and Safety Precautions (`vault-safety`)

### 6. Document Management

- 6.1 Tags, Favorites, Recent and Sorting (`organization`)
- 6.2 Import, Export and Backup: Choosing the Right Action (`document-files`)
- 6.3 Archiving and Recovery (`archive-recovery`)

### 7. Shortcuts and Troubleshooting

- 7.1 Keyboard Shortcuts (`shortcuts`)
- 7.2 Common Problems (`troubleshooting`)
- 7.3 Understanding Error Messages (`errors`)
- 7.4 Data Safety and File Locations (`file-locations`)

## Presentation and navigation

- Chapter buttons have expanded state and controlled panels; selecting any section reveals its chapter. Existing studio/context IDs still resolve. Unknown sections visibly fall back to Getting Started.
- Search covers chapter titles, section titles/numbers, instructional headings, keywords, prerequisites, steps, examples, results, warnings and optional notes. Matching is case/accent insensitive and all query tokens must occur in the section. Results display both chapter and subsection; selecting one clears search and opens the normal hierarchy at that section.
- Breadcrumbs, active-section styling, internal related buttons and Previous/Next use stable IDs. Previous/Next crosses chapters and disables at the manual boundaries. Expanded chapters and last selected section live in the provider for the current app session. Explicit contextual entry points may select their own target. Query and active reading position are not saved across dialog closes.
- Each section includes Overview, When to use it, Before you begin, Step by step, Worked example, Understanding the result, Common mistakes and Related sections. Longer technical explanations are closed optional notes, not prerequisites for beginner reading.
- The existing Gilded Identity tokens, theme resolution, visible focus and reduced-motion styling remain. A bounded reading width, spaced numbered instructions and restrained example treatment improve readability. On narrow windows the chapter area is height-limited above the independently scrollable reader.
- Tab/Shift+Tab containment now includes optional-note summaries and excludes collapsed panels/closed note contents. Search starts focused. Ctrl+F/K stays in Help, Escape closes it and focus returns to a still-connected invoking control. Ctrl+S/Q retain existing save/exit behavior. No arrow-key tree widget is claimed: navigation uses ordinary labeled buttons with Tab and Enter/Space.

## Expanded instructional examples

### Eryndor: endpoints first, then the middle

The complete ten-step tutorial explicitly labels all example records as optional instructional content. For practice the author creates Kingdom of Eryndor through Ctrl+N, chooses Lorebook, enters Eryndor in Universe / Setting and uses Other Element as an appropriate entry type. It explains how to initialize the planning desk explicitly, select/create Eryndor and The Fall of Eryndor, refresh entities and attach an unassigned entry.

The author creates The Golden Age with Add Beginning Story Node and records the kingdom's status with New value Peaceful and no prior expectation. Then Add Ending Story Node creates The Fall, where status has previous expectation Peaceful and New value Destroyed. Compare Story Nodes selects the opposite endpoint, and the reader checks the column headings. Insert after on The Golden Age adds The Betrayal afterward.

The guide explains that unknown is not unchanged, an ending expectation does not backfill an earlier observation, reordering retains references on their original nodes while recomputing order-sensitive evidence, and no missing event or cause is invented. Reading, searching and following manual links never creates any of those records.

### Emotional Cipher: sender to receiver

The manual first teaches Quick existing-word swaps, Random vocabulary substitution and Manual rules via Add Rule, then explains preview versus committed poem-specific keys. A reusable dictionary is not the exact recovery record for every poem. Rerolling does not recover an earlier key.

The sender reviews a Quick result and exports .mccipher before optionally choosing Save Ciphered Poem & Key. Saving selects a new document, so the manual warns against assuming a later encoding preview is the same original result. The receiver opens Emotional Cipher from Poetry, chooses Decode Poem and Import & Decode (.mccipher), which imports the matching key and saves a verified recovered original. The alternative Import Cipher Package saves the encoded poem and key first, followed by a separate Save Decoded Poem as New Document action. Import Key (.mckey) imports only a key. Plain .txt, metadata-bearing .md, .mcpoem, .mckey and .mccipher are explicitly distinguished.

Mismatches instruct the author to preserve the exact file and locate the matching key or sender's unchanged package. Best-effort output is not verified original recovery. A package includes its key and is creative obfuscation, not secure encryption. No app-based sending or online sharing service is promised.

## Data safety and compatibility

No canonical Markdown, SQLite, planning namespace, document API, autosave queue, Vault protocol, native Rust behavior or key format changed in this overhaul. Help imports no notebook service and has no mutation command. The manual and glossary compile into the frontend without a dependency or network fetch. Existing Help entry points, contextual notes and the opt-in walkthrough are retained; the existing walkthrough's six-step wording and completion preference are not reset or migrated.

The workspace already contained uncommitted prior milestone work and an IDE-file change. They were retained. Tests operate on temporary fixtures, not the user's real library. No commit, push, tag or publication was performed.

## Verification

| Command | Final result |
|---|---|
| `npx tsc --noEmit` | PASS, exit 0. |
| `npm test` | PASS: **190 tests**, **11 suites**, **0 failed**, **0 skipped/cancelled/todo**. |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS with approved execution: **77 tests**, **0 failed** (64 library + 3 thinking_desk + 10 workshop; main/doc tests 0). |
| `npm run build` | PASS, exit 0; TypeScript + Vite 6.4.4, **1,640 modules**. Final main JavaScript **530.96 kB**, gzip **151.30 kB** (including the final Tauri before-build rerun). Vite reports its over-500-kB chunk advisory. |
| `npm run tauri -- build --debug --no-bundle` | PASS, exit 0; native Windows Tauri debug executable at `target/debug/meta-cognition-notebook.exe`. The frontend before-build step also passed. No installer bundle or app launch was performed. A successful rerun reported an incremental-cache hard-link fallback to file copying; it did not prevent the build. |
| `npx tsx --test tests/v061_help.test.ts tests/v061_manual.test.ts` | PASS after the final key-generation and export-before-save workflow clarification: **28 tests**, **0 failed**. |
| `git diff --check` | PASS, exit 0; Cargo.lock's existing LF/CRLF advisory may appear. |

Eleven additional manual tests cover hierarchy renumbering after insertion, chapter toggles and selection/reveal, full nested search, result routing, all related-link targets, previous/next boundaries, structured block rendering, Eryndor ordering and observations, complete Cipher/format distinctions, truthful unsupported-feature guidance, focus-target filtering and offline/no-command rendering of all 35 sections. The 17 existing Help/walkthrough tests remain, updated for the larger hierarchy and split topic destinations. The other studio, autosave/immediate-exit, cipher, Vault, recovery and planning tests remain enabled.

Initial verification findings, corrected before the final pass: TypeScript required explicit block narrowing in heading search; focused Help tests initially had three old-content/wording assertions, updated for the chapter structure; a first full frontend run had 189 pass / 1 fail due to a misencoded accented query in the new test, repaired as UTF-8. The initial sandboxed Rust run had 9 pass / 55 fail because Windows temporary fixture operations were blocked. The required approved rerun passed all 77 without changing Rust code or weakening assertions.

These are renderer/helper and existing regression checks, not interactive browser or native keyboard tests. No native UI, screen-reader, installed-app, OS restart or first-time-writer session was performed for this change.

## Files modified in this overhaul

- `src/help/manual.ts` (new): structured seven-chapter author manual.
- `src/help/content.ts`: derived numbered guides, content blocks, search, related/adjacent routing, chapter transitions; retained glossary.
- `src/components/common/HelpCenter.tsx`: hierarchy, search result labels, breadcrumbs, block rendering, related/adjacent navigation, session state and hidden-target focus handling.
- `src/index.css`: hidden chapter-panel safety and navigation text wrapping.
- `tests/v061_manual.test.ts` (new): eleven manual regressions.
- `tests/v061_help.test.ts`: existing coverage adapted to the hierarchy without changing walkthrough behavior.
- `package.json`: register the new test file; no dependency/version change.
- `README.md`, `SYSTEM_DESIGN.md`, `docs/TEST_REPORT_v0.6.1.md`, this report: implemented behavior, architecture, report cross-reference and exact verification.

## Manual desktop acceptance still required

Use a disposable notebook for any author-data practice. Reading-only checks can start with all writing Saved and a file snapshot.

1. Disconnect networking. Open Help via expanded/collapsed sidebar, F1, Studio guide and Web/Vault links; verify correct chapter expansion and all 35 readable sections.
2. Collapse several chapters, select related/previous/next sections and search for a term found only in an optional note. Confirm active highlighting, chapter/subsection labels, clear search behavior and session expansion state after close/reopen.
3. Use Tab/Shift+Tab, Enter/Space, Ctrl+F/K and Escape. Confirm collapsed children and closed note bodies are skipped, summaries remain reachable, heading focus follows section selection and invoking focus returns safely. Check with a screen reader.
4. Inspect Dark, Light and System themes, narrow windows, 100-200% scaling and reduced motion. Check both navigation and article scrolling, comfortable reading width and no hidden-panel bleed-through.
5. Have a first-time author follow section 4.9 without external documentation: explicitly create the optional Eryndor records, record both endpoint states, compare, then insert The Betrayal. Check references and recomputed evidence after reorder. This is the primary usability acceptance and remains unproven until performed.
6. In disposable Poetry documents, follow sections 2.4/2.5/2.7: save a ciphered copy, export/import the exact key, exchange a package through both import paths and verify mismatch guidance without replacing original writing.
7. Exercise the retained walkthrough's Back/Next/Skip/Finish/restart, switch studios/notebooks and reopen after completion. Ensure no forced tutorial and no stale focus into another notebook.
8. With all writing Saved, compare notebook files before/after reading all guidance, searching and navigating links without clicking author-data controls. No Eryndor or Cipher example should be written automatically. Smoke-test typing, opening/closing Help and normal save/exit separately.

## Limitations and recommendation

Manual content is bundled English and must be maintained with UI changes. Search is token matching across a section, not semantic search or user-document search. Chapter expansion and last section persist only for the app session; no cross-restart reading-position bookmark or tutorial-progress validator was added. Optional example creation remains manual, with no sample-project generator. The expanded bundled content triggers Vite's non-fatal chunk-size advisory; no heavy renderer was added. Native visual/accessibility acceptance and an unaided first-time-author trial remain outstanding.

**READY WITH WARNINGS for manual acceptance**, not a claim that beginner usability or native desktop behavior has been verified. No release was created.
