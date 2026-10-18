import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarChart } from '@/components/charts/BarChart';
import { Avatar, Badge } from '@/components/ui/misc';
import { Text } from '@/components/ui/Text';
import {
  fillDays,
  getAttention,
  getDailyMessages,
  getDealTotals,
  getLeadSources,
  getNewContacts,
  getOrderTotals,
  getSummary,
  rangeBounds,
  type RangeKey,
} from '@/features/dashboard/data';
import { fmtDuration, fmtMoney, fmtMoneyCompact, fmtRelative, greeting } from '@/features/dashboard/fmt';
import { useSection } from '@/features/dashboard/useSection';
import { RangeChips, SectionCard, StatCard } from '@/features/dashboard/widgets';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
];

export default function OverviewScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { accountId, profile } = useSession();
  const [range, setRange] = useState<RangeKey>('7d');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const bounds = useMemo(() => rangeBounds(range), [range, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const cols = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const content = Math.min(width, 1000) - 32;
  const cardW = Math.floor(content / cols);
  const wide = width >= 700;
  const acct = accountId;

  const summary = useSection(() => getSummary(acct!, bounds.from, bounds.to), [acct, range], refreshKey);
  const contacts = useSection(() => getNewContacts(acct!, bounds.from), [acct, range], refreshKey);
  const daily = useSection(() => getDailyMessages(acct!, bounds.from, bounds.to), [acct, range], refreshKey);
  const deals = useSection(() => getDealTotals(acct!, bounds.from, bounds.to), [acct, range], refreshKey);
  const orders = useSection(() => getOrderTotals(acct!, bounds.from, bounds.to), [acct, range], refreshKey);
  const leads = useSection(() => getLeadSources(acct!, bounds.from), [acct, range], refreshKey);
  const attention = useSection(() => getAttention(acct!), [acct], refreshKey);

  const days = useMemo(() => (daily.data ? fillDays(daily.data, bounds.from, bounds.days) : []), [daily.data, bounds]);
  const inTotal = days.reduce((n, d) => n + d.inbound, 0);
  const outTotal = days.reduce((n, d) => n + d.outbound, 0);
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? '';

  async function onRefresh() {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 700);
  }

  const dealRows = deals.data ?? [];
  const orderRows = orders.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: 11, width: '100%', maxWidth: 1032, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: 5, gap: 14, paddingBottom: 6 }}>
          <View>
            <Text variant="caption" muted>
              {greeting()}
            </Text>
            <Text variant="title">{firstName ? `${firstName}, here is your day` : 'Overview'}</Text>
          </View>
          <RangeChips value={range} options={RANGES} onChange={setRange} />
          <Pressable
            onPress={() => router.push('/deal')}
            accessibilityRole="button"
            accessibilityLabel="Open sales pipeline"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.primarySoft, borderRadius: 16, padding: 14, opacity: pressed ? 0.85 : 1 })}
          >
            <Ionicons name="git-branch-outline" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="label">Sales pipeline</Text>
              <Text variant="caption" muted>
                {dealRows[0] ? `${dealRows.reduce((n, d) => n + d.open_count, 0)} open deals · ${fmtMoneyCompact(dealRows[0].open_value, dealRows[0].currency)}` : 'See every deal by stage'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <StatCard width={cardW} icon="chatbubbles-outline" label="Open chats now" value={String(summary.data?.open_now ?? 0)} hint={summary.data?.pending_now ? `${summary.data.pending_now} pending` : undefined} loading={summary.loading && !summary.data} error={!!summary.error} />
          <StatCard width={cardW} icon="sparkles-outline" label="New conversations" value={String(summary.data?.new_count ?? 0)} loading={summary.loading && !summary.data} error={!!summary.error} tone="info" />
          <StatCard width={cardW} icon="swap-vertical-outline" label="Messages in / out" value={`${inTotal} / ${outTotal}`} loading={daily.loading && !daily.data} error={!!daily.error} />
          <StatCard
            width={cardW}
            icon="timer-outline"
            label="Avg first reply"
            value={fmtDuration(summary.data?.first_response_avg_s)}
            hint={summary.data?.first_response_samples ? `${summary.data.first_response_samples} chats` : 'No replies yet'}
            loading={summary.loading && !summary.data}
            error={!!summary.error}
            tone="warning"
          />
          <StatCard width={cardW} icon="person-add-outline" label="New contacts" value={String(contacts.data ?? 0)} loading={contacts.loading && contacts.data === null} error={!!contacts.error} />
          <StatCard
            width={cardW}
            icon="cash-outline"
            label="Deals won"
            value={dealRows.length ? fmtMoneyCompact(dealRows[0].won_value, dealRows[0].currency) : '₹0'}
            hint={dealRows.length ? `${dealRows.reduce((n, d) => n + d.won_count, 0)} deals` : undefined}
            loading={deals.loading && !deals.data}
            error={!!deals.error}
            tone="info"
          />
          <StatCard
            width={cardW}
            icon="bag-check-outline"
            label="Orders"
            value={String(orderRows.reduce((n, o) => n + o.order_count, 0))}
            hint={orderRows.some((o) => o.paid_count !== null) ? `${orderRows.reduce((n, o) => n + (o.paid_count ?? 0), 0)} paid` : undefined}
            loading={orders.loading && !orders.data}
            error={!!orders.error}
          />
          <StatCard width={cardW} icon="checkmark-done-outline" label="Chats closed" value={String(summary.data?.closed_count ?? 0)} loading={summary.loading && !summary.data} error={!!summary.error} tone="warning" />
        </View>

        <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'flex-start' }}>
          <View style={{ flex: wide ? 3 : undefined, width: wide ? undefined : '100%' }}>
            <SectionCard title="Messages per day" loading={daily.loading && !daily.data} error={daily.error} onRetry={daily.reload}>
              {days.length > 0 && (inTotal > 0 || outTotal > 0) ? (
                <BarChart
                  data={days.map((d) => ({ label: range === 'today' ? 'Today' : d.day.slice(8) + '/' + d.day.slice(5, 7), a: d.inbound, b: d.outbound }))}
                  aLabel="Received"
                  bLabel="Sent"
                />
              ) : (
                <Text muted>No messages in this period.</Text>
              )}
            </SectionCard>
          </View>
          <View style={{ flex: wide ? 2 : undefined, width: wide ? undefined : '100%' }}>
            <SectionCard title="Needs a reply" loading={attention.loading && !attention.data} error={attention.error} onRetry={attention.reload}>
              {(attention.data ?? []).length === 0 ? (
                <Text muted>All caught up. No customers are waiting.</Text>
              ) : (
                (attention.data ?? []).map((a) => (
                  <Pressable key={a.id} onPress={() => router.push(`/chat/${a.id}`)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar name={a.contactName} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600' }} numberOfLines={1}>
                        {a.contactName}
                      </Text>
                      <Text variant="caption" muted numberOfLines={1}>
                        {a.preview || 'New message'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text variant="caption" muted>
                        {fmtRelative(a.lastAt)}
                      </Text>
                      {a.unread > 0 ? <Badge label={`${a.unread} new`} tone="success" /> : null}
                    </View>
                  </Pressable>
                ))
              )}
            </SectionCard>
          </View>
        </View>

        <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'flex-start' }}>
          <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%' }}>
            <SectionCard title="Deals" loading={deals.loading && !deals.data} error={deals.error} onRetry={deals.reload}>
              {dealRows.length === 0 ? (
                <Text muted>No deals yet.</Text>
              ) : (
                dealRows.map((d) => (
                  <View key={d.currency} style={{ gap: 6 }}>
                    <Row k="Created" v={`${d.created_count} · ${fmtMoney(d.created_value, d.currency)}`} />
                    <Row k="Won" v={`${d.won_count} · ${fmtMoney(d.won_value, d.currency)}`} strong />
                    <Row k="Open pipeline" v={`${d.open_count} · ${fmtMoney(d.open_value, d.currency)}`} />
                  </View>
                ))
              )}
            </SectionCard>
          </View>
          <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%' }}>
            <SectionCard title="Orders" loading={orders.loading && !orders.data} error={orders.error} onRetry={orders.reload}>
              {orderRows.length === 0 ? (
                <Text muted>No orders in this period.</Text>
              ) : (
                orderRows.map((o) => (
                  <View key={o.source + o.currency} style={{ gap: 6 }}>
                    <Row k={o.source === 'whatsapp' ? 'WhatsApp orders' : 'Shopify orders'} v={String(o.order_count)} />
                    {o.paid_count !== null ? <Row k="Paid" v={`${o.paid_count} · ${fmtMoney(o.revenue, o.currency)}`} strong /> : <Row k="Order value" v={fmtMoney(o.revenue, o.currency)} strong />}
                  </View>
                ))
              )}
            </SectionCard>
          </View>
        </View>

        {(leads.data ?? []).length > 0 ? (
          <SectionCard title="Leads from ads" loading={leads.loading && !leads.data} error={leads.error} onRetry={leads.reload}>
            {(leads.data ?? []).map((l) => (
              <Row key={l.label} k={l.label} v={String(l.count)} />
            ))}
          </SectionCard>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text muted style={{ flexShrink: 1 }} numberOfLines={1}>
        {k}
      </Text>
      <Text style={{ fontWeight: strong ? '700' : '500' }}>{v}</Text>
    </View>
  );
}
