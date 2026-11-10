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
