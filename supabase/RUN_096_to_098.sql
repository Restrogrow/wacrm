-- ============================================================
-- RUN_096_to_098.sql
--
-- Paste the whole file into the Supabase SQL editor and run it once
-- (Dashboard > SQL Editor > New query). Every migration here is
-- idempotent, so running it twice changes nothing.
--
--   096  indexes behind broadcast pacing (Meta messaging limit)
--   097  management fee: per-message billing facts + rate card
--   098  repeat reminders for overdue replies
--
-- Nothing here drops or rewrites existing data: 096 only adds
-- indexes, 097 only adds nullable columns, one new table and one
-- function, 098 only adds columns and widens one CHECK constraint.
-- ============================================================

-- ============================================================
-- 096: index behind broadcast pacing (Meta messaging limit)
--
-- lib/whatsapp/messaging-limit.ts asks, before every send batch, "how
-- many messages has this account sent in the last 24 hours?" — a count
-- over broadcast_recipients.sent_at joined to broadcasts.account_id.
--
-- Without an index on sent_at that is a full scan of every recipient
-- row the account has ever had, once a minute per in-flight broadcast.
-- The partial index keeps it to the sent rows only (pending/failed rows
-- have sent_at NULL and are the majority during a large paced send).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE INDEX IF NOT EXISTS broadcast_recipients_sent_at_idx
  ON broadcast_recipients (sent_at)
  WHERE sent_at IS NOT NULL;

-- The same count joins up to broadcasts to filter by account.
CREATE INDEX IF NOT EXISTS broadcasts_account_idx
  ON broadcasts (account_id);


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


-- ============================================================
-- 098_sla_escalation.sql — repeat reminders for overdue replies.
--
-- Until now a breached conversation was announced once (one row per
-- waiting episode in `conversation_sla`) and then went quiet, so a
-- chat nobody picked up was never mentioned again.
--
-- This adds an opt-in repeat: while a chat is still waiting, the cron
-- re-notifies every `sla_repeat_minutes`, up to a hard cap of 3
-- reminders per episode (SLA_MAX_REMINDERS in
-- src/lib/business-hours/hours.ts — keep the two in step). The second
-- and third reminders also go to the owners/admins, so a chat assigned
-- to someone who is away still surfaces.
--
-- Replying (or closing the chat) clears the breach row via the
-- existing sla_clear_resolved(), which stops the reminders — no extra
-- bookkeeping needed here.
--
-- Default off: an account that switches it on accepts the extra
-- notification volume.
-- ============================================================

-- ---------- 1. per-episode reminder bookkeeping -----------------
ALTER TABLE conversation_sla
  ADD COLUMN IF NOT EXISTS reminders_sent   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

-- The cron asks for "open breaches of this account, oldest first" on
-- every run; `conversation_sla_open_idx` already covers the lookup.

-- ---------- 2. settings -----------------------------------------
ALTER TABLE business_hours_settings
  ADD COLUMN IF NOT EXISTS sla_repeat_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_repeat_minutes integer NOT NULL DEFAULT 60;

-- Added separately so re-running the migration cannot fail on an
-- already-present constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_hours_settings'::regclass
      AND conname = 'business_hours_settings_sla_repeat_minutes_check'
  ) THEN
    ALTER TABLE business_hours_settings
      ADD CONSTRAINT business_hours_settings_sla_repeat_minutes_check
      CHECK (sla_repeat_minutes BETWEEN 5 AND 1440);
  END IF;
END $$;

-- ---------- 3. 'sla_reminder' notification type ------------------
-- Keeps whatever the constraint allows today (other migrations add
-- types), and only adds 'sla_reminder' if it is missing.
DO $$
DECLARE
  v_def TEXT;
  v_types TEXT[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND conname = 'notifications_type_check';

  IF v_def IS NULL OR v_def LIKE '%''sla_reminder''%' THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT m[1]) INTO v_types
  FROM regexp_matches(v_def, '''([a-z_]+)''', 'g') AS m;
  v_types := array_append(COALESCE(v_types, ARRAY['conversation_assigned']), 'sla_reminder');

  ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
  EXECUTE format(
    'ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (%s))',
    (SELECT string_agg(quote_literal(t), ', ') FROM (SELECT DISTINCT unnest(v_types) AS t) x)
  );
END $$;

-- ---------- 4. the /reports "Overdue replies" panel --------------
-- Reads `conversation_sla`, which the cron owns, so this inherits the
-- cron's judgement of what counts as overdue (including the
-- business-hours pause) instead of re-deriving it here and drifting.
--
-- Counted per CHAT, not per breach: `conversation_sla` keeps one row
-- per conversation and a new waiting episode overwrites the previous
-- one, so "6 chats breached" is exact while "how many times in total"
-- is not recoverable. The panel's wording matches that.
--
-- `overdue_now` deliberately ignores the date range — "right now" is
-- the number someone acts on, like `open_now` in report_conversation_summary.
--
-- The `reminders_sent >= 2` test mirrors the escalation rule in
-- src/lib/business-hours/sla-server.ts (owners/admins join from the
-- second reminder). Keep the two in step.
CREATE OR REPLACE FUNCTION public.report_sla_summary(
  p_account_id uuid,
  p_from timestamptz,
  p_to timestamptz
) RETURNS TABLE (
  overdue_now       bigint,
  breached_chats    bigint,
  still_waiting     bigint,
  reminded_chats    bigint,
  escalated_chats   bigint,
  recovery_avg_s    double precision,
  recovery_median_s double precision,
  recovery_samples  bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  PERFORM public._report_guard(p_account_id, p_from, p_to);
  RETURN QUERY
  WITH in_range AS (
    SELECT s.breached_at, s.cleared_at, s.reminders_sent
    FROM conversation_sla s
    WHERE s.account_id = p_account_id
      AND s.breached_at >= p_from
      AND s.breached_at < p_to
  ), recovered AS (
    -- How long after going overdue someone actually replied.
    SELECT extract(epoch FROM (r.cleared_at - r.breached_at))::double precision AS secs
    FROM in_range r
    WHERE r.cleared_at IS NOT NULL
      AND r.cleared_at >= r.breached_at
  )
  SELECT
    (SELECT count(*) FROM conversation_sla s
      WHERE s.account_id = p_account_id AND s.cleared_at IS NULL),
    (SELECT count(*) FROM in_range),
    (SELECT count(*) FROM in_range r WHERE r.cleared_at IS NULL),
    (SELECT count(*) FROM in_range r WHERE r.reminders_sent > 0),
    (SELECT count(*) FROM in_range r WHERE r.reminders_sent >= 2),
    (SELECT avg(secs) FROM recovered),
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) FROM recovered),
    (SELECT count(*) FROM recovered);
END;
$$;

REVOKE ALL ON FUNCTION public.report_sla_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_sla_summary(uuid, timestamptz, timestamptz) TO authenticated, service_role;
