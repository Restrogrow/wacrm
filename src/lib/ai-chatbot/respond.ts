/**
 * Webhook-side AI chatbot: decide, generate, send. Never throws — the
 * webhook awaits it inside `after()` and must not fail on bot errors.
 */

import { supabaseAdmin } from "@/lib/flows/admin-client";
import { engineSendText } from "@/lib/flows/meta-send";
import { consumeAiQuota } from "@/lib/ai/quota";
import { markConversationRead } from "@/lib/whatsapp/read-receipts";
import {
  HISTORY_LIMIT,
  chatbotTimeZone,
  generateChatbotReply,
  normalizeChatbotSettings,
  shouldBotReply,
  toChatHistory,
} from "./chatbot";

/**
 * Wait this long before answering. Customers often send a thought as
 * several quick messages ("hi" / "do you deliver" / "to sector 21?");
 * waiting lets the bot answer them together once, and lets an
 * automation or a teammate who answered meanwhile take precedence.
 */
export const REPLY_DEBOUNCE_MS = 4000;

type LatestMessage = { id: string; sender_type: string } | null;

/**
 * After the debounce, should this webhook still answer? Only if the
 * newest message in the thread is still the customer message we saw
 * before waiting. A newer customer message means its own webhook will
 * answer everything; a newer agent/bot message means someone already did.
 */
export function stillLatest(before: LatestMessage, after: LatestMessage): boolean {
  return !!before && !!after && before.id === after.id && after.sender_type === "customer";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ChatbotInbound {
  accountId: string;
  /** Sender-of-record for outbound sends (WhatsApp config owner). */
  userId: string;
  contactId: string;
  conversationId: string;
  text: string;
  isText: boolean;
  /** Photo, voice note, video or document. */
  isMedia?: boolean;
  flowConsumed: boolean;
}

export async function maybeReplyWithAI(input: ChatbotInbound): Promise<void> {
  try {
    const db = supabaseAdmin();

    const { data: row, error: settingsErr } = await db
      .from("ai_chatbot_settings")
      .select("*")
      .eq("account_id", input.accountId)
      .maybeSingle();
    // Missing table (migration 034 not applied) or no row → bot is off.
    if (settingsErr || !row) return;
    const settings = normalizeChatbotSettings(row);
    // Cheap exits before waiting.
    if (!settings.enabled || input.flowConsumed) return;
    if (!(input.isText && input.text.trim()) && !input.isMedia) return;

    const latest = async (): Promise<LatestMessage> => {
      const { data } = await db
        .from("messages")
        .select("id, sender_type")
        .eq("conversation_id", input.conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as LatestMessage) ?? null;
    };
    const before = await latest();
    await sleep(REPLY_DEBOUNCE_MS);
    if (!stillLatest(before, await latest())) return;

    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const [{ data: conv }, { data: lastAgent }, { data: lastBot }, { count: botCount }] = await Promise.all([
      db
        .from("conversations")
        .select("status, assigned_agent_id")
        .eq("id", input.conversationId)
        .maybeSingle(),
      db
        .from("messages")
        .select("created_at")
        .eq("conversation_id", input.conversationId)
        .eq("sender_type", "agent")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("messages")
        .select("created_at")
        .eq("conversation_id", input.conversationId)
        .eq("sender_type", "bot")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", input.conversationId)
        .eq("sender_type", "bot")
        .gte("created_at", hourAgo),
    ]);

    const decision = shouldBotReply({
      settings,
      flowConsumed: input.flowConsumed,
      isText: input.isText,
      isMedia: input.isMedia,
      text: input.text,
      conversationStatus: (conv?.status as string | undefined) ?? null,
      assignedAgentId: (conv?.assigned_agent_id as string | null | undefined) ?? null,
      lastAgentMessageAt: (lastAgent?.created_at as string | undefined) ?? null,
      lastBotMessageAt: (lastBot?.created_at as string | undefined) ?? null,
      botMessagesLastHour: botCount ?? 0,
      now: Date.now(),
    });
    if (!decision.reply) return;

    // Account-wide daily cap. Over it, the bot stays quiet and the
    // message waits in the inbox for the team like any other.
    const quota = await consumeAiQuota(input.accountId, "chatbot");
    if (!quota.allowed) {
      console.warn(`[ai-chatbot] daily cap reached for account ${input.accountId}; not replying`);
      return;
    }

    // Blue ticks + "typing…" while the reply is generated (best-effort).
    void markConversationRead(db, input.accountId, input.conversationId, { typing: true });

    // Recent thread (includes the messages that just arrived) and who
    // the customer is.
    const [{ data: recent }, { data: contact }] = await Promise.all([
      db
        .from("messages")
        .select("sender_type, content_text, content_type, created_at")
        .eq("conversation_id", input.conversationId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT),
      db.from("contacts").select("name").eq("id", input.contactId).maybeSingle(),
    ]);
    const history = toChatHistory([...(recent ?? [])].reverse());

    const result = await generateChatbotReply(settings, history, {
      context: {
        customerName: (contact?.name as string | null | undefined) ?? null,
        timeZone: chatbotTimeZone(),
      },
    });
    if (!result.ok) {
      console.error("[ai-chatbot] generate failed:", result.error);
      return;
    }

    const send = (text: string) =>
      engineSendText({
        accountId: input.accountId,
        userId: input.userId,
        conversationId: input.conversationId,
        contactId: input.contactId,
        text,
      });

    if (result.reply) await send(result.reply);
    if (result.handoff) {
      // Only add the handoff line when the reply didn't already say so.
      if (!result.reply) await send(settings.handoff_message);
      await db
        .from("conversations")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("id", input.conversationId);
    }
  } catch (err) {
    console.error("[ai-chatbot] reply failed:", err);
  }
}
