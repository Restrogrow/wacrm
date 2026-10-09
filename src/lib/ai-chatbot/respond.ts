/**
 * Webhook-side AI chatbot: decide, generate, send. Never throws — the
 * webhook awaits it inside `after()` and must not fail on bot errors.
 */

import { supabaseAdmin } from "@/lib/flows/admin-client";
import { engineSendText } from "@/lib/flows/meta-send";
import {
  HISTORY_LIMIT,
  generateChatbotReply,
  normalizeChatbotSettings,
  shouldBotReply,
  toChatHistory,
} from "./chatbot";

export interface ChatbotInbound {
  accountId: string;
  /** Sender-of-record for outbound sends (WhatsApp config owner). */
  userId: string;
  contactId: string;
  conversationId: string;
  text: string;
  isText: boolean;
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
    if (!settings.enabled) return;

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
      text: input.text,
      conversationStatus: (conv?.status as string | undefined) ?? null,
      assignedAgentId: (conv?.assigned_agent_id as string | null | undefined) ?? null,
      lastAgentMessageAt: (lastAgent?.created_at as string | undefined) ?? null,
      lastBotMessageAt: (lastBot?.created_at as string | undefined) ?? null,
      botMessagesLastHour: botCount ?? 0,
      now: Date.now(),
    });
    if (!decision.reply) return;

    // Recent thread (includes the message that just arrived).
    const { data: recent } = await db
      .from("messages")
      .select("sender_type, content_text, created_at")
      .eq("conversation_id", input.conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    const history = toChatHistory([...(recent ?? [])].reverse());

    const result = await generateChatbotReply(settings, history);
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
