import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setActiveConversation } from '@/features/push/active-chat';
import { ActionsSheet } from '@/components/chat/ActionsSheet';
import { BottomSheet, SheetRow } from '@/components/chat/BottomSheet';
import { Composer } from '@/components/chat/Composer';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { NoteBubble } from '@/components/chat/NoteBubble';
import { TemplateSheet } from '@/components/chat/TemplateSheet';
import { Avatar, Badge, ErrorView, LoadingView } from '@/components/ui/misc';
import { Text } from '@/components/ui/Text';
import { contactLabel, dayKey, dayLabel, messageSummary, renderTemplateBody } from '@/features/inbox/format';
import { useMembers } from '@/features/inbox/members';
import { uploadChatImage } from '@/features/inbox/media';
import { markUnread, setAssignee, setStatus } from '@/features/inbox/queries';
import type { InboxConversation, InboxMessage, InboxNote } from '@/features/inbox/types';
import { useThread, type TimelineItem } from '@/features/inbox/useThread';
import { api } from '@/lib/api';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

/**
 * One chat: header, messages, composer and actions. Used full-screen on phones (app/chat/[id])
 * and as the right-hand pane on tablets (`embedded`).
 */
export function ConversationThread({
  conversationId,
  embedded,
  onChanged,
}: {
  conversationId: string;
  embedded?: boolean;
  onChanged?: (id: string, changes: Partial<InboxConversation>) => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accountId, session, profile, canWrite } = useSession();
  const userId = session?.user.id ?? null;
  const { members, nameOf } = useMembers();
  const t = useThread(conversationId);

  useEffect(() => {
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId]);
  const [replyTo, setReplyTo] = useState<InboxMessage | null>(null);
  const [menuFor, setMenuFor] = useState<InboxMessage | null>(null);
  const [noteMenu, setNoteMenu] = useState<InboxNote | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const conv = t.conversation;
  const contact = conv?.contact ?? null;
  const multiUser = members.length > 1;

  const byId = useMemo(() => new Map(t.messages.map((m) => [m.id, m])), [t.messages]);
  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, typeof t.reactions>();
    for (const r of t.reactions) map.set(r.message_id, [...(map.get(r.message_id) ?? []), r]);
    return map;
  }, [t.reactions]);

  const patchConv = useCallback(
    (changes: Partial<InboxConversation>) => {
      t.setConversation((c) => (c ? { ...c, ...changes } : c));
      onChanged?.(conversationId, changes);
    },
    [conversationId, onChanged, t],
  );

  async function changeStatus(status: 'open' | 'pending' | 'closed') {
    setActionsOpen(false);
    const before = conv?.status;
    patchConv({ status });
    try {
      await setStatus(conversationId, status);
      // Closing a chat can ask the customer for a rating (if the account turned that on). Never blocks.
      if (status === 'closed') void api('/api/csat/request', { method: 'POST', body: { conversation_id: conversationId } }).catch(() => {});
    } catch {
      if (before) patchConv({ status: before });
      Alert.alert('Could not change the status', 'Please try again.');
    }
  }

  async function assign(agentId: string | null) {
    setActionsOpen(false);
    const before = conv?.assigned_agent_id ?? null;
    patchConv({ assigned_agent_id: agentId });
    try {
      await setAssignee(conversationId, agentId);
    } catch {
      patchConv({ assigned_agent_id: before });
      Alert.alert('Could not assign this chat', 'Please try again.');
    }
  }

  const sendText = useCallback(
    (text: string, replyToId: string | null) =>
      t.send(
        { message_type: 'text', content_text: text, reply_to_message_id: replyToId },
        { content_type: 'text', content_text: text, media_url: null, template_name: null },
      ),
    [t],
  );

  const sendImage = useCallback(
    async (uri: string, mime: string, caption: string) => {
      if (!accountId) return { ok: false, error: 'Your account is still loading. Try again in a moment.' };
      try {
        const url = await uploadChatImage(accountId, uri, mime);
        return await t.send(
          { message_type: 'image', media_url: url, content_text: caption || undefined },
          { content_type: 'image', content_text: caption || null, media_url: url, template_name: null },
        );
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Could not send the photo.' };
      }
    },
    [accountId, t],
  );

  const sendTemplate = useCallback(
    (template: { name: string; language: string | null; body_text: string }, values: { body: string[]; headerText?: string; buttonParams?: Record<number, string> }, rendered: string) =>
      t.send(
        {
          message_type: 'template',
          template_name: template.name,
          template_language: template.language,
          template_message_params: { body: values.body, headerText: values.headerText, buttonParams: values.buttonParams },
          template_params: values.body,
          content_text: rendered || renderTemplateBody(template.body_text, values.body),
        },
        { content_type: 'template', content_text: rendered, media_url: null, template_name: template.name },
      ),
    [t],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: TimelineItem; index: number }) => {
      const older = t.timeline[index + 1];
      const showDay = !older || dayKey(older.created_at) !== dayKey(item.created_at);
      return (
        <View>
          {showDay ? (
            <View style={styles.dayWrap}>
              <View style={[styles.dayPill, { backgroundColor: colors.surfaceAlt }]}>
                <Text variant="caption" muted style={{ fontWeight: '600' }}>
                  {dayLabel(item.created_at)}
                </Text>
              </View>
            </View>
          ) : null}
          {item.kind === 'note' ? (
            <NoteBubble note={item.note} authorName={nameOf(item.note.author_id)} onLongPress={setNoteMenu} />
          ) : (
            <MessageBubble
              message={item.message}
              senderName={multiUser && item.message.sender_type === 'agent' ? nameOf(item.message.sender_id) : null}
              quoted={item.message.reply_to_message_id ? (byId.get(item.message.reply_to_message_id) ?? null) : null}
              reactions={reactionsByMessage.get(item.message.id)}
              onLongPress={setMenuFor}
              onRetry={async (id) => {
                const res = await t.retry(id);
                if (!res.ok) Alert.alert('Still not sent', res.error);
              }}
              onDiscard={t.discard}
            />
          )}
        </View>
      );
    },
    [byId, colors.surfaceAlt, multiUser, nameOf, reactionsByMessage, t],
  );

  if (t.loading && !conv) return <View style={{ flex: 1, backgroundColor: colors.background }}><LoadingView /></View>;
  if (!conv) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, justifyContent: 'center' }}>
        <ErrorView message={t.error ?? 'This conversation could not be found.'} onRetry={t.reload} />
        {!embedded ? (
          <Pressable onPress={() => router.back()} style={{ alignSelf: 'center', padding: 12 }}>
            <Text color={colors.primary}>Go back</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const name = contactLabel(contact);
  const statusTone = conv.status === 'open' ? 'success' : conv.status === 'pending' ? 'warning' : 'neutral';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: embedded ? 12 : insets.top + 6, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {!embedded ? (
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back to inbox" style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </Pressable>
        ) : null}
        <Pressable
          style={styles.who}
          onPress={() => contact?.id && router.push({ pathname: '/contact/[id]', params: { id: contact.id } })}
          accessibilityRole="button"
          accessibilityLabel={`Open contact ${name}`}
        >
          <Avatar name={contact?.name || contact?.phone} size={38} />
          <View style={{ flex: 1 }}>
            <Text variant="heading" numberOfLines={1} style={{ fontSize: 17 }}>
              {name}
            </Text>
            <Text variant="caption" muted numberOfLines={1}>
              {contact?.name ? `${contact.phone} · ` : ''}
              {t.window.label || ' '}
            </Text>
          </View>
        </Pressable>
        <Badge label={conv.status === 'open' ? 'Open' : conv.status === 'pending' ? 'Pending' : 'Closed'} tone={statusTone} />
        <Pressable onPress={() => setActionsOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Chat actions" style={styles.more}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </Pressable>
      </View>

      <FlatList
        data={t.timeline}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        inverted
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onEndReached={t.loadEarlier}
        onEndReachedThreshold={0.5}
        initialNumToRender={15}
        windowSize={11}
        maxToRenderPerBatch={12}
        contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={[styles.empty, { transform: [{ scaleY: -1 }] }]}>
            <Text muted>No messages yet. Say hello below.</Text>
          </View>
        }
        ListFooterComponent={t.loadingEarlier ? <ActivityIndicator style={{ padding: 16 }} color={colors.primary} /> : <View style={{ height: 8 }} />}
      />

      <Composer
        conversationId={conversationId}
        contactName={contact?.name ?? null}
        agentName={profile?.full_name ?? null}
        members={members}
        windowExpired={t.window.expired}
        readOnly={!canWrite}
        optedOut={!!contact?.opted_out_at}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        onSendText={sendText}
        onSendImage={sendImage}
        onAddNote={t.addNote}
        onOpenTemplates={() => setTemplatesOpen(true)}
      />

      <ActionsSheet
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        conversation={conv}
        members={members}
        userId={userId}
        canWrite={canWrite}
        onStatus={changeStatus}
        onAssign={assign}
        onMarkUnread={() => {
          setActionsOpen(false);
          patchConv({ unread_count: 1 });
          void markUnread(conversationId);
          if (!embedded) router.back();
        }}
        onViewContact={() => {
          setActionsOpen(false);
          if (contact?.id) router.push({ pathname: '/contact/[id]', params: { id: contact.id } });
        }}
      />

      <TemplateSheet visible={templatesOpen} onClose={() => setTemplatesOpen(false)} contactName={contact?.name ?? null} onSend={(tpl, values, rendered) => sendTemplate(tpl, values, rendered)} />

      <BottomSheet visible={!!menuFor} onClose={() => setMenuFor(null)} title="Message">
        {menuFor && canWrite && !menuFor.pending ? (
          <SheetRow
            icon="arrow-undo-outline"
            label="Reply"
            onPress={() => {
              setReplyTo(menuFor);
              setMenuFor(null);
            }}
          />
        ) : null}
        <SheetRow
          icon="copy-outline"
          label="Copy text"
          onPress={async () => {
            if (menuFor) await Clipboard.setStringAsync(messageSummary(menuFor));
            setMenuFor(null);
          }}
        />
      </BottomSheet>

      <BottomSheet visible={!!noteMenu} onClose={() => setNoteMenu(null)} title="Internal note">
        <SheetRow
          icon="copy-outline"
          label="Copy text"
          onPress={async () => {
            if (noteMenu) await Clipboard.setStringAsync(noteMenu.body);
            setNoteMenu(null);
          }}
        />
        {noteMenu && (noteMenu.author_id === userId || profile?.account_role === 'owner' || profile?.account_role === 'admin') ? (
          <SheetRow
            icon="trash-outline"
            label="Delete note"
            danger
            onPress={async () => {
              const n = noteMenu;
              setNoteMenu(null);
              try {
                await t.deleteNote(n.id);
              } catch {
                Alert.alert('Could not delete the note', 'Please try again.');
              }
            }}
          />
        ) : null}
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 36, alignItems: 'center' },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 4 },
  more: { width: 32, alignItems: 'center' },
  dayWrap: { alignItems: 'center', marginVertical: 10 },
  dayPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
