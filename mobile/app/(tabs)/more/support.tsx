import * as WebBrowser from 'expo-web-browser';
import { Linking, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { SITE_URL, SUPPORT_EMAIL } from '@/config';
import { ScreenHeader } from '@/features/settings/ScreenHeader';
import { SettingsGroup, SettingsRow } from '@/features/settings/SettingsRow';

export default function Support() {
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Help and support" />
      <Screen scroll edges={[]} style={{ paddingTop: 8 }}>
        <SettingsGroup>
          <SettingsRow icon="book-outline" label="Help center" onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/docs`)} />
          <SettingsRow icon="mail-outline" label="Email support" detail={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Repeat%20Grow%20app%20help`)} />
          <SettingsRow icon="chatbubble-ellipses-outline" label="Contact page" onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/contact`)} last />
        </SettingsGroup>
      </Screen>
    </View>
  );
}
