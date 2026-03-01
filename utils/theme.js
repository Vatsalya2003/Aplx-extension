const THEME_KEY = 'profilefill_theme';

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  return next;
}

export function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}
