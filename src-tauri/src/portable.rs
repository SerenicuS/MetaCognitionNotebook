//! Portable Universe format 1. Export, inspection, and safe import planning (L2a).
mod collect;
mod import_plan;
mod json;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_l2a;
#[cfg(test)]
mod tests_l2b;
mod validate;
pub(crate) mod import_commit;

use crate::{commands::AppState, models::DocumentDetail, thought::Plan, vault};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File},
    io::{Seek, SeekFrom, Write},
    path::Path,
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

type Result<T> = std::result::Result<T, String>;
pub const FORMAT: &str = "metacognition.portable-universe";
pub const FORMAT_VERSION: u32 = 1;
pub const MAX_TOTAL_BYTES: u64 = 128 * 1024 * 1024;
pub const MAX_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;
const PLANNING: &str = "planning/universe.json";
const MANIFEST: &str = "manifest.json";
const FEATURES: &[&str] = &[
    "canonical-markdown",
    "history-v1",
    "alternate-continuities",
    "chapter-milestone-context",
    "opaque-frontmatter",
];

macro_rules! record {
    ($name:ident { $($field:ident : $ty:ty),* $(,)? }) => {
        #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
        #[serde(deny_unknown_fields)]
        pub struct $name { $(pub $field: $ty),* }

    };
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SnapshotBasis {
    LastSavedState,
}

record!(ExportRequest {
    universe_id: String,
    snapshot_basis: SnapshotBasis,
    book_ids: Vec<String>,
    chapter_ids: Vec<String>
});
record!(HouseProvenance {
    id: String,
    name: String
});
record!(Compatibility { planning_schema_version: u32, history_semantics_version: u32, required_features: Vec<String> });
record!(FileEntry {
    path: String,
    size: u64,
    sha256: String
});
record!(DocumentEntry {
    id: String, path: String, source_relative_path: String,
    universe_id: String, book_id: Option<String>, entry_type: String,
    materialized_raw: bool, opaque_fields: Vec<String>
});
record!(OmittedChapter {
    id: String,
    book_id: String,
    source_relative_path: String,
    chapter_order: f64,
    created_at: String,
    reason: String
});
record!(AssetEntry { path: String, source_relative_path: String, referenced_by: Vec<String> });
record!(TimelineOrder { book_id: Option<String>, branch_id: Option<String>, milestone_ids: Vec<String> });
record!(ChapterOrder { book_id: String, chapter_ids: Vec<String> });
record!(Ordering { algorithm: String, source_document_ids: Vec<String>, timelines: Vec<TimelineOrder>, chapters: Vec<ChapterOrder> });
record!(Diagnostic {
    code: String,
    record_id: String,
    message: String
});
record!(Scope {
    worldbuilding_complete: bool, selected_book_ids: Vec<String>, structural_book_ids: Vec<String>,
    omitted_book_ids: Vec<String>, included_chapter_ids: Vec<String>, omitted_chapters: Vec<OmittedChapter>
});
record!(Manifest {
    format: String, format_version: u32, schema_version: u32, package_id: String,
    app_version: String, created_at: String, source_universe_id: String,
    source_house: HouseProvenance, snapshot_basis: SnapshotBasis, source_plan_revision: u64,
    compatibility: Compatibility, scope: Scope, planning_path: String,
    documents: Vec<DocumentEntry>, archived_documents: Vec<DocumentEntry>, assets: Vec<AssetEntry>,
    ordering: Ordering, unresolved_references: Vec<Diagnostic>, warnings: Vec<Diagnostic>, files: Vec<FileEntry>
});
record!(Inspection {
    path: String, archive_sha256: String, size: u64, compatible: bool,
    unsupported_features: Vec<String>, document_count: usize, archived_count: usize,
    chapter_count: usize, asset_count: usize, book_count: usize, branch_count: usize,
    milestone_count: usize, relationship_count: usize, universe: crate::thought::Universe,
    archived_records: Vec<ArchivedRecord>, total_bytes: u64, manifest: Manifest
});
record!(ArchivedRecord {
    kind: String,
    id: String
});

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportIdentityPolicy {
    Preserve,
    SeparateCopy,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImportPreviewRequest {
    pub package_path: String,
    pub target_house_id: String,
    pub policy: ImportIdentityPolicy,
    #[serde(default)]
    pub operation_id: Option<String>,
}

record!(PlannedDocumentPath {
    source_id: String,
    proposed_id: String,
    entry_type: String,
    title: String,
    source_relative_path: String,
    destination_relative_path: String,
    is_archived: bool,
});

record!(PlannedAssetPath {
    source_relative_path: String,
    destination_relative_path: String,
    size: u64,
    sha256: String,
    reused_existing: bool,
});

record!(IdentityCollision {
    source_id: String,
    collision_type: String,
    destination_location: String,
    message: String,
});

record!(ImportPlanSummary {
    documents_count: usize,
    archived_documents_count: usize,
    books_count: usize,
    branches_count: usize,
    milestones_count: usize,
    relationships_count: usize,
    assets_count: usize,
    omitted_chapters_count: usize,
    omitted_books_count: usize,
});

record!(ImportPreview {
    operation_id: String,
    package_path: String,
    package_sha256: String,
    package_id: String,
    target_house_id: String,
    target_house_name: String,
    policy: ImportIdentityPolicy,
    destination_fingerprint: String,
    source_universe_name: String,
    proposed_universe_id: String,
    proposed_universe_name: String,
    source_plan_revision: u64,
    target_plan_revision: u64,
    proposed_plan_revision: u64,
    id_mappings: BTreeMap<String, String>,
    document_paths: Vec<PlannedDocumentPath>,
    asset_paths: Vec<PlannedAssetPath>,
    summary: ImportPlanSummary,
    collisions: Vec<IdentityCollision>,
    diagnostics: Vec<Diagnostic>,
    is_valid: bool,
    proposed_plan: Option<crate::thought::Plan>,
});

pub(crate) struct PackageDocument {
    pub(crate) entry: DocumentEntry,
    pub(crate) detail: DocumentDetail,
    pub(crate) frontmatter: Value,
    pub(crate) bytes: Vec<u8>,
}

pub(crate) struct LoadedPackage {
    pub(crate) inspection: Inspection,
    pub(crate) manifest: Manifest,
    pub(crate) plan: Plan,
    pub(crate) documents: Vec<PackageDocument>,
    pub(crate) payloads: BTreeMap<String, Vec<u8>>,
}
struct Snapshot {
    manifest: Manifest,
    payloads: BTreeMap<String, Vec<u8>>,
    fingerprints: BTreeMap<String, String>,
}

fn unique(values: impl IntoIterator<Item = String>, label: &str) -> Result<BTreeSet<String>> {
    let mut seen = BTreeSet::new();
    for value in values {
        if value.trim().is_empty()
            || value.len() > 1024
            || value.chars().any(char::is_control)
            || !seen.insert(value)
        {
            return Err(format!("Duplicate or invalid {label}"));
        }
    }
    Ok(seen)
}

fn parse_document(bytes: Vec<u8>, entry: DocumentEntry) -> Result<PackageDocument> {
    let text = std::str::from_utf8(&bytes).map_err(|e| e.to_string())?;
    let (header, _) = text
        .strip_prefix("---json\n")
        .and_then(|v| v.split_once("\n---\n"))
        .ok_or_else(|| {
            format!(
                "Canonical JSON frontmatter required: {}",
                entry.source_relative_path
            )
        })?;
    let frontmatter = json::parse(header.as_bytes())?;
    if !frontmatter.is_object() {
        return Err("Frontmatter must be an object".into());
    }
    let detail = crate::storage::StorageManager::new(".")
        .parse_document_content(text, &entry.source_relative_path)?;
    validate::document(&detail, &frontmatter)?;
    Ok(PackageDocument {
        entry,
        detail,
        frontmatter,
        bytes,
    })
}

fn allowed(name: &str) -> bool {
    name == MANIFEST
        || name == PLANNING
        || ["documents/", "archives/", "assets/"]
            .iter()
            .any(|prefix| name.starts_with(prefix) && !name[prefix.len()..].contains('/'))
}

pub(crate) fn load_package(path: &Path) -> Result<LoadedPackage> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let size = vault::plain_file(path)?.len();
    if size > MAX_TOTAL_BYTES + MAX_MANIFEST_BYTES + 16 * 1024 * 1024 {
        return Err("Portable package exceeds size limit".into());
    }
    let initial = vault::digest(
        &mut file,
        MAX_TOTAL_BYTES + MAX_MANIFEST_BYTES + 16 * 1024 * 1024,
    )?;
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    let count = vault::preflight_with_policy(&mut file, allowed)?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    if archive.len() != count || archive.has_overlapping_files().map_err(|e| e.to_string())? {
        return Err("Conflicting ZIP entries".into());
    }
    let raw = vault::read_entry(&mut archive, MANIFEST, MAX_MANIFEST_BYTES)?;
    let manifest: Manifest = serde_json::from_value(json::parse(&raw)?)
        .map_err(|e| format!("Invalid portable manifest: {e}"))?;
    if manifest.format != FORMAT || manifest.format_version != 1 || manifest.schema_version != 1 {
        return Err("Unsupported portable format/schema version".into());
    }
    if manifest.compatibility.planning_schema_version != 1
        || manifest.compatibility.history_semantics_version != 1
    {
        return Err("Unsupported planning/history semantics version".into());
    }
    if count != manifest.files.len() + 1 {
        return Err("Manifest/ZIP file count mismatch".into());
    }
    // Validate inventory uniqueness before cloning/parsing any document payload. A malicious
    // manifest must not amplify one large file into thousands of in-memory document copies.
    let inventory: Vec<_> = manifest
        .documents
        .iter()
        .chain(&manifest.archived_documents)
        .collect();
    unique(inventory.iter().map(|d| d.id.clone()), "document identity")?;
    let document_paths = unique(inventory.iter().map(|d| d.path.clone()), "document path")?;
    unique(
        inventory.iter().map(|d| d.source_relative_path.clone()),
        "source document path",
    )?;
    let asset_paths = unique(manifest.assets.iter().map(|a| a.path.clone()), "asset path")?;
    unique(
        manifest
            .assets
            .iter()
            .map(|a| a.source_relative_path.clone()),
        "asset source path",
    )?;
    if !document_paths.is_disjoint(&asset_paths) {
        return Err("Asset/document path collision".into());
    }
    let mut expected: BTreeSet<_> = document_paths.union(&asset_paths).cloned().collect();
    if !expected.insert(PLANNING.into())
        || expected
            != unique(
                manifest.files.iter().map(|e| e.path.clone()),
                "payload path",
            )?
    {
        return Err("Undeclared or missing payload inventory".into());
    }
    vault::unique_names(manifest.files.iter().map(|f| f.path.as_str()))?;
    let mut payloads = BTreeMap::new();
    let mut total = 0u64;
    for entry in &manifest.files {
        if entry.path == MANIFEST
            || !allowed(&entry.path)
            || entry.sha256.len() != 64
            || !entry
                .sha256
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        {
            return Err("Invalid manifest file entry".into());
        }
        total = total
            .checked_add(entry.size)
            .ok_or("Payload size overflow")?;
        if total > MAX_TOTAL_BYTES {
            return Err("Portable payload exceeds 128 MiB".into());
        }
        let bytes = vault::read_entry(&mut archive, &entry.path, vault::MAX_FILE_BYTES)?;
        if bytes.len() as u64 != entry.size || vault::bytes_hash(&bytes) != entry.sha256 {
            return Err(format!("Integrity check failed: {}", entry.path));
        }
        payloads.insert(entry.path.clone(), bytes);
    }
    let plan: Plan = serde_json::from_value(json::parse(
        payloads.get(PLANNING).ok_or("Missing planning payload")?,
    )?)
    .map_err(|e| format!("Invalid planning payload: {e}"))?;
    let mut docs = Vec::new();
    for entry in manifest
        .documents
        .iter()
        .chain(&manifest.archived_documents)
    {
        docs.push(parse_document(
            payloads
                .get(&entry.path)
                .ok_or("Missing document payload")?
                .clone(),
            entry.clone(),
        )?);
    }
    validate::package(&manifest, &plan, &docs, &payloads)?;
    let unsupported_features: Vec<String> = manifest
        .compatibility
        .required_features
        .iter()
        .filter(|v| !FEATURES.contains(&v.as_str()))
        .cloned()
        .collect();
    let mut file = archive.into_inner();
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    if vault::digest(
        &mut file,
        MAX_TOTAL_BYTES + MAX_MANIFEST_BYTES + 16 * 1024 * 1024,
    )? != initial
    {
        return Err("Package changed during inspection".into());
    }
    let (hash, final_size) = vault::file_digest(path)?;
    if (hash.clone(), final_size) != initial {
        return Err("Package changed during inspection".into());
    }
    let archived_records = plan
        .universes
        .iter()
        .filter(|u| u.archived)
        .map(|u| ("universe", &u.id))
        .chain(
            plan.books
                .iter()
                .filter(|b| b.archived)
                .map(|b| ("book", &b.id)),
        )
        .chain(
            plan.branches
                .iter()
                .filter(|b| b.archived)
                .map(|b| ("continuity", &b.id)),
        )
        .chain(
            plan.nodes
                .iter()
                .filter(|n| n.archived)
                .map(|n| ("milestone", &n.id)),
        )
        .chain(
            plan.relationships
                .iter()
                .filter(|r| r.archived)
                .map(|r| ("relationship", &r.id)),
        )
        .chain(
            docs.iter()
                .filter(|d| {
                    d.entry.path.starts_with("archives/")
                        || d.frontmatter["metadata"]
                            .get("archived")
                            .and_then(Value::as_bool)
                            == Some(true)
                })
                .map(|d| ("document", &d.entry.id)),
        )
        .map(|(kind, id)| ArchivedRecord {
            kind: kind.into(),
            id: id.clone(),
        })
        .collect();
    let inspection = Inspection {
        path: path.to_string_lossy().into(),
        archive_sha256: hash,
        size,
        compatible: unsupported_features.is_empty(),
        unsupported_features,
        document_count: manifest.documents.len(),
        archived_count: manifest.archived_documents.len(),
        chapter_count: manifest.scope.included_chapter_ids.len(),
        asset_count: manifest.assets.len(),
        book_count: plan.books.len(),
        branch_count: plan.branches.len(),
        milestone_count: plan.nodes.len(),
        relationship_count: plan.relationships.len(),
        universe: plan.universes[0].clone(),
        archived_records,
        total_bytes: total,
        manifest: manifest.clone(),
    };
    Ok(LoadedPackage {
        inspection,
        manifest,
        plan,
        documents: docs,
        payloads,
    })
}

/// Reads and validates only the chosen package. Never opens or mutates a notebook.
pub fn inspect(path: &Path) -> Result<Inspection> {
    load_package(path).map(|p| p.inspection)
}

pub fn inspect_stable(path: &Path) -> Result<Inspection> {
    inspect(path)
}

pub fn import_preview(state: &AppState, request: ImportPreviewRequest) -> Result<ImportPreview> {
    import_plan::preview(state, request)
}

pub fn verify_import_plan_freshness(state: &AppState, preview: &ImportPreview) -> Result<()> {
    import_plan::check_freshness(state, preview)
}
pub use import_commit::{
    has_pending_import_journals, ImportCommitRequest, ImportCommitResult, ImportRecoveryReport,
    ImportStage,
};

pub fn import_commit(
    state: &AppState,
    request: ImportCommitRequest,
) -> Result<ImportCommitResult> {
    import_commit::import_commit(state, request)
}

pub fn import_commit_with_checkpoint(
    state: &AppState,
    request: ImportCommitRequest,
    checkpoint: impl Fn(&str) -> Result<()>,
) -> Result<ImportCommitResult> {
    import_commit::import_commit_with_checkpoint(state, request, checkpoint)
}

pub fn recover_imports(state: &AppState) -> Result<ImportRecoveryReport> {
    import_commit::recover_imports(state)
}

pub fn recover_imports_locked(
    state: &AppState,
    db: &mut crate::db::Database,
) -> Result<ImportRecoveryReport> {
    import_commit::recover_imports_locked(state, db)
}

pub fn has_pending_import_journal(state: &AppState) -> Result<bool> {
    import_commit::has_pending_import_journals(state)
}


pub fn export(state: &AppState, request: ExportRequest, destination: &Path) -> Result<Inspection> {
    export_with_checkpoint(state, request, destination, |_| Ok(()))
}

fn export_with_checkpoint(
    state: &AppState,
    request: ExportRequest,
    destination: &Path,
    checkpoint: impl Fn(&str) -> Result<()>,
) -> Result<Inspection> {
    if destination.extension().and_then(|v| v.to_str()) != Some("mcuniverse") {
        return Err("Export requires .mcuniverse extension".into());
    }
    let parent = destination
        .parent()
        .ok_or("Export destination needs a parent directory")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let root = state
        .storage
        .get_root()
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if parent.starts_with(&root) {
        return Err("Export destination must be outside the source notebook".into());
    }
    let destination = parent.join(destination.file_name().ok_or("Invalid export filename")?);
    vault::safe_path(
        destination
            .file_name()
            .unwrap()
            .to_str()
            .ok_or("Non-Unicode destination")?,
    )?;
    if destination.exists() {
        return Err("Export destination already exists; no file was overwritten".into());
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;
    let lock = state.storage.get_registry_lock();
    let _registry_guard = lock.lock().map_err(|e| e.to_string())?;
    if state.storage.has_pending_universe_move_journal()? {
        return Err("Complete pending Universe move recovery before export".into());
    }
    let indexed = db.list_documents(None, None).map_err(|e| e.to_string())?;
    let snapshot = collect::capture(state.storage.get_root(), &indexed, &request)?;
    checkpoint("captured")?;
    vault::require_space(
        &parent,
        snapshot.manifest.files.iter().map(|f| f.size).sum(),
    )?;
    // tempfile's no-clobber publication prevents even a racing destination from being replaced.
    let mut temporary = tempfile::Builder::new()
        .prefix(".mcuniverse-")
        .suffix(".partial")
        .tempfile_in(&parent)
        .map_err(|e| e.to_string())?;
    {
        let mut archive = ZipWriter::new(temporary.as_file_mut());
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored)
            .unix_permissions(0o600);
        for (name, bytes) in &snapshot.payloads {
            archive
                .start_file(name, options)
                .map_err(|e| e.to_string())?;
            archive.write_all(bytes).map_err(|e| e.to_string())?;
        }
        archive
            .start_file(MANIFEST, options)
            .map_err(|e| e.to_string())?;
        archive
            .write_all(&serde_json::to_vec_pretty(&snapshot.manifest).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        archive.finish().map_err(|e| e.to_string())?;
    }
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    let mut inspection = inspect_stable(temporary.path())?;
    if !inspection.compatible {
        return Err("Exporter produced unsupported package features".into());
    }
    checkpoint("validated")?;
    if collect::fingerprints(&root)? != snapshot.fingerprints
        || serde_json::to_vec(&indexed).map_err(|e| e.to_string())?
            != serde_json::to_vec(&db.list_documents(None, None).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?
    {
        return Err("Source notebook changed during export; retry after saving".into());
    }
    temporary
        .persist_noclobber(&destination)
        .map_err(|e| format!("Could not publish completed package without overwriting: {e}"))?;
    inspection.path = destination.to_string_lossy().into();
    Ok(inspection)
}

#[tauri::command]
pub async fn portable_universe_export(
    app: tauri::AppHandle,
    request: ExportRequest,
    destination: String,
) -> Result<Inspection> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || {
        export(
            app.state::<AppState>().inner(),
            request,
            Path::new(&destination),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn portable_universe_inspect(path: String) -> Result<Inspection> {
    tauri::async_runtime::spawn_blocking(move || inspect_stable(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn portable_universe_import_preview(
    app: tauri::AppHandle,
    request: ImportPreviewRequest,
) -> Result<ImportPreview> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || {
        import_preview(app.state::<AppState>().inner(), request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn portable_universe_import_commit(
    app: tauri::AppHandle,
    request: ImportCommitRequest,
) -> Result<ImportCommitResult> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || {
        import_commit(app.state::<AppState>().inner(), request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn portable_universe_recover_imports(
    app: tauri::AppHandle,
) -> Result<ImportRecoveryReport> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || {
        recover_imports(app.state::<AppState>().inner())
    })
    .await
    .map_err(|e| e.to_string())?
}
