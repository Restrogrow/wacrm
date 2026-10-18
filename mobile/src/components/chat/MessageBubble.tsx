import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { memo } from 'react';

import { AudioMessage, FileMessage, ImageMessage } from '@/components/chat/MediaViews';
import { Text } from '@/components/ui/Text';
import { clockTime, messageSummary } from '@/features/inbox/format';
import type { InboxMessage, InboxReaction } from '@/features/inbox/types';
import { useTheme } from '@/theme';

function Ticks({ status }: { status: InboxMessage['status'] }) {
  const { colors } = useTheme();
  if (status === 'sending') return <Ionicons name="time-outline" size={13} color={colors.textMuted} />;
  if (status === 'failed') return <Ionicons name="alert-circle" size={14} color={colors.danger} />;
  if (status === 'sent') return <Ionicons name="checkmark" size={14} color={colors.textMuted} />;
  return <Ionicons name="checkmark-done" size={14} color={status === 'read' ? '#3b82f6' : colors.textMuted} />;
}

function parseLocation(text: string | null): { lat: number; lng: number } | null {
  const m = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(text ?? '');
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function Body({ m, mine }: { m: InboxMessage; mine: boolean }) {
  const { colors } = useTheme();
  const text = m.content_text?.trim();
  switch (m.content_type) {
    case 'image':
      return (
        <View style={{ gap: 6 }}>
          {m.media_url ? <ImageMessage url={m.media_url} alt="Photo in chat" /> : null}
          {text ? <Text>{text}</Text> : null}
        </View>
      );
    case 'audio':
      return (
        <View style={{ gap: 6 }}>
          {m.media_url ? <AudioMessage url={m.media_url} mine={mine} /> : <Text muted>Voice message</Text>}
          {m.ai_transcript?.transcript ? (
            <Text variant="caption" muted>
              {m.ai_transcript.transcript}
            </Text>
          ) : null}
        </View>
      );
    case 'video':
    case 'document':
      return (
        <View style={{ gap: 6 }}>
          {m.media_url ? (
            <FileMessage url={m.media_url} label={m.content_type === 'video' ? 'Video' : 'Document'} icon={m.content_type === 'video' ? 'videocam' : 'document-text'} name={text && text.length < 60 ? text : undefined} />
          ) : (
            <Text muted>{m.content_type === 'video' ? 'Video' : 'Document'} unavailable</Text>
          )}
          {text && text.length >= 60 ? <Text>{text}</Text> : null}
        </View>
      );
    case 'location': {
      const loc = parseLocation(m.content_text);
      return (
        <Pressable
          onPress={() => loc && Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`)}
          accessibilityRole="link"
          style={styles.location}
        >
          <Ionicons name="location" size={22} color={colors.danger} />
          <Text>{loc ? 'Shared a location (tap to open in maps)' : text || 'Shared a location'}</Text>
        </Pressable>
      );
    }
    case 'template':
      return (
        <View style={{ gap: 4 }}>
          <View style={styles.tplTag}>
            <Ionicons name="document-text-outline" size={13} color={colors.textMuted} />
            <Text variant="caption" muted>
              Template{m.template_name ? `: ${m.template_name}` : ''}
            </Text>
          </View>
          {text ? <Text>{text}</Text> : null}
        </View>
      );
    case 'interactive':
      return (
        <View style={{ gap: 4 }}>
          <View style={styles.tplTag}>
            <Ionicons name="return-down-forward-outline" size={13} color={colors.textMuted} />
            <Text variant="caption" muted>
              Tapped a button
            </Text>
          </View>
          <Text>{text || messageSummary(m)}</Text>
        </View>
      );
    default:
      return <Text>{text || messageSummary(m)}</Text>;
  }
}

function Bubble({
  message: m,
  senderName,
  quoted,
  reactions,
  onLongPress,
  onRetry,
  onDiscard,
}: {
  message: InboxMessage;
  senderName?: string | null;
  quoted?: InboxMessage | null;
  reactions?: InboxReaction[];
  onLongPress?: (m: InboxMessage) => void;
  onRetry?: (id: string) => void;
  onDiscard?: (id: string) => void;
}) {
  const { colors } = useTheme();
  const mine = m.sender_type !== 'customer';
  const failed = m.status === 'failed';
  return (
    <View style={[styles.wrap, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
      <Pressable
        onLongPress={() => onLongPress?.(m)}
        delayLongPress={250}
        accessibilityLabel={`${mine ? 'You' : 'Customer'}: ${messageSummary(m)}`}
        style={[
          styles.bubble,
          { backgroundColor: mine ? colors.bubbleOut : colors.bubbleIn, borderColor: failed ? colors.danger : colors.border, borderBottomRightRadius: mine ? 4 : 18, borderBottomLeftRadius: mine ? 18 : 4 },
        ]}
      >
        {m.sender_type === 'bot' ? (
          <Text variant="caption" color={colors.info} style={{ fontWeight: '600' }}>
            Automated
          </Text>
        ) : mine && senderName ? (
          <Text variant="caption" muted style={{ fontWeight: '600' }}>
            {senderName}
          </Text>
        ) : null}
        {quoted ? (
          <View style={[styles.quote, { backgroundColor: colors.surfaceAlt, borderLeftColor: colors.primary }]}>
            <Text variant="caption" muted numberOfLines={2}>
              {messageSummary(quoted)}
            </Text>
          </View>
        ) : null}
        <Body m={m} mine={mine} />
        <View style={styles.meta}>
          <Text variant="caption" muted style={{ fontSize: 11 }}>
            {clockTime(m.created_at)}
          </Text>
          {mine ? <Ticks status={m.status} /> : null}
        </View>
      </Pressable>
      {reactions && reactions.length > 0 ? (
        <View style={[styles.reactions, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text>{[...new Set(reactions.map((r) => r.emoji))].join(' ')}</Text>
        </View>
      ) : null}
      {failed ? (
        <View style={styles.failRow}>
          <Text variant="caption" color={colors.danger}>
            Not sent.
          </Text>
          {m.pending ? (
            <>
              <Pressable onPress={() => onRetry?.(m.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retry sending">
                <Text variant="caption" color={colors.primary} style={{ fontWeight: '700' }}>
                  Retry
                </Text>
              </Pressable>
              <Pressable onPress={() => onDiscard?.(m.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Discard message">
                <Text variant="caption" muted style={{ fontWeight: '700' }}>
                  Delete
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const MessageBubble = memo(Bubble);

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, marginVertical: 2 },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, gap: 4, borderWidth: StyleSheet.hairlineWidth },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 },
  quote: { borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  tplTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reactions: { marginTop: -6, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 6, paddingVertical: 1 },
  failRow: { flexDirection: 'row', gap: 12, marginTop: 2, paddingHorizontal: 4 },
});
