import type { Plan } from '../utils/thought';

/** Format-1 transport contracts. L1 export/inspection and L2a import planning. */
export interface PortableExportRequest {
  universe_id: string;
  snapshot_basis: 'last_saved_state';
  book_ids: string[];
  chapter_ids: string[];
}
export interface PortableDocumentEntry {
  id: string;
  path: string;
  source_relative_path: string;
  universe_id: string;
  book_id: string | null;
  entry_type: string;
  materialized_raw: boolean;
  opaque_fields: string[];
}
export interface PortableDiagnostic { code: string; record_id: string; message: string }
export interface PortableManifest {
  format: 'metacognition.portable-universe';
  format_version: 1;
  schema_version: 1;
  package_id: string;
  app_version: string;
  created_at: string;
  source_universe_id: string;
  source_house: { id: string; name: string };
  snapshot_basis: 'last_saved_state';
  source_plan_revision: number;
  compatibility: { planning_schema_version: 1; history_semantics_version: 1; required_features: string[] };
  scope: {
    worldbuilding_complete: true;
    selected_book_ids: string[];
    structural_book_ids: string[];
    omitted_book_ids: string[];
    included_chapter_ids: string[];
    omitted_chapters: {
      id: string; book_id: string; source_relative_path: string;
      chapter_order: number; created_at: string; reason: 'chapter_prose_not_selected';
    }[];
  };
  planning_path: 'planning/universe.json';
  documents: PortableDocumentEntry[];
  archived_documents: PortableDocumentEntry[];
  assets: { path: string; source_relative_path: string; referenced_by: string[] }[];
  ordering: {
    algorithm: 'source-order-v1';
    source_document_ids: string[];
    timelines: { book_id: string | null; branch_id: string | null; milestone_ids: string[] }[];
    chapters: { book_id: string; chapter_ids: string[] }[];
  };
  unresolved_references: PortableDiagnostic[];
  warnings: PortableDiagnostic[];
  files: { path: string; size: number; sha256: string }[];
}
export interface PortableInspection {
  path: string;
  archive_sha256: string;
  size: number;
  compatible: boolean;
  unsupported_features: string[];
  document_count: number;
  archived_count: number;
  chapter_count: number;
  asset_count: number;
  book_count: number;
  branch_count: number;
  milestone_count: number;
  relationship_count: number;
  universe: { id: string; name: string; description?: string; archived?: boolean };
  archived_records: { kind: 'universe' | 'book' | 'continuity' | 'milestone' | 'relationship' | 'document'; id: string }[];
  total_bytes: number;
  manifest: PortableManifest;
}

export type ImportIdentityPolicy = 'preserve' | 'separate_copy';

export interface ImportPreviewRequest {
  package_path: string;
  target_house_id: string;
  policy: ImportIdentityPolicy;
  operation_id?: string | null;
}

export interface PlannedDocumentPath {
  source_id: string;
  proposed_id: string;
  entry_type: string;
  title: string;
  source_relative_path: string;
  destination_relative_path: string;
  is_archived: boolean;
}

export interface PlannedAssetPath {
  source_relative_path: string;
  destination_relative_path: string;
  size: number;
  sha256: string;
  reused_existing: boolean;
}

export interface IdentityCollision {
  source_id: string;
  collision_type: string;
  destination_location: string;
  message: string;
}

export interface ImportPlanSummary {
  documents_count: number;
  archived_documents_count: number;
  books_count: number;
  branches_count: number;
  milestones_count: number;
  relationships_count: number;
  assets_count: number;
  omitted_chapters_count: number;
  omitted_books_count: number;
}

export interface ImportPreview {
  operation_id: string;
  package_path: string;
  package_sha256: string;
  package_id: string;
  target_house_id: string;
  target_house_name: string;
  policy: ImportIdentityPolicy;
  destination_fingerprint: string;
  source_universe_name: string;
  proposed_universe_id: string;
  proposed_universe_name: string;
  source_plan_revision: number;
  target_plan_revision: number;
  proposed_plan_revision: number;
  id_mappings: Record<string, string>;
  document_paths: PlannedDocumentPath[];
  asset_paths: PlannedAssetPath[];
  summary: ImportPlanSummary;
  collisions: IdentityCollision[];
  diagnostics: PortableDiagnostic[];
  is_valid: boolean;
  proposed_plan?: Plan | null;
}

export interface ImportCommitRequest {
  operation_id: string;
  package_path: string;
  target_house_id: string;
  policy: ImportIdentityPolicy;
  expected_destination_fingerprint: string;
}

export interface ImportCommitResult {
  operation_id: string;
  universe_id: string;
  universe_name: string;
  house_id: string;
  house_name: string;
  documents_imported: number;
  archived_documents_imported: number;
  assets_imported: number;
  plan_revision: number;
}

export interface ImportRecoveryReport {
  recovered_operations: string[];
  actions: string[];
}

/** For later UI integration: a failed save must prevent capture; no false save acknowledgement. */
export async function exportPortableAfterSave<T>(
  flush: () => Promise<boolean>,
  capture: () => Promise<T>,
): Promise<T> {
  if (!(await flush())) throw new Error('Universe export did not start because pending changes could not be saved.');
  return capture();
}
