use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use chrono::Utc;
use walkdir::WalkDir;
use std::sync::{Arc, Mutex};
use crate::models::{
    default_house_id, is_valid_house_id, normalize_house_name,
    parse_house_id_from_frontmatter, CreateHouseInput, DocumentDetail, DocumentMetadata,
    DocumentType, Frontmatter, HouseIntegrityIssue, HouseIntegrityReport, HouseRecord,
    HouseRegistry, IntegrityIssueType, ReindexReport, SearchResult,
    UpdateHouseInput, CURRENT_HOUSE_REGISTRY_SCHEMA_VERSION, DEFAULT_HOUSE_ID,
    UniverseMoveJournal, UniverseMoveResult, UniverseMoveStage,
};

const FRONTMATTER_PREFIX: &str = "---json\n";
const FRONTMATTER_SUFFIX: &str = "\n---\n";

#[derive(Clone)]
pub struct StorageManager {
    library_root: PathBuf,
    registry_lock: Arc<Mutex<()>>,
}

impl StorageManager {
    pub fn new<P: AsRef<Path>>(root: P) -> Self {
        StorageManager {
            library_root: root.as_ref().to_path_buf(),
            registry_lock: Arc::new(Mutex::new(())),
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
        fs::create_dir_all(self.library_root.join("Manuscripts"))?;
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


    // =========================================================================
    // Canonical House Registry & Universe Mapping (Phase 2)
    // =========================================================================

    pub fn get_registry_lock(&self) -> Arc<Mutex<()>> {
        Arc::clone(&self.registry_lock)
    }

    /// Read canonical House registry from library/library.json.
    /// If library.json contains no house_registry, returns synthesized default House.
    /// Never overwrites library.json merely because it was read.
    pub fn read_house_registry(&self) -> Result<HouseRegistry, String> {
        let manifest_path = self.library_root.join("library.json");
        if !manifest_path.exists() {
            return Ok(HouseRegistry::default_registry(&Utc::now().to_rfc3339()));
        }

        let raw = fs::read_to_string(&manifest_path)
            .map_err(|e| format!("Failed to read library.json: {}", e))?;

        let value: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|e| format!("Corrupted library.json: Invalid JSON syntax: {}", e))?;

        let obj = value.as_object()
            .ok_or_else(|| "Corrupted library.json: Root manifest must be a JSON object".to_string())?;

        let registry_val = match obj.get("house_registry") {
            Some(v) => v,
            None => {
                // Valid legacy manifest without house_registry
                return Ok(HouseRegistry::default_registry(&Utc::now().to_rfc3339()));
            }
        };

        let registry: HouseRegistry = serde_json::from_value(registry_val.clone())
            .map_err(|e| format!("Corrupted house_registry schema in library.json: {}", e))?;

        if registry.schema_version > CURRENT_HOUSE_REGISTRY_SCHEMA_VERSION {
            return Err(format!(
                "Unsupported house_registry schema version: {}. Application supports up to version {}.",
                registry.schema_version, CURRENT_HOUSE_REGISTRY_SCHEMA_VERSION
            ));
        }

        Self::validate_registry_invariants(&registry)?;

        Ok(registry)
    }

    /// Validate in-memory registry invariants (uniqueness of IDs, names, default house existence).
    pub fn validate_registry_invariants(registry: &HouseRegistry) -> Result<(), String> {
        if registry.houses.is_empty() {
            return Err("House registry must contain at least one House".to_string());
        }

        let default_house = registry.houses.iter().find(|h| h.id == DEFAULT_HOUSE_ID);
        match default_house {
            Some(dh) => {
                if dh.archived {
                    return Err("The Default House cannot be archived".to_string());
                }
            }
            None => {
                return Err(format!("House registry is missing required Default House ('{}')", DEFAULT_HOUSE_ID));
            }
        }

        let mut seen_ids = std::collections::BTreeSet::new();
        let mut seen_active_names = std::collections::BTreeSet::new();
        let mut seen_universe_ids = std::collections::BTreeMap::new();

        for house in &registry.houses {
            if !is_valid_house_id(&house.id) {
                return Err(format!("Invalid House ID: '{}'. Must start with 'house-' or be '{}'", house.id, DEFAULT_HOUSE_ID));
            }
            if !seen_ids.insert(&house.id) {
                return Err(format!("Duplicate House ID in registry: '{}'", house.id));
            }

            let normalized_name = normalize_house_name(&house.name)?;
            if !house.archived {
                let name_key = normalized_name.to_lowercase();
                if !seen_active_names.insert(name_key) {
                    return Err(format!("Duplicate active House name: '{}'", house.name));
                }
            }

            // Universe ownership invariants (L1 & L2: at most one house per universe)
            for uni_id in &house.universe_ids {
                let uni_trimmed = uni_id.trim();
                if uni_trimmed.is_empty() {
                    return Err(format!("House '{}' contains an empty universe ID", house.id));
                }
                if uni_trimmed.len() > 128 || uni_trimmed.chars().any(|c| c.is_control() || c == '/' || c == '\\') {
                    return Err(format!("House '{}' contains an invalid universe ID: '{}'", house.id, uni_trimmed));
                }
                if let Some(existing_house) = seen_universe_ids.insert(uni_trimmed.to_string(), &house.id) {
                    return Err(format!(
                        "Universe '{}' is assigned to multiple Houses ('{}' and '{}')",
                        uni_trimmed, existing_house, house.id
                    ));
                }
            }
        }

        Ok(())
    }

    /// Atomically mutate the House registry in library.json under in-process mutex lock.
    /// Preserves all unrelated top-level keys in library.json.
    /// Flushes and syncs temporary file before rename.
    pub fn mutate_house_registry<F, R>(&self, mutator: F) -> Result<R, String>
    where
        F: FnOnce(&mut HouseRegistry) -> Result<R, String>,
    {
        let _guard = self.registry_lock.lock().map_err(|e| e.to_string())?;
        self.mutate_house_registry_unlocked(mutator)
    }

    pub fn mutate_house_registry_unlocked<F, R>(&self, mutator: F) -> Result<R, String>
    where
        F: FnOnce(&mut HouseRegistry) -> Result<R, String>,
    {

        let manifest_path = self.library_root.join("library.json");
        let now = Utc::now().to_rfc3339();

        let mut root_obj = if manifest_path.exists() {
            let raw = fs::read_to_string(&manifest_path)
                .map_err(|e| format!("Failed to read library.json: {}", e))?;
            let val: serde_json::Value = serde_json::from_str(&raw)
                .map_err(|e| format!("Corrupted library.json: Invalid JSON syntax: {}", e))?;
            val.as_object().cloned()
                .ok_or_else(|| "Corrupted library.json: Root manifest must be a JSON object".to_string())?
        } else {
            let mut obj = serde_json::Map::new();
            obj.insert("name".to_string(), serde_json::json!("MetaCognition Notebook Library"));
            obj.insert("version".to_string(), serde_json::json!("1.0"));
            obj.insert("created_at".to_string(), serde_json::json!(now.clone()));
            obj.insert("description".to_string(), serde_json::json!("Canonical managed library for MetaCognition Notebook documents"));
            obj
        };

        let mut registry = match root_obj.get("house_registry") {
            Some(v) => {
                let reg: HouseRegistry = serde_json::from_value(v.clone())
                    .map_err(|e| format!("Corrupted house_registry schema in library.json: {}", e))?;
                if reg.schema_version > CURRENT_HOUSE_REGISTRY_SCHEMA_VERSION {
                    return Err(format!(
                        "Unsupported house_registry schema version: {}. Application supports up to version {}.",
                        reg.schema_version, CURRENT_HOUSE_REGISTRY_SCHEMA_VERSION
                    ));
                }
                Self::validate_registry_invariants(&reg)?;
                reg
            }
            None => HouseRegistry::default_registry(&now),
        };

        let result = mutator(&mut registry)?;

        Self::validate_registry_invariants(&registry)?;

        let reg_value = serde_json::to_value(&registry)
            .map_err(|e| format!("Failed to serialize house_registry: {}", e))?;

        root_obj.insert("house_registry".to_string(), reg_value);

        let final_raw = serde_json::to_string_pretty(&root_obj)
            .map_err(|e| format!("Failed to format library.json: {}", e))?;

        // Write atomic via temp file in same directory
        let temp_filename = format!(".tmp_library_{}_{}.tmp", uuid::Uuid::new_v4(), std::process::id());
        let temp_path = self.library_root.join(temp_filename);

        {
            let mut tmp_file = File::create(&temp_path)
                .map_err(|e| format!("Failed to create temporary manifest file: {}", e))?;
            tmp_file.write_all(final_raw.as_bytes())
                .map_err(|e| format!("Failed to write to temporary manifest file: {}", e))?;
            tmp_file.sync_all()
                .map_err(|e| format!("Failed to flush temporary manifest file: {}", e))?;
        }

        fs::rename(&temp_path, &manifest_path)
            .map_err(|e| {
                let _ = fs::remove_file(&temp_path);
                format!("Failed to rename temporary manifest file to library.json: {}", e)
            })?;

        Ok(result)
    }

    /// Create a new House in the registry.
    pub fn create_house(&self, input: CreateHouseInput) -> Result<HouseRecord, String> {
        let clean_name = normalize_house_name(&input.name)?;
        let now = Utc::now().to_rfc3339();
        let house_id = format!("house-{}", uuid::Uuid::new_v4());

        let new_house = HouseRecord {
            id: house_id,
            name: clean_name,
            description: input.description.and_then(|d| {
                let t = d.trim().to_string();
                if t.is_empty() { None } else { Some(t) }
            }),
            color: input.color.unwrap_or_else(crate::models::default_house_color),
            icon: input.icon.unwrap_or_else(crate::models::default_house_icon),
            enabled_studios: input.enabled_studios.unwrap_or_else(crate::models::default_authoring_studios),
            manuscript_tools_enabled: input.manuscript_tools_enabled.unwrap_or(true),
            universe_ids: Vec::new(),
            created_at: now.clone(),
            updated_at: now,
            archived: false,
        };

        let house_to_return = new_house.clone();

        self.mutate_house_registry(move |registry| {
            // Check name uniqueness among active houses
            let name_key = house_to_return.name.to_lowercase();
            if registry.houses.iter().any(|h| !h.archived && h.name.to_lowercase() == name_key) {
                return Err(format!("An active House named '{}' already exists", house_to_return.name));
            }
            registry.houses.push(house_to_return);
            Ok(())
        })?;

        Ok(new_house)
    }

    /// Update an existing House in the registry.
    pub fn update_house(&self, input: UpdateHouseInput) -> Result<HouseRecord, String> {
        let now = Utc::now().to_rfc3339();

        let updated_house = self.mutate_house_registry(|registry| {
            let house_idx = registry.houses.iter().position(|h| h.id == input.id)
                .ok_or_else(|| format!("House with ID '{}' not found", input.id))?;

            if let Some(new_name) = input.name {
                let clean = normalize_house_name(&new_name)?;
                let name_key = clean.to_lowercase();
                if registry.houses.iter().any(|h| h.id != input.id && !h.archived && h.name.to_lowercase() == name_key) {
                    return Err(format!("An active House named '{}' already exists", clean));
                }
                registry.houses[house_idx].name = clean;
            }

            let house = &mut registry.houses[house_idx];

            if let Some(desc) = input.description {
                house.description = desc.and_then(|d| {
                    let t = d.trim().to_string();
                    if t.is_empty() { None } else { Some(t) }
                });
            }

            if let Some(color) = input.color {
                let trimmed = color.trim().to_string();
                if !trimmed.is_empty() {
                    house.color = trimmed;
                }
            }

            if let Some(icon) = input.icon {
                let trimmed = icon.trim().to_string();
                if !trimmed.is_empty() {
                    house.icon = trimmed;
                }
            }

            if let Some(studios) = input.enabled_studios {
                let mut dedupped = Vec::new();
                for s in studios {
                    if !dedupped.contains(&s) {
                        dedupped.push(s);
                    }
                }
                house.enabled_studios = dedupped;
            }

            if let Some(manuscript_enabled) = input.manuscript_tools_enabled {
                house.manuscript_tools_enabled = manuscript_enabled;
            }

            house.updated_at = now;
            Ok(house.clone())
        })?;

        Ok(updated_house)
    }

    /// Archive an existing House. Default House cannot be archived.
    pub fn archive_house(&self, id: &str) -> Result<HouseRecord, String> {
        if id == DEFAULT_HOUSE_ID {
            return Err("The Default House cannot be archived".to_string());
        }

        let now = Utc::now().to_rfc3339();
        let archived = self.mutate_house_registry(|registry| {
            let house = registry.houses.iter_mut().find(|h| h.id == id)
                .ok_or_else(|| format!("House with ID '{}' not found", id))?;
            house.archived = true;
            house.updated_at = now;
            Ok(house.clone())
        })?;

        Ok(archived)
    }

    /// Restore an archived House.
    pub fn restore_house(&self, id: &str) -> Result<HouseRecord, String> {
        let now = Utc::now().to_rfc3339();
        let restored = self.mutate_house_registry(|registry| {
            let house_idx = registry.houses.iter().position(|h| h.id == id)
                .ok_or_else(|| format!("House with ID '{}' not found", id))?;

            let name_key = registry.houses[house_idx].name.to_lowercase();
            if registry.houses.iter().any(|h| h.id != id && !h.archived && h.name.to_lowercase() == name_key) {
                return Err(format!(
                    "Cannot restore House '{}': another active House with this name already exists",
                    registry.houses[house_idx].name
                ));
            }

            let house = &mut registry.houses[house_idx];
            house.archived = false;
            house.updated_at = now;
            Ok(house.clone())
        })?;

        Ok(restored)
    }

    /// Get owning House ID for a Lorebook Universe ID.
    /// Invariant L3: Unassigned Universes resolve to DEFAULT_HOUSE_ID.
    pub fn get_universe_owning_house(&self, universe_id: &str) -> Result<String, String> {
        let registry = self.read_house_registry()?;
        for house in registry.houses {
            if house.universe_ids.iter().any(|u| u == universe_id) {
                return Ok(house.id);
            }
        }
        Ok(DEFAULT_HOUSE_ID.to_string())
    }

    /// Read the Lorebook Web of Thought planning catalog plan if it exists in library/Lorebooks/.
    pub fn get_catalog_plan(&self) -> Option<crate::thought::Plan> {
        let lorebooks_dir = self.library_root.join("Lorebooks");
        if !lorebooks_dir.exists() {
            return None;
        }
        for entry in walkdir::WalkDir::new(&lorebooks_dir).follow_links(false).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() && entry.path().extension().is_some_and(|ext| ext == "md") {
                if let Ok(rel) = entry.path().strip_prefix(&self.library_root) {
                    let rel_str = rel.to_string_lossy().replace('\\', "/");
                    if let Ok(doc) = self.read_document(&rel_str) {
                        if let Some(ref raw_meta) = doc.metadata.metadata_json {
                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(raw_meta) {
                                if let Some(plan_val) = val.get(crate::thought::KEY) {
                                    if let Ok(plan) = serde_json::from_value::<crate::thought::Plan>(plan_val.clone()) {
                                        return Some(plan);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        None
    }

    /// Validate universe assignment safety:
    /// 1. Reject moving an already-owned universe (whether explicitly assigned or implicitly owned by house-default).
    /// 2. Check entity document ownership compatibility (reject if existing entity docs belong to another House).
    /// 3. If catalog exists, reject completely unknown universe IDs.
    pub fn validate_universe_assignment(&self, registry: &HouseRegistry, universe_id: &str, target_house_id: &str) -> Result<(), String> {
        let uni_trimmed = universe_id.trim();
        if uni_trimmed.is_empty() {
            return Err("Universe ID cannot be empty".to_string());
        }
        if uni_trimmed.len() > 128 || uni_trimmed.chars().any(|c| c.is_control() || c == '/' || c == '\\') {
            return Err(format!("Invalid universe ID syntax: '{}'", universe_id));
        }

        let target_house = registry.houses.iter().find(|h| h.id == target_house_id)
            .ok_or_else(|| format!("Target House '{}' does not exist", target_house_id))?;

        if target_house.archived {
            return Err(format!("Cannot assign universe to archived House '{}'", target_house_id));
        }

        // Check if universe is already explicitly assigned to any House
        for house in &registry.houses {
            if house.universe_ids.iter().any(|u| u == uni_trimmed) {
                if house.id == target_house_id {
                    // Already assigned to target house: idempotent success
                    return Ok(());
                } else {
                    return Err(format!(
                        "Universe '{}' is already owned by House '{}'. Reassignment across Houses requires a coordinated move operation.",
                        uni_trimmed, house.id
                    ));
                }
            }
        }

        // Scan Lorebook entities and catalog to check document ownership compatibility
        let lorebooks_dir = self.library_root.join("Lorebooks");
        if lorebooks_dir.exists() {
            let mut catalog_plan: Option<crate::thought::Plan> = None;
            let mut matched_entity_docs = 0;

            // Scan files in Lorebooks/
            for entry in WalkDir::new(&lorebooks_dir).follow_links(false).into_iter().filter_map(|e| e.ok()) {
                if entry.file_type().is_file() && entry.path().extension().is_some_and(|ext| ext == "md") {
                    if let Ok(rel) = entry.path().strip_prefix(&self.library_root) {
                        let rel_str = rel.to_string_lossy().replace('\\', "/");
                        if let Ok(doc) = self.read_document(&rel_str) {
                            if let Some(raw_meta) = &doc.metadata.metadata_json {
                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(raw_meta) {
                                    if let Some(plan_val) = val.get(crate::thought::KEY) {
                                        if let Ok(plan) = serde_json::from_value::<crate::thought::Plan>(plan_val.clone()) {
                                            catalog_plan = Some(plan);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            for entry in WalkDir::new(&lorebooks_dir).follow_links(false).into_iter().filter_map(|e| e.ok()) {
                if entry.file_type().is_file() && entry.path().extension().is_some_and(|ext| ext == "md") {
                    if let Ok(rel) = entry.path().strip_prefix(&self.library_root) {
                        let rel_str = rel.to_string_lossy().replace('\\', "/");
                        if let Ok(doc) = self.read_document(&rel_str) {
                            let mut belongs_to_universe = false;

                            if let Some(raw_meta) = &doc.metadata.metadata_json {
                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(raw_meta) {
                                    if val.get("universe_id").and_then(|v| v.as_str()) == Some(uni_trimmed) {
                                        belongs_to_universe = true;
                                    }
                                    if !belongs_to_universe {
                                        if let Some(leg_name) = val.get("universe").and_then(|v| v.as_str()) {
                                            if let Some(ref plan) = catalog_plan {
                                                if plan.universes.iter().any(|u| u.id == uni_trimmed && u.name.eq_ignore_ascii_case(leg_name)) {
                                                    belongs_to_universe = true;
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            if !belongs_to_universe {
                                if let Some(ref plan) = catalog_plan {
                                    if plan.entities.iter().any(|e| e.id == doc.metadata.id && e.universe_id == uni_trimmed) {
                                        belongs_to_universe = true;
                                    }
                                }
                            }

                            if belongs_to_universe {
                                matched_entity_docs += 1;
                                if doc.metadata.house_id != target_house_id {
                                    return Err(format!(
                                        "Cannot assign universe '{}' to House '{}': entity document '{}' has conflicting ownership '{}'",
                                        uni_trimmed, target_house_id, doc.metadata.id, doc.metadata.house_id
                                    ));
                                }
                            }
                        }
                    }
                }
            }

            // If a catalog exists and contains universes, verify universe ID is known
            if let Some(ref plan) = catalog_plan {
                if !plan.universes.is_empty() {
                    let in_catalog = plan.universes.iter().any(|u| u.id == uni_trimmed);
                    let in_entities = plan.entities.iter().any(|e| e.universe_id == uni_trimmed);
                    if !in_catalog && !in_entities && matched_entity_docs == 0 {
                        return Err(format!("Universe '{}' does not exist in the Lorebook catalog", uni_trimmed));
                    }
                }
            }
        }

        Ok(())
    }


    pub fn get_operations_dir(&self) -> PathBuf {
        self.library_root.join(".operations")
    }

    pub fn get_universe_move_journal_path(&self) -> PathBuf {
        self.get_operations_dir().join("universe_move_journal.json")
    }

    pub fn has_pending_universe_move_journal(&self) -> Result<bool, String> {
        let p = self.get_universe_move_journal_path();
        Ok(p.exists())
    }

    pub fn write_universe_move_journal(&self, journal: &UniverseMoveJournal) -> Result<(), String> {
        let ops_dir = self.get_operations_dir();
        fs::create_dir_all(&ops_dir).map_err(|e| format!("Failed to create operations directory: {}", e))?;

        let json = serde_json::to_string_pretty(journal)
            .map_err(|e| format!("Failed to serialize universe move journal: {}", e))?;

        let temp_path = ops_dir.join(format!("universe_move_{}.partial", uuid::Uuid::new_v4()));
        {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp_path)
                .map_err(|e| format!("Failed to create temporary journal file: {}", e))?;
            file.write_all(json.as_bytes())
                .map_err(|e| format!("Failed to write temporary journal file: {}", e))?;
            file.sync_all()
                .map_err(|e| format!("Failed to sync temporary journal file: {}", e))?;
        }

        let journal_path = self.get_universe_move_journal_path();
        fs::rename(&temp_path, &journal_path).map_err(|e| {
            let _ = fs::remove_file(&temp_path);
            format!("Failed to commit universe move journal: {}", e)
        })?;

        Ok(())
    }

    pub fn read_universe_move_journal(&self) -> Result<Option<UniverseMoveJournal>, String> {
        let p = self.get_universe_move_journal_path();
        if !p.exists() {
            return Ok(None);
        }
        let content = fs::read_to_string(&p)
            .map_err(|e| format!("Failed to read universe move journal: {}", e))?;
        let journal: UniverseMoveJournal = serde_json::from_str(&content)
            .map_err(|e| format!("Corrupted universe move journal: {}", e))?;
        Ok(Some(journal))
    }

    pub fn remove_universe_move_journal(&self) -> Result<(), String> {
        let p = self.get_universe_move_journal_path();
        if p.exists() {
            fs::remove_file(&p).map_err(|e| format!("Failed to remove universe move journal: {}", e))?;
        }
        Ok(())
    }

    /// Move a universe from its current House to target_house_id in the registry.
    /// Returns the source_house_id.
    pub fn reassign_universe_in_registry(&self, universe_id: &str, target_house_id: &str) -> Result<String, String> {
        let _guard = self.registry_lock.lock().map_err(|e| e.to_string())?;
        self.reassign_universe_in_registry_unlocked(universe_id, target_house_id)
    }

    pub fn reassign_universe_in_registry_unlocked(&self, universe_id: &str, target_house_id: &str) -> Result<String, String> {
        let uni_trimmed = universe_id.trim();
        let target_trimmed = target_house_id.trim();
        let now = Utc::now().to_rfc3339();

        let mut source_house_id = DEFAULT_HOUSE_ID.to_string();

        self.mutate_house_registry_unlocked(|registry| {
            let target_idx = registry.houses.iter().position(|h| h.id == target_trimmed)
                .ok_or_else(|| format!("Target House '{}' does not exist", target_trimmed))?;

            if registry.houses[target_idx].archived {
                return Err(format!("Cannot move universe to archived House '{}'", target_trimmed));
            }

            if !registry.houses[target_idx].enabled_studios.contains(&crate::models::AuthoringStudio::Lorebook) {
                return Err(format!(
                    "Authoring studio 'lorebook' is disabled for House '{}'",
                    registry.houses[target_idx].name
                ));
            }

            // Find current owner
            for house in &mut registry.houses {
                if let Some(pos) = house.universe_ids.iter().position(|u| u == uni_trimmed) {
                    source_house_id = house.id.clone();
                    house.universe_ids.remove(pos);
                    house.updated_at = now.clone();
                    break;
                }
            }

            let target = &mut registry.houses[target_idx];
            if !target.universe_ids.contains(&uni_trimmed.to_string()) {
                target.universe_ids.push(uni_trimmed.to_string());
                target.updated_at = now;
            }

            Ok(())
        })?;

        Ok(source_house_id)
    }

    pub fn revert_universe_in_registry(&self, universe_id: &str, source_house_id: &str, target_house_id: &str) -> Result<(), String> {
        let _guard = self.registry_lock.lock().map_err(|e| e.to_string())?;
        self.revert_universe_in_registry_unlocked(universe_id, source_house_id, target_house_id)
    }

    pub fn revert_universe_in_registry_unlocked(&self, universe_id: &str, source_house_id: &str, target_house_id: &str) -> Result<(), String> {
        let uni_trimmed = universe_id.trim();
        let now = Utc::now().to_rfc3339();

        self.mutate_house_registry_unlocked(|registry| {
            for house in &mut registry.houses {
                if house.id == target_house_id {
                    if let Some(pos) = house.universe_ids.iter().position(|u| u == uni_trimmed) {
                        house.universe_ids.remove(pos);
                        house.updated_at = now.clone();
                    }
                }
            }
            if let Some(source) = registry.houses.iter_mut().find(|h| h.id == source_house_id) {
                if !source.universe_ids.contains(&uni_trimmed.to_string()) {
                    source.universe_ids.push(uni_trimmed.to_string());
                    source.updated_at = now;
                }
            }
            Ok(())
        })
    }

    pub fn recover_universe_move(&self, db: &mut crate::db::Database) -> Result<Option<UniverseMoveResult>, String> {
        let journal_opt = self.read_universe_move_journal()?;
        let journal = match journal_opt {
            Some(j) => j,
            None => return Ok(None),
        };

        match journal.stage {
            UniverseMoveStage::Planned => {
                // No mutations were performed. Safely discard journal.
                self.remove_universe_move_journal()?;
                Ok(None)
            }
            UniverseMoveStage::RegistryUpdated | UniverseMoveStage::DocumentsUpdated | UniverseMoveStage::Completed => {
                // Complete the move (Roll-Forward policy)
                // 1. Ensure registry assignment is to target_house_id
                let _ = self.reassign_universe_in_registry_unlocked(&journal.universe_id, &journal.target_house_id);

                // 2. Ensure all affected canonical documents on disk have target_house_id
                let mut moved_ids = Vec::new();
                for doc_entry in &journal.affected_documents {
                    if let Ok(mut doc) = self.read_document(&doc_entry.relative_path) {
                        if doc.metadata.house_id != journal.target_house_id {
                            let full_path = self.resolve_safe_path(&doc_entry.relative_path)?;
                            let raw_on_disk = fs::read_to_string(&full_path).map_err(|e| e.to_string())?;
                            if raw_on_disk.starts_with(FRONTMATTER_PREFIX) {
                                let _ = self.update_document_house_id(&doc_entry.relative_path, &journal.target_house_id)?;
                            } else {
                                doc.metadata.house_id = journal.target_house_id.clone();
                                doc.metadata.updated_at = Utc::now().to_rfc3339();
                                self.write_document_atomic(&doc_entry.relative_path, &doc)?;
                            }
                        }
                        if let Ok(reloaded) = self.read_document(&doc_entry.relative_path) {
                            let _ = db.upsert_document(&reloaded.metadata);
                            moved_ids.push(reloaded.metadata.id);
                        }
                    }
                }

                // 3. Remove completed journal
                self.remove_universe_move_journal()?;

                Ok(Some(UniverseMoveResult {
                    universe_id: journal.universe_id,
                    source_house_id: journal.source_house_id,
                    target_house_id: journal.target_house_id,
                    document_count: moved_ids.len(),
                    moved_document_ids: moved_ids,
                }))
            }
        }
    }

    /// Assign a Universe ID to a specific House.
    /// Invariant L1 & L2: At most one House per Universe.
    /// Hardening: Reassignment across Houses is strictly rejected and never modifies disk on failure.
    pub fn assign_universe_to_house(&self, universe_id: &str, target_house_id: &str) -> Result<(), String> {
        let uni_trimmed = universe_id.trim().to_string();
        let target_trimmed = target_house_id.trim().to_string();
        let now = Utc::now().to_rfc3339();

        self.mutate_house_registry(|registry| {
            self.validate_universe_assignment(registry, &uni_trimmed, &target_trimmed)?;

            let target = registry.houses.iter_mut().find(|h| h.id == target_trimmed)
                .ok_or_else(|| format!("Target House '{}' does not exist", target_trimmed))?;

            if !target.universe_ids.contains(&uni_trimmed) {
                target.universe_ids.push(uni_trimmed);
                target.updated_at = now;
            }

            Ok(())
        })
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
        if let Some(stripped) = raw.strip_prefix(FRONTMATTER_PREFIX) {
            if let Some(end_idx) = stripped.find(FRONTMATTER_SUFFIX) {
                let json_slice = &raw[FRONTMATTER_PREFIX.len()..FRONTMATTER_PREFIX.len() + end_idx];
                let content = &raw[FRONTMATTER_PREFIX.len() + end_idx + FRONTMATTER_SUFFIX.len()..];

                let fm: Frontmatter = serde_json::from_str(json_slice)
                    .map_err(|e| format!("Invalid document frontmatter JSON: {}", e))?;

                let metadata_json = fm.metadata.map(|v| v.to_string());
                let house_id = parse_house_id_from_frontmatter(fm.house_id.as_deref())?;

                return Ok(DocumentDetail {
                    metadata: DocumentMetadata {
                        id: fm.id,
                        title: fm.title,
                        doc_type: fm.doc_type,
                        house_id,
                        relative_path: relative_path.to_string(),
                        parent_id: fm.parent_id,
                        metadata_json,
                        created_at: fm.created_at,
                        updated_at: fm.updated_at,
                        tags: fm.tags,
                    },
                    content: content.to_string(),
                });
            } else {
                return Err(format!("Unterminated document frontmatter in {}", relative_path));
            }
        }

        // Fallback for raw markdown files without frontmatter
        let doc_type = if relative_path.starts_with("Poetry") {
            DocumentType::Poetry
        } else if relative_path.starts_with("Philosophy") {
            DocumentType::Philosophy
        } else if relative_path.starts_with("Manuscripts") {
            DocumentType::Manuscript
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
                house_id: default_house_id(),
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

        let existing_object = fs::read_to_string(&full_path)
            .ok()
            .and_then(|raw| {
                raw.strip_prefix(FRONTMATTER_PREFIX)
                    .and_then(|rest| rest.split_once(FRONTMATTER_SUFFIX))
                    .and_then(|(json, _)| serde_json::from_str::<serde_json::Value>(json).ok())
                    .and_then(|val| match val {
                        serde_json::Value::Object(map) => Some(map),
                        _ => None,
                    })
            });

        let normalized_house_id = parse_house_id_from_frontmatter(Some(&doc.metadata.house_id))?;
        let had_explicit_house_id = existing_object
            .as_ref()
            .is_some_and(|map| map.contains_key("house_id"));

        let fm_house_id = if normalized_house_id != DEFAULT_HOUSE_ID || had_explicit_house_id {
            Some(normalized_house_id)
        } else {
            None
        };

        let fm = Frontmatter {
            id: doc.metadata.id.clone(),
            title: doc.metadata.title.clone(),
            doc_type: doc.metadata.doc_type.clone(),
            house_id: fm_house_id,
            created_at: doc.metadata.created_at.clone(),
            updated_at: doc.metadata.updated_at.clone(),
            tags: doc.metadata.tags.clone(),
            parent_id: doc.metadata.parent_id.clone(),
            metadata: doc.metadata.metadata_json.as_deref().and_then(|s| serde_json::from_str(s).ok()),
        };

        // Retain unknown top-level frontmatter keys from externally authored files.
        let mut value = serde_json::to_value(&fm).map_err(|e| e.to_string())?;
        if let Some(original) = existing_object {
            let object = value.as_object_mut().unwrap();
            for (key, val) in original {
                if key == "house_id" {
                    continue;
                }
                object.entry(key).or_insert(val);
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

    /// Atomically update frontmatter house_id for a document without moving its physical location or altering content.
    /// Preserves all unknown frontmatter keys.
    pub fn update_document_house_id(&self, relative_path: &str, target_house_id: &str) -> Result<DocumentDetail, String> {
        let normalized_target = parse_house_id_from_frontmatter(Some(target_house_id))?;
        if !is_valid_house_id(&normalized_target) {
            return Err(format!("Malformed target House ID: '{}'", target_house_id));
        }

        let full_path = self.resolve_safe_path(relative_path)?;
        if !full_path.exists() {
            return Err(format!("Document file not found: {}", relative_path));
        }

        let raw = fs::read_to_string(&full_path)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        let (mut fm_value, content) = if let Some(stripped) = raw.strip_prefix(FRONTMATTER_PREFIX) {
            if let Some(end_idx) = stripped.find(FRONTMATTER_SUFFIX) {
                let json_slice = &raw[FRONTMATTER_PREFIX.len()..FRONTMATTER_PREFIX.len() + end_idx];
                let content_slice = &raw[FRONTMATTER_PREFIX.len() + end_idx + FRONTMATTER_SUFFIX.len()..];
                let val: serde_json::Value = serde_json::from_str(json_slice)
                    .map_err(|e| format!("Invalid frontmatter JSON: {}", e))?;
                let _validated_fm: Frontmatter = serde_json::from_str(json_slice)
                    .map_err(|e| format!("Invalid document frontmatter JSON: {}", e))?;
                (val, content_slice.to_string())
            } else {
                return Err(format!("Malformed frontmatter in {}", relative_path));
            }
        } else {
            return Err(format!("No frontmatter found in {}", relative_path));
        };

        let now = Utc::now().to_rfc3339();

        let obj = fm_value.as_object_mut()
            .ok_or_else(|| "Frontmatter must be a JSON object".to_string())?;

        obj.insert("house_id".to_string(), serde_json::json!(normalized_target));
        obj.insert("updated_at".to_string(), serde_json::json!(now));

        let json_str = serde_json::to_string_pretty(&fm_value)
            .map_err(|e| format!("Failed to serialize updated frontmatter: {}", e))?;

        let mut payload = String::new();
        payload.push_str(FRONTMATTER_PREFIX);
        payload.push_str(&json_str);
        payload.push_str(FRONTMATTER_SUFFIX);
        payload.push_str(&content);

        self.write_raw_atomic(relative_path, &payload)?;

        self.parse_document_content(&payload, relative_path)
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
        let backup_dest = backups_dir.join(format!("{}_{}_{}", timestamp, uuid::Uuid::new_v4(), file_name));

        fs::rename(&full_path, &backup_dest)
            .or_else(|_| { fs::copy(&full_path, &backup_dest)?; fs::remove_file(&full_path) })
            .map_err(|e| format!("Failed to archive deleted file: {}", e))?;

        Ok(())
    }

    /// Read-only integrity inspection for House ownership, orphaned attributions,
    /// conflicting entity-universe mappings, invalid registry universe entries,
    /// missing canonical files, and SQLite index vs disk frontmatter mismatches.
    /// Never mutates canonical document files or SQLite indexes.
    pub fn inspect_house_integrity(&self, db: Option<&crate::db::Database>) -> Result<HouseIntegrityReport, String> {
        let registry = self.read_house_registry()?;
        let known_house_ids: std::collections::BTreeSet<String> = registry.houses.iter().map(|h| h.id.clone()).collect();
        let mut issues = Vec::new();
        let mut total_scanned = 0;
        let mut orphaned_count = 0;
        let mut malformed_count = 0;
        let mut conflicting_entity_count = 0;
        let mut invalid_universe_mapping_count = 0;
        let mut canonical_index_mismatch_count = 0;
        let mut missing_canonical_file_count = 0;

        let mut catalog_plan: Option<crate::thought::Plan> = None;
        let mut lorebook_docs = Vec::new();

        for entry in walkdir::WalkDir::new(&self.library_root)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.is_file() && path.extension().is_some_and(|ext| ext == "md") {
                if let Ok(rel) = path.strip_prefix(&self.library_root) {
                    let rel_str = rel.to_string_lossy().replace('\\', "/");
                    if rel_str.starts_with("Backups/") || rel_str.starts_with("Attachments/") {
                        continue;
                    }

                    total_scanned += 1;

                    if let Ok(raw) = fs::read_to_string(path) {
                        if let Some(stripped) = raw.strip_prefix(FRONTMATTER_PREFIX) {
                            if let Some(end_idx) = stripped.find(FRONTMATTER_SUFFIX) {
                                let json_slice = &raw[FRONTMATTER_PREFIX.len()..FRONTMATTER_PREFIX.len() + end_idx];
                                if let Ok(fm_val) = serde_json::from_str::<serde_json::Value>(json_slice) {
                                    let doc_id = fm_val.get("id").and_then(|v| v.as_str()).map(ToString::to_string);

                                    if let Some(hid_val) = fm_val.get("house_id") {
                                        if let Some(raw_hid) = hid_val.as_str() {
                                            match parse_house_id_from_frontmatter(Some(raw_hid)) {
                                                Ok(hid) => {
                                                    if !known_house_ids.contains(&hid) {
                                                        orphaned_count += 1;
                                                        issues.push(HouseIntegrityIssue {
                                                            issue_type: IntegrityIssueType::OrphanedHouseId,
                                                            document_id: doc_id.clone(),
                                                            relative_path: Some(rel_str.clone()),
                                                            house_id: Some(hid.clone()),
                                                            universe_id: None,
                                                            message: format!("Document '{}' references unknown House '{}'", rel_str, hid),
                                                        });
                                                    }
                                                }
                                                Err(err_msg) => {
                                                    malformed_count += 1;
                                                    issues.push(HouseIntegrityIssue {
                                                        issue_type: IntegrityIssueType::MalformedHouseId,
                                                        document_id: doc_id.clone(),
                                                        relative_path: Some(rel_str.clone()),
                                                        house_id: Some(raw_hid.to_string()),
                                                        universe_id: None,
                                                        message: format!("Document '{}' has malformed house_id: {}", rel_str, err_msg),
                                                    });
                                                }
                                            }
                                        } else if !hid_val.is_null() {
                                            malformed_count += 1;
                                            issues.push(HouseIntegrityIssue {
                                                issue_type: IntegrityIssueType::MalformedHouseId,
                                                document_id: doc_id.clone(),
                                                relative_path: Some(rel_str.clone()),
                                                house_id: Some(hid_val.to_string()),
                                                universe_id: None,
                                                message: format!("Document '{}' has non-string house_id", rel_str),
                                            });
                                        }
                                    }

                                    if rel_str.starts_with("Lorebooks/") {
                                        if let Ok(doc) = self.read_document(&rel_str) {
                                            if let Some(ref meta_json) = doc.metadata.metadata_json {
                                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(meta_json) {
                                                    if let Some(plan_val) = val.get(crate::thought::KEY) {
                                                        if let Ok(plan) = serde_json::from_value::<crate::thought::Plan>(plan_val.clone()) {
                                                            catalog_plan = Some(plan);
                                                        }
                                                    }
                                                }
                                            }
                                            lorebook_docs.push(doc);
                                        }
                                    }
                                } else {
                                    malformed_count += 1;
                                    issues.push(HouseIntegrityIssue {
                                        issue_type: IntegrityIssueType::MalformedHouseId,
                                        document_id: None,
                                        relative_path: Some(rel_str.clone()),
                                        house_id: None,
                                        universe_id: None,
                                        message: format!("Document '{}' has invalid frontmatter JSON", rel_str),
                                    });
                                }
                            } else {
                                malformed_count += 1;
                                issues.push(HouseIntegrityIssue {
                                    issue_type: IntegrityIssueType::MalformedHouseId,
                                    document_id: None,
                                    relative_path: Some(rel_str.clone()),
                                    house_id: None,
                                    universe_id: None,
                                    message: format!("Document '{}' has unterminated frontmatter", rel_str),
                                });
                            }
                        }
                    }
                }
            }
        }

        // Validate universe mappings in registry against catalog
        if let Some(ref plan) = catalog_plan {
            for house in &registry.houses {
                for uni_id in &house.universe_ids {
                    let exists = plan.universes.iter().any(|u| u.id == *uni_id)
                        || plan.entities.iter().any(|e| e.universe_id == *uni_id);
                    if !exists && !plan.universes.is_empty() {
                        invalid_universe_mapping_count += 1;
                        issues.push(HouseIntegrityIssue {
                            issue_type: IntegrityIssueType::InvalidUniverseMapping,
                            document_id: None,
                            relative_path: None,
                            house_id: Some(house.id.clone()),
                            universe_id: Some(uni_id.clone()),
                            message: format!("House '{}' maps unknown universe ID '{}'", house.id, uni_id),
                        });
                    }
                }
            }

            // Validate Lorebook entity ownership compatibility
            for doc in &lorebook_docs {
                let mut doc_universe_id: Option<String> = None;
                if let Some(ref raw_meta) = doc.metadata.metadata_json {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(raw_meta) {
                        if let Some(uid) = val.get("universe_id").and_then(|v| v.as_str()) {
                            doc_universe_id = Some(uid.to_string());
                        } else if let Some(leg_name) = val.get("universe").and_then(|v| v.as_str()) {
                            if let Some(u) = plan.universes.iter().find(|u| u.name.eq_ignore_ascii_case(leg_name)) {
                                doc_universe_id = Some(u.id.clone());
                            }
                        }
                    }
                }
                if doc_universe_id.is_none() {
                    if let Some(e) = plan.entities.iter().find(|e| e.id == doc.metadata.id) {
                        doc_universe_id = Some(e.universe_id.clone());
                    }
                }

                if let Some(uni_id) = doc_universe_id {
                    let owning_house = self.get_universe_owning_house(&uni_id).unwrap_or_else(|_| crate::models::DEFAULT_HOUSE_ID.to_string());
                    if doc.metadata.house_id != owning_house {
                        conflicting_entity_count += 1;
                        issues.push(HouseIntegrityIssue {
                            issue_type: IntegrityIssueType::ConflictingEntityOwnership,
                            document_id: Some(doc.metadata.id.clone()),
                            relative_path: Some(doc.metadata.relative_path.clone()),
                            house_id: Some(doc.metadata.house_id.clone()),
                            universe_id: Some(uni_id.clone()),
                            message: format!(
                                "Lorebook entity '{}' (House '{}') conflicts with owning House '{}' of Universe '{}'",
                                doc.metadata.title, doc.metadata.house_id, owning_house, uni_id
                            ),
                        });
                    }
                }
            }
        }

        // Validate SQLite index vs canonical disk files if database is provided
        if let Some(database) = db {
            if let Ok(db_docs) = database.list_documents(None, None) {
                for db_doc in db_docs {
                    let path_res = self.resolve_safe_path(&db_doc.relative_path);
                    let file_exists = path_res.as_ref().map(|p| p.is_file()).unwrap_or(false);
                    if !file_exists {
                        missing_canonical_file_count += 1;
                        issues.push(HouseIntegrityIssue {
                            issue_type: IntegrityIssueType::MissingCanonicalFile,
                            document_id: Some(db_doc.id.clone()),
                            relative_path: Some(db_doc.relative_path.clone()),
                            house_id: Some(db_doc.house_id.clone()),
                            universe_id: None,
                            message: format!(
                                "Canonical document file for indexed document '{}' is missing from disk: '{}'",
                                db_doc.id, db_doc.relative_path
                            ),
                        });
                    } else if let Ok(disk_detail) = self.read_document(&db_doc.relative_path) {
                        if disk_detail.metadata.house_id != db_doc.house_id {
                            canonical_index_mismatch_count += 1;
                            issues.push(HouseIntegrityIssue {
                                issue_type: IntegrityIssueType::CanonicalIndexMismatch,
                                document_id: Some(db_doc.id.clone()),
                                relative_path: Some(db_doc.relative_path.clone()),
                                house_id: Some(db_doc.house_id.clone()),
                                universe_id: None,
                                message: format!(
                                    "Index house_id '{}' for document '{}' does not match canonical disk frontmatter house_id '{}'",
                                    db_doc.house_id, db_doc.id, disk_detail.metadata.house_id
                                ),
                            });
                        }
                    }
                }
            }
        }

        let mut incomplete_universe_move_count = 0;
        if let Ok(Some(journal)) = self.read_universe_move_journal() {
            incomplete_universe_move_count += 1;
            issues.push(HouseIntegrityIssue {
                issue_type: IntegrityIssueType::IncompleteUniverseMove,
                document_id: None,
                relative_path: None,
                house_id: Some(journal.target_house_id.clone()),
                universe_id: Some(journal.universe_id.clone()),
                message: format!(
                    "Incomplete Universe move detected for Universe '{}' from House '{}' to House '{}' (stage: {:?}). Recovery is required.",
                    journal.universe_id, journal.source_house_id, journal.target_house_id, journal.stage
                ),
            });
        }

        Ok(HouseIntegrityReport {
            total_documents_scanned: total_scanned,
            issues,
            orphaned_document_count: orphaned_count,
            malformed_document_count: malformed_count,
            conflicting_entity_count,
            invalid_universe_mapping_count,
            canonical_index_mismatch_count,
            missing_canonical_file_count,
            incomplete_universe_move_count,
        })
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
    use crate::models::normalize_house_id;

    #[test]
    fn repeated_entity_archives_keep_distinct_original_files() {
        let dir = tempfile::tempdir().unwrap();
        let manager = StorageManager::new(dir.path());
        manager.initialize().unwrap();
        let original = dir.path().join("Lorebooks/Entity.md");
        for body in ["First writing", "Second writing"] {
            fs::write(&original, body).unwrap();
            manager.safe_delete("Lorebooks/Entity.md").unwrap();
            assert!(!original.exists());
        }
        let mut copies: Vec<_> = fs::read_dir(dir.path().join("Backups")).unwrap()
            .map(|entry| fs::read_to_string(entry.unwrap().path()).unwrap()).collect();
        copies.sort();
        assert_eq!(copies, vec!["First writing", "Second writing"]);
    }

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
                house_id: default_house_id(),
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
        assert_eq!(read.metadata.house_id, DEFAULT_HOUSE_ID);
        assert_eq!(read.content, "Line 1\nLine 2\n\nLine 3\nLine 4");
    }

    #[test]
    fn test_phase1_frontmatter_house_id_parsing_and_preservation() {
        let temp_dir = tempfile::tempdir().expect("tempdir failed");
        let manager = StorageManager::new(temp_dir.path());
        manager.initialize().expect("initialize failed");

        // 1. Legacy document frontmatter without house_id parses to DEFAULT_HOUSE_ID
        let legacy_raw = r#"---json
{
  "id": "legacy-doc-1",
  "title": "Legacy Poem",
  "type": "poetry",
  "created_at": "2026-10-18T10:00:00Z",
  "updated_at": "2026-10-18T10:00:00Z",
  "tags": ["classic"],
  "custom_top_level": {"keep": "verbatim"}
}
---
Legacy body text."#;
        let legacy_path = temp_dir.path().join("Poetry/Legacy_Poem.md");
        fs::write(&legacy_path, legacy_raw).unwrap();

        let parsed_legacy = manager.read_document("Poetry/Legacy_Poem.md").unwrap();
        assert_eq!(parsed_legacy.metadata.id, "legacy-doc-1");
        assert_eq!(parsed_legacy.metadata.doc_type, DocumentType::Poetry);
        assert_eq!(parsed_legacy.metadata.house_id, DEFAULT_HOUSE_ID);
        assert_eq!(parsed_legacy.content, "Legacy body text.");
        // Reading / scanning must not rewrite the file on disk
        assert_eq!(fs::read_to_string(&legacy_path).unwrap(), legacy_raw);

        // Unrelated edit to legacy document keeps absent house_id omitted on disk while preserving unknown top-level keys
        let mut edited_legacy = parsed_legacy.clone();
        edited_legacy.content = "Updated legacy body text.".to_string();
        manager
            .write_document_atomic("Poetry/Legacy_Poem.md", &edited_legacy)
            .unwrap();
        let saved_legacy_raw = fs::read_to_string(&legacy_path).unwrap();
        let saved_legacy_json: serde_json::Value = serde_json::from_str(
            saved_legacy_raw
                .strip_prefix(FRONTMATTER_PREFIX)
                .unwrap()
                .split_once(FRONTMATTER_SUFFIX)
                .unwrap()
                .0,
        )
        .unwrap();
        assert!(saved_legacy_json.get("house_id").is_none());
        assert_eq!(saved_legacy_json["type"], "poetry");
        assert_eq!(saved_legacy_json["custom_top_level"]["keep"], "verbatim");

        // 2. Document frontmatter with explicit house_id parses and round-trips accurately
        let explicit_raw = r#"---json
{
  "id": "house-doc-2",
  "title": "Attributed Essay",
  "type": "philosophy",
  "house_id": "house-platonic-academy",
  "created_at": "2026-10-18T11:00:00Z",
  "updated_at": "2026-10-18T11:00:00Z",
  "tags": ["dialogues"],
  "external_tool_flag": true
}
---
Dialogues in the grove."#;
        let explicit_path = temp_dir.path().join("Philosophy/Attributed_Essay.md");
        fs::write(&explicit_path, explicit_raw).unwrap();

        let parsed_explicit = manager
            .read_document("Philosophy/Attributed_Essay.md")
            .unwrap();
        assert_eq!(parsed_explicit.metadata.id, "house-doc-2");
        assert_eq!(parsed_explicit.metadata.doc_type, DocumentType::Philosophy);
        assert_eq!(parsed_explicit.metadata.house_id, "house-platonic-academy");

        // Round-trip save preserves explicit house_id, type key, and unknown top-level keys
        let mut updated_explicit = parsed_explicit.clone();
        updated_explicit.content = "Dialogues in the grove (revised).".to_string();
        manager
            .write_document_atomic("Philosophy/Attributed_Essay.md", &updated_explicit)
            .unwrap();

        let reloaded_explicit = manager
            .read_document("Philosophy/Attributed_Essay.md")
            .unwrap();
        assert_eq!(reloaded_explicit.metadata.id, "house-doc-2");
        assert_eq!(
            reloaded_explicit.metadata.house_id,
            "house-platonic-academy"
        );
        assert_eq!(
            reloaded_explicit.content,
            "Dialogues in the grove (revised)."
        );

        let explicit_saved_raw = fs::read_to_string(&explicit_path).unwrap();
        let explicit_saved_json: serde_json::Value = serde_json::from_str(
            explicit_saved_raw
                .strip_prefix(FRONTMATTER_PREFIX)
                .unwrap()
                .split_once(FRONTMATTER_SUFFIX)
                .unwrap()
                .0,
        )
        .unwrap();
        assert_eq!(explicit_saved_json["house_id"], "house-platonic-academy");
        assert_eq!(explicit_saved_json["type"], "philosophy");
        assert_eq!(explicit_saved_json["external_tool_flag"], true);

        // 3. Malformed / whitespace house_id normalizes safely to DEFAULT_HOUSE_ID
        for malformed in ["", "   ", "bad/house", "bad\\house", "bad\nhouse"] {
            assert_eq!(normalize_house_id(Some(malformed)), DEFAULT_HOUSE_ID);
        }
    }

    #[test]
    fn test_phase2_canonical_house_registry_and_universe_mapping() {
        let temp_dir = tempfile::tempdir().expect("tempdir failed");
        let manager = StorageManager::new(temp_dir.path());
        manager.initialize().expect("initialize failed");

        let manifest_path = temp_dir.path().join("library.json");
        assert!(manifest_path.exists());

        // 1. Legacy manifest without house_registry reads synthesized Default House
        // and does NOT modify library.json on disk.
        let initial_manifest_bytes = fs::read(&manifest_path).unwrap();
        let registry = manager.read_house_registry().unwrap();
        assert_eq!(registry.schema_version, 1);
        assert_eq!(registry.default_house_id, DEFAULT_HOUSE_ID);
        assert_eq!(registry.houses.len(), 1);
        assert_eq!(registry.houses[0].id, DEFAULT_HOUSE_ID);
        assert_eq!(registry.houses[0].name, "Primary House");
        assert_eq!(fs::read(&manifest_path).unwrap(), initial_manifest_bytes);

        // 2. Create House: validates name, generates house-<uuid>, persists to library.json
        let created = manager.create_house(CreateHouseInput {
            name: "World of Eryndor".to_string(),
            description: Some("Epic high fantasy setting".to_string()),
            color: Some("emerald".to_string()),
            icon: Some("book-open".to_string()),
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Lorebook, crate::models::AuthoringStudio::Poetry]),
            manuscript_tools_enabled: Some(true),
        }).unwrap();

        assert!(created.id.starts_with("house-"));
        assert_eq!(created.name, "World of Eryndor");
        assert_eq!(created.color, "emerald");
        assert_eq!(created.enabled_studios, vec![crate::models::AuthoringStudio::Lorebook, crate::models::AuthoringStudio::Poetry]);
        assert!(created.manuscript_tools_enabled);

        // Verify library.json preserved unrelated top-level keys
        let updated_manifest: serde_json::Value = serde_json::from_str(&fs::read_to_string(&manifest_path).unwrap()).unwrap();
        assert_eq!(updated_manifest["name"], "MetaCognition Notebook Library");
        assert_eq!(updated_manifest["version"], "1.0");
        assert!(updated_manifest.get("created_at").is_some());
        assert_eq!(updated_manifest["house_registry"]["houses"].as_array().unwrap().len(), 2);

        // 3. Duplicate name among active houses is rejected (case-insensitive)
        let dup_err = manager.create_house(CreateHouseInput {
            name: "  world of eryndor  ".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: None,
            manuscript_tools_enabled: None,
        }).unwrap_err();
        assert!(dup_err.contains("already exists"));

        // 4. Update House: permits name, description, appearance, and enabled studios
        let updated = manager.update_house(UpdateHouseInput {
            id: created.id.clone(),
            name: Some("The Chronicles of Eryndor".to_string()),
            description: Some(Some("Revised description".to_string())),
            color: Some("purple".to_string()),
            icon: None,
            enabled_studios: Some(vec![crate::models::AuthoringStudio::Lorebook]),
            manuscript_tools_enabled: Some(false),
        }).unwrap();
        assert_eq!(updated.name, "The Chronicles of Eryndor");
        assert_eq!(updated.description.as_deref(), Some("Revised description"));
        assert_eq!(updated.color, "purple");
        assert_eq!(updated.enabled_studios, vec![crate::models::AuthoringStudio::Lorebook]);
        assert!(!updated.manuscript_tools_enabled);

        // 5. Universe Ownership Mapping (Invariants L1, L2, L3)
        // L3: unassigned universe resolves to DEFAULT_HOUSE_ID
        assert_eq!(manager.get_universe_owning_house("uni-unassigned").unwrap(), DEFAULT_HOUSE_ID);

        // Assign universe to custom House
        manager.assign_universe_to_house("uni-eryndor-1", &created.id).unwrap();
        assert_eq!(manager.get_universe_owning_house("uni-eryndor-1").unwrap(), created.id);

        // Reassigning universe across Houses is strictly rejected to preserve integrity
        let reassign_err = manager.assign_universe_to_house("uni-eryndor-1", DEFAULT_HOUSE_ID).unwrap_err();
        assert!(reassign_err.contains("already owned by House"));
        assert!(reassign_err.contains("Reassignment across Houses requires a coordinated move operation"));

        // Verify original assignment is preserved and never unlinked on failure
        assert_eq!(manager.get_universe_owning_house("uni-eryndor-1").unwrap(), created.id);
        let reg_after_reassign = manager.read_house_registry().unwrap();
        let custom_h = reg_after_reassign.houses.iter().find(|h| h.id == created.id).unwrap();
        assert!(custom_h.universe_ids.contains(&"uni-eryndor-1".to_string()));

        // Idempotent assignment to the same house succeeds
        manager.assign_universe_to_house("uni-eryndor-1", &created.id).unwrap();

        // 6. Archiving: Default House cannot be archived; custom House archives cleanly and retains universe
        assert!(manager.archive_house(DEFAULT_HOUSE_ID).is_err());

        let archived = manager.archive_house(&created.id).unwrap();
        assert!(archived.archived);
        // L6: Archived House retains its universe ownership
        assert_eq!(manager.get_universe_owning_house("uni-eryndor-1").unwrap(), created.id);

        // When a house is archived, another active house CAN use its name
        let reusable = manager.create_house(CreateHouseInput {
            name: "The Chronicles of Eryndor".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: None,
            manuscript_tools_enabled: None,
        }).unwrap();

        // But restoring the archived one now fails due to active name collision
        assert!(manager.restore_house(&created.id).is_err());

        // Archive the reusable one, then restoration succeeds
        manager.archive_house(&reusable.id).unwrap();
        let restored = manager.restore_house(&created.id).unwrap();
        assert!(!restored.archived);

        // 7. Malformed / unsupported schema version detection
        // Unsupported schema version
        let mut unsupported_manifest = updated_manifest.clone();
        unsupported_manifest["house_registry"]["schema_version"] = serde_json::json!(999);
        fs::write(&manifest_path, serde_json::to_string(&unsupported_manifest).unwrap()).unwrap();
        let unsupp_err = manager.read_house_registry().unwrap_err();
        assert!(unsupp_err.contains("Unsupported house_registry schema version"));

        // Malformed JSON syntax
        fs::write(&manifest_path, "not a valid json {{{{").unwrap();
        let corrupt_err = manager.read_house_registry().unwrap_err();
        assert!(corrupt_err.contains("Corrupted library.json"));
    }
    #[test]
    fn test_phase2_hardening_universe_and_registry_safety() {
        let temp_dir = tempfile::tempdir().expect("tempdir failed");
        let manager = StorageManager::new(temp_dir.path());
        manager.initialize().expect("initialize failed");

        // 1. Create a custom House
        let custom_house = manager.create_house(CreateHouseInput {
            name: "Archive House".to_string(),
            description: None,
            color: None,
            icon: None,
            enabled_studios: None,
            manuscript_tools_enabled: None,
        }).unwrap();

        // 2. Conflicting entity document ownership check
        // Create an entity document in Lorebooks belonging to uni-conflict with house-default ownership
        let entity_path = temp_dir.path().join("Lorebooks/ConflictingEntity.md");
        let entity_raw = r#"---json
{
  "id": "lore-entity-conflict-1",
  "title": "Ancient Citadel",
  "type": "lorebook",
  "created_at": "2026-10-18T10:00:00Z",
  "updated_at": "2026-10-18T10:00:00Z",
  "metadata": {
    "universe_id": "uni-conflict-1",
    "entry_type": "location"
  }
}
---
The citadel of the first age."#;
        fs::write(&entity_path, entity_raw).unwrap();

        // Attempting to assign uni-conflict-1 to custom_house MUST FAIL because its entity belongs to house-default
        let conflict_err = manager.assign_universe_to_house("uni-conflict-1", &custom_house.id).unwrap_err();
        assert!(conflict_err.contains("conflicting ownership"));
        assert!(conflict_err.contains("lore-entity-conflict-1"));

        // Registry remains completely clean: universe was not added
        let reg = manager.read_house_registry().unwrap();
        let custom_rec = reg.houses.iter().find(|h| h.id == custom_house.id).unwrap();
        assert!(!custom_rec.universe_ids.contains(&"uni-conflict-1".to_string()));

        // 3. Malformed frontmatter house_id error handling and non-overwriting
        let malformed_doc_path = temp_dir.path().join("Poetry/Malformed_House.md");
        let malformed_raw = r#"---json
{
  "id": "malformed-doc-1",
  "title": "Broken Poem",
  "type": "poetry",
  "house_id": "illegal/slash",

  "created_at": "2026-10-18T10:00:00Z",
  "updated_at": "2026-10-18T10:00:00Z"
}
---
Lines of verse."#;
        fs::write(&malformed_doc_path, malformed_raw).unwrap();

        // Reading malformed document returns Err
        let read_res = manager.read_document("Poetry/Malformed_House.md");
        assert!(read_res.is_err());
        assert!(read_res.unwrap_err().contains("illegal control characters or path separators"));

        // scan_and_reindex reports error without panic or crash
        let (_docs, report) = manager.scan_and_reindex();
        assert!(report.errors.iter().any(|e| e.contains("illegal control characters or path separators")));

        // File on disk remains intact and was not overwritten
        assert_eq!(fs::read_to_string(&malformed_doc_path).unwrap(), malformed_raw);

        // 4. Explicit unknown valid house_id is preserved verbatim (orphaned)
        let orphan_doc_path = temp_dir.path().join("Philosophy/Orphan_Essay.md");
        let orphan_raw = r#"---json
{
  "id": "orphan-doc-1",
  "title": "Orphaned Philosophy",
  "type": "philosophy",
  "house_id": "house-orphaned-realm",
  "created_at": "2026-10-18T10:00:00Z",
  "updated_at": "2026-10-18T10:00:00Z"
}
---
Thoughts from an unindexed house."#;
        fs::write(&orphan_doc_path, orphan_raw).unwrap();

        let parsed_orphan = manager.read_document("Philosophy/Orphan_Essay.md").unwrap();
        assert_eq!(parsed_orphan.metadata.house_id, "house-orphaned-realm");

        // Resaving orphan preserves explicit unknown house_id
        manager.write_document_atomic("Philosophy/Orphan_Essay.md", &parsed_orphan).unwrap();
        let reloaded_orphan = manager.read_document("Philosophy/Orphan_Essay.md").unwrap();
        assert_eq!(reloaded_orphan.metadata.house_id, "house-orphaned-realm");

        // 5. Invariant: Cannot archive Default House
        assert_eq!(
            manager.archive_house(DEFAULT_HOUSE_ID).unwrap_err(),
            "The Default House cannot be archived"
        );

        // 6. Invariant: Cannot assign universe to archived house
        let archived = manager.archive_house(&custom_house.id).unwrap();
        assert!(archived.archived);
        let assign_archived_err = manager.assign_universe_to_house("uni-new", &custom_house.id).unwrap_err();
        assert!(assign_archived_err.contains("Cannot assign universe to archived House"));
    }
}
