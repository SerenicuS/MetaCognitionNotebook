# MetaCognition Notebook — v0.6.2 Save Reliability & Autosave UX Report

**Date:** October 19, 2026  
**Status:** RESOLVED & VERIFIED  
**Commit/Push Rule:** Zero git commits, zero git pushes, zero tags or publishing.

---

## 1. Executive Summary & Root Cause Analysis

### Problem A — Intermittent "Organization not saved"

#### Confirmed Root Cause:
1. **Stale Revision Evaluation in Child Closures:**
   In [src/App.tsx](file:///d:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx), `handleThoughtSave` was passed down to [src/components/studios/LorebookStudio.tsx](file:///d:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/LorebookStudio.tsx) and its child components. The method accepted `expectedRevision: () => number`. Child components evaluated this closure against their React render closure: `() => plan.revision`.
   When rapid organizational mutations occurred (e.g., adding several entity relationships, reordering chapters, or quickly adding historical nodes), or when an organizational action fired before React completed its render cycle, `expectedRevision()` returned an older revision number than the current catalog state on disk.
2. **Backend Concurrency Protection:**
   The Rust backend in `src-tauri/src/thought.rs` (`save_impl`) enforces optimistic concurrency control:
   ```rust
   if expected_revision != canonical.revision {
       return Err("Planning desk changed on disk. Reload before applying more edits; no stale data was written.".to_string());
   }
   ```
   When the stale revision arrived, Rust rejected the save to protect data integrity.
3. **MutationQueue Permanent Wedge:**
   `runOrganization` in `App.tsx` caught this error, surfaced the banner `"Organization Not Saved: Planning desk changed on disk..."`, and registered the failed save action into `MutationQueue.ts`.
   In `MutationQueue`, `this.actions[0]` remained un-cleared. Any subsequent autosave flush or `Ctrl+S` re-attempted `this.actions[0]()`, which continuously failed with the stale revision captured in its closure. This permanently wedged `saveStatus = 'error'` and `organizationBusy = true`.
4. **Why Leaving the Universe Temporarily Cleared It:**
   When the user navigated away from the Universe, the top banner rendered `Cancel pending update` (`onCancelOrganization`). Clicking this invoked `mutationQueue.current.discard()`, which purged `this.actions` and reset `organizationBusy = false`, clearing the banner symptom until the next closure lag.

#### Risk Analysis & Data Safety:
- **Was user data lost?** **No.** The Rust planning subsystem's revision checks strictly prevented stale or corrupted plans from overwriting disk state (`no stale data was written`). The canonical Markdown and SQLite index remained intact.
- **The Issue:** The frontend state had not reconciled the latest revision and was wedging its queue, displaying false persistent alarms.

---

### Problem B — Aggressive Autosave vs Manual Save

#### Previous Autosave Behavior:
- Hardcoded **400ms debounce** triggered on every keystroke across Poetry, Philosophy, and Lorebook studios.
- Fast typists suffered constant state thrashing, excessive file writes, and immediate disk commits that felt intrusive and did not provide manual control or a way to safely discard accidental keystrokes.

#### New Autosave & Manual Save Architecture:
1. **Configurable Autosave Interval (1 to 10 seconds, default 3s):**
   - Writers who prefer automatic persistence can tune the debounce timer between 1 and 10 seconds in Settings (`SettingsModal.tsx`).
2. **Manual Save Mode (`Ctrl+S` & Explicit Save Button):**
   - Writers who prefer complete control can switch to **Manual Save Mode**.
   - Keystrokes mark the document as `unsaved` without scheduling an automatic background timer.
   - Saves occur explicitly via keyboard shortcut (`Ctrl+S` / `Cmd+S`) or by clicking the `Save` button in the top navigation bar.
3. **Unsaved Changes Navigation Interception:**
   - When in manual mode or when pending document edits exist, switching documents, switching studios, or exiting the application triggers an **Unsaved Changes Modal** (`UnsavedChangesModal.tsx`).
   - The user is presented with three unambiguous choices:
     - **Save Changes:** Persists modifications immediately to disk before navigating.
     - **Discard Changes:** Reverts memory to the last saved on-disk document and continues navigation.
     - **Cancel:** Aborts navigation and keeps the user in the current document with their edits intact.
4. **Structural Operations Remain Immediate:**
   - Creating universes, adding entities/books/chapters, updating continuity, and linking relationships remain transactional and save immediately, bypassing document debounce timers.

---

## 2. Modified & Created Files

| File | Status | Description |
| :--- | :--- | :--- |
| [src/utils/savePreferences.ts](file:///d:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/savePreferences.ts) | Created | Persistence manager for `SavePreferences` (`mode`, `debounceSeconds` clamped 1–10, `loadSavePreferences`, `persistSavePreferences`). |
| [src/components/common/UnsavedChangesModal.tsx](file:///d:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/common/UnsavedChangesModal.tsx) | Created | Modal dialog presenting Save Changes / Discard Changes / Cancel when attempting to navigate with dirty edits. |
| [tests/v062_save_autosave.test.ts](file:///d:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/tests/v062_save_autosave.test.ts) | Created | 16 comprehensive automated integration tests verifying revision conflicts, reconciliation, manual save, autosave debounce, dirty tracking, and dialog flow. |
| [src/types/index.ts](file:///d:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/types/index.ts) | Modified | Exported `SaveMode` (`'automatic' \| 'manual'`) and `SavePreferences` interface. |
| [src/utils/universe.ts](file:///d:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/universe.ts) | Modified | Implemented `reconcilePlans(freshBase: Plan, attempted: Plan): Plan` to safely merge concurrent plan mutations across revisions. |
| [src/components/common/SettingsModal.tsx](file:///d:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/common/SettingsModal.tsx) | Modified | Added **Saving & Autosave Preferences** section with mode radio buttons, slider (1–10s), and contextual explanations. |
| [src/components/layout/AppLayout.tsx](file:///d:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/layout/AppLayout.tsx) | Modified | Added dedicated Save button, keyboard shortcut indicator, and refined save status rendering (`saved`, `saving`, `unsaved`, `editing`, `error`). |
| [src/components/studios/LorebookStudio.tsx](file:///d:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/LorebookStudio.tsx) | Modified | Added `planRef` synchronization so child mutations always report the true live revision without relying on render closures. |
| [src/App.tsx](file:///d:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx) | Modified | Integrated `latestPlanRef`, automatic revision retry and `reconcilePlans` in `handleThoughtSave`, configurable autosave debouncing, manual save handlers, dirty tracking, and `UnsavedChangesModal` navigation interception. |
| [package.json](file:///d:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/package.json) | Modified | Registered `tests/v062_save_autosave.test.ts` in `npm test` pipeline. |

---

## 3. Test Verification Results

### 3.1 New Save & Autosave Integration Test Suite (`tests/v062_save_autosave.test.ts`)
All 16 required test scenarios passed cleanly:
- **Scenario 1:** Default autosave interval is 3 seconds.
- **Scenario 2:** Configurable autosave interval (1–10s range clamping and persistence).
- **Scenario 3:** Manual save mode does not schedule autosave timer on edit.
- **Scenario 4:** Explicit save (`Ctrl+S` / Save button) persists document immediately in manual mode.
- **Scenario 5:** Unsaved changes detection marks document dirty upon edit and clean upon save.
- **Scenario 6:** Document navigation interception when unsaved changes exist (prompts dialog).
- **Scenario 7:** Studio switching interception when unsaved changes exist (prompts dialog).
- **Scenario 8:** Application exit interception when unsaved changes exist (prompts dialog).
- **Scenario 9:** Unsaved changes dialog: Save Changes saves document to disk and completes pending navigation.
- **Scenario 10:** Unsaved changes dialog: Discard Changes discards modified memory and completes pending navigation.
- **Scenario 11:** Unsaved changes dialog: Cancel aborts navigation and preserves dirty edits in editor.
- **Scenario 12:** Structural organization mutations (Universe/Book/Chapter/Lore) bypass autosave timer and save immediately.
- **Scenario 13:** Concurrent organization mutations track latest plan revisions and do not fail with stale revisions.
- **Scenario 14:** Revision conflict auto-reconciliation merges changes cleanly without losing updates or wedging the queue.
- **Scenario 15:** Save status transitions reflect actual disk persistence: `editing` -> `saving` -> `saved`.
- **Scenario 16:** Poetry, Philosophy, and Lorebook document saving operates seamlessly under new autosave rules.

### 3.2 Full Test Suite Results
- **TypeScript & Unit Tests (`npm test`):**
  - **Suites:** 12 passed, 12 total.
  - **Tests:** 238 passed, 0 failed.
  - **Exit Code:** 0.
- **Rust Backend Tests (`cargo test --manifest-path src-tauri/Cargo.toml`):**
  - **Unittests:** 65 passed, 0 failed.
  - **Thinking Desk:** 3 passed, 0 failed.
  - **Workshop:** 10 passed, 0 failed.
  - **Exit Code:** 0.
- **Production Build (`npm run build` / `tsc && vite build`):**
  - **Status:** Built in 6.68s, 0 errors.

---

## 4. Policy Compliance
- **Zero git commits, zero git pushes, zero tags or publishing.**
- All modified code remains uncommitted in working tree ready for user inspection.
