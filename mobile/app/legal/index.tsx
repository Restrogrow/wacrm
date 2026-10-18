import * as WebBrowser from 'expo-web-browser';
import { View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { PRIVACY_URL, TERMS_URL } from '@/config';
import { ScreenHeader } from '@/features/settings/ScreenHeader';
import { SettingsGroup, SettingsRow } from '@/features/settings/SettingsRow';

export default function Legal() {
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Legal" />
      <Screen scroll edges={[]} style={{ paddingTop: 8 }}>
        <SettingsGroup>
          <SettingsRow icon="shield-checkmark-outline" label="Privacy policy" onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} />
          <SettingsRow icon="document-text-outline" label="Terms of service" onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} last />
        </SettingsGroup>
      </Screen>
    </View>
  );
}
