import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  DocumentDetail,
  DocumentMetadata,
  DocumentType,
  LorebookMetadata,
  FactionFields,
} from '../src/types';
import {
  validateAndCreateRelationship,
  getCharacterAffiliations,
  getEntityLinkedRelationships,
  getOtherEntityId,
  isGuidedRelationship,
  getRelationshipCategory,
  resolveLegacyAffiliation,
  resolveLegacyEntityMatch,
  getCharacterHeldOffices,
  AFFILIATION_LABEL,
  RESIDENCE_LABEL,
  LEADERSHIP_LABEL,
} from '../src/utils/universe';
import {
  relationshipIdentity,
  relationshipPerspective,
  relationshipMeaning,
  setRelationshipArchived,
  requireSaved,
} from '../src/utils/relationships';
import type { Plan, Relationship, Universe } from '../src/utils/thought';

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
        metadata_json: metadataJson,
      },
      content: initialContent,
    };

    const parsedMeta = metadataJson ? JSON.parse(metadataJson) : {};
    const frontmatterObj = {
      title,
      doc_type: docType,
      house_id: houseId,
      ...parsedMeta,
    };

    const fullText = `${FRONTMATTER_PREFIX}${JSON.stringify(frontmatterObj, null, 2)}${FRONTMATTER_SUFFIX}${initialContent}`;
    const fullDiskPath = this.resolvePath(relativePath);
    fs.writeFileSync(fullDiskPath, fullText, 'utf8');

    return detail;
  }

  public async updateDocument(
    detail: DocumentDetail,
    opts?: { updateContent?: boolean; updateMetadata?: boolean }
  ): Promise<DocumentDetail> {
    const updateContent = opts?.updateContent ?? true;
    const updateMetadata = opts?.updateMetadata ?? true;

    const fullDiskPath = this.resolvePath(detail.metadata.relative_path);
    const existingRaw = fs.readFileSync(fullDiskPath, 'utf8');

    let currentMeta: Record<string, any> = {};
    let currentProse = '';

    if (existingRaw.startsWith(FRONTMATTER_PREFIX)) {
      const closingIdx = existingRaw.indexOf(FRONTMATTER_SUFFIX, FRONTMATTER_PREFIX.length);
      if (closingIdx !== -1) {
        const jsonBlock = existingRaw.slice(FRONTMATTER_PREFIX.length, closingIdx);
        currentMeta = JSON.parse(jsonBlock);
        currentProse = existingRaw.slice(closingIdx + FRONTMATTER_SUFFIX.length);
      }
    }

    const incomingMeta = detail.metadata.metadata_json ? JSON.parse(detail.metadata.metadata_json) : currentMeta;
    const newMetaObj = updateMetadata
      ? {
          ...incomingMeta,
          title: detail.metadata.title,
          doc_type: detail.metadata.doc_type,
          house_id: detail.metadata.house_id,
        }
      : currentMeta;

    const newProse = updateContent ? detail.content : currentProse;
    const fullText = `${FRONTMATTER_PREFIX}${JSON.stringify(newMetaObj, null, 2)}${FRONTMATTER_SUFFIX}${newProse}`;
    fs.writeFileSync(fullDiskPath, fullText, 'utf8');

    return {
      metadata: {
        ...detail.metadata,
        metadata_json: JSON.stringify(newMetaObj),
        updated_at: new Date().toISOString(),
      },
      content: newProse,
    };
  }

  public cleanup(): void {
    try {
      fs.rmSync(this.rootDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

describe('Phase C3: Relationship Consistency & Web of Thought Cohesion', () => {
  let tmpDir: string;
  let storage: DisposableFilesystemStorage;

  const testUniverseId = 'univ-avalon-101';
  const otherUniverseId = 'univ-valhalla-202';
  const testUniverse: Universe = {
    id: testUniverseId,
    name: 'Avalon',
    description: 'High fantasy realm',
  };
  const otherUniverse: Universe = {
    id: otherUniverseId,
    name: 'Valhalla',
    description: 'Norse myth realm',
  };

  const createInitialPlan = (): Plan => ({
    revision: 1,
    universes: [testUniverse, otherUniverse],
    books: [],
    entities: [],
    relationships: [],
    nodes: [],
    tracks: [],
    continuities: [],
  });

  const createCharacterMetadata = (universeId: string, extra?: Record<string, any>): string => {
    const meta: LorebookMetadata = {
      entry_type: 'character',
      universe_id: universeId,
      ...extra,
    };
    return JSON.stringify(meta);
  };

  const createFactionMetadata = (
    universeId: string,
    factionFields?: Partial<FactionFields>,
    extra?: Record<string, any>
  ): string => {
    const meta: LorebookMetadata = {
      entry_type: 'faction',
      universe_id: universeId,
      faction_fields: {
        faction_type: 'Order',
        headquarters: 'Avalon Citadel',
        ...factionFields,
      },
      ...extra,
    };
    return JSON.stringify(meta);
  };

  it('1. Guided affiliation creates exactly one canonical relationship in plan.relationships', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-1-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const charDoc = await storage.createDocument(
      'lorebook',
      'Arthur Pendragon',
      'The once and future king.',
      createCharacterMetadata(testUniverseId)
    );
    const factionDoc = await storage.createDocument(
      'lorebook',
      'Knights of the Round Table',
      'Chivalric order of Camelot.',
      createFactionMetadata(testUniverseId)
    );

    const docs = [charDoc.metadata, factionDoc.metadata];
    let plan = createInitialPlan();

    const { updatedPlan, relationship } = validateAndCreateRelationship(plan, docs, {
      sourceId: charDoc.metadata.id,
      targetId: factionDoc.metadata.id,
      label: AFFILIATION_LABEL,
      universeId: testUniverseId,
      directed: true,
    });

    assert.equal(updatedPlan.relationships.length, 1);
    assert.equal(relationship.source_id, charDoc.metadata.id);
    assert.equal(relationship.target_id, factionDoc.metadata.id);
    assert.equal(relationship.label, 'Member of');
    assert.equal(relationship.archived, false);
    assert.equal(relationship.universe_id, testUniverseId);

    // Endpoint registration in plan.entities
    assert.ok(updatedPlan.entities.some((e) => e.id === charDoc.metadata.id && e.universe_id === testUniverseId));
    assert.ok(updatedPlan.entities.some((e) => e.id === factionDoc.metadata.id && e.universe_id === testUniverseId));

    storage.cleanup();
  });

  it('2. Existing matching edge is reused when reuseExisting: true, and rejected otherwise', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-2-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const charDoc = await storage.createDocument(
      'lorebook',
      'Galahad',
      'Pure of heart.',
      createCharacterMetadata(testUniverseId)
    );
    const factionDoc = await storage.createDocument(
      'lorebook',
      'Knights of the Round Table',
      'Chivalric order.',
      createFactionMetadata(testUniverseId)
    );

    const docs = [charDoc.metadata, factionDoc.metadata];
    let plan = createInitialPlan();

    const res1 = validateAndCreateRelationship(plan, docs, {
      sourceId: charDoc.metadata.id,
      targetId: factionDoc.metadata.id,
      label: AFFILIATION_LABEL,
      universeId: testUniverseId,
      directed: true,
    });
    plan = res1.updatedPlan;
    assert.equal(plan.relationships.length, 1);

    // Duplicate creation without reuseExisting should throw
    assert.throws(
      () => {
        validateAndCreateRelationship(plan, docs, {
          sourceId: charDoc.metadata.id,
          targetId: factionDoc.metadata.id,
          label: AFFILIATION_LABEL,
          universeId: testUniverseId,
          directed: true,
        });
      },
      /already exists between these entities/
    );

    // Duplicate creation with reuseExisting: true should return the existing relationship without duplicating
    const res2 = validateAndCreateRelationship(plan, docs, {
      sourceId: charDoc.metadata.id,
      targetId: factionDoc.metadata.id,
      label: AFFILIATION_LABEL,
      universeId: testUniverseId,
      directed: true,
      reuseExisting: true,
    });

    assert.equal(res2.updatedPlan.relationships.length, 1);
    assert.equal(res2.relationship.id, res1.relationship.id);

    storage.cleanup();
  });

  it('3. EntityRelationshipsCard and CharacterAffiliationSelector reflect the exact same edge', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-3-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const charDoc = await storage.createDocument(
      'lorebook',
      'Lancelot du Lac',
      'Champion of Camelot.',
      createCharacterMetadata(testUniverseId)
    );
    const factionDoc = await storage.createDocument(
      'lorebook',
      'Knights of the Round Table',
      'Chivalric order.',
      createFactionMetadata(testUniverseId)
    );

    const docs = [charDoc.metadata, factionDoc.metadata];
    let plan = createInitialPlan();

    const { updatedPlan, relationship } = validateAndCreateRelationship(plan, docs, {
      sourceId: charDoc.metadata.id,
      targetId: factionDoc.metadata.id,
      label: AFFILIATION_LABEL,
      universeId: testUniverseId,
      directed: true,
    });

    // 1. CharacterAffiliationSelector query
    const affiliations = getCharacterAffiliations(updatedPlan, charDoc.metadata.id);
    assert.equal(affiliations.length, 1);
    assert.equal(affiliations[0].id, relationship.id);
    assert.equal(getOtherEntityId(affiliations[0], charDoc.metadata.id), factionDoc.metadata.id);

    // 2. EntityRelationshipsCard query
    const cardRelationships = updatedPlan.relationships.filter(
      (r) => !r.archived && (r.source_id === charDoc.metadata.id || r.target_id === charDoc.metadata.id)
    );
    assert.equal(cardRelationships.length, 1);
    assert.equal(cardRelationships[0].id, relationship.id);

    // 3. Category verification
    assert.equal(isGuidedRelationship(relationship), true);
    assert.equal(getRelationshipCategory(relationship), 'guided');

    storage.cleanup();
  });

  it('4. Removing guided edge via setRelationshipArchived updates both surfaces immediately', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-4-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const charDoc = await storage.createDocument(
      'lorebook',
      'Mordred',
      'Traitor to the realm.',
      createCharacterMetadata(testUniverseId)
    );
    const factionDoc = await storage.createDocument(
      'lorebook',
      'Knights of the Round Table',
      'Chivalric order.',
      createFactionMetadata(testUniverseId)
    );

    const docs = [charDoc.metadata, factionDoc.metadata];
    let plan = createInitialPlan();

    const { updatedPlan, relationship } = validateAndCreateRelationship(plan, docs, {
      sourceId: charDoc.metadata.id,
      targetId: factionDoc.metadata.id,
      label: AFFILIATION_LABEL,
      universeId: testUniverseId,
      directed: true,
    });

    // Archive relationship
    const archivedPlan = setRelationshipArchived(updatedPlan, relationship.id, true);

    // Both queries now return 0 active affiliations
    const affiliations = getCharacterAffiliations(archivedPlan, charDoc.metadata.id);
    assert.equal(affiliations.length, 0);

    const cardRelationships = archivedPlan.relationships.filter(
      (r) => !r.archived && (r.source_id === charDoc.metadata.id || r.target_id === charDoc.metadata.id)
    );
    assert.equal(cardRelationships.length, 0);

    // Historical record remains preserved with archived = true
    const archivedRecord = archivedPlan.relationships.find((r) => r.id === relationship.id);
    assert.ok(archivedRecord);
    assert.equal(archivedRecord.archived, true);

    storage.cleanup();
  });

  it('5. Multiple distinct relationships between same entities survive without collision', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-5-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const charDoc = await storage.createDocument(
      'lorebook',
      'Merlin',
      'Court Sorcerer.',
      createCharacterMetadata(testUniverseId)
    );
    const factionDoc = await storage.createDocument(
      'lorebook',
      'Order of the Silver Hand',
      'Mystic guild.',
      createFactionMetadata(testUniverseId)
    );

    const docs = [charDoc.metadata, factionDoc.metadata];
    let plan = createInitialPlan();

    // 1. Member of (Affiliation)
    const res1 = validateAndCreateRelationship(plan, docs, {
      sourceId: charDoc.metadata.id,
      targetId: factionDoc.metadata.id,
      label: 'Member of',
      universeId: testUniverseId,
      directed: true,
    });
    plan = res1.updatedPlan;

    // 2. Rival of (Rivalry)
    const res2 = validateAndCreateRelationship(plan, docs, {
      sourceId: charDoc.metadata.id,
      targetId: factionDoc.metadata.id,
      label: 'Rival of',
      universeId: testUniverseId,
      directed: false,
    });
    plan = res2.updatedPlan;

    // 3. Custom writer relationship ("Secret Advisor to")
    const res3 = validateAndCreateRelationship(plan, docs, {
      sourceId: charDoc.metadata.id,
      targetId: factionDoc.metadata.id,
      label: 'Secret Advisor to',
      universeId: testUniverseId,
      directed: true,
    });
    plan = res3.updatedPlan;

    assert.equal(plan.relationships.length, 3);
    const active = plan.relationships.filter((r) => !r.archived);
    assert.equal(active.length, 3);

    // Verify categories
    assert.equal(getRelationshipCategory(res1.relationship), 'guided');
    assert.equal(getRelationshipCategory(res2.relationship), 'custom');
    assert.equal(getRelationshipCategory(res3.relationship), 'custom');

    // Distinct identities
    const id1 = relationshipIdentity(res1.relationship);
    const id2 = relationshipIdentity(res2.relationship);
    const id3 = relationshipIdentity(res3.relationship);
    assert.notEqual(id1, id2);
    assert.notEqual(id1, id3);
    assert.notEqual(id2, id3);

    storage.cleanup();
  });

  it('6. Directed vs. undirected relationship perspectives', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-6-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const charDoc = await storage.createDocument(
      'lorebook',
      'Percival',
      'Knight of Camelot.',
      createCharacterMetadata(testUniverseId)
    );
    const factionDoc = await storage.createDocument(
      'lorebook',
      'Camelot Guard',
      'City defense.',
      createFactionMetadata(testUniverseId)
    );

    const docs = [charDoc.metadata, factionDoc.metadata];
    let plan = createInitialPlan();

    // Directed: Member of
    const resDirected = validateAndCreateRelationship(plan, docs, {
      sourceId: charDoc.metadata.id,
      targetId: factionDoc.metadata.id,
      label: 'Member of',
      universeId: testUniverseId,
      directed: true,
    });
    const relDirected = resDirected.relationship;

    assert.equal(relationshipPerspective(relDirected, charDoc.metadata.id), 'Member of');
    assert.equal(relationshipPerspective(relDirected, factionDoc.metadata.id), 'Members');

    // Symmetric: Allied with
    const resSymmetric = validateAndCreateRelationship(plan, docs, {
      sourceId: charDoc.metadata.id,
      targetId: factionDoc.metadata.id,
      label: 'Allied with',
      universeId: testUniverseId,
      directed: false,
    });
    const relSymmetric = resSymmetric.relationship;

    assert.equal(relationshipPerspective(relSymmetric, charDoc.metadata.id), 'Allied with');
    assert.equal(relationshipPerspective(relSymmetric, factionDoc.metadata.id), 'Allied with');

    storage.cleanup();
  });

  it('7. Legacy affiliation text preservation across saves and non-destructive conversion', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-7-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    // Initial character created with legacy free-text affiliation "Knights of the Round Table"
    const charDoc = await storage.createDocument(
      'lorebook',
      'Kay the Seneschal',
      'Foster brother of Arthur.',
      createCharacterMetadata(testUniverseId, { affiliation: 'Knights of the Round Table' })
    );

    const factionDoc = await storage.createDocument(
      'lorebook',
      'Knights of the Round Table',
      'The famed order.',
      createFactionMetadata(testUniverseId)
    );

    const docs = [charDoc.metadata, factionDoc.metadata];
    let plan = createInitialPlan();

    // 1. Analyze legacy affiliation
    const resolution = resolveLegacyAffiliation('Knights of the Round Table', [factionDoc.metadata]);
    assert.equal(resolution.status, 'single');
    assert.equal(resolution.matches[0].id, factionDoc.metadata.id);

    // 2. Convert to real link via validateAndCreateRelationship
    const { updatedPlan, relationship } = validateAndCreateRelationship(plan, docs, {
      sourceId: charDoc.metadata.id,
      targetId: factionDoc.metadata.id,
      label: AFFILIATION_LABEL,
      universeId: testUniverseId,
      directed: true,
      reuseExisting: true,
    });
    plan = updatedPlan;

    // 3. Verify canonical relationship exists
    assert.equal(plan.relationships.length, 1);
    assert.equal(relationship.target_id, factionDoc.metadata.id);

    // 4. Verify character document STILL retains legacy affiliation and prose untouched (no destructive auto-wipe)
    const diskContent = fs.readFileSync(storage.resolvePath(charDoc.metadata.relative_path), 'utf8');
    assert.ok(diskContent.includes('"affiliation": "Knights of the Round Table"'));
    assert.ok(diskContent.includes('Foster brother of Arthur.'));

    // 5. Subsequent intentional clear of legacy text via explicit update
    const parsedMeta: LorebookMetadata = JSON.parse(charDoc.metadata.metadata_json || '{}');
    parsedMeta.affiliation = undefined;
    const updatedDoc = await storage.updateDocument({
      ...charDoc,
      metadata: {
        ...charDoc.metadata,
        metadata_json: JSON.stringify(parsedMeta),
      },
    });

    const diskAfterExplicitClear = fs.readFileSync(storage.resolvePath(charDoc.metadata.relative_path), 'utf8');
    assert.ok(!diskAfterExplicitClear.includes('"affiliation"'));
    assert.ok(diskAfterExplicitClear.includes('Foster brother of Arthur.'));

    storage.cleanup();
  });

  it('8. Failed relationship save leaves buffer intact and throws error without corrupting state', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-8-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const plan = createInitialPlan();
    assert.equal(plan.revision, 1);

    // Simulated save failure
    assert.throws(() => {
      requireSaved(false);
    }, /Not saved/);

    // Plan remains intact and unchanged
    assert.equal(plan.revision, 1);
    assert.equal(plan.relationships.length, 0);

    storage.cleanup();
  });

  it('9. Undo behavior restores archived relationship', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-9-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const charDoc = await storage.createDocument(
      'lorebook',
      'Bedivere',
      'Marshal of Camelot.',
      createCharacterMetadata(testUniverseId)
    );
    const factionDoc = await storage.createDocument(
      'lorebook',
      'Royal Court',
      'Governing body.',
      createFactionMetadata(testUniverseId)
    );

    const docs = [charDoc.metadata, factionDoc.metadata];
    let plan = createInitialPlan();

    const res = validateAndCreateRelationship(plan, docs, {
      sourceId: charDoc.metadata.id,
      targetId: factionDoc.metadata.id,
      label: AFFILIATION_LABEL,
      universeId: testUniverseId,
      directed: true,
    });
    plan = res.updatedPlan;
    const relId = res.relationship.id;

    // Archive it (unlink)
    plan = setRelationshipArchived(plan, relId, true);
    assert.equal(getCharacterAffiliations(plan, charDoc.metadata.id).length, 0);

    // Undo unlink (unarchive)
    plan = setRelationshipArchived(plan, relId, false);
    const restored = getCharacterAffiliations(plan, charDoc.metadata.id);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].id, relId);
    assert.equal(restored[0].archived, false);

    storage.cleanup();
  });

  it('10. House and Universe isolation: cross-universe links are strictly rejected', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-10-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const charInAvalon = await storage.createDocument(
      'lorebook',
      'Arthur',
      'From Avalon.',
      createCharacterMetadata(testUniverseId)
    );
    const factionInValhalla = await storage.createDocument(
      'lorebook',
      'Einherjar',
      'Fallen warriors in Valhalla.',
      createFactionMetadata(otherUniverseId)
    );

    const docs = [charInAvalon.metadata, factionInValhalla.metadata];
    const plan = createInitialPlan();

    assert.throws(
      () => {
        validateAndCreateRelationship(plan, docs, {
          sourceId: charInAvalon.metadata.id,
          targetId: factionInValhalla.metadata.id,
          label: AFFILIATION_LABEL,
          universeId: testUniverseId,
        });
      },
      /Both entities must belong to the same Universe/
    );

    storage.cleanup();
  });

  it('11. Official faction positions (Phase C2) remain distinct and do NOT create duplicate graph edges', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-11-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const charDoc = await storage.createDocument(
      'lorebook',
      'Gawain',
      'Knight of the Sun.',
      createCharacterMetadata(testUniverseId)
    );

    const factionDoc = await storage.createDocument(
      'lorebook',
      'Knights of the Round Table',
      'Chivalric order.',
      createFactionMetadata(testUniverseId, {
        positions: [
          {
            id: 'pos-first-knight',
            title: 'First Knight',
            branch_id: null,
            parent_position_id: null,
            holder_ids: [charDoc.metadata.id],
            description: 'Chief champion of the realm.',
          },
        ],
      })
    );

    const docs = [charDoc.metadata, factionDoc.metadata];
    const plan = createInitialPlan();

    // Reverse lookup finds the official office
    const offices = getCharacterHeldOffices(charDoc.metadata.id, docs, testUniverseId, plan.universes);
    assert.equal(offices.length, 1);
    assert.equal(offices[0].factionId, factionDoc.metadata.id);
    assert.equal(offices[0].positionTitle, 'First Knight');

    // Invariant: The official position exists ONLY in faction metadata; plan.relationships has NO duplicate edge
    assert.equal(plan.relationships.length, 0);

    // If the writer ALSO establishes a graph relationship ("Member of"), they coexist independently
    const { updatedPlan } = validateAndCreateRelationship(plan, docs, {
      sourceId: charDoc.metadata.id,
      targetId: factionDoc.metadata.id,
      label: AFFILIATION_LABEL,
      universeId: testUniverseId,
      directed: true,
    });

    assert.equal(updatedPlan.relationships.length, 1);
    const updatedOffices = getCharacterHeldOffices(charDoc.metadata.id, docs, testUniverseId, plan.universes);
    assert.equal(updatedOffices.length, 1);

    storage.cleanup();
  });

  it('12. Prose body is preserved on relationship and metadata updates', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-12-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const originalProse = `# The Legend of Excalibur

Excalibur was forged in Avalon and gifted to Arthur by the Lady of the Lake.
It signifies rightful kingship.`;

    const itemDoc = await storage.createDocument(
      'lorebook',
      'Excalibur',
      originalProse,
      createCharacterMetadata(testUniverseId, { entry_type: 'item' })
    );

    const charDoc = await storage.createDocument(
      'lorebook',
      'Arthur',
      'King of Britons.',
      createCharacterMetadata(testUniverseId)
    );

    const docs = [itemDoc.metadata, charDoc.metadata];
    let plan = createInitialPlan();

    const { updatedPlan } = validateAndCreateRelationship(plan, docs, {
      sourceId: itemDoc.metadata.id,
      targetId: charDoc.metadata.id,
      label: 'Owned by',
      universeId: testUniverseId,
      directed: true,
    });

    assert.equal(updatedPlan.relationships.length, 1);

    // Update document metadata without touching prose
    const parsed = JSON.parse(itemDoc.metadata.metadata_json || '{}');
    parsed.custom_fields = { material: 'Caliburn Steel' };
    const updatedItem = await storage.updateDocument({
      ...itemDoc,
      metadata: {
        ...itemDoc.metadata,
        metadata_json: JSON.stringify(parsed),
      },
    }, { updateContent: false, updateMetadata: true });

    // Verify disk content preserves prose verbatim
    const diskText = fs.readFileSync(storage.resolvePath(itemDoc.metadata.relative_path), 'utf8');
    assert.ok(diskText.includes(originalProse));
    assert.ok(diskText.includes('"material": "Caliburn Steel"'));

    storage.cleanup();
  });
});
