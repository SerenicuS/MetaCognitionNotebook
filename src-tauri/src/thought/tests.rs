use super::*;
use crate::{commands::*, db::Database, storage::StorageManager, vault};
use std::{fs, path::Path, sync::Mutex};

#[test]
fn cross_studio_entity_references_are_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    for studio in ["poetry", "philosophy"] {
        let doc = create_document_impl(
            &s,
            studio.into(),
            "Unrelated writing".into(),
            None,
            None,
            None,
            None,
            None,
        )
        .unwrap();
        let mut p = plan();
        p.entities[0].id = doc.metadata.id;
        assert!(save_impl(&s, 0, p)
            .unwrap_err()
            .contains("Lorebook entities only"));
    }
}

#[test]
fn new_catalog_index_failure_keeps_canonical_file_and_retry_repairs_index() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let connection = rusqlite::Connection::open(&s.db_path).unwrap();
    connection.execute_batch("CREATE TRIGGER fail_new BEFORE INSERT ON documents BEGIN SELECT RAISE(ABORT, 'injected'); END;").unwrap();
    let p = plan();
    assert!(save_impl(&s, 0, p.clone()).is_err());
    assert_eq!(get_impl(&s).unwrap().plan.unwrap().revision, 1);
    connection.execute_batch("DROP TRIGGER fail_new;").unwrap();
    let saved = save_impl(&s, 0, p).unwrap();
    assert!(get_document_impl(&s, saved.document_id.unwrap()).is_ok());
}
fn state(root: &Path) -> AppState {
    let storage = StorageManager::new(root.join("Library"));
    storage.initialize().unwrap();
    AppState {
        storage,
        db: Mutex::new(Database::open(root.join("index.db")).unwrap()),
        db_path: root.join("index.db"),
    }
}
fn plan() -> Plan {
    serde_json::from_value(serde_json::json!({"version":1,"revision":0,"universes":[{"id":"u","name":"世界"}],"books":[{"id":"b","universe_id":"u","name":"I","continuity":"standalone"}],"entities":[{"id":"entity","universe_id":"u"}],"nodes":[],"relationships":[]})).unwrap()
}

#[test]
fn universe_archive_defaults_are_compatible_and_visibility_survives_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let legacy = plan();
    assert!(!legacy.universes[0].archived);
    assert!(serde_json::to_value(&legacy).unwrap()["universes"][0].get("archived").is_none());
    let mut next = legacy.clone();
    next.universes[0].archived = true;
    next.nodes.push(node("history", Some("b")));
    let saved = save_impl(&s, 0, next).unwrap();
    assert!(saved.plan.as_ref().unwrap().universes[0].archived);
    drop(s);
    let reopened = state(dir.path());
    reindex_library_impl(&reopened).unwrap();
    assert_eq!(get_impl(&reopened).unwrap(), saved);
    let mut recovered = saved.plan.unwrap();
    recovered.universes[0].archived = false;
    let restored = save_impl(&reopened, 1, recovered).unwrap().plan.unwrap();
    assert_eq!(restored.entities, legacy.entities);
    assert_eq!(restored.books, legacy.books);
    assert_eq!(restored.nodes.len(), 1);
}

#[test]
fn shared_planning_catalog_cannot_be_archived_as_a_document() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let saved = save_impl(&s, 0, plan()).unwrap();
    let id = saved.document_id.unwrap();
    assert!(delete_document_impl(&s, id.clone()).unwrap_err().contains("shared planning catalog"));
    assert!(get_document_impl(&s, id).is_ok());
    assert!(get_impl(&s).unwrap().plan.is_some());
}

#[test]
fn entity_document_archive_requires_prior_relationship_archive_and_preserves_history() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let doc = create_document_impl(&s, "lorebook".into(), "Original entity".into(), None, Some("Unchanged writing".into()), None, None, None).unwrap();
    let mut p = plan();
    p.entities[0].id = doc.metadata.id.clone();
    let mut historic = node("historic", None);
    historic.entity_ids = vec![doc.metadata.id.clone()];
    p.nodes.push(historic);
    p.relationships.push(Relationship {id:"r".into(),universe_id:"u".into(),book_id:None,source_id:doc.metadata.id.clone(),target_id:doc.metadata.id.clone(),label:"Related to".into(),description:String::new(),directed:true,context_node_id:None,archived:false});
    let saved = save_impl(&s, 0, p).unwrap();
    assert!(delete_document_impl(&s, doc.metadata.id.clone()).unwrap_err().contains("active relationships first"));
    assert_eq!(get_document_impl(&s, doc.metadata.id.clone()).unwrap().content, "Unchanged writing");
    let mut next = saved.plan.unwrap();
    next.relationships[0].archived = true;
    let retained_nodes = next.nodes.clone();
    save_impl(&s, 1, next).unwrap();
    delete_document_impl(&s, doc.metadata.id.clone()).unwrap();
    let after = get_impl(&s).unwrap().plan.unwrap();
    assert_eq!(after.nodes, retained_nodes);
    assert_eq!(after.entities[0].id, doc.metadata.id);
    let backups:Vec<_> = fs::read_dir(s.storage.get_root().join("Backups")).unwrap().collect();
    assert_eq!(backups.len(), 1);
    assert!(fs::read_to_string(backups[0].as_ref().unwrap().path()).unwrap().contains("Unchanged writing"));
}

#[test]
fn relationship_unlink_preserves_historical_records_and_survives_restart() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let mut p = plan();
    p.nodes.push(node("historic", None));
    p.relationships.push(Relationship {id:"membership".into(),universe_id:"u".into(),book_id:None,source_id:"entity".into(),target_id:"entity".into(),label:"Member of".into(),description:"Original record".into(),directed:true,context_node_id:None,archived:false});
    p.nodes[0].relationship_changes.push(RelationshipChange {relationship_id:"membership".into(),label:Some("Former member".into()),note:"Retain history".into()});
    let saved = save_impl(&s, 0, p).unwrap();
    let mut next = saved.plan.unwrap();
    let original_nodes = next.nodes.clone();
    next.relationships[0].archived = true;
    let archived = save_impl(&s, 1, next).unwrap();
    drop(s);
    let reopened = state(dir.path());
    assert_eq!(get_impl(&reopened).unwrap(), archived);
    let mut undo = archived.plan.unwrap();
    assert_eq!(undo.nodes, original_nodes);
    undo.relationships[0].archived = false;
    let restored = save_impl(&reopened, 2, undo).unwrap().plan.unwrap();
    assert_eq!(restored.nodes, original_nodes);
    assert!(!restored.relationships[0].archived);
}
fn node(id: &str, book: Option<&str>) -> Node {
    serde_json::from_value(serde_json::json!({"id":id,"universe_id":"u","book_id":book,"position":0,"title":"Same title","description":"  Ending first\n\n世界\n","era":"","status":"planned","questions":"How did we get here?","entity_ids":["entity"],"changes":[],"relationship_changes":[],"linked_event_id":null,"origin_node_id":null,"archived":false,"created_at":"2026-10-19T00:00:00Z","updated_at":"2026-10-19T00:00:00Z"})).unwrap()
}

#[test]
fn opening_existing_notebook_does_not_migrate_or_write_anything() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    assert!(get_impl(&s).unwrap().plan.is_none());
    assert_eq!(
        fs::read_dir(s.storage.get_root().join("Lorebooks"))
            .unwrap()
            .count(),
        0
    );
}
#[test]
fn canonical_roundtrip_preserves_sparse_nodes_relationships_and_identity() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let mut p = plan();
    p.nodes = vec![node("a", None), node("z", Some("b"))];
    p.nodes[0].changes.push(Change {
        id: "change".into(),
        entity_id: "entity".into(),
        property_key: "political control".into(),
        previous_value: None,
        new_value: Some("Kingdom B".into()),
        note: "Cause unresolved".into(),
    });
    p.relationships.push(Relationship {
        id: "r".into(),
        universe_id: "u".into(),
        book_id: None,
        source_id: "entity".into(),
        target_id: "entity".into(),
        label: "Rules".into(),
        description: "self rule".into(),
        directed: false,
        context_node_id: Some("a".into()),
        archived: false,
    });
    let saved = save_impl(&s, 0, p).unwrap();
    let id = saved.document_id.clone();
    assert_eq!(get_impl(&s).unwrap(), saved);
    drop(s);
    let reopened = state(dir.path());
    reindex_library_impl(&reopened).unwrap();
    assert_eq!(get_impl(&reopened).unwrap().document_id, id);
    assert_eq!(
        get_impl(&reopened).unwrap().plan.unwrap().nodes[0].changes[0]
            .new_value
            .as_deref(),
        Some("Kingdom B")
    );
}
#[test]
fn stale_edits_fail_without_changes_and_lost_acknowledgement_is_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let p = plan();
    let first = save_impl(&s, 0, p.clone()).unwrap();
    assert_eq!(save_impl(&s, 0, p).unwrap(), first);
    let mut stale = first.plan.clone().unwrap();
    stale.universes[0].name = "stale".into();
    assert!(save_impl(&s, 0, stale)
        .unwrap_err()
        .contains("changed on disk"));
    assert_eq!(get_impl(&s).unwrap(), first);
}
#[test]
fn malformed_duplicate_ids_scopes_and_versions_are_rejected_without_reset() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let original = save_impl(&s, 0, plan()).unwrap();
    for mutation in 0..5 {
        let mut p = original.plan.clone().unwrap();
        match mutation {
            0 => p.version = 99,
            1 => p.books[0].id = "u".into(),
            2 => p.books[0].universe_id = "missing".into(),
            3 => p.books[0].continuity = "canon-by-default".into(),
            _ => {
                let mut n = node("n", None);
                n.status = "invalid".into();
                p.nodes.push(n);
            }
        }
        assert!(save_impl(&s, 1, p).is_err());
        assert_eq!(get_impl(&s).unwrap(), original);
    }
}
#[test]
fn metadata_only_updates_keep_catalog_body_unknown_fields_and_lore_bytes() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let entity = create_document_impl(
        &s,
        "lorebook".into(),
        "King".into(),
        None,
        Some("Do not change manuscript\n".into()),
        Some(
            r#"{"universe":"Old Label","book":"I","chapter":"III","custom":{"keep":true}}"#.into(),
        ),
        None,
        None,
    )
    .unwrap();
    let entity_before =
        fs::read(s.storage.get_root().join(&entity.metadata.relative_path)).unwrap();
    let saved = save_impl(&s, 0, plan()).unwrap();
    let id = saved.document_id.unwrap();
    let mut catalog = get_document_impl(&s, id.clone()).unwrap();
    let body = catalog.content.clone();
    let mut metadata: serde_json::Value =
        serde_json::from_str(catalog.metadata.metadata_json.as_ref().unwrap()).unwrap();
    metadata["other_extension"] = serde_json::json!({"keep":42});
    catalog.metadata.metadata_json = Some(metadata.to_string());
    s.storage
        .write_document_atomic(&catalog.metadata.relative_path, &catalog)
        .unwrap();
    let mut p = get_impl(&s).unwrap().plan.unwrap();
    p.books[0].continuity = "alternate".into();
    save_impl(&s, 1, p).unwrap();
    let after = s
        .storage
        .read_document(&catalog.metadata.relative_path)
        .unwrap();
    assert_eq!(after.content, body);
    assert!(after
        .metadata
        .metadata_json
        .unwrap()
        .contains("other_extension"));
    assert_eq!(
        fs::read(s.storage.get_root().join(&entity.metadata.relative_path)).unwrap(),
        entity_before
    );
}
#[test]
fn activation_barrier_and_manuscript_autosave_cannot_overwrite_planning() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let saved = save_impl(&s, 0, plan()).unwrap();
    assert!(save_document_impl(
        &s,
        saved.document_id.unwrap(),
        "overwrite".into(),
        None,
        None,
        Some("{}".into())
    )
    .unwrap_err()
    .contains("Web of Thought"));
    s.db.lock().unwrap().freeze_writes();
    assert!(save_impl(&s, 1, saved.plan.unwrap())
        .unwrap_err()
        .contains("Restart"));
}
#[test]
fn promotion_requires_canonical_source_and_keeps_book_node() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let mut p = plan();
    let mut book = node("book-node", Some("b"));
    book.linked_event_id = Some("event".into());
    let mut event = node("event", None);
    event.origin_node_id = Some("book-node".into());
    p.nodes = vec![book, event];
    assert!(save_impl(&s, 0, p.clone())
        .unwrap_err()
        .contains("Canonical"));
    p.books[0].continuity = "canonical".into();
    let saved = save_impl(&s, 0, p).unwrap();
    let mut alternate = saved.plan.unwrap();
    alternate.books[0].continuity = "alternate".into();
    let after = save_impl(&s, 1, alternate).unwrap();
    assert_eq!(after.plan.unwrap().nodes.len(), 2);
}
#[test]
fn archived_and_missing_references_are_retained_without_cross_scope_links() {
    let mut p = plan();
    let mut n = node("n", Some("b"));
    n.linked_event_id = Some("missing-event".into());
    n.relationship_changes.push(RelationshipChange {
        relationship_id: "archived-relationship".into(),
        label: None,
        note: "unknown".into(),
    });
    p.nodes.push(n);
    validate(&p).unwrap();
    let mut wrong = node("other-book-event", Some("b"));
    wrong.archived = true;
    p.nodes.push(wrong);
    p.nodes[0].linked_event_id = Some("other-book-event".into());
    assert!(validate(&p).is_err());
}
#[test]
fn planning_survives_verified_vault_restore_and_notebook_relocation() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let mut p = plan();
    p.universes[0].archived = true;
    p.nodes = vec![node("ending", Some("b"))];
    let saved = save_impl(&s, 0, p).unwrap();
    let backup = vault::create_backup(&s, &dir.path().join("Vault")).unwrap();
    let restore = vault::restore_separate(
        Path::new(&backup.path),
        &backup.archive_sha256,
        dir.path(),
        s.storage.get_root(),
    )
    .unwrap();
    let root = std::path::PathBuf::from(restore.restored_path);
    let relocated = dir.path().join("MovedNotebook");
    fs::rename(&root, &relocated).unwrap();
    let recovered = AppState {
        storage: StorageManager::new(&relocated),
        db: Mutex::new(Database::open(relocated.join(".vault-recovery/metadata.db")).unwrap()),
        db_path: relocated.join(".vault-recovery/metadata.db"),
    };
    assert_eq!(get_impl(&recovered).unwrap(), saved);
}
#[test]
fn corrupt_planning_metadata_is_not_reset_and_cannot_be_backed_up_as_valid() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let saved = save_impl(&s, 0, plan()).unwrap();
    let mut doc = get_document_impl(&s, saved.document_id.unwrap()).unwrap();
    doc.metadata.metadata_json = Some(r#"{"_web_of_thought":{"version":99}}"#.into());
    s.storage
        .write_document_atomic(&doc.metadata.relative_path, &doc)
        .unwrap();
    assert!(get_impl(&s).is_err());
    assert!(save_impl(&s, 1, plan()).is_err());
    assert!(vault::create_backup(&s, &dir.path().join("Vault")).is_err());
    fs::write(
        s.storage.get_root().join(&doc.metadata.relative_path),
        "---json\n{\"_web_of_thought\":",
    )
    .unwrap();
    assert!(get_impl(&s).unwrap_err().contains("Unterminated"));
    doc.metadata.metadata_json = Some("{}".into());
    s.storage
        .write_document_atomic(&doc.metadata.relative_path, &doc)
        .unwrap();
    assert!(get_impl(&s).unwrap_err().contains("missing its namespace"));
}
#[test]
fn duplicate_catalogs_block_edits_instead_of_guessing_a_winner() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let saved = save_impl(&s, 0, plan()).unwrap();
    let doc = get_document_impl(&s, saved.document_id.unwrap()).unwrap();
    create_document_impl(
        &s,
        "lorebook".into(),
        "Duplicate".into(),
        None,
        None,
        doc.metadata.metadata_json,
        None,
        None,
    )
    .unwrap();
    assert!(get_impl(&s).unwrap_err().contains("Multiple"));
    assert!(save_impl(&s, 1, plan()).is_err());
}
#[test]
fn index_failure_restores_canonical_catalog_then_retry_succeeds() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let saved = save_impl(&s, 0, plan()).unwrap();
    let original = get_impl(&s).unwrap();
    let connection = rusqlite::Connection::open(&s.db_path).unwrap();
    connection.execute_batch("CREATE TRIGGER fail_thought BEFORE UPDATE ON documents BEGIN SELECT RAISE(ABORT, 'injected'); END;").unwrap();
    let mut changed = saved.plan.unwrap();
    changed.universes[0].name = "New name".into();
    assert!(save_impl(&s, 1, changed.clone()).is_err());
    assert_eq!(get_impl(&s).unwrap(), original);
    connection
        .execute_batch("DROP TRIGGER fail_thought;")
        .unwrap();
    assert!(save_impl(&s, 1, changed).is_ok());
}

#[test]
fn fresh_notebook_first_universe_creation_and_persistence() {
    let dir = tempfile::tempdir().unwrap();
    // Fresh notebook: no documents, no Lorebooks dir
    let root = dir.path().join("FreshLibrary");
    let storage = StorageManager::new(&root);
    // Initialize without pre-creating Lorebooks folder
    std::fs::create_dir_all(&root).unwrap();
    let s = AppState {
        storage,
        db: Mutex::new(Database::open(dir.path().join("index.db")).unwrap()),
        db_path: dir.path().join("index.db"),
    };

    // 1. Initial get_impl on fresh notebook returns None plan without error
    let initial = get_impl(&s).unwrap();
    assert!(initial.plan.is_none());
    assert!(initial.document_id.is_none());

    // 2. Save first universe into brand new catalog
    let first_plan = Plan {
        version: 1,
        revision: 0,
        universes: vec![Universe {
            id: "uni-shadow-123".into(),
            name: "Shadow".into(),
            description: Some("A mysterious realm".into()),
            archived: false,
        }],
        books: vec![],
        branches: vec![],
        entities: vec![],
        nodes: vec![],
        relationships: vec![],
    };

    let saved = save_impl(&s, 0, first_plan).unwrap();
    assert!(saved.document_id.is_some());
    let saved_plan = saved.plan.unwrap();
    assert_eq!(saved_plan.revision, 1);
    assert_eq!(saved_plan.universes.len(), 1);
    assert_eq!(saved_plan.universes[0].name, "Shadow");
    assert_eq!(saved_plan.universes[0].id, "uni-shadow-123");

    // 3. Subsequent get_impl finds catalog and returns persisted Universe
    let reloaded = get_impl(&s).unwrap();
    assert_eq!(reloaded.document_id, saved.document_id);
    let reloaded_plan = reloaded.plan.unwrap();
    assert_eq!(reloaded_plan.revision, 1);
    assert_eq!(reloaded_plan.universes.len(), 1);
    assert_eq!(reloaded_plan.universes[0].name, "Shadow");
    assert_eq!(reloaded_plan.universes[0].description, Some("A mysterious realm".into()));
}

#[test]
fn test_book_archived_roundtrip_and_serialization() {
    let book_active = Book {
        id: "b1".into(),
        universe_id: "u1".into(),
        name: "Active Book".into(),
        continuity: "canonical".into(),
        branch_id: None,
        description: None,
        archived: false,
    };
    let json_active = serde_json::to_string(&book_active).unwrap();
    // archived: false should be omitted via skip_serializing_if
    assert!(!json_active.contains("archived"));

    let book_archived = Book {
        id: "b2".into(),
        universe_id: "u1".into(),
        name: "Archived Book".into(),
        continuity: "standalone".into(),
        branch_id: None,
        description: Some("Old lore".into()),
        archived: true,
    };
    let json_archived = serde_json::to_string(&book_archived).unwrap();
    assert!(json_archived.contains(r#""archived":true"#));

    // Deserializing JSON without archived field defaults to false
    let deserialized_active: Book = serde_json::from_str(&json_active).unwrap();
    assert!(!deserialized_active.archived);

    // Deserializing JSON with archived field
    let deserialized_archived: Book = serde_json::from_str(&json_archived).unwrap();
    assert!(deserialized_archived.archived);
}

#[test]
fn test_milestone_state_changes_roundtrip_and_validation() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());
    let mut p = plan();

    // Add character and nation entities
    p.entities.push(Entity { id: "char-1".into(), universe_id: "u".into() });
    p.entities.push(Entity { id: "nation-1".into(), universe_id: "u".into() });

    // Milestone 1: Era of Creation
    let mut node1 = node("m1", None);
    node1.title = "Era of Creation".into();
    node1.position = 0;
    node1.changes.push(Change {
        id: "c1".into(),
        entity_id: "char-1".into(),
        property_key: "status".into(),
        previous_value: None,
        new_value: Some("alive".into()),
        note: "Born in the highlands".into(),
    });
    node1.changes.push(Change {
        id: "c2".into(),
        entity_id: "nation-1".into(),
        property_key: "status".into(),
        previous_value: None,
        new_value: Some("active".into()),
        note: "Kingdom founded".into(),
    });

    // Milestone 2: The Cataclysm
    let mut node2 = node("m2", None);
    node2.title = "The Cataclysm".into();
    node2.position = 1;
    node2.changes.push(Change {
        id: "c3".into(),
        entity_id: "char-1".into(),
        property_key: "status".into(),
        previous_value: Some("alive".into()),
        new_value: Some("deceased".into()),
        note: "Fell defending the gate".into(),
    });
    node2.changes.push(Change {
        id: "c4".into(),
        entity_id: "nation-1".into(),
        property_key: "status".into(),
        previous_value: Some("active".into()),
        new_value: Some("collapsed".into()),
        note: "Capital razed".into(),
    });

    // Milestone 3: The Aftermath (custom status and unknown state)
    let mut node3 = node("m3", None);
    node3.title = "The Aftermath".into();
    node3.position = 2;
    node3.changes.push(Change {
        id: "c5".into(),
        entity_id: "char-1".into(),
        property_key: "status".into(),
        previous_value: Some("deceased".into()),
        new_value: Some("ascended_to_starlight".into()),
        note: "Spiritual resurrection myth".into(),
    });
    node3.changes.push(Change {
        id: "c6".into(),
        entity_id: "nation-1".into(),
        property_key: "status".into(),
        previous_value: Some("collapsed".into()),
        new_value: None, // Explicitly unknown / unrecorded in this dark age
        note: "Lost to historical fog".into(),
    });

    p.nodes = vec![node1, node2, node3];

    // Validate plan succeeds
    validate(&p).unwrap();

    // Save and reload from disk
    let _saved = save_impl(&s, 0, p.clone()).unwrap();
    let reloaded = get_impl(&s).unwrap().plan.unwrap();
    assert_eq!(reloaded.nodes.len(), 3);
    assert_eq!(reloaded.nodes[0].changes.len(), 2);
    assert_eq!(reloaded.nodes[1].changes.len(), 2);
    assert_eq!(reloaded.nodes[2].changes.len(), 2);

    // Verify Milestone 1 preserved alive and active
    assert_eq!(reloaded.nodes[0].changes[0].new_value.as_deref(), Some("alive"));
    assert_eq!(reloaded.nodes[0].changes[1].new_value.as_deref(), Some("active"));

    // Verify Milestone 2 deceased and collapsed
    assert_eq!(reloaded.nodes[1].changes[0].new_value.as_deref(), Some("deceased"));
    assert_eq!(reloaded.nodes[1].changes[1].new_value.as_deref(), Some("collapsed"));

    // Verify Milestone 3 custom status and null unknown
    assert_eq!(reloaded.nodes[2].changes[0].new_value.as_deref(), Some("ascended_to_starlight"));
    assert_eq!(reloaded.nodes[2].changes[1].new_value, None);

    // Verify duplicate (entity_id, property_key) on same node is rejected
    let mut invalid_p = p.clone();
    invalid_p.nodes[0].changes.push(Change {
        id: "c-dup".into(),
        entity_id: "char-1".into(),
        property_key: "status".into(),
        previous_value: None,
        new_value: Some("missing".into()),
        note: "Duplicate conflicting change".into(),
    });
    assert!(validate(&invalid_p).is_err());

    // Verify entity from another universe is rejected
    let mut cross_univ_p = p.clone();
    cross_univ_p.universes.push(Universe { id: "u2".into(), name: "Other Universe".into(), description: None, archived: false });
    cross_univ_p.entities.push(Entity { id: "foreign-entity".into(), universe_id: "u2".into() });
    cross_univ_p.nodes[0].changes.push(Change {
        id: "c-cross".into(),
        entity_id: "foreign-entity".into(),
        property_key: "status".into(),
        previous_value: None,
        new_value: Some("active".into()),
        note: "Cross universe leakage attempt".into(),
    });
    assert!(validate(&cross_univ_p).is_err());
}

#[test]
fn test_phase_w3_alternate_continuity_branches_and_validation() {
    let dir = tempfile::tempdir().unwrap();
    let s = state(dir.path());

    // 1. Base plan with canonical milestone M1
    let mut p = plan();
    p.nodes.push(node("m1-founding", None));
    let saved = save_impl(&s, 0, p.clone()).unwrap();
    assert_eq!(saved.plan.as_ref().unwrap().branches.len(), 0);

    // 2. Add Branch 1 diverging from M1
    let branch1 = Branch {
        id: "branch-broken-sky".into(),
        universe_id: "u".into(),
        name: "The Broken Sky".into(),
        description: Some("Timeline where the orbital elevator collapsed early".into()),
        divergence_node_id: "m1-founding".into(),
        parent_continuity_id: None,
        archived: false,
        created_at: "2026-10-27T10:00:00Z".into(),
        updated_at: "2026-10-27T10:00:00Z".into(),
    };
    let mut p2 = saved.plan.unwrap();
    p2.branches.push(branch1);

    // Add alternate milestone BM1 on branch1
    let mut bm1 = node("bm1-collapse", None);
    bm1.branch_id = Some("branch-broken-sky".into());
    p2.nodes.push(bm1);

    let saved2 = save_impl(&s, 1, p2).unwrap();
    let plan2 = saved2.plan.unwrap();
    assert_eq!(plan2.branches.len(), 1);
    assert_eq!(plan2.branches[0].name, "The Broken Sky");
    assert_eq!(plan2.nodes[1].branch_id, Some("branch-broken-sky".into()));

    // 3. Test nested branch: Branch 2 diverging from BM1 on Branch 1
    let branch2 = Branch {
        id: "branch-deep-shelter".into(),
        universe_id: "u".into(),
        name: "Deep Shelter Protocol".into(),
        description: None,
        divergence_node_id: "bm1-collapse".into(),
        parent_continuity_id: Some("branch-broken-sky".into()),
        archived: false,
        created_at: "2026-10-27T11:00:00Z".into(),
        updated_at: "2026-10-27T11:00:00Z".into(),
    };
    let mut p3 = plan2.clone();
    p3.branches.push(branch2);
    assert!(validate(&p3).is_ok());

    // 4. Test validation: invalid divergence milestone ID
    let mut invalid_div = plan2.clone();
    invalid_div.branches[0].divergence_node_id = "non-existent-milestone".into();
    assert!(validate(&invalid_div).is_err());

    // 5. Test validation: divergence milestone belongs to a Book (rejected)
    let mut book_div = plan2.clone();
    book_div.nodes[0].book_id = Some("b".into());
    assert!(validate(&book_div).is_err());

    // 6. Test validation: cyclic branch ancestry (Branch A parent B, Branch B parent A)
    let mut cycle_p = plan2.clone();
    cycle_p.branches.push(Branch {
        id: "b-alpha".into(),
        universe_id: "u".into(),
        name: "Alpha".into(),
        description: None,
        divergence_node_id: "m1-founding".into(),
        parent_continuity_id: Some("b-beta".into()),
        archived: false,
        created_at: "2026-10-27T10:00:00Z".into(),
        updated_at: "2026-10-27T10:00:00Z".into(),
    });
    cycle_p.branches.push(Branch {
        id: "b-beta".into(),
        universe_id: "u".into(),
        name: "Beta".into(),
        description: None,
        divergence_node_id: "m1-founding".into(),
        parent_continuity_id: Some("b-alpha".into()),
        archived: false,
        created_at: "2026-10-27T10:00:00Z".into(),
        updated_at: "2026-10-27T10:00:00Z".into(),
    });
    assert!(validate(&cycle_p).unwrap_err().contains("Cyclic branch ancestry"));

    // 7. Test validation: cross-universe divergence is rejected
    let mut cross_univ = plan2.clone();
    cross_univ.universes.push(Universe { id: "u2".into(), name: "Other Universe".into(), description: None, archived: false });
    cross_univ.branches[0].universe_id = "u2".into();
    assert!(validate(&cross_univ).is_err());

    // 8. Test validation: Book optional branch association
    let mut book_branch = plan2.clone();
    book_branch.books[0].branch_id = Some("branch-broken-sky".into());
    assert!(validate(&book_branch).is_ok());

    let mut invalid_book_branch = plan2.clone();
    invalid_book_branch.books[0].branch_id = Some("non-existent-branch".into());
    assert!(validate(&invalid_book_branch).is_err());
}

#[test]
fn overview_and_milestone_chronicle_survive_canonical_save_reload_without_schema_changes() {
    let dir = tempfile::tempdir().unwrap(); let s=state(dir.path()); let mut p=plan();
    p.universes[0].description=None;
    p.nodes.push(node("history",None));
    let saved=save_impl(&s,0,p).unwrap(); let mut p=saved.plan.unwrap();
    p.universes[0].description=Some("A premise.\n\nAn extended world introduction.".into());
    p.nodes[0].description="An event summary.\n\nConsequences: A disputed succession.".into();
    let changes=p.nodes[0].changes.clone();
    save_impl(&s,p.revision,p).unwrap();
    let reloaded=get_impl(&s).unwrap().plan.unwrap();
    assert_eq!(reloaded.universes[0].description.as_deref(),Some("A premise.\n\nAn extended world introduction."));
    assert_eq!(reloaded.nodes[0].description,"An event summary.\n\nConsequences: A disputed succession.");
    assert_eq!(reloaded.nodes[0].changes,changes);
    assert!(reloaded.nodes[0].book_id.is_none());
}
