use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

fn default_true() -> bool {
    true
}

pub fn default_categories() -> Vec<String> {
    vec![
        "characters".into(),
        "locations".into(),
        "factions".into(),
        "rules".into(),
        "cultures".into(),
        "artifacts".into(),
        "events".into(),
        "other".into(),
    ]
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct LorebookAttribute {
    #[serde(default)]
    pub id: String,
    pub key: String,
    pub value: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct CharacterFields {
    pub role: Option<String>,
    pub species: Option<String>,
    pub affiliation: Option<String>,
    pub residence: Option<String>,
    pub goals: Option<String>,
    pub motivations: Option<String>,
    pub strengths: Option<String>,
    pub weaknesses: Option<String>,
    pub age: Option<String>,
    pub gender: Option<String>,
    pub aliases: Option<Vec<String>>,
    pub vital_status: Option<String>,
    pub physical_appearance: Option<String>,
    pub clothing_attire: Option<String>,
    pub personality: Option<String>,
    pub occupation: Option<String>,
    pub narrative_role: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct LocationFields {
    pub location_type: Option<String>,
    pub region: Option<String>,
    pub inhabitants: Option<String>,
    pub factions: Option<String>,
    pub notable_events: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct FactionPosition {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub branch_id: Option<String>,
    pub parent_position_id: Option<String>,
    pub holder_ids: Option<Vec<String>>,
    pub sort_order: Option<f64>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct FactionBranch {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub parent_branch_id: Option<String>,
    pub sort_order: Option<f64>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct FactionFields {
    pub faction_type: Option<String>,
    pub leadership: Option<String>,
    pub ideology: Option<String>,
    pub territory: Option<String>,
    pub territory_notes: Option<String>,
    pub allies: Option<String>,
    pub rivals: Option<String>,
    pub positions: Option<Vec<FactionPosition>>,
    pub branches: Option<Vec<FactionBranch>>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct ArtifactFields {
    pub artifact_type: Option<String>,
    pub owner: Option<String>,
    pub creator: Option<String>,
    pub origin: Option<String>,
    pub powers: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct EventFields {
    pub event_type: Option<String>,
    pub location: Option<String>,
    pub participants: Option<String>,
    pub date_era: Option<String>,
    pub outcome: Option<String>,
    pub significance: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct RuleFields {
    pub system_type: Option<String>,
    pub principles: Option<String>,
    pub limitations: Option<String>,
    pub exceptions: Option<String>,
    pub consequences: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PublishedDoc {
    pub id: String,
    pub title: String,
    pub category: String,
    pub entry_type: String,
    pub canon_status: String,
    pub attributes: Vec<LorebookAttribute>,
    pub character_fields: Option<CharacterFields>,
    pub location_fields: Option<LocationFields>,
    pub faction_fields: Option<FactionFields>,
    pub artifact_fields: Option<ArtifactFields>,
    pub rule_fields: Option<RuleFields>,
    pub event_fields: Option<EventFields>,
    pub prose: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChapterExcerptSelection {
    pub chapter_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub heading: Option<String>,
    pub excerpt_text: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicationRequest {
    pub universe_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default = "default_true")]
    pub include_universe_description: bool,
    #[serde(default = "default_true")]
    pub include_table_of_contents: bool,
    #[serde(default = "default_categories")]
    pub selected_categories: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_entity_ids: Option<Vec<String>>,
    #[serde(default = "default_true")]
    pub include_entity_prose: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub included_attribute_keys: Option<Vec<String>>,
    #[serde(default = "default_true")]
    pub include_factions: bool,
    #[serde(default = "default_true")]
    pub include_faction_hierarchy: bool,
    #[serde(default = "default_true")]
    pub include_faction_holders: bool,
    #[serde(default = "default_true")]
    pub include_relationships: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relationship_types: Option<Vec<String>>,
    #[serde(default)]
    pub include_timeline: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_milestone_ids: Option<Vec<String>>,
    #[serde(default)]
    pub include_alternate_continuities: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_branch_ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub selected_excerpts: Vec<ChapterExcerptSelection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filter_spoilers_after_milestone_id: Option<String>,
    #[serde(default)]
    pub include_drafts: bool,
    #[serde(default)]
    pub include_speculative: bool,
    #[serde(default)]
    pub include_archived: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TocItem {
    pub title: String,
    pub anchor: String,
    pub level: u32,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<TocItem>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicationWarning {
    pub code: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PublicationField {
    pub label: String,
    pub value: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PublicationHolderLink {
    pub title: String,
    pub anchor: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PublicationHierarchyNode {
    pub node_type: String, // "branch" or "position"
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub holders: Vec<PublicationHolderLink>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<PublicationHierarchyNode>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PublicationEntry {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub institutional_positions: Vec<PublicationField>,
    pub title: String,
    pub anchor: String,
    pub category: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fields: Vec<PublicationField>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prose: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hierarchy: Option<PublicationHierarchyNode>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PublicationSection {
    pub category: String,
    pub title: String,
    pub anchor: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub entries: Vec<PublicationEntry>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PublicationRelationship {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub connections: Vec<PublicationRelationship>,
    #[serde(default)]
    pub provenance: String,
    pub source_title: String,
    pub source_anchor: String,
    pub target_title: String,
    pub target_anchor: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub directed: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PublicationStateChange {
    pub entity_title: String,
    pub entity_anchor: String,
    pub property_key: String,
    pub previous_value: String,
    pub new_value: String,
}

/// Internal selected-source lookup. Never serialized into a publication or portable package.
#[derive(Clone, Debug, Default)]
pub struct PublicationChapterSource {
    pub title: String,
    pub book_name: String,
    pub milestone_id: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PublicationNarrativeReference {
    pub chapter_title: String,
    pub book_name: String,
    pub excerpt_anchor: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PublicationMilestone {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub references: Vec<PublicationNarrativeReference>,
    pub title: String,
    pub anchor: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub era: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub changes: Vec<PublicationStateChange>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PublicationTimeline {
    pub title: String,
    pub anchor: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub milestones: Vec<PublicationMilestone>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PublicationDivergenceRef {
    pub title: String,
    pub era: String,
    pub anchor: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PublicationBranch {
    pub name: String,
    pub anchor: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub divergence_milestone: Option<PublicationDivergenceRef>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub milestones: Vec<PublicationMilestone>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PublicationExcerpt {
    pub heading: String,
    pub anchor: String,
    pub chapter_title: String,
    pub book_name: String,
    pub excerpt_text: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PublicationDocument {
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub universe_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub universe_description: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub table_of_contents: Vec<TocItem>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sections: Vec<PublicationSection>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub relationships: Vec<PublicationRelationship>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeline: Option<PublicationTimeline>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub alternate_continuities: Vec<PublicationBranch>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub excerpts: Vec<PublicationExcerpt>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicationPreview {
    pub title: String,
    pub universe_name: String,
    pub table_of_contents: Vec<TocItem>,
    pub entry_count: usize,
    pub category_counts: BTreeMap<String, usize>,
    pub relationship_count: usize,
    pub milestone_count: usize,
    pub excerpt_count: usize,
    pub word_count: usize,
    pub generated_markdown: String,
    pub warnings: Vec<PublicationWarning>,
    pub source_fingerprint: String,
    pub document: PublicationDocument,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublishMarkdownRequest {
    pub request: PublicationRequest,
    pub destination_path: String,
    pub expected_source_fingerprint: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublishMarkdownResult {
    pub destination_path: String,
    pub bytes_written: usize,
    pub word_count: usize,
    pub sha256: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublishPdfRequest {
    pub request: PublicationRequest,
    pub destination_path: String,
    pub expected_source_fingerprint: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pdf_bytes: Option<Vec<u8>>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublishPdfResult {
    pub destination_path: String,
    pub bytes_written: usize,
    pub page_count: usize,
    pub word_count: usize,
    pub sha256: String,
}
