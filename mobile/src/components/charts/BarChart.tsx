import { View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme';

export interface BarDatum {
  label: string;
  a: number;
  b?: number;
}

/**
 * Minimal grouped bar chart drawn with plain Views (no chart library).
 * `a` is the primary series, `b` an optional second series.
 */
export function BarChart({
  data,
  height = 120,
  aLabel,
  bLabel,
  maxLabels = 7,
}: {
  data: BarDatum[];
  height?: number;
  aLabel: string;
  bLabel?: string;
  maxLabels?: number;
}) {
  const { colors } = useTheme();
  const max = Math.max(1, ...data.map((d) => Math.max(d.a, d.b ?? 0)));
  const step = Math.max(1, Math.ceil(data.length / maxLabels));
  const summary = `${aLabel}: ${data.reduce((n, d) => n + d.a, 0)}${bLabel ? `, ${bLabel}: ${data.reduce((n, d) => n + (d.b ?? 0), 0)}` : ''}`;
  return (
    <View accessible accessibilityLabel={`Chart. ${summary}`} style={{ gap: 8 }}>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: data.length > 14 ? 2 : 6 }}>
        {data.map((d) => (
          <View key={d.label} style={{ flex: 1, height: '100%', justifyContent: 'flex-end', flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}>
            <View style={{ flex: 1, height: `${Math.max(d.a > 0 ? 4 : 1, (d.a / max) * 100)}%`, backgroundColor: d.a > 0 ? colors.primary : colors.border, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
            {d.b !== undefined ? (
              <View style={{ flex: 1, height: `${Math.max(d.b > 0 ? 4 : 1, (d.b / max) * 100)}%`, backgroundColor: d.b > 0 ? colors.info : colors.border, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
            ) : null}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: data.length > 14 ? 2 : 6 }}>
        {data.map((d, i) => (
          <View key={d.label} style={{ flex: 1, alignItems: 'center' }}>
            {i % step === 0 ? (
              <Text variant="caption" muted numberOfLines={1} style={{ fontSize: 10 }}>
                {d.label}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Legend color={colors.primary} label={aLabel} />
        {bLabel ? <Legend color={colors.info} label={bLabel} /> : null}
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Text variant="caption" muted>
        {label}
      </Text>
    </View>
  );
}
