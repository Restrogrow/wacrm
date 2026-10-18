import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AuthShell, FormError } from '@/components/auth/AuthShell';
import { SelectField } from '@/components/auth/SelectField';
import { friendlyAuthError, useCaptcha } from '@/components/auth/useCaptcha';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { PRIVACY_URL, TERMS_URL } from '@/config';
import { MIN_PASSWORD, NATURE_OF_BUSINESS_OPTIONS, TEAM_SIZE_OPTIONS } from '@/features/auth/options';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

export default function Signup() {
  const { colors } = useTheme();
  const router = useRouter();
  const captcha = useCaptcha();

  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [mobile, setMobile] = useState('');
  const [nature, setNature] = useState('');
  const [team, setTeam] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [resent, setResent] = useState(false);

  const nextStep = () => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = 'Enter your name.';
    if (!businessName.trim()) e.businessName = 'Enter your business name.';
    if (mobile.replace(/\D/g, '').length < 8) e.mobile = 'Enter a valid mobile number.';
    if (!nature) e.nature = 'Select the nature of your business.';
    if (!team) e.team = 'Select your team size.';
    setErrors(e);
    if (Object.keys(e).length === 0) setStep(2);
  };

  const submit = async () => {
    setFormError(null);
    const e: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Enter a valid email address.';
    if (password.length < MIN_PASSWORD) e.password = `Password must be at least ${MIN_PASSWORD} characters.`;
    if (password !== confirm) e.confirm = 'Passwords do not match.';
    if (!agree) e.agree = 'Please accept the Terms and Privacy Policy.';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (captcha.required && !captcha.token) {
      setFormError('Please complete the security check first.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          business_name: businessName.trim(),
          mobile_number: mobile.trim(),
          nature_of_business: nature,
          team_size: team,
        },
        ...captcha.captchaOptions,
      },
    });
    setLoading(false);
    if (error) {
      captcha.reset();
      // The signup guard rejects disposable emails and mailboxes that already had a trial;
      // Supabase reports that as a generic database error.
      setFormError(
        /signup_blocked|database error saving new user/i.test(error.message)
          ? 'We could not create an account with this email. Use your real work email, or sign in if you already have an account. Need help? Email support@repeatgrow.com.'
          : friendlyAuthError(error.message),
      );
      return;
    }
    setDone(true);
  };

  const resend = async () => {
    if (captcha.required && !captcha.token) {
      setFormError('Please complete the security check first.');
      return;
    }
    setFormError(null);
    setLoading(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: captcha.captchaOptions });
    setLoading(false);
    captcha.reset();
    if (error) setFormError(friendlyAuthError(error.message));
    else setResent(true);
  };

  if (done) {
    return (
      <AuthShell title="Check your email">
        <View style={{ alignItems: 'center', gap: 14, paddingVertical: 8 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="mail-unread-outline" size={38} color={colors.primary} />
          </View>
          <Text muted style={{ textAlign: 'center' }}>
            We sent a confirmation link to {email.trim()}. Open it to activate your account, then come back here and sign in.
          </Text>
        </View>
        <FormError message={formError} />
        {resent ? (
          <Text variant="caption" color={colors.primary} style={{ textAlign: 'center' }}>
            Sent again. It can take a minute to arrive.
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {captcha.widget}
            <Button title="Resend the email" variant="secondary" onPress={resend} loading={loading} disabled={captcha.required && !captcha.token} />
          </View>
        )}
        <Button title="Go to sign in" onPress={() => router.replace('/(auth)/login')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle={step === 1 ? 'Tell us about you and your business.' : 'Choose how you will sign in.'}
      back
    >
      <View accessibilityLabel={`Step ${step} of 2`} style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2].map((n) => (
          <View key={n} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: n <= step ? colors.primary : colors.border }} />
        ))}
      </View>

      {step === 1 ? (
        <View style={{ gap: 14 }}>
          <Input label="Your name" value={fullName} onChangeText={setFullName} placeholder="Priya Sharma" autoComplete="name" textContentType="name" error={errors.fullName} />
          <Input label="Business name" value={businessName} onChangeText={setBusinessName} placeholder="Sharma Textiles" textContentType="organizationName" error={errors.businessName} />
          <Input label="Mobile number" value={mobile} onChangeText={setMobile} placeholder="+91 98765 43210" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" error={errors.mobile} />
          <SelectField label="Nature of business" value={nature} options={NATURE_OF_BUSINESS_OPTIONS} placeholder="Select your industry" onChange={setNature} error={errors.nature} />
          <SelectField label="Team size" value={team} options={TEAM_SIZE_OPTIONS} placeholder="Select team size" onChange={setTeam} error={errors.team} />
          <Button title="Continue" icon="arrow-forward" onPress={nextStep} />
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <FormError message={formError} />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@company.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" error={errors.email} />
          <Input label="Password" value={password} onChangeText={setPassword} placeholder={`At least ${MIN_PASSWORD} characters`} secureTextEntry autoCapitalize="none" textContentType="newPassword" error={errors.password} />
          <Input label="Confirm password" value={confirm} onChangeText={setConfirm} placeholder="Repeat your password" secureTextEntry autoCapitalize="none" textContentType="newPassword" error={errors.confirm} />

          <Pressable
            onPress={() => setAgree((a) => !a)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agree }}
            style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 7,
                borderWidth: 1.5,
                borderColor: errors.agree ? colors.danger : agree ? colors.primary : colors.border,
                backgroundColor: agree ? colors.primary : colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {agree ? <Ionicons name="checkmark" size={16} color={colors.onPrimary} /> : null}
            </View>
            <Text variant="caption" style={{ flex: 1 }}>
              I agree to the{' '}
              <Text variant="caption" color={colors.primary} onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}>
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text variant="caption" color={colors.primary} onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}>
                Privacy Policy
              </Text>
              .
            </Text>
          </Pressable>
          {errors.agree ? (
            <Text variant="caption" color={colors.danger}>
              {errors.agree}
            </Text>
          ) : null}

          {captcha.widget}
          <Button title="Create account" onPress={submit} loading={loading} disabled={captcha.required && !captcha.token} />
          <Button title="Back" variant="ghost" onPress={() => setStep(1)} />
        </View>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        <Text muted>Already have an account?</Text>
        <Link href="/(auth)/login" asChild>
          <Pressable accessibilityRole="link" hitSlop={8}>
            <Text variant="label" color={colors.primary} style={{ fontSize: 16 }}>
              Sign in
            </Text>
          </Pressable>
        </Link>
      </View>
    </AuthShell>
  );
}
