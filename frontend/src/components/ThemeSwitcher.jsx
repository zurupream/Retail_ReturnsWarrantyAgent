import React, { useEffect, useState } from 'react';

export const THEMES = [
  {
    id: 'daylight',
    label: 'Daylight',
    description: 'Studio Daylight',
    swatch: '#F5F5F7',
    ring: 'rgba(0, 0, 0, 0.2)',
    isDark: false,
  },
  {
    id: 'sand',
    label: 'Sand',
    description: 'Warm Sand (Default)',
    swatch: '#EFECE6',
    ring: 'rgba(120, 113, 108, 0.35)',
    isDark: false,
  },
  {
    id: 'dusk',
    label: 'Dusk',
    description: 'Quiet Dusk',
    swatch: '#242834',
    ring: 'rgba(148, 163, 184, 0.45)',
    isDark: true,
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Midnight OLED',
    swatch: '#0B0C10',
    ring: 'rgba(100, 116, 139, 0.5)',
    isDark: true,
  },
];

const STORAGE_KEY = 'agy_appearance_theme';

export function applyThemeToDocument(themeId) {
  const valid = THEMES.find((t) => t.id === themeId) || THEMES[1]; // default 'sand'
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.setAttribute('data-theme', valid.id);
    if (valid.isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
  return valid.id;
}

export function getInitialTheme() {
  if (typeof window === 'undefined') return 'sand';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && THEMES.some((t) => t.id === saved)) {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'sand';
}

// Initialize immediately on module load so default Warm Sand applies before first paint
if (typeof window !== 'undefined') {
  applyThemeToDocument(getInitialTheme());
}

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState(() => getInitialTheme());

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    const handleSync = (e) => {
      const next = e?.detail || getInitialTheme();
      setTheme(next);
      applyThemeToDocument(next);
    };
    window.addEventListener('agy-theme-change', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('agy-theme-change', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const selectTheme = (id) => {
    setTheme(id);
    applyThemeToDocument(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
      window.dispatchEvent(new CustomEvent('agy-theme-change', { detail: id }));
    } catch {
      // ignore storage errors
    }
  };

  const activeTheme = THEMES.find((t) => t.id === theme) || THEMES[1];

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs select-none transition-colors print:hidden"
      style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-primary)',
      }}
      role="radiogroup"
      aria-label="Appearance theme"
    >
      <span
        className="hidden sm:inline text-[11px] font-medium pr-1"
        style={{ color: 'var(--text-muted)' }}
      >
        {activeTheme.label}
      </span>
      {THEMES.map((t) => {
        const isActive = t.id === theme;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`${t.label} (${t.description})`}
            title={`${t.label} — ${t.description}`}
            onClick={() => selectTheme(t.id)}
            className={`relative w-4 h-4 rounded-full transition-all duration-150 flex items-center justify-center focus:outline-none ${
              isActive ? 'scale-110 ring-2 ring-[#0066CC] ring-offset-1' : 'opacity-75 hover:opacity-100 hover:scale-105'
            }`}
            style={{
              backgroundColor: t.swatch,
              border: `1px solid ${t.ring}`,
              '--tw-ring-offset-color': 'var(--bg-sidebar)',
            }}
          />
        );
      })}
    </div>
  );
}
