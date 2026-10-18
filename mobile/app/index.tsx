import { Redirect } from 'expo-router';

import { useSession } from '@/providers/session';

/**
 * The app's start address ("/"). Without this page a release build opens on
 * "Unmatched Route". The root layout's Gate decides welcome vs login; this just
 * sends signed-in people to the inbox and everyone else to the first auth screen.
 */
export default function Index() {
  const { session } = useSession();
  return <Redirect href={session ? '/(tabs)/inbox' : '/(auth)/welcome'} />;
}
