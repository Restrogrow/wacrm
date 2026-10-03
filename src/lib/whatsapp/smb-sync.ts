import { supabaseAdmin } from "@/lib/flows/admin-client";
import { initiateSmbAppDataSync } from "@/lib/whatsapp/meta-api";

/**
 * Kick off the ONE-SHOT SMB app data syncs for a coexistence number.
 *
 * Meta gives 24h after onboarding to call POST /{phone_number_id}/
 * smb_app_data for contacts ("smb_app_state_sync") and chat history
 * ("history") — each exactly once. Both fire here, back to back; the
 * data itself streams back asynchronously via the history /
 * smb_app_state_sync webhooks (handled in smb-webhook.ts).
 *
 * Shared by every place that can first learn a number is on the
 * Business app: Embedded Signup's coexistence event, and the manual
 * flow discovering it only when /register comes back with Meta's
 * "not available for SMB businesses" rejection.
 *
 * Fire-and-forget from the caller's perspective, but failures are
 * persisted to the row (smb_sync_error) and can be retried via
 * POST /api/whatsapp/smb-sync (which only retries syncs that never
 * succeeded).
 */
export async function startSmbSyncs(
  configId: string,
  phoneNumberId: string,
  accessToken: string
): Promise<void> {
  const requestIds: Record<string, string> = {};
  const errors: string[] = [];

  // Contacts first — cheap, and echoes/state-sync webhooks for them
  // are small.
  try {
    const contacts = await initiateSmbAppDataSync({
      phoneNumberId,
      accessToken,
      syncType: "smb_app_state_sync",
    });
    requestIds.contacts = contacts.requestId;
  } catch (err) {
    errors.push(`contacts: ${err instanceof Error ? err.message : String(err)}`);
  }

  // History second. If the business declined sharing, Meta answers
  // the request fine and delivers the decline via a history webhook
  // (error 2593109) — nothing to do here.
  try {
    const history = await initiateSmbAppDataSync({
      phoneNumberId,
      accessToken,
      syncType: "history",
    });
    requestIds.history = history.requestId;
  } catch (err) {
    errors.push(`history: ${err instanceof Error ? err.message : String(err)}`);
  }

  const update: Record<string, unknown> = {
    smb_sync_request_ids: requestIds,
    updated_at: new Date().toISOString(),
  };
  if (requestIds.contacts) update.smb_contacts_synced_at = new Date().toISOString();
  if (requestIds.history) update.smb_history_synced_at = new Date().toISOString();
  if (errors.length > 0) update.smb_sync_error = errors.join("; ");

  await supabaseAdmin().from("whatsapp_config").update(update).eq("id", configId);
}
