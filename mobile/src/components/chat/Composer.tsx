import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet, SheetRow } from '@/components/chat/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { messageSummary, renderReply } from '@/features/inbox/format';
import { fetchSavedReplies } from '@/features/inbox/queries';
import type { InboxMessage, Member, SavedReply } from '@/features/inbox/types';
import { api, ApiError } from '@/lib/api';
import { useTheme } from '@/theme';

interface Props {
  conversationId: string;
  contactName: string | null;
  agentName: string | null;
  members: Member[];
  /** 24-hour window is closed: only templates can be sent. */
  windowExpired: boolean;
  /** viewers cannot reply */
  readOnly: boolean;
  /** customer opted out of messages */
  optedOut: boolean;
  replyTo: InboxMessage | null;
  onClearReply: () => void;
  onSendText: (text: string, replyToId: string | null) => Promise<{ ok: boolean; error?: string }>;
  onSendImage: (uri: string, mime: string, caption: string) => Promise<{ ok: boolean; error?: string }>;
  onAddNote: (body: string, mentions: string[]) => Promise<void>;
  onOpenTemplates: () => void;
}

export function Composer(p: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [saved, setSaved] = useState<SavedReply[] | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const mentionIds = useRef<Map<string, string>>(new Map()); // "@Priya" -> user id
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const isNote = mode === 'note';
  const blocked = !isNote && (p.windowExpired || p.optedOut);

  const loadSaved = useCallback(async () => {
    if (saved) return saved;
    const rows = await fetchSavedReplies();
    setSaved(rows);
    return rows;
  }, [saved]);

  // Typing "/" at the start opens quick replies filtered by shortcut.
  const slashQuery = !isNote && text.startsWith('/') && !text.includes(' ') ? text.slice(1).toLowerCase() : null;
  useEffect(() => {
    if (slashQuery !== null) void loadSaved();
  }, [slashQuery, loadSaved]);
  const slashMatches = useMemo(
    () => (slashQuery !== null && saved ? saved.filter((r) => !slashQuery || (r.shortcut ?? '').toLowerCase().startsWith(slashQuery) || r.title.toLowerCase().includes(slashQuery)).slice(0, 5) : []),
    [slashQuery, saved],
  );

  // "@" mentions in notes.
  const mentionQuery = isNote ? /(?:^|\s)@([\p{L}]*)$/u.exec(text)?.[1] ?? null : null;
  const mentionMatches = useMemo(
    () =>
      mentionQuery === null
        ? []
        : p.members.filter((m) => (m.full_name || m.email || '').toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5),
    [mentionQuery, p.members],
  );

  function insertReply(r: SavedReply) {
    setText(renderReply(r.body, { contactName: p.contactName, agentName: p.agentName }));
    setSavedOpen(false);
    inputRef.current?.focus();
  }

  function pickMention(m: Member) {
    const label = (m.full_name || m.email || 'teammate').split(/\s+/)[0];
    mentionIds.current.set(`@${label}`, m.user_id);
    setText((t) => t.replace(/@[\p{L}]*$/u, `@${label} `));
  }

  async function submit() {
    const body = text.trim();
    if (!body || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (isNote) {
      setBusy(true);
      try {
        const mentions = [...mentionIds.current.entries()].filter(([label]) => body.includes(label)).map(([, id]) => id);
        await p.onAddNote(body, [...new Set(mentions)]);
        setText('');
        mentionIds.current.clear();
      } catch (e) {
        Alert.alert('Note not saved', e instanceof Error ? e.message : 'Please try again.');
      } finally {
        setBusy(false);
      }
      return;
    }
    // Optimistic: clear the box right away; the bubble shows "sending" and a retry on failure.
    setText('');
    setSuggestions([]);
    const replyId = p.replyTo?.id.startsWith('temp-') ? null : (p.replyTo?.id ?? null);
    p.onClearReply();
    const res = await p.onSendText(body, replyId);
    if (!res.ok && res.error) Alert.alert('Message not sent', res.error);
  }

  async function pickImage(source: 'camera' | 'library') {
    setAttachOpen(false);
    try {
      // The gallery opens the system photo picker, which needs no photo
      // permission (the app doesn't hold READ_MEDIA_IMAGES; Play policy).
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission needed', 'Allow access to your camera in Settings to take pictures.');
          return;
        }
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setBusy(true);
      const res = await p.onSendImage(asset.uri, asset.mimeType ?? 'image/jpeg', text.trim().slice(0, 1024));
      if (res.ok) setText('');
      else if (res.error) Alert.alert('Photo not sent', res.error);
    } catch {
      Alert.alert('Could not get the photo', 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function suggest() {
    if (suggesting) return;
    setSuggesting(true);
    try {
      const res = await api<{ suggestions?: string[] }>(`/api/inbox/conversations/${p.conversationId}/suggest-replies`, { method: 'POST', body: {} });
      setSuggestions((res.suggestions ?? []).slice(0, 3));
      if (!res.suggestions?.length) Alert.alert('No suggestions', 'There is not enough in this chat to suggest a reply yet.');
    } catch (e) {
      // 503 = AI not set up for this workspace: stay quiet, as on the web.
      if (e instanceof ApiError && (e.code === 'ai_not_configured' || /not configured/i.test(e.message))) Alert.alert('AI is not set up', 'Ask an admin to turn on AI suggestions for your workspace.');
      else if (e instanceof ApiError && e.status === 429) Alert.alert('Daily limit reached', e.message);
      else if (!(e instanceof ApiError && e.status === 503)) Alert.alert('Could not get suggestions', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSuggesting(false);
    }
  }

  const bottomPad = Math.max(insets.bottom, 8);

  if (p.readOnly) {
    return (
      <View style={[styles.banner, { backgroundColor: colors.surfaceAlt, paddingBottom: bottomPad }]}>
        <Ionicons name="eye-outline" size={18} color={colors.textMuted} />
        <Text variant="caption" muted style={{ flex: 1 }}>
          You have view-only access, so you cannot reply in this chat.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: bottomPad }}>
      {blocked ? (
        <View style={[styles.banner, { backgroundColor: colors.warningSoft }]}>
          <Ionicons name={p.optedOut ? 'ban-outline' : 'time-outline'} size={18} color={colors.warning} />
          <Text variant="caption" style={{ flex: 1 }}>
            {p.optedOut ? 'This customer opted out of messages. You can still add internal notes.' : 'The 24-hour reply window has closed. Send an approved template to start the chat again.'}
          </Text>
          {!p.optedOut ? <Button small title="Send template" onPress={p.onOpenTemplates} /> : null}
        </View>
      ) : null}

      {slashMatches.length > 0 ? (
        <View style={[styles.popup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {slashMatches.map((r) => (
            <Pressable key={r.id} onPress={() => insertReply(r)} style={styles.popupRow} accessibilityRole="button">
              <Text variant="label" color={colors.primary}>
                /{r.shortcut}
              </Text>
              <Text variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
                {r.title}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {mentionMatches.length > 0 ? (
        <View style={[styles.popup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {mentionMatches.map((m) => (
            <Pressable key={m.user_id} onPress={() => pickMention(m)} style={styles.popupRow} accessibilityRole="button">
              <Text variant="label">{m.full_name || m.email}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {suggestions.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          {suggestions.map((s, i) => (
            <Pressable
              key={i}
              onPress={() => {
                setText(s);
                setSuggestions([]);
                inputRef.current?.focus();
              }}
              style={[styles.chip, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
              accessibilityRole="button"
            >
              <Text variant="caption" numberOfLines={2} style={{ maxWidth: 240 }}>
                {s}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {p.replyTo && !isNote ? (
        <View style={[styles.replyBar, { backgroundColor: colors.surfaceAlt, borderLeftColor: colors.primary }]}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color={colors.primary} style={{ fontWeight: '700' }}>
              Replying to {p.replyTo.sender_type === 'customer' ? 'customer' : 'your message'}
            </Text>
            <Text variant="caption" muted numberOfLines={1}>
              {messageSummary(p.replyTo)}
            </Text>
          </View>
          <Pressable onPress={p.onClearReply} hitSlop={10} accessibilityLabel="Cancel reply">
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.modeRow}>
        {(['reply', 'note'] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} accessibilityRole="button" accessibilityState={{ selected: mode === m }} style={[styles.modeBtn, mode === m && { backgroundColor: m === 'note' ? colors.bubbleNote : colors.primarySoft }]}>
            <Ionicons name={m === 'note' ? 'lock-closed-outline' : 'chatbubble-outline'} size={14} color={mode === m ? (m === 'note' ? colors.warning : colors.primary) : colors.textMuted} />
            <Text variant="caption" color={mode === m ? colors.text : colors.textMuted} style={{ fontWeight: '600' }}>
              {m === 'reply' ? 'Reply' : 'Internal note'}
            </Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        {!isNote ? (
          <Pressable onPress={suggest} disabled={suggesting || blocked} hitSlop={8} accessibilityRole="button" accessibilityLabel="Suggest a reply with AI" style={{ opacity: blocked ? 0.4 : 1 }}>
            {suggesting ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="sparkles-outline" size={22} color={colors.primary} />}
          </Pressable>
        ) : null}
      </View>

      <View style={styles.inputRow}>
        {!isNote ? (
          <>
            <Pressable onPress={() => setAttachOpen(true)} disabled={blocked || busy} hitSlop={8} accessibilityRole="button" accessibilityLabel="Attach a photo" style={[styles.iconBtn, { opacity: blocked ? 0.4 : 1 }]}>
              <Ionicons name="image-outline" size={26} color={colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={async () => {
                await loadSaved();
                setSavedOpen(true);
              }}
              disabled={blocked}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Quick replies"
              style={[styles.iconBtn, { opacity: blocked ? 0.4 : 1 }]}
            >
              <Ionicons name="flash-outline" size={25} color={colors.textMuted} />
            </Pressable>
          </>
        ) : null}
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          editable={!blocked}
          multiline
          maxLength={4096}
          placeholder={blocked ? 'Replies are paused' : isNote ? 'Write a note for your team. Use @ to mention.' : 'Type a message. Start with / for quick replies.'}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, backgroundColor: isNote ? colors.bubbleNote : colors.surfaceAlt }]}
          accessibilityLabel={isNote ? 'Internal note' : 'Message'}
        />
        <Pressable
          onPress={submit}
          disabled={!text.trim() || busy || blocked}
          accessibilityRole="button"
          accessibilityLabel={isNote ? 'Save note' : 'Send message'}
          style={[styles.send, { backgroundColor: colors.primary, opacity: !text.trim() || busy || blocked ? 0.45 : 1 }]}
        >
          {busy ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Ionicons name={isNote ? 'checkmark' : 'send'} size={20} color={colors.onPrimary} />}
        </Pressable>
      </View>

      <BottomSheet visible={attachOpen} onClose={() => setAttachOpen(false)} title="Send a photo">
        <SheetRow icon="camera-outline" label="Take a photo" onPress={() => pickImage('camera')} />
        <SheetRow icon="images-outline" label="Choose from library" onPress={() => pickImage('library')} />
      </BottomSheet>

      <BottomSheet visible={savedOpen} onClose={() => setSavedOpen(false)} title="Quick replies">
        {saved && saved.length === 0 ? (
          <Text muted style={{ padding: 12 }}>
            No quick replies yet. Add them on the web under Settings, Saved replies.
          </Text>
        ) : (
          (saved ?? []).map((r) => <SheetRow key={r.id} icon="flash-outline" label={r.title} hint={r.body} onPress={() => insertReply(r)} />)
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  popup: { marginHorizontal: 12, marginTop: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: 'hidden' },
  popupRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  chips: { paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 8, padding: 8, borderRadius: 10, borderLeftWidth: 3 },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 8 },
  modeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 10, paddingTop: 6 },
  iconBtn: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, maxHeight: 130, minHeight: 44, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 16 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
