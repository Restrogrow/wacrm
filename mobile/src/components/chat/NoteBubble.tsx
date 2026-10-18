import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { clockTime } from '@/features/inbox/format';
import type { InboxNote } from '@/features/inbox/types';
import { useTheme } from '@/theme';

function Note({ note, authorName, onLongPress }: { note: InboxNote; authorName?: string | null; onLongPress?: (n: InboxNote) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Pressable
        onLongPress={() => onLongPress?.(note)}
        delayLongPress={250}
        accessibilityLabel={`Internal note: ${note.body}`}
        style={[styles.note, { backgroundColor: colors.bubbleNote, borderColor: colors.warning }]}
      >
        <View style={styles.head}>
          <Ionicons name="lock-closed" size={12} color={colors.warning} />
          <Text variant="caption" color={colors.warning} style={{ fontWeight: '700' }}>
            Internal note{authorName ? ` · ${authorName}` : ''}
          </Text>
        </View>
        <Text>{note.body}</Text>
        <Text variant="caption" muted style={{ fontSize: 11, alignSelf: 'flex-end' }}>
          {clockTime(note.created_at)} · only your team can see this
        </Text>
      </Pressable>
    </View>
  );
}

export const NoteBubble = memo(Note);

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, marginVertical: 4, alignItems: 'center' },
  note: { width: '92%', borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', padding: 10, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
