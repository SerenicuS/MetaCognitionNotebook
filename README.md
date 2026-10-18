# MetaCognition Notebook (MC)

> **A focused, local-first desktop writing environment engineered for poetic cadence, philosophical inquiry, and structured worldbuilding.**

[![Version](https://img.shields.io/badge/version-0.4.0--alpha-C6A66B?style=flat-square)](./README.md)
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

- **Current Version:** `v0.4.0` (Milestone: *The Writer's Workshop* - Organization & Discovery)
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
- **Local-First Design:** The app is designed to run offline with no mandatory cloud synchronization. Network and telemetry claims should be verified against the packaged build and its dependencies.
- **Editorial Aesthetic:** The interface is styled with a bespoke *Gilded Identity* (charcoal, antique gold, and warm ivory), offering an immersive, literary environment designed for deep creative focus.

---

## 4. Project Objectives

### General Objective
To provide an elegant, private, local-first desktop environment that honors the nuanced structural needs of diverse writing disciplines without sacrificing file portability.

### Specific Objectives
- **Personal Writing:** Provide a resilient, distraction-free environment with debounced background autosave and a graceful-exit workflow, protecting pending edits during normal navigation and desktop close. Saving immediately before exit should be tested, especially when disk I/O fails or stalls.
- **Creative Expression:** Support line-by-line verse composition in Poetry Studio, preserving whitespace, indentation, stanza boundaries, and meter.
- **Philosophical Reflection:** Think freely in a natural writing canvas, then optionally classify and arrange reasoning blocks (Premise, Argument, Objection, Example, Conclusion, Prose).
- **Worldbuilding:** Facilitate cosmological consistency in Lorebook Studio via categorized entity types (Characters, Locations, Factions, Artifacts) and canon status tracking (Canon, Draft, Speculative).
- **Organization & Retrieval:** Organize documents with editable tags, Favorites, actual-opening Recents, four sort orders, and composable studio/tag/search filters.
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

#### 2. Philosophy Studio — The Thinking Desk

**Think freely first. Structure your reasoning when you're ready.**

- **Freeform Writing:** New documents start empty, with one expanding writing canvas for questions, reflections, multiple paragraphs, and unfinished thoughts. A dismissible introduction points to structured reasoning without interrupting writing.
- **Structured Reasoning:** The subtle toolbar control reveals optional block roles, reordering, insertion, and deletion. No argument template is required.
- **Understandable Roles:** The selected role has a short contextual explanation; “About reasoning roles” provides a compact reference for Premise / Axiom, Argument / Dialectic, Objection / Counterpoint, Example / Thought Experiment, Conclusion / Corollary, and General Prose.
- **Reversible Views:** Switching modes saves only view metadata and preserves the canonical body exactly. Existing blocks stay individually editable in Freeform, with their roles hidden and their order intact. They are not merged into one text field. New freeform prose remains one block until you deliberately add blocks in Structured Reasoning.
- **Compatibility:** Documents without a mode open in Structured Reasoning. Existing titles, chapter metadata, epigraphs, custom metadata, tags, and classifications are retained. Opening preserves its body; v0.4.0 records last-opened time in organization metadata. No database migration is required.
- **Autosave:** Both views use the existing 400ms debounce. Overlapping flushes are serialized; navigation and normal desktop exit wait for all pending writing and remain open after a save failure.

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

---

### Future Studios (Planned)

The following studios are planned for future development milestones and are **not yet implemented**:

- **Notes Studio (Planned):** A rapid, stream-of-consciousness scratchpad for capturing fragments, fleeting ideas, reading quotes, and daily logs without initial categorization.
- **Essay Studio (Planned):** A long-form prose environment designed for formal essays, academic papers, and epistolary correspondence (both formal essays and letter-writing belong to this unified studio).

---

## 6. Feature Status (v0.4.0 Alpha)

This table distinguishes functionality present in the application from capabilities that still need manual desktop verification and features reserved for future milestones. **Passing automated tests does not prove that every user-facing workflow works.**

| Feature Area | Current Scope | Status |
| :--- | :--- | :--- |
| **Studio Switching** | Instant navigation across Poetry, Philosophy, and Lorebook studios. | ✅ Verified |
| **Document Creation** | Studio-specific document creation with custom title, folder routing, and metadata. | ✅ Verified |
| **Autosave Engine** | 400ms debounce, serialized writes, revision tracking, failed-save navigation, and exit protection. | ✅ Verified; immediate-close preservation requires manual verification |
| **Safe Persistence** | Atomic file replacement via temporary files; directory traversal prevention. | ✅ Verified |
| **Safe Archival** | Deletions move files to timestamped `Backups/` directory; zero destructive deletes. | ✅ Verified |
| **Reopen & Recovery** | Content, metadata, tags, and relationships persist across studios, restarts, and app close. | ✅ Verified; persistence across application restarts requires manual verification |
| **Search & Filtering** | Universal search modal (`Ctrl+F` / `Ctrl+K`) filtering by title, contents, and studio type. | ✅ Verified |
| **Keyboard Navigation** | Desktop shortcuts for save (`Ctrl+S`), create (`Ctrl+N`), search (`Ctrl+F`), and modal dismissal (`Esc`). | ✅ Verified |
| **Theme System** | Instant dynamic toggle between Dark (Charcoal & Gold) and Light (Warm Ivory & Gold). | ✅ Verified; visual verification recommended |
| **Branding Presentation** | High-resolution official emblems, 30% sizing polish, and theme-aware asset resolution. | ✅ Verified; visual verification recommended |
| **Offline Operation** | 100% offline desktop execution; no external API requirements or mandatory telemetry. | ✅ Verified |
| **Application Shutdown** | Title-bar X, Alt+F4, Ctrl+Q, and Settings exit workflow following the shutdown bug fix. | Fix implemented; manual verification pending |
| **Windows Desktop Build** | Tauri production executable and optional installer packaging. | Build reported successful; installed-app smoke test recommended |
| **Export** | User-facing document export, including Markdown where supported. | 📋 Planned (v0.7.0) |
| **Echo Library** | Lorebook-exclusive cross-referencing and contextual entity linking. | 📋 Planned (v0.8.0) |
| **Writer's Workshop** | Shared document tag editing, library-wide rename/remove/merge, Favorites, actual-opening Recents, four sorts, and combined filters. | Implemented; automated coverage, native manual verification pending |
| **Notes & Essay Studios** | Additional specialized writing environments; Essay Studio covers essays and letters. | 📋 Planned (Future) |

### Test Coverage and Verification

See [`docs/TEST_REPORT_v0.4.0.md`](./docs/TEST_REPORT_v0.4.0.md) for the exact commands and results from this milestone. Frontend tests exercise production organization/filtering/save helpers and rendered controls. Rust tests use temporary libraries and file-backed SQLite to verify restart, reindex, metadata preservation and rollback after injected index failures. These automated checks do not establish native visual quality, keyboard/IME behavior, or OS close-event behavior.

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
# Run TypeScript / Node test runner suite (document operations, autosave, IPC contract)
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

Production build artifacts are typically generated at (actual paths depend on configuration):
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
- In Philosophy Studio, begin writing in **Freeform Writing**. Use **Structured Reasoning** when you want to classify or rearrange ideas. Switching back keeps existing blocks and their roles intact.

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

### Organize Your Workshop

- Use **Favorite this document** above any studio, or the star in a library row, to star/unstar a document. Choose **Favorites** in the library to show only starred documents.
- Expand the document's **Tags** control to add tags (Enter or Add; commas separate multiple tags), choose an existing suggestion, or remove a tag with its X button. Tag names retain their spelling and are case-sensitive.
- Under **Sort & filter**, choose Last modified, Date created, Title A-Z, or Title Z-A. Select multiple tags to require every selected tag. These combine with the studio sidebar, Favorites, and the library's title/body search.
- Open **Manage library tags** from the same section to rename a tag everywhere or remove its assignments everywhere. Renaming to an existing tag combines assignments without duplicates. Removal uses an inline confirmation and preserves writing.
- **Recent** lists documents by actual last opening, including the document displayed at startup and newly created documents. Reads used for search do not count as opens. Recent always sorts by last opened, while studio, tags and search still apply. No older history is inferred from modification dates.
- **Clear filters** clears search, tag selection and the Favorites/Recent view while keeping the selected studio and preferred sort. Filters and sorting are session controls; favorites, tags and last-opened timestamps are durable document metadata.
- The global **Ctrl+F / Ctrl+K** search remains a whole-library search with its own studio selector. It is independent of the library panel's filters.
- A failed organization update stays queued for **Ctrl+S / Retry**. Normal navigation and exit wait for it. **Cancel organization update** explicitly discards uncompleted organization actions and keeps all writing; already completed documents in a library-wide change stay updated.

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
- **No Cloud Synchronization:** The current application is designed to work without cloud sync or a remote server; verify any external requests or dependency behavior before making an absolute network-free claim. Your work never leaves your device.
- **Telemetry:** No telemetry is intended as part of the current product design; confirm dependencies and build configuration before making an unconditional privacy guarantee.
- **Recovery Caution:** Do not delete the SQLite database to test recovery. Verify any reindex or recovery command in the implementation and test it only against disposable data before documenting it as a guaranteed recovery path.

---

## 12. Development Roadmap

The MetaCognition Notebook roadmap is divided into structured milestones. Version numbers represent engineering milestones, not released distributions:

| Milestone | Code Name | Primary Scope | Status |
| :--- | :--- | :--- | :--- |
| **v0.1.0** | *The Foundation* | Tauri 2 runtime, SQLite schema, Markdown frontmatter storage, IPC commands. | ✅ Completed |
| **v0.2.0** | *The Three Studios* | Specialized Poetry, Philosophy, and Lorebook writing interfaces and workflows. | ✅ Completed |
| **v0.2.1** | *Phase 2A Reliability* | Debounced autosave, dirty state tracking, in-flight race prevention, window close flush. | ✅ Completed |
| **v0.3.0** | *The Gilded Identity* | Official brand assets, dark/light theme switching, +30% sizing polish, Windows icons. | ✅ Completed |
| **v0.3.1** | *The Thinking Desk* | Freeform Philosophy by default, optional reasoning roles, reversible views, introductory guidance, and save safety. | ✅ Completed |
| **v0.4.0** | *The Writer's Workshop* | Document tag editing and global tag management, Favorites, four sorts, composable filters and actual-opening Recents. | Current Milestone |
| **v0.5.0** | *The Vault* | Optional local encrypted backup exports and optional manual Google Drive backup sync. | 📋 Planned |
| **v0.6.0** | *The Web of Thought* | Bidirectional document linking (`[[wikilinks]]`), mention index, relationship graph. | 📋 Planned |
| **v0.7.0** | *The Manuscript* | User-facing document export, including Markdown where supported; revision snapshot history; PDF/ePub compiling goals; and comprehensive writing statistics. | 📋 Planned |
| **v0.8.0** | *Echo Library* | Lorebook-exclusive entity registry with stable IDs, context previews, and mention links. | 📋 Planned |
| **v0.9.0** | *Conversation Archive*| Standalone optional import and indexing of conversation logs from AI platforms. | 📋 Planned |
| **v1.0.0** | *The First Edition* | First comprehensive public production release with complete installer distribution. | 📋 Planned |
| **Future** | *Studio Expansion* | Implementation of **Notes Studio** (scratchpad) and **Essay Studio** (formal prose & letters). | 📋 Planned |

---

## 13. Known Limitations

- **Organization Scope:** No nested folder manager, favorite ordering, or full opening-event log. Recent stores only the most recent open per document. View, sort and filter selections reset when the app restarts.
- **Tag Changes Across Files:** Each document update is atomic with an attempted rollback if indexing fails. A library-wide rename/remove can partially succeed if another file cannot be read or written; errors identify affected documents and retries complete remaining assignments. Completed updates are not rolled back across the whole library.
- **Compatibility:** Favorites and last-opened time live in reserved `_workshop` metadata, not a new schema. Older documents default to unstarred with no opening history. Editing in older app versions may discard this namespace. External edits to canonical files should be followed by reindexing. A conflicting non-object `_workshop` value is reported rather than overwritten.
- **Logical Modification Dates:** Organization and opening changes leave the application's last-modified timestamp unchanged, though writing frontmatter changes the file's OS modification time.

- **Philosophy Block Boundaries:** Freeform hides roles on existing blocks but retains separate writing areas. Merging or automatically splitting blocks is not implemented. Blank paragraphs within a block remain within that block.
- **Older Versions and External Edits:** New block-boundary metadata disambiguates multiline blocks and empty blocks. Earlier app versions ignore it and can split a block at blank lines; avoid editing v0.3.1 documents in older versions. External edits that invalidate boundary lengths fall back to legacy paragraph parsing, leaving the body readable but potentially changing block interpretation. Keep the Markdown frontmatter with the body.
- **Shutdown Limits:** Normal desktop close waits for saving. A stalled write leaves the window open; retry after an error. Forced process termination, power loss, or browser refresh cannot guarantee persistence of edits still within the debounce period. Browser preview uses volatile in-memory data and is not a durable library.
- **Export:** User-facing export remains planned for v0.7.0; this milestone adds no export workflow.

- **Single Window Only:** Multi-window editing (opening multiple documents side-by-side in separate native OS windows) is currently unsupported.
- **Lexical Keyword Search:** Search currently performs substring matching on indexed metadata and files; advanced Full-Text Search (SQLite FTS5) is not yet active.
- **No Cloud Backup:** Backups are currently local-only (`Backups/` folder); automatic off-site synchronization is planned for v0.5.0.
- **Export Not Yet Available:** The current interface does not offer a working export button or user-facing export workflow; export is planned for v0.7.0.
- **Desktop Shutdown Requires Confirmation:** A recent lifecycle fix added graceful exit handling; verify X, Alt+F4, Ctrl+Q, and immediate-close persistence on an actual Windows build.
- **Desktop Focus:** Mobile platforms (Android/iOS) and web-hosted SaaS modes are outside the current project scope.

---

## 14. Future Vision

The long-term vision of MetaCognition Notebook is to become a sacred sanctuary for personal cognition—a quiet, enduring desktop haven where literature, philosophy, and mythic storytelling converge. 

As the application matures through its roadmap, it will introduce **Echo Library** for interconnected world lore, **The Web of Thought** for dialectical cross-referencing, and expanded studios for personal essays and correspondence, all while preserving the fundamental guarantee that **your thoughts belong to you, reside on your hardware, and will remain readable decades into the future**.

---

## 15. AI Assistance & Development Transparency

**AI-Assisted Development:** MetaCognition Notebook was developed with assistance from AI tools, including **Google Gemini (Antigravity)** for implementation, debugging, and testing, and **OpenAI ChatGPT** for project planning, architecture discussions, documentation, and technical guidance.

**Visual Assets:** Application branding, logos, and studio icons were generated with assistance from **Google Flow** and subsequently integrated into the application.

**Human Direction & Responsibility:** The project's vision, creative direction, feature requirements, and development priorities are determined by its human developer. AI-generated contributions are reviewed and refined throughout development, with responsibility for the project's maintenance and distribution remaining with the developer.

---

## 16. License and Contributions

**License:** MetaCognition Notebook is intended to be released under the [MIT License](./LICENSE). See the repository's `LICENSE` file for the complete terms.

**Contributions:** Issues, bug reports, and suggestions are welcome through [GitHub Issues](../../issues). Pull requests are welcome for consideration; please open an issue first for substantial changes so the proposed scope can be discussed. This project is under active alpha development, so APIs and features may change.

**Support:** Please report reproducible bugs through GitHub Issues, including the app version, Windows version, steps to reproduce, and relevant error messages. Do not include private writing or sensitive documents in public issue reports.

---

*For detailed system architecture, SQLite schemas, IPC contracts, and workflow sequence diagrams, read [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md).*

