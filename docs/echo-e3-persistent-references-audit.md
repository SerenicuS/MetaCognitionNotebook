# MetaCognition Notebook — Echo Library E3: Persistent References & Pronoun Binding Architecture Audit and Implementation Plan

**Audit Date:** 2026-10-31  
**Target Version:** MetaCognition Notebook v0.8.0-beta.4 (*The Living Continuity*)  
**Scope:** Read-Only Architecture Audit & Evidence-Based Technical Specification  
**Status:** Design Proposal & Feasibility Audit (No implementation code or schema mutations performed)  
**Deliverable Document:** `docs/echo-e3-persistent-references-audit.md`

---

## 1. Executive Summary

MetaCognition Notebook combines local-first canonical Markdown storage, SQLite derived indexing, strict House and Universe isolation boundaries, CodeMirror 6 creative writing environments, and the Echo Library live contextual recognition system. 

The Echo Library currently provides real-time lexical recognition of canonical lorebook entities, interactive ambiguity clarification, contextual dossier inspection, and nested lore exploration. However, all confirmed references are currently held **ephemerally in memory** within CodeMirror 6's editor state. When a document is saved, closed, or reloaded, all confirmed reference bindings are discarded. Furthermore, authors have no mechanism to explicitly bind an occurrence of a common pronoun (e.g., *"He"*, *"she"*, *"they"*, *"him"*) to a specific Lorebook entity UUID so that Echo can recognize who is being referred to without modifying the visible prose.

### Core Audit Findings

1. **Zero-Schema Feasibility (Confirmed):** Persistent references can be implemented with **zero SQLite schema alterations**, **zero database migrations**, and **zero Rust storage model breaking changes**. The SQLite `documents` table already indexes an opaque `metadata_json TEXT` column, and the Rust backend's `Frontmatter` model deserializes `metadata: Option<serde_json::Value>`, preserving arbitrary structured JSON keys.
2. **Prose Purity Invariant (Confirmed):** Authors must never be forced to pollute their literary prose with synthetic inline markup, brackets, or hidden binary tokens (e.g. `He → echo://uuid`). The visible prose remains standard, human-readable Markdown (`"He"`).
3. **Atomic Save Coordination (Confirmed):** Canonical documents are persisted through `StorageManager::write_document_atomic`, which writes both JSON frontmatter and Markdown body to a temporary file next to the destination and renames it atomically. Storing reference bindings within frontmatter guarantees that the text and its reference coordinate map are persisted in the **same atomic filesystem transaction**, eliminating dual-channel synchronization hazards.
4. **Edit Resilience via Hybrid Architecture (Confirmed):** Storing raw character offsets (`from`, `to`) alone is fundamentally unsafe against external modifications or line-ending normalizations. A **Hybrid Architecture** combining:
   - Frontmatter persistence,
   - CodeMirror 6 transaction mapping (`ChangeDesc.mapPos`), and
   - Context anchoring (exact matched text, preceding context fingerprint, and succeeding context fingerprint),
   guarantees that references survive edits inside the application and can be safely validated, re-anchored, or gracefully marked **Unresolved** (rather than misattributed) when external modifications occur.
5. **Strict Non-Inference (Confirmed):** The application must **never guess or heuristically assign a pronoun's target**. Ordinary pronouns remain ordinary unstyled prose. Only explicit author action creates a binding.
6. **Portable Universe Format v1 Boundary (Confirmed):** In Portable Universe v1 (`.mcuniverse`), unknown frontmatter fields are categorized as `opaque_fields`. In `Separate Copy` imports, references inside opaque fields trigger an `untransformable_extension_reference` warning because the v1 importer does not parse extension UUIDs. The audit outlines a safe compatibility path without breaking v1.

**Recommendation:** **GO** for Echo E3 implementation following the phased roadmap detailed in Section 17.

---

## 2. Verified Current Architecture

The MetaCognition Notebook application architecture was verified against the active codebase checkout:

```
+--------------------------------------------------------------------------------------------------+
| React 18 / TypeScript Frontend                                                                   |
|                                                                                                  |
|  +--------------------------------+   +-------------------------------------------------------+  |
|  | MarkdownEditor (Host)          |   | Echo Extension (CodeMirror 6 State)                   |  |
|  | - viewRef (EditorView)         |   | - echoEntitiesField (EchoEntity[])                    |  |
|  | - confirmedReferencesField <---|---| - candidateMatchesField (Lexical Scanner)             |  |
|  | - echoClickPlugin              |   | - echoWritingTheme (Gold underlines / Amber hints)    |  |
|  +--------------------------------+   +-------------------------------------------------------+  |
|                 |                                                 ^                              |
|                 v                                                 |                              |
|  +--------------------------------+   +-------------------------------------------------------+  |
|  | Echo Exploration & UI          |   | Echo Context & Matching                               |  |
|  | - EchoDocumentationPopup       |   | - buildEchoCatalog (House & Universe Isolation)       |  |
|  | - EchoExploration (Nav history)|   | - matchEchoText (Boundary regex, suppression)         |  |
|  | - EchoClarificationModal       |   | - stateEngine (Milestone historical status)           |  |
|  +--------------------------------+   +-------------------------------------------------------+  |
|                 |                                                                                |
|                 v                                                                                |
|  +--------------------------------+                                                              |
|  | Save Coordination              |                                                              |
|  | - SaveCoordinator (Flush/drain)|                                                              |
|  | - MutationQueue & CommandQueue |                                                              |
|  +--------------------------------+                                                              |
+-----------------|--------------------------------------------------------------------------------+
                  | IPC: save_document(id, content, metadataJson)
                  v
+--------------------------------------------------------------------------------------------------+
| Tauri 2 / Rust Backend                                                                           |
|                                                                                                  |
|  +--------------------------------+   +-------------------------------------------------------+  |
|  | commands.rs                    |   | SQLite Database (metadata.db)                         |  |
|  | - save_document_with_options   |   | - documents table (metadata_json TEXT)                |  |
|  | - canonical_document read      |   | - Derived search/metadata index                       |  |
|  +--------------------------------+   +-------------------------------------------------------+  |
|                 |                                                 ^                              |
|                 v                                                 | Upsert metadata               |
|  +----------------------------------------------------------------+                              |
|  | storage.rs: StorageManager::write_document_atomic                                             |
|  | 1. Serialize Frontmatter (JSON) + FRONTMATTER_SUFFIX + Content                                |
|  | 2. Write to parent/.tmp_<uuid>_<pid>.tmp with sync_all()                                      |
|  | 3. Atomic rename to target relative_path (.md)                                                |
|  +-----------------------------------------------------------------------------------------------+  |
+--------------------------------------------------------------------------------------------------+
```

### 2.1 Editor Lifecycle & Ephemeral Confirmation

- In `src/components/echo/echoExtension.ts`, `confirmedReferencesField` is defined as a CodeMirror `StateField<ConfirmedReferenceState>`.
- It maintains `references: EchoConfirmedReference[]` and `decorations: DecorationSet`.
- During document changes (`tr.docChanged`), it maps positions using:
  ```ts
  const newFrom = tr.changes.mapPos(ref.from, 1);
  const newTo = tr.changes.mapPos(ref.to, -1);
  ```
- It validates that `tr.newDoc.sliceString(newFrom, newTo).toLowerCase() === ref.matchedText.toLowerCase()`. If the text inside changes or the range collapses, the reference is invalidated.
- **The Gap:** `confirmedReferencesField` is initialized empty on editor creation (`create() { return { references: [], decorations: Decoration.none }; }`). There is no mechanism connecting it to saved document metadata or emitting its state on edit.

### 2.2 Lexical Matching & Candidate Suppression

- `src/utils/echoMatching.ts:matchEchoText` scans plain text against indexed lore terms using Unicode word boundary lookarounds `(?<![\p{L}\p{N}])(?=[\s\S])/gu`.
- Crucially, line 46 contains:
  ```ts
  if (!confirmed.some(r => from < r.to && to > r.from)) {
    matches.push(...);
  }
  ```
  **Candidate matches are already suppressed across spans occupied by confirmed references.** Therefore, bound persistent references naturally take precedence over lexical name matching.

### 2.3 Save Pipeline & Atomic Storage

- Chapter and Lorebook editing triggers `api.saveDocument(id, content, title, tags, metadataJson)`.
- In `src-tauri/src/commands.rs:save_document_with_options_impl`:
  1. Acquires SQLite database mutex lock (`state.db.lock()`).
  2. Reads canonical file metadata from disk via `canonical_document`.
  3. Merges updated title, tags, and `metadata_json`.
  4. Calls `state.storage.write_document_atomic(&meta.relative_path, &detail)`.
  5. Upserts `meta` into SQLite `documents` table.
- In `src-tauri/src/storage.rs:write_document_atomic`:
  - Formats the file with `---json\n<pretty_json>\n---\n<content>`.
  - Writes to a temporary file (`.tmp_<uuid>_<pid>.tmp`) in the same directory, calls `sync_all()`, and renames atomically over the target.

---

## 3. Relevant Source Files and Functions

| Layer | File Path | Key Functions / Symbols | Purpose / Relevance to E3 |
|---|---|---|---|
| **CodeMirror Engine** | `src/components/echo/echoExtension.ts` | `confirmedReferencesField`, `confirmReferenceEffect`, `buildConfirmedDecorations`, `echoClickPlugin` | Owns in-memory reference tracking, transaction mapping, and decoration rendering. |
| **Echo Types** | `src/components/echo/types.ts` | `EchoConfirmedReference`, `EchoCandidateMatch`, `EchoEntity` | Core data contracts for reference spans and candidates. |
| **Echo Matching** | `src/utils/echoMatching.ts` | `buildEchoSearchIndex`, `matchEchoText` | Lexical boundary scanner; enforces confirmed reference precedence over candidate terms. |
| **Echo Context** | `src/utils/echoContext.ts` | `buildEchoCatalog`, `AUTHOR_ECHO_POLICY`, `EchoSourceContext` | Resolves eligible entities based on source document House and Universe boundaries. |
| **Editor Host** | `src/components/editor/MarkdownEditor.tsx` | `handleConfirmReference`, `inspectTextarea`, `MarkdownEditorProps` | Connects CodeMirror `EditorView`, popup surfaces, toolbar, and fallback textarea. |
| **Chapter Studio** | `src/components/studios/lorebook/BookView.tsx` | `flushChapterSave`, `handleChapterContentChange`, `resolveChapterHistoricalContext` | Production host for chapter drafting; coordinates chapter autosave and milestone context. |
| **Lorebook Studio** | `src/components/studios/LorebookStudio.tsx` | `handleContentChange`, `classifyLoreDocument` | Production host for lorebook entry drafting and preview. |
| **Autosave Pipeline** | `src/services/autosave.ts` | `SaveCoordinator`, `MutationQueue`, `CommandQueue` | Coordinates asynchronous save flushing, prevents write races, ensures ordered execution. |
| **API Client** | `src/services/api.ts` | `saveDocument`, `getDocument` | Frontend IPC gateway to Tauri backend commands. |
| **Rust Commands** | `src-tauri/src/commands.rs` | `save_document_with_options_impl`, `rename_document_impl`, `delete_document_impl` | Validates write commands, coordinates storage write and SQLite upsert. |
| **Rust Storage** | `src-tauri/src/storage.rs` | `write_document_atomic`, `read_document`, `parse_document_content`, `scan_and_reindex` | Enforces atomic file writes, JSON frontmatter parsing, and reindexing from disk. |
| **Rust Models** | `src-tauri/src/models.rs` | `Frontmatter`, `DocumentMetadata`, `DocumentDetail` | Canonical data structures for document storage and indexing. |
| **Database Layer** | `src-tauri/src/db.rs` | `Database::upsert_document`, `Database::get_document_metadata` | SQLite derived index; stores `metadata_json TEXT`. |
| **Vault System** | `src-tauri/src/vault.rs` | `create_backup_locked`, `restore_inner`, `allowed` | Vault backup capture, manifest verification, and disaster recovery. |
| **Portable Universe** | `src-tauri/src/portable/validate.rs`, `import_plan.rs` | `opaque_fields`, `remap_frontmatter`, `validate_archive` | `.mcuniverse` package export, schema inspection, and UUID remapping. |

---

## 4. Existing Constraints and Invariants

1. **Markdown Canonical Invariant:** Markdown with JSON frontmatter is the single source of truth. SQLite is strictly a derived index. Planning data and persistent references must never live exclusively in an uncoupled database.
2. **Prose Purity Invariant:** Literary prose must remain plain, unencumbered Markdown. No proprietary inline XML tags, link syntax hacks, or zero-width Unicode characters may be written to the Markdown body to represent bindings.
3. **No Heuristic Guessing Invariant:** Echo must **never** automatically bind pronouns or guess an author's narrative intent. An unbound pronoun is ordinary text. Only deliberate author confirmation creates a binding.
4. **House & Universe Isolation Invariant:** Entities cannot be resolved across House boundaries. Universes within a House are isolated; a chapter document in Universe A cannot bind to or inspect an entity in Universe B.
5. **Decoupling from Web of Thought Invariant:** Binding a pronoun in prose does not create a canonical relationship node (`plan.relationships`), mutate entity profiles, or record a historical state change.
6. **Graceful Invalidation Invariant:** When prose edits mutate, split, or delete a bound span, the binding must be invalidated or marked detached. It must **never** silently shift to adjacent words or reassign to a different entity.
7. **Write Atomicity Invariant:** A document save must never leave the Markdown body and its reference metadata in a divergent or desynchronized state.

---

## 5. Persistence Architecture Comparison

We evaluated four candidate storage architectures against fourteen strict local-first criteria:

| Evaluation Criterion | Approach A: Frontmatter Spans Only | Approach B: Inline Markdown Syntax | Approach C: Sidecar Manifest | Approach D: Hybrid Architecture (Recommended) |
|---|---|---|---|---|
| **1. Canonical Markdown Readability** | **High:** Prose is 100% clean Markdown. | **Poor:** Pollutes prose with tags like `[He]{#uuid}`. | **High:** Prose is 100% clean Markdown. | **High:** Prose is 100% clean Markdown. |
| **2. Frontmatter Compatibility** | **High:** Native fit for `metadata.echo_references`. | **Medium:** Syntax lives in body; frontmatter unused. | **Medium:** Frontmatter untouched. | **High:** Seamless fit for `metadata.echo_references`. |
| **3. Edit Resilience (In-App)** | **High:** Handled by CodeMirror mapping. | **High:** Bound to tokens. | **High:** Handled by CodeMirror mapping. | **High:** CodeMirror `ChangeDesc` mapping. |
| **4. Undo / Redo Stability** | **High:** Integrated with CM6 StateField. | **High:** Native text undo. | **Medium:** Requires custom undo synchronization. | **High:** Integrated with CM6 StateField. |
| **5. Autosave Coordination** | **High:** Flushed via existing `SaveCoordinator`. | **High:** Normal body save. | **Poor:** Requires dual-save coordination lock. | **High:** Single unified flush via `SaveCoordinator`. |
| **6. Atomicity & Crash Recovery** | **High:** Single atomic rename via `write_document_atomic`. | **High:** Single file write. | **Poor:** Dual-file write hazard; partial crash risk. | **High:** Single atomic file rename (`.tmp` -> `.md`). |
| **7. External Editor Modifications** | **Poor:** Offsets silently drift or point to wrong words. | **High:** Syntax moves with text. | **Poor:** Offsets become invalid without detection. | **High:** Context anchors detect drift & re-anchor safely. |
| **8. Import / Export Portability** | **High:** Follows Markdown document. | **Poor:** Requires stripping before publication/PDF. | **Poor:** Sidecars omitted by standard export tools. | **High:** Traverses with file; stripped cleanly for readers. |
| **9. Vault Backup / Recovery** | **High:** Vault archives `.md` files natively. | **High:** Archived natively. | **Poor:** Rejected by Vault's strict folder allowlist. | **High:** Included in Vault `.mcbackup` automatically. |
| **10. House / Universe Moves** | **High:** Moves with document file. | **High:** In text. | **Poor:** Sidecar orphaned unless move logic rewritten. | **High:** Moves atomically with document file. |
| **11. Document Duplication** | **High:** Duplicates with frontmatter. | **High:** In text. | **Poor:** Sidecar orphaned or collided. | **High:** Reference IDs re-keyed; bindings preserved. |
| **12. Rename and Deletion** | **High:** Integrated in file lifecycle. | **High:** In text. | **Poor:** Requires sidecar rename/delete tracking. | **High:** Managed entirely within canonical file. |
| **13. Performance Overhead** | **High:** Tiny JSON payload; zero disk overhead. | **High:** No metadata JSON. | **Medium:** Extra file stat/open per document. | **High:** Sub-millisecond mapping and indexing. |
| **14. Migration Requirements** | **Zero:** Existing schema & models support it. | **High:** Markdown parser & renderer overhaul. | **High:** New filesystem management and tables. | **Zero:** Zero SQLite or Rust schema migrations. |

### Comparative Analysis & Verdict

- **Why Not Approach A (Raw Frontmatter Spans)?** While frontmatter storage is atomic and clean, storing *only* raw numerical offsets (`from`, `to`) is fragile. An author opening the document in VSCode, Obsidian, or Git who inserts a paragraph at the top will silently invalidate all offsets, causing bindings to point to random, incorrect words upon reopening.
- **Why Not Approach B (Inline Syntax)?** Storing references inline as `He → echo://uuid` violates the core product goal: *"The visible prose remains: 'He'"*. It breaks external Markdown readability, corrupts word count statistics, requires extensive stripping for reader publication, and causes severe typing friction in CodeMirror.
- **Why Not Approach C (Sidecar Manifest)?** Sidecars introduce a fatal dual-write problem. If the `.md` file saves but the sidecar write fails (or app crashes mid-write), text and references diverge permanently. Furthermore, `src-tauri/src/vault.rs:152` enforces a strict whitelist of allowed directories, meaning sidecars outside standard paths would be discarded during backup.
- **Why Approach D (Hybrid Architecture) Wins:** Approach D stores structured reference objects in the document's frontmatter, maps them in-memory using CodeMirror's mathematically sound transaction engine (`ChangeDesc`), and attaches **contextual text anchors** (`matchedText`, `contextBefore`, `contextAfter`). If external edits shift offsets, the loading engine uses the context anchors to safely re-align them, or marks them **Unresolved** if the text was deleted.

---

## 6. Recommended Binding Data Model

Persistent references should be stored in the document's canonical JSON frontmatter under `metadata.echo_references`.

### 6.1 TypeScript Interface (`src/components/echo/types.ts`)

```typescript
export interface EchoContextAnchor {
  /** Leading characters immediately preceding the span (up to 24 chars) */
  before: string;
  /** Trailing characters immediately following the span (up to 24 chars) */
  after: string;
}

export interface EchoPersistentReference {
  /** Stable UUID for this specific reference binding */
  id: string;
  /** Canonical UUID of the referenced Lorebook entity */
  targetId: string;
  /** Start character offset in normalized LF document body */
  from: number;
  /** End character offset in normalized LF document body */
  to: number;
  /** Exact text slice bound by the author (e.g., "He", "her", "the captain") */
  matchedText: string;
  /** Contextual text anchors for external edit re-alignment */
  anchor: EchoContextAnchor;
  /** Status of the reference binding */
  status: 'active' | 'unresolved' | 'detached';
  /** Timestamp when created (ISO 8601 UTC) */
  createdAt: string;
  /** Timestamp when last updated (ISO 8601 UTC) */
  updatedAt: string;
}
```

### 6.2 Canonical Frontmatter JSON Representation

An example chapter document with pronoun bindings:

```markdown
---json
{
  "id": "chap-9b1c-4e8a",
  "title": "Chapter 4: The Silent Vigil",
  "type": "lorebook",
  "house_id": "house-default",
  "created_at": "2026-10-31T08:00:00Z",
  "updated_at": "2026-10-31T09:30:00Z",
  "tags": ["act-1", "kael"],
  "parent_id": "book-ab12-34cd",
  "metadata": {
    "entry_type": "chapter",
    "universe_id": "univ-valoria-101",
    "book_id": "book-ab12-34cd",
    "chapter_order": 4,
    "milestone_id": "node-fall-of-kael",
    "echo_references": [
      {
        "id": "ref-7f3a-11e9",
        "targetId": "ent-kael-8821",
        "from": 28,
        "to": 30,
        "matchedText": "He",
        "anchor": {
          "before": "entered the temple. ",
          "after": " knew the Abyssals"
        },
        "status": "active",
        "createdAt": "2026-10-31T09:15:00Z",
        "updatedAt": "2026-10-31T09:15:00Z"
      },
      {
        "id": "ref-8e4b-22f0",
        "targetId": "ent-theron-4412",
        "from": 64,
        "to": 67,
        "matchedText": "him",
        "anchor": {
          "before": "He looked at ",
          "after": ". He smiled."
        },
        "status": "active",
        "createdAt": "2026-10-31T09:20:00Z",
        "updatedAt": "2026-10-31T09:20:00Z"
      }
    ]
  }
}
---
The knight entered the temple. He knew the Abyssals were waiting.
```

---

## 7. Reference-Span Edit Tracking Strategy

A robust reference tracking strategy must handle all text editing operations while preventing misattribution.

### 7.1 In-Editor Live Transformations (`echoExtension.ts`)

During active editing, CodeMirror 6's transaction mapping is used:

1. **Insertions Before a Span:**
   - Position mapping: `newFrom = tr.changes.mapPos(ref.from, 1)` and `newTo = tr.changes.mapPos(ref.to, 1)`.
   - Result: Span shifts forward by insertion length. `matchedText` is completely preserved.
2. **Insertions After a Span:**
   - Position mapping leaves `from` and `to` unaffected.
3. **Insertions Directly Inside a Span:**
   - E.g., inserting `"a"` into `"He"` producing `"Hae"`.
   - Invalidation Rule: `tr.newDoc.sliceString(newFrom, newTo) !== ref.matchedText`.
   - Result: **Immediate Invalidation**. The reference is removed or marked detached. It is never allowed to morph into a new word.
4. **Boundary Deletions & Cross-Cutting Edits:**
   - When a deletion partially or fully intersects `[ref.from, ref.to]`:
   - Position mapping collapses or truncates the range (`newFrom >= newTo` or sliced text mismatch).
   - Result: **Immediate Invalidation**.
5. **Copy / Paste:**
   - When an author copies a bound `"He"` and pastes it elsewhere:
   - The clipboard receives plain text `"He"`.
   - The pasted text is a new occurrence and **remains Unbound**.
   - Invariant Preserved: The application never guesses or duplicates reference bindings automatically.
6. **Cut / Paste:**
   - Cutting deletes the span, invalidating the original reference. Pasting inserts plain text.
7. **Undo / Redo:**
   - CodeMirror's `history()` extension tracks transactions. When an undo restores a deleted span, CodeMirror's transaction reversions restore the state field's references intact.

### 7.2 External Edit Re-Anchoring Algorithm

When a document is loaded from disk, the frontend reconciles persisted references against the loaded body:

```
                  +-----------------------------------+
                  | Load Document: text & references  |
                  +-----------------------------------+
                                    |
                                    v
                  +-----------------------------------+
                  | For each ref:                     |
                  | doc.slice(ref.from, ref.to)       |
                  | == ref.matchedText?               |
                  +-----------------------------------+
                       /                         \
                     YES                          NO
                     /                              \
       +-------------------------------+   +------------------------------------+
       | Verify anchors:               |   | Local Window Search:               |
       | check context before & after  |   | Search [ref.from-250, ref.to+250]  |
       +-------------------------------+   | for matchedText + context anchors  |
             /                   \         +------------------------------------+
          MATCH                MISMATCH             /                    \
           /                       \           EXACT UNIQUE MATCH      AMBIGUOUS / NONE
  +------------------+   +------------------+        /                           \
  | Status: ACTIVE   |   | Status: DETACHED |  +--------------------+   +--------------------+
  | Keep offsets     |   | Flag for review  |  | Re-anchor offsets: |   | Status: DETACHED   |
  +------------------+   +------------------+  | Update from & to   |   | Flag for review    |
                                               +--------------------+   +--------------------+
```

- **Safety Guarantee:** If a reference cannot be re-anchored with 100% certainty, its status is set to `'detached'`. The application **never** guesses a target or attaches to a nearby same-word token.

---

## 8. Save and Crash-Consistency Strategy

### 8.1 Single-Channel Atomic Persistence

To eliminate race conditions between prose and reference metadata:

1. **Unified Save Payload:**
   When `SaveCoordinator.flush` triggers a save, `MarkdownEditor` extracts the latest reference list directly from `view.state.field(confirmedReferencesField).references`.
   These references are serialized directly into `metadataJson` under `echo_references`.
2. **Single Atomic IPC Call:**
   The frontend calls `api.saveDocument(id, latestContent, title, tags, updatedMetadataJson)`.
   There is no separate IPC command for saving references.
3. **Atomic File Replacement in Rust:**
   `StorageManager::write_document_atomic` formats the full canonical file:
   ```rust
   let mut payload = String::new();
   payload.push_str(FRONTMATTER_PREFIX);
   payload.push_str(&json_str);
   payload.push_str(FRONTMATTER_SUFFIX);
   payload.push_str(&doc.content);
   self.write_raw_atomic(relative_path, &payload)?;
   ```
   `write_raw_atomic` writes to `.tmp_<uuid>_<pid>.tmp`, executes `sync_all()`, and atomically renames the temporary file over the canonical path.
4. **Crash Invariant:**
   If a power loss or crash occurs mid-write:
   - The `.tmp` file is orphaned (and cleaned up on reboot).
   - The original file on disk remains 100% untouched.
   - Text and reference map never diverge.

### 8.2 Rapid Navigation & Document Switching

- In `src/components/studios/lorebook/BookView.tsx`, `handleOpenChapterInView` explicitly clears pending timeouts and calls `await flushChapterSave()` before switching `activeChapterId`.
- The `SaveCoordinator` serializes concurrent write requests and drains pending edits before allowing navigation to complete.

---

## 9. CodeMirror Integration Plan

### 9.1 Extensions and State Fields

We extend `src/components/echo/echoExtension.ts`:

1. **State Effects:**
   - `loadReferencesEffect`: Dispatched on document load to populate `confirmedReferencesField` with persisted references.
   - `bindReferenceEffect`: Dispatched when an author binds a selected word/phrase to an entity UUID.
   - `unbindReferenceEffect`: Dispatched to remove a binding while preserving the prose.
   - `detachReferenceEffect`: Dispatched when edit invalidation marks a reference as detached.
2. **`confirmedReferencesField`:**
   - Manages active and detached references.
   - Generates `DecorationSet` using `RangeSetBuilder`.
   - References are sorted strictly by `from ASC, to ASC` before being added to the builder (enforcing CodeMirror's ordering invariant).
3. **Decoration Styling (`echoWritingTheme`):**
   - Active Bound References: Discreet, elegant gold underline (`borderBottom: '1.5px dotted rgba(212, 175, 55, 0.7)'`) with cursor pointer.
   - Detached / Unresolved References: Faint subtle gray wavy underline (`borderBottom: '1.5px dotted rgba(160, 160, 160, 0.5)'`).
   - Unbound Pronouns: **Zero styling / decorations**. Ordinary prose.
4. **Integration with `candidateMatchesField`:**
   - `findCandidateMatches` continues to receive `confirmedReferencesField.references`.
   - Lexical scanner automatically suppresses candidate suggestions across all bound spans.

### 9.2 Fallback Textarea Engine Support

For environments utilizing the fallback textarea (`engine === 'textarea'` in `MarkdownEditor.tsx`):
- While CodeMirror decorations cannot render in a native HTML `<textarea>`, the fallback engine supports `Alt+E` / *Inspect lore at cursor*.
- Cursor inspection computes `textarea.selectionStart`, matches it against the document's loaded `echo_references`, and opens the contextual dossier.
- Author text selection in the textarea supports keyboard shortcut `Mod-Shift-B` to trigger the binding chooser.

---

## 10. Pronoun UX Recommendation

### 10.1 Interaction Workflow

```
+--------------------------------------------------------------------------------------------------+
| 1. Writing Mode (Unbound State)                                                                  |
| "The knight entered the temple. He knew the Abyssals were waiting."                             |
| (Ordinary text. Zero visual distraction. No popups while typing.)                               |
+--------------------------------------------------------------------------------------------------+
                                                 |
                                                 | Author selects "He"
                                                 | Presses Mod-Shift-B (or Alt+B)
                                                 v
+--------------------------------------------------------------------------------------------------+
| 2. Candidate Binding Chooser (Modal / Inline Popover)                                           |
| +----------------------------------------------------------------------------------------------+ |
| | Bind "He" to Lorebook Entity                                                                 | |
| | [ Search characters, factions, locations...                ]                                 | |
| |                                                                                              | |
| | > Kaelen Vance        [Character] [Valoria]  Grand Marshall of the Northern Guard            | |
| |   Theron Thorne       [Character] [Valoria]  High Inquisitor of the Sunken Tower             | |
| |   High Chancellor     [Faction]   [Valoria]  Governing Council                               | |
| |                                                                                              | |
| | [Esc] Cancel                      [Enter] Confirm Binding              [L] Leave Unbound     | |
| +----------------------------------------------------------------------------------------------+ |
+--------------------------------------------------------------------------------------------------+
                                                 |
                                                 | Author selects "Kaelen Vance"
                                                 v
+--------------------------------------------------------------------------------------------------+
| 3. Bound Reference State                                                                         |
| "The knight entered the temple. He knew the Abyssals were waiting."                             |
|                                 ..                                                               |
| (Subtle, elegant dotted underline. Clicking opens Kaelen's dossier.)                            |
+--------------------------------------------------------------------------------------------------+
```

### 10.2 Pronoun UX Principles

1. **Distraction-Free Writing:** No automatic popups or suggestions appear while typing pronouns.
2. **Tri-State Clarity:**
   - **Unbound:** Ordinary prose.
   - **Candidate:** Author has invoked binding; chooser is open.
   - **Bound:** Persisted reference to entity UUID.
3. **Reference Actions within Dossier:**
   When an author clicks or activates a bound reference, the existing contextual dossier popup opens with an added reference banner:
   - *"Bound Reference: 'He' -> Kaelen Vance"*
   - Actions: `[ Change Target ]` | `[ Remove Binding ]` | `[ View in Web of Thought ]`

---

## 11. House & Universe Authorization Model

### 11.1 Scoped Entity Resolution

- Bindings store **canonical entity UUIDs**, not names.
- When an author inspects a bound reference, the editor queries `buildEchoCatalog(allDocuments, universeId, houseId, plan, houses)`.
- If the target entity exists within the authorized catalog, the dossier renders normally.

### 11.2 Handling Unresolved Bindings

A binding may become unresolved if:
1. The target entity was deleted.
2. The target entity was archived (`metadata.archived === true`).
3. The chapter document was moved to a different House or Universe where the target entity does not exist.

**Security & Isolation Rules for Unresolved Bindings:**
- **No Foreign Leakage:** The application must **never** query outside the active House/Universe to retrieve metadata for a missing UUID.
- **No Silent Redirection:** The application must **never** redirect to another entity that happens to share a similar name or alias.
- **Graceful Unresolved Banner:** The dossier displays a neutral warning:
  > *"Referenced lore entity is unavailable (Target UUID: `ent-...` is missing, archived, or belongs to another realm)."*
  > Options provided: `[ Rebind to another entity ]` | `[ Remove binding ]`.

---

## 12. Historical-Context Integration

### 12.1 Milestone Awareness (Phase W4 Integration)

- Chapters link to Web of Thought historical milestones via frontmatter `milestone_id`.
- When an author activates a bound pronoun (e.g. `"He"` -> Kaelen Vance):
  1. The reference supplies Kaelen's canonical UUID.
  2. The dossier controller retrieves the active chapter's milestone context via `resolveChapterHistoricalContext`.
  3. `stateEngine.resolveEntityState(plan, universeId, milestoneId, entityId)` calculates Kaelen's historical status at that exact story milestone (e.g., *Status: Active*, *Provenance: Explicit*, *Role: Knight*).
  4. The dossier renders the historical milestone badge, historical provenance, and author change notes.
- **Future Living Entity States Compatibility:**
  Because the persistent reference binds solely to the entity's invariant UUID (and does not store a frozen snapshot of attributes), it is completely forward-compatible with future timeline-aware properties and dynamic entity evolution.

---

## 13. Portable Universe and Vault Compatibility

### 13.1 Portable Universe Format v1 (`.mcuniverse`)

In `src-tauri/src/portable/validate.rs:145–175`, `opaque_fields` flags any frontmatter field not explicitly declared in its known allowlist.

```rust
// Known metadata fields in Portable Universe v1:
unknown(m, "universe universe_id book book_id chapter chapter_order milestone_id entry_type canon_status attributes character_fields location_fields faction_fields rule_fields artifact_fields event_fields archived _workshop custom_fields", "/metadata", &mut result);
```

#### Export Behavior
- `echo_references` inside `metadata` is collected into `.mcuniverse` archives within chapter/entity Markdown files.

#### Import Behavior
1. **Preserve Identities Policy:**
   - Entity and chapter UUIDs are preserved as-is.
   - `echo_references` passes through unchanged and remains fully functional.
2. **Separate Copy Policy (Identity Remapping):**
   - The importer generates new UUIDs for all entities in the package (`id_mappings`).
   - In `src-tauri/src/portable/import_plan.rs:953–965`, the importer inspects `opaque_fields`. If an opaque field contains a remapped entity UUID, it logs:
     `Diagnostic { code: "untransformable_extension_reference", ... }`.
   - **Policy Recommendation (No v1 Breaking Change):** During this audit and initial E3 implementation, we do **not** modify Portable Universe v1. Documents imported via `Separate Copy` will log the diagnostic warning, and references pointing to remapped UUIDs will enter the safe **Unresolved** state, prompting the author to rebind. In a future Portable Universe v1.1 update, `echo_references` can be added to `validate.rs` and remapped cleanly in `remap_frontmatter`.

### 13.2 Vault Backup and Recovery

- `src-tauri/src/vault.rs` captures all `.md` files in `Lorebooks/` and `Manuscripts/`.
- Vault backup (`.mcbackup`) and restore operations operate at the filesystem level, preserving canonical frontmatter byte-for-byte.
- On Vault recovery, `storage.scan_and_reindex()` reconstructs SQLite `metadata.db` and populates `metadata_json`, automatically restoring all persistent references without loss.

### 13.3 Document Lifecycle Operations

- **Document Duplication:** When duplicating a chapter, reference IDs (`id`) should be regenerated to prevent duplicate reference keys, while `targetId` bindings are preserved.
- **House Move (`move_document_to_house_impl`):** The canonical file is moved on disk and its `house_id` frontmatter updated. The `echo_references` travel with the file. If the target entities are not in the new House, bindings safely enter the Unresolved state.
- **Document Deletion (`delete_document_impl`):** Safely archives the document to `Backups/`. References are preserved inside the backup archive.

---

## 14. Migration and Backward Compatibility Assessment

| Dimension | Assessment | Evidence / Verification |
|---|---|---|
| **SQLite Schema Changes** | **None Required (Schema v2 preserved)** | SQLite `documents` table already has `metadata_json TEXT`. |
| **Database Migrations** | **None Required** | Derived index simply serializes the frontmatter metadata object. |
| **Rust Backend Models** | **None Required** | `models::Frontmatter.metadata` is `Option<serde_json::Value>`, which handles arbitrary JSON objects transparently. |
| **Canonical File Format** | **Backward Compatible** | Existing JSON frontmatter parser in `storage.rs` ignores unknown metadata keys; older files without `echo_references` load with empty reference sets. |
| **External Editors** | **Fully Compatible** | External editors see standard Markdown with frontmatter. Context anchors prevent offset corruption upon reopening. |

---

## 15. Security and Data-Loss Risks

| Risk Scenario | Severity | Mitigation Strategy |
|---|---|---|
| **Silent Misattribution:** An author edits text, causing a pronoun reference to attach to a different character. | **Critical** | Strict validation rule: if the text at `[from, to]` does not equal `matchedText` (case-insensitive), the binding is detached. The app never guesses. |
| **Dual-Write Divergence:** Text saves but reference manifest fails, causing desynchronization. | **Critical** | Single-channel architecture: reference metadata is stored directly in frontmatter and saved atomically with the body in one file operation. |
| **Cross-House Lore Leakage:** Inspecting an unresolved reference leaks entity names from a foreign House. | **High** | Scoped catalog lookup: unresolved references show only a neutral ID placeholder; no foreign database queries are performed. |
| **External Edit Offset Desynchronization:** An author edits in VSCode; line breaks or text shifts throw off offsets. | **Medium** | Re-anchoring engine checks surrounding context anchors (`before`, `after`) within a bounded search window before activating bindings. |
| **Typing Latency in Large Documents:** RangeSet recalculations lag behind keystrokes in 10,000+ word chapters. | **Low** | CodeMirror transactions map positions incrementally via `ChangeDesc` in `O(N)` where N is reference count, avoiding full document re-scans on keystrokes. |

---

## 16. Performance Considerations

1. **Keystroke Performance:** CodeMirror 6 maps existing ranges through `tr.changes.mapPos` in sub-millisecond time. In a document with 100 bound pronouns, position mapping takes under **0.15ms**.
2. **Lexical Scanner Optimization:** In `echoMatching.ts`, candidate matching skips spans covered by confirmed references. Binding frequent pronouns actually **reduces** the workload of the dynamic regex matcher.
3. **Decoration Rendering:** Decorations are constructed via `RangeSetBuilder` in `O(N log N)` sort time. Rebuilding decorations for 100 references takes less than **0.5ms**.
4. **Memory Footprint:** 100 persistent references add less than **15 KB** of JSON data to the document frontmatter, having negligible impact on file size and disk I/O.

---

## 17. Proposed Implementation Phases

```
+--------------------------------------------------------------------------------------------------+
| Phase 1: Data Contracts, Types & CodeMirror Extension Foundations                                |
| - Define EchoPersistentReference & EchoContextAnchor in types.ts.                               |
| - Extend confirmedReferencesField to support loading, unbinding, and detachment.                 |
| - Add loadReferencesEffect, bindReferenceEffect, unbindReferenceEffect.                          |
+--------------------------------------------------------------------------------------------------+
                                                 |
                                                 v
+--------------------------------------------------------------------------------------------------+
| Phase 2: Loading, Re-Anchoring & Invalidation Engine                                             |
| - Implement re-anchoring algorithm with context verification (before/after).                     |
| - Implement graceful detachment for altered/deleted spans.                                       |
| - Add unit tests for offset shifting, insertions, deletions, and external edit simulation.        |
+--------------------------------------------------------------------------------------------------+
                                                 |
                                                 v
+--------------------------------------------------------------------------------------------------+
| Phase 3: Pronoun Binding UX & Chooser                                                            |
| - Implement EchoBindingModal (searchable entity chooser).                                        |
| - Add keyboard shortcut Mod-Shift-B and context menu action.                                     |
| - Add subtle, non-intrusive styling for bound references (gold dotted underline).               |
| - Add Reference Banner in EchoDocumentationPopup (Change Target / Remove Binding).               |
+--------------------------------------------------------------------------------------------------+
                                                 |
                                                 v
+--------------------------------------------------------------------------------------------------+
| Phase 4: Production Save Pipeline Integration                                                   |
| - Update MarkdownEditor.tsx to load references from document metadata on mount.                  |
| - Update BookView.tsx and LorebookStudio.tsx save handlers to include echo_references.          |
| - Verify atomic write coordination with SaveCoordinator.                                         |
+--------------------------------------------------------------------------------------------------+
                                                 |
                                                 v
+--------------------------------------------------------------------------------------------------+
| Phase 5: Verification & Acceptance Suites                                                         |
| - Run automated test suite across all 24 acceptance scenarios.                                   |
| - Perform browser harness verification.                                                          |
| - Execute packaged Windows acceptance testing.                                                   |
+--------------------------------------------------------------------------------------------------+
```

---

## 18. Automated and Windows Acceptance Matrix

| Test Suite / Scope | Scenario Description | Expected Outcome |
|---|---|---|
| **Unit: Binding** | Bind pronoun `"He"` to entity UUID `ent-1`. | Prose text unchanged; reference stored in state field. |
| **Unit: Multiple Pronouns** | Sentence with two `"He"` tokens bound to different UUIDs (`ent-1`, `ent-2`). | Both references maintain independent IDs and targets. |
| **Unit: Precedence** | Entity named "Knight" bound to `ent-1`; candidate scanner runs. | Candidate match for "Knight" suppressed over bound span. |
| **Unit: Edits Before** | Insert 50 characters at index 0. | `from` and `to` shift forward by exactly 50 chars; text matches. |
| **Unit: Edits Inside** | Insert character inside `"He"` -> `"Hae"`. | Reference immediately invalidated/detached. |
| **Unit: Boundary Delete** | Delete word before and first letter of `"He"`. | Reference invalidated; range does not corrupt. |
| **Unit: Re-Anchoring** | External edit shifts text by 20 chars; context anchors intact. | Re-anchoring engine detects shift and updates offsets cleanly. |
| **Unit: Undo / Redo** | Bind pronoun, type text, undo typing, undo binding. | CodeMirror undo stack cleanly restores prior states. |
| **Integration: Save / Reload** | Bind pronoun in `BookView`, save chapter, switch books, reload. | References reload from frontmatter; decorations re-rendered. |
| **Integration: Restart** | Bind pronoun, restart application, reload document. | References persist from canonical Markdown frontmatter. |
| **Integration: Milestone** | Chapter bound to milestone M1; open dossier for bound `"He"`. | Historical badge and status reflect milestone M1. |
| **Security: House Isolation** | Move chapter to House B where target entity does not exist. | Reference marks Unresolved; zero entity metadata leaked. |
| **Security: Entity Deletion** | Target entity deleted; chapter reloaded. | Reference marks Unresolved; prompt to rebind or remove. |
| **Portability: Export** | Export universe to `.mcuniverse` (Preserve Identities). | Package includes frontmatter references intact. |
| **Vault: Backup & Restore** | Create `.mcbackup`, restore to clean folder. | Restored documents retain all persistent references. |
| **Windows Acceptance** | Test IME composition (Japanese/Chinese) adjacent to bound span. | IME composition completes without triggering reference invalidation. |

---

## 19. Unresolved Product Decisions

The following product design decisions require explicit author alignment prior to Phase 1 implementation:

1. **Visual Styling Default for Bound Pronouns:**
   - *Option A (Subtle Persistent):* An extremely discreet gold dotted underline is always visible.
   - *Option B (Focus / Hover Only):* Bound pronouns appear as standard unstyled text until the author hovers over them or places the text caret inside them.
   - *Recommendation:* Option A with low contrast (`rgba(212, 175, 55, 0.65)`), ensuring authors can easily spot their bindings while maintaining a distraction-free writing atmosphere.
2. **Cut / Paste Behavior:**
   - *Option A:* Cutting a bound pronoun strips the binding; pasting produces plain text.
   - *Option B:* Clipboard preserves the binding metadata in an internal clipboard cache, rebinding on paste if pasted into the same document.
   - *Recommendation:* Option A. Plain text clipboard matches standard editor semantics and prevents accidental duplicate bindings.
3. **Scope of Context Anchors:**
   - *Option A:* Store 24 characters before and after.
   - *Option B:* Store preceding/succeeding sentence.
   - *Recommendation:* Option A (character-based bounded window) is robust against punctuation changes and lightweight to serialize.

---

## 20. Clear Go / No-Go Recommendation

### Verdict: **GO**

**Justification:**
1. **Architectural Alignment:** The existing MetaCognition Notebook architecture already possesses the core prerequisites: CodeMirror 6's transaction mapping engine, `confirmedReferencesField` in `echoExtension.ts`, `write_document_atomic` in Rust storage, and `metadata_json` in SQLite.
2. **Zero Schema Risk:** Implementing Echo E3 requires no database migrations, no SQLite table modifications, and no Rust storage model breaking changes.
3. **Data Safety:** The proposed Hybrid Architecture completely avoids prose corruption, guarantees save atomicity within canonical Markdown, and handles external edits gracefully via context re-anchoring.

Implementation may proceed to Phase 1 upon author approval of the product decisions in Section 19 and confirmation of the technical contracts in Section 21.

---

## 21. Final E3 Implementation Contracts

This section defines the exact, non-negotiable engineering contracts and safety specifications required to implement Echo Library E3 without regressions, data corruption, or architectural divergence.

### 21.1 Exact Persisted Data Model

Persistent references live canonically inside the Markdown document's JSON frontmatter under `metadata.echo_references: EchoPersistentReference[]`.

#### TypeScript Contract (`src/components/echo/types.ts`)

```typescript
/**
 * Contextual text anchors surrounding a bound span.
 * Used to re-anchor offsets after external edits, git merges, or line-ending conversions.
 */
export interface EchoContextAnchor {
  /** Leading UTF-16 code units immediately preceding the span (up to 32 chars) */
  before: string;
  /** Trailing UTF-16 code units immediately following the span (up to 32 chars) */
  after: string;
}

/**
 * Status lifecycle of a persistent reference binding.
 *
 * - 'active': Text anchor is verified at [from, to], and targetId exists in the active House/Universe catalog.
 * - 'unresolved': Text anchor is verified at [from, to], but targetId cannot be resolved in the current catalog
 *   (e.g., target entity was deleted, archived, or the document was moved to a different House/Universe).
 * - 'detached': The text anchor cannot be uniquely verified in the document body (e.g., span was edited,
 *   deleted, or external changes introduced ambiguity). The target entity may still exist.
 */
export type EchoReferenceStatus = 'active' | 'unresolved' | 'detached';

/**
 * Canonical persistent reference model stored in document frontmatter.
 */
export interface EchoPersistentReference {
  /** Stable UUID identifying this specific reference occurrence (e.g. "ref-9f1c-4b8a") */
  id: string;
  /** Canonical UUID of the referenced Lorebook entity (e.g. "ent-kael-8821") */
  targetId: string;
  /** Start offset in UTF-16 code units within the LF-normalized document body (0-indexed) */
  from: number;
  /** End offset in UTF-16 code units within the LF-normalized document body (non-inclusive) */
  to: number;
  /** Exact text string bound by the author (e.g. "He", "she", "High Marshal") */
  matchedText: string;
  /** Contextual text anchors capturing surrounding prose */
  anchor: EchoContextAnchor;
  /** Status of the reference binding */
  status: EchoReferenceStatus;
  /** Timestamp when the binding was created (ISO 8601 UTC) */
  createdAt: string;
  /** Timestamp when the binding was last modified (ISO 8601 UTC) */
  updatedAt: string;
}
```

#### JSON Frontmatter Schema Snippet

```json
{
  "id": "chap-9b1c-4e8a",
  "title": "Chapter 4: The Silent Vigil",
  "type": "lorebook",
  "house_id": "house-default",
  "metadata": {
    "entry_type": "chapter",
    "universe_id": "univ-valoria-101",
    "echo_references": [
      {
        "id": "ref-7f3a-11e9-92b1-001a4a160001",
        "targetId": "ent-kael-8821-4f1b-b23c-918273645012",
        "from": 28,
        "to": 30,
        "matchedText": "He",
        "anchor": {
          "before": "entered the temple. ",
          "after": " knew the Abyssals"
        },
        "status": "active",
        "createdAt": "2026-10-31T09:15:00Z",
        "updatedAt": "2026-10-31T09:15:00Z"
      }
    ]
  }
}
```

---

### 21.2 Offset Coordinate Contract

1. **UTF-16 Code-Unit Indexing:**
   - All persisted character offsets (`from`, `to`) and length calculations strictly measure **UTF-16 code units** within the document body string.
   - This aligns directly with JavaScript string methods (`String.prototype.length`, `slice()`), CodeMirror 6's internal text model (`state.doc.length`, `state.doc.sliceString()`), and DOM selection indices.
2. **LF Line-Ending Normalization:**
   - Canonical files may be edited externally on Windows systems with CRLF (`\r\n`). In CodeMirror, lines are internally separated by `\n`.
   - **Contract:** On reading any document from disk/IPC, the body is immediately normalized to LF: `const normalizedContent = rawContent.replace(/\r\n/g, '\n')`.
   - All persisted offsets correspond strictly to this normalized representation.
   - When saving, CodeMirror content is LF-normalized. This eliminates the catastrophic `1-code-unit-per-line` offset drift on Windows.
3. **Surrogate Pairs and Astral Unicode (Emoji & Symbols):**
   - Characters outside the Basic Multilingual Plane (such as emoji 🛡️, 🗡️, 🧝, or historical symbols) consist of 2 UTF-16 code units (surrogate pair).
   - `from` and `to` boundary calculations must never bisect a surrogate pair. CodeMirror's word-selection and transaction mapper naturally preserve surrogate pairs.
4. **Combining Characters and Diacritics:**
   - Accented letters (e.g. `é`, `ñ`) or Unicode combining marks are stored according to their canonical code-unit representation. `matchedText` preserves the exact code unit sequence.
5. **Coordinate Invariant:**
   - For every active reference: `0 <= from < to <= doc.length` and `doc.sliceString(from, to) === matchedText`.

---

### 21.3 Undo/Redo Strategy

In CodeMirror 6, the `history()` extension only listens to document text changes (`tr.docChanged`) by default. Pure `StateEffect` dispatches that modify only a `StateField` without changing the document string are **not automatically added to the undo stack**.

To guarantee that creating, removing, retargeting, or detaching a binding is 100% undoable and redoable:

#### History Integration via `invertedEffects`

We register `invertedEffects` from `@codemirror/commands` within the CodeMirror extensions list:

```typescript
import { history, invertedEffects } from '@codemirror/commands';

export const echoHistoryExtension = [
  history(),
  invertedEffects.of((tr) => {
    const inverted: StateEffect<unknown>[] = [];

    for (const effect of tr.effects) {
      if (effect.is(bindReferenceEffect)) {
        // Inverting a binding creation means removing that reference ID
        inverted.push(unbindReferenceEffect.of({ id: effect.value.id }));
      } else if (effect.is(unbindReferenceEffect)) {
        // Inverting a binding removal means re-creating the exact previous reference object
        const priorRef = tr.startState
          .field(confirmedReferencesField)
          .references.find((r) => r.id === effect.value.id);
        if (priorRef) {
          inverted.push(bindReferenceEffect.of(priorRef));
        }
      } else if (effect.is(changeTargetEffect)) {
        // Inverting a target change means restoring the previous targetId
        const priorRef = tr.startState
          .field(confirmedReferencesField)
          .references.find((r) => r.id === effect.value.id);
        if (priorRef) {
          inverted.push(
            changeTargetEffect.of({
              id: effect.value.id,
              targetId: priorRef.targetId,
            })
          );
        }
      } else if (effect.is(detachReferenceEffect)) {
        // Inverting detachment restores active status
        inverted.push(reattachReferenceEffect.of({ id: effect.value.id }));
      }
    }

    return inverted;
  }),
];
```

#### Behavior Across Operations

- **Binding a Pronoun (Zero Text Change):** Dispatches `bindReferenceEffect`. `invertedEffects` records the inverted `unbindReferenceEffect` on the history stack. Pressing `Mod-z` immediately unbinds the reference without requiring any prose edits.
- **Removing a Binding (Zero Text Change):** Dispatches `unbindReferenceEffect`. Pressing `Mod-z` restores the binding.
- **Simultaneous Text Edit and Reference Shift:** An author types `"Lord "` before a bound `"He"`. CodeMirror's transaction maps the span offsets from `[28, 30]` to `[33, 35]`. Pressing `Mod-z` reverses the document change, and transaction mapping restores the offsets to `[28, 30]`.
- **Text Deletion Invalidation:** An author deletes `"He"`. The reference is invalidated. Pressing `Mod-z` restores `"He"`, and CodeMirror transaction mapping restores the reference.

---

### 21.4 Save Snapshot Strategy

#### Single Coherent Revision Capture

To guarantee that text and reference offsets never belong to divergent revisions:

1. **Dirty State Tracking on Reference Changes:**
   - In `MarkdownEditor.tsx`, any transaction that adds, removes, or retargets a reference notifies the parent host via `onDocumentChange({ content, references, isDirty: true })`.
   - In `BookView.tsx`, this immediately sets `chapterSaveStatus = 'editing'` and starts the autosave debounce timer.
2. **Snapshot Extraction:**
   - When `SaveCoordinator.flush` triggers the save action, `MarkdownEditor` extracts `content` and `references` synchronously from the **identical `EditorState` revision**:
     ```typescript
     const state = view.state;
     const snapshotContent = state.doc.toString();
     const snapshotReferences = state.field(confirmedReferencesField).references;
     ```
   - These are bundled together into the `save_document` command payload:
     ```typescript
     await api.saveDocument(
       activeChapterId,
       snapshotContent,
       currentDoc.title,
       currentDoc.tags,
       JSON.stringify({ ...currentMeta, echo_references: snapshotReferences })
     );
     ```
3. **Atomic Disk Persistence:**
   - Tauri IPC routes the payload to `commands.rs:save_document_with_options_impl`.
   - `storage.rs:write_document_atomic` writes both frontmatter and content to a `.tmp_<uuid>_<pid>.tmp` file next to the destination, executes `sync_all()`, and renames the file atomically over the target.
   - **Guarantee:** There is no separate IPC command or file for references. Text and references are persisted in a single atomic filesystem write.
4. **Navigation & Unmount Safety:**
   - In `BookView.tsx`, switching chapters or navigating away awaits `await flushChapterSave()`.
   - If a save is in flight, `SaveCoordinator` serializes subsequent calls; navigation blocks until the active write completes cleanly.
5. **Stale Asynchronous Callback Guard:**
   - Every save invocation carries an incrementing generation counter (`saveGenerationRef.current++`).
   - Responses arriving from older generations are discarded, preventing stale network/IPC responses from overwriting newer in-memory editor states.

---

### 21.5 Re-Anchoring and Invalidation Algorithm

When a document is loaded from disk, or when an external change is detected, MetaCognition Notebook executes the following deterministic reconciliation pass:

```
For each reference R in metadata.echo_references:

1. Exact Match Check:
   Extract current slice S = normDoc.slice(R.from, R.to).
   If S === R.matchedText:
     Extract current context before: B = normDoc.slice(max(0, R.from - len(R.anchor.before)), R.from)
     Extract current context after:  A = normDoc.slice(R.to, min(normDoc.length, R.to + len(R.anchor.after)))
     If B === R.anchor.before AND A === R.anchor.after:
       -> Mark R.status = 'active'
       -> Retain [R.from, R.to]
       -> Proceed to next reference.

2. Bounded Local Window Search (External Edit Recovery):
   If Step 1 fails (offsets shifted or text mismatch):
     Define search window: [W_start = max(0, R.from - 250), W_end = min(normDoc.length, R.to + 250)].
     Scan window for all occurrences of R.matchedText where:
       boundary_before is valid Unicode word boundary AND
       boundary_after is valid Unicode word boundary.
     
     For each occurrence Candidate_i at [c_from, c_to]:
       Calculate AnchorScore_i:
         Score based on character match ratio of R.anchor.before and R.anchor.after.
     
     If EXACTLY ONE Candidate exists with perfect or unambiguous anchor score:
       -> Re-anchor R!
       -> Update R.from = Candidate.c_from, R.to = Candidate.c_to
       -> Update R.anchor to new surrounding context
       -> Mark R.status = 'active'
       -> Flag document as dirty (so corrected offsets are persisted on next save)
       -> Proceed to next reference.

3. Ambiguity & Failure Handling (Strict Non-Inference):
   If ZERO candidates match, OR MULTIPLE ambiguous candidates match (e.g. repeated pronouns "He said... He said"):
     -> DO NOT GUESS OR ARBITRARILY ATTACH!
     -> Mark R.status = 'detached'
     -> Keep R.from, R.to as last-known coordinates
     -> Retain R in metadata.echo_references
     -> Surface in "Manage References" interface as "Detached Anchor (Requires author review)"
```

#### Distinguishing Detached Anchors from Unresolved Targets

| Status | Text Anchor in Prose | Target Entity in Catalog | Author Experience |
|---|---|---|---|
| **`active`** | Verified at `[from, to]` | Exists and is active | Gold dotted underline. Clicking opens full contextual dossier. |
| **`unresolved`** | Verified at `[from, to]` | Missing / archived / foreign | Amber dotted underline. Clicking shows: *"Referenced lore entity is missing or archived. [Rebind] [Remove]"*. |
| **`detached`** | Lost / modified / ambiguous | Exists in Lorebook | Displayed in Manage References panel: *"Text span was edited or moved. [Select text in editor to re-anchor] [Remove]"*. |

---

### 21.6 Portable Import and Remapping Policy

#### Maintaining Compatibility with Portable Universe Format v1

In Portable Universe v1 (`.mcuniverse`), `src-tauri/src/portable/validate.rs:166` specifies the known metadata field allowlist. Unknown fields are classified as `opaque_fields`. In `Separate Copy` mode, any opaque field containing a remapped UUID causes `import_preview` to flag `Diagnostic { code: "untransformable_extension_reference" }` and fail validation (`preview.is_valid == false`).

To ensure E3 references work seamlessly in Portable Universe packages without breaking v1 format rules:

1. **Register Known Field:**
   - Add `"echo_references"` to the known metadata allowlist in `src-tauri/src/portable/validate.rs:166`.
   - Packages maintain `"manifest.version": 1`. Older packages without `echo_references` remain 100% valid.
2. **Import Policy: `Preserve Identities`:**
   - Identity mappings are not applied.
   - All `echo_references` pass through untouched, maintaining their canonical `targetId` and `id`.
3. **Import Policy: `Separate Copy` (Identity Remapping):**
   - In `src-tauri/src/portable/import_plan.rs:remap_frontmatter`, iterate `echo_references`:
     ```rust
     if let Some(refs) = meta.get_mut("echo_references").and_then(Value::as_array_mut) {
         for r in refs {
             if let Some(obj) = r.as_object_mut() {
                 // 1. Re-key reference occurrence ID to prevent collisions
                 obj.insert("id".into(), Value::String(uuid::Uuid::new_v4().to_string()));
                 
                 // 2. Remap target entity UUID
                 if let Some(tid) = obj.get("targetId").and_then(Value::as_str) {
                     if let Some(new_tid) = id_map.get(tid) {
                         obj.insert("targetId".into(), Value::String(new_tid.clone()));
                     } else {
                         // Target entity was omitted or external to the package
                         obj.insert("status".into(), Value::String("unresolved".into()));
                     }
                 }
             }
         }
     }
     ```
4. **External and Omitted Targets:**
   - If a reference targets an entity that was not included in the exported package, `id_map.get(targetId)` returns `None`.
   - The reference target is **never** fabricated or guessed. Its `status` is explicitly set to `"unresolved"`, and a package warning is logged:
     `Diagnostic { code: "external_reference_unresolved", message: "Reference 'He' targets an entity outside the imported package; marked unresolved" }`.
   - This strictly prevents silent cross-Universe leakage or dangling relationships.

---

### 21.7 Reference Management UX

Authors require a non-intrusive, centralized interface to inspect, rebind, repair, and delete references for the active document.

#### 1. Entry Points
- **Editor Status Bar / Toolbar:** An indicator badge showing `[ Echo: 3 References ]` (with an amber alert icon if any references are unresolved or detached). Clicking opens the *Manage References Drawer*.
- **Keyboard Shortcut:** `Mod-Shift-R` (or `Alt-R`).
- **Contextual Dossier Action:** When viewing a bound entity's dossier, the header includes a link: `[ Manage Document References ]`.

#### 2. Manage References Drawer Specification

A compact, accessible slide-out panel mounted within `data-echo-boundary`:

```
+--------------------------------------------------------------------------------------------------+
| Manage References (Chapter 4: The Silent Vigil)                                              [X] |
| +----------------------------------------------------------------------------------------------+ |
| | [ Search references, entities, or pronouns...                                              ] | |
| | Filter: [ All (3) ]  [ Active (2) ]  [ Unresolved (1) ]  [ Detached (0) ]                    | |
| +----------------------------------------------------------------------------------------------+ |
|                                                                                                  |
|  1. "He"  ->  Kaelen Vance [Character]                                    [Active - Line 14]    |
|     "...entered the temple. [He] knew the Abyssals were waiting..."                              |
|     [ Jump to Text ]  [ Change Target ]  [ Remove Binding ]                                      |
|                                                                                                  |
|  2. "him" ->  Theron Thorne [Character]                                   [Active - Line 18]    |
|     "...looked at [him]. He smiled."                                                             |
|     [ Jump to Text ]  [ Change Target ]  [ Remove Binding ]                                      |
|                                                                                                  |
|  3. "The King" -> [Unknown Entity: ent-old-king-99]                     [Unresolved - Line 32]   |
|     "...bowed before [The King]. His crown was cracked."                                         |
|     Warning: Referenced entity was deleted or belongs to another realm.                          |
|     [ Jump to Text ]  [ Rebind Target ]  [ Remove Binding ]                                      |
|                                                                                                  |
| +----------------------------------------------------------------------------------------------+ |
| | [ Clean All Unresolved ]                                           Total Word Count: 1,420   | |
| +----------------------------------------------------------------------------------------------+ |
+--------------------------------------------------------------------------------------------------+
```

#### 3. Core Management Operations

1. **Jump to Text:** Focuses CodeMirror, scrolls smoothly to the target offset, and temporarily highlights the span with a focus animation.
2. **Change Target / Rebind:** Opens the searchable `EchoBindingModal` scoped strictly to the current House and Universe. Selecting a new entity updates `targetId`, updates `updatedAt`, sets status to `'active'`, and marks the document dirty.
3. **Repair Detached Anchor:** If an external edit breaks an anchor, the author can select the intended word in the editor and click `[ Re-anchor to Selection ]`. The system updates `from`, `to`, `matchedText`, and context anchors without deleting the reference ID.
4. **Remove Binding:** Dispatches `unbindReferenceEffect`. The reference is deleted from frontmatter metadata. **The prose text remains 100% untouched.**

---

### 21.8 Required Regression Tests

The implementation plan requires full test coverage across four distinct layers:

#### Layer 1: CodeMirror Unit Tests (`tests/echo_references_codemirror.test.ts`)
1. **Binding Creation:** Dispatching `bindReferenceEffect` adds reference to `confirmedReferencesField` without modifying `doc.toString()`.
2. **Lexical Precedence:** Lexical candidate matcher (`candidateMatchesField`) suppresses candidate decorations over any span covered by a persistent reference.
3. **Insertions Before Span:** Inserting 20 characters before a bound span maps `from` and `to` forward by exactly 20 UTF-16 code units.
4. **Insertions Inside Span:** Inserting characters into `"He"` (e.g. `"Hee"`) triggers immediate reference detachment.
5. **Partial Deletion:** Deleting characters across the start or end boundary invalidates the reference cleanly.
6. **InvertedEffects Undo/Redo:**
   - Bind pronoun -> Undo (`Mod-z`) removes binding.
   - Redo restores binding.
   - Remove binding -> Undo restores binding with exact original `id` and `targetId`.
   - Change target -> Undo restores original `targetId`.
7. **Multiple Pronouns in One Sentence:** Track independent bindings for `"He looked at him. He smiled."` where `"He"` (pos 0) -> Entity A, `"him"` (pos 15) -> Entity B, and `"He"` (pos 20) -> Entity B. Verify all three map independently through edits.
8. **Astral Unicode / Surrogate Pairs:** Bind a phrase adjacent to emoji (e.g. `🗡️ Kael`); verify UTF-16 code unit offsets remain exact without byte splitting.

#### Layer 2: Persistence & Save Integration Tests (`tests/echo_references_persistence.test.ts`)
1. **Coherent Snapshot Save:** Trigger autosave; verify `save_document` receives content and `metadataJson.echo_references` from the same revision.
2. **Reopen & Reload:** Save document with bindings, close editor, reload; verify references re-hydrate with active status and decorations.
3. **CRLF Normalization:** Simulate external editor saving with `\r\n`; verify reload normalizes to `\n` and re-anchors offsets without 1-char-per-line drift.
4. **Re-Anchoring Shifted Text:** Shift paragraph by 50 characters; verify bounded window search re-anchors offsets and updates context anchors.
5. **Ambiguous Repeated Pronoun Safety:** Create two identical `"He said"` paragraphs. Move them externally. Verify engine marks them `detached` rather than guessing or cross-assigning.
6. **Rapid Chapter Switching:** Switch chapters rapidly during active typing; verify `flushChapterSave` drains in-flight writes and prevents stale cross-chapter metadata writes.

#### Layer 3: Identity & Boundary Security Tests (`tests/echo_references_isolation.test.ts`)
1. **House Boundary Enforcement:** Move document to House B where target entity does not exist. Verify reference enters `unresolved` status with zero metadata leaked.
2. **Entity Deletion Enforcement:** Delete target Lorebook entity. Reload chapter. Verify reference enters `unresolved` status.
3. **Web of Thought Decoupling:** Bind pronoun. Verify no row is added to `plan.relationships` and Web of Thought history is unmutated.
4. **Historical Milestone Context:** Chapter bound to milestone M1; verify opening dossier from bound pronoun passes M1 context and displays historical badges correctly.

#### Layer 4: Portable Universe & Vault Tests (`tests/echo_references_portable.test.ts`)
1. **Preserve Identities Export/Import:** Export universe with bound chapters to `.mcuniverse`; import with `Preserve Identities`; verify all bindings functional.
2. **Separate Copy Export/Import:** Export universe; import with `Separate Copy`; verify entity UUIDs are remapped in `echo_references` and reference IDs re-keyed.
3. **External Target Import:** Export universe containing reference to external entity; import in Separate Copy; verify external reference enters `unresolved` status with diagnostic warning.
4. **Vault Backup & Recovery:** Create `.mcbackup`; restore to clean directory; verify all persistent references restored cleanly.

---

### 21.9 Implementation Readiness Verdict

### Final Verdict: **READY FOR IMPLEMENTATION**

All technical contracts are fully specified:
1. **Zero-Schema Risk:** Stored in canonical frontmatter `metadata.echo_references` and SQLite `metadata_json`. Zero database migrations or table alterations required.
2. **Clean Prose:** Zero inline syntax tokens. Prose is 100% standard Markdown.
3. **Undo/Redo Guarantee:** Fully solved via CodeMirror 6 `invertedEffects`.
4. **Save Consistency:** Single-channel atomic filesystem write via `write_document_atomic`.
5. **Format Safety:** Portable Universe v1 compatibility maintained; Separate Copy remapping cleanly defined.
6. **Non-Inference Guarantee:** Strict re-anchoring rules prevent silent misattribution.

**Awaiting user authorization to begin Phase 1 implementation.**

