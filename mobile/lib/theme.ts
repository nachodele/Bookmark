/** Sky blue + deep teal (light) / deep blue + muted gold (dark) */

export const lightColors = {
  background: '#C8E6F5',
  surface: '#E4F4FC',
  surfaceBorder: '#9ECAE6',
  text: '#1A3344',
  textSecondary: '#3D5A6E',
  textMuted: '#6B8FA3',
  accent: '#1A5F7A',
  accentMuted: '#B8DCE8',
  onAccent: '#FFFFFF',
  danger: '#C62828',
  success: '#2E7D32',
  placeholder: '#B0D9EF',
  overlay: 'rgba(26,51,68,0.45)',
};

export const darkColors = {
  background: '#142A3A',
  surface: '#1C3548',
  surfaceBorder: '#2E4F66',
  text: '#E4F2FA',
  textSecondary: '#A3C2D9',
  textMuted: '#6E8FA8',
  accent: '#C4A035',
  accentMuted: '#2A3520',
  onAccent: '#1A1608',
  danger: '#FF6B6B',
  success: '#66BB6A',
  placeholder: '#243D50',
  overlay: 'rgba(0,0,0,0.65)',
};

export type ThemeColors = typeof lightColors;

export type ThemeMode = 'light' | 'dark' | 'system';
