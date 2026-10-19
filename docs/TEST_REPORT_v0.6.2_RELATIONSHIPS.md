# MetaCognition Notebook — v0.6.2 Relationship Integrity & Entity-Linked Attributes Report

> Historical implementation record. Original results/recommendations below apply to that pass, not current release acceptance. See the [documentation index](README.md) and [current system design](../SYSTEM_DESIGN.md). Source line labels are historical; file links open current files. The original failure-discard approach below is superseded by retained failed actions and explicit cancellation.

Current synchronization/graph/deletion results and remaining native QA are recorded in [the Graph & Safety report](TEST_REPORT_v0.6.2_GRAPH_SAFETY.md). This earlier implementation record is retained; its verification claims do not replace current acceptance.

**Date:** October 19, 2026  
**Status:** RESOLVED & VERIFIED  
**Commit/Push Rule:** Zero git commits, zero git pushes, zero tags or publishing.

---

## 1. Confirmed Root Cause of "Invalid Relationship"

### The Diagnostic Trail
1. **The Error Reported:**
   When attempting to connect two entities from a lore entity's **Connected Lore Relationships** panel (or from Universe Dashboard's relationship form), the application surfaced:
   `"Organization Not Saved: Invalid relationship"`
2. **The Backend Validation Rule Violated:**
   In [src-tauri/src/thought.rs](../src-tauri/src/thought.rs):
   ```rust
   let entity_scope = |id: &str, u: &str| {
       plan.entities
           .iter()
           .any(|e| e.id == id && e.universe_id == u)
   };
   ...
   for r in &plan.relationships {
       add(&r.id)?;
       if !scope(&r.universe_id, &r.book_id)
           || !entity_scope(&r.source_id, &r.universe_id)
           || !entity_scope(&r.target_id, &r.universe_id)
           || r.label.trim().is_empty()
       {
           return Err("Invalid relationship".into());
       }
   }
   ```
3. **Why `entity_scope` Was Failing:**
   - In Web of Thought, an `Entity` is `{ id: String, universe_id: String }`, where `id` is the document UUID.
   - In the frontend, lore entities are stored as markdown documents in `Lorebooks/`.
   - When a user created a new entity (e.g. Character "Aldric" or Faction "The Ashen Order"), `api.createDocument` created the document file on disk with `universe_id` in frontmatter.
   - **However, `plan.entities` was only populated during initial catalog creation (`initialize()`).** Newly created lorebook documents were **never synchronized into `plan.entities`**.
   - When a user submitted a relationship, `source_id` (the character doc ID) and/or `target_id` (the faction doc ID) were missing from `plan.entities`!
   - `entity_scope(&r.source_id, &r.universe_id)` evaluated to `false`, causing Rust to reject the save with `Err("Invalid relationship")`.
4. **Queue Wedging:**
   Because `MutationQueue.ts` retained failed actions at `actions[0]` so they could be retried via `Ctrl+S`, permanent semantic validation failures remained stuck at index 0. When the user attempted to submit a corrected relationship, `flush()` re-attempted the stuck index 0 action first, permanently blocking all subsequent mutations until discarded.

---

## 2. Architecture & Implementation Fixes

### 2.1 Entity Synchronization & Relationship Validation (`universe.ts`)
- Implemented [`syncAllPlanEntities(plan, docs)`](../src/utils/universe.ts):
  - Traverses all non-catalog lore documents.
  - Automatically registers `{ id: doc.id, universe_id }` in `plan.entities`.
  - Dynamically updates `universe_id` if a document was reassigned to a different universe.
  - Retains existing entity IDs if a document was deleted/archived, preserving referential integrity for historical milestones and timeline records.
- Implemented [`validateAndCreateRelationship(plan, docs, params)`](../src/utils/universe.ts):
  - **Endpoint Existence:** Both source and target must exist in the library.
  - **Self-Connection Prevention:** An entity cannot connect to itself (`sourceId !== targetId`).
  - **Universe Scoping:** Rejects cross-Universe links (`sourceUniverse === targetUniverse === universeId`).
  - **Duplicate Prevention:** Rejects duplicate active relationships with identical endpoints and label.
  - **Entity Pre-Registration:** Ensures both endpoints are registered in `plan.entities` before committing.
- Implemented [`archiveRelationshipInPlan(plan, relId)`](../src/utils/universe.ts) for safe deletion.
- Implemented [`handleEntityDeletionInPlan(plan, deletedDocId)`](../src/utils/universe.ts) to automatically archive connected relationships when an entity document is deleted, while keeping the entity ID in `plan.entities` to preserve backend timeline integrity.

### 2.2 Entity-Linked Character Affiliations (`CharacterAffiliationSelector.tsx`)
- Replaced the free-text `affiliation` input in Character profiles with the dedicated [`CharacterAffiliationSelector`](../src/components/studios/lorebook/CharacterAffiliationSelector.tsx) component.
- **Underlying Storage Contract:**
  - Affiliations are stored canonically as **Relationships** in `plan.relationships` with label `'Member of'` (or `'Affiliated with'`), `source_id = characterId`, `target_id = factionId`, `directed = true`.
  - **Single Source of Truth:** The Character Profile Affiliation section and the Connected Lore Relationships card query and mutate the exact same `plan.relationships` collection. Changes made in one appear in the other immediately.
  - **Dynamic Renaming:** Renaming a Faction/Nation updates display titles across all character profiles automatically without rewriting character markdown files.
  - **Entity Safety:** Removing an affiliation archives only the membership relationship; the Faction document itself is never deleted.
- **Legacy Free-Text Handling:**
  - Existing `character_fields.affiliation` strings are preserved and never silently wiped.
  - Unambiguous single match: Displays legacy text with a 1-click **Convert to Real Link** button.
  - Ambiguous matches: Displays a warning listing all matching factions, requiring explicit user selection.
  - Zero matches: Displays legacy text with options to link an existing faction or click **+ Create Faction "{name}"** (which opens the creation modal with prefilled title).

### 2.3 Queue Wedging Protection (`App.tsx`)
- In `handleThoughtSave`, semantic validation errors from Rust or client invariants (`Invalid relationship`, `Relationship belongs to another timeline`, `Cross-Universe`, etc.) trigger `mutationQueue.current.discard()`.
- The user's input remains in the form with an informative error message.
- Subsequent saves, `Ctrl+S`, or corrected inputs execute immediately without being blocked by stale failed mutations.

### 2.4 Universe Graph Consistency (`UniverseDashboard.tsx`)
- Updated `handleAddRelationship` and `handleDeleteRelationship` to use `validateAndCreateRelationship` and `archiveRelationshipInPlan`.
- Graph and relationship tables distinguish:
  - `universeRelationships.length === 0`: "No relationships established."
  - `filteredRelationships.length === 0`: "No relationships match filter."
- Graph limits (>12 connections) are clearly communicated with full records listed in the table below.

---

## 3. Audit & Classification of Other Guided Fields (Part 4)

We audited all guided attributes across Lorebook Studio entry types:

| Entry Type | Field Name | Recommended Classification | Architecture Rationale |
| :--- | :--- | :--- | :--- |
| **Character** | `role` | Freeform descriptive | Archetype / narrative role description. |
| **Character** | `species` | Freeform / Taxonomy | Often descriptive (e.g. "Synthet", "Moon Elf"). |
| **Character** | `affiliation` | **Entity Link (Implemented)** | Expressed canonically via `Member of` relationship to Faction/Nation entities. |
| **Character** | `goals`, `motivations` | Freeform descriptive | Narrative motivations and plot drives. |
| **Character** | `strengths`, `weaknesses` | Freeform descriptive | Qualitative character traits and flaws. |
| **Location** | `location_type`, `region` | Freeform descriptive | Geographical classification. |
| **Location** | `inhabitants` | Freeform descriptive | Demographics / population groups (rarely individual character pointers). |
| **Location** | `factions` (Ruling / Associated) | **Candidate Entity Link** | Recommended to express via `Rules` or `Located in` relationships in Connected Lore Relationships. |
| **Location** | `notable_events` | Freeform / Timeline | Qualitative historical references or Story Node milestones. |
| **Faction** | `faction_type`, `ideology` | Freeform descriptive | Organizational doctrine. |
| **Faction** | `leadership` | **Candidate Entity Link** | Recommended to express via `Rules` or `Apprentice to` / `Member of` relationships. |
| **Faction** | `territory` | Freeform descriptive | Territorial bounds. |
| **Faction** | `allies`, `rivals` | **Candidate Entity Link** | Already fully supported via `Allied with` / `Rival of` relationships in Connected Lore Relationships. |
| **System / Rule** | All fields | Freeform descriptive | Magic laws, limitations, costs, and consequences. |

**Recommendation:**
Keep narrative, qualitative, and demographic fields as expressive free text. Avoid turning every text box into an entity picker. Use the established `plan.relationships` graph for all structural lore connections.

---

## 4. Modified & Created Files

| File | Status | Description |
| :--- | :--- | :--- |
| [src/utils/universe.ts](../src/utils/universe.ts) | Modified | Added `syncAllPlanEntities`, `validateAndCreateRelationship`, `archiveRelationshipInPlan`, `handleEntityDeletionInPlan`, `getCharacterAffiliations`, and `resolveLegacyAffiliation`. |
| [src/components/studios/lorebook/CharacterAffiliationSelector.tsx](../src/components/studios/lorebook/CharacterAffiliationSelector.tsx) | Created | Entity-linked affiliation selector with dynamic display names, search, removal, contextual faction creation, and legacy free-text conversion. |
| [src/components/studios/lorebook/EntityGuidedFields.tsx](../src/components/studios/lorebook/EntityGuidedFields.tsx) | Modified | Replaced raw affiliation text input with `CharacterAffiliationSelector`. |
| [src/components/studios/lorebook/EntityRelationshipsCard.tsx](../src/components/studios/lorebook/EntityRelationshipsCard.tsx) | Modified | Integrated `validateAndCreateRelationship`, universe candidate filtering, and safe relationship archiving. |
| [src/components/studios/lorebook/UniverseDashboard.tsx](../src/components/studios/lorebook/UniverseDashboard.tsx) | Modified | Enforced `validateAndCreateRelationship`, surfaced `relError`, and distinguished empty vs filtered graph states. |
| [src/components/studios/LorebookStudio.tsx](../src/components/studios/LorebookStudio.tsx) | Modified | Wired `allDocuments`, `universeId`, `onOpenCreateModal` to `EntityGuidedFields` and `EntityRelationshipsCard`. |
| [src/components/common/CreateDocumentModal.tsx](../src/components/common/CreateDocumentModal.tsx) | Modified | Added `initialTitle` prop support to prefill title when creating entities from contextual selectors. |
| [src/App.tsx](../src/App.tsx) | Modified | Added `initialTitle` to `CreateModalOptions`, discarded validation errors from `mutationQueue`, and archived relationships on entity deletion. |
| [package.json](../package.json) | Modified | Added `tests/v062_relationships.test.ts` to `npm test`. |
| [tests/v062_relationships.test.ts](../tests/v062_relationships.test.ts) | Created | 19 automated regression tests covering all required relationship scenarios. |

---

## 5. Test Verification Results

### 5.1 Relationship Integrity Test Suite (`tests/v062_relationships.test.ts`)
All 19 test scenarios passed cleanly:
1. `Character -> Faction relationship creation links endpoints and syncs plan entities` (ok)
2. `Character -> Character relationship creation supports mutual and directed ties` (ok)
3. `Faction -> Location relationship creation records territorial dominion` (ok)
4. `Invalid endpoint rejection prevents self-links and missing target entities` (ok)
5. `Entity ID/document ID mismatch handling rejects mismatched IDs safely` (ok)
6. `Missing Universe membership rejects cross-Universe relationship links` (ok)
7. `Duplicate relationship creation prevents identical active links` (ok)
8. `Relationship persistence after reload retains connections through storage roundtrip` (ok)
9. `Entity rename preserves relationship by referencing stable entity UUIDs` (ok)
10. `Affiliation selector creates canonical relationship with standard Member of label` (ok)
11. `Relationship panel and affiliation selector remain synchronized across mutations` (ok)
12. `Removing affiliation archives only the relationship and preserves the Faction entity` (ok)
13. `Legacy free-text affiliation preservation retains unlinked text without silent deletion` (ok)
14. `Ambiguous legacy names require user confirmation without auto-binding` (ok)
15. `Failed save retains user input in form without clearing fields` (ok)
16. `Relationship validation failure does not wedge the organization queue` (ok)
17. `Universe graph reflects profile-created relationships` (ok)
18. `No regression to Book timelines or historical relationship state` (ok)
19. `No regression to Vault backup/restore roundtrips complex relationship plan` (ok)

### 5.2 Full Test Suite Results
- **TypeScript Typecheck (`npx tsc --noEmit`):** 0 errors.
- **Node.js Test Suite (`npm test`):**
  - **Suites:** 13 passed, 13 total.
  - **Tests:** 257 passed, 0 failed.
  - **Exit Code:** 0.
- **Rust Backend Tests (`cargo test --manifest-path src-tauri/Cargo.toml`):**
  - **Unittests:** 65 passed, 0 failed.
  - **Thinking Desk:** 3 passed, 0 failed.
  - **Workshop:** 10 passed, 0 failed.
  - **Total Rust Tests:** 78 passed, 0 failed.
  - **Exit Code:** 0.
- **Production Build (`npm run build` / `tsc && vite build`):**
  - **Status:** Built in 6.93s, 0 errors.

---

## 6. Remaining Manual Desktop QA Steps

To verify on the desktop application:
1. **Launch Desktop App:** Run `cargo tauri dev`.
2. **Open Universe:** Navigate to Lorebook Studio and open an existing Universe or create a new one.
3. **Create Two Lore Entities:**
   - Create Character: `Aldric`.
   - Create Faction: `The Ashen Order`.
4. **Link Affiliation from Character Profile:**
   - Open Character `Aldric`.
   - In **Affiliation / Order**, click **Link Faction**.
   - Select `The Ashen Order` and click **Connect**.
   - Verify badge displays `The Ashen Order` with shield icon.
   - Verify **Connected Lore Relationships** card below immediately displays `This entity Member of → The Ashen Order`.
5. **Universe Graph Verification:**
   - Click the Universe back button to return to Universe Dashboard.
   - Click the **Relationships** tab.
   - Verify the visual graph and relationships table display the connection `Aldric Member of → The Ashen Order`.
6. **Rename Faction:**
   - Open `The Ashen Order` and rename it to `The Obsidian Conclave`.
   - Open Character `Aldric`.
   - Verify the affiliation badge and relationship card reflect the updated name `The Obsidian Conclave` without manual edits.
7. **Cross-Universe Link Rejection Test:**
   - Create a second Universe `Cosmos B` with an entity.
   - Attempting to connect across universes is prevented by Universe scoping in selectors and rejected by validation.
8. **App Exit & Reload:**
   - Close the app and reopen.
   - Verify the relationship remains persisted and valid.

---

## 7. Policy Compliance
- **Zero git commits, zero git pushes, zero tags or publishing.**
- All modified files remain uncommitted in the local repository for user inspection.
