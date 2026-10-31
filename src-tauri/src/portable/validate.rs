use super::*;
use crate::models::DocumentType;

const ENTRY_TYPES: &[&str] = &[
    "character",
    "location",
    "faction",
    "event",
    "concept",
    "artifact",
    "chapter",
    "rule",
    "culture",
    "other",
];
fn id(value: &str) -> Result<()> {
    if value.trim().is_empty() || value.len() > 128 || value.chars().any(char::is_control) {
        return Err("Invalid canonical ID".into());
    }
    Ok(())
}
fn string_option(value: &Value, key: &str) -> Result<()> {
    if value
        .get(key)
        .is_some_and(|v| !v.is_null() && !v.is_string())
    {
        return Err(format!("Expected string/null: {key}"));
    }
    Ok(())
}
fn strings(value: &Value, key: &str) -> Result<()> {
    if let Some(v) = value.get(key) {
        let items = v
            .as_array()
            .ok_or_else(|| format!("Expected array: {key}"))?;
        for item in items {
            item.as_str()
                .ok_or_else(|| format!("Expected string array: {key}"))?;
        }
    }
    Ok(())
}
pub(super) fn document(detail: &DocumentDetail, fm: &Value) -> Result<()> {
    let d = &detail.metadata;
    id(&d.id)?;
    if d.doc_type != DocumentType::Lorebook || d.title.trim().is_empty() {
        return Err("Invalid Lorebook document type/title".into());
    }
    crate::models::parse_house_id_from_frontmatter(fm.get("house_id").and_then(Value::as_str))?;
    for date in [&d.created_at, &d.updated_at] {
        chrono::DateTime::parse_from_rfc3339(date).map_err(|e| e.to_string())?;
    }
    if let Some(parent) = &d.parent_id {
        id(parent)?;
    }
    let m = fm
        .get("metadata")
        .filter(|m| m.is_object())
        .ok_or("Canonical Lorebook metadata must be an object")?;
    if m.get(crate::thought::KEY).is_some() {
        return Err("Shared catalog cannot be a portable entity document".into());
    }
    if !m
        .get("entry_type")
        .and_then(Value::as_str)
        .is_some_and(|s| ENTRY_TYPES.contains(&s))
    {
        return Err("Unsupported Lorebook entry_type".into());
    }
    if m.get("canon_status").is_some_and(|v| {
        !v.as_str()
            .is_some_and(|s| ["canon", "draft", "speculative"].contains(&s))
    }) {
        return Err("Invalid canon_status".into());
    }
    for key in [
        "universe",
        "universe_id",
        "book",
        "book_id",
        "chapter",
        "milestone_id",
    ] {
        string_option(m, key)?;
    }
    if m.get("archived").is_some_and(|v| !v.is_boolean()) {
        return Err("Invalid archived flag".into());
    }
    if m.get("chapter_order").is_some_and(|v| !v.is_number()) {
        return Err("Invalid chapter_order".into());
    }
    if let Some(attributes) = m.get("attributes") {
        let attrs = attributes.as_array().ok_or("Attributes must be an array")?;
        let mut ids = BTreeSet::new();
        for attr in attrs {
            let aid = attr
                .get("id")
                .and_then(Value::as_str)
                .ok_or("Attribute ID required")?;
            id(aid)?;
            if !ids.insert(aid)
                || !attr.get("key").is_some_and(Value::is_string)
                || !attr.get("value").is_some_and(Value::is_string)
            {
                return Err("Invalid/duplicate custom attribute".into());
            }
        }
    }
    if let Some(refs_val) = m.get("echo_references") {
        let refs = refs_val.as_array().ok_or("echo_references must be an array")?;
        for item in refs {
            let item_obj = item.as_object().ok_or("echo_references item must be an object")?;
            let id_str = item_obj
                .get("id")
                .and_then(Value::as_str)
                .ok_or("echo_references item id required")?;
            if id_str.trim().is_empty() {
                return Err("echo_references item id cannot be empty".into());
            }
            let target_id = item_obj
                .get("targetId")
                .or_else(|| item_obj.get("entityId"))
                .and_then(Value::as_str)
                .ok_or("echo_references targetId required")?;
            id(target_id)?;
            let from = item_obj
                .get("from")
                .and_then(Value::as_i64)
                .ok_or("echo_references from offset required")?;
            let to = item_obj
                .get("to")
                .and_then(Value::as_i64)
                .ok_or("echo_references to offset required")?;
            if from < 0 || to < from {
                return Err("Invalid echo_references offset bounds".into());
            }
            if !item_obj.get("matchedText").is_some_and(Value::is_string) {
                return Err("echo_references matchedText required".into());
            }
            if let Some(status) = item_obj.get("status").and_then(Value::as_str) {
                if !["active", "unresolved", "detached"].contains(&status) {
                    return Err("Invalid echo_references status".into());
                }
            }
            for anchor_key in ["contextAnchor", "anchor"] {
                if let Some(anchor) = item_obj.get(anchor_key) {
                    if !anchor.is_object() {
                        return Err(format!("Invalid echo_references {anchor_key} object"));
                    }
                    if anchor.get("before").is_some_and(|v| !v.is_string())
                        || anchor.get("after").is_some_and(|v| !v.is_string())
                    {
                        return Err(format!("Invalid {anchor_key} string fields"));
                    }
                }
            }
        }
    }
    for key in [
        "character_fields",
        "location_fields",
        "faction_fields",
        "rule_fields",
        "artifact_fields",
        "event_fields",
        "custom_fields",
    ] {
        if let Some(fields) = m.get(key) {
            if !fields.is_object() {
                return Err(format!("Expected metadata object: {key}"));
            }
        }
    }
    for (section, fields) in [
        ("character_fields", "role species affiliation residence goals motivations strengths weaknesses age gender vital_status physical_appearance clothing_attire personality occupation narrative_role"),
        ("location_fields", "location_type region inhabitants factions notable_events"),
        ("faction_fields", "faction_type leadership ideology territory territory_notes allies rivals headquarters"),
        ("artifact_fields", "artifact_type owner creator origin powers"),
        ("event_fields", "event_type location participants date_era outcome significance"),
        ("rule_fields", "system_type principles limitations exceptions consequences")
    ] {
        if let Some(value) = m.get(section) {
            for key in fields.split_whitespace() { string_option(value, key)?; }
        }
    }
    if let Some(aliases) = m.pointer("/character_fields/aliases") {
        // Both legacy delimited aliases and the current string array are supported.
        if !aliases.is_string() {
            strings(&m["character_fields"], "aliases")?;
        }
    }
    Ok(())
}

pub(super) fn opaque_fields(fm: &Value) -> Vec<String> {
    let mut result = Vec::new();
    fn unknown(value: &Value, known: &str, prefix: &str, result: &mut Vec<String>) {
        if let Some(map) = value.as_object() {
            for key in map.keys() {
                if !known.split_whitespace().any(|k| k == key) {
                    result.push(format!(
                        "{prefix}/{}",
                        key.replace('~', "~0").replace('/', "~1")
                    ));
                }
            }
        }
    }
    unknown(
        fm,
        "id title type house_id created_at updated_at tags parent_id metadata",
        "",
        &mut result,
    );
    let m = &fm["metadata"];
    unknown(m, "universe universe_id book book_id chapter chapter_order milestone_id entry_type canon_status attributes echo_references character_fields location_fields faction_fields rule_fields artifact_fields event_fields archived _workshop custom_fields", "/metadata", &mut result);
    for (key, known) in [
        ("character_fields", "role species affiliation residence goals motivations strengths weaknesses age gender aliases vital_status physical_appearance clothing_attire personality occupation narrative_role"),
        ("faction_fields", "faction_type leadership ideology territory territory_notes allies rivals headquarters positions branches"),
        ("location_fields", "location_type region inhabitants factions notable_events"),
        ("rule_fields", "system_type principles limitations exceptions consequences"),
        ("artifact_fields", "artifact_type owner creator origin powers"),
        ("event_fields", "event_type location participants date_era outcome significance")
    ] { unknown(&m[key], known, &format!("/metadata/{key}"), &mut result); }
    for (key, known) in [
        (
            "positions",
            "id title description branch_id parent_position_id holder_ids sort_order",
        ),
        (
            "branches",
            "id name description parent_branch_id sort_order",
        ),
    ] {
        if let Some(items) = m
            .pointer(&format!("/faction_fields/{key}"))
            .and_then(Value::as_array)
        {
            for (i, item) in items.iter().enumerate() {
                unknown(
                    item,
                    known,
                    &format!("/metadata/faction_fields/{key}/{i}"),
                    &mut result,
                );
            }
        }
    }
    if let Some(attrs) = m.get("attributes").and_then(Value::as_array) {
        for (i, item) in attrs.iter().enumerate() {
            unknown(
                item,
                "id key value",
                &format!("/metadata/attributes/{i}"),
                &mut result,
            );
        }
    }
    if let Some(refs) = m.get("echo_references").and_then(Value::as_array) {
        for (i, item) in refs.iter().enumerate() {
            unknown(
                item,
                "id targetId entityId from to matchedText anchor contextAnchor status createdAt updatedAt version",
                &format!("/metadata/echo_references/{i}"),
                &mut result,
            );
            if let Some(anchor) = item.get("contextAnchor") {
                unknown(
                    anchor,
                    "before after",
                    &format!("/metadata/echo_references/{i}/contextAnchor"),
                    &mut result,
                );
            }
            if let Some(anchor) = item.get("anchor") {
                unknown(
                    anchor,
                    "before after",
                    &format!("/metadata/echo_references/{i}/anchor"),
                    &mut result,
                );
            }
        }
    }
    if let Some(workshop) = m.get("_workshop") {
        unknown(
            workshop,
            "favorite last_opened_at",
            "/metadata/_workshop",
            &mut result,
        );
    }
    result.sort();
    result
}

fn require_doc<'a>(
    docs: &'a BTreeMap<&str, &PackageDocument>,
    target: &str,
) -> Result<&'a PackageDocument> {
    docs.get(target)
        .copied()
        .ok_or_else(|| format!("Unresolved required document reference: {target}"))
}

pub(super) fn package(
    m: &Manifest,
    plan: &Plan,
    documents: &[PackageDocument],
    payloads: &BTreeMap<String, Vec<u8>>,
) -> Result<()> {
    crate::thought::validate(plan)?;
    reject_metadata_assets(&serde_json::to_value(plan).map_err(|e| e.to_string())?)?;
    if plan.universes.len() != 1
        || plan.universes[0].id != m.source_universe_id
        || m.planning_path != PLANNING
        || !m.scope.worldbuilding_complete
        || !m.unresolved_references.is_empty()
        || m.source_plan_revision != plan.revision
    {
        return Err("Incomplete or inconsistent single-Universe package".into());
    }
    uuid::Uuid::parse_str(&m.package_id).map_err(|_| "Invalid package identity")?;
    let date = chrono::DateTime::parse_from_rfc3339(&m.created_at).map_err(|e| e.to_string())?;
    if date.offset().local_minus_utc() != 0
        || m.app_version.is_empty()
        || m.app_version.len() > 64
        || !m
            .app_version
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b".+-".contains(&c))
        || !crate::models::is_valid_house_id(&m.source_house.id)
        || m.source_house.name.trim().is_empty()
    {
        return Err("Invalid package provenance".into());
    }
    let features = unique(
        m.compatibility.required_features.clone(),
        "required feature",
    )?;
    if FEATURES.iter().any(|s| !features.contains(*s)) {
        return Err("Required format-1 feature declaration missing".into());
    }
    unique(
        m.warnings
            .iter()
            .map(|w| format!("{}:{}:{}", w.code, w.record_id, w.message)),
        "warning",
    )?;
    let ids = unique(
        documents.iter().map(|d| d.entry.id.clone()),
        "document identity",
    )?;
    let inventory = unique(
        m.documents
            .iter()
            .chain(&m.archived_documents)
            .map(|d| d.path.clone()),
        "document path",
    )?;
    unique(
        documents
            .iter()
            .map(|d| d.entry.source_relative_path.clone()),
        "source document path",
    )?;
    if inventory.len() != documents.len() {
        return Err("Document inventory mismatch".into());
    }
    let docs: BTreeMap<_, _> = documents.iter().map(|d| (d.entry.id.as_str(), d)).collect();
    let omitted = unique(
        m.scope.omitted_chapters.iter().map(|d| d.id.clone()),
        "omitted chapter",
    )?;
    if !ids.is_disjoint(&omitted) {
        return Err("Included and omitted chapter identities overlap".into());
    }
    let mut global: BTreeSet<&str> = BTreeSet::new();
    for key in plan
        .universes
        .iter()
        .map(|v| v.id.as_str())
        .chain(plan.books.iter().map(|v| v.id.as_str()))
        .chain(plan.branches.iter().map(|v| v.id.as_str()))
        .chain(plan.nodes.iter().map(|v| v.id.as_str()))
        .chain(
            plan.nodes
                .iter()
                .flat_map(|n| n.changes.iter().map(|c| c.id.as_str())),
        )
        .chain(plan.relationships.iter().map(|v| v.id.as_str()))
    {
        global.insert(key);
    }
    if ids
        .iter()
        .chain(&omitted)
        .any(|id| global.contains(id.as_str()))
    {
        return Err("Document identity collides with planning record".into());
    }
    for entity in &plan.entities {
        require_doc(&docs, &entity.id)?;
    }
    let selected = unique(m.scope.selected_book_ids.clone(), "selected Book")?;
    let structural = unique(m.scope.structural_book_ids.clone(), "structural Book")?;
    let omitted_books = unique(m.scope.omitted_book_ids.clone(), "omitted Book")?;
    for book_id in &omitted_books {
        id(book_id)?;
    }
    let books: BTreeSet<_> = plan.books.iter().map(|b| b.id.clone()).collect();
    if !selected.is_disjoint(&structural)
        || selected
            .union(&structural)
            .cloned()
            .collect::<BTreeSet<_>>()
            != books
    {
        return Err("Book inclusion declaration mismatch".into());
    }
    if !books.is_disjoint(&omitted_books)
        || !ids.is_disjoint(&omitted_books)
        || !omitted.is_disjoint(&omitted_books)
        || omitted_books.iter().any(|id| global.contains(id.as_str()))
    {
        return Err("Omitted Book identity collision".into());
    }
    let mut expected_chapters = BTreeSet::new();
    for d in documents {
        let entry = &d.entry;
        vault::safe_path(&entry.path)?;
        vault::safe_path(&entry.source_relative_path)?;
        let archived = m.archived_documents.iter().any(|e| e.id == entry.id);
        if !entry
            .path
            .starts_with(if archived { "archives/" } else { "documents/" })
            || !entry.path.ends_with(".md")
            || !entry.source_relative_path.starts_with(if archived {
                "Backups/"
            } else {
                "Lorebooks/"
            })
        {
            return Err("Document/archive path classification mismatch".into());
        }
        if entry.id != d.detail.metadata.id
            || entry.universe_id != m.source_universe_id
            || entry.entry_type != d.frontmatter["metadata"]["entry_type"]
            || d.detail.metadata.house_id != m.source_house.id
            || entry.opaque_fields != opaque_fields(&d.frontmatter)
        {
            return Err("Canonical document inventory differs from frontmatter".into());
        }
        if !entry.opaque_fields.is_empty()
            && !m.warnings.iter().any(|w| {
                w.code == "opaque_frontmatter" && w.record_id == entry.id && !w.message.is_empty()
            })
        {
            return Err("Opaque frontmatter requires an explicit compatibility warning".into());
        }
        let meta = &d.frontmatter["metadata"];
        reject_metadata_assets(&d.frontmatter)?;
        if let Some(uid) = meta.get("universe_id") {
            if uid.as_str() != Some(&m.source_universe_id) {
                return Err("Foreign-Universe document metadata".into());
            }
        } else if let Some(name) = meta.get("universe").and_then(Value::as_str) {
            if !name
                .trim()
                .eq_ignore_ascii_case(plan.universes[0].name.trim())
            {
                return Err("Invalid legacy Universe name".into());
            }
        } else if !plan.entities.iter().any(|e| e.id == entry.id) {
            return Err("Document has no canonical Universe attribution".into());
        }
        if let Some(parent) = &d.detail.metadata.parent_id {
            require_doc(&docs, parent)?;
        }
        let resolved_book = if let Some(bid) = meta.get("book_id").and_then(Value::as_str) {
            Some(
                plan.books
                    .iter()
                    .find(|b| b.id == bid)
                    .ok_or("Missing Book reference")?
                    .id
                    .clone(),
            )
        } else if let Some(name) = meta
            .get("book")
            .and_then(Value::as_str)
            .filter(|v| !v.trim().is_empty())
        {
            let matches: Vec<_> = plan.books.iter().filter(|b| b.name == name).collect();
            if matches.len() != 1 {
                return Err("Ambiguous legacy Book reference".into());
            }
            Some(matches[0].id.clone())
        } else {
            None
        };
        if resolved_book != entry.book_id {
            return Err("Inventory Book attribution mismatch".into());
        }
        if entry.entry_type == "chapter" {
            if !entry.book_id.as_ref().is_some_and(|b| selected.contains(b)) {
                return Err("Included chapter Book was not selected".into());
            }
            expected_chapters.insert(entry.id.clone());
        }
        if let Some(mid) = meta.get("milestone_id").and_then(Value::as_str) {
            let n = plan
                .nodes
                .iter()
                .find(|n| n.id == mid)
                .ok_or("Missing chapter historical milestone")?;
            if entry.entry_type != "chapter" || n.book_id.is_some() {
                return Err("Invalid chapter historical milestone scope".into());
            }
            let b = plan
                .books
                .iter()
                .find(|b| Some(&b.id) == entry.book_id.as_ref())
                .ok_or("Chapter Book missing")?;
            if n.branch_id.is_some() && n.branch_id != b.branch_id {
                return Err("Chapter historical milestone belongs to another continuity".into());
            }
        }
        faction(meta, &docs)?;
        // Every referenced attachment must have exactly one declared payload and user.
        for target in local_targets(&d.detail.content, &entry.source_relative_path)? {
            if !m
                .assets
                .iter()
                .any(|a| a.source_relative_path == target && a.referenced_by.contains(&entry.id))
            {
                return Err(format!("Undeclared asset dependency: {target}"));
            }
        }
    }
    if unique(m.scope.included_chapter_ids.clone(), "included chapter")? != expected_chapters {
        return Err("Chapter inclusion declaration mismatch".into());
    }
    for chapter in &m.scope.omitted_chapters {
        id(&chapter.id)?;
        vault::safe_path(&chapter.source_relative_path)?;
        if (!books.contains(&chapter.book_id) && !omitted_books.contains(&chapter.book_id))
            || chapter.reason != "chapter_prose_not_selected"
            || !(chapter.source_relative_path.starts_with("Lorebooks/")
                || chapter.source_relative_path.starts_with("Backups/"))
        {
            return Err("Invalid omitted chapter declaration".into());
        }
    }
    strict_history(plan)?;
    validate_ordering(m, plan, documents)?;
    let mut expected_files = inventory;
    expected_files.insert(PLANNING.into());
    unique(m.assets.iter().map(|a| a.path.clone()), "asset path")?;
    unique(
        m.assets.iter().map(|a| a.source_relative_path.clone()),
        "asset source path",
    )?;
    for asset in &m.assets {
        vault::safe_path(&asset.path)?;
        vault::safe_path(&asset.source_relative_path)?;
        if !asset.path.starts_with("assets/")
            || !asset.source_relative_path.starts_with("Attachments/")
            || asset.referenced_by.is_empty()
        {
            return Err("Unsupported asset declaration".into());
        }
        unique(asset.referenced_by.clone(), "asset user")?;
        for user in &asset.referenced_by {
            let d = require_doc(&docs, user)?;
            if !local_targets(&d.detail.content, &d.entry.source_relative_path)?
                .contains(&asset.source_relative_path)
            {
                return Err("Unreferenced asset declaration".into());
            }
        }
        if !expected_files.insert(asset.path.clone()) {
            return Err("Asset/document path collision".into());
        }
    }
    if expected_files != payloads.keys().cloned().collect()
        || expected_files != unique(m.files.iter().map(|e| e.path.clone()), "payload path")?
    {
        return Err("Undeclared or missing payload".into());
    }
    if expected_files.len() >= vault::MAX_FILES {
        return Err("Too many portable payloads".into());
    }
    Ok(())
}

fn faction(meta: &Value, docs: &BTreeMap<&str, &PackageDocument>) -> Result<()> {
    let Some(f) = meta.get("faction_fields") else {
        return Ok(());
    };
    let empty = vec![];
    let branches = match f.get("branches") {
        Some(v) => v.as_array().ok_or("Faction branches must be an array")?,
        None => &empty,
    };
    let positions = match f.get("positions") {
        Some(v) => v.as_array().ok_or("Faction positions must be an array")?,
        None => &empty,
    };
    for (items, parent_key, title_key) in [
        (branches, "parent_branch_id", "name"),
        (positions, "parent_position_id", "title"),
    ] {
        let mut map = BTreeMap::new();
        for item in items {
            let key = item
                .get("id")
                .and_then(Value::as_str)
                .ok_or("Faction local ID missing")?;
            id(key)?;
            if map.insert(key, item).is_some()
                || !item
                    .get(title_key)
                    .and_then(Value::as_str)
                    .is_some_and(|v| !v.trim().is_empty())
            {
                return Err("Duplicate/invalid faction record".into());
            }
            for field in [parent_key, "description"] {
                string_option(item, field)?;
            }
            if item.get("sort_order").is_some_and(|v| !v.is_number()) {
                return Err("Invalid faction sort_order".into());
            }
        }
        for item in items {
            let mut visited = BTreeSet::new();
            let mut current = Some(item);
            while let Some(value) = current {
                let key = value["id"].as_str().unwrap();
                if !visited.insert(key) {
                    return Err("Cyclic faction hierarchy".into());
                }
                current = match value.get(parent_key).and_then(Value::as_str) {
                    Some(id) => Some(*map.get(id).ok_or("Missing faction parent")?),
                    None => None,
                };
            }
        }
    }
    for p in positions {
        string_option(p, "branch_id")?;
        if let Some(b) = p.get("branch_id").and_then(Value::as_str) {
            if !branches.iter().any(|v| v["id"] == b) {
                return Err("Missing faction organization branch".into());
            }
        }
        strings(p, "holder_ids")?;
        if let Some(holders) = p.get("holder_ids").and_then(Value::as_array) {
            unique(
                holders.iter().map(|v| v.as_str().unwrap().to_string()),
                "position holder",
            )?;
            for holder in holders {
                if require_doc(docs, holder.as_str().unwrap())?
                    .entry
                    .entry_type
                    != "character"
                {
                    return Err("Faction holder must be a Character".into());
                }
            }
        }
    }
    Ok(())
}

pub(crate) fn strict_history(plan: &Plan) -> Result<()> {
    let nodes: BTreeMap<_, _> = plan.nodes.iter().map(|n| (n.id.as_str(), n)).collect();
    let branches: BTreeMap<_, _> = plan.branches.iter().map(|b| (b.id.as_str(), b)).collect();
    for br in &plan.branches {
        let div = nodes
            .get(br.divergence_node_id.as_str())
            .ok_or("Unresolved divergence milestone")?;
        if div.branch_id != br.parent_continuity_id {
            return Err("Parent continuity disagrees with divergence milestone".into());
        }
        let mut seen = BTreeSet::new();
        let mut current = Some(br);
        while let Some(b) = current {
            if !seen.insert(&b.id) {
                return Err("Cyclic divergence ancestry".into());
            }
            let n = nodes
                .get(b.divergence_node_id.as_str())
                .ok_or("Missing divergence milestone")?;
            current = n
                .branch_id
                .as_ref()
                .map(|id| {
                    branches
                        .get(id.as_str())
                        .copied()
                        .ok_or("Missing divergence branch")
                })
                .transpose()?;
        }
        if div.archived && !br.archived {
            return Err("Active continuity has an archived divergence milestone".into());
        }
    }
    for n in &plan.nodes {
        for change in &n.relationship_changes {
            if !plan
                .relationships
                .iter()
                .any(|r| r.id == change.relationship_id)
            {
                return Err("Unresolved relationship-change reference".into());
            }
        }
        if let Some(id) = &n.linked_event_id {
            if !nodes.contains_key(id.as_str()) {
                return Err("Unresolved linked Universe milestone".into());
            }
        }
        if let Some(id) = &n.origin_node_id {
            let origin = nodes
                .get(id.as_str())
                .ok_or("Unresolved milestone origin")?;
            if n.book_id.is_some()
                || origin.linked_event_id.as_ref() != Some(&n.id)
                || !plan
                    .books
                    .iter()
                    .any(|b| Some(&b.id) == origin.book_id.as_ref() && b.continuity == "canonical")
            {
                return Err("Invalid promoted milestone provenance".into());
            }
        }
    }
    let mut identities = BTreeSet::new();
    for r in &plan.relationships {
        if r.source_id == r.target_id {
            return Err("Self relationship unsupported".into());
        }
        if let Some(id) = &r.context_node_id {
            if !nodes.contains_key(id.as_str()) {
                return Err("Unresolved relationship context".into());
            }
        }
        // Exact duplicate records are malformed; richer reciprocal-label normalization remains an L2 concern.
        if !r.archived
            && !identities.insert((
                &r.source_id,
                &r.target_id,
                &r.label,
                r.directed,
                &r.book_id,
                &r.context_node_id,
            ))
        {
            return Err("Duplicate active relationship".into());
        }
    }
    Ok(())
}

pub(crate) fn validate_ordering(m: &Manifest, plan: &Plan, docs: &[PackageDocument]) -> Result<()> {
    if m.ordering.algorithm != "source-order-v1" {
        return Err("Unsupported source ordering algorithm".into());
    }
    let source_ids = unique(
        m.ordering.source_document_ids.clone(),
        "source document ordering",
    )?;
    let expected_ids: BTreeSet<_> = docs
        .iter()
        .map(|d| d.entry.id.clone())
        .chain(m.scope.omitted_chapters.iter().map(|d| d.id.clone()))
        .collect();
    if source_ids != expected_ids {
        return Err("Incomplete source document ordering".into());
    }
    let mut seen = BTreeSet::new();
    let mut scope = BTreeSet::new();
    for order in &m.ordering.timelines {
        if !scope.insert((&order.book_id, &order.branch_id)) {
            return Err("Duplicate timeline order".into());
        }
        let mut nodes: Vec<_> = plan
            .nodes
            .iter()
            .filter(|n| n.book_id == order.book_id && n.branch_id == order.branch_id)
            .collect();
        nodes.sort_by(|a, b| a.position.cmp(&b.position).then(a.id.cmp(&b.id)));
        for pair in nodes.windows(2).filter(|p| p[0].position == p[1].position) {
            let signature = |s: &str| {
                s.chars()
                    .map(|c| {
                        if c.is_ascii_lowercase() || c.is_ascii_digit() {
                            '#'
                        } else {
                            c
                        }
                    })
                    .collect::<String>()
            };
            if !pair[0].id.is_ascii()
                || !pair[1].id.is_ascii()
                || signature(&pair[0].id) != signature(&pair[1].id)
                || pair
                    .iter()
                    .any(|n| n.id.chars().any(|c| c.is_ascii_uppercase()))
            {
                return Err("Locale-sensitive tied milestone IDs need explicit source-engine ordering; unsupported in L1".into());
            }
        }
        if order.milestone_ids != nodes.iter().map(|n| n.id.clone()).collect::<Vec<_>>() {
            return Err("Milestone ordering differs from canonical positions".into());
        }
        for id in &order.milestone_ids {
            if !seen.insert(id) {
                return Err("Duplicate milestone ordering identity".into());
            }
        }
    }
    if seen.len() != plan.nodes.len() {
        return Err("Missing timeline ordering".into());
    }
    let mut chapters = BTreeSet::new();
    let mut books = BTreeSet::new();
    for order in &m.ordering.chapters {
        if !books.insert(&order.book_id)
            || (!plan.books.iter().any(|b| b.id == order.book_id)
                && !m.scope.omitted_book_ids.contains(&order.book_id))
        {
            return Err("Invalid/duplicate chapter ordering Book".into());
        }
        let mut previous: Option<(f64, Vec<u8>, usize)> = None;
        for id in &order.chapter_ids {
            if !chapters.insert(id) {
                return Err("Duplicate chapter ordering identity".into());
            }
            if let Some(d) = docs.iter().find(|d| d.entry.id == *id) {
                if (d.entry.entry_type != "chapter"
                    && d.frontmatter["metadata"].get("book_id").is_none())
                    || d.entry.book_id.as_ref() != Some(&order.book_id)
                {
                    return Err("Invalid chapter ordering scope".into());
                }
                let key = (
                    d.frontmatter["metadata"]
                        .get("chapter_order")
                        .and_then(Value::as_f64)
                        .unwrap_or(999999.0),
                    chapter_date_key(&d.detail.metadata.created_at)?,
                    m.ordering
                        .source_document_ids
                        .iter()
                        .position(|v| v == id)
                        .unwrap(),
                );
                if previous.as_ref().is_some_and(|p| p > &key) {
                    return Err("Chapter order differs from canonical ordering".into());
                }
                previous = Some(key);
            } else {
                let d = m
                    .scope
                    .omitted_chapters
                    .iter()
                    .find(|d| d.id == *id && d.book_id == order.book_id)
                    .ok_or("Unknown chapter ordering identity")?;
                chrono::DateTime::parse_from_rfc3339(&d.created_at).map_err(|e| e.to_string())?;
                let key = (
                    d.chapter_order,
                    chapter_date_key(&d.created_at)?,
                    m.ordering
                        .source_document_ids
                        .iter()
                        .position(|v| v == id)
                        .unwrap(),
                );
                if previous.as_ref().is_some_and(|p| p > &key) {
                    return Err("Omitted chapter ordering mismatch".into());
                }
                previous = Some(key);
            }
        }
    }
    let expected: BTreeSet<_> = m
        .scope
        .included_chapter_ids
        .iter()
        .chain(m.scope.omitted_chapters.iter().map(|c| &c.id))
        .chain(
            docs.iter()
                .filter(|d| d.frontmatter["metadata"].get("book_id").is_some())
                .map(|d| &d.entry.id),
        )
        .collect();
    if chapters != expected {
        return Err("Missing chapter ordering".into());
    }
    Ok(())
}

/// Frontend localeCompare order for the canonical uppercase RFC3339 alphabet.
/// Do not sort by actual instant: the existing chapter selector sorts authored strings.
pub(crate) fn chapter_date_key(value: &str) -> Result<Vec<u8>> {
    chrono::DateTime::parse_from_rfc3339(value).map_err(|e| e.to_string())?;
    value
        .bytes()
        .map(|b| match b {
            b'-' => Ok(0),
            b':' => Ok(1),
            b'.' => Ok(2),
            b'+' => Ok(3),
            b'0'..=b'9' => Ok(4 + b - b'0'),
            b'T' => Ok(14),
            b'Z' => Ok(15),
            _ => Err(
                "Noncanonical chapter timestamp alphabet needs explicit source-engine ordering"
                    .into(),
            ),
        })
        .collect()
}

/// Conservative dependency syntax: inline Markdown destinations and reference definitions.
/// Only Attachments-local files are portable in L1; ambiguous HTML/wiki/encoded syntax is blocked.
pub(super) fn local_targets(body: &str, source: &str) -> Result<BTreeSet<String>> {
    let lower = body.to_ascii_lowercase();
    if lower
        .as_bytes()
        .windows(2)
        .any(|w| w[0] == b'<' && (w[1].is_ascii_alphabetic() || w[1] == b'/'))
        || body.contains("[[")
    {
        return Err(
            "HTML/wiki attachment references need a dependency adapter before export".into(),
        );
    }
    let mut raw = Vec::new();
    let mut images = body;
    while let Some((_, tail)) = images.split_once("![") {
        let (_, after) = tail.split_once(']').ok_or("Unterminated image label")?;
        if !after.starts_with('(') {
            return Err("Reference-style media requires a dependency adapter in L1".into());
        }
        images = after;
    }
    let mut rest = body;
    while let Some((_, tail)) = rest.split_once("](") {
        let (target, remaining) = tail
            .split_once(')')
            .ok_or("Unterminated Markdown link destination")?;
        if target.contains('(') {
            return Err("Nested Markdown destinations are unsupported in L1".into());
        }
        raw.push(destination(target)?);
        rest = remaining;
    }
    for line in body.lines() {
        let line = line.trim_start();
        if line.starts_with('[') {
            if let Some((_, tail)) = line.split_once("]:") {
                raw.push(destination(tail)?);
            }
        }
    }
    let mut result = BTreeSet::new();
    for target in raw {
        if body.contains("![") && (target.starts_with("https://") || target.starts_with("http://"))
        {
            return Err(
                "Remote media dependencies are unsupported; provide a local attachment".into(),
            );
        }
        if target.starts_with('#')
            || target.starts_with("https://")
            || target.starts_with("http://")
            || target.starts_with("mailto:")
        {
            continue;
        }
        if target.contains(['%', '\\', ':', '?']) || target.starts_with('/') {
            return Err(format!("Unsupported local link destination: {target}"));
        }
        let target = target.split('#').next().unwrap();
        if target.is_empty() {
            continue;
        }
        let mut components: Vec<&str> = if target.starts_with("Attachments/") {
            vec![]
        } else {
            source
                .rsplit_once('/')
                .map(|(p, _)| p.split('/').collect())
                .unwrap_or_default()
        };
        for part in target.split('/') {
            match part {
                ".." => {
                    if components.pop().is_none() {
                        return Err("Asset path escapes notebook".into());
                    }
                }
                "." => (),
                "" => return Err("Empty asset path segment".into()),
                value => components.push(value),
            }
        }
        let path = components.join("/");
        vault::safe_path(&path)?;
        if !path.starts_with("Attachments/") {
            return Err(format!(
                "Local document/asset link requires an adapter: {target}"
            ));
        }
        result.insert(path);
    }
    Ok(result)
}

fn reject_metadata_assets(value: &Value) -> Result<()> {
    match value {
        Value::String(s) if s.contains("](") || s.contains("]:") || s.contains("[[") || s.to_ascii_lowercase().contains("<img") || s.contains("Attachments/") || s.contains("Attachments\\") || s.starts_with("file:") =>
            Err("Metadata-embedded asset dependency requires a typed adapter; no asset was silently omitted".into()),
        Value::Object(values) => { for value in values.values() { reject_metadata_assets(value)?; } Ok(()) },
        Value::Array(values) => { for value in values { reject_metadata_assets(value)?; } Ok(()) },
        _ => Ok(())
    }
}
fn destination(raw: &str) -> Result<String> {
    let raw = raw.trim();
    let (target, suffix) = if let Some(v) = raw.strip_prefix('<') {
        let (target, suffix) = v
            .split_once('>')
            .ok_or("Unterminated angle link destination")?;
        (target, suffix.trim())
    } else {
        raw.split_once(char::is_whitespace)
            .map(|(a, b)| (a, b.trim()))
            .unwrap_or((raw, ""))
    };
    if !suffix.is_empty()
        && !((suffix.starts_with('"') && suffix.ends_with('"'))
            || (suffix.starts_with('\'') && suffix.ends_with('\'')))
    {
        return Err("Ambiguous Markdown link destination".into());
    }
    Ok(target.to_string())
}
