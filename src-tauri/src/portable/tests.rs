use super::*;
use crate::{db::Database, models::DocumentMetadata, storage::StorageManager};
use serde_json::json;
use std::{io::Read, path::PathBuf, sync::Mutex};

fn write_doc(state: &AppState, path: &str, id: &str, metadata: Value, body: &str) {
    let fm = json!({"id":id,"title":format!("世界 — {id}"),"type":"lorebook","house_id":"house-default",
        "created_at":"2026-10-28T00:00:00Z","updated_at":if id == "ch-2" {"2026-10-28T02:00:00Z"} else {"2026-10-28T01:00:00Z"},
        "tags":["世界"],"metadata":metadata,"future_top":{"keep":"exactly"}});
    let raw = format!(
        "---json\n{}\n---\n{body}",
        serde_json::to_string_pretty(&fm).unwrap()
    );
    fs::write(state.storage.get_root().join(path), raw).unwrap();
    let doc = state.storage.read_document(path).unwrap();
    state
        .db
        .lock()
        .unwrap()
        .upsert_document(&doc.metadata)
        .unwrap();
}
fn node(id: &str, branch: Option<&str>, changes: Value) -> Value {
    json!({"id":id,"universe_id":"u","book_id":null,"branch_id":branch,"position":0,
        "title":id,"description":"historical note","era":"第一纪元","status":"written","questions":"private planning",
        "entity_ids":["char"],"changes":changes,"relationship_changes":[],"linked_event_id":null,
        "origin_node_id":null,"archived":false,"created_at":"2026-10-28T00:00:00Z","updated_at":"2026-10-28T00:00:00Z"})
}
fn change(id: &str, value: Value, previous: Value) -> Value {
    json!([{"id":id,"entity_id":"char","property_key":"status","previous_value":previous,"new_value":value,"note":"作者注释"}])
}
pub(crate) fn fixture() -> (tempfile::TempDir, AppState, ExportRequest, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("Notebook");
    let storage = StorageManager::new(&root);
    storage.initialize().unwrap();
    let state = AppState {
        storage,
        db: Mutex::new(Database::open(dir.path().join("index.db")).unwrap()),
        db_path: dir.path().join("index.db"),
    };
    write_doc(
        &state,
        "Lorebooks/Character.md",
        "char",
        json!({"universe_id":"u","entry_type":"character","canon_status":"canon",
        "character_fields":{"aliases":["月影","Moon"],"vital_status":"Deceased","new_profile_field":"preserve"},
        "attributes":[{"id":"attr","key":"title","value":"皇帝"}],"future_extension":{"entity_id":"archived-char"}}),
        "# 月影\n\n![地图](../Attachments/地图.png)\n",
    );
    fs::write(root.join("Attachments/地图.png"), b"attachment bytes").unwrap();
    write_doc(
        &state,
        "Lorebooks/Faction.md",
        "faction",
        json!({"universe_id":"u","entry_type":"faction","faction_fields":{
        "branches":[{"id":"org","name":"Council","parent_branch_id":null}],
        "positions":[{"id":"seat","title":"Sovereign","branch_id":"org","holder_ids":["char"],"sort_order":1}]}}),
        "Faction prose\n",
    );
    write_doc(
        &state,
        "Lorebooks/Archived.md",
        "archived-char",
        json!({"universe_id":"u","entry_type":"character"}),
        "Archived prose\n",
    );
    state.storage.safe_delete("Lorebooks/Archived.md").unwrap();
    state
        .db
        .lock()
        .unwrap()
        .delete_document("archived-char")
        .unwrap();
    for id in ["ch-1", "ch-2"] {
        write_doc(
            &state,
            &format!("Lorebooks/{id}.md"),
            id,
            json!({"universe_id":"u","book_id":"book","entry_type":"chapter","chapter_order":1,"milestone_id":"m-1"}),
            "Chapter secret prose\n",
        );
    }
    write_doc(
        &state,
        "Lorebooks/Foreign.md",
        "foreign",
        json!({"universe_id":"v","entry_type":"location"}),
        "DO NOT EXPORT FOREIGN WORLD\n",
    );
    let mut book_node = node("book-m", None, json!([]));
    book_node["book_id"] = json!("book");
    book_node["entity_ids"] = json!([]);
    let plan: Plan = serde_json::from_value(json!({"version":1,"revision":7,
        "universes":[{"id":"u","name":"月世界","description":"Universe introduction"},{"id":"v","name":"Other secret universe"}],
        "books":[{"id":"book","universe_id":"u","name":"Book I","continuity":"canonical","archived":true}],
        "branches":[
            {"id":"br-1","universe_id":"u","name":"Alive ending","divergence_node_id":"m-1","created_at":"2026-10-28T00:00:00Z","updated_at":"2026-10-28T00:00:00Z"},
            {"id":"br-2","universe_id":"u","name":"Nested ending","divergence_node_id":"m-3","parent_continuity_id":"br-1","created_at":"2026-10-28T00:00:00Z","updated_at":"2026-10-28T00:00:00Z"}],
        "entities":[{"id":"char","universe_id":"u"},{"id":"faction","universe_id":"u"},{"id":"archived-char","universe_id":"u"},{"id":"ch-1","universe_id":"u"},{"id":"ch-2","universe_id":"u"},{"id":"foreign","universe_id":"v"}],
        "nodes":[node("m-1",None,change("c-1",json!("alive"),Value::Null)),node("m-2",None,change("c-2",json!("deceased"),json!("alive"))),
            node("m-3",Some("br-1"),change("c-3",json!("alive"),json!("alive"))),node("m-4",Some("br-2"),change("c-4",Value::Null,json!("alive"))),book_node],
        "relationships":[{"id":"rel","universe_id":"u","book_id":null,"source_id":"char","target_id":"faction","label":"Member of","description":"bond","directed":true,"context_node_id":"m-1","archived":false}]
    })).unwrap();
    write_doc(
        &state,
        "Lorebooks/Web_of_Thought_catalog.md",
        "catalog",
        json!({"_web_of_thought":plan}),
        "Shared planning body\n",
    );
    let request = ExportRequest {
        universe_id: "u".into(),
        snapshot_basis: SnapshotBasis::LastSavedState,
        book_ids: vec!["book".into()],
        chapter_ids: vec!["ch-1".into(), "ch-2".into()],
    };
    let path = dir.path().join("世界.mcuniverse");
    (dir, state, request, path)
}
fn inventory(root: &Path) -> BTreeMap<String, String> {
    collect::fingerprints(root).unwrap()
}
fn entries(path: &Path) -> Vec<(String, Vec<u8>)> {
    let mut archive = ZipArchive::new(File::open(path).unwrap()).unwrap();
    (0..archive.len())
        .map(|i| {
            let mut e = archive.by_index(i).unwrap();
            let mut bytes = vec![];
            e.read_to_end(&mut bytes).unwrap();
            (e.name().into(), bytes)
        })
        .collect()
}
fn write_entries(path: &Path, entries: &[(String, Vec<u8>)]) {
    let mut writer = ZipWriter::new(File::create(path).unwrap());
    for (name, bytes) in entries {
        writer
            .start_file(
                name,
                SimpleFileOptions::default()
                    .compression_method(CompressionMethod::Stored)
                    .unix_permissions(0o600),
            )
            .unwrap();
        writer.write_all(bytes).unwrap();
    }
    writer.finish().unwrap().sync_all().unwrap();
}
pub(crate) fn rewrite(path: &Path, action: impl FnOnce(&mut Manifest, &mut BTreeMap<String, Vec<u8>>)) {
    let mut payload: BTreeMap<_, _> = entries(path).into_iter().collect();
    let mut m: Manifest = serde_json::from_slice(&payload.remove(MANIFEST).unwrap()).unwrap();
    action(&mut m, &mut payload);
    m.files = payload
        .iter()
        .map(|(path, b)| FileEntry {
            path: path.clone(),
            size: b.len() as u64,
            sha256: vault::bytes_hash(b),
        })
        .collect();
    payload.insert(MANIFEST.into(), serde_json::to_vec_pretty(&m).unwrap());
    write_entries(path, &payload.into_iter().collect::<Vec<_>>());
}
fn edit_source_plan(state: &AppState, action: impl FnOnce(&mut Value)) {
    let path = state
        .storage
        .get_root()
        .join("Lorebooks/Web_of_Thought_catalog.md");
    let raw = fs::read_to_string(&path).unwrap();
    let (head, body) = raw
        .strip_prefix("---json\n")
        .unwrap()
        .split_once("\n---\n")
        .unwrap();
    let mut fm: Value = serde_json::from_str(head).unwrap();
    action(&mut fm["metadata"][crate::thought::KEY]);
    fs::write(
        path,
        format!(
            "---json\n{}\n---\n{body}",
            serde_json::to_string(&fm).unwrap()
        ),
    )
    .unwrap();
}

#[test]
fn full_roundtrip_preserves_unicode_archives_unknown_fields_history_assets_and_source_bytes() {
    let (_dir, state, request, path) = fixture();
    let before = inventory(state.storage.get_root());
    let indexed = state.db.lock().unwrap().list_documents(None, None).unwrap();
    let result = export(&state, request, &path).unwrap();
    assert!(result.compatible);
    assert_eq!(result.document_count, 4);
    assert_eq!(result.archived_count, 1);
    assert_eq!(result.asset_count, 1);
    let payload: BTreeMap<_, _> = entries(&path).into_iter().collect();
    let plan: Plan = serde_json::from_slice(&payload[PLANNING]).unwrap();
    assert_eq!(plan.universes.len(), 1);
    assert_eq!(plan.branches.len(), 2);
    assert!(plan.books[0].archived);
    assert_eq!(plan.nodes[3].changes[0].new_value, None);
    assert_eq!(
        plan.nodes[1].changes[0].previous_value.as_deref(),
        Some("alive")
    );
    assert!(!payload
        .values()
        .any(|b| String::from_utf8_lossy(b).contains("DO NOT EXPORT FOREIGN WORLD")));
    for d in result
        .manifest
        .documents
        .iter()
        .chain(&result.manifest.archived_documents)
    {
        assert_eq!(
            payload[&d.path],
            fs::read(state.storage.get_root().join(&d.source_relative_path)).unwrap()
        );
        assert!(d.opaque_fields.contains(&"/future_top".into()));
    }
    assert_eq!(before, inventory(state.storage.get_root()));
    assert_eq!(
        serde_json::to_value(indexed).unwrap(),
        serde_json::to_value(state.db.lock().unwrap().list_documents(None, None).unwrap()).unwrap()
    );
    assert_eq!(
        result,
        inspect_stable(&path.canonicalize().unwrap()).unwrap()
    );
}

#[test]
fn chapter_omission_is_explicit_and_books_remain_structural() {
    let (_dir, state, mut request, path) = fixture();
    edit_source_plan(&state, |p| {
        p["books"].as_array_mut().unwrap().push(json!({"id":"unused-book","universe_id":"u","name":"Unselected unused Book","continuity":"standalone","description":"BOOK NOTES MUST NOT LEAK"}))
    });
    request.chapter_ids.clear();
    request.book_ids.clear();
    let result = export(&state, request, &path).unwrap();
    assert_eq!(result.chapter_count, 0);
    assert_eq!(result.manifest.scope.omitted_chapters.len(), 2);
    assert_eq!(result.manifest.scope.structural_book_ids, ["book"]);
    assert_eq!(result.manifest.scope.omitted_book_ids, ["unused-book"]);
    assert!(!entries(&path)
        .iter()
        .any(|(_, bytes)| String::from_utf8_lossy(bytes).contains("BOOK NOTES MUST NOT LEAK")));
    assert!(!entries(&path)
        .iter()
        .any(|(_, bytes)| String::from_utf8_lossy(bytes).contains("Chapter secret prose")));
}

#[test]
fn ordering_ties_preserve_effective_milestone_and_indexed_chapter_sequence() {
    let (_dir, state, request, path) = fixture();
    let report = export(&state, request, &path).unwrap();
    assert_eq!(
        report
            .manifest
            .ordering
            .timelines
            .iter()
            .find(|o| o.branch_id.is_none())
            .unwrap()
            .milestone_ids,
        ["m-1", "m-2"]
    );
    assert_eq!(
        report.manifest.ordering.chapters[0].chapter_ids,
        ["ch-2", "ch-1"]
    );
    rewrite(&path, |m, _| m.ordering.chapters[0].chapter_ids.reverse());
    assert!(inspect(&path).unwrap_err().contains("order"));
}

#[test]
fn raw_markdown_materializes_stable_indexed_metadata_only_in_package() {
    let (_dir, state, request, path) = fixture();
    let source = state.storage.get_root().join("Lorebooks/Character.md");
    fs::write(&source, "Raw canonical prose\n").unwrap();
    let before = fs::read(&source).unwrap();
    let report = export(&state, request, &path).unwrap();
    let d = report
        .manifest
        .documents
        .iter()
        .find(|d| d.id == "char")
        .unwrap();
    assert!(d.materialized_raw);
    let p: BTreeMap<_, _> = entries(&path).into_iter().collect();
    assert!(String::from_utf8_lossy(&p[&d.path]).contains("Raw canonical prose"));
    assert_eq!(fs::read(&source).unwrap(), before);
}

#[test]
fn raw_unindexed_identity_and_ambiguous_archives_are_blocked() {
    let (_dir, state, request, path) = fixture();
    fs::write(
        state.storage.get_root().join("Lorebooks/raw.md"),
        "unknown identity",
    )
    .unwrap();
    assert!(export(&state, request.clone(), &path)
        .unwrap_err()
        .contains("stable indexed identity"));
    fs::remove_file(state.storage.get_root().join("Lorebooks/raw.md")).unwrap();
    let archive = fs::read_dir(state.storage.get_root().join("Backups"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    fs::copy(
        &archive,
        state.storage.get_root().join("Backups/duplicate.md"),
    )
    .unwrap();
    assert!(export(&state, request, &path)
        .unwrap_err()
        .contains("Ambiguous"));
    assert!(!path.exists());
}

#[test]
fn required_missing_entities_holders_and_omitted_chapters_block_complete_export() {
    for case in ["missing-entity", "missing-holder", "required-chapter"] {
        let (_dir, state, mut request, path) = fixture();
        if case == "missing-entity" {
            fs::remove_file(state.storage.get_root().join("Lorebooks/Character.md")).unwrap();
        }
        if case == "missing-holder" {
            let p = state.storage.get_root().join("Lorebooks/Faction.md");
            fs::write(
                &p,
                fs::read_to_string(&p)
                    .unwrap()
                    .replace("\"char\"", "\"missing-holder\""),
            )
            .unwrap();
        }
        if case == "required-chapter" {
            request.chapter_ids.clear();
            edit_source_plan(&state, |p| p["nodes"][0]["entity_ids"] = json!(["ch-1"]));
        }
        assert!(export(&state, request, &path).is_err(), "{case}");
        assert!(!path.exists());
    }
}

#[test]
fn foreign_house_and_ambiguous_legacy_attribution_are_blocked() {
    let (_dir, state, request, path) = fixture();
    let p = state.storage.get_root().join("Lorebooks/Character.md");
    let original = fs::read_to_string(&p).unwrap();
    fs::write(&p, original.replace("house-default", "house-other")).unwrap();
    assert!(export(&state, request.clone(), &path)
        .unwrap_err()
        .contains("Foreign-House"));
    fs::write(
        &p,
        original.replace("\"universe_id\": \"u\"", "\"universe\": \"月世界\" "),
    )
    .unwrap();
    edit_source_plan(&state, |p| p["universes"][1]["name"] = json!("月世界"));
    assert!(export(&state, request, &path)
        .unwrap_err()
        .contains("ambiguous"));
}

#[test]
fn source_change_after_capture_or_validation_never_publishes_success() {
    for stage in ["captured", "validated"] {
        let (dir, state, request, path) = fixture();
        let error = export_with_checkpoint(&state, request, &path, |at| {
            if at == stage {
                fs::write(
                    state.storage.get_root().join("Lorebooks/new.md"),
                    "external addition",
                )
                .unwrap();
            }
            Ok(())
        })
        .unwrap_err();
        assert!(error.contains("changed"));
        assert!(!path.exists());
        assert!(!fs::read_dir(dir.path()).unwrap().any(|e| e
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".partial")));
    }
}

#[test]
fn source_body_changes_and_destination_races_do_not_overwrite() {
    let (_dir, state, request, path) = fixture();
    let e = export_with_checkpoint(&state, request.clone(), &path, |stage| {
        if stage == "validated" {
            fs::write(
                state.storage.get_root().join("Lorebooks/Character.md"),
                "changed",
            )
            .unwrap();
        }
        Ok(())
    })
    .unwrap_err();
    assert!(e.contains("changed"));
    assert!(!path.exists());
    let (_dir2, state2, request2, path2) = fixture();
    assert!(export_with_checkpoint(&state2, request2, &path2, |stage| {
        if stage == "validated" {
            fs::write(&path2, "existing writing").unwrap();
        }
        Ok(())
    })
    .is_err());
    assert_eq!(fs::read_to_string(path2).unwrap(), "existing writing");
}

#[test]
fn export_refuses_notebook_destinations_existing_files_and_missing_selection() {
    let (_dir, state, mut request, path) = fixture();
    assert!(export(
        &state,
        request.clone(),
        &state.storage.get_root().join("bad.mcuniverse")
    )
    .is_err());
    fs::write(&path, "existing").unwrap();
    assert!(export(&state, request.clone(), &path).is_err());
    assert_eq!(fs::read_to_string(&path).unwrap(), "existing");
    fs::remove_file(&path).unwrap();
    request.book_ids.clear();
    assert!(export(&state, request, &path).is_err());
    assert!(serde_json::from_value::<ExportRequest>(
        json!({"universe_id":"u","book_ids":[],"chapter_ids":[]})
    )
    .is_err());
}

#[test]
fn inspector_rejects_hash_tampering_and_undeclared_or_missing_payloads() {
    for case in ["tamper", "extra", "missing"] {
        let (_dir, state, request, path) = fixture();
        export(&state, request, &path).unwrap();
        let mut p = entries(&path);
        match case {
            "tamper" => p
                .iter_mut()
                .find(|(n, _)| n == PLANNING)
                .unwrap()
                .1
                .push(b' '),
            "extra" => p.push(("assets/undeclared".into(), b"hidden".to_vec())),
            _ => {
                let i = p.iter().position(|(n, _)| n == PLANNING).unwrap();
                p.remove(i);
            }
        }
        write_entries(&path, &p);
        assert!(inspect(&path).is_err(), "{case}");
    }
}

#[test]
fn correct_hashes_cannot_hide_invalid_planning_references_or_schema() {
    for case in [
        "divergence",
        "origin",
        "context",
        "relationship-change",
        "parent",
        "duplicate-id",
        "unknown-field",
    ] {
        let (_dir, state, request, path) = fixture();
        export(&state, request, &path).unwrap();
        rewrite(&path, |_, p| {
            let mut plan: Value = serde_json::from_slice(&p[PLANNING]).unwrap();
            match case {
                "divergence" => plan["branches"][0]["divergence_node_id"] = json!("missing"),
                "origin" => plan["nodes"][0]["origin_node_id"] = json!("missing"),
                "context" => plan["relationships"][0]["context_node_id"] = json!("missing"),
                "relationship-change" => {
                    plan["nodes"][0]["relationship_changes"] =
                        json!([{"relationship_id":"missing","label":null,"note":""}])
                }
                "parent" => plan["branches"][1]["parent_continuity_id"] = Value::Null,
                "duplicate-id" => plan["books"][0]["id"] = json!("u"),
                _ => plan["future_schema"] = json!(true),
            }
            p.insert(PLANNING.into(), serde_json::to_vec(&plan).unwrap());
        });
        assert!(inspect(&path).is_err(), "{case}");
    }
}

#[test]
fn inspector_rejects_duplicate_json_keys_at_every_level() {
    for case in ["manifest", "planning", "document"] {
        let (_dir, state, request, path) = fixture();
        let report = export(&state, request, &path).unwrap();
        if case == "manifest" {
            let mut p = entries(&path);
            let b = &mut p.iter_mut().find(|(n, _)| n == MANIFEST).unwrap().1;
            let original = String::from_utf8(b.clone()).unwrap();
            *b = original
                .replacen('{', "{\"format_version\":1,", 1)
                .into_bytes();
            write_entries(&path, &p);
        } else {
            rewrite(&path, |_, p| {
                let name = if case == "planning" {
                    PLANNING
                } else {
                    &report.manifest.documents[0].path
                };
                let original = String::from_utf8(p[name].clone()).unwrap();
                let bytes = if case == "planning" {
                    original.replacen('{', "{\"version\":1,", 1)
                } else {
                    original.replacen(
                        "\"metadata\": {",
                        "\"metadata\": {\"entry_type\":\"character\",",
                        1,
                    )
                };
                p.insert(name.into(), bytes.into_bytes());
            });
        }
        assert!(
            inspect(&path).unwrap_err().contains("Duplicate JSON key"),
            "{case}"
        );
    }
}

#[test]
fn inspector_rejects_unsafe_case_conflicting_and_duplicate_zip_names() {
    for name in [
        "../escape",
        "assets/CON.txt",
        "assets/a:stream",
        "assets/a\\b",
        "assets/a.",
        "assets/Σ",
    ] {
        let (_dir, state, request, path) = fixture();
        export(&state, request, &path).unwrap();
        let mut p = entries(&path);
        p.push((name.into(), vec![1]));
        if name == "assets/Σ" {
            p.push(("assets/ς".into(), vec![2]));
        }
        write_entries(&path, &p);
        assert!(inspect(&path).is_err(), "{name}");
    }
    let (_dir, state, request, path) = fixture();
    export(&state, request, &path).unwrap();
    let mut bytes = fs::read(&path).unwrap();
    let from = b"documents/000002.md";
    let to = b"documents/000001.md";
    for at in 0..=bytes.len() - from.len() {
        if &bytes[at..at + from.len()] == from {
            bytes[at..at + from.len()].copy_from_slice(to);
        }
    }
    fs::write(&path, bytes).unwrap();
    assert!(inspect(&path).is_err());
}

#[test]
fn inspector_checks_local_headers_compression_symlinks_truncation_and_limits() {
    let (_dir, state, request, path) = fixture();
    export(&state, request, &path).unwrap();
    let original = fs::read(&path).unwrap();
    let mut local = original.clone();
    local[30] ^= 1;
    fs::write(&path, local).unwrap();
    assert!(inspect(&path).is_err());
    fs::write(&path, &original[..original.len() - 8]).unwrap();
    assert!(inspect(&path).is_err());
    // Mark the first central entry as a symlink in Unix external attributes.
    let mut links = original.clone();
    let at = links.windows(4).position(|b| b == b"PK\x01\x02").unwrap();
    links[at + 38..at + 42].copy_from_slice(&(0o120777u32 << 16).to_le_bytes());
    links[at + 5] = 3;
    fs::write(&path, links).unwrap();
    assert!(inspect(&path).is_err());
    let mut compressed = original.clone();
    compressed[8..10].copy_from_slice(&8u16.to_le_bytes());
    fs::write(&path, compressed).unwrap();
    assert!(inspect(&path).is_err());
    fs::write(&path, original).unwrap();
    rewrite(&path, |m, _| m.format_version = 99);
    assert!(inspect(&path).unwrap_err().contains("Unsupported"));
}

#[test]
fn unsupported_feature_report_is_read_only_and_explicit() {
    let (_dir, state, request, path) = fixture();
    export(&state, request, &path).unwrap();
    rewrite(&path, |m, _| {
        m.compatibility.required_features.push("future-E3".into())
    });
    let before = fs::read(&path).unwrap();
    let notebook = inventory(state.storage.get_root());
    let report = inspect_stable(&path).unwrap();
    assert!(!report.compatible);
    assert_eq!(report.unsupported_features, ["future-E3"]);
    assert_eq!(fs::read(&path).unwrap(), before);
    assert_eq!(inventory(state.storage.get_root()), notebook);
}

#[test]
fn malformed_inventory_and_local_metadata_are_rejected_even_with_valid_hashes() {
    for case in [
        "holder",
        "faction-cycle",
        "chapter-binding",
        "inventory-id",
        "opaque",
        "duplicate-doc",
        "omission",
        "unknown-manifest",
    ] {
        let (_dir, state, request, path) = fixture();
        let report = export(&state, request, &path).unwrap();
        if case == "unknown-manifest" {
            let mut p = entries(&path);
            let b = &mut p.iter_mut().find(|(n, _)| n == MANIFEST).unwrap().1;
            let mut m: Value = serde_json::from_slice(b).unwrap();
            m["unknown"] = json!(1);
            *b = serde_json::to_vec(&m).unwrap();
            write_entries(&path, &p);
        } else {
            rewrite(&path, |m, p| {
                if case == "inventory-id" {
                    m.documents[0].id = "fake".into();
                    return;
                }
                if case == "opaque" {
                    m.documents[0].opaque_fields.clear();
                    return;
                }
                if case == "duplicate-doc" {
                    m.documents.push(m.documents[0].clone());
                    return;
                }
                if case == "omission" {
                    m.scope.included_chapter_ids.clear();
                    return;
                }
                let d = report
                    .manifest
                    .documents
                    .iter()
                    .find(|d| {
                        d.id == if case == "chapter-binding" {
                            "ch-1"
                        } else {
                            "faction"
                        }
                    })
                    .unwrap();
                let original = String::from_utf8(p[&d.path].clone()).unwrap();
                let (head, body) = original
                    .strip_prefix("---json\n")
                    .unwrap()
                    .split_once("\n---\n")
                    .unwrap();
                let mut fm: Value = serde_json::from_str(head).unwrap();
                if case == "holder" {
                    fm["metadata"]["faction_fields"]["positions"][0]["holder_ids"] =
                        json!(["missing"]);
                }
                if case == "faction-cycle" {
                    fm["metadata"]["faction_fields"]["branches"][0]["parent_branch_id"] =
                        json!("org");
                }
                if case == "chapter-binding" {
                    fm["metadata"]["milestone_id"] = json!("missing");
                }
                p.insert(
                    d.path.clone(),
                    format!(
                        "---json\n{}\n---\n{body}",
                        serde_json::to_string(&fm).unwrap()
                    )
                    .into_bytes(),
                );
            });
        }
        assert!(inspect(&path).is_err(), "{case}");
    }
}

#[test]
fn assets_are_closed_and_unsupported_local_syntax_is_not_silently_omitted() {
    for body in [
        "![missing](../Attachments/missing.png)",
        "[doc](other.md)",
        "<img src='secret.png'>",
        "![[hidden.png]]",
        "![x](../Attachments/a%20b.png)",
    ] {
        let (_dir, state, request, path) = fixture();
        let p = state.storage.get_root().join("Lorebooks/Character.md");
        let raw = fs::read_to_string(&p).unwrap();
        let (head, _) = raw.split_once("\n---\n").unwrap();
        fs::write(&p, format!("{head}\n---\n{body}")).unwrap();
        assert!(export(&state, request, &path).is_err(), "{body}");
        assert!(!path.exists());
    }
}

#[test]
fn strict_json_parser_rejects_nested_duplicates_without_losing_unknown_data() {
    assert!(json::parse(br#"{"x":{"a":1,"a":2}}"#).is_err());
    let v = json::parse(br#"{"unknown":[null,true,1,1.5,"ok"]}"#).unwrap();
    assert_eq!(v["unknown"][4], "ok");
}

#[test]
fn request_and_inspection_contracts_use_explicit_selection_and_versioned_fields() {
    let (_dir, state, request, path) = fixture();
    let value = serde_json::to_value(&request).unwrap();
    assert_eq!(value["snapshot_basis"], "last_saved_state");
    assert!(serde_json::from_value::<ExportRequest>(
        json!({"universe_id":"u","snapshot_basis":"after_save","book_ids":[],"chapter_ids":[]})
    )
    .is_err());
    let inspection = export(&state, request, &path).unwrap();
    assert_eq!(
        serde_json::from_value::<Inspection>(serde_json::to_value(&inspection).unwrap()).unwrap(),
        inspection
    );
}

#[test]
fn metadata_only_scan_never_replaces_index_or_canonical_ids() {
    let (_dir, state, request, path) = fixture();
    let before: Vec<DocumentMetadata> =
        state.db.lock().unwrap().list_documents(None, None).unwrap();
    export(&state, request, &path).unwrap();
    let after = state.db.lock().unwrap().list_documents(None, None).unwrap();
    assert_eq!(
        serde_json::to_value(before).unwrap(),
        serde_json::to_value(after).unwrap()
    );
}

#[test]
fn inspection_reports_all_archive_kinds_and_book_associated_nonchapter_ordering() {
    let (_dir, state, request, path) = fixture();
    write_doc(
        &state,
        "Lorebooks/BookLore.md",
        "book-lore",
        json!({"universe_id":"u","book_id":"book","entry_type":"other","chapter_order":0}),
        "Book-associated lore",
    );
    let report = export(&state, request, &path).unwrap();
    assert_eq!(report.universe.name, "月世界");
    assert_eq!(report.book_count, 1);
    assert_eq!(report.branch_count, 2);
    assert_eq!(report.milestone_count, 5);
    assert!(report
        .archived_records
        .iter()
        .any(|r| r.kind == "book" && r.id == "book"));
    assert!(report
        .archived_records
        .iter()
        .any(|r| r.kind == "document" && r.id == "archived-char"));
    assert_eq!(
        report.manifest.ordering.chapters[0].chapter_ids[0],
        "book-lore"
    );
    rewrite(&path, |m, _| m.warnings.clear());
    assert!(inspect(&path).unwrap_err().contains("warning"));
}

#[test]
fn unsupported_metadata_and_planning_assets_and_reference_media_are_explicit_failures() {
    for case in [
        "metadata",
        "planning",
        "reference-image",
        "uppercase-html",
        "remote-media",
    ] {
        let (_dir, state, request, path) = fixture();
        if case == "metadata" {
            write_doc(
                &state,
                "Lorebooks/Extra.md",
                "extra",
                json!({"universe_id":"u","entry_type":"other","custom_fields":{"portrait":"Attachments/portrait.png"}}),
                "body",
            );
        } else if case == "planning" {
            edit_source_plan(&state, |p| {
                p["nodes"][0]["description"] = json!("![map](../Attachments/地图.png)")
            });
        } else {
            let body = match case {
                "reference-image" => "![map][ref]\n[ref]: ../Attachments/地图.png",
                "uppercase-html" => "<SVG><IMAGE href='hidden.png'/></SVG>",
                _ => "![portrait](https://example.com/secret.png)",
            };
            let p = state.storage.get_root().join("Lorebooks/Character.md");
            let raw = fs::read_to_string(&p).unwrap();
            let (header, _) = raw.split_once("\n---\n").unwrap();
            fs::write(&p, format!("{header}\n---\n{body}")).unwrap();
        }
        assert!(export(&state, request, &path).is_err(), "{case}");
        assert!(!path.exists());
    }
}

#[test]
fn envelope_and_manifest_payload_limits_are_checked_before_unbounded_allocation() {
    let (_dir, state, request, path) = fixture();
    export(&state, request, &path).unwrap();
    rewrite(&path, |m, _| m.files[0].size = MAX_TOTAL_BYTES + 1);
    // rewrite recomputes file sizes, so forge the final manifest directly.
    let mut p = entries(&path);
    let bytes = &mut p.iter_mut().find(|(n, _)| n == MANIFEST).unwrap().1;
    let mut m: Value = serde_json::from_slice(bytes).unwrap();
    m["files"][0]["size"] = json!(MAX_TOTAL_BYTES + 1);
    *bytes = serde_json::to_vec(&m).unwrap();
    write_entries(&path, &p);
    assert!(inspect(&path).unwrap_err().contains("128 MiB"));
    File::create(&path)
        .unwrap()
        .set_len(MAX_TOTAL_BYTES + MAX_MANIFEST_BYTES + 16 * 1024 * 1024 + 1)
        .unwrap();
    assert!(inspect(&path).unwrap_err().contains("size limit"));
}

#[test]
fn empty_universe_exports_only_its_planning_subset_without_initializing_or_mutating() {
    let (_dir, state, mut request, path) = fixture();
    for entry in fs::read_dir(state.storage.get_root().join("Lorebooks")).unwrap() {
        let entry = entry.unwrap();
        if entry.file_name() != "Web_of_Thought_catalog.md" {
            fs::remove_file(entry.path()).unwrap();
        }
    }
    for entry in fs::read_dir(state.storage.get_root().join("Backups")).unwrap() {
        fs::remove_file(entry.unwrap().path()).unwrap();
    }
    state.db.lock().unwrap().clear_all_documents().unwrap();
    edit_source_plan(&state, |p| {
        for key in ["books", "branches", "entities", "nodes", "relationships"] {
            p[key] = json!([]);
        }
    });
    request.book_ids.clear();
    request.chapter_ids.clear();
    let before = inventory(state.storage.get_root());
    let report = export(&state, request, &path).unwrap();
    assert_eq!(report.document_count, 0);
    assert_eq!(report.archived_count, 0);
    assert_eq!(report.manifest.files.len(), 1);
    assert_eq!(inventory(state.storage.get_root()), before);
}

#[test]
fn mixed_rfc3339_chapter_timestamp_order_matches_shared_frontend_fixture() {
    let (_dir, state, mut request, path) = fixture();
    let shared: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/portable_chapter_order.json"
    ))
    .unwrap();
    request.chapter_ids.clear();
    for chapter in shared["chapters"].as_array().unwrap() {
        let id = chapter["id"].as_str().unwrap();
        let relative = format!("Lorebooks/{id}.md");
        write_doc(
            &state,
            &relative,
            id,
            json!({"universe_id":"u","book_id":"book","entry_type":"chapter","chapter_order":1}),
            "chapter",
        );
        let full_path = state.storage.get_root().join(&relative);
        let raw = fs::read_to_string(&full_path).unwrap();
        let (header, body) = raw
            .strip_prefix("---json\n")
            .unwrap()
            .split_once("\n---\n")
            .unwrap();
        let mut fm: Value = serde_json::from_str(header).unwrap();
        fm["created_at"] = chapter["created_at"].clone();
        fs::write(
            full_path,
            format!(
                "---json\n{}\n---\n{body}",
                serde_json::to_string(&fm).unwrap()
            ),
        )
        .unwrap();
        request.chapter_ids.push(id.into());
    }
    // Discard fixture chapters from this Book's ordering test by explicitly including their
    // declarations but comparing only the four shared-case identities below.
    let report = export(&state, request, &path).unwrap();
    let expected: Vec<_> = shared["expected_order"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().to_string())
        .collect();
    let actual: Vec<_> = report.manifest.ordering.chapters[0]
        .chapter_ids
        .iter()
        .filter(|id| expected.contains(id))
        .cloned()
        .collect();
    assert_eq!(actual, expected);
}

#[test]
fn duplicate_inventory_is_rejected_before_document_payload_allocation_or_parsing() {
    let (_dir, state, request, path) = fixture();
    export(&state, request, &path).unwrap();
    rewrite(&path, |m, p| {
        let d = m.documents[0].clone();
        p.insert(d.path.clone(), b"deliberately invalid frontmatter".to_vec());
        for _ in 0..1000 {
            m.documents.push(d.clone());
        }
    });
    assert!(inspect(&path)
        .unwrap_err()
        .contains("Duplicate or invalid document identity"));
    let wide = format!("[{}0]", "0,".repeat(500_001));
    assert!(json::parse(wide.as_bytes())
        .unwrap_err()
        .contains("complexity"));
    let prose = serde_json::to_vec(&json!({"prose":format!("quoted \"{}\"", ",".repeat(500_001))}))
        .unwrap();
    assert!(json::parse(&prose).is_ok());
}
