import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorView } from '@/components/ui/misc';
import { PressableScale } from '@/components/ui/PressableScale';
import { SkeletonList } from '@/components/ui/Skeleton';
import { BroadcastCard } from '@/features/broadcasts/BroadcastCard';
import { listBroadcasts, type Broadcast } from '@/features/broadcasts/data';
import { ScreenHeader } from '@/features/settings/ScreenHeader';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

export default function BroadcastsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { canWrite } = useSession();
  const [items, setItems] = useState<Broadcast[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await listBroadcasts());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load broadcasts.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Refresh on every visit (e.g. after creating one) and while any is sending.
  useFocusEffect(
    useCallback(() => {
      void load();
      const t = setInterval(() => void load(), 15000);
      return () => clearInterval(t);
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Broadcasts" />
      {error && !items ? (
        <ErrorView message={error} onRetry={load} />
      ) : items === null ? (
        <SkeletonList avatar={false} rows={5} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => <BroadcastCard b={item} onPress={() => router.push(`/broadcasts/${item.id}`)} />}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 100, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon="megaphone-outline"
              title="No broadcasts yet"
              message="Send an approved WhatsApp template to all your contacts or to a tag, right from your phone."
              action={canWrite ? <Button title="New broadcast" icon="add" onPress={() => router.push('/broadcasts/new')} style={{ marginTop: 8 }} /> : undefined}
            />
          }
        />
      )}
      {canWrite && items && items.length > 0 ? (
        <PressableScale
          onPress={() => router.push('/broadcasts/new')}
          accessibilityRole="button"
          accessibilityLabel="New broadcast"
          style={{
            position: 'absolute',
            right: 20,
            bottom: insets.bottom + 24,
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 6,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Ionicons name="add" size={30} color={colors.onPrimary} />
        </PressableScale>
      ) : null}
    </View>
  );
}
