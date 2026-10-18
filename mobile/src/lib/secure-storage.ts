// Supabase session storage on the device keychain/keystore. Android limits a
// SecureStore value to ~2 KB and a Supabase session is larger, so values are
// split into chunks.
import * as SecureStore from 'expo-secure-store';

const CHUNK = 1800;
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

async function removeAll(key: string) {
  const count = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
  for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  await SecureStore.deleteItemAsync(`${key}.n`);
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    if (!count) return null;
    let out = '';
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null;
      out += part;
    }
    return out;
  },
  async setItem(key: string, value: string): Promise<void> {
    await removeAll(key);
    const parts = Math.max(1, Math.ceil(value.length / CHUNK));
    for (let i = 0; i < parts; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK), OPTS);
    }
    await SecureStore.setItemAsync(`${key}.n`, String(parts), OPTS);
  },
  async removeItem(key: string): Promise<void> {
    await removeAll(key);
  },
};
