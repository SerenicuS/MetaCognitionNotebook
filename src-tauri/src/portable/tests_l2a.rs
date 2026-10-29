//! L2a Import Planning and Identity Remapping Regression Suite.
use super::*;
use crate::{db::Database, models::*, storage::StorageManager};
use serde_json::json;
use std::{path::PathBuf, sync::Mutex};

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

fn create_source_package() -> (tempfile::TempDir, AppState, PathBuf) {
    let (dir, state, request, path) = tests::fixture();
    export(&state, request, &path).unwrap();
    (dir, state, path)
}

fn create_clean_source_package() -> (tempfile::TempDir, AppState, PathBuf) {
    let (dir, state, request, path) = tests::fixture();
    let doc_path = state.storage.get_root().join("Lorebooks/Character.md");
    let content = std::fs::read_to_string(&doc_path).unwrap();
    let cleaned = content.replace(r#""entity_id": "archived-char""#, r#""info": "non-id-value""#);
    std::fs::write(&doc_path, cleaned).unwrap();
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

fn req(pkg: &std::path::Path, house: &str, policy: ImportIdentityPolicy) -> ImportPreviewRequest {
    ImportPreviewRequest {
        package_path: pkg.to_str().unwrap().into(),
        target_house_id: house.into(),
        policy,
        operation_id: None,
    }
}

#[test]
fn collision_free_identity_preservation() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let request = req(&pkg, "house-default", ImportIdentityPolicy::Preserve);

    let preview = import_preview(&dstate, request).unwrap();
    assert!(preview.is_valid);
    assert!(preview.collisions.is_empty());
    assert!(preview.diagnostics.is_empty());
    assert_eq!(preview.proposed_universe_id, "u");
    assert_eq!(preview.id_mappings.get("u"), Some(&"u".to_string()));
    assert_eq!(preview.id_mappings.get("book"), Some(&"book".to_string()));
    assert_eq!(preview.id_mappings.get("br-1"), Some(&"br-1".to_string()));
    assert_eq!(preview.id_mappings.get("char"), Some(&"char".to_string()));
    assert_eq!(preview.id_mappings.get("m-1"), Some(&"m-1".to_string()));
    assert_eq!(preview.id_mappings.get("rel"), Some(&"rel".to_string()));

    let plan = preview.proposed_plan.unwrap();
    assert_eq!(plan.revision, 1);
    assert_eq!(plan.universes[0].id, "u");
    assert_eq!(plan.books[0].id, "book");
    assert_eq!(plan.branches.len(), 2);
    assert_eq!(plan.nodes.len(), 5);
}

#[test]
fn full_separate_copy_remapping() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    // Create universe 'u' in destination to simulate existing data
    let plan = crate::thought::Plan {
        version: 1,
        revision: 1,
        universes: vec![crate::thought::Universe {
            id: "u".into(),
            name: "Existing World".into(),
            description: None,
            archived: false,
        }],
        books: vec![],
        branches: vec![],
        entities: vec![],
        nodes: vec![],
        relationships: vec![],
    };
    let doc_raw = format!(
        "---json\n{}\n---\nCatalog",
        serde_json::to_string_pretty(&json!({
            "id": "cat",
            "type": "lorebook",
            "house_id": "house-default",
            "created_at": "2026-10-28T00:00:00Z",
            "updated_at": "2026-10-28T00:00:00Z",
            "title": "Catalog",
            "metadata": { "_web_of_thought": plan }
        }))
        .unwrap()
    );
    std::fs::write(
        dstate.storage.get_root().join("Lorebooks/Web_of_Thought_catalog.md"),
        doc_raw,
    )
    .unwrap();

    let request = req(&pkg, "house-default", ImportIdentityPolicy::SeparateCopy);

    let preview1 = import_preview(&dstate, request.clone()).unwrap();
    assert!(preview1.is_valid);
    assert_eq!(preview1.collisions.len(), 1);
    assert_eq!(preview1.collisions[0].source_id, "u");
    assert!(preview1.diagnostics.is_empty());
    assert_ne!(preview1.proposed_universe_id, "u");
    assert!(preview1.proposed_universe_id.starts_with("uni-"));
    assert_ne!(preview1.id_mappings["book"], "book");
    assert_ne!(preview1.id_mappings["br-1"], "br-1");
    assert_ne!(preview1.id_mappings["char"], "char");
    assert_ne!(preview1.id_mappings["m-1"], "m-1");
    assert_ne!(preview1.id_mappings["rel"], "rel");

    // Retrying with the same operation_id retains exactly the same namespace and ID mappings
    let retry_request = ImportPreviewRequest {
        operation_id: Some(preview1.operation_id.clone()),
        ..request.clone()
    };
    let preview2 = import_preview(&dstate, retry_request).unwrap();
    assert_eq!(preview1.operation_id, preview2.operation_id);
    assert_eq!(preview1.id_mappings, preview2.id_mappings);
    assert_eq!(preview1.proposed_universe_id, preview2.proposed_universe_id);
    assert_eq!(preview1.destination_fingerprint, preview2.destination_fingerprint);

    // Two deliberate separate imports receive distinct namespaces and ID mappings
    let preview3 = import_preview(&dstate, request).unwrap();
    assert_ne!(preview1.operation_id, preview3.operation_id);
    assert_ne!(preview1.proposed_universe_id, preview3.proposed_universe_id);
    assert_ne!(preview1.id_mappings["char"], preview3.id_mappings["char"]);

    let proposed = preview1.proposed_plan.unwrap();
    assert_eq!(proposed.revision, 2);
    // Destination existing universe remains unchanged
    assert_eq!(proposed.universes[0].id, "u");
    assert_eq!(proposed.universes[0].name, "Existing World");
    // Remapped universe is appended
    assert_eq!(proposed.universes[1].id, preview1.proposed_universe_id);
    assert_eq!(proposed.universes[1].name, "月世界");
}

#[test]
fn archived_identities_and_records() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let request = req(&pkg, "house-default", ImportIdentityPolicy::Preserve);

    let preview = import_preview(&dstate, request).unwrap();
    let archived_doc = preview
        .document_paths
        .iter()
        .find(|d| d.source_id == "archived-char")
        .unwrap();
    assert!(archived_doc.is_archived);
    assert!(archived_doc.destination_relative_path.starts_with("Backups/"));

    // Add a conflicting archived document to destination Backups/
    let conflicting_backup = format!(
        "---json\n{}\n---\nConflict",
        serde_json::to_string_pretty(&json!({
            "id": "archived-char",
            "type": "lorebook",
            "house_id": "house-default",
            "created_at": "2026-10-28T00:00:00Z",
            "updated_at": "2026-10-28T00:00:00Z",
            "title": "Existing Backup",
            "metadata": { "archived": true }
        }))
        .unwrap()
    );
    std::fs::write(
        dstate.storage.get_root().join("Backups/old.md"),
        conflicting_backup,
    )
    .unwrap();

    let request_preserve = req(&pkg, "house-default", ImportIdentityPolicy::Preserve);

    let preview_conflict = import_preview(&dstate, request_preserve).unwrap();
    assert!(!preview_conflict.is_valid);
    assert!(preview_conflict
        .collisions
        .iter()
        .any(|c| c.source_id == "archived-char"));
}

#[test]
fn nested_alternate_continuities() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let request = req(&pkg, "house-default", ImportIdentityPolicy::SeparateCopy);

    let preview = import_preview(&dstate, request).unwrap();
    assert!(preview.is_valid);

    let plan = preview.proposed_plan.unwrap();
    let new_br1_id = &preview.id_mappings["br-1"];
    let new_br2_id = &preview.id_mappings["br-2"];
    let new_m1_id = &preview.id_mappings["m-1"];
    let new_m3_id = &preview.id_mappings["m-3"];

    let br1 = plan.branches.iter().find(|b| &b.id == new_br1_id).unwrap();
    assert_eq!(&br1.divergence_node_id, new_m1_id);
    assert_eq!(br1.parent_continuity_id, None);

    let br2 = plan.branches.iter().find(|b| &b.id == new_br2_id).unwrap();
    assert_eq!(&br2.divergence_node_id, new_m3_id);
    assert_eq!(br2.parent_continuity_id.as_ref(), Some(new_br1_id));
}

#[test]
fn historical_provenance() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let request = req(&pkg, "house-default", ImportIdentityPolicy::SeparateCopy);

    let preview = import_preview(&dstate, request).unwrap();
    assert!(preview.is_valid);
    let plan = preview.proposed_plan.unwrap();

    for node in &plan.nodes {
        if let Some(origin) = &node.origin_node_id {
            assert!(plan.nodes.iter().any(|n| &n.id == origin));
        }
        if let Some(event) = &node.linked_event_id {
            assert!(plan.nodes.iter().any(|n| &n.id == event));
        }
    }
}

#[test]
fn equal_milestone_positions() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let request = req(&pkg, "house-default", ImportIdentityPolicy::SeparateCopy);

    let preview = import_preview(&dstate, request).unwrap();
    assert!(preview.is_valid);
    assert!(!preview
        .diagnostics
        .iter()
        .any(|d| d.code == "milestone_order_mismatch"));

    // Check tied milestones m-1 and m-2 (both position 0) in the primary timeline
    let new_m1 = &preview.id_mappings["m-1"];
    let new_m2 = &preview.id_mappings["m-2"];
    assert!(new_m1 < new_m2, "Remapped milestone IDs must preserve source order for equal positions");
}

#[test]
fn chapter_timestamp_ordering() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let request = req(&pkg, "house-default", ImportIdentityPolicy::SeparateCopy);

    let preview = import_preview(&dstate, request).unwrap();
    assert!(preview.is_valid);
    assert!(!preview
        .diagnostics
        .iter()
        .any(|d| d.code == "chapter_order_mismatch"));
}

#[test]
fn faction_position_references() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let request = req(&pkg, "house-default", ImportIdentityPolicy::SeparateCopy);

    let preview = import_preview(&dstate, request).unwrap();
    assert!(preview.is_valid);

    let _new_char_id = &preview.id_mappings["char"];
    let new_org_id = &preview.id_mappings["org"];
    let new_seat_id = &preview.id_mappings["seat"];

    assert!(new_org_id.starts_with("fb-"));
    assert!(new_seat_id.starts_with("fp-"));
    assert!(preview.id_mappings.contains_key("seat"));
    assert_eq!(preview.id_mappings.get("seat"), Some(new_seat_id));
}

#[test]
fn house_isolation() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    // 1. Missing house fails
    let err_missing = import_preview(
        &dstate,
        req(&pkg, "non-existent-house", ImportIdentityPolicy::SeparateCopy),
    )
    .unwrap_err();
    assert!(err_missing.contains("does not exist"));

    // 2. Archived house fails
    let archived_house = dstate
        .storage
        .create_house(CreateHouseInput {
            name: "Archived Workspace".into(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: None,
            manuscript_tools_enabled: None,
        })
        .unwrap();
    dstate.storage.archive_house(&archived_house.id).unwrap();

    let err_archived = import_preview(
        &dstate,
        req(&pkg, &archived_house.id, ImportIdentityPolicy::SeparateCopy),
    )
    .unwrap_err();
    assert!(err_archived.contains("is archived"));

    // 3. House without Lorebook fails
    let poetry_house = HouseRecord {
        id: "house-poetry-only".into(),
        name: "Poetry Only".into(),
        description: None,
        color: "blue".into(),
        icon: "feather".into(),
        enabled_studios: vec![AuthoringStudio::Poetry],
        manuscript_tools_enabled: false,
        universe_ids: vec![],
        created_at: "2026-10-28T00:00:00Z".into(),
        updated_at: "2026-10-28T00:00:00Z".into(),
        archived: false,
    };
    dstate
        .storage
        .mutate_house_registry(|reg| {
            reg.houses.push(poetry_house);
            Ok(())
        })
        .unwrap();

    let err_no_lorebook = import_preview(
        &dstate,
        req(&pkg, "house-poetry-only", ImportIdentityPolicy::SeparateCopy),
    )
    .unwrap_err();
    assert!(err_no_lorebook.contains("does not have Lorebook enabled"));
}

#[test]
fn unknown_metadata() {
    let (_sdir, _sstate, pkg) = create_source_package(); // package has future_extension referencing "archived-char"
    let (_ddir, dstate) = dest_fixture();

    // In SeparateCopy mode, unsupported extension containing source reference triggers diagnostic
    let preview_copy = import_preview(
        &dstate,
        req(&pkg, "house-default", ImportIdentityPolicy::SeparateCopy),
    )
    .unwrap();
    assert!(!preview_copy.is_valid);
    assert!(preview_copy
        .diagnostics
        .iter()
        .any(|d| d.code == "untransformable_extension_reference"));

    // In Preserve mode, since IDs are preserved without transformation, it is valid
    let preview_preserve = import_preview(
        &dstate,
        req(&pkg, "house-default", ImportIdentityPolicy::Preserve),
    )
    .unwrap();
    assert!(preview_preserve.is_valid);
    assert!(!preview_preserve
        .diagnostics
        .iter()
        .any(|d| d.code == "untransformable_extension_reference"));
}

#[test]
fn stale_previews() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let preview = import_preview(
        &dstate,
        req(&pkg, "house-default", ImportIdentityPolicy::SeparateCopy),
    )
    .unwrap();

    // Freshness check succeeds immediately
    assert!(verify_import_plan_freshness(&dstate, &preview).is_ok());

    // Modify destination by writing a new document
    let new_doc = format!(
        "---json\n{}\n---\nHello",
        serde_json::to_string_pretty(&json!({
            "id": "new-doc",
            "type": "lorebook",
            "house_id": "house-default",
            "created_at": "2026-10-28T01:00:00Z",
            "updated_at": "2026-10-28T01:00:00Z",
            "title": "New Doc",
            "metadata": { "universe_id": "other" }
        }))
        .unwrap()
    );
    std::fs::write(
        dstate.storage.get_root().join("Lorebooks/New_Doc.md"),
        new_doc,
    )
    .unwrap();

    // Freshness check fails safely
    let err = verify_import_plan_freshness(&dstate, &preview).unwrap_err();
    assert!(err.contains("Stale import plan"));
}

#[test]
fn unchanged_destination_data_after_failures() {
    let (_sdir, _sstate, pkg) = create_source_package();
    let (_ddir, dstate) = dest_fixture();

    let before_fingerprints = collect::fingerprints(dstate.storage.get_root()).unwrap();
    let before_docs = dstate
        .db
        .lock()
        .unwrap()
        .list_documents(None, None)
        .unwrap();

    // Run preview with missing house (error)
    let _ = import_preview(
        &dstate,
        req(&pkg, "missing-house", ImportIdentityPolicy::SeparateCopy),
    );

    // Run preview with separate copy (untransformable extension rejection)
    let _ = import_preview(
        &dstate,
        req(&pkg, "house-default", ImportIdentityPolicy::SeparateCopy),
    );

    let after_fingerprints = collect::fingerprints(dstate.storage.get_root()).unwrap();
    let after_docs = dstate
        .db
        .lock()
        .unwrap()
        .list_documents(None, None)
        .unwrap();

    assert_eq!(before_fingerprints, after_fingerprints);
    assert_eq!(
        serde_json::to_value(&before_docs).unwrap(),
        serde_json::to_value(&after_docs).unwrap()
    );
}

#[test]
fn attachments_invalidation() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    let preview = import_preview(
        &dstate,
        req(&pkg, "house-default", ImportIdentityPolicy::SeparateCopy),
    )
    .unwrap();
    assert!(verify_import_plan_freshness(&dstate, &preview).is_ok());

    // Adding an attachment file in Attachments/ directory changes the destination footprint
    std::fs::write(
        dstate.storage.get_root().join("Attachments/new_map.png"),
        b"some asset bytes",
    )
    .unwrap();

    let err = verify_import_plan_freshness(&dstate, &preview).unwrap_err();
    assert!(err.contains("Stale import plan"));
}

#[test]
fn entity_and_faction_collision_detection() {
    let (_sdir, _sstate, pkg) = create_clean_source_package();
    let (_ddir, dstate) = dest_fixture();

    // Pre-populate destination with an existing faction document having branch 'org' and position 'seat'
    let existing_faction = format!(
        "---json\n{}\n---\nFaction doc",
        serde_json::to_string_pretty(&json!({
            "id": "existing-faction-doc",
            "type": "lorebook",
            "house_id": "house-default",
            "created_at": "2026-10-28T00:00:00Z",
            "updated_at": "2026-10-28T00:00:00Z",
            "title": "Existing Faction",
            "metadata": {
                "universe_id": "other-uni",
                "faction_fields": {
                    "branches": [{ "id": "org", "name": "Existing Council" }],
                    "positions": [{ "id": "seat", "title": "Existing Seat", "branch_id": "org", "holder_ids": [] }]
                }
            }
        }))
        .unwrap()
    );
    std::fs::write(
        dstate.storage.get_root().join("Lorebooks/Existing_Faction.md"),
        existing_faction,
    )
    .unwrap();

    // In Preserve mode, the collision on faction branch 'org' and position 'seat' must be detected
    let preview_preserve = import_preview(
        &dstate,
        req(&pkg, "house-default", ImportIdentityPolicy::Preserve),
    )
    .unwrap();
    assert!(!preview_preserve.is_valid);
    assert!(preview_preserve
        .collisions
        .iter()
        .any(|c| c.source_id == "org" && c.collision_type == "faction_branch"));
    assert!(preview_preserve
        .collisions
        .iter()
        .any(|c| c.source_id == "seat" && c.collision_type == "faction_position"));

    // In SeparateCopy mode, collisions on 'org' and 'seat' are remapped safely
    let preview_copy = import_preview(
        &dstate,
        req(&pkg, "house-default", ImportIdentityPolicy::SeparateCopy),
    )
    .unwrap();
    assert!(preview_copy.is_valid);
    assert_ne!(preview_copy.id_mappings["org"], "org");
    assert_ne!(preview_copy.id_mappings["seat"], "seat");
}
