import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Avatar, Badge, Card } from '@/components/ui/misc';
import { SITE_URL, SUPPORT_EMAIL } from '@/config';
import { ScreenHeader } from '@/features/settings/ScreenHeader';
import { SettingsGroup, SettingsRow } from '@/features/settings/SettingsRow';
import { supabase } from '@/lib/supabase';
import { useThemePref } from '@/lib/theme-pref';
import { NotificationPrompt } from '@/features/push/NotificationPrompt';
import { useSession } from '@/providers/session';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', agent: 'Agent', viewer: 'Viewer' } as const;
const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const;

export default function More() {
  const router = useRouter();
  const { profile, role, accountId, signOut } = useSession();
  const pref = useThemePref();
  const [accountName, setAccountName] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) return;
    supabase
      .from('accounts')
      .select('name')
      .eq('id', accountId)
      .maybeSingle()
      .then(({ data }) => setAccountName((data as { name: string } | null)?.name ?? null));
  }, [accountId]);

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will need to sign in again to see your chats.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);

  const name = profile?.full_name?.trim() || profile?.email || 'Your account';

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="More" large />
      <Screen scroll edges={[]} style={{ gap: 20, paddingBottom: 32, paddingTop: 4 }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={name} size={56} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="heading" numberOfLines={1}>
              {name}
            </Text>
            {profile?.email ? (
              <Text variant="caption" muted numberOfLines={1}>
                {profile.email}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              {role ? <Badge label={ROLE_LABEL[role]} tone="success" /> : null}
              {accountName ? (
                <Text variant="caption" muted numberOfLines={1} style={{ flexShrink: 1 }}>
                  {accountName}
                </Text>
              ) : null}
            </View>
          </View>
        </Card>

        <NotificationPrompt />

        <SettingsGroup title="Preferences">
          <SettingsRow icon="color-palette-outline" label="Appearance" detail={THEME_LABEL[pref]} onPress={() => router.push('/(tabs)/more/appearance')} />
          <SettingsRow icon="notifications-outline" label="Notifications" onPress={() => router.push('/(tabs)/more/notifications')} />
          <SettingsRow icon="lock-closed-outline" label="Security" onPress={() => router.push('/(tabs)/more/security')} last />
        </SettingsGroup>

        <SettingsGroup title="Help">
          <SettingsRow icon="help-buoy-outline" label="Help and support" onPress={() => router.push('/(tabs)/more/support')} />
          <SettingsRow icon="globe-outline" label="Open web dashboard" onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/dashboard`)} />
          <SettingsRow icon="mail-outline" label="Email us" detail={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} last />
        </SettingsGroup>

        <SettingsGroup title="About">
          <SettingsRow icon="shield-checkmark-outline" label="Legal" onPress={() => router.push('/legal')} />
          <SettingsRow
            icon="information-circle-outline"
            label="About Repeat Grow"
            detail={`v${Constants.expoConfig?.version ?? '1.0.0'}`}
            onPress={() => router.push('/(tabs)/more/about')}
            last
          />
        </SettingsGroup>

        <SettingsGroup title="Account">
          <SettingsRow icon="log-out-outline" label="Sign out" onPress={confirmSignOut} chevron={false} />
          <SettingsRow icon="trash-outline" label="Delete account" danger onPress={() => router.push('/(tabs)/more/delete-account')} last />
        </SettingsGroup>
      </Screen>
    </View>
  );
}
