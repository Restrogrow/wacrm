-- ============================================================
-- AI call notes on the call itself (Calls page and Recent calls).
--
-- POST /api/whatsapp/calls/[id]/notes already saves a text note on the
-- contact; this keeps the structured notes with the call too, so the
-- Calls page can list every call with its summary, to-dos and
-- follow-up. Written by the server (service role); members read them
-- through the existing whatsapp_calls SELECT policy.
-- ============================================================

ALTER TABLE whatsapp_calls
  ADD COLUMN IF NOT EXISTS ai_notes    JSONB,
  ADD COLUMN IF NOT EXISTS ai_notes_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_notes_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS whatsapp_calls_account_ai_notes_idx
  ON whatsapp_calls (account_id, created_at DESC)
  WHERE ai_notes IS NOT NULL;
