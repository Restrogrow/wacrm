import { View } from 'react-native';

import { Badge, Card } from '@/components/ui/misc';
import { Text } from '@/components/ui/Text';
import { STATUS_LABEL, type Broadcast } from '@/features/broadcasts/data';
import { fmtDateTime, fmtRelative } from '@/features/dashboard/fmt';
import { useTheme } from '@/theme';

const TONE = { draft: 'neutral', scheduled: 'info', sending: 'warning', sent: 'success', failed: 'danger' } as const;

export function pct(part: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((part / total) * 100)) : 0;
}

/** Stacked bar: read ⊂ delivered ⊂ sent, plus failed. */
export function DeliveryBar({ b }: { b: Broadcast }) {
  const { colors } = useTheme();
  const t = Math.max(1, b.total_recipients);
  const seg = (n: number, color: string) => (n > 0 ? <View style={{ width: `${(n / t) * 100}%`, backgroundColor: color }} /> : null);
  const sentOnly = Math.max(0, b.sent_count - b.delivered_count - b.failed_count);
  const deliveredOnly = Math.max(0, b.delivered_count - b.read_count);
  return (
    <View style={{ height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', backgroundColor: colors.surfaceAlt }}>
      {seg(b.read_count, colors.primary)}
      {seg(deliveredOnly, colors.info)}
      {seg(sentOnly, colors.textMuted)}
      {seg(b.failed_count, colors.danger)}
    </View>
  );
}

export function BroadcastCard({ b, onPress }: { b: Broadcast; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
          {b.name}
        </Text>
        <Badge label={STATUS_LABEL[b.status]} tone={TONE[b.status]} />
      </View>
      <Text variant="caption" muted numberOfLines={1}>
        {b.template_name.replace(/_/g, ' ')} ·{' '}
        {b.status === 'scheduled' && b.scheduled_at ? `Sends ${fmtDateTime(b.scheduled_at)}` : fmtRelative(b.created_at)}
      </Text>
      {b.status !== 'draft' && b.status !== 'scheduled' ? <DeliveryBar b={b} /> : null}
      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
        <Text variant="caption" muted>
          {b.total_recipients} people
        </Text>
        {b.sent_count ? (
          <Text variant="caption" muted>
            Delivered {pct(b.delivered_count, b.total_recipients)}%
          </Text>
        ) : null}
        {b.read_count ? (
          <Text variant="caption" muted>
            Read {pct(b.read_count, b.total_recipients)}%
          </Text>
        ) : null}
        {b.failed_count ? (
          <Text variant="caption" muted>
            Failed {b.failed_count}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
