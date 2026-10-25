use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Supported audio file extensions (lowercase without dot)
pub const SUPPORTED_AUDIO_EXTENSIONS: &[&str] = &["mp3", "wav", "ogg", "flac", "m4a", "aac"];

/// Audio track metadata representation
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AudioTrack {
    pub id: String,
    pub title: String,
    pub category: String,
    pub category_label: String,
    pub filename: String,
    pub relative_path: String,
    pub format: String,
}

/// Derives a clean, readable track title from a raw filename.
/// Strips leading numbers (e.g. "01 - ", "1. ", "02_") and replaces underscores with spaces,
/// while fully preserving Unicode and case.
pub fn sanitize_track_title(raw_stem: &str) -> String {
    let mut title = raw_stem.trim();

    // Strip leading track numbering patterns (e.g. "01 - ", "01. ", "01 ", "01_")
    if let Some(rest) = title.strip_prefix(|c: char| c.is_ascii_digit()) {
        let mut remainder = rest;
        while let Some(r) = remainder.strip_prefix(|c: char| c.is_ascii_digit()) {
            remainder = r;
        }
        let trimmed_leading = remainder
            .trim_start_matches(|c: char| c == '-' || c == '.' || c == '_' || c == ' ');
        if !trimmed_leading.is_empty() {
            title = trimmed_leading;
        }
    }

    // Replace underscores with spaces for cleaner reading
    let cleaned = title.replace('_', " ");
    let final_title = cleaned.trim();
    if final_title.is_empty() {
        "Untitled Track".to_string()
    } else {
        final_title.to_string()
    }
}

/// Resolves a user-friendly label for a music category folder.
pub fn get_category_label(cat: &str) -> String {
    match cat.to_lowercase().as_str() {
        "lofi" | "lo-fi" => "Lo-Fi".to_string(),
        "medieval" => "Medieval".to_string(),
        "scifi" | "sci-fi" => "Sci-Fi".to_string(),
        "ambient" => "Ambient".to_string(),
        "classical" => "Classical".to_string(),
        "fantasy" => "Fantasy".to_string(),
        "general" | "other" | "" => "General".to_string(),
        other => {
            // Capitalize first letter of arbitrary category folder
            let mut chars = other.chars();
            match chars.next() {
                None => "General".to_string(),
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            }
        }
    }
}

/// Normalizes category identifier (e.g. "lo-fi" -> "lofi", "sci-fi" -> "scifi")
pub fn normalize_category(cat: &str) -> String {
    match cat.to_lowercase().replace('-', "").as_str() {
        "lofi" => "lofi".to_string(),
        "medieval" => "medieval".to_string(),
        "scifi" => "scifi".to_string(),
        other => {
            if other.is_empty() {
                "general".to_string()
            } else {
                other.to_string()
            }
        }
    }
}

/// Resolves and ensures the application-managed Music directory exists.
pub fn resolve_music_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let local_data = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let music_dir = local_data.join("Music");
    ensure_music_subfolders(&music_dir)?;
    Ok(music_dir)
}

/// Creates default category subfolders (`lofi`, `medieval`, `scifi`) if they don't exist.
pub fn ensure_music_subfolders(music_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(music_dir).map_err(|e| format!("Failed to create Music directory: {}", e))?;
    fs::create_dir_all(music_dir.join("lofi")).map_err(|e| format!("Failed to create lofi directory: {}", e))?;
    fs::create_dir_all(music_dir.join("medieval")).map_err(|e| format!("Failed to create medieval directory: {}", e))?;
    fs::create_dir_all(music_dir.join("scifi")).map_err(|e| format!("Failed to create scifi directory: {}", e))?;
    Ok(())
}

/// Validates that a requested relative path does not escape the canonical music directory.
pub fn validate_and_resolve_audio_path(music_root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    // 1. Guard against obvious path traversal markers in the relative string
    if relative_path.contains("..") || relative_path.contains(':') || relative_path.starts_with('/') || relative_path.starts_with('\\') {
        return Err("Access denied: invalid relative audio path".to_string());
    }

    let target_path = music_root.join(relative_path);

    // 2. Canonicalize music root (fallback to raw if not canonicalizable)
    let canonical_root = music_root.canonicalize().unwrap_or_else(|_| music_root.to_path_buf());
    let canonical_target = target_path
        .canonicalize()
        .map_err(|e| format!("Audio track file not found: {}", e))?;

    // 3. Strict prefix validation: target must be within canonical_root
    if !canonical_target.starts_with(&canonical_root) {
        return Err("Access denied: path traversal detected outside Music directory".to_string());
    }

    Ok(canonical_target)
}

/// Recursively or folder-wise scans a directory for supported audio files.
pub fn scan_music_directory(music_root: &Path) -> Result<Vec<AudioTrack>, String> {
    let mut tracks = Vec::new();
    if !music_root.exists() {
        return Ok(tracks);
    }

    // 1. Scan root folder for any loose tracks
    if let Ok(entries) = fs::read_dir(music_root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(track) = process_audio_file(&path, music_root, "general") {
                    tracks.push(track);
                }
            } else if path.is_dir() {
                // Category subfolder (e.g. lofi, medieval, scifi)
                let cat_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                if let Ok(sub_entries) = fs::read_dir(&path) {
                    for sub_entry in sub_entries.flatten() {
                        let sub_path = sub_entry.path();
                        if sub_path.is_file() {
                            if let Some(track) = process_audio_file(&sub_path, music_root, &cat_name) {
                                tracks.push(track);
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort tracks by category then by title
    tracks.sort_by(|a, b| {
        let cat_cmp = a.category.cmp(&b.category);
        if cat_cmp != std::cmp::Ordering::Equal {
            cat_cmp
        } else {
            a.title.to_lowercase().cmp(&b.title.to_lowercase())
        }
    });

    Ok(tracks)
}

fn process_audio_file(file_path: &Path, music_root: &Path, category_dir: &str) -> Option<AudioTrack> {
    let ext = file_path.extension()?.to_str()?.to_lowercase();
    if !SUPPORTED_AUDIO_EXTENSIONS.contains(&ext.as_str()) {
        return Option::None;
    }

    let filename = file_path.file_name()?.to_str()?.to_string();
    let stem = file_path.file_stem()?.to_str()?;
    let title = sanitize_track_title(stem);

    let rel_path = file_path.strip_prefix(music_root).ok()?.to_string_lossy().replace('\\', "/");
    let norm_cat = normalize_category(category_dir);
    let cat_label = get_category_label(&norm_cat);

    Some(AudioTrack {
        id: rel_path.clone(),
        title,
        category: norm_cat,
        category_label: cat_label,
        filename,
        relative_path: rel_path,
        format: ext,
    })
}

// -----------------------------------------------------------------------------
// TAURI COMMANDS
// -----------------------------------------------------------------------------

/// Discovers and returns all available audio tracks grouped into categories.
#[tauri::command]
pub async fn music_list_tracks(app: tauri::AppHandle) -> Result<Vec<AudioTrack>, String> {
    let music_dir = resolve_music_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || scan_music_directory(&music_dir))
        .await
        .map_err(|e| format!("Task execution failed: {}", e))?
}

/// Safely loads raw audio bytes for a specific relative track path.
#[tauri::command]
pub async fn music_get_track_bytes(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<Vec<u8>, String> {
    let music_dir = resolve_music_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let resolved_file = validate_and_resolve_audio_path(&music_dir, &relative_path)?;
        fs::read(&resolved_file).map_err(|e| format!("Failed to read audio file: {}", e))
    })
    .await
    .map_err(|e| format!("Task execution failed: {}", e))?
}

/// Opens the application-managed Music directory in the system file explorer.
#[tauri::command]
pub async fn music_open_folder(app: tauri::AppHandle) -> Result<(), String> {
    let music_dir = resolve_music_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            std::process::Command::new("explorer.exe")
                .arg(&music_dir)
                .spawn()
                .map_err(|e| format!("Failed to open Explorer: {}", e))?;
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(&music_dir)
                .spawn()
                .map_err(|e| format!("Failed to open Finder: {}", e))?;
        }
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            std::process::Command::new("xdg-open")
                .arg(&music_dir)
                .spawn()
                .map_err(|e| format!("Failed to open file manager: {}", e))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Task execution failed: {}", e))?
}

// -----------------------------------------------------------------------------
// TESTS
// -----------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_track_title() {
        assert_eq!(sanitize_track_title("01 - Lofi Rain Session"), "Lofi Rain Session");
        assert_eq!(sanitize_track_title("02. Medieval_Tavern_Lute"), "Medieval Tavern Lute");
        assert_eq!(sanitize_track_title("3_Cyberpunk_Alleyway"), "Cyberpunk Alleyway");
        assert_eq!(sanitize_track_title("12 Cosmic Drift (Synth)"), "Cosmic Drift (Synth)");
        assert_eq!(sanitize_track_title("ambient_forest_stream"), "ambient forest stream");
        assert_eq!(sanitize_track_title("  05 -   Spaceship_Bridge  "), "Spaceship Bridge");
        assert_eq!(sanitize_track_title("夜の雨_lofi_vibes"), "夜の雨 lofi vibes");
        assert_eq!(sanitize_track_title("   "), "Untitled Track");
    }

    #[test]
    fn test_category_normalization_and_labels() {
        assert_eq!(normalize_category("lofi"), "lofi");
        assert_eq!(normalize_category("lo-fi"), "lofi");
        assert_eq!(normalize_category("Lo-Fi"), "lofi");
        assert_eq!(normalize_category("medieval"), "medieval");
        assert_eq!(normalize_category("Medieval"), "medieval");
        assert_eq!(normalize_category("scifi"), "scifi");
        assert_eq!(normalize_category("sci-fi"), "scifi");
        assert_eq!(normalize_category("Sci-Fi"), "scifi");

        assert_eq!(get_category_label("lofi"), "Lo-Fi");
        assert_eq!(get_category_label("medieval"), "Medieval");
        assert_eq!(get_category_label("scifi"), "Sci-Fi");
        assert_eq!(get_category_label("ambient"), "Ambient");
        assert_eq!(get_category_label("general"), "General");
    }

    #[test]
    fn test_path_traversal_prevention() {
        let temp_dir = std::env::temp_dir().join("mc_test_music_traversal");
        let _ = fs::create_dir_all(&temp_dir);
        let valid_file = temp_dir.join("test.mp3");
        let _ = fs::write(&valid_file, b"test audio content");

        // 1. Valid file inside music root
        let res = validate_and_resolve_audio_path(&temp_dir, "test.mp3");
        assert!(res.is_ok(), "Valid file inside music root must succeed");

        // 2. Traversal attempt with ..
        let res_traversal = validate_and_resolve_audio_path(&temp_dir, "../secret.txt");
        assert!(res_traversal.is_err(), "Traversal using .. must be rejected");

        // 3. Absolute path / drive letter attempts
        let res_root = validate_and_resolve_audio_path(&temp_dir, "/etc/passwd");
        assert!(res_root.is_err(), "Leading / must be rejected");

        let res_drive = validate_and_resolve_audio_path(&temp_dir, "C:\\Windows\\system32");
        assert!(res_drive.is_err(), "Drive colon must be rejected");

        // Clean up
        let _ = fs::remove_file(valid_file);
        let _ = fs::remove_dir(temp_dir);
    }

    #[test]
    fn test_scan_music_directory_filters_and_groups() {
        let temp_dir = std::env::temp_dir().join("mc_test_music_scan");
        let lofi_dir = temp_dir.join("lofi");
        let medieval_dir = temp_dir.join("medieval");
        let scifi_dir = temp_dir.join("scifi");
        let _ = fs::create_dir_all(&lofi_dir);
        let _ = fs::create_dir_all(&medieval_dir);
        let _ = fs::create_dir_all(&scifi_dir);

        // Valid files
        let _ = fs::write(lofi_dir.join("01 - Chill Sunset.mp3"), b"mp3 content");
        let _ = fs::write(medieval_dir.join("Celtic_Harp.wav"), b"wav content");
        let _ = fs::write(scifi_dir.join("Hyperdrive_Ambience.flac"), b"flac content");
        // Non-audio file (should be ignored)
        let _ = fs::write(lofi_dir.join("tracklist.txt"), b"ignore me");
        let _ = fs::write(scifi_dir.join("cover.png"), b"image");

        let tracks = scan_music_directory(&temp_dir).expect("Scanning should succeed");
        assert_eq!(tracks.len(), 3, "Only the 3 audio files must be discovered");

        let lofi = tracks.iter().find(|t| t.category == "lofi").expect("Lofi track exists");
        assert_eq!(lofi.title, "Chill Sunset");
        assert_eq!(lofi.format, "mp3");
        assert_eq!(lofi.category_label, "Lo-Fi");

        let medieval = tracks.iter().find(|t| t.category == "medieval").expect("Medieval track exists");
        assert_eq!(medieval.title, "Celtic Harp");
        assert_eq!(medieval.format, "wav");

        let scifi = tracks.iter().find(|t| t.category == "scifi").expect("Sci-fi track exists");
        assert_eq!(scifi.title, "Hyperdrive Ambience");
        assert_eq!(scifi.format, "flac");

        // Clean up
        let _ = fs::remove_dir_all(temp_dir);
    }
    #[test]
    fn test_flowmusic_six_tracks_import_verification() {
        let temp_dir = std::env::temp_dir().join("mc_test_flowmusic_six_tracks");
        let lofi_dir = temp_dir.join("lofi");
        let medieval_dir = temp_dir.join("medieval");
        let scifi_dir = temp_dir.join("scifi");
        let _ = fs::create_dir_all(&lofi_dir);
        let _ = fs::create_dir_all(&medieval_dir);
        let _ = fs::create_dir_all(&scifi_dir);

        // 6 FlowMusic tracks
        let _ = fs::write(lofi_dir.join("Midnight in the Notebook.mp3"), b"lofi-1");
        let _ = fs::write(lofi_dir.join("Thoughts Between Pages.mp3"), b"lofi-2");
        let _ = fs::write(medieval_dir.join("The Scholar's Candle.mp3"), b"medieval-1");
        let _ = fs::write(medieval_dir.join("Beneath the Ancient Stars.mp3"), b"medieval-2");
        let _ = fs::write(scifi_dir.join("Beyond the Virgo Supercluster.mp3"), b"scifi-1");
        let _ = fs::write(scifi_dir.join("Humanity Among the Stars.mp3"), b"scifi-2");

        let tracks = scan_music_directory(&temp_dir).expect("Scanning 6 FlowMusic tracks should succeed");
        assert_eq!(tracks.len(), 6, "Must discover all 6 tracks");

        // Category counts
        let lofi_tracks: Vec<_> = tracks.iter().filter(|t| t.category == "lofi").collect();
        assert_eq!(lofi_tracks.len(), 2);
        assert_eq!(lofi_tracks[0].title, "Midnight in the Notebook");
        assert_eq!(lofi_tracks[1].title, "Thoughts Between Pages");

        let medieval_tracks: Vec<_> = tracks.iter().filter(|t| t.category == "medieval").collect();
        assert_eq!(medieval_tracks.len(), 2);
        assert_eq!(medieval_tracks[0].title, "Beneath the Ancient Stars");
        assert_eq!(medieval_tracks[1].title, "The Scholar's Candle");

        let scifi_tracks: Vec<_> = tracks.iter().filter(|t| t.category == "scifi").collect();
        assert_eq!(scifi_tracks.len(), 2);
        assert_eq!(scifi_tracks[0].title, "Beyond the Virgo Supercluster");
        assert_eq!(scifi_tracks[1].title, "Humanity Among the Stars");

        // Format and relative path verification
        for t in &tracks {
            assert_eq!(t.format, "mp3");
            assert!(validate_and_resolve_audio_path(&temp_dir, &t.relative_path).is_ok());
        }

        let _ = fs::remove_dir_all(temp_dir);
    }
}
