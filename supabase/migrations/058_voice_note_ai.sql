-- ============================================================
-- Voice-note AI: the transcript, English translation, summary and
-- suggested reply for a customer's voice note, kept on the message so
-- it survives after Meta stops serving the audio (media IDs expire
-- after about 7 days) and nobody pays to transcribe it twice.
--
-- Written by POST /api/inbox/messages/[id]/transcribe (service role);
-- members read it through the existing messages policies.
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS ai_transcript    JSONB,
  ADD COLUMN IF NOT EXISTS ai_transcript_at TIMESTAMPTZ;
