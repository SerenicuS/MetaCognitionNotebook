<div align="center">

# MetaCognition Notebook

### A personal sanctuary for writing, reflection, and imagination.

**A local-first creative workspace for poetry, philosophy, and worldbuilding.**

![Version](https://img.shields.io/badge/version-0.6.2-C6A66B)
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
| v0.6.2 | The Living Universe | Stabilization |
| v0.7.0 | House of Thoughts | Planned |
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

**Version 0.6.2 — The Living Universe**

MetaCognition Notebook is currently in active development and stabilization.

The latest development work focuses on Lorebook Studio, including Universe organization, reciprocal relationships, interactive relationship visualization, and archive safety.

Automated verification has passed for the reported implementation, but manual Windows acceptance and release approval remain outstanding.

**This repository should not be interpreted as announcing a published stable v0.6.2 release.**

---

## Known Limitations

MetaCognition Notebook is still under development.

Some current limitations include:

- Permanent Universe deletion is unavailable.
- Entity archival is recoverable but not a fully atomic multi-file operation.
- Dense relationship graphs may require filtering and zooming.
- Manuscript PDF/EPUB export is planned rather than implemented.
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
