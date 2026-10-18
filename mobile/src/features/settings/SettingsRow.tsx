import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { radius, useTheme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export function SettingsRow({
  icon,
  label,
  detail,
  onPress,
  danger,
  chevron = true,
  last,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  onPress?: () => void;
  danger?: boolean;
  chevron?: boolean;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const tint = danger ? colors.danger : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 54,
        paddingHorizontal: 14,
        backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      })}
    >
      <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? colors.dangerSoft : colors.primarySoft }}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={{ flex: 1 }} color={danger ? colors.danger : colors.text}>
        {label}
      </Text>
      {detail ? (
        <Text variant="caption" muted numberOfLines={1} style={{ maxWidth: 140 }}>
          {detail}
        </Text>
      ) : null}
      {onPress && chevron ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

export function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {title ? (
        <Text variant="caption" muted style={{ paddingHorizontal: 4, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600' }}>
          {title}
        </Text>
      ) : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>{children}</View>
    </View>
  );
}
