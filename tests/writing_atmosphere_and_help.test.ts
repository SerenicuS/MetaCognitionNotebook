import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATMOSPHERE_PREFERENCES_KEY,
  DEFAULT_ATMOSPHERE_PREFERENCES,
  STANDARD_CATEGORIES,
  filterTracksByCategory,
  formatDuration,
  getAudioMimeType,
  getAvailableCategories,
  getNextTrack,
  getPreviousTrack,
  loadAtmospherePreferences,
  saveAtmospherePreferences,
} from '../src/utils/atmosphere';
import type { AudioTrack, AtmospherePreferences } from '../src/types';
import { chapters, glossary, guides, searchGuides, selectGuide } from '../src/help/content';

// Mock audio tracks
const sampleTracks: AudioTrack[] = [
  {
    id: 'track-1',
    title: 'Rainy Night In Neo Tokyo',
    category: 'lofi',
    category_label: 'Lo-Fi',
    filename: '01 - Rainy Night In Neo Tokyo.mp3',
    relative_path: 'lofi/01 - Rainy Night In Neo Tokyo.mp3',
    format: 'mp3',
  },
  {
    id: 'track-2',
    title: 'Midnight Coffee Reverie',
    category: 'lofi',
    category_label: 'Lo-Fi',
    filename: '02_midnight_coffee_reverie.wav',
    relative_path: 'lofi/02_midnight_coffee_reverie.wav',
    format: 'wav',
  },
  {
    id: 'track-3',
    title: 'Castle Gate Sentry',
    category: 'medieval',
    category_label: 'Medieval',
    filename: '01 - Castle Gate Sentry.flac',
    relative_path: 'medieval/01 - Castle Gate Sentry.flac',
    format: 'flac',
  },
  {
    id: 'track-4',
    title: 'Orbital Station Echoes',
    category: 'scifi',
    category_label: 'Sci-Fi',
    filename: 'Orbital Station Echoes.ogg',
    relative_path: 'scifi/Orbital Station Echoes.ogg',
    format: 'ogg',
  },
  {
    id: 'track-5',
    title: 'Cyberpunk Alley Pulse',
    category: 'synthwave',
    category_label: 'Synthwave',
    filename: 'cyberpunk_alley.m4a',
    relative_path: 'synthwave/cyberpunk_alley.m4a',
    format: 'm4a',
  },
];

// Helper mock storage
function mockLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, val: string) => store.set(key, val),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

test('Writing Atmosphere: audio format MIME mapping covers all supported extensions', () => {
  assert.equal(getAudioMimeType('mp3'), 'audio/mpeg');
  assert.equal(getAudioMimeType('MP3'), 'audio/mpeg');
  assert.equal(getAudioMimeType('wav'), 'audio/wav');
  assert.equal(getAudioMimeType('ogg'), 'audio/ogg');
  assert.equal(getAudioMimeType('flac'), 'audio/flac');
  assert.equal(getAudioMimeType('m4a'), 'audio/mp4');
  assert.equal(getAudioMimeType('aac'), 'audio/aac');
  assert.equal(getAudioMimeType('unknown'), 'audio/mpeg');
});

test('Writing Atmosphere: track duration formatting', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(9), '0:09');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3600), '60:00');
  assert.equal(formatDuration(-10), '0:00');
  assert.equal(formatDuration(NaN), '0:00');
  assert.equal(formatDuration(Infinity), '0:00');
});

test('Writing Atmosphere: category filtering and category list resolution', () => {
  // 'all' returns all tracks
  const allTracks = filterTracksByCategory(sampleTracks, 'all');
  assert.equal(allTracks.length, 5);

  // Specific category
  const lofiTracks = filterTracksByCategory(sampleTracks, 'lofi');
  assert.equal(lofiTracks.length, 2);
  assert.ok(lofiTracks.every(t => t.category === 'lofi'));

  const medievalTracks = filterTracksByCategory(sampleTracks, 'medieval');
  assert.equal(medievalTracks.length, 1);
  assert.equal(medievalTracks[0].title, 'Castle Gate Sentry');

  // Case insensitive and trimmed
  const scifiTracks = filterTracksByCategory(sampleTracks, '  SCIFI ');
  assert.equal(scifiTracks.length, 1);

  // Dynamic category extraction
  const categories = getAvailableCategories(sampleTracks);
  assert.ok(categories.some(c => c.id === 'all'));
  assert.ok(categories.some(c => c.id === 'lofi'));
  assert.ok(categories.some(c => c.id === 'medieval'));
  assert.ok(categories.some(c => c.id === 'scifi'));
  // Custom category detected
  assert.ok(categories.some(c => c.id === 'synthwave'));
});

test('Writing Atmosphere: track progression in repeat modes', () => {
  // Mode: all
  const next1 = getNextTrack(sampleTracks, 'track-1', 'all');
  assert.equal(next1?.id, 'track-2');

  const nextWrap = getNextTrack(sampleTracks, 'track-5', 'all');
  assert.equal(nextWrap?.id, 'track-1');

  // Mode: one (repeats current track)
  const nextOne = getNextTrack(sampleTracks, 'track-2', 'one');
  assert.equal(nextOne?.id, 'track-2');

  // Mode: off (stops at end)
  const nextOffMiddle = getNextTrack(sampleTracks, 'track-4', 'off');
  assert.equal(nextOffMiddle?.id, 'track-5');

  const nextOffEnd = getNextTrack(sampleTracks, 'track-5', 'off');
  assert.equal(nextOffEnd, null);

  // Previous track logic
  const prevMiddle = getPreviousTrack(sampleTracks, 'track-3');
  assert.equal(prevMiddle?.id, 'track-2');

  const prevWrap = getPreviousTrack(sampleTracks, 'track-1');
  assert.equal(prevWrap?.id, 'track-5');

  // Edge cases
  assert.equal(getNextTrack([], null, 'all'), null);
  assert.equal(getPreviousTrack([], null), null);
  assert.equal(getNextTrack(sampleTracks, null, 'all')?.id, 'track-1');
  assert.equal(getPreviousTrack(sampleTracks, null)?.id, 'track-1');
});

test('Writing Atmosphere: preference persistence and sanitization', () => {
  const origWindow = globalThis.window;
  const storage = mockLocalStorage();
  (globalThis as any).window = { localStorage: storage };

  try {
    // Default preferences when empty
    const initial = loadAtmospherePreferences();
    assert.deepEqual(initial, DEFAULT_ATMOSPHERE_PREFERENCES);

    // Save and load valid preferences
    const custom: AtmospherePreferences = {
      volume: 0.75,
      repeat_mode: 'one',
      selected_category: 'medieval',
    };
    saveAtmospherePreferences(custom);
    const loaded = loadAtmospherePreferences();
    assert.deepEqual(loaded, custom);

    // Volume clamping (out of range values clamped between 0 and 1)
    saveAtmospherePreferences({
      volume: 1.5,
      repeat_mode: 'off',
      selected_category: 'lofi',
    });
    const clamped = loadAtmospherePreferences();
    assert.equal(clamped.volume, 1);

    // Corrupted JSON fallback
    storage.setItem(ATMOSPHERE_PREFERENCES_KEY, '{invalid json');
    const fallback = loadAtmospherePreferences();
    assert.deepEqual(fallback, DEFAULT_ATMOSPHERE_PREFERENCES);
  } finally {
    (globalThis as any).window = origWindow;
  }
});

test('In-App Help Refresh: Houses of Thoughts chapter and guidance exist', () => {
  const houseChapter = chapters.find(c => c.id === 'houses-of-thoughts');
  assert.ok(houseChapter, 'houses-of-thoughts chapter must exist');
  assert.equal(houseChapter.title, 'Houses of Thoughts');

  const houseGuide = selectGuide('houses-overview');
  assert.equal(houseGuide.id, 'houses-overview');
  assert.match(houseGuide.what, /top-level creative domains/i);
  assert.match(houseGuide.what, /studio/i);
  assert.match(houseGuide.steps.join(' '), /studios are enabled/i);
  assert.match(houseGuide.steps.join(' '), /Universes/i);
  assert.match(houseGuide.avoid, /canonical notebook vault/i);

  const searchResults = searchGuides('creative domains');
  assert.ok(searchResults.some(g => g.id === 'houses-overview'));
});

test('In-App Help Refresh: Echo Library chapter and live recognition guidance exist', () => {
  const echoChapter = chapters.find(c => c.id === 'echo-library');
  assert.ok(echoChapter, 'echo-library chapter must exist');
  assert.equal(echoChapter.title, 'Echo Library');

  const echoGuide = selectGuide('echo-overview');
  assert.equal(echoGuide.id, 'echo-overview');
  assert.match(echoGuide.what, /non-destructive contextual writing assistant/i);
  assert.match(echoGuide.what, /CodeMirror/i);
  assert.match(echoGuide.steps.join(' '), /Mod-e/i);
  assert.match(echoGuide.steps.join(' '), /dossier/i);
  assert.match(echoGuide.result, /never automatically modified/i);

  const searchResults = searchGuides('Mod-e');
  assert.ok(searchResults.some(g => g.id === 'echo-overview'));
});

test('In-App Help Refresh: Writing Atmosphere chapter and guidance exist', () => {
  const atmosphereChapter = chapters.find(c => c.id === 'writing-atmosphere');
  assert.ok(atmosphereChapter, 'writing-atmosphere chapter must exist');
  assert.equal(atmosphereChapter.title, 'Writing Atmosphere');
  assert.equal(atmosphereChapter.sections.length, 2, 'Must contain 2 sections: player and import');

  const playerGuide = selectGuide('atmosphere-player');
  assert.equal(playerGuide.id, 'atmosphere-player');
  assert.match(playerGuide.what, /local-first ambient/i);
  assert.match(playerGuide.steps.join(' '), /bottom-right/i);
  assert.match(playerGuide.steps.join(' '), /Play\/Pause/i);
  assert.match(playerGuide.steps.join(' '), /volume/i);
  assert.match(playerGuide.steps.join(' '), /Repeat All/i);
  assert.match(playerGuide.steps.join(' '), /uninterrupted/i);
  assert.match(playerGuide.result, /empty state/i);

  const importGuide = selectGuide('atmosphere-import');
  assert.equal(importGuide.id, 'atmosphere-import');
  assert.match(importGuide.what, /reads local audio files/i);
  assert.match(importGuide.prerequisites, /\.mp3, \.wav, \.ogg, \.flac, \.m4a, or \.aac/i);
  assert.match(importGuide.steps.join(' '), /Open Music Folder/i);
  assert.match(importGuide.steps.join(' '), /lofi\/.*medieval\/.*scifi\//i);
  assert.match(importGuide.steps.join(' '), /Rescan Music Folder/i);
  assert.match(importGuide.result, /separate from Markdown/i);

  const searchResults = searchGuides('FlowMusic');
  assert.ok(searchResults.some(g => g.id === 'atmosphere-import'));
});

test('Writing Atmosphere: verification of FlowMusic six prepared tracks in category subfolders', () => {
  const flowMusicTracks: AudioTrack[] = [
    {
      id: 'lofi/Midnight in the Notebook.mp3',
      title: 'Midnight in the Notebook',
      category: 'lofi',
      category_label: 'Lo-Fi',
      filename: 'Midnight in the Notebook.mp3',
      relative_path: 'lofi/Midnight in the Notebook.mp3',
      format: 'mp3',
    },
    {
      id: 'lofi/Thoughts Between Pages.mp3',
      title: 'Thoughts Between Pages',
      category: 'lofi',
      category_label: 'Lo-Fi',
      filename: 'Thoughts Between Pages.mp3',
      relative_path: 'lofi/Thoughts Between Pages.mp3',
      format: 'mp3',
    },
    {
      id: 'medieval/The Scholar\'s Candle.mp3',
      title: 'The Scholar\'s Candle',
      category: 'medieval',
      category_label: 'Medieval',
      filename: 'The Scholar\'s Candle.mp3',
      relative_path: 'medieval/The Scholar\'s Candle.mp3',
      format: 'mp3',
    },
    {
      id: 'medieval/Beneath the Ancient Stars.mp3',
      title: 'Beneath the Ancient Stars',
      category: 'medieval',
      category_label: 'Medieval',
      filename: 'Beneath the Ancient Stars.mp3',
      relative_path: 'medieval/Beneath the Ancient Stars.mp3',
      format: 'mp3',
    },
    {
      id: 'scifi/Beyond the Virgo Supercluster.mp3',
      title: 'Beyond the Virgo Supercluster',
      category: 'scifi',
      category_label: 'Sci-Fi',
      filename: 'Beyond the Virgo Supercluster.mp3',
      relative_path: 'scifi/Beyond the Virgo Supercluster.mp3',
      format: 'mp3',
    },
    {
      id: 'scifi/Humanity Among the Stars.mp3',
      title: 'Humanity Among the Stars',
      category: 'scifi',
      category_label: 'Sci-Fi',
      filename: 'Humanity Among the Stars.mp3',
      relative_path: 'scifi/Humanity Among the Stars.mp3',
      format: 'mp3',
    },
  ];

  // 1. Verify category filtering for the 6 tracks
  const lofi = filterTracksByCategory(flowMusicTracks, 'lofi');
  assert.equal(lofi.length, 2);
  assert.deepEqual(lofi.map(t => t.title), ['Midnight in the Notebook', 'Thoughts Between Pages']);

  const medieval = filterTracksByCategory(flowMusicTracks, 'medieval');
  assert.equal(medieval.length, 2);
  assert.deepEqual(medieval.map(t => t.title), ['The Scholar\'s Candle', 'Beneath the Ancient Stars']);

  const scifi = filterTracksByCategory(flowMusicTracks, 'scifi');
  assert.equal(scifi.length, 2);
  assert.deepEqual(scifi.map(t => t.title), ['Beyond the Virgo Supercluster', 'Humanity Among the Stars']);

  // 2. Format checks
  for (const track of flowMusicTracks) {
    assert.equal(track.format, 'mp3');
    assert.equal(getAudioMimeType(track.format), 'audio/mpeg');
  }

  // 3. Category labels
  const categories = getAvailableCategories(flowMusicTracks);
  assert.ok(categories.some(c => c.id === 'lofi' && c.label === 'Lo-Fi'));
  assert.ok(categories.some(c => c.id === 'medieval' && c.label === 'Medieval'));
  assert.ok(categories.some(c => c.id === 'scifi' && c.label === 'Sci-Fi'));
});

test('In-App Help Refresh: updated glossary terms exist and render properly', () => {
  assert.ok(glossary.house, 'glossary.house must exist');
  assert.ok(glossary.echo, 'glossary.echo must exist');
  assert.ok(glossary.atmosphere, 'glossary.atmosphere must exist');
  assert.ok(glossary.codemirror, 'glossary.codemirror must exist');

  assert.match(glossary.house, /House of Thoughts:/);
  assert.match(glossary.echo, /Echo Library:/);
  assert.match(glossary.atmosphere, /Writing Atmosphere:/);
  assert.match(glossary.codemirror, /CodeMirror 6 Editor:/);
});
