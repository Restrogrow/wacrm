-- ============================================================
-- 070_audit_log.sql — append-only activity log for sensitive actions
--
-- Who did what, when: team and role changes, API keys, integration
-- connects, plan edits, ownership transfers, security changes…
--
-- Append-only by construction: RLS lets account owners/admins READ
-- their own account's rows and defines NO insert/update/delete policy,
-- so nothing a signed-in user can do through the REST API writes or
-- edits it. Rows are written by server code (src/lib/audit.ts) with the
-- service role, which bypasses RLS. A trigger additionally rejects
-- UPDATE/DELETE from everyone except the service role, so history
-- can't be rewritten by an app bug. (Retention: rows are kept until
-- the account is deleted; add a pruning job later if volume requires.)
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL for platform-level events that aren't tied to one account.
  account_id      UUID REFERENCES accounts(id) ON DELETE CASCADE,
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,          -- e.g. 'member.role_changed'
  target_type     TEXT,                   -- e.g. 'member', 'api_key'
  target_id       TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- never secrets
  ip              TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_account_created_idx
  ON audit_log (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_account_action_idx
  ON audit_log (account_id, action, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read their account audit log" ON audit_log;
CREATE POLICY "Admins can read their account audit log" ON audit_log
  FOR SELECT USING (is_account_member(account_id, 'admin'));
-- No INSERT / UPDATE / DELETE policies on purpose — see header.

-- Belt and braces: even a service-role caller cannot edit or delete rows
-- unless it is the owner of a cascade (account deletion removes rows via
-- the FK, which runs as the table owner and is allowed below).
CREATE OR REPLACE FUNCTION public.audit_log_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Allow FK cascades (account / user deletion). Those run with
  -- pg_trigger_depth() > 1; direct UPDATE/DELETE statements run at depth 1.
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();

DROP TRIGGER IF EXISTS audit_log_no_delete ON audit_log;
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();
