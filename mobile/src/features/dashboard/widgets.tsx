import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/ui/misc';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme';

export function StatCard({
  icon,
  label,
  value,
  hint,
  loading,
  error,
  width,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  hint?: string;
  loading?: boolean;
  error?: boolean;
  width: number | string;
  tone?: 'primary' | 'info' | 'warning';
}) {
  const { colors } = useTheme();
  const tint = tone === 'info' ? colors.info : tone === 'warning' ? colors.warning : colors.primary;
  const soft = tone === 'info' ? colors.infoSoft : tone === 'warning' ? colors.warningSoft : colors.primarySoft;
  return (
    <View style={{ width: width as number, padding: 5 }}>
      <Card style={{ gap: 10, minHeight: 112 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={18} color={tint} />
        </View>
        {loading ? (
          <View style={{ height: 26, width: '60%', borderRadius: 8, backgroundColor: colors.surfaceAlt }} />
        ) : (
          <Text variant="heading" style={{ fontSize: 24, lineHeight: 30 }} accessibilityLabel={`${label}: ${error ? 'unavailable' : value}`}>
            {error ? '–' : value}
          </Text>
        )}
        <View>
          <Text variant="caption" muted>
            {label}
          </Text>
          {hint ? (
            <Text variant="caption" muted style={{ fontSize: 11 }}>
              {hint}
            </Text>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

export function SectionCard({
  title,
  loading,
  error,
  onRetry,
  children,
  action,
}: {
  title: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ padding: 5 }}>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="heading">{title}</Text>
          {action}
        </View>
        {loading ? (
          <View style={{ gap: 8 }}>
            <View style={{ height: 14, borderRadius: 6, backgroundColor: colors.surfaceAlt, width: '90%' }} />
            <View style={{ height: 14, borderRadius: 6, backgroundColor: colors.surfaceAlt, width: '70%' }} />
            <View style={{ height: 14, borderRadius: 6, backgroundColor: colors.surfaceAlt, width: '80%' }} />
          </View>
        ) : error ? (
          <Pressable onPress={onRetry} accessibilityRole="button">
            <Text muted>Could not load this section. Tap to retry.</Text>
          </Pressable>
        ) : (
          children
        )}
      </Card>
    </View>
  );
}

export function RangeChips<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (k: T) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 3 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: on ? colors.surface : 'transparent' }}
          >
            <Text variant="label" color={on ? colors.primary : colors.textMuted}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
