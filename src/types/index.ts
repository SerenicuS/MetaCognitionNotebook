export type DocumentType = 'poetry' | 'philosophy' | 'lorebook';

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

export interface PhilosophyMetadata {
  [key: string]: unknown;
  composition_mode?: 'freeform' | 'structured';
  philosophy_representation?: 'plain' | 'legacy';
  thinking_desk_intro_dismissed?: boolean;
  philosophy_blocks?: { classification: PhilosophyClassification; length: number }[];
  work_title?: string;
  chapter?: string;
  epigraph?: string;
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
  allies?: string;
  rivals?: string;
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
  [key: string]: unknown;
}
