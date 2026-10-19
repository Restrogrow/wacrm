import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PushProvider } from '@/providers/push';
import { SessionProvider, useSession } from '@/providers/session';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export const ONBOARDING_KEY = 'rg.onboarding.done.v1';

/** Sends people to the right place: onboarding -> sign in -> the app. */
function Gate({ children }: { children: React.ReactNode }) {
  const { loading, session } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const [seenOnboarding, setSeenOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((v) => setSeenOnboarding(v === '1'));
  }, [segments.join('/')]); // re-read after onboarding finishes

  const ready = !loading && seenOnboarding !== null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)';
    const screen = (segments as string[])[1];
    if (!session) {
      if (!inAuth) router.replace(seenOnboarding ? '/(auth)/login' : '/(auth)/welcome');
      else if (!seenOnboarding && screen !== 'welcome') router.replace('/(auth)/welcome');
    } else if (inAuth) {
      router.replace('/(tabs)/inbox');
    }
  }, [ready, session, seenOnboarding, segments, router]);

  if (!ready) return null;
  return <>{children}</>;
}

export default function RootLayout() {
  const { dark, colors } = useTheme();
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <PushProvider>
        <Gate>
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen name="chat/[id]" />
            <Stack.Screen name="contact/[id]" />
            <Stack.Screen name="calls/index" />
            <Stack.Screen name="calls/[id]" />
            <Stack.Screen name="broadcasts/index" />
            <Stack.Screen name="broadcasts/new" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="broadcasts/[id]" />
          </Stack>
        </Gate>
        </PushProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
