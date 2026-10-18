import { useColorScheme } from 'react-native';

import { useThemePref } from '@/lib/theme-pref';

export const palette = {
  light: {
    primary: '#16a34a',
    primaryPressed: '#15803d',
    primarySoft: '#dcfce7',
    onPrimary: '#ffffff',
    background: '#f6f7f9',
    surface: '#ffffff',
    surfaceAlt: '#f1f3f5',
    border: '#e5e7eb',
    text: '#111827',
    textMuted: '#6b7280',
    danger: '#dc2626',
    dangerSoft: '#fee2e2',
    warning: '#d97706',
    warningSoft: '#fef3c7',
    info: '#2563eb',
    infoSoft: '#dbeafe',
    bubbleIn: '#ffffff',
    bubbleOut: '#dcf8c6',
    bubbleNote: '#fef3c7',
    overlay: 'rgba(17,24,39,0.5)',
  },
  dark: {
    primary: '#22c55e',
    primaryPressed: '#16a34a',
    primarySoft: '#14532d',
    onPrimary: '#052e16',
    background: '#0b0f14',
    surface: '#151a21',
    surfaceAlt: '#1d242d',
    border: '#2a323d',
    text: '#f3f4f6',
    textMuted: '#9ca3af',
    danger: '#f87171',
    dangerSoft: '#450a0a',
    warning: '#fbbf24',
    warningSoft: '#422006',
    info: '#60a5fa',
    infoSoft: '#172554',
    bubbleIn: '#1d242d',
    bubbleOut: '#14532d',
    bubbleNote: '#422006',
    overlay: 'rgba(0,0,0,0.6)',
  },
} as const;

export type Colors = { [K in keyof (typeof palette)['light']]: string };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
export const font = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28, hero: 34 } as const;

export function useTheme() {
  const system = useColorScheme();
  const pref = useThemePref();
  const dark = (pref === 'system' ? system : pref) === 'dark';
  return { dark, colors: (dark ? palette.dark : palette.light) as Colors, spacing, radius, font };
}
