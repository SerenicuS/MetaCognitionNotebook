use super::*;
use crate::models::{DocumentMetadata, Frontmatter, HouseRegistry};

// Discovery is intentionally conservative and bounded, including archives and attachments.
// Watching the complete candidate inventory catches newly created ambiguous backups.
fn source_paths(root: &Path) -> Result<Vec<String>> {
    let mut paths = Vec::new();
    if root.join("library.json").exists() {
        paths.push("library.json".into());
    }
    for directory in ["Lorebooks", "Backups", "Attachments"] {
        let start = root.join(directory);
        if !start.exists() {
            continue;
        }
        for item in walkdir::WalkDir::new(start).follow_links(false) {
            let item = item.map_err(|e| e.to_string())?;
            let metadata = fs::symlink_metadata(item.path()).map_err(|e| e.to_string())?;
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if metadata.file_attributes() & 0x400 != 0 {
                    return Err("Linked/reparse source entry is unsupported".into());
                }
            }
            if metadata.file_type().is_symlink() {
                return Err("Linked source entry is unsupported".into());
            }
            if metadata.is_dir() {
                continue;
            }
            vault::plain_file(item.path())?;
            let relative = item
                .path()
                .strip_prefix(root)
                .map_err(|e| e.to_string())?
                .to_str()
                .ok_or("Non-Unicode source path")?
                .replace('\\', "/");
            vault::safe_path(&relative)?;
            paths.push(relative);
            if paths.len() > vault::MAX_FILES {
                return Err("Source candidate inventory exceeds 10,000 files".into());
            }
        }
    }
    paths.sort();
    vault::unique_names(paths.iter().map(String::as_str))?;
    Ok(paths)
}

pub(super) fn fingerprints(root: &Path) -> Result<BTreeMap<String, String>> {
    let mut result = BTreeMap::new();
    let mut total = 0u64;
    for path in source_paths(root)? {
        let bytes = vault::bounded_source(&root.join(&path))?;
        total += bytes.len() as u64;
        if total > 256 * 1024 * 1024 {
            return Err("Source candidate scan exceeds 256 MiB".into());
        }
        result.insert(path, vault::bytes_hash(&bytes));
    }
    Ok(result)
}

fn source(root: &Path, path: &str, fingerprints: &BTreeMap<String, String>) -> Result<Vec<u8>> {
    let bytes = vault::bounded_source(&root.join(path))?;
    if fingerprints.get(path) != Some(&vault::bytes_hash(&bytes)) {
        return Err(format!("Source changed during snapshot: {path}"));
    }
    Ok(bytes)
}

fn inventory_entry(path: &str) -> DocumentEntry {
    DocumentEntry {
        id: String::new(),
        path: String::new(),
        source_relative_path: path.into(),
        universe_id: String::new(),
        book_id: None,
        entry_type: String::new(),
        materialized_raw: false,
        opaque_fields: vec![],
    }
}

pub(super) fn capture(
    root: &Path,
    indexed: &[DocumentMetadata],
    request: &ExportRequest,
) -> Result<Snapshot> {
    let fingerprints = fingerprints(root)?;
    let registry = if fingerprints.contains_key("library.json") {
        let value = json::parse(&source(root, "library.json", &fingerprints)?)?;
        if !value.is_object() {
            return Err("library.json must be an object".into());
        }
        match value.get("house_registry") {
            Some(value) => {
                serde_json::from_value::<HouseRegistry>(value.clone()).map_err(|e| e.to_string())?
            }
            None => HouseRegistry::default_registry("1970-01-01T00:00:00Z"),
        }
    } else {
        HouseRegistry::default_registry("1970-01-01T00:00:00Z")
    };
    crate::storage::StorageManager::validate_registry_invariants(&registry)?;
    if registry.schema_version != 1 {
        return Err("Unsupported House registry version".into());
    }
    let mut candidates = Vec::new();
    let mut catalog: Option<Plan> = None;
    for path in fingerprints.keys().filter(|p| {
        (p.starts_with("Lorebooks/") || p.starts_with("Backups/")) && p.ends_with(".md")
    }) {
        let raw = source(root, path, &fingerprints)?;
        let text =
            std::str::from_utf8(&raw).map_err(|e| format!("Invalid UTF-8 at {path}: {e}"))?;
        let (bytes, materialized) = if let Some(rest) = text.strip_prefix("---json\n") {
            let (header, _) = rest
                .split_once("\n---\n")
                .ok_or_else(|| format!("Unterminated frontmatter: {path}"))?;
            let value = json::parse(header.as_bytes())?;
            if value
                .get("metadata")
                .and_then(|m| m.get(crate::thought::KEY))
                .is_some()
            {
                if path.starts_with("Backups/") {
                    return Err(
                        "Archived planning catalogs require manual resolution before export".into(),
                    );
                }
                if catalog.is_some() {
                    return Err(
                        "Multiple shared planning catalogs; resolve duplicates before export"
                            .into(),
                    );
                }
                let fm: Frontmatter =
                    serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
                if fm.doc_type != crate::models::DocumentType::Lorebook {
                    return Err("Catalog has wrong document type".into());
                }
                catalog = Some(
                    serde_json::from_value(value["metadata"][crate::thought::KEY].clone())
                        .map_err(|e| e.to_string())?,
                );
                continue;
            }
            if path.starts_with("Lorebooks/Web_of_Thought_") {
                return Err("Reserved catalog is missing planning metadata".into());
            }
            (raw, false)
        } else {
            if path.starts_with("Backups/") {
                return Err(format!(
                    "Archived raw Markdown identity cannot be resolved: {path}"
                ));
            }
            let matches: Vec<_> = indexed
                .iter()
                .filter(|m| m.relative_path == *path)
                .collect();
            if matches.len() != 1 {
                return Err(format!(
                    "Raw Markdown requires one stable indexed identity: {path}"
                ));
            }
            let m = matches[0];
            let metadata = m
                .metadata_json
                .as_deref()
                .map(|v| json::parse(v.as_bytes()))
                .transpose()?;
            let fm = Frontmatter {
                id: m.id.clone(),
                title: m.title.clone(),
                doc_type: m.doc_type.clone(),
                house_id: Some(m.house_id.clone()),
                created_at: m.created_at.clone(),
                updated_at: m.updated_at.clone(),
                tags: m.tags.clone(),
                parent_id: m.parent_id.clone(),
                metadata,
            };
            let header = serde_json::to_string_pretty(&fm).map_err(|e| e.to_string())?;
            (format!("---json\n{header}\n---\n{text}").into_bytes(), true)
        };
        let header = std::str::from_utf8(&bytes)
            .map_err(|e| e.to_string())?
            .strip_prefix("---json\n")
            .unwrap()
            .split_once("\n---\n")
            .unwrap()
            .0;
        let value = json::parse(header.as_bytes())?;
        let fm: Frontmatter = serde_json::from_value(value)
            .map_err(|e| format!("Invalid frontmatter at {path}: {e}"))?;
        // Backups also contain other studios; do not interpret them as Universe entities.
        if fm.doc_type != crate::models::DocumentType::Lorebook {
            if path.starts_with("Lorebooks/") {
                return Err(format!("Wrong studio in Lorebooks: {path}"));
            }
            continue;
        }
        let mut entry = inventory_entry(path);
        entry.materialized_raw = materialized;
        // Defer Lorebook schema checks until attribution, but never discard unknown JSON fields.
        candidates.push((entry, bytes, fm));
    }
    let full = catalog
        .ok_or("A canonical Web of Thought catalog is required; export does not initialize one")?;
    crate::thought::validate(&full)?;
    let universe = full
        .universes
        .iter()
        .find(|u| u.id == request.universe_id)
        .ok_or("Source Universe not found")?;
    for indexed_doc in indexed.iter().filter(|d| {
        d.doc_type == crate::models::DocumentType::Lorebook
            && !fingerprints.contains_key(&d.relative_path)
    }) {
        let belongs = full
            .entities
            .iter()
            .any(|e| e.id == indexed_doc.id && e.universe_id == universe.id)
            || indexed_doc
                .metadata_json
                .as_deref()
                .map(|raw| json::parse(raw.as_bytes()))
                .transpose()?
                .as_ref()
                .and_then(|v| v.get("universe_id"))
                .and_then(Value::as_str)
                == Some(&universe.id);
        if belongs {
            return Err(format!(
                "Indexed canonical document is missing: {}",
                indexed_doc.id
            ));
        }
    }
    let owner = registry
        .houses
        .iter()
        .find(|h| h.universe_ids.contains(&universe.id))
        .or_else(|| {
            registry
                .houses
                .iter()
                .find(|h| h.id == crate::models::DEFAULT_HOUSE_ID)
        })
        .ok_or("Source House not found")?;
    let selected_books = unique(request.book_ids.clone(), "selected Book ID")?;
    let selected_chapters = unique(request.chapter_ids.clone(), "selected chapter ID")?;
    if selected_books.iter().any(|id| {
        !full
            .books
            .iter()
            .any(|b| b.id == *id && b.universe_id == universe.id)
    }) {
        return Err("Selected Book does not belong to source Universe".into());
    }
    let mut docs = Vec::new();
    let mut omissions = Vec::new();
    let mut all_chapters: BTreeMap<String, Vec<(String, f64, String, String)>> = BTreeMap::new();
    let mut warnings = Vec::new();
    let mut seen_source_ids = BTreeSet::new();
    for (mut entry, bytes, fm) in candidates {
        let meta = fm.metadata.as_ref().and_then(Value::as_object);
        let explicit = meta.and_then(|m| m.get("universe_id"));
        let legacy = meta.and_then(|m| m.get("universe")).and_then(Value::as_str);
        let registered = full.entities.iter().find(|e| e.id == fm.id);
        let attribution = if let Some(v) = explicit {
            let id = v
                .as_str()
                .filter(|id| !id.trim().is_empty())
                .ok_or("Invalid explicit Universe identity")?;
            Some(id.to_string())
        } else if let Some(name) = legacy {
            crate::models::resolve_legacy_universe_id(
                name,
                fm.house_id
                    .as_deref()
                    .unwrap_or(crate::models::DEFAULT_HOUSE_ID),
                &full.universes,
                &registry,
            )?
        } else {
            registered.map(|e| e.universe_id.clone())
        };
        let relevant = attribution.as_deref() == Some(&universe.id)
            || registered.is_some_and(|e| e.universe_id == universe.id);
        if !relevant {
            continue;
        }
        if attribution.as_deref() != Some(&universe.id)
            || registered.is_some_and(|e| e.universe_id != universe.id)
        {
            return Err(format!("Conflicting Universe attribution: {}", fm.id));
        }
        let house = fm
            .house_id
            .as_deref()
            .unwrap_or(crate::models::DEFAULT_HOUSE_ID);
        if house != owner.id {
            return Err(format!("Foreign-House document: {}", fm.id));
        }
        // Multiple active/archive candidates are never resolved by filename or timestamp.
        if !seen_source_ids.insert(fm.id.clone()) {
            return Err(format!(
                "Ambiguous active/archived document identity: {}",
                fm.id
            ));
        }
        let m = meta.ok_or("Lorebook metadata must be an object")?;
        let entry_type = m
            .get("entry_type")
            .and_then(Value::as_str)
            .ok_or("Missing Lorebook entry_type")?
            .to_string();
        let book = if let Some(id) = m.get("book_id") {
            let id = id
                .as_str()
                .filter(|s| !s.is_empty())
                .ok_or("Invalid Book identity")?;
            Some(
                full.books
                    .iter()
                    .find(|b| b.id == id && b.universe_id == universe.id)
                    .ok_or("Missing/foreign Book reference")?
                    .id
                    .clone(),
            )
        } else if let Some(name) = m
            .get("book")
            .and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty())
        {
            let matches: Vec<_> = full
                .books
                .iter()
                .filter(|b| b.universe_id == universe.id && b.name == name)
                .collect();
            if matches.len() != 1 {
                return Err(format!("Ambiguous or missing legacy Book: {name}"));
            }
            Some(matches[0].id.clone())
        } else {
            None
        };
        entry.id = fm.id.clone();
        entry.universe_id = universe.id.clone();
        entry.book_id = book.clone();
        entry.entry_type = entry_type.clone();
        entry.path = format!(
            "{}/{:06}.md",
            if entry.source_relative_path.starts_with("Backups/") {
                "archives"
            } else {
                "documents"
            },
            docs.len()
        );
        let mut doc = parse_document(bytes, entry)?;
        doc.entry.opaque_fields = validate::opaque_fields(&doc.frontmatter);
        if !doc.entry.opaque_fields.is_empty() {
            warnings.push(Diagnostic { code: "opaque_frontmatter".into(), record_id: fm.id.clone(), message: "Unknown fields preserved; their reference semantics require an adapter before future ID remapping".into() });
        }
        if entry_type != "chapter" && m.get("book_id").is_some() {
            all_chapters
                .entry(book.clone().ok_or("Missing associated Book")?)
                .or_default()
                .push((
                    fm.id.clone(),
                    m.get("chapter_order")
                        .and_then(Value::as_f64)
                        .unwrap_or(999999.0),
                    fm.created_at.clone(),
                    doc.entry.source_relative_path.clone(),
                ));
        }
        if entry_type == "chapter" {
            let bid = book.ok_or("Chapter requires a resolved Book")?;
            all_chapters.entry(bid.clone()).or_default().push((
                fm.id.clone(),
                m.get("chapter_order")
                    .and_then(Value::as_f64)
                    .unwrap_or(999999.0),
                fm.created_at.clone(),
                doc.entry.source_relative_path.clone(),
            ));
            if !selected_chapters.contains(&fm.id) {
                omissions.push(OmittedChapter {
                    id: fm.id,
                    book_id: bid,
                    source_relative_path: doc.entry.source_relative_path,
                    chapter_order: m
                        .get("chapter_order")
                        .and_then(Value::as_f64)
                        .unwrap_or(999999.0),
                    created_at: fm.created_at.clone(),
                    reason: "chapter_prose_not_selected".into(),
                });
                continue;
            }
            if !selected_books.contains(&bid) {
                return Err(
                    "An included chapter requires its Book to be explicitly selected".into(),
                );
            }
        }
        docs.push(doc);
    }
    if selected_chapters.iter().any(|id| {
        !docs
            .iter()
            .any(|d| d.entry.id == *id && d.entry.entry_type == "chapter")
    }) {
        return Err("Selected chapter is missing or belongs to another Universe".into());
    }
    let omitted: BTreeSet<_> = omissions.iter().map(|d| d.id.as_str()).collect();
    let mut plan = Plan {
        version: 1,
        revision: full.revision,
        universes: vec![universe.clone()],
        books: full
            .books
            .iter()
            .filter(|b| b.universe_id == universe.id)
            .cloned()
            .collect(),
        branches: full
            .branches
            .iter()
            .filter(|b| b.universe_id == universe.id)
            .cloned()
            .collect(),
        entities: full
            .entities
            .iter()
            .filter(|e| e.universe_id == universe.id && !omitted.contains(e.id.as_str()))
            .cloned()
            .collect(),
        nodes: full
            .nodes
            .iter()
            .filter(|n| n.universe_id == universe.id)
            .cloned()
            .collect(),
        relationships: full
            .relationships
            .iter()
            .filter(|r| r.universe_id == universe.id)
            .cloned()
            .collect(),
    };
    let required_books: BTreeSet<String> = plan
        .nodes
        .iter()
        .filter_map(|n| n.book_id.clone())
        .chain(plan.relationships.iter().filter_map(|r| r.book_id.clone()))
        .chain(docs.iter().filter_map(|d| d.entry.book_id.clone()))
        .collect();
    let omitted_book_ids: Vec<_> = plan
        .books
        .iter()
        .filter(|b| !selected_books.contains(&b.id) && !required_books.contains(&b.id))
        .map(|b| b.id.clone())
        .collect();
    plan.books
        .retain(|b| selected_books.contains(&b.id) || required_books.contains(&b.id));
    let mut groups: BTreeMap<(Option<String>, Option<String>), Vec<&crate::thought::Node>> =
        BTreeMap::new();
    for n in &plan.nodes {
        groups
            .entry((n.book_id.clone(), n.branch_id.clone()))
            .or_default()
            .push(n);
    }
    let timelines = groups
        .into_iter()
        .map(|((book_id, branch_id), mut nodes)| {
            // IDs are UTF-8 byte ordered for portable determinism. Non-ASCII tied IDs are blocked below
            // because JS localeCompare is locale-sensitive; UUID/prefixed ASCII IDs are supported.
            nodes.sort_by(|a, b| a.position.cmp(&b.position).then(a.id.cmp(&b.id)));
            TimelineOrder {
                book_id,
                branch_id,
                milestone_ids: nodes.iter().map(|n| n.id.clone()).collect(),
            }
        })
        .collect();
    let mut source_docs: Vec<_> = docs
        .iter()
        .map(|d| (d.entry.id.clone(), d.entry.source_relative_path.clone()))
        .chain(
            omissions
                .iter()
                .map(|d| (d.id.clone(), d.source_relative_path.clone())),
        )
        .collect();
    source_docs.sort_by(|a, b| {
        let rank = |id: &str| {
            indexed
                .iter()
                .position(|d| d.id == id)
                .unwrap_or(usize::MAX)
        };
        rank(&a.0).cmp(&rank(&b.0)).then(a.1.cmp(&b.1))
    });
    let source_document_ids: Vec<_> = source_docs.into_iter().map(|d| d.0).collect();
    let chapters = all_chapters
        .into_iter()
        .map(|(book_id, mut values)| {
            for value in &values {
                validate::chapter_date_key(&value.2)?;
            }
            values.sort_by(|a, b| {
                a.1.total_cmp(&b.1)
                    .then_with(|| {
                        validate::chapter_date_key(&a.2)
                            .unwrap()
                            .cmp(&validate::chapter_date_key(&b.2).unwrap())
                    })
                    .then_with(|| {
                        source_document_ids
                            .iter()
                            .position(|id| id == &a.0)
                            .cmp(&source_document_ids.iter().position(|id| id == &b.0))
                    })
            });
            Ok(ChapterOrder {
                book_id,
                chapter_ids: values.into_iter().map(|v| v.0).collect(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let mut payloads = BTreeMap::new();
    payloads.insert(
        PLANNING.into(),
        serde_json::to_vec_pretty(&plan).map_err(|e| e.to_string())?,
    );
    let mut assets: BTreeMap<String, (String, BTreeSet<String>)> = BTreeMap::new();
    for doc in &docs {
        for target in validate::local_targets(&doc.detail.content, &doc.entry.source_relative_path)?
        {
            let next = assets.len();
            let (path, users) = assets
                .entry(target.clone())
                .or_insert_with(|| (format!("assets/a{next:06}"), BTreeSet::new()));
            users.insert(doc.entry.id.clone());
            if !payloads.contains_key(path) {
                payloads.insert(path.clone(), source(root, &target, &fingerprints)?);
            }
        }
        payloads.insert(doc.entry.path.clone(), doc.bytes.clone());
    }
    let assets = assets
        .into_iter()
        .map(|(source_relative_path, (path, users))| AssetEntry {
            path,
            source_relative_path,
            referenced_by: users.into_iter().collect(),
        })
        .collect();
    let mut total = 0u64;
    let files = payloads
        .iter()
        .map(|(path, bytes)| {
            total += bytes.len() as u64;
            FileEntry {
                path: path.clone(),
                size: bytes.len() as u64,
                sha256: vault::bytes_hash(bytes),
            }
        })
        .collect();
    if total > MAX_TOTAL_BYTES {
        return Err("Portable payload exceeds 128 MiB".into());
    }
    let manifest = Manifest {
        format: FORMAT.into(),
        format_version: 1,
        schema_version: 1,
        package_id: uuid::Uuid::new_v4().to_string(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        created_at: chrono::Utc::now().to_rfc3339(),
        source_universe_id: universe.id.clone(),
        source_house: HouseProvenance {
            id: owner.id.clone(),
            name: owner.name.clone(),
        },
        snapshot_basis: request.snapshot_basis.clone(),
        source_plan_revision: full.revision,
        compatibility: Compatibility {
            planning_schema_version: 1,
            history_semantics_version: 1,
            required_features: FEATURES.iter().map(|s| s.to_string()).collect(),
        },
        scope: Scope {
            worldbuilding_complete: true,
            selected_book_ids: selected_books.into_iter().collect(),
            structural_book_ids: plan
                .books
                .iter()
                .filter(|b| !request.book_ids.contains(&b.id))
                .map(|b| b.id.clone())
                .collect(),
            omitted_book_ids,
            included_chapter_ids: selected_chapters.into_iter().collect(),
            omitted_chapters: omissions,
        },
        planning_path: PLANNING.into(),
        documents: docs
            .iter()
            .filter(|d| d.entry.path.starts_with("documents/"))
            .map(|d| d.entry.clone())
            .collect(),
        archived_documents: docs
            .iter()
            .filter(|d| d.entry.path.starts_with("archives/"))
            .map(|d| d.entry.clone())
            .collect(),
        assets,
        ordering: Ordering {
            algorithm: "source-order-v1".into(),
            source_document_ids,
            timelines,
            chapters,
        },
        unresolved_references: vec![],
        warnings,
        files,
    };
    validate::package(&manifest, &plan, &docs, &payloads)?;
    if serde_json::to_vec_pretty(&manifest)
        .map_err(|e| e.to_string())?
        .len() as u64
        > MAX_MANIFEST_BYTES
    {
        return Err("Portable manifest exceeds 4 MiB".into());
    }
    Ok(Snapshot {
        manifest,
        payloads,
        fingerprints,
    })
}
