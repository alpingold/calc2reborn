/** How the app is coloured on this device. Kept in localStorage, not in the synced settings. */
export type Theme = 'dark' | 'light' | 'system'

export const THEME_KEY = 'ma16200-theme'
export const DEFAULT_THEME: Theme = 'dark'
export const THEME_LABELS: Record<Theme, string> = {
  dark: 'Dark',
  light: 'Light',
  system: 'Match device',
}

function isTheme(v: unknown): v is Theme {
  return v === 'dark' || v === 'light' || v === 'system'
}

/** The saved choice, or dark when nothing valid is saved or storage is unavailable. */
export function readTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    return isTheme(raw) ? raw : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/** Sets `data-theme` on the page. index.html does the same before the app loads, so nothing flashes. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

/** Applies the choice and remembers it. Without storage it lasts until the page closes. */
export function saveTheme(theme: Theme): void {
  applyTheme(theme)
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // private mode or a full quota: the theme still applies to this page
  }
}
