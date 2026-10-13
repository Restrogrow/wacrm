-- ============================================================
-- 048: WhatsApp voice calls in the browser (Calling API)
--
-- One row per WhatsApp call, inbound (customer calls the business) or
-- outbound (an agent calls the customer from the inbox).
--
-- Signalling: Meta sends the customer's SDP offer (inbound) or SDP
-- answer (outbound) on the `calls` webhook; the server stores it here
-- and agents' browsers pick it up through Realtime, then answer with
-- WebRTC. Media flows browser ↔ Meta directly; nothing is recorded.
--
-- Status: ringing → answering → connected → ended
--         ringing → missed | rejected | failed
--
-- Members can read their account's calls (RLS); all writes go through
-- the API routes / webhook with the service-role client.
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_calls (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  call_id          TEXT NOT NULL UNIQUE,            -- Meta's wacid.…
  phone_number_id  TEXT,
  conversation_id  UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id       UUID REFERENCES contacts(id) ON DELETE SET NULL,
  direction        TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status           TEXT NOT NULL DEFAULT 'ringing'
                   CHECK (status IN ('ringing', 'answering', 'connected', 'ended', 'missed', 'rejected', 'failed')),
  customer_number  TEXT,
  customer_name    TEXT,
  sdp_offer        TEXT,                            -- inbound: the customer's offer
  sdp_answer       TEXT,                            -- outbound: Meta's answer
  started_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,   -- outbound caller
  answered_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,   -- inbound answerer
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at      TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS whatsapp_calls_account_created_idx
  ON whatsapp_calls (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_calls_contact_created_idx
  ON whatsapp_calls (contact_id, created_at DESC);

ALTER TABLE whatsapp_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their account's calls" ON whatsapp_calls;
CREATE POLICY "Members can view their account's calls" ON whatsapp_calls
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

-- Realtime: ringing calls pop up in every agent's browser.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_calls;
  END IF;
END $$;
