export type DocumentType = 'poetry' | 'philosophy' | 'lorebook' | 'manuscript';

export type SaveStatus = 'saved' | 'saving' | 'editing' | 'error' | 'unsaved';

export type SaveMode = 'automatic' | 'manual';

export interface SavePreferences {
  mode: SaveMode;
  debounceSeconds: number; // 1 to 10 seconds
}

export type PlanStatus = 'not_loaded' | 'loading' | 'no_catalog' | 'loaded' | 'error';

export interface DocumentMetadata {
  id: string;
  title: string;
  doc_type: DocumentType;
  house_id?: string;
  relative_path: string;
  parent_id?: string | null;
  metadata_json?: string | null;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface DocumentDetail {
  metadata: DocumentMetadata;
  content: string;
}

export interface LibraryInfo {
  library_path: string;
  db_path: string;
  document_count: number;
  poetry_count: number;
  philosophy_count: number;
  lorebook_count: number;
  manuscript_count?: number;
}

export interface SearchResult {
  id: string;
  title: string;
  doc_type: DocumentType;
  relative_path: string;
  snippet: string;
  match_type: 'title' | 'content';
  updated_at: string;
}

export interface ReindexReport {
  total_files_scanned: number;
  documents_indexed: number;
  errors: string[];
}

// Studio-specific metadata types
export interface PoetryMetadata {
  poetic_form?: string; // e.g., "Free Verse", "Sonnet", "Haiku"
  rhyme_scheme?: string;
  meter?: string;
}

export type PhilosophyClassification = 'premise' | 'argument' | 'objection' | 'example' | 'conclusion' | 'prose';

export interface PhilosophyParagraph {
  id: string;
  classification: PhilosophyClassification;
  text: string;
}

// Argument Web Types for Philosophy Studio
export type ArgumentRelationType = 'supports' | 'challenges' | 'expands' | 'related';

export interface ArgumentSourceRef {
  block_id?: string;
  block_index?: number;
  start_offset?: number;
  end_offset?: number;
}

export type SourceLocationStatus = 'verified' | 'moved' | 'unlocated';

export interface SourceOccurrence {
  block_index?: number;
  start_offset: number;
  end_offset: number;
  preview: string;
}

export interface SourceValidationResult {
  status: SourceLocationStatus;
  occurrences: SourceOccurrence[];
}

export interface ArgumentNode {
  id: string;
  title: string;
  snapshot: string;
  source?: ArgumentSourceRef | null;
  position?: { x: number; y: number };
  created_at: string;
  updated_at: string;
}

export interface MainThesis {
  id: string;
  title: string;
  content: string;
  passage_source?: ArgumentSourceRef | null;
  position?: { x: number; y: number };
}

export interface ArgumentRelationship {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: ArgumentRelationType;
  explanation?: string;
}

export interface ArgumentWeb {
  main_thesis?: MainThesis | null;
  nodes: ArgumentNode[];
  relationships: ArgumentRelationship[];
  dismissed_insights?: string[];
}

export interface PhilosophyMetadata {
  [key: string]: unknown;
  composition_mode?: 'freeform' | 'structured';
  philosophy_representation?: 'plain' | 'legacy';
  thinking_desk_intro_dismissed?: boolean;
  philosophy_blocks?: { classification: PhilosophyClassification; length: number }[];
  work_title?: string;
  chapter?: string;
  epigraph?: string;
  argument_web?: ArgumentWeb;
}

export type LorebookEntryType =
  | 'character'
  | 'location'
  | 'faction'
  | 'event'
  | 'concept'
  | 'artifact'
  | 'chapter'
  | 'rule'
  | 'culture'
  | 'other';

export type CanonStatus = 'canon' | 'draft' | 'speculative';

export type LoreCategory =
  | 'characters'
  | 'locations'
  | 'factions'
  | 'rules'
  | 'cultures'
  | 'artifacts'
  | 'events'
  | 'other';

export interface LorebookAttribute {
  id: string;
  key: string;
  value: string;
}

export interface CharacterFields {
  role?: string;
  species?: string;
  affiliation?: string;
  residence?: string;
  goals?: string;
  motivations?: string;
  strengths?: string;
  weaknesses?: string;
}

export interface LocationFields {
  location_type?: string;
  region?: string;
  inhabitants?: string;
  factions?: string;
  notable_events?: string;
}

export interface FactionFields {
  faction_type?: string;
  leadership?: string;
  ideology?: string;
  territory?: string;
  territory_notes?: string;
  allies?: string;
  rivals?: string;
}

export interface ArtifactFields {
  artifact_type?: string;
  owner?: string;
  creator?: string;
  origin?: string;
  powers?: string;
}

export interface EventFields {
  event_type?: string;
  location?: string;
  participants?: string;
  date_era?: string;
  outcome?: string;
  significance?: string;
}

export interface RuleFields {
  system_type?: string;
  principles?: string;
  limitations?: string;
  exceptions?: string;
  consequences?: string;
}

export interface LorebookMetadata {
  universe?: string;
  universe_id?: string;
  book?: string;
  book_id?: string;
  chapter?: string;
  chapter_order?: number;
  entry_type: LorebookEntryType;
  canon_status: CanonStatus;
  attributes: LorebookAttribute[];
  character_fields?: CharacterFields;
  location_fields?: LocationFields;
  faction_fields?: FactionFields;
  rule_fields?: RuleFields;
  artifact_fields?: ArtifactFields;
  event_fields?: EventFields;
  [key: string]: unknown;
}
// ============================================================================
// Manuscript Tools Types (v0.7.0)
// ============================================================================

export type ManuscriptNodeType = 'section' | 'linked_doc' | 'original_text';

export interface ManuscriptSectionNode {
  id: string;
  type: 'section';
  title: string;
  description?: string;
  children: ManuscriptNode[];
}

export interface ManuscriptLinkedDocNode {
  id: string;
  type: 'linked_doc';
  doc_id: string;
  doc_type: DocumentType;
  custom_title?: string;
}

export interface ManuscriptOriginalTextNode {
  id: string;
  type: 'original_text';
  title: string;
  content: string;
}

export type ManuscriptNode =
  | ManuscriptSectionNode
  | ManuscriptLinkedDocNode
  | ManuscriptOriginalTextNode;

export interface ManuscriptExportSettings {
  include_title_page: boolean;
  include_toc: boolean;
  page_breaks_between_sections: boolean;
  page_size: 'a4' | 'letter';
  font_family: 'serif' | 'sans' | 'mono';
  font_size: number;
  include_author_header: boolean;
}

export interface ManuscriptMetadata {
  version: 1;
  subtitle?: string;
  author?: string;
  target_word_count?: number;
  export_settings?: Partial<ManuscriptExportSettings>;
  outline: ManuscriptNode[];
}

// ============================================================================
// House-First Architecture (Phase 2 Types)
// ============================================================================

export type AuthoringStudio = 'poetry' | 'philosophy' | 'lorebook';

export interface HouseRecord {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  enabled_studios: AuthoringStudio[];
  manuscript_tools_enabled: boolean;
  universe_ids: string[];
  created_at: string;
  updated_at: string;
  archived: boolean;
}

export interface HouseRegistry {
  schema_version: number;
  default_house_id: string;
  houses: HouseRecord[];
}

export interface CreateHouseInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  enabled_studios?: AuthoringStudio[];
  manuscript_tools_enabled?: boolean;
}

export interface UpdateHouseInput {
  id: string;
  name?: string;
  description?: string | null;
  color?: string;
  icon?: string;
  enabled_studios?: AuthoringStudio[];
  manuscript_tools_enabled?: boolean;
}

// ============================================================================
// House-First Architecture (Phase 3A Types)
// ============================================================================

export type IntegrityIssueType =
  | 'orphaned_house_id'
  | 'malformed_house_id'
  | 'conflicting_entity_ownership'
  | 'invalid_universe_mapping'
  | 'canonical_index_mismatch'
  | 'missing_canonical_file'
  | 'incomplete_universe_move';

export interface HouseIntegrityIssue {
  issue_type: IntegrityIssueType;
  document_id?: string;
  relative_path?: string;
  house_id?: string;
  universe_id?: string;
  message: string;
}

export interface HouseIntegrityReport {
  total_documents_scanned: number;
  issues: HouseIntegrityIssue[];
  orphaned_document_count: number;
  malformed_document_count: number;
  conflicting_entity_count: number;
  invalid_universe_mapping_count: number;
  canonical_index_mismatch_count?: number;
  missing_canonical_file_count?: number;
  incomplete_universe_move_count?: number;
}
export interface UniverseMoveResult {
  universe_id: string;
  source_house_id: string;
  target_house_id: string;
  moved_document_ids: string[];
  document_count: number;
}
