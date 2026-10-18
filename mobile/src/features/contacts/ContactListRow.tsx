import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge } from '@/components/ui/misc';
import { Text } from '@/components/ui/Text';
import { fmtPhone } from '@/features/dashboard/fmt';
import { useTheme } from '@/theme';
import type { ContactRow, Tag } from './data';

export function TagPill({ tag }: { tag: Tag }) {
  const color = /^#[0-9a-fA-F]{6}$/.test(tag.color) ? tag.color : '#6b7280';
  return (
    <View style={{ backgroundColor: `${color}22`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text variant="caption" color={color} style={{ fontSize: 11, fontWeight: '700' }}>
        {tag.name}
      </Text>
    </View>
  );
}

function RowImpl({ contact, onPress }: { contact: ContactRow; onPress: (id: string) => void }) {
  const { colors } = useTheme();
  const title = contact.name?.trim() || fmtPhone(contact.phone);
  return (
    <Pressable
      onPress={() => onPress(contact.id)}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${fmtPhone(contact.phone)}`}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderBottomColor: colors.border }]}
    >
      <Avatar name={contact.name || contact.phone} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="body" numberOfLines={1} style={{ fontWeight: '600' }}>
          {title}
        </Text>
        <Text variant="caption" muted numberOfLines={1}>
          {contact.name ? fmtPhone(contact.phone) : contact.email || contact.company || ' '}
        </Text>
        {contact.tags.length > 0 || contact.opted_out_at || contact.ad_source_type ? (
          <View style={styles.tags}>
            {contact.opted_out_at ? <Badge label="Opted out" tone="danger" /> : null}
            {contact.ad_source_type ? <Badge label="Ad lead" tone="warning" /> : null}
            {contact.tags.slice(0, 3).map((t) => (
              <TagPill key={t.id} tag={t} />
            ))}
            {contact.tags.length > 3 ? (
              <Text variant="caption" muted>
                +{contact.tags.length - 3}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export const ContactListRow = memo(RowImpl);

export function ContactRowSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt }} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ height: 14, width: '55%', borderRadius: 6, backgroundColor: colors.surfaceAlt }} />
        <View style={{ height: 12, width: '35%', borderRadius: 6, backgroundColor: colors.surfaceAlt }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 },
});
