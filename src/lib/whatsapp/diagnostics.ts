import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSubscribedApps,
  verifyPhoneNumber,
  checkCoexistenceStatus,
  getAppWebhookSubscriptions,
  type MetaPhoneInfo,
} from "@/lib/whatsapp/meta-api";
import type { WhatsAppConfig } from "@/types";

export interface WhatsappDiagnostics {
  live: boolean;
  checks: {
    config_exists: boolean;
    token_decryptable: boolean;
    phone_metadata_ok: boolean;
    waba_subscribed_to_app: boolean | null;
    locally_marked_registered: boolean;
    is_coexistence_number: boolean;
    messages_field_subscribed: boolean | null;
  };
  errors: string[];
  phone_info: MetaPhoneInfo | null;
  last_registration_error: string | null;
  registered_at: string | null;
  subscribed_apps_at: string | null;
  coexistence: {
    is_on_biz_app: boolean;
    contacts_synced_at: string | null;
    history_synced_at: string | null;
    history_progress: number | null;
    sync_error: string | null;
  };
}

/**
 * Runs the same live-against-Meta checks whether the caller is the
 * account's own session (verify-registration route) or a platform
 * admin inspecting someone else's account (admin diagnostics route) —
 * extracted so both stay in lockstep instead of drifting.
 *
 * `supabase` is only used for the silent is_on_biz_app repair when
 * Meta disagrees with our stored value; pass whatever client the
 * caller already has (user-scoped or service-role — both can see/
 * update their own config row).
 */
export async function runWhatsappDiagnostics(
  config: WhatsAppConfig,
  accessToken: string,
  supabase: SupabaseClient
): Promise<WhatsappDiagnostics> {
  const checks: WhatsappDiagnostics["checks"] = {
    config_exists: true,
    token_decryptable: true,
    phone_metadata_ok: false,
    waba_subscribed_to_app: null,
    locally_marked_registered: config.registered_at != null,
    is_coexistence_number: config.is_on_biz_app === true,
    messages_field_subscribed: null,
  };
  const errors: string[] = [];
  let phoneInfo: MetaPhoneInfo | null = null;

  // 1. Phone metadata.
  try {
    phoneInfo = await verifyPhoneNumber({
      phoneNumberId: config.phone_number_id,
      accessToken,
    });
    checks.phone_metadata_ok = true;
  } catch (err) {
    errors.push(
      `Phone metadata check failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 1b. Coexistence probe — also catches a row saved with
  // is_on_biz_app=false where the business later connected the
  // Business app; Meta is the source of truth, so repair silently.
  try {
    const coexistence = await checkCoexistenceStatus({
      phoneNumberId: config.phone_number_id,
      accessToken,
    });
    checks.is_coexistence_number = coexistence.isOnBizApp;
    if (coexistence.isOnBizApp !== (config.is_on_biz_app === true)) {
      await supabase
        .from("whatsapp_config")
        .update({ is_on_biz_app: coexistence.isOnBizApp })
        .eq("id", config.id);
    }
  } catch {
    // Probe failure is non-fatal — leave the seeded value.
  }

  // 2. WABA subscription — only meaningful if we have a waba_id.
  if (config.waba_id) {
    try {
      const subs = await getSubscribedApps({
        wabaId: config.waba_id,
        accessToken,
      });
      checks.waba_subscribed_to_app = subs.length > 0;
      if (!checks.waba_subscribed_to_app) {
        errors.push(
          "WABA has no subscribed apps. Re-save the configuration to subscribe."
        );
      }
    } catch (err) {
      errors.push(
        `WABA subscription check failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else {
    errors.push(
      "No WABA ID on file — webhooks can't be wired without it. Add it in the form and re-save."
    );
  }

  // 3. App-level webhook field subscription — app-wide, not
  // per-account, but catches "every account stopped receiving
  // messages at once" when it's unchecked in the Meta dashboard.
  try {
    const subs = await getAppWebhookSubscriptions();
    const wabaSub = subs.find((s) => s.object === "whatsapp_business_account");
    checks.messages_field_subscribed =
      wabaSub?.active === true && wabaSub.fields.includes("messages");
    if (!checks.messages_field_subscribed) {
      errors.push(
        'The app\'s "messages" webhook field is not subscribed (Meta App Dashboard → WhatsApp → Configuration → Webhook Fields). This blocks inbound messages for EVERY connected account, not just this one.'
      );
    }
  } catch (err) {
    errors.push(
      `App webhook subscription check failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Coexistence numbers are registered by the Business app itself —
  // they're live as soon as metadata + subscription check out.
  const isCoexistence = checks.is_coexistence_number;
  const live =
    checks.phone_metadata_ok &&
    (checks.waba_subscribed_to_app ?? false) &&
    (checks.messages_field_subscribed ?? true) &&
    (isCoexistence || checks.locally_marked_registered);

  return {
    live,
    checks,
    errors,
    phone_info: phoneInfo,
    last_registration_error: config.last_registration_error ?? null,
    registered_at: config.registered_at ?? null,
    subscribed_apps_at: config.subscribed_apps_at ?? null,
    coexistence: {
      is_on_biz_app: checks.is_coexistence_number,
      contacts_synced_at: config.smb_contacts_synced_at ?? null,
      history_synced_at: config.smb_history_synced_at ?? null,
      history_progress: config.smb_sync_progress ?? null,
      sync_error: config.smb_sync_error ?? null,
    },
  };
}
