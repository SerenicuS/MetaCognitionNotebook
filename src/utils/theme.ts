export type ThemeMode = 'dark' | 'light' | 'system';
export const resolveTheme = (theme: ThemeMode, systemDark: boolean): 'dark' | 'light' => theme === 'system' ? systemDark ? 'dark' : 'light' : theme;
export const vaultAsset = (isDark: boolean, dark: string, light: string) => isDark ? dark : light;

/** Keep the existing root-class theme system in sync, including live OS changes. */
export function bindTheme(theme: ThemeMode, root: Pick<HTMLElement, 'classList'>, media: Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>) {
  const update = () => root.classList.toggle('dark', resolveTheme(theme, media.matches) === 'dark');
  update();
  if (theme !== 'system') return () => {};
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}
