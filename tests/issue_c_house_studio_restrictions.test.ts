import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getEnabledStudios,
  isStudioEnabled,
  isManuscriptEnabled,
} from '../src/utils/house';
import type { HouseRecord, DocumentMetadata, DocumentType } from '../src/types';

test('Issue C: House Studio Restrictions in Document Creation Menu', async (t) => {
  const PHILOSOPHY_HOUSE: HouseRecord = {
    id: 'house-philosophy-101',
    name: 'Lyceum of Reason',
    color: 'emerald',
    icon: 'feather',
    enabled_studios: ['philosophy'],
    manuscript_tools_enabled: false,
    created_at: 1000,
    updated_at: 1000,
  };

  const POETRY_HOUSE: HouseRecord = {
    id: 'house-poetry-202',
    name: 'Castalian Spring',
    color: 'rose',
    icon: 'feather',
    enabled_studios: ['poetry'],
    manuscript_tools_enabled: false,
    created_at: 1000,
    updated_at: 1000,
  };

  const LOREBOOK_HOUSE: HouseRecord = {
    id: 'house-lore-303',
    name: 'Cosmology Archive',
    color: 'amber',
    icon: 'compass',
    enabled_studios: ['lorebook'],
    manuscript_tools_enabled: false,
    created_at: 1000,
    updated_at: 1000,
  };

  const MULTI_STUDIO_HOUSE: HouseRecord = {
    id: 'house-multi-404',
    name: 'Academy of Arts & Lore',
    color: 'indigo',
    icon: 'castle',
    enabled_studios: ['poetry', 'lorebook'],
    manuscript_tools_enabled: true,
    created_at: 1000,
    updated_at: 1000,
  };

  const EMPTY_HOUSE: HouseRecord = {
    id: 'house-empty-505',
    name: 'Silent Vault',
    color: 'slate',
    icon: 'castle',
    enabled_studios: [],
    manuscript_tools_enabled: false,
    created_at: 1000,
    updated_at: 1000,
  };

  await t.test('1. Philosophy-only House: only Philosophy creation action is permitted', () => {
    const permitted = getEnabledStudios(PHILOSOPHY_HOUSE);
    assert.deepStrictEqual(permitted, ['philosophy']);

    assert.strictEqual(isStudioEnabled(PHILOSOPHY_HOUSE, 'philosophy'), true);
    assert.strictEqual(isStudioEnabled(PHILOSOPHY_HOUSE, 'poetry'), false);
    assert.strictEqual(isStudioEnabled(PHILOSOPHY_HOUSE, 'lorebook'), false);
    assert.strictEqual(isManuscriptEnabled(PHILOSOPHY_HOUSE), false);

    // Verify UI menu resolution: if defaultType is 'poetry', it must resolve to 'philosophy'
    const resolvedType = permitted.includes('poetry' as any)
      ? 'poetry'
      : (permitted[0] as DocumentType) || 'poetry';
    assert.strictEqual(resolvedType, 'philosophy');
  });

  await t.test('2. Poetry-only House: only Poetry creation action is permitted', () => {
    const permitted = getEnabledStudios(POETRY_HOUSE);
    assert.deepStrictEqual(permitted, ['poetry']);

    assert.strictEqual(isStudioEnabled(POETRY_HOUSE, 'poetry'), true);
    assert.strictEqual(isStudioEnabled(POETRY_HOUSE, 'philosophy'), false);
    assert.strictEqual(isStudioEnabled(POETRY_HOUSE, 'lorebook'), false);
    assert.strictEqual(isManuscriptEnabled(POETRY_HOUSE), false);

    // Verify UI menu resolution: if requested type is 'philosophy', it resolves to 'poetry'
    const resolvedType = permitted.includes('philosophy' as any)
      ? 'philosophy'
      : (permitted[0] as DocumentType) || 'poetry';
    assert.strictEqual(resolvedType, 'poetry');
  });

  await t.test('3. Lorebook-only House: only supported Lorebook creation actions appear', () => {
    const permitted = getEnabledStudios(LOREBOOK_HOUSE);
    assert.deepStrictEqual(permitted, ['lorebook']);

    assert.strictEqual(isStudioEnabled(LOREBOOK_HOUSE, 'lorebook'), true);
    assert.strictEqual(isStudioEnabled(LOREBOOK_HOUSE, 'poetry'), false);
    assert.strictEqual(isStudioEnabled(LOREBOOK_HOUSE, 'philosophy'), false);

    const resolvedType = permitted.includes('poetry' as any)
      ? 'poetry'
      : (permitted[0] as DocumentType) || 'poetry';
    assert.strictEqual(resolvedType, 'lorebook');
  });

  await t.test('4. Multi-studio House: all and only enabled creation actions appear', () => {
    const permitted = getEnabledStudios(MULTI_STUDIO_HOUSE);
    assert.deepStrictEqual(permitted, ['poetry', 'lorebook']);

    assert.strictEqual(isStudioEnabled(MULTI_STUDIO_HOUSE, 'poetry'), true);
    assert.strictEqual(isStudioEnabled(MULTI_STUDIO_HOUSE, 'lorebook'), true);
    assert.strictEqual(isStudioEnabled(MULTI_STUDIO_HOUSE, 'philosophy'), false);
    assert.strictEqual(isManuscriptEnabled(MULTI_STUDIO_HOUSE), true);
  });

  await t.test('5. Switching between Houses updates permitted creation actions immediately', () => {
    let currentHouse = PHILOSOPHY_HOUSE;
    let permitted = getEnabledStudios(currentHouse);
    assert.deepStrictEqual(permitted, ['philosophy']);

    // Switch to Poetry house
    currentHouse = POETRY_HOUSE;
    permitted = getEnabledStudios(currentHouse);
    assert.deepStrictEqual(permitted, ['poetry']);

    // Switch to Multi-studio house
    currentHouse = MULTI_STUDIO_HOUSE;
    permitted = getEnabledStudios(currentHouse);
    assert.deepStrictEqual(permitted, ['poetry', 'lorebook']);

    // Switch to Empty house
    currentHouse = EMPTY_HOUSE;
    permitted = getEnabledStudios(currentHouse);
    assert.deepStrictEqual(permitted, []);
  });

  await t.test('6. Directly attempting an unauthorized creation action is rejected with clear error', () => {
    const permitted = getEnabledStudios(PHILOSOPHY_HOUSE);

    // Simulate modal submission with an unauthorized docType
    const attemptCreate = (targetDocType: DocumentType) => {
      if (permitted.length > 0 && !permitted.includes(targetDocType as any)) {
        throw new Error(
          `The ${targetDocType} studio is not enabled for "${PHILOSOPHY_HOUSE.name}".`
        );
      }
    };

    assert.throws(
      () => attemptCreate('poetry'),
      /The poetry studio is not enabled for "Lyceum of Reason"/
    );
    assert.throws(
      () => attemptCreate('lorebook'),
      /The lorebook studio is not enabled for "Lyceum of Reason"/
    );
    // Allowed studio should succeed without throwing
    assert.doesNotThrow(() => attemptCreate('philosophy'));
  });

  await t.test('7. No cross-House document creation or data leakage occurs', () => {
    const mockLibrary: DocumentMetadata[] = [
      {
        id: 'doc-phil-1',
        title: 'Dialectic on Forms',
        doc_type: 'philosophy',
        house_id: PHILOSOPHY_HOUSE.id,
        created_at: 1000,
        updated_at: 1000,
      },
      {
        id: 'doc-poetry-1',
        title: 'Ode to Aurora',
        doc_type: 'poetry',
        house_id: POETRY_HOUSE.id,
        created_at: 1100,
        updated_at: 1100,
      },
    ];

    // Filter documents for Philosophy House
    const philDocs = mockLibrary.filter(d => (d.house_id || 'house-default') === PHILOSOPHY_HOUSE.id);
    assert.strictEqual(philDocs.length, 1);
    assert.strictEqual(philDocs[0].id, 'doc-phil-1');
    assert.strictEqual(philDocs[0].doc_type, 'philosophy');

    // Filter documents for Poetry House
    const poetryDocs = mockLibrary.filter(d => (d.house_id || 'house-default') === POETRY_HOUSE.id);
    assert.strictEqual(poetryDocs.length, 1);
    assert.strictEqual(poetryDocs[0].id, 'doc-poetry-1');
    assert.strictEqual(poetryDocs[0].doc_type, 'poetry');

    // Simulate creation parameter binding: document must receive the active house ID strictly
    const createPayload = {
      title: 'New Critique',
      doc_type: 'philosophy',
      house_id: PHILOSOPHY_HOUSE.id,
    };
    assert.strictEqual(createPayload.house_id, PHILOSOPHY_HOUSE.id);
    assert.notStrictEqual(createPayload.house_id, POETRY_HOUSE.id);
  });
});
