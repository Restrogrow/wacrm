-- ============================================================
-- 101_credit_low_notification.sql — tell someone before the AI stops.
--
-- Credit enforcement went on for every account (migration 100) with no
-- way to warn anybody. An account could spend down to zero and the only
-- symptom would be the chatbot going quiet — which looks exactly like
-- an outage, and arrives with no chance to top up first.
--
-- `account_credits.low_warned_at` already existed for this and was
-- never written. All that is missing is permission to file the
-- notification, so this migration only widens the type constraint.
--
-- One type covers both "running low" and "out"; the body says which.
-- Two types would mean two constraint changes and two labels for what
-- the reader experiences as one situation getting worse.
-- ============================================================

-- Keeps whatever the constraint allows today (other migrations add
-- types), and only adds 'credits_low' if it is missing.
DO $$
DECLARE
  v_def TEXT;
  v_types TEXT[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND conname = 'notifications_type_check';

  IF v_def IS NULL OR v_def LIKE '%''credits_low''%' THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT m[1]) INTO v_types
  FROM regexp_matches(v_def, '''([a-z_]+)''', 'g') AS m;
  v_types := array_append(COALESCE(v_types, ARRAY['conversation_assigned']), 'credits_low');

  ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
  EXECUTE format(
    'ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (%s))',
    (SELECT string_agg(quote_literal(t), ', ') FROM (SELECT DISTINCT unnest(v_types) AS t) x)
  );
END $$;

-- The cron asks for "enforced accounts not yet warned, lowest balance
-- first" every minute. Partial, so it only covers the rows that can
-- still produce a warning.
CREATE INDEX IF NOT EXISTS account_credits_unwarned_idx
  ON account_credits (balance)
  WHERE low_warned_at IS NULL;
