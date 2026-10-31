# Echo E3 — Nested Lore Exploration Architecture Audit

Audit date: 2026-10-31 (Asia/Shanghai). Inspected checkout: `a0cbcb2`; package version `0.8.0-beta.4`. The working tree was clean before investigation. This report reflects the actual source, including acceptance-remediation changes, rather than assuming the release documentation is exhaustive.

Scope: read-only investigation and design; this Markdown report is the sole intended repository change. No E3 implementation, schema change, migration, canonical data edit, version bump, commit, or release was performed.

Evidence labels:

- **Confirmed** — directly established by the cited source or an explicitly reported test run.
- **Inferred** — a plausible consequence of the implementation, requiring reproduction before calling it a runtime defect.
- **Unknown** — not established by this investigation.

Recommendations and proposed behavior are design proposals, not claims about implemented behavior. Source references use repository-relative paths and one-based line numbers. Section 14 provides a linked source index.

## 1. Executive summary

**Confirmed:** Nested exploration fits the existing architecture as derived UI. Production `MarkdownEditor` owns a single dossier outside the CodeMirror document, accepts a scoped entity collection, and already replaces the dossier entity when a relationship button is activated (`src/components/editor/MarkdownEditor.tsx:169–200,335–347,693–705`). That replacement does not open a document or change prose. There is no Back/Forward history or recognition inside the overview today.

**Confirmed:** The requested “existing hover preview” is not the production baseline. `echoClickPlugin` registers a `click` handler; decorations offer browser-native `title` hints. The dossier opens by click or `Alt+E` / `Mod-Shift-E`, not by a CodeMirror hover-tooltip extension (`src/components/echo/echoExtension.ts:245–252,309–355`; `MarkdownEditor.tsx:259–303,394–401`). Pointer departure does not dismiss it. Adding first-level hover is additional interaction work.

Recommend **A+B: one navigable dossier with a stable interactive surface**. Preserve click and keyboard activation as the primary accessible entry. If hover is included, make it transient until deliberate activation promotes it to the same stable surface. Nested activation replaces content in that surface, records UUID history, and never creates another popover. Back and optional Forward are explicit buttons; Escape closes. A side panel can later host the same controller and renderer.

Reuse scoped eligibility, title/alias matching semantics, UUID identity, template-prose suppression, the safe React Markdown subset, dossier sections, and milestone-state resolution. Extend the recognition API for text leaves, the navigation controller, UUID callbacks, loader invalidation, accessibility, copy/scroll behavior, and original-context propagation.

The main correctness risks are name-based relationship navigation, stale open dossier snapshots, optional House filtering, differing Universe resolvers, and secondary dossier data drawn from a wider document collection. Reader publication filtering is separate from author Echo. Do not infer that author Echo enforces reader spoiler restrictions.

**Inferred complexity:** medium-to-high frontend work, with meaningful integration and packaged Windows acceptance effort. No new persistent references or database table are necessary. Persistent prose-span binding is a separate capability; the existing roadmap also calls that capability “E3,” so the naming/scope collision needs a product decision (`docs/ROADMAP.md:36–39,114`).

## 2. Existing Echo architecture

### Component boundaries

| Boundary | Confirmed responsibility and evidence |
| --- | --- |
| App and layout | `App.tsx:312–319,1154–1162` supplies House-filtered documents and a separately stored sidebar scope. `AppLayout.tsx:885–909` supplies canonical plan, documents, notebook key, and ordinary document-opening callbacks to Lorebook Studio. |
| Lorebook Studio | Owns local draft text and engine choice; derives the writing document's Universe through `classifyLoreDocument`, rather than the sidebar selection (`LorebookStudio.tsx:155–181,467–470,743–765`). |
| Book View | Hosts an independent chapter draft, save timer, and the same editor; supplies Book Universe and chapter historical milestone (`BookView.tsx:191–259,611–634`). |
| Echo projection | `echoLore.ts:70–276,286–317` converts metadata and optional bodies into `EchoEntity` objects and filters the eligible root collection. |
| CodeMirror recognition | `echoExtension.ts:19–40,80–134,146–233,260–355` stores entities, ephemeral confirmations, candidate ranges/decorations, and click dispatch. |
| Editor controller | `MarkdownEditor.tsx:169–347` owns current dossier and ambiguity state, resolves activation, and confirms a chosen span without editing text. |
| Dossier view and loader | `EchoDocumentationPopup.tsx:262–342,470–505,614–744` loads canonical prose, renders sections, handles dismissal, and distinguishes exploration from Open in Lorebook. |
| Backend read | `api.ts:1205–1206` invokes `get_document`; `commands.rs:64–67` delegates to `organization.rs:58–80`; `storage.rs:814–855` safely reads the file and separates JSON frontmatter from body. |
| Historical context | `MarkdownEditor.tsx:469–535` derives a badge/provenance projection for the current entity using the original chapter milestone; `stateEngine.ts:918–959` caches resolved states. |

**Confirmed:** Production callers of `MarkdownEditor` are Lorebook Studio and Book View (`LorebookStudio.tsx:745`; `BookView.tsx:611`). Settings also offers a separate mock-data Echo prototype (`SettingsModal.tsx:305`; `EchoEditorPrototype.tsx:16–17,103,202–229`). The prototype is not the live document-scoping implementation.

**Confirmed:** The production candidate filter requires `doc_type === 'lorebook'`, excludes catalogs, and does not require an entry in `plan.entities` or an explicit category whitelist (`echoLore.ts:299–310`). Consequently, eligibility should not be described as “only registered character/location/faction entities”: other eligible Lorebook document types can enter the index.

### Settings boundary

**Confirmed:** Echo is gated by the caller's `echoEnabled` and the localStorage preference `mc_echo_recognition_active`, defaulting to on. The selected engine is stored separately as `mc_editor_engine` (`MarkdownEditor.tsx:138–173`; `LorebookStudio.tsx:174–181`). These are local preferences, not visibility grants. Turning recognition off dispatches an empty entity collection; it does not explicitly clear the existing dossier or confirmed-reference field (`MarkdownEditor.tsx:441–447`; `echoExtension.ts:114–130`). E3 should invalidate exploration when disabled without changing privacy defaults.

## 3. Recognition and preview data flow

### Recognition

**Confirmed flow:**

1. Caller supplies source document ID, draft text, original Universe/House, plan, and metadata list.
2. `buildScopedEchoEntities` filters and converts candidates (`echoLore.ts:286–317`).
3. `echoEntitiesField` receives the collection on initialization and through `setEntitiesEffect` (`MarkdownEditor.tsx:409–415,441–447`).
4. `findCandidateMatches` converts the complete CodeMirror `Text` to a string, indexes normalized names/aliases, and scans the whole document (`echoExtension.ts:146–205`). It does not scan only selected text or the viewport.
5. Terms shorter than two characters are excluded. Matching uses escaped regex alternation, longer terms first, Unicode letter/number boundaries, and `giu` flags. It is case-insensitive, supports multiword names and punctuation boundaries, and is lexical rather than semantic (`echoExtension.ts:162–192`). No Markdown syntax tree is consulted: source-code, link destination, and markup contexts are not explicitly excluded.
6. Candidates contain matching entities deduplicated by UUID and an ambiguity flag (`echoExtension.ts:207–228`). A normal word matching an eligible name is a suggestion, not established author intent.
7. Candidate decorations contain the matched word and a title hint, while confirmed decorations carry `data-entity-id` and `data-ref-id` (`echoExtension.ts:65–71,245–252`). Candidate identity lives in the state field, not a single UUID DOM attribute.
8. Click dispatch routes candidates to direct preview or ambiguity selection. Confirming an ambiguous choice stores an ephemeral UUID/range record through an effect (`MarkdownEditor.tsx:232–255,306–330`). No prose conversion occurs.
9. Matching recomputes after text changes, entity-set changes, and reference effects, not every selection-only transaction (`echoExtension.ts:273–294`). Confirmed spans map through edits and invalidate if collapsed or changed beyond case (`echoExtension.ts:90–111`).

**Confirmed:** There is no dedicated explicit Markdown-link, wiki-link, or bare-UUID syntax resolver in this Echo scanner or dossier renderer. A UUID is an identity in confirmed state, not a recognized prose syntax. Existing relationship/structured-field links are another mechanism; see section 4. Native Markdown syntax highlighting from `markdown()` does not establish Echo link semantics (`MarkdownEditor.tsx:380`; `echoExtension.ts:146–233`).

**Confirmed:** Deleted/archived entities disappear from automatic candidates when the supplied collection refreshes. The confirmed-reference field does not prune UUID bindings on `setEntitiesEffect`; selecting a retained binding searches the current scoped collection and opens only if found (`echoExtension.ts:114–130`; `MarkdownEditor.tsx:216–229`). Existing open dossiers and ambiguity snapshots are reset on `documentId` changes, but no equivalent reset effect watches House, notebook, eligibility, or Echo-enabled changes (`MarkdownEditor.tsx:178–200`).

### Preview construction

**Confirmed:** `convertDocumentToEchoEntity` sets `description` to the trimmed complete supplied body, or an empty string; it does not select a summary/excerpt/description metadata field (`echoLore.ts:77–89,259–275`). Production callers supply metadata lists, so the popup normally needs an asynchronous body read. `DocumentDetail` inputs are supported by the conversion helpers but are not the normal list-data shape.

**Confirmed:** On each `entity.id` change, the popup resets prose, shows loading, and requests `api.getDocument(entity.id)` even when a description is present. The response supplies `detail.content`, then also mutates the derived `entity.description` in memory. It does not save the document (`EchoDocumentationPopup.tsx:278–310`). The backend body excludes canonical frontmatter (`storage.rs:831–855`). A defensive renderer also strips a leading `---json` block (`EchoDocumentationPopup.tsx:91–98`).

**Confirmed:** `suppressTemplateProse` removes only exact factory instructions under their original headings; edited authored prose remains. Suppression is a display projection, not a canonical rewrite (`loreTemplateProse.ts:3–24`; `EchoDocumentationPopup.tsx:342`). This is not privacy sanitization.

**Confirmed:** The renderer supports a limited Markdown subset: headings, paragraphs/line breaks, quotes, unordered lists, bold, italic, and inline code. It creates React nodes/text rather than using `dangerouslySetInnerHTML` (`EchoDocumentationPopup.tsx:45–163`). Raw HTML remains escaped text; there is no general HTML sanitizer because arbitrary HTML is not rendered. Markdown links/images and structured embedded content are not implemented as active overview elements. Relationship buttons, section buttons, and external commands are interactive; prose references are not (`EchoDocumentationPopup.tsx:470–505,634–647,729–738`).

**Confirmed:** Escape, outside `mousedown`, and Close dismiss the dossier. There is no pointer-leave handler (`EchoDocumentationPopup.tsx:312–333`). The root is a labeled `role="dialog"`, has `select-none`, and has viewport clamping and scrolling; its content section has an independent fixed-height scroll area (`:338–357,470–484`). It does not programmatically focus an initial control, contain focus, or restore a captured selection. The editor's close callback only calls `view.focus()` (`MarkdownEditor.tsx:202–214`).

**Inferred:** Click activation can move the caret through the browser/CodeMirror pointer sequence before the click handler runs. Returning focus can affect viewport behavior. The source therefore supports preserving the mounted editor, but does not prove the full cursor/selection/scroll guarantee requested for E3. `select-none` also works against text copying. These require mounted browser reproduction, not a runtime-bug assertion.

### Safe reuse for preview recognition

Reuse the current React renderer's escaping and formatting behavior, with a text-leaf rendering hook. Build Echo buttons only from eligible candidate spans in displayed human-readable text. Keep inline code literal; do not scan raw HTML, frontmatter, Markdown destinations, or hidden/suppressed content into clickable controls. Do not concatenate HTML strings or match across arbitrary React element boundaries.

`findCandidateMatches` is an exported function but accepts CodeMirror `Text` and imports CodeMirror infrastructure. `buildLoreSearchIndex` is a pure title/alias index builder, but the scanner currently builds a duplicate index internally (`echoLore.ts:323–352`; `echoExtension.ts:159–184`). E3 should expose a shared pure string/index matcher retaining existing semantics, and keep CodeMirror range/decorations as an adapter. Simply mounting a second editor in the popup would add lifecycle and focus complexity without a product need.

## 4. Identity and nested resolution

### Existing identities are different concepts

| Concept | Confirmed current storage/behavior | E3 implication |
| --- | --- | --- |
| Dynamic recognition | Derived title/character-alias suggestions; no canonical write (`echoExtension.ts:146–233`). | Appropriate for discovering preview references. |
| Explicit session confirmation | UUID and prose range in `EditorState`; no serialization path in the editor (`types.ts:75–81`; `MarkdownEditor.tsx:306–330,416–422`). | Stable during that editor session, not durable author intent. |
| Persistent prose reference | Roadmap future capability, not current Echo serialization (`docs/ROADMAP.md:36–39`). | Separate future scope; not required for nested exploration. |
| Graph/structured field relationship | Explicit plan mutation through `validateAndCreateRelationship` and save (`EntityLinkField.tsx:154–168`). | Read existing IDs if authorized; never create a relationship because text matches. |

**Confirmed:** Relationship projections already retain `targetId`, but the popup calls `onNavigateEntity(rel.targetName)`. The editor then uses `.find` against names/aliases and takes the first matching entity (`echoLore.ts:247–254`; `EchoDocumentationPopup.tsx:634–641`; `MarkdownEditor.tsx:335–347`). This is a confirmed arbitrary-order resolution algorithm, not a reproduced duplicate-name incident. Do not reuse it for E3. Change the future callback to UUID and recheck eligibility at activation.

### Deterministic resolver contract (proposed)

- Resolve a known UUID only against the original context's current allowed set. Missing/ineligible targets yield a neutral unavailable state, with no fallback to a same-title entity and no hidden candidate metadata.
- For dynamic text, normalize names and aliases exactly as current matching does, collect distinct UUIDs, then resolve zero/one/many. Many opens an in-surface chooser; never first-match. Sort chooser rows by category/title and UUID tie-break, and display category plus a distinguishing UUID suffix if otherwise identical. Ordering aids selection, never chooses identity.
- Preserve existing alias support: only `character_fields.aliases`, accepting arrays and legacy comma/semicolon/newline-separated strings (`echoLore.ts:50–64`). Do not invent aliases for other categories or assume top-level legacy alias fields are supported.
- After rename, UUID history still identifies the entity and displays its refreshed title; dynamic old-name text ceases matching unless retained as an alias. Ephemeral confirmed spans can still point to that UUID while their text remains unchanged. A future durable binding would improve reopen/rename behavior, but is not needed to navigate now.
- Revalidate archived/deleted/moved entries for direct activation, Back, Forward, breadcrumb activation, and asynchronous response publication. Do not revive a cached denied entry.

**Confirmed:** Neither `buildScopedEchoEntities` nor `findCandidateMatches` accepts the previewed entity ID as an exclusion (`echoLore.ts:286–317`; `echoExtension.ts:146–233`). Scanning Abyssals' body against that collection can therefore recognize Abyssals itself. The source document also is not generally excluded from the editor's candidate list.

Proposed self/cycle behavior: mark direct self mentions as ordinary text (or a non-navigating “current entry” hint), without removing the entity from the global index. Preserve ambiguity when a term also identifies another UUID: filter the current UUID for activation and explicitly label it if a chooser is shown. Allow deliberate revisits to earlier history entries, including `A → B → A`; do not recursively open or prefetch neighbors. Suppress consecutive duplicate pushes. A path is user navigation history, not a graph traversal algorithm.

**Confirmed legacy discrepancy:** eligibility resolves Universe through `resolveEntityUniverse`, but conversion fills `EchoEntity.universeId` from `meta.universe_id || ''` (`echoLore.ts:82,304–316`). A legacy-name entry may be eligible while carrying an empty projected Universe UUID. Nested scope must come from the original context, never this field.

## 5. Privacy/spoiler/House/Universe boundaries

### Current policy, precisely

| Boundary | Confirmed source behavior | Risk or design consequence |
| --- | --- | --- |
| House input | App first filters `(house_id || 'house-default')` to the active House before passing layout documents (`App.tsx:312–315,1161`). | Important outer isolation layer; preserve it. |
| Echo House helper | Rejects only when both requested House and document House are truthy and differ (`echoLore.ts:302`). | It is not a standalone fail-closed authorizer for missing House values or omitted context. Normalize legacy default ownership consistently. |
| Echo Universe | Requires supplied Universe ID; `resolveEntityUniverse` resolves UUID or a uniquely matching legacy name using supplied universes (`echoLore.ts:292–308`; `universe.ts:130–165`). | No cross-Universe fallback. Legacy name lookup is not House-aware inside that helper. |
| Archived data | Candidate filter checks `meta.archived`; it does not check `meta.status === 'archived'`, Universe archive state, or House registry archive state itself (`echoLore.ts:299–310`). | Do not claim broader archive enforcement; clarify before changing policy. |
| Private/spoiler settings | Echo filter has no private, visibility, draft/speculative, reader mode, or spoiler-cutoff condition (`echoLore.ts:299–310`). | Author Echo is not the reader publication policy engine. No separate explicit-reference privilege exists. |
| Reader projection | Publication filters canonical sources by House/Universe, archive and canon status; spoiler filtering is in its generator (`publication/export.rs:175–244`; `publication/generator.rs:153–180,555`; `publication/models.rs:189–195`). | Reusing author Echo in reader output would broaden visibility. Reader use requires the reader's own filtered source set/projection. |
| Secondary metadata | Converter receives all raw input docs, not just filtered candidates (`echoLore.ts:297,316`). Relationship selection checks connected UUID and relationship archive flag, not endpoint eligibility or Book/milestone scope (`:231–255`). Faction holder names use `allDocs.find` (`:207–211`). Held-office lookup checks House and optional Universe but not archive (`universe.ts:848–887`). | Revalidate titles, aliases, snippets, organization and relationship descriptions before adding nested links; eligibility is more than filtering the root list. |
| Canonical read | `get_document` accepts only an ID, and reads indexed canonical content (`api.ts:1205–1206`; `commands.rs:64–67`; `organization.rs:58–80`). | It does not receive original editor House/Universe or reader policy. Check response metadata before exposing it. This is an application context boundary, not a demonstrated multiuser security breach. |

**Inferred:** With inconsistent or stale plan endpoints, a dossier can display metadata for an entry that would not qualify as a root Echo candidate. Ordinary App data is already House-filtered, so this is not evidence of an actual cross-House leak. Foreign titles may fall back to abbreviated-ID placeholders, and relationship descriptions can still exist independently of a returned endpoint. Reproduction with malformed/stale data is needed before classifying any runtime defect.

**Confirmed:** `classifyLoreDocument` used by the writing document is stricter and different from Echo's resolver: it checks House ownership, catalog registration conflicts, invalid explicit UUIDs, and House-local legacy names (`lorebookNavigation.ts:25–55`). Echo's older helper can fall back from an unknown explicit UUID to a legacy name and considers the whole supplied Universe array (`universe.ts:136–165`). Reconciling these policies is a prerequisite decision, not permission to silently change current visibility during this audit.

**Unknown:** No independent per-entry private/spoiler visibility contract for author Echo was established. Searches of the Echo paths and typed document/Lorebook metadata did not establish one. Unknown metadata keys can exist; their existence alone does not define enforceable policy. Publication “private notes” and draft/speculative filtering must not be reinterpreted as an Echo private flag.

### Four contexts

**Confirmed:** The original document UUID/Universe/House and the current referenced entity are separate editor props/state. Active sidebar scope is separately held in App and Studio. Current preview identity is just the mutable `popupState.entity`. The editor receives no notebook key or explicit visibility/audience token (`MarkdownEditor.tsx:34–59,179–200`; `LorebookStudio.tsx:155,467–470,763–765`; `AppLayout.tsx:893–896`). Thus the four concepts partly exist, but there is no immutable exploration-session context tying them together.

Proposed session context: notebook identity/generation, source document UUID, source House UUID, resolved source Universe UUID, author/reader policy identity and revision, original chapter milestone/continuity, and an eligibility revision. Keep sidebar browsing scope as presentation state only. Current target UUID, current section, and path/history are separate navigation state.

At every hop, intersect the destination with eligibility from that original context. A preview's Universe, its relationship endpoints, a sidebar “All Universes” view, or an explicit UUID must never widen permission. If policy is missing for a new reader context, disable nested resolution rather than reusing the author collection. Close and clear on notebook, House, source document, source Universe, or audience changes; update/revalidate on eligibility changes. A sidebar-only scope change must not retarget authorization.

## 6. CodeMirror and fallback editor lifecycle

**Confirmed:** `EditorView` is initialized with history and destroyed/recreated only when the effect dependencies `engine`, `documentId`, `readOnly`, or `placeholder` change (`MarkdownEditor.tsx:370–439`). Dossier entity changes are not dependencies. Both production callers key the editor by writing document/chapter UUID (`LorebookStudio.tsx:746`; `BookView.tsx:612`). Therefore in-place exploration can preserve the same view without architectural replacement.

**Confirmed:** Only `update.docChanged` calls `onChange`; reference/entity effects are not prose edits (`MarkdownEditor.tsx:416–422`). External `value` changes can replace the entire editor text (`:449–467`), so E3 must not feed preview text into `value`, change the source document key, switch studio tabs, or change the editor engine. Undo state is session-owned and would be lost on recreation.

**Confirmed:** Studio keeps local draft content (`LorebookStudio.tsx:164–169,216–218,748–750`). App queues pending revisions and autosave independently (`App.tsx:232–280,444–480`). Book View has a separate 1,500 ms save timer and explicit flush paths (`BookView.tsx:191–267`). Nested exploration should neither cancel nor flush these timers. An already pending autosave may legitimately complete while exploration is open; “no writes caused by exploration” must distinguish that from existing writer activity.

**Confirmed:** Ordinary document selection flushes pending writing, reads the target, replaces active document state, follows its browsing scope, and records Recent (`App.tsx:600–637`; `recordOpened` at `:556`). By contrast, dossier loading uses the read endpoint and relationship exploration changes only popup state. The backend read route does not update Recent (`commands.rs:64–67`; `organization.rs:58–80`). Open in Lorebook deliberately invokes normal navigation (`MarkdownEditor.tsx:700–703`); Inspect in Web of Thought is also an explicit navigation command (`EchoDocumentationPopup.tsx:418–429`). Preserve that distinction.

**Confirmed fallback:** The textarea branch returns before popup JSX, displays controlled draft text and a save shortcut, and has no Echo inspect command, decorations, or dossier mount (`MarkdownEditor.tsx:537–597`). E3 is not already available there. A shared controller could add a selection/caret Inspect command and the same surface without switching engines. No inline matching overlay is required. Capture `selectionStart`, `selectionEnd`, direction, and textarea scroll for explicit restoration; native textarea undo behavior requires browser/WebView acceptance.

Recommended preservation rules:

- Keep the writing view and DOM node mounted. Exploration pushes must never call `onOpenEntity`, `onOpenDocument`, studio navigation, relationship mutations, Recent, or save APIs.
- Capture source selection and scroll at explicit keyboard/pointer inspection before pointer caret changes, and preserve multiple CodeMirror selections. Map saved ranges through any source edits while exploration remains open.
- On explicit Close/Escape, return focus to the original view without scrolling it; restore position only if the same source session still exists. If the user clicks the editor, preserve that intentional new caret placement rather than overwriting it with an old snapshot.
- On notebook/House change or teardown, clear the session without focusing an obsolete view. Do not hold an old EditorView in long-lived history.

**Unknown:** Exact mounted behavior for pointer caret changes, IME composition, selection restoration, scroll jumps, and native undo in the packaged WebView. Current unit tests do not establish these guarantees.

## 7. Interaction design comparison

The following is design evaluation inferred from the confirmed component boundaries, not a runtime comparison of implemented alternatives.

| Criterion | A — Navigable preview stack | B — Pinned Echo preview | C — Exploration side panel |
| --- | --- | --- | --- |
| Current CodeMirror fit | High: replace `popupState.entity` with UUID history. | High: current click-open dossier already remains until dismissed. Pin matters if hover is added. | Medium: needs a host outside the editor's internal popup placement. |
| Mouse | Click nested reference, same surface; explicit Back. | Promote transient hover on click/Pin; no leave-dismiss after promotion. | Stable large target; may move farther from prose anchor. |
| Keyboard | Existing inspect shortcuts plus focus transfer, buttons, chooser. | Keyboard inspect opens stable immediately; never require pointer pinning. | Shortcut transfers focus into a labeled complementary region. |
| Focus | Needs explicit initial focus and return policy. | Needs transient/stable transitions; no focus stealing on hover. | Focus can alternate between editor and panel; host must retain view. |
| Screen reader | Labeled nonmodal dialog; heading announcement on navigation; native controls. | Transient hint and interactive dialog must have distinct semantics. | Labeled region and navigation landmarks; announce content changes. |
| Narrow windows | Viewport-clamped overlay/sheet; breadcrumb overflow menu. | Same as A; pin control must remain visible. | Docked width competes with existing sidebars; needs overlay mode. |
| Scroll | Dedicated body scroll, per-history restoration. | Pinned body remains scrollable. | More room, but still separate scroll owner. |
| State complexity | History, index, chooser, loading, session context. | Adds mode/timers/anchor transitions to A; not a complete history design by itself. | Shares A's controller plus layout persistence and responsive host state. |
| Editor preservation | Strong if view/key/props remain stable. | Strong under the same invariant. | Strong only if docking never reparents/replaces the editor. |
| Outside CodeMirror | Shared controller/renderer can be adapted to textarea or other hosts. | Same, but anchor-specific hover code stays in adapter. | Most naturally reusable host, after layout work. |
| Testing | Reducer plus mounted dialog/editor tests. | Adds pointer corridors, delayed dismissal, and mode transitions. | Adds docking, layout widths, focus transitions, resizing. |

**Confirmed layout constraint:** AppLayout already has primary/secondary sidebars and a `flex-1 min-w-0` main area, with conditional studio hosts (`AppLayout.tsx:469–476,714–719,863–964`). Lorebook Studio and editor wrappers use overflow containment (`LorebookStudio.tsx:473`; `MarkdownEditor.tsx:601–604`). There is no existing Echo side-panel slot in these hosts. A panel is feasible, but requires more layout integration than extending the dossier.

Recommendation: A+B first. Use a stable overlay/dialog host; consider a portal within the appropriate application context to avoid clipping. Do not portal above the App's inert vault/recovery boundary without an equivalent lifecycle/blocking mechanism (`App.tsx:1153`). Side-panel docking is an optional later host, not an E3 prerequisite.

### Proposed interaction contract

| Action | Proposed result |
| --- | --- |
| Hover editor reference | Optional delayed first-level preview, with no focus transfer. Preserve click/keyboard behavior even if hover is deferred. Delay values require tuning, not a claimed existing requirement. |
| Move anchor → preview | Treat anchor and preview as one pointer region with a short cancellation grace period; cancel dismissal while pointer or focus remains inside. No immediate leave-close. |
| Click reference / keyboard Inspect | Open stable interactive exploration immediately. No separate mandatory Pin step. Keyboard opening focuses heading or first navigation control. |
| Activate transient surface / Pin | Promote to stable; choosing a nested target also promotes atomically. |
| Hover nested term | Lightweight title/identity hint only; never a second dossier or history push. |
| Click nested term / Enter / Space | Navigate within the current surface; ambiguous terms present an inline chooser. Keep current body visible during loading or show a clear loading region for the destination without mislabeling old content. |
| Back / Forward / breadcrumb | Restore target UUID, section, preview scroll, and a meaningful focus position. A new branch after Back truncates Forward history. |
| Escape | Cancel an active in-surface chooser first; otherwise close exploration, at every depth. Back is a separate named control, avoiding depth-dependent Escape surprises. |
| Close / outside pointer | Close the stable surface. Outside-click handling must not steal focus from the clicked editor/control. Transient hover may dismiss after grace period. |
| Tab / Shift+Tab | Navigate native controls; provide a clear Return to editor control. As a nonmodal dialog, do not trap users away from the editor. Do not set `aria-modal=true` without implementing a modal interaction. |
| Screen-reader navigation | Name dialog and reference controls, announce destination/loading politely, expose disabled Back/Forward state, preserve usable heading order. Avoid hundreds of separately announced duplicate controls where a repeated-reference strategy suffices. |
| Select/copy | Make prose selectable; ordinary drag/copy does not navigate. Activation requires a click without an active drag selection. |
| Long body scroll | Independently scroll the body, retain visible header/navigation, contain wheel overscroll, and save preview scroll per history entry. Never force the editor scroll to follow preview navigation. |
| Return to writing | Restore focus under the lifecycle rules in section 6; no text transaction, document open, Recent entry, or save flush. |

## 8. Recommended architecture

### Derived session and shared services (proposed)

1. **Original context provider.** Extend editor integration with notebook/session identity, normalized source House/Universe, eligibility revision, and applicable audience policy. Retain chapter milestone/continuity. The currently previewed entity never becomes the authorization root.
2. **Eligible catalog/index.** Reuse current Echo eligibility as the policy baseline and explicitly resolve the documented ownership discrepancies before production changes. Build UUID lookup and normalized term index once per catalog/context revision. Feed only allowed data to all candidate labels and dossier projections.
3. **Pure matcher adapter.** Share name/alias/boundary rules between CodeMirror and safe preview text leaves. CodeMirror remains responsible only for its own ranges/decorations. Preview controls use React text/button nodes. Do not globally mutate the index to exclude a current entity; apply per-preview self-navigation behavior.
4. **Exploration controller.** Session-local reducer/state machine: closed, transient (optional), stable, choosing, loading/ready/unavailable. Store UUID history entries with section/scroll state, current index, source restoration token, and request generation. The writer document state remains outside this controller.
5. **Read-only loader.** Check eligibility before reading, request canonical detail by UUID, verify returned UUID/House/Universe/archive status against the session before rendering, and discard stale responses after context/request changes. Expose loading, retry, missing, denied, and empty states without leaking hidden names/snippets.
6. **Dossier content renderer.** Reuse template suppression, formatting subset, sections, organization/relationship display, and historical badge helpers. Extend text-leaf reference rendering and use UUID actions. Supply data rather than mutating `entity.description`. Separate content from shell, loader, and navigation callbacks so fallback/panel hosts can reuse it.
7. **Stable surface and adapters.** One dialog/overlay; CodeMirror anchor and caret adapters, optional textarea Inspect adapter. Open Entry and Inspect in Web of Thought remain explicit exit actions using established save/navigation guards.

Conceptual data flow:

```text
source document + notebook/House/Universe/policy + chapter context
    -> eligible UUID catalog + compiled term index
    -> editor activation -> exploration session/history
    -> authorized UUID read -> response validation -> display projection
    -> safe Markdown text leaves -> nested candidate activation
    -> same session/history (original context unchanged)

Explicit Open Entry -> existing guarded document navigation
Exploration          -> no canonical mutation or Recent update
```

### Storage conclusion

**Confirmed:** Existing canonical Markdown/frontmatter and document UUIDs supply the necessary content and identity; the current rendering/navigation paths already operate on derived state (`storage.rs:830–855`; `echoLore.ts:259–275`; `MarkdownEditor.tsx:335–347`). E3 can stay entirely derived. No new SQLite table, serialized history, Markdown rewrite, automatic relationship, or ownership change is required.

A future persistent UUID prose binding could preserve author choices across reopen, renames, alias changes, imports, and ambiguity. That feature needs explicit serialization, span invalidation, edit/undo behavior, portable-ID remapping, and migration decisions. It should be a separate design, not slipped into nested exploration because both have been labeled E3.

## 9. Performance and cycle handling

**Confirmed baseline:** Matching scans the entire source and rebuilds the term map, sorted terms, escaped regex, and candidate list on relevant transactions (`echoExtension.ts:153–205,277–290`). It is recomputed after edits, not incrementally limited to changed ranges. Conversion is memoized by document/plan/scope identities (`MarkdownEditor.tsx:170–173`), but each conversion can scan relationships/documents for profiles and organization (`echoLore.ts:186–255`). Existing chapter performance coverage uses about 6,000 words and a small mock catalog (`phase_e2_5_chapter_editor_integration.test.ts:593–606`); it does not establish scaling to thousands of entities.

**Confirmed loader limits:** An `isMounted` closure prevents an old entity-ID request from updating after effect cleanup, but does not cancel work. The dependency is only `entity.id`, not context/eligibility revision. The response's metadata is not checked before display; prose is cached by mutation of the entity object, yet every entity-ID change still reads again (`EchoDocumentationPopup.tsx:282–310`). On failure it retains the initial description and removes loading; no explicit error view is rendered in the overview (`:300–305,488–510`).

**Inferred:** An open dossier can become stale on same-ID ownership/eligibility changes without a source-document switch. Switching ID A → B is guarded by cleanup, but a notebook switch reusing an ID or a stale returned metadata list needs stronger session identity. No such runtime race was reproduced here.

**Confirmed historical cache:** Cache key is Universe, milestone, plan revision, and property; size is capped at 25. It does not include notebook, House, or document revision. `clearHistoricalResolutionCache` is exported; a source search found no caller elsewhere in `src` (`stateEngine.ts:918–964`). **Inferred:** Cross-notebook identity/revision reuse or metadata-only updates could reuse a stale projection. E3 should namespace/invalidate historical results at its session boundary; do not treat this as a reproduced historical-state defect.

Proposed performance policy:

- No recursive rendering or neighbor prefetch. Resolve references eagerly only for the visible displayed section, and fetch destination bodies lazily on activation. Back/Forward can reuse validated cached bodies.
- Compile normalized names/aliases and UUID lookup once per eligible-catalog revision. Keep a CodeMirror adapter using existing matching semantics; optimize editor scanning only if profiling justifies it as separate scoped work.
- Allow revisits and arbitrary user exploration depth without a recursive call stack. Keep at most **50 history visits**, dropping the oldest visit when full and indicating truncated history. This bounds retained UI state while allowing continued exploration; 50 is a proposed tunable default, not a domain limit. Breadcrumbs show a compact tail and an overflow history menu.
- Suppress consecutive duplicate UUID pushes; revisiting a nonconsecutive entity is allowed and does not imply a cycle error. Never follow a detected name automatically.
- Keep history lightweight (UUID, section, scroll, focus key), not copies of full bodies/React trees. A proposed session-local body cache can retain up to 20 entries and a total text-size budget (initially 2 MiB), with LRU eviction. Large current bodies remain readable without being retained after leaving; profile realistic documents before finalizing budgets.
- Key caches by notebook identity, original House/Universe, audience policy revision, entity UUID and content revision. Include milestone/branch/plan revision in historical projections and catalog revision in text-match results. Invalidate on save/reload/rename/alias edit/archive/delete/move/import and notebook/House/policy changes; clear source-session history on authorization-context change.
- If IPC cannot abort an issued `getDocument`, use request/session generations to discard the result and bound in-flight requests. Cleanup is still required for any timers/observers. Do not assume AbortController cancels Tauri invoke.
- Profile 100/1,000/10,000 entity catalogs with long aliases and repeated matches, plus 6k/50k-word bodies. Measure cold index build, edit-to-decoration latency, activation-to-ready, history memory, and stale-request counts. Choose worker/trie/changed-range optimization only from evidence; do not replace matching semantics preemptively.

## 10. Cross-feature regression risks

| Feature | Confirmed integration or boundary | Proposed E3 protection / evidence still needed |
| --- | --- | --- |
| Universe navigation | Source attribution and sidebar scope are separate (`LorebookStudio.tsx:155,467–470`; `lorebookNavigation.ts:68–82`). | Sidebar scope never grants nested visibility. Test source Universe A while browsing B/all. |
| House switching | App flushes writing, increments House generation, and clears incompatible active document (`App.tsx:325–367`). | Immediately invalidate session and pending results; never switch House to satisfy a nested target. |
| Echo settings | Toggle changes entity set; fallback returns a different UI branch (`MarkdownEditor.tsx:147–173,441–447,537–597`). | Close when disabled; clear transient hover timers; engine changes end the session without interpreting them as navigation. |
| Relationship graph | Relationships carry UUID endpoints and contextual identity (`relationships.ts:29–37`); fields save explicit relationships (`EntityLinkField.tsx:154–168`). | Read existing authorized targets only. Do not call linking, undo-unlink, graph mutation, or plan-save functions. |
| Web of Thought | Dossier has explicit Inspect navigation (`EchoDocumentationPopup.tsx:418–429`). | Preserve the original chapter milestone/branch and selected target UUID; normal exploration must not invoke Inspect. |
| Historical/alternate states | Badge derives from chapter context, independently of current prose (`MarkdownEditor.tsx:469–535`). Relationship projection itself does not filter contextual Book/milestone relationships (`echoLore.ts:233–255`). | Keep original history context on every hop. Do not imply that the whole body/profile/relationship section is a historical snapshot. Contextual relationship display policy needs a product decision. |
| Books/chapters | Separate in-Book draft/save timer and shared editor (`BookView.tsx:191–267,611–634`). | Test both editor hosts; do not remount Book View or change active chapter during exploration. |
| Manuscript Tools and other studios | Current Echo-enabled editor call sites are Lorebook/Book View; ManuscriptAssembler is a different conditional host (`AppLayout.tsx:912–934`). | Do not claim existing Echo coverage in every studio or assembled publication. Shared controller allows future opt-in with explicit context. |
| Publication/spoilers | Independent canonical source filtering and reader projection (`publication/export.rs:175–244`; `publication/generator.rs:153–180`). | No UI recognition tokens or author-only bodies in publication output; reader use needs reader policy, not live author Echo. |
| Portable Universe | Format excludes Echo/editor state and reconstructs derived data; no persistent prose-span records (`PORTABLE_UNIVERSE_FORMAT_V1.md:296,395–396`). | Do not export history/cache; clear after import/ID remapping and rebuild from acknowledged canonical data. |
| Vault/recovery | App blocks underlying content during vault/restart state (`App.tsx:1153,1330–1335`). | Session/cache must not survive notebook activation or restore. Keep a portal under blocking semantics; never run repair/restore from preview. |
| Unsaved current entry | Preview reads canonical saved body, while writer uses local draft (`EchoDocumentationPopup.tsx:291–296`; `LorebookStudio.tsx:164–169`). | Do not save just to inspect. Decide whether previewing the source itself reads saved text or a clearly labeled in-memory draft. |

**Unknown:** Packaged Windows behavior across pointer movement, high-DPI window resizing, native clipboard, IME, screen readers, and recovery overlays. No packaged build or live notebook was opened for this audit.

## 11. Required product decisions

1. **Scope/name:** Is “E3” nested exploration only, or should the roadmap's persistent explicit-reference milestone be renamed/split? Recommendation: separate nested exploration from persistence.
2. **Initial activation:** Ship stable click/keyboard exploration first, or include hover in the same acceptance scope? Recommendation: stable activation first; hover is optional and must promote without an extra mandatory Pin step.
3. **Visibility:** What is the documented author Echo private/spoiler contract? Recommendation: preserve existing author policy, keep reader publication separate, and explicitly decide any new restriction before implementation. Never infer new private flags.
4. **Ownership discrepancies:** Should Echo align with `classifyLoreDocument` for invalid UUIDs, catalog-only ownership, House-local legacy names, and missing House? Recommendation: document and approve consistent rules, then test them; do not silently broaden eligibility.
5. **Archive semantics:** Does legacy `status: archived` count for Echo, and can an archived Universe be inspected? Existing candidate filtering does not answer those consistently with publication.
6. **Nested text coverage:** Overview prose only, or also attributes, author state notes, organization descriptions, and existing relationships? Recommendation: overview plus existing UUID relationship actions first; extend other fields after visibility rules are specified.
7. **Self/draft behavior:** Non-navigating self mentions versus reopen; saved body versus in-memory source draft. Recommendation: suppress redundant self pushes and label any draft source explicitly.
8. **History:** Include Forward in initial scope? Accept 50 retained visits and truncation indication? Recommendation: Back and Forward together, capped retained state without a traversal-depth limit.
9. **Keyboard and narrow layouts:** Confirm nonmodal dialog, Escape-to-close, chooser Escape-to-cancel, Return to editor, and overlay/sheet on narrow widths. Side docking can be deferred.
10. **Fallback parity:** Add a textarea Inspect command now or declare E3 unavailable there initially? Recommendation: shared command/surface if parity is an acceptance requirement, without trying to recreate CodeMirror decorations.
11. **Historical presentation:** Should contextual relationships and current profiles be labeled separately from milestone-resolved status? The current body is canonical current prose, not a reconstructed historical document.

## 12. Proposed implementation phases

These are future phases requiring explicit implementation approval; none was implemented during this audit.

| Phase | Proposed scope | Exit criteria |
| --- | --- | --- |
| 0 — Contract | Resolve section 11 decisions; establish baseline ownership/visibility matrix and original-context shape. | No implicit policy change; E3/persistence scope clearly separated. |
| 1 — Shared resolution | Extract pure indexed matching adapter, use UUID navigation for existing relationships, add session/context validation and read-only loader. | Duplicate titles never auto-select; denied/missing targets never fall back; stale responses discarded. |
| 2 — Stable navigation | Add lightweight Back/Forward history and reuse safe dossier content with overview text-leaf controls; add inline ambiguity chooser, selectable prose, body scroll, focus restoration. | One surface; editor instance/selection/undo/scroll unchanged; no writes or Recent side effects. |
| 3 — Host and context coverage | Both Lorebook and Book chapter hosts, historical context, scope invalidation, optional textarea Inspect. | House/notebook/Universe switches clear safely; autosave continues; explicit Open Entry remains guarded. |
| 4 — Optional hover and docking | Only if approved: transient initial hover/promotion; later optional side-panel host. | No pointer corridor flicker, focus stealing, hover-only access, or editor remount. |
| 5 — Acceptance | Performance profiling and packaged Windows scenarios, followed by documentation. | Evidence for real UI preservation, visibility, accessibility and narrow-layout behavior; no persistence/schema work mixed in. |

Expected effort is driven by context correctness and UI integration rather than basic stack mechanics. Backend/schema work is not required by the feature concept; a future context-aware read API may be useful hardening but would need its own approved scope and tests.

## 13. Automated and Windows acceptance strategy

### What exists and what was verified

**Confirmed test run:** The following existing suites were run without editing tests or fixtures:

```text
node_modules/.bin/tsx.cmd --test tests/echo_editor_prototype.test.ts tests/phase_e2_live_lore_recognition.test.ts tests/phase_e2_5_chapter_editor_integration.test.ts tests/issue_a_b_wrapping_dossier.test.ts tests/phase_w4_echo_historical_context.test.ts tests/acceptance_remediation.test.ts
Result: 82 tests passed; 0 failed, cancelled, skipped, or todo.
```

Coverage includes case/boundary/alias/ambiguity recognition; mapped ephemeral reference ranges; unchanged text and undo/redo; scope filtering; canonical-body conversion; safe formatting and factory suppression; chapter state resolution and cache revision behavior. Evidence: `echo_editor_prototype.test.ts:33–344`; `phase_e2_live_lore_recognition.test.ts:249–545`; `phase_e2_5_chapter_editor_integration.test.ts:248–606`; `issue_a_b_wrapping_dossier.test.ts:56–206`; `phase_w4_echo_historical_context.test.ts:227–568`; `acceptance_remediation.test.ts:104–143`.

**Confirmed limitation:** Despite integration/acceptance names, much coverage builds `EditorState` directly, calls pure functions, or renders markup without mounting the production editor. For example, “chapter switching with stale-context protection” dispatches `setEntitiesEffect`, not a delayed API response or a mounted House switch (`phase_e2_5_chapter_editor_integration.test.ts:331–359`). The 6k-word test is a matcher timing assertion over a small catalog (`:593–606`). These cannot prove browser focus, scrolling, mounted lifecycle, or large-Lorebook performance.

**Confirmed existing browser harness:** `tests/browser/acceptance.tsx:111–125` mounts the real dossier for template suppression and section controls. `docs/acceptance-remediation-beta4.md:35–36` records previous responsive checks at 320×700 and 1280×800. Those are repository evidence of prior checks, not checks rerun during this audit. No browser or packaged Windows acceptance was performed here. No Rust suite/build was needed for this documentation-only investigation.

### Proposed E3 coverage matrix

U = pure unit/CodeMirror state test; B = mounted React plus real browser integration; W = packaged Windows WebView acceptance. These are proposed tests, not newly created or claimed passing.

| # | Scenario | Required level and assertions |
| --- | --- | --- |
| 1 | One-level preview | U+B+W: scoped target, body loading/empty/error, existing section rendering, unchanged source document. |
| 2 | Nested preview | U+B+W: safe text-leaf activation, one surface, destination UUID, immutable original context. |
| 3 | Three or more levels | U+B: correct path/order; no extra popovers or source-document open. |
| 4 | Back/Forward | U+B+W: history index, truncation after branching, section/preview-scroll/focus restore. |
| 5 | Self-reference | U+B: own names/aliases do not push consecutive duplicate visits; collision with another UUID stays deterministic. |
| 6 | Circular reference | U+B: A→B→A and A→B→C→A work by explicit activation; no recursive fetch/render. |
| 7 | Duplicate names | U+B: title/title and title/alias collisions require chooser; different input order never silently changes target. |
| 8 | Alias resolution | U+B: array and legacy string aliases, case/Unicode/boundaries, rename refresh; unsupported fields are not invented aliases. |
| 9 | Missing/archived | U+B: stale history/direct UUID/body response revalidated; no same-title replacement; generic unavailable state. |
| 10 | Cross-Universe | U+B+W: source A remains authoritative while preview/sidebar/relationship points at B; no forbidden title/snippet exposed. |
| 11 | Cross-House | U+B+W: root, alias chooser, endpoint metadata, organization, body response and history all remain scoped; legacy default House cases included. |
| 12 | Private/spoiler-restricted | U+B+W: current author policy fixtures plus separately approved reader-filtered projection; explicit UUID does not bypass policy. Do not write tests assuming a nonexistent Echo private flag. |
| 13 | Stale async results | B: deferred promises for A→B, same-ID revision, denied-after-request, close/reopen; only newest session/request can publish. |
| 14 | Notebook/House switching | U+B+W: invalidate context/generation, history, cache, pending results and hover timers, including UUID reuse. |
| 15 | Escape/keyboard | B+W: both inspect shortcuts, actual focus entry, Tab/Shift+Tab, Enter/Space, chooser cancellation, Back/Forward, close and return. Check screen-reader names/announcements. |
| 16 | Pointer corridor | B+W: slow anchor→surface crossing, gaps, diagonal motion, hover promotion, leaving/reentering; no flicker or focus theft. |
| 17 | Copy text | B+W: drag-select overview text, Ctrl+C copies expected text; selecting does not navigate or close. |
| 18 | Long preview | B+W: body wheel/keyboard scroll, stable navigation header, no editor scroll chaining; Back restores preview scroll. |
| 19 | Unsaved CodeMirror | B+W: explore before pending debounce, during save, in manual mode and after save failure; draft bytes unchanged and existing save operation preserved. |
| 20 | Selection/undo/scroll | U+B+W: compare actual EditorView/DOM identity, all selection ranges and scroll offsets before/after open/nav/close; undo/redo target only author edits. Include IME and continuing source edits. |
| 21 | Fallback | B+W: if supported, Inspect uses native caret/selection, returns without engine switch, preserves text/scroll/native undo and Ctrl+S. Otherwise verify explicit unsupported behavior. |
| 22 | Narrow Windows | B+W: 320×700, typical desktop, high DPI/zoom and live resize; chooser, breadcrumbs and Close stay reachable; editor remains mounted. |
| 23 | No canonical writes | U+B+W: spy on save/plan/link/archive/metadata APIs; compare canonical Markdown/frontmatter/plan/index state before/after an exploration-only scenario. Separate pre-existing autosave completion. |
| 24 | No Recent/history updates | B+W: no opened/Recent writes or active document changes during exploration; explicit Open Entry uses existing guard and intentionally updates navigation. |
| 25 | Large Lorebook | U+B+W: catalog/body size matrix, repeated names, bounded history/cache and requests; measure latency and retained memory without machine-fragile claims from tiny fixtures. |

Additional regressions: malicious HTML and Markdown destinations stay inert; template suppression precedes linkification; no matching inside frontmatter/code; visibility changes while chooser is open; relationship target rename uses UUID; historical badges retain original chapter context; import/restore invalidates session; publication/portable output contains no UI-generated references or navigation state.

Packaged acceptance should use a disposable notebook and deliberate fixture data. Snapshot source UUID, content, selection, scroll, undo behavior, Recent list, plan revisions, ownership, and output before and after exploration. Do not run migrations or repairs as part of verification. No such acceptance data was created during this audit.

## 14. Source references

Key source entry points, with line numbers for the inspected checkout:

| Source | Relevant lines |
| --- | --- |
| [package.json](../package.json) | 4: version; 9: configured test suites. |
| [echoLore.ts](../src/utils/echoLore.ts) | 50–64 aliases; 70–89 body/metadata conversion; 186–255 offices/organization/relationships; 259–275 projected identity/body; 286–317 eligibility; 323–352 reusable index. |
| [echoExtension.ts](../src/components/echo/echoExtension.ts) | 19–40 entity effects; 65–71 confirmed DOM identity; 80–134 range lifecycle; 146–233 matcher; 245–252 candidate DOM data; 260–296 recomputation; 309–355 click dispatch. |
| [MarkdownEditor.tsx](../src/components/editor/MarkdownEditor.tsx) | 34–59 input context; 138–173 toggle/scope; 178–214 popup lifetime/focus; 216–330 activation/confirmation; 335–347 name-based navigation; 370–467 view lifecycle/synchronization; 469–535 historical context; 537–597 fallback; 693–715 dossier/chooser integration. |
| [EchoDocumentationPopup.tsx](../src/components/echo/EchoDocumentationPopup.tsx) | 23–29 callback API; 45–163 safe Markdown subset; 262–310 async body loading; 312–357 dismissal/geometry/dialog; 418–429 explicit Web of Thought action; 470–505 sections/body; 634–647 name-based relationship buttons; 729–744 explicit Open Entry. |
| [EchoClarificationModal.tsx](../src/components/echo/EchoClarificationModal.tsx) | 22–53 dismissal, placement, dialog; 87–120 candidate labels/buttons. |
| [Echo types](../src/components/echo/types.ts) | 54–72 dossier fields; 75–107 ephemeral UUID span, candidate and popup state; 109 onward historical context. |
| [EchoEditorPrototype.tsx](../src/components/echo/EchoEditorPrototype.tsx) | 16–17 mock data; 103,165–174 mock resolution; 202–229 editor setup; 415–425 shared popup/chooser. |
| [SettingsModal.tsx](../src/components/common/SettingsModal.tsx) | 305 prototype entry point. |
| [LorebookStudio.tsx](../src/components/studios/LorebookStudio.tsx) | 155–181 browsing scope/draft/engine; 216–218 synchronization; 467–473 source attribution/layout; 743–765 production editor. |
| [BookView.tsx](../src/components/studios/lorebook/BookView.tsx) | 191–267 draft loading/autosave/flush; 611–634 production editor/context. |
| [App.tsx](../src/App.tsx) | 232–280 save pipeline; 312–319 House filtering/browse scope; 325–367 House switch; 444–480 queued autosave; 556 Recent helper; 600–650 guarded normal open; 1153–1162 inert boundary/layout inputs; 1330–1335 recovery/restart UI. |
| [AppLayout.tsx](../src/components/layout/AppLayout.tsx) | 469–476,714–719 sidebar/main layout; 885–909 production Studio inputs; 912–934 Manuscript host; 940–960 dashboard host. |
| [universe.ts](../src/utils/universe.ts) | 105–112 metadata parse; 130–165 UUID/legacy Universe resolver; 544 onward legacy entity matching; 848–887 reverse office lookup. |
| [lorebookNavigation.ts](../src/utils/lorebookNavigation.ts) | 25–55 stricter source attribution; 68–82 independent sidebar filtering/preferences. |
| [loreTemplateProse.ts](../src/utils/loreTemplateProse.ts) | 3–24 exact display-only template suppression. |
| [stateEngine.ts](../src/utils/stateEngine.ts) | 918–964 historical cache/key/limit and lookup/clear function. |
| [EntityLinkField.tsx](../src/components/studios/lorebook/EntityLinkField.tsx) | 93–103 candidate source; 137–151 legacy analysis; 154–168 explicit canonical relationship creation. |
| [relationships.ts](../src/utils/relationships.ts) | 29–37 contextual relationship identity/filtering. |
| [types/index.ts](../src/types/index.ts) | 27–30 metadata/body separation; 172–200 character aliases/unknown keys; 267 onward Lorebook metadata. |
| [api.ts](../src/services/api.ts) | 192–195 browser mock read; 1202–1206 metadata listing and body read APIs. |
| [commands.rs](../src-tauri/src/commands.rs) | 38–67 House-scoped list and UUID read routes. |
| [organization.rs](../src-tauri/src/organization.rs) | 58–80 canonical read/identity handling without persistence. |
| [storage.rs](../src-tauri/src/storage.rs) | 814–855 safe body/frontmatter read. |
| [publication/export.rs](../src-tauri/src/publication/export.rs) | 175–244 source ownership/archive/canon filtering; 246 onward explicitly selected chapter sources. |
| [publication/generator.rs](../src-tauri/src/publication/generator.rs) | 153–180 reader projection/cutoff; 555 onward historical filtering. |
| [publication/models.rs](../src-tauri/src/publication/models.rs) | 189–195 spoiler/archive options. |
| [ROADMAP.md](ROADMAP.md) | 36–39,114: existing E3 persistent-reference scope. |
| [Portable Universe format](PORTABLE_UNIVERSE_FORMAT_V1.md) | 296,395–396: excluded UI state and reconstructed Echo data. |
| [Acceptance remediation report](acceptance-remediation-beta4.md) | 12–13 display suppression/sections; 35–36 prior browser/viewport evidence; 60 packaged checklist. |
| [E0 tests](../tests/echo_editor_prototype.test.ts) | 33–344 recognition, ephemeral confirmation, unchanged prose. |
| [E2 tests](../tests/phase_e2_live_lore_recognition.test.ts) | 249–545 matching, aliases, ambiguity, scope, undo/performance. |
| [Chapter integration tests](../tests/phase_e2_5_chapter_editor_integration.test.ts) | 248–606 scope, fields, state preservation, save coordinator, 6k-word matcher. |
| [Dossier formatting tests](../tests/issue_a_b_wrapping_dossier.test.ts) | 56–206 canonical-body conversion and safe renderer. |
| [Historical Echo tests](../tests/phase_w4_echo_historical_context.test.ts) | 227–568 milestone/branch resolution and cache behavior. |
| [Acceptance remediation tests](../tests/acceptance_remediation.test.ts) | 104–143 factory suppression, relationship description preservation, ordinary items. |
| [Browser acceptance harness](../tests/browser/acceptance.tsx) | 111–125 mounted dossier suppression/section controls. |

Implementation remains unapproved and unstarted. The report deliberately leaves runtime-only behavior and unresolved policy choices labeled rather than claiming defects or changing application behavior to resolve them.
