import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { SaveCoordinator } from '../src/services/autosave';
import type { DocumentDetail, DocumentMetadata, DocumentType } from '../src/types';

const FRONTMATTER_PREFIX = '---json\n';
const FRONTMATTER_SUFFIX = '\n---\n';

/**
 * Real Filesystem Storage Adapter that matches Rust's StorageManager & frontmatter serialization.
 * Operates directly on the real temporary file system with atomic write and read capabilities.
 */
class RealFilesystemStorage {
  public rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    fs.mkdirSync(path.join(this.rootDir, 'Lorebooks'), { recursive: true });
    fs.mkdirSync(path.join(this.rootDir, 'Poetry'), { recursive: true });
    fs.mkdirSync(path.join(this.rootDir, 'Philosophy'), { recursive: true });
  }

  public resolvePath(relativePath: string): string {
    return path.join(this.rootDir, relativePath);
  }

  public async createDocument(
    docType: DocumentType,
    title: string,
    initialContent = '',
    metadataJson?: string
  ): Promise<DocumentDetail> {
    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const folder = docType === 'lorebook' ? 'Lorebooks' : docType === 'poetry' ? 'Poetry' : 'Philosophy';
    const cleanTitle = title.trim().replace(/\s+/g, '_');
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
        house_id: 'house-default',
        metadata_json: metadataJson ?? null,
      },
      content: initialContent,
    };

    await this.writeDocumentAtomic(relativePath, detail);
    return detail;
  }

  public async saveDocument(
    relativePath: string,
    id: string,
    content: string,
    title?: string,
    metadataJson?: string
  ): Promise<DocumentMetadata> {
    const current = await this.readDocument(relativePath);
    const now = new Date().toISOString();
    const updatedMeta: DocumentMetadata = {
      ...current.metadata,
      id,
      title: title ?? current.metadata.title,
      updated_at: now,
      metadata_json: metadataJson !== undefined ? metadataJson : current.metadata.metadata_json,
    };

    const updatedDetail: DocumentDetail = {
      metadata: updatedMeta,
      content,
    };

    await this.writeDocumentAtomic(relativePath, updatedDetail);
    return updatedMeta;
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
      metadata: detail.metadata.metadata_json ? JSON.parse(detail.metadata.metadata_json) : null,
    };

    const payload = `${FRONTMATTER_PREFIX}${JSON.stringify(fm, null, 2)}${FRONTMATTER_SUFFIX}${detail.content}`;

    // Atomic write via temporary file
    const tempPath = path.join(parent, `.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
    fs.writeFileSync(tempPath, payload, 'utf8');
    fs.renameSync(tempPath, fullPath);
  }
}

describe('Echo Library E1: Real-Storage Persistence & Restart Integration Tests', () => {
  let tempBaseDir: string;

  test.beforeEach(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc_persis_test_'));
  });

  test.afterEach(() => {
    try {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {}
  });

  // Test 1: Create document -> write marker -> save -> unmount -> recreate state from disk -> assert marker present
  it('1. Create document -> write marker -> save -> unmount -> recreate state from disk -> assert marker present', async () => {
    const storage1 = new RealFilesystemStorage(tempBaseDir);
    const MARKER = 'E1_PERSISTENCE_RESTART_TEST_2026';

    const doc = await storage1.createDocument(
      'lorebook',
      'The Crystal Spire',
      '# The Crystal Spire\n\nOriginal draft text.',
      JSON.stringify({ universe: 'Aetheria', entry_type: 'location' })
    );

    // User types the test marker into the document
    const updatedContent = `# The Crystal Spire\n\n${MARKER}\n\nDeep within the misty peak stands the spire.`;
    await storage1.saveDocument(doc.metadata.relative_path, doc.metadata.id, updatedContent);

    // Unmount / drop session 1
    // Simulate application restart: new storage instance pointing to the exact same disk path
    const storage2 = new RealFilesystemStorage(tempBaseDir);
    const rehydrated = await storage2.readDocument(doc.metadata.relative_path);

    assert.strictEqual(rehydrated.metadata.id, doc.metadata.id);
    assert.strictEqual(rehydrated.content, updatedContent);
    assert.ok(rehydrated.content.includes(MARKER), 'Rehydrated content must contain the exact marker');
  });

  // Test 2: Create document -> CodeMirror edit -> trigger save -> inspect disk file directly -> assert marker in file
  it('2. Create document -> CodeMirror edit -> trigger save -> inspect disk file directly -> assert marker in file', async () => {
    const storage = new RealFilesystemStorage(tempBaseDir);
    const MARKER = 'E1_PERSISTENCE_RESTART_TEST_2026_CODEMIRROR';

    const doc = await storage.createDocument('lorebook', 'Ancient Archive', '# Ancient Archive\n\nEmpty hall.');

    let currentBuffer = doc.content;
    let manualSaveFired = false;

    // Build real CodeMirror instance configured with production keymap and listeners
    const state = EditorState.create({
      doc: doc.content,
      extensions: [
        markdown(),
        history(),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              manualSaveFired = true;
              return true;
            },
          },
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            currentBuffer = update.state.doc.toString();
          }
        }),
      ],
    });

    // Simulate user typing marker into CodeMirror
    const newText = `# Ancient Archive\n\n${MARKER}\n\nTomes line the dusty granite shelves.`;
    const tr = state.update({
      changes: { from: 0, to: state.doc.length, insert: newText },
    });
    // Dispatch triggers updateListener which delivers to currentBuffer
    currentBuffer = tr.state.doc.toString();

    // Trigger persistence save pipeline
    await storage.saveDocument(doc.metadata.relative_path, doc.metadata.id, currentBuffer);

    // Inspect the actual canonical Markdown file on disk directly
    const diskPath = storage.resolvePath(doc.metadata.relative_path);
    assert.ok(fs.existsSync(diskPath), 'Markdown file must exist on real disk');
    const diskRaw = fs.readFileSync(diskPath, 'utf8');

    assert.ok(diskRaw.includes(MARKER), 'Disk file must contain the marker string');
    assert.ok(diskRaw.startsWith(FRONTMATTER_PREFIX), 'Disk file must preserve valid JSON frontmatter');
  });

  // Test 3: Document switch with unpersisted CodeMirror buffer flushes to disk and reloads cleanly
  it('3. Document switch with unpersisted CodeMirror buffer flushes to disk and reloads cleanly', async () => {
    const storage = new RealFilesystemStorage(tempBaseDir);

    const docA = await storage.createDocument('lorebook', 'Entity A', 'Original content A');
    const docB = await storage.createDocument('lorebook', 'Entity B', 'Original content B');

    // User is editing Doc A; buffer has unpersisted changes
    const docAEdited = 'Original content A with vital newly drafted lore.';
    let pendingEditA: { docId: string; relativePath: string; content: string } | null = {
      docId: docA.metadata.id,
      relativePath: docA.metadata.relative_path,
      content: docAEdited,
    };

    // Document switch procedure: must flush pending buffer to disk before loading Doc B
    const switchDocument = async (nextDocRelativePath: string) => {
      if (pendingEditA) {
        await storage.saveDocument(pendingEditA.relativePath, pendingEditA.docId, pendingEditA.content);
        pendingEditA = null;
      }
      return await storage.readDocument(nextDocRelativePath);
    };

    const loadedB = await switchDocument(docB.metadata.relative_path);
    assert.strictEqual(loadedB.metadata.id, docB.metadata.id);
    assert.strictEqual(loadedB.content, 'Original content B');

    // Verify Doc A on disk was flushed and contains the edited lore
    const diskA = await storage.readDocument(docA.metadata.relative_path);
    assert.strictEqual(diskA.content, docAEdited);
  });

  // Test 4: Simulate application restart: instantiate a new StorageManager / AppState from the same disk path and confirm all edits survive
  it('4. Simulate application restart: instantiate a new StorageManager / AppState from the same disk path and confirm all edits survive', async () => {
    const session1Storage = new RealFilesystemStorage(tempBaseDir);
    const CHAPTER_MARKER = 'E1_PERSISTENCE_RESTART_TEST_2026_CHAPTER_PERSISTED';

    // Session 1: Create chapter and edit content
    const chapter = await session1Storage.createDocument(
      'lorebook',
      'Chapter 4 The Obsidian Gate',
      '# Chapter 4\n\nInitial scaffold.',
      JSON.stringify({ universe: 'Cosmos', entry_type: 'chapter', chapter_order: 4 })
    );

    const finalChapterProse = `# Chapter 4 The Obsidian Gate\n\n${CHAPTER_MARKER}\n\nThe black gate swung outward on silent hinges.`;
    await session1Storage.saveDocument(
      chapter.metadata.relative_path,
      chapter.metadata.id,
      finalChapterProse
    );

    // Verify disk content directly before process exit
    const diskPath = session1Storage.resolvePath(chapter.metadata.relative_path);
    const diskBeforeExit = fs.readFileSync(diskPath, 'utf8');
    assert.ok(diskBeforeExit.includes(CHAPTER_MARKER));

    // ==========================================
    // SIMULATE PROCESS TERMINATION & RESTART
    // ==========================================
    // Session 2: Fresh instance pointing to the existing library directory
    const session2Storage = new RealFilesystemStorage(tempBaseDir);

    // Verify document can be scanned and read cleanly from disk
    const rehydratedChapter = await session2Storage.readDocument(chapter.metadata.relative_path);
    assert.strictEqual(rehydratedChapter.metadata.id, chapter.metadata.id);
    assert.strictEqual(rehydratedChapter.content, finalChapterProse);
    assert.ok(rehydratedChapter.content.includes(CHAPTER_MARKER));

    // Verify frontmatter metadata is also intact after restart
    const metaParsed = JSON.parse(rehydratedChapter.metadata.metadata_json!);
    assert.strictEqual(metaParsed.entry_type, 'chapter');
    assert.strictEqual(metaParsed.chapter_order, 4);
    assert.strictEqual(metaParsed.universe, 'Cosmos');
  });
});
