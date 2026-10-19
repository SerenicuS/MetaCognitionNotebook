# v0.6.2 Documentation Audit & Synchronization

Date: 2026-10-19 (Asia/Shanghai). Documentation and Help wording only; no new application feature, persistence change, migration, commit, push, tag or release.

## Findings and corrections

| Finding | Source checked | Correction |
| --- | --- | --- |
| README badge said proprietary/unlicensed; closing text only intended MIT | [LICENSE](../LICENSE) | Identify the actual MIT license; retain factual Gemini Antigravity / OpenAI assistance disclosure without certification claims |
| Automatic saving described as unconditional and 400 ms | [savePreferences.ts](../src/utils/savePreferences.ts), [App.tsx](../src/App.tsx), Settings and save tests | Describe Automatic default 3 seconds, configurable 1–10, Manual Save/Ctrl+S, navigation/exit guards and independent metadata commands |
| Export was both implemented and described as wholly unavailable | Poetry, Cipher and [LorebookStudio.tsx](../src/components/studios/LorebookStudio.tsx) | Separate individual poem/Lore/key/package formats from future Manuscript exports; Philosophy export remains absent |
| Planning described as free-text labels, SQLite relationship cache and a 12-edge graph | [thought.rs](../src-tauri/src/thought.rs), [universe.ts](../src/utils/universe.ts), relationship/graph utilities and components | Document canonical catalog, ownership IDs, legacy resolution, semantic relationships, current 240-edge view and complete records |
| Old automatic merge / child plan mirror claims contradicted current save path | App save handlers, [autosave.ts](../src/services/autosave.ts), queue regressions | Explain acknowledged App state, ordered transforms/snapshots, revision rejection, retained retries and explicit cancellation; old helper existence is not an active merge guarantee |
| Fixed Documents path and separate-only recovery contradicted active selection | [lib.rs](../src-tauri/src/lib.rs), [notebook.rs](../src-tauri/src/notebook.rs), [vault.rs](../src-tauri/src/vault.rs) | Distinguish default/selected root, new-slot index, preservation backup, journal publication, write barrier, restart and startup recovery |
| Atomicity, privacy, performance and verification claims exceeded evidence | Storage/organization/native guards, Tauri CSP, current regression report | State resource boundaries, archive partial failures, unencrypted files/backups, null CSP and pending native acceptance; remove unsupported resource benchmarks/security guarantees |
| Help tutorial used removed Universe / Setting creation input and confused Book controls with detailed desk | CreateDocumentModal, BookView, LorebookStudio, WebOfThought | Start with Universe creation, then Faction/Book; explicitly enter Web of Thought for observation/comparison controls; preserve tutorial endpoint order |
| README roadmap omitted v0.5.2/v0.6.2 and still called v0.5.1 current | Manifests, footer and milestone reports | Restore historical sequence and current stabilization status; retain v0.7–v1.0 direction; Notes/Essay receive no invented version |
| Duplicate design sections, broken/machine-specific links and obsolete line references | Root Markdown, all docs reports and current file tree | Consolidate current design, add index/roadmap, use repository-relative links; historical line labels explicitly remain historical |

## Organization and files updated

- [README](../README.md): public identity/status, three studios, shared storage/tools, Vault workflow, verified development commands, limits, roadmap and license/assistance. It links technical detail rather than duplicating the architecture.
- [SYSTEM_DESIGN](../SYSTEM_DESIGN.md): current architecture/data-flow diagram; model/ownership table; source and command map; frontmatter/schema; organization/search; studios/Cipher; planning/continuity; reciprocal semantics; queues/revisions; graph; archive/failure boundaries; Vault selection/startup; Help/preferences; operational limits. Detailed existing organization, portable-format, activation, emblem and Help material is retained and reconciled.
- [Documentation index](README.md) and [roadmap](ROADMAP.md): current guidance/evidence separated from historical reports and unimplemented milestones.
- Historical reports from v0.3.0 through earlier v0.6.2 passes, plus the Lorebook UX audit: visible historical scope notices; machine-specific source links made portable where present. Original results and recommendations are retained. In particular, old merge and failure-discard descriptions are explicitly superseded. The Graph & Safety report remains the latest full implementation evidence.
- [manual.ts](../src/help/manual.ts) and [onboarding.ts](../src/help/onboarding.ts): wording only; seven chapters, 35 stable section IDs and walkthrough behavior retained. Updated Universe/Book/entity paths, reciprocal Members/control/leadership, graph controls/limit, Undo and manual-save instructions. Existing archive/Vault safeguards and related navigation remain.
- [Help regression tests](../tests/v061_manual.test.ts): two documentation regressions cross-check actual Book/desk controls, save defaults, relationship navigation and limits. Existing tests were retained.
- [Local documentation checker](../scripts/check-documentation.mjs): built-in Node filesystem checks for relative links/Markdown heading anchors, source file existence, machine-specific URIs, seven version locations, package scripts and MIT license. It does not fetch external URLs or touch a notebook.

The working tree already contained implementation changes from earlier v0.6.2 work. This audit preserves those changes and does not claim that every file in git status originated here.

## Validation performed for this pass

| Command / review | Result in this pass |
| --- | --- |
| `node scripts/check-documentation.mjs` | PASS: 21 Markdown files, 193 local links/anchors, seven version locations, package commands and MIT license; no missing local target/heading or machine-specific file URI |
| `npx tsx --test tests/v061_help.test.ts tests/v061_manual.test.ts` | PASS: 30 tests, 0 failures/cancellations/skips/todos, 0 suites; final run 6366.7448 ms. Existing 28 tests and two new documentation regressions all pass |
| `npx tsc --noEmit` | PASS, exit 0, no diagnostics |
| `git diff --check` | PASS, exit 0; existing CreateDocumentModal LF-to-CRLF advisory only, no whitespace errors |
| Source/model/diagram review | Checked Tauri/React/Rust/index boundaries, canonical JSON, scope/ownership, save/revision queues, graph controls, archive guards and activation journal against current source; no schema or runtime logic changed |

Help tests cover all 35 sections, seven-chapter numbering, related references, search, Previous/Next navigation, offline rendering, focus-target helpers and walkthrough behavior. Source references are portable current-file links; historical line labels are intentionally not asserted as current line locations. Manifest versions and Settings footer all read 0.6.2; dependencies retain their own unrelated versions.

## Evidence boundaries and remaining work

The [Graph & Safety implementation report](TEST_REPORT_v0.6.2_GRAPH_SAFETY.md) records **295 frontend tests**, **83 Rust tests**, TypeScript/frontend build and unbundled native debug build passing at that stage. Those are historical results, not reruns by this documentation task. Original earlier totals (including 199/77) remain labeled as historical.

No native desktop UI, installed build, visual/accessibility or Windows failure-injection session was performed in this pass. Rust tests, full production/native builds and installer checks were not needed for wording/link/test-only changes and were not rerun. External URLs were not network-verified. The Mermaid diagram was checked against source flow; no renderer/screenshot verification is claimed.

Remaining implementation/documentation boundaries are explicit: Book workspace and detailed planning desk still expose different control sets; conflict recovery requires preserving intended edits and retry/cancel/reapply, not automatic merging; entity archive has no durable intent journal or one-click document recovery; dense graphs and maximum catalog/search performance need native evaluation; older strict planning versions may reject archived Universe metadata. No application behavior was changed to hide these discrepancies.

Manual acceptance should follow the [current Windows checklist](TEST_REPORT_v0.6.2_GRAPH_SAFETY.md#manual-windows-qa-still-required), including first-Universe creation, both save modes, reciprocal views, graph keyboard/pointer/theme behavior, archive failures and Vault restart recovery. Read through the revised Help tutorial in a disposable notebook and verify its labels with a first-time author. Do not use the real library for failure injection.

Recommendation: documentation is synchronized for contributor review, subject to the checks below. **v0.6.2 still requires manual Windows acceptance and release approval.** This audit does not authorize or create a release.
