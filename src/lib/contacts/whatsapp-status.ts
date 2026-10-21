import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Is this contact on WhatsApp?"
 *
 * Meta's Cloud API has no lookup for this (the old contacts endpoint was
 * removed), so we infer it from what messages tell us:
 *   - the customer messaged us, or a message we sent was delivered/read
 *     → on WhatsApp
 *   - the latest send failed with 131026 ("message undeliverable", which
 *     is what Meta returns for numbers not on WhatsApp) → not on WhatsApp
 *   - nothing yet → unknown until the first message goes out
 * The most recent signal wins, so a number that later joins WhatsApp
 * flips back once a message gets through.
 */

export type WhatsAppStatus = "on" | "off" | "unknown";

/** Meta: "Message undeliverable" — the recipient isn't on WhatsApp. */
export const NOT_ON_WHATSAPP_CODE = 131026;

export interface StatusSignal {
  sender_type: string;
  status: string;
  error_code?: number | null;
  created_at: string;
}

/** Status from one signal row, or null when the row says nothing. */
export function statusFromSignal(row: StatusSignal): WhatsAppStatus | null {
  if (row.sender_type === "customer") return "on";
  if (row.status === "delivered" || row.status === "read") return "on";
  if (row.status === "failed" && row.error_code === NOT_ON_WHATSAPP_CODE) return "off";
  return null;
}

/** True when a broadcast recipient's stored error is Meta's 131026. */
export function isNotOnWhatsAppError(message: string | null | undefined): boolean {
  return !!message && new RegExp(`\\b${NOT_ON_WHATSAPP_CODE}\\b`).test(message);
}

/**
 * WhatsApp status for each of `contactIds`. Ids with no signal map to
 * "unknown". Never throws: on any query error the affected contacts
 * simply stay "unknown".
 */
export async function fetchWhatsAppStatuses(
  supabase: SupabaseClient,
  contactIds: string[],
): Promise<Map<string, WhatsAppStatus>> {
  const result = new Map<string, WhatsAppStatus>(contactIds.map((id) => [id, "unknown"]));
  if (contactIds.length === 0) return result;
  // Latest signal per contact: [time, status].
  const latest = new Map<string, [string, WhatsAppStatus]>();
  const consider = (contactId: string, at: string, status: WhatsAppStatus | null) => {
    if (!status) return;
    const prev = latest.get(contactId);
    if (!prev || at > prev[0]) latest.set(contactId, [at, status]);
  };

  try {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, contact_id")
      .in("contact_id", contactIds);
    const contactByConv = new Map<string, string>(
      (convs ?? []).map((c) => [c.id as string, c.contact_id as string]),
    );

    if (contactByConv.size > 0) {
      const convIds = [...contactByConv.keys()];
      const query = (withErrorCode: boolean) =>
        supabase
          .from("messages")
          .select(`conversation_id, sender_type, status, created_at${withErrorCode ? ", error_code" : ""}`)
          .in("conversation_id", convIds)
          .or(
            withErrorCode
              ? "sender_type.eq.customer,status.in.(delivered,read),error_code.eq.131026"
              : "sender_type.eq.customer,status.in.(delivered,read)",
          )
          .order("created_at", { ascending: false })
          .limit(1000);
      let { data, error } = await query(true);
      // error_code arrives with migration 079; work without it before then.
      if (error) ({ data, error } = await query(false));
      for (const row of (data ?? []) as unknown as (StatusSignal & { conversation_id: string })[]) {
        const contactId = contactByConv.get(row.conversation_id);
        if (contactId) consider(contactId, row.created_at, statusFromSignal(row));
      }
    }

    // Broadcast sends don't always land in the inbox; count them too.
    const { data: recipients } = await supabase
      .from("broadcast_recipients")
      .select("contact_id, status, error_message, created_at, delivered_at, read_at")
      .in("contact_id", contactIds)
      .in("status", ["delivered", "read", "replied", "failed"])
      .order("created_at", { ascending: false })
      .limit(1000);
    for (const r of recipients ?? []) {
      const at = (r.read_at ?? r.delivered_at ?? r.created_at) as string;
      const status: WhatsAppStatus | null =
        r.status === "failed"
          ? isNotOnWhatsAppError(r.error_message as string | null)
            ? "off"
            : null
          : "on";
      consider(r.contact_id as string, at, status);
    }
  } catch {
    // Network blip: leave everything "unknown".
  }

  for (const [id, [, status]] of latest) result.set(id, status);
  return result;
}
