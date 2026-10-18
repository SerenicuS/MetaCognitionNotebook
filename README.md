# MetaCognition Notebook (MC)

> **A focused, local-first desktop writing environment engineered for poetic cadence, philosophical inquiry, and structured worldbuilding.**

[![Version](https://img.shields.io/badge/version-0.3.0--alpha-C6A66B?style=flat-square)](./README.md)
[![Platform](https://img.shields.io/badge/platform-Windows%20(Tauri%202)-252629?style=flat-square)](./README.md)
[![Stack](https://img.shields.io/badge/stack-Rust%20%7C%20React%20%7C%20SQLite-C6A66B?style=flat-square)](./README.md)
[![License](https://img.shields.io/badge/license-Proprietary%20%2F%20Unlicensed-gray?style=flat-square)](./README.md#15-license-and-contributions)

---

## Table of Contents

- [1. Project Identity](#1-project-identity)
- [2. The Problem](#2-the-problem)
- [3. The Solution](#3-the-solution)
- [4. Project Objectives](#4-project-objectives)
- [5. Writing Studios](#5-writing-studios)
  - [Active Studios](#active-studios)
  - [Future Studios (Planned)](#future-studios-planned)
- [6. Implemented Features](#6-implemented-features)
- [7. Technology Stack](#7-technology-stack)
- [8. Installation and Development](#8-installation-and-development)
- [9. How to Use (Beginner Workflow)](#9-how-to-use-beginner-workflow)
- [10. Visual Identity & Atmosphere](#10-visual-identity--atmosphere)
- [11. Privacy and Local-First Philosophy](#11-privacy-and-local-first-philosophy)
- [12. Development Roadmap](#12-development-roadmap)
- [13. Known Limitations](#13-known-limitations)
- [14. Future Vision](#14-future-vision)
- [15. License and Contributions](#15-license-and-contributions)

---

## 1. Project Identity

**MetaCognition Notebook (MC)** is a local-first desktop application built for creators, thinkers, and worldbuilders who work across distinct creative domains. 

Standard word processors treat every text as an undifferentiated stream of paragraphs, forcing users to adapt their cognitive processes to generic tooling. MetaCognition Notebook rejects this one-size-fits-all approach: it provides specialized **Studios** tailored to distinct modes of thought—verse composition, philosophical discourse, and cosmological lorecraft—while unifying all writing within an open, human-readable file system.

- **Current Version:** `v0.3.0` (Milestone: *The Gilded Identity* — Sizing & Theme Polish)
- **Development Status:** Alpha / Active Development
- **Operating Environment:** Windows 10 / 11 (64-bit desktop application via Tauri 2 runtime)
- **Deep Architecture Reference:** See [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md) for full engineering specifications.

---

## 2. The Problem

Writers, scholars, and worldbuilders face pervasive friction with contemporary software:

1. **Fragmented Workspaces:** A poet might write verses in a lightweight notes app, draft philosophical essays in a formal document processor, and track worldbuilding bibles in wikis or spreadsheets. Switching tools creates cognitive fatigue and fractures personal archives.
2. **Generic Document Paradigms:** Standard text editors lack native structural paradigms for non-standard prose. Stanza verse requires strict line breaks and meter awareness; philosophical treatises require premise-argument-objection categorization; worldbuilding entries require structured parameters and canon tracking.
3. **Cloud Enclosure & Privacy Vulnerabilities:** Mainstream SaaS tools lock writing behind subscription walls, proprietary database formats, and cloud services that may train AI models or suffer outages. Writers lose direct sovereignty over their creative life's work.
4. **Distraction & Clutter:** Modern web-based platforms are cluttered with social collaboration prompts, notifications, and complex toolbar configurations that derail deep focus.
5. **Fragile Creative Continuity:** Worldbuilders struggle to track facts, timelines, and faction allegiances across multiple documents, frequently leading to continuity errors.

---

## 3. The Solution

MetaCognition Notebook resolves these challenges through a **unified, local-first application architecture**:

- **Specialized Studios Under One Roof:** Users switch between distinct creative domains—Poetry, Philosophy, and Lorebook—without leaving the application or maintaining multiple apps.
- **Dual Storage Persistence:** Documents are stored canonically as transparent, human-readable **Markdown files with JSON frontmatter** directly on your hard drive (`Documents/MetaCognitionNotebook/`), coupled with a high-performance **SQLite database** that indexes metadata, tags, and document relationships for instant search and retrieval.
- **Zero Cloud Dependency:** The app runs entirely offline on your local machine with zero external network calls, zero telemetry, and zero mandatory cloud synchronization.
- **Editorial Aesthetic:** The interface is styled with a bespoke *Gilded Identity* (charcoal, antique gold, and warm ivory), offering an immersive, literary environment designed for deep creative focus.

---

## 4. Project Objectives

### General Objective
To provide an elegant, private, local-first desktop environment that honors the nuanced structural needs of diverse writing disciplines without sacrificing file portability.

### Specific Objectives
- **Personal Writing:** Provide a resilient, distraction-free environment with debounced background autosave, guaranteeing that unsaved writing is never silently discarded.
- **Creative Expression:** Support line-by-line verse composition in Poetry Studio, preserving whitespace, indentation, stanza boundaries, and meter.
- **Philosophical Reflection:** Enable dialectical discourse in Philosophy Studio through classified argumentation blocks (Premise, Argument, Objection, Example, Conclusion, Prose).
- **Worldbuilding:** Facilitate cosmological consistency in Lorebook Studio via categorized entity types (Characters, Locations, Factions, Artifacts) and canon status tracking (Canon, Draft, Speculative).
- **Organization & Retrieval:** Deliver instant keyword search and tag filtering across titles and Markdown contents using SQLite indexing.
- **Privacy & Data Ownership:** Ensure total user sovereignty by storing all canonical documents as standard `.md` files on the user's filesystem.
- **Extensibility:** Architect an open data and IPC layer capable of hosting future writing studios and advanced relationship graph features without schema rewrites.

---

## 5. Writing Studios

MetaCognition Notebook organizes creative output into specialized studios. Each studio tailors its interface, metrics, and metadata to its respective discipline while sharing the universal persistence layer.

### Active Studios

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MetaCognition Notebook                          │
├────────────────────┬────────────────────┬──────────────────────────────┤
│   Poetry Studio    │ Philosophy Studio  │       Lorebook Studio        │
│   (Verse & Meter)  │  (Dialectics &     │   (Cosmology, Factions &     │
│                    │    Treatises)      │           Canon)             │
└────────────────────┴────────────────────┴──────────────────────────────┘
```

#### 1. Poetry Studio
- **Purpose:** Crafted for poets, lyricists, and verse dramatists.
- **Capabilities:**
  - **Stanza-Centric Composition:** Text is parsed and edited as discrete stanzas separated by blank lines, preventing accidental reflow.
  - **Reordering & Manipulation:** Move stanzas up or down with dedicated controls or insert new stanzas at specific points in the poem.
  - **Real-Time Verse Metrics:** Live counters track stanza counts, line totals, and word totals.
  - **Poetic Metadata:** Configure poetic form (*Free Verse*, *Sonnet*, *Haiku*, etc.), meter, and rhyme schemes in structured frontmatter.
  - **Typography Controls:** Switch typography between Serif, Sans, and Monospace display modes.
  - **Markdown Export:** Export clean, formatted Markdown files with poem titles and stanza breaks preserved.

#### 2. Philosophy Studio
- **Purpose:** Designed for thinkers, essayists, and dialecticians constructing rigorous arguments or philosophical treatises.
- **Capabilities:**
  - **Proposition Classification:** Individual paragraphs can be classified with functional dialectical tags:
    - `Premise / Axiom` (Indigo accent)
    - `Argument / Dialectic` (Sky blue accent)
    - `Objection / Counterpoint` (Amber accent)
    - `Example / Thought Experiment` (Emerald accent)
    - `Conclusion / Corollary` (Purple accent)
    - `General Prose` (Neutral card styling)
  - **Structure & Sequence:** Move argumentative blocks up or down to test logical flow.
  - **Treatise Hierarchy:** Track formal work titles, chapter numbers, and epigraphs stored in document metadata.
  - **Blockquote Export:** Export treatises directly to Markdown where propositions are serialized as blockquotes with explicit uppercase classification headers.

#### 3. Lorebook Studio
- **Purpose:** Built for novelists, screenwriters, game masters, and worldbuilders managing expansive fictional universes.
- **Capabilities:**
  - **Worldbuilding Hierarchy:** Organize entries by **Universe**, **Book**, and **Chapter** breadcrumbs.
  - **Entity Categorization:** Tag entries by specific lore taxonomy:
    - *Character*, *Location*, *Faction*, *Event*, *Concept / Magic*, *Artifact*, or *Other*.
  - **Canon Status Management:** Track the veracity of each entry:
    - `Canon` (Verified lore — emerald badge)
    - `Draft` (In development — amber badge)
    - `Speculative` (In-universe theory or rumor — violet badge)
  - **Key-Value Attributes Matrix:** Add custom dynamic parameters (e.g., *Ruling House*, *Lifespan*, *Coordinates*, *Magic Class*) stored in metadata.
  - **Dual Mode Writing & Preview:** Toggle between direct Markdown editing and rendered reading mode.
  - **Markdown Export:** Export comprehensive lore entries complete with attribute tables and canon markers.

---

### Future Studios (Planned)

The following studios are planned for future development milestones and are **not yet implemented**:

- **Notes Studio (Planned):** A rapid, stream-of-consciousness scratchpad for capturing fragments, fleeting ideas, reading quotes, and daily logs without initial categorization.
- **Essay Studio (Planned):** A long-form prose environment designed for formal essays, academic papers, and epistolary correspondence (both formal essays and letter-writing belong to this unified studio).

---

## 6. Implemented Features

| Feature Area | Implemented Capabilities | Status |
| :--- | :--- | :--- |
| **Studio Switching** | Instant navigation across Poetry, Philosophy, and Lorebook studios. | ✅ Verified |
| **Document Creation** | Studio-specific document creation with custom title, folder routing, and metadata. | ✅ Verified |
| **Autosave Engine** | 400ms debounced persistence, in-flight edit race condition prevention, dirty checking. | ✅ Verified |
| **Safe Persistence** | Atomic file replacement via temporary files; directory traversal prevention. | ✅ Verified |
| **Safe Archival** | Deletions move files to timestamped `Backups/` directory; zero destructive deletes. | ✅ Verified |
| **Reopen & Recovery** | Content, metadata, tags, and relationships persist across studios, restarts, and app close. | ✅ Verified |
| **Search & Filtering** | Universal search modal (`Ctrl+F` / `Ctrl+K`) filtering by title, contents, and studio type. | ✅ Verified |
| **Keyboard Navigation** | Desktop shortcuts for save (`Ctrl+S`), create (`Ctrl+N`), search (`Ctrl+F`), and modal dismissal (`Esc`). | ✅ Verified |
| **Theme System** | Instant dynamic toggle between Dark (Charcoal & Gold) and Light (Warm Ivory & Gold). | ✅ Verified |
| **Branding Presentation** | High-resolution official emblems, 30% sizing polish, and theme-aware asset resolution. | ✅ Verified |
| **Offline Operation** | 100% offline desktop execution; no external API requirements or mandatory telemetry. | ✅ Verified |
| **Export Engine** | Studio-specific Markdown (`.md`) file generation and client-side download. | ✅ Verified |
| **Echo Library** | Lorebook-exclusive cross-referencing and contextual entity linking. | 📋 Planned (v0.8.0) |
| **Notes & Essay Studios**| Additional specialized writing environments for notes and formal correspondence. | 📋 Planned (Future) |

---

## 7. Technology Stack

MetaCognition Notebook combines a high-performance native desktop shell with a modern, responsive web frontend:

- **Desktop Shell & Native Backend:** [Tauri 2](https://v2.tauri.app/) + [Rust](https://www.rust-lang.org/)
  - Native Windows runtime providing secure IPC and small binary footprints.
  - Low resource consumption compared to Electron-based editors.
- **Frontend Framework:** [React 18](https://react.dev/) + [TypeScript 5](https://www.typescriptlang.org/)
  - Declarative user interface with strict end-to-end type safety.
- **Styling & Design Tokens:** [Tailwind CSS](https://tailwindcss.com/)
  - Bespoke color palette (*Charcoal* `#252629`, *Antique Gold* `#C6A66B`, *Warm Ivory* `#FAF7F2`).
- **Iconography:** [Lucide Icons](https://lucide.dev/) for interface actions, paired with official bespoke studio emblems.
- **Database Indexer:** [SQLite 3](https://www.sqlite.org/) via [`rusqlite`](https://crates.io/crates/rusqlite) (bundled)
  - Configured in Write-Ahead Logging (WAL) mode with foreign keys enabled.
- **Build Tooling:** [Vite 6](https://vitejs.dev/) for fast frontend bundling.

> For a complete architectural breakdown, sequence diagrams, and schema definitions, consult [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md).

---

## 8. Installation and Development

### Prerequisites

Ensure the following tools are installed on your Windows development environment:

1. **Node.js** (v18.0 or later) & `npm`
2. **Rust & Cargo** (1.80 or later) — Install via [rustup.rs](https://rustup.rs/)
3. **Microsoft C++ Build Tools** — Required for compiling native Rust crates on Windows (included with Visual Studio Community or Visual Studio Build Tools with the "Desktop development with C++" workload).

### Installation

Clone the repository and install frontend dependencies:

```bash
git clone https://github.com/your-username/MetaCognitionNotebook.git
cd MetaCognitionNotebook
npm install
```

### Running in Development

You can run the web interface standalone in your browser or run the full native Tauri desktop application:

```bash
# Option A: Run web frontend standalone (uses in-memory MockStorage)
npm run dev

# Option B: Run full native Tauri desktop application
npm run tauri dev
```

### Running Test Suites

The repository contains automated unit and integration tests across both the TypeScript frontend and Rust backend:

```bash
# Run TypeScript / Vitest test suite (document operations, autosave, IPC contract)
npm test

# Run Rust unit and integration test suite
cargo test --manifest-path src-tauri/Cargo.toml
```

### Building for Production

Compile both frontend web assets and the native Windows executable:

```bash
# 1. Typecheck and bundle frontend distribution
npm run build

# 2. Build production Windows desktop application bundle
npm run tauri build

# Alternatively, compile release binary directly with Cargo:
cargo build --release --manifest-path src-tauri/Cargo.toml
```

Production build artifacts will be generated at:
- Executable: `src-tauri/target/release/meta-cognition-notebook.exe`
- Tauri Installer / Bundle: `src-tauri/target/release/bundle/msi/` or `nsis/`

---

## 9. How to Use (Beginner Workflow)

### Step 1: Launch the Application
Start the desktop app. By default, MC opens into the **All Library** view. If no documents exist, an introductory workspace hero invites you to choose a studio.

### Step 2: Choose a Studio
Click on **Poetry Studio**, **Philosophy Studio**, or **Lorebook Studio** on the primary sidebar or from the workspace selection cards. The document list will filter to show works belonging to that studio.

### Step 3: Create a Document
- Press `Ctrl + N` or click **New Document** in the sidebar.
- Enter a title (e.g., *"Sonnet of the Winter Solstice"*, *"Critique of Pure Intuition"*, or *"Aethelgard Citadel"*).
- Select the Studio Mode and optional tags.
- Click **Create Document**. The new document opens immediately in the editor.

### Step 4: Write with Continuous Autosave
- Begin typing in your studio canvas.
- As you type, the subtle save indicator in the top right switches from **Saved** (green check) to **Editing** (gold pulse).
- 400 milliseconds after your last keystroke, the changes flush automatically to disk and the database, updating the indicator back to **Saved**.
- Press `Ctrl + S` at any moment to trigger an immediate manual flush.

### Step 5: Search and Retrieve
- Press `Ctrl + F` or `Ctrl + K` to open the universal search modal.
- Type any keyword. The modal instantly matches document titles and text snippets across all studios.
- Use `ArrowUp`, `ArrowDown`, and `Enter` to open any matched document immediately.

### Step 6: Toggle Themes
- Click the **Settings** gear at the bottom of the sidebar.
- Under **Interface Theme**, toggle between:
  - **Charcoal & Gold (Dark):** Introspective, late-night deep work aesthetic.
  - **Warm Ivory (Light):** Literary, daytime reading and editing atmosphere.
  - **System Match:** Synchronizes automatically with your Windows OS color preference.

---

## 10. Visual Identity & Atmosphere

MetaCognition Notebook features a bespoke visual identity known as **The Gilded Identity**, engineered to evoke scholarly focus and literary luxury:

```
┌──────────────────────────────────────────────────────────┐
│                   THE GILDED IDENTITY                    │
├────────────────────────────┬─────────────────────────────┤
│ Dark Theme (Atmospheric)   │ Light Theme (Warm Ivory)    │
│ • Charcoal (#252629)       │ • Ivory Ground (#FAF7F2)    │
│ • Antique Gold (#C6A66B)   │ • Antique Gold (#C6A66B)    │
│ • Rich Gold (#DDBA78)      │ • Rich Gold (#DDBA78)       │
│ • Highlight Gold (#F0D59A) │ • Subtle Warm Shadow        │
└────────────────────────────┴─────────────────────────────┘
```

- **Official Brand Assets:**
  - **MC Monogram:** Open-book monogram enclosed in a rounded seal.
  - **Poetry Emblem:** Stylized quill feather with an elegant curved flourish.
  - **Philosophy Emblem:** Geometric concentric labyrinth symbol.
  - **Lorebook Emblem:** Open tome emblazoned with the "LB" monogram.
- **Editorial Typography:** Headings utilize dignified serif styling (Cormorant Garamond aesthetic), while UI controls maintain crisp legibility via clean modern sans-serif typography (Inter).
- **Proportional Polish:** In `v0.3.0`, all brand emblems and studio headers received a targeted +30% sizing polish for visual prominence and readability.

---

## 11. Privacy and Local-First Philosophy

MetaCognition Notebook is grounded in strict **local-first software principles**:

- **Local Storage Exclusively:** All writing is saved directly to your local file system at:
  ```text
  %USERPROFILE%\Documents\MetaCognitionNotebook\
  ├── Poetry\
  ├── Philosophy\
  ├── Lorebooks\
  ├── Attachments\
  └── Backups\
  ```
- **Plain Text Longevity:** Documents are stored as transparent UTF-8 Markdown (`.md`) files with JSON frontmatter. If you ever stop using MetaCognition Notebook, your files can be opened, edited, and read by any text editor, Obsidian, VS Code, or standard operating system utility.
- **No Cloud Synchronization:** The application includes **no cloud sync, no remote servers, and no background network calls**. Your work never leaves your device.
- **Zero Telemetry:** MC does not collect analytics, telemetry, or user interaction data.
- **Reconstructible Index:** The SQLite database is an index cache. If the database file is accidentally deleted, the built-in **Reindex Engine** scans the `Documents/MetaCognitionNotebook` directory and rebuilds the SQLite database completely without data loss.

---

## 12. Development Roadmap

The MetaCognition Notebook roadmap is divided into structured milestones. Version numbers represent engineering milestones, not released distributions:

| Milestone | Code Name | Primary Scope | Status |
| :--- | :--- | :--- | :--- |
| **v0.1.0** | *The Foundation* | Tauri 2 runtime, SQLite schema, Markdown frontmatter storage, IPC commands. | ✅ Completed |
| **v0.2.0** | *The Three Studios* | Specialized Poetry, Philosophy, and Lorebook writing interfaces and workflows. | ✅ Completed |
| **v0.2.1** | *Phase 2A Reliability* | Debounced autosave, dirty state tracking, in-flight race prevention, window close flush. | ✅ Completed |
| **v0.3.0** | *The Gilded Identity* | Official brand assets, dark/light theme switching, +30% sizing polish, Windows icons. | 🔄 Current Milestone |
| **v0.4.0** | *The Writer's Workshop* | Tag management UI, sorting, folder filtering, favorite pinning, recents history. | 📋 Planned |
| **v0.5.0** | *The Vault* | Optional local encrypted backup exports and optional manual Google Drive backup sync. | 📋 Planned |
| **v0.6.0** | *The Web of Thought* | Bidirectional document linking (`[[wikilinks]]`), mention index, relationship graph. | 📋 Planned |
| **v0.7.0** | *The Manuscript* | Revision snapshot history, PDF/ePub compiling, comprehensive writing statistics. | 📋 Planned |
| **v0.8.0** | *Echo Library* | Lorebook-exclusive entity registry with stable IDs, context previews, and mention links. | 📋 Planned |
| **v0.9.0** | *Conversation Archive*| Standalone optional import and indexing of conversation logs from AI platforms. | 📋 Planned |
| **v1.0.0** | *The First Edition* | First comprehensive public production release with complete installer distribution. | 📋 Planned |
| **Future** | *Studio Expansion* | Implementation of **Notes Studio** (scratchpad) and **Essay Studio** (formal prose & letters). | 📋 Planned |

---

## 13. Known Limitations

- **Single Window Only:** Multi-window editing (opening multiple documents side-by-side in separate native OS windows) is currently unsupported.
- **Lexical Keyword Search:** Search currently performs substring matching on indexed metadata and files; advanced Full-Text Search (SQLite FTS5) is not yet active.
- **Manual Tag Entry:** Tags must currently be entered via metadata JSON or modal inputs; a dedicated tag manager sidebar is slated for v0.4.0.
- **No Cloud Backup:** Backups are currently local-only (`Backups/` folder); automatic off-site synchronization is planned for v0.5.0.
- **Desktop Focus:** Mobile platforms (Android/iOS) and web-hosted SaaS modes are outside the current project scope.

---

## 14. Future Vision

The long-term vision of MetaCognition Notebook is to become a sacred sanctuary for personal cognition—a quiet, enduring desktop haven where literature, philosophy, and mythic storytelling converge. 

As the application matures through its roadmap, it will introduce **Echo Library** for interconnected world lore, **The Web of Thought** for dialectical cross-referencing, and expanded studios for personal essays and correspondence, all while preserving the fundamental guarantee that **your thoughts belong to you, reside on your hardware, and will remain readable decades into the future**.

---

## 15. License and Contributions

- **License:** Proprietary / Unlicensed (Private repository). A formal open-source or commercial license has not yet been selected.
- **Contributions:** The project is currently maintained by the core development team. Contribution policies and pull-request guidelines will be published with the v1.0.0 public edition.
- **Support & Issues:** For bug reports and architectural feedback, please open an issue in the internal repository tracker.

---

*For detailed system architecture, SQLite schemas, IPC contracts, and workflow sequence diagrams, read [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md).*
