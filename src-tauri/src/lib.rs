pub mod models;
pub mod db;
pub mod storage;
pub mod commands;
pub mod organization;
pub mod vault;
pub mod notebook;
pub mod cipher;
pub mod thought;
pub mod music;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Resolve Documents/MetaCognitionNotebook directory
            let doc_dir = app.path().document_dir().unwrap_or_else(|_| {
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
            });
            let library_root = doc_dir.join("MetaCognitionNotebook");

            let local_data_dir = app.path().app_local_data_dir().map_err(std::io::Error::other)?;
            let manager = notebook::NotebookManager { data: local_data_dir.clone(), default: notebook::Slot {
                root: library_root, index: local_data_dir.join("metadata.db"),
            }};
            let initialize = || -> Result<_, String> {
                let lock = manager.lock()?;
                let state = manager.startup()?;
                Ok((state,lock))
            };
            let (state, lock) = initialize().map_err(|error| {
                rfd::MessageDialog::new().set_title("Notebook recovery needs attention")
                    .set_description(format!("{error}\n\nNo notebook was replaced. Keep the original notebook, Vault backups, Notebooks and NotebookActivations folders. Restore a verified backup to a separate folder for inspection. Close other app instances before retrying.\nApp data: {}", local_data_dir.display()))
                    .set_level(rfd::MessageLevel::Error).show();
                std::io::Error::other(error)
            })?;
            app.manage(state);
            app.manage(notebook::NotebookRuntime { manager, _lock: lock });

            // Ensure Music directory and standard category subfolders exist
            let _ = music::resolve_music_dir(app.handle());

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Ensure process terminates cleanly when the window is destroyed
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            thought::thought_get,
            thought::thought_save,
            commands::get_library_info,
            commands::list_documents,
            commands::get_document,
            commands::create_document,
            commands::save_document,
            commands::rename_document,
            commands::delete_document,
            commands::reindex_library,
            commands::search_documents,
            commands::list_tags,
            commands::update_organization,
            commands::manage_tag,
            commands::list_houses,
            commands::get_house,
            commands::create_house,
            commands::update_house,
            commands::archive_house,
            commands::restore_house,
            commands::move_document_to_house,
            commands::assign_universe_to_house,
            commands::create_universe_in_house,
            commands::move_universe_to_house,
            commands::recover_pending_universe_moves,
            commands::inspect_house_integrity,
            commands::exit_app,
            commands::save_export_file,
            notebook::vault_activate,
            notebook::vault_activation_status,
            notebook::vault_rollback,
            notebook::vault_restart,
            vault::vault_history,
            vault::vault_create,
            vault::vault_verify,
            vault::vault_choose,
            vault::vault_restore,
            vault::vault_open_folder,
            cipher::cipher_list_dictionaries,
            cipher::cipher_get_dictionary,
            cipher::cipher_save_dictionary,
            cipher::cipher_delete_dictionary,
            cipher::cipher_export_dictionary,
            cipher::cipher_import_dictionary,
            cipher::cipher_list_vocabulary_pools,
            cipher::cipher_get_vocabulary_sample,
            cipher::cipher_import_vocabulary_pool,
            cipher::cipher_delete_vocabulary_pool,
            music::music_list_tracks,
            music::music_get_track_bytes,
            music::music_open_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
