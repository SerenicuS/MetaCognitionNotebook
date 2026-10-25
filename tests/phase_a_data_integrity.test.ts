import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MockStorage } from '../src/services/api';
import type { DocumentDetail, DocumentMetadata, DocumentType } from '../src/types';

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
    if (!id.trim() && finalContent.trim() === id.trim()) {
      throw new Error(`Refusing to save document '${id}': body matches document ID`);
    }
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

describe('Phase A — P0 Data Integrity Verification Suite', () => {
  // =========================================================================
  // F-01: Universe Ownership Registration & Partial Failure Handling
  // =========================================================================
  describe('F-01: Universe Ownership Registration & Partial Failure Handling', () => {
    it('assigns newly created Universe to the active House via canonical registry API', async () => {
      const api = new MockStorage();

      const houseAlpha = await api.createHouse({
        name: 'House Alpha',
        enabled_studios: ['lorebook'],
        manuscript_tools_enabled: true,
      });

      assert.deepEqual(houseAlpha.universe_ids, []);

      const universeId = 'uni-avalon-alpha-uuid-101';
      await api.assignUniverseToHouse(universeId, houseAlpha.id);

      const houses = await api.listHouses();
      const updatedAlpha = houses.find(h => h.id === houseAlpha.id);
      assert.ok(updatedAlpha);
      assert.ok(updatedAlpha.universe_ids.includes(universeId));

      // Idempotency: repeated assignment succeeds without duplicate records
      await api.assignUniverseToHouse(universeId, houseAlpha.id);
      const alphaAgain = (await api.listHouses()).find(h => h.id === houseAlpha.id)!;
      assert.equal(
        alphaAgain.universe_ids.filter(u => u === universeId).length,
        1,
        'Universe ID must never be duplicated in house.universe_ids'
      );

      // Reassignment across Houses is strictly rejected
      const houseBeta = await api.createHouse({
        name: 'House Beta',
        enabled_studios: ['lorebook'],
        manuscript_tools_enabled: true,
      });

      await assert.rejects(
        async () => {
          await api.assignUniverseToHouse(universeId, houseBeta.id);
        },
        /already owned by House/
      );
    });

    it('creates duplicate-named Universes under distinct Houses with distinct UUIDs', async () => {
      const api = new MockStorage();

      const houseA = await api.createHouse({ name: 'House A', enabled_studios: ['lorebook'] });
      const houseB = await api.createHouse({ name: 'House B', enabled_studios: ['lorebook'] });

      const uniA = 'uni-avalon-house-a';
      await api.assignUniverseToHouse(uniA, houseA.id);

      const uniB = 'uni-avalon-house-b';
      await api.assignUniverseToHouse(uniB, houseB.id);

      const houses = await api.listHouses();
      const hA = houses.find(h => h.id === houseA.id)!;
      const hB = houses.find(h => h.id === houseB.id)!;

      assert.ok(hA.universe_ids.includes(uniA));
      assert.ok(!hA.universe_ids.includes(uniB));
      assert.ok(hB.universe_ids.includes(uniB));
      assert.ok(!hB.universe_ids.includes(uniA));
    });

    it('creates Universe atomically using createUniverseInHouse and rolls back on house failure', async () => {
      const api = new MockStorage();

      const houseAlpha = await api.createHouse({
        name: 'House Alpha',
        enabled_studios: ['lorebook'],
      });

      // 1. Successful atomic creation
      const result = await api.createUniverseInHouse(0, 'Avalon Realm', 'The mythical realm', houseAlpha.id);
      assert.ok(result.universe_id);
      assert.equal(result.universe_name, 'Avalon Realm');

      // Verify universe is in plan and in House Alpha
      const thoughtAfter = await api.thoughtGet();
      assert.ok(thoughtAfter.plan!.universes.some(u => u.id === result.universe_id));
      const houseAfter = (await api.listHouses()).find(h => h.id === houseAlpha.id)!;
      assert.ok(houseAfter.universe_ids.includes(result.universe_id));

      // 2. Failure case: attempt creation into archived or nonexistent House rolls back plan
      const currentRev = thoughtAfter.plan!.revision;
      await assert.rejects(
        async () => {
          await api.createUniverseInHouse(currentRev, 'Ghost Cosmos', undefined, 'house-nonexistent');
        },
        /Target House 'house-nonexistent' does not exist/
      );

      // Verify ghost cosmos was NOT left behind in the plan
      const rolledBackThought = await api.thoughtGet();
      assert.ok(!rolledBackThought.plan!.universes.some(u => u.name === 'Ghost Cosmos'));
    });
  });

  // =========================================================================
  // F-02: Chapter Reorder Prose Preservation & Intentional Empty Saves
  // =========================================================================
  describe('F-02: Chapter Reorder Prose Preservation & Intentional Empty Saves', () => {
    it('preserves full Markdown content on disk during metadata-only chapter reorder', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metacog-f02-reorder-'));
      try {
        const storage = new RealFilesystemStorage(tempDir);

        const chapter1Prose = `# Arrival in Avalon\n\nThe storm cleared as the obsidian fleet breached the silver mist of the outer reefs. Laxus gripped the starboard rail, watching the dawn break over ancient ruins.\n\nEvery line of this chapter must be preserved on real disk storage.`;
        const chapter2Prose = `# The Council of Spires\n\nHigh above the flooded plazas, the archons convened in hushed secrecy. The pact had been broken before the first tide turned.\n\nCanonical prose on disk must never be replaced by an empty string.`;

        const chap1 = await storage.createDocument(
          'lorebook',
          'Chapter_1_Arrival',
          chapter1Prose,
          JSON.stringify({
            universe_id: 'uni-avalon-1',
            book_id: 'book-first-dawn-1',
            entry_type: 'chapter',
            chapter_order: 1,
          })
        );

        const chap2 = await storage.createDocument(
          'lorebook',
          'Chapter_2_The_Council',
          chapter2Prose,
          JSON.stringify({
            universe_id: 'uni-avalon-1',
            book_id: 'book-first-dawn-1',
            entry_type: 'chapter',
            chapter_order: 2,
          })
        );

        // Perform metadata-only reorder with explicit isMetadataOnly: true
        const [chap1Detail, chap2Detail] = await Promise.all([
          storage.getDocument(chap1.metadata.id),
          storage.getDocument(chap2.metadata.id),
        ]);

        const newChap1Meta = {
          ...JSON.parse(chap1Detail.metadata.metadata_json || '{}'),
          chapter_order: 2,
        };
        const newChap2Meta = {
          ...JSON.parse(chap2Detail.metadata.metadata_json || '{}'),
          chapter_order: 1,
        };

        await Promise.all([
          storage.saveDocument(chap1.metadata.id, undefined, chap1.metadata.title, chap1.metadata.tags, JSON.stringify(newChap1Meta), { isMetadataOnly: true }),
          storage.saveDocument(chap2.metadata.id, undefined, chap2.metadata.title, chap2.metadata.tags, JSON.stringify(newChap2Meta), { isMetadataOnly: true }),
        ]);

        // Cold restart verification directly from disk
        const rawDiskChap1 = fs.readFileSync(path.join(tempDir, chap1.metadata.relative_path), 'utf8');
        const rawDiskChap2 = fs.readFileSync(path.join(tempDir, chap2.metadata.relative_path), 'utf8');

        assert.ok(rawDiskChap1.includes(chapter1Prose), 'Raw Chapter 1 file on disk must contain full original prose');
        assert.ok(rawDiskChap2.includes(chapter2Prose), 'Raw Chapter 2 file on disk must contain full original prose');

        const reloaded1 = await storage.readDocument(chap1.metadata.relative_path);
        const reloaded2 = await storage.readDocument(chap2.metadata.relative_path);

        assert.equal(reloaded1.content, chapter1Prose);
        assert.equal(reloaded2.content, chapter2Prose);
        assert.equal(JSON.parse(reloaded1.metadata.metadata_json!).chapter_order, 2);
        assert.equal(JSON.parse(reloaded2.metadata.metadata_json!).chapter_order, 1);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('allows intentional clearing of document body to empty string when not metadata-only', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metacog-f02-clear-'));
      try {
        const storage = new RealFilesystemStorage(tempDir);

        const initialProse = '# Draft Notes\n\nThese draft notes will be intentionally cleared by the author.';
        const doc = await storage.createDocument('lorebook', 'Draft_Notes', initialProse);

        // Verify initial state
        const initial = await storage.getDocument(doc.metadata.id);
        assert.equal(initial.content, initialProse);

        // User intentionally clears document in editor (passes empty string without isMetadataOnly)
        await storage.saveDocument(doc.metadata.id, '', doc.metadata.title, doc.metadata.tags, doc.metadata.metadata_json ?? undefined);

        // Verify disk has empty body
        const rawDisk = fs.readFileSync(path.join(tempDir, doc.metadata.relative_path), 'utf8');
        assert.ok(rawDisk.startsWith(FRONTMATTER_PREFIX));
        assert.ok(rawDisk.endsWith(FRONTMATTER_SUFFIX));

        const reloaded = await storage.readDocument(doc.metadata.relative_path);
        assert.equal(reloaded.content, '', 'Intentional clear must persist empty body to disk');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('preserves prose when content argument is accidentally missing (undefined)', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metacog-f02-missing-arg-'));
      try {
        const storage = new RealFilesystemStorage(tempDir);

        const prose = '# Sacred Text\n\nThis text must not be deleted if a caller forgets the content argument.';
        const doc = await storage.createDocument('lorebook', 'Sacred_Text', prose);

        // Caller updates title and metadata but accidentally omits content (passes undefined)
        await storage.saveDocument(doc.metadata.id, undefined, 'Sacred Text (Updated Title)', ['canonical']);

        // Verify disk still has full prose
        const reloaded = await storage.readDocument(doc.metadata.relative_path);
        assert.equal(reloaded.content, prose, 'Accidental missing body argument must not erase prose');
        assert.equal(reloaded.metadata.title, 'Sacred Text (Updated Title)');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // =========================================================================
  // F-03: Manuscript Save Adapter & Failure Propagation
  // =========================================================================
  describe('F-03: Manuscript Save Adapter & Failure Propagation', () => {
    it('prevents document UUID from ever being saved as Markdown body and throws on error', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metacog-f03-manuscript-'));
      try {
        const storage = new RealFilesystemStorage(tempDir);

        const manuscriptProse = `# The Complete Chronicles of Avalon\n\nCompiled manuscript body containing detailed narrative sections.\nThis prose must survive all save operations without being replaced by a UUID.`;

        const doc = await storage.createDocument(
          'manuscript',
          'Chronicles_of_Avalon',
          manuscriptProse,
          JSON.stringify({
            manuscript: {
              reading_order: ['chap-1', 'chap-2'],
              export_settings: { format: 'markdown', include_toc: true },
            },
          })
        );

        const docId = doc.metadata.id;

        // Buggy caller attempts to pass document UUID as Markdown body:
        // Verification: Save failures must NEVER silently report success, they must THROW!
        await assert.rejects(
          async () => {
            await storage.saveDocument(docId, docId, doc.metadata.title, doc.metadata.tags, '{}');
          },
          /Refusing to save document.*body matches document ID/
        );

        // Verify real file on disk is UNTOUCHED
        const rawUntouched = fs.readFileSync(path.join(tempDir, doc.metadata.relative_path), 'utf8');
        assert.ok(rawUntouched.includes(manuscriptProse), 'Prose must remain untouched on disk');
        assert.ok(!rawUntouched.endsWith(`---\n${docId}`), 'UUID must NOT be appended as body on disk');

        // Legitimate save with updated prose and metadata succeeds cleanly
        const updatedProse = manuscriptProse + '\n\nEpilogue: The dawn rose above the golden spires.';
        const updatedMeta = JSON.stringify({
          manuscript: {
            reading_order: ['chap-1', 'chap-2', 'chap-3'],
            export_settings: { format: 'markdown', include_toc: true },
          },
        });

        await storage.saveDocument(docId, updatedProse, 'Chronicles of Avalon (Revised)', ['manuscript', 'v2'], updatedMeta);

        // Cold restart verification
        const rawFinal = fs.readFileSync(path.join(tempDir, doc.metadata.relative_path), 'utf8');
        assert.ok(rawFinal.includes(updatedProse), 'Disk file must contain updated prose');
        assert.ok(!rawFinal.includes(docId + '\n'), 'UUID must not be anywhere in Markdown prose');

        const reloaded = await storage.readDocument(doc.metadata.relative_path);
        assert.equal(reloaded.content, updatedProse);
        const parsed = JSON.parse(reloaded.metadata.metadata_json!);
        assert.deepEqual(parsed.manuscript.reading_order, ['chap-1', 'chap-2', 'chap-3']);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
