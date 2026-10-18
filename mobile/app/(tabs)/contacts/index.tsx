import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorView } from '@/components/ui/misc';
import { Text } from '@/components/ui/Text';
import { AddContactSheet } from '@/features/contacts/AddContactSheet';
import { ContactListRow, ContactRowSkeleton } from '@/features/contacts/ContactListRow';
import {
  PAGE_SIZE,
  listContacts,
  loadSegments,
  loadTags,
  type ContactFilter,
  type ContactRow,
  type Segment,
  type Tag,
} from '@/features/contacts/data';
import { useSnack } from '@/features/contacts/snack';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

function Chip({ label, active, onPress, icon }: { label: string; active: boolean; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primarySoft : colors.surface,
      }}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? colors.primary : colors.textMuted} /> : null}
      <Text variant="caption" color={active ? colors.primary : colors.text} style={{ fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function ContactsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accountId, canWrite } = useSession();
  const snack = useSnack();

  const [tags, setTags] = useState<Tag[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [segment, setSegment] = useState<Segment | null>(null);
  const [sort, setSort] = useState<'newest' | 'name'>('newest');

  const [rows, setRows] = useState<ContactRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const seq = useRef(0);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchText), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const filter: ContactFilter = useMemo(() => ({ search, tagIds, segment, sort }), [search, tagIds, segment, sort]);

  const loadFilters = useCallback(async () => {
    if (!accountId) return;
    const [t, s] = await Promise.all([loadTags().catch(() => [] as Tag[]), loadSegments(accountId)]);
    setTags(t);
    setSegments(s);
    return t;
  }, [accountId]);

  useEffect(() => {
    void loadFilters();
  }, [loadFilters]);

  const fetchFirst = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!accountId) return;
      const my = ++seq.current;
      if (mode === 'initial') setLoading(true);
      setError(null);
      try {
        const allTags = tags.length ? tags : (await loadTags().catch(() => [])) ?? [];
        const res = await listContacts(accountId, filter, 0, allTags);
        if (my !== seq.current) return;
        setRows(res.rows);
        setTotal(res.total);
      } catch (e) {
        if (my !== seq.current) return;
        setError(e instanceof Error ? e.message : 'Could not load contacts.');
      } finally {
        if (my === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [accountId, filter, tags],
  );

  // Refetch whenever the filter changes (tags list is a stable dependency once loaded).
  useEffect(() => {
    void fetchFirst('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, filter]);

  const loadMore = useCallback(async () => {
    if (!accountId || loadingMore || loading || rows.length >= total) return;
    setLoadingMore(true);
    const my = seq.current;
    try {
      const res = await listContacts(accountId, filter, rows.length, tags);
      if (my !== seq.current) return;
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...res.rows.filter((r) => !seen.has(r.id))];
      });
    } catch {
      snack.show('Could not load more contacts.', 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [accountId, filter, loading, loadingMore, rows.length, snack, tags, total]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFilters();
    await fetchFirst('refresh');
  }, [fetchFirst, loadFilters]);

  const open = useCallback((id: string) => router.push(`/contact/${id}`), [router]);
  const filtering = !!search || tagIds.length > 0 || !!segment;

  const header = (
    <View style={{ paddingTop: insets.top + 8, backgroundColor: colors.background, gap: 12, paddingBottom: 8 }}>
      <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="title">Contacts</Text>
        <Text variant="caption" muted>
          {total.toLocaleString('en-IN')} {total === 1 ? 'contact' : 'contacts'}
        </Text>
      </View>
      <View
        style={{
          marginHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 12,
        }}
      >
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search name, phone or email"
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 12 }}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search contacts"
        />
        {searchText ? (
          <Pressable onPress={() => setSearchText('')} hitSlop={10} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {tags.length + segments.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {segments.map((s) => (
            <Chip
              key={s.id}
              icon="funnel-outline"
              label={`${s.name} · ${s.contact_count}`}
              active={segment?.id === s.id}
              onPress={() => {
                setSegment((cur) => (cur?.id === s.id ? null : s));
                setTagIds([]);
              }}
            />
          ))}
          {tags.map((t) => (
            <Chip
              key={t.id}
              label={t.name}
              active={tagIds.includes(t.id)}
              onPress={() => {
                setSegment(null);
                setTagIds((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]));
              }}
            />
          ))}
        </ScrollView>
      ) : null}
      {!segment && tagIds.length === 0 ? (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
          <Chip label="Newest" icon="time-outline" active={sort === 'newest'} onPress={() => setSort('newest')} />
          <Chip label="A to Z" icon="text-outline" active={sort === 'name'} onPress={() => setSort('name')} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        {loading && rows.length === 0 ? (
          <View>
            {header}
            {Array.from({ length: 8 }).map((_, i) => (
              <ContactRowSkeleton key={i} />
            ))}
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => <ContactListRow contact={item} onPress={open} />}
            ListHeaderComponent={header}
            stickyHeaderIndices={[0]}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            initialNumToRender={PAGE_SIZE / 2}
            windowSize={9}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            contentContainerStyle={{ paddingBottom: 120 }}
            ListEmptyComponent={
              error ? (
                <ErrorView message={error} onRetry={() => fetchFirst('initial')} />
              ) : filtering ? (
                <EmptyState icon="search-outline" title="No matching contacts" message="Try a different search or clear the filters." />
              ) : (
                <EmptyState
                  icon="people-outline"
                  title="No contacts yet"
                  message="Contacts appear here when customers message you on WhatsApp. You can also add one yourself."
                />
              )
            }
            ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 16 }} color={colors.primary} /> : undefined}
          />
        )}
      </View>
      {canWrite ? (
        <Pressable
          onPress={() => setAddOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Add contact"
          style={({ pressed }) => ({
            position: 'absolute',
            right: 20,
            bottom: 24,
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
            elevation: 6,
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
          })}
        >
          <Ionicons name="add" size={30} color={colors.onPrimary} />
        </Pressable>
      ) : null}
      <AddContactSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        tags={tags}
        onCreated={(id) => {
          setAddOpen(false);
          snack.show('Contact saved', 'success');
          void fetchFirst('refresh');
          router.push(`/contact/${id}`);
        }}
        onOpenExisting={(id) => {
          setAddOpen(false);
          router.push(`/contact/${id}`);
        }}
      />
      {snack.node}
    </View>
  );
}
