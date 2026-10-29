import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lorebookPublishPreview,
  lorebookPublishMarkdown,
  coordinateLorebookPublication,
  type PublicationRequest,
  type PublicationPreview,
  type PublishMarkdownRequest,
  type PublishMarkdownResult,
  type TocItem,
} from '../src/services/publication';
import { api } from '../src/services/api';
import { CommandQueue } from '../src/services/autosave';

test('Publication System - L3a Frontend Contract & Architecture Tests', async (t) => {
  await t.test('1. Type validation and default request construction', () => {
    const request: PublicationRequest = {
      universe_id: 'uni-solaris',
      title: 'Solaris Almanac',
      subtitle: 'A Guide to the Golden Realm',
      author: 'Chronicler Elian',
      include_universe_description: true,
      include_table_of_contents: true,
      selected_categories: ['characters', 'locations', 'factions'],
      selected_entity_ids: ['char-1', 'char-2'],
      include_entity_prose: true,
      included_attribute_keys: ['Role', 'Affiliation'],
      include_factions: true,
      include_faction_hierarchy: true,
      include_faction_holders: true,
      include_relationships: true,
      relationship_types: ['Ally', 'Rival'],
      include_timeline: true,
      selected_milestone_ids: ['m-1'],
      include_alternate_continuities: false,
      selected_excerpts: [
        {
          chapter_id: 'ch-1',
          heading: 'Prologue Excerpt',
          excerpt_text: 'The sky turned to ember as the armada approached.',
        },
      ],
      filter_spoilers_after_milestone_id: 'm-1',
      include_drafts: false,
      include_speculative: false,
      include_archived: false,
    };

    assert.equal(request.universe_id, 'uni-solaris');
    assert.equal(request.include_drafts, false);
    assert.equal(request.include_archived, false);
    assert.equal(request.selected_excerpts?.length, 1);
  });

  await t.test('2. TOC hierarchy and anchor consistency model', () => {
    const toc: TocItem[] = [
      {
        title: 'Characters',
        anchor: 'characters',
        level: 2,
        children: [
          { title: 'Astraea', anchor: 'astraea', level: 3, children: [] },
          { title: 'Astraea (Duplicate)', anchor: 'astraea-1', level: 3, children: [] },
        ],
      },
      {
        title: 'Relationships',
        anchor: 'relationships',
        level: 2,
        children: [],
      },
      {
        title: 'Historical Timeline',
        anchor: 'historical-timeline',
        level: 2,
        children: [
          { title: 'The Founding', anchor: 'the-founding', level: 3, children: [] },
        ],
      },
    ];

    assert.equal(toc.length, 3);
    assert.equal(toc[0].children?.length, 2);
    assert.equal(toc[0].children?.[0].anchor, 'astraea');
    assert.equal(toc[0].children?.[1].anchor, 'astraea-1');
  });

  await t.test('3. Browser mock mode safely rejects desktop-only publication calls', async () => {
    const request: PublicationRequest = {
      universe_id: 'uni-1',
    };

    await assert.rejects(
      async () => {
        await api.lorebookPublishPreview(request);
      },
      {
        name: 'Error',
        message: /Lorebook publication requires the desktop app/,
      }
    );

    const publishReq: PublishMarkdownRequest = {
      request,
      destination_path: 'C:/temp/encyclopedia.md',
      expected_source_fingerprint: 'mock-hash-1234',
    };

    await assert.rejects(
      async () => {
        await api.lorebookPublishMarkdown(publishReq);
      },
      {
        name: 'Error',
        message: /Lorebook publication requires the desktop app/,
      }
    );
  });

  await t.test('4. coordinateLorebookPublication flushes pending saves before publishing', async () => {
    const commandQueue = new CommandQueue();
    let flushed = false;
    let published = false;

    const flushSave = async () => {
      flushed = true;
      return true;
    };

    const publishAction = async () => {
      assert.equal(flushed, true, 'flushSave must be invoked before publishAction');
      published = true;
      return 'published_ok';
    };

    const res = await coordinateLorebookPublication(flushSave, commandQueue, publishAction);
    assert.equal(res, 'published_ok');
    assert.equal(flushed, true);
    assert.equal(published, true);
  });

  await t.test('5. coordinateLorebookPublication aborts if flushSave fails', async () => {
    const commandQueue = new CommandQueue();
    let publishAttempted = false;

    const failedFlushSave = async () => {
      return false; // Save failed!
    };

    const publishAction = async () => {
      publishAttempted = true;
      return 'should_not_run';
    };

    await assert.rejects(
      async () => {
        await coordinateLorebookPublication(failedFlushSave, commandQueue, publishAction);
      },
      {
        name: 'Error',
        message: /Publication did not start because pending changes could not be saved/,
      }
    );

    assert.equal(publishAttempted, false, 'publishAction must not execute if pending save fails');
  });

  await t.test('6. coordinateLorebookPublication serializes sequential publication requests', async () => {
    const commandQueue = new CommandQueue();
    const executionOrder: string[] = [];

    const flushSave = async () => true;

    const p1 = coordinateLorebookPublication(flushSave, commandQueue, async () => {
      await new Promise((r) => setTimeout(r, 20));
      executionOrder.push('first');
      return '1';
    });

    const p2 = coordinateLorebookPublication(flushSave, commandQueue, async () => {
      executionOrder.push('second');
      return '2';
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1, '1');
    assert.equal(r2, '2');
    assert.deepEqual(executionOrder, ['first', 'second']);
  });
});
