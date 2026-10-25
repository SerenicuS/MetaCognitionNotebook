<div align="center">

# MetaCognition Notebook

### A personal sanctuary for writing, reflection, and imagination.

**A local-first creative workspace for poetry, philosophy, and worldbuilding.**

![Release](https://img.shields.io/badge/release-v0.6.2-C6A66B)
![Prerelease](https://img.shields.io/badge/prerelease-v0.8.0--beta.1-blue)
![Preview](https://img.shields.io/badge/preview-Echo%20Library-C6A66B)
![Platform](https://img.shields.io/badge/platform-Windows-252629)
![License](https://img.shields.io/badge/license-MIT-C6A66B)
![Status](https://img.shields.io/badge/status-Preview%20%2F%20In%20Acceptance-orange)

</div>

---

## Welcome to MetaCognition Notebook

Every idea deserves a place to grow.

MetaCognition Notebook is a desktop application designed for writers, thinkers, poets, and worldbuilders who want a personal space to explore their creativity.

Whether you're composing poetry, reflecting on philosophical questions, or creating fictional universes, MetaCognition Notebook provides dedicated tools for each creative process.

Built around the **Gilded Identity**, the application combines a charcoal-and-gold aesthetic with a calm, distraction-conscious writing environment.

Your writing stays in local, readable files. No mandatory cloud account is required.

---

## 🎬 See MetaCognition Notebook in Action

![MetaCognition Notebook Demo](src/assets/video/readme_demo.gif)

---

## Explore the Studios

MetaCognition Notebook gives different forms of writing their own dedicated environments.

### Poetry Studio
**Give your emotions a voice.**

A creative space for poetry, personal expression, and experimentation.

**Features:**
- Write and organize poems with individual stanzas.
- Choose poetic forms and editing fonts.
- Track stanza, line, and word counts.
- Import and export poems in supported formats.
- Experiment with Emotional Cipher.

#### Emotional Cipher

Transform your poetry through creative word substitutions.

Choose from quick substitutions, randomized vocabulary, or custom mappings.

Manage reusable cipher keys and experiment with encoded versions of your writing.

> **Note:** Emotional Cipher is a creative writing tool, not cryptographic encryption.

---

### Philosophy Studio
**A space to question everything.**

Explore ideas, arguments, reflections, and philosophical questions in a dedicated thinking environment.

**Features:**
- Freeform philosophical writing.
- Optional structured reasoning.
- Organize text into premises, arguments, objections, examples, and conclusions.
- Switch between writing views while preserving your content.

Philosophy Studio is designed to support your thinking process without requiring every thought to fit a rigid structure.

- **Argument Web**: Document-local visual thinking and structural inspection graph.
  - Establish an overarching Main Thesis and capture argument passages directly from writing.
  - Connect arguments with directional relationships: Supports (→), Challenges (→), Expands (→), and Related (—).
  - Two-tier source verification: tracks text positions, detects drift, and surfaces candidate matches without silent relinking.
  - Non-judgmental structural insights: surfaces disconnected arguments, unsupported claims, and separate clusters without evaluating philosophical validity, truth, or soundness.

---

### Lorebook Studio
**Build worlds beyond the page.**

Create fictional universes, develop characters and civilizations, and connect the stories that bring your worlds to life.

**Worldbuilding features:**
- Create and organize fictional Universes with stable UUIDs.
- Develop Characters with practical encyclopedia profiles, aliases, role/archetype, and custom parameters.
- Structure Factions with optional branches, official positions, reporting hierarchies, and UUID-bound position holders.
- Document Rules, Systems, Cultures, History, Artifacts, Events, and other lore.
- Connect entities through coherent guided and custom relationships with bi-directional reciprocal views.
- Assemble Books and write Chapters with an in-situ distraction-free writing canvas.
- Develop Universe and Book timelines with Story Nodes to plan important events.
- Explore connections using the interactive, category-styled World Relationships Graph with direct-neighbor focus.

#### Character Profiles & Custom Parameters

Create practical reference profiles for characters without forcing them into rigid RPG sheets or abstract questionnaires. Record roles, primary faction affiliations, and extensible custom attributes (`LorebookAttribute[]`) such as *Weapon of Choice*, *Magic Affinity*, or *Birthplace*. All attributes seamlessly surface in contextual writing previews.

#### Faction Hierarchies & Official Positions

Define organizational structures for nations, guilds, military orders, corporations, syndicates, and dynasties. Build branches, establish official positions with title and rank, assign character holders, and inspect reverse lookups showing all positions a character holds across your fictional world.

#### Relationship Consistency

Guided character connections and Web of Thought relationships operate as one unified system. Assigning affiliations or alliances synchronizes reciprocally with canonical relationship storage, avoiding contradictory displays, duplicate records, or silent data loss.

#### Web of Thought & Graph Exploration

Explore how characters, factions, locations, and events relate to one another across your fictional Universe.

- Distinct entity categories and visual styles.
- **Focused Entity mode** (depth-1 direct neighbors) and **Full Universe overview mode**.
- Interactive relationship exploration and connection table inspection.
- Filter by entity category and relationship type.
- Zoom, pan, and focus controls with keyboard navigation.

#### Chapter Writing in Book View

Write manuscripts directly within Book View using a distraction-free CodeMirror 6 canvas. Features live word/character counts, debounced auto-saving, manual save shortcuts (`Ctrl+S`), save status telemetry, and universe-scoped lore integration.

#### Universe Management

Organize multiple fictional Universes independently.

Universes can be archived and recovered without deleting their content.

> Permanent Universe deletion is not currently supported.

---

## Echo Library — Live Lore Recognition & Writing Assistance

**Echo Library** is an intelligent, contextual writing assistant built into the chapter editor. As you write prose, Echo automatically recognizes characters, factions, locations, artifacts, and concepts from your Lorebook—including known aliases—and highlights them with subtle, non-destructive visual underlines.

> **Plain-Language Distinction: Ephemeral Recognition vs. Explicit References**
> - **Live Ephemeral Recognition (Implemented in v0.8.0-beta.1):** Echo scans your chapter text in real time using your active Universe's Lorebook entities. It decorates recognized names with visual underlines on the fly. It does **not** alter your Markdown prose, inject hidden codes, or disrupt your typing and undo/redo history.
> - **Persistent Explicit References (Planned for Future Milestone E3):** Explicit user-bound entity references (permanently linking a specific span of prose to a Lorebook entity ID, surviving name changes) are **not** yet implemented and are planned for a subsequent phase after design review.

### Key Capabilities

- **Automatic Name & Alias Recognition:** Recognizes canonical entity names and writer-defined aliases (e.g. *Lady Katherine* and *The Silver Hawk*) with boundary-aware, longest-match precedence.
- **Contextual Reference Dossiers:** Hover or press `Alt+E` / `Mod-Shift-E` on any recognized mention to open a floating dossier summarizing the entity's category, narrative role, summary, official faction positions, and custom parameters.
- **Interactive Disambiguation:** If multiple entities in your Universe share the same name or alias, Echo presents a disambiguation selector allowing you to inspect each candidate.
- **Focus-Safe Usability Controls:**
  - **Echo On / Off Toggle:** A toolbar toggle pill lets you easily turn off recognition decorations when you want an entirely distraction-free writing experience. Your preference is persisted across sessions (`mc_echo_recognition_active`).
  - **Keyboard Inspection:** Press `Alt+E` (or `Mod-Shift-E`) to immediately inspect the entity mention under your cursor.
  - **Focus Restoration:** Dismissing a dossier via `Escape` or the close button immediately returns cursor focus to the CodeMirror editor so writing continues without interruption.
- **Strict Universe Scoping:** Recognition is strictly isolated to the active chapter's owning Universe, preventing characters or lore from leaking across different fictional worlds.
- **Non-Destructive Editing Safety:** Echo decorations are ephemeral visual marks in CodeMirror 6. Typing, selections, cursor positions, and native undo/redo (`Ctrl+Z` / `Ctrl+Y`) remain fast, stable, and completely untouched.

---

## House of Thoughts — Workspaces Above Studios

**House of Thoughts** is a core organizational feature within MetaCognition Notebook—not an application rebrand. It introduces an organizational layer above individual Studios, allowing writers to group related creative work into dedicated, configurable workspaces called **Houses**.

Whether you maintain separate Houses for distinct creative projects, thematic anthologies, or writing disciplines, each House provides its own tailored environment.

### Key Capabilities

- **Houses as Workspaces Above Studios**: Each House contains its own enabled Studios, documents, and fictional Lorebook Universes.
- **Default / Primary House Compatibility**: Every notebook includes a permanent **Primary House** (`house-default`). Legacy documents without explicit House attribution and unassigned Lorebook Universes resolve deterministically to the Primary House without modifying files on disk.
- **Creating and Customizing Houses**: Create custom Houses with unique names, descriptions, accent colors (Amber, Emerald, Indigo, Rose, Sky, Violet), and icons (Castle, Compass, Scroll, Feather, Book, Landmark, and more).
- **Studio Enablement per House**: Choose which authoring Studios are enabled in each House (`Poetry Studio`, `Philosophy Studio`, `Lorebook Studio`). For example, a specialized philosophical anthology can disable Poetry and Lorebook to maintain an uncluttered workspace.
- **House-Scoped Document Library & Counts**: The document library, studio navigation badges, and empty states strictly reflect documents belonging to the active House. Switching to a House with zero Philosophy documents displays a count of `0` and an empty Philosophy workspace.
- **House-Scoped and Global Search**: Search within the active House or toggle to search across all Houses in the notebook. Cross-House search results display clear House badges; selecting a cross-House result safely switches to that House.
- **Safe Single-Document House Moves**: Move individual Poetry, Philosophy, or standalone Lorebook documents from one House to another. The system flushes pending saves, validates the target House's enabled Studios, and updates the canonical Markdown frontmatter without altering physical file paths or stable document IDs.
- **Coordinated Lorebook Universe Moves**: Move an entire fictional Universe—including all its owned Lorebook entity documents, Books, Chapters, Story Nodes, and internal relationships—from one House to another in a single coordinated operation. The operation is tracked by a durable journal that guarantees deterministic roll-forward recovery across restarts.
- **House Archiving & Restoration**: Inactive or completed Houses can be archived to declutter the workspace while keeping all documents, universes, and relationships completely intact. The Primary House is permanently protected against archiving.
- **House Tools: Optional Manuscript Tools**: Manuscript Tools is an optional House-level tool located under a dedicated **House Tools** section in the primary sidebar, governed by the per-House `manuscript_tools_enabled` setting.

> **Clarifying Concept Boundaries:**
> **House of Thoughts** organizes writing across Studios into cohesive workspaces.
> **Manuscript Tools** is an optional assembly tool *within* a House, used to sequence, outline, and compile multi-studio writings into unified manuscripts. It is not an authoring Studio or a substitute for Houses.

---

## More Than a Writing Application

### Your Writing, Your Files

MetaCognition Notebook uses local Markdown-based documents as its canonical writing format.

Your creative work is not dependent on a mandatory cloud account or proprietary online editor.

### The Vault — Protect Your Writing

Create verified local backups of your notebook and restore supported content when needed.

The Vault provides backup verification, separate-copy restoration, and active-notebook recovery workflows.

> Vault backups are local and unencrypted. Keep additional copies on another drive for protection against device loss.

### Organize Your Creative Space

Keep your writing accessible through:

- Document search.
- Tags and collections of related work.
- Favorites.
- Recently opened documents.
- Sorting and filtering.
- Studio-specific organization.

### A Workspace That Feels Personal

MetaCognition Notebook uses its **Gilded Identity** visual language:

- Charcoal and antique-gold accents.
- Warm ivory surfaces.
- Serif typography.
- Light, Dark, and System themes.
- A calm interface focused on writing and reflection.

### Writing Atmosphere — Local Ambient Audio Player

Create an immersive, focused writing environment with a built-in, local-first ambient music player:

- **Local Music Directory**: Automatically scans an application-managed `Music/` folder (`lofi/`, `medieval/`, `scifi/`, or custom folders).
- **Supported Formats**: Reads `.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`, and `.aac` audio files.
- **External Imports**: Easily import ambient tracks generated externally (e.g. via FlowMusic) or personal music files with the one-click "Open Music Folder" button.
- **Persistent Playback**: The player is docked discreetly in the bottom-right corner and continues playing uninterrupted across House, Studio, document, and chapter navigation.
- **100% Offline & Safe**: Zero network requests, zero telemetry, and strict path-traversal prevention. Never autoplays on application launch; volume, category, and repeat mode (`all`, `one`, `off`) persist in local storage.

### In-App Help & Guide

Comprehensive offline guidance accessible anytime via `F1` or the navigation menu:

- **11 Structured Chapters**: Covers Getting Started, Poetry Studio, Philosophy Studio, Lorebook Studio, Manuscript Tools, The Vault, Document Management, Shortcuts & Troubleshooting, Houses of Thoughts, Echo Library, and Writing Atmosphere.
- **In-Depth Worldbuilding Guidance**: Practical instructions for Character profiles, Faction organizational positions, Web of Thought visual exploration (240-edge graph bounds), CodeMirror 6 soft line wrapping, and live lore recognition.
- **Accessible & Offline**: Instant full-text manual search, step-by-step instructions, and zero external network calls.

### Flexible Saving

Choose between automatic and manual saving.

Automatic saving is configurable, while Manual mode provides explicit Save and `Ctrl+S` controls.

Unsaved-writing protection helps prevent accidental loss during normal navigation and exit.

---

## Getting Started

### Requirements

MetaCognition Notebook currently focuses on Windows desktop development.

To build the application from source, install:

- Node.js and npm.
- Rust and Cargo.
- Tauri 2 desktop prerequisites.
- Microsoft C++ Build Tools and Windows SDK.
- Microsoft Edge WebView2.

### Clone the Repository

```bash
git clone <YOUR-REPOSITORY-URL>
cd MetaCognitionNotebook
```

Replace `<YOUR-REPOSITORY-URL>` with the actual repository URL.

### Install Dependencies

```bash
npm ci
```

### Run the Desktop Application

```bash
npm run tauri -- dev
```

### Build the Windows NSIS Installer

```bash
npm run tauri -- build --bundles nsis
```

The installer will be generated under `src-tauri/target/release/bundle/nsis/` (or `target/release/bundle/nsis/`).

### Run Tests

```bash
npm test
npx tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml
```

### Build the Frontend

```bash
npm run build
```

> Running `npm run dev` opens a browser-based development preview using mock storage. Use the Tauri desktop application for native notebook persistence, CodeMirror writing, and Vault functionality.

---

## Development Roadmap

MetaCognition Notebook is actively evolving.

| Version | Milestone | Status |
|---------|-----------|--------|
| v0.1.0 | Foundation | Completed |
| v0.2.0 | Three Studios | Completed |
| v0.3.0 | Gilded Identity | Completed |
| v0.4.0 | Writer's Workshop | Completed |
| v0.5.0 | The Vault | Completed |
| v0.5.2 | Emotional Cipher | Completed |
| v0.6.0 | Web of Thought | Completed |
| v0.6.1 | Help Center | Completed |
| v0.6.2 | The Living Universe | Completed (Last established release) |
| v0.7.0 | House of Thoughts | Implemented (In Stabilization; Automated verification passed; Windows manual acceptance pending) |
| **v0.8.0-beta.1** | **Echo Library Preview** | **Current Prerelease (E0–E2.5 Implemented; Automated verification passed; Windows acceptance pending)** |
| v0.9.0 | Conversation Archive | Planned |
| v1.0.0 | First Edition | Planned |

### Future Expansions

Beyond the established milestones, future development includes:

- **Echo Library E3**: Persistent, writer-bound explicit references and advanced context navigation.
- **Web of Thought Polish**: Better edge routing, label readability, and visual decluttering.
- **Poetry Studio Expansion**: Emotional Cipher per-stanza manual substitutions and rhyme/meter analysis.
- **Philosophy Studio Expansion**: Argument Web extensions beyond current freeform and role-based blocks.
- **Manuscript Tools Expansion**: EPUB export and revision snapshot history.
- **Notes Studio**: Quick scratchpad and informal note-taking.
- **Essay Studio**: Dedicated compositions for essays and letters.
- **Safe Universe Reset and Deletion**: Recoverable reset and permanent deletion with durable journaling.

These expansions do not yet have finalized release version assignments.

**[View the Full Development Roadmap](docs/ROADMAP.md)**

---

## Current Development Status

- **Last Established Release:** v0.6.2 (*The Living Universe*)
- **Current Development Milestone:** v0.8.0-beta.1 (*Echo Library Preview*)
- **Release Status:** Prerelease / In Acceptance (Automated verification passed; Manual Windows acceptance pending)

MetaCognition Notebook has completed the core engineering phases for **Echo Library Preview**:
1. **Character Profile Refinement (C1):** Practical encyclopedia character fields and custom parameters.
2. **Faction Organizations & Official Positions (C2):** Branch hierarchies, official positions, and character holder assignments.
3. **Relationship Consistency (C3):** Unified guided and manual relationship synchronization.
4. **Graph Readability (C4):** Focused entity depth-1 views and universe overview modes.
5. **CodeMirror 6 Foundation (E0/E1):** Fast, non-destructive writing foundation.
6. **Live Lore Recognition & Contextual Dossiers (E2):** Real-time entity and alias recognition, floating dossiers, and ambiguity resolution.
7. **Chapter Editor Echo Integration (E2.5):** In-situ chapter drafting in Book View, user recognition toggle, keyboard inspection (`Alt+E`), and production Windows NSIS installer packaging.
8. **Writing Atmosphere & In-App Guide Refresh (M1):** Local music player for FlowMusic and external audio imports, persistent playback, strict offline security, and updated in-app manual covering Houses, CodeMirror soft wrapping, Lorebook, Echo, and Atmosphere.

All core automated verification gates (499 frontend tests, 114 Rust backend tests, TypeScript typechecking, Rust Clippy, and production build) pass cleanly. A fresh Windows NSIS installer has been compiled. Final manual Windows acceptance across all installed workflows remains pending.

**This repository reflects a prerelease preview (`v0.8.0-beta.1`) and should not be interpreted as an official final production release.**

---

## Known Limitations

MetaCognition Notebook is actively developing toward its first edition. Confirmed current limitations include:

- **Ephemeral vs. Persistent References:** Live Lore recognition is ephemeral text matching against active Lorebook entries. Persistent explicit entity references (where a prose mention is permanently linked to an entity ID across renames) are planned for Milestone E3.
- **Dense Graph Layout:** In densely connected Universes with many overlapping relationships, graph edges and labels may cross. Use the Focused Entity mode or category filters for optimal readability.
- **Client-Side Lore Indexing Scale:** Live Lore recognition indexes entities client-side per active Universe. Settings with more than 5,000 distinct entities may experience minor initial index compilation latency.
- **Permanent Universe Deletion:** Complete destructive deletion of a Universe is not yet available; archiving safely hides the Universe while preserving files on disk.
- **Entity Archival Granularity:** Entity archival safely unlinks active relationships first and moves files to `Backups/`, but is not a crash-atomic multi-file filesystem transaction.
- **Manuscript Export Formats:** Manuscript Tools currently supports unified Markdown and PDF export via jsPDF; EPUB export and revision snapshot history remain planned.
- **Notes Studio and Essay Studio:** These proposed studios are not yet implemented.
- **Conversation Archive:** AI conversation archiving is planned for milestone v0.9.0.
- **External Edits:** External file modifications made outside the application require explicit reload/reindex rather than automatic live three-way merging.
- **Installed-App Acceptance:** Certain native desktop workflows (e.g., cross-restart persistence under specific Windows edge cases) are undergoing final acceptance in the standalone NSIS build.

For detailed architecture, data structures, and recovery behavior, consult the system design documentation.

---

## Documentation

Interested in how MetaCognition Notebook works?

- **[System Design](SYSTEM_DESIGN.md)** — Canonical data model, Lorebook architecture, Echo Library engine, save coordination, and recovery.
- **[Development Roadmap](docs/ROADMAP.md)** — Established milestones, phase breakdowns, and future expansions.
- **[Documentation Index](docs/README.md)** — Technical reports, implementation notes, and verification records.

---

## Built With

MetaCognition Notebook uses:

- **Tauri 2** — Desktop application framework.
- **Rust** — Native application backend.
- **React 18** — User interface.
- **CodeMirror 6** — Modern, extensible writing editor.
- **TypeScript** — Frontend development.
- **Vite** — Frontend tooling.
- **SQLite** — Document metadata indexing.
- **Markdown** — Canonical writing storage.

---

## AI-Assisted Development

MetaCognition Notebook has been developed with AI assistance, including Gemini Antigravity and OpenAI ChatGPT/Codex, for planning, implementation, debugging, and documentation.

AI-assisted development is used under human direction and review.

Automated tests and AI-generated contributions do not guarantee complete security, correctness, or manual verification.

---

## License

MetaCognition Notebook is licensed under the **MIT License**.

See the [LICENSE](LICENSE) file for details.

---

<div align="center">

### Every thought begins somewhere.

**Write freely. Think deeply. Build worlds.**

*MetaCognition Notebook*

</div>
