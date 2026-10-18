import type { DocumentType } from '../types';

export type CommandArgs = {
  get_library_info: Record<string, never>;
  list_documents: { docType?: DocumentType };
  get_document: { id: string };
  create_document: {
    docType: DocumentType;
    title: string;
    parentId?: string;
    initialContent?: string;
    metadataJson?: string;
    tags?: string[];
  };
  save_document: {
    id: string;
    content: string;
    title?: string;
    tags?: string[];
    metadataJson?: string;
  };
  rename_document: { id: string; newTitle: string };
  delete_document: { id: string };
  reindex_library: Record<string, never>;
  search_documents: { query: string; docType?: DocumentType };
  list_tags: Record<string, never>;
  exit_app: Record<string, never>;
};
export type CommandName = keyof CommandArgs;
