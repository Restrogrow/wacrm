import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUnreadCount } from '@/features/inbox/unread';
import { useTheme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'inbox', title: 'Inbox', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { name: 'contacts', title: 'Contacts', icon: 'people-outline', iconActive: 'people' },
  { name: 'dashboard', title: 'Overview', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  { name: 'more', title: 'More', icon: 'menu-outline', iconActive: 'menu' },
];

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const unread = useUnreadCount();
  return (
    <Tabs
      screenListeners={{ tabPress: () => void Haptics.selectionAsync().catch(() => {}) }}
      screenOptions={{
        animation: 'shift',
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 56 + (Platform.OS === 'ios' ? insets.bottom : Math.max(insets.bottom, 8)),
          paddingBottom: Platform.OS === 'ios' ? insets.bottom : Math.max(insets.bottom, 8),
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            ...(t.name === 'inbox' && unread > 0 ? { tabBarBadge: unread > 99 ? '99+' : unread } : {}),
            tabBarIcon: ({ focused, color, size }) => <Ionicons name={focused ? t.iconActive : t.icon} size={size} color={String(color)} />,
          }}
        />
      ))}
    </Tabs>
  );
}
