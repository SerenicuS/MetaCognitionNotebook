import { applyOrganization, normalizeTags, preserveWorkshop, type OrganizationPatch, type TagChangeReport } from '../utils/organization';
import { DocumentDetail, DocumentMetadata, DocumentType, LibraryInfo, ReindexReport, SearchResult } from '../types';
import type { CommandArgs, CommandName } from './commands';

// Check if running in Tauri 2 desktop environment
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

// Fallback in-memory storage for web browser preview or development testing
export class MockStorage {
  public documents: DocumentDetail[] = [];
  public tags: Set<string> = new Set(['philosophy', 'poetry', 'existentialism', 'worldbuilding']);

  constructor() {
    this.seedDefaultDocuments();
  }

  public seedDefaultDocuments() {
    const now = new Date().toISOString();
    this.documents = [
      {
        metadata: {
          id: 'demo-poem-1',
          title: 'The Silent Hourglass',
          doc_type: 'poetry',
          relative_path: 'Poetry/The_Silent_Hourglass.md',
          created_at: now,
          updated_at: now,
          tags: ['time', 'reflection'],
          metadata_json: JSON.stringify({ poetic_form: 'Free Verse' }),
        },
        content: `Grain by grain the quiet falls,\nBetween the stone and twilight walls.\nNo breath can turn the wheel around,\nWhere memory sleeps upon the ground.\n\nYet in the hollow of the glass,\nA spark of lucent embers pass,\nTo tell the traveler on the road:\nUnburden here thy heavy load.`,
      },
      {
        metadata: {
          id: 'demo-phil-1',
          title: 'On the Indivisibility of Thought',
          doc_type: 'philosophy',
          relative_path: 'Philosophy/On_the_Indivisibility_of_Thought.md',
          created_at: now,
          updated_at: now,
          tags: ['epistemology', 'consciousness'],
          metadata_json: JSON.stringify({ work_title: 'Treatise on Being', chapter: 'I' }),
        },
        content: `<!-- premise -->\nAll conscious perception occurs as a unified experiential field rather than an aggregation of isolated sensor impulses.\n\n<!-- argument -->\nIf thought were fundamentally composed of discrete atomic parts without an intrinsic unifying matrix, the subject would experience fractured qualia rather than seamless synthetic intentionality.\n\n<!-- objection -->\nEmpiricists may object that neural firings are distributed across disparate cortical areas with variable synaptic latencies.\n\n<!-- conclusion -->\nTherefore, temporal distribution in physical substrate does not contradict the metaphysical unity of reflective awareness.`,
      },
      {
        metadata: {
          id: 'demo-lore-1',
          title: 'Aethelgard Citadel',
          doc_type: 'lorebook',
          relative_path: 'Lorebooks/Aethelgard_Citadel.md',
          created_at: now,
          updated_at: now,
          tags: ['citadel', 'luminary'],
          metadata_json: JSON.stringify({
            universe: 'Chronicles of the Hollow Star',
            book: 'Volume I: The Awakening',
            chapter: 'Chapter 2',
            entry_type: 'location',
            canon_status: 'canon',
            attributes: [
              { id: '1', key: 'Region', value: 'The Frostfire Spire' },
              { id: '2', key: 'Founded', value: 'Era of Dawn, 342' },
              { id: '3', key: 'Ruling Faction', value: 'The Luminary Keepers' },
            ],
          }),
        },
        content: `### Overview\n\nThe Aethelgard Citadel rests high above the perpetual mist of the Valenrift Valley. Carved from singular blocks of obsidian-fused marble, its spires resonate with harmonic resonance frequencies during solar solstices.\n\n### Historical Significance\n\nBuilt following the Great Sundering, it has served as the neutral sanctuary for scholars, mystics, and chronomancers for over seven centuries. No unsanctioned magic may be channeled within its geometric boundary.`,
      },
    ];
  }

  async getLibraryInfo(): Promise<LibraryInfo> {
    const poetry = this.documents.filter(d => d.metadata.doc_type === 'poetry').length;
    const phil = this.documents.filter(d => d.metadata.doc_type === 'philosophy').length;
    const lore = this.documents.filter(d => d.metadata.doc_type === 'lorebook').length;
    return {
      library_path: 'Documents/MetaCognitionNotebook',
      db_path: 'AppData/Local/com.metacognition.notebook/metadata.db',
      document_count: this.documents.length,
      poetry_count: poetry,
      philosophy_count: phil,
      lorebook_count: lore,
    };
  }

  async listDocuments(docType?: DocumentType): Promise<DocumentMetadata[]> {
    let list = this.documents.map(d => d.metadata);
    if (docType) {
      list = list.filter(d => d.doc_type === docType);
    }
    return list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  async getDocument(id: string): Promise<DocumentDetail> {
    const doc = this.documents.find(d => d.metadata.id === id);
    if (!doc) throw new Error(`Document with ID ${id} not found`);
    return JSON.parse(JSON.stringify(doc));
  }

  async createDocument(
    docType: DocumentType,
    title: string,
    parentId?: string,
    initialContent?: string,
    metadataJson?: string,
    tags?: string[],
  ): Promise<DocumentDetail> {
    const id = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    const folder = docType === 'poetry' ? 'Poetry' : docType === 'philosophy' ? 'Philosophy' : 'Lorebooks';
    const cleanTitle = title.trim() || 'Untitled';
    const relative_path = `${folder}/${cleanTitle.replace(/\s+/g, '_')}.md`;
    if (docType === 'philosophy' && !initialContent) {
      const metadata = JSON.parse(metadataJson || '{}');
      if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
        metadata.composition_mode ??= 'freeform';
        metadataJson = JSON.stringify(metadata);
      }
    }

    const detail: DocumentDetail = {
      metadata: {
        id,
        title: cleanTitle,
        doc_type: docType,
        relative_path,
        parent_id: parentId?.trim() ? parentId.trim() : null,
        metadata_json: metadataJson?.trim() ? metadataJson.trim() : null,
        created_at: now,
        updated_at: now,
        tags: tags ? tags.map(t => t.trim()).filter(Boolean) : [],
      },
      content: initialContent || '',
    };

    this.documents.unshift(detail);
    if (tags) {
      tags.forEach(t => {
        const trimmed = t.trim();
        if (trimmed) this.tags.add(trimmed);
      });
    }
    return detail;
  }

  async saveDocument(
    id: string,
    content: string,
    title?: string,
    tags?: string[],
    metadataJson?: string,
  ): Promise<DocumentMetadata> {
    const doc = this.documents.find(d => d.metadata.id === id);
    if (!doc) throw new Error(`Document with ID ${id} not found`);

    if (title !== undefined && title.trim()) {
      doc.metadata.title = title.trim();
    }
    if (tags !== undefined) {
      doc.metadata.tags = tags.map(t => t.trim()).filter(Boolean);
      doc.metadata.tags.forEach(t => this.tags.add(t));
    }
    if (metadataJson !== undefined) {
      doc.metadata.metadata_json = preserveWorkshop(metadataJson.trim() || undefined, doc.metadata.metadata_json) ?? null;
    }
    doc.metadata.updated_at = new Date().toISOString();
    doc.content = content;

    return { ...doc.metadata };
  }

  async updateOrganization(id: string, patch: OrganizationPatch): Promise<DocumentMetadata> {
    const doc = this.documents.find(doc => doc.metadata.id === id);
    if (!doc) throw new Error(`Document with ID ${id} not found`);
    doc.metadata = applyOrganization(doc.metadata, patch);
    doc.metadata.tags.forEach(tag => this.tags.add(tag));
    return JSON.parse(JSON.stringify(doc.metadata));
  }

  async manageTag(oldName: string, newName?: string): Promise<TagChangeReport> {
    oldName = oldName.trim();
    if (!oldName || (newName !== undefined && !newName.trim())) throw new Error('Tag names cannot be empty.');
    const updated: DocumentMetadata[] = [];
    for (const doc of this.documents) {
      if (!doc.metadata.tags.includes(oldName)) continue;
      const tags = normalizeTags(doc.metadata.tags.flatMap(tag => tag === oldName ? newName === undefined ? [] : [newName] : [tag]));
      updated.push(await this.updateOrganization(doc.metadata.id, { tags }));
    }
    if (this.tags.has(oldName)) {
      if (newName !== undefined) this.tags.add(newName.trim());
      if (newName?.trim() !== oldName) this.tags.delete(oldName);
    }
    return { updated, errors: [] };
  }

  async renameDocument(id: string, newTitle: string): Promise<DocumentMetadata> {
    const doc = this.documents.find(d => d.metadata.id === id);
    if (!doc) throw new Error(`Document with ID ${id} not found`);

    doc.metadata.title = newTitle.trim() || 'Untitled';
    doc.metadata.updated_at = new Date().toISOString();
    return { ...doc.metadata };
  }

  async deleteDocument(id: string): Promise<void> {
    const exists = this.documents.some(d => d.metadata.id === id);
    if (!exists) throw new Error(`Document with ID ${id} not found`);
    this.documents = this.documents.filter(d => d.metadata.id !== id);
  }

  async reindexLibrary(): Promise<ReindexReport> {
    return {
      total_files_scanned: this.documents.length,
      documents_indexed: this.documents.length,
      errors: [],
    };
  }

  async searchDocuments(query: string, docType?: DocumentType): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const doc of this.documents) {
      if (docType && doc.metadata.doc_type !== docType) continue;

      if (doc.metadata.title.toLowerCase().includes(q)) {
        results.push({
          id: doc.metadata.id,
          title: doc.metadata.title,
          doc_type: doc.metadata.doc_type,
          relative_path: doc.metadata.relative_path,
          snippet: `Title match: ${doc.metadata.title}`,
          match_type: 'title',
          updated_at: doc.metadata.updated_at,
        });
      } else if (doc.content.toLowerCase().includes(q)) {
        const idx = doc.content.toLowerCase().indexOf(q);
        const snippet = doc.content.substring(Math.max(0, idx - 30), Math.min(doc.content.length, idx + q.length + 30));
        results.push({
          id: doc.metadata.id,
          title: doc.metadata.title,
          doc_type: doc.metadata.doc_type,
          relative_path: doc.metadata.relative_path,
          snippet: `...${snippet.replace(/\n/g, ' ')}...`,
          match_type: 'content',
          updated_at: doc.metadata.updated_at,
        });
      }
    }

    return results;
  }

  async listTags(): Promise<string[]> {
    return Array.from(this.tags);
  }
}

export const mock = new MockStorage();

// Dynamic invoker that utilizes Tauri IPC when available, otherwise falls back to MockStorage
export async function invokeTauri<T, K extends CommandName = CommandName>(
  cmd: K,
  args?: CommandArgs[K] | Record<string, unknown>
): Promise<T> {
  if (isTauri()) {
    try {
      // Dynamically import Tauri's core invoke to support both browser dev and desktop
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<T>(cmd, args);
    } catch (err) {
      console.error(`Tauri invoke error for ${cmd}:`, err);
      throw err;
    }
  }

  const rawArgs = (args ?? {}) as Record<string, any>;

  // Web / fallback simulation
  switch (cmd) {
    case 'get_library_info':
      return (await mock.getLibraryInfo()) as unknown as T;
    case 'list_documents': {
      const docType = (rawArgs.docType ?? rawArgs.doc_type) as DocumentType | undefined;
      return (await mock.listDocuments(docType)) as unknown as T;
    }
    case 'get_document':
      return (await mock.getDocument(rawArgs.id as string)) as unknown as T;
    case 'create_document': {
      const docType = (rawArgs.docType ?? rawArgs.doc_type) as DocumentType;
      const title = (rawArgs.title as string) ?? '';
      const parentId = (rawArgs.parentId ?? rawArgs.parent_id) as string | undefined;
      const initialContent = (rawArgs.initialContent ?? rawArgs.initial_content) as string | undefined;
      const metadataJson = (rawArgs.metadataJson ?? rawArgs.metadata_json) as string | undefined;
      const tags = rawArgs.tags as string[] | undefined;
      return (await mock.createDocument(
        docType,
        title,
        parentId,
        initialContent,
        metadataJson,
        tags,
      )) as unknown as T;
    }
    case 'save_document': {
      const id = rawArgs.id as string;
      const content = rawArgs.content as string;
      const title = rawArgs.title as string | undefined;
      const tags = rawArgs.tags as string[] | undefined;
      const metadataJson = (rawArgs.metadataJson ?? rawArgs.metadata_json) as string | undefined;
      return (await mock.saveDocument(
        id,
        content,
        title,
        tags,
        metadataJson,
      )) as unknown as T;
    }
    case 'rename_document': {
      const id = rawArgs.id as string;
      const newTitle = (rawArgs.newTitle ?? rawArgs.new_title) as string;
      return (await mock.renameDocument(id, newTitle)) as unknown as T;
    }
    case 'delete_document':
      return (await mock.deleteDocument(rawArgs.id as string)) as unknown as T;
    case 'reindex_library':
      return (await mock.reindexLibrary()) as unknown as T;
    case 'search_documents': {
      const query = (rawArgs.query as string) ?? '';
      const docType = (rawArgs.docType ?? rawArgs.doc_type) as DocumentType | undefined;
      return (await mock.searchDocuments(query, docType)) as unknown as T;
    }
    case 'update_organization':
      return await mock.updateOrganization(rawArgs.id, rawArgs.patch) as T;
    case 'manage_tag':
      return await mock.manageTag(rawArgs.oldName, rawArgs.newName) as T;
    case 'list_tags':
      return (await mock.listTags()) as unknown as T;
    case 'exit_app':
      return undefined as unknown as T;
    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
}

export const api = {
  updateOrganization: (id: string, patch: OrganizationPatch) => invokeTauri<DocumentMetadata>('update_organization', { id, patch }),
  manageTag: (oldName: string, newName?: string) => invokeTauri<TagChangeReport>('manage_tag', { oldName, newName }),
  getLibraryInfo: () => invokeTauri<LibraryInfo>('get_library_info'),

  listDocuments: (docType?: DocumentType) =>
    invokeTauri<DocumentMetadata[]>('list_documents', { docType }),

  getDocument: (id: string) =>
    invokeTauri<DocumentDetail>('get_document', { id }),

  createDocument: (
    docType: DocumentType,
    title: string,
    parentId?: string,
    initialContent?: string,
    metadataJson?: string,
    tags?: string[],
  ) =>
    invokeTauri<DocumentDetail>('create_document', {
      docType,
      title,
      parentId,
      initialContent,
      metadataJson,
      tags,
    }),

  saveDocument: (
    id: string,
    content: string,
    title?: string,
    tags?: string[],
    metadataJson?: string,
  ) =>
    invokeTauri<DocumentMetadata>('save_document', {
      id,
      content,
      title,
      tags,
      metadataJson,
    }),

  renameDocument: (id: string, newTitle: string) =>
    invokeTauri<DocumentMetadata>('rename_document', { id, newTitle }),

  deleteDocument: (id: string) =>
    invokeTauri<void>('delete_document', { id }),

  reindexLibrary: () =>
    invokeTauri<ReindexReport>('reindex_library'),

  searchDocuments: (query: string, docType?: DocumentType) =>
    invokeTauri<SearchResult[]>('search_documents', { query, docType }),

  listTags: () =>
    invokeTauri<string[]>('list_tags'),

  exitApp: () =>
    invokeTauri<void>('exit_app', {}),
};
