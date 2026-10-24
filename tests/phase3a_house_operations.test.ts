import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectLibrary, defaultFilters, LibraryFilters } from '../src/utils/organization';
import { getManuscriptSourceCandidates, flattenManuscriptOutline } from '../src/utils/manuscript';
import { MockStorage } from '../src/services/api';
import type { DocumentMetadata, ManuscriptNode } from '../src/types';

describe('Phase 3A: House-Scoped Document Operations & Reference Resolution', () => {
  const sampleDocs: DocumentMetadata[] = [
    {
      id: 'doc-legacy',
      title: 'Legacy Poem Without House',
      doc_type: 'poetry',
      relative_path: 'Poetry/Legacy.md',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      tags: ['classic'],
      metadata_json: null,
      // house_id omitted/undefined -> resolves to house-default
    },
    {
      id: 'doc-default-phil',
      title: 'Default House Philosophy',
      doc_type: 'philosophy',
      house_id: 'house-default',
      relative_path: 'Philosophy/Default.md',
      created_at: '2026-10-02T00:00:00Z',
      updated_at: '2026-10-02T00:00:00Z',
      tags: ['logic'],
      metadata_json: null,
    },
    {
      id: 'doc-beta-poetry',
      title: 'Beta House Poem',
      doc_type: 'poetry',
      house_id: 'house-beta',
      relative_path: 'Poetry/Beta.md',
      created_at: '2026-10-03T00:00:00Z',
      updated_at: '2026-10-03T00:00:00Z',
      tags: ['modern'],
      metadata_json: null,
    },
    {
      id: 'doc-beta-lore',
      title: 'Beta House Lore',
      doc_type: 'lorebook',
      house_id: 'house-beta',
      relative_path: 'Lorebooks/Beta.md',
      created_at: '2026-10-04T00:00:00Z',
      updated_at: '2026-10-04T00:00:00Z',
      tags: ['world'],
      metadata_json: null,
    },
    {
      id: 'doc-manuscript-beta',
      title: 'Beta House Manuscript',
      doc_type: 'manuscript',
      house_id: 'house-beta',
      relative_path: 'Manuscripts/Beta.md',
      created_at: '2026-10-05T00:00:00Z',
      updated_at: '2026-10-05T00:00:00Z',
      tags: [],
      metadata_json: null,
    },
  ];

  it('selectLibrary returns all documents when filters.houseId is undefined or null', () => {
    const filters: LibraryFilters = { ...defaultFilters, houseId: undefined };
    const result = selectLibrary(sampleDocs, filters);
    assert.strictEqual(result.length, 5);

    const nullFilters: LibraryFilters = { ...defaultFilters, houseId: null };
    const nullResult = selectLibrary(sampleDocs, nullFilters);
    assert.strictEqual(nullResult.length, 5);
  });

  it('selectLibrary filters documents by houseId and treats omitted house_id as house-default', () => {
    // 1. house-default includes explicit house-default and legacy undefined
    const defaultFiltersScoped: LibraryFilters = { ...defaultFilters, houseId: 'house-default' };
    const defaultResult = selectLibrary(sampleDocs, defaultFiltersScoped);
    assert.strictEqual(defaultResult.length, 2);
    assert.deepStrictEqual(
      defaultResult.map(d => d.id).sort(),
      ['doc-default-phil', 'doc-legacy']
    );

    // 2. house-beta returns only documents belonging to house-beta
    const betaFilters: LibraryFilters = { ...defaultFilters, houseId: 'house-beta' };
    const betaResult = selectLibrary(sampleDocs, betaFilters);
    assert.strictEqual(betaResult.length, 3);
    assert.ok(betaResult.every(d => d.house_id === 'house-beta'));

    // 3. Composing house filter with studio filter
    const betaPoetryFilters: LibraryFilters = {
      ...defaultFilters,
      houseId: 'house-beta',
      studio: 'poetry',
    };
    const betaPoetryResult = selectLibrary(sampleDocs, betaPoetryFilters);
    assert.strictEqual(betaPoetryResult.length, 1);
    assert.strictEqual(betaPoetryResult[0].id, 'doc-beta-poetry');
  });

  it('getManuscriptSourceCandidates excludes manuscripts and scopes by activeHouseId when provided', () => {
    // 1. Global candidates: excludes manuscripts, includes all studios from all houses
    const globalCandidates = getManuscriptSourceCandidates(sampleDocs, null);
    assert.strictEqual(globalCandidates.length, 4);
    assert.ok(!globalCandidates.some(d => d.doc_type === 'manuscript'));

    // 2. Scoped to house-default: excludes manuscripts and beta documents
    const defaultCandidates = getManuscriptSourceCandidates(sampleDocs, 'house-default');
    assert.strictEqual(defaultCandidates.length, 2);
    assert.deepStrictEqual(
      defaultCandidates.map(d => d.id).sort(),
      ['doc-default-phil', 'doc-legacy']
    );

    // 3. Scoped to house-beta: excludes manuscripts and default documents
    const betaCandidates = getManuscriptSourceCandidates(sampleDocs, 'house-beta');
    assert.strictEqual(betaCandidates.length, 2);
    assert.deepStrictEqual(
      betaCandidates.map(d => d.id).sort(),
      ['doc-beta-lore', 'doc-beta-poetry']
    );
  });

  it('flattenManuscriptOutline retains global resolution for cross-House linked documents', () => {
    const documentLookup = new Map<string, DocumentMetadata>();
    for (const doc of sampleDocs) {
      documentLookup.set(doc.id, doc);
    }

    // Outline in a beta manuscript linking a poetry doc from house-default and lore from house-beta
    const outline: ManuscriptNode[] = [
      {
        id: 'sec-1',
        type: 'section',
        title: 'Anthology Section',
        children: [
          {
            id: 'link-1',
            type: 'linked_doc',
            doc_id: 'doc-legacy', // from house-default
            doc_type: 'poetry',
          },
          {
            id: 'link-2',
            type: 'linked_doc',
            doc_id: 'doc-beta-lore', // from house-beta
            doc_type: 'lorebook',
          },
        ],
      },
    ];

    const readingSequence = flattenManuscriptOutline(outline, documentLookup);
    assert.strictEqual(readingSequence.length, 3);
    assert.strictEqual(readingSequence[0].type, 'section');
    assert.strictEqual(readingSequence[1].type, 'linked_doc');
    assert.strictEqual(readingSequence[1].docId, 'doc-legacy');
    assert.strictEqual(readingSequence[2].type, 'linked_doc');
    assert.strictEqual(readingSequence[2].docId, 'doc-beta-lore');
  });

  it('MockStorage supports house-aware operations and integrity inspection', async () => {
    const storage = new MockStorage();

    // 1. Create document with explicit house_id
    const created = await storage.createDocument(
      'poetry',
      'Solar Wind',
      undefined,
      'Solar rays drift',
      undefined,
      ['space'],
      'house-astronomy'
    );
    assert.strictEqual(created.metadata.house_id, 'house-astronomy');

    // 2. List documents scoped by house_id
    const astronomyDocs = await storage.listDocuments(undefined, 'house-astronomy');
    assert.strictEqual(astronomyDocs.length, 1);
    assert.strictEqual(astronomyDocs[0].title, 'Solar Wind');

    // 3. Search documents scoped by house_id
    const searchMatch = await storage.searchDocuments('solar', undefined, 'house-astronomy');
    assert.strictEqual(searchMatch.length, 1);
    const searchMiss = await storage.searchDocuments('Solar Wind', undefined, 'house-default');
    assert.strictEqual(searchMiss.length, 0);

    // 4. Inspect integrity returns valid report
    const integrity = await storage.inspectHouseIntegrity();
    assert.ok(integrity.total_documents_scanned > 0);
    assert.strictEqual(integrity.issues.length, 0);
    assert.strictEqual(integrity.orphaned_document_count, 0);
  });
});
