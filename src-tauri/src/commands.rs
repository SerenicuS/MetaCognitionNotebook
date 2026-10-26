use std::sync::Mutex;
use chrono::Utc;
use tauri::State;
use crate::models::{
    CreateUniverseResult,
    UniverseMoveResult,
    CreateHouseInput, DocumentDetail, DocumentMetadata, DocumentType, HouseIntegrityReport,
    HouseRecord, LibraryInfo, ReindexReport, SearchResult, UpdateHouseInput,
};
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
    let (total, poetry, philosophy, lorebook, manuscript) = db.get_stats().map_err(|e| e.to_string())?;

    Ok(LibraryInfo {
        library_path: state.storage.get_root().to_string_lossy().to_string(),
        db_path: state.db_path.to_string_lossy().to_string(),
        document_count: total,
        poetry_count: poetry,
        philosophy_count: philosophy,
        lorebook_count: lorebook,
        manuscript_count: manuscript,
    })
}

pub fn list_documents_impl(
    state: &AppState,
    doc_type: Option<String>,
    house_id: Option<String>,
) -> Result<Vec<DocumentMetadata>, String> {
    let clean_house_id = match house_id.as_deref().map(str::trim) {
        Some(h) if !h.is_empty() => {
            let registry = state.storage.read_house_registry()?;
            if !registry.houses.iter().any(|house| house.id == h) {
                return Err(format!("House with ID '{}' not found", h));
            }
            Some(h.to_string())
        }
        _ => None,
    };

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let type_filter = doc_type
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .and_then(DocumentType::from_str);

    db.list_documents(type_filter, clean_house_id.as_deref()).map_err(|e| e.to_string())
}

pub fn get_document_impl(state: &AppState, id: String) -> Result<DocumentDetail, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    crate::organization::canonical_document(state, &db, &id)
}

#[allow(clippy::too_many_arguments)]
pub fn create_document_impl(
    state: &AppState,
    doc_type: String,
    title: String,
    parent_id: Option<String>,
    initial_content: Option<String>,
    metadata_json: Option<String>,
    tags: Option<Vec<String>>,
    house_id: Option<String>,
) -> Result<DocumentDetail, String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;

    let trimmed_type = doc_type.trim();
    let parsed_type = DocumentType::from_str(trimmed_type)
        .ok_or_else(|| format!("Invalid document type: '{}'. Valid types are 'poetry', 'philosophy', 'lorebook', or 'manuscript'.", doc_type))?;

    // Validate target house
    let target_house_id = match house_id.as_deref() {
        None => crate::models::DEFAULT_HOUSE_ID.to_string(),
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() || !crate::models::is_valid_house_id(trimmed) {
                return Err(format!("Malformed target House ID: '{}'", raw));
            }
            trimmed.to_string()
        }
    };

    let registry_lock = state.storage.get_registry_lock();
    let _registry_guard = registry_lock
        .lock()
        .map_err(|_| "House registry lock poisoned".to_string())?;
    let registry = state.storage.read_house_registry()?;
    let house_rec = registry.houses.iter().find(|h| h.id == target_house_id)
        .ok_or_else(|| format!("House with ID '{}' not found", target_house_id))?;

    if house_rec.archived {
        return Err(format!("Cannot create document: House '{}' is archived", target_house_id));
    }

    if parsed_type == DocumentType::Manuscript {
        if !house_rec.manuscript_tools_enabled {
            return Err(format!("Manuscript Tools is disabled for House '{}'", house_rec.name));
        }
    } else {
        let studio = match parsed_type {
            DocumentType::Poetry => crate::models::AuthoringStudio::Poetry,
            DocumentType::Philosophy => crate::models::AuthoringStudio::Philosophy,
            DocumentType::Lorebook => crate::models::AuthoringStudio::Lorebook,
            DocumentType::Manuscript => unreachable!(),
        };
        if !house_rec.enabled_studios.contains(&studio) {
            return Err(format!("Authoring studio '{}' is disabled for House '{}'", studio.as_str(), house_rec.name));
        }
    }

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
        house_id: target_house_id,
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
    save_document_with_options_impl(state, id, Some(content), title, tags, metadata_json, None)
}

pub fn save_document_with_options_impl(
    state: &AppState,
    id: String,
    content: Option<String>,
    title: Option<String>,
    tags: Option<Vec<String>>,
    metadata_json: Option<String>,
    is_metadata_only: Option<bool>,
) -> Result<DocumentMetadata, String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;

    let _indexed = db.get_document_metadata(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Document with ID {} not found", id))?;

    let canonical = crate::organization::canonical_document(state, &db, &id)?;
    let mut meta = canonical.metadata;

    if meta.metadata_json.as_deref().and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok()).is_some_and(|v| v.get(crate::thought::KEY).is_some()) {
        return Err("Use Web of Thought to edit its planning catalog; manuscript autosave cannot overwrite it.".into());
    }

    let final_content = if is_metadata_only == Some(true) {
        canonical.content
    } else {
        match content {
            Some(body) => body,
            None => canonical.content,
        }
    };

    if !id.trim().is_empty() && final_content.trim() == id.trim() {
        return Err(format!("Refusing to save document '{}': body matches document ID", id));
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
        content: final_content,
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

    let indexed = db.get_document_metadata(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Document with ID {} not found", id))?;

    // Read current authoritative canonical document from disk
    let current_detail = crate::organization::canonical_document(state, &db, &id)?;
    let mut meta = current_detail.metadata.clone();

    let clean_title = if new_title.trim().is_empty() { "Untitled".to_string() } else { new_title.trim().to_string() };
    if meta.title == clean_title {
        if indexed.house_id != meta.house_id || indexed.title != meta.title {
            db.upsert_document(&meta).map_err(|e| e.to_string())?;
        }
        return Ok(meta);
    }

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
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;
    let _ = state.storage.recover_universe_move(&mut db)?;
    let (documents, report) = state.storage.scan_and_reindex();

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
    house_id: Option<String>,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let clean_house_id = match house_id.as_deref().map(str::trim) {
        Some(h) if !h.is_empty() => {
            let registry = state.storage.read_house_registry()?;
            if !registry.houses.iter().any(|house| house.id == h) {
                return Err(format!("House with ID '{}' not found", h));
            }
            Some(h.to_string())
        }
        _ => None,
    };

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let type_filter = doc_type
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .and_then(DocumentType::from_str);
    let docs = db.list_documents(type_filter, clean_house_id.as_deref()).map_err(|e| e.to_string())?;

    Ok(state.storage.search(&docs, &query))
}

pub fn inspect_house_integrity_impl(state: &AppState) -> Result<HouseIntegrityReport, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    state.storage.inspect_house_integrity(Some(&db))
}

pub fn list_tags_impl(state: &AppState, house_id: Option<String>) -> Result<Vec<String>, String> {
    let clean_house_id = match house_id.as_deref().map(str::trim) {
        Some(h) if !h.is_empty() => {
            let registry = state.storage.read_house_registry()?;
            if !registry.houses.iter().any(|house| house.id == h) {
                return Err(format!("House with ID '{}' not found", h));
            }
            Some(h.to_string())
        }
        _ => None,
    };
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_tags(clean_house_id.as_deref()).map_err(|e| e.to_string())
}


// ============================================================================
// House Management Core Implementations (Phase 2)
// ============================================================================

pub fn list_houses_impl(state: &AppState) -> Result<Vec<HouseRecord>, String> {
    let registry = state.storage.read_house_registry()?;
    Ok(registry.houses)
}

pub fn get_house_impl(state: &AppState, id: String) -> Result<HouseRecord, String> {
    let registry = state.storage.read_house_registry()?;
    registry.houses.into_iter().find(|h| h.id == id)
        .ok_or_else(|| format!("House with ID '{}' not found", id))
}

pub fn create_house_impl(state: &AppState, input: CreateHouseInput) -> Result<HouseRecord, String> {
    state.storage.create_house(input)
}

pub fn update_house_impl(state: &AppState, input: UpdateHouseInput) -> Result<HouseRecord, String> {
    state.storage.update_house(input)
}

pub fn archive_house_impl(state: &AppState, id: String) -> Result<HouseRecord, String> {
    state.storage.archive_house(&id)
}

pub fn restore_house_impl(state: &AppState, id: String) -> Result<HouseRecord, String> {
    state.storage.restore_house(&id)
}

pub fn move_document_to_house_impl(
    state: &AppState,
    doc_id: String,
    target_house_id: String,
) -> Result<DocumentMetadata, String> {
    let trimmed_target = target_house_id.trim();
    if trimmed_target.is_empty() || !crate::models::is_valid_house_id(trimmed_target) {
        return Err(format!("Malformed target House ID: '{}'", target_house_id));
    }

    // Global lock ordering: state.db -> state.storage.registry_lock (matches vault.rs)
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;
    let registry_lock = state.storage.get_registry_lock();
    let _registry_guard = registry_lock
        .lock()
        .map_err(|_| "House registry lock poisoned".to_string())?;

    let registry = state.storage.read_house_registry()?;
    let target_house = registry
        .houses
        .iter()
        .find(|h| h.id == trimmed_target)
        .ok_or_else(|| format!("House with ID '{}' not found", trimmed_target))?;

    if target_house.archived {
        return Err(format!(
            "Cannot move document: House '{}' is archived",
            trimmed_target
        ));
    }

    let doc_meta = db
        .get_document_metadata(&doc_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Document with ID '{}' not found", doc_id))?;

    // Verify canonical document exists, can be read, and matches indexed identity
    let mut doc_detail = crate::organization::canonical_document(state, &db, &doc_id)?;

    // Reject moving the shared Web of Thought planning catalog
    let is_reserved_catalog_name = std::path::Path::new(&doc_detail.metadata.relative_path)
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.starts_with("Web_of_Thought_"));
    if is_reserved_catalog_name {
        return Err(
            "Cannot move the shared Web of Thought planning catalog to a specific House"
                .to_string(),
        );
    }

    let parsed_doc_meta: Option<serde_json::Value> =
        match doc_detail.metadata.metadata_json.as_deref() {
            Some(raw_meta) if !raw_meta.trim().is_empty() => {
                let val: serde_json::Value = serde_json::from_str(raw_meta).map_err(|e| {
                    format!(
                        "Invalid document metadata JSON in '{}': {}",
                        doc_detail.metadata.relative_path, e
                    )
                })?;
                if val.get(crate::thought::KEY).is_some() {
                    return Err(
                        "Cannot move the shared Web of Thought planning catalog to a specific House"
                            .to_string(),
                    );
                }
                Some(val)
            }
            _ => None,
        };

    // Validate current (source) House ownership from canonical document
    let source_house_id = doc_detail.metadata.house_id.trim();
    if source_house_id.is_empty() || !crate::models::is_valid_house_id(source_house_id) {
        return Err(format!(
            "Cannot move document '{}': current canonical House ID '{}' is malformed",
            doc_id, doc_detail.metadata.house_id
        ));
    }
    let source_house = registry
        .houses
        .iter()
        .find(|h| h.id == source_house_id)
        .ok_or_else(|| {
            format!(
                "Cannot move document '{}': current owning House '{}' is unknown (orphaned)",
                doc_id, source_house_id
            )
        })?;
    if source_house.archived {
        return Err(format!(
            "Cannot move document '{}': current owning House '{}' is archived",
            doc_id, source_house.id
        ));
    }

    // Validate target house studio / manuscript tools enablement against canonical doc_type
    if doc_detail.metadata.doc_type == DocumentType::Manuscript {
        if !target_house.manuscript_tools_enabled {
            return Err(format!(
                "Manuscript Tools is disabled for House '{}'",
                target_house.name
            ));
        }
    } else {
        let studio = match doc_detail.metadata.doc_type {
            DocumentType::Poetry => crate::models::AuthoringStudio::Poetry,
            DocumentType::Philosophy => crate::models::AuthoringStudio::Philosophy,
            DocumentType::Lorebook => crate::models::AuthoringStudio::Lorebook,
            DocumentType::Manuscript => unreachable!(),
        };
        if !target_house.enabled_studios.contains(&studio) {
            return Err(format!(
                "Authoring studio '{}' is disabled for House '{}'",
                studio.as_str(),
                target_house.name
            ));
        }
    }

    // Idempotent no-op check against authoritative canonical ownership:
    // If canonical document is already owned by target house, do not rewrite disk;
    // repair SQLite if the derived index was stale.
    if doc_detail.metadata.house_id == trimmed_target {
        if doc_meta.house_id != trimmed_target {
            db.upsert_document(&doc_detail.metadata).map_err(|e| {
                format!(
                    "Canonical document already belongs to House '{}', but repairing stale database index failed: {}",
                    trimmed_target, e
                )
            })?;
        }
        return Ok(doc_detail.metadata);
    }

    // Lorebook Universe validation:
    // Never infer standalone status merely because a catalog or metadata lookup failed.
    if doc_detail.metadata.doc_type == DocumentType::Lorebook {
        let catalog = crate::thought::find_catalog_plan(state)?;
        if let Some((ref catalog_doc, _)) = catalog {
            if catalog_doc.metadata.id == doc_id {
                return Err(
                    "Cannot move the shared Web of Thought planning catalog to a specific House"
                        .to_string(),
                );
            }
        }

        let mut entity_universe_id: Option<String> = None;

        if let Some(ref val) = parsed_doc_meta {
            if let Some(uid_val) = val.get("universe_id") {
                if !uid_val.is_null() {
                    let uid = uid_val
                        .as_str()
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .ok_or_else(|| {
                            format!(
                                "Malformed universe_id in Lorebook entity '{}'",
                                doc_detail.metadata.title
                            )
                        })?;
                    entity_universe_id = Some(uid.to_string());
                }
            }
            if entity_universe_id.is_none() {
                if let Some(legacy_val) = val.get("universe") {
                    if !legacy_val.is_null() {
                        let legacy_name = legacy_val
                            .as_str()
                            .map(str::trim)
                            .filter(|s| !s.is_empty())
                            .ok_or_else(|| {
                                format!(
                                    "Malformed legacy universe field in Lorebook entity '{}'",
                                    doc_detail.metadata.title
                                )
                            })?;
                        let resolved = if let Some((_, ref plan)) = catalog {
                            crate::models::resolve_legacy_universe_id(
                                legacy_name,
                                &doc_detail.metadata.house_id,
                                &plan.universes,
                                &registry,
                            )?
                        } else {
                            None
                        }
                        .ok_or_else(|| {
                            format!(
                                "Cannot resolve Lorebook entity '{}' universe '{}' against the planning catalog",
                                doc_detail.metadata.title, legacy_name
                            )
                        })?;
                        entity_universe_id = Some(resolved);
                    }
                }
            }
        }

        if let Some((_, ref plan)) = catalog {
            if let Some(catalog_entity) = plan.entities.iter().find(|e| e.id == doc_id) {
                if let Some(ref meta_uid) = entity_universe_id {
                    if meta_uid != &catalog_entity.universe_id {
                        return Err(format!(
                            "Conflicting Universe attribution for Lorebook entity '{}': metadata specifies '{}' but catalog specifies '{}'",
                            doc_detail.metadata.title, meta_uid, catalog_entity.universe_id
                        ));
                    }
                } else {
                    entity_universe_id = Some(catalog_entity.universe_id.clone());
                }
            }
            if entity_universe_id.is_none() {
                if let Some(rel) = plan
                    .relationships
                    .iter()
                    .find(|r| r.source_id == doc_id || r.target_id == doc_id)
                {
                    entity_universe_id = Some(rel.universe_id.clone());
                } else if let Some(node) = plan.nodes.iter().find(|n| {
                    n.entity_ids.iter().any(|eid| eid == &doc_id)
                        || n.changes.iter().any(|c| c.entity_id == doc_id)
                }) {
                    entity_universe_id = Some(node.universe_id.clone());
                }
            }
        }

        if let Some(uni_id) = entity_universe_id {
            let universe_owner = registry
                .houses
                .iter()
                .find(|h| h.universe_ids.iter().any(|u| u == &uni_id))
                .map(|h| h.id.clone())
                .unwrap_or_else(|| crate::models::DEFAULT_HOUSE_ID.to_string());
            if universe_owner != trimmed_target {
                return Err(format!(
                    "Cannot move Lorebook entity '{}' to House '{}': entity belongs to Universe '{}' which is owned by House '{}'. Cross-House universe moves require a coordinated move operation.",
                    doc_detail.metadata.title, trimmed_target, uni_id, universe_owner
                ));
            }
        }
    }

    // 1. Atomically update canonical Markdown file on disk first
    let full_path = state
        .storage
        .resolve_safe_path(&doc_detail.metadata.relative_path)?;
    let raw_on_disk = std::fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read canonical file: {}", e))?;

    let updated_detail = if raw_on_disk.starts_with("---json\n") {
        state
            .storage
            .update_document_house_id(&doc_detail.metadata.relative_path, trimmed_target)?
    } else {
        doc_detail.metadata.house_id = trimmed_target.to_string();
        doc_detail.metadata.updated_at = Utc::now().to_rfc3339();
        state
            .storage
            .write_document_atomic(&doc_detail.metadata.relative_path, &doc_detail)?;
        state
            .storage
            .read_document(&doc_detail.metadata.relative_path)?
    };

    if updated_detail.metadata.house_id != trimmed_target {
        return Err(format!(
            "Canonical ownership verification failed for '{}': expected '{}', found '{}'",
            doc_id, trimmed_target, updated_detail.metadata.house_id
        ));
    }

    // 2. Update SQLite derived index second using authoritative canonical metadata
    if let Err(e) = db.upsert_document(&updated_detail.metadata) {
        return Err(format!(
            "Document updated on disk, but database indexing failed: {}",
            e
        ));
    }

    // 3. Verify canonical and indexed ownership agree
    let verified_index = db
        .get_document_metadata(&doc_id)
        .map_err(|e| format!("Failed to verify database index after move: {}", e))?
        .ok_or_else(|| "Document missing from database index after move".to_string())?;
    if verified_index.house_id != updated_detail.metadata.house_id {
        return Err(
            "Ownership verification failed: database index does not match canonical document after move"
                .to_string(),
        );
    }

    Ok(updated_detail.metadata)
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
pub fn list_documents(
    state: State<'_, AppState>,
    doc_type: Option<String>,
    house_id: Option<String>,
) -> Result<Vec<DocumentMetadata>, String> {
    list_documents_impl(state.inner(), doc_type, house_id)
}

#[tauri::command]
pub fn get_document(state: State<'_, AppState>, id: String) -> Result<DocumentDetail, String> {
    get_document_impl(state.inner(), id)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_document(
    state: State<'_, AppState>,
    doc_type: String,
    title: String,
    parent_id: Option<String>,
    initial_content: Option<String>,
    metadata_json: Option<String>,
    tags: Option<Vec<String>>,
    house_id: Option<String>,
) -> Result<DocumentDetail, String> {
    create_document_impl(
        state.inner(),
        doc_type,
        title,
        parent_id,
        initial_content,
        metadata_json,
        tags,
        house_id,
    )
}

#[tauri::command]
pub fn save_document(
    state: State<'_, AppState>,
    id: String,
    content: Option<String>,
    title: Option<String>,
    tags: Option<Vec<String>>,
    metadata_json: Option<String>,
    is_metadata_only: Option<bool>,
) -> Result<DocumentMetadata, String> {
    save_document_with_options_impl(state.inner(), id, content, title, tags, metadata_json, is_metadata_only)
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
    house_id: Option<String>,
) -> Result<Vec<SearchResult>, String> {
    search_documents_impl(state.inner(), query, doc_type, house_id)
}

#[tauri::command]
pub fn inspect_house_integrity(state: State<'_, AppState>) -> Result<HouseIntegrityReport, String> {
    inspect_house_integrity_impl(state.inner())
}

#[tauri::command]
pub fn list_tags(state: State<'_, AppState>, house_id: Option<String>) -> Result<Vec<String>, String> {
    list_tags_impl(state.inner(), house_id)
}

#[tauri::command]
pub fn update_organization(state: State<'_, AppState>, id: String, patch: crate::organization::OrganizationPatch) -> Result<DocumentMetadata, String> {
    crate::organization::update_organization_impl(state.inner(), id, patch)
}

#[tauri::command]
pub fn manage_tag(state: State<'_, AppState>, old_name: String, new_name: Option<String>, house_id: Option<String>) -> Result<crate::organization::TagChangeReport, String> {
    crate::organization::manage_tag_impl(state.inner(), old_name, new_name, house_id)
}

#[tauri::command]
pub fn save_export_file(
    suggested_name: String,
    content_bytes: Option<Vec<u8>>,
    content_text: Option<String>,
    filter_name: String,
    filter_ext: String,
) -> Result<Option<String>, String> {
    let bytes = match (content_bytes, content_text) {
        (Some(b), _) => b,
        (None, Some(t)) => t.into_bytes(),
        (None, None) => return Err("No file content provided for export".to_string()),
    };

    let mut dialog = rfd::FileDialog::new()
        .set_file_name(&suggested_name);

    if !filter_ext.is_empty() {
        dialog = dialog.add_filter(&filter_name, &[&filter_ext]);
    }

    if let Some(path) = dialog.save_file() {
        std::fs::write(&path, &bytes).map_err(|e| format!("Failed to write export file: {}", e))?;
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}


#[tauri::command]
pub fn list_houses(state: State<'_, AppState>) -> Result<Vec<HouseRecord>, String> {
    list_houses_impl(state.inner())
}

#[tauri::command]
pub fn get_house(state: State<'_, AppState>, id: String) -> Result<HouseRecord, String> {
    get_house_impl(state.inner(), id)
}

#[tauri::command]
pub fn create_house(state: State<'_, AppState>, input: CreateHouseInput) -> Result<HouseRecord, String> {
    create_house_impl(state.inner(), input)
}

#[tauri::command]
pub fn update_house(state: State<'_, AppState>, input: UpdateHouseInput) -> Result<HouseRecord, String> {
    update_house_impl(state.inner(), input)
}

#[tauri::command]
pub fn archive_house(state: State<'_, AppState>, id: String) -> Result<HouseRecord, String> {
    archive_house_impl(state.inner(), id)
}

#[tauri::command]
pub fn restore_house(state: State<'_, AppState>, id: String) -> Result<HouseRecord, String> {
    restore_house_impl(state.inner(), id)
}

#[tauri::command]
pub fn move_document_to_house(
    state: State<'_, AppState>,
    doc_id: String,
    target_house_id: String,
) -> Result<DocumentMetadata, String> {
    move_document_to_house_impl(state.inner(), doc_id, target_house_id)
}

#[tauri::command]

pub fn recover_pending_universe_moves_impl(
    state: &AppState,
) -> Result<Option<UniverseMoveResult>, String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;
    let registry_lock = state.storage.get_registry_lock();
    let _registry_guard = registry_lock
        .lock()
        .map_err(|_| "House registry lock poisoned".to_string())?;

    state.storage.recover_universe_move(&mut db)
}

pub fn move_universe_to_house_impl(
    state: &AppState,
    universe_id: String,
    target_house_id: String,
) -> Result<UniverseMoveResult, String> {
    let trimmed_target = target_house_id.trim();
    if trimmed_target.is_empty() || !crate::models::is_valid_house_id(trimmed_target) {
        return Err(format!("Malformed target House ID: '{}'", target_house_id));
    }

    let trimmed_universe = universe_id.trim();
    if trimmed_universe.is_empty() {
        return Err("Universe ID cannot be empty".to_string());
    }
    if trimmed_universe.len() > 128 || trimmed_universe.chars().any(|c| c.is_control() || c == '/' || c == '\\') {
        return Err(format!("Invalid universe ID syntax: '{}'", universe_id));
    }

    // Global lock ordering: state.db -> state.storage.registry_lock (matches vault.rs)
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;
    let registry_lock = state.storage.get_registry_lock();
    let _registry_guard = registry_lock
        .lock()
        .map_err(|_| "House registry lock poisoned".to_string())?;

    // Check for pending journal from an interrupted prior operation
    if state.storage.has_pending_universe_move_journal()? {
        return Err("Another House relocation operation is currently pending recovery. Complete recovery before initiating a new move.".to_string());
    }

    let registry = state.storage.read_house_registry()?;
    let target_house = registry
        .houses
        .iter()
        .find(|h| h.id == trimmed_target)
        .ok_or_else(|| format!("Target House '{}' does not exist", trimmed_target))?;

    if target_house.archived {
        return Err(format!(
            "Cannot move Universe: Target House '{}' is archived",
            trimmed_target
        ));
    }

    if !target_house.enabled_studios.contains(&crate::models::AuthoringStudio::Lorebook) {
        return Err(format!(
            "Authoring studio 'lorebook' is disabled for House '{}'",
            target_house.name
        ));
    }

    // Identify current source House
    let source_house = registry
        .houses
        .iter()
        .find(|h| h.universe_ids.iter().any(|u| u == trimmed_universe))
        .or_else(|| registry.houses.iter().find(|h| h.id == crate::models::DEFAULT_HOUSE_ID))
        .ok_or_else(|| "Source House for Universe could not be determined".to_string())?;

    let source_house_id = source_house.id.clone();

    if source_house.archived {
        return Err(format!(
            "Cannot move Universe '{}': current owning House '{}' is archived",
            trimmed_universe, source_house.id
        ));
    }

    // Load planning catalog if it exists
    let catalog = crate::thought::find_catalog_plan(state)?;
    
    if let Some((_, ref plan)) = catalog {
        let universe_record = plan.universes.iter().find(|u| u.id == trimmed_universe);
        if universe_record.is_none() && !plan.universes.is_empty() {
            return Err(format!(
                "Universe '{}' does not exist in the Lorebook catalog",
                trimmed_universe
            ));
        }
        _ = universe_record;
    }

    // Scan all Lorebook documents to discover universe-owned entity documents and validate consistency
    let all_lorebooks = db.list_documents(Some(DocumentType::Lorebook), None).map_err(|e| e.to_string())?;
    let mut affected_docs = Vec::new();

    for meta in all_lorebooks {
        // Skip the shared Web of Thought planning catalog
        if catalog.as_ref().is_some_and(|(c, _)| c.metadata.id == meta.id)
            || meta.relative_path.contains("Web_of_Thought_")
        {
            continue;
        }

        // Canonical document must exist and be readable
        let doc_detail = crate::organization::canonical_document(state, &db, &meta.id)?;

        let mut belongs_to_universe = false;
        let mut explicit_doc_universe: Option<String> = None;

        if let Some(ref raw_meta) = doc_detail.metadata.metadata_json {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(raw_meta) {
                if let Some(uid) = val.get("universe_id").and_then(|v| v.as_str()) {
                    explicit_doc_universe = Some(uid.trim().to_string());
                    if uid.trim() == trimmed_universe {
                        belongs_to_universe = true;
                    }
                } else if let Some(legacy_name) = val.get("universe").and_then(|v| v.as_str()) {
                    if let Some((_, ref plan)) = catalog {
                        if let Ok(Some(resolved_uid)) = crate::models::resolve_legacy_universe_id(
                            legacy_name,
                            &doc_detail.metadata.house_id,
                            &plan.universes,
                            &registry,
                        ) {
                            if resolved_uid == trimmed_universe {
                                belongs_to_universe = true;
                            }
                        }
                    }
                }
            }
        }

        if let Some((_, ref plan)) = catalog {
            if let Some(entity_ref) = plan.entities.iter().find(|e| e.id == meta.id) {
                if let Some(ref doc_u) = explicit_doc_universe {
                    if doc_u != &entity_ref.universe_id {
                        return Err(format!(
                            "Conflicting Universe attribution for Lorebook entity '{}': metadata specifies '{}' but catalog specifies '{}'",
                            doc_detail.metadata.title, doc_u, entity_ref.universe_id
                        ));
                    }
                }
                if entity_ref.universe_id == trimmed_universe {
                    belongs_to_universe = true;
                }
            }

            if !belongs_to_universe {
                let in_nodes = plan.nodes.iter().any(|n| {
                    n.universe_id == trimmed_universe
                        && (n.entity_ids.contains(&meta.id)
                            || n.changes.iter().any(|c| c.entity_id == meta.id))
                });
                let in_rels = plan.relationships.iter().any(|r| {
                    r.universe_id == trimmed_universe
                        && (r.source_id == meta.id || r.target_id == meta.id)
                });
                if in_nodes || in_rels {
                    belongs_to_universe = true;
                }
            }
        }

        if belongs_to_universe {
            // Verify current canonical ownership matches source House
            if doc_detail.metadata.house_id != source_house_id {
                return Err(format!(
                    "Cannot move Universe '{}' to House '{}': entity document '{}' has conflicting ownership '{}' (expected source House '{}')",
                    trimmed_universe, trimmed_target, doc_detail.metadata.title, doc_detail.metadata.house_id, source_house_id
                ));
            }
            affected_docs.push(doc_detail);
        }
    }

    // Same-House Idempotency check:
    // If source_house_id == trimmed_target, verify canonical documents have trimmed_target,
    // reconcile SQLite if stale, and return without rewriting disk.
    if source_house_id == trimmed_target {
        let mut moved_ids = Vec::new();
        for doc in &affected_docs {
            if doc.metadata.house_id != trimmed_target {
                return Err(format!(
                    "Canonical document '{}' frontmatter ownership '{}' does not match source House '{}'",
                    doc.metadata.title, doc.metadata.house_id, trimmed_target
                ));
            }
            let indexed_meta = db.get_document_metadata(&doc.metadata.id).map_err(|e| e.to_string())?;
            if indexed_meta.as_ref().map(|m| m.house_id.as_str()) != Some(trimmed_target) {
                db.upsert_document(&doc.metadata).map_err(|e| e.to_string())?;
            }
            moved_ids.push(doc.metadata.id.clone());
        }
        return Ok(UniverseMoveResult {
            universe_id: trimmed_universe.to_string(),
            source_house_id,
            target_house_id: trimmed_target.to_string(),
            document_count: moved_ids.len(),
            moved_document_ids: moved_ids,
        });
    }

    // Step 1: Write Operation Journal in stage Planned
    let operation_id = format!("univ-move-{}", uuid::Uuid::new_v4());
    let now = Utc::now().to_rfc3339();
    let journal_entries: Vec<crate::models::UniverseMoveDocumentEntry> = affected_docs
        .iter()
        .map(|d| crate::models::UniverseMoveDocumentEntry {
            doc_id: d.metadata.id.clone(),
            relative_path: d.metadata.relative_path.clone(),
            original_house_id: source_house_id.clone(),
            target_house_id: trimmed_target.to_string(),
            status: crate::models::UniverseMoveDocStatus::Pending,
        })
        .collect();

    let mut journal = crate::models::UniverseMoveJournal {
        operation_id,
        created_at: now.clone(),
        stage: crate::models::UniverseMoveStage::Planned,
        universe_id: trimmed_universe.to_string(),
        source_house_id: source_house_id.clone(),
        target_house_id: trimmed_target.to_string(),
        affected_documents: journal_entries,
    };
    state.storage.write_universe_move_journal(&journal)?;

    // Step 2: Mutate library/library.json registry
    if let Err(e) = state.storage.reassign_universe_in_registry_unlocked(trimmed_universe, trimmed_target) {
        let _ = state.storage.remove_universe_move_journal();
        return Err(format!("Failed to update House registry: {}", e));
    }
    journal.stage = crate::models::UniverseMoveStage::RegistryUpdated;
    let _ = state.storage.write_universe_move_journal(&journal);

    // Step 3: Mutate canonical documents on disk
    let mut updated_indices: Vec<usize> = Vec::new();
    let mut update_error: Option<String> = None;

    for (idx, doc) in affected_docs.iter().enumerate() {
        let full_path = match state.storage.resolve_safe_path(&doc.metadata.relative_path) {
            Ok(p) => p,
            Err(e) => {
                update_error = Some(e);
                break;
            }
        };
        let raw_on_disk = match std::fs::read_to_string(&full_path) {
            Ok(r) => r,
            Err(e) => {
                update_error = Some(e.to_string());
                break;
            }
        };

        let res = if raw_on_disk.starts_with("---json\n") {
            state.storage.update_document_house_id(&doc.metadata.relative_path, trimmed_target)
        } else {
            let mut legacy_doc = doc.clone();
            legacy_doc.metadata.house_id = trimmed_target.to_string();
            legacy_doc.metadata.updated_at = Utc::now().to_rfc3339();
            state.storage.write_document_atomic(&doc.metadata.relative_path, &legacy_doc)
                .and_then(|_| state.storage.read_document(&doc.metadata.relative_path))
        };

        match res {
            Ok(_) => {
                updated_indices.push(idx);
                journal.affected_documents[idx].status = crate::models::UniverseMoveDocStatus::Updated;
            }
            Err(e) => {
                update_error = Some(e);
                break;
            }
        }
    }

    if let Some(err) = update_error {
        // Live Rollback: Revert updated documents and registry
        for &idx in &updated_indices {
            let doc = &affected_docs[idx];
            let _ = state.storage.update_document_house_id(&doc.metadata.relative_path, &source_house_id);
        }
        let _ = state.storage.revert_universe_in_registry_unlocked(trimmed_universe, &source_house_id, trimmed_target);
        let _ = state.storage.remove_universe_move_journal();
        return Err(format!("Universe move failed during document updates: {}. Changes were rolled back.", err));
    }

    journal.stage = crate::models::UniverseMoveStage::DocumentsUpdated;
    let _ = state.storage.write_universe_move_journal(&journal);

    // Step 4: Reconcile SQLite derived index
    let mut moved_ids = Vec::new();
    for doc in &affected_docs {
        let reloaded = state.storage.read_document(&doc.metadata.relative_path)?;
        if let Err(e) = db.upsert_document(&reloaded.metadata) {
            // Journal remains in DocumentsUpdated stage to allow recovery/reindexing
            return Err(format!(
                "Canonical files updated, but SQLite index update failed for '{}': {}. The recovery journal is retained; run recovery or reindex.",
                reloaded.metadata.title, e
            ));
        }
        moved_ids.push(reloaded.metadata.id);
    }

    // Step 5: Clean up journal
    state.storage.remove_universe_move_journal()?;

    Ok(UniverseMoveResult {
        universe_id: trimmed_universe.to_string(),
        source_house_id,
        target_house_id: trimmed_target.to_string(),
        document_count: moved_ids.len(),
        moved_document_ids: moved_ids,
    })
}






#[tauri::command]
pub fn create_universe_in_house(
    state: State<'_, AppState>,
    expected_revision: u64,
    name: String,
    description: Option<String>,
    target_house_id: String,
) -> Result<CreateUniverseResult, String> {
    create_universe_in_house_impl(state.inner(), expected_revision, name, description, target_house_id)
}

pub fn create_universe_in_house_impl(
    state: &AppState,
    expected_revision: u64,
    name: String,
    description: Option<String>,
    target_house_id: String,
) -> Result<CreateUniverseResult, String> {
    let clean_name = name.trim().to_string();
    if clean_name.is_empty() {
        return Err("Universe name cannot be empty".to_string());
    }

    let trimmed_house = target_house_id.trim().to_string();
    // 1. Verify target house exists and is not archived
    {
        let registry = state.storage.read_house_registry()?;
        let house = registry.houses.iter().find(|h| h.id == trimmed_house)
            .ok_or_else(|| format!("Target House '{}' does not exist", trimmed_house))?;
        if house.archived {
            return Err(format!("Cannot create universe: Target House '{}' is archived", trimmed_house));
        }
    }

    // 2. Load current plan
    let current_thought = crate::thought::get_impl(state)?;
    let mut plan = current_thought.plan.unwrap_or_else(|| crate::thought::Plan {
        version: 1,
        revision: 0,
        universes: vec![],
        books: vec![],
        entities: vec![],
        nodes: vec![],
        relationships: vec![],
    });

    let original_plan = plan.clone();
    let universe_id = format!("uni-{}", uuid::Uuid::new_v4());

    plan.universes.push(crate::thought::Universe {
        id: universe_id.clone(),
        name: clean_name.clone(),
        description,
        archived: false,
    });

    // 3. Save plan to disk
    let saved_thought = crate::thought::save_impl(state, expected_revision, plan)?;

    // 4. Assign universe to house in registry
    if let Err(e) = state.storage.assign_universe_to_house(&universe_id, &trimmed_house) {
        // Rollback plan to original
        let rollback_rev = saved_thought.plan.as_ref().map(|p| p.revision).unwrap_or(expected_revision + 1);
        let _ = crate::thought::save_impl(state, rollback_rev, original_plan);
        return Err(format!("Failed to register Universe ownership in House '{}': {}. Plan was rolled back.", trimmed_house, e));
    }

    Ok(CreateUniverseResult {
        universe_id,
        universe_name: clean_name,
        house_id: trimmed_house,
        thought: saved_thought,
    })
}

#[tauri::command]
pub fn assign_universe_to_house(
    state: State<'_, AppState>,
    universe_id: String,
    target_house_id: String,
) -> Result<(), String> {
    assign_universe_to_house_impl(state.inner(), universe_id, target_house_id)
}

pub fn assign_universe_to_house_impl(
    state: &AppState,
    universe_id: String,
    target_house_id: String,
) -> Result<(), String> {
    state.storage.assign_universe_to_house(&universe_id, &target_house_id)
}

#[tauri::command]
pub fn move_universe_to_house(
    state: State<'_, AppState>,
    universe_id: String,
    target_house_id: String,
) -> Result<UniverseMoveResult, String> {
    move_universe_to_house_impl(state.inner(), universe_id, target_house_id)
}

#[tauri::command]
pub fn recover_pending_universe_moves(
    state: State<'_, AppState>,
) -> Result<Option<UniverseMoveResult>, String> {
    recover_pending_universe_moves_impl(state.inner())
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
            None,
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
            None,
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
            None,
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
            None,
        );

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("Invalid document type"));
    }

    #[test]
    fn test_list_documents_filtering() {
        let (_dir, state) = create_test_state();

        create_document_impl(&state, "poetry".to_string(), "P1".to_string(), None, None, None, None, None).unwrap();
        create_document_impl(&state, "poetry".to_string(), "P2".to_string(), None, None, None, None, None).unwrap();
        create_document_impl(&state, "philosophy".to_string(), "Ph1".to_string(), None, None, None, None, None).unwrap();
        create_document_impl(&state, "lorebook".to_string(), "L1".to_string(), None, None, None, None, None).unwrap();

        let all = list_documents_impl(&state, None, None).unwrap();
        assert_eq!(all.len(), 4);

        let poetry = list_documents_impl(&state, Some("poetry".to_string()), None).unwrap();
        assert_eq!(poetry.len(), 2);
        assert!(poetry.iter().all(|d| d.doc_type == DocumentType::Poetry));

        let phil = list_documents_impl(&state, Some("philosophy".to_string()), None).unwrap();
        assert_eq!(phil.len(), 1);
        assert_eq!(phil[0].title, "Ph1");

        let lore = list_documents_impl(&state, Some("lorebook".to_string()), None).unwrap();
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
            None,
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
            None,
        ).unwrap();

        let results_moon = search_documents_impl(&state, "moon".to_string(), None, None).unwrap();
        assert_eq!(results_moon.len(), 2);

        let filtered_lore = search_documents_impl(&state, "moon".to_string(), Some("lorebook".to_string()), None).unwrap();
        assert_eq!(filtered_lore.len(), 1);
        assert_eq!(filtered_lore[0].title, "Silver Citadel");
    }

    #[test]
    fn test_phase1_mixed_attribution_reindexing_and_all_four_types_lifecycle() {
        let (dir, state) = create_test_state();

        // 1. Create, load, and save across all 4 document types (Poetry, Philosophy, Lorebook, Manuscript)
        for (dtype, title) in [
            ("poetry", "Phase1 Poem"),
            ("philosophy", "Phase1 Treatise"),
            ("lorebook", "Phase1 Chronicle"),
            ("manuscript", "Phase1 Anthology"),
        ] {
            let created = create_document_impl(
                &state,
                dtype.to_string(),
                title.to_string(),
                None,
                Some(format!("Initial content for {}", dtype)),
                Some(r#"{"custom_meta":true}"#.to_string()),
                Some(vec!["phase1".to_string()]),
                None,
            )
            .unwrap();

            assert_eq!(created.metadata.house_id, crate::models::DEFAULT_HOUSE_ID);
            let original_id = created.metadata.id.clone();
            let original_path = created.metadata.relative_path.clone();

            let loaded = get_document_impl(&state, original_id.clone()).unwrap();
            assert_eq!(loaded.metadata.id, original_id);
            assert_eq!(loaded.metadata.relative_path, original_path);
            assert_eq!(loaded.metadata.house_id, crate::models::DEFAULT_HOUSE_ID);

            let saved = save_document_impl(
                &state,
                original_id.clone(),
                format!("Saved content for {}", dtype),
                None,
                None,
                None,
            )
            .unwrap();
            assert_eq!(saved.id, original_id);
            assert_eq!(saved.relative_path, original_path);
            assert_eq!(saved.house_id, crate::models::DEFAULT_HOUSE_ID);
        }

        // 2. Write a legacy file (no house_id) and an explicitly attributed file (house_id = "house-archive-7")
        let legacy_file = state.storage.get_root().join("Poetry/Legacy_Unattributed.md");
        let legacy_bytes = r#"---json
{
  "id": "legacy-unattributed-id",
  "title": "Legacy Unattributed",
  "type": "poetry",
  "created_at": "2026-10-10T00:00:00Z",
  "updated_at": "2026-10-10T00:00:00Z",
  "tags": []
}
---
Unattributed poem content."#;
        std::fs::write(&legacy_file, legacy_bytes).unwrap();

        let attributed_file = state.storage.get_root().join("Lorebooks/Attributed_Lore.md");
        let attributed_bytes = r#"---json
{
  "id": "attributed-lore-id",
  "title": "Attributed Lore",
  "type": "lorebook",
  "house_id": "house-archive-7",
  "created_at": "2026-10-11T00:00:00Z",
  "updated_at": "2026-10-11T00:00:00Z",
  "tags": ["world"]
}
---
Attributed lore content."#;
        std::fs::write(&attributed_file, attributed_bytes).unwrap();

        // 3. Reindex mixed library and verify no files on disk are rewritten by scanning
        let report = reindex_library_impl(&state).unwrap();
        assert!(report.errors.is_empty());
        assert_eq!(report.documents_indexed, 6);
        assert_eq!(std::fs::read_to_string(&legacy_file).unwrap(), legacy_bytes);
        assert_eq!(
            std::fs::read_to_string(&attributed_file).unwrap(),
            attributed_bytes
        );

        let docs = list_documents_impl(&state, None, None).unwrap();
        let indexed_legacy = docs.iter().find(|d| d.id == "legacy-unattributed-id").unwrap();
        assert_eq!(indexed_legacy.house_id, crate::models::DEFAULT_HOUSE_ID);
        assert_eq!(indexed_legacy.relative_path, "Poetry/Legacy_Unattributed.md");

        let indexed_attr = docs.iter().find(|d| d.id == "attributed-lore-id").unwrap();
        assert_eq!(indexed_attr.house_id, "house-archive-7");
        assert_eq!(indexed_attr.relative_path, "Lorebooks/Attributed_Lore.md");

        // 4. Rebuild SQLite index from scratch in a new Database instance from canonical Markdown files
        let rebuilt_db_path = dir.path().join("rebuilt_metadata.db");
        let rebuilt_state = AppState {
            storage: StorageManager::new(state.storage.get_root()),
            db: Mutex::new(Database::open(&rebuilt_db_path).unwrap()),
            db_path: rebuilt_db_path,
        };
        let rebuild_report = reindex_library_impl(&rebuilt_state).unwrap();
        assert!(rebuild_report.errors.is_empty());
        assert_eq!(rebuild_report.documents_indexed, 6);

        let rebuilt_docs = list_documents_impl(&rebuilt_state, None, None).unwrap();
        let rebuilt_legacy = rebuilt_docs
            .iter()
            .find(|d| d.id == "legacy-unattributed-id")
            .unwrap();
        assert_eq!(rebuilt_legacy.house_id, crate::models::DEFAULT_HOUSE_ID);

        let rebuilt_attr = rebuilt_docs
            .iter()
            .find(|d| d.id == "attributed-lore-id")
            .unwrap();
        assert_eq!(rebuilt_attr.house_id, "house-archive-7");
    }
    #[test]
    fn test_phase3a_house_scoped_document_creation() {
        let (_dir, state) = create_test_state();

        // 1. Omitted house_id defaults to house-default
        let doc_default = create_document_impl(
            &state,
            "poetry".to_string(),
            "Default Verse".to_string(),
            None,
            Some("Default content".to_string()),
            None,
            None,
            None,
        ).unwrap();
        assert_eq!(doc_default.metadata.house_id, crate::models::DEFAULT_HOUSE_ID);

        // 2. Explicit house-default
        let doc_explicit_default = create_document_impl(
            &state,
            "philosophy".to_string(),
            "Default Phil".to_string(),
            None,
            None,
            None,
            None,
            Some(crate::models::DEFAULT_HOUSE_ID.to_string()),
        ).unwrap();
        assert_eq!(doc_explicit_default.metadata.house_id, crate::models::DEFAULT_HOUSE_ID);

        // 3. Register a custom House with only Poetry enabled, manuscript tools disabled
        let custom_house = crate::models::HouseRecord {
            id: "house-poetry-only".to_string(),
            name: "Poetry Only House".to_string(),
            description: Some("A house only for poetry".to_string()),
            color: crate::models::default_house_color(),
            icon: crate::models::default_house_icon(),
            archived: false,
            created_at: "2026-10-22T00:00:00Z".to_string(),
            updated_at: "2026-10-22T00:00:00Z".to_string(),
            enabled_studios: vec![crate::models::AuthoringStudio::Poetry],
            manuscript_tools_enabled: false,
            universe_ids: vec![],
        };
        state.storage.mutate_house_registry(|registry| {
            registry.houses.push(custom_house.clone());
            Ok(())
        }).unwrap();

        // 4. Creation in custom house succeeds for enabled studio
        let doc_custom = create_document_impl(
            &state,
            "poetry".to_string(),
            "Custom Poem".to_string(),
            None,
            Some("Lines of custom verse".to_string()),
            None,
            None,
            Some("house-poetry-only".to_string()),
        ).unwrap();
        assert_eq!(doc_custom.metadata.house_id, "house-poetry-only");
        // Verify canonical frontmatter on disk
        let on_disk = state.storage.read_document(&doc_custom.metadata.relative_path).unwrap();
        assert_eq!(on_disk.metadata.house_id, "house-poetry-only");

        // 5. Creation in custom house fails for disabled studio (Philosophy)
        let disabled_studio_err = create_document_impl(
            &state,
            "philosophy".to_string(),
            "Rejected Philosophy".to_string(),
            None,
            None,
            None,
            None,
            Some("house-poetry-only".to_string()),
        );
        assert!(disabled_studio_err.is_err());
        let err_msg = disabled_studio_err.unwrap_err(); assert!(err_msg.contains("Authoring studio") && err_msg.contains("is disabled"));

        // 6. Creation in custom house fails when manuscript tools is disabled
        let disabled_manuscript_err = create_document_impl(
            &state,
            "manuscript".to_string(),
            "Rejected Manuscript".to_string(),
            None,
            None,
            None,
            None,
            Some("house-poetry-only".to_string()),
        );
        assert!(disabled_manuscript_err.is_err());
        assert!(disabled_manuscript_err.unwrap_err().contains("Manuscript Tools is disabled"));

        // 7. Unknown house returns error
        let unknown_house_err = create_document_impl(
            &state,
            "poetry".to_string(),
            "Ghost Poem".to_string(),
            None,
            None,
            None,
            None,
            Some("house-nonexistent".to_string()),
        );
        assert!(unknown_house_err.is_err());
        assert!(unknown_house_err.unwrap_err().contains("House with ID 'house-nonexistent' not found"));

        // 8. Archived house returns error
        state.storage.mutate_house_registry(|reg_archive| {
            reg_archive.houses.iter_mut().find(|h| h.id == "house-poetry-only").unwrap().archived = true;
            Ok(())
        }).unwrap();

        let archived_house_err = create_document_impl(
            &state,
            "poetry".to_string(),
            "Archived Verse".to_string(),
            None,
            None,
            None,
            None,
            Some("house-poetry-only".to_string()),
        );
        assert!(archived_house_err.is_err());
        assert!(archived_house_err.unwrap_err().contains("is archived"));
    }

    #[test]
    fn test_phase3a_house_scoped_listing_and_search() {
        let (_dir, state) = create_test_state();

        // Create a custom active house and an archived house
        state.storage.mutate_house_registry(|registry| {
            registry.houses.push(crate::models::HouseRecord {
                id: "house-beta".to_string(),
                name: "Beta House".to_string(),
                description: Some("Beta House".to_string()),
                color: crate::models::default_house_color(),
                icon: crate::models::default_house_icon(),
                archived: false,
                created_at: "2026-10-22T00:00:00Z".to_string(),
                updated_at: "2026-10-22T00:00:00Z".to_string(),
                enabled_studios: vec![crate::models::AuthoringStudio::Poetry, crate::models::AuthoringStudio::Philosophy],
                manuscript_tools_enabled: true,
                universe_ids: vec![],
            });
            registry.houses.push(crate::models::HouseRecord {
                id: "house-archive".to_string(),
                name: "Archived House".to_string(),
                description: Some("Archived House".to_string()),
                color: crate::models::default_house_color(),
                icon: crate::models::default_house_icon(),
                archived: true,
                created_at: "2026-10-22T00:00:00Z".to_string(),
                updated_at: "2026-10-22T00:00:00Z".to_string(),
                enabled_studios: vec![crate::models::AuthoringStudio::Poetry],
                manuscript_tools_enabled: false,
                universe_ids: vec![],
            });
            Ok(())
        }).unwrap();

        // Create docs in default house
        create_document_impl(&state, "poetry".to_string(), "Default Stars".to_string(), None, Some("Gazing at the moon and stars".to_string()), None, None, None).unwrap();
        create_document_impl(&state, "philosophy".to_string(), "Default Logic".to_string(), None, Some("Moon reflection logic".to_string()), None, None, None).unwrap();

        // Create doc in beta house
        create_document_impl(&state, "poetry".to_string(), "Beta Cosmos".to_string(), None, Some("Moon over beta cosmos".to_string()), None, None, Some("house-beta".to_string())).unwrap();

        // Create file manually in archived house
        let archive_doc_path = state.storage.get_root().join("Poetry/Archive Moon.md");
        let archive_doc_bytes = r#"---json
{
  "id": "archive-doc-id",
  "title": "Archive Moon",
  "type": "poetry",
  "house_id": "house-archive",
  "created_at": "2026-10-22T00:00:00Z",
  "updated_at": "2026-10-22T00:00:00Z",
  "tags": []
}
---
The archived moon shines."#;
        std::fs::write(&archive_doc_path, archive_doc_bytes).unwrap();
        reindex_library_impl(&state).unwrap();

        // 1. Global listing returns all 4 docs
        let global_list = list_documents_impl(&state, None, None).unwrap();
        assert_eq!(global_list.len(), 4);

        // 2. House-scoped listing for house-default returns 2 docs
        let default_list = list_documents_impl(&state, None, Some(crate::models::DEFAULT_HOUSE_ID.to_string())).unwrap();
        assert_eq!(default_list.len(), 2);
        assert!(default_list.iter().all(|d| d.house_id == crate::models::DEFAULT_HOUSE_ID));

        // 3. House-scoped listing for house-beta returns 1 doc
        let beta_list = list_documents_impl(&state, None, Some("house-beta".to_string())).unwrap();
        assert_eq!(beta_list.len(), 1);
        assert_eq!(beta_list[0].title, "Beta Cosmos");

        // 4. House-scoped listing for archived house allows read-only discovery
        let archive_list = list_documents_impl(&state, None, Some("house-archive".to_string())).unwrap();
        assert_eq!(archive_list.len(), 1);
        assert_eq!(archive_list[0].id, "archive-doc-id");

        // 5. Unknown house listing returns error
        let unknown_list_err = list_documents_impl(&state, None, Some("house-unknown".to_string()));
        assert!(unknown_list_err.is_err());
        assert!(unknown_list_err.unwrap_err().contains("House with ID 'house-unknown' not found"));

        // 6. House-scoped listing + studio filter intersection
        let beta_poetry = list_documents_impl(&state, Some("poetry".to_string()), Some("house-beta".to_string())).unwrap();
        assert_eq!(beta_poetry.len(), 1);
        let beta_phil = list_documents_impl(&state, Some("philosophy".to_string()), Some("house-beta".to_string())).unwrap();
        assert_eq!(beta_phil.len(), 0);

        // 7. Global search returns moon across all houses
        let global_search = search_documents_impl(&state, "moon".to_string(), None, None).unwrap();
        assert_eq!(global_search.len(), 4);

        // 8. Scoped search for house-beta returns 1 match
        let beta_search = search_documents_impl(&state, "moon".to_string(), None, Some("house-beta".to_string())).unwrap();
        assert_eq!(beta_search.len(), 1);
        assert_eq!(beta_search[0].title, "Beta Cosmos");

        // 9. Unknown house search returns error
        let unknown_search_err = search_documents_impl(&state, "moon".to_string(), None, Some("house-unknown".to_string()));
        assert!(unknown_search_err.is_err());
    }

    #[test]
    fn test_phase3a_integrity_inspection() {
        let (_dir, state) = create_test_state();

        // 1. Initial state has clean integrity
        let initial_report = inspect_house_integrity_impl(&state).unwrap();
        assert!(initial_report.is_healthy());
        assert_eq!(initial_report.issues.len(), 0);

        // 2. Add an orphaned document (house_id not in registry)
        let orphan_path = state.storage.get_root().join("Poetry/Orphan.md");
        let orphan_bytes = r#"---json
{
  "id": "orphan-doc-id",
  "title": "Orphan Poem",
  "type": "poetry",
  "house_id": "house-deleted-99",
  "created_at": "2026-10-22T00:00:00Z",
  "updated_at": "2026-10-22T00:00:00Z",
  "tags": []
}
---
Orphan poem."#;
        std::fs::write(&orphan_path, orphan_bytes).unwrap();

        // 3. Add a malformed house_id document (empty string)
        let malformed_path = state.storage.get_root().join("Poetry/Malformed.md");
        let malformed_bytes = r#"---json
{
  "id": "malformed-doc-id",
  "title": "Malformed Poem",
  "type": "poetry",
  "house_id": "   ",
  "created_at": "2026-10-22T00:00:00Z",
  "updated_at": "2026-10-22T00:00:00Z",
  "tags": []
}
---
Malformed poem."#;
        std::fs::write(&malformed_path, malformed_bytes).unwrap();

        // Reindex to load into SQLite
        reindex_library_impl(&state).unwrap();

        // Inspect integrity
        let report = inspect_house_integrity_impl(&state).unwrap();
        assert!(!report.is_healthy());
        assert!(report.issues.iter().any(|i| i.issue_type == crate::models::IntegrityIssueType::OrphanedHouseId && i.document_id.as_deref() == Some("orphan-doc-id")));
        assert!(report.issues.iter().any(|i| i.issue_type == crate::models::IntegrityIssueType::MalformedHouseId && i.document_id.as_deref() == Some("malformed-doc-id")));

        // Verify disk files were NOT modified (read-only verification)
        assert_eq!(std::fs::read_to_string(&orphan_path).unwrap(), orphan_bytes);
        assert_eq!(std::fs::read_to_string(&malformed_path).unwrap(), malformed_bytes);
    }

    #[test]
    fn test_phase3a_contract_correction_create_document() {
        let (_dir, state) = create_test_state();

        // 1. None defaults to house-default
        let doc1 = create_document_impl(
            &state, "poetry".to_string(), "Doc 1".to_string(), None, None, None, None, None
        ).unwrap();
        assert_eq!(doc1.metadata.house_id, "house-default");

        // 2. Explicit house-default succeeds
        let doc2 = create_document_impl(
            &state, "poetry".to_string(), "Doc 2".to_string(), None, None, None, None, Some("house-default".to_string())
        ).unwrap();
        assert_eq!(doc2.metadata.house_id, "house-default");

        // 3. Empty string returns validation error
        let err_empty = create_document_impl(
            &state, "poetry".to_string(), "Doc 3".to_string(), None, None, None, None, Some("".to_string())
        );
        assert!(err_empty.is_err());
        assert!(err_empty.unwrap_err().contains("Malformed target House ID: ''"));

        // 4. Whitespace string returns validation error
        let err_ws = create_document_impl(
            &state, "poetry".to_string(), "Doc 4".to_string(), None, None, None, None, Some("   ".to_string())
        );
        assert!(err_ws.is_err());
        assert!(err_ws.unwrap_err().contains("Malformed target House ID: '   '"));

        // 5. Malformed prefix returns validation error
        let err_malformed = create_document_impl(
            &state, "poetry".to_string(), "Doc 5".to_string(), None, None, None, None, Some("not-a-house".to_string())
        );
        assert!(err_malformed.is_err());
        assert!(err_malformed.unwrap_err().contains("Malformed target House ID: 'not-a-house'"));
    }

    #[test]
    fn test_phase3b1_safe_single_document_move() {
        let (_dir, state) = create_test_state();

        // Setup houses
        let house_sol = create_house_impl(&state, CreateHouseInput {
            name: "House Sol".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Poetry, crate::models::AuthoringStudio::Philosophy]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        let house_luna = create_house_impl(&state, CreateHouseInput {
            name: "House Luna".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Poetry]),
            manuscript_tools_enabled: Some(false),
        }).unwrap();

        // Create poem in house-sol
        let original_content = "Lines of starlight written on paper.";
        let poem = create_document_impl(
            &state,
            "poetry".to_string(),
            "Sol Starlight".to_string(),
            None,
            Some(original_content.to_string()),
            None,
            Some(vec!["astronomy".to_string()]),
            Some(house_sol.id.clone()),
        ).unwrap();

        assert_eq!(poem.metadata.house_id, house_sol.id);
        let orig_path = poem.metadata.relative_path.clone();

        // Add unknown/custom frontmatter field to disk file
        let full_path = state.storage.resolve_safe_path(&orig_path).unwrap();
        let raw = std::fs::read_to_string(&full_path).unwrap();
        let updated_raw = raw.replace(
            r#""title": "Sol Starlight","#,
            "\"title\": \"Sol Starlight\",\n  \"custom_annotation\": \"ancient wisdom\",",
        );
        std::fs::write(&full_path, updated_raw).unwrap();

        // Move to house-luna
        let moved = move_document_to_house_impl(&state, poem.metadata.id.clone(), house_luna.id.clone()).unwrap();
        assert_eq!(moved.house_id, house_luna.id);
        assert_eq!(moved.relative_path, orig_path);
        assert_eq!(moved.title, "Sol Starlight");

        // Verify SQLite index
        let db = state.db.lock().unwrap();
        let db_meta = db.get_document_metadata(&poem.metadata.id).unwrap().unwrap();
        assert_eq!(db_meta.house_id, house_luna.id);
        drop(db);

        // Verify disk frontmatter & content
        let disk_doc = state.storage.read_document(&orig_path).unwrap();
        assert_eq!(disk_doc.metadata.house_id, house_luna.id);
        assert_eq!(disk_doc.content, original_content);

        // Verify unknown frontmatter field preserved
        let disk_raw = std::fs::read_to_string(&full_path).unwrap();
        assert!(disk_raw.contains(r#""custom_annotation": "ancient wisdom""#));

        // Idempotent move: moving to current house is safe no-op
        let noop = move_document_to_house_impl(&state, poem.metadata.id.clone(), house_luna.id.clone()).unwrap();
        assert_eq!(noop.house_id, house_luna.id);
    }

    #[test]
    fn test_phase3b1_move_validation_and_rejections() {
        let (_dir, state) = create_test_state();

        let house_alpha = create_house_impl(&state, CreateHouseInput {
            name: "House Alpha".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Poetry]),
            manuscript_tools_enabled: Some(false),
        }).unwrap();

        let house_beta = create_house_impl(&state, CreateHouseInput {
            name: "House Beta".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Philosophy]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        let house_archived = create_house_impl(&state, CreateHouseInput {
            name: "House Archived".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Poetry, crate::models::AuthoringStudio::Philosophy]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();
        archive_house_impl(&state, house_archived.id.clone()).unwrap();

        let poem = create_document_impl(
            &state, "poetry".to_string(), "Alpha Poem".to_string(), None, None, None, None, Some(house_alpha.id.clone())
        ).unwrap();

        // 1. Malformed house ID
        let err_malformed = move_document_to_house_impl(&state, poem.metadata.id.clone(), "bad-id".to_string());
        assert!(err_malformed.is_err());
        assert!(err_malformed.unwrap_err().contains("Malformed target House ID"));

        // 2. Non-existent house
        let err_notfound = move_document_to_house_impl(&state, poem.metadata.id.clone(), "house-ghost".to_string());
        assert!(err_notfound.is_err());
        assert!(err_notfound.unwrap_err().contains("House with ID 'house-ghost' not found"));

        // 3. Archived house
        let err_archived = move_document_to_house_impl(&state, poem.metadata.id.clone(), house_archived.id.clone());
        assert!(err_archived.is_err());
        assert!(err_archived.unwrap_err().contains("is archived"));

        // 4. Studio disabled in target house (moving Poetry doc to house_beta which only has Philosophy)
        let err_studio = move_document_to_house_impl(&state, poem.metadata.id.clone(), house_beta.id.clone());
        assert!(err_studio.is_err());
        assert!(err_studio.unwrap_err().contains("Authoring studio 'poetry' is disabled for House 'House Beta'"));

        // 5. Manuscript tools disabled in target house
        let ms = create_document_impl(
            &state, "manuscript".to_string(), "Beta Manuscript".to_string(), None, None, None, None, Some(house_beta.id.clone())
        ).unwrap();
        let err_ms = move_document_to_house_impl(&state, ms.metadata.id.clone(), house_alpha.id.clone());
        assert!(err_ms.is_err());
        assert!(err_ms.unwrap_err().contains("Manuscript Tools is disabled for House 'House Alpha'"));

        // 6. Cannot move Web of Thought planning catalog
        let catalog_detail = create_document_impl(
            &state,
            "lorebook".to_string(),
            "_web_of_thought".to_string(),
            None,
            None,
            Some(r#"{"_web_of_thought":{"version":1,"revision":1,"universes":[],"entities":[],"relationships":[]}}"#.to_string()),
            None,
            None,
        ).unwrap();
        let err_catalog = move_document_to_house_impl(&state, catalog_detail.metadata.id.clone(), house_beta.id.clone());
        assert!(err_catalog.is_err());
        assert!(err_catalog.unwrap_err().contains("Cannot move the shared Web of Thought planning catalog"));
    }

    #[test]
    fn test_phase3b1_lorebook_universe_ownership_move_rules() {
        let (_dir, state) = create_test_state();

        let house_realm_a = create_house_impl(&state, CreateHouseInput {
            name: "Realm A".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Lorebook]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        let house_realm_b = create_house_impl(&state, CreateHouseInput {
            name: "Realm B".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Lorebook]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        // Assign universe uni-valenrift to Realm A
        state.storage.assign_universe_to_house("uni-valenrift", &house_realm_a.id).unwrap();

        // Create Lorebook entity associated with uni-valenrift in Realm A
        let entity = create_document_impl(
            &state,
            "lorebook".to_string(),
            "Aethelgard Citadel".to_string(),
            None,
            Some("Ancient sanctuary.".to_string()),
            Some(r#"{"universe_id":"uni-valenrift","entity_type":"Location"}"#.to_string()),
            None,
            Some(house_realm_a.id.clone()),
        ).unwrap();

        // Attempting to move entity away from its owning universe's house fails
        let err_move = move_document_to_house_impl(&state, entity.metadata.id.clone(), house_realm_b.id.clone());
        assert!(err_move.is_err());
        assert!(err_move.unwrap_err().contains("entity belongs to Universe 'uni-valenrift' which is owned by House"));

        // Standalone Lorebook entity (no universe) can move freely
        let standalone = create_document_impl(
            &state,
            "lorebook".to_string(),
            "Wandering Merchant".to_string(),
            None,
            Some("A nomad.".to_string()),
            Some(r#"{"entity_type":"Character"}"#.to_string()),
            None,
            Some(house_realm_a.id.clone()),
        ).unwrap();

        let moved_standalone = move_document_to_house_impl(&state, standalone.metadata.id.clone(), house_realm_b.id.clone()).unwrap();
        assert_eq!(moved_standalone.house_id, house_realm_b.id);
    }

    #[test]
    fn test_phase3b1_integrity_scanner_mismatch_and_missing_file_detection() {
        let (_dir, state) = create_test_state();

        let house_dawn = create_house_impl(&state, CreateHouseInput {
            name: "House Dawn".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Poetry]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        let doc = create_document_impl(
            &state, "poetry".to_string(), "Dawn Chant".to_string(), None, None, None, None, Some(house_dawn.id.clone())
        ).unwrap();

        // 1. Normal state has clean report
        let report_clean = inspect_house_integrity_impl(&state).unwrap();
        assert!(report_clean.is_healthy());
        assert_eq!(report_clean.canonical_index_mismatch_count, 0);
        assert_eq!(report_clean.missing_canonical_file_count, 0);

        // 2. Artificially tamper with SQLite index to simulate an index-disk mismatch
        {
            let mut db = state.db.lock().unwrap();
            let mut tampered_meta = doc.metadata.clone();
            tampered_meta.house_id = "house-default".to_string();
            db.upsert_document(&tampered_meta).unwrap();
        }

        let report_mismatch = inspect_house_integrity_impl(&state).unwrap();
        assert!(!report_mismatch.is_healthy());
        assert_eq!(report_mismatch.canonical_index_mismatch_count, 1);
        assert!(report_mismatch.issues.iter().any(|i| i.issue_type == crate::models::IntegrityIssueType::CanonicalIndexMismatch));

        // Reindex repairs SQLite from disk frontmatter
        reindex_library_impl(&state).unwrap();
        let report_repaired = inspect_house_integrity_impl(&state).unwrap();
        assert!(report_repaired.is_healthy());

        // 3. Artificially delete canonical file from disk while SQLite still has it
        let disk_file = state.storage.resolve_safe_path(&doc.metadata.relative_path).unwrap();
        std::fs::remove_file(&disk_file).unwrap();

        let report_missing = inspect_house_integrity_impl(&state).unwrap();
        assert!(!report_missing.is_healthy());
        assert_eq!(report_missing.missing_canonical_file_count, 1);
        assert!(report_missing.issues.iter().any(|i| i.issue_type == crate::models::IntegrityIssueType::MissingCanonicalFile));
    }

    #[test]
    fn test_phase3b1_hardening_stale_index_and_canonical_authority() {
        let (_dir, state) = create_test_state();

        let house_a = create_house_impl(&state, CreateHouseInput {
            name: "House A".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Poetry]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        let house_b = create_house_impl(&state, CreateHouseInput {
            name: "House B".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Poetry]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        let doc = create_document_impl(
            &state,
            "poetry".to_string(),
            "Canonical Authority".to_string(),
            None,
            Some("Verse body.".to_string()),
            None,
            None,
            Some(house_a.id.clone()),
        ).unwrap();

        let full_path = state.storage.resolve_safe_path(&doc.metadata.relative_path).unwrap();

        // 1. Stale SQLite matches target (house_b) while canonical disk still has house_a:
        // Move to house_b MUST NOT early-return; it must update canonical disk to house_b.
        {
            let mut db = state.db.lock().unwrap();
            let mut stale_meta = doc.metadata.clone();
            stale_meta.house_id = house_b.id.clone();
            db.upsert_document(&stale_meta).unwrap();
        }
        assert_eq!(state.storage.read_document(&doc.metadata.relative_path).unwrap().metadata.house_id, house_a.id);

        let moved_to_b = move_document_to_house_impl(&state, doc.metadata.id.clone(), house_b.id.clone()).unwrap();
        assert_eq!(moved_to_b.house_id, house_b.id);
        assert_eq!(state.storage.read_document(&doc.metadata.relative_path).unwrap().metadata.house_id, house_b.id);

        // 2. Canonical disk already has target (house_b), while SQLite is stale (house_a):
        // Same-House move to house_b MUST reconcile SQLite without rewriting disk bytes.
        {
            let mut db = state.db.lock().unwrap();
            let mut stale_meta = moved_to_b.clone();
            stale_meta.house_id = house_a.id.clone();
            db.upsert_document(&stale_meta).unwrap();
        }
        let disk_bytes_before = std::fs::read(&full_path).unwrap();
        let reconciled = move_document_to_house_impl(&state, doc.metadata.id.clone(), house_b.id.clone()).unwrap();
        assert_eq!(reconciled.house_id, house_b.id);
        assert_eq!(std::fs::read(&full_path).unwrap(), disk_bytes_before);
        {
            let db = state.db.lock().unwrap();
            assert_eq!(db.get_document_metadata(&doc.metadata.id).unwrap().unwrap().house_id, house_b.id);
        }

        // 3. Missing or corrupted canonical file on same-House move MUST fail (not return Ok from SQLite)
        let saved_bytes = std::fs::read(&full_path).unwrap();
        std::fs::write(&full_path, "---json\n{\"id\":\"unterminated\"}").unwrap();
        let corrupt_err = move_document_to_house_impl(&state, doc.metadata.id.clone(), house_b.id.clone()).unwrap_err();
        assert!(corrupt_err.contains("Unterminated document frontmatter"));
        std::fs::remove_file(&full_path).unwrap();
        let missing_err = move_document_to_house_impl(&state, doc.metadata.id.clone(), house_b.id.clone()).unwrap_err();
        assert!(missing_err.contains("Document file not found"));
        std::fs::write(&full_path, &saved_bytes).unwrap();

        // 4. Archived source House rejects move until restored
        archive_house_impl(&state, house_b.id.clone()).unwrap();
        let archived_src_err = move_document_to_house_impl(&state, doc.metadata.id.clone(), house_a.id.clone()).unwrap_err();
        assert!(archived_src_err.contains("current owning House"));
        assert!(archived_src_err.contains("is archived"));
        restore_house_impl(&state, house_b.id.clone()).unwrap();

        // 5. Unknown (orphaned) source House rejects move
        let orphan_raw = std::fs::read_to_string(&full_path).unwrap().replace(&house_b.id, "house-unknown-origin");
        std::fs::write(&full_path, orphan_raw).unwrap();
        let orphan_src_err = move_document_to_house_impl(&state, doc.metadata.id.clone(), house_a.id.clone()).unwrap_err();
        assert!(orphan_src_err.contains("is unknown (orphaned)"));
    }

    #[test]
    fn test_phase3b1_hardening_backend_save_rename_external_edits_and_raw_imports() {
        let (_dir, state) = create_test_state();

        let house_a = create_house_impl(&state, CreateHouseInput {
            name: "House A".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Poetry]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        let house_b = create_house_impl(&state, CreateHouseInput {
            name: "House B".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Poetry]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        let doc = create_document_impl(
            &state,
            "poetry".to_string(),
            "Backend Safety".to_string(),
            None,
            Some("Initial lines.".to_string()),
            None,
            Some(vec!["initial".to_string()]),
            Some(house_a.id.clone()),
        ).unwrap();

        // 1. External modification to body, tags, and custom frontmatter before move:
        // Both canonical disk and SQLite must preserve the external edits after move.
        let full_path = state.storage.resolve_safe_path(&doc.metadata.relative_path).unwrap();
        let raw = std::fs::read_to_string(&full_path).unwrap();
        let ext_raw = raw
            .replace("\"initial\"", "\"initial\", \"external-tag\"")
            .replace("\"title\": \"Backend Safety\",", "\"title\": \"Backend Safety\",\n  \"external_field\": 42,")
            .replace("Initial lines.", "Externally edited lines.");
        std::fs::write(&full_path, ext_raw).unwrap();

        let moved = move_document_to_house_impl(&state, doc.metadata.id.clone(), house_b.id.clone()).unwrap();
        assert_eq!(moved.house_id, house_b.id);
        assert_eq!(moved.tags, vec!["initial".to_string(), "external-tag".to_string()]);
        {
            let db = state.db.lock().unwrap();
            let indexed = db.get_document_metadata(&doc.metadata.id).unwrap().unwrap();
            assert_eq!(indexed.house_id, house_b.id);
            assert_eq!(indexed.tags, vec!["external-tag".to_string(), "initial".to_string()]);
        }
        let reloaded = state.storage.read_document(&doc.metadata.relative_path).unwrap();
        assert_eq!(reloaded.content, "Externally edited lines.");

        // 2. Simulate stale SQLite after interrupted index update (SQLite still says house_a, disk says house_b):
        // Direct backend save_document_impl and rename_document_impl MUST preserve canonical house_b!
        {
            let mut db = state.db.lock().unwrap();
            let mut stale = moved.clone();
            stale.house_id = house_a.id.clone();
            db.upsert_document(&stale).unwrap();
        }
        let after_save = save_document_impl(
            &state,
            doc.metadata.id.clone(),
            "Saved after move.".to_string(),
            None,
            None,
            None,
        ).unwrap();
        assert_eq!(after_save.house_id, house_b.id);
        assert_eq!(state.storage.read_document(&doc.metadata.relative_path).unwrap().metadata.house_id, house_b.id);

        // Tamper SQLite again and verify rename_document_impl also preserves canonical house_b
        {
            let mut db = state.db.lock().unwrap();
            let mut stale = after_save.clone();
            stale.house_id = house_a.id.clone();
            db.upsert_document(&stale).unwrap();
        }
        let after_rename = rename_document_impl(&state, doc.metadata.id.clone(), "Backend Safety Renamed".to_string()).unwrap();
        assert_eq!(after_rename.house_id, house_b.id);
        assert_eq!(state.storage.read_document(&after_rename.relative_path).unwrap().metadata.house_id, house_b.id);

        // 3. Legacy raw Markdown import (no initial frontmatter) can be moved while keeping stable indexed ID and content
        let raw_import_path = state.storage.get_root().join("Poetry/Raw_Import.md");
        std::fs::write(&raw_import_path, "Raw imported verse without frontmatter.").unwrap();
        reindex_library_impl(&state).unwrap();
        let imported_meta = list_documents_impl(&state, Some("poetry".to_string()), None)
            .unwrap()
            .into_iter()
            .find(|d| d.relative_path == "Poetry/Raw_Import.md")
            .unwrap();
        assert_eq!(imported_meta.house_id, "house-default");

        let moved_import = move_document_to_house_impl(&state, imported_meta.id.clone(), house_b.id.clone()).unwrap();
        assert_eq!(moved_import.id, imported_meta.id);
        assert_eq!(moved_import.house_id, house_b.id);
        let disk_import = state.storage.read_document("Poetry/Raw_Import.md").unwrap();
        assert_eq!(disk_import.metadata.id, imported_meta.id);
        assert_eq!(disk_import.metadata.house_id, house_b.id);
        assert_eq!(disk_import.content, "Raw imported verse without frontmatter.");
    }

    #[test]
    fn test_phase3b1_hardening_lorebook_lookup_failure_never_infers_standalone() {
        let (_dir, state) = create_test_state();

        let house_lore = create_house_impl(&state, CreateHouseInput {
            name: "House Lore".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Lorebook]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        // 1. Lorebook entity with unresolved legacy "universe" name must NOT be treated as standalone
        let unresolved_entity = create_document_impl(
            &state,
            "lorebook".to_string(),
            "Lost Relic".to_string(),
            None,
            Some("Relic description.".to_string()),
            Some(r#"{"universe":"Unregistered Cosmos","entry_type":"item"}"#.to_string()),
            None,
            None,
        ).unwrap();

        let err_unresolved = move_document_to_house_impl(&state, unresolved_entity.metadata.id.clone(), house_lore.id.clone()).unwrap_err();
        assert!(err_unresolved.contains("Cannot resolve Lorebook entity 'Lost Relic' universe 'Unregistered Cosmos' against the planning catalog"));

        // 2. Corrupted / unterminated Lorebook file in Lorebooks/ blocks Lorebook moves rather than silently returning None
        let standalone = create_document_impl(
            &state,
            "lorebook".to_string(),
            "Valid Standalone".to_string(),
            None,
            Some("Standalone description.".to_string()),
            Some(r#"{"entry_type":"character"}"#.to_string()),
            None,
            None,
        ).unwrap();

        let broken_catalog_path = state.storage.get_root().join("Lorebooks/Web_of_Thought_broken.md");
        std::fs::write(&broken_catalog_path, "---json\n{\"id\":\"broken\"}").unwrap();

        let err_corrupt_cat = move_document_to_house_impl(&state, standalone.metadata.id.clone(), house_lore.id.clone()).unwrap_err();
        assert!(err_corrupt_cat.contains("Unterminated Lorebook frontmatter"));

        // Removing the corrupted file allows the valid standalone entity to move cleanly
        std::fs::remove_file(&broken_catalog_path).unwrap();
        let moved = move_document_to_house_impl(&state, standalone.metadata.id.clone(), house_lore.id.clone()).unwrap();
        assert_eq!(moved.house_id, house_lore.id);
    }

    #[test]
    fn test_phase3b2_successful_universe_move_and_attribution() {
        let (_dir, state) = create_test_state();

        let house_a = create_house_impl(&state, CreateHouseInput {
            name: "House A".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Lorebook, crate::models::AuthoringStudio::Poetry]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        let house_b = create_house_impl(&state, CreateHouseInput {
            name: "House B".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Lorebook]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        // 1. Create Web of Thought catalog with Universe uni-eryndor and uni-other
        let mut plan = crate::thought::Plan {
            version: 1,
            revision: 0,
            universes: vec![
                crate::thought::Universe {
                    id: "uni-eryndor".to_string(),
                    name: "Eryndor Realm".to_string(),
                    description: Some("Fantasy realm".to_string()),
                    archived: false,
                },
                crate::thought::Universe {
                    id: "uni-other".to_string(),
                    name: "Other Cosmos".to_string(),
                    description: None,
                    archived: false,
                },
            ],
            books: vec![
                crate::thought::Book {
                    id: "book-chronicles".to_string(),
                    universe_id: "uni-eryndor".to_string(),
                    name: "Chronicles of Eryndor".to_string(),
                    continuity: "canonical".to_string(),
                    description: None,
                    archived: false,
                },
            ],
            entities: vec![],
            nodes: vec![],
            relationships: vec![],
        };

        crate::thought::save_impl(&state, 0, plan.clone()).unwrap();

        // Assign uni-eryndor and uni-other to House A
        state.storage.assign_universe_to_house("uni-eryndor", &house_a.id).unwrap();
        state.storage.assign_universe_to_house("uni-other", &house_a.id).unwrap();

        // 2. Create Lorebook entities belonging to uni-eryndor in House A
        let doc1 = create_document_impl(
            &state,
            "lorebook".to_string(),
            "Valenrift Spire".to_string(),
            None,
            Some("Ancient crystal spire standing tall.".to_string()),
            Some(r#"{"universe_id":"uni-eryndor","entry_type":"location"}"#.to_string()),
            Some(vec!["landmark".to_string(), "crystal".to_string()]),
            Some(house_a.id.clone()),
        ).unwrap();

        let doc2 = create_document_impl(
            &state,
            "lorebook".to_string(),
            "Lord Cynthia".to_string(),
            None,
            Some("Guardian of the spire.".to_string()),
            None,
            Some(vec!["guardian".to_string()]),
            Some(house_a.id.clone()),
        ).unwrap();

        // Link doc2 in plan.entities and add node/relationship
        let thought = crate::thought::get_impl(&state).unwrap();
        plan = thought.plan.unwrap();
        plan.entities.push(crate::thought::Entity {
            id: doc1.metadata.id.clone(),
            universe_id: "uni-eryndor".to_string(),
        });
        plan.entities.push(crate::thought::Entity {
            id: doc2.metadata.id.clone(),
            universe_id: "uni-eryndor".to_string(),
        });
        plan.relationships.push(crate::thought::Relationship {
            id: "rel-guard".to_string(),
            universe_id: "uni-eryndor".to_string(),
            book_id: Some("book-chronicles".to_string()),
            source_id: doc2.metadata.id.clone(),
            target_id: doc1.metadata.id.clone(),
            label: "Guards".to_string(),
            description: "Guardian relation".to_string(),
            directed: true,
            context_node_id: None,
            archived: false,
        });
        crate::thought::save_impl(&state, plan.revision, plan).unwrap();

        // Create an entity in uni-other in House A and a poem in House A
        let doc_other = create_document_impl(
            &state,
            "lorebook".to_string(),
            "Alien Artifact".to_string(),
            None,
            Some("Other universe item.".to_string()),
            Some(r#"{"universe_id":"uni-other","entry_type":"item"}"#.to_string()),
            None,
            Some(house_a.id.clone()),
        ).unwrap();

        let poem = create_document_impl(
            &state,
            "poetry".to_string(),
            "House A Ode".to_string(),
            None,
            Some("Stanza A.".to_string()),
            None,
            None,
            Some(house_a.id.clone()),
        ).unwrap();

        // 3. Move uni-eryndor from House A to House B
        let result = move_universe_to_house_impl(&state, "uni-eryndor".to_string(), house_b.id.clone()).unwrap();
        assert_eq!(result.universe_id, "uni-eryndor");
        assert_eq!(result.source_house_id, house_a.id);
        assert_eq!(result.target_house_id, house_b.id);
        assert_eq!(result.document_count, 2);
        assert!(result.moved_document_ids.contains(&doc1.metadata.id));
        assert!(result.moved_document_ids.contains(&doc2.metadata.id));

        // 4. Verify canonical disk files and SQLite index for moved documents
        let disk_doc1 = state.storage.read_document(&doc1.metadata.relative_path).unwrap();
        assert_eq!(disk_doc1.metadata.house_id, house_b.id);
        assert_eq!(disk_doc1.content, "Ancient crystal spire standing tall.");
        assert_eq!(disk_doc1.metadata.tags, vec!["landmark".to_string(), "crystal".to_string()]);

        let disk_doc2 = state.storage.read_document(&doc2.metadata.relative_path).unwrap();
        assert_eq!(disk_doc2.metadata.house_id, house_b.id);
        assert_eq!(disk_doc2.content, "Guardian of the spire.");

        {
            let db = state.db.lock().unwrap();
            assert_eq!(db.get_document_metadata(&doc1.metadata.id).unwrap().unwrap().house_id, house_b.id);
            assert_eq!(db.get_document_metadata(&doc2.metadata.id).unwrap().unwrap().house_id, house_b.id);
            // Verify unrelated documents in House A were not touched
            assert_eq!(db.get_document_metadata(&doc_other.metadata.id).unwrap().unwrap().house_id, house_a.id);
            assert_eq!(db.get_document_metadata(&poem.metadata.id).unwrap().unwrap().house_id, house_a.id);
        }

        // Verify registry
        let reg = state.storage.read_house_registry().unwrap();
        let reg_a = reg.houses.iter().find(|h| h.id == house_a.id).unwrap();
        let reg_b = reg.houses.iter().find(|h| h.id == house_b.id).unwrap();
        assert!(!reg_a.universe_ids.contains(&"uni-eryndor".to_string()));
        assert!(reg_a.universe_ids.contains(&"uni-other".to_string()));
        assert!(reg_b.universe_ids.contains(&"uni-eryndor".to_string()));

        // Verify Web of Thought catalog is completely intact and still in house-default
        let (cat_doc, cat_plan) = crate::thought::find_catalog_plan(&state).unwrap().unwrap();
        assert_eq!(cat_doc.metadata.house_id, crate::models::DEFAULT_HOUSE_ID);
        assert_eq!(cat_plan.universes.len(), 2);
        assert_eq!(cat_plan.books.len(), 1);
        assert_eq!(cat_plan.entities.len(), 2);
        assert_eq!(cat_plan.relationships.len(), 1);
        assert_eq!(cat_plan.relationships[0].label, "Guards");
    }

    #[test]
    fn test_phase3b2_validation_and_rejections() {
        let (_dir, state) = create_test_state();

        let house_a = create_house_impl(&state, CreateHouseInput {
            name: "House A".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Lorebook]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        let house_no_lore = create_house_impl(&state, CreateHouseInput {
            name: "House No Lore".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Poetry]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        let plan = crate::thought::Plan {
            version: 1,
            revision: 0,
            universes: vec![
                crate::thought::Universe {
                    id: "uni-cosmos".to_string(),
                    name: "Cosmos".to_string(),
                    description: None,
                    archived: false,
                },
            ],
            books: vec![],
            entities: vec![],
            nodes: vec![],
            relationships: vec![],
        };
        crate::thought::save_impl(&state, 0, plan).unwrap();
        state.storage.assign_universe_to_house("uni-cosmos", &house_a.id).unwrap();

        let entity = create_document_impl(
            &state,
            "lorebook".to_string(),
            "Star Nexus".to_string(),
            None,
            Some("Hub.".to_string()),
            Some(r#"{"universe_id":"uni-cosmos","entry_type":"location"}"#.to_string()),
            None,
            Some(house_a.id.clone()),
        ).unwrap();

        // 1. Target House with Lorebook disabled is rejected
        let err_no_lore = move_universe_to_house_impl(&state, "uni-cosmos".to_string(), house_no_lore.id.clone()).unwrap_err();
        assert!(err_no_lore.contains("Authoring studio 'lorebook' is disabled for House 'House No Lore'"));

        // 2. Archived target House is rejected
        archive_house_impl(&state, house_no_lore.id.clone()).unwrap();
        let err_archived_target = move_universe_to_house_impl(&state, "uni-cosmos".to_string(), house_no_lore.id.clone()).unwrap_err();
        assert!(err_archived_target.contains("Target House"));
        assert!(err_archived_target.contains("is archived"));

        // 3. Archived source House is rejected
        archive_house_impl(&state, house_a.id.clone()).unwrap();
        let house_c = create_house_impl(&state, CreateHouseInput {
            name: "House C".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Lorebook]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();
        let err_archived_source = move_universe_to_house_impl(&state, "uni-cosmos".to_string(), house_c.id.clone()).unwrap_err();
        assert!(err_archived_source.contains("current owning House"));
        assert!(err_archived_source.contains("is archived"));
        restore_house_impl(&state, house_a.id.clone()).unwrap();

        // 4. Unknown Universe ID rejected
        let err_unknown_uni = move_universe_to_house_impl(&state, "uni-nonexistent".to_string(), house_c.id.clone()).unwrap_err();
        assert!(err_unknown_uni.contains("Universe 'uni-nonexistent' does not exist in the Lorebook catalog"));

        // 5. Conflicting universe attribution rejected
        let conflict_entity = create_document_impl(
            &state,
            "lorebook".to_string(),
            "Conflicted Obelisk".to_string(),
            None,
            Some("Obelisk.".to_string()),
            Some(r#"{"universe_id":"uni-cosmos","entry_type":"location"}"#.to_string()),
            None,
            Some(house_a.id.clone()),
        ).unwrap();

        // Tamper catalog to specify a different universe for this entity
        let thought = crate::thought::get_impl(&state).unwrap();
        let mut p = thought.plan.unwrap();
        p.entities.push(crate::thought::Entity {
            id: conflict_entity.metadata.id.clone(),
            universe_id: "uni-cosmos".to_string(),
        });
        crate::thought::save_impl(&state, p.revision, p).unwrap();

        // Tamper metadata on disk to claim another universe
        let conflict_full_path = state.storage.resolve_safe_path(&conflict_entity.metadata.relative_path).unwrap();
        let raw_c = std::fs::read_to_string(&conflict_full_path).unwrap();
        std::fs::write(&conflict_full_path, raw_c.replace("uni-cosmos", "uni-other-universe")).unwrap();

        let err_conflict = move_universe_to_house_impl(&state, "uni-cosmos".to_string(), house_c.id.clone()).unwrap_err();
        assert!(err_conflict.contains("Conflicting Universe attribution"));

        // Restore file
        std::fs::write(&conflict_full_path, raw_c).unwrap();

        // 6. Same-House move succeeds as idempotent no-op without rewriting disk
        let disk_before = std::fs::read(state.storage.resolve_safe_path(&entity.metadata.relative_path).unwrap()).unwrap();
        let same_house = move_universe_to_house_impl(&state, "uni-cosmos".to_string(), house_a.id.clone()).unwrap();
        assert_eq!(same_house.source_house_id, house_a.id);
        assert_eq!(same_house.target_house_id, house_a.id);
        let disk_after = std::fs::read(state.storage.resolve_safe_path(&entity.metadata.relative_path).unwrap()).unwrap();
        assert_eq!(disk_before, disk_after);
    }

    #[test]
    fn test_phase3b2_journal_stages_and_recovery() {
        let (_dir, state) = create_test_state();

        let house_a = create_house_impl(&state, CreateHouseInput {
            name: "House A".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Lorebook]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        let house_b = create_house_impl(&state, CreateHouseInput {
            name: "House B".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Lorebook]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        let plan = crate::thought::Plan {
            version: 1,
            revision: 0,
            universes: vec![
                crate::thought::Universe {
                    id: "uni-interrupted".to_string(),
                    name: "Interrupted Universe".to_string(),
                    description: None,
                    archived: false,
                },
            ],
            books: vec![],
            entities: vec![],
            nodes: vec![],
            relationships: vec![],
        };
        crate::thought::save_impl(&state, 0, plan).unwrap();
        state.storage.assign_universe_to_house("uni-interrupted", &house_a.id).unwrap();

        let doc1 = create_document_impl(
            &state,
            "lorebook".to_string(),
            "Artifact Alpha".to_string(),
            None,
            Some("Alpha content.".to_string()),
            Some(r#"{"universe_id":"uni-interrupted","entry_type":"item"}"#.to_string()),
            None,
            Some(house_a.id.clone()),
        ).unwrap();

        let doc2 = create_document_impl(
            &state,
            "lorebook".to_string(),
            "Artifact Beta".to_string(),
            None,
            Some("Beta content.".to_string()),
            Some(r#"{"universe_id":"uni-interrupted","entry_type":"item"}"#.to_string()),
            None,
            Some(house_a.id.clone()),
        ).unwrap();

        // 1. Simulate interruption at Planned stage (journal written, no mutations occurred)
        let journal_planned = crate::models::UniverseMoveJournal {
            operation_id: "op-planned".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            stage: crate::models::UniverseMoveStage::Planned,
            universe_id: "uni-interrupted".to_string(),
            source_house_id: house_a.id.clone(),
            target_house_id: house_b.id.clone(),
            affected_documents: vec![],
        };
        state.storage.write_universe_move_journal(&journal_planned).unwrap();
        assert!(state.storage.has_pending_universe_move_journal().unwrap());

        // Recovery cleans up the planned journal with no side effects
        let rec_planned = recover_pending_universe_moves_impl(&state).unwrap();
        assert!(rec_planned.is_none());
        assert!(!state.storage.has_pending_universe_move_journal().unwrap());

        // 2. Simulate interruption mid-mutation:
        // Journal is in RegistryUpdated stage; doc1 is mutated to house_b on disk, doc2 is still house_a, SQLite not yet updated.
        state.storage.update_document_house_id(&doc1.metadata.relative_path, &house_b.id).unwrap();
        state.storage.reassign_universe_in_registry("uni-interrupted", &house_b.id).unwrap();

        let journal_interrupted = crate::models::UniverseMoveJournal {
            operation_id: "op-mid-flight".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            stage: crate::models::UniverseMoveStage::RegistryUpdated,
            universe_id: "uni-interrupted".to_string(),
            source_house_id: house_a.id.clone(),
            target_house_id: house_b.id.clone(),
            affected_documents: vec![
                crate::models::UniverseMoveDocumentEntry {
                    doc_id: doc1.metadata.id.clone(),
                    relative_path: doc1.metadata.relative_path.clone(),
                    original_house_id: house_a.id.clone(),
                    target_house_id: house_b.id.clone(),
                    status: crate::models::UniverseMoveDocStatus::Updated,
                },
                crate::models::UniverseMoveDocumentEntry {
                    doc_id: doc2.metadata.id.clone(),
                    relative_path: doc2.metadata.relative_path.clone(),
                    original_house_id: house_a.id.clone(),
                    target_house_id: house_b.id.clone(),
                    status: crate::models::UniverseMoveDocStatus::Pending,
                },
            ],
        };
        state.storage.write_universe_move_journal(&journal_interrupted).unwrap();

        // Integrity scanner detects incomplete move
        let integrity_report = inspect_house_integrity_impl(&state).unwrap();
        assert!(!integrity_report.is_healthy());
        assert_eq!(integrity_report.incomplete_universe_move_count, 1);
        assert!(integrity_report.issues.iter().any(|i| i.issue_type == crate::models::IntegrityIssueType::IncompleteUniverseMove));

        // Call recover_pending_universe_moves_impl to complete the move
        let recovered = recover_pending_universe_moves_impl(&state).unwrap().unwrap();
        assert_eq!(recovered.universe_id, "uni-interrupted");
        assert_eq!(recovered.source_house_id, house_a.id);
        assert_eq!(recovered.target_house_id, house_b.id);
        assert_eq!(recovered.document_count, 2);

        // Verify doc2 is now updated on disk and both are updated in SQLite
        let disk_doc2 = state.storage.read_document(&doc2.metadata.relative_path).unwrap();
        assert_eq!(disk_doc2.metadata.house_id, house_b.id);
        {
            let db = state.db.lock().unwrap();
            assert_eq!(db.get_document_metadata(&doc1.metadata.id).unwrap().unwrap().house_id, house_b.id);
            assert_eq!(db.get_document_metadata(&doc2.metadata.id).unwrap().unwrap().house_id, house_b.id);
        }
        assert!(!state.storage.has_pending_universe_move_journal().unwrap());

        // Repeated recovery is idempotent and returns None
        let second_rec = recover_pending_universe_moves_impl(&state).unwrap();
        assert!(second_rec.is_none());

        // Integrity check is now healthy
        let clean_integrity = inspect_house_integrity_impl(&state).unwrap();
        assert!(clean_integrity.is_healthy());
    }

    #[test]
    fn test_phase3b2_vault_blocks_interrupted_universe_move() {
        let (_dir, state) = create_test_state();
        let backup_temp = tempfile::tempdir().unwrap();
        let backup_folder = backup_temp.path().to_path_buf();

        // Write an incomplete journal
        let journal = crate::models::UniverseMoveJournal {
            operation_id: "op-pending".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            stage: crate::models::UniverseMoveStage::RegistryUpdated,
            universe_id: "uni-valenrift".to_string(),
            source_house_id: "house-default".to_string(),
            target_house_id: "house-custom".to_string(),
            affected_documents: vec![],
        };
        state.storage.write_universe_move_journal(&journal).unwrap();

        // Vault backup MUST fail safely while journal exists
        let backup_err = crate::vault::create_backup(&state, &backup_folder).unwrap_err();
        assert!(backup_err.contains("Cannot create Vault backup while a Universe move operation is incomplete or pending recovery"));

        // Remove journal (simulating recovery completion)
        state.storage.remove_universe_move_journal().unwrap();

        // Now Vault backup succeeds cleanly
        let preview = crate::vault::create_backup(&state, &backup_folder).unwrap();
        assert!(preview.total_bytes >= 1);
    }

    #[test]
    fn test_phase_a_assign_universe_to_house_and_unassigned_diagnostics() {
        let (_dir, state) = create_test_state();

        let house_a = create_house_impl(&state, crate::models::CreateHouseInput {
            name: "House Alpha".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Lorebook]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        // 1. Create a Web of Thought plan with two universes: one to be assigned to house_a, one left unassigned
        let plan_json = format!(
            r#"{{"{}":{{"version":1,"revision":1,"universes":[{{"id":"uni-alpha","name":"Alphaverse"}},{{"id":"uni-unassigned","name":"Floating Cosmos"}}],"books":[],"entities":[],"nodes":[],"relationships":[]}}}}"#,
            crate::thought::KEY
        );
        let _plan_doc = create_document_impl(
            &state,
            "lorebook".to_string(),
            "Web of Thought — Planning Desk".to_string(),
            None,
            Some("Planning content".to_string()),
            Some(plan_json),
            None,
            Some(house_a.id.clone()),
        ).unwrap();

        // Check integrity diagnostics BEFORE assignment: uni-alpha and uni-unassigned are both unassigned
        let report_before = inspect_house_integrity_impl(&state).unwrap();
        assert_eq!(report_before.unassigned_universe_count, 2);
        assert!(report_before.issues.iter().any(|i| i.issue_type == crate::models::IntegrityIssueType::UnassignedUniverse && i.universe_id.as_deref() == Some("uni-alpha")));
        assert!(report_before.issues.iter().any(|i| i.issue_type == crate::models::IntegrityIssueType::UnassignedUniverse && i.universe_id.as_deref() == Some("uni-unassigned")));

        // 2. Assign uni-alpha to house_a using assign_universe_to_house_impl
        assign_universe_to_house_impl(&state, "uni-alpha".to_string(), house_a.id.clone()).unwrap();

        // 3. Verify registry reflects assignment
        let registry = state.storage.read_house_registry().unwrap();
        let target_h = registry.houses.iter().find(|h| h.id == house_a.id).unwrap();
        assert!(target_h.universe_ids.contains(&"uni-alpha".to_string()));

        // 4. Repeated assignment is idempotent
        assign_universe_to_house_impl(&state, "uni-alpha".to_string(), house_a.id.clone()).unwrap();

        // 5. Diagnostics now show only 1 unassigned universe (uni-unassigned)
        let report_after = inspect_house_integrity_impl(&state).unwrap();
        assert_eq!(report_after.unassigned_universe_count, 1);
        assert_eq!(report_after.issues.iter().filter(|i| i.issue_type == crate::models::IntegrityIssueType::UnassignedUniverse).count(), 1);
        let unassigned_issue = report_after.issues.iter().find(|i| i.issue_type == crate::models::IntegrityIssueType::UnassignedUniverse).unwrap();
        assert_eq!(unassigned_issue.universe_id.as_deref(), Some("uni-unassigned"));
    }
    #[test]
    fn test_phase_b_resolve_legacy_universe_id_and_diagnostics() {
        let (_dir, state) = create_test_state();

        let house_a = create_house_impl(&state, crate::models::CreateHouseInput {
            name: "House Alpha".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Lorebook]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        let house_b = create_house_impl(&state, crate::models::CreateHouseInput {
            name: "House Beta".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Lorebook]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        // 1. Two Universes named "Avalon" with distinct UUIDs
        let universes = vec![
            crate::thought::Universe {
                id: "uni-avalon-a".to_string(),
                name: "Avalon".to_string(),
                description: Some("Alpha Avalon".to_string()),
                archived: false,
            },
            crate::thought::Universe {
                id: "uni-avalon-b".to_string(),
                name: "Avalon".to_string(),
                description: Some("Beta Avalon".to_string()),
                archived: false,
            },
        ];

        // Assign uni-avalon-a to house_a and uni-avalon-b to house_b using assign_universe_to_house_impl
        assign_universe_to_house_impl(&state, "uni-avalon-a".to_string(), house_a.id.clone()).unwrap();
        assign_universe_to_house_impl(&state, "uni-avalon-b".to_string(), house_b.id.clone()).unwrap();
        let registry = state.storage.read_house_registry().unwrap();

        // Test F-06: resolve_legacy_universe_id
        // For House A document, resolves uniquely to uni-avalon-a
        let res_a = crate::models::resolve_legacy_universe_id("Avalon", &house_a.id, &universes, &registry).unwrap();
        assert_eq!(res_a, Some("uni-avalon-a".to_string()));

        // For House B document, resolves uniquely to uni-avalon-b
        let res_b = crate::models::resolve_legacy_universe_id("Avalon", &house_b.id, &universes, &registry).unwrap();
        assert_eq!(res_b, Some("uni-avalon-b".to_string()));

        // For House C document (or unknown house), returns Err: ambiguous across houses, none in doc house
        let res_c = crate::models::resolve_legacy_universe_id("Avalon", "house-other", &universes, &registry);
        assert!(res_c.is_err());
    }
}
