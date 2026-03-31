export type ThemePreference = 'light' | 'dark'

const STORAGE_KEY = 'voyagemind.theme'

export function getStoredTheme(): ThemePreference | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'dark' || value === 'light' ? value : null
  } catch {
    return null
  }
}

export function setStoredTheme(theme: ThemePreference) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // ignore
  }
}

export function applyThemeClass(theme: ThemePreference) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
}

export function getSystemTheme(): ThemePreference {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
