import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLorebookPdf,
  checkTextGlyphs,
  lorebookPublishPdf,
  coordinateLorebookPublication,
  type PublicationDocument,
  type PublishPdfRequest,
  type PublishPdfResult,
} from '../src/services/publication';
import { api } from '../src/services/api';
import { CommandQueue } from '../src/services/autosave';

test('Lorebook PDF Publication - L3b Frontend Contract & Generator Tests', async (t) => {
  const sampleDoc: PublicationDocument = {
    title: 'Solaris Almanac',
    subtitle: 'A Guide to the Golden Realm',
    author: 'Chronicler Elian',
    universe_name: 'Solaris',
    universe_description: 'A world bathed in perpetual daylight from twin binary stars.',
    table_of_contents: [
      {
        title: 'Characters',
        anchor: 'characters',
        level: 2,
        children: [
          { title: 'Sol Invictus', anchor: 'sol-invictus', level: 3, children: [] },
          { title: 'Zephyr Windcaller', anchor: 'zephyr-windcaller', level: 3, children: [] },
        ],
      },
      {
        title: 'Factions',
        anchor: 'factions',
        level: 2,
        children: [
          { title: 'Dawn Guard', anchor: 'dawn-guard', level: 3, children: [] },
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
        children: [],
      },
      {
        title: 'Alternate Continuities',
        anchor: 'alternate-continuities',
        level: 2,
        children: [],
      },
      {
        title: 'Excerpts',
        anchor: 'excerpts',
        level: 2,
        children: [],
      },
    ],
    sections: [
      {
        category: 'characters',
        title: 'Characters',
        anchor: 'characters',
        entries: [
          {
            title: 'Sol Invictus',
            anchor: 'sol-invictus',
            category: 'characters',
            fields: [
              { label: 'Role', value: 'High Priest of the Sun' },
              { label: 'Species', value: 'Solar Elemental' },
            ],
            prose: 'The venerable high priest who communes with the twin celestial spheres.',
          },
          {
            title: 'Zephyr Windcaller',
            anchor: 'zephyr-windcaller',
            category: 'characters',
            fields: [
              { label: 'Role', value: 'Captain of the Skyfleet' },
            ],
            prose: 'Navigates the turbulent thermal updrafts of the solar plains.',
          },
        ],
      },
      {
        category: 'factions',
        title: 'Factions',
        anchor: 'factions',
        entries: [
          {
            title: 'Dawn Guard',
            anchor: 'dawn-guard',
            category: 'factions',
            fields: [
              { label: 'Ideology', value: 'Preservation of Light' },
              { label: 'Territory', value: 'Eastern Citadel' },
            ],
            prose: 'An ancient chivalric order sworn to protect the dawn gates.',
            hierarchy: {
              node_type: 'branch',
              title: 'First Division',
              description: 'The vanguard vanguard of dawn.',
              holders: [],
              children: [
                {
                  node_type: 'position',
                  title: 'Grand Commander',
                  description: 'Supreme field officer.',
                  holders: [
                    { title: 'Sol Invictus', anchor: 'sol-invictus' },
                  ],
                  children: [],
                },
              ],
            },
          },
        ],
      },
    ],
    relationships: [
      {
        source_title: 'Sol Invictus',
        source_anchor: 'sol-invictus',
        target_title: 'Zephyr Windcaller',
        target_anchor: 'zephyr-windcaller',
        label: 'Trusted Advisor',
        description: 'Have consulted together on celestial weather for decades.',
        directed: false,
      },
    ],
    timeline: {
      title: 'Historical Timeline',
      anchor: 'historical-timeline',
      milestones: [
        {
          title: 'The Great Solar Flare',
          anchor: 'the-great-solar-flare',
          era: 'Year 142 of the Radiant Cycle',
          description: 'A sudden burst of radiant energy reshaped the magnetic spires.',
          changes: [
            {
              entity_title: 'Sol Invictus',
              entity_anchor: 'sol-invictus',
              property_key: 'Role',
              previous_value: 'Acolyte',
              new_value: 'High Priest of the Sun',
            },
          ],
        },
      ],
    },
    alternate_continuities: [
      {
        name: 'The Eclipse Divergence',
        anchor: 'the-eclipse-divergence',
        description: 'An alternate timeline where the twin suns were eclipsed.',
        divergence_milestone: {
          title: 'The Great Solar Flare',
          era: 'Radiant Cycle 142',
          anchor: 'the-great-solar-flare',
        },
        milestones: [
          {
            title: 'Nightfall on Solaris',
            anchor: 'nightfall-on-solaris',
            era: 'Year 143',
            description: 'Darkness blankets the realm for the first time.',
          },
        ],
      },
    ],
    excerpts: [
      {
        heading: 'Opening Passage of Book 1',
        anchor: 'opening-passage-of-book-1',
        chapter_title: 'The First Dawn',
        book_name: 'Book of the Twin Suns',
        excerpt_text: 'When the horizon caught fire, we knew the long slumber had ended.',
      },
    ],
  };

  await t.test('1. Structured document produces valid PDF with headers and footers', () => {
    const result = generateLorebookPdf(sampleDoc, {
      pageSize: 'a4',
      includeToc: true,
      fontFamily: 'times',
    });

    assert.ok(result.pdfBytes.length > 0, 'PDF bytes should be non-empty');
    assert.ok(result.pageCount >= 2, 'Encyclopedia should span multiple pages');

    // Verify PDF header magic bytes (%PDF-1.x)
    const header = String.fromCharCode(...result.pdfBytes.slice(0, 5));
    assert.equal(header, '%PDF-', 'PDF file must start with %PDF-');
  });

  await t.test('2. Text glyph pre-scanning generates explicit diagnostics for unsupported characters', () => {
    // Normal ASCII / typography
    const asciiReport = checkTextGlyphs('Standard English text with "quotes", em—dash, and bullet •');
    assert.equal(asciiReport.warnings.length, 0, 'Standard typography should produce no warnings');
    assert.equal(asciiReport.isSupported, true);

    // CJK characters
    const cjkText = 'Solar Deity (太陽の神) reigns over the East.';
    const cjkReport = checkTextGlyphs(cjkText);
    assert.ok(cjkReport.warnings.length > 0, 'CJK characters must produce unsupported glyph warnings');
    assert.equal(cjkReport.warnings[0].code, 'unsupported_glyphs');
    assert.ok(cjkReport.warnings[0].message.includes('CJK and non-Latin scripts require an author-configured Unicode font'));
    assert.ok(cjkReport.unsupportedChars.includes('太'));

    // Emoji characters
    const emojiText = 'A glowing star ✨ appeared.';
    const emojiReport = checkTextGlyphs(emojiText);
    assert.ok(emojiReport.warnings.length > 0, 'Emoji glyphs must produce unsupported glyph warnings');
    assert.equal(emojiReport.warnings[0].code, 'unsupported_glyphs');
  });

  await t.test('3. Generates PDF without crashing on long titles, descriptions, and unicode glyphs', () => {
    const stressDoc: PublicationDocument = {
      title: 'A Very Long Title That Extends Far Beyond A Single Standard Margin Width And Should Wrap Cleanly Across Multiple Lines Without Any Clipping',
      subtitle: 'Secondary subtitle that also contains considerable verbiage meant to exercise line breaking calculations in the rendering engine',
      author: 'Author With An Exceptionally Long Name And Honorifics',
      universe_name: 'Extended Realm',
      universe_description: 'Paragraph of description '.repeat(20),
      table_of_contents: [],
      sections: [
        {
          category: 'characters',
          title: 'Characters with Foreign Names: 太陽の神 and Lumina',
          anchor: 'chars',
          entries: [
            {
              title: 'Long Entry Title '.repeat(5),
              anchor: 'long-entry',
              category: 'characters',
              fields: [
                { label: 'Long Field Label '.repeat(3), value: 'Long Field Value '.repeat(4) },
              ],
              prose: 'Detailed encyclopedic prose passage '.repeat(30),
            },
          ],
        },
      ],
      relationships: [],
      alternate_continuities: [],
      excerpts: [],
    };

    const res = generateLorebookPdf(stressDoc, { pageSize: 'letter', includeToc: false });
    assert.ok(res.pageCount >= 1);
    assert.ok(res.pdfBytes.length > 0);
    // Explicit glyph diagnostics should have been reported for the CJK text
    assert.ok(res.diagnostics.some((w) => w.code === 'unsupported_glyphs'));
  });

  await t.test('4. Desktop requirement check: lorebook_publish_pdf throws in browser preview mode', async () => {
    const req: PublishPdfRequest = {
      request: {
        universe_id: 'uni-solaris',
      },
      destination_path: 'C:/exports/codex.pdf',
      expected_source_fingerprint: 'test-fingerprint',
    };

    await assert.rejects(
      async () => {
        await api.lorebookPublishPdf(req);
      },
      {
        message: 'Lorebook publication requires the desktop app. Browser preview has no durable library.',
      }
    );
  });

  await t.test('5. Coordinated save flush: coordinates publication with autosave and flushes safely', async () => {
    const queue = new CommandQueue();
    let flushCalled = false;
    let publishActionCalled = false;

    const flushSaveSuccess = async () => {
      flushCalled = true;
      return true;
    };

    const result = await coordinateLorebookPublication(
      flushSaveSuccess,
      queue,
      async () => {
        publishActionCalled = true;
        return { success: true };
      }
    );

    assert.equal(flushCalled, true);
    assert.equal(publishActionCalled, true);
    assert.deepEqual(result, { success: true });

    // When flush fails, publication must abort immediately
    const flushSaveFailure = async () => false;
    await assert.rejects(
      async () => {
        await coordinateLorebookPublication(
          flushSaveFailure,
          queue,
          async () => 'should not run'
        );
      },
      {
        message: 'Publication did not start because pending changes could not be saved.',
      }
    );
  });
});
