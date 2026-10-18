import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View, type ViewStyle } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/misc';
import { Text } from '@/components/ui/Text';
import { usePushPermission } from '@/providers/push';
import { useTheme } from '@/theme';

const DISMISSED_KEY = 'rg.push.prompt.dismissed.v1';

const BENEFITS = ['New customer messages, the moment they arrive', 'When a teammate mentions you or assigns you a chat', 'Only what needs you. Mute any time in Settings'];

/**
 * One-time "Turn on notifications" soft-ask. Explains why before the system
 * prompt appears, which is far more likely to be accepted than an unexplained
 * prompt on first launch. Renders nothing when notifications are already on,
 * or after the user taps "Not now". Drop it at the top of Inbox or More:
 *
 *   <NotificationPrompt />
 *
 * `alwaysShowIfOff` keeps it visible (with an "Open Settings" action) after the
 * user blocked notifications, for a settings screen.
 */
export function NotificationPrompt({ style, alwaysShowIfOff }: { style?: ViewStyle; alwaysShowIfOff?: boolean }) {
  const { colors } = useTheme();
  const { status, canAskAgain, request } = usePushPermission();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then((v) => setDismissed(v === '1'));
  }, []);

  if (dismissed === null || status === 'granted') return null;
  const blocked = status === 'denied' && !canAskAgain;
  if (!alwaysShowIfOff && (dismissed || blocked)) return null;

  return (
    <Card style={style}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="notifications" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="heading">Never miss a customer</Text>
          <Text variant="caption" muted>
            Turn on notifications to reply fast.
          </Text>
        </View>
      </View>

      <View style={{ gap: 8, marginTop: 14, marginBottom: 16 }}>
        {BENEFITS.map((b) => (
          <View key={b} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Ionicons name="checkmark-circle" size={18} color={colors.primary} style={{ marginTop: 1 }} />
            <Text variant="caption" style={{ flex: 1 }}>
              {b}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          title={blocked ? 'Open Settings' : 'Turn on'}
          icon={blocked ? 'settings-outline' : 'notifications-outline'}
          loading={busy}
          style={{ flex: 1 }}
          onPress={async () => {
            setBusy(true);
            try {
              await request();
            } finally {
              setBusy(false);
            }
          }}
        />
        {!blocked ? (
          <Button
            title="Not now"
            variant="secondary"
            onPress={async () => {
              await AsyncStorage.setItem(DISMISSED_KEY, '1');
              setDismissed(true);
            }}
          />
        ) : null}
      </View>
    </Card>
  );
}
