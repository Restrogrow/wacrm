import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getActiveConversation } from '@/features/push/active-chat';
import { getPermission, registerForPush, requestPermission, setupAndroidChannels, unregisterPush, type PushPermission } from '@/lib/push';
import { useSession } from '@/providers/session';

// Show banners and play the sound for pushes that arrive while the app is open,
// except for the chat the user is already reading.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const conversationId = (notification.request.content.data as { conversationId?: string } | undefined)?.conversationId;
    const reading = !!conversationId && conversationId === getActiveConversation();
    return {
      shouldShowBanner: !reading,
      shouldShowList: !reading,
      shouldPlaySound: !reading,
      shouldSetBadge: false,
    };
  },
});

interface PushState {
  status: PushPermission;
  canAskAgain: boolean;
  /** true once this phone has a token registered with the backend in this session */
  registered: boolean;
  /** Show the system prompt (call after your own pre-prompt). Opens Settings if the user blocked it earlier. */
  request: () => Promise<PushPermission>;
  /** Call before signing out so this phone stops getting the previous user's pushes. */
  unregister: () => Promise<void>;
}

const Ctx = createContext<PushState | null>(null);

type PushData = { type?: string; conversationId?: string };

export function PushProvider({ children }: { children: React.ReactNode }) {
  const { loading, session } = useSession();
  const router = useRouter();
  const [status, setStatus] = useState<PushPermission>('undetermined');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [registered, setRegistered] = useState(false);
  const registeredFor = useRef<string | null>(null);
  const handledColdStart = useRef(false);

  const refreshPermission = useCallback(async () => {
    const p = await getPermission();
    setStatus(p.status);
    setCanAskAgain(p.canAskAgain);
    return p;
  }, []);

  // Channels first (Android needs them before any prompt), then read the current permission.
  useEffect(() => {
    setupAndroidChannels().catch(() => {});
    refreshPermission().catch(() => {});
  }, [refreshPermission]);

  // Register once per signed-in user if the permission is already granted.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) {
      registeredFor.current = null;
      setRegistered(false);
      return;
    }
    if (status !== 'granted' || registeredFor.current === userId) return;
    registeredFor.current = userId;
    registerForPush().then((r) => setRegistered(r.ok));
  }, [userId, status]);

  // Clear the app icon badge whenever the app is opened.
  useEffect(() => {
    Notifications.setBadgeCountAsync(0).catch(() => {});
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        Notifications.setBadgeCountAsync(0).catch(() => {});
        refreshPermission().catch(() => {}); // the user may have changed it in Settings
      }
    });
    return () => sub.remove();
  }, [refreshPermission]);

  const open = useCallback(
    (data: PushData | undefined) => {
      if (!data?.conversationId) return;
      // message / mention / assignment / sla all open the conversation
      router.push(`/chat/${data.conversationId}`);
    },
    [router],
  );

  // Taps while the app is running or in the background.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (!session) return;
      open(response.notification.request.content.data as PushData);
      Notifications.clearLastNotificationResponse();
    });
    return () => sub.remove();
  }, [open, session]);

  // Tap that launched the app from a closed state: wait until the session is loaded.
  useEffect(() => {
    if (loading || !session || handledColdStart.current) return;
    handledColdStart.current = true;
    const last = Notifications.getLastNotificationResponse();
    if (!last) return;
    const data = last.notification.request.content.data as PushData;
    Notifications.clearLastNotificationResponse();
    // Let the navigation gate finish its first redirect before pushing the chat.
    const t = setTimeout(() => open(data), 400);
    return () => clearTimeout(t);
  }, [loading, session, open]);

  const request = useCallback(async () => {
    const current = await getPermission();
    if (current.status === 'denied' && !current.canAskAgain) {
      await Linking.openSettings();
      return current.status;
    }
    const next = await requestPermission();
    setStatus(next.status);
    setCanAskAgain(next.canAskAgain);
    if (next.status === 'granted' && userId) {
      registeredFor.current = userId;
      const r = await registerForPush();
      setRegistered(r.ok);
    }
    return next.status;
  }, [userId]);

  const unregister = useCallback(async () => {
    await unregisterPush();
    registeredFor.current = null;
    setRegistered(false);
  }, []);

  const value = useMemo<PushState>(
    () => ({ status, canAskAgain, registered, request, unregister }),
    [status, canAskAgain, registered, request, unregister],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Permission state + a way to ask. {status, canAskAgain, request()} plus registered / unregister(). */
export function usePushPermission(): PushState {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePushPermission must be used inside <PushProvider>');
  return v;
}
