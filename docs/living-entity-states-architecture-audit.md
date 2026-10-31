# MetaCognition Notebook — Web of Thought: Living Entity States
## Read-Only Architecture Audit & Implementation Plan

**Date**: 2026-10-31  
**Author**: Antigravity Architecture & Lore Systems Team  
**Status**: Read-Only Architecture Audit & Evidence-Based Technical Specification  
**Target Milestone**: Future Web of Thought Extension (`Candidate v0.9.0`)  
**Scope**: Timeline-Aware Evolving Entity Attributes and Relationships  

---

## 1. Executive Summary

MetaCognition Notebook is a local-first creative authoring desktop application engineered with Tauri 2, Rust, React, TypeScript, CodeMirror 6, and SQLite. A central pillar of its design is the **Prose Purity and Canonical Markdown Invariant**: the author's prose is stored as human-readable standard Markdown with JSON frontmatter, while SQLite serves strictly as a derived index.

The application currently supports:
1. **Canonical Lorebook Entities**: Characters, Locations, Factions, Artifacts, Rules, Cultures, and Events with persistent UUIDs and structured profile fields.
2. **Web of Thought Planning**: Story milestones arranged in chronological order, with canonical timelines, alternate branch continuities, milestone-attached state changes (`Change`), and milestone-attached relationship adjustments (`RelationshipChange`).
3. **Phase W1–W4 State Engine**: A pure, deterministic ancestor traversal engine (`stateEngine.ts`) that computes milestone-specific status descriptors (e.g. `alive`, `deceased`, `missing`, `not_yet_introduced`) and projects chapter-aware historical badges into Echo dossiers.
4. **Echo E2/E3 Lexical and Bound Lore Exploration**: Real-time lexical lore recognition and explicit persistent pronoun/phrase binding (`metadata.echo_references`) targeting canonical Lorebook entity UUIDs.

### The Problem: Static Entity Profiles vs. Evolving Historical Narratives
Currently, Lorebook entity documents represent a **single, static snapshot** of an entity's identity. In `CharacterProfileFields.tsx` and `convertDocumentToEchoEntity` (`src/utils/echoLore.ts`), attributes such as `role`, `occupation`, `affiliation`, `residence`, and `vital_status` are read directly from the entity document's frontmatter (`character_fields`). 

Although the Phase W1–W4 state engine resolves historical status (`property_key = 'status'`) for historical badges in `EchoDocumentationPopup.tsx`, **all other entity attributes, prose overview, guided fields, and connected relationships remain static across the entire timeline**. 

For example:
- **Kael (`entity-kael`)**:
  - *Year 100*: Knight of the Northern Guard, sworn to the Crown.
  - *Year 120*: Disgraced Exile, wandering alone, hunted by the Crown.
  - *Year 150*: Crowned King of Valoria, allied with Theron.

Under the current implementation, an author inspecting a bound reference to `"He"` in a Year 120 chapter will see a historical badge indicating Kael is `alive`, but the dossier's Overview, Character Fields, and Relationships will still list him as `"King"`, living in `"Royal Palace"`, and allied with `"Theron"` (or whatever present-day values are saved in his canonical document).

### Core Architectural Principle
> **"One entity, one canonical identity, many historically accurate states — without rewriting the past or breaking existing universes."**

Authors must not be forced to create duplicate Lorebook entities (e.g., `Kael (Knight)`, `Kael (Exile)`, `Kael (King)`). A single entity UUID (`entity-kael`) must anchor all historical states. When an author inspects Kael in a chapter set in Year 100, Echo must present Kael as a Knight; in Year 120, as an Exile; and in Year 150, as King.

Crucially:
- **Timeline tracking is 100% opt-in**: Authors who do not construct timeline milestones retain standard, timeless entity profiles.
- **Prose purity is preserved**: Zero synthetic tokens or timeline annotations are embedded in Markdown prose.
- **Derived index is preserved**: Zero SQLite schema migrations are required.
- **Portability is guaranteed**: Existing `.mcuniverse` v1 archives remain valid and fully compatible.

---

## 2. Verified Existing Architecture

To ground this audit in concrete evidence, we inspected the live codebase across Rust, TypeScript, and React boundaries.

```
+--------------------------------------------------------------------------------------------------+
|                                    CANONICAL STORAGE LAYER                                       |
|                                                                                                  |
|   +------------------------------------+          +------------------------------------------+   |
|   |   Lorebooks/Characters/Kael.md     |          |       Lorebooks/Web_of_Thought_*.md      |   |
|   |   - id: "entity-kael"              |          |       - metadata._web_of_thought:        |   |
|   |   - entry_type: "character"        |          |         - universes: Universe[]          |   |
|   |   - character_fields (Baseline)    |          |         - books: Book[]                  |   |
|   |   - echo_references: [...]         |          |         - branches: Branch[]             |   |
|   |   - Prose: Markdown                |          |         - nodes: StoryNode[]             |   |
|   +-----------------+------------------+          |           - changes: Change[]            |   |
|                     |                             |           - relationship_changes: [...]  |   |
|                     |                             |         - relationships: Relationship[]  |   |
|                     |                             +--------------------+---------------------+   |
+---------------------|--------------------------------------------------|-------------------------+
                      |                                                  |
                      +-------------------------+------------------------+
                                                |
                                                v
+--------------------------------------------------------------------------------------------------+
|                                     STATE RESOLUTION LAYER                                       |
|                                                                                                  |
|   +------------------------------------------------------------------------------------------+   |
|   |   src/utils/stateEngine.ts                                                               |   |
|   |   - validateMilestoneAncestry(plan, milestoneId): Cycle-free chronological lineage       |   |
|   |   - resolveUniverseStateAtMilestone(plan, docs, universeId, milestoneId, options)        |   |
|   |   - resolveChapterHistoricalContext(plan, universeId, chapterDoc, book): Milestone link  |   |
|   |   - resolveEntityHistoricalEchoState(plan, docs, universeId, milestoneId, entityId)      |   |
|   +---------------------------------------------+--------------------------------------------+   |
+-------------------------------------------------|------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
|                                      CONSUMPTION / UX LAYER                                      |
|                                                                                                  |
|   +------------------------------------+          +------------------------------------------+   |
|   |   BookView.tsx / CodeMirror 6      |          |   EchoDocumentationPopup.tsx             |   |
|   |   - Chapter editor with Echo E3    |          |   - Historical Context Badge (W4)        |   |
|   |   - Bound reference inspection     |          |   - Static baseline fields (Gap)         |   |
|   |   - Chapter milestone context      |          |   - Static relationships (Gap)           |   |
|   +------------------------------------+          +------------------------------------------+   |
|   +------------------------------------+          +------------------------------------------+   |
|   |   UniverseStateExplorer.tsx        |          |   CharacterProfileFields.tsx             |   |
|   |   - Milestone timeline inspection  |          |   - Canonical baseline editing only      |   |
|   |   - Only edits 'status' (Gap)      |          |   - No historical preview (Gap)          |   |
|   +------------------------------------+          +------------------------------------------+   |
+--------------------------------------------------------------------------------------------------+
```

### 2.1 Web of Thought Data Structure (`thought.rs` & `thought.ts`)
The Web of Thought planning catalog is stored in an ordinary Lorebook Markdown document (`Lorebooks/Web_of_Thought_*.md`) under the JSON frontmatter key `_web_of_thought`:
- **Rust Backend (`src-tauri/src/thought.rs`)**:
  - `Plan` (lines 98–108): Contains `version: u32`, `revision: u64`, `universes: Vec<Universe>`, `books: Vec<Book>`, `branches: Vec<Branch>`, `entities: Vec<Entity>`, `nodes: Vec<Node>`, and `relationships: Vec<Relationship>`.
  - `Change` (line 66): `record!(Change { id: String, entity_id: String, property_key: String, previous_value: Option<String>, new_value: Option<String>, note: String });`.
  - `RelationshipChange` (line 67): `record!(RelationshipChange { relationship_id: String, label: Option<String>, note: String });`.
  - `Node` (lines 71–91): Represents a story milestone. Contains `id`, `universe_id`, `book_id`, `branch_id`, `position: i32`, `title`, `description`, `era`, `status`, `questions`, `entity_ids: Vec<String>`, `changes: Vec<Change>`, `relationship_changes: Vec<RelationshipChange>`, `linked_event_id`, and `origin_node_id`.
  - `Relationship` (lines 93–94): `record!(Relationship { id: String, universe_id: String, book_id: Option<String>, source_id: String, target_id: String, label: String, description: String, directed: bool, context_node_id: Option<String>, archived: bool });`.
  - `serde(deny_unknown_fields)` is strictly enforced on all record types.
- **TypeScript Frontend (`src/utils/thought.ts`)**:
  - Mirrors Rust structures identically (lines 2–28).
  - `timeline(p, u, b, branchId)` (lines 52–53): Extracts chronological milestone nodes filtered by universe, book, and branch, sorted by `position`.
  - `worldAt(p, id)` (lines 153–164): Evaluates property state at a node by walking forward through `timeline`.
  - `relationshipAt(p, r, nodeId)` (lines 171–181): Computes relationship evidence at a node.

### 2.2 Phase W1–W4 Universe State Engine (`src/utils/stateEngine.ts`)
- `validateMilestoneAncestry(plan, targetMilestoneId)` (lines 169–328): Deterministically resolves the cycle-free predecessor chain leading to a milestone. Handles canonical timelines and alternate branches by recursing through branch divergence nodes (`branch.divergence_node_id`). Enforces strict Universe and Book isolation.
- `resolveUniverseStateAtMilestone(plan, docs, universeId, milestoneId, options)` (lines 388–499): Iterates through the predecessor lineage in chronological order. Applies `milestone.changes` matching `options.propertyKey` (defaulting to `'status'`). Determines state origin (`explicit`, `inherited`, `unknown`, `not_yet_introduced`, or `unassigned`).
- `assignMilestoneState(plan, milestoneId, entityId, propertyKey, newValue, note, ...)` (lines 517–628): Immutably appends or updates a `Change` record on the target milestone. Auto-registers the entity in `plan.entities` if valid, and verifies Universe and House boundaries.
- `resolveChapterHistoricalContext(plan, universeId, chapterDoc, book)` (lines 833–912): Resolves milestone metadata for chapter documents via `metadata.milestone_id`.
- `resolveEntityHistoricalEchoState(plan, docs, universeId, milestoneId, entityId)` (lines 950–960): Memoized query used by Echo to fetch historical status for an entity.

### 2.3 Existing Canonical Relationships (`src/utils/relationships.ts`)
- `relationshipMeaning(label)` (lines 17–23): Semantic classification into categories (`membership`, `leadership`, `control`, `alliance`, `rivalry`, `residence`, `ownership`, `creation`, `site`, `participation`).
- `relationshipPerspective(r, id)` (lines 24–28): Resolves directional perspective (e.g. "Leads" vs "Led by").
- `relationshipIdentity(r)` (lines 29–35): Computes semantic uniqueness key `[universe_id, book_id, context_node_id, kind, direction, from, to]`.

### 2.4 Existing Echo Lore Integration (`src/utils/echoLore.ts`)
- `convertDocumentToEchoEntity(doc, allDocs, plan, universeName, entityContent)` (lines 70–277):
  - Line 93: Extracts `characterProfile` strictly from `meta.character_fields` (static baseline).
  - Line 112: Populates `guidedAttributes` strictly from frontmatter (static baseline).
  - Line 187: Derives `heldOffices` strictly from active Faction positions in `allDocs` (static baseline).
  - Line 233: Populates `relationships` from `plan.relationships` where `!r.archived`, **without any milestone resolution or `relationshipAt` evaluation**!
- `EchoDocumentationPopup.tsx` (lines 305–375):
  - Renders a historical context header card displaying `milestoneTitle`, `milestoneEra`, and `renderHistoricalStatusBadge`.
  - Explicit disclaimer (line 399): `Historical badge: chapter context. Prose and relationships: canonical Lorebook information.`

---

## 3. Source File Evidence Matrix

| Architectural Capability | Concrete Source File | Relevant Code Location | Current State | Living States Gap |
| :--- | :--- | :--- | :--- | :--- |
| **Planning Catalog Rust Schema** | [`src-tauri/src/thought.rs`](../src-tauri/src/thought.rs) | Lines 66–109 | `Change` has `property_key`, `previous_value`, `new_value`, `note`. Enforces `deny_unknown_fields`. | Generic enough for any attribute; currently restricted in UI to status. |
| **Milestone Ancestry & Lineage** | [`src/utils/stateEngine.ts`](../src/utils/stateEngine.ts) | Lines 169–328 | Pure ancestor traversal supporting canonical and branch continuities. | Solid. Fully reusable for resolving arbitrary entity attributes. |
| **State Resolution Engine** | [`src/utils/stateEngine.ts`](../src/utils/stateEngine.ts) | Lines 388–499 | Resolves single `propertyKey` (default `'status'`). Returns `ResolvedEntityState[]`. | Must be expanded to multi-property resolution (`resolveEntityLivingState`). |
| **Historical Relationship Evaluation** | [`src/utils/thought.ts`](../src/utils/thought.ts) | Lines 171–181 | `relationshipAt(p, r, nodeId)` evaluates linear canonical timeline. | Fails on alternate branches; does not handle severance/termination; unused by Echo. |
| **Echo Entity Dossier Construction** | [`src/utils/echoLore.ts`](../src/utils/echoLore.ts) | Lines 70–277 | Builds `EchoEntity` from static frontmatter and un-evaluated `plan.relationships`. | Does not accept `milestoneId`; cannot produce historically resolved dossiers. |
| **Echo Dossier UI Presentation** | [`EchoDocumentationPopup.tsx`](../src/components/echo/EchoDocumentationPopup.tsx) | Lines 305–375 | Renders W4 badge. Displays static fields for Overview, Attributes, Relationships. | Displays disclaimer; lacks attribute overrides, previous value diffs, and historical links. |
| **State Explorer Desk UI** | [`UniverseStateExplorer.tsx`](../src/components/studios/lorebook/UniverseStateExplorer.tsx) | Line 1060 | Passes hardcoded `'status'` to `assignMilestoneState`. | Authors cannot author role, affiliation, or custom attribute changes at milestones. |
| **Character Profile Authoring** | [`CharacterProfileFields.tsx`](../src/components/studios/lorebook/CharacterProfileFields.tsx) | Lines 89–98 | Edits `metadata.character_fields` directly. | No historical state selector; no indication of timeline divergence. |
| **Save Coordination** | [`src/services/autosave.ts`](../src/services/autosave.ts) | Lines 1–95 | `SaveCoordinator`, `MutationQueue`, `flushChildEditors`. | Flushes chapter editors and metadata writes sequentially. |
| **Portable Package Remapping** | [`src-tauri/src/portable/import_plan.rs`](../src-tauri/src/portable/import_plan.rs) | Lines 202–250 | `remap_plan` remaps `entity_id`, `relationship_id`, `source_id`, `target_id`. | Remapping already covers `Change` and `RelationshipChange`. |
| **Portable Package Validation** | [`src-tauri/src/portable/validate.rs`](../src-tauri/src/portable/validate.rs) | Lines 310–325 | Invokes `crate::thought::validate(plan)`. Rejects unknown fields. | Enforces strict schema conformity; zero schema breakages tolerated. |

---

## 4. Evaluation of State Storage Architectures

We evaluated three potential storage architectures against 12 architectural criteria:

```
+-------------------------------------------------------------------------------------------------------------------+
| APPROACH A: Entity Markdown Snapshots                                                                             |
|                                                                                                                   |
|   Lorebooks/Characters/Kael.md                                                                                    |
|   +-----------------------------------------------------------------------------------------------------------+   |
|   | metadata:                                                                                                 |   |
|   |   character_fields: { role: "King", ... }                                                                 |   |
|   |   historical_states:                                                                                      |   |
|   |     - { milestone_id: "m-100", role: "Knight", affiliation: "Northern Guard" }                                 |   |
|   |     - { milestone_id: "m-120", role: "Exile", affiliation: null }                                            |   |
|   +-----------------------------------------------------------------------------------------------------------+   |
+-------------------------------------------------------------------------------------------------------------------+

+-------------------------------------------------------------------------------------------------------------------+
| APPROACH B: Pure Timeline Event Deltas (in Web of Thought Plan)                                                    |
|                                                                                                                   |
|   Lorebooks/Web_of_Thought_*.md                                                                                   |
|   +-----------------------------------------------------------------------------------------------------------+   |
|   | metadata._web_of_thought:                                                                                 |   |
|   |   nodes:                                                                                                  |   |
|   |     - id: "m-100", changes: [ { entity_id: "kael", property_key: "role", new_value: "Knight" } ]          |   |
|   |     - id: "m-120", changes: [ { entity_id: "kael", property_key: "role", new_value: "Exile" } ]           |   |
|   +-----------------------------------------------------------------------------------------------------------+   |
+-------------------------------------------------------------------------------------------------------------------+

+-------------------------------------------------------------------------------------------------------------------+
| APPROACH C: Hybrid State Architecture (RECOMMENDED)                                                               |
|                                                                                                                   |
|   Lorebooks/Characters/Kael.md                     Lorebooks/Web_of_Thought_*.md                                  |
|   +-------------------------------------------+    +----------------------------------------------------------+   |
|   | Stable Canonical Identity: "entity-kael"  |    | Timeline Milestones & Lineage                            |   |
|   | Baseline Profile Attributes (Genesis)     |    | Sparse Attribute Overrides (StoryNode.changes)           |   |
|   | Echo Persistent References (E3)           |    | Evolving Relationships (RelationshipChange)              |   |
|   | Clean Prose (Invariant)                   |    | Predecessor Resolution Engine                            |   |
|   +-------------------------------------------+    +----------------------------------------------------------+   |
+-------------------------------------------------------------------------------------------------------------------+
```

### Detailed Architecture Comparison

| Evaluation Criterion | Approach A: Entity Metadata Snapshots | Approach B: Timeline Event Deltas | Approach C: Hybrid State Model (Recommended) |
| :--- | :--- | :--- | :--- |
| **1. Canonical Authority** | Distributed across hundreds of entity files. No single timeline authority. | Centralized in `_web_of_thought.md`. Entity files have no historical awareness. | **Clean Separation**: Entity file owns baseline identity; planning catalog owns timeline progression. |
| **2. Save Atomicity** | **Fatal Flaw**: Updating 1 milestone with 10 entity changes requires writing 10 Markdown files simultaneously without transactional filesystem rollback. | Atomic: 1 milestone update writes 1 planning document via `SaveCoordinator`. | **Fully Atomic**: All timeline changes save in `_web_of_thought.md` with revision guard and zero multi-file partial writes. |
| **3. Relationship Consistency** | **Fatal Flaw**: Relationships connect 2 entities. Storing changes in entity docs causes desync between source and target files. | Relationships live in `Plan`, but entity attributes live disconnected. | **Consistent**: `RelationshipChange` lives on the same `StoryNode` as entity attribute changes. |
| **4. Import/Export Portability** | Requires packaging changes in every entity doc. High risk of orphaned milestone IDs upon separate-copy import. | Supported, but requires parsing massive planning trees for basic entity queries. | **100% Compatible**: Portable Universe v1 already remaps both entity docs and `Plan` records. |
| **5. Vault Recovery** | Snapshot corruption in one entity file leaves other entity timelines inconsistent. | Single point of failure for planning; if catalog is lost, all historical states vanish. | **Resilient**: Baseline entity profiles remain intact in Markdown even if planning catalog is repaired or rebuilt. |
| **6. Timeline Reordering** | **Extremely Fragile**: Reordering or archiving a milestone requires mutating every entity file in the universe. | **Trivial**: Milestones reorder via `moveNode`; predecessor engine dynamically computes lineage. | **Trivial**: Lineage is computed on the fly by `validateMilestoneAncestry`; zero entity files touched. |
| **7. Undo / Redo** | Cannot coordinate CodeMirror undo history across multiple document files. | Fully coordinated within Web of Thought desk via `plan` revision rollback. | **Fully Coordinated**: Milestone edits participate in `SaveCoordinator` and `MutationQueue`. |
| **8. Performance** | Resolving a milestone requires opening, parsing frontmatter, and reading every entity file in the universe. | Parsing massive `Plan` (>4MB) on every cursor move can introduce UI lag. | **Optimized**: Memoized cache keyed by `(universeId, milestoneId, plan.revision)`. Zero file I/O on query. |
| **9. Data Migration Requirements** | Heavy migration: requires rewriting frontmatter across all existing Lorebook documents. | Zero migration: reuses existing `Change` and `RelationshipChange` structs. | **Zero Migration**: Fully backward-compatible with existing schema and frontmatter. |
| **10. Conflict Handling** | High conflict rate: concurrent edits to entity profile overwrite historical snapshots. | Optimistic concurrency: `revision` guard detects mid-air collisions. | **Guarded**: Baseline edits and timeline edits operate on distinct files, eliminating write locks. |
| **11. Backward Compatibility** | Breaks older app versions that do not expect `historical_states` arrays in entity metadata. | Full compatibility with `thought.rs` parser (`serde(deny_unknown_fields)`). | **Guaranteed**: Existing v0.8.0-beta.4 clients can read and parse all files without errors. |
| **12. House/Universe Isolation** | Hard to enforce: snapshots might reference entities or milestones from other Houses. | Enforced by existing `thought.rs` validation and `stateEngine.ts` scope checks. | **Strictly Enforced**: Invariant L4 and L8 prevent cross-House and cross-Universe leakage. |

### Architectural Recommendation: Approach C (Hybrid Model)
**Recommendation**: We recommend **Approach C (Hybrid State Architecture)**.  
It preserves the **Markdown Prose Purity Invariant** and **Single Owning House Invariant**, avoids multi-file write corruption, requires **zero SQLite schema migrations**, and leverages the already-proven Phase W1–W4 ancestor resolution engine while keeping Lorebook entity files lightweight and human-readable.

---

## 5. Recommended Canonical Data Model

### 5.1 Identity Principles
1. **Stable Canonical UUID**: An entity has exactly **one** UUID (e.g. `entity-kael`) stored in `doc.id`. Historical states NEVER receive synthetic UUIDs.
2. **Baseline Profile (Genesis State)**: The attributes stored in `doc.metadata.character_fields` (or `location_fields`, `faction_fields`, etc.) represent the entity's **canonical baseline profile**. By author convention, this represents the entity at their introduction or canonical baseline.
3. **Sparse Milestone Deltas**: A historical state is defined as an explicit set of property overrides (`Change`) and relationship adjustments (`RelationshipChange`) attached to a specific `StoryNode` in the shared `Plan`.
4. **Attribute Non-Destructiveness**: Authoring an override at a milestone never alters the entity's baseline Markdown document.

### 5.2 Property Key Contract
To support evolving attributes beyond `'status'`, `Change.property_key` adopts a standardized dot-delimited path format:

```typescript
// Property Key Namespace Specification:
export type LivingPropertyKey =
  // Standard Status (Phase W1)
  | 'status'
  // Character Guided Attributes (Phase C1)
  | 'character.role'
  | 'character.occupation'
  | 'character.affiliation'
  | 'character.residence'
  | 'character.narrative_role'
  | 'character.clothing_attire'
  | 'character.physical_appearance'
  | 'character.personality'
  | 'character.vital_status'
  | 'character.age'
  // Location Guided Attributes
  | 'location.region'
  | 'location.location_type'
  | 'location.inhabitants'
  | 'location.factions'
  // Faction Guided Attributes (Phase C2)
  | 'faction.faction_type'
  | 'faction.leadership'
  | 'faction.headquarters'
  | 'faction.territory'
  // Custom Attributes (meta.attributes)
  | `attribute.${string}`; // e.g. "attribute.weapon", "attribute.title"
```

### 5.3 Rust Data Compatibility
Because `src-tauri/src/thought.rs` defines `Change` as:
```rust
record!(Change { 
    id: String, 
    entity_id: String, 
    property_key: String, 
    previous_value: Option<String>, 
    new_value: Option<String>, 
    note: String 
});
```
`property_key: String` is **already generic**! It can store `"character.role"`, `"character.occupation"`, or `"attribute.weapon"` without modifying a single line of Rust struct definitions or violating `#[serde(deny_unknown_fields)]`.

### 5.4 Value Clearing Contract
To distinguish between an inherited value and an explicitly deleted/cleared value:
- `new_value === null`: The property is **explicitly cleared / revoked** at this milestone (e.g. Kael is stripped of his title; his `role` becomes `null`).
- `new_value === undefined` or no `Change` record: The property **inherits** from earlier predecessor milestones.
- `new_value === "not_introduced"`: The entity does not yet exist or participate in the story world.

---

## 6. Historical State Resolution Algorithm

### 6.1 Formal Resolution Specification

```
                                      resolveEntityLivingState(universeId, entityId, milestoneId)
                                                                  |
                                                                  v
                                              +---------------------------------------+
                                              | Validate milestone exists & in-scope  |
                                              | via validateMilestoneAncestry(plan)   |
                                              +-------------------+-------------------+
                                                                  |
                                                                  v
                                              +---------------------------------------+
                                              | Retrieve Chronological Predecessor    |
                                              | Lineage: [Node_1, Node_2, ..., Target]|
                                              +-------------------+-------------------+
                                                                  |
                                                                  v
                                              +---------------------------------------+
                                              | Initialize State Accumulator with     |
                                              | Entity Baseline Profile from doc      |
                                              +-------------------+-------------------+
                                                                  |
                                                                  v
                                     +---------------------------------------------------------+
                                     | For each milestone Node_i in Lineage:                   |
                                     |   For each Change c matching entityId in Node_i:        |
                                     |     - If c.new_value is null: Mark CLEARED              |
                                     |     - Else: OVERRIDE accumulator value                  |
                                     |     - Set provenance: (sourceMilestoneId, era, branch)  |
                                     +----------------------------+----------------------------+
                                                                  |
                                                                  v
                                              +---------------------------------------+
                                              | Resolve Active Relationships at       |
                                              | milestone using relationshipLineage   |
                                              +-------------------+-------------------+
                                                                  |
                                                                  v
                                              +---------------------------------------+
                                              | Return Fully Resolved Living State    |
                                              | (Dossier-Ready Data Structure)        |
                                              +---------------------------------------+
```

### 6.2 Deterministic Resolver Implementation Contract

```typescript
export interface ResolvedAttributeValue {
  key: string;
  value: string | null;
  displayLabel: string;
  origin: 'baseline' | 'explicit' | 'inherited' | 'cleared';
  sourceMilestoneId?: string;
  sourceMilestoneTitle?: string;
  sourceMilestoneEra?: string;
  sourceBranchId?: string | null;
  sourceContinuityName?: string;
  hasChangedAtThisMilestone: boolean;
  note?: string;
  previousValue?: string | null;
}

export interface ResolvedLivingEntityState {
  entityId: string;
  canonicalTitle: string;
  category: LoreCategory;
  universeId: string;
  milestoneId: string;
  milestoneTitle: string;
  milestoneEra?: string;
  continuityName: string;
  branchId: string | null;
  
  // Evolving Attributes Map
  attributes: Map<string, ResolvedAttributeValue>;
  
  // Resolved Guided Profile
  resolvedProfile: {
    role?: string;
    occupation?: string;
    affiliation?: string;
    residence?: string;
    vitalStatus?: string;
    [key: string]: string | undefined;
  };
  
  // Resolved Historical Relationships
  activeRelationships: EchoRelationship[];
  
  // Integrity & Warnings
  isIntroduced: boolean;
  warnings: string[];
}
```

### 6.3 Edge-Case Handling Table

| Scenario | Resolution Behavior | Guarantee |
| :--- | :--- | :--- |
| **Missing or Archived Milestone** | Falls back to baseline profile; returns `isValid: false` with warning flag. | Never crashes; no missing data rendered. |
| **Multiple Branch Divergence** | Predecessors traverse divergence milestone into parent branch or canonical timeline. | Pre-divergence history is preserved; post-divergence sibling branches are isolated. |
| **Timeline Reordering** | Lineage is re-derived dynamically via `validateMilestoneAncestry`. | Automatic re-evaluation; no stale snapshot caches survive revision bump. |
| **Same-Date / Identical Era Milestones** | Tie-breaking uses integral `position` rank followed by lexicographical `id`. | Fully deterministic resolution across restarts and platforms. |
| **Entity Not Yet Introduced** | `c.new_value === 'not_introduced'` or milestone precedes introduction. | `isIntroduced = false`; Echo renders "Not Yet Introduced" badge. |
| **Conflicting Previous Value** | If author specified `previous_value` and resolved predecessor differs, record warning. | Non-blocking warning surfaced in UI without breaking resolution. |

---

## 7. Relationship Evolution Model

### 7.1 The Dilemma of Time-Bounded Relationships
In MetaCognition Notebook, relationships exist in `plan.relationships` with:
- `source_id: string`
- `target_id: string`
- `label: string`
- `context_node_id: string | null` (starting milestone, or null for timeless baseline)
- `archived: boolean`

Currently, `StoryNode.relationship_changes` holds:
```typescript
export interface RelationshipChange {
  relationship_id: string;
  label: string | null; // null represents explicitly unknown or severed
  note: string;
}
```

### 7.2 Relationship Evolution Lifecycle
To model changing allegiances (e.g. Kael serves the Crown in Year 100, is hunted by the Crown in Year 120, and rules the Crown in Year 150):

```
Year 100 (Milestone 1)                  Year 120 (Milestone 2)                  Year 150 (Milestone 3)
+-----------------------+               +-----------------------+               +-----------------------+
| Relationship r-1:     |               | RelationshipChange:   |               | RelationshipChange:   |
| Kael -> Crown         |   Lineage     | r-1.label =           |   Lineage     | r-1.label =           |
| label: "serves"       | ------------> | "enemy of"            | ------------> | "rules"               |
| context: Node_1       |               | note: "Exiled"        |               | note: "Coronation"    |
+-----------------------+               +-----------------------+               +-----------------------+
        |                                       |                                       |
        v                                       v                                       v
Echo Dossier in Year 100:               Echo Dossier in Year 120:               Echo Dossier in Year 150:
"Serves: The Crown"                     "Enemy of: The Crown"                   "Rules: The Crown"
```

### 7.3 Severance & Termination Contract
When a relationship ceases entirely (e.g. alliance dissolved, marriage terminated):
1. In `RelationshipChange`, setting `label: "[terminated]"` or introducing an explicit marker `label: null` indicates **termination**.
2. **Deterministic Resolver Rule**:
   - If a relationship has `context_node_id`, it is **inactive** for milestones chronologically preceding `context_node_id`.
   - Starting at `context_node_id`, it adopts the base `label`.
   - Walking forward through the milestone lineage, each `RelationshipChange` mutates the label.
   - If a `RelationshipChange` sets `label: null` (or `[terminated]`), the relationship is **omitted** from the active relationship list for that milestone and subsequent predecessors unless re-established by a later milestone change.

### 7.4 Reciprocal Link & Perspective Integrity
- In `src/utils/relationships.ts`, `relationshipPerspective(r, entityId)` resolves directional and symmetric labels (e.g., `Leads` vs `Led by`).
- When resolving relationships for Kael at Milestone 2:
  - Base: `Kael -> Crown` (`enemy of`).
  - From Kael's perspective: `Enemy of: The Crown`.
  - From Crown's perspective: `Rival / Enemy: Kael`.
- Reciprocal consistency is mathematically guaranteed because both perspectives resolve from the **exact same canonical `Relationship` and `RelationshipChange` records** on the lineage.

---

## 8. Echo E3 Integration & Historical Inspection

### 8.1 The Invariant: Persistent Binding to Canonical Identity
Echo E3 persistent pronoun binding stores bindings in document frontmatter:
```json
{
  "id": "ref-101",
  "targetId": "entity-kael",
  "from": 25,
  "to": 27,
  "matchedText": "He",
  "anchor": { "before": "entered the temple. ", "after": " knew the Abyssals" },
  "status": "active"
}
```
**Mandatory E3 Invariant**:  
`targetId` must **always** point to `entity-kael` (the canonical entity UUID).  
It must **never** store a synthetic historical UUID (e.g. `entity-kael-year-120`).

### 8.2 Runtime Historical Context Injection
When an author clicks or inspects `"He"` in CodeMirror 6:
1. `echoExtension.ts` identifies the bound reference with `targetId: "entity-kael"`.
2. The active chapter document has frontmatter `metadata.milestone_id: "node-year-120"`.
3. Echo resolves the chapter historical context via `resolveChapterHistoricalContext(plan, universeId, chapterDoc, book)`.
4. Instead of constructing a static `EchoEntity`, Echo invokes:
   `resolveEntityLivingState(universeId, "entity-kael", "node-year-120")`.
5. The resulting `EchoEntity` dossier reflects:
   - **Role**: `Exile` (inherited/explicit override).
   - **Affiliation**: `None` (cleared value).
   - **Vital Status**: `Alive` (badge).
   - **Relationships**: `Enemy of: The Crown` (historical relationship).
   - **Prose**: Canonical description with historical contextual banner.

```
+-------------------------------------------------------------------------------+
| ECHO LORE EXPLORATION — KAEL                                            [X]   |
| Character · Eryndor Realm                                                     |
+-------------------------------------------------------------------------------+
| [Clock] Historical Context: Year 120, Era of Ash (Canonical Timeline)         |
| Milestone: The Great Exile · State: Alive (Explicit)                         |
+-------------------------------------------------------------------------------+
| OVERVIEW | ATTRIBUTES | RELATIONSHIPS | APPEARANCE | NOTES                    |
+-------------------------------------------------------------------------------+
| Role:            Exile (Overridden at Year 120) [reverts baseline: King]      |
| Occupation:      Wanderer                                                     |
| Affiliation:     None (Stripped at Year 120)                                  |
| Residence:       The Ashen Wastes                                             |
+-------------------------------------------------------------------------------+
| Relationships at Year 120:                                                    |
| - Enemy of: The Crown (Changed from 'Serves' at Year 100)                     |
| - Allied with: Theron (Established at Year 115)                               |
+-------------------------------------------------------------------------------+
```

### 8.3 Nested Exploration Continuity
When an author clicks `"Theron"` inside Kael's dossier to open nested exploration:
- Echo carries the **exact same chapter historical context** (`milestoneId = "node-year-120"`) into Theron's dossier!
- Theron's dossier resolves at Year 120, displaying his Year 120 state and his reciprocal alliance with Kael.
- When navigating back via Echo breadcrumbs, the context remains consistent and stable.

---

## 9. Author-Facing UX Proposal

### 9.1 Guiding Principles
1. **Zero Timeline Overhead for Casual Writers**: Writers who don't use Web of Thought never see timeline warnings or mandatory milestone selectors.
2. **Writer-Centric Language**: Use "Story Timeline", "Milestone Overrides", and "State at this Point in History" instead of technical database terms.
3. **Clear Visual Provenance**: Clearly distinguish baseline values, inherited values, explicit overrides, and cleared fields.

### 9.2 UI Surfaces

#### A. Historical States Drawer in Lorebook Studio (`CharacterProfileFields.tsx`)
In the entity profile editor, add a compact, collapsible header card:
```
+-------------------------------------------------------------------------------+
| [Sparkles] Historical States & Timeline Overview                     [Manage] |
| 3 Milestones Recorded: Year 100 (Knight) -> Year 120 (Exile) -> Year 150 (King)|
| Currently editing: [ Canonical Baseline Profile v ]                           |
+-------------------------------------------------------------------------------+
```
- Clicking the dropdown allows previewing the entity's state at any historical milestone.
- An "Add Milestone Override" button allows quickly recording an override for a milestone without leaving the Lorebook editor.

#### B. Living Attributes Tab in State Explorer (`UniverseStateExplorer.tsx`)
In `UniverseStateExplorer.tsx`, replace the single status picker with an **Entity Living State Editor**:
- When selecting an entity at a milestone, display all guided attributes for their category.
- Each attribute row shows:
  - Current resolved value.
  - Provenance badge (`Baseline`, `Inherited from Year 100`, `Explicitly Changed Here`).
  - Quick actions: `Override Here`, `Clear / Strip Value`, `Revert to Predecessor`.

#### C. Milestone Comparison Modal
Leverage the existing `compareMilestoneStates` diff engine:
- Side-by-side comparison between any two milestones (e.g. Year 100 vs Year 150).
- Highlights value changes in gold, newly introduced relationships in green, and severed relationships in red.

---

## 10. Portability and Recovery Assessment

### 10.1 Portable Universe v1 Compatibility
Portable Universe v1 packages (`.mcuniverse`) are structured zip archives containing:
- `package.json`: Manifest with SHA-256 fingerprints.
- `Lorebooks/`: Canonical entity Markdown documents.
- `Planning/Web_of_Thought.json`: The exported `Plan`.
- `library.json`: Scoped House registry.

#### Safety Verification
1. **Zero Schema Alterations**:
   Because `Change` in `src-tauri/src/thought.rs` already accepts any `property_key: String`, exporting or importing living entity states requires **no changes to the zip schema or Rust struct definitions**.
2. **UUID Remapping on Separate Copy**:
   In `src-tauri/src/portable/import_plan.rs` (lines 217–228):
   ```rust
   changes: n.changes.iter().map(|c| crate::thought::Change {
       id: get_id(&c.id),
       entity_id: get_id(&c.entity_id),
       property_key: c.property_key.clone(),
       previous_value: c.previous_value.clone(),
       new_value: c.new_value.clone(),
       note: c.note.clone(),
   }).collect()
   ```
   Notice that `entity_id` is **already remapped** to the new UUID via `get_id(&c.entity_id)`! When an author imports a universe with Separate Copy, all living entity state changes are seamlessly rebound to the newly generated entity UUIDs!
3. **Preserve Identities**:
   Imports with Preserve Identities retain canonical UUIDs exactly, preserving all living state linkages without touch.
4. **Foreign Entity Protection**:
   If an entity was deleted before export, `import_plan.rs` records it in `unresolved_references` without crashing.

### 10.2 Vault Backup & Recovery
- Vault snapshots capture the entire workspace filesystem (`Lorebooks/` and `library.json`).
- Because living states reside in `_web_of_thought.md` and baseline profiles reside in `Lorebooks/Characters/*.md`, standard Vault snapshot and rollback completely restores living entity states with zero external dependencies.

---

## 11. Security and Data-Loss Risk Analysis

| Risk ID | Description | Severity | Likelihood | Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **R1** | **Accidental Baseline Profile Overwrite**: An author edits an entity in historical mode expecting to override Year 120, but accidentally mutates the permanent baseline file. | **High** | Medium | Strict UI separation: Historical inspection mode must be explicitly read-only with a distinct gold banner; mutations must route through `assignMilestoneState` to `Plan`, never touching the underlying Markdown document. |
| **R2** | **Cyclic Branch Lineage Loop**: Complex alternate branches diverging and merging could induce infinite recursion during predecessor resolution. | **High** | Low | Recursion guards with `visitedMilestones` and `visitedBranches` `Set<string>` in `validateMilestoneAncestry` already abort and flag cycle errors. |
| **R3** | **Planning File Size Bloat**: Recording hundreds of full-text overrides could cause `_web_of_thought.md` to exceed the 8 MiB limit (`thought.rs` line 126). | **Medium** | Low | Enforce sparse deltas: store only string differences and short notes, never duplicating entire document bodies or prose sections. |
| **R4** | **Cross-House Entity Leakage**: Assigning a living state override to an entity owned by a different House in the same workspace. | **High** | Low | `assignMilestoneState` verifies `doc.house_id === universeHouseId` and rejects foreign-House entities at the API boundary. |
| **R5** | **Dangling Milestones on Chapter Relinking**: A chapter changes its milestone association to an invalid or deleted milestone. | **Medium** | Medium | `resolveChapterHistoricalContext` validates milestone existence; if missing, flags `isValid: false` and cleanly falls back to baseline profile. |

---

## 12. Phased Implementation Plan

```
+--------------------------------------------------------------------------------------------------+
| PHASE 1: CORE DATA & RESOLUTION ENGINE                                                           |
| - Generalize stateEngine.ts to support multi-property living states (resolveEntityLivingState). |
| - Expand predecessor lineage to evaluate relationship evolution (relationshipAt alternate branch)|
| - Add comprehensive unit test suite covering attribute inheritance, overrides, and clearing.   |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
| PHASE 2: ECHO LORE & DOSSIER INTEGRATION                                                         |
| - Update convertDocumentToEchoEntity to accept optional milestoneId / resolvedLivingState.      |
| - Enhance EchoDocumentationPopup.tsx to display evolving attributes & historical relationships.  |
| - Ensure nested exploration preserves chapter historical context across navigation stacks.       |
| - Verify Echo E3 persistent reference binding remains stable and unchanged.                      |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
| PHASE 3: AUTHORING UI IN WEB OF THOUGHT & LOREBOOK                                               |
| - Expand UniverseStateExplorer.tsx to author living character/faction attributes at milestones.  |
| - Add compact Historical States section to LorebookStudio.tsx and CharacterProfileFields.tsx.    |
| - Wire SaveCoordinator and MutationQueue to serialize state mutation flushes.                   |
+-------------------------------------------------+------------------------------------------------+
                                                  |
                                                  v
+--------------------------------------------------------------------------------------------------+
| PHASE 4: PORTABILITY, VAULT & RELEASE CANDIDATE ACCEPTANCE                                       |
| - Verify Portable Universe v1 export/import round trips (Preserve Identities & Separate Copy).   |
| - Execute full test regression suites (TypeScript + Rust).                                       |
| - Validate zero SQLite schema migrations and prose purity invariants.                            |
+--------------------------------------------------------------------------------------------------+
```

---

## 13. Acceptance Test Matrix

| Test ID | Category | Scenario / Invariant | Expected Behavior |
| :--- | :--- | :--- | :--- |
| **TC-01** | **Identity** | Single entity UUID across 3 milestones. | Kael retains UUID `entity-kael` across Year 100, 120, and 150; zero duplicate entity files created. |
| **TC-02** | **Inheritance** | Milestone without overrides. | Kael in Year 110 inherits Year 100 role (`Knight`) with origin `inherited`. |
| **TC-03** | **Override** | Explicit override at milestone. | Year 120 overrides role to `Exile`; Year 100 remains `Knight`; baseline remains untouched. |
| **TC-04** | **Clearing** | Explicit clearing of an attribute (`null`). | Year 120 clears `affiliation`; resolved state returns `null` with origin `cleared`. |
| **TC-05** | **Reordering** | Timeline milestones reordered with `moveNode`. | Ancestry re-computes dynamically; historical states reflect new chronological lineage. |
| **TC-06** | **Branches** | Alternate branch divergence. | Divergence milestone state inherited into branch; branch changes do not leak into canonical timeline. |
| **TC-07** | **Same Date** | Two milestones sharing the same era string. | Deterministic tie-breaking using integral `position` rank and UUID sort. |
| **TC-08** | **Relationships**| Evolving relationship over time. | Kael serves Crown at Year 100, is enemy of Crown at Year 120, rules Crown at Year 150. |
| **TC-09** | **Reciprocal** | Reciprocal perspective integrity. | When Kael is enemy of Crown, inspecting Crown lists Kael as enemy. |
| **TC-10** | **Echo E3** | Persistent pronoun binding inspection. | Inspecting bound `"He"` in Year 120 chapter displays Kael as Exile; Year 150 displays King. |
| **TC-11** | **Nested Lore** | Nested navigation in Echo. | Clicking Theron from Kael's Year 120 dossier opens Theron's Year 120 state. |
| **TC-12** | **Chapter Change**| Chapter relinked to different milestone. | Echo dossier immediately updates to reflect newly assigned milestone context. |
| **TC-13** | **House Isolation**| Cross-House entity assignment attempt. | `assignMilestoneState` throws error and rejects assignment. |
| **TC-14** | **Portability** | Separate Copy `.mcuniverse` import. | `targetId` and `entity_id` in changes and relationships remapped cleanly to new UUIDs. |
| **TC-15** | **Legacy Univ** | Universe without milestones. | Entity displays baseline profile with zero warnings or errors. |
| **TC-16** | **Save Safety** | Rapid editing and studio switching. | `SaveCoordinator` serializes writes; no partial writes or lost updates. |

---

## 14. Decisions Requiring Author Approval

Before proceeding with Phase 1 implementation, author alignment is requested on two UX/product decisions:

1. **Baseline Definition Convention**:
   - *Option A (Recommended)*: The entity document's baseline profile represents the **Genesis / Beginning of Story** state. Overrides record forward progress.
   - *Option B*: The entity document represents the **Present Day / End of Story** state. Overrides record historical back-stories.
   - *Recommendation*: **Option A**, as it aligns naturally with forward milestone progression.

2. **Relationship Severance Syntax**:
   - *Option A (Recommended)*: Setting a milestone relationship change to `label: null` (or blank in UI) marks the relationship as **Terminated / Severed** from that point forward.
   - *Option B*: Introduce an explicit `status: 'active' | 'terminated'` field on `RelationshipChange`. (Requires minor Rust struct update with `Option` field).
   - *Recommendation*: **Option A** preserves 100% existing Rust schema compatibility.

---

## 15. Clear GO / NO-GO Verdict

### Final Verdict: **GO**

**Justification**:
1. **Architectural Feasibility**: The underlying primitives (`Change`, `RelationshipChange`, `StoryNode`, `validateMilestoneAncestry`, and `EchoPersistentReference`) are already designed, validated, and functioning in the codebase.
2. **Safety & Non-Invasiveness**: Living Entity States can be implemented entirely through pure resolution functions and frontend UI extensions, with **zero SQLite migrations**, **zero Markdown prose pollution**, and **zero breakage to Portable Universe v1 packages**.
3. **High User Value**: Solves the fundamental worldbuilding contradiction where static dossiers undermine timeline-aware storytelling.

The feature is architecturally sound and ready for phased implementation upon approval.
