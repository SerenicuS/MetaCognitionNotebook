use super::generator::{self, generate_markdown};
use super::models::*;
use super::pdf;
use crate::{
    commands::AppState,
    models::{DocumentType, Frontmatter, HouseRegistry},
    thought::{self, Plan, Universe},
    vault,
};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fs::OpenOptions, io::Write, path::Path};

type Result<T> = std::result::Result<T, String>;

pub fn get_category_for_entry_type(entry_type: &str) -> String {
    match entry_type.to_lowercase().as_str() {
        "character" => "characters".into(),
        "location" => "locations".into(),
        "faction" | "nation" => "factions".into(),
        "concept" | "rule" => "rules".into(),
        "culture" | "history" => "cultures".into(),
        "artifact" | "item" => "artifacts".into(),
        "event" => "events".into(),
        _ => "other".into(),
    }
}

pub fn compute_source_fingerprint(root: &Path, universe_id: &str) -> Result<String> {
    let mut hasher = Sha256::new();
    hasher.update(b"publication-v1:");
    hasher.update(universe_id.as_bytes());
    hasher.update(b":");

    let lorebooks_dir = root.join("Lorebooks");
    if lorebooks_dir.exists() {
        let mut paths = Vec::new();
        for entry in walkdir::WalkDir::new(&lorebooks_dir)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.file_type().is_file() {
                if let Ok(rel) = entry.path().strip_prefix(root) {
                    paths.push(rel.to_string_lossy().replace('\\', "/"));
                }
            }
        }
        paths.sort();
        for p in paths {
            let full = root.join(&p);
            let bytes = vault::bounded_source(&full)?;
            let file_hash = vault::bytes_hash(&bytes);
            hasher.update(p.as_bytes());
            hasher.update(b"=");
            hasher.update(file_hash.as_bytes());
            hasher.update(b";");
        }
    }

    let library_json = root.join("library.json");
    if library_json.exists() {
        let bytes = vault::bounded_source(&library_json)?;
        hasher.update(b"library.json=");
        hasher.update(vault::bytes_hash(&bytes).as_bytes());
    }

    Ok(format!("{:x}", hasher.finalize()))
}

pub struct CollectedSource {
    pub universe: Universe,
    pub plan: Plan,
    pub docs: Vec<PublishedDoc>,
    pub chapter_titles: HashMap<String, PublicationChapterSource>,
    pub warnings: Vec<PublicationWarning>,
    pub fingerprint: String,
}

pub fn collect_source(root: &Path, request: &PublicationRequest) -> Result<CollectedSource> {
    let fingerprint = compute_source_fingerprint(root, &request.universe_id)?;
    let warnings = Vec::new();

    // 1. Find library.json registry
    let registry = if root.join("library.json").exists() {
        let bytes = vault::bounded_source(&root.join("library.json"))?;
        let val: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if let Some(h) = val.get("house_registry") {
            serde_json::from_value::<HouseRegistry>(h.clone()).map_err(|e| e.to_string())?
        } else {
            HouseRegistry::default_registry("1970-01-01T00:00:00Z")
        }
    } else {
        HouseRegistry::default_registry("1970-01-01T00:00:00Z")
    };

    // 2. Discover Lorebooks and catalog
    let lorebooks_dir = root.join("Lorebooks");
    if !lorebooks_dir.exists() {
        return Err("No Lorebooks directory found in notebook".into());
    }

    let mut catalog: Option<Plan> = None;
    let mut raw_docs = Vec::new();

    for entry in walkdir::WalkDir::new(&lorebooks_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }

        let bytes = vault::bounded_source(p)?;
        let text = match std::str::from_utf8(&bytes) {
            Ok(t) => t,
            Err(_) => continue,
        };

        if let Some(rest) = text.strip_prefix("---json\n") {
            if let Some((header, body)) = rest.split_once("\n---\n") {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(header) {
                    if val
                        .get("metadata")
                        .and_then(|m| m.get(thought::KEY))
                        .is_some()
                    {
                        if catalog.is_some() {
                            return Err(
                                "Multiple Web of Thought catalogs found; resolve duplicates before publication".into(),
                            );
                        }
                        let plan: Plan =
                            serde_json::from_value(val["metadata"][thought::KEY].clone())
                                .map_err(|e| e.to_string())?;
                        thought::validate(&plan)?;
                        catalog = Some(plan);
                        continue;
                    }

                    if let Ok(fm) = serde_json::from_value::<Frontmatter>(val.clone()) {
                        if fm.doc_type == DocumentType::Lorebook {
                            raw_docs.push((fm, body.to_string(), val));
                        }
                    }
                }
            }
        }
    }

    let plan = catalog.ok_or_else(|| {
        "A canonical Web of Thought catalog is required for publication".to_string()
    })?;

    let universe = plan
        .universes
        .iter()
        .find(|u| u.id == request.universe_id)
        .cloned()
        .ok_or_else(|| {
            format!(
                "Universe '{}' not found in planning catalog",
                request.universe_id
            )
        })?;

    // 3. Process documents and attribution
    let mut published_docs = Vec::new();
    let mut chapter_titles = HashMap::new();

    for (fm, body, _val) in raw_docs {
        let meta = fm.metadata.as_ref().and_then(|m| m.as_object());
        let explicit_uid = meta
            .and_then(|m| m.get("universe_id"))
            .and_then(|v| v.as_str());
        let legacy_uname = meta
            .and_then(|m| m.get("universe"))
            .and_then(|v| v.as_str());
        let registered = plan.entities.iter().find(|e| e.id == fm.id);

        let attribution = if let Some(uid) = explicit_uid {
            Some(uid.to_string())
        } else if let Some(uname) = legacy_uname {
            let house_id = fm
                .house_id
                .as_deref()
                .unwrap_or(crate::models::DEFAULT_HOUSE_ID);
            crate::models::resolve_legacy_universe_id(uname, house_id, &plan.universes, &registry)
                .ok()
                .flatten()
        } else {
            registered.map(|e| e.universe_id.clone())
        };

        let owner = registry
            .houses
            .iter()
            .find(|h| h.universe_ids.contains(&universe.id))
            .map(|h| h.id.as_str())
            .unwrap_or(crate::models::DEFAULT_HOUSE_ID);
        if fm
            .house_id
            .as_deref()
            .unwrap_or(crate::models::DEFAULT_HOUSE_ID)
            != owner
        {
            continue;
        }
        if attribution.as_deref() != Some(&universe.id) {
            continue;
        }

        let entry_type = meta
            .and_then(|m| m.get("entry_type"))
            .and_then(|v| v.as_str())
            .unwrap_or("other");

        // Check archived status
        let is_archived = meta
            .and_then(|m| m.get("archived"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
            || meta.and_then(|m| m.get("status")).and_then(|v| v.as_str()) == Some("archived");

        if is_archived && !request.include_archived {
            continue;
        }

        // Check canon_status
        let canon_status = meta
            .and_then(|m| m.get("canon_status"))
            .and_then(|v| v.as_str())
            .unwrap_or("canon");

        if canon_status == "draft" && !request.include_drafts {
            continue;
        }
        if canon_status == "speculative" && !request.include_speculative {
            continue;
        }

        // Chapters are title/reference sources only when explicitly selected and privacy eligible.
        if entry_type == "chapter" {
            if !request
                .selected_entity_ids
                .as_ref()
                .is_some_and(|ids| ids.contains(&fm.id))
                && !request
                    .selected_excerpts
                    .iter()
                    .any(|e| e.chapter_id == fm.id)
            {
                continue;
            }
            let Some(book) = meta
                .and_then(|m| m.get("book_id"))
                .and_then(|v| v.as_str())
                .and_then(|id| {
                    plan.books
                        .iter()
                        .find(|b| b.id == id && b.universe_id == universe.id && !b.archived)
                })
            else {
                continue;
            };
            let milestone_id = meta
                .and_then(|m| m.get("milestone_id"))
                .and_then(|v| v.as_str())
                .map(str::to_string);
            if let Some(mid) = &milestone_id {
                let Some(node) = plan.nodes.iter().find(|n| {
                    &n.id == mid
                        && !n.archived
                        && n.book_id.is_none()
                        && n.universe_id == universe.id
                }) else {
                    continue;
                };
                let compatible = if let Some(branch_id) = &book.branch_id {
                    let Some(branch) = plan.branches.iter().find(|b| {
                        &b.id == branch_id && b.universe_id == universe.id && !b.archived
                    }) else {
                        continue;
                    };
                    node.branch_id.as_ref() == Some(branch_id)
                        || node.id == branch.divergence_node_id
                } else {
                    node.branch_id.is_none()
                };
                if !compatible {
                    continue;
                }
            }
            chapter_titles.insert(
                fm.id.clone(),
                PublicationChapterSource {
                    title: fm.title.clone(),
                    book_name: book.name.clone(),
                    milestone_id,
                },
            );
            continue;
        }

        let category = get_category_for_entry_type(entry_type);

        // Check selected_categories
        if !request
            .selected_categories
            .iter()
            .any(|c| c.eq_ignore_ascii_case(&category))
        {
            continue;
        }

        // Check selected_entity_ids
        if let Some(ref sel_ids) = request.selected_entity_ids {
            if !sel_ids.contains(&fm.id) {
                continue;
            }
        }

        // Parse fields
        let attributes = meta
            .and_then(|m| m.get("attributes"))
            .and_then(|a| serde_json::from_value::<Vec<LorebookAttribute>>(a.clone()).ok())
            .unwrap_or_default();

        let character_fields = meta
            .and_then(|m| m.get("character_fields"))
            .and_then(|c| serde_json::from_value::<CharacterFields>(c.clone()).ok());

        let location_fields = meta
            .and_then(|m| m.get("location_fields"))
            .and_then(|l| serde_json::from_value::<LocationFields>(l.clone()).ok());

        let faction_fields = meta
            .and_then(|m| m.get("faction_fields"))
            .and_then(|f| serde_json::from_value::<FactionFields>(f.clone()).ok());

        let artifact_fields = meta
            .and_then(|m| m.get("artifact_fields"))
            .and_then(|a| serde_json::from_value::<ArtifactFields>(a.clone()).ok());

        let rule_fields = meta
            .and_then(|m| m.get("rule_fields"))
            .and_then(|r| serde_json::from_value::<RuleFields>(r.clone()).ok());

        let event_fields = meta
            .and_then(|m| m.get("event_fields"))
            .and_then(|e| serde_json::from_value::<EventFields>(e.clone()).ok());

        published_docs.push(PublishedDoc {
            id: fm.id,
            title: fm.title,
            category,
            entry_type: entry_type.to_string(),
            canon_status: canon_status.to_string(),
            attributes,
            character_fields,
            location_fields,
            faction_fields,
            artifact_fields,
            rule_fields,
            event_fields,
            prose: body,
        });
    }

    Ok(CollectedSource {
        universe,
        plan,
        docs: published_docs,
        chapter_titles,
        warnings,
        fingerprint,
    })
}

pub fn build_preview(state: &AppState, request: PublicationRequest) -> Result<PublicationPreview> {
    let root = state.storage.get_root();
    let mut collected = collect_source(root, &request)?;

    let doc = generator::build_publication_document(
        &collected.universe,
        &collected.docs,
        &collected.plan,
        &request,
        &collected.chapter_titles,
        &mut collected.warnings,
    );

    let md = generator::render_markdown_from_document(&doc, &request);

    let mut category_counts = std::collections::BTreeMap::new();
    for sec in &doc.sections {
        category_counts.insert(sec.category.clone(), sec.entries.len());
    }

    let rel_count = doc.relationships.len();
    let milestone_count = doc
        .timeline
        .as_ref()
        .map(|t| t.milestones.len())
        .unwrap_or(0);
    let exc_count = doc.excerpts.len();

    let doc_title = doc.title.clone();
    let word_count = md.split_whitespace().count();

    Ok(PublicationPreview {
        title: doc_title,
        universe_name: collected.universe.name,
        table_of_contents: doc.table_of_contents.clone(),
        entry_count: collected.docs.len(),
        category_counts,
        relationship_count: rel_count,
        milestone_count,
        excerpt_count: exc_count,
        word_count,
        generated_markdown: md,
        warnings: collected.warnings,
        source_fingerprint: collected.fingerprint,
        document: doc,
    })
}

pub fn publish_markdown_to_file(
    state: &AppState,
    req: PublishMarkdownRequest,
) -> Result<PublishMarkdownResult> {
    let dest = Path::new(&req.destination_path);
    if dest.exists() {
        return Err(format!(
            "Export destination already exists; no file was overwritten: {}",
            req.destination_path
        ));
    }

    let parent = dest.parent().ok_or("Invalid destination path")?;
    if !parent.exists() {
        return Err(format!(
            "Destination parent directory does not exist: {}",
            parent.display()
        ));
    }

    // Verify DB writability and locks
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;
    let registry_lock = state.storage.get_registry_lock();
    let _reg_guard = registry_lock.lock().map_err(|e| e.to_string())?;

    if state.storage.has_pending_universe_move_journal()? {
        return Err("Complete pending Universe move recovery before publication".into());
    }
    if crate::portable::has_pending_import_journal(state)? {
        return Err("Complete pending import recovery before publication".into());
    }

    let root = state.storage.get_root();
    let current_fingerprint = compute_source_fingerprint(root, &req.request.universe_id)?;

    if current_fingerprint != req.expected_source_fingerprint {
        return Err("Source notebook changed during publication; retry after saving".into());
    }

    let mut collected = collect_source(root, &req.request)?;
    let gen = generate_markdown(
        &collected.universe,
        &collected.docs,
        &collected.plan,
        &req.request,
        &collected.chapter_titles,
        &mut collected.warnings,
    );

    let bytes = gen.markdown.as_bytes();
    let word_count = gen.markdown.split_whitespace().count();

    // Exclusive write: OpenOptions create_new(true) guarantees atomic no-clobber
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dest)
        .map_err(|e| {
            format!(
                "Failed to open destination file exclusively without overwriting: {}",
                e
            )
        })?;

    file.write_all(bytes)
        .map_err(|e| format!("Failed to write publication markdown: {}", e))?;
    file.sync_all()
        .map_err(|e| format!("Failed to flush publication file: {}", e))?;

    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let sha256 = format!("{:x}", hasher.finalize());

    Ok(PublishMarkdownResult {
        destination_path: req.destination_path,
        bytes_written: bytes.len(),
        word_count,
        sha256,
    })
}

pub fn publish_pdf_to_file(state: &AppState, req: PublishPdfRequest) -> Result<PublishPdfResult> {
    let dest = Path::new(&req.destination_path);
    if dest.exists() {
        return Err(format!(
            "Export destination already exists; no file was overwritten: {}",
            req.destination_path
        ));
    }

    if !req.destination_path.to_lowercase().ends_with(".pdf") {
        return Err("Publication destination must have a .pdf extension".into());
    }

    let parent = dest.parent().ok_or("Invalid destination path")?;
    if !parent.exists() {
        return Err(format!(
            "Destination parent directory does not exist: {}",
            parent.display()
        ));
    }

    // Verify DB writability and locks
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;
    let registry_lock = state.storage.get_registry_lock();
    let _reg_guard = registry_lock.lock().map_err(|e| e.to_string())?;

    if state.storage.has_pending_universe_move_journal()? {
        return Err("Complete pending Universe move recovery before publication".into());
    }
    if crate::portable::has_pending_import_journal(state)? {
        return Err("Complete pending import recovery before publication".into());
    }

    let root = state.storage.get_root();
    let current_fingerprint = compute_source_fingerprint(root, &req.request.universe_id)?;

    if current_fingerprint != req.expected_source_fingerprint {
        return Err("Source notebook changed during publication; retry after saving".into());
    }

    let mut collected = collect_source(root, &req.request)?;
    let doc = generator::build_publication_document(
        &collected.universe,
        &collected.docs,
        &collected.plan,
        &req.request,
        &collected.chapter_titles,
        &mut collected.warnings,
    );

    let (bytes, page_count) = if let Some(ref client_bytes) = req.pdf_bytes {
        if client_bytes.len() < 8 || !client_bytes.starts_with(b"%PDF-") {
            return Err("Invalid PDF payload: missing %PDF- header".into());
        }
        let page_count = client_bytes
            .windows(11)
            .filter(|w| *w == b"/Type /Page" || *w == b"/Type/Page ")
            .count()
            .max(1);
        (client_bytes.clone(), page_count)
    } else {
        pdf::render_pdf_from_document(&doc, &mut collected.warnings)
    };

    let word_count = doc
        .sections
        .iter()
        .map(|s| {
            s.entries
                .iter()
                .map(|e| {
                    e.title.split_whitespace().count()
                        + e.prose.as_deref().unwrap_or("").split_whitespace().count()
                })
                .sum::<usize>()
        })
        .sum();

    // Exclusive write: OpenOptions create_new(true) guarantees atomic no-clobber
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dest)
        .map_err(|e| {
            format!(
                "Failed to open destination file exclusively without overwriting: {}",
                e
            )
        })?;

    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write publication PDF: {}", e))?;
    file.sync_all()
        .map_err(|e| format!("Failed to flush publication PDF file: {}", e))?;

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let sha256 = format!("{:x}", hasher.finalize());

    Ok(PublishPdfResult {
        destination_path: req.destination_path,
        bytes_written: bytes.len(),
        page_count,
        word_count,
        sha256,
    })
}
