// Dark/light theme: persisted to localStorage, applied via <html data-theme>.
// Initial value is set pre-paint by the inline script in _document.tsx.
export type Theme = 'light' | 'dark';
const KEY = 'snr-theme';

export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return (document.documentElement.dataset.theme as Theme) || 'light';
}

export function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch {}
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
