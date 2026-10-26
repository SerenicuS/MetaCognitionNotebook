use meta_cognition_notebook_lib::{
    commands::*, db::Database, organization::*, storage::StorageManager,
};
use serde_json::{json, Value};
use std::sync::Mutex;

fn open_state(root: &std::path::Path) -> AppState {
    let storage = StorageManager::new(root.join("library"));
    storage.initialize().unwrap();
    let db_path = root.join("metadata.db");
    AppState {
        db: Mutex::new(Database::open(&db_path).unwrap()),
        storage,
        db_path,
    }
}
fn create(
    state: &AppState,
    studio: &str,
    tags: Vec<String>,
) -> meta_cognition_notebook_lib::models::DocumentDetail {
    create_document_impl(state, studio.into(), format!("Fixture {}", studio), Some("parent-id".into()),
        Some("  Opening line\n\n<!-- premise -->\n思想 🧠\n\nTrailing line.  \n".into()),
        Some(json!({"chapter":"II","custom":{"keep":true},"composition_mode":"structured","attributes":[{"key":"keep","value":"me"}]}).to_string()), Some(tags), None).unwrap()
}

#[test]
fn organization_tags_favorites_and_history_survive_restart_and_reindex_across_studios() {
    let dir = tempfile::tempdir().unwrap();
    let state = open_state(dir.path());
    let mut originals = vec![];
    for studio in ["poetry", "philosophy", "lorebook"] {
        let doc = create(&state, studio, vec!["old".into()]);
        let updated = update_organization_impl(
            &state,
            doc.metadata.id.clone(),
            OrganizationPatch {
                tags: Some(vec![" old ".into(), "new".into(), "new".into(), "".into()]),
                favorite: Some(true),
                opened: Some(true),
            },
        )
        .unwrap();
        assert_eq!(updated.tags, vec!["old", "new"]);
        assert_eq!(updated.updated_at, doc.metadata.updated_at);
        assert_eq!(updated.created_at, doc.metadata.created_at);
        assert_eq!(updated.relative_path, doc.metadata.relative_path);
        let metadata: Value =
            serde_json::from_str(updated.metadata_json.as_ref().unwrap()).unwrap();
        assert_eq!(metadata["_workshop"]["favorite"], true);
        assert!(metadata["_workshop"]["last_opened_at"].as_str().is_some());
        assert_eq!(metadata["custom"]["keep"], true);
        assert_eq!(metadata["attributes"][0]["key"], "keep");
        originals.push((doc, updated.metadata_json));
    }
    drop(state);
    let restarted = open_state(dir.path());
    assert_eq!(
        reindex_library_impl(&restarted).unwrap().documents_indexed,
        3
    );
    for (original, metadata) in originals {
        let loaded = get_document_impl(&restarted, original.metadata.id.clone()).unwrap();
        assert_eq!(loaded.content, original.content);
        assert_eq!(loaded.metadata.metadata_json, metadata);
        assert_eq!(loaded.metadata.tags, vec!["old", "new"]); // canonical assignment order
        assert_eq!(loaded.metadata.parent_id, original.metadata.parent_id);
        let index = list_documents_impl(&restarted, None, None)
            .unwrap()
            .into_iter()
            .find(|doc| doc.id == original.metadata.id)
            .unwrap();
        assert_eq!(index.metadata_json, loaded.metadata.metadata_json);
        assert_eq!(index.tags, vec!["new", "old"]); // the index presents tags alphabetically
    }
}

#[test]
fn tag_rename_merge_and_delete_update_every_canonical_file_and_index() {
    let dir = tempfile::tempdir().unwrap();
    let state = open_state(dir.path());
    let docs: Vec<_> = ["poetry", "philosophy", "lorebook"]
        .iter()
        .map(|studio| create(&state, studio, vec!["old".into(), "existing".into()]))
        .collect();
    let report = manage_tag_impl(&state, "old".into(), Some(" existing ".into()), None).unwrap();
    assert!(report.errors.is_empty());
    assert_eq!(report.updated.len(), 3);
    for doc in &docs {
        let canonical = state
            .storage
            .read_document(&doc.metadata.relative_path)
            .unwrap();
        assert_eq!(canonical.content, doc.content);
        assert_eq!(canonical.metadata.tags, vec!["existing"]);
        assert_eq!(canonical.metadata.metadata_json, doc.metadata.metadata_json);
    }
    assert_eq!(list_tags_impl(&state, None).unwrap(), vec!["existing"]);
    let report = manage_tag_impl(&state, "existing".into(), None, None).unwrap();
    assert_eq!(report.updated.len(), 3);
    assert!(list_tags_impl(&state, None).unwrap().is_empty());
    for doc in docs {
        assert!(get_document_impl(&state, doc.metadata.id)
            .unwrap()
            .metadata
            .tags
            .is_empty());
    }
    assert!(manage_tag_impl(&state, "existing".into(), Some(" ".into()), None).is_err());
}

#[test]
fn stale_studio_autosaves_cannot_remove_favorite_or_open_history_or_tags() {
    let dir = tempfile::tempdir().unwrap();
    let state = open_state(dir.path());
    let doc = create(&state, "philosophy", vec!["old".into()]);
    let updated = update_organization_impl(
        &state,
        doc.metadata.id.clone(),
        OrganizationPatch {
            tags: Some(vec!["new".into()]),
            favorite: Some(true),
            opened: Some(true),
        },
    )
    .unwrap();
    let expected: Value = serde_json::from_str(updated.metadata_json.as_ref().unwrap()).unwrap();
    save_document_impl(
        &state,
        doc.metadata.id.clone(),
        "Unsaved final keystrokes".into(),
        None,
        None,
        doc.metadata.metadata_json,
    )
    .unwrap();
    let loaded = get_document_impl(&state, doc.metadata.id.clone()).unwrap();
    assert_eq!(loaded.content, "Unsaved final keystrokes");
    assert_eq!(loaded.metadata.tags, vec!["new"]);
    let actual: Value =
        serde_json::from_str(loaded.metadata.metadata_json.as_ref().unwrap()).unwrap();
    assert_eq!(actual["_workshop"], expected["_workshop"]);
    update_organization_impl(
        &state,
        doc.metadata.id.clone(),
        OrganizationPatch {
            favorite: Some(false),
            ..Default::default()
        },
    )
    .unwrap();
    let read = get_document_impl(&state, doc.metadata.id).unwrap();
    let metadata: Value =
        serde_json::from_str(read.metadata.metadata_json.as_ref().unwrap()).unwrap();
    assert_eq!(metadata["_workshop"]["favorite"], false);
    assert_eq!(
        metadata["_workshop"]["last_opened_at"],
        expected["_workshop"]["last_opened_at"]
    );
}

#[test]
fn metadata_only_changes_preserve_external_frontmatter_fields_and_exact_body() {
    let dir = tempfile::tempdir().unwrap();
    let state = open_state(dir.path());
    let doc = create(&state, "poetry", vec![]);
    let path = state
        .storage
        .resolve_safe_path(&doc.metadata.relative_path)
        .unwrap();
    let raw = std::fs::read_to_string(&path).unwrap();
    let rest = raw.strip_prefix("---json\n").unwrap();
    let (json, body) = rest.split_once("\n---\n").unwrap();
    let mut frontmatter: Value = serde_json::from_str(json).unwrap();
    frontmatter["external_custom"] = json!({"preserve":"this"});
    std::fs::write(&path, format!("---json\n{}\n---\n{}", frontmatter, body)).unwrap();
    update_organization_impl(
        &state,
        doc.metadata.id,
        OrganizationPatch {
            tags: Some(vec!["tag".into()]),
            ..Default::default()
        },
    )
    .unwrap();
    let raw = std::fs::read_to_string(&path).unwrap();
    let (json, saved_body) = raw
        .strip_prefix("---json\n")
        .unwrap()
        .split_once("\n---\n")
        .unwrap();
    assert_eq!(saved_body, body);
    assert_eq!(
        serde_json::from_str::<Value>(json).unwrap()["external_custom"]["preserve"],
        "this"
    );
}

#[test]
fn failed_index_update_restores_original_file_bytes_and_keeps_original_index() {
    let dir = tempfile::tempdir().unwrap();
    let state = open_state(dir.path());
    let doc = create(&state, "poetry", vec!["before".into()]);
    let path = state
        .storage
        .resolve_safe_path(&doc.metadata.relative_path)
        .unwrap();
    let original = std::fs::read(&path).unwrap();
    let connection = rusqlite::Connection::open(&state.db_path).unwrap();
    connection.execute_batch("CREATE TRIGGER reject_workshop_update BEFORE INSERT ON documents BEGIN SELECT RAISE(ABORT, 'injected index failure'); END;").unwrap();
    let error = update_organization_impl(
        &state,
        doc.metadata.id.clone(),
        OrganizationPatch {
            tags: Some(vec!["after".into()]),
            favorite: Some(true),
            ..Default::default()
        },
    )
    .unwrap_err();
    assert!(error.contains("original file restored"));
    assert_eq!(std::fs::read(path).unwrap(), original);
    let db = state.db.lock().unwrap();
    let indexed = db.get_document_metadata(&doc.metadata.id).unwrap().unwrap();
    assert_eq!(indexed.tags, vec!["before"]);
    assert_eq!(indexed.metadata_json, doc.metadata.metadata_json);
}

#[test]
fn global_tag_failures_are_explicit_and_retries_finish_remaining_documents() {
    let dir = tempfile::tempdir().unwrap();
    let state = open_state(dir.path());
    let one = create(&state, "poetry", vec!["old".into()]);
    let two = create(&state, "lorebook", vec!["old".into()]);
    let path = state
        .storage
        .resolve_safe_path(&two.metadata.relative_path)
        .unwrap();
    let original = std::fs::read(&path).unwrap();
    std::fs::remove_file(&path).unwrap(); // disposable temporary fixture only
    let partial = manage_tag_impl(&state, "old".into(), Some("renamed".into()), None).unwrap();
    assert_eq!(partial.updated.len(), 1);
    assert_eq!(partial.errors.len(), 1);
    assert_eq!(partial.updated[0].id, one.metadata.id);
    std::fs::write(&path, original).unwrap();
    let retry = manage_tag_impl(&state, "old".into(), Some("renamed".into()), None).unwrap();
    assert!(retry.errors.is_empty());
    assert_eq!(retry.updated.len(), 1);
    assert_eq!(retry.updated[0].id, two.metadata.id);
    assert_eq!(list_tags_impl(&state, None).unwrap(), vec!["renamed"]);
}

#[test]
fn search_and_read_do_not_record_opens_and_unicode_snippets_do_not_panic() {
    let dir = tempfile::tempdir().unwrap();
    let state = open_state(dir.path());
    let doc = create(&state, "lorebook", vec![]);
    let content = format!("{} moon {}", "思想🧠".repeat(20), "思想🧠".repeat(20));
    save_document_impl(&state, doc.metadata.id.clone(), content, None, None, None).unwrap();
    let before = std::fs::read(
        state
            .storage
            .resolve_safe_path(&doc.metadata.relative_path)
            .unwrap(),
    )
    .unwrap();
    let result = search_documents_impl(&state, "moon".into(), None, None).unwrap();
    assert_eq!(result.len(), 1);
    get_document_impl(&state, doc.metadata.id).unwrap();
    assert_eq!(
        std::fs::read(
            state
                .storage
                .resolve_safe_path(&doc.metadata.relative_path)
                .unwrap()
        )
        .unwrap(),
        before
    );
}

#[test]
fn existing_namespace_collision_fails_without_changing_content_or_metadata() {
    let dir = tempfile::tempdir().unwrap();
    let state = open_state(dir.path());
    let doc = create_document_impl(
        &state,
        "poetry".into(),
        "Legacy".into(),
        None,
        Some("body".into()),
        Some(r#"{"_workshop":"external value"}"#.into()),
        None,
        None,
    )
    .unwrap();
    let path = state
        .storage
        .resolve_safe_path(&doc.metadata.relative_path)
        .unwrap();
    let before = std::fs::read(&path).unwrap();
    assert!(update_organization_impl(
        &state,
        doc.metadata.id,
        OrganizationPatch {
            favorite: Some(true),
            ..Default::default()
        }
    )
    .is_err());
    assert_eq!(std::fs::read(path).unwrap(), before);
}

#[test]
fn empty_and_raw_markdown_legacy_documents_keep_content_and_stable_identity() {
    let dir = tempfile::tempdir().unwrap();
    let state = open_state(dir.path());
    let empty = create_document_impl(
        &state,
        "philosophy".into(),
        "Empty".into(),
        None,
        None,
        None,
        None,
        None,
    )
    .unwrap();
    update_organization_impl(
        &state,
        empty.metadata.id.clone(),
        OrganizationPatch {
            favorite: Some(true),
            tags: Some(vec!["empty".into()]),
            ..Default::default()
        },
    )
    .unwrap();
    let loaded = get_document_impl(&state, empty.metadata.id).unwrap();
    assert_eq!(loaded.content, "");
    assert_eq!(
        serde_json::from_str::<Value>(loaded.metadata.metadata_json.as_ref().unwrap()).unwrap()
            ["composition_mode"],
        "freeform"
    );
    let raw = "  Imported words\n\n思想 🧠\n";
    std::fs::write(state.storage.get_root().join("Poetry/Imported.md"), raw).unwrap();
    reindex_library_impl(&state).unwrap();
    let indexed = list_documents_impl(&state, None, None)
        .unwrap()
        .into_iter()
        .find(|doc| doc.title == "Imported")
        .unwrap();
    assert_eq!(
        get_document_impl(&state, indexed.id.clone())
            .unwrap()
            .metadata
            .id,
        indexed.id
    );
    update_organization_impl(
        &state,
        indexed.id.clone(),
        OrganizationPatch {
            favorite: Some(true),
            opened: Some(true),
            ..Default::default()
        },
    )
    .unwrap();
    drop(state);
    let restarted = open_state(dir.path());
    reindex_library_impl(&restarted).unwrap();
    let loaded = get_document_impl(&restarted, indexed.id.clone()).unwrap();
    assert_eq!(loaded.metadata.id, indexed.id);
    assert_eq!(loaded.content, raw);
    assert_eq!(
        serde_json::from_str::<Value>(loaded.metadata.metadata_json.as_ref().unwrap()).unwrap()
            ["_workshop"]["favorite"],
        true
    );
}

#[test]
fn unused_tag_names_can_be_managed_without_pruning_unrelated_catalog_entries() {
    let dir = tempfile::tempdir().unwrap();
    let state = open_state(dir.path());
    let doc = create(&state, "poetry", vec!["unused".into(), "unrelated".into()]);
    update_organization_impl(
        &state,
        doc.metadata.id,
        OrganizationPatch {
            tags: Some(vec![]),
            ..Default::default()
        },
    )
    .unwrap();
    let renamed = manage_tag_impl(&state, "unused".into(), Some("renamed-unused".into()), None).unwrap();
    assert!(renamed.updated.is_empty());
    assert_eq!(
        list_tags_impl(&state, None).unwrap(),
        vec!["renamed-unused", "unrelated"]
    );
    manage_tag_impl(&state, "renamed-unused".into(), None, None).unwrap();
    assert_eq!(list_tags_impl(&state, None).unwrap(), vec!["unrelated"]);
}
