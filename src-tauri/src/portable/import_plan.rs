//! Read-only import planning and identity remapping (L2a).
use super::*;
use crate::commands::AppState;
use crate::models::{AuthoringStudio, DocumentMetadata, HouseRecord, HouseRegistry};
use crate::storage::StorageManager;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

fn deterministic_uuid(namespace: &str, name: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(namespace.as_bytes());
    hasher.update(b":");
    hasher.update(name.as_bytes());
    let hash = hasher.finalize();
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&hash[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
    uuid::Uuid::from_bytes(bytes).to_string()
}

fn compute_destination_fingerprint(
    target_house: &HouseRecord,
    registry: &HouseRegistry,
    existing_plan_rev: u64,
    existing_plan: &Plan,
    indexed_docs: &[DocumentMetadata],
    dest_paths: &BTreeSet<String>,
    package_sha256: &str,
    policy: &ImportIdentityPolicy,
    operation_id: &str,
) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(operation_id.as_bytes());
    hasher.update(b":");
    hasher.update(target_house.id.as_bytes());
    hasher.update(b":");
    hasher.update(target_house.name.as_bytes());
    hasher.update(b":");
    hasher.update(if target_house.archived { b"1" } else { b"0" });
    hasher.update(b":");
    hasher.update(if target_house.manuscript_tools_enabled { b"1" } else { b"0" });
    hasher.update(b":");
    for s in &target_house.enabled_studios {
        hasher.update(format!("{:?}", s).as_bytes());
    }
    hasher.update(b":");
    for u in &target_house.universe_ids {
        hasher.update(u.as_bytes());
    }
    hasher.update(b":");
    for h in &registry.houses {
        hasher.update(h.id.as_bytes());
        hasher.update(if h.archived { b"1" } else { b"0" });
        for u in &h.universe_ids {
            hasher.update(u.as_bytes());
        }
    }
    hasher.update(b":");
    hasher.update(existing_plan_rev.to_string().as_bytes());
    hasher.update(b":");
    hasher.update(existing_plan.universes.len().to_string().as_bytes());
    for u in &existing_plan.universes {
        hasher.update(u.id.as_bytes());
    }
    hasher.update(b":");
    hasher.update(existing_plan.books.len().to_string().as_bytes());
    for b in &existing_plan.books {
        hasher.update(b.id.as_bytes());
    }
    hasher.update(b":");
    hasher.update(existing_plan.branches.len().to_string().as_bytes());
    for br in &existing_plan.branches {
        hasher.update(br.id.as_bytes());
    }
    hasher.update(b":");
    hasher.update(existing_plan.entities.len().to_string().as_bytes());
    for e in &existing_plan.entities {
        hasher.update(e.id.as_bytes());
    }
    hasher.update(b":");
    hasher.update(existing_plan.nodes.len().to_string().as_bytes());
    for n in &existing_plan.nodes {
        hasher.update(n.id.as_bytes());
    }
    hasher.update(b":");
    hasher.update(existing_plan.relationships.len().to_string().as_bytes());
    for r in &existing_plan.relationships {
        hasher.update(r.id.as_bytes());
    }
    hasher.update(b":");
    let mut sorted_docs = indexed_docs.to_vec();
    sorted_docs.sort_by(|a, b| a.id.cmp(&b.id));
    hasher.update(sorted_docs.len().to_string().as_bytes());
    for doc in &sorted_docs {
        hasher.update(doc.id.as_bytes());
        hasher.update(doc.updated_at.as_bytes());
    }
    hasher.update(b":");
    hasher.update(dest_paths.len().to_string().as_bytes());
    for p in dest_paths {
        hasher.update(p.as_bytes());
    }
    hasher.update(b":");
    hasher.update(package_sha256.as_bytes());
    hasher.update(b":");
    hasher.update(match policy {
        ImportIdentityPolicy::Preserve => b"preserve".as_slice(),
        ImportIdentityPolicy::SeparateCopy => b"separate_copy".as_slice(),
    });
    format!("{:x}", hasher.finalize())
}

fn find_remapped_ref(val: &Value, remapped_ids: &BTreeSet<&str>) -> Option<String> {
    match val {
        Value::String(s) => {
            if remapped_ids.contains(s.as_str()) {
                Some(s.clone())
            } else {
                None
            }
        }
        Value::Array(arr) => {
            for item in arr {
                if let Some(found) = find_remapped_ref(item, remapped_ids) {
                    return Some(found);
                }
            }
            None
        }
        Value::Object(map) => {
            for v in map.values() {
                if let Some(found) = find_remapped_ref(v, remapped_ids) {
                    return Some(found);
                }
            }
            None
        }
        _ => None,
    }
}

fn remap_plan(plan: &Plan, id_map: &BTreeMap<String, String>) -> Result<Plan> {
    let get_id = |id: &str| -> String { id_map.get(id).cloned().unwrap_or_else(|| id.to_string()) };
    let get_opt = |id: &Option<String>| -> Option<String> {
        id.as_ref().map(|s| id_map.get(s).cloned().unwrap_or_else(|| s.clone()))
    };

    let universes = plan
        .universes
        .iter()
        .map(|u| crate::thought::Universe {
            id: get_id(&u.id),
            name: u.name.clone(),
            description: u.description.clone(),
            archived: u.archived,
        })
        .collect();

    let books = plan
        .books
        .iter()
        .map(|b| crate::thought::Book {
            id: get_id(&b.id),
            universe_id: get_id(&b.universe_id),
            name: b.name.clone(),
            continuity: b.continuity.clone(),
            description: b.description.clone(),
            branch_id: get_opt(&b.branch_id),
            archived: b.archived,
        })
        .collect();

    let branches = plan
        .branches
        .iter()
        .map(|br| crate::thought::Branch {
            id: get_id(&br.id),
            universe_id: get_id(&br.universe_id),
            name: br.name.clone(),
            description: br.description.clone(),
            divergence_node_id: get_id(&br.divergence_node_id),
            parent_continuity_id: get_opt(&br.parent_continuity_id),
            archived: br.archived,
            created_at: br.created_at.clone(),
            updated_at: br.updated_at.clone(),
        })
        .collect();

    let entities = plan
        .entities
        .iter()
        .map(|e| crate::thought::Entity {
            id: get_id(&e.id),
            universe_id: get_id(&e.universe_id),
        })
        .collect();

    let nodes = plan
        .nodes
        .iter()
        .map(|n| crate::thought::Node {
            id: get_id(&n.id),
            universe_id: get_id(&n.universe_id),
            book_id: get_opt(&n.book_id),
            branch_id: get_opt(&n.branch_id),
            position: n.position,
            title: n.title.clone(),
            description: n.description.clone(),
            era: n.era.clone(),
            status: n.status.clone(),
            questions: n.questions.clone(),
            entity_ids: n.entity_ids.iter().map(|id| get_id(id)).collect(),
            changes: n
                .changes
                .iter()
                .map(|c| crate::thought::Change {
                    id: get_id(&c.id),
                    entity_id: get_id(&c.entity_id),
                    property_key: c.property_key.clone(),
                    previous_value: c.previous_value.clone(),
                    new_value: c.new_value.clone(),
                    note: c.note.clone(),
                })
                .collect(),
            relationship_changes: n
                .relationship_changes
                .iter()
                .map(|rc| crate::thought::RelationshipChange {
                    relationship_id: get_id(&rc.relationship_id),
                    label: rc.label.clone(),
                    note: rc.note.clone(),
                })
                .collect(),
            linked_event_id: get_opt(&n.linked_event_id),
            origin_node_id: get_opt(&n.origin_node_id),
            archived: n.archived,
            created_at: n.created_at.clone(),
            updated_at: n.updated_at.clone(),
        })
        .collect();

    let relationships = plan
        .relationships
        .iter()
        .map(|r| crate::thought::Relationship {
            id: get_id(&r.id),
            universe_id: get_id(&r.universe_id),
            book_id: get_opt(&r.book_id),
            source_id: get_id(&r.source_id),
            target_id: get_id(&r.target_id),
            label: r.label.clone(),
            description: r.description.clone(),
            directed: r.directed,
            context_node_id: get_opt(&r.context_node_id),
            archived: r.archived,
        })
        .collect();

    Ok(Plan {
        version: plan.version,
        revision: plan.revision,
        universes,
        books,
        branches,
        entities,
        nodes,
        relationships,
    })
}

pub(crate) fn remap_frontmatter(
    fm: &Value,
    id_map: &BTreeMap<String, String>,
    target_house_id: &str,
    source_universe_id: &str,
) -> Result<Value> {
    let get_id = |id: &str| -> String { id_map.get(id).cloned().unwrap_or_else(|| id.to_string()) };
    let mut new_fm = fm.clone();
    let obj = new_fm.as_object_mut().ok_or("Frontmatter must be object")?;

    if let Some(id_val) = obj.get("id").and_then(Value::as_str) {
        obj.insert("id".into(), Value::String(get_id(id_val)));
    }
    obj.insert("house_id".into(), Value::String(target_house_id.into()));

    if let Some(parent) = obj.get("parent_id").and_then(Value::as_str) {
        obj.insert("parent_id".into(), Value::String(get_id(parent)));
    }

    if let Some(meta) = obj.get_mut("metadata").and_then(Value::as_object_mut) {
        if let Some(uid) = meta.get("universe_id").and_then(Value::as_str) {
            meta.insert("universe_id".into(), Value::String(get_id(uid)));
        } else {
            meta.insert("universe_id".into(), Value::String(get_id(source_universe_id)));
        }

        if let Some(bid) = meta.get("book_id").and_then(Value::as_str) {
            meta.insert("book_id".into(), Value::String(get_id(bid)));
        }

        if let Some(mid) = meta.get("milestone_id").and_then(Value::as_str) {
            meta.insert("milestone_id".into(), Value::String(get_id(mid)));
        }

        if let Some(mids) = meta.get_mut("milestone_ids").and_then(Value::as_array_mut) {
            for m in mids {
                if let Some(mid_str) = m.as_str() {
                    *m = Value::String(get_id(mid_str));
                }
            }
        }

        if let Some(attrs) = meta.get_mut("attributes").and_then(Value::as_array_mut) {
            for attr in attrs {
                if let Some(attr_obj) = attr.as_object_mut() {
                    if let Some(aid) = attr_obj.get("id").and_then(Value::as_str) {
                        attr_obj.insert("id".into(), Value::String(get_id(aid)));
                    }
                }
            }
        }

        if let Some(faction) = meta.get_mut("faction_fields").and_then(Value::as_object_mut) {
            if let Some(branches) = faction.get_mut("branches").and_then(Value::as_array_mut) {
                for br in branches {
                    if let Some(b_obj) = br.as_object_mut() {
                        if let Some(fbid) = b_obj.get("id").and_then(Value::as_str) {
                            b_obj.insert("id".into(), Value::String(get_id(fbid)));
                        }
                        if let Some(pbid) = b_obj.get("parent_branch_id").and_then(Value::as_str) {
                            b_obj.insert("parent_branch_id".into(), Value::String(get_id(pbid)));
                        }
                    }
                }
            }
            if let Some(positions) = faction.get_mut("positions").and_then(Value::as_array_mut) {
                for pos in positions {
                    if let Some(p_obj) = pos.as_object_mut() {
                        if let Some(pid) = p_obj.get("id").and_then(Value::as_str) {
                            p_obj.insert("id".into(), Value::String(get_id(pid)));
                        }
                        if let Some(brid) = p_obj.get("branch_id").and_then(Value::as_str) {
                            p_obj.insert("branch_id".into(), Value::String(get_id(brid)));
                        }
                        if let Some(ppid) = p_obj.get("parent_position_id").and_then(Value::as_str) {
                            p_obj.insert("parent_position_id".into(), Value::String(get_id(ppid)));
                        }
                        if let Some(holders) = p_obj.get_mut("holder_ids").and_then(Value::as_array_mut) {
                            for h in holders {
                                if let Some(hid) = h.as_str() {
                                    *h = Value::String(get_id(hid));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(new_fm)
}

fn remap_ordering(ordering: &Ordering, id_map: &BTreeMap<String, String>) -> Ordering {
    let get_id = |id: &str| -> String { id_map.get(id).cloned().unwrap_or_else(|| id.to_string()) };
    let get_opt = |id: &Option<String>| -> Option<String> {
        id.as_ref().map(|s| id_map.get(s).cloned().unwrap_or_else(|| s.clone()))
    };

    Ordering {
        algorithm: ordering.algorithm.clone(),
        source_document_ids: ordering.source_document_ids.iter().map(|id| get_id(id)).collect(),
        timelines: ordering
            .timelines
            .iter()
            .map(|t| TimelineOrder {
                book_id: get_opt(&t.book_id),
                branch_id: get_opt(&t.branch_id),
                milestone_ids: t.milestone_ids.iter().map(|id| get_id(id)).collect(),
            })
            .collect(),
        chapters: ordering
            .chapters
            .iter()
            .map(|c| ChapterOrder {
                book_id: get_id(&c.book_id),
                chapter_ids: c.chapter_ids.iter().map(|id| get_id(id)).collect(),
            })
            .collect(),
    }
}

pub fn preview(state: &AppState, request: ImportPreviewRequest) -> Result<ImportPreview> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    preview_locked(state, &db, request)
}

pub fn preview_locked(
    state: &AppState,
    db: &crate::db::Database,
    request: ImportPreviewRequest,
) -> Result<ImportPreview> {
    let target_house_id = request.target_house_id.trim();
    if target_house_id.is_empty() {
        return Err("Destination House ID must not be empty".into());
    }

    let registry = state.storage.read_house_registry()?;
    StorageManager::validate_registry_invariants(&registry)?;
    let target_house = registry
        .houses
        .iter()
        .find(|h| h.id == target_house_id)
        .ok_or_else(|| format!("Destination House '{target_house_id}' does not exist"))?;
    if target_house.archived {
        return Err(format!("Destination House '{}' is archived", target_house.name));
    }
    if !target_house
        .enabled_studios
        .contains(&AuthoringStudio::Lorebook)
    {
        return Err(format!(
            "Destination House '{}' does not have Lorebook enabled",
            target_house.name
        ));
    }

    let op_id = match request.operation_id.as_deref().map(str::trim) {
        Some(op) if !op.is_empty() => {
            if op.len() > 64
                || !op
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&(c as u8)))
            {
                return Err("Invalid operation_id: must be 1-64 alphanumeric characters, '-', '_', or '.'".into());
            }
            op.to_string()
        }
        _ => format!("op-{}", uuid::Uuid::new_v4()),
    };

    let package_path = Path::new(&request.package_path);
    let loaded = load_package(package_path)?;
    if !loaded.inspection.compatible {
        return Err(format!(
            "Package requires unsupported features: {:?}",
            loaded.inspection.unsupported_features
        ));
    }

    let existing_plan = match crate::thought::find_catalog_plan(state)? {
        Some((_doc, plan)) => plan,
        None => Plan {
            version: 1,
            revision: 0,
            universes: vec![],
            books: vec![],
            branches: vec![],
            entities: vec![],
            nodes: vec![],
            relationships: vec![],
        },
    };

    let indexed_docs = db.list_documents(None, None).map_err(|e| e.to_string())?;

    let mut dest_doc_ids = BTreeMap::new();
    let mut dest_relative_paths = BTreeSet::new();
    let mut dest_plan_ids = BTreeMap::new();
    for u in &existing_plan.universes {
        dest_plan_ids.insert(u.id.clone(), "destination planning catalog (universe)");
    }
    for b in &existing_plan.books {
        dest_plan_ids.insert(b.id.clone(), "destination planning catalog (book)");
    }
    for br in &existing_plan.branches {
        dest_plan_ids.insert(br.id.clone(), "destination planning catalog (branch)");
    }
    for e in &existing_plan.entities {
        dest_plan_ids.insert(e.id.clone(), "destination planning catalog (entity)");
    }
    for n in &existing_plan.nodes {
        dest_plan_ids.insert(n.id.clone(), "destination planning catalog (milestone)");
        for c in &n.changes {
            dest_plan_ids.insert(c.id.clone(), "destination planning catalog (state change)");
        }
    }
    for r in &existing_plan.relationships {
        dest_plan_ids.insert(r.id.clone(), "destination planning catalog (relationship)");
    }
    for h in &registry.houses {
        for uid in &h.universe_ids {
            dest_plan_ids.insert(uid.clone(), "destination house registry");
        }
    }

    let root = state.storage.get_root();
    for dir in ["Lorebooks", "Philosophy", "Poetry", "Backups", "Attachments"] {
        let dir_path = root.join(dir);
        if !dir_path.exists() {
            continue;
        }
        for entry in walkdir::WalkDir::new(&dir_path)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            if let Ok(rel) = entry.path().strip_prefix(root) {
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                dest_relative_paths.insert(rel_str.clone());
                if entry.path().extension().is_some_and(|e| e == "md") {
                    if let Ok(raw) = std::fs::read_to_string(entry.path()) {
                        if let Some(rest) = raw.strip_prefix("---json\n") {
                            if let Some((header, _)) = rest.split_once("\n---\n") {
                                if let Ok(fm_val) = json::parse(header.as_bytes()) {
                                    if let Some(id_val) = fm_val.get("id").and_then(Value::as_str) {
                                        dest_doc_ids.insert(id_val.to_string(), rel_str);
                                    }
                                    if let Some(faction) = fm_val.get("metadata").and_then(|m| m.get("faction_fields")) {
                                        if let Some(branches) = faction.get("branches").and_then(Value::as_array) {
                                            for b in branches {
                                                if let Some(bid) = b.get("id").and_then(Value::as_str) {
                                                    dest_plan_ids.insert(bid.to_string(), "destination faction branch");
                                                }
                                            }
                                        }
                                        if let Some(positions) = faction.get("positions").and_then(Value::as_array) {
                                            for p in positions {
                                                if let Some(pid) = p.get("id").and_then(Value::as_str) {
                                                    dest_plan_ids.insert(pid.to_string(), "destination faction position");
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let destination_fingerprint = compute_destination_fingerprint(
        target_house,
        &registry,
        existing_plan.revision,
        &existing_plan,
        &indexed_docs,
        &dest_relative_paths,
        &loaded.inspection.archive_sha256,
        &request.policy,
        &op_id,
    );

    let mut collisions = Vec::new();
    let source_universe_id = &loaded.manifest.source_universe_id;
    if existing_plan.universes.iter().any(|u| &u.id == source_universe_id)
        || registry.houses.iter().any(|h| h.universe_ids.contains(source_universe_id))
    {
        collisions.push(IdentityCollision {
            source_id: source_universe_id.clone(),
            collision_type: "universe".into(),
            destination_location: "destination universe registry/catalog".into(),
            message: format!(
                "Source Universe ID '{source_universe_id}' collides with an existing destination Universe"
            ),
        });
    }

    for doc in loaded
        .manifest
        .documents
        .iter()
        .chain(&loaded.manifest.archived_documents)
    {
        if let Some(rel) = dest_doc_ids.get(&doc.id) {
            collisions.push(IdentityCollision {
                source_id: doc.id.clone(),
                collision_type: "document".into(),
                destination_location: format!("destination document file: {rel}"),
                message: format!("Document ID '{}' collides with existing file '{rel}'", doc.id),
            });
        } else if indexed_docs.iter().any(|d| d.id == doc.id) {
            collisions.push(IdentityCollision {
                source_id: doc.id.clone(),
                collision_type: "document".into(),
                destination_location: "destination SQLite index".into(),
                message: format!(
                    "Document ID '{}' collides with an indexed destination document",
                    doc.id
                ),
            });
        }
    }

    for book in &loaded.plan.books {
        if let Some(loc) = dest_plan_ids.get(&book.id) {
            collisions.push(IdentityCollision {
                source_id: book.id.clone(),
                collision_type: "book".into(),
                destination_location: loc.to_string(),
                message: format!("Book ID '{}' collides with {loc}", book.id),
            });
        }
    }

    for branch in &loaded.plan.branches {
        if let Some(loc) = dest_plan_ids.get(&branch.id) {
            collisions.push(IdentityCollision {
                source_id: branch.id.clone(),
                collision_type: "branch".into(),
                destination_location: loc.to_string(),
                message: format!("Branch ID '{}' collides with {loc}", branch.id),
            });
        }
    }

    for entity in &loaded.plan.entities {
        if let Some(loc) = dest_plan_ids.get(&entity.id) {
            collisions.push(IdentityCollision {
                source_id: entity.id.clone(),
                collision_type: "entity".into(),
                destination_location: loc.to_string(),
                message: format!("Entity ID '{}' collides with {loc}", entity.id),
            });
        }
    }

    for node in &loaded.plan.nodes {
        if let Some(loc) = dest_plan_ids.get(&node.id) {
            collisions.push(IdentityCollision {
                source_id: node.id.clone(),
                collision_type: "milestone".into(),
                destination_location: loc.to_string(),
                message: format!("Milestone ID '{}' collides with {loc}", node.id),
            });
        }
        for change in &node.changes {
            if let Some(loc) = dest_plan_ids.get(&change.id) {
                collisions.push(IdentityCollision {
                    source_id: change.id.clone(),
                    collision_type: "change".into(),
                    destination_location: loc.to_string(),
                    message: format!("State change ID '{}' collides with {loc}", change.id),
                });
            }
        }
    }

    for rel in &loaded.plan.relationships {
        if let Some(loc) = dest_plan_ids.get(&rel.id) {
            collisions.push(IdentityCollision {
                source_id: rel.id.clone(),
                collision_type: "relationship".into(),
                destination_location: loc.to_string(),
                message: format!("Relationship ID '{}' collides with {loc}", rel.id),
            });
        }
    }

    for doc in &loaded.documents {
        if let Some(faction) = doc.frontmatter["metadata"].get("faction_fields") {
            if let Some(branches) = faction.get("branches").and_then(Value::as_array) {
                for b in branches {
                    if let Some(bid) = b.get("id").and_then(Value::as_str) {
                        if let Some(loc) = dest_plan_ids.get(bid) {
                            collisions.push(IdentityCollision {
                                source_id: bid.to_string(),
                                collision_type: "faction_branch".into(),
                                destination_location: loc.to_string(),
                                message: format!("Faction branch ID '{bid}' collides with {loc}"),
                            });
                        }
                    }
                }
            }
            if let Some(positions) = faction.get("positions").and_then(Value::as_array) {
                for p in positions {
                    if let Some(pid) = p.get("id").and_then(Value::as_str) {
                        if let Some(loc) = dest_plan_ids.get(pid) {
                            collisions.push(IdentityCollision {
                                source_id: pid.to_string(),
                                collision_type: "faction_position".into(),
                                destination_location: loc.to_string(),
                                message: format!("Faction position ID '{pid}' collides with {loc}"),
                            });
                        }
                    }
                }
            }
        }
    }

    let mut id_mappings = BTreeMap::new();
    let proposed_universe_id: String;
    let proposed_universe_name: String;

    match request.policy {
        ImportIdentityPolicy::Preserve => {
            proposed_universe_id = source_universe_id.clone();
            proposed_universe_name = loaded.plan.universes[0].name.clone();
            id_mappings.insert(source_universe_id.clone(), source_universe_id.clone());

            for doc in loaded
                .manifest
                .documents
                .iter()
                .chain(&loaded.manifest.archived_documents)
            {
                id_mappings.insert(doc.id.clone(), doc.id.clone());
            }
            for book in &loaded.plan.books {
                id_mappings.insert(book.id.clone(), book.id.clone());
            }
            for branch in &loaded.plan.branches {
                id_mappings.insert(branch.id.clone(), branch.id.clone());
            }
            for entity in &loaded.plan.entities {
                id_mappings.insert(entity.id.clone(), entity.id.clone());
            }
            for node in &loaded.plan.nodes {
                id_mappings.insert(node.id.clone(), node.id.clone());
                for change in &node.changes {
                    id_mappings.insert(change.id.clone(), change.id.clone());
                }
            }
            for rel in &loaded.plan.relationships {
                id_mappings.insert(rel.id.clone(), rel.id.clone());
            }
            for book_id in &loaded.manifest.scope.omitted_book_ids {
                id_mappings.insert(book_id.clone(), book_id.clone());
            }
            for ch in &loaded.manifest.scope.omitted_chapters {
                id_mappings.insert(ch.id.clone(), ch.id.clone());
            }
            for doc in &loaded.documents {
                if let Some(faction) = doc.frontmatter["metadata"].get("faction_fields") {
                    if let Some(branches) = faction.get("branches").and_then(Value::as_array) {
                        for b in branches {
                            if let Some(bid) = b.get("id").and_then(Value::as_str) {
                                id_mappings.insert(bid.to_string(), bid.to_string());
                            }
                        }
                    }
                    if let Some(positions) = faction.get("positions").and_then(Value::as_array) {
                        for p in positions {
                            if let Some(pid) = p.get("id").and_then(Value::as_str) {
                                id_mappings.insert(pid.to_string(), pid.to_string());
                            }
                        }
                    }
                }
                if let Some(attrs) = doc.frontmatter["metadata"].get("attributes").and_then(Value::as_array) {
                    for attr in attrs {
                        if let Some(aid) = attr.get("id").and_then(Value::as_str) {
                            id_mappings.insert(aid.to_string(), aid.to_string());
                        }
                    }
                }
            }
        }
        ImportIdentityPolicy::SeparateCopy => {
            let op_namespace = format!(
                "{}:{}:{}:{}",
                loaded.inspection.archive_sha256, source_universe_id, target_house_id, op_id
            );

            proposed_universe_id = format!(
                "uni-{}",
                deterministic_uuid(&op_namespace, source_universe_id)
            );
            proposed_universe_name = loaded.plan.universes[0].name.clone();
            id_mappings.insert(source_universe_id.clone(), proposed_universe_id.clone());

            for book in &loaded.plan.books {
                let nid = format!(
                    "book-{}",
                    deterministic_uuid(&op_namespace, &book.id)
                );
                id_mappings.insert(book.id.clone(), nid);
            }

            for branch in &loaded.plan.branches {
                let nid = format!(
                    "br-{}",
                    deterministic_uuid(&op_namespace, &branch.id)
                );
                id_mappings.insert(branch.id.clone(), nid);
            }

            for book_id in &loaded.manifest.scope.omitted_book_ids {
                let nid = format!(
                    "book-{}",
                    deterministic_uuid(&op_namespace, book_id)
                );
                id_mappings.insert(book_id.clone(), nid);
            }

            for ch in &loaded.manifest.scope.omitted_chapters {
                let nid = format!(
                    "ch-{}",
                    deterministic_uuid(&op_namespace, &ch.id)
                );
                id_mappings.insert(ch.id.clone(), nid);
            }

            for doc in loaded
                .manifest
                .documents
                .iter()
                .chain(&loaded.manifest.archived_documents)
            {
                let prefix = doc.id.split_once('-').map(|(p, _)| p);
                let raw_uuid = deterministic_uuid(&op_namespace, &doc.id);
                let nid = if let Some(p) = prefix {
                    format!("{p}-{raw_uuid}")
                } else {
                    raw_uuid
                };
                id_mappings.insert(doc.id.clone(), nid);
            }

            for entity in &loaded.plan.entities {
                id_mappings.entry(entity.id.clone()).or_insert_with(|| {
                    deterministic_uuid(&op_namespace, &entity.id)
                });
            }

            for timeline in &loaded.manifest.ordering.timelines {
                let nodes_in_tl: Vec<_> = loaded
                    .plan
                    .nodes
                    .iter()
                    .filter(|n| n.book_id == timeline.book_id && n.branch_id == timeline.branch_id)
                    .collect();

                let mut by_pos: BTreeMap<i32, Vec<String>> = BTreeMap::new();
                for n in nodes_in_tl {
                    by_pos.entry(n.position).or_default().push(n.id.clone());
                }

                for (_pos, mut m_list) in by_pos {
                    m_list.sort_by_key(|id| {
                        timeline
                            .milestone_ids
                            .iter()
                            .position(|x| x == id)
                            .unwrap_or(usize::MAX)
                    });

                    let mut candidates: Vec<String> = m_list
                        .iter()
                        .map(|m| {
                            format!(
                                "m-{}",
                                deterministic_uuid(&op_namespace, m)
                            )
                        })
                        .collect();
                    candidates.sort();

                    for (m, cand) in m_list.into_iter().zip(candidates) {
                        id_mappings.insert(m, cand);
                    }
                }
            }

            for node in &loaded.plan.nodes {
                id_mappings.entry(node.id.clone()).or_insert_with(|| {
                    format!(
                        "m-{}",
                        deterministic_uuid(&op_namespace, &node.id)
                    )
                });
                for change in &node.changes {
                    id_mappings.insert(
                        change.id.clone(),
                        format!(
                            "c-{}",
                            deterministic_uuid(&op_namespace, &change.id)
                        ),
                    );
                }
            }

            for rel in &loaded.plan.relationships {
                id_mappings.insert(
                    rel.id.clone(),
                    format!(
                        "rel-{}",
                        deterministic_uuid(&op_namespace, &rel.id)
                    ),
                );
            }

            for doc in &loaded.documents {
                if let Some(faction) = doc.frontmatter["metadata"].get("faction_fields") {
                    if let Some(branches) = faction.get("branches").and_then(Value::as_array) {
                        for b in branches {
                            if let Some(bid) = b.get("id").and_then(Value::as_str) {
                                id_mappings.insert(
                                    bid.to_string(),
                                    format!(
                                        "fb-{}",
                                        deterministic_uuid(&op_namespace, bid)
                                    ),
                                );
                            }
                        }
                    }
                    if let Some(positions) = faction.get("positions").and_then(Value::as_array) {
                        for p in positions {
                            if let Some(pid) = p.get("id").and_then(Value::as_str) {
                                id_mappings.insert(
                                    pid.to_string(),
                                    format!(
                                        "fp-{}",
                                        deterministic_uuid(&op_namespace, pid)
                                    ),
                                );
                            }
                        }
                    }
                }
                if let Some(attrs) = doc.frontmatter["metadata"].get("attributes").and_then(Value::as_array) {
                    for attr in attrs {
                        if let Some(aid) = attr.get("id").and_then(Value::as_str) {
                            id_mappings.insert(
                                aid.to_string(),
                                format!(
                                    "attr-{}",
                                    deterministic_uuid(&op_namespace, aid)
                                ),
                            );
                        }
                    }
                }
            }
        }
    }

    let mut diagnostics = Vec::new();

    if request.policy == ImportIdentityPolicy::SeparateCopy {
        let remapped_source_ids: BTreeSet<&str> = id_mappings.keys().map(String::as_str).collect();
        for doc in &loaded.documents {
            for ptr in &doc.entry.opaque_fields {
                if let Some(val) = doc.frontmatter.pointer(ptr) {
                    if let Some(bad_ref) = find_remapped_ref(val, &remapped_source_ids) {
                        diagnostics.push(Diagnostic {
                            code: "untransformable_extension_reference".into(),
                            record_id: doc.entry.id.clone(),
                            message: format!(
                                "Document '{}' has unsupported extension field '{}' containing reference '{}' which cannot be safely transformed in separate copy mode",
                                doc.entry.source_relative_path, ptr, bad_ref
                            ),
                        });
                    }
                }
            }
        }
    }

    let mut used_doc_paths = dest_relative_paths.clone();
    for d in &indexed_docs {
        used_doc_paths.insert(d.relative_path.clone());
    }

    let mut planned_document_paths = Vec::new();
    for doc in &loaded.documents {
        let remapped_id = id_mappings
            .get(&doc.entry.id)
            .cloned()
            .unwrap_or_else(|| doc.entry.id.clone());
        let is_archived = doc.entry.path.starts_with("archives/")
            || doc.frontmatter["metadata"]
                .get("archived")
                .and_then(Value::as_bool)
                == Some(true);
        let title = doc.detail.metadata.title.clone();
        let clean_title = StorageManager::sanitize_filename(&title);

        let folder = if is_archived { "Backups" } else { "Lorebooks" };
        let mut candidate = format!("{folder}/{clean_title}.md");
        let mut counter = 1;
        while used_doc_paths.contains(&candidate) {
            candidate = format!("{folder}/{clean_title}_{counter}.md");
            counter += 1;
        }
        used_doc_paths.insert(candidate.clone());
        planned_document_paths.push(PlannedDocumentPath {
            source_id: doc.entry.id.clone(),
            proposed_id: remapped_id,
            entry_type: doc.entry.entry_type.clone(),
            title,
            source_relative_path: doc.entry.source_relative_path.clone(),
            destination_relative_path: candidate,
            is_archived,
        });
    }

    let mut planned_asset_paths = Vec::new();
    let mut used_asset_paths = BTreeSet::new();
    for asset in &loaded.manifest.assets {
        let asset_file = loaded.manifest.files.iter().find(|f| f.path == asset.path);
        let asset_sha256 = asset_file
            .map(|f| f.sha256.clone())
            .unwrap_or_else(|| {
                loaded
                    .payloads
                    .get(&asset.path)
                    .map(|b| vault::bytes_hash(b))
                    .unwrap_or_default()
            });
        let asset_size = asset_file.map(|f| f.size).unwrap_or_else(|| {
            loaded.payloads.get(&asset.path).map(|b| b.len() as u64).unwrap_or(0)
        });
        let source_rel = &asset.source_relative_path;
        let full_dest = root.join(source_rel);
        let (dest_rel, reused) = if full_dest.exists() {
            if let Ok(bytes) = std::fs::read(&full_dest) {
                if vault::bytes_hash(&bytes) == asset_sha256 {
                    (source_rel.clone(), true)
                } else {
                    let (dir, file) = source_rel
                        .rsplit_once('/')
                        .unwrap_or(("Attachments", source_rel));
                    let (stem, ext) = file.rsplit_once('.').unwrap_or((file, ""));
                    let mut c = 1;
                    let mut cand = if ext.is_empty() {
                        format!("{dir}/{stem}_{c}")
                    } else {
                        format!("{dir}/{stem}_{c}.{ext}")
                    };
                    while root.join(&cand).exists() || used_asset_paths.contains(&cand) {
                        c += 1;
                        cand = if ext.is_empty() {
                            format!("{dir}/{stem}_{c}")
                        } else {
                            format!("{dir}/{stem}_{c}.{ext}")
                        };
                    }
                    (cand, false)
                }
            } else {
                (source_rel.clone(), false)
            }
        } else {
            (source_rel.clone(), false)
        };
        used_asset_paths.insert(dest_rel.clone());
        planned_asset_paths.push(PlannedAssetPath {
            source_relative_path: source_rel.clone(),
            destination_relative_path: dest_rel,
            size: asset_size,
            sha256: asset_sha256,
            reused_existing: reused,
        });
    }

    let mut proposed_plan = existing_plan.clone();
    proposed_plan.revision += 1;

    let remapped_source_plan = remap_plan(&loaded.plan, &id_mappings)?;
    proposed_plan
        .universes
        .extend(remapped_source_plan.universes);
    proposed_plan.books.extend(remapped_source_plan.books);
    proposed_plan
        .branches
        .extend(remapped_source_plan.branches);
    proposed_plan
        .entities
        .extend(remapped_source_plan.entities);
    proposed_plan.nodes.extend(remapped_source_plan.nodes);
    proposed_plan
        .relationships
        .extend(remapped_source_plan.relationships);

    if let Err(e) = crate::thought::validate(&proposed_plan) {
        diagnostics.push(Diagnostic {
            code: "merged_plan_validation_failed".into(),
            record_id: proposed_universe_id.clone(),
            message: format!("Proposed merged planning catalog failed validation: {e}"),
        });
    }
    if let Err(e) = validate::strict_history(&proposed_plan) {
        diagnostics.push(Diagnostic {
            code: "strict_history_validation_failed".into(),
            record_id: proposed_universe_id.clone(),
            message: format!("Proposed merged planning history failed validation: {e}"),
        });
    }

    // Verify existing destination records in proposed_plan remain 100% unchanged
    assert_eq!(
        existing_plan.universes,
        proposed_plan.universes[..existing_plan.universes.len()]
    );
    assert_eq!(
        existing_plan.books,
        proposed_plan.books[..existing_plan.books.len()]
    );
    assert_eq!(
        existing_plan.branches,
        proposed_plan.branches[..existing_plan.branches.len()]
    );
    assert_eq!(
        existing_plan.entities,
        proposed_plan.entities[..existing_plan.entities.len()]
    );
    assert_eq!(
        existing_plan.nodes,
        proposed_plan.nodes[..existing_plan.nodes.len()]
    );
    assert_eq!(
        existing_plan.relationships,
        proposed_plan.relationships[..existing_plan.relationships.len()]
    );

    let remapped_ordering = remap_ordering(&loaded.manifest.ordering, &id_mappings);

    let mut remapped_documents = Vec::new();
    for doc in &loaded.documents {
        let new_fm = remap_frontmatter(
            &doc.frontmatter,
            &id_mappings,
            target_house_id,
            source_universe_id,
        )?;
        let mut new_entry = doc.entry.clone();
        new_entry.id = id_mappings
            .get(&doc.entry.id)
            .cloned()
            .unwrap_or_else(|| doc.entry.id.clone());
        new_entry.universe_id = proposed_universe_id.clone();
        new_entry.book_id = doc
            .entry
            .book_id
            .as_ref()
            .map(|b| id_mappings.get(b).cloned().unwrap_or_else(|| b.clone()));

        let mut detail = doc.detail.clone();
        detail.metadata.id = new_entry.id.clone();
        detail.metadata.house_id = target_house_id.to_string();
        detail.metadata.parent_id = detail
            .metadata
            .parent_id
            .as_ref()
            .map(|p| id_mappings.get(p).cloned().unwrap_or_else(|| p.clone()));

        remapped_documents.push(PackageDocument {
            entry: new_entry,
            detail,
            frontmatter: new_fm,
            bytes: doc.bytes.clone(),
        });
    }

    for timeline in &remapped_ordering.timelines {
        let mut actual_nodes: Vec<_> = proposed_plan
            .nodes
            .iter()
            .filter(|n| {
                n.universe_id == proposed_universe_id
                    && n.book_id == timeline.book_id
                    && n.branch_id == timeline.branch_id
            })
            .collect();
        actual_nodes.sort_by(|a, b| a.position.cmp(&b.position).then(a.id.cmp(&b.id)));
        let actual_ids: Vec<String> = actual_nodes.iter().map(|n| n.id.clone()).collect();
        if actual_ids != timeline.milestone_ids {
            diagnostics.push(Diagnostic {
                code: "milestone_order_mismatch".into(),
                record_id: format!("{:?}:{:?}", timeline.book_id, timeline.branch_id),
                message: "Remapped milestone ordering differs from canonical positions".into(),
            });
        }
    }

    for chapter_order in &remapped_ordering.chapters {
        let mut prev: Option<(f64, Vec<u8>, usize)> = None;
        for cid in &chapter_order.chapter_ids {
            if let Some(doc) = remapped_documents.iter().find(|d| d.entry.id == *cid) {
                let key = (
                    doc.frontmatter["metadata"]
                        .get("chapter_order")
                        .and_then(Value::as_f64)
                        .unwrap_or(999999.0),
                    validate::chapter_date_key(&doc.detail.metadata.created_at)?,
                    remapped_ordering
                        .source_document_ids
                        .iter()
                        .position(|v| v == cid)
                        .unwrap_or(0),
                );
                if prev.as_ref().is_some_and(|p| p > &key) {
                    diagnostics.push(Diagnostic {
                        code: "chapter_order_mismatch".into(),
                        record_id: cid.clone(),
                        message: "Remapped chapter ordering differs from canonical order".into(),
                    });
                }
                prev = Some(key);
            }
        }
    }

    if request.policy == ImportIdentityPolicy::Preserve {
        for c in &collisions {
            diagnostics.push(Diagnostic {
                code: "identity_collision".into(),
                record_id: c.source_id.clone(),
                message: c.message.clone(),
            });
        }
    }

    let is_valid = match request.policy {
        ImportIdentityPolicy::Preserve => collisions.is_empty() && diagnostics.is_empty(),
        ImportIdentityPolicy::SeparateCopy => diagnostics.is_empty(),
    };

    let summary = ImportPlanSummary {
        documents_count: loaded.manifest.documents.len(),
        archived_documents_count: loaded.manifest.archived_documents.len(),
        books_count: loaded.plan.books.len(),
        branches_count: loaded.plan.branches.len(),
        milestones_count: loaded.plan.nodes.len(),
        relationships_count: loaded.plan.relationships.len(),
        assets_count: loaded.manifest.assets.len(),
        omitted_chapters_count: loaded.manifest.scope.omitted_chapters.len(),
        omitted_books_count: loaded.manifest.scope.omitted_book_ids.len(),
    };

    Ok(ImportPreview {
        operation_id: op_id,
        package_path: request.package_path,
        package_sha256: loaded.inspection.archive_sha256,
        package_id: loaded.manifest.package_id,
        target_house_id: target_house_id.to_string(),
        target_house_name: target_house.name.clone(),
        policy: request.policy,
        destination_fingerprint,
        source_universe_name: loaded.plan.universes[0].name.clone(),
        proposed_universe_id,
        proposed_universe_name,
        source_plan_revision: loaded.manifest.source_plan_revision,
        target_plan_revision: existing_plan.revision,
        proposed_plan_revision: proposed_plan.revision,
        id_mappings,
        document_paths: planned_document_paths,
        asset_paths: planned_asset_paths,
        summary,
        collisions,
        diagnostics,
        is_valid,
        proposed_plan: Some(proposed_plan),
    })
}

pub fn check_freshness(state: &AppState, preview: &ImportPreview) -> Result<()> {
    let pkg_path = Path::new(&preview.package_path);
    if !pkg_path.exists() {
        return Err("Package file no longer exists".into());
    }
    let (current_pkg_hash, _) = vault::file_digest(pkg_path)?;
    if current_pkg_hash != preview.package_sha256 {
        return Err("Package has changed since preview was generated".into());
    }

    let fresh = self::preview(
        state,
        ImportPreviewRequest {
            package_path: preview.package_path.clone(),
            target_house_id: preview.target_house_id.clone(),
            policy: preview.policy.clone(),
            operation_id: Some(preview.operation_id.clone()),
        },
    )?;

    if fresh.destination_fingerprint != preview.destination_fingerprint {
        return Err(
            "Stale import plan: destination notebook or target house state has changed since preview was generated. Please refresh the preview."
                .into(),
        );
    }

    Ok(())
}
