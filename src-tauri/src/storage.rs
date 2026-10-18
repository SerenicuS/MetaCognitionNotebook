use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use chrono::Utc;
use walkdir::WalkDir;
use crate::models::{DocumentDetail, DocumentMetadata, DocumentType, Frontmatter, ReindexReport, SearchResult};

const FRONTMATTER_PREFIX: &str = "---json\n";
const FRONTMATTER_SUFFIX: &str = "\n---\n";

pub struct StorageManager {
    library_root: PathBuf,
}

impl StorageManager {
    pub fn new<P: AsRef<Path>>(root: P) -> Self {
        StorageManager {
            library_root: root.as_ref().to_path_buf(),
        }
    }

    pub fn get_root(&self) -> &Path {
        &self.library_root
    }

    pub fn initialize(&self) -> std::io::Result<()> {
        fs::create_dir_all(&self.library_root)?;
        fs::create_dir_all(self.library_root.join("Poetry"))?;
        fs::create_dir_all(self.library_root.join("Philosophy"))?;
        fs::create_dir_all(self.library_root.join("Lorebooks"))?;
        fs::create_dir_all(self.library_root.join("Attachments"))?;
        fs::create_dir_all(self.library_root.join("Backups"))?;
        fs::create_dir_all(self.library_root.join("Dictionaries"))?;
        fs::create_dir_all(self.library_root.join("Vocabulary"))?;

        let library_json_path = self.library_root.join("library.json");
        if !library_json_path.exists() {
            let info = serde_json::json!({
                "name": "MetaCognition Notebook Library",
                "version": "1.0",
                "created_at": Utc::now().to_rfc3339(),
                "description": "Canonical managed library for MetaCognition Notebook documents"
            });
            let content = serde_json::to_string_pretty(&info).unwrap_or_default();
            fs::write(library_json_path, content)?;
        }

        Ok(())
    }

    /// Resolve a relative path within the library root, strictly preventing directory traversal.
    pub fn resolve_safe_path(&self, relative_path: &str) -> Result<PathBuf, String> {
        let path = Path::new(relative_path);
        for component in path.components() {
            match component {
                std::path::Component::ParentDir | std::path::Component::RootDir | std::path::Component::Prefix(_) => {
                    return Err(format!("Invalid path traversal attempted: {}", relative_path));
                }
                _ => {}
            }
        }
        let full_path = self.library_root.join(relative_path);
        Ok(full_path)
    }

    pub fn sanitize_filename(name: &str) -> String {
        let invalid_chars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
        let mut clean: String = name
            .chars()
            .map(|c| if invalid_chars.contains(&c) || c.is_control() { '_' } else { c })
            .collect();
        clean = clean.trim().to_string();
        if clean.is_empty() {
            "Untitled".to_string()
        } else {
            clean
        }
    }

    /// Read document file from disk and parse frontmatter + content.
    pub fn read_document(&self, relative_path: &str) -> Result<DocumentDetail, String> {
        let full_path = self.resolve_safe_path(relative_path)?;
        if !full_path.exists() {
            return Err(format!("Document file not found: {}", relative_path));
        }

        let mut file = File::open(&full_path).map_err(|e| format!("Failed to open file: {}", e))?;
        let mut raw_content = String::new();
        file.read_to_string(&mut raw_content)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        self.parse_document_content(&raw_content, relative_path)
    }

    /// Parse markdown content with frontmatter
    pub fn parse_document_content(&self, raw: &str, relative_path: &str) -> Result<DocumentDetail, String> {
        if raw.starts_with(FRONTMATTER_PREFIX) {
            if let Some(end_idx) = raw[FRONTMATTER_PREFIX.len()..].find(FRONTMATTER_SUFFIX) {
                let json_slice = &raw[FRONTMATTER_PREFIX.len()..FRONTMATTER_PREFIX.len() + end_idx];
                let content = &raw[FRONTMATTER_PREFIX.len() + end_idx + FRONTMATTER_SUFFIX.len()..];

                let fm: Frontmatter = serde_json::from_str(json_slice)
                    .map_err(|e| format!("Invalid document frontmatter JSON: {}", e))?;

                let metadata_json = fm.metadata.map(|v| v.to_string());

                return Ok(DocumentDetail {
                    metadata: DocumentMetadata {
                        id: fm.id,
                        title: fm.title,
                        doc_type: fm.doc_type,
                        relative_path: relative_path.to_string(),
                        parent_id: fm.parent_id,
                        metadata_json,
                        created_at: fm.created_at,
                        updated_at: fm.updated_at,
                        tags: fm.tags,
                    },
                    content: content.to_string(),
                });
            }
        }

        // Fallback for raw markdown files without frontmatter
        let doc_type = if relative_path.starts_with("Poetry") {
            DocumentType::Poetry
        } else if relative_path.starts_with("Philosophy") {
            DocumentType::Philosophy
        } else {
            DocumentType::Lorebook
        };

        let file_stem = Path::new(relative_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled");

        let now = Utc::now().to_rfc3339();
        Ok(DocumentDetail {
            metadata: DocumentMetadata {
                id: uuid::Uuid::new_v4().to_string(),
                title: file_stem.to_string(),
                doc_type,
                relative_path: relative_path.to_string(),
                parent_id: None,
                metadata_json: None,
                created_at: now.clone(),
                updated_at: now,
                tags: Vec::new(),
            },
            content: raw.to_string(),
        })
    }

    /// Write document safely using temporary file and atomic replace.
    pub fn write_document_atomic(&self, relative_path: &str, doc: &DocumentDetail) -> Result<(), String> {
        let full_path = self.resolve_safe_path(relative_path)?;

        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directories: {}", e))?;
        }

        let fm = Frontmatter {
            id: doc.metadata.id.clone(),
            title: doc.metadata.title.clone(),
            doc_type: doc.metadata.doc_type.clone(),
            created_at: doc.metadata.created_at.clone(),
            updated_at: doc.metadata.updated_at.clone(),
            tags: doc.metadata.tags.clone(),
            parent_id: doc.metadata.parent_id.clone(),
            metadata: doc.metadata.metadata_json.as_deref().and_then(|s| serde_json::from_str(s).ok()),
        };

        // Retain unknown top-level frontmatter keys from externally authored files.
        let mut value = serde_json::to_value(&fm).map_err(|e| e.to_string())?;
        if let Ok(raw) = fs::read_to_string(&full_path) {
            if let Some(rest) = raw.strip_prefix(FRONTMATTER_PREFIX) {
                if let Some((json, _)) = rest.split_once(FRONTMATTER_SUFFIX) {
                    if let Ok(serde_json::Value::Object(original)) = serde_json::from_str(json) {
                        let object = value.as_object_mut().unwrap();
                        for (key, value) in original { object.entry(key).or_insert(value); }
                    }
                }
            }
        }
        let json_str = serde_json::to_string_pretty(&value)
            .map_err(|e| format!("Failed to serialize frontmatter: {}", e))?;

        let mut payload = String::new();
        payload.push_str(FRONTMATTER_PREFIX);
        payload.push_str(&json_str);
        payload.push_str(FRONTMATTER_SUFFIX);
        payload.push_str(&doc.content);

        self.write_raw_atomic(relative_path, &payload)
    }

    /// Also used to restore the exact original bytes if indexing a metadata update fails.
    pub(crate) fn write_raw_atomic(&self, relative_path: &str, payload: &str) -> Result<(), String> {
        let full_path = self.resolve_safe_path(relative_path)?;
        // Safe write: write to temp file next to target, then rename
        let parent_dir = full_path.parent().unwrap_or(&self.library_root);
        let temp_filename = format!(".tmp_{}_{}.tmp", uuid::Uuid::new_v4(), std::process::id());
        let temp_path = parent_dir.join(temp_filename);

        {
            let mut tmp_file = File::create(&temp_path)
                .map_err(|e| format!("Failed to create temporary file: {}", e))?;
            tmp_file.write_all(payload.as_bytes())
                .map_err(|e| format!("Failed to write to temporary file: {}", e))?;
            tmp_file.sync_all()
                .map_err(|e| format!("Failed to flush temporary file: {}", e))?;
        }

        // Atomic rename / replace
        fs::rename(&temp_path, &full_path)
            .map_err(|e| {
                let _ = fs::remove_file(&temp_path);
                format!("Failed to rename temporary file to destination: {}", e)
            })?;

        Ok(())
    }

    /// Safely delete a document by archiving it to Backups/
    pub fn safe_delete(&self, relative_path: &str) -> Result<(), String> {
        let full_path = self.resolve_safe_path(relative_path)?;
        if !full_path.exists() {
            return Ok(());
        }

        let backups_dir = self.library_root.join("Backups");
        fs::create_dir_all(&backups_dir)
            .map_err(|e| format!("Failed to create Backups dir: {}", e))?;

        let file_name = full_path.file_name().and_then(|f| f.to_str()).unwrap_or("backup.md");
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let backup_dest = backups_dir.join(format!("{}_{}", timestamp, file_name));

        fs::rename(&full_path, &backup_dest)
            .or_else(|_| fs::copy(&full_path, &backup_dest).map(|_| { let _ = fs::remove_file(&full_path); }))
            .map_err(|e| format!("Failed to archive deleted file: {}", e))?;

        Ok(())
    }

    /// Full library scan and reindex
    pub fn scan_and_reindex(&self) -> (Vec<DocumentDetail>, ReindexReport) {
        let mut documents = Vec::new();
        let mut report = ReindexReport {
            total_files_scanned: 0,
            documents_indexed: 0,
            errors: Vec::new(),
        };

        for entry in WalkDir::new(&self.library_root)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "md" {
                        report.total_files_scanned += 1;

                        if let Ok(rel) = path.strip_prefix(&self.library_root) {
                            let rel_str = rel.to_string_lossy().replace('\\', "/");
                            
                            // Skip Backups and Attachments
                            if rel_str.starts_with("Backups/") || rel_str.starts_with("Attachments/") {
                                continue;
                            }

                            match self.read_document(&rel_str) {
                                Ok(doc) => {
                                    report.documents_indexed += 1;
                                    documents.push(doc);
                                }
                                Err(err) => {
                                    report.errors.push(format!("{}: {}", rel_str, err));
                                }
                            }
                        }
                    }
                }
            }
        }

        (documents, report)
    }

    /// Search across titles and markdown contents
    pub fn search(&self, docs: &[DocumentMetadata], query: &str) -> Vec<SearchResult> {
        let q_lower = query.trim().to_lowercase();
        let mut results = Vec::new();

        for doc in docs {
            let title_match = doc.title.to_lowercase().contains(&q_lower);
            if title_match {
                results.push(SearchResult {
                    id: doc.id.clone(),
                    title: doc.title.clone(),
                    doc_type: doc.doc_type.clone(),
                    relative_path: doc.relative_path.clone(),
                    snippet: format!("Title match: {}", doc.title),
                    match_type: "title".to_string(),
                    updated_at: doc.updated_at.clone(),
                });
                continue;
            }

            // Check content match
            if let Ok(detail) = self.read_document(&doc.relative_path) {
                if let Some(idx) = detail.content.to_lowercase().find(&q_lower) {
                    let mut start = idx.saturating_sub(40).min(detail.content.len());
                    let mut end = (idx + q_lower.len() + 40).min(detail.content.len());
                    while !detail.content.is_char_boundary(start) { start -= 1; }
                    while !detail.content.is_char_boundary(end) { end -= 1; }
                    let snippet = format!("...{}...", &detail.content[start..end].replace('\n', " "));

                    results.push(SearchResult {
                        id: doc.id.clone(),
                        title: doc.title.clone(),
                        doc_type: doc.doc_type.clone(),
                        relative_path: doc.relative_path.clone(),
                        snippet,
                        match_type: "content".to_string(),
                        updated_at: doc.updated_at.clone(),
                    });
                }
            }
        }

        results
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_traversal_protection() {
        let manager = StorageManager::new("C:/mock/library");
        assert!(manager.resolve_safe_path("../secret.txt").is_err());
        assert!(manager.resolve_safe_path("Poetry/../../windows/system32").is_err());
        assert!(manager.resolve_safe_path("Poetry/song.md").is_ok());
    }

    #[test]
    fn test_frontmatter_roundtrip() {
        let temp_dir = tempfile::tempdir().expect("tempdir failed");
        let manager = StorageManager::new(temp_dir.path());
        manager.initialize().expect("initialize failed");

        let doc = DocumentDetail {
            metadata: DocumentMetadata {
                id: "test-uuid-1".to_string(),
                title: "My Poem".to_string(),
                doc_type: DocumentType::Poetry,
                relative_path: "Poetry/My_Poem.md".to_string(),
                parent_id: None,
                metadata_json: Some(r#"{"form":"Sonnet"}"#.to_string()),
                created_at: "2026-10-18T10:00:00Z".to_string(),
                updated_at: "2026-10-18T10:00:00Z".to_string(),
                tags: vec!["rhyme".to_string()],
            },
            content: "Line 1\nLine 2\n\nLine 3\nLine 4".to_string(),
        };

        manager.write_document_atomic("Poetry/My_Poem.md", &doc).expect("write failed");

        let read = manager.read_document("Poetry/My_Poem.md").expect("read failed");
        assert_eq!(read.metadata.id, "test-uuid-1");
        assert_eq!(read.metadata.title, "My Poem");
        assert_eq!(read.content, "Line 1\nLine 2\n\nLine 3\nLine 4");
    }
}
