# v0.8.0-beta.4 acceptance fixes: relationship aggregation and publication

Date: 2026-10-28. The application version remains `0.8.0-beta.4`. No commit, push, tag, stable promotion, or release was performed. Existing uncommitted work was preserved. Portable package schemas and recovery/import/export logic were not changed.

## Changed files for this acceptance fix

| File | Change |
| --- | --- |
| `src/utils/graphConnections.ts` | Ephemeral authored/office projection, deterministic priority, pair limits, selection helper, historical ancestry resolution. |
| `src/utils/relationshipGraph.ts` | Priority-aware pair grouping, primary-direction geometry, collision-safe pair identity, retained connection metadata. |
| `src/utils/universe.ts` | House-aware office reverse lookup, explicit universe fallback, nation support. |
| `src/components/studios/lorebook/RelationshipGraph.tsx` | Primary labels and counts, path/label/keyboard disclosure, provenance and navigation, historical office omission. |
| `src/components/studios/lorebook/UniverseDashboard.tsx` | Render office-only graphs, scope documents to the universe, apply entity focus to derived connections. |
| `src/components/studios/WebOfThought.tsx` | Historical relationship evidence from the existing canonical/alternate ancestry resolver. |
| `src/components/studios/lorebook/CharacterProfileFields.tsx` | Coherent social section; residence moved to identity without migrating saved data. |
| `src-tauri/src/publication/models.rs` | Optional institutional positions and underlying aggregate connection details in PublicationDocument. |
| `src-tauri/src/publication/generator.rs` | Selected-source office projection, pair aggregation, exact template suppression, historical filtering, regression tests. |
| `src-tauri/src/publication/pdf.rs` | Institutional positions, aggregate connection details and wrapped relationship summaries. |
| `src/services/publication.ts` | Matching TypeScript PublicationDocument contract. |
| `src/utils/lorebookPdf.ts` | Matching frontend PDF output, text wrapping and glyph checks for added content. |
| `tests/acceptance_relationships.test.ts` | Seven projection, isolation, history, selection, and PDF regressions. |
| `tests/fixtures/acceptance-relationships.html` | Isolated browser test entry point. |
| `tests/fixtures/acceptance-relationships-browser.tsx` | Real React/DOM interaction checks using fictional fixture data. |
| `package.json` | Register acceptance tests in the frontend suite; version unchanged. |
| `docs/ACCEPTANCE_RELATIONSHIPS_BETA4.md` | This acceptance report. |

The publication files already existed as untracked work at the start of this task; the table describes changes made to that work, not ownership of their complete contents.

## Canonical sources

- Authored Web of Thought `Plan.relationships` records supply identity, endpoint IDs, direction, authored labels/descriptions, universe/book scope, and milestone context.
- Character affiliation and residence selectors already write explicit relationships to that same catalog. They are not separate derived membership/residence records.
- `faction_fields.positions[].holder_ids` supplies office holdings. Position titles, branch IDs, and faction branches supply institutional context. This remains faction-owned data.
- Character free-text affiliation/residence fields are legacy prose. Matching names never create edges, citizenship, residence, or inferred offices.
- Historical relationship changes follow the existing milestone ancestry resolver, including alternate divergence limits. Current profiles are not historical office baselines.
- Publication derives only from the already selected, House/universe/privacy-filtered source documents. It uses publication-local anchors, not internal entity or office IDs.

## Aggregation and priority

The default graph has one visual edge per unordered pair of stable entity IDs. Each edge retains every underlying connection with its direction, identity, type/label, provenance, and supporting evidence or office metadata. Aggregates are never saved to the canonical catalog.

Priority is office, other authored relationship, then explicit membership. The current canonical schema has no designated-primary field. Equal-priority labels use locale-independent Unicode ordering and stable relationship identity for deterministic graph selection. Neutral office labels retain actual titles, such as `Holds Cognitive Emperor in` and `Holds Galactic Admiral in`; neither implies leadership of an entire faction. Additional connections remain visible through a count and disclosure panel.

The graph rendering limit selects pairs and then retains every connection belonging to those pairs. It does not truncate a displayed pair's facts. Same-name factions remain distinct.

## UI changes

- Click an edge path or label, or use Enter/Space, to toggle a compact panel below the graph. Close collapses it. The panel has bounded detail scrolling and does not cover the SVG.
- Details distinguish authored links from derived offices, retain source-to-target direction, show branch/source information where available, and navigate to the character or faction organization.
- Selecting an edge does not focus a node or alter the camera. Selecting a node remains independent. Changed sources/filters refresh or dismiss stale edge details.
- Social Standing & Narrative Role groups occupation, narrative role, institutional positions, and explicit affiliations. Residence / Origin Location appears in Core Identity; its existing fields and relationship storage are preserved.
- Office-only universes now render a graph without requiring an unrelated authored edge first.

## Publication changes

Markdown and both PDF renderers consume the same PublicationDocument projection. Character entries have an optional Institutional Positions subsection with selected faction and branch context. Relationship sections aggregate by selected endpoint identity and retain underlying authored/office details and directions.

Derived offices require both selected character and faction documents, hierarchy inclusion, and holder inclusion. Excluding factions, hierarchy, holders, or an endpoint suppresses the corresponding office. No derived office IDs or private milestone notes are published. Authored relationships remain underlying authored records; they are not replaced in storage.

The unscoped publication relationship section includes shared Universe relationships, avoiding silently publishing Book/alternate-specific definitions as canonical Universe facts. Alternate timelines remain explicitly labeled in their existing section.

Only exact factory Overview/Historical Lore instruction strings under their original headings are omitted. Exact factory strings account for entry type, factory singular labels, and the selected universe name. Edited prose, different text, and instructional-looking prose outside the template headings remain. Empty recognized sections are omitted. Canonical document bodies are never rewritten.

## Historical limitations

Office assignments have no dated history in the current schema. Milestone-cutoff or alternate-continuity publications omit current holders and derived offices and issue an omission warning. Historical graphs omit derived offices and disable the present-day hierarchy tab. Titles may remain in an included faction's organizational structure, but holder names do not become historical facts.

Historical graph evidence uses canonical/alternate predecessor ancestry; explicit unknown relationships remain labeled Unknown / unrecorded. Relationships involving an explicitly not-yet-introduced entity are omitted. Publication cutoffs resolve shared Universe relationship labels at the cutoff, omit future/unknown relationship states and undated descriptions, and suppress explicitly not-introduced entities. Invalid relationship cutoffs fail closed.

The publication request has no selected branch-state snapshot parameter; including alternate continuity timelines does not manufacture a historical office snapshot. Current entity prose is not reconstructed as historical prose. Broader historical prose reconstruction remains outside this focused fix.

## Verification

- `npm test`: 651 tests passed, zero failures.
- `cargo test --workspace`: 190 tests passed (177 library tests and 13 integration tests), zero failures.
- `npm run build`: TypeScript check and production Vite build passed; existing large-chunk warning remains.
- Browser fixture: PASS for aggregate label/count, label/path/keyboard disclosure, expand/collapse, provenance, branch context, navigation, and independent node focus/camera. Fixture URL while Vite is running: `/tests/fixtures/acceptance-relationships.html`.
- Rust/Node persistence suites initially hit sandbox temporary-file rename restrictions; reruns outside the sandbox passed.

Coverage includes emperor/admiral titles; membership plus offices; multiple offices/factions; identical display names; deterministic priority; direction/provenance; assignment removal/reassignment; House/universe isolation; future, unknown, and alternate ancestry; selection privacy; exact/edited/empty template prose; and shared Markdown/PDF content.

## Remaining acceptance issues

No known failing automated acceptance checks. Dated office history cannot be resolved with the current canonical schema, so omission is deliberate. Full desktop acceptance with the user's actual notebooks, large-world graph navigation, and multilingual PDF fonts remains a manual check. The existing production bundle-size warning is unchanged. This beta has not been promoted to stable.
