-- ============================================================
-- 097: Management fee on WhatsApp spend
--
-- Repeat Grow charges some accounts a percentage "campaign management
-- fee" on top of what Meta bills them for messages. Meta bills the
-- business directly (we are never in that money flow — see
-- lib/whatsapp/spend.ts), so the fee is measured here and invoiced
-- separately. That makes the measurement the whole product: it has to
-- be something a customer can audit line by line, not an estimate.
--
-- So the fee is computed from the *count of billable messages* Meta
-- reported over its own status webhook, priced at a rate card we
-- publish — never from Meta's pricing_analytics cost, which its own
-- docs call approximate until the invoice lands and which covers the
-- whole WABA including sends that never went through Repeat Grow.
--
-- 1. messages.billable / pricing_category — until now only
--    broadcast_recipients carried these (migration 086), so every
--    template sent from the inbox, a flow, an automation or a journey
--    was invisible to billing. Those are real billable messages.
-- 2. accounts.management_fee_percent — per account; 0 (the default)
--    means no fee, which is every existing account.
-- 3. message_rates — the published per-message rate card, by currency
--    and pricing category. Deliberately starts EMPTY: Meta's rates
--    differ per country and change, so a wrong seeded number would
--    quietly produce wrong invoices. An unset rate makes the report
--    say "rate not set" instead of guessing.
-- 4. account_billable_counts() — billable counts per category for an
--    account and date range, across both sources.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1) Per-message billing facts for non-broadcast sends.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS billable boolean,
  ADD COLUMN IF NOT EXISTS pricing_category text;

-- The monthly aggregate scans by time and only cares about priced rows.
CREATE INDEX IF NOT EXISTS messages_billable_idx
  ON messages (created_at)
  WHERE billable;

-- 2) The fee rate, per account.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS management_fee_percent numeric(5, 2) NOT NULL DEFAULT 0
    CHECK (management_fee_percent >= 0 AND management_fee_percent <= 100);

-- 3) Published rate card. Platform-wide, not per account: it mirrors
--    Meta's published rates, and a per-account override would be a
--    discount, which belongs in management_fee_percent instead.
CREATE TABLE IF NOT EXISTS message_rates (
  currency          TEXT NOT NULL,
  pricing_category  TEXT NOT NULL,
  rate              numeric(12, 6) NOT NULL CHECK (rate >= 0),
  note              TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (currency, pricing_category)
);

ALTER TABLE message_rates ENABLE ROW LEVEL SECURITY;
-- No client-side policies: only the service role (the /admin report and
-- editor) reads or writes rates, like platform_admins in migration 030.
REVOKE ALL ON TABLE message_rates FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_updated_at ON message_rates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON message_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4) Billable counts per category, from both sources.
--
-- Broadcasts are counted on `sent_at` (when the message actually left)
-- rather than the broadcast's created_at: messaging-limit pacing
-- (lib/whatsapp/messaging-limit.ts) spreads one broadcast over days or
-- weeks, so created_at would bill a January broadcast's February
-- messages in January. broadcast_cost_counts() in migration 086 groups
-- by created_at on purpose — it answers "what did this broadcast
-- cost", not "what is billable this month" — so it is left alone.
--
-- The two sources cannot double-count: the broadcast sender only ever
-- writes broadcast_recipients, and the inbox/flow senders only ever
-- write messages. The webhook enforces that split too.
CREATE OR REPLACE FUNCTION public.account_billable_counts(
  p_account_id uuid,
  p_from timestamptz,
  p_to timestamptz
) RETURNS TABLE (
  pricing_category text,
  source text,
  billable bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    upper(coalesce(r.pricing_category, 'unknown')),
    'broadcast',
    count(*)
  FROM broadcast_recipients r
  JOIN broadcasts b ON b.id = r.broadcast_id
  WHERE b.account_id = p_account_id
    AND r.billable
    AND r.sent_at >= p_from
    AND r.sent_at < p_to
  GROUP BY 1

  UNION ALL

  SELECT
    upper(coalesce(m.pricing_category, 'unknown')),
    'conversation',
    count(*)
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.account_id = p_account_id
    AND m.billable
    AND m.created_at >= p_from
    AND m.created_at < p_to
  GROUP BY 1;
$$;

REVOKE ALL ON FUNCTION public.account_billable_counts(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_billable_counts(uuid, timestamptz, timestamptz)
  TO service_role;
