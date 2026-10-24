<div align="center">

# MetaCognition Notebook

### A personal sanctuary for writing, reflection, and imagination.

**A local-first creative workspace for poetry, philosophy, and worldbuilding.**

![Release](https://img.shields.io/badge/release-v0.6.2-C6A66B)
![Milestone](https://img.shields.io/badge/milestone-v0.7.0-blue)
![Status](https://img.shields.io/badge/status-unreleased%20%2F%20pending%20acceptance-orange)
![Platform](https://img.shields.io/badge/platform-Windows-252629)
![License](https://img.shields.io/badge/license-MIT-C6A66B)
![Status](https://img.shields.io/badge/status-In%20Development-orange)

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
- Create and organize fictional Universes.
- Develop Characters, Locations, and Factions.
- Document Rules, Systems, Cultures, and History.
- Create Artifacts, Events, and other lore.
- Build Books and write Chapters.
- Develop Universe and Book timelines.
- Create Story Nodes to plan important events.
- Connect entities through relationships.
- Explore connections using the interactive World Relationships Graph.

#### Web of Thought

Explore how characters, factions, locations, and events relate to one another across your fictional Universe.

Web of Thought supports detailed planning, contextual relationships, historical observations, and continuity management.

#### World Relationships Graph

Visualize connections across your fictional world.

- Distinct entity categories and visual styles.
- Interactive relationship exploration.
- Relationship and entity filters.
- Zoom, pan, and focus controls.
- Navigation between connected entities.

#### Universe Management

Organize multiple fictional Universes independently.

Universes can be archived and recovered without deleting their content.

> Permanent Universe deletion is not currently supported.

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

### Flexible Saving

Choose between automatic and manual saving.

Automatic saving is configurable, while Manual mode provides explicit Save and Ctrl+S controls.

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

The installer will be generated under the Tauri release bundle directory.

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

> Running `npm run dev` opens a browser-based development preview using mock storage. Use the Tauri desktop application for native notebook persistence and Vault functionality.

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
| v0.7.0 | House of Thoughts | Implemented (Unreleased; Automated verification passed; Windows acceptance pending) |
| v0.8.0 | Echo Library | Planned |
| v0.9.0 | Conversation Archive | Planned |
| v1.0.0 | First Edition | Planned |

### Future Expansions

Beyond the established milestones, future development may include:

- Expanded Philosophy Studio workflows.
- Notes Studio.
- Essay Studio for essays and letters.
- Additional Poetry Studio tools.
- Cross-studio document connections.
- Improved search and writing discovery.
- Additional Lorebook and worldbuilding features.
- Safe Universe reset and permanent deletion.

These expansions do not yet have finalized version assignments.

**[View the Full Development Roadmap](docs/ROADMAP.md)**

---

## Current Development Status

- **Last Established Release:** v0.6.2 (*The Living Universe*)
- **Current Development Milestone:** v0.7.0 (*House of Thoughts*)
- **v0.7.0 Release Status:** Unreleased / In Stabilization (Pending manual Windows acceptance)

MetaCognition Notebook is actively developing the **House of Thoughts** milestone (Phases 1–4 and Phase 4 acceptance fixes), introducing House-level workspaces, canonical House registries, House-scoped library isolation, safe document and coordinated Universe moves, and optional Manuscript Tools navigation.

All automated verification gates (107/107 Rust tests, 352/352 frontend tests, TypeScript typechecking, Rust Clippy, and production build) pass cleanly. Manual Windows acceptance and final release approval remain pending.

**This repository should not be interpreted as announcing a published stable v0.7.0 release.**

---

## Known Limitations

MetaCognition Notebook is still under development.

Some current limitations include:

- Permanent Universe deletion is unavailable.
- Entity archival is recoverable but not a fully atomic multi-file operation.
- Dense relationship graphs may require filtering and zooming.
- Manuscript Tools supports unified Markdown and PDF export via jsPDF; EPUB export and writing history remain planned.
- Notes Studio and Essay Studio are not yet available.
- Echo Library and Conversation Archive remain future milestones.
- External-edit conflicts require explicit handling rather than automatic merging.

For detailed architecture and recovery behavior, consult the system design documentation.

---

## Documentation

Interested in how MetaCognition Notebook works?

- **[System Design](SYSTEM_DESIGN.md)** — Application architecture, storage, persistence, and relationships.
- **[Development Roadmap](docs/ROADMAP.md)** — Current milestones and future expansions.
- **[Documentation Index](docs/README.md)** — Technical reports, implementation notes, and verification records.

---

## Built With

MetaCognition Notebook uses:

- **Tauri 2** — Desktop application framework.
- **Rust** — Native application backend.
- **React** — User interface.
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
