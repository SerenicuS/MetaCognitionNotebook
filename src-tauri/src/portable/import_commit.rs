//! Durable Portable Universe import publication and crash recovery (L2b).
use super::*;
use crate::commands::AppState;
use crate::models::{DocumentDetail, DocumentMetadata, DocumentType};
use crate::storage::StorageManager;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImportCommitRequest {
    pub operation_id: String,
    pub package_path: String,
    pub target_house_id: String,
    pub policy: ImportIdentityPolicy,
    pub expected_destination_fingerprint: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImportCommitResult {
    pub operation_id: String,
    pub universe_id: String,
    pub universe_name: String,
    pub house_id: String,
    pub house_name: String,
    pub documents_imported: usize,
    pub archived_documents_imported: usize,
    pub assets_imported: usize,
    pub plan_revision: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImportRecoveryReport {
    pub recovered_operations: Vec<String>,
    pub actions: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportStage {
    Planned,
    Staged,
    FilesCommitted,
    CatalogCommitted,
    RegistryCommitted,
    Completed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct JournalDocFile {
    pub source_id: String,
    pub staged_path: String,
    pub destination_relative_path: String,
    pub sha256: String,
    pub is_archived: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct JournalAssetFile {
    pub source_relative_path: String,
    pub staged_path: String,
    pub destination_relative_path: String,
    pub sha256: String,
    pub reused_existing: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CatalogBeforeImage {
    pub revision: u64,
    pub relative_path: String,
    pub original_content: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ImportJournal {
    pub operation_id: String,
    pub stage: ImportStage,
    pub package_path: String,
    pub package_sha256: String,
    pub source_universe_id: String,
    pub target_house_id: String,
    pub target_house_name: String,
    pub policy: ImportIdentityPolicy,
    pub destination_fingerprint: String,
    pub proposed_universe_id: String,
    pub proposed_universe_name: String,
    pub id_mappings: BTreeMap<String, String>,
    pub document_files: Vec<JournalDocFile>,
    pub asset_files: Vec<JournalAssetFile>,
    pub catalog_before: Option<CatalogBeforeImage>,
    pub catalog_after_revision: u64,
    pub registry_before_universes: Option<Vec<String>>,
    pub created_at: String,
    pub updated_at: String,
    pub result: Option<ImportCommitResult>,
}

pub fn journal_path(storage: &StorageManager, operation_id: &str) -> PathBuf {
    storage.get_operations_dir().join(format!("import_journal_{}.json", operation_id))
}

pub fn staging_dir(storage: &StorageManager, operation_id: &str) -> PathBuf {
    storage.get_operations_dir().join(format!("staging_{}", operation_id))
}

pub fn save_journal_atomic(storage: &StorageManager, journal: &ImportJournal) -> Result<()> {
    let ops_dir = storage.get_operations_dir();
    fs::create_dir_all(&ops_dir)
        .map_err(|e| format!("Failed to create operations directory: {e}"))?;

    let json = serde_json::to_string_pretty(journal)
        .map_err(|e| format!("Failed to serialize import journal: {e}"))?;

    let temp_name = format!("import_journal_{}_{}.partial", journal.operation_id, uuid::Uuid::new_v4());
    let temp_path = ops_dir.join(temp_name);
    {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|e| format!("Failed to create temporary journal file: {e}"))?;
        file.write_all(json.as_bytes())
            .map_err(|e| format!("Failed to write temporary journal file: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("Failed to sync temporary journal file: {e}"))?;
    }

    let target_path = journal_path(storage, &journal.operation_id);
    fs::rename(&temp_path, &target_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("Failed to commit import journal: {e}")
    })?;

    Ok(())
}

pub fn read_journal(storage: &StorageManager, operation_id: &str) -> Result<Option<ImportJournal>> {
    let path = journal_path(storage, operation_id);
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read import journal: {e}"))?;
    let journal: ImportJournal = serde_json::from_str(&content)
        .map_err(|e| format!("Corrupted import journal: {e}"))?;
    Ok(Some(journal))
}

pub fn has_pending_import_journals(state: &AppState) -> Result<bool> {
    let ops_dir = state.storage.get_operations_dir();
    if !ops_dir.exists() {
        return Ok(false);
    }

    for entry in fs::read_dir(&ops_dir).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("import_journal_") && name.ends_with(".json") {
            if let Ok(raw) = fs::read_to_string(entry.path()) {
                if let Ok(journal) = serde_json::from_str::<ImportJournal>(&raw) {
                    if journal.stage != ImportStage::Completed {
                        return Ok(true);
                    }
                }
            }
        }
    }

    Ok(false)
}

pub fn recover_single_journal_locked(
    state: &AppState,
    db: &mut crate::db::Database,
    journal: &ImportJournal,
) -> Result<String> {
    let stg = staging_dir(&state.storage, &journal.operation_id);
    let j_path = journal_path(&state.storage, &journal.operation_id);
    match journal.stage {
        ImportStage::Planned | ImportStage::Staged => {
            if stg.exists() {
                let _ = fs::remove_dir_all(&stg);
            }
            if j_path.exists() {
                let _ = fs::remove_file(&j_path);
            }
            Ok(format!("Discarded incomplete staged import '{}'", journal.operation_id))
        }
        ImportStage::FilesCommitted => {
            // Destination files were placed, but catalog was not committed. Roll back destination files!
            for doc in &journal.document_files {
                if let Ok(full) = state.storage.resolve_safe_path(&doc.destination_relative_path) {
                    if full.exists() {
                        let _ = fs::remove_file(&full);
                    }
                }
            }
            for asset in &journal.asset_files {
                if !asset.reused_existing {
                    if let Ok(full) = state.storage.resolve_safe_path(&asset.destination_relative_path) {
                        if full.exists() {
                            let _ = fs::remove_file(&full);
                        }
                    }
                }
            }
            if stg.exists() {
                let _ = fs::remove_dir_all(&stg);
            }
            if j_path.exists() {
                let _ = fs::remove_file(&j_path);
            }
            Ok(format!("Rolled back committed destination files for uncataloged import '{}'", journal.operation_id))
        }
        ImportStage::CatalogCommitted => {
            // Catalog was committed. Roll forward house registry and SQLite!
            state.storage.mutate_house_registry_unlocked(|reg| {
                if let Some(h) = reg.houses.iter_mut().find(|h| h.id == journal.target_house_id) {
                    if !h.universe_ids.contains(&journal.proposed_universe_id) {
                        h.universe_ids.push(journal.proposed_universe_id.clone());
                    }
                }
                Ok(())
            })?;
            // Reconstruct SQLite indexing for imported active documents and catalog:
            for doc_file in &journal.document_files {
                if !doc_file.is_archived {
                    if let Ok(doc) = state.storage.read_document(&doc_file.destination_relative_path) {
                        let _ = db.upsert_document(&doc.metadata);
                    }
                }
            }
            if let Some(catalog) = crate::thought::find(state)? {
                let _ = db.upsert_document(&catalog.metadata);
            }
            if stg.exists() {
                let _ = fs::remove_dir_all(&stg);
            }
            let mut updated = journal.clone();
            updated.stage = ImportStage::Completed;
            updated.updated_at = chrono::Utc::now().to_rfc3339();
            if updated.result.is_none() {
                updated.result = Some(ImportCommitResult {
                    operation_id: journal.operation_id.clone(),
                    universe_id: journal.proposed_universe_id.clone(),
                    universe_name: journal.proposed_universe_name.clone(),
                    house_id: journal.target_house_id.clone(),
                    house_name: journal.target_house_name.clone(),
                    documents_imported: journal.document_files.iter().filter(|d| !d.is_archived).count(),
                    archived_documents_imported: journal.document_files.iter().filter(|d| d.is_archived).count(),
                    assets_imported: journal.asset_files.iter().filter(|a| !a.reused_existing).count(),
                    plan_revision: journal.catalog_after_revision,
                });
            }
            save_journal_atomic(&state.storage, &updated)?;
            Ok(format!("Rolled forward cataloged import '{}' through registry and index", journal.operation_id))
        }
        ImportStage::RegistryCommitted => {
            // Registry was committed. Roll forward SQLite index!
            for doc_file in &journal.document_files {
                if !doc_file.is_archived {
                    if let Ok(doc) = state.storage.read_document(&doc_file.destination_relative_path) {
                        let _ = db.upsert_document(&doc.metadata);
                    }
                }
            }
            if let Some(catalog) = crate::thought::find(state)? {
                let _ = db.upsert_document(&catalog.metadata);
            }
            if stg.exists() {
                let _ = fs::remove_dir_all(&stg);
            }
            let mut updated = journal.clone();
            updated.stage = ImportStage::Completed;
            updated.updated_at = chrono::Utc::now().to_rfc3339();
            if updated.result.is_none() {
                updated.result = Some(ImportCommitResult {
                    operation_id: journal.operation_id.clone(),
                    universe_id: journal.proposed_universe_id.clone(),
                    universe_name: journal.proposed_universe_name.clone(),
                    house_id: journal.target_house_id.clone(),
                    house_name: journal.target_house_name.clone(),
                    documents_imported: journal.document_files.iter().filter(|d| !d.is_archived).count(),
                    archived_documents_imported: journal.document_files.iter().filter(|d| d.is_archived).count(),
                    assets_imported: journal.asset_files.iter().filter(|a| !a.reused_existing).count(),
                    plan_revision: journal.catalog_after_revision,
                });
            }
            save_journal_atomic(&state.storage, &updated)?;
            Ok(format!("Rolled forward registry-committed import '{}' through index", journal.operation_id))
        }
        ImportStage::Completed => {
            if stg.exists() {
                let _ = fs::remove_dir_all(&stg);
            }
            Ok(format!("Completed import '{}' staging verified clean", journal.operation_id))
        }
    }
}

pub fn recover_imports_locked(
    state: &AppState,
    db: &mut crate::db::Database,
) -> Result<ImportRecoveryReport> {
    let ops_dir = state.storage.get_operations_dir();
    let mut recovered = Vec::new();
    let mut actions = Vec::new();
    if !ops_dir.exists() {
        return Ok(ImportRecoveryReport {
            recovered_operations: recovered,
            actions,
        });
    }

    for entry in fs::read_dir(&ops_dir).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("import_journal_") && name.ends_with(".json") {
            if let Ok(raw) = fs::read_to_string(entry.path()) {
                if let Ok(journal) = serde_json::from_str::<ImportJournal>(&raw) {
                    if journal.stage != ImportStage::Completed {
                        let action = recover_single_journal_locked(state, db, &journal)?;
                        recovered.push(journal.operation_id.clone());
                        actions.push(action);
                    }
                }
            }
        }
    }

    Ok(ImportRecoveryReport {
        recovered_operations: recovered,
        actions,
    })
}

pub fn recover_imports(state: &AppState) -> Result<ImportRecoveryReport> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;
    let reg_lock = state.storage.get_registry_lock();
    let _reg_guard = reg_lock.lock().map_err(|e| e.to_string())?;
    recover_imports_locked(state, &mut db)
}

pub fn import_commit(
    state: &AppState,
    request: ImportCommitRequest,
) -> Result<ImportCommitResult> {
    import_commit_with_checkpoint(state, request, |_| Ok(()))
}

pub fn import_commit_with_checkpoint(
    state: &AppState,
    request: ImportCommitRequest,
    checkpoint: impl Fn(&str) -> Result<()>,
) -> Result<ImportCommitResult> {
    // 1. Acquire Locks in strict hierarchical order
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    db.ensure_writable()?;
    let reg_lock = state.storage.get_registry_lock();
    let _reg_guard = reg_lock.lock().map_err(|e| e.to_string())?;

    // 2. Mutual exclusion checks
    if state.storage.has_pending_universe_move_journal()? {
        return Err("Cannot import while a Universe move operation is incomplete or pending recovery.".into());
    }

    // 3. Idempotent check: if this exact operation_id was already completed, return recorded result
    if let Some(existing_journal) = read_journal(&state.storage, &request.operation_id)? {
        if existing_journal.stage == ImportStage::Completed {
            if let Some(res) = existing_journal.result {
                return Ok(res);
            }
        }
        // Incomplete previous attempt with same operation_id: recover it first
        recover_single_journal_locked(state, &mut db, &existing_journal)?;
    }

    // Check if other incomplete import journals exist
    if has_pending_import_journals(state)? {
        let _ = recover_imports_locked(state, &mut db)?;
        if has_pending_import_journals(state)? {
            return Err("Cannot import while another import operation is incomplete and pending recovery.".into());
        }
    }

    // 4. Preflight and reconstruct plan backend-authoritatively
    let package_path = Path::new(&request.package_path);
    if !package_path.exists() {
        return Err(format!("Package file does not exist: {}", request.package_path));
    }
    let (pkg_hash, _) = vault::file_digest(package_path)?;

    let preview = import_plan::preview_locked(
        state,
        &db,
        ImportPreviewRequest {
            package_path: request.package_path.clone(),
            target_house_id: request.target_house_id.clone(),
            policy: request.policy.clone(),
            operation_id: Some(request.operation_id.clone()),
        },
    )?;

    if !preview.is_valid {
        return Err(format!(
            "Import preview is invalid: {:?}",
            preview.diagnostics
        ));
    }

    if preview.package_sha256 != pkg_hash {
        return Err("Package contents changed on disk since preview was generated".into());
    }

    if preview.destination_fingerprint != request.expected_destination_fingerprint {
        return Err(
            "Stale import plan: destination notebook state or target House has changed since preview was generated. Please refresh preview."
                .into(),
        );
    }

    // 5. Verify no destination collision before staging
    for doc_path in &preview.document_paths {
        let full = state.storage.resolve_safe_path(&doc_path.destination_relative_path)?;
        if full.exists() {
            return Err(format!(
                "Destination file '{}' already exists",
                doc_path.destination_relative_path
            ));
        }
    }
    for asset_path in &preview.asset_paths {
        if !asset_path.reused_existing {
            let full = state.storage.resolve_safe_path(&asset_path.destination_relative_path)?;
            if full.exists() {
                return Err(format!(
                    "Destination asset '{}' already exists",
                    asset_path.destination_relative_path
                ));
            }
        }
    }

    let loaded = load_package(package_path)?;

    // 6. Staging outside scanner paths
    let stg_dir = staging_dir(&state.storage, &request.operation_id);
    if stg_dir.exists() {
        let _ = fs::remove_dir_all(&stg_dir);
    }
    fs::create_dir_all(&stg_dir)
        .map_err(|e| format!("Failed to create staging directory: {e}"))?;

    let mut staged_doc_files = Vec::new();
    for (i, doc) in loaded.documents.iter().enumerate() {
        let planned = preview
            .document_paths
            .iter()
            .find(|p| p.source_id == doc.entry.id)
            .ok_or_else(|| format!("Missing planned path for document '{}'", doc.entry.id))?;

        let remapped_fm = import_plan::remap_frontmatter(
            &doc.frontmatter,
            &preview.id_mappings,
            &request.target_house_id,
            &loaded.manifest.source_universe_id,
        )?;

        let mut content = doc.detail.content.clone();
        for asset in &preview.asset_paths {
            if asset.source_relative_path != asset.destination_relative_path {
                let is_referenced = loaded.manifest.assets.iter().any(|a| {
                    a.source_relative_path == asset.source_relative_path
                        && a.referenced_by.contains(&doc.entry.id)
                });
                if is_referenced {
                    content = content.replace(
                        &asset.source_relative_path,
                        &asset.destination_relative_path,
                    );
                }
            }
        }

        let fm_str = serde_json::to_string_pretty(&remapped_fm)
            .map_err(|e| format!("Failed to serialize frontmatter: {e}"))?;
        let full_content = format!("---json\n{}\n---\n{}", fm_str, content);

        let clean_title = StorageManager::sanitize_filename(&planned.title);
        let staged_rel = format!("documents/{}_{}.md", i, clean_title);
        let staged_full = stg_dir.join(&staged_rel);
        if let Some(parent) = staged_full.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut sf = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&staged_full)
            .map_err(|e| format!("Failed to create staged file: {e}"))?;
        sf.write_all(full_content.as_bytes())
            .map_err(|e| e.to_string())?;
        sf.sync_all().map_err(|e| e.to_string())?;

        let sha256 = vault::bytes_hash(full_content.as_bytes());
        staged_doc_files.push(JournalDocFile {
            source_id: doc.entry.id.clone(),
            staged_path: staged_rel,
            destination_relative_path: planned.destination_relative_path.clone(),
            sha256,
            is_archived: planned.is_archived,
        });
    }

    let mut staged_asset_files = Vec::new();
    for (j, asset) in preview.asset_paths.iter().enumerate() {
        if !asset.reused_existing {
            let manifest_asset = loaded
                .manifest
                .assets
                .iter()
                .find(|a| a.source_relative_path == asset.source_relative_path)
                .ok_or_else(|| {
                    format!("Missing manifest asset: {}", asset.source_relative_path)
                })?;
            let bytes = loaded
                .payloads
                .get(&manifest_asset.path)
                .ok_or_else(|| format!("Missing payload for asset: {}", manifest_asset.path))?;

            let file_name = Path::new(&asset.source_relative_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("asset.bin");
            let staged_rel = format!("assets/{}_{}", j, file_name);
            let staged_full = stg_dir.join(&staged_rel);
            if let Some(parent) = staged_full.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut sf = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(&staged_full)
                .map_err(|e| format!("Failed to create staged asset: {e}"))?;
            sf.write_all(bytes).map_err(|e| e.to_string())?;
            sf.sync_all().map_err(|e| e.to_string())?;

            staged_asset_files.push(JournalAssetFile {
                source_relative_path: asset.source_relative_path.clone(),
                staged_path: staged_rel,
                destination_relative_path: asset.destination_relative_path.clone(),
                sha256: asset.sha256.clone(),
                reused_existing: false,
            });
        } else {
            staged_asset_files.push(JournalAssetFile {
                source_relative_path: asset.source_relative_path.clone(),
                staged_path: String::new(),
                destination_relative_path: asset.destination_relative_path.clone(),
                sha256: asset.sha256.clone(),
                reused_existing: true,
            });
        }
    }

    // Capture before images
    let existing_catalog_plan = crate::thought::find_catalog_plan(state)?;
    let catalog_before = existing_catalog_plan.as_ref().map(|(doc, plan)| {
        let full_path = state.storage.resolve_safe_path(&doc.metadata.relative_path).ok();
        let content = full_path.and_then(|p| fs::read_to_string(p).ok());
        CatalogBeforeImage {
            revision: plan.revision,
            relative_path: doc.metadata.relative_path.clone(),
            original_content: content,
        }
    });

    let registry = state.storage.read_house_registry()?;
    let target_house = registry
        .houses
        .iter()
        .find(|h| h.id == request.target_house_id)
        .ok_or_else(|| format!("Target house '{}' not found", request.target_house_id))?;
    let registry_before_universes = Some(target_house.universe_ids.clone());

    let now = chrono::Utc::now().to_rfc3339();
    let mut journal = ImportJournal {
        operation_id: request.operation_id.clone(),
        stage: ImportStage::Staged,
        package_path: request.package_path.clone(),
        package_sha256: preview.package_sha256.clone(),
        source_universe_id: loaded.manifest.source_universe_id.clone(),
        target_house_id: request.target_house_id.clone(),
        target_house_name: preview.target_house_name.clone(),
        policy: request.policy.clone(),
        destination_fingerprint: preview.destination_fingerprint.clone(),
        proposed_universe_id: preview.proposed_universe_id.clone(),
        proposed_universe_name: preview.proposed_universe_name.clone(),
        id_mappings: preview.id_mappings.clone(),
        document_files: staged_doc_files,
        asset_files: staged_asset_files,
        catalog_before,
        catalog_after_revision: preview.proposed_plan_revision,
        registry_before_universes,
        created_at: now.clone(),
        updated_at: now.clone(),
        result: None,
    };
    save_journal_atomic(&state.storage, &journal)?;

    checkpoint("after_staged")?;

    // 7. Publish Destination Files
    for (idx, doc_file) in journal.document_files.iter().enumerate() {
        if idx > 0 {
            checkpoint("mid_files_committed")?;
        }
        let staged_full = stg_dir.join(&doc_file.staged_path);
        let bytes = fs::read(&staged_full)
            .map_err(|e| format!("Failed to read staged document: {e}"))?;
        let dest_full = state
            .storage
            .resolve_safe_path(&doc_file.destination_relative_path)?;
        if let Some(parent) = dest_full.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut dest_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&dest_full)
            .map_err(|e| {
                format!(
                    "Failed to create destination file '{}': {e}",
                    doc_file.destination_relative_path
                )
            })?;
        dest_file
            .write_all(&bytes)
            .map_err(|e| format!("Failed to write destination file: {e}"))?;
        dest_file
            .sync_all()
            .map_err(|e| format!("Failed to flush destination file: {e}"))?;
    }

    for asset_file in &journal.asset_files {
        if !asset_file.reused_existing {
            let staged_full = stg_dir.join(&asset_file.staged_path);
            let bytes = fs::read(&staged_full)
                .map_err(|e| format!("Failed to read staged asset: {e}"))?;
            let dest_full = state
                .storage
                .resolve_safe_path(&asset_file.destination_relative_path)?;
            if let Some(parent) = dest_full.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut dest_file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&dest_full)
                .map_err(|e| {
                    format!(
                        "Failed to create destination asset '{}': {e}",
                        asset_file.destination_relative_path
                    )
                })?;
            dest_file
                .write_all(&bytes)
                .map_err(|e| format!("Failed to write destination asset: {e}"))?;
            dest_file
                .sync_all()
                .map_err(|e| format!("Failed to flush destination asset: {e}"))?;
        }
    }

    journal.stage = ImportStage::FilesCommitted;
    journal.updated_at = chrono::Utc::now().to_rfc3339();
    save_journal_atomic(&state.storage, &journal)?;

    checkpoint("after_files_committed")?;

    // 8. Publish Web of Thought Catalog
    let proposed_plan = preview
        .proposed_plan
        .clone()
        .ok_or("Missing proposed plan in preview")?;
    crate::thought::validate(&proposed_plan)?;
    validate::strict_history(&proposed_plan)?;

    let current_catalog = crate::thought::find(state)?;
    let current_plan = crate::thought::find_catalog_plan(state)?;
    let current_rev = current_plan.as_ref().map(|(_, p)| p.revision).unwrap_or(0);
    if current_rev != preview.target_plan_revision {
        return Err("Catalog revision changed concurrently. Stale preview.".into());
    }

    let now = chrono::Utc::now().to_rfc3339();
    let catalog_doc = match current_catalog {
        Some(mut doc) => {
            let mut metadata: serde_json::Value =
                serde_json::from_str(doc.metadata.metadata_json.as_deref().unwrap_or("{}"))
                    .map_err(|e| e.to_string())?;
            metadata[crate::thought::KEY] =
                serde_json::to_value(&proposed_plan).map_err(|e| e.to_string())?;
            doc.metadata.metadata_json = Some(metadata.to_string());
            doc.metadata.updated_at = now.clone();
            doc
        }
        None => {
            let id = uuid::Uuid::new_v4().to_string();
            let mut metadata = serde_json::Map::new();
            metadata.insert(
                crate::thought::KEY.to_string(),
                serde_json::to_value(&proposed_plan).map_err(|e| e.to_string())?,
            );
            DocumentDetail {
                metadata: DocumentMetadata {
                    id: id.clone(),
                    title: "Web of Thought \u{2014} Planning Desk".into(),
                    doc_type: DocumentType::Lorebook,
                    house_id: crate::models::default_house_id(),
                    relative_path: format!("Lorebooks/Web_of_Thought_{id}.md"),
                    parent_id: None,
                    metadata_json: Some(serde_json::Value::Object(metadata).to_string()),
                    created_at: now.clone(),
                    updated_at: now.clone(),
                    tags: vec![],
                },
                content: "# Web of Thought\n\nNarrative planning data is stored in this document's JSON frontmatter. Open Web of Thought in Lorebook Studio to edit it. Manuscripts and chapters are separate.\n".into(),
            }
        }
    };
    state
        .storage
        .write_document_atomic(&catalog_doc.metadata.relative_path, &catalog_doc)?;

    journal.stage = ImportStage::CatalogCommitted;
    journal.updated_at = chrono::Utc::now().to_rfc3339();
    save_journal_atomic(&state.storage, &journal)?;

    checkpoint("after_catalog_committed")?;

    // 9. Publish House Registry
    state.storage.mutate_house_registry_unlocked(|reg| {
        let h = reg
            .houses
            .iter_mut()
            .find(|h| h.id == request.target_house_id)
            .ok_or_else(|| {
                format!(
                    "Target house '{}' does not exist in registry",
                    request.target_house_id
                )
            })?;
        if !h.universe_ids.contains(&preview.proposed_universe_id) {
            h.universe_ids.push(preview.proposed_universe_id.clone());
        }
        Ok(())
    })?;

    journal.stage = ImportStage::RegistryCommitted;
    journal.updated_at = chrono::Utc::now().to_rfc3339();
    save_journal_atomic(&state.storage, &journal)?;

    checkpoint("after_registry_committed")?;

    // 10. Publish SQLite Index
    checkpoint("during_sqlite_commit")?;
    for doc_file in &journal.document_files {
        if !doc_file.is_archived {
            let doc = state
                .storage
                .read_document(&doc_file.destination_relative_path)?;
            db.upsert_document(&doc.metadata)
                .map_err(|e| format!("SQLite indexing failed for '{}': {e}", doc.metadata.id))?;
        }
    }
    db.upsert_document(&catalog_doc.metadata)
        .map_err(|e| format!("SQLite indexing failed for catalog document: {e}"))?;

    // 11. Finalize Completion
    let res = ImportCommitResult {
        operation_id: request.operation_id.clone(),
        universe_id: preview.proposed_universe_id.clone(),
        universe_name: preview.proposed_universe_name.clone(),
        house_id: request.target_house_id.clone(),
        house_name: preview.target_house_name.clone(),
        documents_imported: journal.document_files.iter().filter(|d| !d.is_archived).count(),
        archived_documents_imported: journal.document_files.iter().filter(|d| d.is_archived).count(),
        assets_imported: journal.asset_files.iter().filter(|a| !a.reused_existing).count(),
        plan_revision: preview.proposed_plan_revision,
    };
    journal.stage = ImportStage::Completed;
    journal.result = Some(res.clone());
    journal.updated_at = chrono::Utc::now().to_rfc3339();
    save_journal_atomic(&state.storage, &journal)?;

    let _ = fs::remove_dir_all(&stg_dir);

    Ok(res)
}
