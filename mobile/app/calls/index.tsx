import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chips } from '@/components/ui/Chips';
import { Divider, EmptyState, ErrorView } from '@/components/ui/misc';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { CallListRow } from '@/features/calls/CallListRow';
import { fetchCalls, subscribeCalls, type CallFilter, type CallRow } from '@/features/calls/data';
import { ScreenHeader } from '@/features/settings/ScreenHeader';
import { useTheme } from '@/theme';

const FILTERS: { value: CallFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'missed', label: 'Missed' },
  { value: 'ai', label: 'AI calls' },
  { value: 'inbound', label: 'Incoming' },
  { value: 'outbound', label: 'Outgoing' },
];

export default function CallsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<CallFilter>('all');
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const load = useCallback(async () => {
    try {
      setError(null);
      setCalls(await fetchCalls({ filter: filterRef.current }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load calls.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setCalls(null);
    void load();
  }, [filter, load]);

  // Live: new calls, answered/ended, AI notes arriving.
  useFocusEffect(useCallback(() => subscribeCalls(() => void load()), [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Calls" />
      <Chips options={FILTERS} value={filter} onChange={setFilter} />
      {error && !calls ? (
        <ErrorView message={error} onRetry={load} />
      ) : calls === null ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <CallListRow call={item} onPress={() => router.push(`/calls/${item.id}`)} />}
          ItemSeparatorComponent={() => (
            <View style={{ paddingLeft: 70 }}>
              <Divider />
            </View>
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon="call-outline"
              title={filter === 'all' ? 'No calls yet' : 'Nothing here'}
              message={
                filter === 'all'
                  ? 'WhatsApp calls with your customers show up here, with AI notes. Calls are made and answered on the web dashboard.'
                  : 'No calls match this filter.'
              }
            />
          }
          ListFooterComponent={
            calls.length > 0 ? (
              <Text variant="caption" muted style={{ textAlign: 'center', padding: 16 }}>
                To make or answer calls, use the web dashboard on a computer.
              </Text>
            ) : undefined
          }
        />
      )}
    </View>
  );
}
