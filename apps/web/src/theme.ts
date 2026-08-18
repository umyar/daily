export type Theme = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'scrum-daily-theme'

export function loadTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

export function applyTheme(theme: Theme) {
  if (theme === 'system') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = theme
  }
  localStorage.setItem(STORAGE_KEY, theme)
}
