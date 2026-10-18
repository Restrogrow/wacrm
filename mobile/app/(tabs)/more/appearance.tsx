import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ScreenHeader } from '@/features/settings/ScreenHeader';
import { SettingsGroup } from '@/features/settings/SettingsRow';
import { setThemePref, useThemePref, type ThemePref } from '@/lib/theme-pref';
import { useTheme } from '@/theme';

const OPTIONS: { value: ThemePref; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'system', label: 'System', hint: 'Match your phone settings', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', hint: 'Always use the light theme', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', hint: 'Always use the dark theme', icon: 'moon-outline' },
];

export default function Appearance() {
  const { colors } = useTheme();
  const pref = useThemePref();
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Appearance" />
      <Screen scroll edges={[]} style={{ paddingTop: 8 }}>
        <SettingsGroup>
          {OPTIONS.map((o, i) => (
            <Pressable
              key={o.value}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setThemePref(o.value);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: pref === o.value }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                minHeight: 60,
                paddingHorizontal: 14,
                backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                borderBottomWidth: i === OPTIONS.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              })}
            >
              <Ionicons name={o.icon} size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text>{o.label}</Text>
                <Text variant="caption" muted>
                  {o.hint}
                </Text>
              </View>
              {pref === o.value ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
            </Pressable>
          ))}
        </SettingsGroup>
      </Screen>
    </View>
  );
}
