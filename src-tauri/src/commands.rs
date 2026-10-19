use std::sync::Mutex;
use chrono::Utc;
use tauri::State;
use crate::models::{DocumentDetail, DocumentMetadata, DocumentType, LibraryInfo, ReindexReport, SearchResult};
use crate::storage::StorageManager;
use crate::db::Database;

pub struct AppState {
    pub db: Mutex<Database>,
    pub storage: StorageManager,
    pub db_path: std::path::PathBuf,
}

// ============================================================================
// Core Implementations (Callable by IPC handlers and unit tests)
// ============================================================================

pub fn get_library_info_impl(state: &AppState) -> Result<LibraryInfo, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let (total, poetry, philosophy, lorebook) = db.get_stats().map_err(|e| e.to_string())?;

    Ok(LibraryInfo {
        library_path: state.storage.get_root().to_string_lossy().to_string(),
        db_path: state.db_path.to_string_lossy().to_string(),
        document_count: total,
        poetry_count: poetry,
        philosophy_count: philosophy,
        lorebook_count: lorebook,
    })
}

pub fn list_documents_impl(state: &AppState, doc_type: Option<String>) -> Result<Vec<DocumentMetadata>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let type_filter = doc_type
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .and_then(DocumentType::from_str);
    db.list_documents(type_filter).map_err(|e| e.to_string())
}

pub fn get_document_impl(state: &AppState, id: String) -> Result<DocumentDetail, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    crate::organization::canonical_document(state, &db, &id)
}

pub fn create_document_impl(
    state: &AppState,
    doc_type: String,
    title: String,
    parent_id: Option<String>,
    initial_content: Option<String>,
    metadata_json: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<DocumentDetail, String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;

    let trimmed_type = doc_type.trim();
    let parsed_type = DocumentType::from_str(trimmed_type)
        .ok_or_else(|| format!("Invalid document type: '{}'. Valid types are 'poetry', 'philosophy', or 'lorebook'.", doc_type))?;

    let id = uuid::Uuid::new_v4().to_string();
    let sanitized_title = if title.trim().is_empty() {
        "Untitled".to_string()
    } else {
        title.trim().to_string()
    };
    let clean_filename = StorageManager::sanitize_filename(&sanitized_title);

    let folder_name = parsed_type.folder_name();
    let relative_path = format!("{}/{}.md", folder_name, clean_filename);

    // Ensure filename uniqueness if file already exists
    let mut final_relative_path = relative_path;
    let mut counter = 1;
    while state.storage.resolve_safe_path(&final_relative_path).map(|p| p.exists()).unwrap_or(false) {
        final_relative_path = format!("{}/{}_{}.md", folder_name, clean_filename, counter);
        counter += 1;
    }

    let clean_parent_id = parent_id.and_then(|p| {
        let t = p.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });

    let mut clean_metadata_json = metadata_json.and_then(|m| {
        let t = m.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });

    // Only new empty Philosophy documents receive the default. Loaded documents
    // and supplied legacy content retain their original metadata and interpretation.
    if parsed_type == DocumentType::Philosophy && initial_content.as_deref().unwrap_or("").is_empty() {
        let mut metadata: serde_json::Value = match clean_metadata_json.as_deref() {
            Some(raw) => serde_json::from_str(raw).map_err(|e| format!("Invalid metadata JSON: {}", e))?,
            None => serde_json::json!({}),
        };
        if let Some(object) = metadata.as_object_mut() {
            object.entry("composition_mode").or_insert(serde_json::json!("freeform"));
            clean_metadata_json = Some(metadata.to_string());
        }
    }

    let clean_tags: Vec<String> = tags.unwrap_or_default()
        .into_iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();

    let now = Utc::now().to_rfc3339();
    let doc_meta = DocumentMetadata {
        id,
        title: sanitized_title,
        doc_type: parsed_type,
        relative_path: final_relative_path.clone(),
        parent_id: clean_parent_id,
        metadata_json: clean_metadata_json,
        created_at: now.clone(),
        updated_at: now,
        tags: clean_tags,
    };

    let doc_detail = DocumentDetail {
        metadata: doc_meta.clone(),
        content: initial_content.unwrap_or_default(),
    };

    // 1. Write file atomically to disk
    state.storage.write_document_atomic(&final_relative_path, &doc_detail)?;

    // 2. Index in SQLite
    if let Err(e) = db.upsert_document(&doc_meta) {
        return Err(format!("Document saved to disk, but database indexing failed: {}", e));
    }

    Ok(doc_detail)
}

pub fn save_document_impl(
    state: &AppState,
    id: String,
    content: String,
    title: Option<String>,
    tags: Option<Vec<String>>,
    metadata_json: Option<String>,
) -> Result<DocumentMetadata, String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;

    let mut meta = db.get_document_metadata(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Document with ID {} not found", id))?;

    if meta.metadata_json.as_deref().and_then(|s|serde_json::from_str::<serde_json::Value>(s).ok()).is_some_and(|v|v.get(crate::thought::KEY).is_some()) {
        return Err("Use Web of Thought to edit its planning catalog; manuscript autosave cannot overwrite it.".into());
    }
    if let Some(t) = title {
        let trimmed = t.trim().to_string();
        if !trimmed.is_empty() {
            meta.title = trimmed;
        }
    }

    if let Some(t_list) = tags {
        meta.tags = t_list.into_iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
    }

    if let Some(m_json) = metadata_json {
        let trimmed = m_json.trim().to_string();
        meta.metadata_json = crate::organization::preserve_workshop(
            if trimmed.is_empty() { None } else { Some(trimmed.as_str()) }, meta.metadata_json.as_deref()
        )?;
    }

    meta.updated_at = Utc::now().to_rfc3339();

    let detail = DocumentDetail {
        metadata: meta.clone(),
        content,
    };

    // 1. Atomic write to disk
    state.storage.write_document_atomic(&meta.relative_path, &detail)?;

    // 2. Update database index
    db.upsert_document(&meta).map_err(|e| e.to_string())?;

    Ok(meta)
}

pub fn rename_document_impl(
    state: &AppState,
    id: String,
    new_title: String,
) -> Result<DocumentMetadata, String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;

    let mut meta = db.get_document_metadata(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Document with ID {} not found", id))?;

    let clean_title = if new_title.trim().is_empty() { "Untitled".to_string() } else { new_title.trim().to_string() };
    if meta.title == clean_title {
        return Ok(meta);
    }

    // Read current content
    let current_detail = state.storage.read_document(&meta.relative_path)?;

    // Determine new relative path
    let folder_name = meta.doc_type.folder_name();
    let clean_filename = StorageManager::sanitize_filename(&clean_title);
    let mut new_relative_path = format!("{}/{}.md", folder_name, clean_filename);

    if new_relative_path != meta.relative_path {
        let mut counter = 1;
        while state.storage.resolve_safe_path(&new_relative_path).map(|p| p.exists()).unwrap_or(false) {
            new_relative_path = format!("{}/{}_{}.md", folder_name, clean_filename, counter);
            counter += 1;
        }

        let old_safe_path = state.storage.resolve_safe_path(&meta.relative_path)?;

        meta.title = clean_title;
        meta.relative_path = new_relative_path.clone();
        meta.updated_at = Utc::now().to_rfc3339();

        let updated_detail = DocumentDetail {
            metadata: meta.clone(),
            content: current_detail.content,
        };

        // Write new file
        state.storage.write_document_atomic(&new_relative_path, &updated_detail)?;

        // Remove old file
        let _ = std::fs::remove_file(old_safe_path);
    } else {
        meta.title = clean_title;
        meta.updated_at = Utc::now().to_rfc3339();

        let updated_detail = DocumentDetail {
            metadata: meta.clone(),
            content: current_detail.content,
        };
        state.storage.write_document_atomic(&meta.relative_path, &updated_detail)?;
    }

    db.upsert_document(&meta).map_err(|e| e.to_string())?;

    Ok(meta)
}

pub fn delete_document_impl(state: &AppState, id: String) -> Result<(), String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;

    let meta = db.get_document_metadata(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Document with ID {} not found", id))?;

    if meta.doc_type == DocumentType::Lorebook {
        crate::thought::ensure_entity_archive_safe(state, &id)?;
    }

    // 1. Safe archive to Backups/
    state.storage.safe_delete(&meta.relative_path)?;

    // 2. Remove from database
    db.delete_document(&id).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn reindex_library_impl(state: &AppState) -> Result<ReindexReport, String> {
    let (documents, report) = state.storage.scan_and_reindex();
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;

    // Clear existing index to do a fresh sync
    db.clear_all_documents().map_err(|e| e.to_string())?;

    for doc in documents {
        let _ = db.upsert_document(&doc.metadata);
    }

    Ok(report)
}

pub fn search_documents_impl(
    state: &AppState,
    query: String,
    doc_type: Option<String>,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let type_filter = doc_type
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .and_then(DocumentType::from_str);
    let docs = db.list_documents(type_filter).map_err(|e| e.to_string())?;

    Ok(state.storage.search(&docs, &query))
}

pub fn list_tags_impl(state: &AppState) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_all_tags().map_err(|e| e.to_string())
}

// ============================================================================
// Tauri IPC Command Handlers
// By default, Tauri deserializes parameter names to camelCase for the frontend:
//   doc_type        -> docType
//   parent_id       -> parentId
//   initial_content -> initialContent
//   metadata_json   -> metadataJson
//   new_title       -> newTitle
// ============================================================================

#[tauri::command]
pub fn get_library_info(state: State<'_, AppState>) -> Result<LibraryInfo, String> {
    get_library_info_impl(state.inner())
}

#[tauri::command]
pub fn list_documents(state: State<'_, AppState>, doc_type: Option<String>) -> Result<Vec<DocumentMetadata>, String> {
    list_documents_impl(state.inner(), doc_type)
}

#[tauri::command]
pub fn get_document(state: State<'_, AppState>, id: String) -> Result<DocumentDetail, String> {
    get_document_impl(state.inner(), id)
}

#[tauri::command]
pub fn create_document(
    state: State<'_, AppState>,
    doc_type: String,
    title: String,
    parent_id: Option<String>,
    initial_content: Option<String>,
    metadata_json: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<DocumentDetail, String> {
    create_document_impl(
        state.inner(),
        doc_type,
        title,
        parent_id,
        initial_content,
        metadata_json,
        tags,
    )
}

#[tauri::command]
pub fn save_document(
    state: State<'_, AppState>,
    id: String,
    content: String,
    title: Option<String>,
    tags: Option<Vec<String>>,
    metadata_json: Option<String>,
) -> Result<DocumentMetadata, String> {
    save_document_impl(state.inner(), id, content, title, tags, metadata_json)
}

#[tauri::command]
pub fn rename_document(
    state: State<'_, AppState>,
    id: String,
    new_title: String,
) -> Result<DocumentMetadata, String> {
    rename_document_impl(state.inner(), id, new_title)
}

#[tauri::command]
pub fn delete_document(state: State<'_, AppState>, id: String) -> Result<(), String> {
    delete_document_impl(state.inner(), id)
}

#[tauri::command]
pub fn reindex_library(state: State<'_, AppState>) -> Result<ReindexReport, String> {
    reindex_library_impl(state.inner())
}

#[tauri::command]
pub fn search_documents(
    state: State<'_, AppState>,
    query: String,
    doc_type: Option<String>,
) -> Result<Vec<SearchResult>, String> {
    search_documents_impl(state.inner(), query, doc_type)
}

#[tauri::command]
pub fn list_tags(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    list_tags_impl(state.inner())
}

#[tauri::command]
pub fn update_organization(state: State<'_, AppState>, id: String, patch: crate::organization::OrganizationPatch) -> Result<DocumentMetadata, String> {
    crate::organization::update_organization_impl(state.inner(), id, patch)
}

#[tauri::command]
pub fn manage_tag(state: State<'_, AppState>, old_name: String, new_name: Option<String>) -> Result<crate::organization::TagChangeReport, String> {
    crate::organization::manage_tag_impl(state.inner(), old_name, new_name)
}

#[tauri::command]
pub fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

// ============================================================================
// Automated Regression Tests (Isolated temporary test directory & in-memory DB)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_state() -> (tempfile::TempDir, AppState) {
        let temp_dir = tempfile::tempdir().expect("Failed to create temporary test directory");
        let storage = StorageManager::new(temp_dir.path());
        storage.initialize().expect("Failed to initialize test storage");

        let db = Database::open_in_memory().expect("Failed to open test in-memory database");
        let db_path = temp_dir.path().join("test_metadata.db");

        let state = AppState {
            db: Mutex::new(db),
            storage,
            db_path,
        };

        (temp_dir, state)
    }

    #[test]
    fn test_create_document_across_all_studios() {
        let (_dir, state) = create_test_state();

        // 1. Poetry Studio
        let poem = create_document_impl(
            &state,
            "poetry".to_string(),
            "Ode to the Stars".to_string(),
            None,
            Some("Stanza one.\n\nStanza two.".to_string()),
            Some(r#"{"poetic_form":"Free Verse"}"#.to_string()),
            Some(vec!["astronomy".to_string(), "verse".to_string()]),
        ).expect("Failed to create poem");

        assert_eq!(poem.metadata.title, "Ode to the Stars");
        assert_eq!(poem.metadata.doc_type, DocumentType::Poetry);
        assert_eq!(poem.metadata.relative_path, "Poetry/Ode to the Stars.md");
        assert_eq!(poem.metadata.tags.len(), 2);
        assert_eq!(poem.content, "Stanza one.\n\nStanza two.");

        // Verify disk file exists and can be parsed
        let read_poem = state.storage.read_document(&poem.metadata.relative_path).expect("Failed to read poem from disk");
        assert_eq!(read_poem.metadata.title, "Ode to the Stars");
        assert_eq!(read_poem.content, "Stanza one.\n\nStanza two.");

        // 2. Philosophy Studio
        let phil = create_document_impl(
            &state,
            "philosophy".to_string(),
            "Critique of Pure Intuition".to_string(),
            None,
            Some("<!-- premise -->\nAll thoughts are intentional.".to_string()),
            Some(r#"{"work_title":"Treatise on Mind","chapter":"Section 1"}"#.to_string()),
            Some(vec!["epistemology".to_string()]),
        ).expect("Failed to create philosophy doc");

        assert_eq!(phil.metadata.title, "Critique of Pure Intuition");
        assert_eq!(phil.metadata.doc_type, DocumentType::Philosophy);
        assert_eq!(phil.metadata.relative_path, "Philosophy/Critique of Pure Intuition.md");

        // 3. Lorebook Studio
        let lore = create_document_impl(
            &state,
            "lorebook".to_string(),
            "Valenrift Spire".to_string(),
            Some(phil.metadata.id.clone()),
            Some("### Overview\nAncient crystalline tower.".to_string()),
            Some(r#"{"universe":"Cosmos","entry_type":"location","canon_status":"canon"}"#.to_string()),
            Some(vec!["ancient".to_string(), "spire".to_string()]),
        ).expect("Failed to create lorebook entry");

        assert_eq!(lore.metadata.title, "Valenrift Spire");
        assert_eq!(lore.metadata.doc_type, DocumentType::Lorebook);
        assert_eq!(lore.metadata.parent_id, Some(phil.metadata.id));
        assert_eq!(lore.metadata.relative_path, "Lorebooks/Valenrift Spire.md");
    }

    #[test]
    fn test_create_document_collision_resolution() {
        let (_dir, state) = create_test_state();

        let doc1 = create_document_impl(
            &state,
            "poetry".to_string(),
            "Echoes".to_string(),
            None,
            Some("First file".to_string()),
            None,
            None,
        ).expect("First create failed");

        let doc2 = create_document_impl(
            &state,
            "poetry".to_string(),
            "Echoes".to_string(),
            None,
            Some("Second file".to_string()),
            None,
            None,
        ).expect("Second create failed");

        assert_eq!(doc1.metadata.relative_path, "Poetry/Echoes.md");
        assert_eq!(doc2.metadata.relative_path, "Poetry/Echoes_1.md");

        // Verify content is not overwritten
        let file1 = state.storage.read_document(&doc1.metadata.relative_path).unwrap();
        let file2 = state.storage.read_document(&doc2.metadata.relative_path).unwrap();
        assert_eq!(file1.content, "First file");
        assert_eq!(file2.content, "Second file");
    }

    #[test]
    fn test_create_document_invalid_type() {
        let (_dir, state) = create_test_state();

        let result = create_document_impl(
            &state,
            "nonexistent_studio".to_string(),
            "Test".to_string(),
            None,
            None,
            None,
            None,
        );

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("Invalid document type"));
    }

    #[test]
    fn test_list_documents_filtering() {
        let (_dir, state) = create_test_state();

        create_document_impl(&state, "poetry".to_string(), "P1".to_string(), None, None, None, None).unwrap();
        create_document_impl(&state, "poetry".to_string(), "P2".to_string(), None, None, None, None).unwrap();
        create_document_impl(&state, "philosophy".to_string(), "Ph1".to_string(), None, None, None, None).unwrap();
        create_document_impl(&state, "lorebook".to_string(), "L1".to_string(), None, None, None, None).unwrap();

        let all = list_documents_impl(&state, None).unwrap();
        assert_eq!(all.len(), 4);

        let poetry = list_documents_impl(&state, Some("poetry".to_string())).unwrap();
        assert_eq!(poetry.len(), 2);
        assert!(poetry.iter().all(|d| d.doc_type == DocumentType::Poetry));

        let phil = list_documents_impl(&state, Some("philosophy".to_string())).unwrap();
        assert_eq!(phil.len(), 1);
        assert_eq!(phil[0].title, "Ph1");

        let lore = list_documents_impl(&state, Some("lorebook".to_string())).unwrap();
        assert_eq!(lore.len(), 1);
        assert_eq!(lore[0].title, "L1");
    }

    #[test]
    fn test_save_document_updates_content_and_metadata() {
        let (_dir, state) = create_test_state();

        let created = create_document_impl(
            &state,
            "poetry".to_string(),
            "Original Title".to_string(),
            None,
            Some("Original verse".to_string()),
            Some(r#"{"poetic_form":"Sonnet"}"#.to_string()),
            Some(vec!["original".to_string()]),
        ).unwrap();

        let updated_meta = save_document_impl(
            &state,
            created.metadata.id.clone(),
            "Updated verse text line 1\nLine 2".to_string(),
            Some("Updated Title".to_string()),
            Some(vec!["new_tag1".to_string(), "new_tag2".to_string()]),
            Some(r#"{"poetic_form":"Free Verse"}"#.to_string()),
        ).expect("Save failed");

        assert_eq!(updated_meta.title, "Updated Title");
        assert_eq!(updated_meta.tags, vec!["new_tag1".to_string(), "new_tag2".to_string()]);

        // Verify disk content
        let on_disk = state.storage.read_document(&created.metadata.relative_path).unwrap();
        assert_eq!(on_disk.content, "Updated verse text line 1\nLine 2");
        assert_eq!(on_disk.metadata.title, "Updated Title");
    }

    #[test]
    fn test_rename_document_preserves_content() {
        let (_dir, state) = create_test_state();

        let doc = create_document_impl(
            &state,
            "philosophy".to_string(),
            "First Treatise".to_string(),
            None,
            Some("Very important philosophy content".to_string()),
            None,
            None,
        ).unwrap();

        let renamed = rename_document_impl(
            &state,
            doc.metadata.id.clone(),
            "Second Treatise".to_string(),
        ).expect("Rename failed");

        assert_eq!(renamed.title, "Second Treatise");
        assert_eq!(renamed.relative_path, "Philosophy/Second Treatise.md");

        // Old file must no longer exist
        let old_path = state.storage.resolve_safe_path(&doc.metadata.relative_path).unwrap();
        assert!(!old_path.exists());

        // New file exists and retains content
        let new_doc = state.storage.read_document(&renamed.relative_path).unwrap();
        assert_eq!(new_doc.metadata.title, "Second Treatise");
        assert_eq!(new_doc.content, "Very important philosophy content");
    }

    #[test]
    fn test_delete_document_archives_safely() {
        let (_dir, state) = create_test_state();

        let doc = create_document_impl(
            &state,
            "lorebook".to_string(),
            "Secret Lore".to_string(),
            None,
            Some("Secret text that must never be lost".to_string()),
            None,
            None,
        ).unwrap();

        delete_document_impl(&state, doc.metadata.id.clone()).expect("Delete failed");

        // Document no longer in DB
        let fetched = get_document_impl(&state, doc.metadata.id);
        assert!(fetched.is_err());

        // Document no longer in active relative path
        let active_path = state.storage.resolve_safe_path(&doc.metadata.relative_path).unwrap();
        assert!(!active_path.exists());

        // Verify document is archived in Backups/
        let backups_dir = state.storage.get_root().join("Backups");
        let backup_files: Vec<_> = std::fs::read_dir(backups_dir).unwrap().filter_map(|e| e.ok()).collect();
        assert_eq!(backup_files.len(), 1);
        let backup_content = std::fs::read_to_string(backup_files[0].path()).unwrap();
        assert!(backup_content.contains("Secret text that must never be lost"));
    }

    #[test]
    fn test_search_documents() {
        let (_dir, state) = create_test_state();

        create_document_impl(
            &state,
            "poetry".to_string(),
            "Night Sky".to_string(),
            None,
            Some("The moon illuminates the horizon.".to_string()),
            None,
            None,
        ).unwrap();

        create_document_impl(
            &state,
            "lorebook".to_string(),
            "Silver Citadel".to_string(),
            None,
            Some("Built from lunar stones beneath the moon.".to_string()),
            None,
            None,
        ).unwrap();

        let results_moon = search_documents_impl(&state, "moon".to_string(), None).unwrap();
        assert_eq!(results_moon.len(), 2);

        let filtered_lore = search_documents_impl(&state, "moon".to_string(), Some("lorebook".to_string())).unwrap();
        assert_eq!(filtered_lore.len(), 1);
        assert_eq!(filtered_lore[0].title, "Silver Citadel");
    }
}
