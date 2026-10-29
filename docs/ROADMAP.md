# Development roadmap

Current development milestone: **v0.8.0-beta.4 — The Living Continuity (Prerelease / In Acceptance)**.
Last established release: **v0.6.2 — The Living Universe**. Version labels identify engineering milestones, not published distributions or release dates. Automated implementation evidence and native acceptance are separate; see the [documentation index](README.md) and technical reports.

## Milestone states

In MetaCognition Notebook development, milestones and capabilities are classified into explicit states:
- **Implemented**: Source code and architectures are implemented in the codebase.
- **Automated verification passed**: Comprehensive automated tests (Rust cargo tests, Clippy, TypeScript typecheck, Node/tsx suites, production build) pass cleanly.
- **Manual Windows acceptance pending**: Native desktop verification (UI rendering, focus, windowing, restart, file-system edge cases) is awaiting formal manual verification in the standalone installed application.
- **Planned**: Scoped design goals scheduled for subsequent phases or milestones.
- **Deferred**: Exploratory or future features without finalized technical designs or version commitments.

---

## v0.8.0-beta.4 — The Living Continuity (Current Prerelease Milestone)

**User-Facing Label**: v0.8.0 Beta 4  
**Overall Status**: Implemented; Automated verification passed (183/183 Rust tests, 644/644 frontend tests across 47 test suites, TypeScript clean, Vite production build clean, Windows NSIS installer packaged); Manual Windows desktop acceptance pending.

MetaCognition Notebook v0.8.0 Beta 4 (*The Living Continuity*) establishes comprehensive universe-wide historical state tracking in Web of Thought and connects milestone save points directly to chapter drafting and live Echo dossiers, alongside full-fidelity Portable Universe exchange and reader-facing Lorebook publication.

### Core Capabilities in Beta 4
- **Web of Thought Historical State Engine (W1)**: Pure deterministic milestone state resolution engine with predecessor inheritance, cycle-free ancestry validation, status presets (`Alive`/`Deceased`, `Active`/`Fallen`, `Operational`/`Destroyed`), custom statuses, provenance tracking (`explicit`, `inherited`, `unknown`, `unassigned`, `not_yet_introduced`), and non-destructive change records in `StoryNode.changes`.
- **Universe State Explorer (W2)**: Milestone-by-milestone state matrix inside Lorebook's Universe Dashboard, category status presets, custom status assignment modal with author notes, and "What Changed?" diff mode.
- **Alternate and Nested Continuities (W3)**: Support for explicit alternate branches (`Branch` model in `thought.rs` and `thought.ts`), divergence save points, state inheritance across divergence points, isolated branch histories, cycle-free validation, Book branch linking, and the "Compare Timelines" diff engine across any two milestones.
- **Historical Milestone Comparison**: Side-by-side comparative diffing distinguishing value modifications, provenance differences, and unassigned/introduced states across canonical history and alternate branches.
- **Echo Library Chapter Historical Context (W4)**: Chapter milestone binding in frontmatter (`milestone_id`), cached $O(1)$ state resolution, and direct "Inspect in Web of Thought" action. *(Extends implemented Echo Library E0–E2.5; does not replace it).*
- **Historical Entity Dossiers**: CodeMirror 6 floating reference dossiers displaying the entity's exact historical state, origin provenance, and author change notes for the active chapter's milestone.
- **Portable Universe Archive & Safe Import (L0–L2b)**: Versioned `.mcuniverse` packages with SHA-256 integrity, read-only inspection, safe import planning (`Preserve Identities` collision checks vs `Separate Copy` UUID remapping), durable staging journals (`portable_universe_import_journal.json`), and startup crash recovery.
- **Reader-Facing Lorebook Publication (L3a–L4)**: Curated Markdown (`.md`) and styled PDF (`.pdf`) publication using a shared intermediate document model, strict field privacy allowlists (stripping internal IDs, paths, private notes), spoiler milestone cutoffs, and preflight font glyph analysis.
- **Milestone Creation and Entity State Assignment Fixes**: Inline first milestone creation in empty universes; canonical Lorebook document auto-registration in `plan.entities` without duplicate ID generation; backend validation in `thought.rs` enforcing Universe ID and House ownership via SQLite index; consolidated header navigation.
- **Documentation and Stability Improvements**: Complete system design synchronization, 11-chapter (43 sections) offline manual, verified test suites, clean typechecking, and production packaging.

> **Clarification on Echo Library Roadmap**:
> - **Echo Library E0–E2.5 (Implemented):** Live Lorebook recognition, boundary-aware name/alias scanning, interactive ambiguity resolution, floating contextual dossiers, CodeMirror 6 integration, user recognition toggle, and distraction-free chapter writing.
> - **Echo Historical Context W4 (Implemented):** Connects chapter drafting to historical milestones, enriching dossiers with historical states.
> - **Echo Library E3 (Planned):** Persistent, writer-bound explicit references permanently linking prose spans to entity IDs are **not** implemented in Beta 4 and remain scheduled for future engineering.

### Phase implementation breakdown

| Phase | Scope & Implementation Details | Status |
| --- | --- | --- |
| **Phase C1 — Character Profile Refinement** | Practical character encyclopedia profiles (`role`, `primary_faction_id`, `aliases`); canonical `metadata.attributes: LorebookAttribute[]` custom parameters; backward-compatible extraction supporting legacy `custom_fields`; freeform Markdown biography preservation. | Implemented; Automated verification passed |
| **Phase C2 — Faction Organizations & Official Positions** | Optional faction organizational structure with nested branches (`FactionBranch`); official positions (`FactionPosition`) with title, rank, and UUID-bound `holder_ids`; derived reverse lookup (`getCharacterHeldOffices`) showing institutional roles across factions. | Implemented; Automated verification passed |
| **Phase C3 — Relationship Consistency & Web of Thought Cohesion** | Unified relationship ownership in `plan.relationships` (`_web_of_thought.md`); bi-directional synchronization between guided affiliation fields and canonical relationships; reciprocal perspective projection; duplicate entry prevention. | Implemented; Automated verification passed |
| **Phase C4 — Web of Thought Graph Readability** | Focused Entity mode (depth-1 direct neighbors) and Full Universe mode; category-styled geometric SVG nodes and icons; tabular connection inspection; collapsible read-only faction hierarchy view. | Implemented; Automated verification passed |
| **Phase E0/E1 — CodeMirror 6 Editor Foundation** | Fast, extensible CodeMirror 6 editor engine ([MarkdownEditor.tsx](../src/components/editor/MarkdownEditor.tsx)); SaveCoordinator integration with 1200ms debounce; manual `Ctrl+S` immediate flush; non-destructive visual decoration foundation. | Implemented; Automated verification passed |
| **Phase E2 — Live Lore Recognition & Contextual Dossiers** | Boundary-aware mention scanner with longest-match precedence; recognition of canonical names and aliases; CodeMirror 6 `ViewPlugin` and `RangeSet` ephemeral decorations; floating contextual reference dossiers; interactive ambiguity resolution. | Implemented; Automated verification passed |
| **Phase E2.5 — Chapter Editor Integration & Production Acceptance** | In-situ chapter drafting canvas in Book View ([BookView.tsx](../src/components/studios/lorebook/BookView.tsx)); distraction-free chapter editing in Lorebook Studio; user recognition toggle (`mc_echo_recognition_active`); keyboard shortcut (`Alt+E` / `Mod-Shift-E`); focus restoration on dossier dismissal; strict universe scoping; production Windows NSIS installer build. | Implemented; Automated verification passed; Manual Windows acceptance pending |
| **Milestone M1 — Writing Atmosphere & In-App Guide Refresh** | Lightweight, local-first ambient music player reading user-imported audio files (`.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`, `.aac`) from application-managed `Music/` folder (`lofi/`, `medieval/`, `scifi/`); persistent playback across all navigation; strict offline privacy & path traversal security; updated 11-chapter (43 sections) in-app Help & Guide covering Houses, CodeMirror soft wrapping, Lorebook, Echo Library, and Writing Atmosphere. | Implemented; Automated verification passed |
| **Phase W0 — Web of Thought Architecture Audit** | Universe State Explorer vs. relationship graph realignment; historical save points model; category presets; non-destructive state changes decoupled from canonical document Markdown. | Implemented; Architectural alignment approved |
| **Phase W1 — Historical Milestone State Engine** | Tested pure state resolution engine in [stateEngine.ts](../src/utils/stateEngine.ts); milestone predecessor inheritance; cycle-free ancestry validation; explicit/inherited/unknown/unassigned/not-yet-introduced provenance; non-destructive change records in `StoryNode.changes`. | Implemented; Automated verification passed |
| **Phase W2 — Universe State Explorer UI** | Universe State Explorer in Universe Dashboard ([UniverseStateExplorer.tsx](../src/components/studios/lorebook/UniverseStateExplorer.tsx)); milestone-by-milestone state matrix; category status presets and custom status dialog; "What Changed?" predecessor diff mode. | Implemented; Automated verification passed |
| **Phase W3 — Alternate Continuities & Branching** | Explicit alternate historical branches (`Branch` model in `thought.rs` and `thought.ts`); branch divergence from milestone; state inheritance across divergence points; branch isolation; cycle-free ancestry validation; "Compare Timelines" diff engine; Book branch linking. | Implemented; Automated verification passed |
| **Phase W4 — Echo Historical Awareness & Chapter Context** | Chapter milestone binding in frontmatter (`milestone_id`); cached O(1) state resolution in [stateEngine.ts](../src/utils/stateEngine.ts); historical dossier section in [EchoDocumentationPopup.tsx](../src/components/echo/EchoDocumentationPopup.tsx) with state/provenance/notes; direct "Inspect in Web of Thought" action; strict House and Universe isolation. | Implemented; Automated verification passed |
| **Post-W4 Stabilization & Isolation Safeguards** | Empty-state first milestone creation inline modal; canonical Lorebook document auto-registration in `plan.entities` without duplicate ID generation; backend validation in `thought.rs` enforcing Universe ID and House ownership via SQLite index; consolidated header navigation. | Implemented; Automated verification passed |
| **Phase L0 — Portable Architecture & Storage Audit** | Pre-implementation verification of canonical Markdown storage, Web of Thought shared catalog, House ownership boundaries, and packaging invariants. | Implemented; Architectural audit approved |
| **Phase L1 — Portable Universe Export & Inspection** | Version 1 `.mcuniverse` archive generation (`portable.rs`); strict ZIP Stored entry validation (`validate.rs`); SHA-256 manifest integrity; selective Book/Chapter inclusion; read-only package inspection (`portable_universe_inspect`). | Implemented; Automated verification passed |
| **Phase L2a — Safe Import Planning & Identity Remapping** | Read-only import preview (`portable_universe_import_preview`); package compatibility preflight; separate-copy operation identity namespace; `Preserve Identities` collision preflight; schema-accurate reference remapping across entities, chapters, milestones, branches, and relationships. | Implemented; Automated verification passed |
| **Phase L2a.1 — Import Safety Gate** | Verification of retry idempotence, operation ID lifecycle, collision rejection, and reference remapping alignment (`milestone_id` vs `milestone_ids`, branch divergence hierarchies, faction positions). | Implemented; Correctness gate passed |
| **Phase L2b — Durable Import Commit & Recovery** | Backend-authoritative commit (`portable_universe_import_commit`); destination House assignment; staging journal (`portable_universe_import_journal.json`); automatic roll-forward/rollback recovery on startup (`portable_universe_recover_imports`); Web of Thought catalog merge. | Implemented; Automated verification passed |
| **Phase L3a — Reader Lorebook Markdown Publication** | Reader-facing Markdown export (`publish_lorebook_markdown`); shared structured model (`PublicationDocument`); strict privacy allowlist stripping internal IDs, file paths, and private notes; spoiler milestone cutoff; clear distinction from backup archives. | Implemented; Automated verification passed |
| **Phase L3b — Reader Lorebook PDF Publication** | Print-ready multi-page PDF generation (`publish_lorebook_pdf`); cover page, table of contents, category chapters, faction hierarchy trees, and timelines; standard PDF Type 1 font (Windows-1252) preflight glyph analysis; visible `[?]` substitutions; author confirmation gate. | Implemented; Automated verification passed |
| **Phase L4 — Desktop UI Integration & Acceptance** | Two distinct Lorebook Dashboard actions (Export/Import Universe vs Publish Lorebook); 9-step guided import wizard (`PortableUniverseModal.tsx`); publication modal (`LorebookPublicationModal.tsx`) with format selection, category toggles, preview, and glyph warnings; save-flush coordination; native file dialogs. | Implemented; Automated verification passed; Manual Windows acceptance pending |

---

## v0.7.0 — House of Thoughts (Implemented / In Stabilization)

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

## Planned versioned milestones & future candidates

The milestones and candidates below represent planned engineering work. **They are not implemented in the current codebase.**

### Echo Library E3 — Persistent Explicit References & Advanced Context
- **Status**: Planned; requires dedicated design review before implementation.
- **Scope**:
  - Writer-controlled explicit entity binding: permanently attaching a specific span of prose to a stable Lorebook entity UUID.
  - Persistent disambiguation across editing sessions, text refactoring, and application restarts.
  - Richer contextual navigation: jump from a reference directly to the entity's Lorebook document or timeline appearances.
  - Markdown-safe reference persistence: storing reference bounds in frontmatter or validated non-destructive syntax.

### Web of Thought Polish
- **Status**: Planned.
- **Scope**:
  - Improved edge routing algorithms to minimize crossing lines in dense entity clusters.
  - Enhanced label collision avoidance and font readability at low zoom levels.
  - Refined focused exploration modes without changing canonical relationship semantics.

### Poetry Studio — Emotional Cipher Enhancement
- **Status**: Planned.
- **Scope**:
  - Per-stanza manual ciphering: allowing writers to customize substitutions stanza by stanza.
  - Differential mapping: repeated words across different stanzas may receive distinct cipher mappings.
  - Optional whole-poem cipher mode alongside stanza-specific modes.
  - Preservation of existing poem content, original text recovery, and backward compatibility with `.mckey` / `.mccipher` files.

### Manuscript Tools Expansion
- **Status**: Planned.
- **Scope**:
  - EPUB compilation and ebook metadata packaging. *(Note: Unified Markdown and jsPDF compilation are currently implemented).*
  - Revision snapshot history: inspecting meaningful draft revisions over time.

### v0.9.0 — Conversation Archive
- **Status**: Planned.
- **Scope**:
  - Dedicated, isolated environment for importing, indexing, and organizing local conversation archives from AI platforms.
  - Completely decoupled from authoring studio documents and private manuscripts.

### v1.0.0 — The First Edition
- **Status**: Planned.
- **Scope**:
  - Comprehensive production hardening, complete manual Windows acceptance, final packaging, and intended public installer distribution.

---

## Future studio development — versions not assigned

- **Location Sketchboard**: Spatial visual planning and sketching board for worldbuilding locations and regional maps.
- **Philosophy Studio Expansion**: Further development of Argument Web, including premise-conclusion chains and philosophical research notes.
- **Notes Studio**: Fast scratchpad and informal note-taking with minimal mandatory metadata.
- **Essay Studio**: Dedicated composition environment supporting analytical essays, formal correspondence, and personal letters.
- **Safe Universe Reset and Deletion**: Recoverable reset and permanent deletion workflows governed by durable journaling.

## Deferred / Exploratory architecture

- Cloud storage synchronization (Google Drive, Dropbox) remains deferred; MetaCognition Notebook prioritizes local-first canonical files.
- Transparent encryption at rest for Vault backups and local documents.
- High-volume library performance optimization (multi-thousand document indexing and search benchmarks).
- Rich collaborative conflict resolution.
