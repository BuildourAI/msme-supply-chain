'use client'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type Theme = 'system' | 'light' | 'dark'
const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'system', setTheme: () => {},
})

export const useTheme = () => useContext(ThemeCtx)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system')

  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored === 'light' || stored === 'dark') setThemeState(stored)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    const root = document.documentElement
    // 'system' removes the attribute entirely so the §10 media-query rule takes over.
    if (t === 'system') { root.removeAttribute('data-theme'); localStorage.removeItem('theme') }
    else { root.setAttribute('data-theme', t); localStorage.setItem('theme', t) }
  }, [])

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>
}
