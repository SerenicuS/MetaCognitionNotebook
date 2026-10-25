import type { AtmospherePreferences, AtmosphereRepeatMode, AudioTrack } from '../types';

export const ATMOSPHERE_PREFERENCES_KEY = 'mc_atmosphere_preferences';

export const DEFAULT_ATMOSPHERE_PREFERENCES: AtmospherePreferences = {
  volume: 0.5,
  selected_category: 'all',
  repeat_mode: 'all',
};

export const STANDARD_CATEGORIES: { id: string; label: string }[] = [
  { id: 'all', label: 'All Atmosphere' },
  { id: 'lofi', label: 'Lo-Fi' },
  { id: 'medieval', label: 'Medieval' },
  { id: 'scifi', label: 'Sci-Fi' },
];

export function loadAtmospherePreferences(): AtmospherePreferences {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_ATMOSPHERE_PREFERENCES };
  }

  try {
    const raw = window.localStorage.getItem(ATMOSPHERE_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_ATMOSPHERE_PREFERENCES };

    const parsed = JSON.parse(raw);
    const volume = typeof parsed.volume === 'number' && !Number.isNaN(parsed.volume)
      ? Math.max(0, Math.min(1, parsed.volume))
      : DEFAULT_ATMOSPHERE_PREFERENCES.volume;

    const repeat_mode: AtmosphereRepeatMode =
      parsed.repeat_mode === 'off' || parsed.repeat_mode === 'all' || parsed.repeat_mode === 'one'
        ? parsed.repeat_mode
        : DEFAULT_ATMOSPHERE_PREFERENCES.repeat_mode;

    const selected_category = typeof parsed.selected_category === 'string' && parsed.selected_category.trim()
      ? parsed.selected_category.trim()
      : DEFAULT_ATMOSPHERE_PREFERENCES.selected_category;

    return { volume, repeat_mode, selected_category };
  } catch {
    return { ...DEFAULT_ATMOSPHERE_PREFERENCES };
  }
}

export function saveAtmospherePreferences(prefs: AtmospherePreferences): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const cleanPrefs: AtmospherePreferences = {
      volume: Math.max(0, Math.min(1, prefs.volume)),
      repeat_mode: prefs.repeat_mode,
      selected_category: prefs.selected_category,
    };
    window.localStorage.setItem(ATMOSPHERE_PREFERENCES_KEY, JSON.stringify(cleanPrefs));
  } catch {
    // Ignore localStorage write failures (e.g. quota, private browsing)
  }
}

export function filterTracksByCategory(tracks: AudioTrack[], category: string): AudioTrack[] {
  if (!category || category === 'all') {
    return [...tracks];
  }
  const targetCategory = category.toLowerCase().trim();
  return tracks.filter(t => t.category.toLowerCase().trim() === targetCategory);
}

export function getAvailableCategories(tracks: AudioTrack[]): { id: string; label: string }[] {
  const result = [...STANDARD_CATEGORIES];
  const seenIds = new Set(result.map(c => c.id));

  for (const track of tracks) {
    const catId = track.category.toLowerCase().trim();
    if (catId && !seenIds.has(catId)) {
      seenIds.add(catId);
      result.push({
        id: catId,
        label: track.category_label || catId.charAt(0).toUpperCase() + catId.slice(1),
      });
    }
  }

  return result;
}

export function getNextTrack(
  tracks: AudioTrack[],
  currentTrackId: string | null,
  repeatMode: AtmosphereRepeatMode
): AudioTrack | null {
  if (!tracks || tracks.length === 0) return null;

  if (!currentTrackId) {
    return tracks[0];
  }

  const currentIndex = tracks.findIndex(t => t.id === currentTrackId);
  if (currentIndex === -1) {
    return tracks[0];
  }

  if (repeatMode === 'one') {
    return tracks[currentIndex];
  }

  if (repeatMode === 'all') {
    const nextIndex = (currentIndex + 1) % tracks.length;
    return tracks[nextIndex];
  }

  // repeatMode === 'off'
  if (currentIndex + 1 < tracks.length) {
    return tracks[currentIndex + 1];
  }

  return null;
}

export function getPreviousTrack(
  tracks: AudioTrack[],
  currentTrackId: string | null
): AudioTrack | null {
  if (!tracks || tracks.length === 0) return null;

  if (!currentTrackId) {
    return tracks[0];
  }

  const currentIndex = tracks.findIndex(t => t.id === currentTrackId);
  if (currentIndex === -1) {
    return tracks[0];
  }

  const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length;
  return tracks[prevIndex];
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function getAudioMimeType(format: string): string {
  switch (format.toLowerCase().trim()) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'flac':
      return 'audio/flac';
    case 'm4a':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    default:
      return 'audio/mpeg';
  }
}
