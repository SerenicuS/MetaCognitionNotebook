//! L2b Durable Import Publication, Idempotency, and Crash Recovery Regression Suite.
use super::*;
use crate::commands::AppState;
use crate::db::Database;
use crate::models::*;
use crate::storage::StorageManager;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

fn dest_fixture() -> (tempfile::TempDir, AppState) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("DestNotebook");
    let storage = StorageManager::new(&root);
    storage.initialize().unwrap();
    let state = AppState {
        storage,
        db: Mutex::new(Database::open(dir.path().join("dest_index.db")).unwrap()),
        db_path: dir.path().join("dest_index.db"),
    };
    (dir, state)
}

fn create_clean_source_package() -> (tempfile::TempDir, AppState, PathBuf) {
    let (dir, state, request, path) = tests::fixture();
    let doc_path = state.storage.get_root().join("Lorebooks/Character.md");
    let content = fs::read_to_string(&doc_path).unwrap();
    let cleaned = content.replace(r#""entity_id": "archived-char""#, r#""info": "non-id-value""#);
    fs::write(&doc_path, cleaned).unwrap();
    let doc = state.storage.read_document("Lorebooks/Character.md").unwrap();
    state
        .db
        .lock()
        .unwrap()
        .upsert_document(&doc.metadata)
        .unwrap();

    export(&state, request, &path).unwrap();
    (dir, state, path)
}

#[test]
fn acceptance_items_and_multiline_explanations_survive_v1_import_and_reload() {
    let (source_dir, source, _) = create_clean_source_package();
    let item_path = "Lorebooks/Field_Radio.md";
    let raw = format!("---json\n{}\n---\nAn ordinary field radio.\n", serde_json::to_string(&serde_json::json!({
        "id":"item-radio", "title":"Field radio", "type":"lorebook", "house_id":"house-default",
        "created_at":"2026-10-29T00:00:00Z", "updated_at":"2026-10-29T00:00:00Z", "tags":[],
        "metadata":{"universe_id":"u", "entry_type":"artifact", "artifact_fields":{"artifact_type":"Technology/Device"}}
    })).unwrap());
    fs::write(source.storage.get_root().join(item_path), &raw).unwrap();
    let item = source.storage.read_document(item_path).unwrap();
    source.db.lock().unwrap().upsert_document(&item.metadata).unwrap();
    let catalog_path = source.storage.get_root().join("Lorebooks/Web_of_Thought_catalog.md");
    let catalog_raw = fs::read_to_string(&catalog_path).unwrap();
    let (header, body) = catalog_raw.strip_prefix("---json\n").unwrap().split_once("\n---\n").unwrap();
    let mut fm: serde_json::Value = serde_json::from_str(header).unwrap();
    let plan = &mut fm["metadata"][crate::thought::KEY];
    plan["entities"].as_array_mut().unwrap().push(serde_json::json!({"id":"item-radio","universe_id":"u"}));
    plan["relationships"][0]["description"] = serde_json::json!("A shared childhood.\nA lasting promise.");
    plan["nodes"][0]["changes"][0]["new_value"] = serde_json::json!("missing");
    fs::write(catalog_path, format!("---json\n{}\n---\n{body}", serde_json::to_string(&fm).unwrap())).unwrap();
    let package = source_dir.path().join("items.mcuniverse");
    let exported = export(&source, ExportRequest { universe_id: "u".into(), snapshot_basis: SnapshotBasis::LastSavedState, book_ids: vec!["book".into()], chapter_ids: vec!["ch-1".into(), "ch-2".into()] }, &package).unwrap();
    assert_eq!(exported.manifest.format_version, 1);
    for policy in [ImportIdentityPolicy::Preserve, ImportIdentityPolicy::SeparateCopy] {
        let (_dir, destination) = dest_fixture();
        let preview = import_preview(&destination, ImportPreviewRequest { package_path: package.to_string_lossy().into(), target_house_id: "house-default".into(), policy, operation_id: None }).unwrap();
        assert!(preview.is_valid, "{:?}", preview.diagnostics);
        import_commit(&destination, ImportCommitRequest { operation_id: preview.operation_id.clone(), package_path: preview.package_path.clone(), target_house_id: preview.target_house_id.clone(), policy: preview.policy.clone(), expected_destination_fingerprint: preview.destination_fingerprint.clone() }).unwrap();
        let item = destination.db.lock().unwrap().list_documents(None, None).unwrap().into_iter().find(|d| d.title == "Field radio").unwrap();
        let reloaded = destination.storage.read_document(&item.relative_path).unwrap();
        let metadata: serde_json::Value = serde_json::from_str(reloaded.metadata.metadata_json.as_ref().unwrap()).unwrap();
        assert_eq!(metadata["entry_type"], "artifact");
        assert_eq!(metadata["artifact_fields"]["artifact_type"], "Technology/Device");
        assert_eq!(reloaded.content, "An ordinary field radio.\n");
        let (_, reloaded_plan) = crate::thought::find_catalog_plan(&destination).unwrap().unwrap();
        assert_eq!(reloaded_plan.relationships[0].description, "A shared childhood.\nA lasting promise.");
        assert_eq!(reloaded_plan.nodes[0].changes[0].new_value.as_deref(), Some("missing"));
    }
    assert_eq!(fs::read_to_string(source.storage.get_root().join(item_path)).unwrap(), raw);
}

#[test]
fn test_import_commit_separate_copy_success() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let preview = import_preview(
        &dstate,
        ImportPreviewRequest {
            package_path: pkg.to_str().unwrap().into(),
            target_house_id: "house-default".into(),
            policy: ImportIdentityPolicy::SeparateCopy,
            operation_id: Some("op-l2b-test-1".into()),
        },
    )
    .unwrap();

    assert!(preview.is_valid);
    let commit_req = ImportCommitRequest {
        operation_id: preview.operation_id.clone(),
        package_path: preview.package_path.clone(),
        target_house_id: preview.target_house_id.clone(),
        policy: preview.policy.clone(),
        expected_destination_fingerprint: preview.destination_fingerprint.clone(),
    };

    let result = import_commit(&dstate, commit_req).unwrap();

    assert_eq!(result.operation_id, "op-l2b-test-1");
    assert_eq!(result.house_id, "house-default");
    assert!(result.documents_imported > 0);
    assert!(result.archived_documents_imported > 0);

    // Verify all planned destination documents exist
    for doc_path in &preview.document_paths {
        let full = dstate.storage.get_root().join(&doc_path.destination_relative_path);
        assert!(full.exists(), "Planned document '{}' must exist on disk", doc_path.destination_relative_path);
    }

    // Verify catalog plan contains the imported records
    let (_, plan) = crate::thought::find_catalog_plan(&dstate)
        .unwrap()
        .expect("Catalog plan must exist");
    assert!(plan.universes.iter().any(|u| u.id == result.universe_id));
    assert!(plan.books.iter().any(|b| b.universe_id == result.universe_id));

    // Verify House Registry contains the universe
    let registry = dstate.storage.read_house_registry().unwrap();
    let target_h = registry
        .houses
        .iter()
        .find(|h| h.id == "house-default")
        .unwrap();
    assert!(target_h.universe_ids.contains(&result.universe_id));

    // Verify SQLite indexed the active documents
    let db_docs = dstate.db.lock().unwrap().list_documents(None, None).unwrap();
    for doc_path in preview.document_paths.iter().filter(|d| !d.is_archived) {
        assert!(db_docs.iter().any(|d| d.id == doc_path.proposed_id), "Active doc '{}' must be indexed in SQLite", doc_path.proposed_id);
    }

    // Verify staging directory is cleaned up
    let stg = import_commit::staging_dir(&dstate.storage, &result.operation_id);
    assert!(!stg.exists());

    // Verify journal marked Completed
    let journal = import_commit::read_journal(&dstate.storage, &result.operation_id)
        .unwrap()
        .unwrap();
    assert_eq!(journal.stage, ImportStage::Completed);
}

#[test]
fn test_import_commit_preserve_identity_success() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let preview = import_preview(
        &dstate,
        ImportPreviewRequest {
            package_path: pkg.to_str().unwrap().into(),
            target_house_id: "house-default".into(),
            policy: ImportIdentityPolicy::Preserve,
            operation_id: Some("op-l2b-preserve-1".into()),
        },
    )
    .unwrap();

    assert!(preview.is_valid);
    let commit_req = ImportCommitRequest {
        operation_id: preview.operation_id.clone(),
        package_path: preview.package_path.clone(),
        target_house_id: preview.target_house_id.clone(),
        policy: preview.policy.clone(),
        expected_destination_fingerprint: preview.destination_fingerprint.clone(),
    };

    let result = import_commit(&dstate, commit_req).unwrap();

    assert_eq!(result.universe_id, preview.proposed_universe_id);
    assert_eq!(result.operation_id, "op-l2b-preserve-1");

    let (_, plan) = crate::thought::find_catalog_plan(&dstate)
        .unwrap()
        .unwrap();
    assert!(plan.universes.iter().any(|u| u.id == result.universe_id));
}

#[test]
fn test_import_commit_idempotent_retry() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let preview = import_preview(
        &dstate,
        ImportPreviewRequest {
            package_path: pkg.to_str().unwrap().into(),
            target_house_id: "house-default".into(),
            policy: ImportIdentityPolicy::SeparateCopy,
            operation_id: Some("op-l2b-idempotent-1".into()),
        },
    )
    .unwrap();

    let commit_req = ImportCommitRequest {
        operation_id: preview.operation_id.clone(),
        package_path: preview.package_path.clone(),
        target_house_id: preview.target_house_id.clone(),
        policy: preview.policy.clone(),
        expected_destination_fingerprint: preview.destination_fingerprint.clone(),
    };

    let res1 = import_commit(&dstate, commit_req.clone()).unwrap();
    let (_, plan_before) = crate::thought::find_catalog_plan(&dstate).unwrap().unwrap();

    // Second invocation with exact same request
    let res2 = import_commit(&dstate, commit_req).unwrap();
    let (_, plan_after) = crate::thought::find_catalog_plan(&dstate).unwrap().unwrap();

    assert_eq!(res1, res2);
    assert_eq!(plan_before, plan_after);
}

#[test]
fn test_interruption_at_staged_rolls_back() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let preview = import_preview(
        &dstate,
        ImportPreviewRequest {
            package_path: pkg.to_str().unwrap().into(),
            target_house_id: "house-default".into(),
            policy: ImportIdentityPolicy::SeparateCopy,
            operation_id: Some("op-l2b-fail-staged".into()),
        },
    )
    .unwrap();

    let commit_req = ImportCommitRequest {
        operation_id: preview.operation_id.clone(),
        package_path: preview.package_path.clone(),
        target_house_id: preview.target_house_id.clone(),
        policy: preview.policy.clone(),
        expected_destination_fingerprint: preview.destination_fingerprint.clone(),
    };

    // Simulate failure immediately after staging
    let err = import_commit_with_checkpoint(&dstate, commit_req.clone(), |cp| {
        if cp == "after_staged" {
            Err("simulated_crash_after_staged".into())
        } else {
            Ok(())
        }
    })
    .unwrap_err();
    assert_eq!(err, "simulated_crash_after_staged");

    // Staging directory exists and destination files do NOT exist
    let stg = import_commit::staging_dir(&dstate.storage, "op-l2b-fail-staged");
    assert!(stg.exists());
    let dest_file = dstate.storage.get_root().join("Lorebooks/Character.md");
    assert!(!dest_file.exists());

    // Recover
    let report = recover_imports(&dstate).unwrap();
    assert!(report.recovered_operations.contains(&"op-l2b-fail-staged".to_string()));
    assert!(!stg.exists());

    // Clean retry succeeds
    let preview2 = import_preview(
        &dstate,
        ImportPreviewRequest {
            package_path: pkg.to_str().unwrap().into(),
            target_house_id: "house-default".into(),
            policy: ImportIdentityPolicy::SeparateCopy,
            operation_id: Some("op-l2b-fail-staged-retry".into()),
        },
    )
    .unwrap();
    let res = import_commit(
        &dstate,
        ImportCommitRequest {
            operation_id: preview2.operation_id.clone(),
            package_path: preview2.package_path.clone(),
            target_house_id: preview2.target_house_id.clone(),
            policy: preview2.policy.clone(),
            expected_destination_fingerprint: preview2.destination_fingerprint.clone(),
        },
    )
    .unwrap();
    assert_eq!(res.house_id, "house-default");
}

#[test]
fn test_interruption_at_files_committed_rolls_back() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let preview = import_preview(
        &dstate,
        ImportPreviewRequest {
            package_path: pkg.to_str().unwrap().into(),
            target_house_id: "house-default".into(),
            policy: ImportIdentityPolicy::SeparateCopy,
            operation_id: Some("op-l2b-fail-files".into()),
        },
    )
    .unwrap();

    let commit_req = ImportCommitRequest {
        operation_id: preview.operation_id.clone(),
        package_path: preview.package_path.clone(),
        target_house_id: preview.target_house_id.clone(),
        policy: preview.policy.clone(),
        expected_destination_fingerprint: preview.destination_fingerprint.clone(),
    };

    // Simulate failure after files are committed but before catalog is touched
    let err = import_commit_with_checkpoint(&dstate, commit_req, |cp| {
        if cp == "after_files_committed" {
            Err("simulated_crash_after_files_committed".into())
        } else {
            Ok(())
        }
    })
    .unwrap_err();
    assert_eq!(err, "simulated_crash_after_files_committed");

    // Files were committed on disk, but catalog has no knowledge of them
    let first_doc = dstate.storage.get_root().join(&preview.document_paths[0].destination_relative_path);
    assert!(first_doc.exists());
    assert!(crate::thought::find_catalog_plan(&dstate).unwrap().is_none());

    // Recover
    let report = recover_imports(&dstate).unwrap();
    assert!(report.recovered_operations.contains(&"op-l2b-fail-files".to_string()));

    // Verify destination files were deleted by recovery!
    assert!(!first_doc.exists());
    assert!(!import_commit::staging_dir(&dstate.storage, "op-l2b-fail-files").exists());
}

#[test]
fn test_interruption_at_catalog_committed_rolls_forward() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let preview = import_preview(
        &dstate,
        ImportPreviewRequest {
            package_path: pkg.to_str().unwrap().into(),
            target_house_id: "house-default".into(),
            policy: ImportIdentityPolicy::SeparateCopy,
            operation_id: Some("op-l2b-fail-catalog".into()),
        },
    )
    .unwrap();

    let commit_req = ImportCommitRequest {
        operation_id: preview.operation_id.clone(),
        package_path: preview.package_path.clone(),
        target_house_id: preview.target_house_id.clone(),
        policy: preview.policy.clone(),
        expected_destination_fingerprint: preview.destination_fingerprint.clone(),
    };

    // Simulate failure after catalog committed but before registry update
    let err = import_commit_with_checkpoint(&dstate, commit_req, |cp| {
        if cp == "after_catalog_committed" {
            Err("simulated_crash_after_catalog_committed".into())
        } else {
            Ok(())
        }
    })
    .unwrap_err();
    assert_eq!(err, "simulated_crash_after_catalog_committed");

    // Catalog committed, but registry does NOT contain the universe yet
    let registry = dstate.storage.read_house_registry().unwrap();
    let house = registry.houses.iter().find(|h| h.id == "house-default").unwrap();
    assert!(!house.universe_ids.contains(&preview.proposed_universe_id));

    // Recover rolls forward!
    let report = recover_imports(&dstate).unwrap();
    assert!(report.recovered_operations.contains(&"op-l2b-fail-catalog".to_string()));

    // Registry now contains universe!
    let reg_after = dstate.storage.read_house_registry().unwrap();
    let house_after = reg_after.houses.iter().find(|h| h.id == "house-default").unwrap();
    assert!(house_after.universe_ids.contains(&preview.proposed_universe_id));

    // SQLite index updated!
    let db_docs = dstate.db.lock().unwrap().list_documents(None, None).unwrap();
    for doc_path in preview.document_paths.iter().filter(|d| !d.is_archived) {
        assert!(db_docs.iter().any(|d| d.id == doc_path.proposed_id));
    }

    // Journal is marked Completed
    let journal = import_commit::read_journal(&dstate.storage, "op-l2b-fail-catalog")
        .unwrap()
        .unwrap();
    assert_eq!(journal.stage, ImportStage::Completed);
}

#[test]
fn test_interruption_at_registry_committed_rolls_forward() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let preview = import_preview(
        &dstate,
        ImportPreviewRequest {
            package_path: pkg.to_str().unwrap().into(),
            target_house_id: "house-default".into(),
            policy: ImportIdentityPolicy::SeparateCopy,
            operation_id: Some("op-l2b-fail-reg".into()),
        },
    )
    .unwrap();

    let commit_req = ImportCommitRequest {
        operation_id: preview.operation_id.clone(),
        package_path: preview.package_path.clone(),
        target_house_id: preview.target_house_id.clone(),
        policy: preview.policy.clone(),
        expected_destination_fingerprint: preview.destination_fingerprint.clone(),
    };

    let err = import_commit_with_checkpoint(&dstate, commit_req, |cp| {
        if cp == "after_registry_committed" {
            Err("simulated_crash_after_registry_committed".into())
        } else {
            Ok(())
        }
    })
    .unwrap_err();
    assert_eq!(err, "simulated_crash_after_registry_committed");

    // Recover rolls forward SQLite indexing
    let report = recover_imports(&dstate).unwrap();
    assert!(report.recovered_operations.contains(&"op-l2b-fail-reg".to_string()));

    let db_docs = dstate.db.lock().unwrap().list_documents(None, None).unwrap();
    for doc_path in preview.document_paths.iter().filter(|d| !d.is_archived) {
        assert!(db_docs.iter().any(|d| d.id == doc_path.proposed_id));
    }

    let journal = import_commit::read_journal(&dstate.storage, "op-l2b-fail-reg")
        .unwrap()
        .unwrap();
    assert_eq!(journal.stage, ImportStage::Completed);
}

#[test]
fn test_stale_preview_rejection() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let preview = import_preview(
        &dstate,
        ImportPreviewRequest {
            package_path: pkg.to_str().unwrap().into(),
            target_house_id: "house-default".into(),
            policy: ImportIdentityPolicy::SeparateCopy,
            operation_id: Some("op-l2b-stale".into()),
        },
    )
    .unwrap();

    // External change: create a new document in destination notebook
    let now = chrono::Utc::now().to_rfc3339();
    let new_doc = DocumentDetail {
        metadata: DocumentMetadata {
            id: "unrelated-doc-1".into(),
            title: "Unrelated Note".into(),
            doc_type: DocumentType::Philosophy,
            house_id: "house-default".into(),
            relative_path: "Philosophy/Unrelated_Note.md".into(),
            parent_id: None,
            metadata_json: None,
            created_at: now.clone(),
            updated_at: now,
            tags: vec![],
        },
        content: "Some external essay".into(),
    };
    dstate
        .storage
        .write_document_atomic("Philosophy/Unrelated_Note.md", &new_doc)
        .unwrap();
    dstate
        .db
        .lock()
        .unwrap()
        .upsert_document(&new_doc.metadata)
        .unwrap();

    // Attempting commit with old fingerprint fails!
    let commit_req = ImportCommitRequest {
        operation_id: preview.operation_id,
        package_path: preview.package_path,
        target_house_id: preview.target_house_id,
        policy: preview.policy,
        expected_destination_fingerprint: preview.destination_fingerprint,
    };

    let err = import_commit(&dstate, commit_req).unwrap_err();
    assert!(err.contains("Stale import plan") || err.contains("changed"));
}

#[test]
fn test_collision_rejection_preserve_mode() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    // Inspect package to find source universe ID
    let inspection = inspect_stable(&pkg).unwrap();
    let source_uni_id = inspection.universe.id.clone();

    // Assign that universe to destination house
    dstate
        .storage
        .mutate_house_registry(|reg| {
            reg.houses[0].universe_ids.push(source_uni_id);
            Ok(())
        })
        .unwrap();

    let preview = import_preview(
        &dstate,
        ImportPreviewRequest {
            package_path: pkg.to_str().unwrap().into(),
            target_house_id: "house-default".into(),
            policy: ImportIdentityPolicy::Preserve,
            operation_id: Some("op-l2b-collision".into()),
        },
    )
    .unwrap();

    assert!(!preview.is_valid);
    assert!(!preview.collisions.is_empty());

    let commit_req = ImportCommitRequest {
        operation_id: preview.operation_id,
        package_path: preview.package_path,
        target_house_id: preview.target_house_id,
        policy: preview.policy,
        expected_destination_fingerprint: preview.destination_fingerprint,
    };

    let err = import_commit(&dstate, commit_req).unwrap_err();
    assert!(err.contains("Import preview is invalid") || err.contains("collision"));
}

#[test]
fn test_mutual_exclusion_with_universe_move() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let preview = import_preview(
        &dstate,
        ImportPreviewRequest {
            package_path: pkg.to_str().unwrap().into(),
            target_house_id: "house-default".into(),
            policy: ImportIdentityPolicy::SeparateCopy,
            operation_id: Some("op-l2b-mutex".into()),
        },
    )
    .unwrap();

    // Write a pending universe move journal
    let move_journal = UniverseMoveJournal {
        operation_id: "op-move-test".into(),
        created_at: chrono::Utc::now().to_rfc3339(),
        stage: UniverseMoveStage::Planned,
        universe_id: "u-moving".into(),
        source_house_id: "house-default".into(),
        target_house_id: "house-default".into(),
        affected_documents: vec![],
    };
    dstate
        .storage
        .write_universe_move_journal(&move_journal)
        .unwrap();

    let commit_req = ImportCommitRequest {
        operation_id: preview.operation_id,
        package_path: preview.package_path,
        target_house_id: preview.target_house_id,
        policy: preview.policy,
        expected_destination_fingerprint: preview.destination_fingerprint,
    };

    let err = import_commit(&dstate, commit_req).unwrap_err();
    assert!(err.contains("Universe move operation is incomplete"));
}

#[test]
fn test_mutual_exclusion_with_vault_backup() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    // Create an incomplete import journal
    let journal = import_commit::ImportJournal {
        operation_id: "op-l2b-vault-block".into(),
        stage: ImportStage::FilesCommitted,
        package_path: pkg.to_str().unwrap().into(),
        package_sha256: "dummy-hash".into(),
        source_universe_id: "uni-source".into(),
        target_house_id: "house-default".into(),
        target_house_name: "Default House".into(),
        policy: ImportIdentityPolicy::SeparateCopy,
        destination_fingerprint: "dummy-fp".into(),
        proposed_universe_id: "uni-proposed".into(),
        proposed_universe_name: "Test Uni".into(),
        id_mappings: std::collections::BTreeMap::new(),
        document_files: vec![],
        asset_files: vec![],
        catalog_before: None,
        catalog_after_revision: 1,
        registry_before_universes: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
        result: None,
    };
    import_commit::save_journal_atomic(&dstate.storage, &journal).unwrap();

    let temp_vault = tempfile::tempdir().unwrap();
    let err = crate::vault::create_backup(&dstate, temp_vault.path()).unwrap_err();
    assert!(err.contains("Cannot create Vault backup while a Portable Universe import operation is incomplete"));
}

#[test]
fn narrative_descriptions_and_chapter_bindings_survive_portable_v1_roundtrip() {
    let (_sdir,sstate,request,_path)=tests::fixture();
    let doc_path=sstate.storage.get_root().join("Lorebooks/Character.md");
    let content=fs::read_to_string(&doc_path).unwrap().replace(r#""entity_id": "archived-char""#,r#""info": "non-id-value""#);
    fs::write(&doc_path,content).unwrap();
    let (_,mut plan)=crate::thought::find_catalog_plan(&sstate).unwrap().unwrap();
    plan.universes.iter_mut().find(|u|u.id=="u").unwrap().description=Some("Premise.\n\nExtended overview.".into());
    plan.nodes.iter_mut().find(|n|n.id=="m-1").unwrap().description="Event summary.\n\nConsequences: An authored aftermath.".into();
    crate::thought::save_impl(&sstate,plan.revision,plan).unwrap();
    let package=sstate.storage.get_root().parent().unwrap().join("narrative.mcuniverse"); export(&sstate,request,&package).unwrap();
    let (_ddir,dstate)=dest_fixture();
    let preview=import_preview(&dstate,ImportPreviewRequest {package_path:package.to_string_lossy().into(),target_house_id:"house-default".into(),policy:ImportIdentityPolicy::SeparateCopy,operation_id:Some("narrative-roundtrip".into())}).unwrap();
    assert!(preview.is_valid);
    let result=import_commit(&dstate,ImportCommitRequest {operation_id:preview.operation_id.clone(),package_path:preview.package_path.clone(),target_house_id:preview.target_house_id.clone(),policy:preview.policy.clone(),expected_destination_fingerprint:preview.destination_fingerprint.clone()}).unwrap();
    let (_,plan)=crate::thought::find_catalog_plan(&dstate).unwrap().unwrap();
    assert_eq!(plan.universes.iter().find(|u|u.id==result.universe_id).unwrap().description.as_deref(),Some("Premise.\n\nExtended overview."));
    let milestone=plan.nodes.iter().find(|n|n.universe_id==result.universe_id && n.description=="Event summary.\n\nConsequences: An authored aftermath.").unwrap();
    let chapters=dstate.db.lock().unwrap().list_documents(None,None).unwrap();
    assert!(chapters.iter().any(|d|d.metadata_json.as_ref().and_then(|text|serde_json::from_str::<serde_json::Value>(text).ok()).is_some_and(|meta|meta["entry_type"]=="chapter" && meta["milestone_id"]==milestone.id)));
}

#[test]
fn echo_references_with_anchors_and_timestamps_survive_v1_import_and_remap() {
    let (_sdir, sstate, request, _path) = tests::fixture();
    let doc_path = sstate.storage.get_root().join("Lorebooks/Character.md");
    let initial_content = fs::read_to_string(&doc_path)
        .unwrap()
        .replace(r#""entity_id": "archived-char""#, r#""info": "non-id-value""#);

    // Inject valid E3 echo_references with anchor, contextAnchor, createdAt, and updatedAt
    let ref_json = serde_json::json!([
        {
            "id": "ref-origin-001",
            "targetId": "char",
            "from": 0,
            "to": 2,
            "matchedText": "He",
            "anchor": {
                "before": "",
                "after": " walked into the hall."
            },
            "contextAnchor": {
                "before": "",
                "after": " walked into the hall."
            },
            "status": "active",
            "createdAt": "2026-10-31T00:00:00Z",
            "updatedAt": "2026-10-31T01:00:00Z",
            "version": 1
        }
    ]);

    let modified_content = initial_content.replace(
        "\"canon_status\": \"canon\",",
        &format!("\"canon_status\": \"canon\",\n    \"echo_references\": {},\n", serde_json::to_string(&ref_json).unwrap())
    );
    fs::write(&doc_path, modified_content).unwrap();

    let package = sstate.storage.get_root().parent().unwrap().join("echo-refs.mcuniverse");
    export(&sstate, request, &package).unwrap();

    let inspect_report = inspect(&package).unwrap();
    assert!(inspect_report.compatible);
    assert!(inspect_report.unsupported_features.is_empty());
    for doc in &inspect_report.manifest.documents {
        assert!(
            !doc.opaque_fields.iter().any(|f| f.contains("echo_references")),
            "echo_references should not be flagged as opaque/unsupported field: {:?}",
            doc.opaque_fields
        );
    }

    let (_ddir, dstate) = dest_fixture();
    let preview = import_preview(
        &dstate,
        ImportPreviewRequest {
            package_path: package.to_string_lossy().into(),
            target_house_id: "house-default".into(),
            policy: ImportIdentityPolicy::SeparateCopy,
            operation_id: Some("echo-refs-roundtrip".into()),
        },
    )
    .unwrap();

    // Verify package is valid and has 0 diagnostic warnings
    if !preview.is_valid {
        eprintln!("PREVIEW COLLISIONS: {:?}", preview.collisions);
        eprintln!("PREVIEW DIAGNOSTICS: {:?}", preview.diagnostics);
    }
    assert!(preview.is_valid);
    assert!(
        !preview.diagnostics.iter().any(|d| d.message.contains("echo_references")),
        "echo_references triggered unexpected diagnostic: {:?}",
        preview.diagnostics
    );

    let result = import_commit(
        &dstate,
        ImportCommitRequest {
            operation_id: preview.operation_id.clone(),
            package_path: preview.package_path.clone(),
            target_house_id: preview.target_house_id.clone(),
            policy: preview.policy.clone(),
            expected_destination_fingerprint: preview.destination_fingerprint.clone(),
        },
    )
    .unwrap();
    assert!(result.universe_id.starts_with("uni-"));

    let docs = dstate.db.lock().unwrap().list_documents(None, None).unwrap();
    let remapped_doc = docs
        .iter()
        .find(|d| {
            d.metadata_json.as_ref().is_some_and(|text| {
                text.contains("echo_references")
            })
        })
        .expect("Remapped document with echo_references not found in DB");

    let parsed_meta: serde_json::Value =
        serde_json::from_str(remapped_doc.metadata_json.as_ref().unwrap()).unwrap();
    let remapped_refs = parsed_meta["echo_references"].as_array().unwrap();
    assert_eq!(remapped_refs.len(), 1);

    let r0 = &remapped_refs[0];
    // Re-keyed ID
    assert_ne!(r0["id"].as_str().unwrap(), "ref-origin-001");
    // Remapped target ID against new universe/house entities
    assert_ne!(r0["targetId"].as_str().unwrap(), "char");
    // Coordinates and text preserved
    assert_eq!(r0["from"].as_i64().unwrap(), 0);
    assert_eq!(r0["to"].as_i64().unwrap(), 2);
    assert_eq!(r0["matchedText"].as_str().unwrap(), "He");
    assert_eq!(r0["status"].as_str().unwrap(), "active");
    // Anchors preserved
    assert_eq!(r0["anchor"]["after"].as_str().unwrap(), " walked into the hall.");
    assert_eq!(r0["contextAnchor"]["after"].as_str().unwrap(), " walked into the hall.");
}

#[test]
fn malformed_echo_references_are_rejected_by_validator() {
    let (_sdir, sstate, _request, _path) = tests::fixture();
    let doc_path = sstate.storage.get_root().join("Lorebooks/Character.md");
    let initial_content = fs::read_to_string(&doc_path).unwrap();

    // Invalid offset bounds: from (10) > to (2)
    let bad_bounds = serde_json::json!([{
        "id": "ref-bad-1",
        "targetId": "char",
        "from": 10,
        "to": 2,
        "matchedText": "He"
    }]);

    let content = initial_content.replace(
        "\"canon_status\": \"canon\",",
        &format!("\"canon_status\": \"canon\",\n    \"echo_references\": {},\n", serde_json::to_string(&bad_bounds).unwrap())
    );
    let (head, _) = content.split_once("\n---\n").unwrap();
    let fm: serde_json::Value = serde_json::from_str(head.trim_start_matches("---json\n")).unwrap();
    let doc = crate::models::DocumentDetail {
        metadata: DocumentMetadata {
            id: "char".into(),
            title: "Character".into(),
            doc_type: crate::models::DocumentType::Lorebook,
            house_id: "house-default".into(),
            created_at: "2026-10-31T00:00:00Z".into(),
            updated_at: "2026-10-31T00:00:00Z".into(),
            tags: vec![],
            parent_id: None,
            relative_path: "Lorebooks/Character.md".into(),
            metadata_json: None,
        },
        content: "body".into(),
    };
    let err = crate::portable::validate::document(&doc, &fm).unwrap_err();
    assert!(err.contains("Invalid echo_references offset bounds"));
}

#[test]
fn test_portable_universe_remapping_preserves_relationship_changes() {
    let (source_dir, source, _) = create_clean_source_package();
    let catalog_path = source.storage.get_root().join("Lorebooks/Web_of_Thought_catalog.md");
    let catalog_raw = fs::read_to_string(&catalog_path).unwrap();
    let (header, body) = catalog_raw.strip_prefix("---json\n").unwrap().split_once("\n---\n").unwrap();
    let mut fm: serde_json::Value = serde_json::from_str(header).unwrap();
    let plan = &mut fm["metadata"][crate::thought::KEY];

    // Add a relationship change on node 0 targeting relationship "rel"
    plan["nodes"][0]["relationship_changes"] = serde_json::json!([
        {
            "relationship_id": "rel",
            "label": "[severed]",
            "note": "Alliance severed at m-1"
        }
    ]);

    fs::write(
        &catalog_path,
        format!("---json\n{}\n---\n{body}", serde_json::to_string(&fm).unwrap()),
    ).unwrap();

    let package = source_dir.path().join("rel_changes.mcuniverse");
    let exported = export(
        &source,
        ExportRequest {
            universe_id: "u".into(),
            snapshot_basis: SnapshotBasis::LastSavedState,
            book_ids: vec!["book".into()],
            chapter_ids: vec!["ch-1".into(), "ch-2".into()],
        },
        &package,
    ).unwrap();
    assert_eq!(exported.manifest.format_version, 1);

    // 1. Test SeparateCopy: relationship IDs and entity IDs are re-keyed, and relationship_changes match the new relationship ID
    {
        let (_dir, destination) = dest_fixture();
        let preview = import_preview(
            &destination,
            ImportPreviewRequest {
                package_path: package.to_string_lossy().into(),
                target_house_id: "house-default".into(),
                policy: ImportIdentityPolicy::SeparateCopy,
                operation_id: Some("op-separate-copy-rel-changes".into()),
            },
        ).unwrap();
        assert!(preview.is_valid, "{:?}", preview.diagnostics);

        import_commit(
            &destination,
            ImportCommitRequest {
                operation_id: preview.operation_id.clone(),
                package_path: preview.package_path.clone(),
                target_house_id: preview.target_house_id.clone(),
                policy: preview.policy.clone(),
                expected_destination_fingerprint: preview.destination_fingerprint.clone(),
            },
        ).unwrap();

        let (_, reloaded_plan) = crate::thought::find_catalog_plan(&destination).unwrap().unwrap();
        assert_eq!(reloaded_plan.relationships.len(), 1);
        let new_rel_id = &reloaded_plan.relationships[0].id;
        assert_ne!(new_rel_id, "rel", "Under SeparateCopy, relationship id should be remapped");

        // Verify relationship_changes on node 0
        let node_m1 = reloaded_plan.nodes.iter().find(|n| n.title == "m-1").expect("m-1 node not found");
        assert_eq!(node_m1.relationship_changes.len(), 1);
        let rc = &node_m1.relationship_changes[0];
        assert_eq!(&rc.relationship_id, new_rel_id, "RelationshipChange relationship_id must match remapped relationship id");
        assert_eq!(rc.label.as_deref(), Some("[severed]"));
        assert_eq!(rc.note, "Alliance severed at m-1");

        // Verify property changes on node 0 also remapped
        assert_eq!(node_m1.changes.len(), 1);
        let new_char_id = &reloaded_plan.entities.iter().find(|e| e.universe_id != "v" && e.id != "faction" && e.id != "archived-char" && e.id != "ch-1" && e.id != "ch-2").unwrap().id;
        assert_ne!(new_char_id, "char", "Under SeparateCopy, entity id should be remapped");
        assert_eq!(&node_m1.changes[0].entity_id, new_char_id);
    }

    // 2. Test Preserve: relationship IDs and entity IDs retain original source UUIDs
    {
        let (_dir, destination) = dest_fixture();
        let preview = import_preview(
            &destination,
            ImportPreviewRequest {
                package_path: package.to_string_lossy().into(),
                target_house_id: "house-default".into(),
                policy: ImportIdentityPolicy::Preserve,
                operation_id: Some("op-preserve-rel-changes".into()),
            },
        ).unwrap();
        assert!(preview.is_valid, "{:?}", preview.diagnostics);

        import_commit(
            &destination,
            ImportCommitRequest {
                operation_id: preview.operation_id.clone(),
                package_path: preview.package_path.clone(),
                target_house_id: preview.target_house_id.clone(),
                policy: preview.policy.clone(),
                expected_destination_fingerprint: preview.destination_fingerprint.clone(),
            },
        ).unwrap();

        let (_, reloaded_plan) = crate::thought::find_catalog_plan(&destination).unwrap().unwrap();
        assert_eq!(reloaded_plan.relationships.len(), 1);
        assert_eq!(&reloaded_plan.relationships[0].id, "rel", "Under Preserve, relationship id should be preserved");

        let node_m1 = reloaded_plan.nodes.iter().find(|n| n.title == "m-1").expect("m-1 node not found");
        assert_eq!(node_m1.relationship_changes.len(), 1);
        let rc = &node_m1.relationship_changes[0];
        assert_eq!(&rc.relationship_id, "rel");
        assert_eq!(rc.label.as_deref(), Some("[severed]"));
        assert_eq!(rc.note, "Alliance severed at m-1");

        assert_eq!(&node_m1.changes[0].entity_id, "char");
    }
}
