import type { EchoEntity } from './types';

export const MOCK_UNIVERSE_ID = 'univ-avalon-prime';
export const MOCK_UNIVERSE_NAME = 'Avalon';

export const MOCK_LORE_ENTITIES: EchoEntity[] = [
  {
    id: 'mock-laxus-1',
    name: 'Laxus',
    category: 'character',
    universe: MOCK_UNIVERSE_NAME,
    universeId: MOCK_UNIVERSE_ID,
    description: 'A former commander returning from exile after seven years in the Northern Wastes. Known for his tactical discipline and command of northern weather.',
    guidedAttributes: {
      Role: 'Exiled Commander',
      Allegiance: 'Northern Guard',
      Species: 'Human',
    },
    customAttributes: [
      { id: 'attr-1', key: 'Title', value: 'High Marshal of the Silver Pass' },
      { id: 'attr-2', key: 'Status', value: 'Pardoned' },
    ],
    relationships: [
      {
        targetId: 'mock-avalon-1',
        targetName: 'Avalon',
        relationType: 'Defended',
        targetCategory: 'location',
        description: 'Commanded the northern ramparts during the Great Siege.',
      },
      {
        targetId: 'mock-faction-1',
        targetName: 'Northern Guard',
        relationType: 'Leads',
        targetCategory: 'faction',
        description: 'Former supreme commander.',
      },
    ],
    status: 'active',
  },
  {
    id: 'mock-avalon-1',
    name: 'Avalon',
    category: 'location',
    universe: MOCK_UNIVERSE_NAME,
    universeId: MOCK_UNIVERSE_ID,
    description: 'Capital city and stronghold of the Northern Kingdom, surrounded by mist-shrouded lakes and white stone ramparts.',
    guidedAttributes: {
      Region: 'Crownlands',
      Sovereign: 'House of Pendragon',
      Defensibility: 'Impenetrable Fortress',
    },
    customAttributes: [
      { id: 'attr-3', key: 'Epoch', value: 'High Silver Age' },
      { id: 'attr-4', key: 'Primary Exports', value: 'Silvered Steel, Mist Glass' },
    ],
    relationships: [
      {
        targetId: 'mock-faction-1',
        targetName: 'Northern Guard',
        relationType: 'Garrisoned by',
        targetCategory: 'faction',
        description: 'The elite division tasked with inner palace defense.',
      },
    ],
    status: 'active',
  },
  {
    id: 'mock-laxus-2',
    name: 'Laxus',
    category: 'character',
    universe: MOCK_UNIVERSE_NAME,
    universeId: MOCK_UNIVERSE_ID,
    description: 'Laxus the Younger. An apprentice archivist in the Grand Library of Avalon and distant nephew of the former commander.',
    guidedAttributes: {
      Role: 'Apprentice Archivist',
      Allegiance: 'Grand Library',
      Species: 'Human',
    },
    customAttributes: [
      { id: 'attr-5', key: 'Specialization', value: 'Pre-Cataclysm Runes' },
    ],
    relationships: [
      {
        targetId: 'mock-avalon-1',
        targetName: 'Avalon',
        relationType: 'Resident of',
        targetCategory: 'location',
        description: 'Studies in the Upper Sanctum archives.',
      },
    ],
    status: 'active',
  },
  {
    id: 'mock-faction-1',
    name: 'Northern Guard',
    category: 'faction',
    universe: MOCK_UNIVERSE_NAME,
    universeId: MOCK_UNIVERSE_ID,
    description: 'An ancient martial order sworn to defend the northern mountain passes and the gates of Avalon.',
    guidedAttributes: {
      Leader: 'High Marshal',
      Headquarters: 'Bastion of the North',
    },
    customAttributes: [
      { id: 'attr-6', key: 'Founding Year', value: '312 Silver Era' },
    ],
    relationships: [
      {
        targetId: 'mock-avalon-1',
        targetName: 'Avalon',
        relationType: 'Protects',
        targetCategory: 'location',
        description: 'Sole sworn defenders of the northern gatehouse.',
      },
    ],
    status: 'active',
  },
  {
    id: 'mock-eowyn-1',
    name: 'Éowyn',
    category: 'character',
    universe: MOCK_UNIVERSE_NAME,
    universeId: MOCK_UNIVERSE_ID,
    description: 'Shieldmaiden of the Northern Valleys and skilled scout for the outer patrols.',
    guidedAttributes: {
      Role: 'Outrider Captain',
      Allegiance: 'Northern Guard',
    },
    customAttributes: [],
    relationships: [
      {
        targetId: 'mock-laxus-1',
        targetName: 'Laxus',
        relationType: 'Served under',
        targetCategory: 'character',
      },
    ],
    status: 'active',
  },
  {
    id: 'mock-archived-1',
    name: 'Lord Vane',
    category: 'character',
    universe: MOCK_UNIVERSE_NAME,
    universeId: MOCK_UNIVERSE_ID,
    description: 'A historical councilor whose records were sealed after the palace purge.',
    guidedAttributes: {
      Role: 'Former Chancellor',
    },
    customAttributes: [],
    relationships: [],
    status: 'archived',
  },
];

export function getMockUniverseEntities(universeId: string = MOCK_UNIVERSE_ID): EchoEntity[] {
  return MOCK_LORE_ENTITIES.filter((e) => e.universeId === universeId);
}

export function resolveMockEntityMatches(
  token: string,
  entities: EchoEntity[] = MOCK_LORE_ENTITIES
): EchoEntity[] {
  const clean = token.trim().toLowerCase();
  if (!clean) return [];
  return entities.filter((e) => e.name.toLowerCase() === clean);
}
