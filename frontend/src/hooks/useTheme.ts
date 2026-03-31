import { useEffect, useState } from 'react'
import { applyThemeClass, getStoredTheme, getSystemTheme, setStoredTheme, type ThemePreference } from '../lib/theme'

export function useTheme() {
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme() ?? getSystemTheme())

  useEffect(() => {
    applyThemeClass(theme)
    setStoredTheme(theme)
  }, [theme])

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))

  return { theme, setTheme, toggleTheme }
}
