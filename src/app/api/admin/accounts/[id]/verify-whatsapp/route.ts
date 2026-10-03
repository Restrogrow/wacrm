import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { decrypt } from "@/lib/whatsapp/encryption";
import { runWhatsappDiagnostics } from "@/lib/whatsapp/diagnostics";

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
