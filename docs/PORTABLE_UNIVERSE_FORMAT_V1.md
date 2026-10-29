# Portable Universe format 1 — L1

Status: implemented backend export and read-only inspection for v0.8.0-beta.4.
This document describes `.mcuniverse` packages, not Vault `.mcbackup` files.
Import mutation, ID remapping, publication/PDF rendering, and final UI integration
are outside L1. No application version or existing canonical schema is changed.

## Implementation and APIs

The authoritative strict wire types are in `src-tauri/src/portable.rs`; document,
reference, and ordering validation is in `portable/validate.rs`. JSON is parsed
through `portable/json.rs`, rejecting duplicate keys recursively before typed
deserialization. All transport records deny unknown fields. Document frontmatter
is intentionally extensible and is preserved rather than filtered through a
closed transport struct.

Rust APIs:

```rust
portable::export(&AppState, ExportRequest, &Path) -> Result<Inspection, String>
portable::inspect(&Path) -> Result<Inspection, String>
```

The two Tauri commands run filesystem work on blocking workers:

```typescript
api.portableUniverseExport(request, destination): Promise<PortableInspection>
api.portableUniverseInspect(path): Promise<PortableInspection>
```

Their IPC arguments are respectively `{ request, destination }` and `{ path }`.
Nested request fields use snake_case:

```json
{
  "universe_id": "uni-existing-identity",
  "snapshot_basis": "last_saved_state",
  "book_ids": ["book-existing-identity"],
  "chapter_ids": ["chapter-existing-identity"]
}
```

All four request fields are required; there are no implicit inclusion defaults.
`last_saved_state` is the only accepted snapshot basis. The backend makes no claim
that editor buffers have been saved. Future UI code can use
`exportPortableAfterSave(flush, capture)` to require a successful flush before
calling the same backend API. A failed/rejected flush never calls capture.
Browser preview refuses both native operations rather than simulating durability.

The destination must have the exact `.mcuniverse` extension, an existing parent
directory outside the source notebook, and no existing destination file. Export
does not show a save dialog in L1. Choosing the path belongs to later UI work.

Successful inspection returns the complete validated manifest, Universe metadata,
archive SHA-256 and size, compatibility result/unsupported feature names, active
document-directory count, archived-document-directory count, included chapter
count, asset count, Book/branch/milestone/relationship counts, and an archive-record
list with `kind` and `id`. That list also includes flagged archived Universes,
Books, continuities, milestones, relationships, and documents whose metadata
contains `archived: true`. Counts of planning records include archived records.
`document_count` describes the `documents/` inventory; the archive-record list is
the precise archive-state report.

Malformed/incomplete packages return an error, never a partial success. Unsupported
format/schema/history versions return a version error. A structurally valid
format-1 package requiring additional unknown feature names can be inspected with
`compatible: false` and explicit `unsupported_features`. This does not authorize
import. L1 has no import command or destination mutation API.

## Container and bounds

The ZIP uses Stored entries (no compression), a single volume, and no archive
comment, encryption, data descriptors, ZIP64 sizes, directory entries, symlinks,
or reparse files. Reused Vault preflight verifies central/local header agreement,
names, sizes, flags, byte ranges, no overlaps/gaps/unlisted trailing payload, and
Windows-safe unique paths before `ZipArchive` allocates its entry map.

The only allowed paths are:

```text
manifest.json
planning/universe.json
documents/<generated-token>.md
archives/<generated-token>.md
assets/<generated-token>
```

Generated package paths do not depend on titles, IDs, or source filenames. Asset
extensions and original locations remain available in the asset inventory.
The single-segment payload names cannot contain further directories. Windows
device names, ADS separators, absolute/traversing paths, backslashes, control
characters, trailing dots/spaces, Unicode case aliases, duplicate names, and
file/directory conflicts are rejected. Original source paths are validated too.

Limits:

| Limit | Value |
| --- | --- |
| Manifest | 4 MiB |
| Individual payload | 64 MiB |
| Sum of payload bytes, excluding manifest | 128 MiB |
| Complete archive including allowed overhead | 148 MiB |
| Payload count | At most 9,999, plus one manifest |
| ZIP central directory | 16 MiB, inherited from Vault |
| Source discovery inventory | 10,000 files, 256 MiB read aggregate |
| Serialized planning records | Existing 8 MiB / 30,000 counted-ID limits |
| JSON structural tokens per parsed JSON value | 500,000 opening containers, colons, and commas outside strings |

JSON nesting also remains bounded by serde_json's default recursion limit. Wide
JSON structures are rejected before allocation. Document/asset inventory
uniqueness is checked before loading document copies, preventing repeated
inventory entries from amplifying one payload's memory use.
The source candidate bound includes `library.json`, Lorebooks, Backups, and
Attachments, including unrelated candidates. This is deliberately conservative;
a small Universe in a larger candidate tree can exceed the L1 source-scan bound.

## Manifest schema

UTF-8 JSON, schema version 1. Every field below is required. Optional reference
values are JSON `null`; objects do not accept additional wire keys.

| Field | Meaning |
| --- | --- |
| `format` | Exactly `metacognition.portable-universe` |
| `format_version`, `schema_version` | Both exactly `1` |
| `package_id` | New package UUID; never replaces a source Universe/document ID |
| `app_version` | Producer version string; independent of compatibility gates |
| `created_at` | RFC3339 timestamp with zero UTC offset |
| `source_universe_id` | The one Universe present in the planning payload |
| `source_house` | `{ id, name }`; provenance only, never destination authority |
| `snapshot_basis` | Exactly `last_saved_state` |
| `source_plan_revision` | Captured revision; must match the planning payload |
| `compatibility` | Planning/history versions and explicit required features |
| `scope` | Worldbuilding completeness, selected/structural Books, included/omitted chapters |
| `planning_path` | Exactly `planning/universe.json` |
| `documents` | Active-path canonical document inventory |
| `archived_documents` | Attributable Backups-path document inventory |
| `assets` | Local attachment payload and document dependency declarations |
| `ordering` | Source document sequence and per-timeline/Book identity sequences |
| `unresolved_references` | Array of diagnostics; must be empty for successful full-fidelity export/inspection |
| `warnings` | Explicit compatibility/opaque-frontmatter diagnostics |
| `files` | Exact payload allowlist with byte sizes and lowercase SHA-256 |

`compatibility`:

```json
{
  "planning_schema_version": 1,
  "history_semantics_version": 1,
  "required_features": [
    "canonical-markdown",
    "history-v1",
    "alternate-continuities",
    "chapter-milestone-context",
    "opaque-frontmatter"
  ]
}
```

Those five declarations are mandatory for format 1. Extra feature names are
reported as unsupported. Compatibility is never inferred solely from app version.

`scope`:

```typescript
{
  worldbuilding_complete: true;
  selected_book_ids: string[];
  structural_book_ids: string[];
  omitted_book_ids: string[];
  included_chapter_ids: string[];
  omitted_chapters: {
    id: string;
    book_id: string;
    source_relative_path: string;
    chapter_order: number;
    created_at: string;
    reason: 'chapter_prose_not_selected';
  }[];
}
```

Selected and structural Book sets must be disjoint and cover every packaged Book.
Selected Book records are preserved, including description, continuity, branch
association, and archive flag. An unselected Book required by an included document,
milestone, or relationship is retained and declared structural; its chapter prose
is not implicitly included. Unselected Books without a required dependency are
excluded, with their identities declared in `omitted_book_ids` so their private
descriptions do not leak. Omitted chapter ordering can refer to such an omitted
Book identity without packaging its record. An included chapter requires
both its chapter ID and its Book ID in the request. Omitted chapter prose does not
enter the package, but its identity, source path, order, and creation timestamp
are declared. Completeness applies to supported worldbuilding configuration;
chapter prose is a separately explicit scope decision.

Both document inventories contain:

```typescript
{
  id: string;
  path: string;
  source_relative_path: string;
  universe_id: string;
  book_id: string | null;
  entry_type: string;
  materialized_raw: boolean;
  opaque_fields: string[]; // JSON pointers for unrecognized frontmatter fields
}
```

Each included canonical document is unique by identity, package path, and source
path. Its ID, category, resolved Universe/Book attribution, House, and opaque
field declarations must agree with the actual frontmatter. Its ID may equal its
planning entity-registration ID (that is the same entity), but may not collide
with a Universe, Book, continuity, milestone, change, or relationship identity.

`assets` entries are `{ path, source_relative_path, referenced_by: string[] }`.
Only `Attachments/` source dependencies are supported. Each declared asset must
be used by exactly the declared set of included documents, and every recognized
local attachment reference must have a declared payload. Duplicate asset source
or package paths, missing users, foreign users, and unused declarations fail.

`files` entries are `{ path, size, sha256 }`. Every ZIP entry except the manifest
must appear exactly once, and every listed entry must exist. The manifest is
excluded from its own file list; the inspection archive hash binds it too.
Hashes provide integrity, not an author signature or proof of provenance.

Diagnostics use `{ code, record_id, message }`. Opaque included frontmatter must
have an `opaque_frontmatter` warning. Blocking failures return actionable errors;
the exporter never publishes a package with unresolved required references.

## Canonical dependency collection

The collector reads canonical files directly and uses the index only for stable
raw-Markdown metadata and saved document ordering. It never reindexes or writes
frontmatter to the source. It takes the existing database then registry locks,
rejects activation write barriers/pending Universe moves, and reads the registry
without assigning or changing ownership.

One active `_web_of_thought` catalog must be discoverable. Duplicate catalogs,
reserved catalog files missing their namespace, and archived catalog candidates
require manual resolution. The entire planning document is never packaged.
The selected planning subset retains the existing Plan version/revision and only
the selected Universe's Universes/selected-or-required Books/branches/entities/nodes/relationships.
Archived planning flags, state-change IDs and values, notes, previous-value
expectations, origin links, and relationship changes are preserved.

Document ownership is resolved by explicit Universe ID, uniquely resolvable
House-aware legacy name, or existing entity registration. Conflicting attribution
or House ownership blocks export. Stable legacy attribution is recorded in the
inventory without rewriting the source bytes. Legacy Book names must resolve to
one selected-Universe Book. Missing or ambiguous attribution is never guessed.

All attributable nonchapter lore documents are included, even when not yet
registered in the plan. Omitted chapters' unused entity registrations are omitted
from the transport subset along with their prose, with explicit omission records.
If history, relationships, a faction holder, or another included document actually
requires an omitted chapter identity/document, closure validation fails: the
author must include it. No invented placeholder documents or E3 references exist.

Validation covers:

- Every planning entity registration resolves to one included active/archive document.
- Relationship endpoints, Book/context scope, and relationship-change targets.
- Every entity change, property uniqueness, and referenced entity membership.
- Chapter Book and historical milestone bindings and compatible branch scope.
- Divergence existence, Universe scope, non-Book divergence, declared parent
  consistency, and ancestry cycles. An active branch cannot use an archived divergence.
- Promotion origin and Canonical Book provenance; linked Universe event existence.
- Faction branch/position identity, parent existence/cycles, position branch,
  holder uniqueness, and holder Character document/type.
- Generic document parent references.
- Field types for supported Lorebook profile/guided metadata and custom attributes.

Current profile vital status is never converted into a historical baseline.
`null`, `not_introduced`, absent changes, previous-value conflicts, and branch
ancestry retain their authored meaning. Source profile/body bytes remain intact.

Backups are selected by canonical identity/attribution rather than filename time.
Multiple active/archive candidates with the same selected identity are ambiguous,
even if their bodies match; no latest-file heuristic is used. Archived documents
stay in the separate archive inventory. Uninterpretable archived raw Markdown is
blocked because it has no trustworthy canonical identity.

For active raw Markdown without frontmatter, exactly one indexed source-path
record is required. Its identity, title, House, timestamps, tags, parent, and
metadata are materialized into frontmatter in the package copy only. Missing
required canonical documents, including indexed selected documents whose files
are gone, block export. Source IDs are never generated or reassigned.

Unknown frontmatter is preserved byte-for-byte for canonical files. Unknown fields
are listed and warned about; L1 promises opaque preservation, not interpretation
of arbitrary extension reference semantics. Detectable attachment/link syntax
embedded in metadata/planning fields is blocked until a typed dependency adapter
exists. Application preferences, SQLite contents, notebook-wide registry data,
music, and Echo/editor state are not packaged. Canonical document `_workshop`
organization metadata remains part of its unchanged frontmatter.

## Ordering and later remapping

`ordering` contains:

```typescript
{
  algorithm: 'source-order-v1';
  source_document_ids: string[];
  timelines: {
    book_id: string | null;
    branch_id: string | null;
    milestone_ids: string[];
  }[];
  chapters: { book_id: string; chapter_ids: string[] }[];
}
```

Every planning node is represented once, including archived nodes. Timeline
ordering is position then source ID; the active timeline is its nonarchived
subsequence. For tied positions, L1 supports lowercase ASCII/digit IDs with the
same punctuation at the same offsets (including ordinary UUIDs and consistently
prefixed IDs). Locale-sensitive incompatible shapes/non-ASCII ties are blocked
rather than approximated, because the frontend uses JavaScript `localeCompare`.

Chapter order is numeric `chapter_order` (missing defaults to 999999), then source
creation timestamp under the frontend's string collation, then saved source document sequence.
The uppercase RFC3339 alphabet uses the tested punctuation order `- : . +`, then
digits, `T`, and `Z`; sorting by actual instant or ASCII bytes would change some
existing chapter sequences. A shared fixture is verified against the real
frontend `getChaptersForBook` helper and the Rust exporter. Lowercase/noncanonical
chapter timestamp alphabets require an explicit source-engine adapter and are blocked.
Index enumeration order
is recorded so equal order/timestamp chapters keep their effective saved sequence.
Unindexed/archived documents receive a deterministic source-path fallback.
Transient React/editor UI ordering is not serialized. Omitted chapters remain in
the ordering inventory. Book-associated nonchapter documents with explicit
`book_id` also remain in the Book sequence because the current chapter selector
includes them.

L2 must translate the recorded identity sequences through its ID map and verify
the resulting order. Simply retaining tied positions after generating new IDs is
insufficient. L1 makes no ID mapping or ordering changes to source records.

## Snapshot and publication safety

Discovery fingerprints the bounded candidate set, then checks each captured read
against its fingerprint. A final inventory/hash pass checks additions, removals,
content changes, registry changes, and new archive ambiguity. The indexed metadata
snapshot is also rechecked. In-process canonical writers remain behind the
database/registry locks while capture and publication complete. External edits
detected during capture abort; the feature does not promise protection against
unobservable edit-and-revert activity between checks.

Output is written to a randomly named `.partial` temporary file beside the chosen
destination. The archive is finished and flushed, fully inspected, and source
fingerprints are rechecked before no-clobber publication. A destination appearing
during capture is preserved. Normal failures clean up owned temporary output;
process termination may leave a clearly named `.partial`, never a successful
`.mcuniverse` result. Only a validated completed archive is published.

Inspection hashes the opened file before/after parsing and compares the final
path hash too. It extracts no files, opens no destination notebook, invokes no
reindexing, and performs no House/catalog/document mutation.

## Deliberately unsupported in L1

- Import, separate-copy remapping, merge/update, reader publication, PDF, and final UI.
- Incomplete required records, ambiguous archive versions, unresolved legacy
  names, raw unindexed identities, and archived raw Markdown.
- Unsupported planning/history versions or incompatible tied milestone ID shapes.
- Media/link dependencies inside metadata/planning without an adapter; local
  document cross-links, wiki references, raw HTML/autolinks, reference-style media,
  nested/escaped/percent-encoded local destinations, absolute/file/UNC paths, and
  assets outside `Attachments/`.
- Remote media downloading. HTTP/HTTPS/mailto hyperlinks in media-free body text
  remain authored links; a body mixing image syntax with remote links is rejected
  conservatively rather than guessing which remote destination is a media asset.
- Parsing Markdown code examples separately from actual dependency syntax; the
  conservative scanner may block link-like examples until a Markdown AST adapter.
- Interpreting hidden references in arbitrary opaque extensions. Their bytes are
  preserved and the limitation is explicit; a future importer must gate remapping.
- Libraries/packages exceeding the documented bounds or using linked/reparse candidates.

## Consequences for L2

1. Merge the planning subset into the existing shared catalog; never add a second catalog.
2. Require an explicit destination House; source House provenance grants no authority.
3. Treat document IDs and matching plan entity-registration IDs as one identity domain.
4. Translate all known references, faction-local hierarchy/holder IDs, chapter
   associations, asset mappings, and recorded source order through one durable map.
5. Preserve archive inventories/flags and opaque metadata. Unsupported extension
   reference semantics must gate remapping rather than trigger generic replacement.
6. Omitted prose is an explicit boundary; it is not a missing document to fabricate.
7. Materialized raw records now have canonical identities without needing a source index.
8. Assets retain source-relative references. L2 must restore a compatible relative
   layout or rewrite supported destinations using the declared mapping.
9. Reconstruct Echo names/aliases/dossiers and historical caches from canonical data.
   No persistent Echo E3 prose-span records exist in this format.
10. L1 does not supply import transaction/recovery semantics; durable multi-file
    publication and checked index reconstruction remain required L2 work.

## L1 verification record — 2026-10-28

| Verification | Exact result |
| --- | --- |
| `cargo test --locked --offline` | 133 library tests + 3 Thinking Desk integration tests + 10 Workshop integration tests passed; 0 failures (146 total) |
| New portable Rust coverage | 27 tests passed within the library suite |
| `npm test` | 617 tests, 46 suites; 617 passed, 0 failed/cancelled/skipped/todo |
| New frontend contracts/ordering coverage | 5 tests passed within the frontend suite |
| `npx tsc --noEmit` | Passed; the final production build also reran TypeScript checking |
| `npm run build` | Passed: TypeScript and Vite production build; existing large-chunk advisory remains |
| `rustfmt --check --edition 2021 src-tauri/src/portable.rs` | Passed |
| `git diff --check` on changed tracked L1 files | Passed |

Filesystem tests ran outside the sandbox after the sandbox denied temporary-file
publication/rename operations. Native Windows filesystem behavior was exercised;
GUI acceptance and cross-installation import are not claimed. No installer,
commit, push, tag, release, dependency update, or version bump was created.

Changed files for L1 (pre-existing working-tree changes are separate):

- `src-tauri/src/portable.rs`
- `src-tauri/src/portable/collect.rs`
- `src-tauri/src/portable/json.rs`
- `src-tauri/src/portable/validate.rs`
- `src-tauri/src/portable/tests.rs`
- `src-tauri/src/lib.rs` (two command registrations)
- `src-tauri/src/vault.rs` (shared primitive visibility and policy-injected preflight wrapper; Vault policy unchanged)
- `src/services/portable.ts`
- `src/services/api.ts`
- `src/services/commands.ts`
- `tests/portable_universe.test.ts`
- `tests/fixtures/portable_chapter_order.json`
- `package.json` (test-suite registration only)
- `docs/PORTABLE_UNIVERSE_FORMAT_V1.md`
