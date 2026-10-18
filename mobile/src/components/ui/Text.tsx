import { Text as RNText, type TextProps } from 'react-native';

import { font, useTheme } from '@/theme';

type Variant = 'title' | 'heading' | 'body' | 'caption' | 'label';
const sizes: Record<Variant, { fontSize: number; fontWeight: '400' | '500' | '600' | '700' | '800'; lineHeight: number }> = {
  title: { fontSize: font.xxl, fontWeight: '800', lineHeight: 34 },
  heading: { fontSize: font.lg, fontWeight: '700', lineHeight: 24 },
  body: { fontSize: font.md, fontWeight: '400', lineHeight: 22 },
  caption: { fontSize: font.sm, fontWeight: '400', lineHeight: 18 },
  label: { fontSize: font.sm, fontWeight: '600', lineHeight: 18 },
};

export function Text({ variant = 'body', muted, color, style, ...rest }: TextProps & { variant?: Variant; muted?: boolean; color?: string }) {
  const { colors } = useTheme();
  return <RNText {...rest} style={[sizes[variant], { color: color ?? (muted ? colors.textMuted : colors.text) }, style]} />;
}
