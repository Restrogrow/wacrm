import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Share, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar, Badge, Card, EmptyState, ErrorView, LoadingView } from '@/components/ui/misc';
import { Text } from '@/components/ui/Text';
import { TagPill } from '@/features/contacts/ContactListRow';
import { describeSaveError, loadTags, type Tag } from '@/features/contacts/data';
import {
  addNote,
  addTag,
  deleteContact,
  getContactDetail,
  getConversations,
  getDeals,
  getNotes,
  getOrders,
  removeTag,
  updateContactFields,
  type ContactDetail,
  type ConversationLite,
  type DealLite,
  type Note,
  type OrderLite,
} from '@/features/contacts/detail-data';
import { Sheet } from '@/features/contacts/Sheet';
import { useSnack } from '@/features/contacts/snack';
import { fmtDate, fmtDateTime, fmtMoney, fmtPhone, fmtRelative } from '@/features/dashboard/fmt';
import { DealSheet } from '@/features/deals/DealSheet';
import { getDeal, loadPipelines, type Deal, type Pipeline } from '@/features/deals/data';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

function Section({ title, count, action, children }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="label" muted style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {title}
          {count !== undefined ? ` · ${count}` : ''}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function ActionButton({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 6, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}
    >
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      <Text variant="caption" style={{ fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const statusTone = { open: 'success', pending: 'warning', closed: 'neutral' } as const;

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { canWrite, isAdmin, accountId, session } = useSession();
  const snack = useSnack();

  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [convs, setConvs] = useState<ConversationLite[]>([]);
  const [deals, setDeals] = useState<DealLite[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [tagSheet, setTagSheet] = useState(false);
  const [dealSheet, setDealSheet] = useState<{ deal: Deal | null } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const d = await getContactDetail(id);
      if (!d) {
        setMissing(true);
        return;
      }
      setDetail(d);
      setName(d.contact.name ?? '');
      setEmail(d.contact.email ?? '');
      setCompany(d.contact.company ?? '');
      // Each section is independent: one failing does not blank the page.
      const [n, c, dl, o, t, p] = await Promise.allSettled([getNotes(id), getConversations(id), getDeals(id), getOrders(id), loadTags(), loadPipelines()]);
      if (n.status === 'fulfilled') setNotes(n.value);
      if (c.status === 'fulfilled') setConvs(c.value);
      if (dl.status === 'fulfilled') setDeals(dl.value);
      if (o.status === 'fulfilled') setOrders(o.value);
      if (t.status === 'fulfilled') setAllTags(t.value);
      if (p.status === 'fulfilled') setPipelines(p.value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this contact.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingView />;
  if (missing || !detail) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 40 }}>
        {error ? (
          <ErrorView message={error} onRetry={load} />
        ) : (
          <EmptyState icon="person-outline" title="Contact not found" message="It may have been deleted or merged." action={<Button title="Go back" variant="secondary" onPress={() => router.back()} />} />
        )}
      </View>
    );
  }

  const c = detail.contact;
  const title = c.name?.trim() || fmtPhone(c.phone);
  const digits = c.phone.replace(/\D/g, '');

  async function saveDetails() {
    setSaving(true);
    const prev = detail;
    try {
      await updateContactFields(c.id, { name, email, company });
      setDetail((d) => (d ? { ...d, contact: { ...d.contact, name: name.trim() || null, email: email.trim() || null, company: company.trim() || null } } : d));
      setEditing(false);
      snack.show('Contact updated', 'success');
    } catch (e) {
      setDetail(prev);
      snack.show(describeSaveError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleTag(tag: Tag) {
    const has = detail!.tags.some((t) => t.id === tag.id);
    const before = detail!.tags;
    setDetail((d) => (d ? { ...d, tags: has ? d.tags.filter((t) => t.id !== tag.id) : [...d.tags, tag] } : d)); // optimistic
    try {
      if (has) await removeTag(c.id, tag.id);
      else await addTag(c.id, tag.id);
    } catch (e) {
      setDetail((d) => (d ? { ...d, tags: before } : d));
      snack.show(describeSaveError(e), 'error');
    }
  }

  async function submitNote() {
    if (!noteText.trim() || !accountId || !session) return;
    setAddingNote(true);
    try {
      const n = await addNote({ accountId, userId: session.user.id, contactId: c.id, text: noteText });
      setNotes((p) => [n, ...p]);
      setNoteText('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      snack.show(describeSaveError(e), 'error');
    } finally {
      setAddingNote(false);
    }
  }

  function openWhatsApp() {
    const latest = convs[0];
    if (latest) router.push(`/chat/${latest.id}`);
    else
      Alert.alert(
        'No conversation yet',
        'WhatsApp only lets you message a customer first with an approved template. Once they message you, the chat appears here and in your Inbox.',
      );
  }

  function confirmDelete() {
    Alert.alert(`Delete ${title}?`, 'Their chats, notes and tags are removed too. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteContact(c.id);
            router.back();
          } catch (e) {
            snack.show(describeSaveError(e), 'error');
          }
        },
      },
    ]);
  }

  async function openDeal(d: DealLite) {
    try {
      const full = await getDeal(d.id);
      if (full) setDealSheet({ deal: full });
    } catch {
      snack.show('Could not open this deal.', 'error');
    }
  }

  const firstConv = convs.length ? convs[convs.length - 1] : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {canWrite && !editing ? (
            <Pressable onPress={() => setEditing(true)} hitSlop={10} accessibilityLabel="Edit contact" style={{ padding: 8 }}>
              <Ionicons name="create-outline" size={23} color={colors.text} />
            </Pressable>
          ) : null}
          {isAdmin ? (
            <Pressable onPress={confirmDelete} hitSlop={10} accessibilityLabel="Delete contact" style={{ padding: 8 }}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 22, width: '100%', maxWidth: 760, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Avatar name={c.name || c.phone} size={84} />
          <Text variant="title" style={{ textAlign: 'center' }}>{title}</Text>
          {c.name ? <Text muted>{fmtPhone(c.phone)}</Text> : null}
          {c.company ? <Text muted>{c.company}</Text> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {c.opted_out_at ? <Badge label="Opted out of messages" tone="danger" /> : null}
            {c.ad_source_type ? <Badge label={c.ad_headline ? `Ad: ${c.ad_headline.slice(0, 28)}` : 'Ad lead'} tone="warning" /> : null}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ActionButton icon="logo-whatsapp" label="WhatsApp" onPress={openWhatsApp} />
          <ActionButton icon="call-outline" label="Call" onPress={() => Linking.openURL(`tel:+${digits}`).catch(() => snack.show('Calling is not available on this device.', 'error'))} />
          <ActionButton icon="mail-outline" label="Email" disabled={!c.email} onPress={() => c.email && Linking.openURL(`mailto:${c.email}`).catch(() => snack.show('No email app found.', 'error'))} />
          <ActionButton icon="share-outline" label="Share" onPress={() => Share.share({ message: `${title}\n${fmtPhone(c.phone)}${c.email ? `\n${c.email}` : ''}` }).catch(() => {})} />
        </View>

        <Section title="Details">
          <Card style={{ gap: 14 }}>
            {editing ? (
              <>
                <Input label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
                <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
                <Input label="Company" value={company} onChangeText={setCompany} autoCapitalize="words" />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button style={{ flex: 1 }} variant="secondary" title="Cancel" onPress={() => { setEditing(false); setName(c.name ?? ''); setEmail(c.email ?? ''); setCompany(c.company ?? ''); }} />
                  <Button style={{ flex: 1 }} title="Save" loading={saving} onPress={saveDetails} />
                </View>
              </>
            ) : (
              <>
                {[
                  ['Phone', fmtPhone(c.phone)],
                  ['Email', c.email],
                  ['Company', c.company],
                  ['Added', fmtDate(c.created_at)],
                  ...detail.custom.map((f) => [f.field_name, f.value] as [string, string | null]),
                ].map(([k, v]) => (
                  <View key={k as string} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}>
                    <Text muted>{k}</Text>
                    <Text style={{ flexShrink: 1, textAlign: 'right' }} selectable>{(v as string | null) || '–'}</Text>
                  </View>
                ))}
              </>
            )}
          </Card>
        </Section>

        <Section
          title="Tags"
          action={canWrite && allTags.length > 0 ? <Pressable onPress={() => setTagSheet(true)} hitSlop={8}><Text variant="label" color={colors.primary}>Edit</Text></Pressable> : undefined}
        >
          {detail.tags.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {detail.tags.map((t) => <TagPill key={t.id} tag={t} />)}
            </View>
          ) : (
            <Text muted>No tags yet.</Text>
          )}
        </Section>

        <Section title="Notes" count={notes.length}>
          {canWrite ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <TextInput
                value={noteText}
                onChangeText={setNoteText}
                placeholder="Add a private note"
                placeholderTextColor={colors.textMuted}
                multiline
                style={{ flex: 1, minHeight: 48, maxHeight: 120, color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 }}
              />
              <Button title="Add" small loading={addingNote} disabled={!noteText.trim()} onPress={submitNote} style={{ minHeight: 48 }} />
            </View>
          ) : null}
          {notes.map((n) => (
            <Card key={n.id} style={{ gap: 4 }}>
              <Text selectable>{n.note_text}</Text>
              <Text variant="caption" muted>{fmtDateTime(n.created_at)}</Text>
            </Card>
          ))}
          {notes.length === 0 ? <Text muted>No notes yet.</Text> : null}
        </Section>

        <Section title="Conversations" count={convs.length}>
          {convs.map((cv) => (
            <Card key={cv.id} onPress={() => router.push(`/chat/${cv.id}`)} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Badge label={cv.status === 'open' ? 'Open' : cv.status === 'pending' ? 'Pending' : 'Closed'} tone={statusTone[cv.status]} />
                <Text variant="caption" muted>{fmtRelative(cv.last_message_at)}</Text>
              </View>
              <Text numberOfLines={2} muted>{cv.last_message_text || 'No messages'}</Text>
            </Card>
          ))}
          {convs.length === 0 ? <Text muted>No conversations yet.</Text> : null}
        </Section>

        <Section
          title="Deals"
          count={deals.length}
          action={canWrite && pipelines.length ? <Pressable onPress={() => setDealSheet({ deal: null })} hitSlop={8}><Text variant="label" color={colors.primary}>+ New deal</Text></Pressable> : undefined}
        >
          {deals.map((d) => (
            <Card key={d.id} onPress={() => openDeal(d)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontWeight: '600' }} numberOfLines={1}>{d.title}</Text>
                <Badge label={d.status === 'won' ? 'Won' : d.status === 'lost' ? 'Lost' : 'Open'} tone={d.status === 'won' ? 'success' : d.status === 'lost' ? 'danger' : 'info'} />
              </View>
              <Text style={{ fontWeight: '700' }}>{fmtMoney(d.value, d.currency)}</Text>
            </Card>
          ))}
          {deals.length === 0 ? <Text muted>No deals yet.</Text> : null}
        </Section>

        <Section title="Orders" count={orders.length}>
          {orders.map((o) => (
            <Card key={o.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <View style={{ gap: 4 }}>
                <Text style={{ fontWeight: '600' }}>{o.reference_id || 'Order'}</Text>
                <Text variant="caption" muted>{fmtDate(o.created_at)} · {o.payment_status === 'paid' ? 'Paid' : o.payment_status === 'requested' ? 'Payment requested' : o.status || ''}</Text>
              </View>
              <Text style={{ fontWeight: '700' }}>{fmtMoney(o.total, o.currency)}</Text>
            </Card>
          ))}
          {orders.length === 0 ? <Text muted>No orders yet.</Text> : null}
        </Section>

        <Section title="Activity">
          <Card style={{ gap: 12 }}>
            {([
              convs[0]?.last_message_at ? { icon: 'chatbubble-ellipses-outline', text: 'Last message', when: convs[0].last_message_at } : null,
              firstConv ? { icon: 'chatbubbles-outline', text: 'First conversation started', when: firstConv.created_at } : null,
              { icon: 'person-add-outline', text: 'Added as a contact', when: c.created_at },
            ] as ({ icon: keyof typeof Ionicons.glyphMap; text: string; when: string } | null)[])
              .filter((x): x is { icon: keyof typeof Ionicons.glyphMap; text: string; when: string } => x !== null)
              .map((a) => (
                <View key={a.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Ionicons name={a.icon} size={20} color={colors.textMuted} />
                  <Text style={{ flex: 1 }}>{a.text}</Text>
                  <Text variant="caption" muted>{fmtDateTime(a.when)}</Text>
                </View>
              ))}
          </Card>
        </Section>
      </ScrollView>

      <Sheet visible={tagSheet} onClose={() => setTagSheet(false)} title="Tags">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {allTags.map((t) => {
            const on = detail.tags.some((x) => x.id === t.id);
            return (
              <Pressable
                key={t.id}
                onPress={() => toggleTag(t)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : 'transparent' }}
              >
                <Text variant="caption" color={on ? colors.primary : colors.text} style={{ fontWeight: '700' }}>{on ? '✓ ' : ''}{t.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <Button title="Done" onPress={() => setTagSheet(false)} />
      </Sheet>

      <DealSheet
        visible={!!dealSheet}
        onClose={() => setDealSheet(null)}
        onChanged={() => void load()}
        deal={dealSheet?.deal ?? null}
        pipelines={pipelines}
        newForContact={{ id: c.id }}
        notify={snack.show}
      />
      {snack.node}
    </View>
  );
}
