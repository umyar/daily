import type { ReactNode } from 'react'
import type { Theme } from './theme'

const OPTIONS: { value: Theme; label: string; icon: ReactNode }[] = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <>
        <circle cx="8" cy="8" r="3.25" />
        <path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2L3.1 3.1" />
      </>
    ),
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: <path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z" />,
  },
  {
    value: 'system',
    label: 'System',
    icon: (
      <>
        <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.25" />
        <path d="M5.5 13.75h5" />
      </>
    ),
  },
]

export function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`theme-option${theme === option.value ? ' selected' : ''}`}
          aria-pressed={theme === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => onChange(option.value)}
        >
          <svg
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {option.icon}
          </svg>
        </button>
      ))}
    </div>
  )
}
