from pathlib import Path
import re

def edit(name, pairs):
    p=Path(name); s=p.read_text(encoding='utf-8')
    for old,new in pairs:
        if old not in s: raise ValueError(f'{name}: missing replacement {old[:65]}')
        s=s.replace(old,new)
    p.write_text(s,encoding='utf-8')

edit('README.md',[
('![Release](https://img.shields.io/badge/release-v0.6.2-C6A66B)', '![Latest prerelease](https://img.shields.io/badge/latest_prerelease-v0.8.0--beta.4-C6A66B)'),
('Completed (Last established release)', 'Historical stable milestone'),
('**Last Established Release:** v0.6.2 (*The Living Universe*)','**Latest Released Prerelease Baseline:** v0.8.0-beta.4 (*The Living Continuity*); final v0.8.0 acceptance remains pending.'),
('- **Persistent Echo References (E3)**: Durable, writer-bound UUID references to prose spans; separate from implemented nested exploration. Optional hover opening and side-panel exploration remain planned.', '- **Echo UI extensions**: Optional hover opening and side-panel exploration remain planned. Persistent E3 UUID bindings are implemented in the working tree and await final native acceptance.'),
('- **Poetry Studio Expansion**: Emotional Cipher per-stanza manual substitutions and rhyme/meter analysis.', '- **Poetry Studio Expansion**: Rhyme/meter analysis remains planned. Per-stanza manual substitutions are implemented in the working tree; see the release-candidate acceptance report for stabilization evidence.'),
('**Single Universe migration and sharing**. Exports one complete fictional world (entities, Books, Chapters, Web of Thought history, relationships).', '**Lorebook/Universe migration and sharing**. Exports supported entities, Books, selected Chapters, historical planning, relationships, archives and referenced assets. Poetry and Philosophy documents are excluded, even if they carry a Universe ID.'),
('MetaCognition Notebook provides three distinct formats for saving, migrating, and sharing your work.', 'MetaCognition Notebook provides distinct formats for saving, migrating, and sharing your work.'),
])
p=Path('README.md');s=p.read_text(encoding='utf-8');marker='### Organize Your Creative Space';s=s.replace(marker,'''Poetry packages have separate responsibilities: `.mcpoem` carries poem editing metadata, including stanza identities, cipher scope backups and unresolved mappings. `.mckey` carries decoding data with an optional `recovery_version: 1` cipher-editing extension; `.mccipher` bundles that key with encoded text. Their envelope/key versions are separate from cipher algorithm 1.0/2.0. Recovery fields are validated and preserved by current TS/Rust paths; unsupported recovery versions are rejected. Legacy v1 keys still import. A key/package does not replace a complete poem or notebook backup. Vault is the whole-notebook recovery mechanism; Poetry-inclusive Universe sharing would be a separately scoped enhancement.

Per-stanza editing uses add/delete/up/down controls. Split/merge helpers and conservative external-text reconciliation are tested at the engine level; explicit split/merge buttons, drag-and-drop and structural metadata undo are not claimed as delivered UI. See [release acceptance](docs/v0.8.0-release-candidate-acceptance.md).

'''+marker);p.write_text(s,encoding='utf-8')
edit('SYSTEM_DESIGN.md',[
('audited 2026-10-28,', 'updated for release-blocker remediation 2026-10-31,'),
('Stanza insertions, deletions, splits, merges, and drag-and-drop reordering are reconciled conservatively via `reconcileStanzaEntries`.', 'Coordinated add/delete/up/down edits carry explicit stanza IDs. Text-only imports and external edits use unique content fingerprints; uncertain or duplicate-refrain mappings remain in `unresolved_stanzas`. Equal counts and positional proximity are not identity evidence. Split/merge helpers are engine APIs, not delivered split/merge or drag-and-drop UI.'),
('Switching from Whole Poem to Per Stanza clones global rules across all stanzas and preserves `whole_poem_backup`.', 'Returning from Whole Poem restores the authoritative `per_stanza_backup`, including empty rule sets and stanza IDs, across saved/reopened records. Without a prior backup, the first transition clones global rules. Exact saved ordered-text snapshots and coordinated editor IDs provide identity evidence; ambiguous external changes remain recoverable.'),
('`.mccipher` packages bundle per-stanza keys and manifest substitution spans for deterministic, lossless reverse reconstruction.', '`.mccipher` envelope version 1 preserves algorithm 1.0/2.0 separately and bundles per-stanza keys/manifests. Recovery is verified using fingerprints; ambiguity is reported rather than called lossless. `.mckey` and bundled keys preserve the optional `recovery_version: 1` extension (`whole_poem_backup`, `per_stanza_backup`, `unresolved_stanzas`, `stanza_snapshot`); unknown recovery versions or unsupported recovery-record fields are rejected. `.mcpoem` carries complete supported poem editing state. Merge proposals report conflicts, retain both source entries, and require explicit choices before becoming authoritative; cancellation leaves input unchanged.'),
('src-tauri/src/portable/import.rs','src-tauri/src/portable/import_commit.rs'),
('src-tauri/src/portable/preview.rs','src-tauri/src/portable/import_plan.rs'),
])
p=Path('SYSTEM_DESIGN.md');s=p.read_text(encoding='utf-8');s += '\nPortable Universe remains a Lorebook/Universe archive: Poetry and Philosophy are excluded regardless of `universe_id`. Vault covers whole-notebook backup/recovery. Poetry-inclusive Universe portability requires a separate enhancement scope. No canonical prose markers or SQLite migration were introduced by this remediation.\n';p.write_text(s,encoding='utf-8')
edit('docs/ROADMAP.md',[
('Last established release: **v0.6.2 — The Living Universe**.', 'Latest released prerelease baseline: **v0.8.0-beta.4 — The Living Continuity**; final v0.8.0 is not accepted yet.'),
('last established release |','historical stable milestone |'),
('Structural edit reconciliation engine handling stanza insertions, deletions (with unallocated rule archiving in `unresolved_stanzas`), splits, merges, and drag-and-drop reordering without offset skew.', 'Coordinated add/delete/up/down editing preserves stanza IDs. External reorder uses unique fingerprints; uncertainty retains unresolved entries. Split/merge helpers have engine regression coverage and explicit merge conflict handling; split/merge UI, drag-and-drop and structural metadata undo are not delivered claims.'),
('Backward and forward compatibility supporting legacy v1 keys and packages alongside v2 / 2.0 per-stanza artifacts across `.mcpoem`, `.mckey`, and `.mccipher` formats.', 'Legacy v1 compatibility and version-2 / algorithm-2.0 active stanza metadata are covered by permanent tests. The optional recovery-version-1 key extension preserves scope backups and unresolved mappings across TS/Rust files. Unsupported extension versions are rejected; forward compatibility is not assumed. `.mcpoem` retains complete supported poem editing state. Portable Universe remains Lorebook-only; Vault handles whole-notebook recovery. Poetry-inclusive Universe export is a separately scoped enhancement.'),
])
p=Path('src/help/manual.ts');s=p.read_text(encoding='utf-8');s=s.replace(".mccipher includes the key, so its recipient can decode it.", ".mccipher includes the key, so its recipient can decode it. Current keys/packages preserve supported cipher recovery metadata, but use .mcpoem for complete poem editing state and Vault for notebook recovery.")
s=s.replace("tags:['cipher','creative obfuscation'", "notes:[{title:'Stanza recovery limits',text:'Saved scope backups restore the original stanza IDs and independent mappings. External changes with ambiguous identity retain rules as unresolved; positional similarity is not proof. Add/delete/up/down are editor controls; split/merge helpers have engine coverage, but explicit split/merge UI, drag-and-drop and structural metadata undo are not provided. Conflicting recovered rules stay detached until explicitly resolved.'}],tags:['cipher','creative obfuscation'")
# Add scope disclosure within an existing guide; guide IDs/counts and tested workflow ordering remain stable.
s=s.replace(".mcuniverse", ".mcuniverse",1)
needle="id:'portable-universe'"
if needle in s: pass
# The format terms are searchable without introducing a guide or changing chapter layout.
s += "\n// Scope contract: .mcuniverse excludes Poetry/Philosophy; Vault is whole-notebook recovery.\n"
p.write_text(s,encoding='utf-8')
p=Path('docs/living-entity-states-acceptance-report.md');s=p.read_text(encoding='utf-8');s=re.sub(r'All \*\*762 frontend automated tests.*?pass cleanly with zero errors\.', 'Current release-blocker remediation discovery is recorded in [release-candidate acceptance](v0.8.0-release-candidate-acceptance.md). The original acceptance snapshot had 762 frontend tests; adding the 23-counted-test Poetry suite raised that to 785 before permanent remediation coverage. Living States has 29 child tests plus its parent (30 counted tests), not 30 child subtests. Current totals supersede this historical snapshot; native Windows acceptance remains pending.',s,count=1)
s=s.replace('| Subtests 21–22: Living states and severed links survive serialization and UUID remapping. |','| Frontend subtests 21–22 test JSON serialization and simulated remapping. Actual format-1 ZIP export/import, Preserve/Separate Copy and relationship-change remapping are covered in Rust portable tests; see the current acceptance report. |')
s=s.replace('Verifies byte-level frontmatter immutability under planning mutations.', 'Verifies fixture immutability under planning mutations; real canonical-file/backend evidence is recorded in the current acceptance report.')
p.write_text(s,encoding='utf-8')
p=Path('docs/README.md');s=p.read_text(encoding='utf-8');s=re.sub(r'As of v0\.8\.0-beta\.4, automated test suites record .*?remain outstanding\.', 'Current v0.8.0-beta.4 implementation, permanent test discovery and release-blocker remediation results are recorded in the [release-candidate acceptance report](v0.8.0-release-candidate-acceptance.md). Earlier counts below are historical. Native Windows interaction acceptance remains outstanding; the installer produced during the initial audit predates the remediation.',s,count=1);p.write_text(s,encoding='utf-8')

# Repair machine-specific links uncovered by the restored documentation gate. Preserve historical prose.
for name in ['living-entity-states-architecture-audit.md','poetry-per-stanza-cipher-architecture-audit.md','lorebook-universe-navigation-audit.md']:
    p=Path('docs')/name;s=p.read_text(encoding='utf-8')
    def link(match):
        label,target=match.groups()
        repository=re.search(r'MetaCognitionNotebook/(.*)',target,re.I)
        if repository:
            rel=repository.group(1)
            if Path(rel).exists():return f'[{label}](../{rel})'
        return f'{label} (historical machine-local evidence; not bundled)'
    s=re.sub(r'\[([^\]\n]+)\]\(((?:file:///|/[CD]:/)[^)]+)\)',link,s,flags=re.I)
    p.write_text(s,encoding='utf-8')
# These were literal examples inside inline code, not navigable links.
p=Path('docs/echo-e3-persistent-references-audit.md');s=p.read_text(encoding='utf-8').replace('[He](echo://uuid)','He → echo://uuid');p.write_text(s,encoding='utf-8')
