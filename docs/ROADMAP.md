# Development roadmap

Current development milestone: **v0.7.0 — House of Thoughts (In Stabilization / Unreleased)**.
Last established release: **v0.6.2 — The Living Universe**. Version labels identify engineering milestones, not published distributions or release dates. Automated implementation evidence and native acceptance are separate; see the [documentation index](README.md) and technical reports.

## Milestone states

In MetaCognition Notebook development, milestones and capabilities are classified into explicit states:
- **Implemented**: Source code and architectures are implemented in the codebase.
- **Automated verification passed**: Comprehensive automated tests (Rust cargo tests, Clippy, TypeScript typecheck, Node/tsx suites, production build) pass cleanly.
- **Manual Windows acceptance pending**: Native desktop verification (UI rendering, focus, windowing, restart, file-system edge cases) is awaiting formal manual verification.
- **Planned**: Scoped design goals scheduled for subsequent phases or milestones.
- **Deferred**: Exploratory or future features without finalized technical designs or version commitments.

---

## v0.7.0 — House of Thoughts (Current Milestone)

**Overall Status**: Implemented; Automated verification passed (107/107 Rust tests, 352/352 frontend tests, Clippy clean, Vite production build clean); Manual Windows acceptance pending.

The House of Thoughts workstream introduces logical workspace boundaries ("Houses") above authoring Studios without restructuring physical Markdown storage.

### Phase implementation breakdown

| Phase | Scope & Implementation Details | Status |
| --- | --- | --- |
| **Phase 1 — House Ownership Foundation** | Top-level `house_id` frontmatter attribute; default resolution to `house-default`; SQLite schema v2 migration (`documents.house_id`, `idx_documents_house_id`); legacy document byte preservation on disk; Vault catalog compatibility. | Implemented; Automated verification passed |
| **Phase 2 — Canonical House Registry** | `house_registry` stored inside `library/library.json` preserving top-level `"version": "1.0"`; atomic read-modify-write with in-process `registry_lock`; corrupt registry backup to `library/Backups/` with in-memory fallback; default House archive protection; universe-to-house mapping enforcing Invariants L1–L7; Vault capture lock ordering (`db` -> `registry_lock`). | Implemented; Automated verification passed |
| **Phase 3A — House-Scoped Operations** | Scoped backend commands (`create_document`, `list_documents`, `search_documents`); frontend `selectLibrary` house filtering; contract correction rejecting malformed or empty explicit house IDs; cross-House manuscript candidate discovery. | Implemented; Automated verification passed |
| **Phase 3B-1 — Safe Single-Document Moves** | `move_document_to_house` command; atomic canonical frontmatter rewrite first, derived SQLite index second; target House enabled-studio validation; protection of `_web_of_thought` catalog and universe-bound lore entities; `coordinateDocumentMove` save flushing and command serialization. | Implemented; Automated verification passed |
| **Phase 3B-2 — Coordinated Universe Moves** | Durable multi-document operation journal (`library/.operations/universe_move_journal.json`); 4-stage progression (`Prepared` -> `RegistryUpdated` -> `FilesWritten` -> `IndexUpdated` -> `Completed`); deterministic roll-forward recovery (`recover_universe_move`) on startup and reindex; pre-write live rollback; Vault backup barrier during active moves; `inspect_house_integrity` detection. | Implemented; Automated verification passed |
| **Phase 4 — House-First UI & Navigation** | `HouseSwitcher` workspace selector in Region A; active House persistence (`mc_active_house_id`); `handleSwitchHouse` mandatory `flushSave` barrier; studio enablement gating authoring studios and empty state cards; user-facing move dialogs (`MoveDocumentModal`, `MoveUniverseModal`); `HouseManagementModal` (Active, Archived, and Integrity & Health tabs). | Implemented; Automated verification passed |
| **Phase 4 Acceptance Fixes — Scoped Counts & Isolation** | `computeStudioCounts` strictly scoped to active House documents, excluding `_web_of_thought`; badge counts strictly display `0` when a studio has 0 documents in the active House; `performSelectCategory` searches strictly within `houseDocuments`, preventing foreign-House document selection; Manuscript Tools repositioned to `House Tools` subsection with `optional` indicator, gated by `isManuscriptEnabled(activeHouse)`. | Implemented; Automated verification passed |

---

## Implemented historical milestones

| Version | Milestone | Implemented scope / evidence |
| --- | --- | --- |
| v0.1.0 | The Foundation | Tauri/Rust, SQLite index, canonical Markdown and IPC; foundation retained in current source |
| v0.2.0 | The Three Studios | Poetry, Philosophy and Lorebook; retained in current source |
| v0.2.1 | Phase 2A Reliability | Save/close coordination; retained autosave regression suite |
| v0.3.0 | The Gilded Identity | Branding, themes and desktop ergonomics; [report](TEST_REPORT_v0.3.0.md) |
| v0.3.1 | The Thinking Desk | Freeform Philosophy and optional reasoning roles; [report](TEST_REPORT_v0.3.1.md) |
| v0.4.0 | The Writer's Workshop | Tags, Favorites, sort/filter and opening-based Recent; [report](TEST_REPORT_v0.4.0.md) |
| v0.5.0 | The Vault | Local verified backups and separate-folder recovery; [report](TEST_REPORT_v0.5.0.md) |
| v0.5.1 | The Vault Recovery Polish | Preserved notebook selection, restart and startup recovery; [report](TEST_REPORT_v0.5.1.md) |
| v0.5.2 | The Emotional Cipher | Poem-specific keys, Key Library and portable Cipher files; [report](TEST_REPORT_v0.5.2.md) |
| v0.6.0 | Web of Thought | Milestones, sparse world-state evidence and shared history; [report](TEST_REPORT_v0.6.0.md) |
| v0.6.1 | Help Center & Guided Onboarding | Offline hierarchical Help and opt-in walkthrough; [overhaul report](TEST_REPORT_v0.6.1_HELP_OVERHAUL.md) |
| v0.6.2 | The Living Universe | Universe-first worldbuilding, Books/Chapters, reciprocal links, graph and archive safeguards; last established release |
| v0.6.3 / v1.0-prep | Philosophy Studio: Argument Web | Document-local visual thinking graph, Main Thesis, argument passages, directional relations, two-tier source validation, non-judgmental structural insights |

---

## Planned versioned milestones

| Version | Direction | Status |
| --- | --- | --- |
| **Manuscript Tools Expansion** | Cross-Studio outline tree expansion, rich reading order sequencing, word count analytics, revision snapshot history, EPUB compilation. *(Note: Unified Markdown and jsPDF compilation are currently implemented; EPUB export and revision snapshot history remain planned).* | In Progress / Planned |
| **Poetry Studio Expansion** | Emotional Cipher manual per-stanza substitutions, rhyme scheme analysis, meter cadence assistance. | Planned |
| **v0.8.0 — Echo Library** | Lorebook mention linking, contextual previews and richer explicit entity references, building on existing stable entity IDs. | Planned |
| **v0.9.0 — Conversation Archive** | Separate optional import/indexing of conversation logs from AI platforms; isolated from authoring studios. | Planned |
| **v1.0.0 — The First Edition** | Production hardening, complete Windows acceptance, packaging, and intended public installer distribution. | Planned |

---

## Future studio development — versions not assigned

- Philosophy Studio expansion beyond current freeform and role-based blocks.
- Notes Studio for scratchpad writing.
- Essay Studio supporting essays **and letters**.
- Further Poetry Studio writing and analysis improvements.

## Deferred / Exploratory architecture

- Cloud storage synchronization (Google Drive, Dropbox) remains deferred; MetaCognition Notebook prioritizes local-first canonical files.
- Transparent encryption at rest for Vault backups and local documents.
- High-volume library performance optimization (multi-thousand document indexing and search benchmarks).
- Rich collaborative conflict resolution.
