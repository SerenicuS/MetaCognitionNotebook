export type DocumentType = 'poetry' | 'philosophy' | 'lorebook';

export type SaveStatus = 'saved' | 'saving' | 'editing' | 'error' | 'unsaved';

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
  work_title?: string;
  chapter?: string;
  epigraph?: string;
}

export type LorebookEntryType = 'character' | 'location' | 'faction' | 'event' | 'concept' | 'artifact' | 'other';
export type CanonStatus = 'canon' | 'draft' | 'speculative';

export interface LorebookAttribute {
  id: string;
  key: string;
  value: string;
}

export interface LorebookMetadata {
  universe?: string;
  book?: string;
  chapter?: string;
  entry_type: LorebookEntryType;
  canon_status: CanonStatus;
  attributes: LorebookAttribute[];
}
