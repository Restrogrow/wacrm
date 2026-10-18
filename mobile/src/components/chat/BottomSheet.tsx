import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme';

/** Simple modal bottom sheet (centered card on tablets). */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  scroll = true,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const wide = width >= 768;
  const body = scroll ? (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
      {children}
    </ScrollView>
  ) : (
    children
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.overlay, { backgroundColor: colors.overlay, justifyContent: wide ? 'center' : 'flex-end', alignItems: wide ? 'center' : 'stretch' }]} onPress={onClose}>
        <Pressable
          onPress={() => {}}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              maxHeight: height * 0.85,
              paddingBottom: Math.max(insets.bottom, 12),
              borderRadius: 24,
              borderBottomLeftRadius: wide ? 24 : 0,
              borderBottomRightRadius: wide ? 24 : 0,
              width: wide ? 520 : undefined,
            },
          ]}
        >
          <View style={styles.header}>
            <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
              {title ?? ''}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close" accessibilityRole="button">
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          {body}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A tappable row for action sheets. */
export function SheetRow({
  icon,
  label,
  onPress,
  danger,
  selected,
  hint,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  selected?: boolean;
  hint?: string;
}) {
  const { colors } = useTheme();
  const color = danger ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
    >
      {icon ? <Ionicons name={icon} size={22} color={danger ? colors.danger : colors.textMuted} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color }}>{label}</Text>
        {hint ? (
          <Text variant="caption" muted>
            {hint}
          </Text>
        ) : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  sheet: { paddingHorizontal: 16, paddingTop: 16 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 12 },
});
