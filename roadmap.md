
# MetaCognition Notebook — Development Roadmap

> **A private space for poetry, philosophy, worldbuilding, and the thoughts in between.**

**Last established release:** v0.6.2 — The Living Universe<br />
**Current development milestone:** v0.8.0-beta.4 — The Living Continuity (Prerelease / In Acceptance)
**Project status:** Active development / pre-1.0  
**Platform focus:** Windows desktop  
**Architecture:** Tauri 2, Rust, React, TypeScript, SQLite, Markdown  
**License:** MIT

---

## 1. Project Vision

MetaCognition Notebook is a local-first creative writing and thinking environment designed to give different forms of expression their own dedicated workspace.

Rather than treating every idea as an interchangeable note, MetaCognition Notebook organizes writing into specialized studios.

The long-term vision is to provide a unified environment for:

- Poetry and emotional expression
- Philosophy and critical thinking
- Fictional universes and worldbuilding
- Personal notes and research
- Essays, letters, and structured writing
- Creative reflection and idea development
- Long-form manuscript creation
- Personal knowledge and writing archives

The application should remain useful without cloud accounts, subscriptions, or mandatory online services.

### Core Principles

1. **Local-first ownership** — User writing belongs to the user and remains accessible through local files.
2. **Creative specialization** — Different writing forms deserve interfaces designed for their workflows.
3. **Interconnected thinking** — Related ideas, characters, works, and concepts should be connectable without forcing everything into one structure.
4. **Durable information** — Preserve stable identities, historical context, and recoverable data.
5. **Calm design** — Prioritize writing, reading, reflection, and navigation over unnecessary interface complexity.
6. **Transparency** — Clearly distinguish implemented features from experimental or planned functionality.
7. **Sustainable development** — Prefer maintainable systems and safe incremental improvements over feature accumulation.

---

## 2. Roadmap Status Definitions

| Status | Meaning |
|---|---|
| Completed | Implemented and included in the development history |
| Stabilization | Implemented, but still undergoing testing, fixes, or acceptance |
| Planned | An established future development milestone |
| Proposed | A desired expansion without a finalized version assignment |
| Exploratory | An idea requiring design and feasibility evaluation |
| Deferred | Intentionally postponed until dependencies or priorities permit |

A milestone being implemented does not automatically mean it has been publicly released.

Features may be revised, postponed, or removed following technical evaluation and usability testing.

---

## 3. Development Milestones

| Version | Milestone | Status |
|---|---|---|
| v0.1.0 | Foundation | Completed |
| v0.2.0 | Three Studios | Completed |
| v0.2.1 | Reliability Improvements | Completed |
| v0.3.0 | Gilded Identity | Completed |
| v0.3.1 | Thinking Desk | Completed |
| v0.4.0 | Writer's Workshop | Completed |
| v0.5.0 | Vault Backup and Restore | Completed |
| v0.5.1 | Vault Recovery Polish | Completed |
| v0.5.2 | Emotional Cipher | Completed |
| v0.6.0 | Web of Thought | Completed |
| v0.6.1 | Help Center and Guided Onboarding | Completed |
| v0.6.2 | The Living Universe | Completed (Last established release) |
| v0.7.0 | House of Thoughts | Implemented (Unreleased; In Stabilization; Acceptance Pending) |
| v0.8.0 | The Living Continuity (v0.8.0-beta.4) | Implemented Preview (E0–E2.5, M1, W0–W4, L0–L4 Implemented; Acceptance Pending) |
| v0.9.0 | Conversation Archive | Planned |
| v1.0.0 | First Edition | Planned |

The version assignments above preserve the established roadmap. Later sections contain additional proposals that have not yet been assigned release numbers.

---

# PART I — ESTABLISHED MILESTONES

## 4. v0.1.0–v0.6.1: Foundation and Creative Infrastructure

**Status:** Completed

These milestones established the core desktop application and its creative-writing infrastructure.

### Foundation

- Desktop application architecture
- Local notebook storage
- Markdown-based writing
- Document organization and navigation
- SQLite-backed indexing
- Foundational editing and persistence

### Three Studios

- Poetry Studio
- Philosophy Studio
- Lorebook Studio
- Studio-specific writing workflows

### Reliability Improvements

- Improvements to document persistence
- Reliability and regression testing
- Safer document handling
- General application stability

### Gilded Identity

- Charcoal, antique-gold, and ivory visual identity
- Consistent typography and layout
- Light, Dark, and System theme support
- Refined navigation and writing presentation

### Thinking Desk and Writer's Workshop

- Expanded writing and thinking workflows
- Studio-specific editing improvements
- Writing organization and supporting utilities

### The Vault

- Local notebook backup
- Backup verification and restore workflows
- Recovery and relocation support
- Additional recovery safeguards

### Emotional Cipher

- Creative substitution-based poetry transformation
- Cipher key management
- Supported cipher import/export formats
- Poetry-oriented experimentation

**Important:** Emotional Cipher is a creative writing feature, not cryptographic encryption.

### Web of Thought

- Stable Universe and Book identities
- Worldbuilding entity registration
- Relationships between lore entities
- Universe history and Book timelines
- Story Nodes and milestone context
- Canonical, Alternate, and Standalone continuity
- Planning metadata preserved in canonical notebook storage

### Help Center and Guided Onboarding

- Integrated user guidance
- Studio-specific instructions
- Navigation and workflow explanations
- Help content supporting the application's established features

Historical implementation details and test evidence remain in their corresponding development reports.

---

## 5. v0.6.2 — The Living Universe

**Status:** Stabilization / Manual acceptance pending

### Objective

Transform Lorebook Studio into a more coherent Universe-centered worldbuilding environment.

### Worldbuilding Organization

- Universe selection and management
- Characters
- Locations
- Factions and Nations
- Rules and Systems
- Cultures and History
- Artifacts
- Other Lore
- Books and Stories
- Chapters
- Universe timelines
- Book-specific Story Nodes
- World Relationships

### Entity Relationships

- Canonical relationship records
- Stable endpoint identities
- Context-aware relationships
- Reciprocal relationship displays
- Symmetric alliances and rivalries
- Faction membership and leadership
- Territorial control and residence
- Entity-linked guided attributes
- Relationship duplicate prevention
- Relationship archiving and limited Undo

Membership must not automatically imply leadership.

### Interactive Relationship Graph

- Distinct visual representation of entity categories
- Curved relationship edges
- Edge-associated labels
- Automatic node positioning
- Zoom, pan, and fit controls
- Entity and relationship filtering
- Focused entity navigation
- Direct-neighbor highlighting
- Keyboard-accessible graph controls

Dense graphs may still require filtering and zooming.

### Persistence and Synchronization

- Canonical acknowledged planning state
- Ordered mutation processing
- Optimistic revision checks
- Improved conflict handling
- Retained failed operations
- Explicit retry and cancellation
- Improved reciprocal synchronization
- Protection against stale planning snapshots

### Archive and Recovery Safety

- Relationship unlink with limited Undo
- Entity archive impact review
- Relationship cleanup before entity archive
- Native guards against unsafe archive operations
- Unique archived file names
- Universe archive and recovery
- Preservation of archived Universe ownership
- Protection of the shared planning catalog

### Remaining Acceptance Work

- [ ] Complete manual Windows desktop testing
- [ ] Verify reciprocal relationships in live editing sessions
- [ ] Verify graph readability at different scales
- [ ] Test navigation during pending mutations
- [ ] Test conflict handling and retry workflows
- [ ] Verify archive failure and recovery behavior
- [ ] Verify Vault restore with archived Universes
- [ ] Verify native close and unsaved-writing behavior
- [ ] Review accessibility and keyboard navigation
- [ ] Resolve release-blocking defects

### Known Limitations

- Permanent Universe deletion is unavailable.
- Universe archiving hides a Universe without deleting its content.
- Entity archive is not a crash-atomic multi-file transaction.
- There is no persistent deletion-intent journal.
- One-click document restoration is unavailable.
- Relationship Undo is transient and cannot restore a missing document.
- Dense graphs are not guaranteed to be crossing-free.
- Manual desktop acceptance is still required.

### Exit Criteria

v0.6.2 can be considered ready for release review when:

1. Critical data-preservation workflows pass manual acceptance.
2. Relationship synchronization is consistent across views.
3. Archive and recovery limitations are documented.
4. No known release-blocking data-loss defect remains.
5. Automated verification passes.
6. Windows packaging and installation are tested.
7. Release documentation reflects actual behavior.

---


## 6. v0.7.0 — House of Thoughts (Evolved from Manuscript Tools)

**Status:** In Development / Pre-release

### Objective

House of Thoughts introduces House-based organization above the existing Studios, allowing users to create distinct creative workspaces with their own Studio configurations, documents, and fictional universes.

Each House acts as an organizational context for writing and thinking. A user may maintain separate Houses for different projects, fictional worlds, philosophical inquiries, or personal collections without mixing their content.

Manuscript Tools remains an optional cross-Studio capability within House of Thoughts, allowing users to assemble, organize, and export long-form writing.

**MetaCognition Notebook remains the application name.** House of Thoughts is a feature within the application, not a product rebrand.

Existing canonical storage paths remain unchanged.

### Core Architecture

#### Houses

- Create and manage multiple Houses.
- Give each House its own name and identity.
- Enable or disable supported Studios within each House.
- Organize documents by House ownership.
- Associate Lorebook Universes with their owning House.
- Archive and restore Houses without deleting their content.
- Switch between Houses without changing the underlying notebook storage structure.
- Preserve compatibility with documents created before Houses existed.

Houses are organizational workspaces, not separate databases, physical storage directories, or security boundaries.

#### Studios Within Houses

Each House may contain its own enabled Studios:

- **Poetry Studio** — Poetry, emotional expression, and Emotional Cipher.
- **Philosophy Studio** — Philosophical writing, reflection, and structured reasoning.
- **Lorebook Studio** — Fictional universes, worldbuilding, relationships, and story development.

Studios retain their specialized writing interfaces and canonical storage conventions.

Documents belong to a House while retaining their original Studio identity.

A Studio can be enabled in multiple Houses without merging their document collections.

Future Studios, including Notes Studio and Essay Studio, may participate in House organization after their respective designs are approved.

#### Manuscript Tools

Manuscript Tools is an optional cross-Studio capability, not a separate authoring Studio.

It allows users to assemble existing writing into longer works while preserving the original documents as their canonical sources.

Manuscript Tools availability may be configured per House.

### House Management Capabilities

#### House Registry

- Maintain stable House identities.
- Preserve a default House for legacy notebook compatibility.
- Store House configuration in the canonical notebook registry.
- Preserve House ownership across application restarts.
- Validate House references and configuration.
- Preserve unknown compatible metadata where supported.
- Avoid unnecessary rewriting of legacy documents.

#### House-Scoped Document Operations

- Create documents within a selected House.
- List and search documents by House.
- Preserve global document lookup for existing references.
- Move supported documents between Houses safely.
- Validate destination House and Studio availability.
- Preserve document identities, content, and metadata during moves.
- Detect invalid or orphaned House references.
- Avoid silently reassigning documents.

#### Lorebook Universe Ownership

- Associate each Lorebook Universe with one owning House.
- Preserve Universe and entity identities.
- Prevent accidental cross-House ownership conflicts.
- Keep the existing shared Web of Thought catalog.
- Support coordinated Universe relocation only with appropriate recovery safeguards.
- Preserve relationships, timelines, Books, and entity references.

Individual entity moves must not silently separate entities from their owning Universe.

#### House-First Navigation

- Provide a House switcher.
- Display Studios enabled for the selected House.
- Provide a House-scoped Library.
- Allow intentional global discovery where appropriate.
- Expose House management and archive controls.
- Make document ownership understandable.
- Support safe move-to-House workflows.
- Keep global application settings, Help, and Vault accessible.

House navigation must not make existing writing inaccessible or silently hide ownership conflicts.

### House-First Implementation Phases

The phases below describe the development workstream for House of Thoughts. They are not separate application release versions.

#### Phase 1 — Ownership Compatibility Foundation

**Status:** Implemented; broader acceptance remains pending.

- Introduced document-level House ownership.
- Added backward-compatible default House resolution.
- Extended derived SQLite indexing for House ownership.
- Preserved legacy document compatibility.

#### Phase 2 — Canonical House Registry

**Status:** Implemented; broader acceptance remains pending.

- Introduced canonical House registry management.
- Added House creation, configuration, archive, and restore operations.
- Added Universe-to-House ownership mapping.
- Preserved existing canonical storage paths.
- Added registry validation and mutation safeguards.
- Extended Vault compatibility and recovery validation.

#### Phase 3A — House-Scoped Operations

**Status:** Implemented; automated verification reported.

- Added House-aware document creation.
- Added House-scoped listing and search.
- Preserved existing global document reference resolution.
- Added read-only House integrity inspection.
- Introduced House-aware document selection behavior.

#### Phase 3B-1 — Safe Single-Document House Moves

**Status:** In Progress / Acceptance Pending.

- Validate source and destination ownership.
- Coordinate moves with pending document saves.
- Preserve canonical Markdown content and document identity.
- Update House ownership without changing document paths.
- Protect against stale writes and conflicting revisions.
- Reconcile derived SQLite indexes.
- Detect and report partial failures.
- Preserve existing references and recoverability.

#### Phase 3B-2 — Coordinated Lorebook Universe Moves

**Status:** Planned.

- Move Universe ownership between Houses as a coordinated operation.
- Preserve Universe entities, Books, timelines, and relationships.
- Validate ownership dependencies before mutation.
- Introduce durable operation journaling or equivalent recovery safeguards.
- Support interruption recovery and consistent rollback behavior.
- Avoid partially migrated Universe ownership.

#### Phase 4 — House-First Interface

**Status:** Planned.

- Implement House selection and switching.
- Display House-specific Studios.
- Introduce House-scoped Library navigation.
- Add House management interfaces.
- Expose document movement workflows.
- Provide clear empty, archived, and unavailable states.
- Integrate House context into existing Studio workflows.
- Preserve global access to Vault, Settings, and Help.

### Manuscript Tools Capabilities

The following capabilities remain part of the evolved v0.7.0 milestone. Their implementation and acceptance are separate from the House ownership foundation.

#### Manuscript Organization

- Improved long-form writing navigation.
- Clear document and chapter ordering.
- Manuscript-level structure.
- Better handling of multi-chapter works.
- Assemble writing from supported Studios within a House.
- Preserve source document identities and references.
- Avoid unnecessary duplication of canonical writing.

#### Writing History

- Inspect meaningful writing revisions.
- Understand changes between saved states.
- Recover earlier writing where technically supported.
- Avoid confusing application backups with document revision history.
- Define appropriate revision retention and storage policies.

#### Export

- PDF export.
- EPUB export.
- Manuscript-oriented output formatting.
- Clear handling of titles, headings, and chapter boundaries.
- Export previews where practical.
- Preserve intended document and chapter ordering.
- Keep generated exports separate from editable source documents.

#### Writer Experience

- Improved long-form reading and editing.
- Consistent manuscript formatting.
- Clear separation of editable source and generated exports.
- Useful export error reporting.
- House-aware manuscript source selection.
- Clear handling of unavailable, archived, or moved source documents.

### Technical Considerations

#### Data Ownership and Compatibility

- Preserve canonical Markdown as the editable source.
- Preserve stable document, House, and Universe identities.
- Do not reorganize canonical documents into House-specific directories.
- Do not make generated PDF or EPUB files authoritative.
- Preserve legacy documents through default House compatibility.
- Avoid silently changing existing manuscript content.
- Preserve unknown compatible frontmatter fields.
- Keep exports usable outside MetaCognition Notebook.

#### Persistence and Recovery

- Coordinate House mutations with the existing save system.
- Prevent stale saves from reverting House ownership.
- Use atomic canonical file updates where appropriate.
- Treat SQLite as a rebuildable derived index.
- Do not assume filesystem writes and SQLite transactions are jointly atomic.
- Detect conflicting external modifications.
- Keep failed operations visible and recoverable.
- Validate House and Universe ownership during Vault backup and restore.
- Test interruption and recovery behavior for multi-document operations.

#### Manuscript Reliability

- Define revision retention and storage costs.
- Validate export behavior with long documents and Unicode text.
- Ensure export failures never modify source writing.
- Preserve source order and meaningful formatting.
- Report missing or unavailable manuscript sources clearly.
- Test large-manuscript performance.

#### Scope Boundaries

- Houses are organizational boundaries, not encryption or access-control boundaries.
- Manuscript Tools does not replace the specialized Studios.
- Existing cross-House references must remain resolvable where supported.
- New cross-House references require explicit, validated policy.
- House moves must not silently break existing relationships.
- Permanent deletion is not implied by House archiving.
- Optional soundtrack and ambience features are outside the current House architecture implementation.
- The application name remains MetaCognition Notebook.

### Proposed Acceptance Criteria

#### House Organization

- [ ] Users can create and configure multiple Houses.
- [ ] Each House displays only its enabled Studios.
- [ ] Documents are correctly associated with their owning House.
- [ ] House-scoped listing and search behave consistently.
- [ ] Legacy documents remain accessible through the default House.
- [ ] House switching does not lose unsaved writing.
- [ ] House archive and restore preserve all owned content.
- [ ] Global Vault backup and restore preserve House organization.

#### Document and Universe Safety

- [ ] Supported documents can be moved between Houses without content loss.
- [ ] Document moves preserve IDs, references, and canonical storage paths.
- [ ] Pending saves cannot revert completed House moves.
- [ ] Invalid ownership is detected and reported.
- [ ] Universe moves preserve entities, Books, timelines, and relationships.
- [ ] Interrupted Universe moves can be recovered safely.
- [ ] SQLite indexes can be reconstructed from canonical content.
- [ ] Older notebooks remain compatible.

#### Manuscript Tools

- [ ] A multi-chapter manuscript can be assembled and exported.
- [ ] Exported output preserves intended reading order.
- [ ] Unicode and special characters render correctly.
- [ ] Export failures do not modify source documents.
- [ ] Writing-history behavior is documented.
- [ ] Recovery is tested where implemented.
- [ ] Large-manuscript performance is acceptable.
- [ ] Manuscript sources remain understandable when documents are moved or archived.

#### Release Readiness

- [ ] Automated verification passes.
- [ ] Critical workflows pass manual Windows desktop acceptance.
- [ ] Existing Studios remain functional.
- [ ] No known release-blocking data-loss defect remains.
- [ ] Documentation accurately distinguishes implemented and planned features.
- [ ] Windows packaging and installation are tested.
- [ ] Known limitations are documented.

### Scope Notes

**House of Thoughts is the organizational evolution of the originally planned Manuscript Tools milestone.** It introduces a broader workspace architecture while retaining manuscript assembly and export as optional cross-Studio functionality.

The House-first implementation phases are engineering checkpoints within this milestone, not independent release numbers.

Completion of the House ownership foundation does not imply completion of the House-first interface or Manuscript Tools.

Detailed manuscript UI, writing-history retention, and export behavior still require dedicated design specifications before implementation.

**Implementation status:** Fully Implemented (Phases 1, 2, 3A, 3B-1, 3B-2, 4, and Phase 4 Acceptance Fixes); Automated verification passed; Windows manual acceptance pending.

The v0.7.0 milestone is in stabilization awaiting final manual Windows desktop acceptance.

---

## 7. v0.8.0-beta.4 — The Living Continuity

**User-Facing Label:** v0.8.0 Beta 4  
**Status:** Implemented Preview (Automated verification passed: 644 frontend tests across 47 test suites, 183 Rust backend tests, clean TypeScript typecheck, Vite production build, Windows NSIS installer packaged; Manual Windows acceptance pending)

### Objective

Deliver a comprehensive universe-wide historical state and continuity tracking system within Web of Thought, connecting milestone save points to the CodeMirror 6 chapter writing environment and live Echo dossiers.

### Core Capabilities in Beta 4
- **Web of Thought Historical State Engine (W1):** Milestone-by-milestone state resolution, cycle-free ancestry validation, status presets (`Alive`/`Deceased`, `Active`/`Fallen`, `Operational`/`Destroyed`), author-defined custom statuses, and non-destructive change records in `StoryNode.changes`.
- **Universe State Explorer (W2):** Milestone state matrix inside Lorebook's Universe Dashboard answering *"At this milestone in my universe, what is the state of everything?"*, status assignment modal with author notes, and "What Changed?" predecessor diff mode.
- **Alternate and Nested Continuities (W3):** Explicit divergence save points, state inheritance across divergence points, isolated branch histories, cycle-free validation, Book branch linking, and the "Compare Timelines" diff engine across any two milestones.
- **Historical Milestone Comparison:** Side-by-side comparative diffing distinguishing value modifications, provenance differences, and unassigned/introduced states across canonical history and alternate branches.
- **Echo Library Chapter Historical Context (W4):** Chapter milestone binding in frontmatter (`milestone_id`), cached $O(1)$ state resolution, and direct navigation back to Web of Thought. *(Extends implemented Echo Library E0–E2.5; does not replace it).*
- **Historical Entity Dossiers:** CodeMirror 6 floating reference dossiers displaying the entity's exact historical state, origin provenance, and author change notes for the active chapter's milestone.
- **Milestone Creation and Entity State Assignment Fixes:** Inline first milestone creation in empty universes; canonical Lorebook document auto-registration in `plan.entities` without duplicate ID generation; backend validation in `thought.rs` enforcing Universe ID and House ownership via SQLite index; consolidated header navigation.
- **Documentation and Stability Improvements:** Complete system design synchronization, 11-chapter (43 sections) offline manual, verified test suites, clean typechecking, and production packaging.

> **Clarification on Echo Library Roadmap:**
> - **Echo Library E0–E2.5 (Implemented):** Live Lorebook recognition, boundary-aware name/alias scanning, interactive ambiguity resolution, floating contextual dossiers, CodeMirror 6 integration, user recognition toggle, and distraction-free chapter writing.
> - **Echo Historical Context W4 (Implemented):** Connects chapter drafting to historical milestones, enriching dossiers with historical states.
> - **Echo Library E3 (Planned):** Persistent, writer-bound explicit references permanently linking prose spans to entity IDs are **not** implemented in Beta 4 and remain scheduled for future engineering.

### Implemented Foundation (Phases C1–C4, E0–E2.5)

1. **Character Profile Refinement (C1)**: Practical encyclopedia fields (`role`, `primary_faction_id`, `aliases`), extensible `attributes: LorebookAttribute[]` custom parameters, and legacy `custom_fields` compatibility.
2. **Faction Organizations & Official Positions (C2)**: Optional branch hierarchies, official positions with title and rank, UUID-bound position holders, and reverse lookups (`getCharacterHeldOffices`).
3. **Relationship Consistency (C3)**: Bi-directional synchronization between guided affiliations and canonical Web of Thought relationships in `_web_of_thought.md`.
4. **Graph Readability (C4)**: Focused Entity mode (depth-1 direct neighbors), Full Universe overview mode, category-styled geometric SVG nodes, and connection tables.
5. **CodeMirror 6 Editor Foundation (E0/E1)**: High-performance writing engine with non-destructive decoration mark architecture and debounced autosave.
6. **Live Lore Recognition & Contextual Dossiers (E2)**: Real-time mention and alias scanner, floating reference dossiers, and interactive ambiguity resolution.
7. **Chapter Editor Integration & Production Acceptance (E2.5)**: In-situ chapter drafting in Book View (`BookView.tsx`), recognition toggle (`mc_echo_recognition_active`), keyboard shortcut (`Alt+E` / `Mod-Shift-E`), focus preservation, strict universe scoping, and production Windows NSIS installer build.

### Future Candidate: Echo Library E3 — Persistent Explicit References

**Status:** Planned; requires design review before implementation.

- **Writer-Controlled Explicit Entity Binding**: Permanently attaching a specific span of prose to a Lorebook entity UUID.
- **Persistent Disambiguation**: Binding survives entity renames, text editing, and restarts.
- **Richer Contextual Navigation**: Direct navigation from a reference to the entity's Lorebook document or timeline appearances.
- **Markdown-Safe Reference Persistence**: Storing reference bounds in frontmatter or validated non-destructive syntax.

> **Important Boundary:** Milestone E3 is NOT implemented in v0.8.0-beta.4. Echo recognition in the current preview is strictly ephemeral and non-destructive.


### 7.5. Milestone M1 — Writing Atmosphere & In-App Guide Refresh

**Status:** Implemented; Automated verification passed (612 frontend tests across 46 test suites, 119 Rust backend tests passing); Manual Windows desktop acceptance pending.

#### Objective
Provide a local-first ambient audio environment for distraction-free writing sessions, and bring the complete in-app manual up to date with all recently implemented features.

#### Implemented Capabilities
- **Writing Atmosphere Player**: Compact docked widget in bottom-right corner and expandable player panel (`WritingAtmospherePlayer.tsx`).
- **External Audio Import**: Plays user-imported audio files (such as FlowMusic ambient tracks or personal audio files) from an application-managed `Music/` folder (`lofi/`, `medieval/`, `scifi/`).
- **Supported Formats**: `.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`, and `.aac` loaded into in-memory blobs from Rust bytes.
- **Persistent Playback**: Remains playing continuously across House, Studio, document, and chapter navigation.
- **Strict Offline Privacy**: Zero network requests, zero telemetry, strict path traversal prevention, and strictly no autoplay on startup. Volume, category, and repeat modes persist in `localStorage` (`mc_atmosphere_preferences`).
- **In-App Help & Guide Refresh**: Expanded manual to 11 chapters (43 sections) covering Houses of Thoughts, CodeMirror 6 soft line wrapping, Lorebook Character profiles and Faction official positions, Web of Thought 240-edge graph limits, Echo Library contextual dossiers, and Writing Atmosphere.

### 7.6. Milestone W0–W4 — Web of Thought Historical State Overhaul

**Status:** Implemented; Automated verification passed; Manual Windows desktop acceptance pending.

#### Objective
Transform Web of Thought into a comprehensive universe-wide historical state and continuity tracking system centered on historical milestone snapshots, explicit alternate branches, and contextual writing awareness.

#### Implemented Capabilities
- **Phase W0 — Architecture Alignment:** Clarified Web of Thought as a Universe State Explorer answering "At this milestone, what is the state of everything?", separating historical changes from canonical Lorebook document bodies.
- **Phase W1 — State Engine (`stateEngine.ts`):** Pure deterministic milestone state resolution engine with predecessor inheritance, cycle-free ancestry validation, status presets (`Alive`/`Deceased`, `Active`/`Fallen`, `Operational`/`Destroyed`), custom statuses, provenance tracking (`explicit`, `inherited`, `unknown`, `unassigned`, `not_yet_introduced`), and non-destructive change records in `StoryNode.changes`.
- **Phase W2 — Universe State Explorer UI (`UniverseStateExplorer.tsx`):** Milestone-by-milestone state matrix inside Lorebook's Universe Dashboard, category status presets, custom status assignment modal with author notes, and "What Changed?" diff mode.
- **Phase W3 — Alternate Continuities & Branching:** Support for explicit alternate branches (`Branch` model in `thought.rs` and `thought.ts`), divergence save points, state inheritance across divergence points, isolated branch histories, cycle-free validation, Book branch linking, and the "Compare Timelines" diff engine across any two milestones.
- **Phase W4 — Echo Library Historical Awareness & Chapter Context:** Chapter milestone binding in frontmatter (`milestone_id`), cached O(1) state resolution, historical state dossiers in CodeMirror 6 with resolved state, provenance, and change notes, direct "Inspect in Web of Thought" action, and strict House/Universe isolation.
- **Post-W4 Stabilization & Isolation Safeguards:** Onboarding fix enabling first milestone creation in empty universes, canonical Lorebook document auto-registration in `plan.entities` without duplicate ID generation, backend validation in `thought.rs` enforcing Universe ID and House ownership via SQLite index, and consolidated header navigation.

---

### 7.7. Milestone L0–L4 — Portable Universe & Lorebook Publication

**Status:** Implemented; Automated verification passed (183 Rust backend tests, 644 frontend tests across 47 test suites, production NSIS installer packaged); Manual Windows desktop acceptance pending.

#### Objective
Enable safe, full-fidelity cross-notebook sharing of fictional Universes through `.mcuniverse` versioned archives with robust identity remapping, alongside privacy-filtered reader-facing Lorebook publication in Markdown and print-ready PDF formats.

#### Implemented Capabilities
- **Phase L0 — Portable Architecture & Storage Audit:** Pre-implementation verification of canonical Markdown files, shared `_web_of_thought.md` catalog boundaries, House isolation, and packaging constraints.
- **Phase L1 — Portable Universe Export & Inspection:** Self-contained version 1 `.mcuniverse` archive generation (`portable.rs`); strict ZIP Stored entry validation (`validate.rs`); manifest SHA-256 integrity verification; selective Book/Chapter inclusion; read-only package inspection (`portable_universe_inspect`).
- **Phase L2a — Safe Import Planning & Identity Remapping:** Read-only import preview (`portable_universe_import_preview`); package compatibility preflight; separate-copy operation identity namespace; `Preserve Identities` collision preflight; schema-accurate reference remapping across entities, chapters, milestones, branches, and relationships.
- **Phase L2a.1 — Import Safety Gate:** Verification of retry idempotence, operation ID lifecycle, collision rejection, and reference remapping alignment (`milestone_id` vs `milestone_ids`, branch divergence hierarchies, faction positions).
- **Phase L2b — Durable Import Commit & Recovery:** Backend-authoritative commit (`portable_universe_import_commit`); destination House assignment; staging journal (`portable_universe_import_journal.json`); automatic roll-forward/rollback recovery on startup (`portable_universe_recover_imports`); Web of Thought catalog merge.
- **Phase L3a — Reader Lorebook Markdown Publication:** Reader-facing Markdown export (`publish_lorebook_markdown`); shared structured model (`PublicationDocument`); strict privacy allowlist stripping internal IDs, file paths, and private notes; spoiler milestone cutoff; clear distinction from backup archives.
- **Phase L3b — Reader Lorebook PDF Publication:** Print-ready multi-page PDF generation (`publish_lorebook_pdf`); cover page, table of contents, category chapters, faction hierarchy trees, and timelines; standard PDF Type 1 font (Windows-1252) preflight glyph analysis; visible `[?]` substitutions; author confirmation gate.
- **Phase L4 — Desktop UI Integration & Acceptance:** Two distinct Lorebook Dashboard actions (Export/Import Universe vs Publish Lorebook); 9-step guided import wizard (`PortableUniverseModal.tsx`); publication modal (`LorebookPublicationModal.tsx`) with format selection, category toggles, preview, and glyph warnings; save-flush coordination; native file dialogs.

---

## 8. v0.9.0 — Conversation Archive

**Status:** Planned milestone; detailed specification pending

### Objective

Explore a dedicated environment for preserving and organizing conversations relevant to thinking, reflection, and creative development.

The final scope remains undecided.

### Candidate Directions

- Locally stored conversation records
- Conversation organization and browsing
- Search across archived discussions
- Connections between conversations and writing projects
- User-controlled import and export
- Selective preservation of useful excerpts

These are proposals requiring design and feasibility review.

### Important Boundaries

- Do not assume access to external conversation services.
- Do not promise automatic synchronization with third-party accounts.
- Do not assume all conversation formats can be imported.
- Imported content should retain clear provenance where supported.
- Users should control what is retained locally.
- The application should not silently transmit private writing.

### Planning Criteria

- [ ] Define supported conversation sources.
- [ ] Define archive and import formats.
- [ ] Establish the canonical storage model.
- [ ] Design navigation and search.
- [ ] Define privacy and consent boundaries.
- [ ] Prototype the archive interface.
- [ ] Approve a realistic implementation scope.

---

## 9. v1.0.0 — First Edition

**Status:** Planned

### Objective

Deliver the first major edition of MetaCognition Notebook with a cohesive, dependable experience across its supported studios.

v1.0.0 should emphasize product maturity rather than simply increasing the number of features.

### Product Quality Goals

- Consistent studio navigation
- Reliable document persistence
- Tested backup and recovery
- Clear onboarding
- Predictable save behavior
- Stable notebook organization
- Accessible essential interactions
- Useful documentation
- Reproducible Windows builds
- Clear release notes and known limitations

### Data and Compatibility

- Verify supported notebook migrations.
- Test opening older notebook structures.
- Preserve canonical user writing.
- Document backup compatibility.
- Validate startup indexing and recovery.
- Review destructive operations.
- Avoid introducing silent data migrations.

### Release Readiness

- [ ] Define supported Windows environments.
- [ ] Test installation and uninstallation.
- [ ] Test application updates where supported.
- [ ] Verify notebook backup and restore.
- [ ] Complete critical workflow regression testing.
- [ ] Complete manual desktop acceptance.
- [ ] Review privacy and security claims.
- [ ] Finalize public documentation.
- [ ] Verify licensing and attribution.
- [ ] Prepare release notes and distribution artifacts.

### Scope Control

Not every proposed studio or experimental feature must be completed before v1.0.0.

A stable, coherent application is preferable to a larger application with unreliable workflows.

---

# PART II — FUTURE STUDIO EXPANSIONS

The following expansions are desired development directions.

**They do not have finalized version assignments.**

Their implementation order may change after v0.6.2 stabilization and further product design.

---

## 10. Philosophy Studio Expansion

**Status:** Proposed  
**Priority:** High — next major design focus after Lorebook stabilization

### Vision

Transform Philosophy Studio into a dedicated workspace for exploring questions, arguments, contradictions, beliefs, and evolving perspectives.

The goal is to support the process of thinking, not merely the act of typing philosophical essays.

### Proposed Features

#### Philosophical Entries

- Questions and inquiries
- Reflections
- Arguments
- Counterarguments
- Thought experiments
- Personal positions
- Open problems

#### Argument Workspace

- Claims and supporting reasons
- Objections and counterarguments
- Responses and revisions
- Connections between related claims
- Optional visual argument mapping

#### Concept Connections

- Link related philosophical concepts.
- Associate arguments with broader questions.
- Track agreement and disagreement.
- Distinguish references from logical dependencies.

#### Reflection and Revision

- Revisit earlier positions.
- Record changes in interpretation.
- Compare competing explanations.
- Preserve the history of evolving ideas where supported.

#### Reading and Research

- References to books, papers, and other sources
- Notes associated with philosophical concepts
- Quotations with attribution
- Clear distinction between sourced material and personal interpretation

### Design Principles

- Avoid imposing a single philosophical methodology.
- Do not automatically label subjective arguments as objectively true or false.
- Support ambiguity and unresolved questions.
- Keep structured reasoning optional.
- Preserve freeform writing as a first-class workflow.

### Initial Implementation Sequence

1. Audit existing Philosophy Studio behavior.
2. Identify missing workflows.
3. Design entry categories and navigation.
4. Prototype argument and concept linking.
5. Define persistence and compatibility.
6. Implement a small vertical slice.
7. Test with real philosophical writing.
8. Expand only after usability validation.

### Proposed Acceptance Criteria

- [ ] Users can write freely without mandatory argument structures.
- [ ] Structured arguments are easy to create and revise.
- [ ] Related concepts can be navigated.
- [ ] Arguments and counterarguments remain distinguishable.
- [ ] Existing Philosophy documents remain compatible.
- [ ] No unsupported claims of automatic logical correctness are made.

---

## 11. Notes Studio

**Status:** Proposed  
**Version:** Unassigned

### Vision

Provide a flexible home for everyday thinking and information that does not naturally belong in Poetry, Philosophy, or Lorebook.

### Proposed Features

#### General Notes

- Quick notes
- Personal observations
- Research notes
- Meeting or discussion notes
- Learning notes
- Idea fragments
- Reference material

#### Organization

- Folders or collections
- Tags
- Favorites or pinned notes
- Search and filtering
- Recently edited notes
- Related-note links

#### Writing Experience

- Fast note creation
- Lightweight editing
- Minimal mandatory metadata
- Markdown compatibility
- Easy conversion or movement between organizational contexts where safe

#### Knowledge Connections

- Links between notes
- Links to existing studio documents where appropriate
- Backlinks or related-document views
- Clear handling of missing or archived references

### Design Considerations

Notes Studio should not become a duplicate of every specialized studio.

Its strength should be flexibility, low friction, and easy retrieval.

### Proposed Acceptance Criteria

- [ ] Creating a note requires minimal interaction.
- [ ] Notes are searchable and organizable.
- [ ] Links preserve stable identities.
- [ ] Moving or archiving notes does not silently break unrelated content.
- [ ] Existing studios retain their distinct purpose.

---

## 12. Essay Studio

**Status:** Proposed  
**Version:** Unassigned

### Vision

Create a structured writing environment for essays, letters, and other deliberate long-form compositions.

Essay Studio should support both formal writing and personal expression.

### Proposed Writing Modes

#### Essays

- Analytical essays
- Reflective essays
- Argumentative essays
- Personal essays
- Research-oriented writing

#### Letters

- Personal letters
- Open letters
- Reflective letters
- Formal correspondence
- Unsent letters

### Proposed Features

#### Structure

- Title and metadata
- Sections and headings
- Outline navigation
- Draft organization
- Optional writing templates

#### Research and References

- Source notes
- Quotations
- Citation placeholders
- Reference organization
- Links to supporting notes

#### Editing and Review

- Draft status
- Revision history where supported
- Word count and writing statistics
- Focused editing modes
- Export integration with Manuscript Tools

#### Letter-Specific Features

- Optional recipient metadata
- Date and location fields
- Salutation and closing templates
- Personal or formal formatting
- Private drafts

### Design Principles

- Templates must remain optional.
- Do not force every essay into a five-paragraph structure.
- Letters should not require an actual recipient.
- Citation formatting should be accurate before being advertised as automated.
- Avoid duplicating Manuscript Tools functionality unnecessarily.

### Proposed Acceptance Criteria

- [ ] Users can create essays and letters.
- [ ] Structured outlines remain optional.
- [ ] Writing is preserved in canonical storage.
- [ ] Exports reflect the selected document type.
- [ ] Source and citation workflows are clearly documented.
- [ ] Long documents remain practical to edit.

---

## 13. Poetry Studio Expansion

**Status:** Proposed  
**Version:** Unassigned

### Vision

Continue refining Poetry Studio as a focused environment for poetic expression, experimentation, and revisiting earlier work.

### Candidate Improvements

#### Writing Experience

- Improved poetry-focused editing
- Better stanza and line handling
- Optional distraction-free presentation
- Improved navigation across poetry collections

#### Organization

- Collections and sequences
- Themes and tags
- Draft and completed-work organization
- Easier browsing of related poems

#### Creative Tools & Emotional Cipher Enhancement

- **Per-Stanza Manual Ciphering**: Allow writers to customize word substitutions stanza by stanza.
- **Differential Mapping**: Repeated words across different stanzas may receive distinct cipher mappings.
- **Whole-Poem Mode**: Support optional whole-poem ciphering alongside stanza-specific mappings.
- **Content Preservation**: Ensure cipher operations preserve original poem content and backward compatibility with `.mckey` / `.mccipher` files.
- Refinements to Emotional Cipher key management
- Better import/export usability
- Additional optional creative experiments

#### Presentation

- Poetry-oriented export layouts
- Print-friendly formatting
- Collection presentation
- Reading-focused views

### Boundaries

- Do not treat Emotional Cipher as security encryption.
- Preserve exact line breaks and meaningful whitespace.
- Avoid intrusive automatic rewriting.
- Keep creative tools optional.

### Proposed Acceptance Criteria

- [ ] Poetry formatting survives save and export.
- [ ] Existing poems remain compatible.
- [ ] Cipher operations do not silently overwrite originals.
- [ ] Collection navigation remains intuitive.
- [ ] Creative features do not obstruct ordinary writing.

---

# PART III — CROSS-STUDIO EXPANSIONS

## 14. Interconnected Writing

**Status:** Exploratory

### Vision

Allow related content across studios to connect naturally while preserving the identity and purpose of each studio.

### Candidate Capabilities

- Links between notes and philosophical entries
- References from essays to research notes
- Connections between poetry and personal reflections
- Links between Lorebook entities and supporting writing
- Backlinks and related-document discovery
- Stable cross-studio document references

### Technical Requirements

- Stable document identities
- Safe handling of archived or missing targets
- No unnecessary duplication of canonical content
- Clear ownership of documents
- Consistent search and navigation
- Compatibility with existing notebooks

### Risks

Cross-studio linking must not create hidden dependencies that make documents difficult to archive, move, or recover.

---

## 15. Unified Search and Discovery

**Status:** Exploratory

### Candidate Features

- Search across supported studios
- Filters by studio and document type
- Search within a selected Universe or collection
- Recent and frequently accessed writing
- Saved searches where useful
- Related-document discovery
- Optional backlinks

### Design Principles

Search should help users retrieve their own writing without requiring cloud services.

Any automatic classification or recommendation features must be clearly identified and remain optional.

---

## 16. Writing Statistics and Personal Insights

**Status:** Exploratory

### Candidate Features

- Word and character counts
- Writing activity summaries
- Document and collection statistics
- Draft completion tracking
- Writing history visualization
- Optional personal writing goals

### Boundaries

- Avoid turning a reflective writing application into a mandatory productivity tracker.
- Do not interpret writing frequency as emotional or psychological health.
- Keep analytics local where practical.
- Make activity tracking transparent and optional.

---

## 17. Import, Export, and Interoperability

**Status:** Ongoing / Proposed

### Goals

- Preserve readable local source files.
- Improve export quality.
- Support practical document portability.
- Reduce dependency on proprietary formats.
- Maintain recoverable notebook backups.

### Candidate Improvements

- Broader document export support
- Improved Markdown interoperability
- Structured notebook export
- More robust import validation
- Export previews
- Clear format compatibility documentation

### Safety Requirements

- Imports must not silently overwrite existing documents.
- Failed exports must not damage canonical writing.
- Format conversion must preserve as much meaningful content as possible.
- Unsupported content must be reported clearly.

---

# PART IV — LOREBOOK LONG-TERM BACKLOG

## 18. Safe Universe Reset and Permanent Deletion

**Status:** Deferred  
**Priority:** Medium

### Motivation

During testing and worldbuilding experimentation, users may want to completely reset a Universe rather than merely hide it.

Current Universe archiving preserves all content and does not provide a clean reset.

### Proposed Capabilities

#### Reset Universe

- Reset selected worldbuilding content while retaining the Universe identity, if explicitly requested.
- Offer a clear preview of what will be reset.
- Distinguish between resetting relationships, timelines, Books, and documents.
- Require explicit confirmation.

#### Permanent Universe Deletion

- Delete an entire Universe and its owned content only after validated safeguards are implemented.
- Display a complete impact summary.
- Distinguish owned documents from shared or externally referenced content.
- Require typed-name confirmation.
- Require or strongly encourage a verified backup.
- Protect other Universes and the shared planning catalog.

### Technical Prerequisites

- Define exact ownership and deletion boundaries.
- Validate all affected document paths.
- Create a durable operation journal or equivalent recovery mechanism.
- Design interruption and restart behavior.
- Prevent partial deletion from appearing successful.
- Ensure native backend guards match UI rules.
- Test index reconstruction and Vault recovery.
- Test failures at every destructive stage.

### Acceptance Criteria

- [ ] Users can preview the complete deletion scope.
- [ ] Unrelated Universes remain intact.
- [ ] Shared planning data is not accidentally removed.
- [ ] Interrupted operations can be safely recovered or resumed.
- [ ] The application does not falsely report partial deletion as complete.
- [ ] Backup and recovery instructions are clear.
- [ ] Destructive behavior is covered by automated and manual tests.

**Important:** Do not implement hard deletion as a simple cascade of filesystem removals without validated recovery semantics.

---

## 19. Additional Worldbuilding Improvements

**Status:** Exploratory

### Candidate Features

#### Worldbuilding Navigation

- Improved large-Universe navigation
- Favorites and recently accessed entities
- Entity browsing by type
- Better handling of very large lore collections

#### Web of Thought Polish & Relationship Exploration

- **Better Edge Routing**: Improve layout algorithms to minimize line crossings in dense entity clusters.
- **Label Readability**: Enhance collision avoidance and text legibility at low zoom levels.
- **Focused Exploration**: Refine direct-neighbor navigation without changing canonical relationship semantics.
- Additional relationship perspectives
- Better dense-graph readability
- Relationship grouping
- Improved edge-label placement
- Optional graph layout modes
- Relationship-focused navigation

#### Timeline Experience

- Improved chronological navigation
- Better milestone comparison
- Clearer Book versus Universe history views
- Easier inspection of historical entity states

#### Continuity Tools

- Clearer alternate-continuity organization
- Better visibility of Book-specific changes
- Consistency checks where semantics are well defined
- Warnings for missing references

#### Location Sketchboard (Proposed Lorebook Expansion)

- Spatial visual planning and sketching board for worldbuilding locations and regional maps.
- Interactive placement and spatial relationships between Lorebook locations without mandatory geospatial coordinates.
- Connect locations visually to faction territories, milestone events, and chapters.

#### Worldbuilding Templates

- Optional entity templates
- Customizable guided fields
- Reusable worldbuilding structures
- Better support for unconventional fictional settings

### Boundaries

- Avoid turning freeform worldbuilding into mandatory data entry.
- Do not automatically infer fictional facts without user approval.
- Preserve historical relationships and timeline context.
- Do not break existing entity IDs.
- Maintain compatibility with canonical Markdown storage.

---

# PART V — ENGINEERING AND PRODUCT QUALITY

## 20. Reliability and Data Safety

**Status:** Continuous

### Priorities

- Reliable autosave and manual save
- Visible unsaved-state feedback
- Safe navigation and close behavior
- Optimistic revision protection
- Recoverable failed operations
- Backup validation
- Startup indexing and repair
- Clear archive semantics
- Compatibility with older notebooks

### Engineering Principles

1. Canonical writing must not be silently overwritten by stale state.
2. Failed operations must remain visible.
3. Destructive actions must have clear scope and confirmation.
4. Recovery must be tested, not merely described.
5. Automated tests must not be presented as proof of visual usability.
6. New features must preserve existing notebooks whenever possible.

---

## 21. Performance and Scalability

**Status:** Continuous

### Areas to Monitor

- Large notebooks
- Large Lorebook Universes
- Dense relationship graphs
- Long manuscripts
- Search responsiveness
- Startup indexing
- Memory consumption
- Frontend bundle size
- Save-queue responsiveness

### Possible Improvements

- Lazy loading where justified
- Better document virtualization
- Incremental search/index updates
- Graph rendering optimizations
- Code splitting
- Reduced unnecessary component rerenders

Performance work should be guided by measurement rather than premature optimization.

---

## 22. Accessibility and Usability

**Status:** Continuous

### Goals

- Keyboard navigation
- Visible focus indicators
- Readable typography
- Sufficient contrast
- Scalable interfaces
- Clear status messages
- Accessible dialogs
- Usable light and dark themes
- Predictable interaction patterns

### Testing Priorities

- Windows display scaling
- Narrow windows
- Keyboard-only workflows
- Screen-reader labels
- Long document titles
- Dense graph interactions
- Modal focus management
- Error and recovery messages

---

## 23. Documentation and Developer Experience

**Status:** Continuous

### Documentation Structure

- `README.md` — Public introduction, features, setup, and project status
- `SYSTEM_DESIGN.md` — Technical architecture and data model
- `docs/ROADMAP.md` — Established milestones and future development
- `docs/README.md` — Documentation index
- Historical reports — Implementation and verification records
- In-app Help Center — User-facing instructions

### Maintenance Rules

- Update documentation when implemented behavior changes.
- Keep planned features separate from available features.
- Preserve historical reports.
- Verify commands and links.
- Document important limitations.
- Keep architecture descriptions aligned with code.
- Do not claim unperformed testing.
- Do not describe unpublished builds as released products.

---

# PART VI — PRIORITIZATION

## 24. Recommended Development Order

The following order is a planning recommendation, not a commitment to change established version assignments.

### Current Status: In Stabilization

- **Philosophy Studio: Argument Web** — Implemented and verified.
- **v0.7.0 House of Thoughts** — Implemented and verified; manual Windows acceptance pending.
- **v0.8.0-beta.3 Writing Atmosphere & Echo Library Preview** — Implemented and verified (E0–E2.5, M1).
- **v0.8.0-beta.4 The Living Continuity** — Implemented and verified (W0–W4 Web of Thought overhaul, historical state engine, alternate continuities, Echo chapter context, empty-state & state assignment fixes, L0–L4 Portable Universe exchange, safe import planning & recovery, and Lorebook publication).

### Immediate Focus

1. Windows desktop acceptance testing for v0.8.0-beta.4 across installed workflows.
2. Verify Windows NSIS installer packaging (`npm run tauri -- build --bundles nsis`).
3. Resolve any edge-case defects identified during manual desktop testing.

### Established Next Milestones

4. **Echo Library E3** — Design review and technical specification for persistent explicit references.
5. **v0.9.0 Conversation Archive** — Specification and local storage model for AI conversation archives.
6. **v1.0.0 First Edition** — Comprehensive production hardening, final packaging, and public release distribution.

### Future Expansion

7. **Location Sketchboard** — Visual planning board for worldbuilding locations and regional maps.
8. **Notes Studio** — Fast scratchpad and informal note-taking with minimal metadata.
9. **Essay Studio** — Dedicated composition environment for essays and formal correspondence.
10. **Poetry Studio Expansion** — Per-stanza manual Emotional Cipher substitutions and rhyme/meter analysis.
11. **Manuscript Tools Expansion** — EPUB export packaging and draft revision snapshot history.
12. **Safe Universe Reset and Deletion** — Recoverable reset and permanent deletion workflows governed by durable journaling.

This sequence may change based on dependencies, user feedback, and technical feasibility.

---

## 25. Feature Prioritization Criteria

Before committing a major feature, evaluate:

| Criterion | Guiding question |
|---|---|
| User value | Does this improve an actual writing or thinking workflow? |
| Product identity | Does it strengthen the purpose of MetaCognition Notebook? |
| Data safety | Can it preserve and recover user writing? |
| Complexity | Is the maintenance cost justified? |
| Compatibility | Can existing notebooks continue working? |
| Usability | Can users understand the feature without extensive training? |
| Performance | Will it remain practical with larger notebooks? |
| Testability | Can important behavior be verified reliably? |
| Scope | Does it belong in this milestone? |

A feature should not be prioritized solely because it is technically impressive.

---

## 26. Non-Goals and Guardrails

MetaCognition Notebook does not need to become every kind of productivity application.

Unless deliberately reconsidered, the following are not core requirements:

- Mandatory cloud accounts
- Subscription-dependent writing access
- Mandatory AI-generated content
- Automatic publication of private writing
- Social networking features
- Competitive productivity systems
- Forced writing templates
- Destructive migrations without recovery planning
- Replacing all specialized studios with one generic editor

Future AI-assisted functionality, if explored, should be optional, transparent, and designed around user control.

---

## 27. Definition of Done

A feature is not considered complete merely because it compiles.

For substantial development work, completion should include:

- [ ] Feature behavior matches the approved specification.
- [ ] Canonical data ownership is understood.
- [ ] Existing writing remains compatible.
- [ ] Errors and partial failures are handled.
- [ ] Relevant automated tests pass.
- [ ] Manual interaction is reviewed where applicable.
- [ ] Accessibility considerations are evaluated.
- [ ] User-facing guidance is updated.
- [ ] Technical documentation is updated.
- [ ] Known limitations are recorded.
- [ ] Release status is reported accurately.

A successful build is evidence of compilation, not proof of complete acceptance.

---

## 28. Final Direction

MetaCognition Notebook should evolve into a cohesive personal creative environment rather than a collection of disconnected tools.

Poetry should support expression.

Philosophy should support inquiry.

Lorebook should support imagination and worldbuilding.

Notes should support everyday thinking.

Essay Studio should support deliberate composition, including essays and letters.

Future libraries and archives should help users rediscover and preserve their work.

The long-term goal is not to maximize feature count. It is to create a dependable, thoughtfully designed place where ideas can be written, connected, revisited, and developed over time.

---

*This roadmap is a living planning document. Established milestone names are preserved, while proposed and exploratory features remain subject to design, feasibility, and development priorities.*

*Last planning update: October 25, 2026.*
