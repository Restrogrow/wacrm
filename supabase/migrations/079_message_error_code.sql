-- Why a WhatsApp send failed (Meta's status webhook error), shown to agents.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS error_code INTEGER;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS error_detail TEXT;
