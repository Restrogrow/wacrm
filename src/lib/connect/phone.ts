import { findWhatsAppConfig } from '@/lib/connect/store';
import { decrypt } from '@/lib/whatsapp/encryption';
import { verifyPhoneNumber } from '@/lib/whatsapp/meta-api';

/** The account's connected number in display form (Graph API), or null. */
export async function getConnectedPhoneNumber(
  accountId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const config = await findWhatsAppConfig(accountId);
  if (!config?.phone_number_id || !config.access_token) return null;
  const info = await verifyPhoneNumber({
    phoneNumberId: config.phone_number_id,
    accessToken: decrypt(config.access_token),
    signal,
  });
  return info.display_phone_number ?? null;
}
