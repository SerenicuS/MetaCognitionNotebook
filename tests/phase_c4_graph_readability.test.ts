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
  filterGraph,
  graphNeighbors,
  getFocusedNeighborhood,
  layoutRelationships,
  zoomCamera,
  fitCameraToView,
  buildFactionHierarchyData,
} from '../src/utils/relationshipGraph';
import {
  validateAndCreateRelationship,
  isGuidedRelationship,
  getRelationshipCategory,
  AFFILIATION_LABEL,
  LEADERSHIP_LABEL,
} from '../src/utils/universe';
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

  public cleanup(): void {
    try {
      fs.rmSync(this.rootDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

describe('Phase C4: Web of Thought Graph Readability & Exploration', () => {
  let tmpDir: string;
  let storage: DisposableFilesystemStorage;

  const testUniverseId = 'univ-hyperion-404';
  const testUniverse: Universe = {
    id: testUniverseId,
    name: 'Hyperion Hegemony',
    description: 'Sci-fi universe',
  };

  const createInitialPlan = (): Plan => ({
    revision: 1,
    universes: [testUniverse],
    books: [],
    entities: [],
    relationships: [],
    nodes: [],
    tracks: [],
    continuities: [],
  });

  it('1. One-hop neighborhood filtering correctly isolates focus entity, direct neighbors, and local edges', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-test-1-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    // Entity network:
    // Center: Voltaire Manus (E1)
    // Direct neighbors: Central Body (E2), Pax Armada (E3)
    // Distant: Outer Rim Syndicate (E4) connected only to Pax Armada (E3)
    // Isolated: Solitude Outpost (E5) connected to nobody
    const e1 = 'entity-voltaire';
    const e2 = 'entity-central-body';
    const e3 = 'entity-pax-armada';
    const e4 = 'entity-outer-rim';
    const e5 = 'entity-solitude';

    const relationships: Relationship[] = [
      { id: 'r1', source_id: e1, target_id: e2, label: 'Member of', universe_id: testUniverseId, book_id: null, directed: true, context_node_id: null, description: '', archived: false },
      { id: 'r2', source_id: e1, target_id: e3, label: 'Allied with', universe_id: testUniverseId, book_id: null, directed: false, context_node_id: null, description: '', archived: false },
      { id: 'r3', source_id: e2, target_id: e3, label: 'Controls', universe_id: testUniverseId, book_id: null, directed: true, context_node_id: null, description: '', archived: false },
      { id: 'r4', source_id: e3, target_id: e4, label: 'Hostile to', universe_id: testUniverseId, book_id: null, directed: false, context_node_id: null, description: '', archived: false },
      { id: 'r5_archived', source_id: e1, target_id: e4, label: 'Old Ally', universe_id: testUniverseId, book_id: null, directed: false, context_node_id: null, description: '', archived: true },
    ];

    const neighborhood = getFocusedNeighborhood(relationships, e1);

    // Expected visible nodes: e1, e2, e3 (1-hop from e1)
    assert.equal(neighborhood.neighborIds.has(e1), true);
    assert.equal(neighborhood.neighborIds.has(e2), true);
    assert.equal(neighborhood.neighborIds.has(e3), true);
    assert.equal(neighborhood.neighborIds.has(e4), false, 'Distant node e4 must not be in 1-hop neighborhood');
    assert.equal(neighborhood.neighborIds.has(e5), false, 'Unconnected node e5 must not be in neighborhood');

    // Expected relationships: r1 (e1-e2), r2 (e1-e3), r3 (e2-e3 - both visible neighbors)
    // Excluded: r4 (connects to distant e4), r5 (archived)
    assert.equal(neighborhood.relationships.length, 3);
    const relIds = new Set(neighborhood.relationships.map((r) => r.id));
    assert.ok(relIds.has('r1'));
    assert.ok(relIds.has('r2'));
    assert.ok(relIds.has('r3'));
    assert.ok(!relIds.has('r4'));
    assert.ok(!relIds.has('r5_archived'));

    storage.cleanup();
  });

  it('2. Full Universe view displays all active scoped relationships without hiding nodes', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-test-2-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const relationships: Relationship[] = [
      { id: 'r1', source_id: 'a', target_id: 'b', label: 'Member of', universe_id: testUniverseId, book_id: null, directed: true, context_node_id: null, description: '', archived: false },
      { id: 'r2', source_id: 'b', target_id: 'c', label: 'Controls', universe_id: testUniverseId, book_id: null, directed: true, context_node_id: null, description: '', archived: false },
      { id: 'r3', source_id: 'c', target_id: 'd', label: 'Allied with', universe_id: testUniverseId, book_id: null, directed: false, context_node_id: null, description: '', archived: false },
      { id: 'r4', source_id: 'e', target_id: 'f', label: 'Rival of', universe_id: testUniverseId, book_id: null, directed: false, context_node_id: null, description: '', archived: false },
    ];

    const typeOf = () => 'character';
    const filtered = filterGraph(relationships, typeOf, '', '', 'all');
    assert.equal(filtered.length, 4);

    const layout = layoutRelationships(filtered);
    assert.equal(layout.nodes.length, 6);
    assert.equal(layout.edges.length, 4);

    storage.cleanup();
  });

  it('3. Focus switching recalculates 1-hop neighborhood centered around the new selection', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-test-3-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    // Linear chain: Node 1 <-> Node 2 <-> Node 3 <-> Node 4
    const relationships: Relationship[] = [
      { id: 'r12', source_id: 'n1', target_id: 'n2', label: 'Link', universe_id: testUniverseId, book_id: null, directed: false, context_node_id: null, description: '', archived: false },
      { id: 'r23', source_id: 'n2', target_id: 'n3', label: 'Link', universe_id: testUniverseId, book_id: null, directed: false, context_node_id: null, description: '', archived: false },
      { id: 'r34', source_id: 'n3', target_id: 'n4', label: 'Link', universe_id: testUniverseId, book_id: null, directed: false, context_node_id: null, description: '', archived: false },
    ];

    // Focus n1 -> visible: n1, n2
    const hood1 = getFocusedNeighborhood(relationships, 'n1');
    assert.deepEqual([...hood1.neighborIds].sort(), ['n1', 'n2']);
    assert.equal(hood1.relationships.length, 1);
    assert.equal(hood1.relationships[0].id, 'r12');

    // Switch focus to n2 -> visible: n1, n2, n3
    const hood2 = getFocusedNeighborhood(relationships, 'n2');
    assert.deepEqual([...hood2.neighborIds].sort(), ['n1', 'n2', 'n3']);
    assert.equal(hood2.relationships.length, 2);

    // Switch focus to n3 -> visible: n2, n3, n4
    const hood3 = getFocusedNeighborhood(relationships, 'n3');
    assert.deepEqual([...hood3.neighborIds].sort(), ['n2', 'n3', 'n4']);
    assert.equal(hood3.relationships.length, 2);

    storage.cleanup();
  });

  it('4. Multiple distinct relationships between same entities are grouped cleanly without data mutation', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-test-4-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const voltaire = 'doc-voltaire-manus';
    const centralBody = 'doc-central-body';

    // Three distinct relationships between the same pair
    const relationships: Relationship[] = [
      { id: 'rel-member', source_id: voltaire, target_id: centralBody, label: 'Member of', universe_id: testUniverseId, book_id: null, directed: true, context_node_id: null, description: 'Official operative', archived: false },
      { id: 'rel-leads', source_id: voltaire, target_id: centralBody, label: 'Leads', universe_id: testUniverseId, book_id: null, directed: true, context_node_id: null, description: 'Director of internal affairs', archived: false },
      { id: 'rel-advisor', source_id: voltaire, target_id: centralBody, label: 'Secret Advisor to', universe_id: testUniverseId, book_id: null, directed: true, context_node_id: null, description: 'Confidential counsel to high council', archived: false },
    ];

    const snapshotBefore = JSON.stringify(relationships);

    const layout = layoutRelationships(relationships);

    // 1. Invariant: Original relationship data is never mutated
    assert.equal(JSON.stringify(relationships), snapshotBefore);

    // 2. Individual edges computed with distinct paths and coordinates
    assert.equal(layout.edges.length, 3);
    assert.equal(new Set(layout.edges.map((e) => e.path)).size, 3);
    assert.equal(new Set(layout.edges.map((e) => `${e.labelX},${e.labelY}`)).size, 3);

    // 3. Grouped edge aggregation produces exactly one grouped edge for this pair
    assert.equal(layout.groupedEdges.length, 1);
    const grp = layout.groupedEdges[0];
    assert.equal(grp.count, 3);
    assert.equal(grp.relationships.length, 3);
    assert.deepEqual(grp.labels.slice().sort(), ['Leads', 'Member of', 'Secret Advisor to']);
    assert.deepEqual(grp.relationships.map((r) => r.id).sort(), ['rel-advisor', 'rel-leads', 'rel-member']);

    storage.cleanup();
  });

  it('5. Directed vs. symmetric edge presentation preserves distinct semantic flags', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-test-5-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const relationships: Relationship[] = [
      { id: 'r-dir', source_id: 'n1', target_id: 'n2', label: 'Member of', universe_id: testUniverseId, book_id: null, directed: true, context_node_id: null, description: '', archived: false },
      { id: 'r-sym', source_id: 'n3', target_id: 'n4', label: 'Allied with', universe_id: testUniverseId, book_id: null, directed: false, context_node_id: null, description: '', archived: false },
    ];

    const layout = layoutRelationships(relationships);
    assert.equal(layout.groupedEdges.length, 2);

    const dirGrp = layout.groupedEdges.find((g) => g.relationships.some((r) => r.id === 'r-dir'))!;
    const symGrp = layout.groupedEdges.find((g) => g.relationships.some((r) => r.id === 'r-sym'))!;

    assert.equal(dirGrp.directed, true);
    assert.equal(dirGrp.isSymmetric, false);

    assert.equal(symGrp.directed, false);
    assert.equal(symGrp.isSymmetric, true);

    storage.cleanup();
  });

  it('6. Guided and custom relationship filters separate connections accurately', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-test-6-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const relationships: Relationship[] = [
      { id: 'r1', source_id: 'c1', target_id: 'f1', label: 'Member of', universe_id: testUniverseId, book_id: null, directed: true, context_node_id: null, description: '', archived: false }, // Guided (membership)
      { id: 'r2', source_id: 'c1', target_id: 'l1', label: 'Resides in', universe_id: testUniverseId, book_id: null, directed: true, context_node_id: null, description: '', archived: false }, // Guided (residence)
      { id: 'r3', source_id: 'f1', target_id: 'f2', label: 'Allied with', universe_id: testUniverseId, book_id: null, directed: false, context_node_id: null, description: '', archived: false }, // Custom
      { id: 'r4', source_id: 'c1', target_id: 'c2', label: 'Mentor to', universe_id: testUniverseId, book_id: null, directed: true, context_node_id: null, description: '', archived: false }, // Custom
    ];

    const typeOf = () => 'character';

    const all = filterGraph(relationships, typeOf, '', '', 'all');
    assert.equal(all.length, 4);

    const guided = filterGraph(relationships, typeOf, '', '', 'guided');
    assert.equal(guided.length, 2);
    assert.deepEqual(guided.map((r) => r.label).sort(), ['Member of', 'Resides in']);

    const custom = filterGraph(relationships, typeOf, '', '', 'custom');
    assert.equal(custom.length, 2);
    assert.deepEqual(custom.map((r) => r.label).sort(), ['Allied with', 'Mentor to']);

    storage.cleanup();
  });

  it('7. Faction hierarchy visualization constructs multi-root, branch, and holder trees accurately', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-test-7-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    // Characters
    const c1 = await storage.createDocument('lorebook', 'Chancellor Vane');
    const c2 = await storage.createDocument('lorebook', 'Admiral Sterling');
    const c3 = await storage.createDocument('lorebook', 'Captain Thorne');

    // Faction with:
    // Branches: Navy, Intelligence
    // Positions:
    // - Co-leader 1: Grand Chancellor (holder: c1, no parent)
    // - Co-leader 2: Grand Inquisitor (holder: c2, no parent) -> Multi-root leadership!
    // - Subordinate: Fleet Admiral (parent: Co-leader 1, holders: [c2, c3]) -> Multi-holder!
    // - Vacant Subordinate: Shadow Envoy (parent: Co-leader 2, holders: []) -> Vacant!
    const factionFields: FactionFields = {
      faction_type: 'Hegemony Council',
      branches: [
        { id: 'br-navy', name: 'Imperial Navy', description: 'Void armada' },
        { id: 'br-intel', name: 'Intelligence Bureau', description: 'Clandestine ops' },
      ],
      positions: [
        { id: 'pos-1', title: 'Grand Chancellor', parent_position_id: null, branch_id: 'br-intel', holder_ids: [c1.metadata.id] },
        { id: 'pos-2', title: 'Grand Inquisitor', parent_position_id: null, branch_id: 'br-intel', holder_ids: [c2.metadata.id] },
        { id: 'pos-3', title: 'Fleet Admiral', parent_position_id: 'pos-1', branch_id: 'br-navy', holder_ids: [c2.metadata.id, c3.metadata.id] },
        { id: 'pos-4', title: 'Shadow Envoy', parent_position_id: 'pos-2', branch_id: 'br-intel', holder_ids: [] },
      ],
    };

    const factionDoc = await storage.createDocument(
      'lorebook',
      'The Hegemony',
      'Galactic governing authority.',
      JSON.stringify({ entry_type: 'faction', faction_fields: factionFields })
    );

    const allDocs = [c1.metadata, c2.metadata, c3.metadata, factionDoc.metadata];

    const data = buildFactionHierarchyData(factionDoc.metadata, allDocs);

    // 1. Multi-root positions supported
    assert.equal(data.rootPositions.length, 2);
    const rootTitles = data.rootPositions.map((p) => p.title).sort();
    assert.deepEqual(rootTitles, ['Grand Chancellor', 'Grand Inquisitor']);

    // 2. Child reporting lines
    const chancellor = data.rootPositions.find((p) => p.title === 'Grand Chancellor')!;
    assert.equal(chancellor.children.length, 1);
    assert.equal(chancellor.children[0].title, 'Fleet Admiral');

    const inquisitor = data.rootPositions.find((p) => p.title === 'Grand Inquisitor')!;
    assert.equal(inquisitor.children.length, 1);
    assert.equal(inquisitor.children[0].title, 'Shadow Envoy');

    // 3. Multi-holder resolution
    const admiral = chancellor.children[0];
    assert.equal(admiral.isMultiHolder, true);
    assert.equal(admiral.holders.length, 2);
    assert.deepEqual(admiral.holders.map((h) => h.title).sort(), ['Admiral Sterling', 'Captain Thorne']);

    // 4. Vacant position detection
    const envoy = inquisitor.children[0];
    assert.equal(envoy.isVacant, true);
    assert.equal(envoy.holders.length, 0);

    // 5. Total counts
    assert.equal(data.totalPositions, 4);
    assert.equal(data.vacantCount, 1);
    assert.equal(data.totalHolders, 3); // c1, c2, c3

    // 6. Branches
    assert.equal(data.branches.length, 2);
    const navy = data.branches.find((b) => b.name === 'Imperial Navy')!;
    assert.equal(navy.positions.length, 1);
    assert.equal(navy.positions[0].title, 'Fleet Admiral');

    storage.cleanup();
  });

  it('8. Missing references and unresolved document IDs are handled gracefully', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-test-8-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const factionFields: FactionFields = {
      positions: [
        { id: 'p1', title: 'Ghost Commander', parent_position_id: null, holder_ids: ['non-existent-uuid-999'] },
      ],
    };

    const factionDoc = await storage.createDocument(
      'lorebook',
      'Phantom Legion',
      '',
      JSON.stringify({ entry_type: 'faction', faction_fields: factionFields })
    );

    // No documents in library
    const data = buildFactionHierarchyData(factionDoc.metadata, []);

    assert.equal(data.totalPositions, 1);
    const pos = data.rootPositions[0];
    assert.equal(pos.holders.length, 1);
    assert.ok(pos.holders[0].title.includes('non-exi') || pos.holders[0].title.includes('Character #'));

    storage.cleanup();
  });

  it('9. Camera fitToView calculates clean scale and bounds without NaN or zero division', async () => {
    const emptyLayout = { nodes: [], edges: [], groupedEdges: [], width: 0, height: 0, x: 0, y: 0 };
    const emptyCamera = fitCameraToView(emptyLayout, 800, 600);
    assert.equal(Number.isFinite(emptyCamera.scale), true);
    assert.equal(emptyCamera.scale, 1);

    const normalLayout = {
      nodes: [{ id: 'n1', x: 0, y: 0 }],
      edges: [],
      groupedEdges: [],
      width: 1200,
      height: 800,
      x: -600,
      y: -400,
    };
    const camera = fitCameraToView(normalLayout, 800, 500);
    assert.ok(camera.scale > 0.15 && camera.scale <= 1.5);
    assert.equal(camera.x, 0);
    assert.equal(camera.y, 0);
  });

  it('10. Graph state exploration does NOT modify canonical files on disk', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-test-10-'));
    storage = new DisposableFilesystemStorage(tmpDir);

    const originalContent = '# Lord Malakor\n\nRuler of the Obsidian Keep.';
    const doc = await storage.createDocument('lorebook', 'Malakor', originalContent);

    const filePath = storage.resolvePath(doc.metadata.relative_path);
    const beforeBytes = fs.readFileSync(filePath, 'utf8');

    // Run graph queries, layout, zoom, and filter
    const rels: Relationship[] = [
      { id: 'r1', source_id: doc.metadata.id, target_id: 'doc-target', label: 'Rules', universe_id: testUniverseId, book_id: null, directed: true, context_node_id: null, description: '', archived: false },
    ];
    layoutRelationships(rels, { focusId: doc.metadata.id });
    zoomCamera({ x: 0, y: 0, scale: 1 }, 1.3);
    getFocusedNeighborhood(rels, doc.metadata.id);

    // Verify disk content is byte-for-byte identical
    const afterBytes = fs.readFileSync(filePath, 'utf8');
    assert.equal(afterBytes, beforeBytes);

    storage.cleanup();
  });
});
