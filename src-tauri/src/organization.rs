use crate::{
    commands::AppState,
    db::Database,
    models::{DocumentDetail, DocumentMetadata},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Default, Deserialize)]
pub struct OrganizationPatch {
    pub tags: Option<Vec<String>>,
    pub favorite: Option<bool>,
    pub opened: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct TagChangeReport {
    pub updated: Vec<DocumentMetadata>,
    pub errors: Vec<String>,
}

fn metadata_object(raw: Option<&str>) -> Result<Value, String> {
    let value: Value = serde_json::from_str(raw.unwrap_or("{}"))
        .map_err(|e| format!("Invalid metadata: {}", e))?;
    if !value.is_object() {
        return Err("Document metadata must be an object".into());
    }
    Ok(value)
}

pub(crate) fn preserve_workshop(
    incoming: Option<&str>,
    current: Option<&str>,
) -> Result<Option<String>, String> {
    let current: Value =
        serde_json::from_str(current.unwrap_or("{}")).map_err(|e| e.to_string())?;
    if let Some(workshop) = current.get("_workshop") {
        let mut next = metadata_object(incoming)?;
        next["_workshop"] = workshop.clone();
        Ok(Some(next.to_string()))
    } else {
        Ok(incoming.map(str::to_string))
    }
}

fn normalized_tags(tags: Vec<String>) -> Vec<String> {
    let mut result = Vec::new();
    for tag in tags {
        let tag = tag.trim().to_string();
        if !tag.is_empty() && !result.contains(&tag) {
            result.push(tag);
        }
    }
    result
}

pub(crate) fn canonical_document(
    state: &AppState,
    db: &Database,
    id: &str,
) -> Result<DocumentDetail, String> {
    let indexed = db
        .get_document_metadata(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Document {} not found", id))?;
    let mut document = state.storage.read_document(&indexed.relative_path)?;
    // Raw Markdown imports get a stable indexed identity when their first frontmatter is saved.
    if document.metadata.id != indexed.id {
        let raw = std::fs::read_to_string(state.storage.resolve_safe_path(&indexed.relative_path)?)
            .map_err(|e| e.to_string())?;
        if raw.starts_with("---json\n") {
            return Err("Document identity differs from index; reindex before editing".into());
        }
        document.metadata.id = indexed.id;
        document.metadata.created_at = indexed.created_at;
        document.metadata.updated_at = indexed.updated_at;
    }
    Ok(document)
}

fn commit(
    state: &AppState,
    db: &mut Database,
    document: &DocumentDetail,
) -> Result<DocumentMetadata, String> {
    let path = &document.metadata.relative_path;
    let original = std::fs::read_to_string(state.storage.resolve_safe_path(path)?)
        .map_err(|e| e.to_string())?;
    state.storage.write_document_atomic(path, document)?;
    if let Err(error) = db.upsert_document(&document.metadata) {
        return match state.storage.write_raw_atomic(path, &original) {
            Ok(()) => Err(format!("Index update failed; original file restored: {}", error)),
            Err(rollback) => Err(format!("Index update failed: {}; restore failed: {}. Reindex the canonical files to recover the index.", error, rollback)),
        };
    }
    Ok(document.metadata.clone())
}

pub fn update_organization_impl(
    state: &AppState,
    id: String,
    patch: OrganizationPatch,
) -> Result<DocumentMetadata, String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    let mut document = canonical_document(state, &db, &id)?;
    if let Some(tags) = patch.tags {
        document.metadata.tags = normalized_tags(tags);
    }
    if patch.favorite.is_some() || patch.opened == Some(true) {
        let mut metadata = metadata_object(document.metadata.metadata_json.as_deref())?;
        let object = metadata.as_object_mut().unwrap();
        let workshop = object.entry("_workshop").or_insert(json!({}));
        let workshop = workshop
            .as_object_mut()
            .ok_or("The reserved _workshop metadata must be an object")?;
        if let Some(favorite) = patch.favorite {
            workshop.insert("favorite".into(), json!(favorite));
        }
        if patch.opened == Some(true) {
            workshop.insert("last_opened_at".into(), json!(Utc::now().to_rfc3339()));
        }
        document.metadata.metadata_json = Some(metadata.to_string());
    }
    // Organization changes and opens do not pretend that the writing was modified.
    commit(state, &mut db, &document)
}

/// Per-document atomic updates, with explicit partial-failure reporting for a library-wide operation.
/// Repeating the operation is safe: renamed/removed tags no longer match the old name.
pub fn manage_tag_impl(
    state: &AppState,
    old_name: String,
    new_name: Option<String>,
) -> Result<TagChangeReport, String> {
    let old_name = old_name.trim();
    if old_name.is_empty() {
        return Err("Choose an existing tag".into());
    }
    let new_name = match new_name {
        Some(name) if name.trim().is_empty() => {
            return Err("The new tag name cannot be empty".into())
        }
        other => other.map(|s| s.trim().to_string()),
    };
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    let documents = db.list_documents(None).map_err(|e| e.to_string())?;
    let mut report = TagChangeReport {
        updated: vec![],
        errors: vec![],
    };
    for indexed in documents {
        // Inspect canonical tags even if a file was edited outside the application.
        let result = (|| {
            let mut document = canonical_document(state, &db, &indexed.id)?;
            if !document.metadata.tags.iter().any(|tag| tag == old_name) {
                return Ok(None);
            }
            document.metadata.tags = normalized_tags(
                document
                    .metadata
                    .tags
                    .into_iter()
                    .filter_map(|tag| {
                        if tag == old_name {
                            new_name.clone()
                        } else {
                            Some(tag)
                        }
                    })
                    .collect(),
            );
            commit(state, &mut db, &document).map(Some)
        })();
        match result {
            Ok(Some(metadata)) => report.updated.push(metadata),
            Ok(None) => {}
            Err(error) => report.errors.push(format!("{}: {}", indexed.title, error)),
        }
    }
    if let Err(error) = db.finish_tag_change(old_name, new_name.as_deref()) {
        report
            .errors
            .push(format!("Could not finish updating the tag name: {}", error));
    }
    Ok(report)
}
