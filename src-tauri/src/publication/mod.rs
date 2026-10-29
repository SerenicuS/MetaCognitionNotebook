pub mod export;
pub mod generator;
pub mod models;
pub mod pdf;
#[cfg(test)]
pub mod tests;

pub use export::{build_preview, publish_markdown_to_file, publish_pdf_to_file};
pub use models::*;

use crate::commands::AppState;

type Result<T> = std::result::Result<T, String>;

#[tauri::command]
pub async fn lorebook_publish_preview(
    app: tauri::AppHandle,
    request: PublicationRequest,
) -> Result<PublicationPreview> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || {
        build_preview(app.state::<AppState>().inner(), request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn lorebook_publish_markdown(
    app: tauri::AppHandle,
    request: PublishMarkdownRequest,
) -> Result<PublishMarkdownResult> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || {
        publish_markdown_to_file(app.state::<AppState>().inner(), request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn lorebook_publish_pdf(
    app: tauri::AppHandle,
    request: PublishPdfRequest,
) -> Result<PublishPdfResult> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || {
        publish_pdf_to_file(app.state::<AppState>().inner(), request)
    })
    .await
    .map_err(|e| e.to_string())?
}
