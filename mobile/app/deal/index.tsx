import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Badge, EmptyState, ErrorView, LoadingView } from '@/components/ui/misc';
import { Text } from '@/components/ui/Text';
import { useSnack } from '@/features/contacts/snack';
import { fmtMoney, fmtMoneyCompact, fmtPhone } from '@/features/dashboard/fmt';
import { DealSheet } from '@/features/deals/DealSheet';
import { loadDeals, loadPipelines, summariseStage, type Deal, type Pipeline, type Stage } from '@/features/deals/data';
import { useTheme } from '@/theme';

const DealCard = memo(function DealCard({ deal, onPress }: { deal: Deal; onPress: (d: Deal) => void }) {
  const { colors } = useTheme();
  const name = deal.contact?.name?.trim() || (deal.contact ? fmtPhone(deal.contact.phone) : 'No contact');
  return (
    <Pressable
      onPress={() => onPress(deal)}
      accessibilityRole="button"
      accessibilityLabel={`${deal.title}, ${fmtMoney(deal.value, deal.currency)}, ${name}`}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 12,
        gap: 8,
        opacity: pressed ? 0.85 : deal.status === 'lost' ? 0.6 : 1,
      })}
    >
      <Text style={{ fontWeight: '700' }} numberOfLines={2}>
        {deal.title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Avatar name={name} size={24} />
        <Text variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
          {name}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '800' }}>{fmtMoney(deal.value, deal.currency)}</Text>
        {deal.status === 'won' ? <Badge label="Won" tone="success" /> : deal.status === 'lost' ? <Badge label="Lost" tone="danger" /> : null}
      </View>
    </Pressable>
  );
});

function StageColumn({ stage, deals, width, onPress }: { stage: Stage; deals: Deal[]; width: number; onPress: (d: Deal) => void }) {
  const { colors } = useTheme();
  const sum = summariseStage(deals);
  const currency = deals[0]?.currency ?? 'INR';
  return (
    <View style={{ width, paddingHorizontal: 6 }}>
      <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 18, padding: 10, flex: 1, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: stage.color }} />
          <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>
            {stage.name}
          </Text>
          <Text variant="caption" muted>
            {sum.count} · {fmtMoneyCompact(sum.value, currency)}
          </Text>
        </View>
        <FlatList
          data={deals}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => <DealCard deal={item} onPress={onPress} />}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <Text variant="caption" muted style={{ textAlign: 'center', padding: 20 }}>
              No deals here
            </Text>
          }
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </View>
    </View>
  );
}

export default function PipelineScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const snack = useSnack();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Deal | null>(null);

  const colW = width >= 700 ? 320 : Math.round(width * 0.84);
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];

  const loadAll = useCallback(async (keepPipeline?: string | null) => {
    setError(null);
    try {
      const ps = await loadPipelines();
      setPipelines(ps);
      const pid = keepPipeline && ps.some((p) => p.id === keepPipeline) ? keepPipeline : ps[0]?.id ?? null;
      setPipelineId(pid);
      setDeals(pid ? await loadDeals(pid) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your pipeline.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function switchPipeline(id: string) {
    setPipelineId(id);
    setDeals([]);
    try {
      setDeals(await loadDeals(id));
    } catch {
      snack.show('Could not load that pipeline.', 'error');
    }
  }

  const byStage = useMemo(() => {
    const m = new Map<string, Deal[]>();
    for (const d of deals) m.set(d.stage_id, [...(m.get(d.stage_id) ?? []), d]);
    return m;
  }, [deals]);

  const totals = useMemo(() => summariseStage(deals), [deals]);
  const onPress = useCallback((d: Deal) => setSelected(d), []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="heading">Sales pipeline</Text>
          <Text variant="caption" muted>
            {totals.count} open · {fmtMoneyCompact(totals.value, deals[0]?.currency ?? 'INR')}
          </Text>
        </View>
      </View>

      {pipelines.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }} style={{ flexGrow: 0 }}>
          {pipelines.map((p) => {
            const on = p.id === pipeline?.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => switchPipeline(p.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surface }}
              >
                <Text variant="caption" color={on ? colors.primary : colors.text} style={{ fontWeight: '700' }}>
                  {p.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {loading ? (
        <LoadingView />
      ) : error ? (
        <ErrorView message={error} onRetry={() => loadAll(pipelineId)} />
      ) : !pipeline ? (
        <EmptyState icon="git-branch-outline" title="No pipeline yet" message="Create a pipeline on the web app to track your deals by stage." />
      ) : (
        <FlatList
          horizontal
          data={pipeline.stages}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => <StageColumn stage={item} deals={byStage.get(item.id) ?? []} width={colW} onPress={onPress} />}
          snapToInterval={colW}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: insets.bottom + 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadAll(pipelineId); }} tintColor={colors.primary} />}
        />
      )}

      <DealSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        onChanged={() => void loadAll(pipelineId)}
        deal={selected}
        pipelines={pipelines}
        notify={snack.show}
      />
      {snack.node}
    </View>
  );
}
