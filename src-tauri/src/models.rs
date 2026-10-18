use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DocumentType {
    Poetry,
    Philosophy,
    Lorebook,
}

impl DocumentType {
    pub fn as_str(&self) -> &'static str {
        match self {
            DocumentType::Poetry => "poetry",
            DocumentType::Philosophy => "philosophy",
            DocumentType::Lorebook => "lorebook",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "poetry" => Some(DocumentType::Poetry),
            "philosophy" => Some(DocumentType::Philosophy),
            "lorebook" => Some(DocumentType::Lorebook),
            _ => None,
        }
    }

    pub fn folder_name(&self) -> &'static str {
        match self {
            DocumentType::Poetry => "Poetry",
            DocumentType::Philosophy => "Philosophy",
            DocumentType::Lorebook => "Lorebooks",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub id: String,
    pub title: String,
    pub doc_type: DocumentType,
    pub relative_path: String,
    pub parent_id: Option<String>,
    pub metadata_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentDetail {
    pub metadata: DocumentMetadata,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Frontmatter {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub doc_type: DocumentType,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryInfo {
    pub library_path: String,
    pub db_path: String,
    pub document_count: usize,
    pub poetry_count: usize,
    pub philosophy_count: usize,
    pub lorebook_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub doc_type: DocumentType,
    pub relative_path: String,
    pub snippet: String,
    pub match_type: String, // "title" or "content"
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReindexReport {
    pub total_files_scanned: usize,
    pub documents_indexed: usize,
    pub errors: Vec<String>,
}
