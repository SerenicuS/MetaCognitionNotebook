from pathlib import Path
import csv,json

root=Path('scratch/rc-acceptance/windows-final')
build=json.loads((root/'build-result.json').read_text(encoding='utf-8-sig'))
artifacts=json.loads((root/'artifacts.json').read_text(encoding='utf-8-sig'))
assert build['exit_code']==0
groups={
'General':[
('G01','Launch','Install the fresh installer in the isolated guest; launch it. Record the displayed version and first-run notebook path; no startup error.'),
('G02','Close and relaunch','Close normally, relaunch and verify the same disposable notebook is selected.'),
('G03','Restart','Use the application restart path and verify content and active notebook persist.'),
('G04','Studio navigation','Navigate Poetry, Philosophy, Lorebook and Manuscript; edit a draft, navigate immediately and confirm its saved text on return.'),
('G05','House isolation','Switch Cedar/Harbor Houses and verify documents, references and creation targets stay in the selected House.'),
('G06','Universe isolation','Switch Aster/Boreal Universes, including duplicate entity names, and verify references, history and creation target UUIDs remain scoped.'),
('G07','Help/manual','Navigate all manual chapters, search for cipher recovery, follow related links and verify keyboard close/focus return.'),
('G08','Save failure feedback','Run F01; verify failure is visible and navigation/close does not silently discard the draft or show Saved.')],
'Echo E3':[
('E01','Repeated pronoun bindings','Bind the first He to Kael and the second He to Theron in the same chapter. Inspect persisted distinct target UUIDs and unmodified prose.'),
('E02','Edit before bindings','Insert text and an emoji before the spans; verify exact UTF-16 offsets shift to the same words and targets.'),
('E03','Edit inside bindings','Modify/delete inside one span; verify safe detachment and that the other identical word remains correctly bound.'),
('E04','Undo/redo','Undo/redo span edits, binding creation/removal and target change. Record exactly which text and metadata operations restore correctly.'),
('E05','Immediate navigation','Type, then immediately switch chapter/studio. Reopen and compare the latest text and reference metadata, not an earlier acknowledged revision.'),
('E06','Restart persistence','Save, close/relaunch and restart. Compare reference UUIDs, offsets, anchors and detached status.'),
('E07','Historical dossiers','Inspect the same canonical target from chapters at M1/M2/M3 and compare the expected attribute and relationship state.'),
('E08','Nested references','Follow three nested targets, then Back/Forward and breadcrumbs; verify original chapter milestone, House/Universe context and return-to-editor focus.')],
'Living Entity States':[
('L01','Baseline attributes','Create Kael/Theron and baseline role/rank values. Record canonical UUIDs and baseline metadata.'),
('L02','Historical property overrides','Set role overrides at M2/M3; inspect each chapter and verify baseline prose/attributes are not replaced by historical projections.'),
('L03','Relationship severance','Create an active relationship at M1 and sever at M2. Verify both perspectives and later inheritance.'),
('L04','Restore inherited severance','Restore the relationship downstream at M3. Verify M2 stays severed while M3 reflects restoration.'),
('L05','Sibling branch isolation','Create a sibling branch from before the downstream restoration; verify its inherited severance is unaffected by the other branch.'),
('L06','Chapter-specific state','Assign chapters to M1/M2/M3 and branch contexts; compare dossiers and nested relationship inspection against each expected state.')],
'Poetry Studio':[
('P01','Three independent mappings','Create the three-stanza fixture below and map love to ember/silence/home respectively. Capture IDs and previews.'),
('P02','Save and reopen','Save the ciphered poem/key, navigate away and reopen. Verify all independent mappings, stanza IDs, manifests and recovery fields.'),
('P03','Restart persistence','Close/relaunch and use restart; compare the same poem/key metadata and exact decoded text.'),
('P04','Cancel scope conflict','Request Per Stanza to Whole Poem; cancel the conflict dialog. Compare complete metadata and previews with the before snapshot.'),
('P05','Resolve scope conflict','Repeat and explicitly choose one global replacement. Verify the Whole Poem preview and that the original per-stanza backup is retained.'),
('P06','Saved scope restoration','Save in Whole Poem, close/reopen/restart, return to Per Stanza and verify original ember/silence/home mappings, empty rules and original IDs.'),
('P07','Reorder','Use up/down controls in both scopes, including duplicate refrains; save/reopen and verify local rules follow the moved identities.'),
('P08','Insert','Insert an empty stanza between mapped verses, type into it, save/reopen and verify neighboring mappings and empty-slot identities do not drift.'),
('P09','Delete','Delete a mapped stanza; verify its rules remain recoverable and remaining stanzas keep their identities.'),
('P10','Split stanza text','Insert a blank line inside stanza text; save/reopen. Verify uncertain mappings detach into recovery rather than being guessed onto a new segment.'),
('P11','Merge stanza text','Remove a stanza separator in editable text and verify conflicting/uncertain rules remain recoverable. Record if this text operation is not available in the native UI; do not imply a dedicated merge button.'),
('P12','Ambiguous mappings','Externally reorder/edit a copied disposable poem or repeat refrains; reopen and verify no positional reassignment of uncertain rules.'),
('P13','Recovery reassignment','Reassign detached rules, including a conflicting alternative. Verify non-conflicting rules move and conflicting alternatives remain recoverable after save/reopen.'),
('P14','Supported undo/redo inventory','Test textarea text undo/redo, scope changes, reordering, insert/delete and recovery reassignment separately. Record supported, unsupported and failing operations; do not infer metadata undo from text undo.')],
'Package compatibility':[
('K01','.mcpoem','Export and import in a fresh disposable notebook. Compare form/tags, text, stanza IDs, mappings, both scope backups and unresolved records.'),
('K02','Legacy .mckey','Import a known version-1 whole-poem key through the UI, export/reimport, and verify algorithm 1.0 and recovery of its paired text.'),
('K03','Version-2 .mckey','Export/reimport the three-stanza key. Compare algorithm 2.0, active entries, manifests and the supported recovery extension.'),
('K04','.mccipher','Export the intended preview, then Import Package and Import & Decode separately into fresh disposable notebooks. Compare encoded and decoded results.'),
('K05','Algorithm and recovery labels','Compare package envelope version, key version, algorithm 1.0/2.0 and recovery_version independently. Unsupported recovery versions must fail explicitly.'),
('K06','Exact decoding','Compare decoded UTF-8 text against the original, including case, indentation and empty stanza slots; verify fingerprints and any ambiguity warning are truthful.')],
'Portable Universe':[
('U01','Preserve Identities','Export supported Lorebook/Universe data and import into a clean disposable destination with Preserve Identities. Compare entity/relationship IDs and archives/assets.'),
('U02','Separate Copy','Import the same archive with Separate Copy into another clean destination; verify new Universe/entity IDs and consistent internal references.'),
('U03','E3 target remapping','Inspect repeated-pronoun bindings in the imported chapters; targets must be the imported canonical entities, with spans/anchors preserved.'),
('U04','Historical relationship remapping','Verify severance/restoration records point to the remapped relationship and entities, and the imported chapter historical dossiers resolve correctly.'),
('U05','Poetry exclusion','Keep a Poetry document with the exported Universe ID in the source fixture. Inspect the native export inventory and archive: Poetry must be excluded according to the documented scope, never claimed included.')],
'Vault':[
('V01','Create backup','Create and verify a .mcbackup of the entire disposable fixture. Record path/hash, catalog and document counts.'),
('V02','Restore separately','Restore under a separate disposable guest folder; compare canonical Markdown and key bytes before opening restored documents.'),
('V03','Activate and restart','Activate the restored notebook and restart. Verify active-path feedback and retained original generation/backup.'),
('V04','Historical dossiers after restore','Inspect the populated M1/M2/M3 and sibling-branch dossiers after activation and verify relationship restoration/severance.'),
('V05','Poetry metadata after restore','Verify all stanza IDs, independent rules, both backups, unresolved records, algorithm labels and exact decoding.'),
('V06','Canonical-file comparison','Compare pre-open restored Markdown/key SHA-256 with the source baseline. Compare registry state logically; the rebuilt index need not be byte-identical.'),
('V07','Original notebook intact','Compare the inactive original notebook against its captured post-flush baseline after activation/restart and rollback; preserve it for inspection.')],
'Failure and recovery':[
('F01','Write failure','In the isolated guest only, hold an exclusive lock on one disposable canonical file. Edit/save/navigate, record failure and retained draft; release the lock, retry, restart and compare final content.'),
('F02','Interrupted import','Import a large synthetic package and terminate only the guest test application after observable staging. Record the actual journal/phase; restart and verify consistent rollback or completion.'),
('F03','Interrupted restore','Restore a disposable backup and terminate only the guest test application after observable .partial staging. Verify active original remains selected and partial recovery remains discoverable.'),
('F04','Restart recovery','Restart after F02/F03, inspect diagnostics and retained journals, retry and compare all canonical identities/metadata.'),
('F05','No false success','During each denied/interrupted operation, verify the UI does not report Saved/imported/restored success before durable completion.'),
('F06','No silent corruption','Compare canonical bytes, parse metadata and reindex the disposable copy after retries. If no reliable interruption point was captured, mark that phase NOT TESTED rather than PASS.')]
}
rows=[]
for group,cases in groups.items():
    for identity,scenario,procedure in cases:
        rows.append(dict(id=identity,area=group,scenario=scenario,status='BLOCKED',observed='Not executed: ENV-01; no isolated desktop available.',manual_procedure_and_expected_evidence=procedure,screenshots='NOT TESTED',canonical_comparison='NOT TESTED'))
with (root/'scenario-results.csv').open('w',encoding='utf-8-sig',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
(root/'scenario-results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
table='\n'.join(f"| {r['id']} | {r['area']} — {r['scenario']} | BLOCKED | Not executed; ENV-01 | {r['manual_procedure_and_expected_evidence']} |" for r in rows)
installer=artifacts['installer'];exe=artifacts['executable']
section=f'''## 8. Final Windows desktop acceptance attempt — RC-06

Attempt date: **2026-10-31 (Asia/Shanghai)**. **RC-06 remains BLOCKED; native acceptance has not passed.** The user explicitly confirmed: **“No isolated environment is available.”** The fresh installer was built, but neither installed nor launched. No real notebook, user profile, activation selection or Documents/AppData path was renamed, redirected or modified. No native fault injection was performed.

### 8.1 Safe-environment gate

**ENV-01 — BLOCKED:** no verified, accessible disposable Windows desktop. Read-only inventory found Windows 11 Pro, version 10.0.26200, build 26200, in the developer's current interactive profile. Hyper-V services and the `Get-VM` command are present, but `Get-VM` returned **“You do not have the required permission to complete this task”** even outside the command sandbox. This does **not** establish that no VMs exist; their inventory/access was unavailable. The legacy Windows Sandbox executable was not found; an Appx probe was denied inside the command sandbox, so complete Sandbox package availability was not established. No configured VM was identified in the repository or available VM-provider command inventory. Service profiles and managed Codex sandbox accounts were not treated as disposable interactive test desktops.

The user's confirmation is decisive for this attempt: **do not install or launch against the host profile.** GUI automation availability alone does not supply an isolated notebook environment. No application screenshot or native canonical-file comparison exists for this attempt because the application was not opened. [Read-only inventory](../scratch/rc-acceptance/windows-final/environment-inventory.json), [isolation decision and assistance needed](../scratch/rc-acceptance/windows-final/isolation-result.json).

### 8.2 Fresh remediated NSIS build evidence

**Build: PASS (artifact generation only).** Command: `npm run tauri -- build --bundles nsis`; exit **{build['exit_code']}**. Application version remains **{build['version']}**. Build started **{build['started_at']}** and completed **{build['completed_at']}**; offsets are explicit and match Asia/Shanghai. This command compiled the remediated Tauri release application and ran makensis. It did not install or execute either artifact. It is not a native UI acceptance result.

| Artifact | Fresh output |
| --- | --- |
| Installer | `{installer['path']}` |
| Installer bytes | {installer['bytes']:,} |
| Installer SHA-256 | `{installer['sha256']}` |
| Executable | `{exe['path']}` |
| Executable bytes | {exe['bytes']:,} |
| Executable SHA-256 | `{exe['sha256']}` |
| Installer last-write time (UTC) | {installer['last_write_time_utc']} |
| Executable last-write time (UTC) | {exe['last_write_time_utc']} |

The build used the current dirty working tree at base commit `6a9d4c24464d81aefdb3f764bf658a056ea7312b`; the commit alone does not identify its uncommitted remediation. Both artifacts were regenerated after this build began. The earlier audit installer was not used for acceptance. No application source or version declarations were changed during this Windows-acceptance attempt. The frontend chunk-size advisory remains non-fatal.

[Fresh native build log](../scratch/rc-acceptance/windows-final/nsis-build.log), [exit code and timestamps](../scratch/rc-acceptance/windows-final/build-result.json), [artifact hashes/properties](../scratch/rc-acceptance/windows-final/artifacts.json).

### 8.3 Manual setup and evidence protocol

User assistance is required to provide an accessible **disposable Windows VM or fresh logged-in test profile**. A Hyper-V permission change alone is insufficient unless a disposable desktop and notebook locations are identified. Do not provide passwords in this chat. Do not repurpose the developer's Documents notebook or service/managed sandbox accounts, and do not enable virtualization/security settings as part of this attempt. Once an isolated desktop is available, continue this matrix using the fresh installer/hash above.

Before launching in that environment, record guest/account identity, OS/WebView2, isolated Documents/AppData locations and a VM snapshot or disposable-profile baseline. Transfer the installer and synthetic fixtures only. Verify its SHA-256 in the guest. Keep an evidence folder outside the test notebook with UTC/local timestamps, scenario IDs, screenshots, reproduction steps and relative-path SHA-256 manifests. Confirm every write/failure target belongs to that disposable environment before acting.

Prepare two Houses **Cedar** and **Harbor**, and Universes **Aster** and **Boreal**. In Aster create canonical entities **Kael** and **Theron**, one baseline relationship, milestones **M1/M2/M3**, a sibling branch, and chapters assigned to each relevant context. Use baseline role Knight, override Exile at M2 and King at M3; sever a relationship at M2 and restore it downstream at M3, keeping the sibling branch isolated. Write repeated pronouns such as `He watched him. He waited.` plus an emoji before a bound span; record the actual UUIDs rather than hardcoding invented IDs.

Poetry fixture: `love at dawn`, `love at noon`, `love at dusk`, separated by stanza breaks. Assign `love → ember`, `love → silence`, `love → home`. Retain the original UTF-8 text, a duplicate-refrain variant, an indented variant and a poem with an inserted empty stanza slot. Use synthetic legacy v1 and v2 keys only. Record unsupported native controls honestly: there is no claim of explicit split/merge buttons, drag-and-drop or structural metadata undo merely because engine helpers exist.

For every test, replace BLOCKED with PASS/FAIL/NOT TESTED only after actual observation. A PASS needs the stated evidence; a FAIL needs exact steps, expected/actual behavior, artifact hash, screenshot and affected disposable paths. NOT TESTED means an operation was not exercised despite an available environment or a reliable interruption point could not be captured. Do not derive PASS from source inspection, the earlier automated tests, a Vite build or installer generation.

### 8.4 Scenario-by-scenario results and manual checklist

**{len(rows)} native scenarios: 0 PASS, 0 FAIL, {len(rows)} BLOCKED.** Every row's observed result is that the application operation was **not executed**, because ENV-01 failed. Screenshots and canonical-file comparisons are **NOT TESTED** for every native row. The last column is a future procedure/expected observation, not evidence that it occurred. Machine-readable [CSV](../scratch/rc-acceptance/windows-final/scenario-results.csv) and [JSON](../scratch/rc-acceptance/windows-final/scenario-results.json) record status, observation and required procedure for each scenario.

| ID | Native scenario | Result | Actual observation | Manual procedure and required evidence |
| --- | --- | --- | --- | --- |
{table}

Failure testing is restricted to the disposable guest. Before each fault case, save a known baseline and verified Vault backup. Prefer a reversible exclusive lock on one test canonical file to simulate write denial; release it before retry. Do not alter host permissions or protect/lock the developer's files. For interrupted import/restore, terminate only the guest test application after observable staging, retain `.partial` files/journals and record the stage actually reached. If timing prevents a reliable interruption, record NOT TESTED and retry with larger synthetic data. Never infer power-loss durability from an unobserved phase.

For Vault comparisons, capture source hashes after pending writes have flushed and compare restored canonical Markdown/key bytes **before opening restored documents**, since normal open/history operations may update metadata. Compare registry/identity state logically and permit a regenerated SQLite index. Capture the original inactive notebook baseline and verify it remains intact after activation/restart/rollback. No such comparison was performed in this blocked attempt.

### 8.5 Defects, limitations and next action

No new native application defect was demonstrated: the application was not run. That is **not** evidence that it is defect-free. **ENV-01 and RC-06 remain release-blocking.** Fresh build success closes the artifact-generation substep only. The earlier strict-Clippy debt and transient concurrent Echo-test observation remain documented in section 6; neither was relabelled as native acceptance.

The requested user assistance was sought before launch, and the user confirmed no isolated environment exists. Next action: provision/identify a disposable Windows desktop with access to the fresh installer, confirm its notebook locations and then execute this matrix. Native release acceptance cannot proceed until that environment exists. No commit, push, tag, version bump, release publication, feature work or v0.9.0 activity was performed.

## 9. Final release recommendation after this Windows attempt

**NO-GO for final v0.8.0 stable.** RC-01–RC-05 retain their earlier automated remediation evidence, and Portable Universe retains its explicitly documented Lorebook scope. A fresh remediated NSIS artifact now exists, but **RC-06 is BLOCKED**: installation, actual Tauri UI behavior, durable restart, native portability/recovery and disposable fault-injection acceptance have not been verified. Do not publish stable based on artifact generation or passing automated suites alone.
'''
p=Path('docs/v0.8.0-release-candidate-acceptance.md');s=p.read_text(encoding='utf-8')
s=s.replace('## 8. Remaining native Windows acceptance (RC-06)', '## 8. Remaining native Windows acceptance (RC-06)',1)
s=s[:s.index('## 8.')]+section
s=s.replace('# v0.8.0 release-candidate acceptance — remediation results','# v0.8.0 release-candidate acceptance — remediation and Windows results',1)
s=s.replace('**Revised verdict: NO-GO for the final v0.8.0 release until isolated native Windows acceptance passes. RC-01 through RC-05 are remediated and automated regression verification passes.**','**Final Windows attempt: NO-GO. A fresh remediated NSIS build succeeds, but RC-06 is BLOCKED because no isolated Windows environment is available; the application was not installed or launched. RC-01 through RC-05 retain their automated remediation evidence.**',1)
p.write_text(s,encoding='utf-8')
print(f'Recorded {len(rows)} blocked native scenarios.')
