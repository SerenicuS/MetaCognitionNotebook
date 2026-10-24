import { MockStorage } from '../src/services/api';
import { selectLibrary, defaultFilters } from '../src/utils/organization';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addLinkedDocToOutline,
  addOriginalTextToOutline,
  addSectionToOutline,
  cloneOutline,
  compileManuscriptToMarkdown,
  computeManuscriptStats,
  countOutlineNodes,
  findNodeById,
  flattenManuscriptOutline,
  formatPoetryMarkdown,
  generateManuscriptPdf,
  indentNodeInOutline,
  isDescendant,
  outdentNodeInOutline,
  removeNodeFromOutline,
  reorderNodeInOutline,
  updateNodeInOutline,
} from '../src/utils/manuscript';
import { DocumentDetail, ManuscriptMetadata, ManuscriptNode } from '../src/types';

describe('v0.7.0 Manuscript Tools - Outline Tree Engine', () => {
  it('adds sections, linked docs, and original text nodes hierarchically', () => {
    let outline: ManuscriptNode[] = [];

    // Add top-level section
    const sec1Res = addSectionToOutline(outline, null, 'Part I: Morning', 'Initial section');
    outline = sec1Res.outline;
    assert.equal(outline.length, 1);
    assert.equal(outline[0].title, 'Part I: Morning');

    // Add original text inside section
    const textRes = addOriginalTextToOutline(
      outline,
      sec1Res.newNode.id,
      'Preface',
      'This collection begins at dawn.'
    );
    outline = textRes.outline;

    // Add linked doc inside section
    const linkRes = addLinkedDocToOutline(
      outline,
      sec1Res.newNode.id,
      'poem-1',
      'poetry',
      'Custom Ode'
    );
    outline = linkRes.outline;

    // Check counts
    const counts = countOutlineNodes(outline);
    assert.equal(counts.sections, 1);
    assert.equal(counts.originalTexts, 1);
    assert.equal(counts.linkedDocs, 1);
    assert.equal(counts.total, 3);

    // Verify parent-child relationship
    const sec = findNodeById(outline, sec1Res.newNode.id)?.node;
    assert.equal(sec?.type, 'section');
    if (sec?.type === 'section') {
      assert.equal(sec.children.length, 2);
      assert.equal(sec.children[0].type, 'original_text');
      assert.equal(sec.children[1].type, 'linked_doc');
    }
  });

  it('detects descendant relationships correctly to prevent cycles', () => {
    let outline: ManuscriptNode[] = [];
    const part1 = addSectionToOutline(outline, null, 'Part 1');
    outline = part1.outline;
    const chap1 = addSectionToOutline(outline, part1.newNode.id, 'Chapter 1');
    outline = chap1.outline;
    const secA = addSectionToOutline(outline, chap1.newNode.id, 'Section A');
    outline = secA.outline;

    assert.equal(isDescendant(outline, part1.newNode.id, chap1.newNode.id), true);
    assert.equal(isDescendant(outline, part1.newNode.id, secA.newNode.id), true);
    assert.equal(isDescendant(outline, chap1.newNode.id, secA.newNode.id), true);

    // In reverse: ancestor is not descendant of child
    assert.equal(isDescendant(outline, secA.newNode.id, part1.newNode.id), false);
    assert.equal(isDescendant(outline, chap1.newNode.id, part1.newNode.id), false);
  });

  it('supports node removal with either cascade delete or unwrapping children', () => {
    let outline: ManuscriptNode[] = [];
    const sec = addSectionToOutline(outline, null, 'Container');
    outline = sec.outline;
    const item1 = addOriginalTextToOutline(outline, sec.newNode.id, 'Item 1', 'Prose 1');
    outline = item1.outline;
    const item2 = addOriginalTextToOutline(outline, sec.newNode.id, 'Item 2', 'Prose 2');
    outline = item2.outline;

    // Test unwrapChildren = true: container deleted, children promoted to top-level
    const unwrapped = removeNodeFromOutline(outline, sec.newNode.id, true);
    assert.equal(unwrapped.length, 2);
    assert.equal(unwrapped[0].title, 'Item 1');
    assert.equal(unwrapped[1].title, 'Item 2');

    // Test unwrapChildren = false: container and children all deleted
    const cascaded = removeNodeFromOutline(outline, sec.newNode.id, false);
    assert.equal(cascaded.length, 0);
  });

  it('supports reordering siblings up and down', () => {
    let outline: ManuscriptNode[] = [];
    const s1 = addSectionToOutline(outline, null, 'First');
    outline = s1.outline;
    const s2 = addSectionToOutline(outline, null, 'Second');
    outline = s2.outline;
    const s3 = addSectionToOutline(outline, null, 'Third');
    outline = s3.outline;

    assert.deepEqual(outline.map((n) => n.title), ['First', 'Second', 'Third']);

    // Move 'Second' up
    outline = reorderNodeInOutline(outline, s2.newNode.id, 'up');
    assert.deepEqual(outline.map((n) => n.title), ['Second', 'First', 'Third']);

    // Move 'Second' down
    outline = reorderNodeInOutline(outline, s2.newNode.id, 'down');
    assert.deepEqual(outline.map((n) => n.title), ['First', 'Second', 'Third']);
  });

  it('supports indentation and outdentation', () => {
    let outline: ManuscriptNode[] = [];
    const s1 = addSectionToOutline(outline, null, 'Parent Sec');
    outline = s1.outline;
    const s2 = addOriginalTextToOutline(outline, null, 'Prose');
    outline = s2.outline;

    assert.equal(outline.length, 2);

    // Indent s2 into s1
    outline = indentNodeInOutline(outline, s2.newNode.id);
    assert.equal(outline.length, 1);
    const parent = outline[0];
    assert.equal(parent.type === 'section' && parent.children.length, 1);

    // Outdent s2 back to root
    outline = outdentNodeInOutline(outline, s2.newNode.id);
    assert.equal(outline.length, 2);
    assert.equal(outline[1].title, 'Prose');
  });

  it('updates node properties cleanly', () => {
    let outline: ManuscriptNode[] = [];
    const s = addSectionToOutline(outline, null, 'Old Title');
    outline = s.outline;

    outline = updateNodeInOutline(outline, s.newNode.id, { title: 'New Title' });
    assert.equal(outline[0].title, 'New Title');
  });
});

describe('v0.7.0 Manuscript Tools - Source Resolution & Reading Order', () => {
  const mockDocs: DocumentDetail[] = [
    {
      metadata: {
        id: 'doc-poem-1',
        title: 'Morning Frost',
        doc_type: 'poetry',
        relative_path: 'Poetry/Morning_Frost.md',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['winter'],
      },
      content: 'Cold white lawn\nUnder early dawn\n\nQuiet steps retreat\nThrough frozen street',
    },
    {
      metadata: {
        id: 'doc-phil-1',
        title: 'Reflections on Time',
        doc_type: 'philosophy',
        relative_path: 'Philosophy/Reflections_on_Time.md',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['time'],
      },
      content: 'Time is not a container in which events unfold; it is the relation of sequence.',
    },
  ];

  it('resolves outline into flat reading sequence preserving source document contents', () => {
    let outline: ManuscriptNode[] = [];
    const sec1 = addSectionToOutline(outline, null, 'Part I: Winter Verse');
    outline = sec1.outline;

    const linkPoem = addLinkedDocToOutline(outline, sec1.newNode.id, 'doc-poem-1', 'poetry');
    outline = linkPoem.outline;

    const linkPhil = addLinkedDocToOutline(
      outline,
      sec1.newNode.id,
      'doc-phil-1',
      'philosophy',
      'Custom Title Override'
    );
    outline = linkPhil.outline;

    const resolved = flattenManuscriptOutline(outline, mockDocs);
    assert.equal(resolved.length, 3);

    // Section 1
    assert.equal(resolved[0].type, 'section');
    assert.equal(resolved[0].title, 'Part I: Winter Verse');
    assert.equal(resolved[0].level, 1);

    // Poem 1
    assert.equal(resolved[1].type, 'linked_doc');
    assert.equal(resolved[1].title, 'Morning Frost');
    assert.equal(resolved[1].docId, 'doc-poem-1');
    assert.ok(resolved[1].content?.includes('Cold white lawn'));

    // Philosophy 1 with custom title
    assert.equal(resolved[2].type, 'linked_doc');
    assert.equal(resolved[2].title, 'Custom Title Override');
    assert.equal(resolved[2].docId, 'doc-phil-1');
    assert.ok(resolved[2].content?.includes('Time is not a container'));
  });

  it('handles missing or deleted source documents gracefully without dropping the outline entry', () => {
    let outline: ManuscriptNode[] = [];
    const linkMissing = addLinkedDocToOutline(outline, null, 'deleted-doc-999', 'lorebook', 'Lost Realm');
    outline = linkMissing.outline;

    const resolved = flattenManuscriptOutline(outline, mockDocs);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].type, 'missing_doc');
    assert.equal(resolved[0].docId, 'deleted-doc-999');
    assert.equal(resolved[0].title, 'Lost Realm');
  });

  it('renaming source document does not break reference because link uses stable doc_id', () => {
    let outline: ManuscriptNode[] = [];
    const link = addLinkedDocToOutline(outline, null, 'doc-poem-1', 'poetry');
    outline = link.outline;

    // Simulate source document title changed by user in Poetry studio
    const renamedDocs: DocumentDetail[] = [
      {
        ...mockDocs[0],
        metadata: {
          ...mockDocs[0].metadata,
          title: 'Morning Frost (Revised Edition)',
        },
      },
    ];

    const resolved = flattenManuscriptOutline(outline, renamedDocs);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].title, 'Morning Frost (Revised Edition)');
    assert.equal(resolved[0].docId, 'doc-poem-1');
  });

  it('computes manuscript analytics accurately', () => {
    let outline: ManuscriptNode[] = [];
    const sec = addSectionToOutline(outline, null, 'Part I');
    outline = sec.outline;
    const text = addOriginalTextToOutline(outline, sec.newNode.id, 'Dedication', 'One two three four five.');
    outline = text.outline;
    const link = addLinkedDocToOutline(outline, sec.newNode.id, 'doc-poem-1', 'poetry');
    outline = link.outline;

    const resolved = flattenManuscriptOutline(outline, mockDocs);
    const stats = computeManuscriptStats(resolved);

    // Dedication = 5 words, Poem = 12 words -> total 17
    assert.equal(stats.totalWords, 17);
    assert.equal(stats.sectionCount, 1);
    assert.equal(stats.originalTextCount, 1);
    assert.equal(stats.linkedDocCount, 1);
    assert.equal(stats.missingDocCount, 0);
    assert.ok(stats.readingTimeMinutes >= 1);
    assert.ok(stats.estimatedPages >= 1);
  });
});

describe('v0.7.0 Manuscript Tools - Export Fidelity', () => {
  const meta: ManuscriptMetadata = {
    version: 1,
    subtitle: 'Collected Works',
    author: 'Author Name',
    outline: [],
  };

  it('formats poetry markdown with preserved line breaks and stanza spacing', () => {
    const rawPoetry = 'Line one\nLine two\n\nLine three\nLine four';
    const formatted = formatPoetryMarkdown(rawPoetry);
    assert.ok(formatted.includes('Line one  \nLine two  '));
    assert.ok(formatted.includes('\n\nLine three  '));
  });

  it('compiles unified markdown with title page, toc, stanzas, and nested headers', () => {
    const items: Parameters<typeof compileManuscriptToMarkdown>[2] = [
      { id: '1', type: 'section', title: 'Act I', level: 1, description: 'The beginning' },
      { id: '2', type: 'original_text', title: 'Prologue', level: 2, content: 'Spoken quietly.' },
      { id: '3', type: 'linked_doc', title: 'Song of Dusk', level: 2, docId: 'p1', docType: 'poetry', content: 'Shadows fall\nOver all' },
      { id: '4', type: 'missing_doc', title: 'Lost Tome', level: 2, docId: 'lost-1', docType: 'lorebook' },
    ];

    const md = compileManuscriptToMarkdown('My Book', meta, items, {
      include_title_page: true,
      include_toc: true,
      page_breaks_between_sections: true,
    });

    assert.ok(md.includes('# My Book'));
    assert.ok(md.includes('*Collected Works*'));
    assert.ok(md.includes('By Author Name'));
    assert.ok(md.includes('## Table of Contents'));
    assert.ok(md.includes('## Act I'));
    assert.ok(md.includes('*The beginning*'));
    assert.ok(md.includes('### Prologue'));
    assert.ok(md.includes('Spoken quietly.'));
    assert.ok(md.includes('### Song of Dusk'));
    assert.ok(md.includes('Shadows fall  \nOver all  '));
    assert.ok(md.includes('Referenced document lost-1 is missing'));
  });

  it('generates valid jsPDF document without throwing', () => {
    const items: Parameters<typeof generateManuscriptPdf>[2] = [
      { id: '1', type: 'section', title: 'Part I', level: 1 },
      { id: '2', type: 'original_text', title: 'Introduction', level: 2, content: 'Paragraph one.\n\nParagraph two.' },
      { id: '3', type: 'linked_doc', title: 'Evening Verse', level: 2, docId: 'p1', docType: 'poetry', content: 'Line 1\nLine 2\n\nLine 3' },
      { id: '4', type: 'missing_doc', title: 'Missing Lore', level: 2, docId: 'm1' },
    ];

    const doc = generateManuscriptPdf('Anthology', meta, items, {
      include_title_page: true,
      include_toc: true,
      page_breaks_between_sections: true,
    });

    assert.ok(doc);
    assert.ok(doc.getNumberOfPages() >= 2);
    const pdfArrayBuffer = doc.output('arraybuffer');
    assert.ok(pdfArrayBuffer.byteLength > 100);
  });
});

describe('v0.7.0 Manuscript Tools - UX Architecture & Navigation', () => {
  it('creates and persists manuscripts independently from the three authoring studios', async () => {
    const storage = new MockStorage();
    const manuscript = await storage.createDocument(
      'manuscript',
      'The Great Anthology',
      undefined,
      '',
      JSON.stringify({
        manuscript: {
          version: 1,
          subtitle: 'A Tri-Studio Collection',
          author: 'Eleanor Vance',
          outline: [],
        },
      }),
      ['anthology', '2026']
    );

    assert.equal(manuscript.metadata.title, 'The Great Anthology');
    assert.equal(manuscript.metadata.doc_type, 'manuscript');
    assert.equal(manuscript.metadata.relative_path, 'Manuscripts/The_Great_Anthology.md');
    assert.deepEqual(manuscript.metadata.tags, ['anthology', '2026']);

    const loaded = await storage.getDocument(manuscript.metadata.id);
    assert.equal(loaded.metadata.doc_type, 'manuscript');
    const parsed = JSON.parse(loaded.metadata.metadata_json || '{}');
    assert.equal(parsed.manuscript.author, 'Eleanor Vance');
    assert.equal(parsed.manuscript.subtitle, 'A Tri-Studio Collection');
  });

  it('filters and discovers existing manuscripts in Manuscript Tools and All Library', async () => {
    const storage = new MockStorage();

    // Create one of each document type
    const poem = await storage.createDocument('poetry', 'Autumn Whispers');
    const essay = await storage.createDocument('philosophy', 'Meditations on Solitude');
    const lore = await storage.createDocument('lorebook', 'The Obsidian Citadel');
    const ms1 = await storage.createDocument('manuscript', 'Selected Works Vol. 1');
    const ms2 = await storage.createDocument('manuscript', 'Selected Works Vol. 2');

    const allDocs = await storage.listDocuments();

    // 1. Manuscript Tools destination filtering
    const manuscriptFiltered = selectLibrary(allDocs, {
      ...defaultFilters,
      studio: 'manuscript',
    });
    assert.equal(manuscriptFiltered.length, 2);
    assert.ok(manuscriptFiltered.every((d) => d.doc_type === 'manuscript'));
    assert.ok(manuscriptFiltered.some((d) => d.id === ms1.metadata.id));
    assert.ok(manuscriptFiltered.some((d) => d.id === ms2.metadata.id));

    // 2. All Library discovery
    const allFiltered = selectLibrary(allDocs, {
      ...defaultFilters,
      studio: 'all',
    });
    assert.ok(allFiltered.some((d) => d.id === ms1.metadata.id && d.doc_type === 'manuscript'));
    assert.ok(allFiltered.some((d) => d.id === poem.metadata.id && d.doc_type === 'poetry'));
    assert.ok(allFiltered.some((d) => d.id === essay.metadata.id && d.doc_type === 'philosophy'));
    assert.ok(allFiltered.some((d) => d.id === lore.metadata.id && d.doc_type === 'lorebook'));

    // 3. Authoring studio isolation (Poetry library excludes manuscripts)
    const poetryFiltered = selectLibrary(allDocs, {
      ...defaultFilters,
      studio: 'poetry',
    });
    assert.ok(poetryFiltered.every((d) => d.doc_type === 'poetry'));
    assert.ok(!poetryFiltered.some((d) => d.doc_type === 'manuscript'));
  });

  it('preserves existing manuscript outline and source references across discovery and reload', async () => {
    const storage = new MockStorage();
    const poem = await storage.createDocument('poetry', 'Dawn Chorus', undefined, 'Birds sing at five.');

    const initialOutline: ManuscriptNode[] = [
      {
        id: 'sec-1',
        type: 'section',
        title: 'Opening Suite',
        level: 1,
        children: [
          {
            id: 'link-1',
            type: 'linked_doc',
            title: 'Dawn Chorus',
            doc_id: poem.metadata.id,
            doc_type: 'poetry',
            level: 2,
          },
        ],
      },
    ];

    const manuscript = await storage.createDocument(
      'manuscript',
      'Morning Book',
      undefined,
      'Internal working notes.',
      JSON.stringify({
        manuscript: {
          version: 1,
          outline: initialOutline,
        },
      })
    );

    // Re-fetch document from library
    const loaded = await storage.getDocument(manuscript.metadata.id);
    const parsed = JSON.parse(loaded.metadata.metadata_json || '{}');
    const outline = parsed.manuscript.outline as ManuscriptNode[];

    assert.equal(outline.length, 1);
    assert.equal(outline[0].title, 'Opening Suite');
    assert.equal(outline[0].type, 'section');

    const flattened = flattenManuscriptOutline(outline, [poem]);
    assert.equal(flattened.length, 2);
    assert.equal(flattened[0].type, 'section');
    assert.equal(flattened[1].type, 'linked_doc');
    assert.equal(flattened[1].content, 'Birds sing at five.');
  });
});
