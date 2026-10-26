import type { Thought, Plan } from '../utils/thought';
import type { VaultHistory, VaultPreview, VaultRestore, ActivationStatus } from './vault';
import { applyOrganization, normalizeTags, preserveWorkshop, type OrganizationPatch, type TagChangeReport } from '../utils/organization';
import { AudioTrack, CreateHouseInput, DocumentDetail, DocumentMetadata, DocumentType, HouseIntegrityReport, HouseRecord, LibraryInfo, ReindexReport, SearchResult, UpdateHouseInput, UniverseMoveResult } from '../types';
import type { CommandArgs, CommandName } from './commands';
import { validateCipherKey, type CipherDictionary, type CipherKey } from '../utils/emotionalCipher';

export interface VocabularyPoolInfo {
  id: string;
  name: string;
  word_count: number;
  is_bundled: boolean;
}

// Check if running in Tauri 2 desktop environment
export const isTauri = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).isTauri ||
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window
  );
};

// Fallback in-memory storage for web browser preview or development testing
export class MockStorage {
  public thought: Thought = { document_id: null, plan: null };
  public documents: DocumentDetail[] = [];
  public tags: Set<string> = new Set(['philosophy', 'poetry', 'existentialism', 'worldbuilding']);
  public cipherDictionaries: Map<string, CipherDictionary> = new Map();
  public vocabularyPools: Map<string, { info: VocabularyPoolInfo; words: string[] }> = new Map();
  public houses: HouseRecord[] = [];

  async thoughtGet(): Promise<Thought> {
    return JSON.parse(JSON.stringify(this.thought));
  }

  async thoughtSave(expectedRevision: number, plan: Plan): Promise<Thought> {
    const revision = this.thought.plan?.revision || 0;
    if (plan.version !== 1) throw new Error('Unsupported planning format');
    if (revision !== expectedRevision) {
      if (JSON.stringify({ ...plan, revision }) === JSON.stringify(this.thought.plan)) {
        return JSON.parse(JSON.stringify(this.thought));
      }
      throw new Error('Planning desk changed. Reload before editing.');
    }
    this.thought = {
      document_id: this.thought.document_id || 'preview-thought',
      plan: JSON.parse(JSON.stringify({ ...plan, revision: revision + 1 })),
    };
    return JSON.parse(JSON.stringify(this.thought));
  }

  constructor() {
    this.seedDefaultDocuments();
  }

  public seedDefaultDocuments() {
    const now = new Date().toISOString();
    this.houses = [
      {
        id: 'house-default',
        name: 'Primary House',
        color: 'amber',
        icon: 'castle',
        enabled_studios: ['poetry', 'philosophy', 'lorebook'],
        manuscript_tools_enabled: true,
        universe_ids: [],
        created_at: now,
        updated_at: now,
        archived: false,
      },
    ];
    this.cipherDictionaries.clear();
    const defaultDict: CipherDictionary = {
      version: 1,
      id: 'dict-botanical-default',
      name: 'Botanical Surrealism',
      description: 'Transforms emotions and architecture into botanical flora',
      created_at: now,
      updated_at: now,
      mappings: [
        { original: 'heart', replacement: 'rhizome' },
        { original: 'mind', replacement: 'mycelium' },
        { original: 'love', replacement: 'chlorophyll' },
        { original: 'stone', replacement: 'petrified wood' },
        { original: 'dark night', replacement: 'twilight canopy' },
      ],
    };
    this.cipherDictionaries.set(defaultDict.id, defaultDict);

    this.vocabularyPools.clear();
    const defaultWords = [
      'astronomy', 'constellation', 'telescope', 'observatory', 'solstice', 'equinox',
      'aurora', 'zenith', 'nebula', 'supernova', 'pulsar', 'quasar', 'meteorite',
      'chlorophyll', 'rhizome', 'spore', 'mycelium', 'lichen', 'bryophyte', 'stamen',
      'labyrinth', 'hourglass', 'alembic', 'astrolabe', 'parchment', 'pendulum', 'prism',
      'sonata', 'nocturne', 'cadence', 'polyphony', 'arpeggio', 'reverie', 'soliloquy',
      'whisper', 'shadow', 'gilded', 'amber', 'echo', 'twilight', 'silver', 'velvet'
    ];
    this.vocabularyPools.set('bundled-english', {
      info: {
        id: 'bundled-english',
        name: 'Bundled English Vocabulary (370k)',
        word_count: 370106,
        is_bundled: true,
      },
      words: defaultWords,
    });

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

  async listDocuments(docType?: DocumentType, houseId?: string): Promise<DocumentMetadata[]> {
    let list = this.documents.map(d => d.metadata);
    if (docType) {
      list = list.filter(d => d.doc_type === docType);
    }
    if (houseId) {
      list = list.filter(d => (d.house_id || 'house-default') === houseId);
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
    houseId?: string,
  ): Promise<DocumentDetail> {
    const id = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    const folder = docType === 'poetry' ? 'Poetry' : docType === 'philosophy' ? 'Philosophy' : docType === 'manuscript' ? 'Manuscripts' : 'Lorebooks';
    const cleanTitle = title.trim() || 'Untitled';
    const relative_path = `${folder}/${cleanTitle.replace(/\s+/g, '_')}.md`;
    if (docType === 'philosophy' && !initialContent) {
      const metadata = JSON.parse(metadataJson || '{}');
      if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
        metadata.composition_mode ??= 'freeform';
        metadataJson = JSON.stringify(metadata);
      }
    }

    let targetHouseId = 'house-default';
    if (houseId !== undefined) {
      const trimmed = houseId.trim();
      if (!trimmed || !/^house-[a-zA-Z0-9_-]+$/.test(trimmed)) {
        throw new Error(`Malformed target House ID: '${houseId}'`);
      }
      targetHouseId = trimmed;
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
        house_id: targetHouseId,
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

  async manageTag(oldName: string, newName?: string, houseId?: string): Promise<TagChangeReport> {
    oldName = oldName.trim();
    if (!oldName || (newName !== undefined && !newName.trim())) throw new Error('Tag names cannot be empty.');
    const updated: DocumentMetadata[] = [];
    for (const doc of this.documents) {
      if (houseId && (doc.metadata.house_id || 'house-default') !== houseId) continue;
      if (!doc.metadata.tags.includes(oldName)) continue;
      const tags = normalizeTags(doc.metadata.tags.flatMap(tag => tag === oldName ? newName === undefined ? [] : [newName] : [tag]));
      updated.push(await this.updateOrganization(doc.metadata.id, { tags }));
    }
    const hasRemainingInOtherHouses = this.documents.some(d => d.metadata.tags.includes(oldName));
    if (!hasRemainingInOtherHouses && this.tags.has(oldName)) {
      if (newName !== undefined) this.tags.add(newName.trim());
      if (newName?.trim() !== oldName) this.tags.delete(oldName);
    } else if (newName !== undefined) {
      this.tags.add(newName.trim());
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

  async searchDocuments(query: string, docType?: DocumentType, houseId?: string): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const doc of this.documents) {
      if (docType && doc.metadata.doc_type !== docType) continue;
      if (houseId && (doc.metadata.house_id || 'house-default') !== houseId) continue;

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

  async listTags(houseId?: string): Promise<string[]> {
    if (houseId) {
      const houseDocs = this.documents.filter(d => (d.metadata.house_id || 'house-default') === houseId);
      const houseTags = new Set<string>();
      for (const d of houseDocs) {
        for (const t of d.metadata.tags || []) {
          houseTags.add(t);
        }
      }
      return Array.from(houseTags).sort((a, b) => a.localeCompare(b));
    }
    return Array.from(this.tags);
  }

  private getReferencingPoems(keyId: string): Array<{ id: string; title: string }> {
    const refs: Array<{ id: string; title: string }> = [];
    for (const doc of this.documents) {
      if (!doc.metadata.metadata_json) continue;
      try {
        const meta = JSON.parse(doc.metadata.metadata_json);
        const cipher = meta?.cipher;
        if (cipher && (cipher.key_id === keyId || cipher.dictionary_id === keyId)) {
          refs.push({ id: doc.metadata.id, title: doc.metadata.title });
        }
      } catch {
        // Ignore unparseable metadata
      }
    }
    return refs;
  }

  async listCipherDictionaries(): Promise<CipherKey[]> {
    const result: CipherKey[] = [];
    for (const raw of this.cipherDictionaries.values()) {
      const refs = this.getReferencingPoems(raw.id);
      const existingIds = new Set(raw.associated_poem_ids ?? []);
      const existingTitles = new Set(raw.associated_poem_titles ?? []);
      for (const r of refs) {
        existingIds.add(r.id);
        existingTitles.add(r.title);
      }
      result.push({
        ...raw,
        algorithm_version: raw.algorithm_version ?? '1.0',
        mode: raw.mode ?? 'manual',
        committed: raw.committed ?? true,
        word_count: raw.word_count ?? raw.mappings.length,
        associated_poem_ids: Array.from(existingIds),
        associated_poem_titles: Array.from(existingTitles),
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getCipherDictionary(id: string): Promise<CipherKey> {
    const list = await this.listCipherDictionaries();
    const dict = list.find(d => d.id === id);
    if (!dict) throw new Error(`Cipher Key not found: ${id}`);
    return dict;
  }

  async saveCipherDictionary(dict: CipherKey): Promise<CipherKey> {
    const validated = validateCipherKey(dict, { disallowDuplicateOriginals: true });
    const committedKey: CipherKey = {
      ...validated,
      committed: true,
      updated_at: validated.updated_at || new Date().toISOString(),
    };
    this.cipherDictionaries.set(committedKey.id, committedKey);
    return committedKey;
  }

  async deleteCipherDictionary(id: string, force?: boolean): Promise<void> {
    if (!force) {
      const refs = this.getReferencingPoems(id);
      if (refs.length > 0) {
        const titles = refs.map(r => `"${r.title}"`).join(', ');
        throw new Error(
          `Cannot delete Cipher Key '${id}': it is referenced by saved ciphered poem(s): ${titles}. Deleting this key may make those poems impossible to decode.`
        );
      }
    }
    this.cipherDictionaries.delete(id);
  }

  async exportCipherDictionary(id: string, _targetPath: string): Promise<void> {
    const dict = this.cipherDictionaries.get(id);
    if (!dict) throw new Error(`Cipher Key not found: ${id}`);
  }

  async importCipherDictionary(_sourcePath: string): Promise<CipherKey> {
    throw new Error('Importing path requires desktop environment.');
  }

  async listVocabularyPools(): Promise<VocabularyPoolInfo[]> {
    return Array.from(this.vocabularyPools.values()).map(v => v.info);
  }

  async getVocabularySample(
    poolId?: string,
    count: number = 20,
    excludeWords: string[] = []
  ): Promise<string[]> {
    const targetId = poolId ?? 'bundled-english';
    const pool = this.vocabularyPools.get(targetId);
    if (!pool) throw new Error(`Vocabulary pool not found: ${targetId}`);

    const excludeSet = new Set(excludeWords.map(w => w.trim().toLowerCase()));
    const eligible = pool.words.filter(w => !excludeSet.has(w.toLowerCase()));

    if (eligible.length < count) {
      throw new Error(
        `Insufficient vocabulary in pool: required ${count}, but only ${eligible.length} eligible words available.`
      );
    }

    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  async importVocabularyPool(name: string, content: string): Promise<VocabularyPoolInfo> {
    const cleanName = name.trim().replace(/\.txt$/, '');
    if (!cleanName) throw new Error('Vocabulary pool name cannot be empty.');
    const words = content.split('\n').map(l => l.trim()).filter(Boolean);
    const id = `${cleanName.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.txt`;
    const info: VocabularyPoolInfo = {
      id,
      name: cleanName,
      word_count: words.length,
      is_bundled: false,
    };
    this.vocabularyPools.set(id, { info, words });
    return info;
  }

  async deleteVocabularyPool(poolId: string): Promise<void> {
    if (poolId === 'bundled-english') {
      throw new Error('Cannot delete bundled vocabulary pool.');
    }
    this.vocabularyPools.delete(poolId);
  }

  async listHouses(): Promise<HouseRecord[]> {
    return JSON.parse(JSON.stringify(this.houses));
  }

  async getHouse(id: string): Promise<HouseRecord> {
    const h = this.houses.find(x => x.id === id);
    if (!h) throw new Error(`House with ID '${id}' not found`);
    return JSON.parse(JSON.stringify(h));
  }

  async createHouse(input: CreateHouseInput): Promise<HouseRecord> {
    const now = new Date().toISOString();
    const id = `house-${input.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-${Math.random().toString(36).substring(2, 6)}`;
    const rec: HouseRecord = {
      id,
      name: input.name,
      description: input.description,
      color: input.color || 'amber',
      icon: input.icon || 'castle',
      enabled_studios: input.enabled_studios || ['poetry', 'philosophy', 'lorebook'],
      manuscript_tools_enabled: input.manuscript_tools_enabled ?? true,
      universe_ids: [],
      created_at: now,
      updated_at: now,
      archived: false,
    };
    this.houses.push(rec);
    return JSON.parse(JSON.stringify(rec));
  }

  async updateHouse(input: UpdateHouseInput): Promise<HouseRecord> {
    const h = this.houses.find(x => x.id === input.id);
    if (!h) throw new Error(`House with ID '${input.id}' not found`);
    if (input.name !== undefined) h.name = input.name;
    if (input.description !== undefined) h.description = input.description || undefined;
    if (input.color !== undefined) h.color = input.color;
    if (input.icon !== undefined) h.icon = input.icon;
    if (input.enabled_studios !== undefined) h.enabled_studios = input.enabled_studios;
    if (input.manuscript_tools_enabled !== undefined) h.manuscript_tools_enabled = input.manuscript_tools_enabled;
    h.updated_at = new Date().toISOString();
    return JSON.parse(JSON.stringify(h));
  }

  async archiveHouse(id: string): Promise<HouseRecord> {
    if (id === 'house-default') throw new Error('The Default House cannot be archived');
    const h = this.houses.find(x => x.id === id);
    if (!h) throw new Error(`House with ID '${id}' not found`);
    h.archived = true;
    h.updated_at = new Date().toISOString();
    return JSON.parse(JSON.stringify(h));
  }

  async restoreHouse(id: string): Promise<HouseRecord> {
    const h = this.houses.find(x => x.id === id);
    if (!h) throw new Error(`House with ID '${id}' not found`);
    h.archived = false;
    h.updated_at = new Date().toISOString();
    return JSON.parse(JSON.stringify(h));
  }

  async moveDocumentToHouse(docId: string, targetHouseId: string): Promise<DocumentMetadata> {
    const trimmedTarget = targetHouseId.trim();
    if (!trimmedTarget || !/^house-[a-zA-Z0-9_-]+$/.test(trimmedTarget)) {
      throw new Error(`Malformed target House ID: '${targetHouseId}'`);
    }
    const house = this.houses.find(h => h.id === trimmedTarget);
    if (!house) {
      throw new Error(`House with ID '${trimmedTarget}' not found`);
    }
    if (house.archived) {
      throw new Error(`Cannot move document: House '${trimmedTarget}' is archived`);
    }
    const doc = this.documents.find(d => d.metadata.id === docId);
    if (!doc) {
      throw new Error(`Document with ID '${docId}' not found`);
    }
    const fileName = doc.metadata.relative_path.split('/').pop() || '';
    if (fileName.startsWith('Web_of_Thought_') || this.thought.document_id === docId) {
      throw new Error('Cannot move the shared Web of Thought planning catalog to a specific House');
    }
    let parsedMeta: Record<string, any> | undefined;
    if (doc.metadata.metadata_json && doc.metadata.metadata_json.trim()) {
      try {
        parsedMeta = JSON.parse(doc.metadata.metadata_json);
      } catch (e: any) {
        throw new Error(`Invalid document metadata JSON in '${doc.metadata.relative_path}': ${e?.message || e}`);
      }
      if (parsedMeta && parsedMeta._web_of_thought) {
        throw new Error('Cannot move the shared Web of Thought planning catalog to a specific House');
      }
    }
    const rawSourceHouse = doc.metadata.house_id ?? 'house-default';
    const sourceHouseId = rawSourceHouse.trim();
    if (!sourceHouseId || !/^house-[a-zA-Z0-9_-]+$/.test(sourceHouseId)) {
      throw new Error(`Cannot move document '${docId}': current canonical House ID '${rawSourceHouse}' is malformed`);
    }
    const sourceHouse = this.houses.find(h => h.id === sourceHouseId);
    if (!sourceHouse) {
      throw new Error(`Cannot move document '${docId}': current owning House '${sourceHouseId}' is unknown (orphaned)`);
    }
    if (sourceHouse.archived) {
      throw new Error(`Cannot move document '${docId}': current owning House '${sourceHouse.id}' is archived`);
    }
    if (doc.metadata.doc_type === 'manuscript') {
      if (!house.manuscript_tools_enabled) {
        throw new Error(`Manuscript Tools is disabled for House '${house.name}'`);
      }
    } else {
      const studio = doc.metadata.doc_type;
      if (!house.enabled_studios.includes(studio as any)) {
        throw new Error(`Authoring studio '${studio}' is disabled for House '${house.name}'`);
      }
    }
    if (sourceHouseId === trimmedTarget) {
      return { ...doc.metadata, house_id: sourceHouseId };
    }
    if (doc.metadata.doc_type === 'lorebook') {
      let universeId: string | undefined;
      if (parsedMeta) {
        if (parsedMeta.universe_id !== undefined && parsedMeta.universe_id !== null) {
          if (typeof parsedMeta.universe_id !== 'string' || !parsedMeta.universe_id.trim()) {
            throw new Error(`Malformed universe_id in Lorebook entity '${doc.metadata.title}'`);
          }
          universeId = parsedMeta.universe_id.trim();
        } else if (parsedMeta.universe !== undefined && parsedMeta.universe !== null) {
          if (typeof parsedMeta.universe !== 'string' || !parsedMeta.universe.trim()) {
            throw new Error(`Malformed legacy universe field in Lorebook entity '${doc.metadata.title}'`);
          }
          const legacyName = parsedMeta.universe.trim().toLowerCase();
          const candidates = (this.thought.plan?.universes || []).filter(u => u.name.toLowerCase() === legacyName);
          let matchedUni: any;
          if (candidates.length === 1) {
            matchedUni = candidates[0];
          } else if (candidates.length > 1) {
            const scoped = candidates.filter(u => {
              const owner = this.houses.find(h => h.universe_ids.includes(u.id))?.id || 'house-default';
              return owner === sourceHouseId;
            });
            if (scoped.length === 1) {
              matchedUni = scoped[0];
            }
          }
          if (!matchedUni) {
            throw new Error(`Cannot resolve Lorebook entity '${doc.metadata.title}' universe '${parsedMeta.universe}' against the planning catalog`);
          }
          universeId = matchedUni.id;
        }
      }
      if (this.thought.plan) {
        const catEntity = this.thought.plan.entities.find(e => e.id === docId);
        if (catEntity) {
          if (universeId && universeId !== catEntity.universe_id) {
            throw new Error(`Conflicting Universe attribution for Lorebook entity '${doc.metadata.title}'`);
          }
          universeId = catEntity.universe_id;
        }
      }
      if (universeId) {
        const owningHouse = this.houses.find(h => h.universe_ids.includes(universeId!))?.id || 'house-default';
        if (owningHouse !== trimmedTarget) {
          throw new Error(
            `Cannot move Lorebook entity '${doc.metadata.title}' to House '${trimmedTarget}': entity belongs to Universe '${universeId}' which is owned by House '${owningHouse}'. Cross-House universe moves require a coordinated move operation.`
          );
        }
      }
    }
    doc.metadata.house_id = trimmedTarget;
    doc.metadata.updated_at = new Date().toISOString();
    return { ...doc.metadata };
  }



  async assignUniverseToHouse(universeId: string, targetHouseId: string): Promise<void> {
    const trimmedTarget = targetHouseId.trim();
    if (!trimmedTarget || !/^house-[a-zA-Z0-9_-]+$/.test(trimmedTarget)) {
      throw new Error(`Malformed target House ID: '${targetHouseId}'`);
    }
    const targetHouse = this.houses.find(h => h.id === trimmedTarget);
    if (!targetHouse) {
      throw new Error(`Target House '${trimmedTarget}' does not exist`);
    }
    if (targetHouse.archived) {
      throw new Error(`Cannot assign Universe: Target House '${trimmedTarget}' is archived`);
    }
    const trimmedUniverse = universeId.trim();
    if (!trimmedUniverse) {
      throw new Error('Universe ID cannot be empty');
    }
    for (const h of this.houses) {
      if (h.universe_ids.includes(trimmedUniverse)) {
        if (h.id === trimmedTarget) return;
        throw new Error(`Universe '${trimmedUniverse}' is already owned by House '${h.id}'`);
      }
    }
    if (!targetHouse.universe_ids.includes(trimmedUniverse)) {
      targetHouse.universe_ids.push(trimmedUniverse);
      targetHouse.updated_at = new Date().toISOString();
    }
  }

  async createUniverseInHouse(
    expectedRevision: number,
    name: string,
    description: string | undefined,
    targetHouseId: string
  ): Promise<{ universe_id: string; universe_name: string; house_id: string; thought: Thought }> {
    const trimmedTarget = targetHouseId.trim();
    if (!trimmedTarget || !/^house-[a-zA-Z0-9_-]+$/.test(trimmedTarget)) {
      throw new Error(`Malformed target House ID: '${targetHouseId}'`);
    }
    const targetHouse = this.houses.find(h => h.id === trimmedTarget);
    if (!targetHouse) {
      throw new Error(`Target House '${trimmedTarget}' does not exist`);
    }
    if (targetHouse.archived) {
      throw new Error(`Cannot create Universe: Target House '${trimmedTarget}' is archived`);
    }
    const universeName = name.trim();
    if (!universeName) {
      throw new Error('Universe name cannot be empty');
    }
    const currentPlan = this.thought.plan || { version: 1, revision: 0, universes: [], books: [], entities: [], nodes: [], relationships: [] };
    this.thought.plan = currentPlan;
    if (currentPlan.revision !== expectedRevision) {
      throw new Error(`Revision mismatch: expected ${expectedRevision}, found ${currentPlan.revision}`);
    }
    const backupPlan = JSON.parse(JSON.stringify(currentPlan));
    const universeId = `uni-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    currentPlan.revision += 1;
    currentPlan.universes.push({
      id: universeId,
      name: universeName,
      description: (description || '').trim(),
    });
    try {
      await this.assignUniverseToHouse(universeId, trimmedTarget);
    } catch (e) {
      this.thought.plan = backupPlan;
      throw e;
    }
    return {
      universe_id: universeId,
      universe_name: universeName,
      house_id: trimmedTarget,
      thought: JSON.parse(JSON.stringify(this.thought)),
    };
  }

  async moveUniverseToHouse(universeId: string, targetHouseId: string): Promise<UniverseMoveResult> {
    const trimmedTarget = targetHouseId.trim();
    if (!trimmedTarget || !/^house-[a-zA-Z0-9_-]+$/.test(trimmedTarget)) {
      throw new Error(`Malformed target House ID: '${targetHouseId}'`);
    }
    const targetHouse = this.houses.find(h => h.id === trimmedTarget);
    if (!targetHouse) {
      throw new Error(`Target House '${trimmedTarget}' does not exist`);
    }
    if (targetHouse.archived) {
      throw new Error(`Cannot move Universe: Target House '${trimmedTarget}' is archived`);
    }
    if (!targetHouse.enabled_studios.includes('lorebook')) {
      throw new Error(`Authoring studio 'lorebook' is disabled for House '${targetHouse.name}'`);
    }

    const trimmedUniverse = universeId.trim();
    if (!trimmedUniverse) {
      throw new Error('Universe ID cannot be empty');
    }
    if (trimmedUniverse.length > 128 || /[\/\\\x00-\x1F]/.test(trimmedUniverse)) {
      throw new Error(`Invalid universe ID syntax: '${universeId}'`);
    }

    const sourceHouse = this.houses.find(h => h.universe_ids.includes(trimmedUniverse))
      ?? this.houses.find(h => h.id === 'house-default');
    if (!sourceHouse) {
      throw new Error('Source House for Universe could not be determined');
    }
    if (sourceHouse.archived) {
      throw new Error(`Cannot move Universe '${trimmedUniverse}': current owning House '${sourceHouse.id}' is archived`);
    }
    const sourceHouseId = sourceHouse.id;

    let universeName: string | undefined;
    if (this.thought.plan) {
      const uRec = this.thought.plan.universes.find(u => u.id === trimmedUniverse);
      if (!uRec && this.thought.plan.universes.length > 0) {
        throw new Error(`Universe '${trimmedUniverse}' does not exist in the Lorebook catalog`);
      }
      universeName = uRec?.name;
    }

    // Find owned Lorebook documents
    const affectedDocs: any[] = [];
    for (const doc of this.documents) {
      if (doc.metadata.doc_type !== 'lorebook') continue;
      if (doc.metadata.id === this.thought.document_id || doc.metadata.relative_path.includes('Web_of_Thought_')) continue;

      let belongs = false;
      let explicitDocUniverse: string | undefined;

      if (doc.metadata.metadata_json && doc.metadata.metadata_json.trim()) {
        try {
          const val = JSON.parse(doc.metadata.metadata_json);
          if (val.universe_id) {
            explicitDocUniverse = String(val.universe_id).trim();
            if (explicitDocUniverse === trimmedUniverse) belongs = true;
          } else if (val.universe && universeName) {
            const legName = String(val.universe).trim().toLowerCase();
            const candidates = (this.thought.plan?.universes || []).filter(u => u.name.toLowerCase() === legName);
            if (candidates.length === 1 && candidates[0].id === trimmedUniverse) {
              belongs = true;
            } else if (candidates.length > 1) {
              const docHouse = doc.metadata.house_id || 'house-default';
              const scoped = candidates.filter(u => {
                const owner = this.houses.find(h => h.universe_ids.includes(u.id))?.id || 'house-default';
                return owner === docHouse;
              });
              if (scoped.length === 1 && scoped[0].id === trimmedUniverse) {
                belongs = true;
              }
            }
          }
        } catch {}
      }

      if (this.thought.plan) {
        const catEntity = this.thought.plan.entities.find(e => e.id === doc.metadata.id);
        if (catEntity) {
          if (explicitDocUniverse && explicitDocUniverse !== catEntity.universe_id) {
            throw new Error(`Conflicting Universe attribution for Lorebook entity '${doc.metadata.title}': metadata specifies '${explicitDocUniverse}' but catalog specifies '${catEntity.universe_id}'`);
          }
          if (catEntity.universe_id === trimmedUniverse) {
            belongs = true;
          }
        }
        if (!belongs) {
          const inNodes = this.thought.plan.nodes.some(n => n.universe_id === trimmedUniverse && (n.entity_ids.includes(doc.metadata.id) || n.changes.some(c => c.entity_id === doc.metadata.id)));
          const inRels = this.thought.plan.relationships.some(r => r.universe_id === trimmedUniverse && (r.source_id === doc.metadata.id || r.target_id === doc.metadata.id));
          if (inNodes || inRels) belongs = true;
        }
      }

      if (belongs) {
        const curHouse = doc.metadata.house_id ?? 'house-default';
        if (curHouse !== sourceHouseId) {
          throw new Error(`Cannot move Universe '${trimmedUniverse}' to House '${trimmedTarget}': entity document '${doc.metadata.title}' has conflicting ownership '${curHouse}' (expected source House '${sourceHouseId}')`);
        }
        affectedDocs.push(doc);
      }
    }

    if (sourceHouseId === trimmedTarget) {
      return {
        universe_id: trimmedUniverse,
        source_house_id: sourceHouseId,
        target_house_id: trimmedTarget,
        document_count: affectedDocs.length,
        moved_document_ids: affectedDocs.map(d => d.metadata.id),
      };
    }

    // Reassign in houses
    for (const h of this.houses) {
      const idx = h.universe_ids.indexOf(trimmedUniverse);
      if (idx !== -1) {
        h.universe_ids.splice(idx, 1);
        h.updated_at = new Date().toISOString();
      }
    }
    if (!targetHouse.universe_ids.includes(trimmedUniverse)) {
      targetHouse.universe_ids.push(trimmedUniverse);
      targetHouse.updated_at = new Date().toISOString();
    }

    // Update documents
    const now = new Date().toISOString();
    for (const d of affectedDocs) {
      d.metadata.house_id = trimmedTarget;
      d.metadata.updated_at = now;
    }

    return {
      universe_id: trimmedUniverse,
      source_house_id: sourceHouseId,
      target_house_id: trimmedTarget,
      document_count: affectedDocs.length,
      moved_document_ids: affectedDocs.map(d => d.metadata.id),
    };
  }

  async recoverPendingUniverseMoves(): Promise<UniverseMoveResult | null> {
    return null;
  }

  async inspectHouseIntegrity(): Promise<HouseIntegrityReport> {
    return {
      total_documents_scanned: this.documents.length,
      issues: [],
      orphaned_document_count: 0,
      malformed_document_count: 0,
      conflicting_entity_count: 0,
      invalid_universe_mapping_count: 0,
      canonical_index_mismatch_count: 0,
      missing_canonical_file_count: 0,
    };
  }

  async musicListTracks(): Promise<AudioTrack[]> {
    return [
      {
        id: 'track-1',
        title: 'Midnight Rain Study',
        category: 'lofi',
        category_label: 'Lo-Fi',
        filename: '01 - Midnight Rain Study.mp3',
        relative_path: 'lofi/01 - Midnight Rain Study.mp3',
        format: 'mp3',
      },
      {
        id: 'track-2',
        title: 'Tavern Fireplace Hearth',
        category: 'medieval',
        category_label: 'Medieval',
        filename: 'Tavern Fireplace Hearth.wav',
        relative_path: 'medieval/Tavern Fireplace Hearth.wav',
        format: 'wav',
      },
      {
        id: 'track-3',
        title: 'Nebula Drift Station',
        category: 'scifi',
        category_label: 'Sci-Fi',
        filename: '03_nebula_drift_station.flac',
        relative_path: 'scifi/03_nebula_drift_station.flac',
        format: 'flac',
      },
    ];
  }

  async musicGetTrackBytes(_relativePath: string): Promise<number[]> {
    return [];
  }

  async musicOpenFolder(): Promise<void> {
    return;
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
    case 'thought_get': return structuredClone(mock.thought) as T;
    case 'thought_save': {
      const revision=mock.thought.plan?.revision || 0;
      const requested=rawArgs.plan as Plan;
      if(requested.version!==1) throw new Error('Unsupported planning format');
      if(revision!==rawArgs.expectedRevision) {
        if(JSON.stringify({...requested,revision})===JSON.stringify(mock.thought.plan)) return structuredClone(mock.thought) as T;
        throw new Error('Planning desk changed. Reload before editing.');
      }
      mock.thought={ document_id:mock.thought.document_id || 'preview-thought',plan:structuredClone({...requested,revision:revision+1}) };
      return structuredClone(mock.thought) as T;
    }
    case 'get_library_info':
      return (await mock.getLibraryInfo()) as unknown as T;
    case 'list_documents': {
      const docType = (rawArgs.docType ?? rawArgs.doc_type) as DocumentType | undefined;
      const houseId = (rawArgs.houseId ?? rawArgs.house_id) as string | undefined;
      return (await mock.listDocuments(docType, houseId)) as unknown as T;
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
      const houseId = (rawArgs.houseId ?? rawArgs.house_id) as string | undefined;
      return (await mock.createDocument(
        docType,
        title,
        parentId,
        initialContent,
        metadataJson,
        tags,
        houseId,
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
    case 'manage_tag': {
      const rawArgs = args as { oldName: string; newName?: string; houseId?: string };
      return await mock.manageTag(rawArgs.oldName, rawArgs.newName, rawArgs.houseId) as T;
    }
    case 'list_tags': {
      const rawArgs = args as { houseId?: string } | undefined;
      return (await mock.listTags(rawArgs?.houseId)) as unknown as T;
    }
    case 'cipher_list_dictionaries':
      return (await mock.listCipherDictionaries()) as unknown as T;
    case 'cipher_get_dictionary':
      return (await mock.getCipherDictionary(rawArgs.id as string)) as unknown as T;
    case 'cipher_save_dictionary':
      return (await mock.saveCipherDictionary(rawArgs.dictionary as CipherDictionary)) as unknown as T;
    case 'cipher_delete_dictionary':
      return (await mock.deleteCipherDictionary(
        rawArgs.id as string,
        rawArgs.force as boolean | undefined
      )) as unknown as T;
    case 'cipher_export_dictionary':
      return (await mock.exportCipherDictionary(rawArgs.id as string, rawArgs.targetPath as string)) as unknown as T;
    case 'cipher_import_dictionary':
      return (await mock.importCipherDictionary(rawArgs.sourcePath as string)) as unknown as T;
    case 'cipher_list_vocabulary_pools':
      return (await mock.listVocabularyPools()) as unknown as T;
    case 'cipher_get_vocabulary_sample':
      return (await mock.getVocabularySample(
        rawArgs.poolId as string | undefined,
        rawArgs.count as number | undefined,
        rawArgs.excludeWords as string[] | undefined
      )) as unknown as T;
    case 'cipher_import_vocabulary_pool':
      return (await mock.importVocabularyPool(
        rawArgs.name as string,
        rawArgs.content as string
      )) as unknown as T;
    case 'cipher_delete_vocabulary_pool':
      return (await mock.deleteVocabularyPool(rawArgs.poolId as string)) as unknown as T;
    case 'exit_app':
      return undefined as unknown as T;
    case 'save_export_file':
      return null as unknown as T;
    case 'list_houses':
      return (await mock.listHouses()) as unknown as T;
    case 'get_house':
      return (await mock.getHouse(rawArgs.id as string)) as unknown as T;
    case 'create_house':
      return (await mock.createHouse(rawArgs.input as CreateHouseInput)) as unknown as T;
    case 'update_house':
      return (await mock.updateHouse(rawArgs.input as UpdateHouseInput)) as unknown as T;
    case 'archive_house':
      return (await mock.archiveHouse(rawArgs.id as string)) as unknown as T;
    case 'restore_house':
      return (await mock.restoreHouse(rawArgs.id as string)) as unknown as T;
    case 'move_document_to_house': {
      const docId = (rawArgs.docId ?? rawArgs.doc_id) as string;
      const targetHouseId = (rawArgs.targetHouseId ?? rawArgs.target_house_id) as string;
      return (await mock.moveDocumentToHouse(docId, targetHouseId)) as unknown as T;
    }
    case 'assign_universe_to_house': {
      const universeId = (rawArgs.universeId ?? rawArgs.universe_id) as string;
      const targetHouseId = (rawArgs.targetHouseId ?? rawArgs.target_house_id) as string;
      return (await mock.assignUniverseToHouse(universeId, targetHouseId)) as unknown as T;
    }
    case 'create_universe_in_house': {
      const expectedRevision = (rawArgs.expectedRevision ?? rawArgs.expected_revision) as number;
      const name = rawArgs.name as string;
      const description = rawArgs.description as string | undefined;
      const targetHouseId = (rawArgs.targetHouseId ?? rawArgs.target_house_id) as string;
      return (await mock.createUniverseInHouse(expectedRevision, name, description, targetHouseId)) as unknown as T;
    }
    case 'move_universe_to_house': {
      const universeId = (rawArgs.universeId ?? rawArgs.universe_id) as string;
      const targetHouseId = (rawArgs.targetHouseId ?? rawArgs.target_house_id) as string;
      return (await mock.moveUniverseToHouse(universeId, targetHouseId)) as unknown as T;
    }
    case 'recover_pending_universe_moves':
      return (await mock.recoverPendingUniverseMoves()) as unknown as T;
    case 'inspect_house_integrity':
      return (await mock.inspectHouseIntegrity()) as unknown as T;
    case 'music_list_tracks':
      return (await mock.musicListTracks()) as unknown as T;
    case 'music_get_track_bytes':
      return (await mock.musicGetTrackBytes(rawArgs.relativePath as string)) as unknown as T;
    case 'music_open_folder':
      return (await mock.musicOpenFolder()) as unknown as T;

    case 'vault_activate':
    case 'vault_activation_status':
    case 'vault_rollback':
    case 'vault_restart':
    case 'vault_history':
    case 'vault_create':
    case 'vault_verify':
    case 'vault_choose':
    case 'vault_restore':
    case 'vault_open_folder':
      throw new Error('The Vault requires the Windows desktop app. Browser preview has no durable library.');
    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
}

export const api = {
  thoughtGet: () => invokeTauri<Thought>('thought_get'),
  thoughtSave: (expectedRevision:number, plan:Plan) => invokeTauri<Thought>('thought_save', {expectedRevision,plan}),
  vaultActivate: (path: string, expectedHash: string) => invokeTauri<ActivationStatus>('vault_activate', { path, expectedHash }),
  vaultActivationStatus: () => invokeTauri<ActivationStatus>('vault_activation_status'),
  vaultRollback: () => invokeTauri<ActivationStatus>('vault_rollback'),
  vaultRestart: () => invokeTauri<void>('vault_restart'),
  vaultHistory: () => invokeTauri<VaultHistory>('vault_history'),
  vaultCreate: () => invokeTauri<VaultPreview>('vault_create'),
  vaultVerify: (path: string) => invokeTauri<VaultPreview>('vault_verify', { path }),
  vaultChoose: () => invokeTauri<VaultPreview | null>('vault_choose'),
  vaultRestore: (path: string, expectedHash: string) => invokeTauri<VaultRestore | null>('vault_restore', { path, expectedHash }),
  vaultOpenFolder: () => invokeTauri<void>('vault_open_folder'),
  updateOrganization: (id: string, patch: OrganizationPatch) => invokeTauri<DocumentMetadata>('update_organization', { id, patch }),
  manageTag: (oldName: string, newName?: string, houseId?: string) => invokeTauri<TagChangeReport>('manage_tag', { oldName, newName, houseId }),
  getLibraryInfo: () => invokeTauri<LibraryInfo>('get_library_info'),

  listDocuments: (docType?: DocumentType, houseId?: string) =>
    invokeTauri<DocumentMetadata[]>('list_documents', { docType, houseId }),

  getDocument: (id: string) =>
    invokeTauri<DocumentDetail>('get_document', { id }),

  createDocument: (
    docType: DocumentType,
    title: string,
    parentId?: string,
    initialContent?: string,
    metadataJson?: string,
    tags?: string[],
    houseId?: string,
  ) =>
    invokeTauri<DocumentDetail>('create_document', {
      docType,
      title,
      parentId,
      initialContent,
      metadataJson,
      tags,
      houseId,
    }),

  saveDocument: (
    id: string,
    content?: string,
    title?: string,
    tags?: string[],
    metadataJson?: string,
    options?: { isMetadataOnly?: boolean }
  ) =>
    invokeTauri<DocumentMetadata>('save_document', {
      id,
      content,
      title,
      tags,
      metadataJson,
      metadata_json: metadataJson,
      isMetadataOnly: options?.isMetadataOnly,
      is_metadata_only: options?.isMetadataOnly,
    }),

  updateDocumentMetadata: (
    id: string,
    metadataJson?: string,
    title?: string,
    tags?: string[]
  ) =>
    invokeTauri<DocumentMetadata>('save_document', {
      id,
      content: undefined,
      title,
      tags,
      metadataJson,
      metadata_json: metadataJson,
      isMetadataOnly: true,
      is_metadata_only: true,
    }),

  createUniverseInHouse: (
    expectedRevision: number,
    name: string,
    description: string | undefined,
    targetHouseId: string
  ) =>
    invokeTauri<{ universe_id: string; universe_name: string; house_id: string; thought: Thought }>(
      'create_universe_in_house',
      {
        expectedRevision,
        name,
        description,
        targetHouseId,
      }
    ),

  renameDocument: (id: string, newTitle: string) =>
    invokeTauri<DocumentMetadata>('rename_document', { id, newTitle }),

  deleteDocument: (id: string) =>
    invokeTauri<void>('delete_document', { id }),

  reindexLibrary: () =>
    invokeTauri<ReindexReport>('reindex_library'),

  searchDocuments: (query: string, docType?: DocumentType, houseId?: string) =>
    invokeTauri<SearchResult[]>('search_documents', { query, docType, houseId }),

  listTags: (houseId?: string) =>
    invokeTauri<string[]>('list_tags', { houseId }),

  listCipherDictionaries: () =>
    invokeTauri<CipherKey[]>('cipher_list_dictionaries'),

  getCipherDictionary: (id: string) =>
    invokeTauri<CipherKey>('cipher_get_dictionary', { id }),

  saveCipherDictionary: (dictionary: CipherKey) =>
    invokeTauri<CipherKey>('cipher_save_dictionary', { dictionary }),

  deleteCipherDictionary: (id: string, force?: boolean) =>
    invokeTauri<void>('cipher_delete_dictionary', { id, force }),

  bulkDeleteCipherDictionaries: async (
    ids: string[],
    force?: boolean
  ): Promise<{ deleted: string[]; blocked: Array<{ id: string; reason: string }> }> => {
    const deleted: string[] = [];
    const blocked: Array<{ id: string; reason: string }> = [];
    for (const id of ids) {
      try {
        await invokeTauri<void>('cipher_delete_dictionary', { id, force });
        deleted.push(id);
      } catch (err: any) {
        blocked.push({ id, reason: err?.message || String(err) });
      }
    }
    return { deleted, blocked };
  },

  exportCipherDictionary: (id: string, targetPath: string) =>
    invokeTauri<void>('cipher_export_dictionary', { id, targetPath }),

  importCipherDictionary: (sourcePath: string) =>
    invokeTauri<CipherKey>('cipher_import_dictionary', { sourcePath }),

  listVocabularyPools: () =>
    invokeTauri<VocabularyPoolInfo[]>('cipher_list_vocabulary_pools'),

  getVocabularySample: (poolId?: string, count?: number, excludeWords?: string[]) =>
    invokeTauri<string[]>('cipher_get_vocabulary_sample', { poolId, count: count ?? 20, excludeWords: excludeWords ?? [] }),

  importVocabularyPool: (name: string, content: string) =>
    invokeTauri<VocabularyPoolInfo>('cipher_import_vocabulary_pool', { name, content }),

  deleteVocabularyPool: (poolId: string) =>
    invokeTauri<void>('cipher_delete_vocabulary_pool', { poolId }),

  saveExportFile: (
    suggestedName: string,
    content: { text?: string; bytes?: number[] },
    filterName: string,
    filterExt: string
  ) =>
    invokeTauri<string | null>('save_export_file', {
      suggestedName,
      contentBytes: content.bytes,
      contentText: content.text,
      filterName,
      filterExt,
    }),
  listHouses: () =>
    invokeTauri<HouseRecord[]>('list_houses'),

  getHouse: (id: string) =>
    invokeTauri<HouseRecord>('get_house', { id }),

  createHouse: (input: CreateHouseInput) =>
    invokeTauri<HouseRecord>('create_house', { input }),

  updateHouse: (input: UpdateHouseInput) =>
    invokeTauri<HouseRecord>('update_house', { input }),

  archiveHouse: (id: string) =>
    invokeTauri<HouseRecord>('archive_house', { id }),

  restoreHouse: (id: string) =>
    invokeTauri<HouseRecord>('restore_house', { id }),

  moveDocumentToHouse: (docId: string, targetHouseId: string) =>
    invokeTauri<DocumentMetadata>('move_document_to_house', { docId, targetHouseId }),

  assignUniverseToHouse: (universeId: string, targetHouseId: string) =>
    invokeTauri<void>('assign_universe_to_house', { universeId, targetHouseId }),
  moveUniverseToHouse: (universeId: string, targetHouseId: string) =>
    invokeTauri<UniverseMoveResult>('move_universe_to_house', { universeId, targetHouseId }),

  recoverPendingUniverseMoves: () =>
    invokeTauri<UniverseMoveResult | null>('recover_pending_universe_moves'),
  inspectHouseIntegrity: () =>
    invokeTauri<HouseIntegrityReport>('inspect_house_integrity'),

  exitApp: () =>
    invokeTauri<void>('exit_app', {}),

  musicListTracks: () =>
    invokeTauri<AudioTrack[]>('music_list_tracks'),

  musicGetTrackBytes: (relativePath: string) =>
    invokeTauri<number[]>('music_get_track_bytes', { relativePath }),

  musicOpenFolder: () =>
    invokeTauri<void>('music_open_folder', {}),
};
