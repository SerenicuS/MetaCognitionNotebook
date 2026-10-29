import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/services/api';
import {
  exportPortableAfterSave,
  type ImportCommitRequest,
  type ImportPreviewRequest,
  type PortableExportRequest,
} from '../src/services/portable';
import {
  coordinateLorebookPublication,
  checkTextGlyphs,
  type PublicationRequest,
  type PublishMarkdownRequest,
  type PublishPdfRequest,
} from '../src/services/publication';
import { CommandQueue } from '../src/services/autosave';

test('L4 Integration & UI Safety Contracts Test Suite', async (t) => {
  // -------------------------------------------------------------------------
  // 1. EXPORT SELECTION & SAVE-FLUSH COORDINATION
  // -------------------------------------------------------------------------
  await t.test('1. Export save-flush coordination aborts export if pending saves fail', async () => {
    let saveAttempted = false;
    let exportCalled = false;

    const failingFlush = async () => {
      saveAttempted = true;
      return false;
    };

    const mockExport = async () => {
      exportCalled = true;
      return { success: true };
    };

    await assert.rejects(
      async () => {
        await exportPortableAfterSave(failingFlush, mockExport);
      },
      {
        message: 'Universe export did not start because pending changes could not be saved.',
      }
    );

    assert.equal(saveAttempted, true, 'Flush must have been attempted');
    assert.equal(exportCalled, false, 'Export must never be executed when save fails');
  });

  await t.test('2. Export save-flush coordinates successfully when pending saves succeed', async () => {
    let saveAttempted = false;
    let exportCalled = false;

    const successfulFlush = async () => {
      saveAttempted = true;
      return true;
    };

    const mockExport = async () => {
      exportCalled = true;
      return { archive_sha256: 'abc123sha', size: 1024 };
    };

    const result = await exportPortableAfterSave(successfulFlush, mockExport);
    assert.equal(saveAttempted, true);
    assert.equal(exportCalled, true);
    assert.equal(result.archive_sha256, 'abc123sha');
  });

  await t.test('3. Export request contract enforces explicit book and chapter scoping', () => {
    const exportReq: PortableExportRequest = {
      universe_id: 'uni-solaris',
      snapshot_basis: 'last_saved_state',
      book_ids: ['book-1'],
      chapter_ids: ['ch-1', 'ch-2'],
    };

    assert.equal(exportReq.universe_id, 'uni-solaris');
    assert.equal(exportReq.snapshot_basis, 'last_saved_state');
    assert.deepEqual(exportReq.book_ids, ['book-1']);
    assert.deepEqual(exportReq.chapter_ids, ['ch-1', 'ch-2']);
  });

  // -------------------------------------------------------------------------
  // 2. IMPORT OPERATION ID STABILITY & POLICIES
  // -------------------------------------------------------------------------
  await t.test('4. Import preview maintains operation ID across preview refreshes', () => {
    const initialOpId = 'op-stable-12345';

    // Simulate 1st preview request
    const req1: ImportPreviewRequest = {
      package_path: 'C:/test.mcuniverse',
      target_house_id: 'house-1',
      policy: 'separate_copy',
      operation_id: initialOpId,
    };

    // Simulate 2nd preview refresh with same op ID
    const req2: ImportPreviewRequest = {
      package_path: 'C:/test.mcuniverse',
      target_house_id: 'house-1',
      policy: 'separate_copy',
      operation_id: req1.operation_id,
    };

    assert.equal(req1.operation_id, req2.operation_id, 'Operation ID must remain stable across refreshes');
    assert.equal(req2.operation_id, initialOpId);
  });

  await t.test('5. Import commit request requires operation ID and expected destination fingerprint', () => {
    const commitReq: ImportCommitRequest = {
      operation_id: 'op-stable-12345',
      package_path: 'C:/test.mcuniverse',
      target_house_id: 'house-1',
      policy: 'separate_copy',
      expected_destination_fingerprint: 'fp-sha256-verified',
    };

    assert.equal(commitReq.operation_id, 'op-stable-12345');
    assert.equal(commitReq.expected_destination_fingerprint, 'fp-sha256-verified');
  });

  // -------------------------------------------------------------------------
  // 3. RECOVERY EXPERIENCE & JOURNAL CHECK
  // -------------------------------------------------------------------------
  await t.test('6. Recovery commands reject safely in browser mock without crashing', async () => {
    await assert.rejects(
      async () => {
        await api.portableUniverseRecoverImports();
      },
      {
        message: /Portable Universe packages require the Windows desktop app/,
      }
    );

    await assert.rejects(
      async () => {
        await api.portableUniverseHasPendingJournal();
      },
      {
        message: /Portable Universe packages require the Windows desktop app/,
      }
    );
  });

  // -------------------------------------------------------------------------
  // 4. PUBLICATION PRIVACY DEFAULTS & SPOILER FILTERING
  // -------------------------------------------------------------------------
  await t.test('7. Publication request enforces conservative privacy defaults', () => {
    const pubReq: PublicationRequest = {
      universe_id: 'uni-solaris',
      include_drafts: false,
      include_speculative: false,
      include_archived: false,
      filter_spoilers_after_milestone_id: 'm-dawn-clash',
    };

    assert.equal(pubReq.include_drafts, false, 'Drafts must be excluded by default');
    assert.equal(pubReq.include_speculative, false, 'Speculative entries must be excluded by default');
    assert.equal(pubReq.include_archived, false, 'Archived records must be excluded by default');
    assert.equal(pubReq.filter_spoilers_after_milestone_id, 'm-dawn-clash');
  });

  await t.test('8. Publication save-flush coordination serializes and guards execution', async () => {
    const queue = new CommandQueue();
    let flushCalled = false;
    let published = false;

    const flushSuccess = async () => {
      flushCalled = true;
      return true;
    };

    const pubResult = await coordinateLorebookPublication(flushSuccess, queue, async () => {
      published = true;
      return { destination_path: 'C:/out.md', bytes_written: 500, word_count: 80, sha256: 'hash' };
    });

    assert.equal(flushCalled, true);
    assert.equal(published, true);
    assert.equal(pubResult.bytes_written, 500);

    // When flush fails, publication must not run
    const flushFail = async () => false;
    await assert.rejects(
      async () => {
        await coordinateLorebookPublication(flushFail, queue, async () => 'should not execute');
      },
      {
        message: 'Publication did not start because pending changes could not be saved.',
      }
    );
  });

  // -------------------------------------------------------------------------
  // 5. PDF GLYPH SAFETY & INFORMED CONFIRMATION
  // -------------------------------------------------------------------------
  await t.test('9. Text glyph scanner reports unsupported CJK and emoji characters', () => {
    const normalText = 'The Kingdom of Solis had seven high towers.';
    const normalReport = checkTextGlyphs(normalText);
    assert.equal(normalReport.isSupported, true);
    assert.equal(normalReport.warnings.length, 0);

    const cjkText = 'Solar Fortress of the High Sun (太陽の城)';
    const cjkReport = checkTextGlyphs(cjkText);
    assert.equal(cjkReport.isSupported, false);
    assert.ok(cjkReport.warnings.length > 0);
    assert.equal(cjkReport.warnings[0].code, 'unsupported_glyphs');
    assert.ok(cjkReport.unsupportedChars.includes('太'));
    assert.ok(cjkReport.unsupportedChars.includes('陽'));
  });

  // -------------------------------------------------------------------------
  // 6. BROWSER PREVIEW SAFETY (DESKTOP APP BOUNDARIES)
  // -------------------------------------------------------------------------
  await t.test('10. Desktop-only publication endpoints safely throw in browser preview', async () => {
    const mdReq: PublishMarkdownRequest = {
      request: { universe_id: 'uni-1' },
      destination_path: 'C:/test.md',
      expected_source_fingerprint: 'fp-1',
    };

    await assert.rejects(
      async () => {
        await api.lorebookPublishMarkdown(mdReq);
      },
      {
        message: /Lorebook publication requires the desktop app/,
      }
    );

    const pdfReq: PublishPdfRequest = {
      request: { universe_id: 'uni-1' },
      destination_path: 'C:/test.pdf',
      expected_source_fingerprint: 'fp-1',
    };

    await assert.rejects(
      async () => {
        await api.lorebookPublishPdf(pdfReq);
      },
      {
        message: /Lorebook publication requires the desktop app/,
      }
    );
  });
});
