-- ============================================================
-- 089: Repair chats brought in by the WhatsApp Business app history
-- import (coexistence)
--
-- The import only moved a chat's preview forward when the new message
-- was newer than last_message_at. A chat the import had just created
-- had last_message_at NULL, and NULL < x is never true, so the preview
-- was never set: imported chats showed no text or date and sat below
-- every other chat in the inbox (NULLS LAST), effectively hidden.
-- Fixed in smb-webhook.ts; this fills in the chats already imported.
--
-- Only touches chats whose last_message_at is NULL but that do have
-- messages. Idempotent — safe to run multiple times.
-- ============================================================

UPDATE conversations c SET
  last_message_at   = m.created_at,
  last_message_text = COALESCE(m.content_text, '[' || m.content_type || ']')
FROM (
  SELECT DISTINCT ON (conversation_id) conversation_id, created_at, content_text, content_type
  FROM messages
  ORDER BY conversation_id, created_at DESC
) m
WHERE m.conversation_id = c.id
  AND c.last_message_at IS NULL;
