import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AuthShell, FormError } from '@/components/auth/AuthShell';
import { friendlyAuthError, useCaptcha } from '@/components/auth/useCaptcha';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { signInToDemo } from '@/features/auth/demo';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

export default function Login() {
  const { colors } = useTheme();
  const router = useRouter();
  const captcha = useCaptcha();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoGone, setDemoGone] = useState(false);

  const needsCaptcha = captcha.required && !captcha.token;

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (needsCaptcha) {
      setError('Please complete the security check first.');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: captcha.captchaOptions,
    });
    setLoading(false);
    if (err) {
      setError(friendlyAuthError(err.message));
      captcha.reset();
    }
    // On success the session provider updates and the root gate moves us into the app.
  };

  const tryDemo = async () => {
    setError(null);
    if (needsCaptcha) {
      setError('Please complete the security check first.');
      return;
    }
    setDemoLoading(true);
    const res = await signInToDemo(captcha.token);
    setDemoLoading(false);
    if (!res.ok) {
      if (res.unavailable) setDemoGone(true);
      else setError(res.message);
      captcha.reset();
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your Repeat Grow account to continue.">
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
          textContentType="username"
          returnKeyType="next"
        />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Pressable onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8} style={{ alignSelf: 'flex-end' }} accessibilityRole="link">
          <Text variant="label" color={colors.primary}>
            Forgot password?
          </Text>
        </Pressable>

        {captcha.widget}

        <Button title="Sign in" onPress={submit} loading={loading} disabled={needsCaptcha} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Text variant="caption" muted>
          or
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>

      {!demoGone ? (
        <Button title="Try the demo" icon="play-circle-outline" variant="secondary" onPress={tryDemo} loading={demoLoading} disabled={needsCaptcha} />
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        <Text muted>New to Repeat Grow?</Text>
        <Link href="/(auth)/signup" asChild>
          <Pressable accessibilityRole="link" hitSlop={8}>
            <Text variant="label" color={colors.primary} style={{ fontSize: 16 }}>
              Create account
            </Text>
          </Pressable>
        </Link>
      </View>
    </AuthShell>
  );
}
