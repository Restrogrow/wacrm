-- ============================================================
-- 041_plans_and_trials
--
-- Plans (Starter / Growth / Enterprise, as on /pricing), a free trial
-- for new accounts, and plan limits enforced in the database.
--
--   accounts.plan             'trial' | 'starter' | 'growth' | 'enterprise'
--   accounts.trial_ends_at    new accounts: now() + 7 days
--   accounts.plan_expires_at  paid-until date for a paid plan (NULL = no end)
--   accounts.billing_note     internal note (e.g. "Paid ₹999 via UPI, ref …")
--
-- No payment gateway yet: a platform admin sets the plan and paid-until
-- date in /admin when a business pays. An account is:
--   * on its paid plan while plan_expires_at is NULL or in the future,
--   * trialing (Growth limits) while plan = 'trial' and the trial runs,
--   * otherwise 'expired' — read-only: the app stops sending WhatsApp
--     messages (lib/billing), and Starter limits apply to new records.
--
-- Limits mirror src/lib/billing/plans.ts — change both together.
-- Enforced by BEFORE INSERT triggers so dashboard (client) inserts and
-- server routes alike are covered. Contacts are only limited for
-- dashboard inserts (manual add / CSV import): inbound WhatsApp
-- messages, the API and integrations (service role) always create the
-- contact so no customer message is ever dropped.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'plan'
  ) THEN
    ALTER TABLE accounts
      ADD COLUMN plan text NOT NULL DEFAULT 'trial'
        CHECK (plan IN ('trial', 'starter', 'growth', 'enterprise')),
      ADD COLUMN trial_ends_at timestamptz DEFAULT (now() + interval '7 days');
    -- Accounts that existed before billing launched get a fresh 14-day
    -- trial. Runs only once, when the columns are first added.
    UPDATE accounts SET trial_ends_at = now() + interval '14 days';
  END IF;
END $$;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_note text;

-- Effective plan right now: the paid plan, 'trial', or 'expired'.
CREATE OR REPLACE FUNCTION public.account_effective_plan(p_account_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN a.plan IN ('starter', 'growth', 'enterprise')
         AND (a.plan_expires_at IS NULL OR a.plan_expires_at > now()) THEN a.plan
    WHEN a.plan = 'trial' AND a.trial_ends_at > now() THEN 'trial'
    ELSE 'expired'
  END
  FROM accounts a
  WHERE a.id = p_account_id
$$;

-- NULL = unlimited. Trial gets Growth limits; expired falls back to Starter.
CREATE OR REPLACE FUNCTION public.plan_limit(p_plan text, p_resource text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_plan = 'enterprise' THEN NULL
    WHEN p_plan IN ('growth', 'trial') THEN
      CASE p_resource
        WHEN 'contacts' THEN 50000
        WHEN 'broadcasts_per_month' THEN 250
        WHEN 'automation_flows' THEN 25
        WHEN 'custom_fields' THEN 25
        WHEN 'team_members' THEN 25
      END
    ELSE
      CASE p_resource
        WHEN 'contacts' THEN 2000
        WHEN 'broadcasts_per_month' THEN 60
        WHEN 'automation_flows' THEN 5
        WHEN 'custom_fields' THEN 5
        WHEN 'team_members' THEN 5
      END
  END
$$;

CREATE OR REPLACE FUNCTION public.enforce_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resource text := TG_ARGV[0];
  v_plan text;
  v_limit integer;
  v_count integer;
  v_label text;
BEGIN
  IF v_resource = 'contacts' AND coalesce(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  v_plan := account_effective_plan(NEW.account_id);
  IF v_plan IS NULL THEN
    RETURN NEW;
  END IF;
  v_limit := plan_limit(v_plan, v_resource);
  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_resource = 'automation_flows' THEN
    SELECT (SELECT count(*) FROM flows WHERE account_id = NEW.account_id)
         + (SELECT count(*) FROM automations WHERE account_id = NEW.account_id)
      INTO v_count;
    v_label := 'automation flows';
  ELSIF v_resource = 'custom_fields' THEN
    SELECT count(*) INTO v_count FROM custom_fields WHERE account_id = NEW.account_id;
    v_label := 'custom fields';
  ELSIF v_resource = 'broadcasts_per_month' THEN
    SELECT count(*) INTO v_count FROM broadcasts
      WHERE account_id = NEW.account_id AND created_at >= date_trunc('month', now());
    v_label := 'broadcasts a month';
  ELSIF v_resource = 'team_members' THEN
    SELECT (SELECT count(*) FROM profiles WHERE account_id = NEW.account_id)
         + (SELECT count(*) FROM account_invitations
              WHERE account_id = NEW.account_id
                AND accepted_at IS NULL AND expires_at > now())
      INTO v_count;
    v_label := 'team members (including pending invites)';
  ELSIF v_resource = 'contacts' THEN
    SELECT count(*) INTO v_count FROM contacts WHERE account_id = NEW.account_id;
    v_label := 'contacts';
  ELSE
    RETURN NEW;
  END IF;

  IF v_count >= v_limit THEN
    -- SQLSTATE PL001 lets the app recognise it (lib/billing/plans.ts);
    -- the message itself is shown to the user as-is.
    RAISE EXCEPTION 'The % plan allows % %. Upgrade your plan to add more.',
      CASE v_plan WHEN 'expired' THEN 'Starter' ELSE initcap(v_plan) END,
      v_limit, v_label
      USING ERRCODE = 'PL001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_plan_limit_flows ON flows;
CREATE TRIGGER enforce_plan_limit_flows
  BEFORE INSERT ON flows
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit('automation_flows');

DROP TRIGGER IF EXISTS enforce_plan_limit_automations ON automations;
CREATE TRIGGER enforce_plan_limit_automations
  BEFORE INSERT ON automations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit('automation_flows');

DROP TRIGGER IF EXISTS enforce_plan_limit_custom_fields ON custom_fields;
CREATE TRIGGER enforce_plan_limit_custom_fields
  BEFORE INSERT ON custom_fields
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit('custom_fields');

DROP TRIGGER IF EXISTS enforce_plan_limit_broadcasts ON broadcasts;
CREATE TRIGGER enforce_plan_limit_broadcasts
  BEFORE INSERT ON broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit('broadcasts_per_month');

DROP TRIGGER IF EXISTS enforce_plan_limit_invitations ON account_invitations;
CREATE TRIGGER enforce_plan_limit_invitations
  BEFORE INSERT ON account_invitations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit('team_members');

DROP TRIGGER IF EXISTS enforce_plan_limit_contacts ON contacts;
CREATE TRIGGER enforce_plan_limit_contacts
  BEFORE INSERT ON contacts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit('contacts');
