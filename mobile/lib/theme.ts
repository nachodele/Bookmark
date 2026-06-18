export const lightColors = {
  background: '#fafafa',
  surface: '#ffffff',
  surfaceBorder: '#e4e4e7',
  text: '#09090b',
  textSecondary: '#71717a',
  textMuted: '#a1a1aa',
  accent: '#2563eb',
  accentMuted: '#dbeafe',
  danger: '#dc2626',
  success: '#16a34a',
  placeholder: '#d4d4d8',
  overlay: 'rgba(0,0,0,0.5)',
};

export const darkColors = {
  background: '#09090b',
  surface: '#18181b',
  surfaceBorder: '#27272a',
  text: '#fafafa',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  accent: '#3b82f6',
  accentMuted: '#1e3a5f',
  danger: '#f87171',
  success: '#4ade80',
  placeholder: '#3f3f46',
  overlay: 'rgba(0,0,0,0.7)',
};

export type ThemeColors = typeof lightColors;

export type ThemeMode = 'light' | 'dark' | 'system';
