import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge } from '@/components/ui/misc';
import { Text } from '@/components/ui/Text';
import { contactLabel, previewIcon, relativeTime } from '@/features/inbox/format';
import type { InboxConversation } from '@/features/inbox/types';
import { useTheme } from '@/theme';

function Row({
  conversation: c,
  assigneeName,
  isMine,
  active,
  selecting,
  selected,
  onPress,
  onLongPress,
}: {
  conversation: InboxConversation;
  assigneeName: string | null;
  isMine: boolean;
  active?: boolean;
  selecting?: boolean;
  selected?: boolean;
  onPress: (c: InboxConversation) => void;
  onLongPress: (c: InboxConversation) => void;
}) {
  const { colors } = useTheme();
  const name = contactLabel(c.contact);
  const unread = c.unread_count > 0;
  const icon = previewIcon(c.last_message_text);
  const fromAd = !!c.contact?.ad_source_type;

  return (
    <Pressable
      onPress={() => onPress(c)}
      onLongPress={() => onLongPress(c)}
      delayLongPress={300}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${unread ? `${c.unread_count} unread. ` : ''}${c.last_message_text ?? ''}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: selected ? colors.primarySoft : active ? colors.surfaceAlt : pressed ? colors.surfaceAlt : colors.surface, borderBottomColor: colors.border },
      ]}
    >
      {selecting ? (
        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={selected ? colors.primary : colors.textMuted} />
      ) : null}
      <Avatar name={c.contact?.name || c.contact?.phone} />
      <View style={styles.main}>
        <View style={styles.line}>
          <Text variant="label" numberOfLines={1} style={[styles.name, unread && { fontWeight: '800' }]}>
            {name}
          </Text>
          <Text variant="caption" color={unread ? colors.primary : colors.textMuted}>
            {relativeTime(c.last_message_at)}
          </Text>
        </View>
        <View style={styles.line}>
          <View style={[styles.preview, { gap: 4 }]}>
            {icon ? <Ionicons name={icon} size={15} color={colors.textMuted} /> : null}
            <Text variant="caption" muted numberOfLines={1} style={[{ flex: 1 }, unread && { color: colors.text }]}>
              {c.last_message_text || 'No messages yet'}
            </Text>
          </View>
          {unread ? (
            <View style={[styles.unread, { backgroundColor: colors.primary }]}>
              <Text variant="caption" color={colors.onPrimary} style={{ fontWeight: '700', fontSize: 12 }}>
                {c.unread_count > 99 ? '99+' : c.unread_count}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.line, { justifyContent: 'flex-start', gap: 6, marginTop: 2 }]}>
          {c.status !== 'open' ? <Badge label={c.status === 'pending' ? 'Pending' : 'Closed'} tone={c.status === 'pending' ? 'warning' : 'neutral'} /> : null}
          {fromAd ? <Badge label="Ad lead" tone="info" /> : null}
          {c.assigned_agent_id ? (
            <Text variant="caption" muted numberOfLines={1}>
              {isMine ? 'You' : (assigneeName ?? 'Assigned')}
            </Text>
          ) : (
            <Text variant="caption" color={colors.warning}>
              Unassigned
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export const ConversationRow = memo(Row);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  main: { flex: 1, gap: 3 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 16 },
  preview: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  unread: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
});
