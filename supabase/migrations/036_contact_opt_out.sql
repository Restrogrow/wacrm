-- ============================================================
-- 036_contact_opt_out.sql — WhatsApp opt-out (STOP) handling
--
-- A contact who replies STOP / UNSUBSCRIBE (see
-- src/lib/contacts/opt-out.ts) gets `opted_out_at` set and is skipped
-- by broadcasts until they reply START, which clears it. Required by
-- WhatsApp's Business Messaging Policy and protects the number's
-- quality rating.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS opted_out_at timestamptz;

-- Broadcasts load only the opted-out contacts of one account.
CREATE INDEX IF NOT EXISTS contacts_opted_out_idx
  ON contacts (account_id)
  WHERE opted_out_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
