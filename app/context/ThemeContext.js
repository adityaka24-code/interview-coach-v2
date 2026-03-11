'use client'
import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext({})

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark')
  const [a11y, setA11y] = useState(false)

  useEffect(() => {
    const t = localStorage.getItem('ic-theme') || 'dark'
    const a = localStorage.getItem('ic-a11y') === 'true'
    setTheme(t); setA11y(a)
    applyTheme(t, a)
  }, [])

  function applyTheme(t, a) {
    document.documentElement.setAttribute('data-theme', t)
    document.body.classList.toggle('a11y', a)
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('ic-theme', next)
    applyTheme(next, a11y)
  }

  function toggleA11y() {
    const next = !a11y
    setA11y(next)
    localStorage.setItem('ic-a11y', String(next))
    applyTheme(theme, next)
  }

  return (
    <ThemeContext.Provider value={{ theme, a11y, toggleTheme, toggleA11y }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() { return useContext(ThemeContext) }