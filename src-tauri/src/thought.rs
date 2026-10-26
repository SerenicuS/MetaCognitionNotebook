//! Lorebook planning is canonical JSON frontmatter in an ordinary Lorebook Markdown file.
use crate::{
    commands::AppState,
    models::{DocumentDetail, DocumentMetadata, DocumentType},
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use tauri::State;

macro_rules! record {
    ($name:ident { $($field:ident : $ty:ty),* $(,)? }) => {
        #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
        #[serde(deny_unknown_fields)]
        pub struct $name { $(pub $field: $ty),* }
    }
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Universe {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub archived: bool,
}

fn is_false(value: &bool) -> bool { !*value }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Book {
    pub id: String,
    pub universe_id: String,
    pub name: String,
    pub continuity: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub archived: bool,
}
record!(Entity {
    id: String,
    universe_id: String
});
record!(Change { id:String, entity_id:String, property_key:String, previous_value:Option<String>, new_value:Option<String>, note:String });
record!(RelationshipChange { relationship_id:String, label:Option<String>, note:String });
record!(Node { id:String, universe_id:String, book_id:Option<String>, position:i32, title:String, description:String,
    era:String, status:String, questions:String, entity_ids:Vec<String>, changes:Vec<Change>,
    relationship_changes:Vec<RelationshipChange>, linked_event_id:Option<String>, origin_node_id:Option<String>,
    archived:bool, created_at:String, updated_at:String });
record!(Relationship { id:String, universe_id:String, book_id:Option<String>, source_id:String, target_id:String,
    label:String, description:String, directed:bool, context_node_id:Option<String>, archived:bool });
record!(Plan { version:u32, revision:u64, universes:Vec<Universe>, books:Vec<Book>, entities:Vec<Entity>, nodes:Vec<Node>, relationships:Vec<Relationship> });
record!(Thought { document_id:Option<String>, plan:Option<Plan> });
pub const KEY: &str = "_web_of_thought";
pub fn validate_metadata(metadata: &serde_json::Value) -> Result<(), String> {
    if let Some(value) = metadata.get(KEY) {
        let plan: Plan = serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
        validate(&plan)?;
    }
    Ok(())
}

pub fn validate(plan: &Plan) -> Result<(), String> {
    if plan.version != 1 {
        return Err(
            "Unsupported Web of Thought format; preserve this file and use a compatible app."
                .into(),
        );
    }
    if serde_json::to_vec(plan).map_err(|e| e.to_string())?.len() > 8 * 1024 * 1024 {
        return Err("Planning desk exceeds 8 MiB".into());
    }
    let mut ids = BTreeSet::new();
    let mut add = |id: &str| -> Result<(), String> {
        if id.is_empty()
            || id.len() > 128
            || id.chars().any(char::is_control)
            || !ids.insert(id.to_string())
        {
            return Err("Duplicate or invalid planning ID".into());
        }
        Ok(())
    };
    for u in &plan.universes {
        add(&u.id)?;
        if u.name.trim().is_empty() {
            return Err("Universe needs a name".into());
        }
    }
    for b in &plan.books {
        add(&b.id)?;
        if b.name.trim().is_empty()
            || !["canonical", "alternate", "standalone"].contains(&b.continuity.as_str())
            || !plan.universes.iter().any(|u| u.id == b.universe_id)
        {
            return Err("Invalid book/continuity".into());
        }
    }
    for e in &plan.entities {
        add(&e.id)?;
        if !plan.universes.iter().any(|u| u.id == e.universe_id) {
            return Err("Invalid entity universe".into());
        }
    }
    let scope = |universe: &str, book: &Option<String>| -> bool {
        plan.universes.iter().any(|u| u.id == universe)
            && book.as_ref().is_none_or(|id| {
                plan.books
                    .iter()
                    .any(|b| b.id == *id && b.universe_id == universe)
            })
    };
    let entity_scope = |id: &str, u: &str| {
        plan.entities
            .iter()
            .any(|e| e.id == id && e.universe_id == u)
    };
    for n in &plan.nodes {
        add(&n.id)?;
        if !scope(&n.universe_id, &n.book_id)
            || n.title.trim().is_empty()
            || !["planned", "drafted", "written"].contains(&n.status.as_str())
        {
            return Err("Invalid milestone scope/title/status".into());
        }
        for date in [&n.created_at, &n.updated_at] {
            chrono::DateTime::parse_from_rfc3339(date)
                .map_err(|_| "Invalid milestone timestamp")?;
        }
        let mut properties = BTreeSet::new();
        let mut references = BTreeSet::new();
        for id in &n.entity_ids {
            if !entity_scope(id, &n.universe_id) || !references.insert(id) {
                return Err("Invalid or duplicate lore reference".into());
            }
        }
        for c in &n.changes {
            add(&c.id)?;
            if !entity_scope(&c.entity_id, &n.universe_id)
                || c.property_key.trim().is_empty()
                || !properties.insert((&c.entity_id, &c.property_key))
            {
                return Err("Invalid/duplicate state change".into());
            }
        }
        let mut affected = BTreeSet::new();
        for c in &n.relationship_changes {
            if !affected.insert(&c.relationship_id) {
                return Err("Duplicate relationship change".into());
            }
            if let Some(r) = plan
                .relationships
                .iter()
                .find(|r| r.id == c.relationship_id)
            {
                if r.universe_id != n.universe_id || (r.book_id.is_some() && r.book_id != n.book_id)
                {
                    return Err("Relationship belongs to another timeline".into());
                }
            }
        }
        if let Some(id) = &n.linked_event_id {
            if n.book_id.is_none() {
                return Err("Only Book nodes link to Universe events".into());
            }
            if let Some(event) = plan.nodes.iter().find(|e| e.id == *id) {
                if event.book_id.is_some() || event.universe_id != n.universe_id {
                    return Err("Invalid shared Universe event link".into());
                }
            }
        }
    }
    for r in &plan.relationships {
        add(&r.id)?;
        if !scope(&r.universe_id, &r.book_id)
            || !entity_scope(&r.source_id, &r.universe_id)
            || !entity_scope(&r.target_id, &r.universe_id)
            || r.label.trim().is_empty()
        {
            return Err("Invalid relationship".into());
        }
        if let Some(id) = &r.context_node_id {
            if let Some(n) = plan.nodes.iter().find(|n| n.id == *id) {
                if n.universe_id != r.universe_id || n.book_id != r.book_id {
                    return Err("Relationship context belongs to another timeline".into());
                }
            }
        }
    }
    if ids.len() > 30_000 {
        return Err("Planning desk exceeds 30,000 records".into());
    }
    Ok(())
}

fn find(state: &AppState) -> Result<Option<DocumentDetail>, String> {
    let mut found = None;
    let lorebooks_dir = state.storage.get_root().join("Lorebooks");
    if !lorebooks_dir.exists() {
        return Ok(None);
    }
    for entry in walkdir::WalkDir::new(&lorebooks_dir).follow_links(false) {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().is_file() || entry.path().extension().is_none_or(|e| e != "md") {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(state.storage.get_root())
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let raw = std::fs::read_to_string(entry.path()).map_err(|e| e.to_string())?;
        if raw
            .strip_prefix("---json\n")
            .is_some_and(|rest| !rest.contains("\n---\n"))
        {
            return Err(format!(
                "Unterminated Lorebook frontmatter at {relative}; no planning data was reset"
            ));
        }
        let doc = state.storage.read_document(&relative)?;
        let metadata: serde_json::Value =
            serde_json::from_str(doc.metadata.metadata_json.as_deref().unwrap_or("{}"))
                .map_err(|e| e.to_string())?;
        if entry
            .file_name()
            .to_string_lossy()
            .starts_with("Web_of_Thought_")
            && metadata.get(KEY).is_none()
        {
            return Err("Reserved planning catalog is missing its namespace; preserve and repair it before editing".into());
        }
        if metadata.get(KEY).is_some() {
            if doc.metadata.doc_type != DocumentType::Lorebook {
                return Err("Planning catalogs belong exclusively to Lorebook".into());
            }
            if found.is_some() {
                return Err("Multiple Web of Thought catalogs found. Keep both files; resolve the duplicate before editing.".into());
            }
            found = Some(doc);
        }
    }
    Ok(found)
}
fn unpack(doc: &DocumentDetail) -> Result<Plan, String> {
    let metadata: serde_json::Value =
        serde_json::from_str(doc.metadata.metadata_json.as_deref().unwrap_or("{}"))
            .map_err(|e| e.to_string())?;
    let plan: Plan = serde_json::from_value(
        metadata
            .get(KEY)
            .ok_or("Planning metadata missing")?
            .clone(),
    )
    .map_err(|e| format!("Malformed planning metadata; file was not changed: {e}"))?;
    validate(&plan)?;
    Ok(plan)
}
pub fn get_impl(state: &AppState) -> Result<Thought, String> {
    let _db = state.db.lock().map_err(|e| e.to_string())?;
    match find(state)? {
        Some(doc) => Ok(Thought {
            plan: Some(unpack(&doc)?),
            document_id: Some(doc.metadata.id),
        }),
        None => Ok(Thought {
            plan: None,
            document_id: None,
        }),
    }
}

/// Called only while commands holds the database mutation lock. Do not lock again here.
pub(crate) fn find_catalog_plan(
    state: &AppState,
) -> Result<Option<(DocumentDetail, Plan)>, String> {
    match find(state)? {
        Some(doc) => {
            let plan = unpack(&doc)?;
            Ok(Some((doc, plan)))
        }
        None => Ok(None),
    }
}

/// Called only while commands holds the database mutation lock. Do not lock again here.
pub(crate) fn ensure_entity_archive_safe(state: &AppState, id: &str) -> Result<(), String> {
    if let Some(catalog) = find(state)? {
        if catalog.metadata.id == id {
            return Err("The shared planning catalog cannot be archived as an entity. It contains all Universes.".into());
        }
        let plan = unpack(&catalog)?;
        if plan.relationships.iter().any(|r| !r.archived && (r.source_id == id || r.target_id == id)) {
            return Err("Archive this entity's active relationships first through the impact preview. No document was moved.".into());
        }
    }
    Ok(())
}
pub fn save_impl(state: &AppState, expected: u64, mut plan: Plan) -> Result<Thought, String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;
    validate(&plan)?;
    let existing = find(state)?;
    let old = existing.as_ref().map(unpack).transpose()?;
    for entity in &plan.entities {
        if let Some(document) = db
            .get_document_metadata(&entity.id)
            .map_err(|e| e.to_string())?
        {
            if document.doc_type != DocumentType::Lorebook
                || existing
                    .as_ref()
                    .is_some_and(|catalog| catalog.metadata.id == entity.id)
            {
                return Err("Web of Thought references Lorebook entities only, not other studios or its own catalog".into());
            }
        }
    }
    let revision = old.as_ref().map(|p| p.revision).unwrap_or(0);
    if revision != expected {
        let mut retry = plan.clone();
        retry.revision = revision;
        if old.as_ref() == Some(&retry) {
            if let Some(doc) = existing.as_ref() {
                db.upsert_document(&doc.metadata).map_err(|e| {
                    format!("Planning index repair failed: {e}; canonical file retained")
                })?;
            }
            return Ok(Thought {
                document_id: existing.map(|d| d.metadata.id),
                plan: old,
            });
        }
        return Err("Planning desk changed on disk. Reload before applying more edits; no stale data was written.".into());
    }
    // A promotion is a deliberate new Universe node from a Canonical book only.
    for node in plan.nodes.iter().filter(|n| {
        n.origin_node_id.is_some()
            && !old
                .as_ref()
                .is_some_and(|p| p.nodes.iter().any(|o| o.id == n.id))
    }) {
        let origin = plan
            .nodes
            .iter()
            .find(|n| Some(&n.id) == node.origin_node_id.as_ref())
            .ok_or("Promotion source missing")?;
        if node.book_id.is_some()
            || node.universe_id != origin.universe_id
            || !plan
                .books
                .iter()
                .any(|b| Some(&b.id) == origin.book_id.as_ref() && b.continuity == "canonical")
        {
            return Err(
                "Only an explicitly promoted Canonical Book milestone can create shared history"
                    .into(),
            );
        }
        if origin.linked_event_id.as_ref() != Some(&node.id) {
            return Err("Promotion must preserve and link the originating Book node".into());
        }
    }
    plan.revision = revision.checked_add(1).ok_or("Revision overflow")?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut doc=existing.unwrap_or_else(||{let id=uuid::Uuid::new_v4().to_string(); DocumentDetail {
        metadata:DocumentMetadata {id:id.clone(),title:"Web of Thought — Planning Desk".into(),doc_type:DocumentType::Lorebook,house_id:crate::models::default_house_id(),relative_path:format!("Lorebooks/Web_of_Thought_{id}.md"),parent_id:None,metadata_json:Some("{}".into()),created_at:now.clone(),updated_at:now.clone(),tags:vec![]},
        content:"# Web of Thought\n\nNarrative planning data is stored in this document's JSON frontmatter. Open Web of Thought in Lorebook Studio to edit it. Manuscripts and chapters are separate.\n".into()
    }});
    let mut metadata: serde_json::Value =
        serde_json::from_str(doc.metadata.metadata_json.as_deref().unwrap_or("{}"))
            .map_err(|e| e.to_string())?;
    metadata[KEY] = serde_json::to_value(&plan).map_err(|e| e.to_string())?;
    doc.metadata.metadata_json = Some(metadata.to_string());
    doc.metadata.updated_at = now;
    let path = state
        .storage
        .resolve_safe_path(&doc.metadata.relative_path)?;
    let original = std::fs::read_to_string(&path).ok();
    state
        .storage
        .write_document_atomic(&doc.metadata.relative_path, &doc)?;
    if let Err(error) = db.upsert_document(&doc.metadata) {
        if let Some(original) = original {
            state
                .storage
                .write_raw_atomic(&doc.metadata.relative_path, &original)?;
        }
        // A newly written catalog remains canonical and discoverable for retry/reindex.
        return Err(format!("Planning index update failed: {error}. Canonical files are retained; retry or reindex."));
    }
    Ok(Thought {
        document_id: Some(doc.metadata.id),
        plan: Some(plan),
    })
}
#[tauri::command]
pub fn thought_get(state: State<'_, AppState>) -> Result<Thought, String> {
    get_impl(&state)
}
#[tauri::command]
pub fn thought_save(
    state: State<'_, AppState>,
    expected_revision: u64,
    plan: Plan,
) -> Result<Thought, String> {
    save_impl(&state, expected_revision, plan)
}

#[cfg(test)]
mod tests;
