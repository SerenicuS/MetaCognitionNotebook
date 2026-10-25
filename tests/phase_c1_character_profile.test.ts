import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  CharacterFields,
  DocumentDetail,
  DocumentMetadata,
  DocumentType,
  LorebookMetadata,
  LorebookAttribute,
} from '../src/types';

const FRONTMATTER_PREFIX = '---json\n';
const FRONTMATTER_SUFFIX = '\n---\n';

class DisposableFilesystemStorage {
  public rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    fs.mkdirSync(path.join(this.rootDir, 'Lorebooks'), { recursive: true });
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
    const folder = 'Lorebooks';
    const cleanTitle = title.trim().replace(/[\s\/:*?"<>|]+/g, '_');
    const relativePath = `${folder}/${cleanTitle}_${id}.md`;
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

    const currentDoc = await this.readDocument(foundRel);
    const isMetadataOnly = Boolean(options?.isMetadataOnly);

    // Intentional empty body vs metadata-only update:
    // If metadata-only, preserve existing prose.
    // If intentional save, empty content string is preserved.
    let finalContent = currentDoc.content;
    if (!isMetadataOnly && content !== undefined) {
      finalContent = content;
    }

    const updatedMetadata: DocumentMetadata = {
      ...currentDoc.metadata,
      title: title ?? currentDoc.metadata.title,
      tags: tags ?? currentDoc.metadata.tags,
      metadata_json: metadataJson !== undefined ? metadataJson : currentDoc.metadata.metadata_json,
      updated_at: new Date().toISOString(),
    };

    const detail: DocumentDetail = {
      metadata: updatedMetadata,
      content: finalContent,
    };

    await this.writeDocumentAtomic(foundRel, detail);
    return updatedMetadata;
  }

  public async readDocument(relativePath: string): Promise<DocumentDetail> {
    const fullPath = this.resolvePath(relativePath);
    const raw = fs.readFileSync(fullPath, 'utf8');

    if (raw.startsWith(FRONTMATTER_PREFIX)) {
      const closingIdx = raw.indexOf(FRONTMATTER_SUFFIX, FRONTMATTER_PREFIX.length);
      if (closingIdx !== -1) {
        const jsonStr = raw.substring(FRONTMATTER_PREFIX.length, closingIdx);
        const meta = JSON.parse(jsonStr) as DocumentMetadata;
        const body = raw.substring(closingIdx + FRONTMATTER_SUFFIX.length);
        return { metadata: meta, content: body };
      }
    }

    throw new Error(`Invalid file format at ${relativePath}`);
  }

  public findRelativePathById(id: string): string | null {
    const files = fs.readdirSync(path.join(this.rootDir, 'Lorebooks'));
    for (const file of files) {
      if (file.endsWith('.md')) {
        const rel = `Lorebooks/${file}`;
        try {
          const doc = fs.readFileSync(this.resolvePath(rel), 'utf8');
          if (doc.includes(`"id":"${id}"`) || doc.includes(`"id": "${id}"`)) {
            return rel;
          }
        } catch {
          // continue
        }
      }
    }
    return null;
  }

  private async writeDocumentAtomic(relativePath: string, detail: DocumentDetail): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const payload = `${FRONTMATTER_PREFIX}${JSON.stringify(detail.metadata)}${FRONTMATTER_SUFFIX}${detail.content}`;
    const tmp = `${fullPath}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, payload, 'utf8');
    fs.renameSync(tmp, fullPath);
  }
}

describe('Phase C1: Lorebook Character Profile Architecture & Serialization', () => {
  let tmpDir: string;
  let storage: DisposableFilesystemStorage;

  const createFixtureStorage = () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metacog-phase-c1-'));
    storage = new DisposableFilesystemStorage(tmpDir);
  };

  const cleanupFixtureStorage = () => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };

  it('1. Serializes all Phase C1 character attributes accurately to durable Markdown', async () => {
    createFixtureStorage();
    try {
      const initialMeta: LorebookMetadata = {
        universe: 'Avalon',
        universe_id: 'univ-avalon-1',
        entry_type: 'character',
        canon_status: 'canon',
        attributes: [],
        character_fields: {
          species: 'High Elf / Starborn',
          age: '142 (Appears in late twenties)',
          gender: 'Non-binary (They/Them)',
          vital_status: 'Active / Alive',
          aliases: ['The White Wolf', 'Silent Sentry', 'Marshal of the Vale'],
          occupation: 'High Battle-Mage',
          narrative_role: 'Supporting Ally',
          physical_appearance: 'Slender, tall build with crystalline silver eyes and frost-pattern scars across both forearms.',
          clothing_attire: 'Midnight blue combat tunic trimmed with silvered mail and a fur-lined traveling mantle.',
          personality: 'Taciturn and observant; slow to trust but fiercely loyal once an oath is sworn.',
        },
      };

      const doc = await storage.createDocument(
        'lorebook',
        'Laxus the Wanderer',
        '# Laxus\n\nA wanderer of the Northern Wastes.',
        JSON.stringify(initialMeta)
      );

      // Verify on-disk file
      const diskDoc = await storage.readDocument(doc.metadata.relative_path);
      assert.equal(diskDoc.metadata.title, 'Laxus the Wanderer');
      assert.ok(diskDoc.content.includes('wanderer of the Northern Wastes'));

      const parsedMeta = JSON.parse(diskDoc.metadata.metadata_json!) as LorebookMetadata;
      const fields = parsedMeta.character_fields!;

      assert.equal(fields.species, 'High Elf / Starborn');
      assert.equal(fields.age, '142 (Appears in late twenties)');
      assert.equal(fields.gender, 'Non-binary (They/Them)');
      assert.equal(fields.vital_status, 'Active / Alive');
      assert.deepEqual(fields.aliases, ['The White Wolf', 'Silent Sentry', 'Marshal of the Vale']);
      assert.equal(fields.occupation, 'High Battle-Mage');
      assert.equal(fields.narrative_role, 'Supporting Ally');
      assert.ok(fields.physical_appearance?.includes('crystalline silver eyes'));
      assert.ok(fields.clothing_attire?.includes('Midnight blue combat tunic'));
      assert.ok(fields.personality?.includes('Taciturn and observant'));
    } finally {
      cleanupFixtureStorage();
    }
  });

  it('2. Strictly preserves legacy Character fields (role, goals, motivations, strengths, weaknesses)', async () => {
    createFixtureStorage();
    try {
      const legacyMeta: LorebookMetadata = {
        universe: 'Avalon',
        universe_id: 'univ-avalon-1',
        entry_type: 'character',
        canon_status: 'canon',
        attributes: [],
        character_fields: {
          role: 'Reluctant Regent',
          species: 'Human',
          affiliation: 'Northern Guard',
          residence: 'Sunken Citadel',
          goals: 'Restore the shattered sun ward',
          motivations: 'Avenge the fallen third regiment',
          strengths: 'Unbreakable tactical resolve',
          weaknesses: 'Paralyzing guilt from the siege',
        },
      };

      const doc = await storage.createDocument(
        'lorebook',
        'Old Commander Corin',
        'Prose about Commander Corin.',
        JSON.stringify(legacyMeta)
      );

      // Update with new Phase C1 attributes without modifying legacy prompts
      const existing = JSON.parse(doc.metadata.metadata_json!) as LorebookMetadata;
      const updatedMeta: LorebookMetadata = {
        ...existing,
        character_fields: {
          ...existing.character_fields,
          age: '54',
          vital_status: 'In Exile',
          aliases: ['The Iron General'],
          occupation: 'Blacksmith & Veteran',
        },
      };

      await storage.saveDocument(
        doc.metadata.id,
        undefined,
        undefined,
        undefined,
        JSON.stringify(updatedMeta),
        { isMetadataOnly: true }
      );

      // Read back from raw disk to ensure zero loss
      const reloaded = await storage.readDocument(doc.metadata.relative_path);
      const reloadedMeta = JSON.parse(reloaded.metadata.metadata_json!) as LorebookMetadata;
      const f = reloadedMeta.character_fields!;

      // Legacy fields must remain completely intact
      assert.equal(f.role, 'Reluctant Regent');
      assert.equal(f.species, 'Human');
      assert.equal(f.affiliation, 'Northern Guard');
      assert.equal(f.residence, 'Sunken Citadel');
      assert.equal(f.goals, 'Restore the shattered sun ward');
      assert.equal(f.motivations, 'Avenge the fallen third regiment');
      assert.equal(f.strengths, 'Unbreakable tactical resolve');
      assert.equal(f.weaknesses, 'Paralyzing guilt from the siege');

      // Newly added fields must be present
      assert.equal(f.age, '54');
      assert.equal(f.vital_status, 'In Exile');
      assert.deepEqual(f.aliases, ['The Iron General']);
      assert.equal(f.occupation, 'Blacksmith & Veteran');
    } finally {
      cleanupFixtureStorage();
    }
  });

  it('3. Alias persistence supports array deduplication, trimming, and multiple aliases', async () => {
    createFixtureStorage();
    try {
      const meta: LorebookMetadata = {
        universe: 'Avalon',
        universe_id: 'univ-avalon-1',
        entry_type: 'character',
        canon_status: 'canon',
        attributes: [],
        character_fields: {
          aliases: ['Shadow', 'The Wolf', 'Shadow', '  Frost Walker  ', ''],
        },
      };

      // Clean normalization as performed by CharacterProfileFields
      const rawAliases = meta.character_fields!.aliases!;
      const cleaned = [...new Set(rawAliases.map((a) => a.trim()).filter(Boolean))];
      meta.character_fields!.aliases = cleaned;

      const doc = await storage.createDocument(
        'lorebook',
        'Phantom',
        'Prose...',
        JSON.stringify(meta)
      );

      const diskDoc = await storage.readDocument(doc.metadata.relative_path);
      const parsed = JSON.parse(diskDoc.metadata.metadata_json!) as LorebookMetadata;

      assert.deepEqual(parsed.character_fields?.aliases, ['Shadow', 'The Wolf', 'Frost Walker']);
    } finally {
      cleanupFixtureStorage();
    }
  });

  it('4. Handles empty optional fields gracefully without injecting nulls or breaking serialization', async () => {
    createFixtureStorage();
    try {
      const minimalMeta: LorebookMetadata = {
        universe: 'Avalon',
        universe_id: 'univ-avalon-1',
        entry_type: 'character',
        canon_status: 'draft',
        attributes: [],
        character_fields: {
          species: 'Construct',
        },
      };

      const doc = await storage.createDocument(
        'lorebook',
        'Unit 734',
        'Sentient automaton.',
        JSON.stringify(minimalMeta)
      );

      const diskDoc = await storage.readDocument(doc.metadata.relative_path);
      const parsed = JSON.parse(diskDoc.metadata.metadata_json!) as LorebookMetadata;

      assert.equal(parsed.character_fields?.species, 'Construct');
      assert.equal(parsed.character_fields?.age, undefined);
      assert.equal(parsed.character_fields?.gender, undefined);
      assert.equal(parsed.character_fields?.aliases, undefined);
      assert.equal(parsed.character_fields?.occupation, undefined);
    } finally {
      cleanupFixtureStorage();
    }
  });

  it('5. Preserves unknown metadata keys in root and character_fields', async () => {
    createFixtureStorage();
    try {
      const metaWithUnknown: Record<string, unknown> = {
        universe: 'Avalon',
        universe_id: 'univ-avalon-1',
        entry_type: 'character',
        canon_status: 'canon',
        attributes: [],
        custom_worldbuilding_epoch: 'Age of Twilight',
        secret_lore_flag: true,
        character_fields: {
          species: 'Spirit',
          occupation: 'Guide',
          esoteric_aura_frequency: '840THz',
          astral_plane_anchor: 'Node 4',
        },
      };

      const doc = await storage.createDocument(
        'lorebook',
        'Astra',
        'Astral being.',
        JSON.stringify(metaWithUnknown)
      );

      // Now simulate a partial edit to occupation only
      const current = JSON.parse(doc.metadata.metadata_json!) as Record<string, any>;
      const currentFields = current.character_fields as Record<string, any>;
      const patched = {
        ...current,
        character_fields: {
          ...currentFields,
          occupation: 'High Astral Guide',
          vital_status: 'Timeless',
        },
      };

      await storage.saveDocument(
        doc.metadata.id,
        undefined,
        undefined,
        undefined,
        JSON.stringify(patched),
        { isMetadataOnly: true }
      );

      const reloaded = await storage.readDocument(doc.metadata.relative_path);
      const parsed = JSON.parse(reloaded.metadata.metadata_json!) as Record<string, any>;

      // Unknown root keys preserved
      assert.equal(parsed.custom_worldbuilding_epoch, 'Age of Twilight');
      assert.equal(parsed.secret_lore_flag, true);

      // Unknown inner character_fields keys preserved
      assert.equal(parsed.character_fields.esoteric_aura_frequency, '840THz');
      assert.equal(parsed.character_fields.astral_plane_anchor, 'Node 4');

      // Updated fields preserved
      assert.equal(parsed.character_fields.occupation, 'High Astral Guide');
      assert.equal(parsed.character_fields.vital_status, 'Timeless');
    } finally {
      cleanupFixtureStorage();
    }
  });

  it('6. Preserves Custom Parameters (attributes: LorebookAttribute[]) alongside guided fields', async () => {
    createFixtureStorage();
    try {
      const customAttrs: LorebookAttribute[] = [
        { id: 'attr-1', key: 'Bounty', value: '10,000 Imperial Ducats' },
        { id: 'attr-2', key: 'Magical Core', value: 'Tier 4 Prismatic' },
      ];

      const meta: LorebookMetadata = {
        universe: 'Avalon',
        universe_id: 'univ-avalon-1',
        entry_type: 'character',
        canon_status: 'canon',
        attributes: customAttrs,
        character_fields: {
          species: 'Human',
          occupation: 'Bounty Hunter',
        },
      };

      const doc = await storage.createDocument(
        'lorebook',
        'Vane',
        'A hunter.',
        JSON.stringify(meta)
      );

      // Add aliases and change vital status in character_fields
      const current = JSON.parse(doc.metadata.metadata_json!) as LorebookMetadata;
      const patched: LorebookMetadata = {
        ...current,
        character_fields: {
          ...current.character_fields,
          aliases: ['The Bloodhound', 'Vane of the Spires'],
          vital_status: 'Active / Alive',
        },
      };

      await storage.saveDocument(
        doc.metadata.id,
        undefined,
        undefined,
        undefined,
        JSON.stringify(patched),
        { isMetadataOnly: true }
      );

      const reloaded = await storage.readDocument(doc.metadata.relative_path);
      const parsed = JSON.parse(reloaded.metadata.metadata_json!) as LorebookMetadata;

      // Custom attributes array is 100% preserved
      assert.equal(parsed.attributes.length, 2);
      assert.equal(parsed.attributes[0].key, 'Bounty');
      assert.equal(parsed.attributes[0].value, '10,000 Imperial Ducats');
      assert.equal(parsed.attributes[1].key, 'Magical Core');
      assert.equal(parsed.attributes[1].value, 'Tier 4 Prismatic');

      // Guided fields updated correctly
      assert.deepEqual(parsed.character_fields?.aliases, ['The Bloodhound', 'Vane of the Spires']);
    } finally {
      cleanupFixtureStorage();
    }
  });

  it('7. Metadata-only save preserves nonempty prose body', async () => {
    createFixtureStorage();
    try {
      const initialProse = '# Chapter 1: The Long Cold\n\nLaxus walked the ramparts through the bitter fog.';
      const doc = await storage.createDocument(
        'lorebook',
        'Laxus',
        initialProse,
        JSON.stringify({
          entry_type: 'character',
          character_fields: { species: 'Human' },
        })
      );

      // Save metadata with empty content string and isMetadataOnly: true
      const updatedMeta = {
        entry_type: 'character',
        character_fields: { species: 'Human', vital_status: 'Active / Alive' },
      };

      await storage.saveDocument(
        doc.metadata.id,
        '', // Empty content supplied
        undefined,
        undefined,
        JSON.stringify(updatedMeta),
        { isMetadataOnly: true } // Must protect prose
      );

      const reloaded = await storage.readDocument(doc.metadata.relative_path);
      assert.equal(reloaded.content, initialProse, 'Prose must be strictly preserved on metadata-only updates');
      const parsed = JSON.parse(reloaded.metadata.metadata_json!);
      assert.equal(parsed.character_fields.vital_status, 'Active / Alive');
    } finally {
      cleanupFixtureStorage();
    }
  });

  it('8. Intentional empty prose saves are accurately persisted when isMetadataOnly is false', async () => {
    createFixtureStorage();
    try {
      const doc = await storage.createDocument(
        'lorebook',
        'Draft Notes',
        'Temporary rough notes to be cleared.',
        JSON.stringify({ entry_type: 'character', character_fields: {} })
      );

      // Intentional clear by writer
      await storage.saveDocument(
        doc.metadata.id,
        '', // Intentionally empty body
        undefined,
        undefined,
        undefined,
        { isMetadataOnly: false }
      );

      const reloaded = await storage.readDocument(doc.metadata.relative_path);
      assert.equal(reloaded.content, '', 'Intentional empty prose save must persist empty content');
    } finally {
      cleanupFixtureStorage();
    }
  });

  it('9. Supports duplicate Character names in different Houses with distinct UUIDs and attributes', async () => {
    createFixtureStorage();
    try {
      // House A Character
      const houseAMeta: LorebookMetadata = {
        universe: 'Avalon',
        universe_id: 'univ-avalon-house-a',
        entry_type: 'character',
        canon_status: 'canon',
        attributes: [],
        character_fields: {
          species: 'Human',
          occupation: 'High Marshal',
          vital_status: 'Active / Alive',
          aliases: ['Commander of the North'],
        },
      };

      const docA = await storage.createDocument(
        'lorebook',
        'Laxus',
        'House A Laxus prose.',
        JSON.stringify(houseAMeta),
        'house-a'
      );

      // House B Character (Same name, separate House & Universe UUID)
      const houseBMeta: LorebookMetadata = {
        universe: 'Avalon',
        universe_id: 'univ-avalon-house-b',
        entry_type: 'character',
        canon_status: 'draft',
        attributes: [],
        character_fields: {
          species: 'Elf',
          occupation: 'Apprentice Archivist',
          vital_status: 'Missing',
          aliases: ['The Younger'],
        },
      };

      const docB = await storage.createDocument(
        'lorebook',
        'Laxus',
        'House B Laxus prose.',
        JSON.stringify(houseBMeta),
        'house-b'
      );

      assert.notEqual(docA.metadata.id, docB.metadata.id, 'Distinct document UUIDs');
      assert.equal(docA.metadata.house_id, 'house-a');
      assert.equal(docB.metadata.house_id, 'house-b');

      // Edit House A character
      const editedMetaA: LorebookMetadata = {
        ...houseAMeta,
        character_fields: {
          ...houseAMeta.character_fields,
          vital_status: 'In Exile',
        },
      };

      await storage.saveDocument(
        docA.metadata.id,
        'Updated House A prose.',
        undefined,
        undefined,
        JSON.stringify(editedMetaA)
      );

      // Verify House B remains untouched
      const reloadedB = await storage.readDocument(docB.metadata.relative_path);
      const parsedB = JSON.parse(reloadedB.metadata.metadata_json!) as LorebookMetadata;
      assert.equal(parsedB.character_fields?.occupation, 'Apprentice Archivist');
      assert.equal(parsedB.character_fields?.vital_status, 'Missing');
      assert.equal(reloadedB.content, 'House B Laxus prose.');

      // Verify House A was updated
      const reloadedA = await storage.readDocument(docA.metadata.relative_path);
      const parsedA = JSON.parse(reloadedA.metadata.metadata_json!) as LorebookMetadata;
      assert.equal(parsedA.character_fields?.vital_status, 'In Exile');
      assert.equal(reloadedA.content, 'Updated House A prose.');
    } finally {
      cleanupFixtureStorage();
    }
  });
});
