# Development roadmap

Current development version: **v0.6.2 — The Living Universe**. Version labels identify engineering milestones, not published distributions or release dates. Automated implementation evidence and native acceptance are separate; see the [documentation index](README.md) and [latest full verification report](TEST_REPORT_v0.6.2_GRAPH_SAFETY.md).

## Implemented foundations and historical milestones

| Version | Milestone | Implemented scope / evidence |
| --- | --- | --- |
| v0.1.0 | The Foundation | Tauri/Rust, SQLite index, canonical Markdown and IPC; foundation retained in current source |
| v0.2.0 | The Three Studios | Poetry, Philosophy and Lorebook; retained in current source |
| v0.2.1 | Phase 2A Reliability | Save/close coordination; retained autosave regression suite |
| v0.3.0 | The Gilded Identity | Branding, themes and desktop ergonomics; [report](TEST_REPORT_v0.3.0.md) |
| v0.3.1 | The Thinking Desk | Freeform Philosophy and optional reasoning roles; [report](TEST_REPORT_v0.3.1.md) |
| v0.4.0 | The Writer's Workshop | Tags, Favorites, sort/filter and opening-based Recent; [report](TEST_REPORT_v0.4.0.md) |
| v0.5.0 | The Vault | Local verified backups and separate-folder recovery; [report](TEST_REPORT_v0.5.0.md) |
| v0.5.1 | The Vault Recovery Polish | Preserved notebook selection, restart and startup recovery; [report](TEST_REPORT_v0.5.1.md) |
| v0.5.2 | The Emotional Cipher | Poem-specific keys, Key Library and portable Cipher files; [report](TEST_REPORT_v0.5.2.md) |
| v0.6.0 | Web of Thought | Milestones, sparse world-state evidence and shared history; [report](TEST_REPORT_v0.6.0.md) |
| v0.6.1 | Help Center & Guided Onboarding | Offline hierarchical Help and opt-in walkthrough; [overhaul report](TEST_REPORT_v0.6.1_HELP_OVERHAUL.md) |
| v0.6.2 | The Living Universe | Universe-first worldbuilding, Books/Chapters, reciprocal links, graph and archive safeguards; implementation and stabilization in progress |

Historical reports retain their original recommendations and test counts. “Implemented” does not imply every native acceptance item has passed or that a release was published.

## Planned versioned milestones

| Version | Direction | Status |
| --- | --- | --- |
| v0.7.0 — The Manuscript | Manuscript tools, revision snapshot history, supported export development including Markdown where applicable, PDF/ePub compilation goals and writing statistics | Planned; existing individual poem/Lore exports do not constitute a Manuscript compiler |
| v0.8.0 — Echo Library | Lorebook mention linking, contextual previews and richer explicit entity references, building on existing stable entity IDs | Planned; the current entity registry is a foundation, not completed Echo Library |
| v0.9.0 — Conversation Archive | Separate optional import/indexing of conversation logs from AI platforms | Planned; not a writing studio or Echo Library |
| v1.0.0 — The First Edition | Production hardening, acceptance and intended public installer distribution | Planned; no stable/public-release claim |

## Future studio development — versions not assigned

- Philosophy Studio expansion beyond the current freeform/role-based blocks.
- Notes Studio for scratchpad writing.
- Essay Studio supporting essays **and letters**.
- Further Poetry Studio writing and analysis improvements.

Google Drive backup, stronger backup security, larger-library performance and richer recovery remain deferred/exploratory design questions. No credentials, cloud integration, guarantee of encryption, delivery date or new release number is implied.

The immediate v0.6.2 work is stabilization and manual Windows acceptance: save/navigation, reciprocal links, dense graph interaction/accessibility, archive partial failures, and Vault activation/restart. This audit adds documentation, not those future features.
