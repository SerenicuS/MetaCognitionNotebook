import { invokeTauri } from './api';
import type { CommandQueue } from './autosave';

export interface ChapterExcerptSelection {
  chapter_id: string;
  heading?: string;
  excerpt_text: string;
}

export interface PublicationRequest {
  universe_id: string;
  title?: string;
  subtitle?: string;
  author?: string;
  include_universe_description?: boolean;
  include_table_of_contents?: boolean;
  selected_categories?: string[];
  selected_entity_ids?: string[];
  include_entity_prose?: boolean;
  included_attribute_keys?: string[];
  include_factions?: boolean;
  include_faction_hierarchy?: boolean;
  include_faction_holders?: boolean;
  include_relationships?: boolean;
  relationship_types?: string[];
  include_timeline?: boolean;
  selected_milestone_ids?: string[];
  include_alternate_continuities?: boolean;
  selected_branch_ids?: string[];
  selected_excerpts?: ChapterExcerptSelection[];
  filter_spoilers_after_milestone_id?: string;
  include_drafts?: boolean;
  include_speculative?: boolean;
  include_archived?: boolean;
}

export interface TocItem {
  title: string;
  anchor: string;
  level: number;
  children?: TocItem[];
}

export interface PublicationWarning {
  code: string;
  message: string;
  entity_id?: string;
}

export interface PublicationField {
  label: string;
  value: string;
}

export interface PublicationHolderLink {
  title: string;
  anchor: string;
}

export interface PublicationHierarchyNode {
  node_type: string;
  title: string;
  description?: string;
  holders?: PublicationHolderLink[];
  children?: PublicationHierarchyNode[];
}

export interface PublicationEntry {
  institutional_positions?: PublicationField[];
  title: string;
  anchor: string;
  category: string;
  fields?: PublicationField[];
  prose?: string;
  hierarchy?: PublicationHierarchyNode;
}

export interface PublicationSection {
  category: string;
  title: string;
  anchor: string;
  entries?: PublicationEntry[];
}

export interface PublicationRelationship {
  connections?: PublicationRelationship[];
  provenance?: string;
  source_title: string;
  source_anchor: string;
  target_title: string;
  target_anchor: string;
  label: string;
  description?: string;
  directed: boolean;
}

export interface PublicationStateChange {
  assignment_kind?: 'initial' | 'recorded' | 'transition';
  entity_title: string;
  entity_anchor: string;
  property_key: string;
  previous_value: string;
  new_value: string;
}

export interface PublicationNarrativeReference {
  chapter_title: string;
  book_name: string;
  excerpt_anchor: string;
}

export interface PublicationMilestone {
  references?: PublicationNarrativeReference[];
  title: string;
  anchor: string;
  era?: string;
  description?: string;
  changes?: PublicationStateChange[];
}

export interface PublicationTimeline {
  title: string;
  anchor: string;
  milestones?: PublicationMilestone[];
}

export interface PublicationDivergenceRef {
  title: string;
  era: string;
  anchor: string;
}

export interface PublicationBranch {
  name: string;
  anchor: string;
  description?: string;
  divergence_milestone?: PublicationDivergenceRef;
  milestones?: PublicationMilestone[];
}

export interface PublicationExcerpt {
  heading: string;
  anchor: string;
  chapter_title: string;
  book_name: string;
  excerpt_text: string;
}

export interface PublicationDocument {
  title: string;
  subtitle?: string;
  author?: string;
  universe_name: string;
  universe_description?: string;
  table_of_contents?: TocItem[];
  sections?: PublicationSection[];
  relationships?: PublicationRelationship[];
  timeline?: PublicationTimeline;
  alternate_continuities?: PublicationBranch[];
  excerpts?: PublicationExcerpt[];
}

export interface PublicationPreview {
  title: string;
  universe_name: string;
  table_of_contents: TocItem[];
  entry_count: number;
  category_counts: Record<string, number>;
  relationship_count: number;
  milestone_count: number;
  excerpt_count: number;
  word_count: number;
  generated_markdown: string;
  warnings: PublicationWarning[];
  source_fingerprint: string;
  document: PublicationDocument;
}

export interface PublishMarkdownRequest {
  request: PublicationRequest;
  destination_path: string;
  expected_source_fingerprint: string;
}

export interface PublishMarkdownResult {
  destination_path: string;
  bytes_written: number;
  word_count: number;
  sha256: string;
}

export interface PublishPdfRequest {
  request: PublicationRequest;
  destination_path: string;
  expected_source_fingerprint: string;
  pdf_bytes?: number[];
}

export interface PublishPdfResult {
  destination_path: string;
  bytes_written: number;
  page_count: number;
  word_count: number;
  sha256: string;
}

/**
 * Request a read-only publication preview of the selected Lorebook material.
 */
export async function lorebookPublishPreview(
  request: PublicationRequest
): Promise<PublicationPreview> {
  return await invokeTauri<PublicationPreview>('lorebook_publish_preview', {
    request,
  });
}

/**
 * Publish the validated Markdown encyclopedia to a destination file.
 * Fails safely if source changed during publication or if destination exists.
 */
export async function lorebookPublishMarkdown(
  request: PublishMarkdownRequest
): Promise<PublishMarkdownResult> {
  return await invokeTauri<PublishMarkdownResult>('lorebook_publish_markdown', {
    request,
  });
}

/**
 * Publish the validated PDF encyclopedia to a destination file.
 * Fails safely if source changed during publication or if destination exists.
 */
export async function lorebookPublishPdf(
  request: PublishPdfRequest
): Promise<PublishPdfResult> {
  return await invokeTauri<PublishPdfResult>('lorebook_publish_pdf', {
    request,
  });
}

export {
  generateLorebookPdf,
  checkTextGlyphs,
  type LorebookPdfOptions,
  type LorebookPdfResult,
} from '../utils/lorebookPdf';

const publicationChains = new WeakMap<CommandQueue, Promise<unknown>>();

/**
 * Safely coordinate publication with the notebook's save-flush coordinator:
 * Flushes pending editor and organization saves before generating or publishing,
 * ensuring snapshot consistency and preventing publishing unstaged or mixed state.
 */
export function coordinateLorebookPublication<T>(
  flushSave: () => Promise<boolean>,
  commandQueue: CommandQueue,
  publishAction: () => Promise<T>
): Promise<T> {
  const prev = publicationChains.get(commandQueue) ?? Promise.resolve();
  const next = prev.then(async () => {
    await commandQueue.waitForIdle();
    if (!(await flushSave())) {
      throw new Error(
        'Publication did not start because pending changes could not be saved.'
      );
    }
    return await commandQueue.run(async () => {
      return await publishAction();
    });
  });
  publicationChains.set(commandQueue, next.catch(() => {}));
  return next;
}
