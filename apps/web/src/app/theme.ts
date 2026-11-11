/** Theme handling — SET-01 (System / Dark / Light), docs/04 § 1. */
export type ThemePreference = 'system' | 'dark' | 'light';
export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'sp.theme';

export function getThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(preference: ThemePreference): Theme {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(preference: ThemePreference): Theme {
  const theme = resolveTheme(preference);
  document.documentElement.dataset.theme = theme;
  return theme;
}

export function setThemePreference(preference: ThemePreference): Theme {
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage unavailable (private mode) — preference lasts for this session only.
  }
  return applyTheme(preference);
}

export function initTheme(): void {
  applyTheme(getThemePreference());
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (getThemePreference() === 'system') applyTheme('system');
  });
}
