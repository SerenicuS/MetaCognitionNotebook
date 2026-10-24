use std::sync::Mutex;
use meta_cognition_notebook_lib::{commands::*, db::Database, storage::StorageManager};

fn open_state(root: &std::path::Path) -> AppState {
    let storage = StorageManager::new(root.join("library"));
    storage.initialize().unwrap();
    let db_path = root.join("metadata.db");
    AppState { db: Mutex::new(Database::open(&db_path).unwrap()), storage, db_path }
}

#[test]
fn new_philosophy_defaults_to_empty_freeform_and_preserves_custom_metadata() {
    let dir = tempfile::tempdir().unwrap();
    let state = open_state(dir.path());
    let doc = create_document_impl(&state, "philosophy".into(), "Reflection".into(), None, None,
        Some(r#"{"chapter":"II","custom":{"keep":true}}"#.into()), None, None).unwrap();
    assert_eq!(doc.content, "");
    let metadata: serde_json::Value = serde_json::from_str(doc.metadata.metadata_json.as_ref().unwrap()).unwrap();
    assert_eq!(metadata["composition_mode"], "freeform");
    assert_eq!(metadata["custom"]["keep"], true);
    drop(state);
    let restarted = open_state(dir.path());
    let loaded = get_document_impl(&restarted, doc.metadata.id).unwrap();
    assert_eq!(loaded.content, "");
    assert_eq!(loaded.metadata.metadata_json, doc.metadata.metadata_json);
}

#[test]
fn philosophy_modes_multiline_and_block_boundaries_survive_restart_and_reindex() {
    let dir = tempfile::tempdir().unwrap();
    let state = open_state(dir.path());
    let doc = create_document_impl(&state, "philosophy".into(), "Thought".into(), None, None, None,
        Some(vec!["thinking".into()]), None).unwrap();
    let raw = "  Why?\n\n\n思想 🧠\n\n<!-- premise -->\nliteral text\n";
    let metadata = serde_json::json!({
        "composition_mode":"freeform", "work_title":"Work", "custom":42,
        "philosophy_blocks":[{"classification":"prose","length":raw.encode_utf16().count()}]
    });
    save_document_impl(&state, doc.metadata.id.clone(), raw.into(), None, None, Some(metadata.to_string())).unwrap();
    // Metadata-only switches preserve exact canonical bytes.
    for mode in ["structured", "freeform", "structured"] {
        let mut changed = metadata.clone();
        changed["composition_mode"] = mode.into();
        save_document_impl(&state, doc.metadata.id.clone(), raw.into(), None, None, Some(changed.to_string())).unwrap();
        assert_eq!(state.storage.read_document(&doc.metadata.relative_path).unwrap().content, raw);
    }
    drop(state);
    let restarted = open_state(dir.path());
    let report = reindex_library_impl(&restarted).unwrap();
    assert!(report.errors.is_empty());
    assert_eq!(report.documents_indexed, 1);
    let loaded = get_document_impl(&restarted, doc.metadata.id).unwrap();
    assert_eq!(loaded.content, raw);
    assert_eq!(loaded.metadata.tags, vec!["thinking"]);
    let metadata: serde_json::Value = serde_json::from_str(loaded.metadata.metadata_json.as_ref().unwrap()).unwrap();
    assert_eq!(metadata["composition_mode"], "structured");
    assert_eq!(metadata["custom"], 42);
    assert_eq!(metadata["philosophy_blocks"][0]["length"], raw.encode_utf16().count());
}

#[test]
fn legacy_philosophy_loading_does_not_rewrite_file_or_metadata() {
    let dir = tempfile::tempdir().unwrap();
    let state = open_state(dir.path());
    let raw = "<!-- premise -->\nA reason.\n\n<!-- objection -->\nA challenge.\n\n<!-- conclusion -->\nAn answer.";
    let doc = create_document_impl(&state, "philosophy".into(), "Legacy".into(), None,
        Some(raw.into()), Some(r#"{"chapter":"I","epigraph":"Keep me"}"#.into()), None, None).unwrap();
    let path = state.storage.resolve_safe_path(&doc.metadata.relative_path).unwrap();
    let before = std::fs::read(&path).unwrap();
    drop(state);
    let restarted = open_state(dir.path());
    reindex_library_impl(&restarted).unwrap();
    let loaded = get_document_impl(&restarted, doc.metadata.id).unwrap();
    assert_eq!(loaded.content, raw);
    let metadata: serde_json::Value = serde_json::from_str(loaded.metadata.metadata_json.as_ref().unwrap()).unwrap();
    assert!(metadata.get("composition_mode").is_none());
    assert_eq!(metadata["epigraph"], "Keep me");
    assert_eq!(std::fs::read(path).unwrap(), before);
}
