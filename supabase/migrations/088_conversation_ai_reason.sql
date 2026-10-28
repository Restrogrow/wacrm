-- ============================================================
-- 088_conversation_ai_reason.sql — why a chat got its lead score
--
-- One short line from the AI ("Asked price of blue kurta and delivery
-- to Pune"), shown on the inbox lead badge. Optional: the code stores
-- and shows scores without it until this runs.
--
-- The UPDATE re-queues recent open chats so the cron job rescores them
-- with the new scoring rules (12 chats a minute, within daily AI caps).
-- ============================================================

ALTER TABLE conversation_ai ADD COLUMN IF NOT EXISTS reason TEXT;

UPDATE conversation_ai ca
SET analyzed_message_at = NULL
FROM conversations c
WHERE c.id = ca.conversation_id
  AND c.status IN ('open', 'pending')
  AND c.last_message_at >= NOW() - INTERVAL '48 hours';
