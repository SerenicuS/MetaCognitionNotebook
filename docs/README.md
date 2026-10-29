# Documentation index

For current behavior, start with the [project overview and development commands](../README.md), [authoritative system design](../SYSTEM_DESIGN.md) and [roadmap](ROADMAP.md). The in-app Help & Guide is the practical manual: 11 chapters, 43 sections, with stable IDs in [manual.ts](../src/help/manual.ts) and view-specific walkthrough text in [onboarding.ts](../src/help/onboarding.ts).

## Current evidence

- [Portable Universe Format Specification (v1)](PORTABLE_UNIVERSE_FORMAT_V1.md): authoritative specification for `.mcuniverse` versioned ZIP archives, manifest schema, payload layout, validation rules, and recovery semantics.
- [v0.6.2 Graph, Reciprocal Synchronization & Archive Safety](TEST_REPORT_v0.6.2_GRAPH_SAFETY.md): latest full implementation verification and remaining Windows checklist.
- [v0.6.2 Documentation Audit & Synchronization](DOCUMENTATION_AUDIT_v0.6.2.md): discrepancies corrected, source references and checks rerun for this documentation pass.
- [v0.5.1 active recovery report](TEST_REPORT_v0.5.1.md): detailed activation/journal failure evidence; current summary is in SYSTEM_DESIGN.
- [v0.6.1 Help overhaul report](TEST_REPORT_v0.6.1_HELP_OVERHAUL.md): manual hierarchy and original verification; workflow text has since been synchronized for v0.6.2.

As of v0.8.0-beta.4, automated test suites record 644 frontend tests (across 47 test suites) and 183 Rust backend tests passing cleanly. Those are **recorded implementation results**, verified in both debug and release profiles, and packaged into a standalone Windows NSIS installer. Read the audit report for its own results. Manual Windows interaction, visuals, accessibility, forced termination and release acceptance remain outstanding.

## Historical reports

These preserve the implementation state and recommendations at the time of each pass. Their counts, source-line labels and limitations may be superseded. Links point to current source files, not frozen historical revisions.

| Record | Scope |
| --- | --- |
| [v0.3.0](TEST_REPORT_v0.3.0.md) | Gilded Identity / ergonomics |
| [v0.3.1](TEST_REPORT_v0.3.1.md) | Thinking Desk / Philosophy |
| [v0.4.0](TEST_REPORT_v0.4.0.md) | Writer's Workshop |
| [v0.5.0](TEST_REPORT_v0.5.0.md) | Initial Vault separate recovery |
| [v0.5.2](TEST_REPORT_v0.5.2.md) | Emotional Cipher |
| [v0.6.0](TEST_REPORT_v0.6.0.md) | Initial Web of Thought |
| [v0.6.1 initial](TEST_REPORT_v0.6.1.md) | Original Help/onboarding |
| [Lorebook architecture audit](LOREBOOK_ARCHITECTURE_UX_AUDIT.md) | Pre-Living-Universe findings and proposals, not current architecture |
| [v0.6.2 initial](TEST_REPORT_v0.6.2.md) | Initial Living Universe implementation (199 frontend / 77 Rust at that stage) |
| [v0.6.2 first-Universe fix](TEST_REPORT_v0.6.2_CRITICAL_BUGFIX.md) | Empty catalog creation |
| [v0.6.2 save/autosave pass](TEST_REPORT_v0.6.2_SAVE_AUTOSAVE.md) | Manual save and initial revision handling; automatic reconciliation description superseded |
| [v0.6.2 relationships](TEST_REPORT_v0.6.2_RELATIONSHIPS.md) | Initial relationship integration; failure-discard behavior superseded |
| [v0.6.2 entity links](TEST_REPORT_v0.6.2_ENTITY_LINKS.md) | Guided attributes and initial entity-link consistency |

No historical test report is a release approval. Use the current source and SYSTEM_DESIGN to resolve conflicts, then check the latest relevant report for evidence and pending manual work.
