use super::*;
use crate::{
    commands::*,
    organization::{manage_tag_impl, update_organization_impl, OrganizationPatch},
};

fn fixture() -> (tempfile::TempDir, NotebookManager, AppState, vault::Preview) {
    let directory = tempfile::tempdir().unwrap();
    let data = directory.path().join("Data");
    fs::create_dir_all(&data).unwrap();
    let manager = NotebookManager {
        default: Slot {
            root: directory.path().join("Original"),
            index: data.join("metadata.db"),
        },
        data,
    };
    let state = manager.startup().unwrap();
    create_document_impl(
        &state,
        "poetry".into(),
        "Original".into(),
        None,
        Some("Current writing\n".into()),
        None,
        None,
        None,
    )
    .unwrap();
    let source_root = directory.path().join("Source");
    let storage = StorageManager::new(&source_root);
    storage.initialize().unwrap();
    let source = AppState {
        storage,
        db: Mutex::new(Database::open(directory.path().join("source.db")).unwrap()),
        db_path: directory.path().join("source.db"),
    };
    for studio in ["poetry", "philosophy", "lorebook"] {
        let doc = create_document_impl(
            &source,
            studio.into(),
            format!("Recovered {studio}"),
            None,
            Some("  Restored prose\n\n世界\n".into()),
            Some(r#"{"custom":42}"#.into()),
            Some(vec!["restored".into()]),
            None,
        )
        .unwrap();
        update_organization_impl(
            &source,
            doc.metadata.id,
            OrganizationPatch {
                favorite: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
    }
    let preview = vault::create_backup(&source, &directory.path().join("Input")).unwrap();
    (directory, manager, state, preview)
}
fn bytes(root: &Path) -> Vec<(PathBuf, Vec<u8>)> {
    let mut result: Vec<_> = walkdir::WalkDir::new(root)
        .into_iter()
        .map(|e| e.unwrap())
        .filter(|e| e.file_type().is_file())
        .map(|e| {
            (
                e.path().strip_prefix(root).unwrap().to_path_buf(),
                fs::read(e.path()).unwrap(),
            )
        })
        .collect();
    result.sort();
    result
}

#[test]
fn activation_preserves_original_and_restart_opens_all_studios_and_metadata() {
    let (_directory, manager, state, preview) = fixture();
    let before = bytes(&manager.default.root);
    let status = manager
        .activate(&state, Path::new(&preview.path), &preview.archive_sha256)
        .unwrap();
    assert!(status.restart_required);
    assert_eq!(
        status.previous_path.as_deref(),
        Some(manager.default.root.to_str().unwrap())
    );
    assert_eq!(bytes(&manager.default.root), before);
    assert_eq!(
        vault::verify_backup(Path::new(status.preserved_backup.as_ref().unwrap()))
            .unwrap()
            .document_count,
        1
    );
    assert_eq!(list_documents_impl(&state, None, None).unwrap().len(), 1); // still the old runtime
    drop(state);
    let active = manager.startup().unwrap();
    assert!(!manager.status(&active).unwrap().restart_required);
    let docs = list_documents_impl(&active, None, None).unwrap();
    assert_eq!(docs.len(), 3);
    for doc in docs {
        let loaded = get_document_impl(&active, doc.id).unwrap();
        assert_eq!(loaded.content, "  Restored prose\n\n世界\n");
        assert_eq!(loaded.metadata.tags, vec!["restored"]);
        let json: serde_json::Value =
            serde_json::from_str(loaded.metadata.metadata_json.as_ref().unwrap()).unwrap();
        assert_eq!(json["custom"], 42);
        assert_eq!(json["_workshop"]["favorite"], true);
    }
    assert_eq!(bytes(&manager.default.root), before);
}
#[test]
fn published_selection_blocks_all_stale_mutations_before_filesystem_changes() {
    let (_directory, manager, state, preview) = fixture();
    let id = list_documents_impl(&state, None, None).unwrap()[0].id.clone();
    manager
        .activate(&state, Path::new(&preview.path), &preview.archive_sha256)
        .unwrap();
    let before = bytes(state.storage.get_root());
    assert!(
        save_document_impl(&state, id.clone(), "stale".into(), None, None, None)
            .unwrap_err()
            .contains("Restart")
    );
    assert!(rename_document_impl(&state, id.clone(), "changed".into()).is_err());
    assert!(delete_document_impl(&state, id.clone()).is_err());
    assert!(create_document_impl(
        &state,
        "poetry".into(),
        "new".into(),
        None,
        None,
        None,
        None,
        None
    )
    .is_err());
    assert!(update_organization_impl(
        &state,
        id,
        OrganizationPatch {
            favorite: Some(false),
            ..Default::default()
        }
    )
    .is_err());
    assert!(manage_tag_impl(&state, "old".into(), Some("new".into())).is_err());
    assert!(reindex_library_impl(&state).is_err());
    assert_eq!(bytes(state.storage.get_root()), before);
}
#[test]
fn failures_before_publication_retain_original_and_startup_selection() {
    for phase in ["preserved", "restored", "validated", "publishing"] {
        let (_directory, manager, state, preview) = fixture();
        let before = bytes(state.storage.get_root());
        let error = manager
            .change(
                &state,
                Some((Path::new(&preview.path), &preview.archive_sha256)),
                |point| {
                    if phase == point {
                        Err("injected disk/permission/interruption failure".into())
                    } else {
                        Ok(())
                    }
                },
            )
            .unwrap_err();
        assert!(error.contains("injected"));
        assert!(manager.latest().unwrap().is_none());
        assert!(state.db.lock().unwrap().ensure_writable().is_ok());
        assert_eq!(bytes(state.storage.get_root()), before);
        drop(state);
        assert_eq!(
            manager.startup().unwrap().storage.get_root(),
            manager.default.root
        );
        assert!(!vault::history(&manager.data.join("Vault"))
            .unwrap()
            .backups
            .is_empty());
    }
}
#[test]
fn termination_after_publication_is_completed_by_startup_without_old_runtime_acknowledgement() {
    let (_directory, manager, state, preview) = fixture();
    assert!(manager
        .change(
            &state,
            Some((Path::new(&preview.path), &preview.archive_sha256)),
            |point| if point == "published" {
                Err("lost IPC/process termination".into())
            } else {
                Ok(())
            }
        )
        .is_err());
    assert!(manager.status(&state).unwrap().restart_required);
    assert!(state.db.lock().unwrap().ensure_writable().is_err());
    drop(state);
    let active = manager.startup().unwrap();
    assert_eq!(list_documents_impl(&active, None, None).unwrap().len(), 3);
    assert!(!manager.status(&active).unwrap().restart_required);
}
#[test]
fn startup_rolls_back_missing_selected_folder_or_corrupt_database_and_records_recovery() {
    for corrupt_db in [false, true] {
        let (_directory, manager, state, preview) = fixture();
        manager
            .activate(&state, Path::new(&preview.path), &preview.archive_sha256)
            .unwrap();
        let record = manager.latest().unwrap().unwrap();
        if corrupt_db {
            fs::write(&record.active.index, b"not a database").unwrap();
        } else {
            fs::rename(
                &record.active.root,
                record.active.root.with_extension("retained"),
            )
            .unwrap();
        }
        drop(state);
        let recovered = manager.startup().unwrap();
        assert_eq!(recovered.storage.get_root(), manager.default.root);
        assert!(manager
            .status(&recovered)
            .unwrap()
            .message
            .contains("Startup recovery"));
        assert_eq!(manager.latest().unwrap().unwrap().generation, 2);
        assert_eq!(
            list_documents_impl(&recovered, None, None).unwrap()[0].title,
            "Original"
        );
    }
}
#[test]
fn partial_journals_are_ignored_and_corrupt_committed_journal_blocks_startup() {
    let (_directory, manager, state, preview) = fixture();
    fs::create_dir_all(manager.journal()).unwrap();
    fs::write(
        manager.journal().join("1-interrupted.partial"),
        b"{unfinished",
    )
    .unwrap();
    assert!(manager.latest().unwrap().is_none());
    manager
        .activate(&state, Path::new(&preview.path), &preview.archive_sha256)
        .unwrap();
    fs::write(
        manager.journal().join("00000000000000000001.json"),
        b"{broken",
    )
    .unwrap();
    drop(state);
    assert!(manager.startup().is_err());
    assert!(manager.default.root.join("Poetry/Original.md").is_file());
}
#[test]
fn repeated_restores_and_user_rollback_preserve_every_notebook_generation() {
    let (_directory, manager, state, preview) = fixture();
    let first = manager
        .activate(&state, Path::new(&preview.path), &preview.archive_sha256)
        .unwrap();
    assert!(manager
        .activate(&state, Path::new(&preview.path), &preview.archive_sha256)
        .is_err());
    drop(state);
    let active = manager.startup().unwrap();
    let second = manager
        .activate(&active, Path::new(&preview.path), &preview.archive_sha256)
        .unwrap();
    assert_ne!(first.selected_path, second.selected_path);
    drop(active);
    let active = manager.startup().unwrap();
    manager.rollback(&active).unwrap();
    drop(active);
    let previous = manager.startup().unwrap();
    assert_eq!(previous.storage.get_root(), Path::new(&first.selected_path));
    assert!(Path::new(&second.selected_path).is_dir());
    assert!(manager.default.root.is_dir());
    assert_eq!(manager.latest().unwrap().unwrap().generation, 3);
}
#[test]
fn failed_preservation_or_publication_or_changed_archive_never_selects_new_notebook() {
    for failure in ["backup", "journal", "hash"] {
        let (_directory, manager, state, preview) = fixture();
        match failure {
            "backup" => fs::write(manager.data.join("Vault"), "blocks directory creation").unwrap(),
            "journal" => {}
            _ => fs::write(&preview.path, "tamper").unwrap(),
        }
        let result = manager.change(
            &state,
            Some((Path::new(&preview.path), &preview.archive_sha256)),
            |point| {
                if failure == "journal" && point == "publishing" {
                    fs::write(manager.journal(), "blocks publication").unwrap();
                }
                Ok(())
            },
        );
        assert!(result.is_err());
        if failure == "journal" {
            assert!(result.err().unwrap().contains("not published"));
        }
        assert!(state.db.lock().unwrap().ensure_writable().is_ok());
        assert_eq!(
            list_documents_impl(&state, None, None).unwrap()[0].title,
            "Original"
        );
    }
}
#[test]
fn pending_save_is_included_in_pre_activation_backup() {
    let (_directory, manager, state, preview) = fixture();
    let original = list_documents_impl(&state, None, None).unwrap()[0].clone();
    save_document_impl(
        &state,
        original.id,
        "Just saved before activation\n".into(),
        None,
        None,
        None,
    )
    .unwrap();
    let status = manager
        .activate(&state, Path::new(&preview.path), &preview.archive_sha256)
        .unwrap();
    let backup = Path::new(status.preserved_backup.as_ref().unwrap());
    let validated = vault::verify_backup(backup).unwrap();
    let restored = vault::restore_separate(
        backup,
        &validated.archive_sha256,
        &manager.data,
        state.storage.get_root(),
    )
    .unwrap();
    assert_eq!(
        StorageManager::new(restored.restored_path)
            .read_document(&original.relative_path)
            .unwrap()
            .content,
        "Just saved before activation\n"
    );
}
#[test]
fn sqlite_rebuild_failure_rolls_back_index_transaction() {
    let (_directory, _manager, state, _preview) = fixture();
    let mut db = state.db.lock().unwrap();
    let old = db.list_documents(None, None).unwrap();
    let mut collision = old[0].clone();
    collision.id = "another".into();
    assert!(db.replace_index(&[old[0].clone(), collision], &[]).is_err());
    assert_eq!(db.list_documents(None, None).unwrap()[0].id, old[0].id);
    db.check_integrity().unwrap();
}
#[test]
fn exclusive_process_lock_releases_on_drop() {
    let (_directory, manager, _state, _preview) = fixture();
    let first = manager.lock().unwrap();
    assert!(manager.lock().is_err());
    drop(first);
    assert!(manager.lock().is_ok());
}
#[test]
fn both_unavailable_notebooks_block_startup_instead_of_creating_empty_library() {
    let (_directory, manager, state, preview) = fixture();
    manager
        .activate(&state, Path::new(&preview.path), &preview.archive_sha256)
        .unwrap();
    let record = manager.latest().unwrap().unwrap();
    drop(state);
    fs::rename(
        &record.active.root,
        record.active.root.with_extension("retained"),
    )
    .unwrap();
    fs::rename(
        &record.previous.root,
        record.previous.root.with_extension("retained"),
    )
    .unwrap();
    assert!(manager.startup().err().unwrap().contains("Startup stopped"));
    assert!(!manager.default.root.exists());
}

#[test]
fn empty_backup_activates_an_empty_notebook_and_retains_previous_writing() {
    let (directory, manager, state, _) = fixture();
    let root = directory.path().join("Empty");
    let storage = StorageManager::new(&root);
    storage.initialize().unwrap();
    let empty = AppState {
        storage,
        db: Mutex::new(Database::open(directory.path().join("empty.db")).unwrap()),
        db_path: directory.path().join("empty.db"),
    };
    let backup = vault::create_backup(&empty, &directory.path().join("EmptyBackups")).unwrap();
    manager
        .activate(&state, Path::new(&backup.path), &backup.archive_sha256)
        .unwrap();
    drop(state);
    let active = manager.startup().unwrap();
    assert!(list_documents_impl(&active, None, None).unwrap().is_empty());
    assert!(manager.default.root.join("Poetry/Original.md").is_file());
}

#[test]
fn failed_startup_rollback_publication_blocks_editing_without_discarding_notebooks() {
    let (_directory, manager, state, preview) = fixture();
    manager
        .activate(&state, Path::new(&preview.path), &preview.archive_sha256)
        .unwrap();
    let record = manager.latest().unwrap().unwrap();
    drop(state);
    fs::rename(
        &record.active.root,
        record.active.root.with_extension("retained"),
    )
    .unwrap();
    // Occupying the next generation with a directory simulates an unpublishable selection.
    assert!(manager
        .startup_inner(|_| {
            fs::create_dir(manager.journal().join("00000000000000000002.json")).unwrap();
            Ok(())
        })
        .is_err());
    assert!(manager.default.root.join("Poetry/Original.md").is_file());
}

#[test]
fn growing_an_activated_notebook_beyond_archive_limits_does_not_revert_startup_selection() {
    let (_directory, manager, state, preview) = fixture();
    let status = manager
        .activate(&state, Path::new(&preview.path), &preview.archive_sha256)
        .unwrap();
    let root = Path::new(&status.selected_path);
    File::create(root.join("Attachments/large-local-file.bin"))
        .unwrap()
        .set_len(vault::MAX_FILE_BYTES + 1)
        .unwrap();
    drop(state);
    let active = manager.startup().unwrap();
    assert_eq!(active.storage.get_root(), root);
    assert_eq!(list_documents_impl(&active, None, None).unwrap().len(), 3);
    assert!(!manager
        .status(&active)
        .unwrap()
        .message
        .contains("Startup recovery"));
}
