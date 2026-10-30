# House, Universe, and Lorebook navigation architecture audit

Audit date: 2026-10-30 (Asia/Shanghai). Inspected checkpoint: `f6113ffe3c9a2f9a5358d24662b147032a9a419b`, titled `0.8.0-beta.4`. The working tree was clean before this audit.

This is a source-code investigation. No application code, tests, fixtures, schemas, database, notebook records, UI preferences, or release metadata were changed. No application was launched, no data migration or integrity repair was run, and no tests/builds were executed. The only file written is this report.

Evidence labels used throughout:

- **Confirmed**: directly verified in the inspected source. This includes the presence or absence of checks in a specified code path; it does not claim a runtime reproduction.
- **Inferred**: a likely consequence of the verified implementation, requiring runtime reproduction or product confirmation.
- **Unknown**: not established by this source-only investigation.

## 1. Executive summary

**Confirmed — the Lorebook Entries sidebar is a House-wide document browser.** `AppContent.loadLibrary` fetches the notebook-wide indexed document list. `houseDocuments` filters it by the active document House ID. `AppLayout` receives that House-wide array and calls `selectLibrary` with studio, tags, All/Favorites/Recent, sorting, and search filters. Neither that call nor the selector has a Universe filter. Rows do not display a Universe attribution. [App loading][app-load], [House projection][app-house], [layout selector][layout-filter], [library selector][org-select], [row rendering][layout-rows].

**Confirmed — Universe-scoped browsing already exists in the main Lorebook workspace, not in this sidebar.** `UniverseDashboard` derives `universeDocs` using `getUniverseEntities`. Its worldbuilding search/category filtering operates on those documents. `LorebookStudio` owns `activeUniverseId` locally and mirrors it to the unnamespaced `mc_active_universe_id` preference. `AppContent` has shared canonical planning data, but no shared reactive active-Universe state. [Studio selection][studio-state], [Dashboard collections][dashboard-docs], [App state][app-state].

**Inferred — the observed mixing is primarily a missing browsing-scope/attribution feature, not evidence of records being assigned to multiple Universes.** The existing House-wide projection directly explains the observation for valid records. **Unknown:** whether House-wide sidebar browsing was an explicit product decision, and whether the user's actual records have any attribution inconsistencies; their notebook data was not inspected.

**Recommendation — Option A, with one controlled Lorebook browsing state shared by the sidebar and Lorebook workspace.** Own that UI state in their existing common ancestor, `AppContent`, and pass it through `AppLayout`; do not add another independent localStorage-backed selection or filter the shared document prop globally. Reuse the existing UUID and House selectors after addressing their legacy/archive semantics. Option B has no reliable existing global active-Universe state to reuse. Option C is a useful optional presentation for an All Universes view, but grouping alone does not provide an explicit workspace scope.

**Highest risks:** narrowing shared document inputs; legacy-resolution differences; stale Book/Universe preferences; creation fallbacks and incomplete backend attribution validation; import refresh; and bypassing existing save-before-navigation coordination.

## 2. Current ownership model

| Object | Canonical representation and relationship | Evidence |
| --- | --- | --- |
| House / House of Thought | **Confirmed:** `HouseRecord` in `library.json.house_registry`. Stores House identity, enabled studios, archive flag, and `universe_ids`. The displayed House of Thoughts name is not a separate ownership object. | [House types][house-model], [registry read][registry-read], [HouseSwitcher][house-switcher] |
| Universe | **Confirmed:** `Plan.universes[]` inside the shared Lorebook planning document's `_web_of_thought` JSON frontmatter. Universe itself has no `house_id`; ownership comes from the House registry. An unmapped Universe resolves to `house-default` for legacy compatibility. | [planning types][thought-types], [catalog persistence][thought-save-file], [House resolver][house-utils] |
| Lorebook entry / entity | **Confirmed:** an ordinary Markdown document with JSON frontmatter. Top-level `house_id` identifies its House; nested `metadata.universe_id` identifies its world. `metadata.universe` is a legacy/display name. `Plan.entities[]` separately records document UUID → Universe ID for planning references. | [document types][doc-model], [frontmatter parsing][storage-read], [Lorebook metadata][lore-types], [entity registration][entity-sync] |
| Book | **Confirmed:** a `Plan.books[]` record with `id`, `universe_id`, continuity, optional `branch_id`, description and archive flag. A new Book is not a chapter document or a folder; it may contain zero chapters. Its House follows its Universe. | [planning types][thought-types], [Book creation][book-create] |
| Chapter | **Confirmed:** a Lorebook Markdown document with `entry_type: chapter`, `universe_id`, `book_id`, optional `chapter_order` and `milestone_id`. These are references; `parent_id`, filename and title are not the authoritative Universe/Book identity. Legacy Book-name matching also exists. | [metadata type][lore-types], [chapter creation][chapter-create], [chapter selector][chapter-selector] |
| Milestone / Chronicle | **Confirmed:** `Plan.nodes[]` holds Universe/optional Book/optional branch IDs, state and relationship changes, and narrative in the existing `description`. A Chronicle is the milestone's narrative presentation, not another ownership container or a copied chapter. | [planning types][thought-types], [narrative functions][narrative], [Explorer rendering][explorer-narrative] |
| Continuity / alternate timeline | **Confirmed:** a Book continuity value plus optional `Plan.branches[]` records. Branches belong to a Universe and reference a divergence milestone and optional parent branch. Historical state is resolved at a milestone; an alternate history is not another Universe membership for the entity. | [planning types][thought-types], [branch validation][thought-validate], [state resolution][state-resolve] |
| Web of Thought | **Confirmed:** the planning records are canonical; the planner, aggregate relationship graph, inferred office rows and resolved state matrices are views/projections over them and documents. One shared planning catalog can contain multiple Houses' Universes. Its own default-House document attribution does not make every contained Universe default-House-owned. | [catalog persistence][thought-save-file], [catalog protection][thought-archive], [graph projection][graph-scope] |
| Universe Dashboard | **Confirmed:** a React projection over a Universe ID, canonical plan and supplied documents. Its local tab, search and category selection are not canonical ownership. | [Dashboard state][dashboard-state], [Dashboard collections][dashboard-docs] |
| SQLite / sidebar rows | **Confirmed:** SQLite indexes document metadata, including `house_id` and `metadata_json`. The rendered rows are a further in-memory projection. SQLite is not the canonical source of Lorebook writing or the House registry. | [index schema/query][db-list], [disk read][storage-read], [index rebuilding][reindex] |

**Confirmed — one entry does not have a supported multi-Universe ownership list.** `LorebookMetadata.universe_id` is optional and scalar; the planning entity record is `{id, universe_id}`. Backend planning validation rejects duplicate IDs and invalid entity Universes. Mentioning or linking another entity is not additional ownership. Shared entities across Universes would need an explicit future design, not title matching or inclusion in two sidebar groups. [Types][lore-types], [plan validation][thought-validate].

**Confirmed — House-only/unassigned entries can exist.** Generic document creation validates the House and studio but does not require a Lorebook Universe. Legacy frontmatter may lack `house_id` (defaults to `house-default`) and/or Universe metadata. The ordinary creation dialog requires a target Universe for Add to Existing Universe, which is a UI workflow constraint, not a universal persistence invariant. [Generic creation][backend-create], [frontmatter defaults][doc-model], [dialog submission][create-submit].

Ownership across lifecycle operations:

- **Confirmed — creation:** the dialog writes the chosen Universe ID and display name into metadata. `AppContent.handleCreateDocument` supplies the active House ID separately. Main Universe creation writes the plan and then the House registry, with a rollback attempt if registry assignment fails. [Dialog][create-submit], [App create][app-create], [Universe command][backend-create-universe].
- **Confirmed — document move:** a Universe-owned Lorebook entry cannot be arbitrarily moved to a different owning House. The command checks explicit/legacy/catalog attribution and requires coordinated Universe movement for a foreign owner. Unassigned documents are not made Universe-owned merely by moving Houses. [Document move][backend-move-doc].
- **Confirmed — Universe move:** `move_universe_to_house_impl` discovers owned canonical documents, checks conflicting attribution and source House ownership, updates frontmatter/registry/index through a journaled operation, and retains Universe and document identities. This is a real ownership change, unlike selecting a Universe. [Universe move][backend-move-universe], [App reconciliation][app-move].
- **Confirmed — archive:** document deletion moves its file to `Backups/` and removes its active index row. Entity archival first coordinates active relationships; historical IDs remain. Universe archival only changes its plan archive flag/normal-selector visibility, retaining documents, Books and history. House archival is a registry property; the ordinary House selector hides archived Houses. [Document archive][backend-delete], [archive storage][storage-delete], [entity archive][entity-archive], [UniverseSafety][universe-safety], [HouseSwitcher][house-switcher].
- **Confirmed — Portable import:** Preserve/Separate Copy policy controls identity retention/remapping. Import planning rewrites target House and supported references; commit publishes the catalog, target House registry assignment and index. It is not driven by the current sidebar list. [Import remapping][import-remap], [import commit][import-commit].
- **Confirmed — Vault restoration/activation:** backup collection includes canonical studio folders, Backups, attachments and `library.json`; restoration creates a separate notebook. Activation validates/scans its canonical files and rebuilds the derived index. **Inferred:** old localStorage browsing hints can survive notebook replacement because they live outside this canonical backup set and are not notebook-namespaced. [Vault collection][vault-collect], [restore][vault-restore], [activation][notebook-open].

## 3. Current navigation and active-Universe state

| Mechanism | Scope, lifetime and effect |
| --- | --- |
| HouseSwitcher → `handleSwitchHouse` | **Confirmed:** global React `activeHouseId`, persisted as `mc_active_house_id`. Flushes pending writing/operations, validates an active House, increments a load generation, clears Universe/Book preference keys, closes a foreign-House document and reloads library data. It does not assign any document to a Universe. [App House switch][app-house] |
| `LorebookStudio.activeUniverseId` | **Confirmed:** local `useState`, initialized from `mc_active_universe_id`. Reconciled against `getHouseUniverses`; invalid/empty selection becomes the first House Universe or null. The key is neither notebook- nor House-namespaced. [Selection/effects][studio-state] |
| UniverseSelector / Dashboard Switch Universe | **Confirmed:** callbacks set/clear that Studio-local state and preference. Dashboard receives `universeId` and selects its data from it. **Inferred:** clearing to null can immediately be undone by the Studio effect which selects the first Universe when any exist; a persistent picker mode is not represented separately. [Studio branches][studio-routing], [selection effect][studio-reconcile], [Dashboard switch][dashboard-switch] |
| Opening a Lorebook document | **Confirmed:** on document-ID changes, the Studio resolves its metadata against the full plan and changes local selection/preference if resolved. This effect depends only on document ID, not plan availability. **Inferred:** a document loaded before its plan, or ownership metadata changed without an ID change, can leave selection stale until another reconciliation/remount. [Document effect][studio-open] |
| Creation / shortcuts | **Confirmed:** App writes the preference after entry/Universe/Book creation. Sidebar create buttons and Ctrl+N read it as a context hint. The dialog has a separate selectable target and validates it against House Universes. Writing the key does not itself update an already-mounted React state owner. [App create][app-create], [shortcut][app-shortcut], [layout create][layout-create], [dialog initialization][create-initialize] |
| Original `WebOfThought` planner | **Confirmed:** independent local `universe`, `book`, milestone and compare states. Loading picks the first House Universe; `switchTimeline` changes only those planner states. It does not follow or update `mc_active_universe_id`. Its visibility is a Studio web/catalog fallback; ordinary Dashboard Web of Thought uses Explorer/graph views. [Planner][planner-state], [Studio fallback][studio-planner] |
| State Explorer / Chronicle navigation | **Confirmed:** the Explorer receives a Universe ID and owns continuity/milestone/compare selection locally. Source Chronicle navigation can select the source's continuity without changing canonical ownership. Dashboard forwards Book/Echo navigation hints. [Explorer state][explorer-state], [navigation][chronicle-route], [Dashboard callbacks][dashboard-state], [Explorer props][dashboard-explorer] |
| Book / Chapter subview | **Confirmed:** Dashboard locally initializes `selectedBookId` from `mc_selected_book_id`; chapter selection is BookView-local. Archiving a Book clears the preference. These IDs are navigation hints, not Book ownership. [Book selection][dashboard-state], [BookView][book-view] |
| Portable modal | **Confirmed:** its export target has its own `selectedUniverseId`; its dropdown uses the full plan's Universes, not a House-only list. Import chooses a destination House independently; Open Imported Universe invokes a parent callback. This is an operation target, not a general browsing preference. [Export target][portable-state], [import open][portable-open] |

**Confirmed:** `AppContent` owns the plan, Houses, active House and a single `activeDoc`; it does not own `activeUniverseId`. The inspected context providers are Help and Toast, not a Universe/navigation provider. No shared Universe-selection hook was found in the inspected `src` implementation. A Lorebook Universe switch is not broadcast as an active world to Poetry or Philosophy; Dashboard receives the Studio's ID by prop, while the original planner retains its own local selection. [App state][app-state], [providers][app-providers], [content wiring][layout-content], [planner][planner-state].

**Confirmed:** Universe selection survives component navigation/restart only as a localStorage hint, subject to validity checks and document-opening side effects. Initial library loading may auto-open the first indexed non-catalog House document, rather than the previously active document. **Inferred:** this can override the remembered world. [Initial open][app-initial-open], [Studio document synchronization][studio-open].

**Confirmed:** deleting/removing a Universe from the available plan triggers Studio fallback, and Dashboard has a Universe-not-found screen. Archiving is different: `getHouseUniverses` does not exclude archived Universes, so the Studio's validity check does not invalidate an archived selection. UniverseSelector separately hides archived Universes from its normal grid and offers retained inspection. Permanent Universe deletion is unavailable in `UniverseSafety`. [House Universe selector][house-utils], [UniverseSelector][universe-selector], [Dashboard missing state][dashboard-docs], [UniverseSafety][universe-safety].

**Confirmed:** the main application renders one active document/studio at a time; the audit found no multi-document tab collection in App/AppLayout. Independent world-selection states exist in inspectors, but **Unknown:** whether simultaneous independent world inspection across windows is an intended supported workflow. Do not infer either a global synchronization requirement or multi-pane support from the local states.

## 4. Lorebook sidebar data-flow trace

```text
canonical Markdown / JSON frontmatter
    → scan/reindex and save upserts
    → SQLite documents rows + tags (derived; metadata_json retained)
    → commands.list_documents_impl → db.list_documents
    → api.listDocuments() with no House/Universe parameter in loadLibrary
    → AppContent.documents (notebook-wide)
    → houseDocuments (house_id === active House, missing → house-default)
    → AppLayout.documents
    → selectLibrary(studio, tags, view, sort, query, search result UUIDs)
    → filteredDocs.map(doc), keyed/opened by UUID
```

Each arrow is **Confirmed** by [storage parsing][storage-read], [reindexing][reindex], [database listing][db-list], [command/API][backend-list], [API declaration][api-docs], [App loader][app-load], [House projection][app-house], [layout selection][layout-filter], and [row rendering][layout-rows]. Files live in studio folders such as `Lorebooks/`; the generic creation path does not create House/Universe folder hierarchies. Filenames are sanitized and collision-suffixed; document UUIDs establish identity. [Generic creation][backend-create].

Sidebar behaviors:

- **Confirmed — House only:** the input is already House-filtered. `selectLibrary` additionally supports optional House filtering, but this caller does not pass it because the input was scoped upstream. It has no Universe/continuity property. A catalog is excluded; non-catalog Lorebook documents, including chapters, can appear. Books stored only in the plan do not become sidebar rows. [Selector][org-select], [layout][layout-filter], [types][thought-types].
- **Confirmed — metadata is available:** every `DocumentMetadata` row includes `metadata_json`, so explicit Universe IDs/names can be resolved without fetching document bodies. There is no dedicated Universe parameter in `listDocuments`/`searchDocuments`, and the inspected document schema/query has a House column but stores Lorebook Universe data in JSON. [Types][doc-model], [DB][db-list], [API][api-docs].
- **Confirmed — All/Favorites/Recent:** favorite and last-opened timestamp are canonical per-document `_workshop` metadata, not separate Universe-local lists. The active House/studio input and current filters determine which of those document flags are visible. Recent sorts by actual last-opened time, not modification date. House changes clear query/tags, but retain view/sort selections; their results are recomputed against the new House input. [Organization state][org-workshop], [organization write][backend-workshop], [selector][org-select], [House effect][layout-filter].
- **Confirmed — sidebar search:** `AppLayout` debounces `api.searchDocuments(query)` without House/studio parameters. Backend lists indexed candidates, matches indexed titles, and reads canonical bodies for content matches. The sidebar intersects returned UUIDs with its House/studio/tag/view-filtered collection, so rendered results retain the visible scope despite broader query execution. Pending/error results become an empty result set with status/retry UI. Stale effect responses are guarded by a `current` flag. [Search effect][layout-filter], [backend search][backend-search], [body search][storage-search], [result intersection][org-select].
- **Confirmed — global SearchModal is separate:** Ctrl+F/Ctrl+K modal search defaults to the current House and permits All Houses. It passes House/type parameters to the backend and can switch House before opening a result. It has no Universe mode today. Do not accidentally treat it as the sidebar search when changing scope. [SearchModal][search-modal], [selection callback][app-search].
- **Confirmed — counts are two different projections:** studio badges use `computeStudioCounts(documents)` over all active-House documents excluding the catalog. The result caption uses `filteredDocs.length` after query/tags/view/studio filters. Neither is Universe-aware. The tag vocabulary is also House-wide, including a House tag catalog. [Layout counts][layout-filter], [result controls][layout-controls], [count helper][studio-counts].
- **Confirmed — creation/opening:** sidebar add actions pass the stored Universe hint into the modal; rows call `handleSelectDocument` by UUID. The sidebar does not react to a Universe selection change, because no relevant state or prop participates in its collection calculation. [Create buttons][layout-create], [row opening][layout-rows], [App open][app-open].

**Conclusion:** mixed rows are the expected result of this implementation. **Unknown:** whether any particular mixed row has invalid ownership. A source-only audit cannot conclude that the user's stored data is corrupt or that the UI was deliberately designed to mix worlds.

## 5. Entry creation and opening flow

**Confirmed — normal House → Universe → entry path:**

1. House switching establishes the active House and flushes pending saves. Dashboard quick-create supplies its explicit `universeId` and entry type to `handleOpenCreateModal`.
2. The dialog restricts candidate Universes to `getHouseUniverses(plan, activeHouse, houses)`. Initialization precedence is: valid explicit initial Universe ID; first matching initial legacy Universe name; valid stored Universe ID; first available House Universe. No Universe means Create Universe mode.
3. Add to Existing Universe requires a nonempty ID and current-list lookup. The user can override the dropdown. Creation writes that target ID/name into metadata; Universe creation and Book creation use separate callbacks.
4. App flushes writing, calls `api.createDocument(..., activeHouseId)`, opens the returned document, reloads the library and records an open. Backend writes canonical Markdown, then indexes it. Sidebar collection is refreshed from the index.
5. Reopening a row uses UUID, flushes/guards unsaved writing, reads the canonical document using the indexed identity/path, records Recent, and reconciles document House. LorebookStudio then attempts to synchronize its local Universe from document metadata.

Evidence: [House switch][app-house], [Dashboard create actions][dashboard-create], [modal options wiring][app-modal], [dialog initialization][create-initialize], [target override][create-target], [submit metadata][create-submit], [App create][app-create], [backend creation][backend-create], [canonical lookup][backend-get], [App opening][app-open], [Studio synchronization][studio-open].

Creation/opening risks, separate from sidebar scope:

| Finding | Verified mechanism and possible consequence |
| --- | --- |
| Stale/global first-Universe fallback | **Confirmed:** `LorebookStudio.handleCreateEntity` and `handleCreateChapter` use `plan.universes.find(activeUniverseId) || plan.universes[0]`, not a House-scoped fallback. Chapter creation independently finds the Book but does not verify `book.universe_id === currentUniverse.id`. **Inferred:** stale selections can create mismatched Universe/House or Universe/Book metadata. [Creation helpers][studio-create] |
| Persisted Book not checked against current Universe | **Confirmed:** Dashboard finds `selectedBookId` in the full plan and renders BookView with that Book plus the current Universe. This branch does not require matching Universe IDs or an unarchived Book, and there is no Universe-change reset effect in this component. **Inferred:** a retained Book ID can pair a foreign Book with the current world and feed the creation helpers above. [Dashboard Book branch][dashboard-book], [BookView consumers][book-view] |
| Archived creation target | **Confirmed:** dialog options use `getHouseUniverses`, which includes archived Universes; submission checks list membership, not `archived`. **Inferred:** an archived Universe can remain eligible for new entries despite being hidden from the normal UniverseSelector grid. [Dialog][create-initialize], [submit][create-submit], [House helper][house-utils] |
| Ambiguous initial name | **Confirmed:** dialog initialization uses `.find` for `initialUniverseName`; it does not require uniqueness among same-House names. Stable initial IDs avoid this. **Inferred:** name-only callers can select the first duplicate name. [Initialization][create-initialize] |
| Generic backend validation boundary | **Confirmed:** create validates House/studio; generic save preserves the canonical House and accepts replacement metadata. Neither path verifies Lorebook `universe_id` against that House's registry assignment or requires a Universe/Book. Plan saves, coordinated moves and export/import have additional guards. Sidebar hiding is therefore not a universal ownership guarantee. [Create][backend-create], [save][backend-save], [plan save validation][thought-save] |
| Unassigned navigation callback | **Confirmed:** the Studio's `onOpenUnassigned` callbacks select the first non-catalog Lorebook document, without calling `getUnassignedEntities`. **Inferred:** View Unassigned Lore can open an already-assigned entry. [Studio callbacks][studio-routing] |
| Open-before-plan synchronization | **Confirmed:** the document-to-Universe effect depends only on document ID. **Inferred:** late plan loading or metadata changes can leave the workspace selection inconsistent with the open document. [Effect][studio-open] |

These are audit findings, not fixes made by this task. Their runtime frequency and impact on the user's data are **Unknown**. A future scope selector should not inherit these fallback rules without explicit review.

## 6. House/Universe isolation findings

| Scenario | Current protection and limitation |
| --- | --- |
| Two Universes in one House | **Confirmed:** sidebar includes both; Dashboard/graph/state tools can filter by Universe IDs. This is a presentation-scope mismatch, not supported dual ownership. |
| Same-named Universes across Houses | **Confirmed:** the House registry owns Universe IDs uniquely. Rust `resolve_legacy_universe_id` uses the document House to disambiguate names and rejects foreign/ambiguous candidates. Frontend `resolveEntityUniverse` only considers its supplied Universe array; it does not read House ownership itself. [Registry invariants][registry-invariants], [Rust legacy resolver][legacy-rust], [TS resolver][legacy-ts] |
| Same-named legacy Universes in different callers | **Confirmed:** Studio breadcrumbs resolve against House Universes; Dashboard collection and Echo resolve against the full plan. A name-only entry can resolve in the breadcrumb yet be ambiguous/absent in other views. Existing isolation tests explicitly cover full-list ambiguity versus House-scoped resolution. [Studio breadcrumb][studio-breadcrumb], [Dashboard collection][dashboard-docs], [Echo][echo-scope], [existing regression source][legacy-test] |
| Invalid explicit Universe ID | **Confirmed:** the TS resolver falls through to legacy-name matching if the explicit ID is not found; raw `parseLoreMetadata` tolerates malformed JSON by returning an empty object. Rust Portable collection treats present explicit identity conservatively and checks plan conflicts. **Inferred:** a new sidebar filter must distinguish unknown/conflicting IDs from safely unassigned metadata rather than silently rebinding by name. [TS resolver][legacy-ts], [Portable checks][portable-collect] |
| Identically titled entries | **Confirmed:** document UUIDs identify rows, references and opening. File collision suffixes permit duplicate titles. Do not deduplicate or join by title when grouping/filtering. [Backend create][backend-create], [row UUID][layout-rows], [relationship validation][relationship-create] |
| Archived Universe | **Confirmed:** archive retains its documents and references. Sidebar still lists them; some selectors include archived records and the normal UniverseSelector grid excludes them. An archived Universe is not a deleted document. [UniverseSafety][universe-safety], [House helper][house-utils], [UniverseSelector][universe-selector] |
| Archived document / House | **Confirmed:** backed-up documents leave the active index; normal scans skip Backups. Archived Houses leave ordinary HouseSwitcher choices, but generic read/list/search APIs are not an authorization wall around an active House. House/archive treatment must be explicit in each workflow. [Archive][backend-delete], [scan][storage-scan], [HouseSwitcher][house-switcher], [backend read/list/search][backend-list] |
| Imported Universe | **Confirmed:** import validates target House and remaps or preserves stable identities. Commit updates canonical registry/catalog/index. **Confirmed wiring gap:** Portable modal refresh is optional; LorebookStudio does not pass `onRefreshLibrary` to its Dashboard/Selector instances. **Inferred:** Open Imported Universe may encounter stale React plan/documents until another library reload. Import persistence itself is not shown to be wrong. [Import remap][import-remap], [commit][import-commit], [modal refresh][portable-refresh], [parent wiring][studio-routing] |
| Restored notebook | **Confirmed:** activation validates canonical data and rebuilds its index. **Inferred:** the single unnamespaced Universe/Book preference keys may be stale for the restored notebook and require explicit validity handling. [Activation][notebook-open], [Studio state][studio-state] |
| Alternate continuity | **Confirmed:** belongs to the same Universe; backend validates branch/Book/node relationship scopes, and the state engine resolves ancestry. A sidebar Universe filter must not become an implicit continuity, historical-presence, spoiler or privacy filter. [Planning validation][thought-validate], [resolver][state-resolve] |
| Empty Universe | **Confirmed:** exists in the plan/House registry independently of entity documents. Sidebar Universe options must come from the House's Universes, not from worlds represented in existing rows. [House helper][house-utils], [Universe creation][backend-create-universe] |
| Missing/legacy association | **Confirmed:** unassigned entries remain valid House documents; helpers can identify unresolved/ambiguous entries. Some planner-only registration may exist without document metadata, while `getUniverseEntities` only uses document metadata. Keep these records discoverable and distinguish a valid catalog reference from conflicting canonical attributions. [Unassigned helper][universe-docs], [entity registration][entity-sync], [Portable fallback][portable-collect] |

**Confirmed — protection is layered, not uniform.** House registry invariants prevent assigning one Universe to multiple Houses. Planning validation enforces entity/relationship/node scopes; saving a plan also checks indexed explicit Universe metadata and document House ownership when its registry read succeeds. Individual/Universe move commands and Portable collection add checks. `getUniverseEntities` alone has no House guard, and the generic document API can read any known UUID. The existing architecture assumes selectors and callers provide appropriate scope; it is not a tenant authentication system. [Registry][registry-invariants], [planning][thought-validate], [save checks][thought-save], [moves][backend-move-doc], [selector][universe-docs].

**Confirmed:** a read-only `inspect_house_integrity` implementation can report orphaned/malformed House IDs, conflicting attribution, invalid mappings, missing canonical files and index mismatches. **Unknown:** its result for the user's current notebook; it was not invoked. A future sidebar change must not silently repair records or rebuild the index while merely selecting a world. [Integrity implementation][integrity].

## 7. Cross-feature dependencies

| Feature | Dependency / regression risk of sidebar scoping |
| --- | --- |
| Echo references and hover cards | **Confirmed:** editor receives `allDocuments`, document-derived Universe and House context; `buildScopedEchoEntities` selects recognition candidates. Conversion also uses supplied documents for related entity names/offices. Passing only sidebar search/Favorites results would remove relevant references and resolved names. Keep the full appropriate House reference pool and the document's own Universe. [Studio editor props][studio-echo], [Echo selector][echo-scope] |
| Relationship graph / linking | **Confirmed:** graph needs endpoint metadata and faction office data; entity link candidates use Universe resolution. Missing endpoints are filtered out. Narrowing the common input would make real relationships disappear or become unavailable for linking. [Graph][graph-scope], [link candidates][entity-link], [relationship creation][relationship-create] |
| State Explorer / Chronicle | **Confirmed:** historical resolution depends on the full Universe entity pool and full canonical ancestry, not only sidebar-visible documents. Preserve Universe/milestone/continuity hints and source Chronicle callbacks independently of search/tag filters. [Resolver][state-resolve], [Explorer][explorer-state], [Chronicle route][chronicle-route] |
| Book and Chapter linking | **Confirmed:** `milestoneBookOptions` and `compatibleChapter` enforce Universe/House/continuity compatibility and use chapter UUID metadata. Empty Books are valid options. BookView supplies its document prop to a UUID-first chapter selector whose legacy Book-name fallback has no Universe check. **Inferred:** name-only chapters can mix for same-named Books in one House when that input is House-wide. Do not narrow chapter candidates by sidebar text/Favorites or treat Books as ordinary documents; review this fallback and stale Book selection before sharing navigation state. [Narrative compatibility][narrative], [chapter selector][chapter-selector], [BookView input][book-view], [Book branch][dashboard-book] |
| Search / Favorites / Recent | **Confirmed:** visible sidebar results are derived from a common selector; favorite/history state is document-owned. Add Universe scope before applying the common filters so membership/order/counts agree; do not create another canonical Favorites list or alter open history on a scope-only click. Global SearchModal remains explicitly House/global unless product expands it. [Organization][org-workshop], [selector][org-select], [modal][search-modal] |
| Publication | **Confirmed:** UI entity/excerpt choices derive from supplied documents using explicit Universe IDs. Backend independently collects canonical sources, resolves ownership, filters House/Universe and privacy/archive/selection constraints, and generates Markdown/PDF. Narrowing UI inputs can silently shrink default selections even though backend integrity remains intact. Preserve a complete publication candidate pool and explicit request target. [UI selection][publication-ui], [canonical collection][publication-source] |
| Portable `.mcuniverse` | **Confirmed:** export/import are canonical, bounded operations with independent explicit Universe/Book/chapter targets. UI Book/chapter lists need complete documents. Browsing scope must never silently become an export scope or identity policy. Revalidate/refresh after import and handle an import into another House explicitly. [Portable UI][portable-state], [collection][portable-collect], [remapping][import-remap] |
| Vault backup/recovery | **Confirmed:** captures canonical notebook contents, not the sidebar view. Preserve the coordinator, restart block and full reload path. Preference namespacing/invalidations are a UI concern after activation, not a canonical restore migration. [Vault source set][vault-collect], [activation][notebook-open], [App restart gate][app-restart] |
| Open document and Recent | **Confirmed:** App holds one active document, and navigation has flush/manual-save/generation guards. Changing a browse scope should not rewrite or silently close that document. Opening a result from another scope must still use the same navigation handlers; no parallel “open tab” store was found. [App open][app-open], [rendering][layout-content], [open history][backend-workshop] |

**Confirmed — critical prop boundary:** `AppLayout.documents` is used both for the sidebar and as `LorebookStudio.allDocuments`/other content inputs. Do not replace the House-level input with a Universe/query-filtered list. Derive a separate sidebar collection and retain the current complete House collection for content features. The shared canonical plan must also retain unrelated Universes on every save. [Layout content wiring][layout-content], [canonical planning save][thought-save].

## 8. Comparison of Options A, B, and C

| Criterion | A — sidebar Universe selector | B — follow an existing global Universe | C — House-wide groups |
| --- | --- | --- | --- |
| Architectural compatibility | **Inferred:** strong if controlled by the existing App ancestor and coordinated with Studio; data already has IDs and reusable selectors. | **Confirmed prerequisite missing:** no reliable shared reactive active-Universe state exists. Reading localStorage is not state synchronization. A lifted state would be a new architecture, not simple reuse. | **Inferred:** strong for the existing House-wide document projection; grouping can use the same attribution classifier. |
| Complexity | **Inferred:** moderate: controlled scope, lifecycle validation, creation/open integration, common selector/count changes. No canonical schema change required. | **Inferred:** misleadingly low if implemented by polling the preference; genuinely shared state requires approximately A's lift plus a wider synchronization contract. | **Inferred:** low-to-moderate rendering/grouping work, but unresolved/archive classification and scoped search semantics still need decisions. |
| Stale/conflicting selection | **Inferred:** low with one owner; high if another independent sidebar state/key is added. | **Inferred:** high if based on current preference and planner-local states; no automatic notification contract exists. | **Inferred:** fewer selected-scope conflicts, but open document/Dashboard context and creation still need reconciliation. |
| UX consistency | **Inferred:** provides the requested explicit world scope and can align Dashboard and entry browsing. All/Unassigned escape views preserve discovery. | **Inferred:** attractive only after defining which workspace owns selection; forcing every inspector to follow it can disrupt historical work. | **Inferred:** clarifies attribution and preserves cross-world overview, but a user still browses several worlds at once. |
| Legacy handling | **Inferred:** requires an always-accessible unresolved bucket and House-aware resolution. | **Inferred:** a selected world alone cannot account for unassigned/conflicting entries. | **Inferred:** unresolved/ambiguous group fits naturally, but still must not guess identities by name. |
| Isolation | **Inferred:** preserves House-first/UUID filtering when applied as a projection; cannot repair backend attribution gaps. | **Inferred:** safe only if the selected ID is validated against active House/notebook; current unnamespaced key is insufficient. | **Inferred:** retains House-wide visibility by design; headings are disclosure, not a Universe isolation boundary. |
| Regression surface | **Inferred:** localized if `sidebarDocuments` is separated from reference inputs; navigation and creation are the principal integrations. | **Inferred:** potentially larger if treated as a global selection for all studios, export targets and historical inspectors. | **Inferred:** smaller data-path change, but grouped sorting, Recent ordering, counts and empty worlds require careful UX treatment. |

**Recommendation:** choose **A**, and reuse C-style grouping only as an optional enhancement to All Universes. Do not implement B by following `mc_active_universe_id`. Centralizing the existing Lorebook context is useful engineering inside A, not evidence that B's prerequisite already exists.

## 9. Recommended design

The following is a proposal, not existing functionality or implemented code.

**Required for a safe initial implementation:**

1. **One UI owner at the common ancestor.** Add controlled Lorebook browsing state to `AppContent`, pass it through `AppLayout`, and coordinate it with LorebookStudio callbacks. Share it within Lorebook navigation, not as a forced Universe for Poetry, Philosophy, publication/export operation targets, or a historical inspector. A new context provider is unnecessary unless prop routing later warrants it.
2. **Represent scope explicitly.** Distinguish a specific Universe UUID, All Universes in this House, and Unassigned/Unresolved Lore. Do not use null both for “show picker,” “no world,” and “choose first world.” The Dashboard may retain a separate validated inspected-Universe ID while an All/Unresolved browser is shown; name these two roles explicitly rather than pretending they are two competing active worlds.
3. **Initialize deterministically.** After House/plan loading, honor a valid open Lorebook document's canonical world when restoring a specific-world context; otherwise honor a validated remembered scope for this notebook and House. With no valid remembered selection, default to All Universes to preserve current House-wide discovery. Never pick an unrelated global first Universe as a recovery shortcut. Keep initialization separate from a later intentional All/Unresolved selection.
4. **Namespace only UI preferences.** If persistence is desired, key browsing hints by acknowledged notebook identity/path plus House ID and preference version; treat absent/unknown values as UI state, not data needing migration. Avoid changing canonical schemas. React state and callbacks must drive updates; localStorage should be persistence, not an event bus or source of live truth.
5. **House-first derived sidebar collection.** Start from the existing `houseDocuments`, exclude the catalog, resolve a document's world, apply Universe scope, then apply the common studio/tag/view/query/sort selector. Keep complete House documents and the full canonical plan for editor/graph/Book/publication features. Empty worlds come from the House Universe list, not from document frequency.
6. **Define one attribution policy before reuse.** Reuse `getHouseUniverses`, `parseLoreMetadata`, `resolveEntityUniverse`, `getUniverseEntities`, `getUnassignedEntities`, `selectLibrary` and `computeStudioCounts` where their contracts fit. Add explicit House/archive/conflict classification around them. A valid explicit UUID takes precedence; resolve name-only legacy entries only against uniquely matching same-House candidates. Unknown explicit IDs, conflicting catalog IDs and malformed metadata remain visible as unresolved warnings; never silently relabel, copy or save them. Review backend parity before altering shared resolver semantics used by other features.
7. **House/notebook lifecycle.** Use existing save/operation coordination for any actual document transition. On House switch, validate against the destination's worlds and restore its own saved scope or All; clear invalid Book/milestone hints. After plan reload, Universe move/archive/import or notebook activation, revalidate IDs. Do not fall back while the plan is merely loading or failed, and do not create/reindex data as a side effect of selecting scope.
8. **Creation inheritance.** A specific-world scope supplies an explicit target ID; retain a clearly visible, intentional target override within the current House. All/Unresolved must require an explicit target or Create Universe, rather than guessing the first global world. Disable archived creation targets unless product explicitly allows them. Ensure direct entity/chapter creation uses the validated target and matching Book Universe, and treat backend attribution hardening as a separately approved change if needed.
9. **Opening across scopes.** Keep `handleSelectDocument`/House-switch save guards. When a specific-world browser opens an explicit document from another world, follow the opened document's valid world and show its attribution; an intentional All view can remain All. If an unresolved entry is opened from a specific scope, show it in Unresolved with a warning rather than inferring ownership. A scope-only change leaves the open editor intact and visibly attributed; do not claim its ownership changed because its row is hidden.
10. **Consistent filtering/counts.** Sidebar search, Favorites, Recent and result counts use the same scoped candidate pool and UUID intersection. Favorite/open-history metadata stays per document. Keep overview studio counts explicitly labeled House-wide, and label the Lorebook result caption with its scope; if the Lorebook badge becomes Universe-scoped, define that separately without changing Poetry/Philosophy counts. Keep tag-management mutations House-scoped even if displayed tag choices are narrowed.
11. **Archive access without disappearance.** Preserve the current meaning of archive as retained content. Recommended All Universes retains House-wide discoverability, including labeled retained archived-world entries; normal specific-world choices list active worlds, with explicit archived inspection/recovery access. Unresolved content stays reachable. Any different archive visibility policy requires a product decision, not an accidental `filter(!archived)` on all documents.
12. **Import refresh before navigation.** Wire a successful canonical reload through the existing optional refresh callback before selecting imported IDs. When the destination House differs, explicitly coordinate House navigation and then world selection; do not use an imported UUID to bypass the active House collection.

**Optional enhancements:** Universe badges on individual rows; grouped All Universes presentation; per-House remembered last world; an explicit Universe mode in global SearchModal; disclosure of active Universe in create buttons; richer unresolved diagnostics; and a dedicated picker screen. These improve clarity but must not delay fixing the state/collection boundary if A is approved.

## 10. Implementation boundaries and risks

**Required boundary:** a future navigation/filtering change should touch controlled UI state, sidebar projection and relevant callbacks, not canonical schemas, Markdown files, SQLite schema/data, UUIDs, relationship identities or archive formats. The canonical House/Universe ownership model already supports a non-destructive filtering projection.

**Required separate decisions/work items:** backend validation hardening, legacy-resolution parity, stale Book checks, direct creation fallbacks, archive policy and import refresh wiring. Some may be prerequisites for safely sharing existing selection, but they are not justification for silently broadening a sidebar task into an ownership migration.

**Inferred risks to guard against:**

- Filtering `App.documents` or `AppLayout.documents` globally and removing reference data from Echo/graphs/Books/publication defaults.
- Saving a filtered subset of the shared plan and dropping unrelated Universes.
- Treating localStorage values as authoritative ownership, or persisting preferences before a backend result is acknowledged.
- Using a first name match for duplicate Universes/Books or matching duplicate entity titles as identities.
- Leaving old search results, Book IDs or historical navigation hints active after a House/notebook/Universe transition.
- Conflating authoring visibility with spoiler/privacy/historical-presence rules; those remain explicit feature-level policies.
- Letting scope selection bypass pending autosave/manual-save/queued-mutation guards, or falsely marking a document opened when only changing the list filter.
- Hiding unassigned, invalid or archived content so completely that users mistake it for deletion.

**Unknown:** the exact packaged Windows behavior of the source-level stale-selection findings, current user data integrity, cross-window preference expectations, and screen-reader acceptance. No runtime/UI tests or database inspections were performed in this audit. Existing test files were reviewed as architectural evidence, not rerun or extended.

## 11. Questions requiring product decisions

1. Should a first-time Lorebook session start at All Universes, a last-used world, or a picker? Recommendation: All initially, validated per-House persistence thereafter.
2. Should selecting a sidebar scope also navigate the main content? Recommendation: a list-only change does not close an editor; explicit world-opening actions navigate Dashboard through save guards. Display the open document's world when it differs from the list.
3. Should opening a cross-world search/Echo result follow its world? Recommendation: yes for an existing specific-world scope; preserve intentional All mode.
4. Does All Universes include retained archived-world entries? Recommendation: preserve discovery with labels and explicit archived inspection; prohibit accidental creation into archived worlds.
5. Should global Ctrl+F/Ctrl+K gain a Universe scope or retain House/All Houses? Recommendation: retain its current explicit scope in the first phase and label it clearly.
6. Should the Lorebook studio badge remain a House total or follow a world? Recommendation: label House totals separately from scope-specific result counts.
7. What action may resolve malformed, ambiguous or catalog-only attributions? Recommendation: display diagnostics first; any reassignment is a separate explicit record-editing operation.
8. Are independent worlds across windows/inspectors intended? Recommendation: share normal Lorebook navigation only; keep historical/operation target contexts explicit until this is decided.
9. Should source-level creation/Book/import wiring findings be repaired in the same future task or prerequisite tasks? Recommendation: approve a bounded prerequisite set before activating shared state; do not silently include a migration.

## 12. Suggested implementation phases for a future task

1. **Approve the state/UX contract.** Decide All/Unresolved/archive behavior, scope-versus-open-editor behavior, count labels, preference lifetime and global search semantics. Record that filtering never changes ownership.
2. **Bound prerequisite fixes.** Reproduce the identified null-picker, stale Book, late-plan synchronization, direct creation and import-refresh risks in a disposable environment. Approve only the necessary fixes and legacy attribution policy. Do not touch user canonical data to make tests pass.
3. **Introduce controlled Lorebook context.** Lift/coordinate selection through AppContent/AppLayout/Studio; preserve complete document/reference pools and save-before-navigation paths. Validate House/notebook/plan transitions and remove reliance on nonreactive preference reads for live context.
4. **Add the sidebar projection and control.** House-filter first, classify Universe ownership, implement explicit scope, then apply the existing common library filters and UUID search intersection. Cover empty worlds and Unresolved; keep studio/tag-management scope truthful.
5. **Verify cross-feature invariants.** In a future implementation task, add focused coverage for two worlds in one House, duplicate names across Houses, duplicate entity titles, zero-document worlds, legacy/malformed/conflicting metadata, archived worlds, newly imported/remapped IDs, restored notebooks, pending saves, cross-scope opens, Favorites/Recent/counts, and stale async results. Verify Echo, graph endpoints, alternate ancestry, Chronicle/Book links, publication selections, Portable packages and Vault contents against complete canonical/reference pools.
6. **Perform packaged Windows acceptance.** Confirm keyboard/screen-reader selector semantics, clear visible scope, editor-preservation behavior, narrow layouts, restart persistence and no data writes from browsing alone. Keep release/version decisions outside this audit.

**Stop point:** the investigation is complete. This report recommends an architecture but authorizes no implementation. Await explicit approval for a separate implementation task.

### Source references

All links point into the inspected repository; line numbers identify the relevant function/component entry or call site.

[app-state]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx:62
[app-load]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx:135
[app-initial-open]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx:177
[app-house]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx:295
[app-move]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx:352
[app-open]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx:556
[app-create]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx:712
[book-create]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx:850
[app-shortcut]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx:973
[app-modal]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx:1177
[app-search]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx:1202
[app-restart]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx:1281
[app-providers]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx:1301
[layout-filter]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/layout/AppLayout.tsx:140
[layout-create]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/layout/AppLayout.tsx:245
[layout-controls]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/layout/AppLayout.tsx:518
[layout-rows]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/layout/AppLayout.tsx:616
[layout-content]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/layout/AppLayout.tsx:860
[org-workshop]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/organization.ts:18
[org-select]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/organization.ts:76
[studio-counts]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/house.ts:163
[house-utils]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/house.ts:183
[house-switcher]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/house/HouseSwitcher.tsx:23
[house-model]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/models.rs:147
[doc-model]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/models.rs:227
[lore-types]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/types/index.ts:267
[thought-types]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/thought.ts:1
[legacy-ts]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/universe.ts:130
[legacy-rust]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/models.rs:408
[legacy-test]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/tests/phase_b_house_universe_isolation.test.ts:351
[universe-docs]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/universe.ts:171
[chapter-selector]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/universe.ts:216
[entity-sync]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/universe.ts:245
[relationship-create]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/universe.ts:312
[studio-state]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/LorebookStudio.tsx:139
[studio-open]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/LorebookStudio.tsx:204
[studio-reconcile]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/LorebookStudio.tsx:245
[studio-create]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/LorebookStudio.tsx:350
[chapter-create]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/LorebookStudio.tsx:410
[studio-planner]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/LorebookStudio.tsx:436
[studio-routing]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/LorebookStudio.tsx:461
[studio-breadcrumb]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/LorebookStudio.tsx:544
[studio-echo]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/LorebookStudio.tsx:844
[universe-selector]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/UniverseSelector.tsx:57
[dashboard-state]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/UniverseDashboard.tsx:117
[dashboard-docs]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/UniverseDashboard.tsx:198
[dashboard-book]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/UniverseDashboard.tsx:223
[dashboard-switch]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/UniverseDashboard.tsx:375
[dashboard-create]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/UniverseDashboard.tsx:404
[dashboard-explorer]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/UniverseDashboard.tsx:1343
[book-view]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/BookView.tsx:142
[planner-state]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/WebOfThought.tsx:27
[explorer-state]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/UniverseStateExplorer.tsx:122
[explorer-narrative]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/UniverseStateExplorer.tsx:1209
[chronicle-route]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/chronicleNavigation.ts:5
[state-resolve]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/stateEngine.ts:388
[narrative]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/narrativeContext.ts:20
[universe-safety]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/UniverseSafety.tsx:5
[create-initialize]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/common/CreateDocumentModal.tsx:164
[create-target]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/common/CreateDocumentModal.tsx:728
[create-submit]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/common/CreateDocumentModal.tsx:273
[search-modal]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/common/SearchModal.tsx:30
[api-docs]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/services/api.ts:1202
[backend-list]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/commands.rs:38
[backend-get]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/commands.rs:64
[backend-create]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/commands.rs:70
[backend-save]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/commands.rs:216
[backend-delete]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/commands.rs:354
[reindex]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/commands.rs:375
[backend-search]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/commands.rs:392
[backend-move-doc]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/commands.rs:625
[backend-move-universe]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/commands.rs:1025
[backend-create-universe]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/commands.rs:1351
[db-list]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/db.rs:251
[registry-read]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/storage.rs:104
[registry-invariants]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/storage.rs:143
[storage-read]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/storage.rs:815
[storage-delete]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/storage.rs:1044
[storage-scan]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/storage.rs:1378
[storage-search]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/storage.rs:1424
[integrity]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/storage.rs:1069
[thought-validate]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/thought.rs:119
[thought-archive]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/thought.rs:405
[thought-save]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/thought.rs:417
[thought-save-file]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/thought.rs:515
[backend-workshop]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/organization.rs:100
[entity-archive]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/services/entityArchive.ts:4
[echo-scope]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/echoLore.ts:286
[graph-scope]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/graphConnections.ts:37
[entity-link]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/EntityLinkField.tsx:93
[publication-ui]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/LorebookPublicationModal.tsx:115
[publication-source]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/publication/export.rs:79
[portable-state]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/PortableUniverseModal.tsx:113
[portable-refresh]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/PortableUniverseModal.tsx:415
[portable-open]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/PortableUniverseModal.tsx:1011
[portable-collect]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/portable/collect.rs:268
[import-remap]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/portable/import_plan.rs:276
[import-commit]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/portable/import_commit.rs:748
[vault-collect]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/vault.rs:583
[vault-restore]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/vault.rs:942
[notebook-open]: /D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src-tauri/src/notebook.rs:270


---

## Implementation Outcome — Finding #10 (2026-10-30)

This section records the implementation after the audit. The preceding audit, including its inspected-commit references, is preserved verbatim. The implementation starts from `f6113ffe3c9a2f9a5358d24662b147032a9a419b`. Release version remains **0.8.0-beta.4**. No commit, push, tag, release, canonical migration, or notebook repair was performed.

### Root cause and controlled state

The audit was confirmed: the sidebar filtered the House collection, while `LorebookStudio` maintained a separate active Universe and consulted a non-reactive localStorage hint. The old first-Universe initialization also prevented a durable All/Unassigned workspace.

`AppContent` now instantiates `useLorebookScope` once and passes one controlled discriminated scope through `AppLayout` to `LorebookStudio`:

- `{ kind: 'all' }`: all eligible Lorebook entries in the active House.
- `{ kind: 'universe', universeId }`: one stable Universe UUID, including explicit archived inspection.
- `{ kind: 'unresolved' }`: actual unassigned, malformed, ambiguous, or conflicting Lore.

There is no additional global provider and no sidebar-local or Studio-local active-Universe state. The former `mc_active_universe_id` hint is no longer read or written by application source. LocalStorage persists UI intent only; it does not broadcast selection events.

When no document is open, All displays the Universe selector, a specific scope displays that Universe's Dashboard, and Unresolved displays a diagnostic entry list. The sidebar overview button preserves the selected scope. An entry's Dashboard button explicitly opens its attributed Universe through the existing save coordinator; it stops when saving fails.

With a document open, choosing a scope changes the list without unmounting the editor, saving the document, changing ownership, or recording another open. The open-entry caption and breadcrumb identify the document's own attribution. An explicit cross-Universe document open follows only an existing specific-world scope. Intentional All and Unresolved remain selected. Pending explicit opens reconcile when planning and House information arrive, including under React StrictMode. A navigation generation also prevents a delayed startup response from replacing a newer explicit open and its draft.

### Sidebar projection and selector

The global notebook `documents`, complete House collection, and canonical plan are retained. `AppLayout` derives a separate `sidebarDocuments` collection only for the Lorebook view:

1. Keep documents belonging to the active House.
2. Exclude the internal planning catalog.
3. Classify Lorebook attribution without mutating metadata.
4. Apply the controlled scope.
5. Apply `selectLibrary` studio/search UUID intersection, tags, All/Favorites/Recent, and sorting.
6. Render rows and visible result counts from that result.

The selector sits above search. Empty Universes remain available. Choices use UUID values; duplicate names display their UUIDs under the current House context. Active Universes are separated from the explicit **Archived Universes — inspect / recover** group. All retains archived-world entries and unresolved records, with attribution or diagnostic text on each row.

Filter-tag choices come from the scoped Lorebook collection. Document organization and tag management still receive the complete House tag pool and retain House-level mutation semantics. The Lorebook studio badge explicitly says **House**, distinguishing it from the scoped result count. Global Ctrl+F/Ctrl+K search keeps its House/All Houses behavior.

A labelled native select provides keyboard access. At a 900×800 viewport, the selector remained entirely inside the viewport (approximately x=94–385 with the primary sidebar collapsed). Home selected All and updated the visible count; choosing the other UUID restored its one-row list while the original entry stayed open. The touched editor headers now wrap at narrow widths instead of overlapping. The existing primary-sidebar collapse control remains available.

### Preferences and loading

Preferences use `mc:lorebook-browse:v1:<encoded notebook path>:<encoded House UUID>`. First use defaults to All. Initialization/validation waits for notebook identity, House registry, and a successful loaded/no-catalog planning result. Invalid or foreign remembered UUIDs fall back to All only after that information is available. Archived inspection UUIDs remain valid choices.

A failed load does not replace an acknowledged plan/House registry or overwrite a valid scope preference. House-management refresh uses the same guarded canonical snapshot load instead of substituting an empty registry on error. Planning edits are blocked while planning is loading/unavailable. Import success dialogs stay mounted through refresh against the acknowledged snapshot. Context changes read the new notebook/House key, and late explicit-open events cannot silently turn an intentional All/Unresolved selection into a specific Universe.

### Attribution and legacy behavior

| Input | Browsing result |
| --- | --- |
| Known explicit UUID belonging to the current House | Assigned by UUID, regardless of a stale legacy name |
| Unknown, invalid, or foreign explicit UUID | Unresolved; never falls back to its legacy name |
| Legacy name with exactly one same-House match | Read-only legacy attribution; no metadata rewrite |
| Duplicate legacy names within the House | Unresolved ambiguity; no first-match selection |
| Document/catalog Universe conflict or duplicate registrations | Unresolved with a diagnostic |
| Valid catalog-only registration | Read-only attribution; document metadata remains unchanged |
| Missing attribution | Unassigned within the Unresolved scope |
| Malformed JSON, arrays, primitives, or invalid fields | Discoverable in All/Unresolved with a diagnostic |
| Archived Universe | Retained and labelled for inspection; excluded from normal creation |

Existing implicit-default-House ownership rules remain in force for unmapped legacy Universes. No title, folder, current browsing scope, or document link is used to infer browsing ownership. Matching considers archived same-House names conservatively, so an archived duplicate cannot silently disambiguate a legacy record.

### Bounded creation and Book safeguards

Direct entity creation validates an explicit active Universe in the active House. Direct chapter creation additionally validates an existing, non-archived Book owned by that Universe. Both first-Universe fallbacks were removed. The creation dialog accepts a valid explicit UUID or a unique active same-House legacy name; otherwise it leaves an explicit Choose a Universe prompt. Archived Universes are absent from ordinary creation choices.

Dashboard Book selection is validated before rendering, as well as before chapter callbacks. Foreign, missing, archived, or House-incompatible hints are cleared. A stale Book cannot render with another Universe's context. Archived-world inspection disables direct creation actions.

Book/Chapter linking remains a separate reference projection. Explicit legacy Book UUID links without Universe attribution remain visible in their Book while their documents remain Unresolved in browsing. This preserves existing chapter compatibility without assigning Universe ownership. Legacy Book-name fallback is limited to a uniquely named Book in the correct House/Universe; conflicting ownership and cross-Universe same-name matches are excluded. The complete document pool still reaches BookView's content/reference features.

### Portable import refresh and guarded navigation

The existing refresh callback is now wired from AppContent through the layout/Studio and both Universe entry surfaces into `PortableUniverseModal`. After commit, the canonical planning/document/House snapshot is refreshed before imported navigation is enabled. Opening the import validates its Universe UUID and non-archived destination House from a fresh snapshot. A different destination uses the existing guarded House switch, followed by another refresh/revalidation, then selects the imported UUID under the destination's preference key. A failed guard stops navigation.

A refresh failure retains the committed result, disables Open Imported Universe, and exposes **Retry library refresh**. Retrying refresh does not repeat the commit. Same-House, cross-House, failed-refresh, destination mismatch, and rejected-switch paths are covered. Portable v1 request fields, Preserve/Separate Copy identity semantics, archive format, and recovery implementation are unchanged.

### Files changed and cross-feature boundaries

Implementation files:

- [AppContent wiring](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/App.tsx), [scope hook](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/hooks/useLorebookScope.ts), [safe projections/creation checks](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/utils/lorebookNavigation.ts), and [import navigation coordinator](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/services/lorebookNavigation.ts).
- [AppLayout](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/layout/AppLayout.tsx), [scope selector](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/LorebookScopeSelector.tsx), and [LorebookStudio](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/LorebookStudio.tsx).
- [UniverseSelector](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/UniverseSelector.tsx), [UniverseDashboard](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/UniverseDashboard.tsx), [BookView](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/BookView.tsx), [CreateDocumentModal](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/common/CreateDocumentModal.tsx), and [PortableUniverseModal](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/src/components/studios/lorebook/PortableUniverseModal.tsx).
- [Focused tests](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/tests/lorebook_navigation.test.ts), [disposable fixtures](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/tests/fixtures/lorebookNavigation.ts), [browser harness](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/tests/browser/universe-navigation.tsx), its [HTML entry](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/tests/browser/universe-navigation.html), and the test command in [package.json](/D:/Jetbrains_IDE_Projects/rustrover/MetaCognitionNotebook/package.json).

Echo, linking/relationship graphs, historical state/alternate continuities, publication, Portable packages, and the other studios continue receiving the complete appropriate House document collection and canonical plan. Tool-specific continuity, milestone, import/export destination, and publication choices remain local operation/inspection state, separate from sidebar browsing. No filtered plan is saved. Canonical Markdown/frontmatter, UUIDs, SQLite indexing, relationship identities/explanations, publication privacy/spoiler policies, Portable v1 serialization, and Vault backend code were not changed.

### Reproduction and validation evidence

Before editing the affected components, disposable live React fixtures reproduced:

- A Book belonging to Universe B rendered in Universe A's Dashboard.
- An archived Universe appeared as an ordinary creation option.
- An ambiguous initial legacy name selected the first UUID.
- A document owned by B, opened before planning arrived, settled on A after the late plan loaded.

Executing the old creation/navigation decision blocks from the inspected commit against in-memory fixtures additionally reproduced a missing-context fallback to A, chapter metadata combining Universe A with a Book owned by B, and View Unassigned opening the first assigned entry. These reproductions did not create canonical documents.

Final validation:

| Check | Passed | Failed | Skipped/ignored | Result |
| --- | ---: | ---: | ---: | --- |
| `npm test` | **695** | **0** | **0** | 48 suites; 0 cancelled, 0 todo; includes all existing 666 tests plus 29 new focused cases |
| `cargo test --workspace` | **202** | **0** | **0** | 189 library tests + 3 Thinking Desk integration tests + 10 Workshop integration tests; main/doc-test targets have 0 tests |
| New actual React/browser harness | **20** | **0** | **0** | AppContent callbacks, both editor engines, scope/persistence, startup/late-plan races, creation, Book linking, and import navigation |
| Existing nine-finding browser acceptance harness | **5** | **0** | **0** | Chronicle navigation, inherited alternate history, Book selection, relationship explanation persistence, and Echo preview |
| `npm run build` | — | **0** | — | TypeScript + Vite production build passed; Vite emits its >500 kB bundle-size advisory |
| `git diff --check` | — | **0** | — | No whitespace errors |

Initial restricted Node/Rust runs encountered Windows atomic-rename restrictions (`EPERM` / OS error 5) in disposable persistence-test directories. The approved runs outside the sandbox produced the successful totals above. An existing BookView regression also exposed the legacy Book-UUID-only case; that behavior was preserved and covered before the final passing run. The focused new/existing Universe suites passed **61/61** together.

The existing full suites cover Echo scope/privacy, graph edges and explanations, historical state/branches, Book/Chapter references, Markdown/PDF publication/privacy, Portable v1 identity and recovery, and Vault backup/restore. The browser harness uses in-memory APIs and restores UI preferences. Its CodeMirror case checks the same editor DOM instance and buffer survive scope changes, then verifies the draft is saved to the original document UUID. Browsing-only tests compare canonical fixture snapshots and opened-history counts before/after selection.

To repeat browser checks, run the local Vite server and open `/tests/browser/universe-navigation.html` and `/tests/browser/acceptance.html`. Append `?preview=1` to the new harness for a disposable interactive visual check, then click Finish visual check to restore preferences. [900×800 visual evidence](/C:/Users/Admin/.codex/visualizations/2026/10/29/01a18604-14bd-7633-b135-5b11ae7c2bd1/lorebook-universe-navigation-900x800.jpg) is a machine-local screenshot of another Universe's sidebar with the original Psychosis entry still open.

### Remaining limits and manual Windows acceptance checklist

Attribution diagnostics deliberately do not repair malformed or conflicting canonical data. Such entries require an intentional ownership edit through an appropriate authoring/repair workflow. No backend ownership redesign was attempted. The bundle-size advisory remains. A packaged Tauri smoke test with personal notebooks is still a manual release acceptance step; browser verification used disposable records and backend tests used temporary libraries.

1. In a disposable Windows notebook, prepare two Universes in one House, an empty Universe, duplicate Universe/entity names, another House, and an archived Universe. Check UUID-distinguished choices and House context.
2. At 900×800, use the native selector by keyboard, expand/collapse the primary sidebar, and verify selector/search/filter controls and wrapped editor actions remain usable.
3. Edit an A entry in CodeMirror and the fallback editor. Choose B, All, and Unresolved. Confirm the draft and A caption remain, no other entry is marked opened, and Ctrl+S saves only A.
4. Open B explicitly from global search while browsing A; confirm specific context follows B. Repeat from All/Unresolved and confirm those intentional scopes remain. Check House/All Houses search and a blocked save-before-navigation.
5. Check All and explicit archived inspection retain archived-world documents. Confirm archived Universes are absent from normal creation choices; exercise recovery on the disposable copy.
6. Inspect unique legacy names, duplicate legacy names, unknown UUIDs, catalog conflicts, and malformed metadata. Confirm diagnostics/discovery and unchanged frontmatter after browsing.
7. Create an entity/chapter under a valid active Universe/Book. Inject a missing, archived, or foreign last-Book hint in disposable preferences; confirm it clears and cannot create under another Universe. Verify legacy Book UUID links remain visible.
8. Switch Houses and notebooks, restart, and verify each remembered scope and first-use All behavior. A foreign/deleted remembered UUID must fall back to All only after loading completes.
9. Delay or fail planning/House loading, then retry. Confirm saved intent survives failure, an explicit open reconciles once ready, and a late startup response cannot replace newer edits.
10. Import Portable v1 packages into the current and another House using Preserve and Separate Copy policies. Confirm fresh records appear before navigation, failed guards block switching, and refresh-only retry does not repeat a committed import.
11. From complete reference pools, check Echo links, graph explanations/edges, Chronicle sources and alternate history, Book/Chapter linking, Markdown/PDF publication selections/privacy, and Portable package contents while the sidebar browses a different/empty Universe.
12. On the disposable notebook, verify Vault backup/restore and restart/reindex compatibility. Compare canonical file bytes across browsing-only changes; scope selection must not move, archive, delete, repair, or rewrite records.
