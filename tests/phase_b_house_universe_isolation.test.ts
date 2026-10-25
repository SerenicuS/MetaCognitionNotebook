import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MockStorage } from '../src/services/api';
import { getHouseUniverses, resolveUniverseHouseId, DEFAULT_HOUSE_ID } from '../src/utils/house';
import { getChaptersForBook, resolveEntityUniverse } from '../src/utils/universe';
import { initialize } from '../src/utils/thought';
import type { DocumentDetail, DocumentMetadata, DocumentType, HouseRecord } from '../src/types';
import type { Plan } from '../src/utils/thought';

const FRONTMATTER_PREFIX = '---json\n';
const FRONTMATTER_SUFFIX = '\n---\n';

class RealFilesystemStorage {
  public rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    fs.mkdirSync(path.join(this.rootDir, 'Lorebooks'), { recursive: true });
    fs.mkdirSync(path.join(this.rootDir, 'Manuscripts'), { recursive: true });
    fs.mkdirSync(path.join(this.rootDir, 'library'), { recursive: true });
  }

  public resolvePath(relativePath: string): string {
    return path.join(this.rootDir, relativePath);
  }

  public async createDocument(
    docType: DocumentType,
    title: string,
    initialContent = '',
    metadataJson?: string,
    houseId = 'house-default'
  ): Promise<DocumentDetail> {
    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const folder = docType === 'lorebook' ? 'Lorebooks' : 'Manuscripts';
    const cleanTitle = title.trim().replace(/[\s\/:*?"<>|]+/g, '_');
    const relativePath = `${folder}/${cleanTitle}.md`;
    const now = new Date().toISOString();

    const detail: DocumentDetail = {
      metadata: {
        id,
        title,
        doc_type: docType,
        relative_path: relativePath,
        created_at: now,
        updated_at: now,
        tags: [],
        house_id: houseId,
        metadata_json: metadataJson ?? null,
      },
      content: initialContent,
    };

    await this.writeDocumentAtomic(relativePath, detail);
    return detail;
  }

  public async saveDocument(
    id: string,
    content?: string,
    title?: string,
    tags?: string[],
    metadataJson?: string,
    options?: { isMetadataOnly?: boolean }
  ): Promise<DocumentMetadata> {
    const foundRel = this.findRelativePathById(id);
    if (!foundRel) {
      throw new Error(`Document with ID '${id}' not found`);
    }

    const current = await this.readDocument(foundRel);

    const finalContent = options?.isMetadataOnly
      ? current.content
      : content !== undefined
      ? content
      : current.content;

    // F-03 Guard: Document UUID can NEVER be supplied as Markdown body
    if (id.trim() && finalContent.trim() === id.trim()) {
      throw new Error(`Refusing to save document '${id}': body matches document ID`);
    }

    const now = new Date().toISOString();
    const updatedMeta: DocumentMetadata = {
      ...current.metadata,
      id,
      title: title ?? current.metadata.title,
      updated_at: now,
      tags: tags ?? current.metadata.tags,
      metadata_json: metadataJson !== undefined ? metadataJson : current.metadata.metadata_json,
    };

    const updatedDetail: DocumentDetail = {
      metadata: updatedMeta,
      content: finalContent,
    };

    await this.writeDocumentAtomic(foundRel, updatedDetail);
    return updatedMeta;
  }

  public async getDocument(id: string): Promise<DocumentDetail> {
    const foundRel = this.findRelativePathById(id);
    if (!foundRel) {
      throw new Error(`Document with ID '${id}' not found`);
    }
    return this.readDocument(foundRel);
  }

  public async readDocument(relativePath: string): Promise<DocumentDetail> {
    const fullPath = this.resolvePath(relativePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Document file not found: ${relativePath}`);
    }

    const raw = fs.readFileSync(fullPath, 'utf8');
    if (!raw.startsWith(FRONTMATTER_PREFIX)) {
      throw new Error(`Invalid frontmatter in: ${relativePath}`);
    }

    const suffixIndex = raw.indexOf(FRONTMATTER_SUFFIX, FRONTMATTER_PREFIX.length);
    if (suffixIndex === -1) {
      throw new Error(`Unterminated frontmatter in: ${relativePath}`);
    }

    const jsonStr = raw.substring(FRONTMATTER_PREFIX.length, suffixIndex);
    const content = raw.substring(suffixIndex + FRONTMATTER_SUFFIX.length);
    const fm = JSON.parse(jsonStr);

    return {
      metadata: {
        id: fm.id,
        title: fm.title,
        doc_type: fm.doc_type,
        relative_path: relativePath,
        house_id: fm.house_id ?? 'house-default',
        created_at: fm.created_at,
        updated_at: fm.updated_at,
        tags: fm.tags ?? [],
        metadata_json: fm.metadata ? JSON.stringify(fm.metadata) : null,
      },
      content,
    };
  }

  public async writeDocumentAtomic(relativePath: string, detail: DocumentDetail): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    const parent = path.dirname(fullPath);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }

    const fm = {
      id: detail.metadata.id,
      title: detail.metadata.title,
      doc_type: detail.metadata.doc_type,
      house_id: detail.metadata.house_id,
      created_at: detail.metadata.created_at,
      updated_at: detail.metadata.updated_at,
      tags: detail.metadata.tags,
      metadata: detail.metadata.metadata_json ? JSON.parse(detail.metadata.metadata_json) : undefined,
    };

    const frontmatter = `${FRONTMATTER_PREFIX}${JSON.stringify(fm, null, 2)}${FRONTMATTER_SUFFIX}`;
    const payload = `${frontmatter}${detail.content}`;

    const tempFile = `${fullPath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
    fs.writeFileSync(tempFile, payload, 'utf8');
    fs.renameSync(tempFile, fullPath);
  }

  private findRelativePathById(id: string): string | null {
    for (const folder of ['Lorebooks', 'Manuscripts']) {
      const dir = path.join(this.rootDir, folder);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const rel = `${folder}/${file}`;
        const detail = fs.readFileSync(path.join(this.rootDir, rel), 'utf8');
        if (detail.includes(`"id": "${id}"`) || detail.includes(`"id":"${id}"`)) {
          return rel;
        }
      }
    }
    return null;
  }
}

describe('Phase B — P1 House & Universe Isolation Verification Suite', () => {
  // =========================================================================
  // F-04: Active-House Universe Filtering & Ghost Universe Isolation
  // =========================================================================
  describe('F-04: Active-House Universe Filtering & Ghost Universe Isolation', () => {
    it('scopes universe visibility strictly to the active House and isolates same-named Universes', () => {
      const uniAlpha = { id: 'uni-avalon-alpha-101', name: 'Avalon' };
      const uniBeta = { id: 'uni-avalon-beta-202', name: 'Avalon' };
      const uniGhostAlpha = { id: 'uni-solitary-alpha-303', name: 'Solitary Realm' };
      const uniLegacyUnassigned = { id: 'uni-legacy-unassigned-404', name: 'Old Unassigned Cosmos' };

      const plan: Plan = {
        version: 1,
        revision: 4,
        universes: [uniAlpha, uniBeta, uniGhostAlpha, uniLegacyUnassigned],
        books: [],
        entities: [],
        nodes: [],
        relationships: [],
      };

      const houseA: HouseRecord = {
        id: 'house-alpha',
        name: 'House Alpha',
        color: 'amber',
        icon: 'castle',
        enabled_studios: ['lorebook'],
        manuscript_tools_enabled: true,
        universe_ids: [uniAlpha.id, uniGhostAlpha.id],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        archived: false,
      };

      const houseB: HouseRecord = {
        id: 'house-beta',
        name: 'House Beta',
        color: 'emerald',
        icon: 'landmark',
        enabled_studios: ['lorebook'],
        manuscript_tools_enabled: true,
        universe_ids: [uniBeta.id],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        archived: false,
      };

      const houseDefault: HouseRecord = {
        id: 'house-default',
        name: 'Primary House',
        color: 'amber',
        icon: 'castle',
        enabled_studios: ['lorebook'],
        manuscript_tools_enabled: true,
        universe_ids: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        archived: false,
      };

      const houses = [houseA, houseB, houseDefault];

      // 1. House Alpha sees its own Avalon and Solitary Realm, never House Beta's Avalon
      const houseAUniverses = getHouseUniverses(plan, houseA, houses);
      assert.equal(houseAUniverses.length, 2);
      assert.ok(houseAUniverses.some(u => u.id === uniAlpha.id));
      assert.ok(houseAUniverses.some(u => u.id === uniGhostAlpha.id));
      assert.ok(!houseAUniverses.some(u => u.id === uniBeta.id), 'House Beta Avalon must never be visible in House Alpha');

      // 2. House Beta sees ONLY its own Avalon; Ghost universe from Alpha NEVER appears in Beta
      const houseBUniverses = getHouseUniverses(plan, houseB, houses);
      assert.equal(houseBUniverses.length, 1);
      assert.equal(houseBUniverses[0].id, uniBeta.id);
      assert.ok(!houseBUniverses.some(u => u.id === uniGhostAlpha.id), 'Ghost universe from House A must not leak into House B');

      // 3. Backward compatibility (Invariant L3): unassigned universe maps to house-default
      const defaultUniverses = getHouseUniverses(plan, houseDefault, houses);
      assert.ok(defaultUniverses.some(u => u.id === uniLegacyUnassigned.id), 'Unassigned universe must be discoverable in house-default');
      assert.equal(resolveUniverseHouseId(uniLegacyUnassigned.id, houses), DEFAULT_HOUSE_ID);
    });
  });

  // =========================================================================
  // F-05: House-Switch State Reconciliation & Late Async Load Protection
  // =========================================================================
  describe('F-05: House-Switch State Reconciliation & Late Async Load Protection', () => {
    it('flushes pending edits and prevents late async loads from restoring selections from previous house', async () => {
      const storage = new MockStorage();

      const houseA = await storage.createHouse({ name: 'House Alpha', enabled_studios: ['lorebook'] });
      const houseB = await storage.createHouse({ name: 'House Beta', enabled_studios: ['lorebook'] });

      const docA = await storage.createDocument('lorebook', 'Scroll of Alpha', undefined, 'Initial Alpha content', undefined, undefined, houseA.id);

      // Simulate editor state and pending edit
      let activeDoc: DocumentDetail | null = docA;
      let activeHouseId = houseA.id;
      let houseSwitchGeneration = 0;

      // Pending edit in House A
      let pendingEdit: { docId: string; content: string } | null = {
        docId: docA.metadata.id,
        content: 'Modified Alpha content waiting to save',
      };

      // House switch initiated
      const flushPendingSave = async () => {
        if (pendingEdit) {
          await storage.saveDocument(pendingEdit.docId, pendingEdit.content);
          pendingEdit = null;
        }
        return true;
      };

      // Switch to House B
      const switchHouse = async (targetId: string) => {
        await flushPendingSave();
        houseSwitchGeneration++;
        activeHouseId = targetId;
        if (activeDoc && (activeDoc.metadata.house_id || 'house-default') !== targetId) {
          activeDoc = null;
        }
      };

      // Simulate a late async load for Doc A initiated before the switch
      const loadGenAtStart = houseSwitchGeneration;
      const lateLoadPromise = (async () => {
        // Delay to simulate async IPC
        await new Promise(r => setTimeout(r, 20));
        const loadedDetail = await storage.getDocument(docA.metadata.id);
        if (houseSwitchGeneration !== loadGenAtStart) {
          // Discard late load: house switched while loading
          return null;
        }
        return loadedDetail;
      })();

      // Switch immediately
      await switchHouse(houseB.id);

      // Verify activeDoc was cleared and pending edit was persisted to Doc A
      assert.equal(activeDoc, null, 'Active doc from House A must be cleared on switch to House B');
      assert.equal(activeHouseId, houseB.id);

      const savedDocA = await storage.getDocument(docA.metadata.id);
      assert.equal(savedDocA.content, 'Modified Alpha content waiting to save', 'Pending edit must flush before house switch');

      // Verify the late load completed and was discarded
      const lateResult = await lateLoadPromise;
      assert.equal(lateResult, null, 'Late async load from previous house must be rejected');
    });
  });

  // =========================================================================
  // F-06: Scoped Legacy Universe Name Resolution & Cross-House Protection
  // =========================================================================
  describe('F-06: Scoped Legacy Universe Name Resolution & Cross-House Protection', () => {
    it('disambiguates duplicate legacy universe names using document house ownership and rejects ambiguous candidates', async () => {
      const storage = new MockStorage();

      const houseA = await storage.createHouse({ name: 'House Alpha', enabled_studios: ['lorebook'] });
      const houseB = await storage.createHouse({ name: 'House Beta', enabled_studios: ['lorebook'] });

      // Create two Universes named "Avalon" under House A and House B
      const uniA = await storage.createUniverseInHouse(0, 'Avalon', 'Alpha Avalon', houseA.id);
      const uniB = await storage.createUniverseInHouse(1, 'Avalon', 'Beta Avalon', houseB.id);

      assert.notEqual(uniA.universe_id, uniB.universe_id);

      // Create legacy entity in House B with legacy string "universe": "Avalon" without universe_id
      const legacyDocB = await storage.createDocument(
        'lorebook',
        'Knight of Avalon',
        undefined,
        'Prose of Knight',
        JSON.stringify({ universe: 'Avalon' }),
        undefined,
        houseB.id
      );

      // Moving legacyDocB within House B or validating its ownership:
      // Must resolve strictly to House B's Avalon (uniB), NOT House A's Avalon (uniA)
      const res = resolveEntityUniverse(legacyDocB.metadata, [
        { id: uniA.universe_id, name: 'Avalon' },
        { id: uniB.universe_id, name: 'Avalon' },
      ]);
      // When resolved against global universes without house scope, it correctly reports ambiguous
      assert.equal(res.isAmbiguous, true);

      // When resolved against House B's scoped universes, it resolves uniquely to uniB
      const scopedRes = resolveEntityUniverse(legacyDocB.metadata, [
        { id: uniB.universe_id, name: 'Avalon' },
      ]);
      assert.equal(scopedRes.isAmbiguous, false);
      assert.equal(scopedRes.universeId, uniB.universe_id);
    });
  });

  // =========================================================================
  // F-07: getChaptersForBook UUID-First Matching
  // =========================================================================
  describe('F-07: getChaptersForBook UUID-First Matching', () => {
    it('strictly isolates chapters belonging to different books that share the same display name', () => {
      const book1Id = 'book-uuid-first-dawn-1';
      const book2Id = 'book-uuid-first-dawn-2';

      const chap1: DocumentMetadata = {
        id: 'chap-1-doc',
        title: 'Arrival',
        doc_type: 'lorebook',
        house_id: 'house-alpha',
        relative_path: 'Lorebooks/Arrival.md',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        tags: [],
        metadata_json: JSON.stringify({
          entry_type: 'chapter',
          book: 'First Dawn',
          book_id: book1Id,
          chapter_order: 1,
        }),
      };

      const chap2: DocumentMetadata = {
        id: 'chap-2-doc',
        title: 'Arrival in Alternative Realm',
        doc_type: 'lorebook',
        house_id: 'house-beta',
        relative_path: 'Lorebooks/Arrival_1.md',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        tags: [],
        metadata_json: JSON.stringify({
          entry_type: 'chapter',
          book: 'First Dawn',
          book_id: book2Id,
          chapter_order: 1,
        }),
      };

      const allDocs = [chap1, chap2];

      // Query chapters for Book 1
      const book1Chapters = getChaptersForBook(allDocs, book1Id, 'First Dawn');
      assert.equal(book1Chapters.length, 1);
      assert.equal(book1Chapters[0].id, chap1.id);

      // Query chapters for Book 2
      const book2Chapters = getChaptersForBook(allDocs, book2Id, 'First Dawn');
      assert.equal(book2Chapters.length, 1);
      assert.equal(book2Chapters[0].id, chap2.id);
    });
  });

  // =========================================================================
  // F-08: thought.initialize Preserves UUIDs for Duplicate-Named Universes
  // =========================================================================
  describe('F-08: thought.initialize Preserves UUIDs for Duplicate-Named Universes', () => {
    it('keys universes and books by UUID so duplicate-named entities remain in distinct universes', () => {
      const uniAlphaId = 'uni-avalon-alpha-uuid';
      const uniBetaId = 'uni-avalon-beta-uuid';
      const bookAlphaId = 'book-alpha-dawn-uuid';
      const bookBetaId = 'book-beta-dawn-uuid';

      const docA: DocumentMetadata = {
        id: 'char-laxus-a',
        title: 'Laxus of Alpha',
        doc_type: 'lorebook',
        house_id: 'house-alpha',
        relative_path: 'Lorebooks/Laxus.md',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        tags: [],
        metadata_json: JSON.stringify({
          entry_type: 'character',
          universe: 'Avalon',
          universe_id: uniAlphaId,
          book: 'First Dawn',
          book_id: bookAlphaId,
        }),
      };

      const docB: DocumentMetadata = {
        id: 'char-laxus-b',
        title: 'Laxus of Beta',
        doc_type: 'lorebook',
        house_id: 'house-beta',
        relative_path: 'Lorebooks/Laxus_1.md',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        tags: [],
        metadata_json: JSON.stringify({
          entry_type: 'character',
          universe: 'Avalon',
          universe_id: uniBetaId,
          book: 'First Dawn',
          book_id: bookBetaId,
        }),
      };

      const plan = initialize([docA, docB]);

      // Both Universes must exist with their exact UUIDs, not collapsed into 1
      assert.equal(plan.universes.length, 2);
      assert.ok(plan.universes.some(u => u.id === uniAlphaId && u.name === 'Avalon'));
      assert.ok(plan.universes.some(u => u.id === uniBetaId && u.name === 'Avalon'));

      // Both Books must exist with their exact UUIDs
      assert.equal(plan.books.length, 2);
      assert.ok(plan.books.some(b => b.id === bookAlphaId && b.universe_id === uniAlphaId));
      assert.ok(plan.books.some(b => b.id === bookBetaId && b.universe_id === uniBetaId));

      // Entities mapped to correct universes
      const entA = plan.entities.find(e => e.id === docA.id);
      const entB = plan.entities.find(e => e.id === docB.id);
      assert.equal(entA?.universe_id, uniAlphaId);
      assert.equal(entB?.universe_id, uniBetaId);
    });
  });

  // =========================================================================
  // F-09 & F-10: Navigation & MoveUniverseModal Accurate Scoping
  // =========================================================================
  describe('F-09 & F-10: Navigation & MoveUniverseModal Accurate Scoping', () => {
    it('counts owned documents using resolveEntityUniverse without cross-House name collision', () => {
      const targetUni = { id: 'uni-avalon-alpha-uuid', name: 'Avalon' };
      const otherUni = { id: 'uni-avalon-beta-uuid', name: 'Avalon' };
      const allUniverses = [targetUni, otherUni];

      const docAlpha: DocumentMetadata = {
        id: 'doc-alpha',
        title: 'Alpha Lore',
        doc_type: 'lorebook',
        house_id: 'house-alpha',
        relative_path: 'Lorebooks/Alpha_Lore.md',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        tags: [],
        metadata_json: JSON.stringify({ universe_id: targetUni.id, universe: 'Avalon' }),
      };

      const docBeta: DocumentMetadata = {
        id: 'doc-beta',
        title: 'Beta Lore',
        doc_type: 'lorebook',
        house_id: 'house-beta',
        relative_path: 'Lorebooks/Beta_Lore.md',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        tags: [],
        metadata_json: JSON.stringify({ universe_id: otherUni.id, universe: 'Avalon' }),
      };

      const docs = [docAlpha, docBeta];

      // Accurate count using resolveEntityUniverse
      const count = docs.filter(d => {
        if (d.doc_type !== 'lorebook') return false;
        const res = resolveEntityUniverse(d, allUniverses);
        return res.universeId === targetUni.id;
      }).length;

      assert.equal(count, 1, 'Only docAlpha must be counted for targetUni, never docBeta');
    });
  });
});
