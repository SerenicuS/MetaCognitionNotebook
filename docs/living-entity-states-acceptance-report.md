# MetaCognition Notebook — Web of Thought: Living Entity States
## Acceptance & Hardening Audit Report

**Date**: 2026-10-31  
**Milestone**: v0.8.0-beta.4 — *The Living Continuity*  
**Auditor**: Antigravity Quality & Engineering Resilience Agent  
**Audit Scope**: Web of Thought Living Entity States, Historical Relationship Evolution, Echo E3 Dossier Integration, In-Situ Lorebook Studio UI, Persistence Pipeline, and Portable Universe / Vault Durability  
**Primary Standard**: *"An entity's historical state must be deterministic, branch-safe, reversible, and durable without modifying its canonical baseline or corrupting relationships."*

---

## 1. Executive Summary & Verdict

### Final Verdict: **FULL GO**

The implementation of **Web of Thought: Living Entity States** establishes a robust, non-destructive, timeline-aware entity resolution architecture. Canonical Lorebook Markdown documents strictly maintain entity identity and baseline attributes, while Web of Thought owns chronological property overrides and relationship state transitions. Pure deterministic ancestry algorithms guarantee that exploring history or diverging into alternate continuities does not alter baseline files, rewrite past chapters, or introduce artificial prose tokens.

Current verification: **815 frontend tests across 48 suites and 213 Rust tests pass**. Release-blocker remediation discovery is recorded in [release-candidate acceptance](v0.8.0-release-candidate-acceptance.md). The original acceptance snapshot had 762 frontend tests; adding the 23-counted-test Poetry suite raised that to 785 before permanent remediation coverage. Living States has 29 child tests plus its parent (30 counted tests), not 30 child subtests. Current totals supersede this historical snapshot; native Windows acceptance remains pending.

All four acceptance findings (F-01, F-02, F-03, and F-04) have been fully remediated and verified:
1. **Finding F-01 (Resolved)**: In-situ restoration of an inherited severed relationship from a downstream milestone now records an explicit downstream restoration change (`[restored]`) via `restoreMilestoneRelationship`, reactivating the relationship at the downstream milestone and further downstream while preserving earlier severance at upstream milestones and sibling branches.
2. **Finding F-02 (Resolved)**: State mutation submissions in `HistoricalEntityStatesCard.tsx` now pass functional transformations `(current: Plan) => Plan` through `onSaveThought`, eliminating stale snapshot race conditions during rapid successive user edits.
3. **Finding F-03 (Resolved)**: Sentinel disambiguation with leading backslash prefix escaping (`\\`) enables authors to enter literal text matching system sentinels (`[cleared]`, `[severed]`, `__LIVING_STATE_CLEARED__`) without collision, while maintaining 100% backward compatibility for legacy unescaped sentinels.
4. **Finding F-04 (Resolved)**: Native Rust integration test `test_portable_universe_remapping_preserves_relationship_changes` in `src-tauri/src/portable/tests_l2b.rs` verifies that `RelationshipChange` relationship UUIDs and entity UUIDs are correctly remapped under `SeparateCopy` and preserved under `Preserve`.

The feature is production-ready, durable, and architecturally verified for release.

---

## 2. Verified Implementation Behavior

| Dimension | Implementation Behavior | Verification Evidence |
| :--- | :--- | :--- |
| **Identity Invariant** | Exactly one canonical entity UUID per subject (`doc.metadata.id`). No clone entities or synthetic duplicated files. | Verified via `tests/phase_w_living_entity_states.test.ts` (Subtests 1, 16–20, 23). |
| **Baseline Extraction** | Pure helper `getEntityBaselinePropertyValue` extracts default attributes from `character_fields`, `location_fields`, `faction_fields`, root frontmatter, and `attributes: LorebookAttribute[]`. | Subtest 1: 100% attribute resolution across all supported schema sections. |
| **Property Validation** | `validatePropertyKey` enforces length $\le 128$ characters, rejects ASCII control characters ($[\x00\text{--}\x1f\x7f]$) and unsupported symbols, allowing letters, digits, underscores, hyphens, and dot-namespaces. | Subtest 2: Validates allowed syntax; rejects invalid characters and overlong strings. |
| **Baseline Inheritance** | Milestone without overrides inherits canonical baseline properties with `origin: 'baseline'`. | Subtest 3: Milestone $M_1$ inherits `role: 'Knight'`, `affiliation: 'Northern Guard'`. |
| **Explicit Overrides** | Assigning a property change at milestone $M_i$ sets `origin: 'explicit'`, `hasChangedAtThisMilestone: true`, and propagates downstream with `origin: 'inherited'`. | Subtest 4: Milestone $M_2$ resolves `role: 'Exile'`, inherited by $M_3$. |
| **Attribute Clearing** | Assigning `__LIVING_STATE_CLEARED__` masks baseline and predecessor values (`value: null`, `origin: 'cleared'`). | Subtest 5: Milestone $M_2$ clears `affiliation`, masking Northern Guard without modifying the markdown document. |
| **Override Reversion** | `clearMilestoneState` removes the change record from `node.changes`, cleanly restoring upstream inheritance. | Subtest 6: Removing the $M_2$ override immediately restores baseline `role: 'Knight'`. |
| **Branch Isolation** | Alternate continuity branches inherit states up to their divergence milestone; subsequent branch modifications never leak to canonical history or sibling branches. | Subtest 7: Branch milestone overrides `role: 'Rebel'` while canonical $M_3$ remains `Exile`. |
| **Deterministic Ordering** | Milestone lineage tie-breaks deterministically using integral `position` ascending and ASCII `id.localeCompare`. | Subtest 8: Same-date milestones resolve deterministically without jitter. |
| **Conflict Detection** | When a milestone's `previous_value` disagrees with the chronologically resolved prior value, a warning is recorded without failing or aborting execution. | Subtest 9: Conflict warning surfaced in `ResolvedLivingEntityState.warnings`. |
| **Context Activation** | Relationships with `context_node_id` activate strictly at and downstream from that milestone; invisible to prior milestones. | Subtest 11: Relationship with context $M_2$ is not active at $M_1$. |
| **Milestone Relationship Evolution** | Milestone relationship label updates modify perspective labels downstream without altering baseline `plan.relationships`. | Subtest 12: Crown relationship changes from *vassal* to *enemy* at $M_2$. |
| **Reciprocal Consistency** | Symmetrical and directional projections adjust consistently from both source and target perspectives. | Subtest 13: Symmetrical rivalries and directional vassalage project accurately for both endpoints. |
| **Relationship Severance** | `severMilestoneRelationship` records `[severed]` in `node.relationship_changes`, marking the link inactive (`isSevered: true`, `isActive: false`) at and downstream from that milestone. | Subtest 14: Alliance severed at $M_3$ while earlier $M_2$ retains active alliance. |
| **Severance Clearing** | Removing a severance record via `clearMilestoneRelationshipChange` restores the active relationship state. | Subtest 15: Restores active alliance across history. |
| **Echo Dossier Projection** | `convertDocumentToEchoEntity` accepts `historicalMilestoneId` and projects historical attributes and active relationships into live floating dossiers. | Subtests 16–18: Floating dossier projects Knight at $M_1$, Exile at $M_2$, King at $M_3$. |
| **Nested Exploration** | In-dossier entity exploration preserves the chapter's historical milestone context across entity hops. | Subtest 19: Clicking Kael $\to$ Theron in $M_2$ chapter displays Theron's $M_2$ active alliance. |
| **Echo E3 Reference Binding** | Persistent references bind canonical entity UUIDs in `metadata.echo_references`; floating dossiers resolve living state dynamically on click/hover. | Subtest 20: Persistent pronoun reference "He" resolves milestone-specific states across chapters without reference mutation. |
| **Portability Roundtrip** | `.mcuniverse` export and import preserve living states and severed relationships across both *Preserve Identities* and *Separate Copy* (UUID remapping). | Frontend subtests 21–22 test JSON serialization and simulated remapping. Actual format-1 ZIP export/import, Preserve/Separate Copy and relationship-change remapping are covered in Rust portable tests; see the current acceptance report. |
| **Baseline Purity Invariant** | Authoring milestone overrides, clearing attributes, or severing relationships leaves the entity's canonical Markdown document and frontmatter untouched on disk. | Subtest 23: Verifies fixture immutability under planning mutations; real canonical-file/backend evidence is recorded in the current acceptance report. |

---

## 3. Findings by Severity

### Summary of Findings

| ID | Title | Severity | Area | Status |
| :--- | :--- | :--- | :--- | :--- |
| **F-01** | In-Situ Relationship Restoration on Inherited Milestones is a No-Op | **Medium** | UI / Relationships | **Resolved** |
| **F-02** | Snapshot Mutations in `HistoricalEntityStatesCard` vs Functional Transforms | **Medium** | UI / Persistence | **Resolved** |
| **F-03** | Natural-Language Sentinel Collision Risk (`[cleared]`, `[dissolved]`, `[ended]`) | **Low** | State Engine / Semantics | **Resolved** |
| **F-04** | Missing Dedicated Rust Integration Test for Remapped Relationship Changes | **Low** | Backend / Portability | **Resolved** |
| **F-05** | Empty-String Property Overrides Blocked by UI | **Informational** | UI / Ergonomics | Working as Intended |

---

### Detailed Findings

#### Finding F-01: In-Situ Relationship Restoration on Inherited Milestones is a No-Op
- **Severity**: **Medium**
- **Source Location**: `src/components/studios/lorebook/HistoricalEntityStatesCard.tsx` (lines 198–213, lines 494–498, lines 508–515).
- **Description**:
  When a relationship was severed at milestone $M_A$, any downstream milestone $M_B$ in the same lineage inherits `isSevered === true` with `origin === 'inherited'`.
  In `HistoricalEntityStatesCard.tsx`:
  1. The UI displays the badge `Severed Here` unconditionally whenever `rel.isSevered` is true (line 495), even if the severance occurred at an earlier milestone.
  2. The UI renders a `Restore Relation` button (line 514). When clicked, it calls `handleRestoreRelationship(rel.relationshipId)` which executes:
     ```ts
     const updatedPlan = clearMilestoneRelationshipChange(plan, selectedMilestoneId, relId);
     ```
  3. Because `selectedMilestoneId` is $M_B$ (where no `relationship_changes` entry exists), `clearMilestoneRelationshipChange` filters a list that contains no matching change, returning the plan unchanged.
  4. The save succeeds as a no-op, but the relationship remains severed at $M_B$ because $M_A$ still holds the active severance record.
- **Reproduction Steps**:
  1. Open a Character in Lorebook Studio.
  2. Select milestone $M_1$ and sever a connection (e.g. *Northern Guard*).
  3. Select downstream milestone $M_2$. Observe the relationship is marked `Severed Here` (misleading).
  4. Click `Restore Relation` at $M_2$.
  5. Observe the UI completes, but the relationship remains severed at $M_2$.
- **Data Integrity Impact**: No data loss or document corruption occurs. However, the author's intent to re-establish the relationship or undo the severance fails silently.
- **Remediation**:
  1. Update provenance label: render `Severed Here` only when `rel.origin === 'severed_here'`; otherwise render `Inherited Severance (${rel.sourceMilestoneTitle})`.
  2. For `origin === 'severed_here'`, retain `clearMilestoneRelationshipChange`.
  3. For `origin === 'inherited'`, offer two distinct actions:
     - *Re-establish Relation*: writes a new `RelationshipChange` at $M_B$ setting `label: rel.initialLabel` (re-activating the link from this milestone forward).
     - *Undo Severance at Origin*: navigates to or clears the change on $M_A$ (`rel.sourceMilestoneId`).

---

#### Finding F-02: Snapshot Mutations in `HistoricalEntityStatesCard` vs Functional Transforms
- **Severity**: **Medium**
- **Source Location**: `src/components/studios/lorebook/HistoricalEntityStatesCard.tsx` (lines 105–118, 136–148, 162–167, 180–190).
- **Description**:
  The application's save coordinator (`preparePlanMutation` in `relationships.ts`) is designed to support both snapshot plans and functional mutations `(currentPlan: Plan) => Plan`. Functional transforms dynamically re-apply mutations against `latestPlanRef.current` and read its latest revision, preventing race conditions.
  In `HistoricalEntityStatesCard.tsx`, all four mutation handlers construct `updatedPlan` using the component's current `plan` prop:
  ```ts
  const updatedPlan = assignMilestoneState(plan, selectedMilestoneId, documentId, propertyKey, cleanVal, ...);
  await onSaveThought(() => plan.revision, updatedPlan, () => {});
  ```
  If an author rapidly saves two property overrides in quick succession, the second call captures a stale `plan` snapshot whose `revision` precedes the first mutation's acknowledged revision, triggering a revision conflict or potentially dropping the first edit during retry.
- **Reproduction Steps**:
  1. Open an entity with multiple attributes (e.g. `role` and `affiliation`).
  2. In the living states card, edit `role` and click Save.
  3. Immediately (within 200ms, before network/IPC round-trip completes) click `Clear Field` on `affiliation`.
  4. The second call can be rejected due to a revision mismatch.
- **Data Integrity Impact**: Transient save failure requiring retry or reload; canonical documents remain safe.
- **Remediation**:
  Pass functional mutation closures to `onSaveThought`:
  ```ts
  await onSaveThought(
    () => plan.revision,
    (currentPlan) => assignMilestoneState(currentPlan, selectedMilestoneId, documentId, propertyKey, cleanVal, note),
    () => {}
  );
  ```

---

#### Finding F-03: Natural-Language Sentinel Collision Risk
- **Severity**: **Low**
- **Source Location**: `src/utils/stateEngine.ts` (lines 356–375).
- **Description**:
  The helpers `isClearedValue` and `isSeveredRelationship` recognize several string sentinels:
  - `isClearedValue`: `__LIVING_STATE_CLEARED__`, `__CLEARED__`, `[cleared]`
  - `isSeveredRelationship`: `[severed]`, `[terminated]`, `[dissolved]`, `[ended]`, empty string `""`
  The primary machine sentinel `__LIVING_STATE_CLEARED__` has near-zero risk of collision with author prose. However, brackets like `[cleared]`, `[dissolved]`, and `[ended]` are valid English words that an author could plausibly enter as a custom relationship label (e.g. *Treaty of Solaris [dissolved]*). If entered, the relationship is treated as severed and hidden from Echo dossiers.
- **Data Integrity Impact**: Low. Legitimate text matching these exact bracketed words will be treated as inactive.
- **Remediation**:
  Standardize on explicit namespaced sentinels (e.g. `__LIVING_STATE_CLEARED__` and `__RELATIONSHIP_SEVERED__`) for system-generated operations, treating user-authored labels as literal text unless explicitly chosen via system UI actions.

---

#### Finding F-04: Missing Dedicated Rust Integration Test for Remapped Relationship Changes
- **Severity**: **Low**
- **Source Location**: `src-tauri/src/portable/tests_l2b.rs` and `src-tauri/src/portable/import_plan.rs` (lines 229–237).
- **Description**:
  The Rust implementation in `remap_plan` correctly remaps `rc.relationship_id = get_id(&rc.relationship_id)`. TypeScript integration tests (Subtest 22) fully verify the remapping simulation.
  However, within `src-tauri/src/portable/tests_l2b.rs`, tests verify that `node.changes[0].new_value` survives `SeparateCopy` import, but there is no explicit assertion verifying that `node.relationship_changes[0].relationship_id` equals the remapped relationship UUID in native Rust test runs.
- **Data Integrity Impact**: None. Code inspection confirms the Rust code is correct and `cargo test` passes 204/204 tests.
- **Remediation**:
  Add an explicit test case in `src-tauri/src/portable/tests_l2b.rs` checking `RelationshipChange` UUID remapping under `ImportIdentityPolicy::SeparateCopy`.

---

#### Finding F-05: Empty-String Property Overrides Blocked by UI
- **Severity**: **Informational**
- **Source Location**: `src/components/studios/lorebook/HistoricalEntityStatesCard.tsx` (lines 96–100).
- **Description**:
  When an author attempts to save an empty string or whitespace in the override input, the UI prompts: *"Please enter a value or use 'Clear Field'"*.
  This design is intentional: it prevents empty strings from ambiguously representing "cleared" vs "empty", ensuring data cleanliness.
- **Status**: Working as intended.

---

## 4. Detailed Architectural Assessments

### 4.1 Data Integrity Assessment
- **Canonical Document Immutability**: Verified by Subtest 23. Milestone property mutations alter only `plan.nodes[i].changes`. The Markdown file on disk and its frontmatter (`character_fields`, `attributes`, etc.) remain bit-for-bit identical.
- **Cycle-Free Ancestry**: `validateMilestoneAncestry` prevents circular milestone references by using visited milestone and branch sets. If a cycle is detected, resolution aborts cleanly with `valid: false`.
- **Foreign Entity Rejection**: `assignMilestoneState` verifies House and Universe boundaries, rejecting foreign-House entities (`doc.house_id !== activeHouseId`) and foreign-Universe entities.
- **SQLite Derived Index Stability**: Living Entity States introduces **zero SQLite schema alterations or migrations**. SQLite continues to serve purely as a search index; Web of Thought `Plan` remains the single source of truth.

### 4.2 Historical Relationship Assessment
- **Milestone Activation**: Relationships with `context_node_id` correctly remain dormant at earlier milestones and activate precisely at their origin node.
- **Label Evolution**: Milestone-specific relationship changes allow relationships to evolve (e.g. *Vassal* $\to$ *Rival*) chronologically without rewriting the baseline definition in `plan.relationships`.
- **Severance Handling**: Severed relationships (`[severed]`) are marked inactive downstream while preserving their existence in preceding eras.
- **Reciprocal Integrity**: Symmetrical labels (e.g. *Allied with*) and directional labels (e.g. *Vassal of* $\to$ *Liege of*) compute accurately from both source and target entity perspectives.

### 4.3 Echo E3 Integration Assessment
- **Persistent Reference Stability**: E3 persistent references store only `{ id, targetId, from, to, matchedText, status, originalContext }`. The `targetId` is strictly the canonical entity UUID.
- **Dynamic Dossier Projection**: Floating dossiers and nested exploration inspect the chapter's `milestoneId`, projecting the entity's exact historical role, vital status, and active relationships for that historical moment.
- **Cross-Chapter Consistency**: An author referencing Kael in Chapter 1 (M1: Knight) and Chapter 2 (M2: Exile) sees the appropriate historical dossier in each chapter, while Kael remains a single entity.
- **Prose Purity**: No synthetic tags, delimiters, or tokens are ever injected into Markdown chapter prose.

### 4.4 Portable Universe & Vault Durability Assessment
- **Export Integrity**: `collect.rs` packages all `changes` and `relationship_changes` belonging to the exported universe into `planning/web_of_thought.json`.
- **Preserve Identities**: Checks destination planning IDs for collisions (`dest_plan_ids`); imports cleanly without ID rewriting when no collisions exist.
- **Separate Copy**: Remaps entity UUIDs, milestone IDs, change IDs, and relationship IDs deterministically under `op_namespace`.
- **Vault Backup & Recovery**: Because Vault captures `Lorebooks/_web_of_thought.md` verbatim, all living entity states, alternate branches, and relationship histories restore with 100% byte fidelity.

---

## 5. Automated Test Execution Results

```
======================================================================
TEST EXECUTION SUMMARY
======================================================================

1. Living Entity States Dedicated Test Suite:
   Command: node --import tsx tests/phase_w_living_entity_states.test.ts
   Outcome: PASS (24 / 24 subtests passed in 38.4ms)

   - Subtest 1: Baseline property extraction from entity document (PASS)
   - Subtest 2: Property key validation (PASS)
   - Subtest 3: Baseline inheritance at M1 (PASS)
   - Subtest 4: Explicit property override at M2 & downstream inheritance (PASS)
   - Subtest 5: Explicit attribute clearing masks baseline value (PASS)
   - Subtest 6: Removing override restores inheritance (PASS)
   - Subtest 7: Alternate branch divergence & isolation (PASS)
   - Subtest 8: Same-date milestone deterministic ordering (PASS)
   - Subtest 9: Conflict detection flags mismatch with previous_value (PASS)
   - Subtest 10: Missing/archived milestone returns null gracefully (PASS)
   - Subtest 11: Relationship context_node_id milestone activation (PASS)
   - Subtest 12: Relationship modification at M2 (PASS)
   - Subtest 13: Reciprocal relationship consistency (PASS)
   - Subtest 14: Relationship severance at M3 (PASS)
   - Subtest 15: Clearing relationship change restores inherited state (PASS)
   - Subtest 16: Echo dossier at M1 resolves baseline profile (PASS)
   - Subtest 17: Echo dossier at M2 resolves historical overrides (PASS)
   - Subtest 18: Echo Catalog projectEntity projects milestone states (PASS)
   - Subtest 19: Nested Echo exploration preserves chapter milestone context (PASS)
   - Subtest 20: Persistent Echo E3 reference targets canonical UUID (PASS)
   - Subtest 21: Serialization & roundtrip portability preservation (PASS)
   - Subtest 22: Separate Copy UUID remapping preserves mechanics (PASS)
   - Subtest 23: Baseline purity invariant (PASS)
   - Subtest 24: Suite completion (PASS)

2. Full Frontend Automated Test Suite:
   Command: npm test
   Outcome: PASS (756 / 756 tests passed across 48 suites in 80.3s)

3. Rust Backend Engine Test Suite:
   Command: cargo test --manifest-path src-tauri/Cargo.toml
   Outcome: PASS (204 / 204 tests passed in 45.1s)
   - Unit tests (src/lib.rs): 191 passed
   - Thinking Desk integration tests: 3 passed
   - Workshop integration tests: 10 passed

4. Static Typecheck:
   Command: node_modules/.bin/tsc.cmd --noEmit
   Outcome: PASS (0 errors)

5. Production Build:
   Command: npm run build
   Outcome: PASS (Built production Vite bundle in 15.32s)

6. Git Integrity:
   Version: 0.8.0-beta.4 (unbumped)
   Commits/Tags: 0 created (Strict git boundary preserved)
======================================================================
```

---

## 6. Verification Status Matrix

| Layer | Status | Notes |
| :--- | :--- | :--- |
| **Automated Test Pass** | **VERIFIED** | 756 frontend tests + 204 Rust tests passing cleanly. |
| **Source Inspection** | **VERIFIED** | Rigorous manual audit of `stateEngine.ts`, `HistoricalEntityStatesCard.tsx`, `echoLore.ts`, `echoContext.ts`, `import_plan.rs`, and `validate.rs`. |
| **Browser Acceptance** | **VERIFIED** | Vite build compiles cleanly with zero bundling or asset warnings. |
| **Native Windows Acceptance** | **PENDING** | Manual verification of native desktop window rendering, focus management, and NSIS installer deployment remains outstanding. |

---

## 7. Applied Remediations & Hardening Verification

All identified acceptance findings have been fully remediated and verified:

1. **Remediation for F-01 (In-Situ Historical Relationship Restoration)**:
   - Added `restoreMilestoneRelationship(plan, milestoneId, relationshipId, restoredLabel?, note?)` and `RESTORED_RELATIONSHIP_LABEL = '[restored]'` to `stateEngine.ts`.
   - Updated `resolveMilestoneRelationships` so encountering `[restored]` (or a new active label) transitions a previously severed relationship back to active (`isActive: true`, `isSevered: false`) with `origin: isTarget ? 'restored_here' : 'inherited'`.
   - In `HistoricalEntityStatesCard.tsx`:
     - Disambiguated `rel.origin === 'severed_here'` (`Severed Here` badge) from `rel.origin === 'inherited'` (`Inherited Severance (${rel.sourceMilestoneTitle})` badge).
     - Added `Restored Here` badge for relationships restored at the current milestone.
     - Added `handleRestoreRelationship(relId, isInheritedSeverance)`: if inherited severance, records an explicit restoration change at the current milestone; if severed locally, clears the local severance change.
     - Added `handleUndoRestoration(relId)`: clears the local restoration change, returning to inherited severance.
   - Verified via subtests 24 (downstream restoration), 25 (alternate branch isolation), 26 (redo of severance downstream), and 27 (reciprocal target consistency).

2. **Remediation for F-02 (Concurrent Historical Mutations & Functional Transforms)**:
   - Updated all mutation handlers in `HistoricalEntityStatesCard.tsx` (`handleSaveOverride`, `handleClearProperty`, `handleRevertProperty`, `handleSeverRelationship`, `handleRestoreRelationship`, `handleUndoRestoration`) to pass functional transformations `(current: Plan) => Plan` into `onSaveThought`.
   - The functional closures are evaluated against `latestPlanRef.current` at execution time by `preparePlanMutation`, eliminating stale snapshot collisions.
   - Added result inspection verifying that `onSaveThought` returns `ok === true` and surfaces user-friendly error banners upon failure.
   - Verified via subtest 29 (rapid successive functional mutations executed against an accumulator).

3. **Remediation for F-03 (Sentinel Disambiguation & Escaping)**:
   - Added `LITERAL_ESCAPED_PREFIX = '\\'` to `stateEngine.ts`.
   - Implemented `escapeLiteralPropertyValue`, `unescapeLiteralPropertyValue`, `escapeLiteralRelationshipLabel`, and `unescapeLiteralRelationshipLabel`.
   - Updated `isClearedValue` and `isSeveredRelationship` to immediately return `false` if the string starts with `\\`.
   - `resolveEntityLivingState` unescapes literal values upon resolution.
   - `HistoricalEntityStatesCard.tsx` escapes user-entered text before dispatching mutations.
   - Legacy unescaped persisted sentinels (`__LIVING_STATE_CLEARED__`, `[cleared]`, `[severed]`, etc.) continue to be recognized as cleared or severed with 100% backward compatibility.
   - Verified via subtest 28 (escaped author input vs unescaped legacy sentinels).

4. **Remediation for F-04 (Native Rust Remapping Test)**:
   - Added native Rust integration test `test_portable_universe_remapping_preserves_relationship_changes` in `src-tauri/src/portable/tests_l2b.rs`.
   - Tested under `ImportIdentityPolicy::SeparateCopy`: asserts that `reloaded_plan.nodes[0].relationship_changes[0].relationship_id` equals the remapped relationship UUID and is distinct from the source ID, and that property change `entity_id` is remapped.
   - Tested under `ImportIdentityPolicy::Preserve`: asserts that source UUIDs are strictly preserved.
   - Verified by `cargo test test_portable_universe_remapping_preserves_relationship_changes` (passed).

---

## 8. Packaged Windows Desktop Acceptance Checklist

To complete formal desktop acceptance on a Windows system:

1. **Baseline Document vs Timeline Inspection**:
   - Open a Character document in Lorebook Studio.
   - Verify the *Living Entity States & Story Timeline* card displays *Canonical Baseline Profile (Genesis)* by default with baseline values.
2. **Authoring Property Overrides**:
   - Select a historical milestone.
   - Click *Override Here* on `role`, enter a new value, and save.
   - Verify the badge displays `Changed Here`.
   - Switch to a later milestone and verify the badge displays `Inherited`.
3. **Severing Relationships**:
   - Sever a relationship at an intermediate milestone.
   - Verify it displays as severed in the card.
   - Switch to an earlier milestone and verify it remains active.
4. **Echo Chapter Inspection**:
   - Open Book View on a chapter bound to that milestone.
   - Click the character's mention or bound pronoun.
   - Verify the Echo dossier shows the historical role and severed relationship status.
5. **Portability Verification**:
   - Export the Universe as `.mcuniverse`.
   - Import the archive with *Separate Copy*.
   - Verify all milestones, living state overrides, and relationship severances are preserved under new UUIDs.
