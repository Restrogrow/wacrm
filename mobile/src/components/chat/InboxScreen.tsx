import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConversationRow } from '@/components/chat/ConversationRow';
import { ConversationThread } from '@/components/chat/ConversationThread';
import { FilterChips } from '@/components/chat/FilterChips';
import { EmptyState, ErrorView } from '@/components/ui/misc';
import { Text } from '@/components/ui/Text';
import { useConversations } from '@/features/inbox/useConversations';
import { useMembers } from '@/features/inbox/members';
import type { InboxConversation, InboxFilter } from '@/features/inbox/types';
import { api } from '@/lib/api';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

const SPLIT_WIDTH = 768;
const MAX_BULK = 100;

function Skeleton() {
  const { colors } = useTheme();
  return (
    <View>
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={i} style={[styles.skelRow, { borderBottomColor: colors.border }]}>
          <View style={[styles.skelAvatar, { backgroundColor: colors.surfaceAlt }]} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ height: 14, width: '55%', borderRadius: 6, backgroundColor: colors.surfaceAlt }} />
            <View style={{ height: 12, width: '85%', borderRadius: 6, backgroundColor: colors.surfaceAlt }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function InboxScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const split = width >= SPLIT_WIDTH;
  const { session, canWrite } = useSession();
  const userId = session?.user.id ?? null;
  const { nameOf } = useMembers();

  const [filter, setFilter] = useState<InboxFilter>('all');
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const selecting = selected.size > 0;

  const list = useConversations(filter, search);

  const open = useCallback(
    (c: InboxConversation) => {
      if (selecting) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(c.id)) next.delete(c.id);
          else if (next.size < MAX_BULK) next.add(c.id);
          return next;
        });
        return;
      }
      if (split) setActiveId(c.id);
      else router.push({ pathname: '/chat/[id]', params: { id: c.id } });
    },
    [router, selecting, split],
  );

  const longPress = useCallback(
    (c: InboxConversation) => {
      if (!canWrite) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setSelected((prev) => new Set(prev).add(c.id));
    },
    [canWrite],
  );

  async function bulk(action: 'assign' | 'status' | 'mark_read', value?: string | null) {
    const ids = [...selected];
    setBulkBusy(true);
    try {
      await api('/api/inbox/conversations/bulk', { method: 'POST', body: { ids, action, value } });
      for (const id of ids) {
        if (action === 'assign') list.patch(id, { assigned_agent_id: value ?? null });
        else if (action === 'status') list.patch(id, { status: value as InboxConversation['status'] });
        else list.patch(id, { unread_count: 0 });
      }
      setSelected(new Set());
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBulkBusy(false);
    }
  }

  const header = useMemo(
    () => (
      <View>
        <View style={styles.searchRow}>
          <View style={[styles.search, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, number or message"
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.text }]}
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search conversations"
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>
        <FilterChips value={filter} onChange={setFilter} />
      </View>
    ),
    [colors, filter, search],
  );

  const listPane = (
    <View style={[styles.listPane, split && { width: 360, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border }, { backgroundColor: colors.surface }]}>
      <View style={[styles.titleRow, { paddingTop: insets.top + 8 }]}>
        {selecting ? (
          <>
            <Pressable onPress={() => setSelected(new Set())} hitSlop={10} accessibilityLabel="Cancel selection">
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
            <Text variant="heading" style={{ flex: 1 }}>
              {selected.size} selected
            </Text>
          </>
        ) : (
          <Text variant="title" style={{ flex: 1 }}>
            Inbox
          </Text>
        )}
      </View>
      {selecting ? (
        <View style={[styles.bulkBar, { backgroundColor: colors.surfaceAlt }]}>
          {bulkBusy ? <ActivityIndicator color={colors.primary} /> : null}
          <BulkButton icon="person" label="Assign to me" disabled={bulkBusy || !userId} onPress={() => bulk('assign', userId)} />
          <BulkButton icon="checkmark-done" label="Mark read" disabled={bulkBusy} onPress={() => bulk('mark_read')} />
          <BulkButton icon="lock-closed" label="Close" disabled={bulkBusy} onPress={() => bulk('status', 'closed')} />
        </View>
      ) : null}
      <FlatList
        data={list.rows}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            assigneeName={nameOf(item.assigned_agent_id)}
            isMine={!!userId && item.assigned_agent_id === userId}
            active={split && activeId === item.id}
            selecting={selecting}
            selected={selected.has(item.id)}
            onPress={open}
            onLongPress={longPress}
          />
        )}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        initialNumToRender={12}
        windowSize={9}
        removeClippedSubviews
        ListEmptyComponent={
          list.loading ? (
            <Skeleton />
          ) : list.error ? (
            <ErrorView message={list.error} onRetry={list.reload} />
          ) : (
            <EmptyState
              icon={search ? 'search-outline' : 'chatbubbles-outline'}
              title={search ? 'No matches' : filter === 'all' ? 'No conversations yet' : 'Nothing here'}
              message={search ? 'Try a different name, number or word.' : filter === 'all' ? 'New customer messages will show up here.' : 'No conversations match this filter.'}
            />
          )
        }
        ListFooterComponent={list.loadingMore ? <ActivityIndicator style={{ padding: 16 }} color={colors.primary} /> : <View />}
        contentContainerStyle={{ flexGrow: 1 }}
      />
    </View>
  );

  if (!split) return <View style={{ flex: 1, backgroundColor: colors.surface }}>{listPane}</View>;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
      {listPane}
      <View style={{ flex: 1 }}>
        {activeId ? (
          <ConversationThread
            key={activeId}
            conversationId={activeId}
            embedded
            onChanged={(id, changes) => list.patch(id, changes)}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState icon="chatbubble-ellipses-outline" title="Select a conversation" message="Choose a chat on the left to read and reply." />
          </View>
        )}
      </View>
    </View>
  );
}

function BulkButton({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[styles.bulkBtn, { opacity: disabled ? 0.5 : 1 }]}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listPane: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 4 },
  searchRow: { paddingHorizontal: 16, paddingTop: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 44, borderRadius: 14 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  skelAvatar: { width: 44, height: 44, borderRadius: 22 },
  bulkBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 8 },
  bulkBtn: { alignItems: 'center', gap: 2, paddingHorizontal: 12, paddingVertical: 4 },
});
