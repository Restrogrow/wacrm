import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme';

/** Shared frame for the sign-in screens: brand mark, title, centred column. */
export function AuthShell({
  title,
  subtitle,
  back,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Screen scroll style={{ paddingBottom: 32 }}>
      <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center', gap: 22, paddingTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
          {back ? (
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'))}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
          ) : (
            <View />
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="logo-whatsapp" size={18} color={colors.onPrimary} />
            </View>
            <Text variant="heading">Repeat Grow</Text>
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text muted>{subtitle}</Text> : null}
        </View>
        {children}
      </View>
    </Screen>
  );
}

export function FormError({ message }: { message: string | null }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.dangerSoft, alignItems: 'flex-start' }}
    >
      <Ionicons name="alert-circle" size={18} color={colors.danger} style={{ marginTop: 1 }} />
      <Text variant="caption" color={colors.danger} style={{ flex: 1 }}>
        {message}
      </Text>
    </View>
  );
}
