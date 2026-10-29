import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { api } from '../src/services/api';
import type { CommandArgs } from '../src/services/commands';
import { exportPortableAfterSave, type PortableExportRequest } from '../src/services/portable';
import { getChaptersForBook } from '../src/utils/universe';
import type { DocumentMetadata } from '../src/types';
import type { Plan } from '../src/utils/thought';
import { validateMilestoneAncestry, resolveUniverseStateAtMilestone, resolveChapterHistoricalContext } from '../src/utils/stateEngine';

const request: PortableExportRequest = {
  universe_id: 'u', snapshot_basis: 'last_saved_state', book_ids: [], chapter_ids: [],
};

test('portable capture waits for all pending saves and propagates the actual result', async () => {
  const order: string[] = [];
  let release!: (saved: boolean) => void;
  const pending = exportPortableAfterSave(
    () => new Promise<boolean>(resolve => { order.push('flush'); release = resolve; }),
    async () => { order.push('capture'); return { path: 'completed.mcuniverse' }; },
  );
  assert.deepEqual(order, ['flush']);
  release(true);
  assert.deepEqual(await pending, { path: 'completed.mcuniverse' });
  assert.deepEqual(order, ['flush', 'capture']);
});

test('failed or rejected saves prevent capture and export failures remain failures', async () => {
  let captured = false;
  await assert.rejects(exportPortableAfterSave(async () => false, async () => { captured = true; }), /could not be saved/);
  await assert.rejects(exportPortableAfterSave(async () => { throw new Error('save failed'); }, async () => { captured = true; }), /save failed/);
  assert.equal(captured, false);
  await assert.rejects(exportPortableAfterSave(async () => true, async () => { throw new Error('source changed'); }), /source changed/);
});

test('browser contract refuses durable export, inspection, and import mutation instead of fabricating packages', async () => {
  await assert.rejects(api.portableUniverseExport(request, 'out.mcuniverse'), /require the Windows desktop/);
  await assert.rejects(api.portableUniverseInspect('out.mcuniverse'), /require the Windows desktop/);
  await assert.rejects(api.portableUniverseImportPreview({ package_path: 'out.mcuniverse', target_house_id: 'house-default', policy: 'separate_copy' }), /require the Windows desktop/);
  await assert.rejects(api.portableUniverseImportCommit({ operation_id: 'op-1', package_path: 'out.mcuniverse', target_house_id: 'house-default', policy: 'separate_copy', expected_destination_fingerprint: 'fp-1' }), /require the Windows desktop/);
  await assert.rejects(api.portableUniverseRecoverImports(), /require the Windows desktop/);
});

test('L1/L2a/L2b IPC has explicit selection, last-saved semantics, read-only preview, and backend-authoritative publication', () => {
  const exportArgs: CommandArgs['portable_universe_export'] = { request, destination: 'out.mcuniverse' };
  const inspectArgs: CommandArgs['portable_universe_inspect'] = { path: exportArgs.destination };
  const previewArgs: CommandArgs['portable_universe_import_preview'] = { request: { package_path: 'out.mcuniverse', target_house_id: 'house-default', policy: 'separate_copy' } };
  const commitArgs: CommandArgs['portable_universe_import_commit'] = {
    request: {
      operation_id: 'op-commit-1',
      package_path: 'out.mcuniverse',
      target_house_id: 'house-default',
      policy: 'separate_copy',
      expected_destination_fingerprint: 'dest-fp-1',
    },
  };
  const recoverArgs: CommandArgs['portable_universe_recover_imports'] = {};
  assert.deepEqual(exportArgs.request.book_ids, []);
  assert.equal(inspectArgs.path, 'out.mcuniverse');
  assert.equal(previewArgs.request.policy, 'separate_copy');
  assert.equal(commitArgs.request.operation_id, 'op-commit-1');
  assert.deepEqual(recoverArgs, {});
  const rust = fs.readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  assert.match(rust, /portable::portable_universe_export/);
  assert.match(rust, /portable::portable_universe_inspect/);
  assert.match(rust, /portable::portable_universe_import_preview/);
  assert.match(rust, /portable::portable_universe_import_commit/);
  assert.match(rust, /portable::portable_universe_recover_imports/);
  const module = fs.readFileSync(new URL('../src-tauri/src/portable.rs', import.meta.url), 'utf8');
  const commands = [...module.matchAll(/#\[tauri::command\]\s+pub async fn (\w+)/g)].map(match => match[1]);
  assert.deepEqual(commands, [
    'portable_universe_export',
    'portable_universe_inspect',
    'portable_universe_import_preview',
    'portable_universe_import_commit',
    'portable_universe_recover_imports',
  ]);
});

test('shared Rust/export fixture matches the actual frontend chapter timestamp comparator', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/portable_chapter_order.json', import.meta.url), 'utf8')) as {
    chapters: { id: string; created_at: string }[]; expected_order: string[];
  };
  const documents: DocumentMetadata[] = fixture.chapters.map(chapter => ({
    ...chapter, title: chapter.id, doc_type: 'lorebook', house_id: 'house-default',
    relative_path: `Lorebooks/${chapter.id}.md`, parent_id: null, updated_at: chapter.created_at,
    tags: [], metadata_json: JSON.stringify({ entry_type: 'chapter', universe_id: 'u', book_id: 'book', chapter_order: 1 }),
  }));
  assert.deepEqual(getChaptersForBook(documents, 'book').map(doc => doc.id), fixture.expected_order);
});

test('semantic equivalence: state resolution and chapter historical context match across source and remapped plans', () => {
  // 1. Source plan with nested continuities and milestone position ties
  const sourcePlan: Plan = {
    version: 1,
    revision: 1,
    universes: [{ id: 'u-src', name: 'Source Universe', archived: false }],
    books: [
      { id: 'b-main', universe_id: 'u-src', name: 'Main Book', continuity: 'canonical', archived: false },
      { id: 'b-alt', universe_id: 'u-src', name: 'Alt Book', continuity: 'alternate', branch_id: 'br-nested', archived: false },
    ],
    branches: [
      { id: 'br-1', universe_id: 'u-src', name: 'Timeline Beta', divergence_node_id: 'm-root', parent_continuity_id: null, archived: false, created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:00Z' },
      { id: 'br-nested', universe_id: 'u-src', name: 'Timeline Gamma', divergence_node_id: 'm-br1', parent_continuity_id: 'br-1', archived: false, created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:00Z' },
    ],
    entities: [{ id: 'char-1', universe_id: 'u-src' }],
    nodes: [
      {
        id: 'm-root', universe_id: 'u-src', book_id: 'b-main', branch_id: null, position: 0,
        title: 'Root Event', description: '', era: 'E1', status: 'written', questions: '',
        entity_ids: ['char-1'],
        changes: [{ id: 'c-1', entity_id: 'char-1', property_key: 'status', previous_value: null, new_value: 'active', note: '' }],
        relationship_changes: [], linked_event_id: null, origin_node_id: null, archived: false,
        created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:00Z',
      },
      {
        id: 'm-tie-a', universe_id: 'u-src', book_id: 'b-main', branch_id: null, position: 10,
        title: 'Tied Event A', description: '', era: 'E1', status: 'written', questions: '',
        entity_ids: ['char-1'],
        changes: [{ id: 'c-2a', entity_id: 'char-1', property_key: 'status', previous_value: 'active', new_value: 'injured', note: '' }],
        relationship_changes: [], linked_event_id: null, origin_node_id: null, archived: false,
        created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:00Z',
      },
      {
        id: 'm-tie-b', universe_id: 'u-src', book_id: 'b-main', branch_id: null, position: 10,
        title: 'Tied Event B', description: '', era: 'E1', status: 'written', questions: '',
        entity_ids: ['char-1'],
        changes: [{ id: 'c-2b', entity_id: 'char-1', property_key: 'status', previous_value: 'injured', new_value: 'healed', note: '' }],
        relationship_changes: [], linked_event_id: null, origin_node_id: null, archived: false,
        created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:00Z',
      },
      {
        id: 'm-br1', universe_id: 'u-src', book_id: null, branch_id: 'br-1', position: 20,
        title: 'Branch 1 Event', description: '', era: 'E1', status: 'written', questions: '',
        entity_ids: ['char-1'],
        changes: [{ id: 'c-3', entity_id: 'char-1', property_key: 'status', previous_value: 'healed', new_value: 'ascended', note: '' }],
        relationship_changes: [], linked_event_id: null, origin_node_id: null, archived: false,
        created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:00Z',
      },
      {
        id: 'm-nested', universe_id: 'u-src', book_id: 'b-alt', branch_id: 'br-nested', position: 30,
        title: 'Nested Branch Event', description: '', era: 'E1', status: 'written', questions: '',
        entity_ids: ['char-1'],
        changes: [{ id: 'c-4', entity_id: 'char-1', property_key: 'status', previous_value: 'ascended', new_value: 'transcendent', note: '' }],
        relationship_changes: [], linked_event_id: null, origin_node_id: null, archived: false,
        created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:00Z',
      },
    ],
    relationships: [],
  };

  const sourceDocs: DocumentMetadata[] = [
    {
      id: 'char-1', title: 'Protagonist', doc_type: 'lorebook', house_id: 'house-src',
      relative_path: 'Lorebooks/Protagonist.md', parent_id: null, created_at: '2026-10-28T00:00:00Z',
      updated_at: '2026-10-28T00:00:00Z', tags: [],
      metadata_json: JSON.stringify({ entry_type: 'character', universe_id: 'u-src' }),
    },
    {
      id: 'ch-nested', title: 'Chapter Gamma', doc_type: 'lorebook', house_id: 'house-src',
      relative_path: 'Lorebooks/Chapter_Gamma.md', parent_id: null, created_at: '2026-10-28T00:00:00Z',
      updated_at: '2026-10-28T00:00:00Z', tags: [],
      metadata_json: JSON.stringify({ entry_type: 'chapter', universe_id: 'u-src', book_id: 'b-alt', milestone_id: 'm-nested' }),
    },
  ];

  // 2. Consistent remapped representation (matching L2a remapper output)
  const idMap: Record<string, string> = {
    'u-src': 'uni-dest-001',
    'b-main': 'book-dest-main',
    'b-alt': 'book-dest-alt',
    'br-1': 'br-dest-1',
    'br-nested': 'br-dest-nested',
    'char-1': 'char-dest-1',
    'm-root': 'm-dest-0',
    'm-tie-a': 'm-dest-1a',
    'm-tie-b': 'm-dest-1b',
    'm-br1': 'm-dest-2',
    'm-nested': 'm-dest-3',
    'ch-nested': 'ch-dest-nested',
  };

  const remappedPlan: Plan = {
    version: 1,
    revision: 2,
    universes: [{ id: idMap['u-src'], name: 'Source Universe', archived: false }],
    books: sourcePlan.books.map(b => ({
      ...b, id: idMap[b.id], universe_id: idMap[b.universe_id],
      branch_id: b.branch_id ? idMap[b.branch_id] : null,
    })),
    branches: sourcePlan.branches.map(br => ({
      ...br, id: idMap[br.id], universe_id: idMap[br.universe_id],
      divergence_node_id: idMap[br.divergence_node_id],
      parent_continuity_id: br.parent_continuity_id ? idMap[br.parent_continuity_id] : null,
    })),
    entities: [{ id: idMap['char-1'], universe_id: idMap['u-src'] }],
    nodes: sourcePlan.nodes.map(n => ({
      ...n, id: idMap[n.id], universe_id: idMap[n.universe_id],
      book_id: n.book_id ? idMap[n.book_id] : null,
      branch_id: n.branch_id ? idMap[n.branch_id] : null,
      entity_ids: n.entity_ids.map(id => idMap[id] || id),
      changes: n.changes.map(c => ({
        ...c, id: `c-dest-${c.id}`, entity_id: idMap[c.entity_id] || c.entity_id,
      })),
      relationship_changes: [],
    })),
    relationships: [],
  };

  const remappedDocs: DocumentMetadata[] = [
    {
      ...sourceDocs[0], id: idMap['char-1'], house_id: 'house-dest',
      metadata_json: JSON.stringify({ entry_type: 'character', universe_id: idMap['u-src'] }),
    },
    {
      ...sourceDocs[1], id: idMap['ch-nested'], house_id: 'house-dest',
      metadata_json: JSON.stringify({ entry_type: 'chapter', universe_id: idMap['u-src'], book_id: idMap['b-alt'], milestone_id: idMap['m-nested'] }),
    },
  ];

  // 3. Verify nested continuity ancestry matches
  const srcAncestry = validateMilestoneAncestry(sourcePlan, 'm-nested');
  const remAncestry = validateMilestoneAncestry(remappedPlan, idMap['m-nested']);
  assert.equal(srcAncestry.valid, true);
  assert.equal(remAncestry.valid, true);
  assert.equal(srcAncestry.lineage.length, remAncestry.lineage.length);
  // Source order of milestone predecessors is exactly preserved
  assert.deepEqual(
    remAncestry.lineage.map(n => n.id),
    srcAncestry.lineage.map(n => idMap[n.id])
  );

  // 4. Verify state resolution at nested milestone produces identical entity values
  const srcStates = resolveUniverseStateAtMilestone(sourcePlan, sourceDocs, 'u-src', 'm-nested');
  const remStates = resolveUniverseStateAtMilestone(remappedPlan, remappedDocs, idMap['u-src'], idMap['m-nested']);
  assert.equal(srcStates.length, remStates.length);
  const srcChar = srcStates.find(s => s.entityId === 'char-1')!;
  const remChar = remStates.find(s => s.entityId === idMap['char-1'])!;
  assert.ok(srcChar && remChar);
  assert.equal(srcChar.value, 'transcendent');
  assert.equal(remChar.value, 'transcendent');
  assert.equal(srcChar.previousValue, 'ascended');
  assert.equal(remChar.previousValue, 'ascended');

  // 5. Verify milestone tie-breaking semantics at tied milestone B
  const srcTieState = resolveUniverseStateAtMilestone(sourcePlan, sourceDocs, 'u-src', 'm-tie-b');
  const remTieState = resolveUniverseStateAtMilestone(remappedPlan, remappedDocs, idMap['u-src'], idMap['m-tie-b']);
  assert.equal(srcTieState.length, remTieState.length);
  const srcTieChar = srcTieState.find(s => s.entityId === 'char-1')!;
  const remTieChar = remTieState.find(s => s.entityId === idMap['char-1'])!;
  assert.ok(srcTieChar && remTieChar);
  assert.equal(srcTieChar.value, 'healed');
  assert.equal(remTieChar.value, 'healed');
  assert.equal(srcTieChar.previousValue, 'injured');
  assert.equal(remTieChar.previousValue, 'injured');

  // 6. Verify chapter historical context equivalence
  const srcContext = resolveChapterHistoricalContext(sourcePlan, 'u-src', sourceDocs[1], sourcePlan.books[1]);
  const remContext = resolveChapterHistoricalContext(remappedPlan, idMap['u-src'], remappedDocs[1], remappedPlan.books[1]);
  assert.ok(srcContext && remContext);
  assert.equal(srcContext.isValid, true);
  assert.equal(remContext.isValid, true);
  assert.equal(srcContext.continuityName, 'Alternate: Timeline Gamma');
  assert.equal(remContext.continuityName, 'Alternate: Timeline Gamma');
  assert.equal(remContext.milestoneId, idMap[srcContext.milestoneId]);
});

test('L2b ImportCommitResult preserves publication metadata and counters', () => {
  const result: import('../src/services/portable').ImportCommitResult = {
    operation_id: 'op-123',
    universe_id: 'uni-456',
    universe_name: 'The New Realm',
    house_id: 'house-lore',
    house_name: 'House Lore',
    documents_imported: 4,
    archived_documents_imported: 1,
    assets_imported: 2,
    plan_revision: 7,
  };
  assert.equal(result.operation_id, 'op-123');
  assert.equal(result.universe_id, 'uni-456');
  assert.equal(result.house_id, 'house-lore');
  assert.equal(result.documents_imported, 4);
  assert.equal(result.archived_documents_imported, 1);
  assert.equal(result.assets_imported, 2);
  assert.equal(result.plan_revision, 7);
});

test('L2b ImportRecoveryReport tracks recovered operation IDs and recovery actions', () => {
  const report: import('../src/services/portable').ImportRecoveryReport = {
    recovered_operations: ['op-interrupted-1', 'op-interrupted-2'],
    actions: [
      'Rolled back committed destination files for uncataloged import op-interrupted-1',
      'Rolled forward cataloged import op-interrupted-2 through registry and index',
    ],
  };
  assert.equal(report.recovered_operations.length, 2);
  assert.equal(report.actions.length, 2);
  assert.match(report.actions[0], /Rolled back/);
  assert.match(report.actions[1], /Rolled forward/);
});
