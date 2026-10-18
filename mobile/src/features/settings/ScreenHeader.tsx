import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme';

/** Safe-area aware header. `large` = big tab title, otherwise a back button + title. */
export function ScreenHeader({ title, large, right }: { title: string; large?: boolean; right?: React.ReactNode }) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  if (large) {
    return (
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {right}
      </View>
    );
  }
  return (
    <View
      style={{
        paddingTop: insets.top + 4,
        paddingHorizontal: 8,
        paddingBottom: 6,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.background,
      }}
    >
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/more'))}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <Text variant="heading" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}
