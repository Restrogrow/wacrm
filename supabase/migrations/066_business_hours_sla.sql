-- ============================================================
-- 066_business_hours_sla.sql — business hours, welcome/away
-- auto-replies and first-response SLA alerts.
--
-- business_hours_settings : one row per account (admin-managed).
-- auto_reply_log          : which welcome/away message went to which
--                           conversation (cooldown + race guard).
--                           Written by the server only.
-- conversation_sla        : a conversation that has been waiting for a
--                           human reply longer than the account's SLA
--                           target. Written by the cron job only; the
--                           inbox reads it to show an "SLA breached"
--                           badge.
--
-- Two SQL helpers do the heavy lifting for the cron job and are
-- callable by the service role only.
-- ============================================================

-- ---------- 1. settings -----------------------------------------
CREATE TABLE IF NOT EXISTS business_hours_settings (
  account_id                 uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,

  -- Business hours. When disabled the business counts as always open.
  enabled                    boolean NOT NULL DEFAULT false,
  timezone                   text    NOT NULL DEFAULT 'Asia/Kolkata',
  -- {"mon": {"open": true, "start": "09:00", "end": "18:00"}, ...}
  -- Keys: sun mon tue wed thu fri sat. start > end means the shift
  -- runs past midnight; start = end means open all day.
  weekly                     jsonb   NOT NULL DEFAULT '{
    "sun": {"open": false, "start": "09:00", "end": "18:00"},
    "mon": {"open": true,  "start": "09:00", "end": "18:00"},
    "tue": {"open": true,  "start": "09:00", "end": "18:00"},
    "wed": {"open": true,  "start": "09:00", "end": "18:00"},
    "thu": {"open": true,  "start": "09:00", "end": "18:00"},
    "fri": {"open": true,  "start": "09:00", "end": "18:00"},
    "sat": {"open": false, "start": "09:00", "end": "18:00"}
  }'::jsonb,
  -- Closed all day on these dates: ["2026-10-20", ...] (account timezone).
  holidays                   jsonb   NOT NULL DEFAULT '[]'::jsonb,

  -- Auto-replies (plain text, sent inside the 24 hour window).
  welcome_enabled            boolean NOT NULL DEFAULT false,
  welcome_message            text    NOT NULL DEFAULT 'Hi {{name}}, thanks for contacting us! A teammate will reply shortly.'
                                     CHECK (char_length(welcome_message) <= 1000),
  away_enabled               boolean NOT NULL DEFAULT false,
  away_message               text    NOT NULL DEFAULT 'Hi {{name}}, we are away right now. We received your message and will reply when we are back.'
                                     CHECK (char_length(away_message) <= 1000),
  -- At most one away message per conversation in this many hours.
  away_cooldown_hours        integer NOT NULL DEFAULT 12
                                     CHECK (away_cooldown_hours BETWEEN 1 AND 168),

  -- First-response SLA.
  sla_enabled                boolean NOT NULL DEFAULT false,
  sla_first_response_minutes integer NOT NULL DEFAULT 15
                                     CHECK (sla_first_response_minutes BETWEEN 1 AND 1440),
  -- Count only business-hours minutes toward the target.
  sla_business_hours_only    boolean NOT NULL DEFAULT false,

  updated_by                 uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE business_hours_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_hours_settings_select ON business_hours_settings;
CREATE POLICY business_hours_settings_select ON business_hours_settings FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS business_hours_settings_insert ON business_hours_settings;
CREATE POLICY business_hours_settings_insert ON business_hours_settings FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS business_hours_settings_update ON business_hours_settings;
CREATE POLICY business_hours_settings_update ON business_hours_settings FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- ---------- 2. auto-reply log -----------------------------------
CREATE TABLE IF NOT EXISTS auto_reply_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('welcome', 'away')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auto_reply_log_conv_kind_idx
  ON auto_reply_log (conversation_id, kind, created_at DESC);

ALTER TABLE auto_reply_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auto_reply_log_select ON auto_reply_log;
CREATE POLICY auto_reply_log_select ON auto_reply_log FOR SELECT
  USING (is_account_member(account_id));
-- No write policies: only the server (service role) records sends.

-- ---------- 3. SLA breaches -------------------------------------
CREATE TABLE IF NOT EXISTS conversation_sla (
  conversation_id  uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- The customer message that started the wait (earliest customer
  -- message after the last human agent reply).
  waiting_since    timestamptz NOT NULL,
  breached_at      timestamptz NOT NULL DEFAULT now(),
  -- Set when an agent replied or the chat was closed.
  cleared_at       timestamptz
);

CREATE INDEX IF NOT EXISTS conversation_sla_open_idx
  ON conversation_sla (account_id)
  WHERE cleared_at IS NULL;

ALTER TABLE conversation_sla ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_sla_select ON conversation_sla;
CREATE POLICY conversation_sla_select ON conversation_sla FOR SELECT
  USING (is_account_member(account_id));
-- No write policies: only the cron job (service role) writes.

-- ---------- 4. notification type --------------------------------
-- Allow SLA alerts in the in-app notification feed. The original
-- CHECK only listed 'conversation_assigned'; replace it with a list
-- that also leaves room for the other notification types being added
-- alongside this migration.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%conversation_assigned%'
  LOOP
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'conversation_assigned',
    'sla_breach',
    'mention',
    'csat_response',
    'scheduled_message_failed'
  ));

-- ---------- 5. cron helpers (service role only) -----------------
-- Open conversations whose customer has been waiting for a human
-- ('agent') reply since `waiting_since <= p_older_than`. Bot messages
-- do not count as a reply.
CREATE OR REPLACE FUNCTION public.sla_waiting_conversations(
  p_account_id  uuid,
  p_older_than  timestamptz,
  p_limit       integer DEFAULT 100
) RETURNS TABLE (
  conversation_id    uuid,
  contact_id         uuid,
  assigned_agent_id  uuid,
  waiting_since      timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.id, c.contact_id, c.assigned_agent_id, w.waiting_since
  FROM conversations c
  CROSS JOIN LATERAL (
    SELECT min(m.created_at) AS waiting_since
    FROM messages m
    WHERE m.conversation_id = c.id
      AND m.sender_type = 'customer'
      AND m.created_at > COALESCE(
        (SELECT max(a.created_at)
           FROM messages a
          WHERE a.conversation_id = c.id AND a.sender_type = 'agent'),
        'epoch'::timestamptz)
  ) w
  WHERE c.account_id = p_account_id
    AND c.status = 'open'
    AND w.waiting_since IS NOT NULL
    AND w.waiting_since <= p_older_than
  ORDER BY w.waiting_since
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;

-- Clears breach rows whose conversation got a human reply or is no
-- longer open. Returns how many were cleared.
CREATE OR REPLACE FUNCTION public.sla_clear_resolved(p_account_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE conversation_sla s
     SET cleared_at = now()
   WHERE s.account_id = p_account_id
     AND s.cleared_at IS NULL
     AND (
       EXISTS (SELECT 1 FROM conversations c
                WHERE c.id = s.conversation_id AND c.status <> 'open')
       OR EXISTS (SELECT 1 FROM messages m
                   WHERE m.conversation_id = s.conversation_id
                     AND m.sender_type = 'agent'
                     AND m.created_at > s.waiting_since)
     );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.sla_waiting_conversations(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sla_clear_resolved(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sla_waiting_conversations(uuid, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.sla_clear_resolved(uuid) TO service_role;
