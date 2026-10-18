import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Platform, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ScreenHeader } from '@/features/settings/ScreenHeader';
import { SettingsGroup, SettingsRow } from '@/features/settings/SettingsRow';
import { useTheme } from '@/theme';

export default function About() {
  const { colors } = useTheme();
  const cfg = Constants.expoConfig;
  const build = Platform.OS === 'ios' ? cfg?.ios?.buildNumber : String(cfg?.android?.versionCode ?? '');
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="About" />
      <Screen scroll edges={[]} style={{ paddingTop: 12, gap: 20 }}>
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 12 }}>
          <View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="logo-whatsapp" size={46} color={colors.onPrimary} />
          </View>
          <Text variant="title">Repeat Grow</Text>
          <Text muted style={{ textAlign: 'center' }}>
            The WhatsApp inbox and CRM for growing businesses.
          </Text>
        </View>
        <SettingsGroup>
          <SettingsRow icon="pricetag-outline" label="Version" detail={cfg?.version ?? '1.0.0'} />
          <SettingsRow icon="construct-outline" label="Build" detail={build || '1'} />
          <SettingsRow icon="phone-portrait-outline" label="Platform" detail={`${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Platform.Version}`} last />
        </SettingsGroup>
      </Screen>
    </View>
  );
}
