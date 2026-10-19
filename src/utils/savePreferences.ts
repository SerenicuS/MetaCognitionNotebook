export type SaveMode = 'automatic' | 'manual';

export interface SavePreferences {
  mode: SaveMode;
  debounceSeconds: number; // 1 to 10 seconds
}

export const DEFAULT_SAVE_PREFERENCES: SavePreferences = {
  mode: 'automatic',
  debounceSeconds: 3,
};

const STORAGE_KEY = 'mc_save_preferences';

export function loadSavePreferences(): SavePreferences {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_SAVE_PREFERENCES };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SAVE_PREFERENCES };
    const parsed = JSON.parse(raw);
    const mode: SaveMode = parsed?.mode === 'manual' ? 'manual' : 'automatic';
    const rawDebounce = Number(parsed?.debounceSeconds);
    const debounceSeconds =
      Number.isFinite(rawDebounce) && rawDebounce >= 1 && rawDebounce <= 10
        ? Math.round(rawDebounce)
        : DEFAULT_SAVE_PREFERENCES.debounceSeconds;
    return { mode, debounceSeconds };
  } catch {
    return { ...DEFAULT_SAVE_PREFERENCES };
  }
}

export function persistSavePreferences(prefs: SavePreferences): SavePreferences {
  const mode: SaveMode = prefs.mode === 'manual' ? 'manual' : 'automatic';
  const rawDebounce = Number(prefs.debounceSeconds);
  const debounceSeconds =
    Number.isFinite(rawDebounce) && rawDebounce >= 1 && rawDebounce <= 10
      ? Math.round(rawDebounce)
      : DEFAULT_SAVE_PREFERENCES.debounceSeconds;
  const validated: SavePreferences = { mode, debounceSeconds };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
    }
  } catch (err) {
    console.warn('Failed to persist save preferences to localStorage:', err);
  }
  return validated;
}
