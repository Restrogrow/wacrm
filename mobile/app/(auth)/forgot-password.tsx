import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthShell, FormError } from '@/components/auth/AuthShell';
import { friendlyAuthError, useCaptcha } from '@/components/auth/useCaptcha';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { SITE_URL } from '@/config';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

export default function ForgotPassword() {
  const { colors } = useTheme();
  const router = useRouter();
  const captcha = useCaptcha();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter the email address you signed up with.');
      return;
    }
    if (captcha.required && !captcha.token) {
      setError('Please complete the security check first.');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${SITE_URL}/auth/callback?next=/reset-password`,
      ...captcha.captchaOptions,
    });
    setLoading(false);
    if (err) {
      setError(friendlyAuthError(err.message));
      captcha.reset();
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthShell title="Check your email" back>
        <View style={{ alignItems: 'center', gap: 14, paddingVertical: 12 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="mail-open-outline" size={38} color={colors.primary} />
          </View>
          <Text muted style={{ textAlign: 'center' }}>
            If an account exists for {email.trim()}, we have sent a link to reset your password. Open it on this phone, set a new password, then sign in here.
          </Text>
        </View>
        <Button title="Back to sign in" onPress={() => router.replace('/(auth)/login')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we will send you a link to choose a new one." back>
      <View style={{ gap: 14 }}>
        <FormError message={error} />
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@company.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {captcha.widget}
        <Button title="Send reset link" onPress={submit} loading={loading} disabled={captcha.required && !captcha.token} />
      </View>
    </AuthShell>
  );
}
