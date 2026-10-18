import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';

import { FormError } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/misc';
import { MIN_PASSWORD } from '@/features/auth/options';
import { ScreenHeader } from '@/features/settings/ScreenHeader';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';

export default function Security() {
  const { colors } = useTheme();
  const { profile } = useSession();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setError(null);
    setSaved(false);
    if (next.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (next !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: next, data: { has_password: true } });
    setLoading(false);
    if (err) {
      setError(/same|different/i.test(err.message) ? 'Choose a password you have not used before.' : err.message);
      return;
    }
    setNext('');
    setConfirm('');
    setSaved(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Security" />
      <Screen scroll edges={[]} style={{ paddingTop: 8, gap: 16, paddingBottom: 32 }}>
        <Card style={{ gap: 14 }}>
          <View style={{ gap: 4 }}>
            <Text variant="heading">Change password</Text>
            <Text variant="caption" muted>
              Signed in as {profile?.email ?? 'your account'}. You stay signed in on this phone.
            </Text>
          </View>
          <FormError message={error} />
          {saved ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: colors.primarySoft }}>
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
              <Text variant="caption" color={colors.primary}>
                Your password was updated.
              </Text>
            </View>
          ) : null}
          <Input label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" textContentType="newPassword" placeholder={`At least ${MIN_PASSWORD} characters`} />
          <Input label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" textContentType="newPassword" placeholder="Repeat the new password" />
          <Button title="Update password" onPress={save} loading={loading} disabled={!next || !confirm} />
        </Card>
      </Screen>
    </View>
  );
}
