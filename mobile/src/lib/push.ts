// Push notification plumbing: permission, Expo push token, and registering it
// with the Repeat Grow backend (POST/DELETE /api/mobile/push-token).
//
// The token is only available on a physical device and once the project has an
// EAS project id (run `eas init`, see mobile/README.md). Until then everything
// here skips quietly, so the rest of the app is unaffected.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '@/lib/api';

const TOKEN_KEY = 'rg.push.token.v1';

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export interface PermissionState {
  status: PushPermission;
  canAskAgain: boolean;
}

export type RegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'simulator' | 'permission' | 'no-project-id' | 'error'; message?: string };

export async function getPermission(): Promise<PermissionState> {
  const p = await Notifications.getPermissionsAsync();
  return { status: p.status as PushPermission, canAskAgain: p.canAskAgain };
}

/** Android 8+ needs a channel before any notification can show (and before the 13+ permission prompt). */
export async function setupAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Customer messages',
    description: 'New WhatsApp messages, mentions and chats assigned to you',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: '#16a34a',
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Ask the system for permission. Call this AFTER your own friendly pre-prompt. */
export async function requestPermission(): Promise<PermissionState> {
  await setupAndroidChannels();
  const p = await Notifications.requestPermissionsAsync();
  return { status: p.status as PushPermission, canAskAgain: p.canAskAgain };
}

function projectId(): string | undefined {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  const id = fromConfig || Constants.easConfig?.projectId;
  return id && id.length > 0 ? id : undefined;
}

/**
 * Get this device's Expo push token and register it with the backend.
 * Never asks for permission itself: if it is not granted yet it returns
 * { ok:false, reason:'permission' } and the caller shows its own pre-prompt.
 */
export async function registerForPush(): Promise<RegisterResult> {
  try {
    if (!Device.isDevice) return { ok: false, reason: 'simulator' };
    await setupAndroidChannels();

    const perm = await getPermission();
    if (perm.status !== 'granted') return { ok: false, reason: 'permission' };

    const id = projectId();
    if (!id) {
      if (__DEV__) console.warn('[push] No EAS project id in app.json (extra.eas.projectId). Run `eas init` to enable push.');
      return { ok: false, reason: 'no-project-id' };
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await api('/api/mobile/push-token', {
      method: 'POST',
      body: {
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        deviceName: Device.deviceName ?? Device.modelName ?? undefined,
        appVersion: Constants.expoConfig?.version,
      },
    });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return { ok: true, token };
  } catch (e) {
    if (__DEV__) console.warn('[push] registration failed:', e instanceof Error ? e.message : e);
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : undefined };
  }
}

/**
 * Stop pushes to this phone for the signed-in user.
 * CALL THIS BEFORE supabase.auth.signOut() (it needs the session to authorise
 * the request). Never throws, so it can never block sign-out.
 */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await api('/api/mobile/push-token', { method: 'DELETE', body: { token } });
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    if (__DEV__) console.warn('[push] unregister failed:', e instanceof Error ? e.message : e);
  }
}
