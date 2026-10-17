-- ============================================================
-- 075_journeys.sql — lifecycle marketing: date-based messages,
-- drip sequences and win-back campaigns ("Journeys").
--
-- journeys            one row per journey (kind: date | drip | winback)
-- journey_steps       ordered messages of a journey (template or text)
-- journey_enrollments one row per contact entering a journey (and per
--                     yearly occurrence for date journeys); the cron
--                     walks them step by step
-- journey_sends       the idempotency ledger: UNIQUE per journey /
--                     contact / step / occurrence, inserted BEFORE a
--                     send, so concurrent cron runs can never send twice
-- journey_settings    per-account quiet hours, per-contact cooldown and
--                     the account-wide daily cap
--
-- RLS: members read their account's rows. All writes go through the
-- API routes / cron with the service-role client (like scheduled
-- messages), so there are no client write policies.
-- ============================================================

CREATE TABLE IF NOT EXISTS journeys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  kind          TEXT NOT NULL CHECK (kind IN ('date', 'drip', 'winback')),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  -- Kind-specific settings, validated in lib/journeys/core.ts:
  --   date:    { date_source, offset_days, send_time, recurrence }
  --   drip:    { enrollment: {mode, tag_id|segment_id}, exit: {on_reply, tag_id} }
  --   winback: { inactive_days, cooldown_days, per_run_limit }
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  daily_cap     INTEGER NOT NULL DEFAULT 200 CHECK (daily_cap BETWEEN 1 AND 5000),
  -- Date journeys scan contacts once per local day.
  last_scan_on  DATE,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journeys_account_idx ON journeys (account_id, status);

CREATE TABLE IF NOT EXISTS journey_steps (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id         UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  account_id         UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  position           INTEGER NOT NULL CHECK (position >= 0),
  -- Wait before this step (minutes after the previous step / enrollment).
  delay_minutes      INTEGER NOT NULL DEFAULT 0 CHECK (delay_minutes BETWEEN 0 AND 129600),
  message_type       TEXT NOT NULL CHECK (message_type IN ('template', 'text')),
  template_name      TEXT,
  template_language  TEXT,
  -- Body variable values in order; may contain {{name}}, {{first_name}}...
  template_params    JSONB NOT NULL DEFAULT '[]'::jsonb,
  text_body          TEXT CHECK (text_body IS NULL OR char_length(text_body) <= 1024),
  UNIQUE (journey_id, position)
);

CREATE TABLE IF NOT EXISTS journey_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id      UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  -- 'once' (drip), the event year (date) or 'wb:YYYYMMDD' (win-back).
  occurrence_key  TEXT NOT NULL DEFAULT 'once',
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'completed', 'exited', 'failed')),
  current_step    INTEGER NOT NULL DEFAULT 0,
  next_run_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at      TIMESTAMPTZ,
  exit_reason     TEXT,
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  UNIQUE (journey_id, contact_id, occurrence_key)
);

CREATE INDEX IF NOT EXISTS journey_enrollments_due_idx
  ON journey_enrollments (next_run_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS journey_enrollments_contact_idx
  ON journey_enrollments (contact_id);

CREATE TABLE IF NOT EXISTS journey_sends (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id      UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  enrollment_id   UUID REFERENCES journey_enrollments(id) ON DELETE SET NULL,
  step_position   INTEGER NOT NULL,
  occurrence_key  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'sending'
                  CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
  reason          TEXT,
  message_id      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  UNIQUE (journey_id, contact_id, step_position, occurrence_key)
);

CREATE INDEX IF NOT EXISTS journey_sends_account_sent_idx
  ON journey_sends (account_id, sent_at) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS journey_sends_contact_sent_idx
  ON journey_sends (contact_id, sent_at DESC) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS journey_sends_unreplied_idx
  ON journey_sends (sent_at) WHERE status = 'sent' AND replied_at IS NULL;

CREATE TABLE IF NOT EXISTS journey_settings (
  account_id             UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  timezone               TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  quiet_start            TEXT NOT NULL DEFAULT '21:00' CHECK (quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_end              TEXT NOT NULL DEFAULT '09:00' CHECK (quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- At most one journey message per contact within this many hours.
  contact_cooldown_hours INTEGER NOT NULL DEFAULT 24 CHECK (contact_cooldown_hours BETWEEN 0 AND 168),
  account_daily_cap      INTEGER NOT NULL DEFAULT 300 CHECK (account_daily_cap BETWEEN 1 AND 20000),
  updated_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Read-only member policies (writes use the service role).
-- ------------------------------------------------------------
ALTER TABLE journeys            ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_steps       ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_sends       ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_settings    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view journeys" ON journeys;
CREATE POLICY "Members can view journeys" ON journeys
  FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS "Members can view journey steps" ON journey_steps;
CREATE POLICY "Members can view journey steps" ON journey_steps
  FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS "Members can view journey enrollments" ON journey_enrollments;
CREATE POLICY "Members can view journey enrollments" ON journey_enrollments
  FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS "Members can view journey sends" ON journey_sends;
CREATE POLICY "Members can view journey sends" ON journey_sends
  FOR SELECT USING (is_account_member(account_id, 'viewer'));
DROP POLICY IF EXISTS "Members can view journey settings" ON journey_settings;
CREATE POLICY "Members can view journey settings" ON journey_settings
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

-- ------------------------------------------------------------
-- Audience of a drip (tag / segment) or win-back journey: contacts that
-- should be enrolled now. Server-only (service role): the cron and the
-- preview endpoint call it after checking the journey's account.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.journey_audience(p_journey_id uuid)
RETURNS TABLE (contact_id uuid)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  j        public.journeys%ROWTYPE;
  v_mode   text;
  v_rules  jsonb;
  v_tag    uuid;
  v_days   int;
  v_cool   int;
BEGIN
  SELECT * INTO j FROM public.journeys WHERE id = p_journey_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF j.kind = 'drip' THEN
    v_mode := j.config #>> '{enrollment,mode}';
    IF v_mode = 'tag' THEN
      v_tag := nullif(j.config #>> '{enrollment,tag_id}', '')::uuid;
      IF v_tag IS NULL THEN RETURN; END IF;
      RETURN QUERY
      SELECT c.id
      FROM public.contacts c
      WHERE c.account_id = j.account_id
        AND c.opted_out_at IS NULL
        AND c.phone <> ''
        AND EXISTS (SELECT 1 FROM public.contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = v_tag)
        AND NOT EXISTS (SELECT 1 FROM public.journey_enrollments e WHERE e.journey_id = j.id AND e.contact_id = c.id);
    ELSIF v_mode = 'segment' THEN
      SELECT s.rules INTO v_rules
      FROM public.segments s
      WHERE s.id = nullif(j.config #>> '{enrollment,segment_id}', '')::uuid
        AND s.account_id = j.account_id;
      IF v_rules IS NULL THEN RETURN; END IF;
      RETURN QUERY
      SELECT c.id
      FROM public.contacts c
      WHERE c.account_id = j.account_id
        AND c.opted_out_at IS NULL
        AND c.phone <> ''
        AND public.segment_matches(c, v_rules)
        AND NOT EXISTS (SELECT 1 FROM public.journey_enrollments e WHERE e.journey_id = j.id AND e.contact_id = c.id);
    END IF;
  ELSIF j.kind = 'winback' THEN
    v_days := coalesce((j.config ->> 'inactive_days')::int, 30);
    v_cool := coalesce((j.config ->> 'cooldown_days')::int, 90);
    RETURN QUERY
    SELECT c.id
    FROM public.contacts c
    WHERE c.account_id = j.account_id
      AND c.opted_out_at IS NULL
      AND c.phone <> ''
      AND greatest(
            c.created_at,
            coalesce((SELECT max(cv.last_message_at) FROM public.conversations cv WHERE cv.contact_id = c.id), c.created_at)
          ) < now() - make_interval(days => v_days)
      AND NOT EXISTS (
        SELECT 1 FROM public.journey_enrollments e
        WHERE e.journey_id = j.id
          AND e.contact_id = c.id
          AND (e.status = 'active' OR e.enrolled_at > now() - make_interval(days => v_cool))
      );
  END IF;
END;
$$;

-- Enroll up to p_limit audience members of an ACTIVE journey. Returns
-- how many rows were inserted (re-runs are harmless: ON CONFLICT).
CREATE OR REPLACE FUNCTION public.journey_enroll_batch(p_journey_id uuid, p_limit int DEFAULT 100)
RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  j        public.journeys%ROWTYPE;
  v_delay  int := 0;
  v_key    text;
  v_n      int;
BEGIN
  SELECT * INTO j FROM public.journeys WHERE id = p_journey_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  p_limit := least(greatest(coalesce(p_limit, 100), 1), 1000);

  IF j.kind = 'drip' THEN
    SELECT coalesce(s.delay_minutes, 0) INTO v_delay
    FROM public.journey_steps s WHERE s.journey_id = j.id AND s.position = 0;
    v_key := 'once';
  ELSE
    v_key := 'wb:' || to_char(now(), 'YYYYMMDD');
  END IF;

  WITH picked AS (
    SELECT a.contact_id FROM public.journey_audience(j.id) a LIMIT p_limit
  ), ins AS (
    INSERT INTO public.journey_enrollments (journey_id, account_id, contact_id, occurrence_key, next_run_at)
    SELECT j.id, j.account_id, p.contact_id, v_key, now() + make_interval(mins => coalesce(v_delay, 0))
    FROM picked p
    ON CONFLICT (journey_id, contact_id, occurrence_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO v_n FROM ins;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.journey_audience_count(p_journey_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT count(*) FROM public.journey_audience(p_journey_id);
$$;

-- Per-journey numbers for the Journeys page. Runs as the caller, so RLS
-- applies, and refuses non-members.
CREATE OR REPLACE FUNCTION public.journey_stats(p_account_id uuid)
RETURNS TABLE (
  journey_id uuid,
  enrolled   bigint,
  sent       bigint,
  replied    bigint,
  completed  bigint,
  opted_out  bigint,
  failed     bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_account_member(p_account_id) THEN
    RAISE EXCEPTION 'not a member of this account' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    j.id,
    (SELECT count(*) FROM public.journey_enrollments e WHERE e.journey_id = j.id),
    (SELECT count(*) FROM public.journey_sends s WHERE s.journey_id = j.id AND s.status = 'sent'),
    (SELECT count(*) FROM public.journey_sends s WHERE s.journey_id = j.id AND s.replied_at IS NOT NULL),
    (SELECT count(*) FROM public.journey_enrollments e WHERE e.journey_id = j.id AND e.status = 'completed'),
    (SELECT count(*) FROM public.journey_enrollments e WHERE e.journey_id = j.id AND e.exit_reason = 'opted_out'),
    (SELECT count(*) FROM public.journey_sends s WHERE s.journey_id = j.id AND s.status = 'failed')
  FROM public.journeys j
  WHERE j.account_id = p_account_id;
END;
$$;


-- Mark journey messages the customer wrote back to (any customer message
-- after the send, within 7 days). Set-based, run by the cron every few
-- minutes.
CREATE OR REPLACE FUNCTION public.journey_mark_replies(p_limit int DEFAULT 500)
RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_n int;
BEGIN
  p_limit := least(greatest(coalesce(p_limit, 500), 1), 5000);
  WITH cand AS (
    SELECT s.id, s.contact_id, s.sent_at
    FROM public.journey_sends s
    WHERE s.status = 'sent' AND s.replied_at IS NULL AND s.sent_at > now() - interval '7 days'
    ORDER BY s.sent_at
    LIMIT p_limit
  ), hit AS (
    SELECT cand.id,
           (SELECT min(m.created_at)
              FROM public.messages m
              JOIN public.conversations cv ON cv.id = m.conversation_id
             WHERE cv.contact_id = cand.contact_id
               AND m.sender_type = 'customer'
               AND m.created_at > cand.sent_at) AS t
    FROM cand
  ), upd AS (
    UPDATE public.journey_sends s
       SET replied_at = hit.t
      FROM hit
     WHERE s.id = hit.id AND hit.t IS NOT NULL
    RETURNING 1
  )
  SELECT count(*)::int INTO v_n FROM upd;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.journey_audience(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.journey_enroll_batch(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.journey_audience_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.journey_stats(uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.journey_mark_replies(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journey_mark_replies(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.journey_audience(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.journey_enroll_batch(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.journey_audience_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.journey_stats(uuid) TO authenticated, service_role;
