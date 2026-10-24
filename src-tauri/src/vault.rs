//! Vault format v1: bounded, uncompressed ZIP; canonical files plus a small catalog.
//! Restoration ONLY publishes a new folder. It never replaces the active library.
use crate::{
    commands::AppState,
    db::Database,
    models::{DocumentMetadata, DocumentType},
    storage::StorageManager,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

pub const FORMAT_VERSION: u32 = 1;
pub const MAX_FILES: usize = 10_000;
pub const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_TOTAL_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_MANIFEST: u64 = 4 * 1024 * 1024;
const MAX_CENTRAL: u64 = 16 * 1024 * 1024;
const RESERVE: u64 = 64 * 1024 * 1024;
const MANIFEST: &str = "manifest.json";
const CATALOG: &str = "state/catalog.json";
type Result<T> = std::result::Result<T, String>;
fn err(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Entry {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub format_version: u32,
    pub app_version: String,
    pub created_at: String,
    pub files: Vec<Entry>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Catalog {
    tags: Vec<String>,
    raw_documents: Vec<DocumentMetadata>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Preview {
    pub path: String,
    pub size: u64,
    pub archive_sha256: String,
    pub format_version: u32,
    pub app_version: String,
    pub created_at: String,
    pub document_count: usize,
    pub studios: Vec<String>,
    pub attachment_count: usize,
    pub archived_count: usize,
    pub file_count: usize,
    pub total_bytes: u64,
}
#[derive(Clone, Debug, Serialize)]
pub struct BackupRecord {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub file_date: String,
    pub incomplete: bool,
}
#[derive(Debug, Serialize)]
pub struct History {
    pub folder: String,
    pub backups: Vec<BackupRecord>,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct RestoreResult {
    pub restored_path: String,
    pub document_count: usize,
}

fn is_link(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}
fn plain_file(path: &Path) -> Result<fs::Metadata> {
    let metadata = fs::symlink_metadata(path).map_err(err)?;
    if is_link(&metadata) || !metadata.is_file() {
        return Err(format!("Not a regular file: {}", path.display()));
    }
    Ok(metadata)
}
/// Portable Windows-safe names, also enforced on archives selected on another platform.
pub fn safe_path(name: &str) -> Result<()> {
    if name.len() > 1024 || name.is_empty() || name.contains('\\') {
        return Err("Unsafe archive path".into());
    }
    for part in name.split('/') {
        if part.encode_utf16().count() > 255
            || part.is_empty()
            || part == "."
            || part == ".."
            || part.ends_with(['.', ' '])
            || part
                .chars()
                .any(|c| c.is_control() || "<>:\"|?*".contains(c))
        {
            return Err(format!("Unsafe archive path: {}", name));
        }
        let base = part
            .split('.')
            .next()
            .unwrap_or("")
            .trim_end_matches(' ')
            .to_ascii_uppercase();
        if ["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"].contains(&base.as_str())
            || ((base.starts_with("COM") || base.starts_with("LPT"))
                && matches!(
                    &base[3..],
                    "1" | "2"
                        | "3"
                        | "4"
                        | "5"
                        | "6"
                        | "7"
                        | "8"
                        | "9"
                        | "\u{b9}"
                        | "\u{b2}"
                        | "\u{b3}"
                ))
        {
            return Err(format!("Reserved Windows filename: {}", name));
        }
    }
    Ok(())
}
fn allowed(name: &str) -> bool {
    name == CATALOG
        || name == "library/library.json"
        || [
            "Poetry",
            "Philosophy",
            "Lorebooks",
            "Manuscripts",
            "Attachments",
            "Backups",
            "Dictionaries",
            "Vocabulary",
        ]
        .iter()
        .any(|root| name.starts_with(&format!("library/{}/", root)))
}
fn studio(path: &str) -> Option<DocumentType> {
    if path.starts_with("library/Poetry/") {
        Some(DocumentType::Poetry)
    } else if path.starts_with("library/Philosophy/") {
        Some(DocumentType::Philosophy)
    } else if path.starts_with("library/Lorebooks/") {
        Some(DocumentType::Lorebook)
    } else if path.starts_with("library/Manuscripts/") {
        Some(DocumentType::Manuscript)
    } else {
        None
    }
}
fn digest(reader: &mut impl Read, limit: u64) -> Result<(String, u64)> {
    let mut hasher = Sha256::new();
    let mut count = 0u64;
    let mut buffer = [0u8; 65536];
    loop {
        let n = reader.read(&mut buffer).map_err(err)?;
        if n == 0 {
            break;
        }
        count += n as u64;
        if count > limit {
            return Err("File exceeds the Vault size limit".into());
        }
        hasher.update(&buffer[..n]);
    }
    Ok((format!("{:x}", hasher.finalize()), count))
}
fn file_digest(path: &Path) -> Result<(String, u64)> {
    plain_file(path)?;
    digest(
        &mut File::open(path).map_err(err)?,
        MAX_TOTAL_BYTES + RESERVE,
    )
}
fn bounded_source(path: &Path) -> Result<Vec<u8>> {
    if plain_file(path)?.len() > MAX_FILE_BYTES {
        return Err("Library file exceeds 64 MiB".into());
    }
    let mut bytes = vec![];
    File::open(path)
        .map_err(err)?
        .take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(err)?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("Library file grew beyond 64 MiB".into());
    }
    Ok(bytes)
}
fn bytes_hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn unique_names<'a>(names: impl Iterator<Item = &'a str>) -> Result<()> {
    let mut known = BTreeSet::new();
    for name in names {
        safe_path(name)?;
        let name = name.to_uppercase();
        if !known.insert(name) {
            return Err("Duplicate or case-conflicting archive paths".into());
        }
    }
    for name in &known {
        let mut parent = name.as_str();
        while let Some((prefix, _)) = parent.rsplit_once('/') {
            if known.contains(prefix) {
                return Err("File/directory path conflict".into());
            }
            parent = prefix;
        }
    }
    Ok(())
}

/// Bound central-directory parsing before the ZIP library allocates its entry map.
/// Format v1 excludes ZIP64, multipart archives, comments, encryption and compression.
fn preflight(file: &mut File) -> Result<usize> {
    let size = file.metadata().map_err(err)?.len();
    if !(22..=MAX_TOTAL_BYTES + RESERVE).contains(&size) {
        return Err("Invalid or oversized archive".into());
    }
    file.seek(SeekFrom::End(-22)).map_err(err)?;
    let mut end = [0u8; 22];
    file.read_exact(&mut end).map_err(err)?;
    let u16at = |n| u16::from_le_bytes([end[n], end[n + 1]]);
    let u32at = |n| u32::from_le_bytes(end[n..n + 4].try_into().unwrap()) as u64;
    if &end[..4] != b"PK\x05\x06"
        || u16at(4) != 0
        || u16at(6) != 0
        || u16at(8) != u16at(10)
        || u16at(20) != 0
    {
        return Err("Unsupported ZIP envelope (requires a single volume without comments)".into());
    }
    let count = u16at(10) as usize;
    let length = u32at(12);
    let offset = u32at(16);
    if count == 0 || count > MAX_FILES + 1 || length > MAX_CENTRAL || offset + length != size - 22 {
        return Err("Invalid or oversized ZIP directory".into());
    }
    file.seek(SeekFrom::Start(offset)).map_err(err)?;
    let mut directory = vec![0; length as usize];
    file.read_exact(&mut directory).map_err(err)?;
    let mut pos = 0;
    let mut names = vec![];
    let mut ranges = vec![];
    for _ in 0..count {
        if pos + 46 > directory.len() || &directory[pos..pos + 4] != b"PK\x01\x02" {
            return Err("Invalid ZIP directory entry".into());
        }
        let h = &directory[pos..pos + 46];
        let at = |n| u16::from_le_bytes([h[n], h[n + 1]]) as usize;
        let size_at = |n| u32::from_le_bytes(h[n..n + 4].try_into().unwrap()) as u64;
        let name_len = at(28);
        let extra_len = at(30);
        let comment_len = at(32);
        if at(8) & !0x0800 != 0
            || at(10) != 0
            || at(34) != 0
            || size_at(20) > MAX_FILE_BYTES.max(MAX_MANIFEST)
            || size_at(20) != size_at(24)
            || name_len > 1024
            || extra_len > 4096
            || comment_len > 1024
        {
            return Err("Unsupported or oversized ZIP entry".into());
        }
        let next = pos + 46 + name_len + extra_len + comment_len;
        if next > directory.len() {
            return Err("Truncated ZIP directory".into());
        }
        let name = std::str::from_utf8(&directory[pos + 46..pos + 46 + name_len])
            .map_err(err)?
            .to_string();
        if name != MANIFEST && !allowed(&name) {
            return Err(format!("Unsupported backup file: {}", name));
        }
        if name.to_lowercase().ends_with(".mcbackup") {
            return Err("Recursive backup entry rejected".into());
        }
        let local_offset = size_at(42);
        file.seek(SeekFrom::Start(local_offset)).map_err(err)?;
        let mut local = [0u8; 30];
        file.read_exact(&mut local).map_err(err)?;
        let local_u16 = |n| u16::from_le_bytes([local[n], local[n + 1]]) as usize;
        if &local[..4] != b"PK\x03\x04"
            || local_u16(6) != at(8)
            || local_u16(8) != at(10)
            || local[14..26] != h[16..28]
            || local_u16(26) != name_len
            || local_u16(28) > 4096
        {
            return Err("Local and central ZIP headers disagree".into());
        }
        let mut local_name = vec![0; name_len];
        file.read_exact(&mut local_name).map_err(err)?;
        if local_name != name.as_bytes() {
            return Err("Conflicting ZIP filenames".into());
        }
        let data_end = local_offset + 30 + name_len as u64 + local_u16(28) as u64 + size_at(20);
        if data_end > offset {
            return Err("ZIP entry extends into its directory".into());
        }
        ranges.push((local_offset, data_end));
        names.push(name);
        pos = next;
    }
    if pos != directory.len() {
        return Err("Unexpected data in ZIP directory".into());
    }
    ranges.sort();
    let mut boundary = 0;
    for (start, end) in ranges {
        if start != boundary {
            return Err("Overlapping or unlisted ZIP data".into());
        }
        boundary = end;
    }
    if boundary != offset {
        return Err("Unlisted archive data".into());
    }
    unique_names(names.iter().map(String::as_str))?;
    file.seek(SeekFrom::Start(0)).map_err(err)?;
    Ok(count)
}

fn read_entry(archive: &mut ZipArchive<File>, name: &str, limit: u64) -> Result<Vec<u8>> {
    let mut entry = archive.by_name(name).map_err(err)?;
    if entry.size() > limit
        || entry.compression() != CompressionMethod::Stored
        || entry.is_dir()
        || entry
            .unix_mode()
            .is_some_and(|m| m & 0o170000 != 0 && m & 0o170000 != 0o100000)
    {
        return Err("Unsupported archive entry".into());
    }
    let mut bytes = Vec::new();
    entry
        .by_ref()
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(err)?;
    if bytes.len() as u64 > limit || bytes.len() as u64 != entry.size() {
        return Err("Archive entry size mismatch".into());
    }
    Ok(bytes)
}
fn validate_document(bytes: &[u8], path: &str, ids: &mut BTreeSet<String>) -> Result<()> {
    let text = std::str::from_utf8(bytes).map_err(err)?;
    if let Some(frontmatter) = text.strip_prefix("---json\n") {
        if !frontmatter.contains("\n---\n") {
            return Err("Unterminated document frontmatter".into());
        }
    }
    let relative = path
        .strip_prefix("library/")
        .ok_or("Invalid document path")?;
    if !relative.ends_with(".md") {
        return Err("Writing studios only support Markdown documents".into());
    }
    let manager = StorageManager::new(".");
    let document = manager.parse_document_content(text, relative)?;
    if Some(document.metadata.doc_type.clone()) != studio(path) {
        return Err("Document studio conflicts with its path".into());
    }
    if document.metadata.id.is_empty() || !ids.insert(document.metadata.id.clone()) {
        return Err("Duplicate or invalid document identity".into());
    }
    DateTime::parse_from_rfc3339(&document.metadata.created_at).map_err(err)?;
    DateTime::parse_from_rfc3339(&document.metadata.updated_at).map_err(err)?;
    if let Some(raw) = &document.metadata.metadata_json {
        let value: serde_json::Value = serde_json::from_str(raw).map_err(err)?;
        if !value.is_object() {
            return Err("Unsupported studio metadata: expected a JSON object".into());
        }
        crate::thought::validate_metadata(&value)?;
    }
    Ok(())
}
fn validate_catalog(catalog: &Catalog, manifest: &Manifest) -> Result<()> {
    if catalog.tags.len() > MAX_FILES
        || catalog
            .tags
            .iter()
            .any(|s| s.is_empty() || s.len() > 1024 || s.chars().any(char::is_control))
    {
        return Err("Invalid tag catalog".into());
    }
    let mut paths = BTreeSet::new();
    let mut ids = BTreeSet::new();
    for metadata in &catalog.raw_documents {
        let path = format!("library/{}", metadata.relative_path);
        safe_path(&path)?;
        if studio(&path) != Some(metadata.doc_type.clone())
            || !manifest.files.iter().any(|e| e.path == path)
            || !paths.insert(path)
            || metadata.id.is_empty()
            || !ids.insert(&metadata.id)
        {
            return Err("Invalid imported-document catalog".into());
        }
        DateTime::parse_from_rfc3339(&metadata.created_at).map_err(err)?;
        DateTime::parse_from_rfc3339(&metadata.updated_at).map_err(err)?;
    }
    Ok(())
}

fn inspect(mut file: File, path: &Path) -> Result<(Preview, Manifest, ZipArchive<File>)> {
    let size = plain_file(path)?.len();
    let count = preflight(&mut file)?;
    let (archive_hash, _) = digest(&mut file, MAX_TOTAL_BYTES + RESERVE)?;
    file.seek(SeekFrom::Start(0)).map_err(err)?;
    let mut archive = ZipArchive::new(file).map_err(err)?;
    if archive.len() != count || archive.has_overlapping_files().map_err(err)? {
        return Err("Conflicting archive entries".into());
    }
    // Local/central names and sizes must agree, not merely the ZIP directory.
    // preflight checked local/central names, flags, sizes, CRC fields and data extents.
    let manifest: Manifest =
        serde_json::from_slice(&read_entry(&mut archive, MANIFEST, MAX_MANIFEST)?).map_err(err)?;
    if manifest.format_version != FORMAT_VERSION {
        return Err("Unsupported backup format version".into());
    }
    let date = DateTime::parse_from_rfc3339(&manifest.created_at).map_err(err)?;
    if date.offset().local_minus_utc() != 0
        || manifest.app_version.is_empty()
        || manifest.app_version.len() > 64
        || !manifest
            .app_version
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || ".+-".contains(c))
    {
        return Err("Invalid manifest metadata".into());
    }
    if manifest.files.len() + 1 != count || manifest.files.len() > MAX_FILES {
        return Err("Manifest/ZIP entry count mismatch".into());
    }
    unique_names(manifest.files.iter().map(|e| e.path.as_str()))?;
    let mut total = 0u64;
    let mut documents = 0;
    let mut attachments = 0;
    let mut archived = 0;
    let mut studios = BTreeSet::new();
    let mut ids = BTreeSet::new();
    for entry in &manifest.files {
        if !allowed(&entry.path)
            || entry.path == MANIFEST
            || entry.size > MAX_FILE_BYTES
            || entry.sha256.len() != 64
            || !entry
                .sha256
                .bytes()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        {
            return Err("Invalid manifest entry".into());
        }
        total = total
            .checked_add(entry.size)
            .ok_or("Archive size overflow")?;
        if total > MAX_TOTAL_BYTES {
            return Err("Backup exceeds total payload limit".into());
        }
        let bytes = read_entry(&mut archive, &entry.path, MAX_FILE_BYTES)?;
        if bytes.len() as u64 != entry.size || bytes_hash(&bytes) != entry.sha256 {
            return Err(format!("Integrity check failed: {}", entry.path));
        }
        if let Some(kind) = studio(&entry.path) {
            validate_document(&bytes, &entry.path, &mut ids)?;
            documents += 1;
            studios.insert(kind.as_str().to_string());
        }
        if entry.path.starts_with("library/Attachments/") {
            attachments += 1;
        }
        if entry.path.starts_with("library/Backups/") {
            archived += 1;
        }
        if entry.path.starts_with("library/Dictionaries/") {
            if !entry.path.ends_with(".json") && !entry.path.ends_with(".mckey") {
                return Err("Dictionaries and Cipher Keys must be .json or .mckey files".into());
            }
            let _: serde_json::Value = serde_json::from_slice(&bytes).map_err(err)?;
        }
        if entry.path.starts_with("library/Vocabulary/")
            && !entry.path.ends_with(".txt")
            && !entry.path.ends_with(".json")
        {
            return Err("Vocabulary files must be .txt or .json files".into());
        }
        if entry.path == "library/library.json" {
            let val: serde_json::Value = serde_json::from_slice(&bytes).map_err(err)?;
            let obj = val.as_object().ok_or("library.json must be a JSON object")?;
            if let Some(reg_val) = obj.get("house_registry") {
                let reg: crate::models::HouseRegistry = serde_json::from_value(reg_val.clone())
                    .map_err(|e| format!("Corrupted house_registry in backup library.json: {}", e))?;
                if reg.schema_version > crate::models::CURRENT_HOUSE_REGISTRY_SCHEMA_VERSION {
                    return Err(format!(
                        "Unsupported house_registry schema version in backup: {}",
                        reg.schema_version
                    ));
                }
                StorageManager::validate_registry_invariants(&reg)?;
            }
        }
    }
    let catalog: Catalog =
        serde_json::from_slice(&read_entry(&mut archive, CATALOG, MAX_MANIFEST)?).map_err(err)?;
    validate_catalog(&catalog, &manifest)?;
    for metadata in &catalog.raw_documents {
        let path = format!("library/{}", metadata.relative_path);
        let bytes = read_entry(&mut archive, &path, MAX_FILE_BYTES)?;
        if bytes.starts_with(b"---json\n") || !ids.insert(metadata.id.clone()) {
            return Err("Imported-document identity conflicts with canonical documents".into());
        }
        if let Some(raw) = &metadata.metadata_json {
            if !serde_json::from_str::<serde_json::Value>(raw)
                .map_err(err)?
                .is_object()
            {
                return Err("Invalid imported metadata".into());
            }
        }
    }
    let preview = Preview {
        path: path.to_string_lossy().into(),
        size,
        archive_sha256: archive_hash,
        format_version: FORMAT_VERSION,
        app_version: manifest.app_version.clone(),
        created_at: manifest.created_at.clone(),
        document_count: documents,
        studios: studios.into_iter().collect(),
        attachment_count: attachments,
        archived_count: archived,
        file_count: manifest.files.len(),
        total_bytes: total,
    };
    Ok((preview, manifest, archive))
}
pub fn verify_backup(path: &Path) -> Result<Preview> {
    let file = File::open(path).map_err(err)?;
    inspect(file, path).map(|result| result.0)
}

fn sources(root: &Path) -> Result<BTreeMap<String, PathBuf>> {
    let mut files = BTreeMap::new();
    for name in [
        "Poetry",
        "Philosophy",
        "Lorebooks",
        "Manuscripts",
        "Attachments",
        "Backups",
        "Dictionaries",
        "Vocabulary",
        "library.json",
    ] {
        let start = root.join(name);
        if !start.exists() {
            continue;
        }
        for item in walkdir::WalkDir::new(&start).follow_links(false) {
            let item = item.map_err(err)?;
            let metadata = fs::symlink_metadata(item.path()).map_err(err)?;
            if is_link(&metadata) {
                return Err(format!(
                    "Linked/reparse library entry cannot be backed up: {}",
                    item.path().display()
                ));
            }
            if metadata.is_dir() {
                continue;
            }
            if !metadata.is_file() {
                return Err("Unsupported library file type".into());
            }
            if item
                .path()
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("mcbackup"))
            {
                continue;
            }
            let relative = item
                .path()
                .strip_prefix(root)
                .map_err(err)?
                .to_str()
                .ok_or("Non-Unicode filename")?
                .replace('\\', "/");
            let archive_name = format!("library/{}", relative);
            safe_path(&archive_name)?;
            if metadata.len() > MAX_FILE_BYTES {
                return Err(format!("File exceeds 64 MiB Vault limit: {}", relative));
            }
            files.insert(archive_name, item.path().to_path_buf());
            if files.len() >= MAX_FILES {
                return Err("Too many library files".into());
            }
        }
    }
    unique_names(files.keys().map(String::as_str))?;
    Ok(files)
}
fn outside_library(parent: &Path, library: &Path) -> Result<PathBuf> {
    let resolved = parent.canonicalize().map_err(err)?;
    let library = library.canonicalize().map_err(err)?;
    if resolved.starts_with(&library) {
        return Err("Choose a location outside the active library".into());
    }
    Ok(resolved)
}
fn require_space(parent: &Path, payload: u64) -> Result<()> {
    let needed = payload
        .checked_mul(2)
        .and_then(|n| n.checked_add(RESERVE))
        .ok_or("Size overflow")?;
    if fs2::available_space(parent).map_err(err)? < needed {
        return Err("Insufficient free space for staging and recovery reserve".into());
    }
    Ok(())
}

pub fn create_backup(state: &AppState, folder: &Path) -> Result<Preview> {
    create_backup_inner(state, folder, |_| Ok(()))
}
fn create_backup_inner(
    state: &AppState,
    folder: &Path,
    checkpoint: impl Fn(&str) -> Result<()>,
) -> Result<Preview> {
    let db = state.db.lock().map_err(err)?;
    db.ensure_writable()?;
    create_backup_locked(state, folder, &db, checkpoint)
}
pub(crate) fn create_backup_locked(
    state: &AppState,
    folder: &Path,
    db: &Database,
    checkpoint: impl Fn(&str) -> Result<()>,
) -> Result<Preview> {
    let _reg_lock = state.storage.get_registry_lock();
    let _reg_guard = _reg_lock.lock().map_err(err)?;
    if state
        .storage
        .has_pending_universe_move_journal()
        .map_err(err)?
    {
        return Err("Cannot create Vault backup while a Universe move operation is incomplete or pending recovery. Complete recovery before backing up.".into());
    }
    fs::create_dir_all(folder).map_err(err)?;
    let folder = outside_library(folder, state.storage.get_root())?;
    let paths = sources(state.storage.get_root())?;
    let mut catalog = Catalog {
        tags: db.list_all_tags().map_err(err)?,
        raw_documents: vec![],
    };
    for metadata in db.list_documents(None, None).map_err(err)? {
        let key = format!("library/{}", metadata.relative_path.replace('\\', "/"));
        let path = paths
            .get(&key)
            .ok_or_else(|| format!("Indexed document missing from snapshot: {}", metadata.title))?;
        let bytes = bounded_source(path)?;
        if !bytes.starts_with(b"---json\n") {
            catalog.raw_documents.push(metadata);
        }
    }
    let catalog = serde_json::to_vec_pretty(&catalog).map_err(err)?;
    if catalog.len() as u64 > MAX_MANIFEST {
        return Err("Catalog too large".into());
    }
    let estimated = paths.values().try_fold(catalog.len() as u64, |n, path| {
        plain_file(path).map(|m| n + m.len())
    })?;
    if estimated > MAX_TOTAL_BYTES {
        return Err("Backup exceeds 1 GiB payload limit".into());
    }
    require_space(&folder, estimated)?;
    let name = format!(
        "MetaCognitionNotebook-{}-{}",
        Utc::now().format("%Y-%m-%d-%H%M%S"),
        uuid::Uuid::new_v4()
    );
    let partial = folder.join(format!("{}.partial", name));
    let final_path = folder.join(format!("{}.mcbackup", name));
    let result = (|| {
        let mut output = OpenOptions::new()
            .write(true)
            .read(true)
            .create_new(true)
            .open(&partial)
            .map_err(err)?;
        let mut archive = ZipWriter::new(&mut output);
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored)
            .unix_permissions(0o600);
        let mut manifest = Manifest {
            format_version: FORMAT_VERSION,
            app_version: env!("CARGO_PKG_VERSION").into(),
            created_at: Utc::now().to_rfc3339(),
            files: vec![],
        };
        let mut total = 0;
        for (name, source) in &paths {
            let bytes = bounded_source(source)?;
            if bytes.len() as u64 > MAX_FILE_BYTES {
                return Err("File grew beyond backup limit".into());
            }
            total += bytes.len() as u64;
            if total > MAX_TOTAL_BYTES {
                return Err("Library grew beyond backup limit".into());
            }
            archive.start_file(name, options).map_err(err)?;
            archive.write_all(&bytes).map_err(err)?;
            manifest.files.push(Entry {
                path: name.clone(),
                size: bytes.len() as u64,
                sha256: bytes_hash(&bytes),
            });
        }
        archive.start_file(CATALOG, options).map_err(err)?;
        archive.write_all(&catalog).map_err(err)?;
        manifest.files.push(Entry {
            path: CATALOG.into(),
            size: catalog.len() as u64,
            sha256: bytes_hash(&catalog),
        });
        let manifest_bytes = serde_json::to_vec_pretty(&manifest).map_err(err)?;
        if manifest_bytes.len() as u64 > MAX_MANIFEST {
            return Err("Manifest too large".into());
        }
        archive.start_file(MANIFEST, options).map_err(err)?;
        archive.write_all(&manifest_bytes).map_err(err)?;
        archive.finish().map_err(err)?;
        output.sync_all().map_err(err)?;
        drop(output);
        checkpoint("captured")?;
        // Validate the complete archive, then detect concurrent external library edits.
        verify_backup(&partial)?;
        if sources(state.storage.get_root())? != paths {
            return Err("Library changed during capture; retry backup".into());
        }
        for entry in &manifest.files {
            if let Some(path) = paths.get(&entry.path) {
                let (hash, size) = file_digest(path)?;
                if hash != entry.sha256 || size != entry.size {
                    return Err("Library changed during capture; retry backup".into());
                }
            }
        }
        fs::rename(&partial, &final_path).map_err(err)?;
        verify_backup(&final_path)
    })();
    result.map_err(|error| {
        format!(
            "{}. Any incomplete backup is retained at {}",
            error,
            partial.display()
        )
    })
}

pub fn history(folder: &Path) -> Result<History> {
    let mut backups = vec![];
    if folder.exists() {
        for item in fs::read_dir(folder).map_err(err)? {
            let item = item.map_err(err)?;
            let path = item.path();
            let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if extension != "mcbackup" && extension != "partial" {
                continue;
            }
            let metadata = plain_file(&path)?;
            backups.push(BackupRecord {
                path: path.to_string_lossy().into(),
                name: item.file_name().to_string_lossy().into(),
                size: metadata.len(),
                file_date: DateTime::<Utc>::from(metadata.modified().map_err(err)?).to_rfc3339(),
                incomplete: extension == "partial",
            });
        }
    }
    backups.sort_by(|a, b| b.file_date.cmp(&a.file_date));
    Ok(History {
        folder: folder.to_string_lossy().into(),
        backups,
    })
}

fn restore_inner(
    backup: &Path,
    expected_hash: &str,
    parent: &Path,
    active: &Path,
    checkpoint: impl Fn(&str) -> Result<()>,
) -> Result<RestoreResult> {
    let (preview, manifest, mut archive) = inspect(File::open(backup).map_err(err)?, backup)?;
    if preview.archive_sha256 != expected_hash {
        return Err("Backup changed since preview. Verify it again before restoring".into());
    }
    let parent = outside_library(parent, active)?;
    require_space(&parent, preview.total_bytes)?;
    let id = uuid::Uuid::new_v4();
    let staging = parent.join(format!("MetaCognitionNotebook-Restore-{}.partial", id));
    let final_path = parent.join(format!("MetaCognitionNotebook-Restored-{}", id));
    fs::create_dir(&staging).map_err(err)?; // Unique, owned destination: no existing files are overwritten.
    let result: Result<RestoreResult> = (|| {
        let recovery = staging.join(".vault-recovery");
        fs::create_dir(&recovery).map_err(err)?;
        let journal = |phase: &str| -> Result<()> {
            let payload = serde_json::json!({"format_version":1,"phase":phase,"final_folder":final_path.file_name().unwrap().to_string_lossy(),"active_library_unchanged":true});
            let mut file = File::create(recovery.join("restore.json")).map_err(err)?;
            file.write_all(payload.to_string().as_bytes())
                .map_err(err)?;
            file.sync_all().map_err(err)
        };
        journal("staging")?;
        checkpoint("staging")?;
        for entry in &manifest.files {
            let destination = if entry.path == CATALOG {
                recovery.join("catalog.json")
            } else {
                staging.join(
                    entry
                        .path
                        .strip_prefix("library/")
                        .ok_or("Unsupported extraction path")?,
                )
            };
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(err)?;
            }
            let bytes = read_entry(&mut archive, &entry.path, MAX_FILE_BYTES)?;
            if bytes_hash(&bytes) != entry.sha256 {
                return Err("Backup changed during extraction".into());
            }
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&destination)
                .map_err(err)?;
            file.write_all(&bytes).map_err(err)?;
            file.sync_all().map_err(err)?;
            checkpoint("file")?;
        }
        let catalog: Catalog =
            serde_json::from_slice(&fs::read(recovery.join("catalog.json")).map_err(err)?)
                .map_err(err)?;
        let storage = StorageManager::new(&staging);
        storage.initialize().map_err(err)?;
        // Preserve raw-import IDs and metadata without changing their prose.
        for metadata in &catalog.raw_documents {
            let path = staging.join(&metadata.relative_path);
            let bytes = fs::read(&path).map_err(err)?;
            if bytes.starts_with(b"---json\n") {
                return Err("Raw-document catalog conflicts with frontmatter".into());
            }
            let document = crate::models::DocumentDetail {
                metadata: metadata.clone(),
                content: String::from_utf8(bytes).map_err(err)?,
            };
            storage.write_document_atomic(&metadata.relative_path, &document)?;
        }
        let (documents, report) = storage.scan_and_reindex();
        if !report.errors.is_empty() || documents.len() != preview.document_count {
            return Err("Restored library did not pass document validation".into());
        }
        {
            let mut db = Database::open(recovery.join("metadata.db")).map_err(err)?;
            for document in &documents {
                db.upsert_document(&document.metadata).map_err(err)?;
            }
            db.restore_tag_catalog(&catalog.tags).map_err(err)?;
            if db.get_stats().map_err(err)?.0 != preview.document_count {
                return Err("Duplicate document identities in restored index".into());
            }
            db.check_integrity().map_err(err)?;
        } // Close and checkpoint the newly generated index before publishing the folder.
        if file_digest(backup)?.0 != expected_hash {
            return Err("Backup changed while restoring".into());
        }
        journal("validated")?;
        checkpoint("validated")?;
        if final_path.exists() {
            return Err("Restore destination already exists".into());
        }
        fs::rename(&staging, &final_path).map_err(err)?;
        Ok(RestoreResult {
            restored_path: final_path.to_string_lossy().into(),
            document_count: documents.len(),
        })
    })();
    result.map_err(|error| {
        format!(
            "{}. Active library unchanged. Recovery staging is retained at {}",
            error,
            staging.display()
        )
    })
}
pub fn restore_separate(
    backup: &Path,
    expected_hash: &str,
    parent: &Path,
    active: &Path,
) -> Result<RestoreResult> {
    restore_inner(backup, expected_hash, parent, active, |_| Ok(()))
}

#[tauri::command]
pub async fn vault_history(app: tauri::AppHandle) -> Result<History> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        history(&app.path().app_local_data_dir().map_err(err)?.join("Vault"))
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn vault_create(app: tauri::AppHandle) -> Result<Preview> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        let state = app.state::<AppState>();
        create_backup(
            &state,
            &app.path().app_local_data_dir().map_err(err)?.join("Vault"),
        )
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn vault_verify(path: String) -> Result<Preview> {
    tauri::async_runtime::spawn_blocking(move || verify_backup(Path::new(&path)))
        .await
        .map_err(err)?
}
#[tauri::command]
pub async fn vault_choose() -> Result<Option<Preview>> {
    tauri::async_runtime::spawn_blocking(move || {
        rfd::FileDialog::new()
            .set_title("Choose a Vault backup")
            .add_filter("MetaCognition backup", &["mcbackup"])
            .pick_file()
            .map(|path| verify_backup(&path))
            .transpose()
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn vault_restore(
    app: tauri::AppHandle,
    path: String,
    expected_hash: String,
) -> Result<Option<RestoreResult>> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        let parent = match rfd::FileDialog::new()
            .set_title("Choose a parent folder for a NEW restored library")
            .pick_folder()
        {
            Some(path) => path,
            None => return Ok(None),
        };
        let state = app.state::<AppState>();
        restore_separate(
            Path::new(&path),
            &expected_hash,
            &parent,
            state.storage.get_root(),
        )
        .map(Some)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn vault_open_folder(app: tauri::AppHandle) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        let folder = app.path().app_local_data_dir().map_err(err)?.join("Vault");
        fs::create_dir_all(&folder).map_err(err)?;
        #[cfg(windows)]
        {
            std::process::Command::new("explorer.exe")
                .arg(folder)
                .spawn()
                .map_err(err)?;
            Ok(())
        }
        #[cfg(not(windows))]
        {
            Err("Open folder is available on Windows".into())
        }
    })
    .await
    .map_err(err)?
}

#[cfg(test)]
mod tests;

/// Validate supported canonical files before accepting a persisted notebook selection.
pub(crate) fn validate_library(root: &Path) -> Result<()> {
    if !root.is_dir() {
        return Err("Notebook folder is missing".into());
    }
    let mut ids = BTreeSet::new();
    // Archive size/count limits apply to portable archives, not to a notebook
    // that may legitimately grow after activation. Attachments are not indexed.
    for folder in ["Poetry", "Philosophy", "Lorebooks", "Manuscripts"] {
        if !root.join(folder).is_dir() {
            if folder == "Manuscripts" {
                continue;
            }
            return Err(format!("Notebook studio folder missing: {}", folder));
        }
        for item in walkdir::WalkDir::new(root.join(folder)).follow_links(false) {
            let item = item.map_err(err)?;
            let metadata = fs::symlink_metadata(item.path()).map_err(err)?;
            if is_link(&metadata) {
                return Err("Linked/reparse notebook entries cannot be activated".into());
            }
            if metadata.is_file() && item.path().extension().is_some_and(|e| e == "md") {
                let name = format!(
                    "library/{}",
                    item.path()
                        .strip_prefix(root)
                        .map_err(err)?
                        .to_str()
                        .ok_or("Non-Unicode notebook path")?
                        .replace('\\', "/")
                );
                safe_path(&name)?;
                validate_document(&fs::read(item.path()).map_err(err)?, &name, &mut ids)?;
            }
        }
    }
    Ok(())
}
