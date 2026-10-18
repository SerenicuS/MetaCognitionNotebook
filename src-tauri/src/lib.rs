pub mod models;
pub mod db;
pub mod storage;
pub mod commands;
pub mod organization;

use std::sync::Mutex;
use tauri::Manager;
use commands::AppState;
use db::Database;
use storage::StorageManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Resolve Documents/MetaCognitionNotebook directory
            let doc_dir = app.path().document_dir().unwrap_or_else(|_| {
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
            });
            let library_root = doc_dir.join("MetaCognitionNotebook");

            // Initialize storage directory structure safely
            let storage = StorageManager::new(&library_root);
            if let Err(e) = storage.initialize() {
                eprintln!("Warning: Failed to initialize storage library: {}", e);
            }

            // Resolve AppData/Local/<identifier>/metadata.db
            let local_data_dir = app.path().app_local_data_dir().unwrap_or_else(|_| {
                library_root.join(".data")
            });
            std::fs::create_dir_all(&local_data_dir).ok();
            let db_path = local_data_dir.join("metadata.db");

            // Open / Migrate SQLite database
            let db = Database::open(&db_path).expect("Failed to open SQLite database");

            app.manage(AppState {
                db: Mutex::new(db),
                storage,
                db_path,
            });

            // Reindex initially to make sure files on disk and SQLite are synchronized
            let state = app.state::<AppState>();
            let _ = commands::reindex_library(state);

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Ensure process terminates cleanly when the window is destroyed
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
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
            commands::exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
