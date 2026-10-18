// Appearance preference (system / light / dark), persisted on the device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'rg.theme.pref.v1';

let current: ThemePref = 'system';
const listeners = new Set<() => void>();

AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v === 'light' || v === 'dark' || v === 'system') {
      current = v;
      listeners.forEach((l) => l());
    }
  })
  .catch(() => {});

export function setThemePref(next: ThemePref) {
  current = next;
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, next).catch(() => {});
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => 'system',
  );
}
