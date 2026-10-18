//! Restart-based notebook selection. Never replaces canonical files or the live index.
use crate::{commands::AppState, db::Database, storage::StorageManager, vault};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Slot {
    pub root: PathBuf,
    pub index: PathBuf,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Selection {
    version: u32,
    generation: u64,
    active: Slot,
    previous: Slot,
    preserved_backup: PathBuf,
    message: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct ActivationStatus {
    pub active_path: String,
    pub selected_path: String,
    pub previous_path: Option<String>,
    pub preserved_backup: Option<String>,
    pub restart_required: bool,
    pub message: String,
}
pub struct NotebookManager {
    pub data: PathBuf,
    pub default: Slot,
}
pub struct NotebookRuntime {
    pub manager: NotebookManager,
    pub _lock: File,
}

impl NotebookManager {
    /// One writer process per app-local selection store, including during relaunch.
    pub fn lock(&self) -> Result<File> {
        fs::create_dir_all(&self.data).map_err(err)?;
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(self.data.join("notebook.lock"))
            .map_err(err)?;
        for _ in 0..60 {
            if fs2::FileExt::try_lock_exclusive(&file).is_ok() {
                return Ok(file);
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        Err("Another notebook process is running, or notebook.lock cannot be locked. Close the other app and retry. No notebook was replaced.".into())
    }
    fn journal(&self) -> PathBuf {
        self.data.join("NotebookActivations")
    }
    fn latest(&self) -> Result<Option<Selection>> {
        let folder = self.journal();
        if !folder.exists() {
            return Ok(None);
        }
        let mut latest: Option<(u64, PathBuf)> = None;
        for (count, entry) in fs::read_dir(&folder).map_err(err)?.enumerate() {
            if count >= 10_000 {
                return Err("Too many activation journal files. Startup stopped; retain the journal and notebooks for recovery.".into());
            }
            let path = entry.map_err(err)?.path();
            if path.extension().is_none_or(|e| e != "json") {
                continue;
            }
            let number = path.file_stem().and_then(|s| s.to_str()).and_then(|s| s.parse::<u64>().ok())
                .ok_or("Invalid activation journal filename. Startup stopped without selecting an empty notebook.")?;
            if number == 0
                || path.file_name().and_then(|s| s.to_str())
                    != Some(format!("{number:020}.json").as_str())
            {
                return Err("Noncanonical activation record name. Preserve the journal; startup is blocked.".into());
            }
            if latest.as_ref().is_none_or(|(n, _)| number > *n) {
                latest = Some((number, path));
            }
        }
        latest.map(|(generation,path)| {
            let metadata = fs::symlink_metadata(&path).map_err(err)?;
            if !metadata.is_file() || metadata.len() > 65536 { return Err("Invalid activation journal size/type".into()); }
            let record: Selection = serde_json::from_slice(&fs::read(path).map_err(err)?).map_err(err)?;
            if record.version != 1 || record.generation != generation || !record.active.root.is_absolute()
                || !record.active.index.is_absolute() || !record.previous.root.is_absolute() || !record.previous.index.is_absolute() {
                return Err("Unsupported or invalid notebook selection. Preserve NotebookActivations and all notebook folders; startup is blocked.".into());
            }
            Ok(record)
        }).transpose()
    }
    fn publish(&self, selection: &Selection) -> Result<()> {
        fs::create_dir_all(self.journal()).map_err(err)?;
        let temporary = self.journal().join(format!(
            "{}-{}.partial",
            selection.generation,
            uuid::Uuid::new_v4()
        ));
        let final_path = self
            .journal()
            .join(format!("{:020}.json", selection.generation));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(err)?;
        file.write_all(&serde_json::to_vec_pretty(selection).map_err(err)?)
            .map_err(err)?;
        file.sync_all().map_err(err)?;
        drop(file); // Windows cannot rename a still-open file with all sharing modes.
        if final_path.exists() {
            return Err(
                "Activation generation already exists; no selection was overwritten".into(),
            );
        }
        fs::rename(&temporary, &final_path).map_err(err)?;
        Ok(())
    }
    pub fn status(&self, state: &AppState) -> Result<ActivationStatus> {
        let latest = self.latest()?;
        let selected = latest.as_ref().map(|r| &r.active).unwrap_or(&self.default);
        let restart_required =
            selected.root != state.storage.get_root() || selected.index != state.db_path;
        Ok(ActivationStatus {
            active_path: state.storage.get_root().to_string_lossy().into(),
            selected_path: selected.root.to_string_lossy().into(),
            previous_path: latest
                .as_ref()
                .map(|r| r.previous.root.to_string_lossy().into()),
            preserved_backup: latest
                .as_ref()
                .map(|r| r.preserved_backup.to_string_lossy().into()),
            restart_required,
            message: if restart_required {
                "Notebook selection saved. Restart required to activate it; editing is blocked."
                    .into()
            } else {
                latest
                    .map(|r| r.message)
                    .unwrap_or_else(|| "Using the original notebook.".into())
            },
        })
    }
    /// Partial selection records are ignored. A committed but unusable selection falls back
    /// to its intact predecessor; persist that rollback before allowing any editing.
    pub fn startup(&self) -> Result<AppState> {
        self.startup_inner(|_| Ok(()))
    }
    fn startup_inner(&self, checkpoint: impl Fn(&str) -> Result<()>) -> Result<AppState> {
        let Some(record) = self.latest()? else {
            let storage = StorageManager::new(&self.default.root);
            storage.initialize().map_err(err)?;
            let state = AppState {
                storage,
                db: Mutex::new(Database::open(&self.default.index).map_err(err)?),
                db_path: self.default.index.clone(),
            };
            crate::commands::reindex_library_impl(&state)?;
            return Ok(state);
        };
        match open_slot(&record.active) {
            Ok(state) => Ok(state),
            Err(error) => {
                let state = open_slot(&record.previous).map_err(|previous| format!("Selected notebook could not open: {error}. Previous notebook also failed: {previous}. Startup stopped. Keep all notebooks, Vault backups and NotebookActivations; do not delete them."))?;
                checkpoint("rollback_validated")?;
                self.publish(&Selection { version: 1, generation: record.generation.checked_add(1).ok_or("Generation overflow")?,
                    active: record.previous, previous: record.active, preserved_backup: record.preserved_backup,
                    message: format!("Startup recovery returned to the previous notebook because the selected notebook failed validation: {error}. All folders are retained.") })?;
                Ok(state)
            }
        }
    }
    pub fn activate(
        &self,
        state: &AppState,
        backup: &Path,
        hash: &str,
    ) -> Result<ActivationStatus> {
        self.change(state, Some((backup, hash)), |_| Ok(()))
    }
    pub fn rollback(&self, state: &AppState) -> Result<ActivationStatus> {
        self.change(state, None, |_| Ok(()))
    }
    fn change(
        &self,
        state: &AppState,
        backup: Option<(&Path, &str)>,
        checkpoint: impl Fn(&str) -> Result<()>,
    ) -> Result<ActivationStatus> {
        let mut db = state.db.lock().map_err(err)?;
        db.ensure_writable()?;
        if self.status(state)?.restart_required {
            return Err("Restart before changing notebook selection again".into());
        }
        if let Some((path, hash)) = backup {
            if vault::verify_backup(path)?.archive_sha256 != hash {
                return Err("Backup changed since preview; verify it again".into());
            }
        }
        let latest = self.latest()?;
        let previous = Slot {
            root: state.storage.get_root().to_path_buf(),
            index: state.db_path.clone(),
        };
        // Keep the old root/index in place AND a verified portable pre-activation backup.
        let preservation =
            vault::create_backup_locked(state, &self.data.join("Vault"), &db, |_| Ok(()))?;
        checkpoint("preserved")?;
        let next = if let Some((path, hash)) = backup {
            let parent = self.data.join("Notebooks");
            fs::create_dir_all(&parent).map_err(err)?;
            let recovered = vault::restore_separate(path, hash, &parent, state.storage.get_root())?;
            let root = PathBuf::from(recovered.restored_path);
            Slot {
                index: root.join(".vault-recovery/metadata.db"),
                root,
            }
        } else {
            latest
                .as_ref()
                .ok_or("No previous notebook is recorded")?
                .previous
                .clone()
        };
        checkpoint("restored")?;
        drop(open_slot(&next)?); // Validate/rebuild/close the separate index before selection.
        checkpoint("validated")?;
        let selection = Selection {
            version: 1,
            generation: latest
                .as_ref()
                .map(|r| r.generation)
                .unwrap_or(0)
                .checked_add(1)
                .ok_or("Generation overflow")?,
            active: next,
            previous,
            preserved_backup: PathBuf::from(preservation.path),
            message: if backup.is_some() {
                "Backup activated. The restored notebook is now in use. Previous writing is retained at the locations below.".into()
            } else {
                "Previous notebook activated. Both notebook folders and the pre-switch backup are retained.".into()
            },
        };
        checkpoint("publishing")?;
        self.publish(&selection).map_err(|e| format!("Activation selection was not published: {e}. Current notebook remains selected. Retain recovered folders and Vault backups."))?;
        db.freeze_writes(); // No fallible step between publication and backend write barrier.
        checkpoint("published")?;
        self.status(state)
    }
}

fn open_slot(slot: &Slot) -> Result<AppState> {
    vault::validate_library(&slot.root)?;
    if !slot.index.is_file() {
        return Err("Notebook index is missing; no empty index was substituted".into());
    }
    let mut db = Database::open(&slot.index).map_err(err)?;
    db.check_integrity().map_err(err)?;
    let storage = StorageManager::new(&slot.root);
    let (documents, report) = storage.scan_and_reindex();
    if !report.errors.is_empty() {
        return Err(format!(
            "Notebook scan failed: {}",
            report.errors.join("; ")
        ));
    }
    // Keep indexed raw-import identity. Canonical frontmatter stays authoritative.
    let old = db.list_documents(None).map_err(err)?;
    let tags = db.list_all_tags().map_err(err)?;
    let mut ids = std::collections::BTreeSet::new();
    let mut metadata = vec![];
    for mut document in documents {
        let raw = fs::read(slot.root.join(&document.metadata.relative_path)).map_err(err)?;
        if !raw.starts_with(b"---json\n") {
            if let Some(saved) = old
                .iter()
                .find(|m| m.relative_path == document.metadata.relative_path)
            {
                document.metadata = saved.clone();
            }
        }
        if !ids.insert(document.metadata.id.clone()) {
            return Err("Duplicate notebook document identity".into());
        }
        metadata.push(document.metadata);
    }
    db.replace_index(&metadata, &tags).map_err(err)?;
    db.check_integrity().map_err(err)?;
    Ok(AppState {
        storage,
        db: Mutex::new(db),
        db_path: slot.index.clone(),
    })
}

#[tauri::command]
pub fn vault_activation_status(app: tauri::AppHandle) -> Result<ActivationStatus> {
    use tauri::Manager;
    app.state::<NotebookRuntime>()
        .manager
        .status(&app.state::<AppState>())
}
#[tauri::command]
pub async fn vault_activate(
    app: tauri::AppHandle,
    path: String,
    expected_hash: String,
) -> Result<ActivationStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        app.state::<NotebookRuntime>().manager.activate(
            &app.state::<AppState>(),
            Path::new(&path),
            &expected_hash,
        )
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn vault_rollback(app: tauri::AppHandle) -> Result<ActivationStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        app.state::<NotebookRuntime>()
            .manager
            .rollback(&app.state::<AppState>())
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub fn vault_restart(app: tauri::AppHandle) -> Result<()> {
    use tauri::Manager;
    if !app
        .state::<NotebookRuntime>()
        .manager
        .status(&app.state::<AppState>())?
        .restart_required
    {
        return Err(
            "No activation is pending. Close the app normally to save pending edits.".into(),
        );
    }
    app.restart();
}

#[cfg(test)]
mod tests;
