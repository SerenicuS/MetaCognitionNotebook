use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DocumentType {
    Poetry,
    Philosophy,
    Lorebook,
    Manuscript,
}

impl DocumentType {
    pub fn as_str(&self) -> &'static str {
        match self {
            DocumentType::Poetry => "poetry",
            DocumentType::Philosophy => "philosophy",
            DocumentType::Lorebook => "lorebook",
            DocumentType::Manuscript => "manuscript",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "poetry" => Some(DocumentType::Poetry),
            "philosophy" => Some(DocumentType::Philosophy),
            "lorebook" => Some(DocumentType::Lorebook),
            "manuscript" => Some(DocumentType::Manuscript),
            _ => None,
        }
    }

    pub fn folder_name(&self) -> &'static str {
        match self {
            DocumentType::Poetry => "Poetry",
            DocumentType::Philosophy => "Philosophy",
            DocumentType::Lorebook => "Lorebooks",
            DocumentType::Manuscript => "Manuscripts",
        }
    }
}

pub const DEFAULT_HOUSE_ID: &str = "house-default";
pub const DEFAULT_HOUSE_NAME: &str = "Primary House";

pub fn default_house_id() -> String {
    DEFAULT_HOUSE_ID.to_string()
}

pub fn default_house_color() -> String {
    "amber".to_string()
}

pub fn default_house_icon() -> String {
    "castle".to_string()
}

pub fn default_authoring_studios() -> Vec<AuthoringStudio> {
    vec![
        AuthoringStudio::Poetry,
        AuthoringStudio::Philosophy,
        AuthoringStudio::Lorebook,
    ]
}

pub fn parse_house_id_from_frontmatter(raw: Option<&str>) -> Result<String, String> {
    match raw {
        None => Ok(DEFAULT_HOUSE_ID.to_string()),
        Some(val) => {
            let trimmed = val.trim();
            if trimmed.is_empty() {
                return Err("Explicit house_id cannot be empty or whitespace".to_string());
            }
            if trimmed.chars().any(|c| c.is_control() || c == '/' || c == '\\') {
                return Err(format!(
                    "Explicit house_id '{}' contains illegal control characters or path separators",
                    val
                ));
            }
            if !is_valid_house_id(trimmed) {
                return Err(format!(
                    "Explicit house_id '{}' must start with 'house-' and contain no whitespace",
                    val
                ));
            }
            Ok(trimmed.to_string())
        }
    }
}

pub fn normalize_house_id(raw: Option<&str>) -> String {
    parse_house_id_from_frontmatter(raw).unwrap_or_else(|_| DEFAULT_HOUSE_ID.to_string())
}

pub fn is_valid_house_id(s: &str) -> bool {
    let trimmed = s.trim();
    if let Some(suffix) = trimmed.strip_prefix("house-") {
        !suffix.is_empty()
            && suffix
                .chars()
                .all(|c| !c.is_control() && !c.is_whitespace() && c != '/' && c != '\\')
    } else {
        false
    }
}

pub fn normalize_house_name(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("House name cannot be empty".to_string());
    }
    if trimmed.chars().any(|c| c.is_control()) {
        return Err("House name cannot contain control characters".to_string());
    }
    Ok(trimmed.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum AuthoringStudio {
    Poetry,
    Philosophy,
    Lorebook,
}

impl AuthoringStudio {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuthoringStudio::Poetry => "poetry",
            AuthoringStudio::Philosophy => "philosophy",
            AuthoringStudio::Lorebook => "lorebook",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "poetry" => Some(AuthoringStudio::Poetry),
            "philosophy" => Some(AuthoringStudio::Philosophy),
            "lorebook" => Some(AuthoringStudio::Lorebook),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HouseRecord {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default = "default_house_color")]
    pub color: String,
    #[serde(default = "default_house_icon")]
    pub icon: String,
    #[serde(default = "default_authoring_studios")]
    pub enabled_studios: Vec<AuthoringStudio>,
    #[serde(default)]
    pub manuscript_tools_enabled: bool,
    #[serde(default)]
    pub universe_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub archived: bool,
}

impl HouseRecord {
    pub fn default_house(now: &str) -> Self {
        HouseRecord {
            id: DEFAULT_HOUSE_ID.to_string(),
            name: DEFAULT_HOUSE_NAME.to_string(),
            description: Some("Default creative workspace containing initial writings.".to_string()),
            color: default_house_color(),
            icon: default_house_icon(),
            enabled_studios: default_authoring_studios(),
            manuscript_tools_enabled: true,
            universe_ids: Vec::new(),
            created_at: now.to_string(),
            updated_at: now.to_string(),
            archived: false,
        }
    }
}

pub const CURRENT_HOUSE_REGISTRY_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HouseRegistry {
    pub schema_version: u32,
    pub default_house_id: String,
    pub houses: Vec<HouseRecord>,
}

impl HouseRegistry {
    pub fn default_registry(now: &str) -> Self {
        HouseRegistry {
            schema_version: CURRENT_HOUSE_REGISTRY_SCHEMA_VERSION,
            default_house_id: DEFAULT_HOUSE_ID.to_string(),
            houses: vec![HouseRecord::default_house(now)],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateHouseInput {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub enabled_studios: Option<Vec<AuthoringStudio>>,
    pub manuscript_tools_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateHouseInput {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub enabled_studios: Option<Vec<AuthoringStudio>>,
    pub manuscript_tools_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub id: String,
    pub title: String,
    pub doc_type: DocumentType,
    #[serde(default = "default_house_id")]
    pub house_id: String,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub house_id: Option<String>,
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
    #[serde(default)]
    pub manuscript_count: usize,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum IntegrityIssueType {
    MalformedHouseId,
    OrphanedHouseId,
    ConflictingEntityOwnership,
    InvalidUniverseMapping,
    CanonicalIndexMismatch,
    MissingCanonicalFile,
    IncompleteUniverseMove,
    UnassignedUniverse,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HouseIntegrityIssue {
    pub issue_type: IntegrityIssueType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub document_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relative_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub house_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub universe_id: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HouseIntegrityReport {
    pub total_documents_scanned: usize,
    pub issues: Vec<HouseIntegrityIssue>,
    pub orphaned_document_count: usize,
    pub malformed_document_count: usize,
    pub conflicting_entity_count: usize,
    pub invalid_universe_mapping_count: usize,
    #[serde(default)]
    pub canonical_index_mismatch_count: usize,
    #[serde(default)]
    pub missing_canonical_file_count: usize,
    #[serde(default)]
    pub incomplete_universe_move_count: usize,
    #[serde(default)]
    pub unassigned_universe_count: usize,
}

impl HouseIntegrityReport {
    pub fn is_healthy(&self) -> bool {
        self.issues.is_empty()
    }
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CreateUniverseResult {
    pub universe_id: String,
    pub universe_name: String,
    pub house_id: String,
    pub thought: crate::thought::Thought,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UniverseMoveResult {
    pub universe_id: String,
    pub source_house_id: String,
    pub target_house_id: String,
    pub moved_document_ids: Vec<String>,
    pub document_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UniverseMoveJournal {
    pub operation_id: String,
    pub created_at: String,
    pub stage: UniverseMoveStage,
    pub universe_id: String,
    pub source_house_id: String,
    pub target_house_id: String,
    pub affected_documents: Vec<UniverseMoveDocumentEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UniverseMoveStage {
    Planned,
    RegistryUpdated,
    DocumentsUpdated,
    Completed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UniverseMoveDocumentEntry {
    pub doc_id: String,
    pub relative_path: String,
    pub original_house_id: String,
    pub target_house_id: String,
    pub status: UniverseMoveDocStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UniverseMoveDocStatus {
    Pending,
    Updated,
}

/// Resolves a legacy universe name to a stable Universe ID using House-scoped candidate matching.
///
/// Rules (F-06):
/// 1. Finds all candidates in the catalog whose `name` matches `legacy_name` case-insensitively.
/// 2. If no candidate matches, returns `Ok(None)`.
/// 3. If exactly one candidate matches and its owning House matches `doc_house_id` (with unassigned mapping to 'house-default'), returns `Ok(Some(id))`.
/// 4. If multiple candidates match across Houses, narrows to candidates belonging to `doc_house_id`.
///    - If exactly one scoped candidate matches, returns `Ok(Some(id))`.
///    - If 0 or >1 scoped candidates match, returns `Err` (ambiguous or cross-House candidate; never auto-selected).
pub fn resolve_legacy_universe_id(
    legacy_name: &str,
    doc_house_id: &str,
    universes: &[crate::thought::Universe],
    registry: &HouseRegistry,
) -> Result<Option<String>, String> {
    let trimmed = legacy_name.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let candidates: Vec<&crate::thought::Universe> = universes
        .iter()
        .filter(|u| u.name.trim().eq_ignore_ascii_case(trimmed))
        .collect();

    if candidates.is_empty() {
        return Ok(None);
    }

    // Helper to find the owning House ID for a Universe ID
    let get_owner = |uni_id: &str| -> &str {
        registry
            .houses
            .iter()
            .find(|h| h.universe_ids.iter().any(|u| u == uni_id))
            .map(|h| h.id.as_str())
            .unwrap_or(DEFAULT_HOUSE_ID)
    };

    if candidates.len() == 1 {
        let owner = get_owner(&candidates[0].id);
        if owner == doc_house_id {
            return Ok(Some(candidates[0].id.clone()));
        } else {
            return Err(format!(
                "Cannot resolve legacy universe '{}': sole candidate '{}' is owned by House '{}', not document House '{}'",
                trimmed, candidates[0].id, owner, doc_house_id
            ));
        }
    }

    // Multiple candidates share the same display name across Houses
    let scoped_candidates: Vec<&crate::thought::Universe> = candidates
        .into_iter()
        .filter(|u| get_owner(&u.id) == doc_house_id)
        .collect();

    if scoped_candidates.len() == 1 {
        return Ok(Some(scoped_candidates[0].id.clone()));
    }

    if scoped_candidates.is_empty() {
        Err(format!(
            "Cannot resolve ambiguous legacy universe '{}': candidates exist in other Houses, but none in document House '{}'",
            trimmed, doc_house_id
        ))
    } else {
        Err(format!(
            "Cannot resolve ambiguous legacy universe '{}': multiple candidates ({}) match in document House '{}'",
            trimmed, scoped_candidates.len(), doc_house_id
        ))
    }
}
