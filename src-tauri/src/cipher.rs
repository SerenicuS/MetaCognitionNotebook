use crate::commands::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::State;

const MAX_KEY_FILE_BYTES: u64 = 10 * 1024 * 1024; // 10 MB
const MAX_KEY_MAPPINGS: usize = 50_000;
const MAX_PHRASE_LEN: usize = 1_000;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct CipherMapping {
    pub original: String,
    pub replacement: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct CipherSubstitutionSpan {
    pub original: String,
    pub replacement: String,
    pub start: usize,
    pub end: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct CipherManifest {
    pub version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dictionary_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dictionary_name: Option<String>,
    pub created_at: String,
    pub substitutions: Vec<CipherSubstitutionSpan>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CipherDictionary {
    pub version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub algorithm_version: Option<String>,
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub committed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub word_count: Option<usize>,
    pub created_at: String,
    pub updated_at: String,
    pub mappings: Vec<CipherMapping>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest: Option<CipherManifest>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encoded_fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub associated_poem_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub associated_poem_titles: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vocabulary_pool_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VocabularyPoolInfo {
    pub id: String,
    pub name: String,
    pub word_count: usize,
    pub is_bundled: bool,
}

struct SimpleRng {
    state: u64,
}

impl SimpleRng {
    fn new() -> Self {
        use std::time::{SystemTime, UNIX_EPOCH};
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x853c49e6748fea9b);
        SimpleRng {
            state: if seed == 0 { 0x853c49e6748fea9b } else { seed },
        }
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        x
    }

    fn gen_range(&mut self, upper: usize) -> usize {
        if upper == 0 {
            return 0;
        }
        (self.next_u64() % (upper as u64)) as usize
    }
}

fn resolve_bundled_vocabulary_path() -> Option<std::path::PathBuf> {
    let candidates = [
        "resources/dictionaries/random_words.txt",
        "resources/dictionary/random_words.txt",
        "../resources/dictionaries/random_words.txt",
        "../resources/dictionary/random_words.txt",
        "../../resources/dictionaries/random_words.txt",
    ];
    for c in &candidates {
        let p = std::path::PathBuf::from(c);
        if p.is_file() {
            return Some(p);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let p1 = exe_dir.join("resources").join("dictionaries").join("random_words.txt");
            if p1.is_file() {
                return Some(p1);
            }
            let p2 = exe_dir.join("resources").join("dictionary").join("random_words.txt");
            if p2.is_file() {
                return Some(p2);
            }
        }
    }
    None
}

fn dictionaries_dir(root: &Path) -> std::path::PathBuf {
    root.join("Dictionaries")
}

fn vocabulary_dir(root: &Path) -> std::path::PathBuf {
    root.join("Vocabulary")
}

pub fn validate_cipher_key_struct(dict: &mut CipherDictionary) -> Result<(), String> {
    if dict.version != 1 {
        return Err(format!(
            "Unsupported Cipher Key version: {}. Expected version 1.",
            dict.version
        ));
    }
    if let Some(ref alg) = dict.algorithm_version {
        if alg != "1.0" {
            return Err(format!(
                "Unsupported Cipher Key algorithm version: {}. Expected version 1.0.",
                alg
            ));
        }
    } else {
        dict.algorithm_version = Some("1.0".into());
    }

    if dict.id.trim().is_empty() {
        return Err("Cipher Key id cannot be empty.".into());
    }
    if dict.id.len() > 256 {
        return Err("Cipher Key id exceeds maximum length of 256 characters.".into());
    }
    if dict.name.trim().is_empty() {
        return Err("Cipher Key name cannot be empty.".into());
    }
    if dict.name.len() > 512 {
        return Err("Cipher Key name exceeds maximum length of 512 characters.".into());
    }

    if let Some(ref mode) = dict.mode {
        if mode != "quick" && mode != "random" && mode != "manual" {
            return Err(format!(
                "Invalid Cipher Key mode: '{}'. Expected quick, random, or manual.",
                mode
            ));
        }
    } else {
        dict.mode = Some("manual".into());
    }

    if dict.mappings.len() > MAX_KEY_MAPPINGS {
        return Err(format!(
            "Cipher Key exceeds maximum mapping limit ({} > {}).",
            dict.mappings.len(),
            MAX_KEY_MAPPINGS
        ));
    }

    let mut seen_originals: HashMap<String, String> = HashMap::new();
    for (idx, m) in dict.mappings.iter_mut().enumerate() {
        m.original = m.original.trim().to_string();
        m.replacement = m.replacement.trim().to_string();
        if m.original.len() > MAX_PHRASE_LEN || m.replacement.len() > MAX_PHRASE_LEN {
            return Err(format!(
                "Mapping at index {} exceeds maximum phrase length of {} characters.",
                idx, MAX_PHRASE_LEN
            ));
        }
        if m.original.contains('\0') || m.replacement.contains('\0') {
            return Err(format!("Mapping at index {} contains null bytes.", idx));
        }
        if !m.original.is_empty() {
            let norm_orig = m
                .original
                .to_lowercase()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            if let Some(prev_repl) = seen_originals.get(&norm_orig) {
                if prev_repl.to_lowercase() != m.replacement.to_lowercase() {
                    return Err(format!(
                        "Corrupted Cipher Key: Duplicate original entry '{}' mapped to conflicting replacements ('{}' and '{}').",
                        m.original, prev_repl, m.replacement
                    ));
                }
            } else {
                seen_originals.insert(norm_orig, m.replacement.clone());
            }
        }
    }

    if let Some(ref manifest) = dict.manifest {
        if manifest.version != 1 {
            return Err(format!(
                "Unsupported Cipher Key manifest version: {}. Expected version 1.",
                manifest.version
            ));
        }
        for (idx, span) in manifest.substitutions.iter().enumerate() {
            if span.end < span.start {
                return Err(format!(
                    "Invalid manifest substitution span at index {}: end < start.",
                    idx
                ));
            }
        }
    }

    if dict.committed.is_none() {
        dict.committed = Some(true);
    }
    dict.word_count = Some(dict.mappings.len());

    Ok(())
}

/// Inspect saved documents in the database to find any poems referencing `key_id`.
pub fn find_referencing_poems_impl(state: &AppState, key_id: &str) -> Result<Vec<(String, String)>, String> {
    let mut referencing = Vec::new();
    if let Ok(db) = state.db.lock() {
        if let Ok(docs) = db.list_documents(None, None) {
            for doc in docs {
                if let Some(ref meta_raw) = doc.metadata_json {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(meta_raw) {
                        if let Some(cipher_obj) = val.get("cipher") {
                            let matches_key = cipher_obj
                                .get("key_id")
                                .and_then(|v| v.as_str())
                                .is_some_and(|s| s == key_id);
                            let matches_dict = cipher_obj
                                .get("dictionary_id")
                                .and_then(|v| v.as_str())
                                .is_some_and(|s| s == key_id);
                            if matches_key || matches_dict {
                                referencing.push((doc.id.clone(), doc.title.clone()));
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(referencing)
}

pub fn list_dictionaries_impl(state: &AppState) -> Result<Vec<CipherDictionary>, String> {
    let dir = dictionaries_dir(state.storage.get_root());
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        return Ok(vec![]);
    }

    let mut by_id: HashMap<String, CipherDictionary> = HashMap::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file()
            && path
                .extension()
                .is_some_and(|e| e == "json" || e == "mckey")
        {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(mut dict) = serde_json::from_str::<CipherDictionary>(&content) {
                    let _ = validate_cipher_key_struct(&mut dict);
                    // Prefer .mckey over .json if both exist
                    let is_mckey = path.extension().is_some_and(|e| e == "mckey");
                    if is_mckey || !by_id.contains_key(&dict.id) {
                        by_id.insert(dict.id.clone(), dict);
                    }
                }
            }
        }
    }

    // Populate associated_poem_ids & titles dynamically from DB references as well
    if let Ok(db) = state.db.lock() {
        if let Ok(docs) = db.list_documents(None, None) {
            for doc in docs {
                if let Some(ref meta_raw) = doc.metadata_json {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(meta_raw) {
                        if let Some(cipher_obj) = val.get("cipher") {
                            let ref_id = cipher_obj
                                .get("key_id")
                                .and_then(|v| v.as_str())
                                .or_else(|| cipher_obj.get("dictionary_id").and_then(|v| v.as_str()));
                            if let Some(kid) = ref_id {
                                if let Some(entry) = by_id.get_mut(kid) {
                                    let ids = entry.associated_poem_ids.get_or_insert_with(Vec::new);
                                    if !ids.contains(&doc.id) {
                                        ids.push(doc.id.clone());
                                    }
                                    let titles =
                                        entry.associated_poem_titles.get_or_insert_with(Vec::new);
                                    if !titles.contains(&doc.title) {
                                        titles.push(doc.title.clone());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut list: Vec<CipherDictionary> = by_id.into_values().collect();
    list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(list)
}

pub fn get_dictionary_impl(state: &AppState, id: String) -> Result<CipherDictionary, String> {
    let list = list_dictionaries_impl(state)?;
    list.into_iter()
        .find(|d| d.id == id)
        .ok_or_else(|| format!("Cipher Key not found: {}", id))
}

pub fn save_dictionary_impl(
    state: &AppState,
    mut dictionary: CipherDictionary,
) -> Result<CipherDictionary, String> {
    validate_cipher_key_struct(&mut dictionary)?;

    let dir = dictionaries_dir(state.storage.get_root());
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let sanitized_id = crate::storage::StorageManager::sanitize_filename(&dictionary.id);
    // Persist as .json in library/Dictionaries for backward compatibility with Vault and existing tooling,
    // and remove any duplicate .mckey file in the internal directory if present.
    let json_path = dir.join(format!("{}.json", sanitized_id));
    let mckey_path = dir.join(format!("{}.mckey", sanitized_id));
    if mckey_path.exists() {
        let _ = fs::remove_file(&mckey_path);
    }

    let json_bytes = serde_json::to_vec_pretty(&dictionary).map_err(|e| e.to_string())?;
    fs::write(&json_path, json_bytes).map_err(|e| e.to_string())?;

    Ok(dictionary)
}

pub fn delete_dictionary_impl(
    state: &AppState,
    id: String,
    force: Option<bool>,
) -> Result<(), String> {
    let is_forced = force.unwrap_or(false);
    if !is_forced {
        let referencing = find_referencing_poems_impl(state, &id)?;
        if !referencing.is_empty() {
            let titles: Vec<String> = referencing
                .into_iter()
                .map(|(_, title)| format!("\"{}\"", title))
                .collect();
            return Err(format!(
                "Cannot delete Cipher Key '{}': it is referenced by saved ciphered poem(s): {}. Deleting this key may make those poems impossible to decode.",
                id,
                titles.join(", ")
            ));
        }
    }

    let dir = dictionaries_dir(state.storage.get_root());
    if !dir.exists() {
        return Ok(());
    }

    let sanitized_id = crate::storage::StorageManager::sanitize_filename(&id);
    for ext in ["json", "mckey"] {
        let file_path = dir.join(format!("{}.{}", sanitized_id, ext));
        if file_path.exists() {
            fs::remove_file(&file_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn export_dictionary_impl(
    state: &AppState,
    id: String,
    target_path: String,
) -> Result<(), String> {
    let dict = get_dictionary_impl(state, id)?;
    let json_bytes = serde_json::to_vec_pretty(&dict).map_err(|e| e.to_string())?;
    // Default to .mckey if no extension was provided
    let out_path = if !target_path.ends_with(".mckey") && !target_path.ends_with(".json") {
        format!("{}.mckey", target_path)
    } else {
        target_path
    };
    fs::write(Path::new(&out_path), json_bytes).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn import_dictionary_impl(
    state: &AppState,
    source_path: String,
) -> Result<CipherDictionary, String> {
    let path = Path::new(&source_path);
    let metadata = fs::metadata(path).map_err(|e| format!("Failed to read Cipher Key file: {}", e))?;
    if metadata.len() > MAX_KEY_FILE_BYTES {
        return Err(format!(
            "Cipher Key file exceeds maximum size limit ({} bytes > {} bytes).",
            metadata.len(),
            MAX_KEY_FILE_BYTES
        ));
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut dict: CipherDictionary =
        serde_json::from_str(&content).map_err(|e| format!("Invalid Cipher Key JSON: {}", e))?;

    if dict.id.trim().is_empty() {
        dict.id = format!("key-{}", uuid::Uuid::new_v4());
    }
    dict.committed = Some(true);
    dict.updated_at = chrono::Utc::now().to_rfc3339();
    validate_cipher_key_struct(&mut dict)?;
    save_dictionary_impl(state, dict)
}

pub fn list_vocabulary_pools_impl(state: &AppState) -> Result<Vec<VocabularyPoolInfo>, String> {
    let mut pools = Vec::new();

    if let Some(_bundled_path) = resolve_bundled_vocabulary_path() {
        pools.push(VocabularyPoolInfo {
            id: "bundled-english".into(),
            name: "Bundled English (370k words)".into(),
            word_count: 370_106,
            is_bundled: true,
        });
    }

    let dir = vocabulary_dir(state.storage.get_root());
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    if dir.exists() {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().is_some_and(|e| e == "txt") {
                    let file_name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or_default()
                        .to_string();
                    let file_stem = path
                        .file_stem()
                        .and_then(|n| n.to_str())
                        .unwrap_or_default()
                        .to_string();
                    let line_count = if let Ok(file) = fs::File::open(&path) {
                        use std::io::BufRead;
                        std::io::BufReader::new(file).lines().count()
                    } else {
                        0
                    };
                    pools.push(VocabularyPoolInfo {
                        id: file_name,
                        name: file_stem,
                        word_count: line_count,
                        is_bundled: false,
                    });
                }
            }
        }
    }

    Ok(pools)
}

pub fn get_vocabulary_sample_impl(
    state: &AppState,
    pool_id: Option<String>,
    count: usize,
    exclude_words: Vec<String>,
) -> Result<Vec<String>, String> {
    if count == 0 {
        return Ok(vec![]);
    }

    let target_pool = pool_id.as_deref().unwrap_or("bundled-english");
    let file_path = if target_pool == "bundled-english" {
        resolve_bundled_vocabulary_path()
            .ok_or_else(|| "Bundled vocabulary file not found.".to_string())?
    } else {
        let dir = vocabulary_dir(state.storage.get_root());
        let candidate = dir.join(target_pool);
        if candidate.is_file() {
            candidate
        } else {
            let with_txt = dir.join(format!("{}.txt", target_pool));
            if with_txt.is_file() {
                with_txt
            } else {
                return Err(format!("Vocabulary pool not found: {}", target_pool));
            }
        }
    };

    let file = fs::File::open(&file_path).map_err(|e| e.to_string())?;
    use std::io::BufRead;
    let reader = std::io::BufReader::new(file);

    let exclude_set: std::collections::HashSet<String> = exclude_words
        .into_iter()
        .map(|w| w.trim().to_lowercase())
        .collect();

    let mut eligible_words: Vec<String> = Vec::new();
    for line in reader.lines().map_while(Result::ok) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !exclude_set.contains(&trimmed.to_lowercase()) {
            eligible_words.push(trimmed.to_string());
        }
    }

    if eligible_words.len() < count {
        return Err(format!(
            "Insufficient vocabulary in pool: required {}, but only {} eligible words available.",
            count,
            eligible_words.len()
        ));
    }

    let mut rng = SimpleRng::new();
    let n = eligible_words.len();
    for i in 0..count {
        let j = i + rng.gen_range(n - i);
        eligible_words.swap(i, j);
    }

    eligible_words.truncate(count);
    Ok(eligible_words)
}

pub fn import_vocabulary_pool_impl(
    state: &AppState,
    name: String,
    content: String,
) -> Result<VocabularyPoolInfo, String> {
    let clean_name = name.trim().trim_end_matches(".txt");
    if clean_name.is_empty() {
        return Err("Vocabulary pool name cannot be empty.".into());
    }

    let sanitized = crate::storage::StorageManager::sanitize_filename(clean_name);
    let dir = vocabulary_dir(state.storage.get_root());
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let filename = format!("{}.txt", sanitized);
    let file_path = dir.join(&filename);
    fs::write(&file_path, &content).map_err(|e| e.to_string())?;

    let line_count = content.lines().filter(|l| !l.trim().is_empty()).count();

    Ok(VocabularyPoolInfo {
        id: filename,
        name: clean_name.to_string(),
        word_count: line_count,
        is_bundled: false,
    })
}

pub fn delete_vocabulary_pool_impl(state: &AppState, pool_id: String) -> Result<(), String> {
    if pool_id == "bundled-english" {
        return Err("Cannot delete bundled vocabulary pool.".into());
    }
    let dir = vocabulary_dir(state.storage.get_root());
    let file_path = dir.join(&pool_id);
    if file_path.exists() && file_path.is_file() {
        fs::remove_file(file_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ============================================================================
// IPC Handlers
// ============================================================================

#[tauri::command]
pub fn cipher_list_dictionaries(state: State<'_, AppState>) -> Result<Vec<CipherDictionary>, String> {
    list_dictionaries_impl(state.inner())
}

#[tauri::command]
pub fn cipher_get_dictionary(state: State<'_, AppState>, id: String) -> Result<CipherDictionary, String> {
    get_dictionary_impl(state.inner(), id)
}

#[tauri::command]
pub fn cipher_save_dictionary(
    state: State<'_, AppState>,
    dictionary: CipherDictionary,
) -> Result<CipherDictionary, String> {
    save_dictionary_impl(state.inner(), dictionary)
}

#[tauri::command]
pub fn cipher_delete_dictionary(
    state: State<'_, AppState>,
    id: String,
    force: Option<bool>,
) -> Result<(), String> {
    delete_dictionary_impl(state.inner(), id, force)
}

#[tauri::command]
pub fn cipher_export_dictionary(
    state: State<'_, AppState>,
    id: String,
    target_path: String,
) -> Result<(), String> {
    export_dictionary_impl(state.inner(), id, target_path)
}

#[tauri::command]
pub fn cipher_import_dictionary(
    state: State<'_, AppState>,
    source_path: String,
) -> Result<CipherDictionary, String> {
    import_dictionary_impl(state.inner(), source_path)
}

#[tauri::command]
pub fn cipher_list_vocabulary_pools(
    state: State<'_, AppState>,
) -> Result<Vec<VocabularyPoolInfo>, String> {
    list_vocabulary_pools_impl(state.inner())
}

#[tauri::command]
pub fn cipher_get_vocabulary_sample(
    state: State<'_, AppState>,
    pool_id: Option<String>,
    count: usize,
    exclude_words: Vec<String>,
) -> Result<Vec<String>, String> {
    get_vocabulary_sample_impl(state.inner(), pool_id, count, exclude_words)
}

#[tauri::command]
pub fn cipher_import_vocabulary_pool(
    state: State<'_, AppState>,
    name: String,
    content: String,
) -> Result<VocabularyPoolInfo, String> {
    import_vocabulary_pool_impl(state.inner(), name, content)
}

#[tauri::command]
pub fn cipher_delete_vocabulary_pool(
    state: State<'_, AppState>,
    pool_id: String,
) -> Result<(), String> {
    delete_vocabulary_pool_impl(state.inner(), pool_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use crate::db::Database;
    use crate::storage::StorageManager;

    fn create_test_state() -> (tempfile::TempDir, AppState) {
        let temp_dir = tempfile::tempdir().expect("tempdir failed");
        let storage = StorageManager::new(temp_dir.path());
        storage.initialize().expect("init storage failed");
        let db = Database::open_in_memory().expect("open db failed");
        let db_path = temp_dir.path().join("test.db");
        (
            temp_dir,
            AppState {
                db: Mutex::new(db),
                storage,
                db_path,
            },
        )
    }

    fn make_sample_key(id: &str, name: &str) -> CipherDictionary {
        CipherDictionary {
            version: 1,
            algorithm_version: Some("1.0".into()),
            id: id.into(),
            name: name.into(),
            description: Some("Sample key".into()),
            mode: Some("quick".into()),
            committed: Some(true),
            word_count: Some(2),
            created_at: "2026-10-18T10:00:00Z".into(),
            updated_at: "2026-10-18T10:00:00Z".into(),
            mappings: vec![
                CipherMapping {
                    original: "heart".into(),
                    replacement: "rhizome".into(),
                },
                CipherMapping {
                    original: "dark night".into(),
                    replacement: "gilded sunrise".into(),
                },
            ],
            manifest: Some(CipherManifest {
                version: 1,
                dictionary_id: Some(id.into()),
                dictionary_name: Some(name.into()),
                created_at: "2026-10-18T10:00:00Z".into(),
                substitutions: vec![CipherSubstitutionSpan {
                    original: "Heart".into(),
                    replacement: "Rhizome".into(),
                    start: 0,
                    end: 7,
                }],
            }),
            source_fingerprint: Some("mcfp1:5:11111111222222223333333344444444".into()),
            encoded_fingerprint: Some("mcfp1:7:aaaaaaaabbbbbbbbccccccccdddddddd".into()),
            associated_poem_ids: None,
            associated_poem_titles: None,
            vocabulary_pool_id: None,
        }
    }

    #[test]
    fn test_cipher_dictionary_crud() {
        let (_dir, state) = create_test_state();

        // 1. Initial list should be empty
        let initial = list_dictionaries_impl(&state).unwrap();
        assert_eq!(initial.len(), 0);

        // 2. Save a new key with manifest and fingerprints
        let dict = make_sample_key("dict-botanical", "Botanical Surrealism");
        let saved = save_dictionary_impl(&state, dict.clone()).unwrap();
        assert_eq!(saved.id, "dict-botanical");
        assert_eq!(saved.mappings.len(), 2);
        assert_eq!(saved.algorithm_version.as_deref(), Some("1.0"));
        assert!(saved.manifest.is_some());

        // 3. List should return 1 dictionary
        let list = list_dictionaries_impl(&state).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Botanical Surrealism");

        // 4. Retrieve by id
        let fetched = get_dictionary_impl(&state, "dict-botanical".into()).unwrap();
        assert_eq!(fetched.name, "Botanical Surrealism");
        assert_eq!(fetched.mappings[0].original, "heart");
        assert_eq!(
            fetched.source_fingerprint.as_deref(),
            Some("mcfp1:5:11111111222222223333333344444444")
        );

        // 5. Delete unreferenced dictionary
        delete_dictionary_impl(&state, "dict-botanical".into(), None).unwrap();
        let after_delete = list_dictionaries_impl(&state).unwrap();
        assert_eq!(after_delete.len(), 0);
    }

    #[test]
    fn test_cipher_mckey_import_export_and_validation() {
        let (dir, state) = create_test_state();

        let dict = make_sample_key("key-astral-92", "Quick Cipher Key — Astral Drift");
        save_dictionary_impl(&state, dict).unwrap();

        let export_file = dir.path().join("astral_exported.mckey");
        export_dictionary_impl(
            &state,
            "key-astral-92".into(),
            export_file.to_string_lossy().to_string(),
        )
        .unwrap();
        assert!(export_file.exists());

        // Delete from state
        delete_dictionary_impl(&state, "key-astral-92".into(), None).unwrap();
        assert_eq!(list_dictionaries_impl(&state).unwrap().len(), 0);

        // Import back from .mckey
        let imported = import_dictionary_impl(
            &state,
            export_file.to_string_lossy().to_string(),
        )
        .unwrap();
        assert_eq!(imported.id, "key-astral-92");
        assert_eq!(imported.name, "Quick Cipher Key — Astral Drift");
        assert_eq!(imported.mappings[0].replacement, "rhizome");
        assert!(imported.manifest.is_some());

        // Reject incompatible version
        let mut bad_version = imported.clone();
        bad_version.version = 99;
        assert!(save_dictionary_impl(&state, bad_version).is_err());

        // Reject duplicate conflicting original entries
        let mut bad_dup = imported.clone();
        bad_dup.mappings.push(CipherMapping {
            original: "heart".into(),
            replacement: "stone".into(),
        });
        let dup_err = save_dictionary_impl(&state, bad_dup).unwrap_err();
        assert!(dup_err.contains("Duplicate original entry"));
    }

    #[test]
    fn test_referenced_cipher_key_deletion_protection() {
        let (_dir, state) = create_test_state();

        let key = make_sample_key("key-protected-1", "Protected Poem Key");
        save_dictionary_impl(&state, key).unwrap();

        // Create a ciphered poem referencing key-protected-1
        let meta_json = serde_json::json!({
            "poetic_form": "Free Verse",
            "cipher": {
                "key_id": "key-protected-1",
                "dictionary_id": "key-protected-1",
                "mode": "quick"
            }
        })
        .to_string();

        crate::commands::create_document_impl(
            &state,
            "poetry".into(),
            "Midnight Ciphered".into(),
            None,
            Some("Rhizome in the gilded sunrise.".into()),
            Some(meta_json),
            None,
            None,
        )
        .unwrap();

        // Verify list_dictionaries populates associated_poem_titles
        let listed = list_dictionaries_impl(&state).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(
            listed[0].associated_poem_titles.as_ref().unwrap(),
            &vec!["Midnight Ciphered".to_string()]
        );

        // Ordinary deletion (force = None / Some(false)) must be blocked!
        let del_err = delete_dictionary_impl(&state, "key-protected-1".into(), Some(false))
            .unwrap_err();
        assert!(del_err.contains("Midnight Ciphered"));
        assert!(del_err.contains("impossible to decode"));

        // Key must still exist
        assert_eq!(list_dictionaries_impl(&state).unwrap().len(), 1);

        // Force deletion (force = Some(true)) succeeds
        delete_dictionary_impl(&state, "key-protected-1".into(), Some(true)).unwrap();
        assert_eq!(list_dictionaries_impl(&state).unwrap().len(), 0);
    }

    #[test]
    fn test_vocabulary_pool_crud_and_sampling() {
        let (_dir, state) = create_test_state();

        // 1. Initial list may contain bundled-english if repository resources exist
        let initial_pools = list_vocabulary_pools_impl(&state).unwrap();
        let _bundled_present = initial_pools.iter().any(|p| p.id == "bundled-english");

        // 2. Import a custom vocabulary pool
        let flora_content = "chlorophyll\nrhizome\nspore\nmycelium\nlichen\n";
        let imported_pool = import_vocabulary_pool_impl(
            &state,
            "Surreal Flora".into(),
            flora_content.into(),
        )
        .unwrap();

        assert_eq!(imported_pool.name, "Surreal Flora");
        assert_eq!(imported_pool.word_count, 5);
        assert!(!imported_pool.is_bundled);

        // 3. Verify it is listed
        let pools_after = list_vocabulary_pools_impl(&state).unwrap();
        assert!(pools_after.iter().any(|p| p.id == imported_pool.id));

        // 4. Sample words with exclusions
        let sample = get_vocabulary_sample_impl(
            &state,
            Some(imported_pool.id.clone()),
            3,
            vec!["spore".into(), "lichen".into()],
        )
        .unwrap();
        assert_eq!(sample.len(), 3);
        assert!(!sample.contains(&"spore".to_string()));
        assert!(!sample.contains(&"lichen".to_string()));

        // 5. Sampling more words than eligible fails cleanly
        let err = get_vocabulary_sample_impl(
            &state,
            Some(imported_pool.id.clone()),
            10,
            vec![],
        );
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("Insufficient vocabulary"));

        // 6. Cannot delete bundled pool
        let del_bundled = delete_vocabulary_pool_impl(&state, "bundled-english".into());
        assert!(del_bundled.is_err());

        // 7. Delete custom pool
        delete_vocabulary_pool_impl(&state, imported_pool.id.clone()).unwrap();
        let pools_final = list_vocabulary_pools_impl(&state).unwrap();
        assert!(!pools_final.iter().any(|p| p.id == imported_pool.id));
    }
}

