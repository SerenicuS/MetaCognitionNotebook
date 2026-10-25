import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  FactionFields,
  FactionPosition,
  FactionBranch,
  DocumentDetail,
  DocumentMetadata,
  DocumentType,
  LorebookMetadata,
} from '../src/types';
import {
  wouldFormPositionCycle,
  wouldFormBranchCycle,
  removePositionSafely,
  removeBranchSafely,
  getCharacterHeldOffices,
} from '../src/utils/universe';

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

describe('Phase C2: Faction Organization & Official Positions Architecture', () => {
  let tmpDir: string;
  let storage: DisposableFilesystemStorage;

  const createFixtureStorage = () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metacog-phase-c2-'));
    storage = new DisposableFilesystemStorage(tmpDir);
  };

  const cleanupFixtureStorage = () => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };

  it('1. Serializes faction positions, branches, and holders to canonical Markdown frontmatter', async () => {
    createFixtureStorage();
    try {
      const branchCouncil: FactionBranch = {
        id: 'branch-high-council',
        name: 'High Council of Stars',
        description: 'Supreme governing legislative assembly',
        parent_branch_id: null,
        sort_order: 1,
      };

      const branchNaval: FactionBranch = {
        id: 'branch-fleet',
        name: 'Solar Fleet Command',
        description: 'Void vessels and harbor watch',
        parent_branch_id: 'branch-high-council',
        sort_order: 2,
      };

      const posArchon: FactionPosition = {
        id: 'pos-archon',
        title: 'Cognitive Emperor',
        description: 'Apex administrative ruler',
        branch_id: 'branch-high-council',
        parent_position_id: null,
        holder_ids: ['char-voltaire-1'],
        sort_order: 1,
      };

      const posAdmiral: FactionPosition = {
        id: 'pos-admiral',
        title: 'Grand Fleet Admiral',
        description: 'Naval commander of the solar perimeter',
        branch_id: 'branch-fleet',
        parent_position_id: 'pos-archon',
        holder_ids: ['char-laxus-1', 'char-corin-1'], // Multiple holders supported
        sort_order: 2,
      };

      const posVacant: FactionPosition = {
        id: 'pos-inquisitor',
        title: 'Chief Inquisitor',
        description: 'Vacant seat following the purges',
        branch_id: 'branch-high-council',
        parent_position_id: 'pos-archon',
        holder_ids: [], // Vacant position
        sort_order: 3,
      };

      const factionMeta: LorebookMetadata = {
        universe: 'Avalon',
        universe_id: 'univ-avalon-1',
        entry_type: 'faction',
        canon_status: 'canon',
        attributes: [],
        faction_fields: {
          faction_type: 'Sovereign Stellar Empire',
          ideology: 'Cognitive Centralization',
          leadership: 'Central Body Directorate', // Legacy text preserved
          branches: [branchCouncil, branchNaval],
          positions: [posArchon, posAdmiral, posVacant],
        },
      };

      const doc = await storage.createDocument(
        'lorebook',
        'Central Body of Humanity',
        '# Central Body\n\nThe enduring governance of humanity.',
        JSON.stringify(factionMeta)
      );

      // Verify raw file on disk
      const reloaded = await storage.readDocument(doc.metadata.relative_path);
      const parsed = JSON.parse(reloaded.metadata.metadata_json!) as LorebookMetadata;
      const ff = parsed.faction_fields!;

      assert.equal(ff.faction_type, 'Sovereign Stellar Empire');
      assert.equal(ff.leadership, 'Central Body Directorate'); // Legacy preserved
      assert.equal(ff.branches?.length, 2);
      assert.equal(ff.positions?.length, 3);

      const archon = ff.positions!.find((p) => p.id === 'pos-archon')!;
      assert.equal(archon.title, 'Cognitive Emperor');
      assert.deepEqual(archon.holder_ids, ['char-voltaire-1']);

      const admiral = ff.positions!.find((p) => p.id === 'pos-admiral')!;
      assert.equal(admiral.title, 'Grand Fleet Admiral');
      assert.equal(admiral.parent_position_id, 'pos-archon');
      assert.deepEqual(admiral.holder_ids, ['char-laxus-1', 'char-corin-1']);

      const vacant = ff.positions!.find((p) => p.id === 'pos-inquisitor')!;
      assert.equal(vacant.holder_ids?.length, 0); // Vacant derived from empty list
    } finally {
      cleanupFixtureStorage();
    }
  });

  it('2. Position and branch renames retain stable UUIDs', async () => {
    createFixtureStorage();
    try {
      const initialMeta: LorebookMetadata = {
        universe: 'Avalon',
        universe_id: 'univ-avalon-1',
        entry_type: 'faction',
        canon_status: 'canon',
        attributes: [],
        faction_fields: {
          branches: [{ id: 'branch-100', name: 'Order of the Sun' }],
          positions: [
            {
              id: 'pos-500',
              title: 'Master of Sun',
              branch_id: 'branch-100',
              holder_ids: ['char-1'],
            },
          ],
        },
      };

      const doc = await storage.createDocument(
        'lorebook',
        'Solar Order',
        'Prose...',
        JSON.stringify(initialMeta)
      );

      // Rename position and branch
      const current = JSON.parse(doc.metadata.metadata_json!) as LorebookMetadata;
      current.faction_fields!.branches![0].name = 'Order of the Radiant Dawn';
      current.faction_fields!.positions![0].title = 'Grand Archon of the Dawn';

      await storage.saveDocument(
        doc.metadata.id,
        undefined,
        undefined,
        undefined,
        JSON.stringify(current),
        { isMetadataOnly: true }
      );

      const diskDoc = await storage.readDocument(doc.metadata.relative_path);
      const parsed = JSON.parse(diskDoc.metadata.metadata_json!) as LorebookMetadata;

      assert.equal(parsed.faction_fields!.branches![0].id, 'branch-100');
      assert.equal(parsed.faction_fields!.branches![0].name, 'Order of the Radiant Dawn');
      assert.equal(parsed.faction_fields!.positions![0].id, 'pos-500');
      assert.equal(parsed.faction_fields!.positions![0].title, 'Grand Archon of the Dawn');
      assert.deepEqual(parsed.faction_fields!.positions![0].holder_ids, ['char-1']);
    } finally {
      cleanupFixtureStorage();
    }
  });

  it('3. Cycle prevention prevents circular position reporting hierarchies', () => {
    const positions: FactionPosition[] = [
      { id: 'pos-1', title: 'Top', parent_position_id: null },
      { id: 'pos-2', title: 'Middle', parent_position_id: 'pos-1' },
      { id: 'pos-3', title: 'Bottom', parent_position_id: 'pos-2' },
    ];

    // Cannot report to self
    assert.equal(wouldFormPositionCycle(positions, 'pos-1', 'pos-1'), true);

    // Cannot set Top to report to Bottom (creates cycle: 1 -> 3 -> 2 -> 1)
    assert.equal(wouldFormPositionCycle(positions, 'pos-1', 'pos-3'), true);

    // Cannot set Top to report to Middle (creates cycle: 1 -> 2 -> 1)
    assert.equal(wouldFormPositionCycle(positions, 'pos-1', 'pos-2'), true);

    // Valid: Middle reporting to Top
    assert.equal(wouldFormPositionCycle(positions, 'pos-2', 'pos-1'), false);

    // Valid: Setting parent to null / top-level
    assert.equal(wouldFormPositionCycle(positions, 'pos-3', null), false);
  });

  it('4. Cycle prevention prevents circular branch hierarchies', () => {
    const branches: FactionBranch[] = [
      { id: 'br-hq', name: 'HQ', parent_branch_id: null },
      { id: 'br-div1', name: 'Division 1', parent_branch_id: 'br-hq' },
      { id: 'br-team', name: 'Sub-Team', parent_branch_id: 'br-div1' },
    ];

    assert.equal(wouldFormBranchCycle(branches, 'br-hq', 'br-hq'), true);
    assert.equal(wouldFormBranchCycle(branches, 'br-hq', 'br-team'), true);
    assert.equal(wouldFormBranchCycle(branches, 'br-hq', 'br-div1'), true);
    assert.equal(wouldFormBranchCycle(branches, 'br-team', 'br-hq'), false);
    assert.equal(wouldFormBranchCycle(branches, 'br-div1', null), false);
  });

  it('5. Safe position deletion clears reporting lines of child positions without deleting them', () => {
    const positions: FactionPosition[] = [
      { id: 'pos-king', title: 'King', parent_position_id: null },
      { id: 'pos-marshal', title: 'High Marshal', parent_position_id: 'pos-king' },
      { id: 'pos-captain', title: 'Captain', parent_position_id: 'pos-king' },
      { id: 'pos-scout', title: 'Scout', parent_position_id: 'pos-captain' },
    ];

    // Delete 'pos-king'
    const updated = removePositionSafely(positions, 'pos-king');

    // pos-king removed
    assert.equal(updated.some((p) => p.id === 'pos-king'), false);

    // Marshal and Captain must NOT be deleted; their parent_position_id must be cleared to null
    const marshal = updated.find((p) => p.id === 'pos-marshal')!;
    assert.ok(marshal);
    assert.equal(marshal.parent_position_id, null);

    const captain = updated.find((p) => p.id === 'pos-captain')!;
    assert.ok(captain);
    assert.equal(captain.parent_position_id, null);

    // Scout still reports to captain
    const scout = updated.find((p) => p.id === 'pos-scout')!;
    assert.equal(scout.parent_position_id, 'pos-captain');
  });

  it('6. Safe branch deletion unassigns branch positions without deleting them', () => {
    const branches: FactionBranch[] = [
      { id: 'br-military', name: 'Military' },
      { id: 'br-naval', name: 'Naval Division', parent_branch_id: 'br-military' },
    ];

    const positions: FactionPosition[] = [
      { id: 'pos-admiral', title: 'Admiral', branch_id: 'br-naval' },
      { id: 'pos-general', title: 'General', branch_id: 'br-military' },
      { id: 'pos-clerk', title: 'Clerk', branch_id: null },
    ];

    // Delete 'br-military'
    const res = removeBranchSafely(branches, positions, 'br-military');

    // br-military removed
    assert.equal(res.branches.some((b) => b.id === 'br-military'), false);

    // br-naval becomes top-level branch (parent cleared to null)
    const naval = res.branches.find((b) => b.id === 'br-naval')!;
    assert.ok(naval);
    assert.equal(naval.parent_branch_id, null);

    // pos-general had branch_id = 'br-military'; must now have branch_id = null (unassigned)
    const general = res.positions.find((p) => p.id === 'pos-general')!;
    assert.ok(general);
    assert.equal(general.branch_id, null);

    // pos-admiral still in br-naval
    const admiral = res.positions.find((p) => p.id === 'pos-admiral')!;
    assert.equal(admiral.branch_id, 'br-naval');

    // Total positions preserved
    assert.equal(res.positions.length, 3);
  });

  it('7. Character profile reverse-lookup resolves official positions dynamically across factions', () => {
    const charDocId = 'doc-voltaire-1';

    // Mock Faction 1: Central Body of Humanity
    const docFaction1: DocumentMetadata = {
      id: 'doc-faction-central-body',
      title: 'Central Body of Humanity',
      doc_type: 'lorebook',
      relative_path: 'Lorebooks/Central_Body.md',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tags: [],
      metadata_json: JSON.stringify({
        entry_type: 'faction',
        universe_id: 'univ-avalon-1',
        faction_fields: {
          branches: [{ id: 'br-throne', name: 'Imperial Throne' }],
          positions: [
            {
              id: 'pos-emp',
              title: 'Cognitive Emperor',
              branch_id: 'br-throne',
              holder_ids: [charDocId],
              description: 'Supreme guide of the human consensus',
            },
          ],
        },
      }),
    };

    // Mock Faction 2: Council of Sages
    const docFaction2: DocumentMetadata = {
      id: 'doc-faction-sages',
      title: 'Council of Sages',
      doc_type: 'lorebook',
      relative_path: 'Lorebooks/Council_of_Sages.md',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tags: [],
      metadata_json: JSON.stringify({
        entry_type: 'faction',
        universe_id: 'univ-avalon-1',
        faction_fields: {
          positions: [
            {
              id: 'pos-elder',
              title: 'Elder Archivist',
              holder_ids: [charDocId, 'doc-other-char'], // Multiple holders
            },
          ],
        },
      }),
    };

    // Mock Character Document
    const docChar: DocumentMetadata = {
      id: charDocId,
      title: 'Voltaire Manus',
      doc_type: 'lorebook',
      relative_path: 'Lorebooks/Voltaire.md',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tags: [],
      metadata_json: JSON.stringify({
        entry_type: 'character',
        universe_id: 'univ-avalon-1',
        character_fields: {
          species: 'Transhuman',
          occupation: 'Philosopher', // Civilian craft, distinct from official position
        },
      }),
    };

    const allDocs = [docFaction1, docFaction2, docChar];

    // Perform scoped reverse lookup
    const offices = getCharacterHeldOffices(charDocId, allDocs, 'univ-avalon-1', [
      { id: 'univ-avalon-1', name: 'Avalon', description: '', created_at: '', updated_at: '' },
    ]);

    assert.equal(offices.length, 2);

    const emp = offices.find((o) => o.positionId === 'pos-emp')!;
    assert.ok(emp);
    assert.equal(emp.factionTitle, 'Central Body of Humanity');
    assert.equal(emp.positionTitle, 'Cognitive Emperor');
    assert.equal(emp.branchName, 'Imperial Throne');

    const elder = offices.find((o) => o.positionId === 'pos-elder')!;
    assert.ok(elder);
    assert.equal(elder.factionTitle, 'Council of Sages');
    assert.equal(elder.positionTitle, 'Elder Archivist');
    assert.equal(elder.branchName, undefined);
  });

  it('8. Enforces House and Universe isolation on position holders', () => {
    const charInAvalon = 'doc-laxus-avalon';
    const charInNebula = 'doc-laxus-nebula';

    const universes = [
      { id: 'univ-avalon', name: 'Avalon', description: '', created_at: '', updated_at: '' },
      { id: 'univ-nebula', name: 'Nebula', description: '', created_at: '', updated_at: '' },
    ];

    const factionAvalon: DocumentMetadata = {
      id: 'doc-faction-guard',
      title: 'Northern Guard',
      doc_type: 'lorebook',
      relative_path: 'Lorebooks/Northern_Guard.md',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tags: [],
      metadata_json: JSON.stringify({
        entry_type: 'faction',
        universe_id: 'univ-avalon',
        faction_fields: {
          positions: [
            {
              id: 'pos-commander',
              title: 'Lord Commander',
              holder_ids: [charInAvalon],
            },
          ],
        },
      }),
    };

    const allDocs = [factionAvalon];

    // Query from Universe Avalon
    const avalonOffices = getCharacterHeldOffices(charInAvalon, allDocs, 'univ-avalon', universes);
    assert.equal(avalonOffices.length, 1);
    assert.equal(avalonOffices[0].positionTitle, 'Lord Commander');

    // Query from Universe Nebula (Different Universe with same-named character ID)
    const nebulaOffices = getCharacterHeldOffices(charInNebula, allDocs, 'univ-nebula', universes);
    assert.equal(nebulaOffices.length, 0, 'Cannot resolve offices across universe boundaries');
  });

  it('9. Preserves unknown metadata keys in Faction frontmatter during organizational updates', async () => {
    createFixtureStorage();
    try {
      const metaWithUnknown: Record<string, unknown> = {
        universe: 'Avalon',
        universe_id: 'univ-avalon-1',
        entry_type: 'faction',
        canon_status: 'canon',
        attributes: [],
        custom_theocratic_rite: 'Ceremony of Nine Moons',
        faction_fields: {
          faction_type: 'Theocratic Order',
          esoteric_dogma_code: 'SIGMA-4',
          positions: [
            {
              id: 'pos-high-priest',
              title: 'High Priest',
              holder_ids: ['char-1'],
            },
          ],
        },
      };

      const doc = await storage.createDocument(
        'lorebook',
        'Lunar Monastery',
        'Prose body.',
        JSON.stringify(metaWithUnknown)
      );

      // Add a position
      const current = JSON.parse(doc.metadata.metadata_json!) as Record<string, any>;
      const currentFactionFields = current.faction_fields as FactionFields;
      const updatedPositions = [
        ...(currentFactionFields.positions || []),
        { id: 'pos-acolyte', title: 'Initiate Acolyte', holder_ids: [] },
      ];

      const patched = {
        ...current,
        faction_fields: {
          ...currentFactionFields,
          positions: updatedPositions,
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

      const diskDoc = await storage.readDocument(doc.metadata.relative_path);
      const parsed = JSON.parse(diskDoc.metadata.metadata_json!) as Record<string, any>;

      // Unknown root key preserved
      assert.equal(parsed.custom_theocratic_rite, 'Ceremony of Nine Moons');

      // Unknown inner faction_fields key preserved
      assert.equal(parsed.faction_fields.esoteric_dogma_code, 'SIGMA-4');

      // Positions updated correctly
      assert.equal(parsed.faction_fields.positions.length, 2);
    } finally {
      cleanupFixtureStorage();
    }
  });

  it('10. Metadata-only save preserves Faction prose body completely', async () => {
    createFixtureStorage();
    try {
      const originalProse = '# Sovereign Kingdom of Avalon\n\nLong before the Sundering, the high spires stood defiant.';
      const doc = await storage.createDocument(
        'lorebook',
        'Avalon Kingdom',
        originalProse,
        JSON.stringify({
          entry_type: 'faction',
          faction_fields: {
            faction_type: 'Kingdom',
            positions: [{ id: 'pos-crown', title: 'Sovereign King', holder_ids: [] }],
          },
        })
      );

      // Metadata-only save with empty content
      const updatedMeta = {
        entry_type: 'faction',
        faction_fields: {
          faction_type: 'Grand Kingdom',
          positions: [
            { id: 'pos-crown', title: 'Sovereign King', holder_ids: ['char-king-arthur'] },
          ],
        },
      };

      await storage.saveDocument(
        doc.metadata.id,
        '', // Empty content supplied
        undefined,
        undefined,
        JSON.stringify(updatedMeta),
        { isMetadataOnly: true }
      );

      const diskDoc = await storage.readDocument(doc.metadata.relative_path);
      assert.equal(diskDoc.content, originalProse, 'Prose body must be strictly preserved on metadata-only updates');
      const parsed = JSON.parse(diskDoc.metadata.metadata_json!);
      assert.equal(parsed.faction_fields.positions[0].holder_ids[0], 'char-king-arthur');
    } finally {
      cleanupFixtureStorage();
    }
  });
});
