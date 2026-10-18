import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/misc';
import { ScreenHeader } from '@/features/settings/ScreenHeader';
import { useTheme } from '@/theme';

type State = 'loading' | 'granted' | 'denied' | 'undetermined';

export default function NotificationSettings() {
  const { colors } = useTheme();
  const [state, setState] = useState<State>('loading');
  const [asking, setAsking] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const p = await Notifications.getPermissionsAsync();
      setState(p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied');
    } catch {
      setState('undetermined');
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Come back from the system settings screen and the status updates itself.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    return () => sub.remove();
  }, [refresh]);

  const ask = async () => {
    setAsking(true);
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      /* ignore */
    }
    setAsking(false);
    void refresh();
  };

  const on = state === 'granted';
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Notifications" />
      <Screen scroll edges={[]} style={{ paddingTop: 8, gap: 16 }}>
        <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primarySoft : colors.surfaceAlt }}>
            <Ionicons name={on ? 'notifications' : 'notifications-off-outline'} size={34} color={on ? colors.primary : colors.textMuted} />
          </View>
          <Text variant="heading">{state === 'loading' ? 'Checking...' : on ? 'Notifications are on' : 'Notifications are off'}</Text>
          <Text muted style={{ textAlign: 'center' }}>
            {on
              ? 'You will get an alert when a customer messages you or a chat is assigned to you.'
              : 'Turn them on so you never miss a customer message, even when the app is closed.'}
          </Text>
          {state === 'undetermined' ? <Button title="Turn on notifications" icon="notifications-outline" onPress={ask} loading={asking} /> : null}
          {state === 'denied' || on ? (
            <Button
              title={on ? 'Manage in phone settings' : 'Open phone settings'}
              variant={on ? 'secondary' : 'primary'}
              icon="settings-outline"
              onPress={() => (Platform.OS === 'ios' ? Linking.openURL('app-settings:') : Linking.openSettings())}
            />
          ) : null}
        </Card>
      </Screen>
    </View>
  );
}
