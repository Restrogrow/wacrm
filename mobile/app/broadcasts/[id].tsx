import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Badge, Card, EmptyState, ErrorView, LoadingView } from '@/components/ui/misc';
import { Text } from '@/components/ui/Text';
import { DeliveryBar, pct } from '@/features/broadcasts/BroadcastCard';
import { cancelScheduled, getBroadcast, getRecipients, STATUS_LABEL, type Broadcast, type RecipientRow } from '@/features/broadcasts/data';
import { fmtDateTime, fmtPhone } from '@/features/dashboard/fmt';
import { ScreenHeader } from '@/features/settings/ScreenHeader';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

const R_TONE = { pending: 'neutral', sent: 'neutral', delivered: 'info', read: 'success', replied: 'success', failed: 'danger' } as const;
const R_LABEL = { pending: 'Waiting', sent: 'Sent', delivered: 'Delivered', read: 'Read', replied: 'Replied', failed: 'Failed' } as const;

function Stat({ label, value, sub, color }: { label: string; value: number; sub?: string; color?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: '45%', gap: 2 }}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Text variant="title" color={color}>
        {value}
      </Text>
      {sub ? (
        <Text variant="caption" muted>
          {sub}
        </Text>
      ) : null}
    </Card>
  );
}

export default function BroadcastDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { canWrite } = useSession();
  const [b, setB] = useState<Broadcast | null | undefined>(undefined);
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const [row, recs] = await Promise.all([getBroadcast(id), getRecipients(id)]);
      setB(row);
      setRecipients(recs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this broadcast.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the numbers live while it is going out.
  useEffect(() => {
    if (!b || (b.status !== 'scheduled' && b.status !== 'sending')) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [b, load]);

  if (b === undefined && !error) return <LoadingView />;
  if (!b) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Broadcast" />
        {error ? <ErrorView message={error} onRetry={load} /> : <EmptyState icon="megaphone-outline" title="Broadcast not found" />}
      </View>
    );
  }

  const total = b.total_recipients;
  const confirmCancel = () =>
    Alert.alert('Cancel this broadcast?', 'It has not been sent yet. Nothing will go out.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel broadcast',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await cancelScheduled(b.id);
            router.back();
          } catch (e) {
            Alert.alert('Could not cancel', e instanceof Error ? e.message : 'Try again.');
            void load();
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={b.name} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Badge label={STATUS_LABEL[b.status]} tone={b.status === 'sent' ? 'success' : b.status === 'failed' ? 'danger' : b.status === 'sending' ? 'warning' : 'info'} />
            <Text variant="caption" muted style={{ flex: 1, textAlign: 'right' }}>
              {b.status === 'scheduled' && b.scheduled_at ? `Sends ${fmtDateTime(b.scheduled_at)}` : fmtDateTime(b.created_at)}
            </Text>
          </View>
          <Text muted>Template: {b.template_name.replace(/_/g, ' ')}</Text>
          {b.status === 'scheduled' ? (
            <Text variant="caption" muted>
              The server sends it at this time, even if your phone is off.
            </Text>
          ) : (
            <DeliveryBar b={b} />
          )}
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Stat label="People" value={total} />
          <Stat label="Sent" value={b.sent_count} sub={`${pct(b.sent_count, total)}%`} />
          <Stat label="Delivered" value={b.delivered_count} sub={`${pct(b.delivered_count, total)}%`} color={colors.info} />
          <Stat label="Read" value={b.read_count} sub={`${pct(b.read_count, total)}%`} color={colors.primary} />
          <Stat label="Replied" value={b.replied_count} sub={`${pct(b.replied_count, total)}%`} />
          <Stat label="Failed" value={b.failed_count} color={b.failed_count ? colors.danger : undefined} />
        </View>

        {canWrite && b.status === 'scheduled' ? <Button title="Cancel broadcast" variant="secondary" icon="close-circle-outline" loading={cancelling} onPress={confirmCancel} /> : null}

        <View style={{ gap: 8 }}>
          <Text variant="label" muted style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Recipients{recipients.length < total ? ` · first ${recipients.length}` : ''}
          </Text>
          <Card style={{ padding: 0 }}>
            {recipients.map((r, i) => (
              <View
                key={r.id}
                style={{ paddingHorizontal: 14, paddingVertical: 11, gap: 2, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1 }} numberOfLines={1}>
                    {r.contact?.name || fmtPhone(r.contact?.phone ?? '')}
                  </Text>
                  <Badge label={R_LABEL[r.status]} tone={R_TONE[r.status]} />
                </View>
                {r.status === 'failed' && r.error_message ? (
                  <Text variant="caption" color={colors.danger} numberOfLines={2}>
                    {r.error_message}
                  </Text>
                ) : null}
              </View>
            ))}
            {recipients.length === 0 ? (
              <Text muted style={{ padding: 14 }}>
                No recipients.
              </Text>
            ) : null}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
