import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  convertDocumentToEchoEntity,
  buildScopedEchoEntities,
} from '../src/utils/echoLore';
import {
  renderInlineFormatting,
  renderMarkdownBlocks,
} from '../src/components/echo/EchoDocumentationPopup';
import type { DocumentMetadata, DocumentDetail } from '../src/types';
import type { Plan } from '../src/utils/thought';

test('Issue A: CodeMirror Soft Line Wrapping Verification', async (t) => {
  await t.test('EditorState accepts EditorView.lineWrapping without modifying document text', () => {
    // Generate continuous paragraph over 2,500 characters without newlines
    const continuousText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50);
    assert.ok(continuousText.length > 2500, `Expected > 2500 chars, got ${continuousText.length}`);
    assert.strictEqual(continuousText.includes('\n'), false, 'Should have no newlines');

    const state = EditorState.create({
      doc: continuousText,
      extensions: [EditorView.lineWrapping],
    });

    // Verify document invariants
    assert.strictEqual(state.doc.toString(), continuousText, 'Document content must match byte-for-byte');
    assert.strictEqual(state.doc.length, continuousText.length, 'Document length must match exactly');
    assert.strictEqual(state.doc.lines, 1, 'Document must have exactly 1 logical line');
    assert.strictEqual(state.doc.line(1).text, continuousText, 'Single line must contain entire text');
  });

  await t.test('Document edits under lineWrapping preserve strict content integrity without synthetic tokens', () => {
    const initialText = 'A'.repeat(3000);
    let state = EditorState.create({
      doc: initialText,
      extensions: [EditorView.lineWrapping],
    });

    // Insert text in the middle
    const tr = state.update({
      changes: { from: 1500, insert: ' [INSERTED NOVEL SCENE] ' },
    });
    state = tr.state;

    assert.strictEqual(state.doc.lines, 1, 'Must still be 1 logical line');
    assert.strictEqual(state.doc.length, 3000 + ' [INSERTED NOVEL SCENE] '.length);
    assert.ok(state.doc.toString().includes(' [INSERTED NOVEL SCENE] '));
    assert.strictEqual(state.doc.toString().indexOf('\n'), -1, 'No synthetic newline tokens injected');
  });
});

test('Issue B: Echo Dossier Overview & Canonical Prose Architecture', async (t) => {
  const UNIVERSE_ID = 'univ-altair-1';
  const HOUSE_ID = 'house-altair-root';

  const MOCK_PLAN: Plan = {
    version: 1,
    universes: [{ id: UNIVERSE_ID, name: 'Altair Sector', description: 'Deep space setting' }],
    books: [],
    characters: [],
    concepts: [],
    relationships: [],
  };

  await t.test('convertDocumentToEchoEntity reads canonical Markdown prose when provided', () => {
    const docMeta: DocumentMetadata = {
      id: 'doc-char-althea',
      title: 'Lady Althea',
      doc_type: 'lorebook',
      house_id: HOUSE_ID,
      created_at: 1000,
      updated_at: 2000,
      tags: ['noble', 'sorceress'],
      metadata_json: JSON.stringify({
        entry_type: 'character',
        summary: 'Archmage of the Silver Citadel',
        universe_id: UNIVERSE_ID,
        character_fields: {
          aliases: ['Althea', 'The Silver Lady'],
        },
      }),
    };

    const canonicalMarkdownProse = `# Archmage Althea

Lady Althea was born into the high aristocracy of the Silver Citadel.
She discovered her affinity for celestial resonance at the age of seven.

> "Knowledge is not light; knowledge is the lens that focuses it."

Key contributions:
- Restored the Astral Spire
- Brokered the Accord of the Three Moons`;

    // 1. When canonical content is provided
    const entityWithProse = convertDocumentToEchoEntity(docMeta, [], MOCK_PLAN, undefined, canonicalMarkdownProse);
    assert.strictEqual(entityWithProse.id, 'doc-char-althea');
    assert.strictEqual(entityWithProse.name, 'Lady Althea');
    assert.strictEqual(entityWithProse.description, canonicalMarkdownProse.trim());
    assert.strictEqual(entityWithProse.universeId, UNIVERSE_ID);
    assert.deepStrictEqual(entityWithProse.aliases, ['Althea', 'The Silver Lady']);

    // 2. When canonical content is empty string
    const entityWithoutProse = convertDocumentToEchoEntity(docMeta, [], MOCK_PLAN, undefined, '');
    assert.strictEqual(entityWithoutProse.description, '', 'Empty prose should remain empty, not set to title');

    // 3. When canonical content is whitespace only
    const entityWhitespace = convertDocumentToEchoEntity(docMeta, [], MOCK_PLAN, undefined, '   \n  \t  ');
    assert.strictEqual(entityWhitespace.description, '', 'Whitespace-only prose should trim to empty');
  });

  await t.test('convertDocumentToEchoEntity works seamlessly with DocumentDetail objects', () => {
    const docDetail: DocumentDetail = {
      metadata: {
        id: 'doc-fac-silver-order',
        title: 'Silver Order',
        doc_type: 'lorebook',
        house_id: HOUSE_ID,
        created_at: 1000,
        updated_at: 2000,
        metadata_json: JSON.stringify({
          entry_type: 'faction',
          summary: 'Ancient martial and diplomatic order',
          universe_id: UNIVERSE_ID,
        }),
      },
      content: 'The Silver Order guards the northern marches with unyielding vigilance.',
      relationships: [],
    };

    // Passing DocumentDetail without secondary argument extracts detail.content
    const entity = convertDocumentToEchoEntity(docDetail, [], MOCK_PLAN);
    assert.strictEqual(entity.id, 'doc-fac-silver-order');
    assert.strictEqual(entity.name, 'Silver Order');
    assert.strictEqual(entity.description, 'The Silver Order guards the northern marches with unyielding vigilance.');
    assert.strictEqual(entity.universeId, UNIVERSE_ID);
  });

  await t.test('buildScopedEchoEntities preserves canonical document content across entities', () => {
    const docs: (DocumentMetadata | DocumentDetail)[] = [
      {
        id: 'char-1',
        title: 'Commander Vance',
        doc_type: 'lorebook',
        house_id: HOUSE_ID,
        created_at: 1000,
        updated_at: 2000,
        metadata_json: JSON.stringify({
          entry_type: 'character',
          summary: 'Fleet Commander',
          universe_id: UNIVERSE_ID,
        }),
      },
      {
        metadata: {
          id: 'loc-1',
          title: 'Astraea Station',
          doc_type: 'lorebook',
          house_id: HOUSE_ID,
          created_at: 1000,
          updated_at: 2000,
          metadata_json: JSON.stringify({
            entry_type: 'location',
            summary: 'Orbital shipyard',
            universe_id: UNIVERSE_ID,
          }),
        },
        content: 'Constructed in the 4th solar cycle, Astraea Station serves as the primary trade depot.',
        relationships: [],
      },
      // Entity in a different universe
      {
        id: 'char-other-univ',
        title: 'Foreign Agent',
        doc_type: 'lorebook',
        house_id: HOUSE_ID,
        created_at: 1000,
        updated_at: 2000,
        metadata_json: JSON.stringify({
          entry_type: 'character',
          universe_id: 'other-universe-999',
        }),
      },
    ];

    const scoped = buildScopedEchoEntities(docs, UNIVERSE_ID, MOCK_PLAN, HOUSE_ID);

    // Should include only the 2 entities belonging to UNIVERSE_ID
    assert.strictEqual(scoped.length, 2);

    const vance = scoped.find(e => e.id === 'char-1');
    assert.ok(vance);
    assert.strictEqual(vance.name, 'Commander Vance');
    assert.strictEqual(vance.description, ''); // No prose provided for char-1

    const astraea = scoped.find(e => e.id === 'loc-1');
    assert.ok(astraea);
    assert.strictEqual(astraea.name, 'Astraea Station');
    assert.strictEqual(astraea.description, 'Constructed in the 4th solar cycle, Astraea Station serves as the primary trade depot.');
  });

  await t.test('Safe Markdown rendering parses markdown syntax without raw HTML injection', () => {
    // 1. Test inline formatting: bold, italic, code
    const formatted = renderInlineFormatting('Hello **bold text** and *italic text* with `code block`');
    assert.ok(Array.isArray(formatted), 'Should return an array of tokens');
    const nodes = formatted as React.ReactElement[];
    assert.strictEqual(nodes[0], 'Hello ');
    assert.strictEqual(nodes[1].type, 'strong');
    assert.strictEqual(nodes[1].props.children, 'bold text');
    assert.strictEqual(nodes[2], ' and ');
    assert.strictEqual(nodes[3].type, 'em');
    assert.strictEqual(nodes[3].props.children, 'italic text');
    assert.strictEqual(nodes[4], ' with ');
    assert.strictEqual(nodes[5].type, 'code');
    assert.strictEqual(nodes[5].props.children, 'code block');

    // 2. Test XSS prevention: raw HTML strings are not interpreted as DOM elements
    const unsafeText = '<script>alert("xss")</script><img src="x" onerror="evil()" />';
    const safeResult = renderInlineFormatting(unsafeText);
    const textContent = Array.isArray(safeResult) ? safeResult[0] : safeResult;
    assert.strictEqual(textContent, unsafeText, 'Raw HTML should remain literal text string, never rendered dangerously');

    // 3. Test block structure parsing
    const markdownDocument = `# Heading 1
Some narrative description.

## Heading 2
> A philosophical quote.

- Item A
- Item B

---json
{"ignored": true}
---`;

    const blocks = renderMarkdownBlocks(markdownDocument);
    assert.ok(Array.isArray(blocks));
    // Check that frontmatter at start is stripped if present
    const docWithFrontmatter = `---json
{"secret": "hidden"}
---
# Actual Story
Real content here.`;
    const cleanedBlocks = renderMarkdownBlocks(docWithFrontmatter);
    assert.ok(Array.isArray(cleanedBlocks));
    const h3 = (cleanedBlocks as React.ReactElement[])[0];
    assert.strictEqual(h3.type, 'h3'); // Heading 1 maps to h3 element
  });
});
