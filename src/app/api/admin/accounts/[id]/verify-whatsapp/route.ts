import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { decrypt } from "@/lib/whatsapp/encryption";
import { isOurWebhookUrl, repeatGrowWebhookUrl, runWhatsappDiagnostics } from "@/lib/whatsapp/diagnostics";
import { getPhoneWebhookConfiguration, setPhoneWebhookOverride, subscribeWabaToApp } from "@/lib/whatsapp/meta-api";
import { recordAudit } from "@/lib/audit";

/**
 * GET /api/admin/accounts/[id]/verify-whatsapp
 *
 * Platform-admin equivalent of /api/whatsapp/config/verify-registration —
 * runs the same live-against-Meta checks (phone metadata, coexistence
 * probe, WABA subscription, app webhook field) but for ANY account's
 * config, looked up by account_id via the service-role client instead
 * of the caller's own session. Lets support check whether a customer's
 * number — especially a coexistence number — is actually live without
 * needing their login.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePlatformAdmin();

  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: config, error } = await supabase
    .from("whatsapp_config")
    .select("*")
    .eq("account_id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load config" }, { status: 500 });
  }
  if (!config) {
    return NextResponse.json({
      live: false,
      checks: { config_exists: false },
      message: "No WhatsApp configuration saved for this account.",
    });
  }

  let accessToken: string;
  try {
    accessToken = decrypt(config.access_token);
  } catch {
    return NextResponse.json({
      live: false,
      checks: { config_exists: true, token_decryptable: false },
      message:
        "Stored access token can't be decrypted — likely ENCRYPTION_KEY changed.",
    });
  }

  const diagnostics = await runWhatsappDiagnostics(config, accessToken, supabase);
  return NextResponse.json(diagnostics);
}

/**
 * POST /api/admin/accounts/[id]/verify-whatsapp — "Reconnect webhooks".
 *
 * Re-subscribes Repeat Grow's app to the account's WABA (which also
 * resets a WABA-level override for our app) and, when Meta sends this
 * number's messages somewhere else, points the number's webhook back at
 * Repeat Grow. Then runs the checks again and returns them. Safe to
 * repeat; it never touches other apps' subscriptions.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: config } = await supabase
    .from("whatsapp_config")
    .select("*")
    .eq("account_id", id)
    .maybeSingle();
  if (!config?.waba_id || !config.phone_number_id) {
    return NextResponse.json({ error: "No WhatsApp number connected for this account." }, { status: 400 });
  }

  let accessToken: string;
  let verifyToken: string | null = null;
  try {
    accessToken = decrypt(config.access_token);
    if (config.verify_token) verifyToken = decrypt(config.verify_token);
  } catch {
    return NextResponse.json(
      { error: "Stored token can't be decrypted — likely ENCRYPTION_KEY changed." },
      { status: 500 }
    );
  }

  const steps: string[] = [];
  try {
    await subscribeWabaToApp({ wabaId: config.waba_id, accessToken });
    await supabase
      .from("whatsapp_config")
      .update({ subscribed_apps_at: new Date().toISOString() })
      .eq("id", config.id);
    steps.push("Subscribed Repeat Grow's app to the WhatsApp Business Account.");
  } catch (err) {
    return NextResponse.json(
      { error: `Subscribing failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  try {
    const cfg = await getPhoneWebhookConfiguration({ phoneNumberId: config.phone_number_id, accessToken });
    const current = cfg?.phone_number || cfg?.whatsapp_business_account || cfg?.application || null;
    if (current && !isOurWebhookUrl(current)) {
      if (!verifyToken) {
        steps.push(`Messages still go to ${current}; no verify token saved to redirect them.`);
      } else {
        await setPhoneWebhookOverride({
          phoneNumberId: config.phone_number_id,
          accessToken,
          callbackUrl: repeatGrowWebhookUrl(),
          verifyToken,
        });
        steps.push(`Redirected this number's messages from ${current} to Repeat Grow.`);
      }
    }
  } catch (err) {
    steps.push(`Webhook redirect failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  await recordAudit(
    { accountId: id, actorUserId: admin.userId, action: "whatsapp.config_changed", targetType: "whatsapp", targetId: config.phone_number_id, metadata: { reconnect_webhooks: true, by: "platform_admin" } },
    request
  );

  const diagnostics = await runWhatsappDiagnostics(config, accessToken, supabase);
  return NextResponse.json({ ...diagnostics, reconnect_steps: steps });
}
