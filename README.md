# MetaCognition Notebook

**Current development version: v0.6.2 — The Living Universe**

MetaCognition Notebook is a local-first desktop workspace for personal writing, reflection and worldbuilding. Poetry, Philosophy and Lorebook share a document library while keeping their own writing tools. The **Gilded Identity** pairs gold emblems and serif typography with charcoal or warm ivory surfaces.

v0.6.2 is in implementation and stabilization. The [current engineering report](docs/TEST_REPORT_v0.6.2_GRAPH_SAFETY.md) records passing automated checks; manual Windows acceptance and release approval remain outstanding. This documentation does not announce a published stable release.

## Writing studios

### Poetry Studio

Write, add, reorder and remove stanzas; choose a poetic form and editing font; review stanza, line and word counts. Form labels do not enforce meter or rhyme.

**Emotional Cipher** offers Quick word swaps, Random vocabulary substitutions and Manual mappings. It is creative obfuscation, **not cryptographic encryption**. Keep the exact poem-specific key for recovery; rerolling cannot reproduce a missing key. Key Library supports reusable dictionaries and recovery keys.

- Import poems as `.txt`, `.md` or `.mcpoem` (5 MB limit); each import creates a new document.
- Export a poem as stanza-only `.txt`, frontmatter-bearing `.md` or `.mcpoem`.
- Import/export keys as `.mckey`. A `.mccipher` package includes encoded text and its key.
- **Import & Decode** verifies the package and creates a recovered poem; **Import Cipher Package** stores the encoded poem and key for separate decoding.

Cipher preview is temporary. Saving a ciphered poem creates a new document and retains its key through sequential operations; these are not a multi-file transaction. Preserve originals and inspect errors or partial imports.

### Philosophy Studio

New documents start with freeform writing. Optional Structured Reasoning assigns roles such as premise, argument, objection, example and conclusion to blocks. Switching views preserves text and existing block boundaries. It does not construct or validate arguments, and there is no Philosophy export toolbar.

### Lorebook Studio

Start with a **Universe**, then build its world and stories:

- Worldbuilding categories: Characters, Locations, Factions & Nations, Rules & Systems, Cultures & History, Artifacts, Events and Other Lore.
- **Books** belong to a Universe; **Chapters** contain their narrative prose. Chapters can be created and reordered in the Book workspace.
- **Story Nodes** are planning milestones, separate from Chapters. Universe history and each Book have distinct timelines.
- **Web of Thought** provides detailed milestone observations, comparisons, contextual relationships and shared-event links. Canonical Books may explicitly promote a milestone to shared history; Alternate and Standalone Books retain their own continuity.
- Guided entity links use stable document IDs. Character affiliation and Faction Members show the same membership; leadership and territorial control have reciprocal views. Alliances and rivalries are symmetric.
- The interactive **World Relationships Graph** supports category/relationship filters, focus, entity navigation, pan, zoom and fit.
- **Archive Universe** hides its selector entry while preserving all content. **Archived Universes** offers inspection and recovery. Permanent Universe deletion is unavailable.
- Entity archival presents affected relationships and retained milestone references before confirmation. Its staged operation is recoverable, but is not crash-atomic.

Legacy unassigned or ambiguous entries remain accessible through Unassigned Lore. Universe organization does not move canonical files into nested folders. Export Lore downloads an individual entry as Markdown; this is separate from future manuscript export.

## Shared tools and storage

- **Local files:** Markdown with JSON frontmatter is canonical. SQLite indexes document metadata and tags; it is not a second authoritative relationship store.
- **Organization:** create/assign/remove tags while editing, rename/merge/remove library tags, star Favorites, and combine studio, tags, favorites and search. Selected tags use AND matching.
- **Sorting:** modified, created, title A–Z or Z–A. Recent uses actual opening history, rather than modification time, and has its own last-opened order.
- **Search:** library/global search covers titles and document bodies. It is a scan, not an FTS or semantic search engine.
- **Saving:** Settings offers Automatic (default 3 seconds; configurable 1–10 seconds) or Manual. Use Save / Ctrl+S in Manual mode. Navigation and normal exit guard unsaved writing with Save / Discard / Cancel. Organizational/planning commands persist independently of the writing mode. Failed queued changes require Retry / Ctrl+S or explicit cancellation.
- **Themes:** Dark, Light and System follow the existing theme resolver, including the official Vault artwork.
- **Help & Guide:** F1, sidebar Help and Studio guide open a bundled offline manual with seven chapters and 35 sections. Reading examples never installs sample data.

The initial library is the operating system's Documents directory under `MetaCognitionNotebook` (with a startup fallback if Documents cannot be resolved). **Settings → Canonical Content Directory (Markdown)** shows the actual active location, which can change after Vault activation. Do not assume every notebook is in the default folder.

## Protecting writing with The Vault

The Vault is a backup/recovery utility in Settings, not a fourth writing studio. It creates verified local `.mcbackup` archives containing supported notebook files, metadata, planning records, archived documents and Cipher data. SQLite is reconstructed on restore. Profile preferences are not notebook backups.

1. Save pending work, create a backup and inspect verification. Keep another copy on a different drive for device-loss protection.
2. **Choose folder & restore separate copy** extracts a verified copy into a new folder for inspection. The active notebook stays unchanged.
3. **Restore as Active Notebook** requires confirmation of the named backup. It preserves the current notebook and a verified pre-switch backup, prepares a separate notebook, publishes a selection record and blocks editing until restart.
4. After restarting, confirm the restored documents and active path. Settings displays preservation locations and offers a separately confirmed **Return to Previous Notebook**.
5. On failure, retain the original folder, Vault backups, staging data and activation records. Follow the displayed recovery instructions; do not delete copies or copy an archived database over the live index.

Archives are unencrypted. SHA-256 checks detect content changes relative to a manifest; they do not authenticate the sender. See [architecture and failure boundaries](SYSTEM_DESIGN.md#vault-backup-and-recovery) and the [recovery report](docs/TEST_REPORT_v0.5.1.md).

## Getting started

For development, install Node.js with npm, a stable Rust/Cargo toolchain and the Tauri 2 desktop prerequisites. Windows desktop development needs the MSVC C++ build tools/Windows SDK and WebView2. Dependency versions and commands are defined in [package.json](package.json), [Cargo.toml](src-tauri/Cargo.toml) and [Tauri configuration](src-tauri/tauri.conf.json); no exact minimum toolchain version is pinned here.

From the repository root:

```powershell
npm ci
npm run tauri -- dev
```

`npm run dev` runs a browser preview backed by in-memory mock storage; it is not a durable notebook and does not support native Vault recovery.

Select Poetry or Philosophy and press Ctrl+N to create writing. In Lorebook, create/select a Universe, add entities or a Book, then create Chapters inside that Book. For detailed state observations and comparisons, open an entity and choose **Web of Thought**, then select the same Universe and Book. Use Help for step-by-step instructions.

### Checks and builds

```powershell
npm test
npx tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
npm run tauri -- build --debug --no-bundle
```

`npm run build` typechecks and bundles the frontend. The final command compiles an unbundled debug desktop executable; it does not verify an installer or native interaction. `npm run tauri -- build` requests the configured production desktop bundles when platform prerequisites are available. Run failure/recovery tests only against disposable fixtures.

## Limits and project direction

Dense graphs may need filtering and zooming; at most 240 matching edges are drawn, with complete records available in the Universe list. Layout does not guarantee crossing-free labels. Focus, filters, camera and immediate unlink Undo are transient.

Entity archive saves relationship archives before moving the document to Backups. A failure or process termination between stages can leave an intact entity with archived links. There is no durable multi-step archive journal or one-click document recovery browser. Keep Backups and verified Vault copies.

There is no automatic external-edit conflict merge, revision-history browser, full manuscript compiler, attachment editing UI, Google Drive connection, Echo Library, Conversation Archive, Notes Studio or Essay Studio. Lorebook Preview currently displays text with preserved whitespace rather than rendering Markdown formatting.

The [roadmap](docs/ROADMAP.md) retains v0.7.0 Manuscript/history/export development, v0.8.0 Echo Library, v0.9.0 Conversation Archive and v1.0.0 First Edition. Philosophy/Poetry expansion and future Notes/Essay studios (including letters) have no finalized version assignments.

## Documentation, license and development assistance

[System design](SYSTEM_DESIGN.md) is the technical source of truth. The [documentation index](docs/README.md) separates current guidance from historical reports and their original test counts.

This repository is licensed under the [MIT License](LICENSE). Development has used AI assistance, including Gemini Antigravity and OpenAI ChatGPT/Codex, for coding, debugging, planning and documentation. Existing project documentation credits Google Flow for branding assistance. Human direction and review remain necessary; AI assistance and passing automated tests do not establish independent security certification or complete manual verification.
